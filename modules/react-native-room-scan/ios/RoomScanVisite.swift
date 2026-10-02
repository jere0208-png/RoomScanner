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
 */
@objc(RoomScanVisite)
final class RoomScanVisite: UIView {
  private let vue = SCNView(frame: .zero)
  private let scene = SCNScene()
  private let oeil = SCNNode()
  /// Le bâti : remplacé d'un bloc quand la scène change, jamais retouché.
  private let bati = SCNNode()

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
    let ambiante = SCNLight()
    ambiante.type = .ambient
    ambiante.intensity = 620
    ambiante.color = UIColor.white
    let noeudAmbiant = SCNNode()
    noeudAmbiant.light = ambiante
    scene.rootNode.addChildNode(noeudAmbiant)

    let jour = SCNLight()
    jour.type = .directional
    jour.intensity = 420
    jour.castsShadow = false
    let noeudJour = SCNNode()
    noeudJour.light = jour
    noeudJour.eulerAngles = SCNVector3(x: -Float.pi / 2.6, y: Float.pi / 5, z: 0)
    scene.rootNode.addChildNode(noeudJour)

    let contre = SCNLight()
    contre.type = .directional
    contre.intensity = 200
    contre.castsShadow = false
    let noeudContre = SCNNode()
    noeudContre.light = contre
    noeudContre.eulerAngles = SCNVector3(x: -Float.pi / 3.5, y: Float.pi / 5 + Float.pi, z: 0)
    scene.rootNode.addChildNode(noeudContre)

    scene.rootNode.addChildNode(bati)
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

  // --------------------------------------------------------------- bâti

  private func rebatir() {
    for enfant in bati.childNodes { enfant.removeFromParentNode() }
    if let g = geometrieDuBati() {
      bati.addChildNode(SCNNode(geometry: g))
    }
    for n in noeudsDesSols() { bati.addChildNode(n) }
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
   * TOUT LE BÂTI EN UNE GÉOMÉTRIE : une couleur par sommet, une normale par
   * triangle. Une seule pièce de géométrie, c'est un seul appel de dessin
   * — c'est ce qui fait que six cents faces ne coûtent rien.
   */
  private func geometrieDuBati() -> SCNGeometry? {
    let v = maillage.map { $0.floatValue }
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
    // Les deux côtés : une face dont le sens de parcours s'est trompé reste
    // un mur, pas un trou.
    m.isDoubleSided = true
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
@objc(RoomScanVisiteManager)
final class RoomScanVisiteManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { RoomScanVisite() }
}
