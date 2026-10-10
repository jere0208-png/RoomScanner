import Foundation
import React
import SceneKit
import UIKit

/**
 * LA VISITE À LA PREMIÈRE PERSONNE — sur SceneKit, le moteur 3D d'iOS.
 *
 * Relevé du patron : « l'exploration n'est pas du tout fluide lorsqu'on se
 * déplace s'il y a un minimum d'éléments (...) le sol en parquet apparaît
 * mal aussi, selon la vue, il disparaît ». La vue était PEINTE en
 * JavaScript, face par face, à chaque image ; ici la scène est bâtie UNE
 * fois, en triangles, et vit sur la carte graphique. Le JavaScript n'envoie
 * plus que la caméra — six nombres par image — et la profondeur se juge au
 * pixel, par le matériel : rien ne passe plus devant ce qui est devant.
 *
 * CE QU'ELLE REÇOIT (voir `geometry/visite3d.ts`, qui l'écrit) :
 *
 *   `maillage` : [x, y, z] × 3 puis [r, g, b] — douze nombres par triangle,
 *                tout le bâti et le mobilier ;
 *   `sols`     : [matière, sens, r, g, b, n] puis n triangles de neuf
 *                coordonnées, un bloc par sol ;
 *   `camera`   : [x, y, z, lacet, tangage, ouverture verticale en degrés] ;
 *   `fond`     : la couleur derrière les baies, « #RRGGBB ».
 *
 * LE PARQUET EST UNE TEXTURE. Les lames (22 cm sur 1,35 m, abouts décalés
 * d'une demi-lame un rang sur deux) sont dessinées dans une image, répétée
 * à l'échelle réelle sur le sol. Elle ne dépend d'aucun tri et ne disparaît
 * sous aucun angle.
 *
 * LA MAQUETTE AUSSI — relevé du patron : « le modèle 3D d'un plan avec des
 * meubles est très lent ; les autres apps sont fluides, peu importe le
 * nombre de meubles ». La vue 3D du plan passe par cette même vue, en mode
 * ORBITE (voir `geometry/maquette3d.ts`) :
 *
 *   `orientes` : même format que `maillage`, mais leur dos n'est jamais
 *                dessiné — c'est ce qui ouvre la maison de poupée ;
 *   `ecorche`  : les faces extérieures des murs, voilées par la carte
 *                graphique quand elles nous font face (`voile`) ;
 *   `orbite`   : [cible (3), axe vers l'œil (3), haut (3), demi-hauteur
 *                visible en mètres] — une caméra ORTHOGRAPHIQUE, qui tombe
 *                au pixel sur la projection des cotes posées par-dessus ;
 *   `levee`, `solY` : le logement qui monte de son sol, au retour d'un scan.
 *
 * LES VRAIS MEUBLES — relevé du patron : « des modèles réalistes de meubles
 * aux mesures réelles, non pas des cubes codés ». `meubles` porte chaque
 * meuble FABRIQUÉ à ses cotes (voir `geometry/modeles3d.ts`), groupé par
 * matière :
 *
 *   [code, r, g, b, rugosité, métal, nSommets, nIndices]
 *   puis nSommets × (x, y, z, nx, ny, nz, u, v), puis les indices.
 *
 * Les normales sont LISSÉES (une arête arrondie accroche la lumière) et les
 * matières sont PHYSIQUES : le chêne a son fil, le lin sa trame, l'inox son
 * reflet, le verre sa transparence. Le code 9 est l'ombre de contact : un
 * voile doux sous chaque meuble posé au sol.
 */
@objc(RoomScanVisite)
final class RoomScanVisite: UIView {
  private let vue = SCNView(frame: .zero)
  private let scene = SCNScene()
  private let oeil = SCNNode()
  /// Le bâti : remplacé d'un bloc quand la scène change, jamais retouché.
  private let bati = SCNNode()
  /// Les trois lumières, gardées : la maquette les règle autrement.
  private let ambiante = SCNLight()
  private let jour = SCNLight()
  private let contre = SCNLight()

  @objc var maillage: [NSNumber] = [] {
    didSet { rebatir() }
  }

  @objc var sols: [NSNumber] = [] {
    didSet { rebatir() }
  }

  @objc var camera: [NSNumber] = [] {
    didSet { placerOeil() }
  }

  @objc var fond: String = "#DCE8F4" {
    didSet { vue.backgroundColor = couleur(fond) ?? .white }
  }

  @objc var orientes: [NSNumber] = [] {
    didSet { rebatir() }
  }

  @objc var ecorche: [NSNumber] = [] {
    didSet { rebatir() }
  }

  @objc var voile: Bool = true {
    didSet { rebatir() }
  }

  @objc var orbite: [NSNumber] = [] {
    didSet { placerOeil() }
  }

  @objc var levee: NSNumber = 1 {
    didSet { lever() }
  }

  @objc var solY: NSNumber = 0 {
    didSet { lever() }
  }

  @objc var meubles: [NSNumber] = [] {
    didSet { rebatir() }
  }

  /*
    LA CLÉ DE LA VUE — pour que la caméra lui parvienne SANS PASSER PAR LES
    PROPRIÉTÉS. Relevé du patron : « la visite est bug encore plus qu'avant
    pour le déplacement ».

    La vue est un composant de l'ancienne architecture, monté par la couche
    de compatibilité de React Native : à CHAQUE propriété changée, elle
    reconvertit et recompare TOUTES les autres — maillage, sols, meubles,
    des dizaines de milliers de nombres — sur le fil principal, celui-là
    même qui dessine. La caméra changeant soixante fois par seconde, la marche
    payait soixante fois par seconde le poids de tout le logement ; et depuis
    que les meubles sont de vrais modèles, ce poids a décuplé.

    La caméra passe donc par `RoomScanVisiteRegie`, qui retrouve la vue par
    cette clé et lui pose ses six nombres, rien d'autre.
  */
  private static let registre = NSMapTable<NSString, RoomScanVisite>.strongToWeakObjects()

