import ARKit
import Foundation
import RoomPlan
import UIKit
import simd

/**
 LES ORTHOPHOTOS DU RELEVÉ — chaque face de mur et le sol, en vraie image.

 Relevé du patron : « améliore considérablement la récupération des textures
 et couleurs des sols et murs scannés ; on veut une reproduction à
 l'identique, sur le modèle 3D, de ce que l'on scanne ».

 Le relevé des couleurs (`RoomColorSampler`) rend six cases sur quatre par
 mur et une case de quarante centimètres au sol : de quoi teinter, pas de
 quoi reconnaître un parquet, un carrelage, un papier peint. On fabrique ici,
 pendant le scan, une IMAGE de chaque face de mur — vue de face, à deux
 centimètres le pixel — et une image du sol vue d'en haut, à deux centimètres
 et demi :

 - chaque pixel de la face est un point du monde ; on le projette dans
   l'image de la caméra, et l'on y lit sa couleur ;
 - LA PROFONDEUR LIDAR DÉCIDE : un point que la caméra ne voit pas (un canapé
   devant le mur, un meuble sur le sol) n'est pas lu — la photo ne garde pas
   le mobilier plaqué contre la cloison ;
 - LES VUES SE FONDENT, chacune pesée par sa qualité (de face et de près
   pèse plus que de biais et de loin) : le grain de chaque image s'efface, la
   matière reste ;
 - ce qu'aucune vue n'a atteint est comblé, à la livraison, par ses voisins.

 Chaque face est rendue telle qu'on la voit DEPUIS SON CÔTÉ : la gauche de
 l'image est la gauche de celui qui regarde le mur.
 */
@available(iOS 16.0, *)
final class OrthophotosDuReleve {
  static let shared = OrthophotosDuReleve()

  private let queue = DispatchQueue(label: "com.roomscan.ortho", qos: .utility)
  private var timer: DispatchSourceTimer?
  private weak var session: ARSession?
  private var room: CapturedRoom?
  private var dernierePose: (position: SIMD3<Float>, visee: SIMD3<Float>)?

  /// Trois regards par seconde : assez pour tout couvrir en marchant.
  private static let rate = 3.0
  /// Deux centimètres le pixel sur les murs, deux et demi au sol.
  private static let pasMur: Float = 0.02
  private static let pasSol: Float = 0.025
  /// Au plus 512 × 256 pixels par face, 800 × 800 au sol.
  private static let maxMurL = 512
  private static let maxMurH = 256
  private static let maxSol = 800

  /// La face d'un mur, vue d'un côté, et la géométrie qui la porte.
  private struct Face {
    var toile: Toile
    var wallId: UUID
    var cote: Int
    var longueur: Float
    var hauteur: Float
    var transform: simd_float4x4
  }

  private var faces: [String: Face] = [:]
  private var sol: (toile: Toile, minX: Float, minZ: Float, pas: Float, y: Float)?

  // MARK: - Cycle de vie

  func attach(to session: ARSession) {
    queue.async {
      self.session = session
      guard self.timer == nil else { return }
      let t = DispatchSource.makeTimerSource(queue: self.queue)
      t.schedule(deadline: .now() + 0.6, repeating: 1.0 / Self.rate)
      t.setEventHandler { [weak self] in self?.tick() }
      t.resume()
      self.timer = t
    }
  }

  func detach() {
    queue.async {
      self.timer?.cancel()
      self.timer = nil
      self.session = nil
    }
  }

  func reset() {
    queue.async {
      self.faces.removeAll()
      self.sol = nil
      self.room = nil
      self.dernierePose = nil
    }
  }

  func update(room: CapturedRoom) {
    queue.async { self.room = room }
  }

  // MARK: - Relevé

  private func tick() {
    guard let session = session, let room = room,
          let frame = session.currentFrame else { return }
    guard case .normal = frame.camera.trackingState else { return }
    let m = frame.camera.transform
    let oeil = SIMD3<Float>(m.columns.3.x, m.columns.3.y, m.columns.3.z)
    let visee = SIMD3<Float>(m.columns.2.x, m.columns.2.y, m.columns.2.z)
    // Immobile, la caméra ne voit rien de neuf.
    if let p = dernierePose, simd_distance(p.position, oeil) < 0.03, simd_dot(p.visee, visee) > 0.9995 {
      return
    }
    dernierePose = (oeil, visee)
    guard let vue = VueDeCamera(frame: frame) else { return }
    defer { vue.liberer() }

    for mur in room.walls {
      projeterLeMur(mur, vue: vue, oeil: oeil)
    }
    projeterLeSol(room, vue: vue, oeil: oeil)
  }

