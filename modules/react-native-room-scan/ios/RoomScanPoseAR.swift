import Foundation
import ARKit
import RoomPlan
import SceneKit
import UIKit

/**
 LES APPAREILS EN 3D PENDANT LE SCAN — la vraie prise, sur le vrai mur.

 Relevé du patron : « revois complètement l'interface du scan pour le
 placement des produits électriques, intègre directement les éléments en
 3D ». Le scan posait une étiquette « PC », « INT » ou « LUM » sur le mur
 visé : on savait qu'on avait appuyé, pas ce qu'on aurait au mur. Il pose
 maintenant le MODÈLE du produit — la plaque, le puits et la broche de la
 prise, la bascule de l'interrupteur, l'applique —, aux cotes du catalogue,
 plaqué au mur et tourné vers la pièce. Et AVANT d'appuyer, le produit
 choisi flotte en transparence là où il se posera : à l'abscisse visée, à la
 cote du métier (25 cm pour une prise de plinthe, 1,10 m pour un
 interrupteur). Ce qu'on voit est ce qu'on pose.

 POURQUOI UNE `SCNView` ET PAS UNE `ARSCNView`. La première tentative de
 repères en 3D — une `ARSCNView` transparente partageant la session — avait
 pris le rendu à RoomPlan : écran noir, « on ne voit plus du tout ce qu'on
 scanne ». Une session ARKit ne se rend qu'une fois, et c'est RoomPlan qui
 la rend. Cette vue-ci n'a PAS de session : c'est une scène SceneKit
 ordinaire, au fond transparent, dont la caméra est recopiée à chaque image
 sur celle d'ARKit (`viewMatrix` et `projectionMatrix` pour l'orientation et
 la taille de l'écran). Elle ne fait que LIRE `currentFrame` — exactement ce
 que faisait la couche d'étiquettes, qui marchait.

 Les modèles viennent du JavaScript, fabriqués par la même fabrique que la
 maquette (`appareils3d`), une fois au début du scan (`definirModeles`) :
 une prise du scan est la prise du plan.
 */
@available(iOS 16.0, *)
private final class RelaisPose {
  weak var cible: ScenePoseAR?
  init(cible: ScenePoseAR) { self.cible = cible }
  @objc func battre() { cible?.viserMaintenant() }
}

@available(iOS 16.0, *)
final class ScenePoseAR: UIView, SCNSceneRendererDelegate {

  /// La session à LIRE. On ne l'exécute pas, on ne la met jamais en pause.
  weak var session: ARSession?
  /// Celui qui sait ce que vise le centre de l'écran (les murs relevés).
  weak var manager: RoomScanManager?

  private let vue = SCNView(frame: .zero, options: nil)
  private let scene = SCNScene()
  private let camera = SCNNode()
  private let ambiance = SCNNode()
  private var prototypes: [String: SCNNode] = [:]
  private var poses: [SCNNode] = []
  private var fantome: SCNNode?
  private var kindChoisi: String?
  private var horloge: CADisplayLink?
  /// Le scan est figé (pause, assemblage) : plus rien ne se rend.
  private var suspendue = false
  /// Lus sur le fil de rendu : recopiés depuis le fil principal.
  private var orientation: UIInterfaceOrientation = .portrait
  private var taille: CGSize = .zero
  private let verrou = NSLock()
  /// Le dernier état annoncé au JavaScript : on ne redit pas le même.
  private var derniereAnnonce: (ok: Bool, plafond: Bool, cm: Int)?
  private var derniereAnnonceA = Date.distantPast

  override init(frame: CGRect) {
    super.init(frame: frame)
    monter()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    monter()
  }

  deinit { horloge?.invalidate() }