  @objc var cle: String = "" {
    didSet {
      if !oldValue.isEmpty { RoomScanVisite.registre.removeObject(forKey: oldValue as NSString) }
      guard !cle.isEmpty else { return }
      RoomScanVisite.registre.setObject(self, forKey: cle as NSString)
      /*
        CE QUI EST ARRIVÉ AVANT LA VUE. La régie peut poser une caméra avant
        que la vue ne soit montée — elles empruntent deux chemins vers le fil
        principal. La valeur attend sa vue, et s'applique au tour suivant,
        APRÈS les propriétés de montage, qui sont plus anciennes qu'elle.
      */
      let cle = self.cle
      DispatchQueue.main.async { [weak self] in
        guard let self, self.cle == cle else { return }
        RoomScanVisite.appliquerEnAttente(cle, a: self)
      }
    }
  }

  static func parCle(_ cle: String) -> RoomScanVisite? {
    registre.object(forKey: cle as NSString)
  }

  /** Ce que la régie a posé pour une clé dont la vue n'était pas encore là. */
  private static var camerasEnAttente: [String: [NSNumber]] = [:]
  private static var orbitesEnAttente: [String: [NSNumber]] = [:]
  private static var leveesEnAttente: [String: (NSNumber, NSNumber)] = [:]

  static func attendre(_ cle: String, camera: [NSNumber]) { camerasEnAttente[cle] = camera }
  static func attendre(_ cle: String, orbite: [NSNumber]) { orbitesEnAttente[cle] = orbite }
  static func attendre(_ cle: String, levee: NSNumber, solY: NSNumber) {
    leveesEnAttente[cle] = (levee, solY)
  }

  private static func appliquerEnAttente(_ cle: String, a vue: RoomScanVisite) {
    if let c = camerasEnAttente.removeValue(forKey: cle) { vue.poserCamera(c) }
    if let o = orbitesEnAttente.removeValue(forKey: cle) { vue.poserOrbite(o) }
    if let l = leveesEnAttente.removeValue(forKey: cle) { vue.poserLevee(l.0, solY: l.1) }
  }

  /** La caméra de la visite, posée directement : voir `cle`. */
  func poserCamera(_ valeurs: [NSNumber]) {
    camera = valeurs
  }

  /** La caméra de la maquette en orbite, posée directement : voir `cle`. */
  func poserOrbite(_ valeurs: [NSNumber]) {
    orbite = valeurs
  }

  /** La levée de la maquette au retour d'un scan, posée directement. */
  func poserLevee(_ k: NSNumber, solY y: NSNumber) {
    solY = y
    levee = k
  }

  /// Le fil du bois et la trame des tissus, dessinés une fois par teinte.
  private var texturesDesMeubles: [String: UIImage] = [:]

  /**
   * LE LISERÉ DES MEUBLES — relevé du patron : « les meubles blancs sont trop
   * blancs et se fondent dans le sol blanc sans texture ; donne-leur un
   * aspect différent, comme un léger contour sur leurs formes ».
   *
   * La « coque inversée » des dessins au trait : chaque meuble est redessiné
   * une seconde fois, gonflé le long de ses normales et vu par l'intérieur
   * (seules ses faces arrière se peignent). Là où le meuble se découpe sur le
   * sol ou sur un mur, cette coque dépasse d'un cheveu : un liseré sombre
   * tout autour de la forme, coussins arrondis compris.
   *
   * Son épaisseur se recalcule à chaque mouvement de caméra pour rester
   * d'un point à l'écran, quel que soit le zoom.
   */
  private var materiauxContour: [SCNMaterial] = []
  private var epaisseurContour: Float = 0.006