  private func projeterLeMur(_ mur: CapturedRoom.Surface, vue: VueDeCamera, oeil: SIMD3<Float>) {
    let L = mur.dimensions.x
    let H = mur.dimensions.y
    guard L > 0.2, H > 0.2 else { return }
    let t = mur.transform
    let centre = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let axe = simd_normalize(SIMD3<Float>(t.columns.0.x, t.columns.0.y, t.columns.0.z))
    let haut = simd_normalize(SIMD3<Float>(t.columns.1.x, t.columns.1.y, t.columns.1.z))
    let normale = simd_normalize(SIMD3<Float>(t.columns.2.x, t.columns.2.y, t.columns.2.z))
    let versOeil = oeil - centre
    let cote = simd_dot(normale, versOeil) >= 0 ? 1 : -1
    let distance = simd_length(versOeil)
    // De face et de près : au-delà de six mètres, ou presque de champ, rien.
    let incidence = abs(simd_dot(normale, versOeil / max(distance, 0.01)))
    guard distance < 6, incidence > 0.3 else { return }

    let cle = "\(mur.identifier.uuidString)|\(cote)"
    let w = min(Self.maxMurL, max(8, Int((L / Self.pasMur).rounded(.up))))
    let h = min(Self.maxMurH, max(8, Int((H / Self.pasMur).rounded(.up))))
    var face: Face
    if var f = faces.removeValue(forKey: cle), abs(f.longueur - L) < 0.1, abs(f.hauteur - H) < 0.1, f.toile.w == w, f.toile.h == h {
      f.transform = t
      face = f
    } else {
      // Un mur que RoomPlan a redimensionné repart d'une toile neuve.
      face = Face(toile: Toile(w: w, h: h), wallId: mur.identifier, cote: cote, longueur: L, hauteur: H, transform: t)
    }
    /*
      LE PIXEL (i, j) DE LA FACE, DANS LE MONDE — puis dans la caméra. Le
      monde est affine dans les deux indices : on calcule l'origine et les
      deux pas une fois, chaque pixel n'est plus que deux additions.
      Vue de son côté, la gauche de l'image est la gauche de celui qui
      regarde : du côté +z du mur, l'axe x va vers la droite ; de l'autre,
      vers la gauche.
    */
    let sens = Float(cote)
    let du = axe * (sens * L / Float(w))
    let dv = -haut * (H / Float(h))
    let origine = centre + axe * (-sens * L / 2) + haut * (H / 2) + du * 0.5 + dv * 0.5
    let poids = incidence * incidence / max(distance * distance, 0.25)
    vue.projeter(toile: &face.toile, origine: origine, du: du, dv: dv, poids: poids)
    faces[cle] = face
  }

