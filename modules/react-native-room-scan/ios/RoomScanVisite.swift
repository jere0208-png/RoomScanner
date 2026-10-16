import Foundation
import ImageIO
import React
import SceneKit
import UIKit
import simd

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
final class RoomScanVisite: UIView, SCNSceneRendererDelegate {
  private let vue = SCNView(frame: .zero)
  private let scene = SCNScene()
  private let oeil = SCNNode()
  /// Le bâti : remplacé d'un bloc quand la scène change, jamais retouché.
  /// Tout ce que la vue a bâti — lu aussi par l'export en réalité augmentée.
  let bati = SCNNode()
  /// Les trois lumières, gardées : la maquette les règle autrement.
  private let ambiante = SCNLight()
  /// L'ambiance des MEUBLES, plus douce que celle du bâti : voir `reglerLeJour`.
  private let ambianteMeubles = SCNLight()
  private let jour = SCNLight()
  private let contre = SCNLight()
  private var noeudDuContre: SCNNode?
  /// Les lumières des lampes allumées (voir `poserLampes`).
  private let eclairage = SCNNode()
  /// Les diffuseurs de chaque lampe, par rang : ils s'allument avec elle.
  private var diffuseurs: [Int: [SCNNode]] = [:]
  /// L'état des lampes, par rang, tel que le JavaScript l'a posé.
  private var lampesPosees: [Float] = []

  /*
    CHAQUE PROPRIÉTÉ NE REBÂTIT QUE SI ELLE A CHANGÉ. La couche de
    compatibilité réaffecte TOUTES les propriétés dès que l'une bouge (le fond,
    le voile) : sans ces gardes, le logement entier se rebâtissait — des
    dizaines de milliers de nombres reconvertis en géométrie — pour une
    couleur de fond. Comparer deux tableaux coûte une fraction de ce prix.
  */
  /*
    LES GRANDS TABLEAUX SE CONVERTISSENT UNE FOIS, À L'ARRIVÉE. Gardés en
    nombres objets, ils pesaient quatre à huit fois leur poids en flottants
    toute la vie de la vue, se comparaient élément par élément à chaque
    réaffectation, et se reconvertissaient à chaque reconstruction. On ne
    garde que les flottants ; la propriété ne sert plus qu'à les recevoir.
  */
  private var fMaillage: [Float] = []
  private var fSols: [Float] = []
  private var fOrientes: [Float] = []
  private var fEcorche: [Float] = []
  private var fMeubles: [Float] = []
  private var fTexturees: [Float] = []

  /// Convertit et compare : vrai si les nombres ont changé (ils sont alors gardés).
  private static func recevoir(_ nombres: [NSNumber], dans cible: inout [Float]) -> Bool {
    let ns = nombres as NSArray
    var neufs: [Float] = []
    neufs.reserveCapacity(ns.count)
    for case let x as NSNumber in ns { neufs.append(x.floatValue) }
    if neufs == cible { return false }
    cible = neufs
    return true
  }