  override init(frame: CGRect) {
    super.init(frame: frame)
    // La vue ne reçoit jamais le doigt : la manette et le regard sont au
    // JavaScript, par-dessus.
    isUserInteractionEnabled = false
    vue.isUserInteractionEnabled = false
    vue.scene = scene
    vue.backgroundColor = couleur(fond) ?? .white
    vue.antialiasingMode = .multisampling4X
    vue.preferredFramesPerSecond = 60
    vue.autoenablesDefaultLighting = false
    vue.allowsCameraControl = false
    addSubview(vue)

    // L'ŒIL. L'ouverture est VERTICALE, comme celle que le JavaScript
    // calcule depuis la largeur de l'écran ; le près est à cinq
    // centimètres, pour qu'un mur frôlé ne se troue pas.
    let cam = SCNCamera()
    cam.zNear = 0.05
    cam.zFar = 120
    cam.fieldOfView = 60
    cam.projectionDirection = .vertical
    cam.wantsHDR = false
    // L'occlusion ambiante creuse les angles : c'est elle qui fait lire un
    // meuble contre un mur sans avoir à tracer une arête.
    cam.screenSpaceAmbientOcclusionIntensity = 0.6
    cam.screenSpaceAmbientOcclusionRadius = 0.4
    oeil.camera = cam
    scene.rootNode.addChildNode(oeil)
    vue.pointOfView = oeil

    // LA LUMIÈRE : une ambiance franche, un jour qui vient d'en haut et
    // d'un côté, un contre-jour plus faible de l'autre — assez pour que
    // deux murs d'une même teinte se distinguent à l'angle.
    ambiante.type = .ambient
    ambiante.intensity = 620
    ambiante.color = UIColor.white
    let noeudAmbiant = SCNNode()
    noeudAmbiant.light = ambiante
    scene.rootNode.addChildNode(noeudAmbiant)

    jour.type = .directional
    jour.intensity = 420
    jour.castsShadow = false
    let noeudJour = SCNNode()
    noeudJour.light = jour
    noeudJour.eulerAngles = SCNVector3(x: -Float.pi / 2.6, y: Float.pi / 5, z: 0)
    scene.rootNode.addChildNode(noeudJour)

    contre.type = .directional
    contre.intensity = 200
    contre.castsShadow = false
    let noeudContre = SCNNode()
    noeudContre.light = contre
    noeudContre.eulerAngles = SCNVector3(x: -Float.pi / 3.5, y: Float.pi / 5 + Float.pi, z: 0)
    scene.rootNode.addChildNode(noeudContre)

    scene.rootNode.addChildNode(bati)

    // L'ENVIRONNEMENT des matériaux physiques : un ciel clair au-dessus, un
    // sol chaud dessous. Sans lui, un chrome ne reflète rien et paraît noir.
    // Il n'éclaire que les meubles : le bâti reste en Lambert.
    scene.lightingEnvironment.contents = RoomScanVisite.imageDEnvironnement()
    scene.lightingEnvironment.intensity = 0.7
  }

  required init?(coder: NSCoder) { nil }

  override func layoutSubviews() {
    super.layoutSubviews()
    vue.frame = bounds
  }

  // ------------------------------------------------------------ couleurs

  /** Une couleur écrite « #RRGGBB ». `none` et l'illisible rendent `nil`. */
  private func couleur(_ texte: String) -> UIColor? {
    guard texte.hasPrefix("#"), texte.count == 7 else { return nil }
    var v: UInt64 = 0
    Scanner(string: String(texte.dropFirst())).scanHexInt64(&v)
    return UIColor(
      red: CGFloat((v & 0xFF0000) >> 16) / 255,
      green: CGFloat((v & 0x00FF00) >> 8) / 255,
      blue: CGFloat(v & 0x0000FF) / 255,
      alpha: 1)
  }

  /** `a` tiré vers `b` d'une fraction `t`. */
  private func melange(_ a: UIColor, _ b: UIColor, _ t: CGFloat) -> UIColor {
    var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
    var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
    a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
    b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    let k = max(0, min(1, t))
    return UIColor(
      red: r1 + (r2 - r1) * k,
      green: g1 + (g2 - g1) * k,
      blue: b1 + (b2 - b1) * k,
      alpha: 1)
  }

  // ------------------------------------------------------------- caméra

  private func placerOeil() {
    if orbite.count >= 10 {
      placerOrbite()
      return
    }
    oeil.camera?.usesOrthographicProjection = false
    regleLeContour(0.003)
    guard camera.count >= 6 else { return }
    let x = camera[0].floatValue
    let y = camera[1].floatValue
    let z = camera[2].floatValue
    let lacet = camera[3].floatValue
    let tangage = camera[4].floatValue
    let ouverture = camera[5].doubleValue
    guard x.isFinite, y.isFinite, z.isFinite, lacet.isFinite, tangage.isFinite,
      ouverture.isFinite, ouverture > 1, ouverture < 179
    else { return }
    // Le même repère que `povBase` côté JavaScript : lacet 0 regarde +z,
    // π/2 regarde +x ; le tangage positif lève les yeux.
    let cp = cosf(tangage)
    let sp = sinf(tangage)
    let avant = SCNVector3(x: sinf(lacet) * cp, y: sp, z: cosf(lacet) * cp)
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0
    SCNTransaction.disableActions = true
    oeil.position = SCNVector3(x: x, y: y, z: z)
    oeil.look(
      at: SCNVector3(x: x + avant.x, y: y + avant.y, z: z + avant.z),
      up: SCNVector3(x: 0, y: 1, z: 0),
      localFront: SCNVector3(x: 0, y: 0, z: -1))
    oeil.camera?.fieldOfView = CGFloat(ouverture)
    SCNTransaction.commit()
  }