  private func projeterLeSol(_ room: CapturedRoom, vue: VueDeCamera, oeil: SIMD3<Float>) {
    // Les bornes du sol : l'emprise des murs, et une marge.
    guard !room.walls.isEmpty else { return }
    var y = Float.greatestFiniteMagnitude
    var minX = Float.greatestFiniteMagnitude, maxX = -Float.greatestFiniteMagnitude
    var minZ = Float.greatestFiniteMagnitude, maxZ = -Float.greatestFiniteMagnitude
    for mur in room.walls {
      let t = mur.transform
      let c = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
      y = min(y, c.y - mur.dimensions.y / 2)
      let axe = SIMD3<Float>(t.columns.0.x, t.columns.0.y, t.columns.0.z)
      let demi = mur.dimensions.x / 2
      for s in [Float(-1), 1] {
        minX = min(minX, c.x + axe.x * demi * s)
        maxX = max(maxX, c.x + axe.x * demi * s)
        minZ = min(minZ, c.z + axe.z * demi * s)
        maxZ = max(maxZ, c.z + axe.z * demi * s)
      }
    }
    guard y.isFinite, maxX > minX, maxZ > minZ, maxX - minX < 40, maxZ - minZ < 40 else { return }
    minX -= 0.3; minZ -= 0.3; maxX += 0.3; maxZ += 0.3
    let pas = max(Self.pasSol, max(maxX - minX, maxZ - minZ) / Float(Self.maxSol))
    var etat = sol
    sol = nil
    let couvre = etat.map { s in
      abs(s.pas - pas) < 0.0001 && s.minX <= minX && s.minZ <= minZ
        && s.minX + Float(s.toile.w) * s.pas >= maxX && s.minZ + Float(s.toile.h) * s.pas >= maxZ
        && abs(s.y - y) < 0.05
    } ?? false
    if !couvre {
      // Le sol s'agrandit à mesure que les murs se découvrent : on garde ce
      // qu'on avait, recopié à sa place dans la toile plus grande.
      let x0 = min(minX, etat?.minX ?? minX) - 0.5
      let z0 = min(minZ, etat?.minZ ?? minZ) - 0.5
      let x1 = max(maxX, (etat.map { $0.minX + Float($0.toile.w) * $0.pas }) ?? maxX) + 0.5
      let z1 = max(maxZ, (etat.map { $0.minZ + Float($0.toile.h) * $0.pas }) ?? maxZ) + 0.5
      let p = max(Self.pasSol, max(x1 - x0, z1 - z0) / Float(Self.maxSol))
      var neuve = Toile(w: min(Self.maxSol, Int(((x1 - x0) / p).rounded(.up))), h: min(Self.maxSol, Int(((z1 - z0) / p).rounded(.up))))
      if let ancien = etat, abs(ancien.pas - p) < 0.0001 {
        let di = Int(((ancien.minX - x0) / p).rounded())
        let dj = Int(((ancien.minZ - z0) / p).rounded())
        for j in 0..<ancien.toile.h {
          let jj = j + dj
          guard jj >= 0, jj < neuve.h else { continue }
          for i in 0..<ancien.toile.w {
            let ii = i + di
            guard ii >= 0, ii < neuve.w else { continue }
            neuve.somme[jj * neuve.w + ii] = ancien.toile.somme[j * ancien.toile.w + i]
          }
        }
      }
      etat = (neuve, x0, z0, p, y)
    }
    guard var s = etat else { return }
    let distance = abs(oeil.y - s.y)
    guard distance < 4 else { sol = s; return }
    // Vu d'en haut : la ligne j suit z, la colonne i suit x.
    let du = SIMD3<Float>(s.pas, 0, 0)
    let dv = SIMD3<Float>(0, 0, s.pas)
    let origine = SIMD3<Float>(s.minX + s.pas / 2, s.y, s.minZ + s.pas / 2)
    etat = nil
    vue.projeter(toile: &s.toile, origine: origine, du: du, dv: dv, poids: 1 / max(distance * distance, 0.25), normale: SIMD3<Float>(0, 1, 0))
    sol = s
  }

  // MARK: - Livraison

  /**
   Les orthophotos, écrites dans les Documents. Un pixel jamais vu prend la
   couleur de ses voisins vus (quelques passes de dilatation), puis celle de
   sa face ; une face presque pas vue n'est pas livrée — la teinte relevée
   suffit alors.
   */
  func livrer() -> [String: Any] {
    queue.sync { () -> [String: Any] in
      let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      var murs: [[String: Any]] = []
      for f in faces.values {
        let vus = f.toile.somme.reduce(0) { $0 + ($1.w > 0 ? 1 : 0) }
        let couverture = Float(vus) / Float(max(1, f.toile.w * f.toile.h))
        guard couverture >= 0.12, let jpeg = Self.jpeg(f.toile) else { continue }
        let url = docs.appendingPathComponent("ortho-mur-\(UUID().uuidString).jpg")
        guard (try? jpeg.write(to: url, options: .atomic)) != nil else { continue }
        let t = f.transform
        murs.append([
          "wallId": f.wallId.uuidString,
          "cote": f.cote,
          "path": url.path,
          "cx": t.columns.3.x,
          "cz": t.columns.3.z,
          "dx": t.columns.0.x,
          "dz": t.columns.0.z,
          "longueur": f.longueur,
          "hauteur": f.hauteur,
          "yBas": t.columns.3.y - f.hauteur / 2,
          "couverture": couverture,
        ])
      }
      var sortie: [String: Any] = ["murs": murs]
      if let s = sol {
        let vus = s.toile.somme.reduce(0) { $0 + ($1.w > 0 ? 1 : 0) }
        let couverture = Float(vus) / Float(max(1, s.toile.w * s.toile.h))
        if couverture >= 0.05, let jpeg = Self.jpeg(s.toile) {
          let url = docs.appendingPathComponent("ortho-sol-\(UUID().uuidString).jpg")
          if (try? jpeg.write(to: url, options: .atomic)) != nil {
            sortie["sol"] = [
              "path": url.path,
              "minX": s.minX,
              "minZ": s.minZ,
              "maxX": s.minX + Float(s.toile.w) * s.pas,
              "maxZ": s.minZ + Float(s.toile.h) * s.pas,
              "y": s.y,
              "couverture": couverture,
            ]
          }
        }
      }
      return sortie
    }
  }