  @objc var maillage: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fMaillage) { rebatir(.bati) } }
  }

  @objc var sols: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fSols) { rebatir(.sols) } }
  }

  @objc var camera: [NSNumber] = [] {
    didSet { if camera != oldValue { placerOeil() } }
  }

  @objc var fond: String = "#DCE8F4" {
    didSet { vue.backgroundColor = couleur(fond) ?? .white }
  }

  @objc var orientes: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fOrientes) { rebatir(.bati) } }
  }

  @objc var ecorche: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fEcorche) { rebatir(.bati) } }
  }

  /// Le voile de l'écorché : une matière qui change, pas un logement à rebâtir.
  @objc var voile: Bool = true {
    didSet { if voile != oldValue { appliquerVoile() } }
  }

  @objc var orbite: [NSNumber] = [] {
    didSet { if orbite != oldValue { placerOeil() } }
  }

  @objc var levee: NSNumber = 1 {
    didSet { if levee != oldValue { lever() } }
  }

  @objc var solY: NSNumber = 0 {
    didSet { if solY != oldValue { lever() } }
  }

  @objc var meubles: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fMeubles) { rebatir(.meubles) } }
  }

  /// Les vraies images du relevé (chemins des orthophotos), dans l'ordre.
  @objc var textures: [NSString] = [] {
    didSet { if textures != oldValue { rebatir(.images) } }
  }

  /// Les faces habillées d'une vraie image : 16 nombres par triangle.
  @objc var texturees: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fTexturees) { rebatir(.images) } }
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
  private static var lampesEnAttente: [String: [NSNumber]] = [:]

  static func attendre(_ cle: String, lampes: [NSNumber]) { lampesEnAttente[cle] = lampes }

  static func attendre(_ cle: String, camera: [NSNumber]) { camerasEnAttente[cle] = camera }
  static func attendre(_ cle: String, orbite: [NSNumber]) { orbitesEnAttente[cle] = orbite }
  static func attendre(_ cle: String, levee: NSNumber, solY: NSNumber) {
    leveesEnAttente[cle] = (levee, solY)
  }

  private static func appliquerEnAttente(_ cle: String, a vue: RoomScanVisite) {
    if let c = camerasEnAttente.removeValue(forKey: cle) { vue.poserCamera(c) }
    if let o = orbitesEnAttente.removeValue(forKey: cle) { vue.poserOrbite(o) }
    if let l = leveesEnAttente.removeValue(forKey: cle) { vue.poserLevee(l.0, solY: l.1) }
    if let l = lampesEnAttente.removeValue(forKey: cle) { vue.poserLampes(l) }
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

  // ------------------------------------------------------------- lampes

  /*
    ON APPUIE SUR L'INTERRUPTEUR, LA PIÈCE S'ÉCLAIRE — relevé du patron :
    « donne la possibilité d'allumer les lumières depuis un interrupteur, et
    fais une lumière plus réaliste pour chaque luminaire, en fonction de leur
    forme et de leur usage (par exemple une lumière diffuse en haut et en bas
    de l'applique murale) ».

    Le JavaScript pose neuf nombres par lampe — `[rang, genre, allumée,
    source, x, y, z, nx, nz]` (voir `lumieres.ts`) —, par la régie, sans
    toucher aux propriétés : allumer ne reconvertit pas le logement. Le
    diffuseur s'allume ou s'éteint ; les lampes qui ont droit à une source
    reçoivent une vraie lumière, à la façon de leur luminaire.
  */
  func poserLampes(_ valeurs: [NSNumber]) {
    lampesPosees = valeurs.map { $0.floatValue }
    appliquerLampes()
  }

  private func lampeAllumee(_ rang: Int) -> Bool {
    var i = 0
    while i + 9 <= lampesPosees.count {
      if Int(lampesPosees[i]) == rang { return lampesPosees[i + 2] > 0.5 }
      i += 9
    }
    return false
  }

  /*
    LES DEUX MATIÈRES D'UN DIFFUSEUR, CRÉÉES UNE FOIS. Chaque interrupteur en
    fabriquait de neuves pour chaque diffuseur : autant de matériaux que
    SceneKit devait préparer à nouveau, et l'image sautait au moment même où
    la lumière s'allume.
  */
  private lazy var diffuseurAllume: SCNMaterial = Self.fabriquerDiffuseur(allume: true)
  private lazy var diffuseurEteint: SCNMaterial = Self.fabriquerDiffuseur(allume: false)

  private func materiauDeDiffuseur(allume: Bool) -> SCNMaterial {
    allume ? diffuseurAllume : diffuseurEteint
  }

  /** Éteint : un blanc opalin. Allumé : il rayonne, de sa teinte chaude. */
  private static func fabriquerDiffuseur(allume: Bool) -> SCNMaterial {
    let m = SCNMaterial()
    m.isDoubleSided = false
    m.cullMode = .back
    if allume {
      m.lightingModel = .constant
      m.diffuse.contents = UIColor(red: 1.0, green: 0.95, blue: 0.84, alpha: 1)
    } else {
      m.lightingModel = .physicallyBased
      m.diffuse.contents = UIColor(red: 0.92, green: 0.91, blue: 0.88, alpha: 1)
      m.roughness.contents = NSNumber(value: 0.55)
      m.metalness.contents = NSNumber(value: 0)
    }
    return m
  }

  /*
    ALLUMER AJOUTE DE LA LUMIÈRE — relevé du patron : « sur la visite, allumer
    une pièce rend les murs plus sombres, ce devrait être l'inverse ; revois
    tout le système de lumière et son impact sur les pièces et les meubles ».

    La moindre lampe allumée faisait « tomber le soir » : le jour baissait de
    moitié, le contre-jour se retirait — et toute la pièce, sauf le cercle
    sous la lampe, s'assombrissait au moment même où l'on allumait. Le jour ne
    bouge plus : une lampe AJOUTE sa lumière à celle qui est là, comme chez
    soi. Le contre-jour reste à sa place — cinq lampes, le jour, le contre-jour
    et l'ambiance tiennent dans les huit lumières de la carte graphique.
  */
  private func appliquerLampes() {
    for enfant in eclairage.childNodes { enfant.removeFromParentNode() }
    var i = 0
    let v = lampesPosees
    while i + 9 <= v.count {
      let rang = Int(v[i])
      let genre = Int(v[i + 1])
      let allume = v[i + 2] > 0.5
      let source = v[i + 3] > 0.5
      let matiere = materiauDeDiffuseur(allume: allume)
      for n in diffuseurs[rang] ?? [] where n.geometry?.firstMaterial !== matiere {
        n.geometry?.materials = [matiere]
      }
      if allume {
        let p = SCNVector3(x: v[i + 4], y: v[i + 5], z: v[i + 6])
        // Toute lampe allumée a son halo — même loin, même sans source.
        eclairage.addChildNode(halo(genre: genre, a: p, nx: v[i + 7], nz: v[i + 8]))
        if source {
          for l in lumieres(genre: genre, a: p, nx: v[i + 7], nz: v[i + 8]) {
            eclairage.addChildNode(l)
          }
          eclairage.addChildNode(lueurDesMeubles(genre: genre, a: p, nx: v[i + 7], nz: v[i + 8]))
        }
      }
      i += 9
    }
  }

  /// Le jour de la vue : celui de la maquette, ou celui de la visite. Il ne
  /// dépend plus des lampes.
  private func reglerLeJour() {
    let maquette = orbite.count >= 10
    ambiante.intensity = maquette ? 640 : 620
    ambianteMeubles.intensity = maquette ? 440 : 420
    jour.intensity = maquette ? 380 : 420
    contre.intensity = maquette ? 160 : 200
    noeudDuContre?.light = contre
  }

  /**
   LA LUMIÈRE D'UN LUMINAIRE, selon sa forme, son usage — et sa teinte.

   1 — l'applique murale : deux faisceaux larges, l'un vers le plafond,
       l'autre vers le sol — le mur se lave de lumière au-dessus et
       au-dessous d'elle ; blanc chaud (2 700 K) ;
   2 — le spot encastré : un cône net vers le sol ; blanc (3 000 K) ;
   3 — l'ampoule de la DCL : elle rayonne tout autour, à l'ampoule ;
       blanc chaud ;
   4 — le plafonnier : une nappe large et douce ; blanc neutre (3 500 K) ;
   5 — le ventilateur : sous son moteur ; blanc chaud.

   DES TEINTES ADOUCIES ET DES INTENSITÉS MESURÉES — relevé du patron :
   « l'éclairage en visite agit trop sur les meubles, cassant leurs
   couleurs ». Le 2 700 K saturé d'avant (un orange franc) teintait tout ce
   qu'il touchait, à des intensités qui délavaient un meuble clair : le
   bois virait au roux, le blanc au crème. La lumière garde sa chaleur, sans
   repeindre la pièce. Une portée de pièce : au-delà, elle s'éteint d'elle-
   même, sans éclairer la chambre d'à côté au travers.

   PLUS DOUCES ENCORE, ET POUR LA PIÈCE SEULE — relevé du patron : « diminue
   la lumière, son interrupteur allumé ; elle doit être plus perceptible sans
   augmenter, au contraire elle doit moins impacter les meubles, qui
   deviennent blancs sous lumière ». Les forces baissent d'un tiers, et les
   faisceaux ne touchent plus que le bâti (`MASQUE_PIECE`) : les murs, les
   sols, le plafond. Les meubles reçoivent leur part par une lueur à elle,
   cinq fois plus faible (`lueurDesMeubles`). Ce qui rend la lumière
   perceptible, c'est sa SOURCE : le halo autour du luminaire (`halo`), et la
   nappe sur le mur et le sol — pas un meuble poussé au blanc.
   */
  private func lumieres(genre: Int, a p: SCNVector3, nx: Float, nz: Float) -> [SCNNode] {
    let chaud = UIColor(red: 1.0, green: 0.91, blue: 0.79, alpha: 1)
    let blanc = UIColor(red: 1.0, green: 0.94, blue: 0.86, alpha: 1)
    let neutre = UIColor(red: 1.0, green: 0.97, blue: 0.92, alpha: 1)
    func faisceau(
      versLeHaut: Bool, interieur: CGFloat, exterieur: CGFloat, intensite: CGFloat,
      portee: CGFloat, teinte: UIColor, en q: SCNVector3
    ) -> SCNNode {
      let l = SCNLight()
      l.type = .spot
      l.color = teinte
      l.intensity = intensite
      l.spotInnerAngle = interieur
      l.spotOuterAngle = exterieur
      l.attenuationStartDistance = 0.3
      l.attenuationEndDistance = portee
      l.attenuationFalloffExponent = 2
      l.castsShadow = false
      l.categoryBitMask = Self.MASQUE_PIECE
      let n = SCNNode()
      n.light = l
      n.position = q
      // Un projecteur éclaire le long de son −z : un quart de tour autour
      // de x le tourne vers le haut, ou vers le bas.
      n.eulerAngles = SCNVector3(x: versLeHaut ? Float.pi / 2 : -Float.pi / 2, y: 0, z: 0)
      return n
    }
    switch genre {
    case 1:
      let q = SCNVector3(x: p.x + nx * 0.06, y: p.y, z: p.z + nz * 0.06)
      return [
        faisceau(versLeHaut: true, interieur: 40, exterieur: 130, intensite: 200, portee: 3.2, teinte: chaud, en: q),
        faisceau(versLeHaut: false, interieur: 40, exterieur: 130, intensite: 160, portee: 3.0, teinte: chaud, en: q),
      ]
    case 2:
      return [faisceau(
        versLeHaut: false, interieur: 24, exterieur: 72, intensite: 240, portee: 4.5, teinte: blanc,
        en: SCNVector3(x: p.x, y: p.y - 0.02, z: p.z))]
    case 3:
      let l = SCNLight()
      l.type = .omni
      l.color = chaud
      l.intensity = 210
      l.attenuationStartDistance = 0.3
      l.attenuationEndDistance = 4.5
      l.attenuationFalloffExponent = 2
      l.castsShadow = false
      l.categoryBitMask = Self.MASQUE_PIECE
      let n = SCNNode()
      n.light = l
      // Au centre de l'ampoule (`DESCENTE_DE_LA_LUMIERE.dcl`), pas à la rosace.
      n.position = SCNVector3(x: p.x, y: p.y - 0.59, z: p.z)
      return [n]
    case 4:
      return [faisceau(
        versLeHaut: false, interieur: 80, exterieur: 165, intensite: 250, portee: 5.5, teinte: neutre,
        en: SCNVector3(x: p.x, y: p.y - 0.07, z: p.z))]
    case 5:
      return [faisceau(
        versLeHaut: false, interieur: 60, exterieur: 155, intensite: 220, portee: 5, teinte: chaud,
        en: SCNVector3(x: p.x, y: p.y - 0.37, z: p.z))]
    default:
      return []
    }
  }

  /*
    QUI REÇOIT QUELLE LUMIÈRE. Le jour, l'ambiance et le contre-jour éclairent
    tout (leur masque a tous les bits). Les faisceaux des lampes n'éclairent
    que ce qui porte le bit de la PIÈCE — tout nœud le porte par défaut ; les
    meubles et les appareils portent celui du MEUBLE à la place, et ne
    reçoivent des lampes que leur lueur douce. Chaque nœud voit ainsi au plus
    huit lumières : les trois du jour et cinq sources.
  */
  private static let MASQUE_PIECE = 1
  private static let MASQUE_MEUBLE = 2

  /** La part des meubles : une lueur sans faisceau, qui les réchauffe sans les blanchir. */
  private func lueurDesMeubles(genre: Int, a p: SCNVector3, nx: Float, nz: Float) -> SCNNode {
    let l = SCNLight()
    l.type = .omni
    l.color = UIColor(red: 1.0, green: 0.95, blue: 0.88, alpha: 1)
    l.intensity = 60
    l.attenuationStartDistance = 0.2
    l.attenuationEndDistance = 3.2
    l.attenuationFalloffExponent = 2
    l.castsShadow = false
    l.categoryBitMask = Self.MASQUE_MEUBLE
    let n = SCNNode()
    n.light = l
    let descente: Float = genre == 1 ? 0 : genre == 3 ? 0.59 : 0.3
    n.position = SCNVector3(x: p.x + nx * 0.1, y: p.y - descente, z: p.z + nz * 0.1)
    return n
  }

  /// Le halo : un disque doux, d'un blanc chaud, plein au cœur, nul au bord.
  private static let imageDuHalo: UIImage = {
    let cote: CGFloat = 128
    return UIGraphicsImageRenderer(size: CGSize(width: cote, height: cote)).image { ctx in
      let couleurs = [
        UIColor(red: 1.0, green: 0.9, blue: 0.7, alpha: 0.7).cgColor,
        UIColor(red: 1.0, green: 0.86, blue: 0.62, alpha: 0.28).cgColor,
        UIColor(red: 1.0, green: 0.84, blue: 0.58, alpha: 0).cgColor,
      ] as CFArray
      guard let g = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: couleurs, locations: [0, 0.32, 1])
      else { return }
      let c = CGPoint(x: cote / 2, y: cote / 2)
      ctx.cgContext.drawRadialGradient(
        g, startCenter: c, startRadius: 0, endCenter: c, endRadius: cote / 2, options: [])
    }
  }()

  /// Une matière pour tous les halos : ni lumière, ni profondeur écrite.
  private lazy var matiereDuHalo: SCNMaterial = {
    let m = SCNMaterial()
    m.lightingModel = .constant
    m.diffuse.contents = Self.imageDuHalo
    m.transparent.contents = Self.imageDuHalo
    m.transparencyMode = .aOne
    m.blendMode = .alpha
    m.writesToDepthBuffer = false
    m.readsFromDepthBuffer = true
    m.isDoubleSided = true
    return m
  }()

  /*
    LA LUMIÈRE SE VOIT À SA SOURCE. Une lampe allumée se reconnaît d'abord à
    l'éclat autour d'elle : un disque doux, toujours face au regard, qui
    n'éclaire rien — il ne pousse aucun meuble au blanc. Le mur ou le
    plafond le coupe là où il passe derrière (il lit la profondeur).
  */
  private func halo(genre: Int, a p: SCNVector3, nx: Float, nz: Float) -> SCNNode {
    let diametre: CGFloat
    let q: SCNVector3
    switch genre {
    case 1:
      diametre = 0.55
      q = SCNVector3(x: p.x + nx * 0.08, y: p.y, z: p.z + nz * 0.08)
    case 2:
      diametre = 0.32
      q = SCNVector3(x: p.x, y: p.y - 0.04, z: p.z)
    case 3:
      diametre = 0.42
      q = SCNVector3(x: p.x, y: p.y - 0.59, z: p.z)
    case 4:
      diametre = 0.75
      q = SCNVector3(x: p.x, y: p.y - 0.08, z: p.z)
    default:
      diametre = 0.6
      q = SCNVector3(x: p.x, y: p.y - 0.37, z: p.z)
    }
    let plan = SCNPlane(width: diametre, height: diametre)
    plan.materials = [matiereDuHalo]
    let n = SCNNode(geometry: plan)
    n.position = q
    n.constraints = [SCNBillboardConstraint()]
    n.castsShadow = false
    n.renderingOrder = 20
    return n
  }

  /// Le fil du bois et la trame des tissus, dessinés une fois par teinte —
  /// pour toutes les vues : la visite et la maquette ne les redessinent plus
  /// chacune (fil principal seulement).
  private static var texturesDesMeubles: [String: UIImage] = [:]
  /// Le parquet et le carrelage, dessinés une fois par matière et par teinte.
  private static var imagesDesSols: [String: UIImage] = [:]

  /*
    CHAQUE FAMILLE A SON NŒUD, ET NE SE REBÂTIT QUE SI ELLE CHANGE. Tout
    changement — le voile basculé, les images arrivées, une lampe de plus —
    défaisait le logement entier et le renvoyait à la carte graphique. Les
    murs, les sols, les images et les meubles ont chacun leur nœud ; seul
    celui qui a changé se refait.
  */
  private struct Sale: OptionSet {
    let rawValue: Int
    static let bati = Sale(rawValue: 1)
    static let sols = Sale(rawValue: 2)
    static let images = Sale(rawValue: 4)
    static let meubles = Sale(rawValue: 8)
    static let tout: Sale = [.bati, .sols, .images, .meubles]
  }
  private var sale: Sale = []
  private let gBati = SCNNode()
  private let gSols = SCNNode()
  private let gImages = SCNNode()
  private let gMeubles = SCNNode()
  /// La matière de l'écorché : le voile s'y pose ou s'en retire.
  private var matiereEcorche: SCNMaterial?

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
  private var epaisseurContour: Float = 0.006
  /*
    UNE SEULE MATIÈRE POUR TOUS LES LISERÉS. Elles étaient toutes identiques,
    une par meuble — et pendant un pincement de la maquette, l'épaisseur se
    réécrivait dans chacune, à chaque image. Une matière, une écriture.
  */
  private lazy var matiereContour: SCNMaterial = Self.fabriquerContour(epaisseur: self.epaisseurContour)

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
    /*
      DEUX PIXELS PAR POINT, PAS TROIS. Sur un écran « 3× », la visite
      rendait 2,25 fois plus de pixels qu'à 2× — en plein écran, soixante
      fois par seconde, anticrénelage 4× compris. Dans une scène 3D lissée,
      la différence ne se voit pas ; la carte graphique, la batterie et la
      chaleur, si.
    */
    vue.contentScaleFactor = min(2, UIScreen.main.scale)
    vue.autoenablesDefaultLighting = false
    vue.allowsCameraControl = false
    vue.delegate = self
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
    /*
      PLUS D'OCCLUSION AMBIANTE — relevé du patron : « dans la visite 3D, il
      y a des ombres bizarres au-dessus et en dessous de chaque mur ».
      L'occlusion « en espace écran » assombrit ce qui est proche en
      profondeur à l'écran : le pied et la tête de chaque mur, contre le sol
      et le plafond, en bandes sales qui bougeaient avec la caméra — et elle
      coûtait une passe de rendu à chaque image. Les meubles se lisent déjà
      par leur liseré et leur ombre de contact ; les angles, par la lumière.
    */
    cam.screenSpaceAmbientOcclusionIntensity = 0
    oeil.camera = cam
    scene.rootNode.addChildNode(oeil)
    vue.pointOfView = oeil

    // LA LUMIÈRE : une ambiance franche, un jour qui vient d'en haut et
    // d'un côté, un contre-jour plus faible de l'autre — assez pour que
    // deux murs d'une même teinte se distinguent à l'angle.
    ambiante.type = .ambient
    ambiante.intensity = 620
    ambiante.color = UIColor.white
    ambiante.categoryBitMask = Self.MASQUE_PIECE
    let noeudAmbiant = SCNNode()
    noeudAmbiant.light = ambiante
    scene.rootNode.addChildNode(noeudAmbiant)

    /*
      DES MEUBLES QUI GARDENT LEUR COULEUR — premier diagnostic envoyé par le
      patron, vidéo à l'appui : « lumière trop forte sur les meubles, ça les
      rend blancs ». En visite, le canapé crème et le dessus de la table
      basse passaient au blanc pur dès qu'on s'en approchait par le dessus.

      Le calcul le disait : les meubles sont en matière PHYSIQUE, le bâti en
      Lambert. Une face de meuble tournée vers le haut recevait l'ambiance
      (620), le jour, le contre-jour ET l'environnement (0,7, un ciel blanc
      au-dessus) — près de deux fois ce que reçoit un mur. Sur un tissu clair,
      tout dépassait 100 % : du blanc. Les meubles ont donc leur ambiance à
      eux, plus douce, et l'environnement ne sert plus qu'à donner un reflet
      au chrome (0,2). Le bâti, lui, ne change pas.
    */
    ambianteMeubles.type = .ambient
    ambianteMeubles.intensity = 420
    ambianteMeubles.color = UIColor.white
    ambianteMeubles.categoryBitMask = Self.MASQUE_MEUBLE
    let noeudAmbiantMeubles = SCNNode()
    noeudAmbiantMeubles.light = ambianteMeubles
    scene.rootNode.addChildNode(noeudAmbiantMeubles)

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
    noeudDuContre = noeudContre
    scene.rootNode.addChildNode(eclairage)

    scene.rootNode.addChildNode(bati)
    for g in [gBati, gSols, gImages, gMeubles] { bati.addChildNode(g) }

    // L'ENVIRONNEMENT des matériaux physiques : un ciel clair au-dessus, un
    // sol chaud dessous. Sans lui, un chrome ne reflète rien et paraît noir.
    // Il n'éclaire que les meubles : le bâti reste en Lambert.
    scene.lightingEnvironment.contents = RoomScanVisite.imageDEnvironnement()
    scene.lightingEnvironment.intensity = 0.2
  }

  required init?(coder: NSCoder) { nil }

  override func layoutSubviews() {
    super.layoutSubviews()
    let change = vue.frame.size != bounds.size
    vue.frame = bounds
    if change { reveiller() }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { reveiller() }
  }

  /*
    LA PREMIÈRE IMAGE, MÊME SANS GESTE — vu sur les captures du simulateur :
    la maquette restait blanche à l'ouverture de la 3D, et n'apparaissait
    qu'au premier glissement. La scène était posée avant que la vue n'ait sa
    taille et sa fenêtre ; rendue à la demande, elle attendait un
    changement. Une demi-seconde de rendu continu à chaque mise en place, puis
    on rend la main au rendu à la demande.
  */
  /*
    ET CHAQUE CHANGEMENT RÉVEILLE LE RENDU — revue I5 : la demi-seconde ne
    couvrait que la mise en place. Un logement meublé se bâtit en plus de
    temps que ça, et la caméra en trois quarts arrive par la régie après le
    montage : l'un et l'autre tombaient hors de la fenêtre, la vue restait
    sur l'image d'avant (blanche, ou de face) jusqu'au premier glissement.
    Le bâti, la caméra et la levée réveillent donc le rendu à leur tour, et
    le réveil se PROLONGE au lieu d'être coupé par le minuteur du précédent.
  */
  private var finDuReveil = DispatchTime.now()
  private var sommeilPrevu = false

  private func reveiller(_ duree: Double = 0.6) {
    vue.isPlaying = true
    vue.setNeedsDisplay()
    let fin = DispatchTime.now() + duree
    if fin > finDuReveil { finDuReveil = fin }
    guard !sommeilPrevu else { return }
    sommeilPrevu = true
    planifierSommeil()
  }

  private func planifierSommeil() {
    DispatchQueue.main.asyncAfter(deadline: finDuReveil) { [weak self] in
      guard let self = self else { return }
      if DispatchTime.now() < self.finDuReveil {
        self.planifierSommeil()
        return
      }
      self.sommeilPrevu = false
      self.vue.isPlaying = false
    }
  }

  /*
    LA PREMIÈRE IMAGE, ANNONCÉE — pour que l'écran retire sa silhouette
    d'attente au moment où la maquette est réellement à l'écran, ni avant
    (un trou blanc), ni après (une attente pour rien).
  */
  @objc var onPremiereImage: RCTDirectEventBlock?
  /// Écrit sur le fil principal, lu sur celui du rendu : un simple drapeau.
  private var guetteLaPremiere = false
  private var premiereAnnoncee = false

  func renderer(_ renderer: SCNSceneRenderer, didRenderScene scene: SCNScene, atTime time: TimeInterval) {
    guard guetteLaPremiere else { return }
    guetteLaPremiere = false
    DispatchQueue.main.async { [weak self] in
      guard let self = self, !self.premiereAnnoncee else { return }
      self.premiereAnnoncee = true
      self.onPremiereImage?([:])
    }
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
    reglerLeJour()
    oeil.position = SCNVector3(
      x: cible.x + vers.x * recul, y: cible.y + vers.y * recul, z: cible.z + vers.z * recul)
    oeil.look(at: cible, up: haut, localFront: SCNVector3(x: 0, y: 0, z: -1))
    SCNTransaction.commit()
    reveiller(0.2)
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
    reveiller(0.2)
  }

  // --------------------------------------------------------------- bâti

  /*
    UNE RECONSTRUCTION PAR PASSAGE, PAS PAR PROPRIÉTÉ. Au montage, la vue
    reçoit ses tableaux un par un — maillage, sols, orientés, écorché — et
    chacun relançait la construction de tout le bâti. On la reporte au tour
    suivant de la boucle principale : quatre propriétés, une construction.
  */
  private var rebatirPrevu = false

  private func rebatir(_ s: Sale = .tout) {
    sale.formUnion(s)
    guard !rebatirPrevu else { return }
    rebatirPrevu = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.rebatirPrevu = false
      self.rebatirMaintenant()
    }
  }

  private static func vider(_ n: SCNNode) {
    for enfant in n.childNodes { enfant.removeFromParentNode() }
  }

  private func rebatirMaintenant() {
    let s = sale
    sale = []
    if s.contains(.bati) {
      Self.vider(gBati)
      matiereEcorche = nil
      if let g = geometrie(fMaillage, deuxFaces: true) {
        gBati.addChildNode(SCNNode(geometry: g))
      }
      if let g = geometrie(fOrientes, deuxFaces: false) {
        gBati.addChildNode(SCNNode(geometry: g))
      }
      if let g = geometrie(fEcorche, deuxFaces: false) {
        matiereEcorche = g.firstMaterial
        appliquerVoile()
        let n = SCNNode(geometry: g)
        // Peint après le reste : un voile se pose sur ce qu'il voile.
        n.renderingOrder = 10
        gBati.addChildNode(n)
      }
    }
    if s.contains(.sols) {
      Self.vider(gSols)
      for n in noeudsDesSols() { gSols.addChildNode(n) }
    }
    if s.contains(.images) {
      Self.vider(gImages)
      for n in noeudsTextures() { gImages.addChildNode(n) }
    }
    if s.contains(.meubles) {
      Self.vider(gMeubles)
      diffuseurs.removeAll()
      for n in noeudsDesMeubles() {
        // Les faisceaux des lampes ne les touchent pas : voir `MASQUE_MEUBLE`.
        n.enumerateHierarchy { m, _ in m.categoryBitMask = Self.MASQUE_MEUBLE }
        gMeubles.addChildNode(n)
      }
    }
    if !premiereAnnoncee && !gBati.childNodes.isEmpty { guetteLaPremiere = true }
    reveiller()
  }

  /*
    L'ÉCORCHÉ, CALCULÉ AU PIXEL. Une face extérieure de mur qui nous fait face
    masque la pièce : elle se voile, jusqu'à quinze pour cent, de quoi garder
    la trace du mur. Vue de champ, elle reste pleine. La normale est dans le
    repère de l'œil : sa composante z dit à quel point la face nous regarde —
    le même nombre que le JavaScript appelait « vers ».
  */
  private static let nuanceurVoile = """
    #pragma transparent
    #pragma body
    float vers = normalize(_surface.normal).z;
    float a = 1.0 - 0.85 * smoothstep(0.08, 0.5, vers);
    _output.color = float4(_output.color.rgb * a, a);
    """

  /// Pose ou retire le voile de l'écorché, sans rien rebâtir.
  private func appliquerVoile() {
    guard let m = matiereEcorche else { return }
    if voile {
      m.shaderModifiers = [.fragment: Self.nuanceurVoile]
      m.blendMode = .alpha
      m.writesToDepthBuffer = false
    } else {
      m.shaderModifiers = nil
      m.writesToDepthBuffer = true
    }
  }

  // ------------------------------------------------------------- vraies images

  /**
   LES MURS ET LES SOLS EN VRAIES IMAGES — relevé du patron : « une
   reproduction à l'identique, sur le modèle 3D, de ce que l'on scanne ».

   Chaque face qu'une orthophoto couvre arrive ici plutôt que dans le
   maillage teinté : seize nombres par triangle — le rang de son image dans
   `textures`, puis trois sommets (x, y, z, u, v). Un nœud par image, une
   matière qui porte l'image ; l'image est lue une fois et gardée.

   L'image a déjà sa lumière — celle de la pièce au moment du scan : une
   part de son éclat lui revient en émission, pour qu'elle ne s'assombrisse
   pas une seconde fois sous l'éclairage de la scène.
   */
  private func noeudsTextures() -> [SCNNode] {
    let v = fTexturees
    let n = v.count / 16
    guard n > 0, !textures.isEmpty else { return [] }
    var parImage: [Int: [Int]] = [:]
    for t in 0..<n {
      parImage[Int(v[t * 16]), default: []].append(t)
    }
    var noeuds: [SCNNode] = []
    for (k, liste) in parImage {
      guard k >= 0, k < textures.count, let image = Self.image(textures[k] as String) else { continue }
      var sommets: [SCNVector3] = []
      var normales: [SCNVector3] = []
      var uvs: [CGPoint] = []
      sommets.reserveCapacity(liste.count * 3)
      normales.reserveCapacity(liste.count * 3)
      uvs.reserveCapacity(liste.count * 3)
      for t in liste {
        let b = t * 16 + 1
        var p: [SIMD3<Float>] = []
        var q: [CGPoint] = []
        for s in 0..<3 {
          let o = b + s * 5
          p.append(SIMD3<Float>(v[o], v[o + 1], v[o + 2]))
          q.append(CGPoint(x: CGFloat(v[o + 3]), y: CGFloat(v[o + 4])))
        }
        let c = simd_cross(p[1] - p[0], p[2] - p[0])
        let l = simd_length(c)
        guard l > 1e-9 else { continue }
        let nrm = c / l
        for s in 0..<3 {
          sommets.append(SCNVector3(p[s].x, p[s].y, p[s].z))
          normales.append(SCNVector3(nrm.x, nrm.y, nrm.z))
          uvs.append(q[s])
        }
      }
      guard !sommets.isEmpty else { continue }
      let indices = (0..<Int32(sommets.count)).map { $0 }
      let geometrie = SCNGeometry(
        sources: [
          SCNGeometrySource(vertices: sommets),
          SCNGeometrySource(normals: normales),
          SCNGeometrySource(textureCoordinates: uvs),
        ],
        elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
      let m = SCNMaterial()
      m.lightingModel = .lambert
      m.diffuse.contents = image
      m.diffuse.wrapS = .clamp
      m.diffuse.wrapT = .clamp
      m.diffuse.mipFilter = .linear
      // Un mur vu de biais garde son détail : filtrage anisotrope.
      m.diffuse.maxAnisotropy = 16
      m.diffuse.minificationFilter = .linear
      m.diffuse.magnificationFilter = .linear
      m.emission.contents = image
      m.emission.intensity = 0.35
      m.isDoubleSided = false
      geometrie.materials = [m]
      noeuds.append(SCNNode(geometry: geometrie))
    }
    return noeuds
  }

  /// Les images déjà lues : un passage de la caméra ne relit pas le disque.
  /// Soixante-quatre mégaoctets d'images décodées au plus : au-delà, le cache
  /// rend la mémoire au système au lieu de grossir sans fin.
  private static let imagesLues: NSCache<NSString, UIImage> = {
    let c = NSCache<NSString, UIImage>()
    c.totalCostLimit = 64 << 20
    return c
  }()

  /**
   L'image d'un chemin — retrouvée par son nom si l'app a été réinstallée.
   DÉCODÉE ICI, PAS À LA PREMIÈRE IMAGE : lue paresseusement, chaque JPEG se
   décodait au moment où la carte graphique le réclamait — tous ensemble, sur
   la première image de la visite, qui sautait.
   */
  static func image(_ chemin: String) -> UIImage? {
    if let deja = imagesLues.object(forKey: chemin as NSString) { return deja }
    guard let url = RoomScanExport.resolveFile(chemin),
          let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let options: [CFString: Any] = [kCGImageSourceShouldCacheImmediately: true]
    guard let cg = CGImageSourceCreateImageAtIndex(src, 0, options as CFDictionary) else { return nil }
    let image = UIImage(cgImage: cg)
    let cout: Int = cg.bytesPerRow * cg.height
    imagesLues.setObject(image, forKey: chemin as NSString, cost: cout)
    return image
  }

  // ------------------------------------------------------------- meubles

  /** Les meubles : un nœud par matière, toutes les pièces de la scène dedans. */
  private func noeudsDesMeubles() -> [SCNNode] {
    let v = fMeubles
    var k = 0
    var out: [SCNNode] = []
    while k + 8 <= v.count {
      // Un DIFFUSEUR de lampe porte son rang dans son code : 5 + 100 × (rang + 1).
      let brut = Int(v[k])
      let lampe = brut >= 100 ? brut / 100 - 1 : -1
      let code = brut % 100
      let teinte = UIColor(
        red: CGFloat(v[k + 1]), green: CGFloat(v[k + 2]), blue: CGFloat(v[k + 3]), alpha: 1)
      let rugosite = CGFloat(v[k + 4])
      let metal = CGFloat(v[k + 5])
      let nS = Int(v[k + 6])
      let nI = Int(v[k + 7])
      k += 8
      guard nS > 0, nI > 0, k + nS * 8 + nI <= v.count else { break }
      /*
        LES SOMMETS PARTENT D'UN BLOC. Le JavaScript les range déjà comme la
        carte graphique les lit — position, normale, coordonnées d'image,
        huit flottants par sommet : on les copie tels quels, au lieu de trois
        tableaux refaits sommet par sommet (et une seconde fois pour la coque).
      */
      let debut = k
      let fin = k + nS * 8
      let donnees: Data = v[debut..<fin].withUnsafeBufferPointer { Data(buffer: $0) }
      let positions = Self.source(donnees, .vertex, nS, composantes: 3, decalage: 0)
      let normales = Self.source(donnees, .normal, nS, composantes: 3, decalage: 12)
      let uvs = Self.source(donnees, .texcoord, nS, composantes: 2, decalage: 24)
      k = fin
      var indices: [UInt32] = []
      indices.reserveCapacity(nI)
      let dernier = Float(nS - 1)
      for j in 0..<nI {
        indices.append(UInt32(max(0, min(dernier, v[k + j]))))
      }
      k += nI
      let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
      let g = SCNGeometry(sources: [positions, normales, uvs], elements: [element])
      g.materials = [materiauDuMeuble(code, teinte, rugosite, metal)]
      let n = SCNNode(geometry: g)
      if code == 5 && lampe >= 0 {
        diffuseurs[lampe, default: []].append(n)
        g.materials = [materiauDeDiffuseur(allume: lampeAllumee(lampe))]
      }
      // Ce qui se pose PAR-DESSUS le reste — l'ombre, le verre — passe après.
      if code == 9 { n.renderingOrder = 5 }
      if code == 3 || code == 6 { n.renderingOrder = 6 }
      out.append(n)
      // Le liseré : pour ce qui a une forme pleine (ni ombre, ni verre, ni
      // feuille, ni lumière — un diffuseur allumé n'a pas de bord sombre).
      if code != 9 && code != 3 && code != 4 && code != 5 && code != 6 {
        if let coque = noeudDeContour(v, debut: debut, nS: nS, indices: indices,
                                      positions: positions, element: element) {
          out.append(coque)
        }
      }
    }
    return out
  }

  /// Une source de sommets lue dans le bloc : huit flottants (32 octets) par sommet.
  private static func source(
    _ d: Data, _ s: SCNGeometrySource.Semantic, _ n: Int, composantes: Int, decalage: Int
  ) -> SCNGeometrySource {
    SCNGeometrySource(
      data: d, semantic: s, vectorCount: n, usesFloatComponents: true,
      componentsPerVector: composantes, bytesPerComponent: 4,
      dataOffset: decalage, dataStride: 32)
  }

  /**
   * La coque d'un groupe : les mêmes triangles (la même source de positions,
   * le même élément), avec une normale SOUDÉE par position (la moyenne des
   * normales des sommets confondus) — sans quoi la coque se fendrait à chaque
   * arête vive d'une boîte.
   */
  private func noeudDeContour(
    _ v: [Float], debut: Int, nS: Int, indices: [UInt32],
    positions: SCNGeometrySource, element: SCNGeometryElement
  ) -> SCNNode? {
    guard nS > 0, !indices.isEmpty else { return nil }
    func point(_ i: Int) -> SCNVector3 {
      let b = debut + i * 8
      return SCNVector3(x: v[b], y: v[b + 1], z: v[b + 2])
    }
    // La position, arrondie au demi-millimètre, en clé ENTIÈRE : une chaîne
    // fabriquée par sommet coûtait plus que tout le reste de la coque.
    var cumul: [SIMD3<Int32>: SCNVector3] = [:]
    var cles: [SIMD3<Int32>] = []
    cles.reserveCapacity(nS)
    // Les normales géométriques, par triangle, cumulées sur leurs sommets.
    var parSommet = [SCNVector3](repeating: SCNVector3(x: 0, y: 0, z: 0), count: nS)
    var t = 0
    while t + 2 < indices.count {
      let a = Int(indices[t]), b = Int(indices[t + 1]), c = Int(indices[t + 2])
      t += 3
      guard a < nS, b < nS, c < nS else { continue }
      let n = normale(point(a), point(b), point(c))
      parSommet[a] = SCNVector3(x: parSommet[a].x + n.x, y: parSommet[a].y + n.y, z: parSommet[a].z + n.z)
      parSommet[b] = SCNVector3(x: parSommet[b].x + n.x, y: parSommet[b].y + n.y, z: parSommet[b].z + n.z)
      parSommet[c] = SCNVector3(x: parSommet[c].x + n.x, y: parSommet[c].y + n.y, z: parSommet[c].z + n.z)
    }
    for k in 0..<nS {
      let p = point(k)
      let cle = SIMD3<Int32>(
        Int32((p.x * 2000).rounded()), Int32((p.y * 2000).rounded()), Int32((p.z * 2000).rounded()))
      cles.append(cle)
      let deja = cumul[cle] ?? SCNVector3(x: 0, y: 0, z: 0)
      cumul[cle] = SCNVector3(
        x: deja.x + parSommet[k].x, y: deja.y + parSommet[k].y, z: deja.z + parSommet[k].z)
    }
    var soudees: [SCNVector3] = []
    soudees.reserveCapacity(nS)
    for cle in cles {
      let w = cumul[cle] ?? SCNVector3(x: 0, y: 1, z: 0)
      let l = sqrtf(w.x * w.x + w.y * w.y + w.z * w.z)
      soudees.append(l > 1e-6 ? SCNVector3(x: w.x / l, y: w.y / l, z: w.z / l) : SCNVector3(x: 0, y: 1, z: 0))
    }
    let g = SCNGeometry(sources: [positions, SCNGeometrySource(normals: soudees)], elements: [element])
    g.materials = [matiereContour]
    let noeud = SCNNode(geometry: g)
    // Après le reste : un voile se pose sur ce qui est déjà peint.
    noeud.renderingOrder = 4
    return noeud
  }

  /// La matière des liserés — une seule, partagée par tous les meubles.
  private static func fabriquerContour(epaisseur: Float) -> SCNMaterial {
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
    m.setValue(NSNumber(value: epaisseur), forKey: "epaisseur")
    return m
  }

  /** L'épaisseur du liseré, en mètres — un point d'écran, au zoom du moment. */
  private func regleLeContour(_ metres: Float) {
    guard metres.isFinite, metres > 0 else { return }
    let voulue = min(0.05, max(0.002, metres))
    // Rien à reposer : en visite, l'épaisseur est fixe, et chaque image
    // réécrivait la même valeur dans chaque matériau.
    if voulue == epaisseurContour { return }
    epaisseurContour = voulue
    matiereContour.setValue(NSNumber(value: epaisseurContour), forKey: "epaisseur")
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
        // De biais, le fil du bois et la trame restent nets.
        m.diffuse.maxAnisotropy = 4
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
    case 5:
      // CE QUI ÉCLAIRE — le diffuseur d'une applique, le verre d'un spot,
      // une ampoule : il donne la lumière au lieu de la recevoir. Il se
      // peint donc de sa propre teinte, sans ombre, comme une lampe allumée.
      m.lightingModel = .constant
    case 6:
      // LE VITRAGE : le bleu du dehors. Il montre le jour au lieu de prendre
      // l'ombre de la pièce, et laisse deviner ce qu'il y a derrière.
      m.lightingModel = .constant
      m.transparency = 0.82
      m.transparencyMode = .dualLayer
      m.isDoubleSided = true
      m.writesToDepthBuffer = false
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
    if let deja = Self.texturesDesMeubles[cle] { return deja }
    let cote: CGFloat = code == 1 ? 512 : 256
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    // Huit bits par composante : sur un écran P3, le format « automatique »
    // en prenait seize, pour un fil de bois qui n'en a pas besoin.
    format.preferredRange = .standard
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
    Self.texturesDesMeubles[cle] = image
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
    format.preferredRange = .standard
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
  private func geometrie(_ source: [Float], deuxFaces: Bool) -> SCNGeometry? {
    let v = source
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
      // Sans petit tableau par triangle : des dizaines de milliers
      // d'allocations de moins à l'ouverture de la visite.
      sommets.append(p0)
      sommets.append(p1)
      sommets.append(p2)
      normales.append(nrm)
      normales.append(nrm)
      normales.append(nrm)
      let r = v[b + 9], g = v[b + 10], bl = v[b + 11]
      for _ in 0..<3 {
        couleurs.append(r)
        couleurs.append(g)
        couleurs.append(bl)
        couleurs.append(1)
      }
      let i = Int32(t * 3)
      indices.append(i)
      indices.append(i + 1)
      indices.append(i + 2)
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
    // Dessinée une fois par matière et par teinte, pour toutes les vues.
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    teinte.getRed(&r, green: &g, blue: &b, alpha: &a)
    let cle = "\(matiere)-\(Int(r * 255))-\(Int(g * 255))-\(Int(b * 255))"
    if let deja = Self.imagesDesSols[cle] { return deja }
    let image = dessinerLeSol(matiere, teinte)
    if let image = image { Self.imagesDesSols[cle] = image }
    return image
  }

  private func dessinerLeSol(_ matiere: Int, _ teinte: UIColor) -> UIImage? {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.preferredRange = .standard
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
    let v = fSols
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

  /// Les lampes de la visite : allumées ou non, et lesquelles ont leur lumière.
  @objc func lampes(_ cle: String, valeurs: [NSNumber]) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserLampes(valeurs)
      } else {
        RoomScanVisite.attendre(cle, lampes: valeurs)
      }
    }
  }
}

@objc(RoomScanVisiteManager)
final class RoomScanVisiteManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { RoomScanVisite() }
}