  /**
   * LA CAMÉRA DE LA MAQUETTE — orthographique, comme la projection des cotes
   * posées par-dessus en JavaScript. L'œil se pose sur l'axe, loin, et
   * regarde la cible ; « haut » reste le haut de l'écran. La demi-hauteur
   * visible fait l'échelle : c'est elle qui zoome.
   */
  private func placerOrbite() {
    let o = orbite.map { $0.floatValue }
    guard o.count >= 10, o.allSatisfy({ $0.isFinite }), o[9] > 0.01 else { return }
    let cible = SCNVector3(x: o[0], y: o[1], z: o[2])
    let vers = SCNVector3(x: o[3], y: o[4], z: o[5])
    let haut = SCNVector3(x: o[6], y: o[7], z: o[8])
    // Assez loin pour que tout le logement soit devant l'œil, quel que soit
    // l'angle ; la profondeur visible suit.
    let recul: Float = 80
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0
    SCNTransaction.disableActions = true
    if let cam = oeil.camera {
      cam.usesOrthographicProjection = true
      cam.orthographicScale = Double(o[9])
      cam.zNear = 1
      cam.zFar = Double(recul * 2)
      // L'occlusion ambiante est faite pour une perspective : sur une vue
      // orthographique, elle creuse des halos là où il n'y a rien.
      cam.screenSpaceAmbientOcclusionIntensity = 0
    }
    /*
      LA LUMIÈRE DE LA MAQUETTE. Vue de dessus, l'arase des murs et les sols
      reçoivent le jour de face : avec les réglages de la visite, ils
      saturaient en blanc, et le sable du sol ne se distinguait plus du blanc
      cassé des murs. On rend au dessus SA couleur, et les flancs gardent
      assez d'écart pour qu'un angle se lise.
    */
    ambiante.intensity = 640
    jour.intensity = 380
    contre.intensity = 160
    oeil.position = SCNVector3(
      x: cible.x + vers.x * recul, y: cible.y + vers.y * recul, z: cible.z + vers.z * recul)
    oeil.look(at: cible, up: haut, localFront: SCNVector3(x: 0, y: 0, z: -1))
    SCNTransaction.commit()
    // Quatre cinquièmes de point d'écran, en mètres, au zoom de cette image.
    let hauteur = Float(max(1, bounds.height))
    regleLeContour(o[9] * 2 / hauteur * 0.8)
  }

  /**
   * LA LEVÉE — le logement monte de son sol, au retour d'un scan. Le sol ne
   * bouge pas : tout ce qui est dessus s'écrase vers lui, puis se relève.
   * C'est exactement ce que fait la projection des cotes par-dessus.
   */
  private func lever() {
    let k = max(0.001, min(1, levee.floatValue))
    let y0 = solY.floatValue
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0
    SCNTransaction.disableActions = true
    bati.scale = SCNVector3(x: 1, y: k, z: 1)
    bati.position = SCNVector3(x: 0, y: y0 * (1 - k), z: 0)
    SCNTransaction.commit()
  }

  // --------------------------------------------------------------- bâti

  /*
    UNE RECONSTRUCTION PAR PASSAGE, PAS PAR PROPRIÉTÉ. Au montage, la vue
    reçoit ses tableaux un par un — maillage, sols, orientés, écorché — et
    chacun relançait la construction de tout le bâti. On la reporte au tour
    suivant de la boucle principale : quatre propriétés, une construction.
  */
  private var rebatirPrevu = false