  private func monter() {
    backgroundColor = .clear
    isUserInteractionEnabled = false
    vue.frame = bounds
    vue.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    vue.backgroundColor = .clear
    vue.isOpaque = false
    vue.isUserInteractionEnabled = false
    // 2× suffit à des appareils de quelques centimètres vus de près, et
    // laisse au scan la carte graphique qu'il réclame.
    vue.antialiasingMode = .multisampling2X
    vue.preferredFramesPerSecond = 60
    // Deux pixels par point : des appareils de quelques centimètres n'en
    // demandent pas trois, et la caméra du scan passe dessous.
    vue.contentScaleFactor = min(2, UIScreen.main.scale)
    vue.autoenablesDefaultLighting = false
    vue.scene = scene
    vue.delegate = self
    scene.background.contents = UIColor.clear
    /*
      UN CIEL DOUX POUR LES MATIÈRES : un dégradé clair en haut, gris en
      bas. Les matériaux physiques en tirent leurs reflets ; sans lui, un
      chrome est noir et une plaque blanche grise.
    */
    scene.lightingEnvironment.contents = Self.ciel()
    scene.lightingEnvironment.intensity = 1.2

    let cam = SCNCamera()
    cam.zNear = 0.005
    cam.zFar = 60
    camera.camera = cam
    scene.rootNode.addChildNode(camera)
    vue.pointOfView = camera
    // Une lumière qui suit l'œil, venue d'un peu au-dessus : l'appareil se
    // lit toujours, de quelque côté qu'on le regarde.
    let soleil = SCNNode()
    soleil.light = SCNLight()
    soleil.light?.type = .directional
    soleil.light?.intensity = 650
    soleil.eulerAngles = SCNVector3(x: -0.55, y: 0.25, z: 0)
    camera.addChildNode(soleil)
    ambiance.light = SCNLight()
    ambiance.light?.type = .ambient
    ambiance.light?.intensity = 420
    scene.rootNode.addChildNode(ambiance)
    vue.rendersContinuously = false
    addSubview(vue)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let o = window?.windowScene?.interfaceOrientation ?? .portrait
    verrou.lock()
    taille = bounds.size
    orientation = o
    verrou.unlock()
  }

  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      horloge?.invalidate()
      horloge = nil
    } else {
      relancerHorloge()
    }
  }

  // MARK: - Les modèles

  /**
   LES MODÈLES DU CATALOGUE, un par produit — le même flux que les meubles
   de la maquette : `[code, r, g, b, rugosité, métal, nSommets, nIndices]`
   puis les sommets (x, y, z, nx, ny, nz, u, v) et les indices. En mètres,
   dans le repère de l'appareil : `x` vers la droite face au mur, `y` vers le
   haut, `z` sortant du mur — l'origine au nu du mur ; au plafond, l'origine
   au nu du plafond et l'appareil pend vers le bas.
   */
  func definirModeles(_ modeles: [String: [Float]]) {
    var protos: [String: SCNNode] = [:]
    for (kind, flux) in modeles {
      let noeud = SCNNode()
      for g in Self.groupes(flux) { noeud.addChildNode(g) }
      protos[kind] = noeud
    }
    prototypes = protos
    // Le fantôme se refabrique avec son nouveau modèle.
    let k = kindChoisi
    kindChoisi = nil
    choisir(k)
  }

  private static func groupes(_ v: [Float]) -> [SCNNode] {
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
      sommets.reserveCapacity(nS)
      normales.reserveCapacity(nS)
      for s in 0..<nS {
        let b = k + s * 8
        sommets.append(SCNVector3(x: v[b], y: v[b + 1], z: v[b + 2]))
        normales.append(SCNVector3(x: v[b + 3], y: v[b + 4], z: v[b + 5]))
      }
      k += nS * 8
      var indices: [UInt32] = []
      indices.reserveCapacity(nI)
      let dernier = Float(nS - 1)
      for j in 0..<nI {
        indices.append(UInt32(max(0, min(dernier, v[k + j]))))
      }
      k += nI
      let g = SCNGeometry(
        sources: [SCNGeometrySource(vertices: sommets), SCNGeometrySource(normals: normales)],
        elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
      g.materials = [materiau(code, teinte, rugosite, metal)]
      let n = SCNNode(geometry: g)
      if code == 3 { n.renderingOrder = 6 }
      out.append(n)
    }
    return out
  }

  private static func materiau(
    _ code: Int, _ teinte: UIColor, _ rugosite: CGFloat, _ metal: CGFloat
  ) -> SCNMaterial {
    let m = SCNMaterial()
    m.diffuse.contents = teinte
    m.isDoubleSided = false
    m.cullMode = .back
    switch code {
    case 5:
      // Ce qui éclaire se peint de sa propre teinte, sans ombre.
      m.lightingModel = .constant
    case 3:
      m.lightingModel = .physicallyBased
      m.roughness.contents = NSNumber(value: 0.08)
      m.metalness.contents = NSNumber(value: 0)
      m.transparency = 0.35
      m.transparencyMode = .dualLayer
      m.isDoubleSided = true
      m.writesToDepthBuffer = false
    default:
      m.lightingModel = .physicallyBased
      m.roughness.contents = NSNumber(value: Float(max(0.08, rugosite)))
      // Sans environnement réel, un métal pur serait noir : on le tempère.
      m.metalness.contents = NSNumber(value: Float(min(0.6, metal)))
    }
    return m
  }

  /// Le ciel des reflets : un dégradé vertical, clair en haut.
  private static func ciel() -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: CGSize(width: 64, height: 32), format: format).image { ctx in
      let couleurs = [
        UIColor(white: 1.0, alpha: 1).cgColor,
        UIColor(white: 0.82, alpha: 1).cgColor,
        UIColor(white: 0.45, alpha: 1).cgColor,
      ] as CFArray
      if let degrade = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: couleurs, locations: [0, 0.5, 1])
      {
        ctx.cgContext.drawLinearGradient(
          degrade, start: .zero, end: CGPoint(x: 0, y: 32), options: [])
      }
    }
  }

  // MARK: - Ce qu'on pose

  /// Le produit choisi : il flotte, transparent, là où il se poserait.
  func choisir(_ kind: String?) {
    if kind == kindChoisi && (kind == nil || fantome != nil) { return }
    kindChoisi = kind
    fantome?.removeFromParentNode()
    fantome = nil
    derniereAnnonce = nil
    if let kind = kind, let proto = prototypes[kind] {
      let f = proto.clone()
      f.opacity = 0.6
      f.isHidden = true
      f.runAction(.repeatForever(.sequence([
        .fadeOpacity(to: 0.38, duration: 0.55),
        .fadeOpacity(to: 0.7, duration: 0.55),
      ])))
      scene.rootNode.addChildNode(f)
      fantome = f
    }
    relancerHorloge()
    rendreSiBesoin()
  }

  /// Le produit posé : il arrive d'un léger rebond, et ne bouge plus.
  func poser(kind: String, monde: simd_float4x4) {
    guard let proto = prototypes[kind] else { return }
    let n = proto.clone()
    n.simdTransform = monde
    n.opacity = 0
    n.simdScale = SIMD3<Float>(repeating: 1.3)
    n.runAction(.group([
      .fadeIn(duration: 0.14),
      .scale(to: 1, duration: 0.22),
    ]))
    scene.rootNode.addChildNode(n)
    poses.append(n)
    rendreSiBesoin()
  }

  func retirerDernier() {
    guard let dernier = poses.popLast() else { return }
    dernier.removeFromParentNode()
    rendreSiBesoin()
  }

  func vider() {
    for p in poses { p.removeFromParentNode() }
    poses.removeAll()
    rendreSiBesoin()
  }

  /// Rien à montrer : rien à rendre. La batterie du scan est déjà assez sollicitée.
  private func rendreSiBesoin() {
    vue.rendersContinuously = !suspendue && (!poses.isEmpty || fantome != nil)
  }

  /**
   LE SCAN SE FIGE, LA SCÈNE AUSSI. En pause comme pendant l'assemblage de
   RoomPlan, cette couche continuait de se rendre soixante fois par seconde
   par-dessus une image arrêtée — et l'assemblage est justement le moment où
   la carte graphique a le plus à faire.
   */
  func suspendre(_ oui: Bool) {
    suspendue = oui
    vue.isPlaying = !oui
    if oui {
      horloge?.invalidate()
      horloge = nil
    } else {
      relancerHorloge()
    }
    rendreSiBesoin()
  }

  private func relancerHorloge() {
    horloge?.invalidate()
    horloge = nil
    guard window != nil, kindChoisi != nil, !suspendue else { return }
    let h = CADisplayLink(target: RelaisPose(cible: self), selector: #selector(RelaisPose.battre))
    // Vingt visées par seconde : le fantôme suit la main sans courir après
    // chaque image.
    h.preferredFramesPerSecond = 20
    h.add(to: .main, forMode: .common)
    horloge = h
  }

  /// Le fantôme suit le viseur, et le JavaScript apprend ce qu'on vise.
  func viserMaintenant() {
    guard let kind = kindChoisi, let manager = manager else { return }
    let visee = manager.viser(kind: kind)
    if let f = fantome {
      if let v = visee {
        f.simdTransform = v.monde
        f.isHidden = false
      } else {
        f.isHidden = true
      }
    }
    let etat = (
      ok: visee != nil,
      plafond: visee?.plafond ?? false,
      cm: Int(((visee?.hauteur ?? 0) * 100).rounded())
    )
    if let d = derniereAnnonce, d.ok == etat.ok, d.plafond == etat.plafond, d.cm == etat.cm {
      return
    }
    guard Date().timeIntervalSince(derniereAnnonceA) > 0.1 else { return }
    derniereAnnonce = etat
    derniereAnnonceA = Date()
    RoomScanEvents.shared?.emit(name: "onVisee", body: [
      "kind": kind,
      "ok": etat.ok,
      "plafond": etat.plafond,
      "hauteur": visee?.hauteur ?? 0,
    ])
  }

  // MARK: - La caméra suit celle d'ARKit

  func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
    guard let frame = session?.currentFrame else { return }
    verrou.lock()
    let o = orientation
    let t = taille
    verrou.unlock()
    guard t.width > 1, t.height > 1 else { return }
    camera.simdTransform = frame.camera.viewMatrix(for: o).inverse
    camera.camera?.projectionTransform = SCNMatrix4(
      frame.camera.projectionMatrix(for: o, viewportSize: t, zNear: 0.005, zFar: 60))
    // La lumière de la pièce, telle qu'ARKit l'estime : une prise posée dans
    // un couloir sombre ne brille pas comme en plein jour.
    if let e = frame.lightEstimate {
      ambiance.light?.intensity = max(180, min(900, e.ambientIntensity * 0.45))
    }
  }
}