  /// La toile en JPEG : moyenne pondérée, trous comblés, sRGB.
  private static func jpeg(_ toile: Toile) -> Data? {
    let w = toile.w
    let h = toile.h
    var rgb = [SIMD3<Float>](repeating: SIMD3<Float>(-1, -1, -1), count: w * h)
    var somme = SIMD3<Float>(0, 0, 0)
    var n: Float = 0
    for k in 0..<(w * h) {
      let s = toile.somme[k]
      if s.w > 0 {
        let c = SIMD3<Float>(s.x, s.y, s.z) / s.w
        rgb[k] = c
        somme += c
        n += 1
      }
    }
    guard n > 0 else { return nil }
    let moyenne = somme / n
    /*
      LES TROUS SE COMBLENT PAR LEURS VOISINS — vingt passes : chaque pixel
      inconnu prend la moyenne de ses voisins connus. Un trou de quarante
      centimètres se referme sans laisser de tache grise ; au-delà, la
      couleur moyenne de la face.
    */
    for _ in 0..<20 {
      var change = false
      var suivant = rgb
      for j in 0..<h {
        for i in 0..<w {
          let k = j * w + i
          guard rgb[k].x < 0 else { continue }
          var acc = SIMD3<Float>(0, 0, 0)
          var c: Float = 0
          if i > 0, rgb[k - 1].x >= 0 { acc += rgb[k - 1]; c += 1 }
          if i < w - 1, rgb[k + 1].x >= 0 { acc += rgb[k + 1]; c += 1 }
          if j > 0, rgb[k - w].x >= 0 { acc += rgb[k - w]; c += 1 }
          if j < h - 1, rgb[k + w].x >= 0 { acc += rgb[k + w]; c += 1 }
          if c > 0 { suivant[k] = acc / c; change = true }
        }
      }
      rgb = suivant
      if !change { break }
    }
    var octets = [UInt8](repeating: 255, count: w * h * 4)
    for k in 0..<(w * h) {
      let c = rgb[k].x >= 0 ? rgb[k] : moyenne
      octets[k * 4] = UInt8(max(0, min(255, c.x)))
      octets[k * 4 + 1] = UInt8(max(0, min(255, c.y)))
      octets[k * 4 + 2] = UInt8(max(0, min(255, c.z)))
      octets[k * 4 + 3] = 255
    }
    guard let espace = CGColorSpace(name: CGColorSpace.sRGB),
          let fournisseur = CGDataProvider(data: Data(octets) as CFData),
          let image = CGImage(
            width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
            space: espace, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
            provider: fournisseur, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    else { return nil }
    return UIImage(cgImage: image).jpegData(compressionQuality: 0.82)
  }
}

/// Une toile : la somme pondérée des couleurs vues, pixel par pixel.
fileprivate struct Toile {
  let w: Int
  let h: Int
  var somme: [SIMD4<Float>]
  init(w: Int, h: Int) {
    self.w = w
    self.h = h
    somme = [SIMD4<Float>](repeating: SIMD4<Float>(0, 0, 0, 0), count: w * h)
  }
}

/**
 UNE IMAGE DE LA CAMÉRA, PRÊTE À ÊTRE LUE — son image, sa profondeur LiDAR,
 et de quoi y projeter un point du monde.
 */
@available(iOS 16.0, *)
private struct VueDeCamera {
  let image: CVPixelBuffer
  let profondeur: CVPixelBuffer
  let largeur: Int
  let hauteur: Int
  let oeil: SIMD3<Float>
  let inverse: simd_float4x4
  let fx: Float, fy: Float, cx: Float, cy: Float
  let pleineEchelle: Bool

  init?(frame: ARFrame) {
    let b = frame.capturedImage
    guard let d = frame.sceneDepth?.depthMap ?? frame.smoothedSceneDepth?.depthMap else { return nil }
    guard CVPixelBufferGetPlaneCount(b) >= 2 else { return nil }
    guard CVPixelBufferLockBaseAddress(b, .readOnly) == kCVReturnSuccess else { return nil }
    guard CVPixelBufferLockBaseAddress(d, .readOnly) == kCVReturnSuccess else {
      CVPixelBufferUnlockBaseAddress(b, .readOnly)
      return nil
    }
    image = b
    profondeur = d
    largeur = CVPixelBufferGetWidth(b)
    hauteur = CVPixelBufferGetHeight(b)
    pleineEchelle = CVPixelBufferGetPixelFormatType(b) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    let t = frame.camera.transform
    oeil = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    inverse = t.inverse
    let k = frame.camera.intrinsics
    fx = k.columns.0.x
    fy = k.columns.1.y
    cx = k.columns.2.x
    cy = k.columns.2.y
  }