  private func rebatir() {
    guard !rebatirPrevu else { return }
    rebatirPrevu = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.rebatirPrevu = false
      self.rebatirMaintenant()
    }
  }

  private func rebatirMaintenant() {
    for enfant in bati.childNodes { enfant.removeFromParentNode() }
    materiauxContour.removeAll()
    if let g = geometrie(maillage, deuxFaces: true) {
      bati.addChildNode(SCNNode(geometry: g))
    }
    if let g = geometrie(orientes, deuxFaces: false) {
      bati.addChildNode(SCNNode(geometry: g))
    }
    if let g = geometrie(ecorche, deuxFaces: false) {
      if voile, let m = g.firstMaterial {
        /*
          L'ÉCORCHÉ, CALCULÉ AU PIXEL. Une face extérieure de mur qui nous
          fait face masque la pièce : elle se voile, jusqu'à quinze pour cent,
          de quoi garder la trace du mur. Vue de champ, elle reste pleine. La
          normale est dans le repère de l'œil : sa composante z dit à quel
          point la face nous regarde — le même nombre que le JavaScript
          appelait « vers ».
        */
        m.shaderModifiers = [
          .fragment: """
          #pragma transparent
          #pragma body
          float vers = normalize(_surface.normal).z;
          float a = 1.0 - 0.85 * smoothstep(0.08, 0.5, vers);
          _output.color = float4(_output.color.rgb * a, a);
          """
        ]
        m.blendMode = .alpha
        m.writesToDepthBuffer = false
      }
      let n = SCNNode(geometry: g)
      // Peint après le reste : un voile se pose sur ce qu'il voile.
      n.renderingOrder = 10
      bati.addChildNode(n)
    }
    for n in noeudsDesSols() { bati.addChildNode(n) }
    for n in noeudsDesMeubles() { bati.addChildNode(n) }
  }

  // ------------------------------------------------------------- meubles

  /** Les meubles : un nœud par matière, toutes les pièces de la scène dedans. */
  private func noeudsDesMeubles() -> [SCNNode] {
    let v = meubles.map { $0.floatValue }
    var k = 0
    var out: [SCNNode] = []
    while k + 8 <= v.count {
      let code = Int(v[k])
      let teinte = UIColor(
        red: CGFloat(v[k + 1]), green: CGFloat(v[k + 2]), blue: CGFloat(v[k + 3]), alpha: 1)
      let rugosite = CGFloat(v[k + 4])
      let metal = CGFloat(v[k + 5])
      let nS = Int(v[k + 6])
      let nI = Int(v[k + 7])
      k += 8
      guard nS > 0, nI > 0, k + nS * 8 + nI <= v.count else { break }
      var sommets: [SCNVector3] = []
      var normales: [SCNVector3] = []
      var uvs: [CGPoint] = []
      sommets.reserveCapacity(nS)
      normales.reserveCapacity(nS)
      uvs.reserveCapacity(nS)
      for s in 0..<nS {
        let b = k + s * 8
        sommets.append(SCNVector3(x: v[b], y: v[b + 1], z: v[b + 2]))
        normales.append(SCNVector3(x: v[b + 3], y: v[b + 4], z: v[b + 5]))
        uvs.append(CGPoint(x: CGFloat(v[b + 6]), y: CGFloat(v[b + 7])))
      }
      k += nS * 8
      var indices: [UInt32] = []
      indices.reserveCapacity(nI)
      let dernier = Float(nS - 1)
      for j in 0..<nI {
        indices.append(UInt32(max(0, min(dernier, v[k + j]))))
      }
      k += nI
      let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
      let g = SCNGeometry(
        sources: [
          SCNGeometrySource(vertices: sommets),
          SCNGeometrySource(normals: normales),
          SCNGeometrySource(textureCoordinates: uvs),
        ],
        elements: [element])
      g.materials = [materiauDuMeuble(code, teinte, rugosite, metal)]
      let n = SCNNode(geometry: g)
      // Ce qui se pose PAR-DESSUS le reste — l'ombre, le verre — passe après.
      if code == 9 { n.renderingOrder = 5 }
      if code == 3 { n.renderingOrder = 6 }
      out.append(n)
      // Le liseré : pour ce qui a une forme pleine (ni ombre, ni verre, ni feuille).
      if code != 9 && code != 3 && code != 4 {
        if let coque = noeudDeContour(sommets, indices) { out.append(coque) }
      }
    }
    return out
  }

  /**
   * La coque d'un groupe : les mêmes triangles, avec une normale SOUDÉE par
   * position (la moyenne des normales des sommets confondus) — sans quoi la
   * coque se fendrait à chaque arête vive d'une boîte.
   */
  private func noeudDeContour(_ sommets: [SCNVector3], _ indices: [UInt32]) -> SCNNode? {
    guard !sommets.isEmpty, !indices.isEmpty else { return nil }
    var cumul: [String: SCNVector3] = [:]
    var cles: [String] = []
    cles.reserveCapacity(sommets.count)
    // Les normales géométriques, par triangle, cumulées sur leurs sommets.
    var parSommet = [SCNVector3](repeating: SCNVector3(x: 0, y: 0, z: 0), count: sommets.count)
    var t = 0
    while t + 2 < indices.count {
      let a = Int(indices[t]), b = Int(indices[t + 1]), c = Int(indices[t + 2])
      t += 3
      guard a < sommets.count, b < sommets.count, c < sommets.count else { continue }
      let n = normale(sommets[a], sommets[b], sommets[c])
      for k in [a, b, c] {
        parSommet[k] = SCNVector3(
          x: parSommet[k].x + n.x, y: parSommet[k].y + n.y, z: parSommet[k].z + n.z)
      }
    }
    for (k, p) in sommets.enumerated() {
      let cle = "\(Int((p.x * 2000).rounded())),\(Int((p.y * 2000).rounded())),\(Int((p.z * 2000).rounded()))"
      cles.append(cle)
      let deja = cumul[cle] ?? SCNVector3(x: 0, y: 0, z: 0)
      cumul[cle] = SCNVector3(
        x: deja.x + parSommet[k].x, y: deja.y + parSommet[k].y, z: deja.z + parSommet[k].z)
    }
    var soudees: [SCNVector3] = []
    soudees.reserveCapacity(sommets.count)
    for cle in cles {
      let v = cumul[cle] ?? SCNVector3(x: 0, y: 1, z: 0)
      let l = sqrtf(v.x * v.x + v.y * v.y + v.z * v.z)
      soudees.append(l > 1e-6 ? SCNVector3(x: v.x / l, y: v.y / l, z: v.z / l) : SCNVector3(x: 0, y: 1, z: 0))
    }
    let g = SCNGeometry(
      sources: [SCNGeometrySource(vertices: sommets), SCNGeometrySource(normals: soudees)],
      elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
    let m = SCNMaterial()
    m.lightingModel = .constant
    /*
      UN VOILE AU BORD, PAS UN TRAIT DE BANDE DESSINÉE — relevé du patron :
      « réduis l'opacité des contours de meubles, ça fait trop dessin animé ;
      je cherche juste à mieux différencier les meubles des murs et des
      sols ». Un gris chaud plus clair, au tiers de son opacité : le bord d'un
      meuble blanc se détache du mur blanc d'un souffle, sans être cerné.
      Il n'écrit pas la profondeur : un voile ne doit rien cacher.
    */
    m.diffuse.contents = UIColor(red: 0.42, green: 0.40, blue: 0.37, alpha: 1)
    m.transparency = 0.32
    m.blendMode = .alpha
    m.writesToDepthBuffer = false
    // Seules les faces ARRIÈRE : la coque ne se voit qu'au bord de la forme.
    m.cullMode = .front
    m.isDoubleSided = false
    m.shaderModifiers = [
      .geometry: """
      #pragma arguments
      float epaisseur;
      #pragma body
      _geometry.position.xyz += _geometry.normal * epaisseur;
      """
    ]
    m.setValue(NSNumber(value: epaisseurContour), forKey: "epaisseur")
    materiauxContour.append(m)
    g.materials = [m]
    let noeud = SCNNode(geometry: g)
    // Après le reste : un voile se pose sur ce qui est déjà peint.
    noeud.renderingOrder = 4
    return noeud
  }

  /** L'épaisseur du liseré, en mètres — un point d'écran, au zoom du moment. */
  private func regleLeContour(_ metres: Float) {
    guard metres.isFinite, metres > 0 else { return }
    let voulue = min(0.05, max(0.002, metres))
    // Rien à reposer : en visite, l'épaisseur est fixe, et chaque image
    // réécrivait la même valeur dans chaque matériau.
    if voulue == epaisseurContour { return }
    epaisseurContour = voulue
    for m in materiauxContour {
      m.setValue(NSNumber(value: epaisseurContour), forKey: "epaisseur")
    }
  }

  /** Une matière physique : teinte, rugosité, métal — et ce que son code ajoute. */
  private func materiauDuMeuble(
    _ code: Int, _ teinte: UIColor, _ rugosite: CGFloat, _ metal: CGFloat
  ) -> SCNMaterial {
    let m = SCNMaterial()
    m.lightingModel = .physicallyBased
    m.diffuse.contents = teinte
    m.roughness.contents = NSNumber(value: Float(rugosite))
    m.metalness.contents = NSNumber(value: Float(metal))
    m.isDoubleSided = false
    m.cullMode = .back
    switch code {
    case 1, 2:
      if let image = textureDuMeuble(code, teinte) {
        m.diffuse.contents = image
        m.diffuse.wrapS = .repeat
        m.diffuse.wrapT = .repeat
        m.diffuse.mipFilter = .linear
        // Les coordonnées sont en mètres : le fil se répète tous les
        // quatre-vingt-dix centimètres, la trame tous les trente.
        let pas: Float = code == 1 ? 0.9 : 0.3
        m.diffuse.contentsTransform = SCNMatrix4MakeScale(1 / pas, 1 / pas, 1)
      }
    case 3:
      m.transparency = 0.3
      m.transparencyMode = .dualLayer
      m.isDoubleSided = true
      m.writesToDepthBuffer = false
    case 4:
      m.isDoubleSided = true
    case 9:
      m.lightingModel = .constant
      m.diffuse.contents = RoomScanVisite.imageDOmbre
      m.blendMode = .alpha
      m.writesToDepthBuffer = false
    default:
      break
    }
    return m
  }

  /** Le fil du bois (code 1) ou la trame d'un tissu (code 2), à la teinte donnée. */
  private func textureDuMeuble(_ code: Int, _ teinte: UIColor) -> UIImage? {
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    teinte.getRed(&r, green: &g, blue: &b, alpha: &a)
    let cle = "\(code)-\(Int(r * 255))-\(Int(g * 255))-\(Int(b * 255))"
    if let deja = texturesDesMeubles[cle] { return deja }
    let cote: CGFloat = code == 1 ? 512 : 256
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let rendu = UIGraphicsImageRenderer(size: CGSize(width: cote, height: cote), format: format)
    let image = rendu.image { ctx in
      let c = ctx.cgContext
      c.setFillColor(teinte.cgColor)
      c.fill(CGRect(x: 0, y: 0, width: cote, height: cote))
      var graine: UInt64 = 0x9E37_79B9_7F4A_7C15
      func hasard() -> CGFloat {
        graine = graine &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
        return CGFloat((graine >> 33) & 0xFF_FFFF) / CGFloat(0xFF_FFFF)
      }
      if code == 1 {
        // Le fil : des veines sinueuses, un peu plus sombres, le long de u.
        for k in 0..<70 {
          let y0 = hasard() * cote
          let amplitude = 1.5 + hasard() * 3
          let periode = 40 + hasard() * 60
          c.setStrokeColor(
            UIColor(red: 0.32, green: 0.2, blue: 0.1, alpha: 0.05 + hasard() * 0.1).cgColor)
          c.setLineWidth(0.6 + hasard() * 2.2)
          c.beginPath()
          var x: CGFloat = 0
          while x <= cote {
            let y = y0 + CGFloat(sin(Double(x / periode) + Double(k))) * amplitude
            if x == 0 {
              c.move(to: CGPoint(x: x, y: y))
            } else {
              c.addLine(to: CGPoint(x: x, y: y))
            }
            x += 16
          }
          c.strokePath()
        }
      } else {
        // La trame : des fils sombres en travers, des fils clairs en long.
        var y: CGFloat = 0
        while y < cote {
          c.setFillColor(UIColor(white: 0, alpha: 0.025 + hasard() * 0.03).cgColor)
          c.fill(CGRect(x: 0, y: y, width: cote, height: 1))
          y += 2
        }
        var x: CGFloat = 0
        while x < cote {
          c.setFillColor(UIColor(white: 1, alpha: 0.02 + hasard() * 0.03).cgColor)
          c.fill(CGRect(x: x, y: 0, width: 1, height: cote))
          x += 2
        }
      }
    }
    texturesDesMeubles[cle] = image
    return image
  }

  /**
   * L'OMBRE DE CONTACT : un carré noir dont l'opacité reste franche jusqu'au
   * bord du meuble, puis s'éteint sur la marge. C'est elle qui fait POSER un
   * meuble — sans elle, il flotte, même parfaitement à sa place.
   */
  private static let imageDOmbre: UIImage = {
    let n = 128
    var pixels = [UInt8](repeating: 0, count: n * n * 4)
    for y in 0..<n {
      for x in 0..<n {
        let u = abs((Double(x) + 0.5) / Double(n) * 2 - 1)
        let w = abs((Double(y) + 0.5) / Double(n) * 2 - 1)
        let d = pow(pow(u, 4) + pow(w, 4), 0.25)
        let a = max(0, min(1, (1 - d) / 0.2))
        pixels[(y * n + x) * 4 + 3] = UInt8(pow(a, 1.5) * 0.38 * 255)
      }
    }
    guard let fournisseur = CGDataProvider(data: Data(pixels) as CFData),
      let image = CGImage(
        width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
        provider: fournisseur, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    else { return UIImage() }
    return UIImage(cgImage: image)
  }()

  /** Le ciel des matériaux physiques : blanc en haut, gris chaud à l'horizon, sol beige. */
  private static func imageDEnvironnement() -> UIImage {
    let taille = CGSize(width: 256, height: 128)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      let couleurs =
        [
          UIColor.white.cgColor,
          UIColor(red: 0.91, green: 0.9, blue: 0.88, alpha: 1).cgColor,
          UIColor(red: 0.72, green: 0.69, blue: 0.65, alpha: 1).cgColor,
        ] as CFArray
      let positions: [CGFloat] = [0, 0.5, 1]
      if let degrade = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: couleurs, locations: positions)
      {
        ctx.cgContext.drawLinearGradient(
          degrade, start: .zero, end: CGPoint(x: 0, y: taille.height), options: [])
      }
    }
  }

  /** La normale d'un triangle, par son sens de parcours. */
  private func normale(_ a: SCNVector3, _ b: SCNVector3, _ c: SCNVector3) -> SCNVector3 {
    let ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
    let vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    let l = sqrtf(nx * nx + ny * ny + nz * nz)
    guard l > 1e-9 else { return SCNVector3(x: 0, y: 1, z: 0) }
    return SCNVector3(x: nx / l, y: ny / l, z: nz / l)
  }

  /**
   * TOUT UN GROUPE EN UNE GÉOMÉTRIE : une couleur par sommet, une normale par
   * triangle. Une seule pièce de géométrie, c'est un seul appel de dessin
   * — c'est ce qui fait que deux mille faces ne coûtent rien.
   *
   * `deuxFaces` : le mobilier tel qu'on le décrit n'a pas toujours un sens
   * de parcours fiable, il se dessine des deux côtés. Les faces ORIENTÉES,
   * elles, ne montrent jamais leur dos : vu de l'extérieur, le mur du devant
   * ne cache pas la pièce.
   */
  private func geometrie(_ source: [NSNumber], deuxFaces: Bool) -> SCNGeometry? {
    let v = source.map { $0.floatValue }
    let parTriangle = 12
    let n = v.count / parTriangle
    guard n > 0 else { return nil }
    var sommets: [SCNVector3] = []
    var normales: [SCNVector3] = []
    var couleurs: [Float] = []
    var indices: [Int32] = []
    sommets.reserveCapacity(n * 3)
    normales.reserveCapacity(n * 3)
    couleurs.reserveCapacity(n * 12)
    indices.reserveCapacity(n * 3)
    for t in 0..<n {
      let b = t * parTriangle
      let p0 = SCNVector3(x: v[b], y: v[b + 1], z: v[b + 2])
      let p1 = SCNVector3(x: v[b + 3], y: v[b + 4], z: v[b + 5])
      let p2 = SCNVector3(x: v[b + 6], y: v[b + 7], z: v[b + 8])
      let nrm = normale(p0, p1, p2)
      for p in [p0, p1, p2] {
        sommets.append(p)
        normales.append(nrm)
        couleurs.append(contentsOf: [v[b + 9], v[b + 10], v[b + 11], 1])
      }
      let i = Int32(t * 3)
      indices.append(contentsOf: [i, i + 1, i + 2])
    }
    let sourceSommets = SCNGeometrySource(vertices: sommets)
    let sourceNormales = SCNGeometrySource(normals: normales)
    let donnees = couleurs.withUnsafeBufferPointer { Data(buffer: $0) }
    let sourceCouleurs = SCNGeometrySource(
      data: donnees,
      semantic: .color,
      vectorCount: sommets.count,
      usesFloatComponents: true,
      componentsPerVector: 4,
      bytesPerComponent: MemoryLayout<Float>.size,
      dataOffset: 0,
      dataStride: 4 * MemoryLayout<Float>.size)
    let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
    let g = SCNGeometry(
      sources: [sourceSommets, sourceNormales, sourceCouleurs], elements: [element])
    let m = SCNMaterial()
    m.lightingModel = .lambert
    m.diffuse.contents = UIColor.white
    m.locksAmbientWithDiffuse = true
    // Les deux côtés pour ce qui n'a pas de sens : une face dont le sens de
    // parcours s'est trompé reste un mur, pas un trou.
    m.isDoubleSided = deuxFaces
    m.cullMode = .back
    g.materials = [m]
    return g
  }

  // --------------------------------------------------------------- sols

  /** La tuile d'une matière, en mètres : le long des lames, puis en travers. */
  private func tuile(_ matiere: Int) -> (CGFloat, CGFloat) {
    switch matiere {
    case 1: return (1.35, 0.44)  // une lame de long, deux lames de large
    case 2: return (0.6, 0.6)  // un carreau
    default: return (1, 1)
    }
  }

  /**
   * L'IMAGE D'UN SOL, à répéter. Elle se dessine une fois par sol, dans la
   * teinte relevée : parquet ou carrelage, le sol garde SA couleur.
   */
  private func imageDuSol(_ matiere: Int, _ teinte: UIColor) -> UIImage? {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    let joint = melange(teinte, UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1), 0.3)
    if matiere == 1 {
      // 1,35 m × 0,44 m → 512 × 167 px : une lame par rang, et le rang du
      // dessous décalé d'une demi-lame.
      let taille = CGSize(width: 512, height: 167)
      return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
        let c = ctx.cgContext
        let lame = taille.height / 2
        // Trois lames, trois tons — un parquet n'est jamais uni.
        let tons: [(CGRect, CGFloat)] = [
          (CGRect(x: 0, y: 0, width: taille.width, height: lame), 0.05),
          (CGRect(x: 0, y: lame, width: taille.width / 2, height: lame), -0.03),
          (CGRect(x: taille.width / 2, y: lame, width: taille.width / 2, height: lame), 0.01),
        ]
        for (zone, ton) in tons {
          let fond = ton >= 0
            ? melange(teinte, .white, ton)
            : melange(teinte, .black, -ton)
          c.setFillColor(fond.cgColor)
          c.fill(zone)
        }
        c.setStrokeColor(joint.cgColor)
        c.setLineWidth(2)
        // Les rangs : en haut de la tuile (qui se répète) et entre les deux.
        c.move(to: CGPoint(x: 0, y: 1)); c.addLine(to: CGPoint(x: taille.width, y: 1))
        c.move(to: CGPoint(x: 0, y: lame)); c.addLine(to: CGPoint(x: taille.width, y: lame))
        // Les abouts : au bord pour le rang du haut, au milieu pour celui du bas.
        c.move(to: CGPoint(x: 1, y: 0)); c.addLine(to: CGPoint(x: 1, y: lame))
        c.move(to: CGPoint(x: taille.width / 2, y: lame))
        c.addLine(to: CGPoint(x: taille.width / 2, y: taille.height))
        c.strokePath()
      }
    }
    if matiere == 2 {
      let taille = CGSize(width: 256, height: 256)
      return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
        let c = ctx.cgContext
        c.setFillColor(teinte.cgColor)
        c.fill(CGRect(origin: .zero, size: taille))
        c.setStrokeColor(joint.cgColor)
        c.setLineWidth(3)
        c.move(to: CGPoint(x: 0, y: 1.5)); c.addLine(to: CGPoint(x: taille.width, y: 1.5))
        c.move(to: CGPoint(x: 1.5, y: 0)); c.addLine(to: CGPoint(x: 1.5, y: taille.height))
        c.strokePath()
      }
    }
    return nil
  }

  private func noeudsDesSols() -> [SCNNode] {
    let v = sols.map { $0.floatValue }
    var i = 0
    var out: [SCNNode] = []
    while i + 6 <= v.count {
      let matiere = Int(v[i])
      let sens = Int(v[i + 1])
      let teinte = UIColor(
        red: CGFloat(v[i + 2]), green: CGFloat(v[i + 3]), blue: CGFloat(v[i + 4]), alpha: 1)
      let n = Int(v[i + 5])
      i += 6
      // Un tableau tronqué ne doit pas faire tomber l'application.
      guard n > 0, i + n * 9 <= v.count else { break }
      let (long, large) = tuile(matiere)
      var sommets: [SCNVector3] = []
      var uv: [CGPoint] = []
      var indices: [Int32] = []
      for t in 0..<n {
        for k in 0..<3 {
          let b = i + t * 9 + k * 3
          let x = v[b], y = v[b + 1], z = v[b + 2]
          sommets.append(SCNVector3(x: x, y: y, z: z))
          // Les coordonnées de texture sont le MONDE, à l'échelle de la
          // tuile : les lames courent le long de x ou de z, jamais le long
          // de la pièce approximée.
          let leLong = CGFloat(sens == 0 ? x : z)
          let enTravers = CGFloat(sens == 0 ? z : x)
          uv.append(CGPoint(x: leLong / long, y: enTravers / large))
          indices.append(Int32(sommets.count - 1))
        }
      }
      i += n * 9
      let normales = [SCNVector3](repeating: SCNVector3(x: 0, y: 1, z: 0), count: sommets.count)
      let g = SCNGeometry(
        sources: [
          SCNGeometrySource(vertices: sommets),
          SCNGeometrySource(normals: normales),
          SCNGeometrySource(textureCoordinates: uv),
        ],
        elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
      let m = SCNMaterial()
      m.lightingModel = .lambert
      m.isDoubleSided = true
      m.locksAmbientWithDiffuse = true
      if let image = imageDuSol(matiere, teinte) {
        m.diffuse.contents = image
        m.diffuse.wrapS = .repeat
        m.diffuse.wrapT = .repeat
        m.diffuse.mipFilter = .linear
        m.diffuse.minificationFilter = .linear
        m.diffuse.magnificationFilter = .linear
        m.diffuse.maxAnisotropy = 8
      } else {
        m.diffuse.contents = teinte
      }
      g.materials = [m]
      out.append(SCNNode(geometry: g))
    }
    return out
  }
}

/** Le gestionnaire qui expose la vue à React Native. */
/**
 * LA RÉGIE DE LA VISITE — la caméra, posée sans passer par les propriétés.
 * Voir `RoomScanVisite.cle`.
 */
@objc(RoomScanVisiteRegie)
final class RoomScanVisiteRegie: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func camera(_ cle: String, valeurs: [NSNumber]) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserCamera(valeurs)
      } else {
        RoomScanVisite.attendre(cle, camera: valeurs)
      }
    }
  }

  @objc func orbite(_ cle: String, valeurs: [NSNumber]) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserOrbite(valeurs)
      } else {
        RoomScanVisite.attendre(cle, orbite: valeurs)
      }
    }
  }

  @objc func levee(_ cle: String, k: NSNumber, solY: NSNumber) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserLevee(k, solY: solY)
      } else {
        RoomScanVisite.attendre(cle, levee: k, solY: solY)
      }
    }
  }
}

@objc(RoomScanVisiteManager)
final class RoomScanVisiteManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { RoomScanVisite() }
}