/**
 CE QUE VISE LE CENTRE DE L'ÉCRAN, à l'instant — et où le produit se poserait.

 `monde` est la pose du modèle : `x` le long du mur vers la droite, `y`
 vertical, `z` la normale du mur tournée vers la pièce (au plafond, les axes
 du monde). `hauteur` est la cote AIMANTÉE au-dessus du pied du mur — celle
 du métier, pas celle du doigt.
 */
@available(iOS 16.0, *)
struct Visee {
  let monde: simd_float4x4
  let point: SIMD3<Float>
  let mur: CapturedRoom.Surface?
  let along: Float
  let hauteur: Float
  let plafond: Bool
}

/**
 LES RÈGLES DE POSE, telles que le JavaScript les tient (`viseur.ts`) :
 paliers de hauteur par appareil, cote unique des autres, portée de
 l'aimant, et ce qui va au plafond. Elles arrivent avec les modèles
 (`configurerPose`) : le fantôme se pose là où l'ancrage du plan posera.
 */
struct ReglagesPose {
  var paliers: [String: [Float]] = [:]
  var std: [String: Float] = [:]
  var portee: Float = 0.45
  /// Ce qui PEUT aller au plafond.
  var plafond: Set<String> = ["dcl", "spot"]
  /// Ce qui ne va QUE là.
  var plafondSeul: Set<String> = ["spot"]
  /// Ce que devient au mur ce qu'on vise au plafond : un point lumineux y est une applique.
  var auMur: [String: String] = ["dcl": "applique"]

  /// La cote du métier : le palier le plus proche, s'il est à portée ; la cote unique sinon.
  func aimanter(_ kind: String, _ vise: Float) -> Float {
    if let p = paliers[kind], !p.isEmpty {
      var meilleur = p[0]
      for h in p where abs(h - vise) < abs(meilleur - vise) { meilleur = h }
      return abs(meilleur - vise) > portee ? vise : meilleur
    }
    return std[kind] ?? vise
  }

  init() {}

  init(_ d: [String: Any]) {
    if let p = d["paliers"] as? [String: [NSNumber]] {
      paliers = p.mapValues { $0.map { $0.floatValue } }
    }
    if let s = d["std"] as? [String: NSNumber] {
      std = s.mapValues { $0.floatValue }
    }
    if let r = d["portee"] as? NSNumber { portee = r.floatValue }
    if let p = d["plafond"] as? [String] { plafond = Set(p) }
    if let p = d["plafondSeul"] as? [String] { plafondSeul = Set(p) }
    if let m = d["auMur"] as? [String: String] { auMur = m }
  }
}