  func liberer() {
    CVPixelBufferUnlockBaseAddress(image, .readOnly)
    CVPixelBufferUnlockBaseAddress(profondeur, .readOnly)
  }

  /**
   Projette une toile entière : le pixel (i, j) est au point du monde
   `origine + i·du + j·dv`. Ce que la caméra voit — devant elle, dans
   l'image, à la profondeur attendue à huit centimètres près — s'ajoute à la
   somme pondérée du pixel.
   */
  func projeter(
    toile: inout Toile, origine: SIMD3<Float>, du: SIMD3<Float>, dv: SIMD3<Float>,
    poids: Float, normale: SIMD3<Float>? = nil
  ) {
    // Dans le repère de la caméra, le monde reste affine.
    let o4 = inverse * SIMD4<Float>(origine.x, origine.y, origine.z, 1)
    let u4 = inverse * SIMD4<Float>(du.x, du.y, du.z, 0)
    let v4 = inverse * SIMD4<Float>(dv.x, dv.y, dv.z, 0)
    let o = SIMD3<Float>(o4.x, o4.y, o4.z)
    let pu = SIMD3<Float>(u4.x, u4.y, u4.z)
    let pv = SIMD3<Float>(v4.x, v4.y, v4.z)
    let dw = CVPixelBufferGetWidth(profondeur)
    let dh = CVPixelBufferGetHeight(profondeur)
    let dBase = CVPixelBufferGetBaseAddress(profondeur)!
    let dLigne = CVPixelBufferGetBytesPerRow(profondeur)
    let yBase = CVPixelBufferGetBaseAddressOfPlane(image, 0)!
    let yLigne = CVPixelBufferGetBytesPerRowOfPlane(image, 0)
    let cBase = CVPixelBufferGetBaseAddressOfPlane(image, 1)!
    let cLigne = CVPixelBufferGetBytesPerRowOfPlane(image, 1)
    let sx = Float(dw) / Float(largeur)
    let sy = Float(dh) / Float(hauteur)
    for j in 0..<toile.h {
      var p = o + pv * Float(j)
      for i in 0..<toile.w {
        defer { p += pu }
        // Repère ARKit : −z devant l'objectif.
        let z = -p.z
        guard z > 0.25, z < 6 else { continue }
        let u = fx * (p.x / z) + cx
        let v = fy * (-p.y / z) + cy
        guard u >= 2, v >= 2, u < Float(largeur - 3), v < Float(hauteur - 3) else { continue }
        // La profondeur : le point doit être CE que la caméra voit.
        let px = min(dw - 1, max(0, Int(u * sx)))
        let py = min(dh - 1, max(0, Int(v * sy)))
        let mesure = dBase.advanced(by: py * dLigne).assumingMemoryBound(to: Float32.self)[px]
        guard mesure > 0.05, abs(mesure - z) < 0.08 else { continue }
        var w = poids
        if let n = normale {
          // Au sol, l'incidence se juge au pixel : le regard rasant pèse peu.
          let monde = SIMD3<Float>(origine.x + du.x * Float(i) + dv.x * Float(j), origine.y, origine.z + du.z * Float(i) + dv.z * Float(j))
          let vers = simd_normalize(oeil - monde)
          let cosinus = abs(simd_dot(n, vers))
          guard cosinus > 0.3 else { continue }
          w *= cosinus * cosinus
        }
        // Y'CbCr → RGB, au pixel le plus proche.
        let ix = Int(u.rounded())
        let iy = Int(v.rounded())
        var yy = Float(yBase.advanced(by: iy * yLigne).assumingMemoryBound(to: UInt8.self)[ix])
        let cRang = cBase.advanced(by: (iy / 2) * cLigne).assumingMemoryBound(to: UInt8.self)
        let cb = Float(cRang[(ix / 2) * 2]) - 128
        let cr = Float(cRang[(ix / 2) * 2 + 1]) - 128
        if !pleineEchelle { yy = (yy - 16) * (255.0 / 219.0) }
        let r = yy + 1.402 * cr
        let g = yy - 0.344136 * cb - 0.714136 * cr
        let b = yy + 1.772 * cb
        toile.somme[j * toile.w + i] += SIMD4<Float>(r * w, g * w, b * w, w)
      }
    }
  }
}
