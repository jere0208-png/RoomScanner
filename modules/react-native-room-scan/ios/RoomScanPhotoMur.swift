import Foundation
import ARKit
import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import RoomPlan
import UIKit

/**
 CHAQUE MUR, PHOTOGRAPHIÉ DE FACE ET REDRESSÉ — pendant le scan, sans un geste.

 Relevé du patron : « trouve encore des améliorations natives, en essayant
 d'améliorer le scan en premier temps et ce qu'il détecte ; on ne veut pas
 surcharger l'app d'éléments, mais la rendre très qualitative ».

 L'établi savait déjà poser une photo DERRIÈRE l'élévation d'un mur — l'avant
 et l'après du chantier, la gaine qui sort, la boîte existante. Mais il
 fallait la prendre à la main, puis la caler au doigt : « une photo prise à
 main levée, de biais, ne mesure rien ; une photo mal redressée est pire
 qu'une photo brute ». C'était vrai d'une photo prise APRÈS le scan.

 PENDANT le scan, on sait tout ce qu'il faut pour la redresser juste : la
 pose exacte de la caméra (ARKit) et les quatre coins exacts du mur
 (RoomPlan). Le photographe regarde deux fois par seconde, pour chaque mur
 relevé, si l'image du moment le montre MIEUX que la meilleure gardée : assez
 de face, assez près, en entier ou presque, et qu'aucune cloison ne s'interpose.
 Si oui, il projette les quatre coins du mur dans l'image et la redresse
 (`CIPerspectiveCorrection`) au rapport exact du mur. À la fin, chaque mur a
 sa photo de face, à l'échelle, que le plan pose derrière son élévation — au
 centimètre, sans calage.

 Il ne fait que LIRE `currentFrame`, comme le releveur de couleurs : la
 capture de RoomPlan n'est pas perturbée. Et il ne travaille que quand l'œil a
 bougé, et ne redresse qu'une image par battement, celle qui améliore le plus.
 */
@available(iOS 16.0, *)
final class PhotographeDesMurs {

  static let shared = PhotographeDesMurs()

  private let queue = DispatchQueue(label: "com.roomscan.photomur")
  private var timer: DispatchSourceTimer?
  private weak var session: ARSession?
  private var room: CapturedRoom?
  private var dernierePose: (position: SIMD3<Float>, visee: SIMD3<Float>)?
  /*
    UN CONTEXTE DISCRET. Le redressement tourne pendant le scan, à côté de
    RoomPlan qui tient la carte graphique : basse priorité, et sans garder en
    mémoire les étapes intermédiaires d'images qu'on ne refera pas.
  */
  private let contexte = CIContext(options: [.cacheIntermediates: false, .priorityRequestLow: true])

  private struct Meilleure {
    var score: Float
    var jpeg: Data
    /// De quel côté du mur on se tenait : +1 du côté de son axe z, −1 de l'autre.
    var cote: Int
    var at: Date
  }
  private var meilleures: [UUID: Meilleure] = [:]

  /// Deux regards par seconde : un mur se photographie en passant devant.
  private static let rate = 2.0
  /// Ce qu'une photo doit gagner pour remplacer la précédente.
  private static let GAIN_MIN: Float = 0.05
  /// La largeur de la photo redressée, en pixels.
  private static let LARGEUR: CGFloat = 1280

  func attach(to session: ARSession) {
    queue.async {
      self.session = session
      guard self.timer == nil else { return }
      let t = DispatchSource.makeTimerSource(queue: self.queue)
      t.schedule(deadline: .now() + 1.0, repeating: 1.0 / Self.rate)
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

  /// Un relevé tout neuf repart sans photo.
  func reset() {
    queue.async {
      self.meilleures.removeAll()
      self.room = nil
      self.dernierePose = nil
    }
  }

  func update(room: CapturedRoom) {
    queue.async { self.room = room }
  }

  // MARK: - Regarder

  private func tick() {
    guard let session = session, let room = room,
          let frame = session.currentFrame else { return }
    guard case .normal = frame.camera.trackingState else { return }
    let cam = frame.camera
    let m = cam.transform
    let oeil = SIMD3<Float>(m.columns.3.x, m.columns.3.y, m.columns.3.z)
    let visee = -SIMD3<Float>(m.columns.2.x, m.columns.2.y, m.columns.2.z)
    // L'œil n'a pas bougé : rien de neuf à voir.
    if let p = dernierePose,
       simd_distance(p.position, oeil) < 0.05,
       simd_dot(p.visee, visee) > 0.9994 {
      return
    }
    dernierePose = (oeil, visee)
    let taille = cam.imageResolution
    var choix: (mur: CapturedRoom.Surface, score: Float, cote: Int, gain: Float)?
    for mur in room.walls {
      guard let note = noter(mur, parmi: room.walls, camera: cam, oeil: oeil, visee: visee, taille: taille)
      else { continue }
      let (score, cote) = note
      let gain = score - (meilleures[mur.identifier]?.score ?? 0)
      guard gain > Self.GAIN_MIN else { continue }
      if choix == nil || gain > choix!.gain { choix = (mur, score, cote, gain) }
    }
    guard let c = choix,
          let jpeg = redresser(c.mur, cote: c.cote, frame: frame, taille: taille) else { return }
    meilleures[c.mur.identifier] = Meilleure(score: c.score, jpeg: jpeg, cote: c.cote, at: Date())
  }

  /**
   LA NOTE D'UNE VUE : la part du mur dans l'image (au carré : une vue
   entière vaut bien plus que deux moitiés), à quel point on le voit de face,
   et la finesse (pixels par mètre). `nil` quand la vue ne vaut rien : de
   biais, trop loin, trop près, coupée, ou masquée par une autre cloison.
   */
  private func noter(
    _ mur: CapturedRoom.Surface, parmi murs: [CapturedRoom.Surface], camera cam: ARCamera,
    oeil: SIMD3<Float>, visee: SIMD3<Float>, taille: CGSize
  ) -> (Float, Int)? {
    let t = mur.transform
    let L = mur.dimensions.x
    let H = mur.dimensions.y
    guard L > 0.4, H > 0.8 else { return nil }
    let c = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let u = simd_normalize(SIMD3<Float>(t.columns.0.x, t.columns.0.y, t.columns.0.z))
    let v = simd_normalize(SIMD3<Float>(t.columns.1.x, t.columns.1.y, t.columns.1.z))
    let n0 = simd_normalize(SIMD3<Float>(t.columns.2.x, t.columns.2.y, t.columns.2.z))
    let cote: Int = simd_dot(n0, oeil - c) >= 0 ? 1 : -1
    let n = n0 * Float(cote)
    let distance = simd_dot(n, oeil - c)
    guard distance > 0.6, distance < 5.5 else { return nil }
    let face = simd_dot(-n, visee)
    guard face > 0.6 else { return nil }
    // Les quatre coins devant l'objectif : sans quoi la projection ment.
    for (a, b) in [(-1, -1), (1, -1), (1, 1), (-1, 1)] as [(Float, Float)] {
      let coin = c + u * (a * L / 2) + v * (b * H / 2)
      if simd_dot(coin - oeil, visee) < 0.15 { return nil }
    }
    var dedans = 0
    for i in 0..<5 {
      for j in 0..<3 {
        let a = (Float(i) + 0.5) / 5 * L - L / 2
        let b = (Float(j) + 0.5) / 3 * H - H / 2
        let q = cam.projectPoint(c + u * a + v * b, orientation: .landscapeRight, viewportSize: taille)
        if q.x >= 0, q.x <= taille.width, q.y >= 0, q.y <= taille.height { dedans += 1 }
      }
    }
    let part = Float(dedans) / 15
    guard part >= 0.6 else { return nil }
    // Une cloison entre l'œil et le mur : ce qu'on photographierait, c'est elle.
    var masques = 0
    for k in [-0.3, 0, 0.3] as [Float] {
      if masque(c + u * (k * L), depuis: oeil, sauf: mur, parmi: murs) { masques += 1 }
    }
    guard masques < 2 else { return nil }
    let focale = cam.intrinsics.columns.0.x
    let finesse = min(1, focale / distance / 450)
    return (part * part * face * finesse, cote)
  }

  /// Le segment œil → point traverse-t-il un AUTRE mur ?
  private func masque(
    _ p: SIMD3<Float>, depuis oeil: SIMD3<Float>, sauf lui: CapturedRoom.Surface,
    parmi murs: [CapturedRoom.Surface]
  ) -> Bool {
    for autre in murs where autre.identifier != lui.identifier {
      let t = autre.transform
      let c = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
      let n = simd_normalize(SIMD3<Float>(t.columns.2.x, t.columns.2.y, t.columns.2.z))
      let d0 = simd_dot(n, oeil - c)
      let d1 = simd_dot(n, p - c)
      guard d0 * d1 < 0 else { continue }
      let x = oeil + (p - oeil) * (d0 / (d0 - d1))
      let local = simd_inverse(t) * SIMD4<Float>(x.x, x.y, x.z, 1)
      if abs(local.x) < autre.dimensions.x / 2 - 0.05, abs(local.y) < autre.dimensions.y / 2 {
        return true
      }
    }
    return false
  }

  // MARK: - Redresser

  /**
   LA PHOTO REDRESSÉE : les quatre coins du mur, projetés dans l'image par la
   caméra même qui l'a prise, ramenés à un rectangle au rapport exact du mur.
   La gauche est celle de qui regarde le mur : c'est celle de l'élévation de
   cette face. Ce que l'image ne montrait pas devient un gris neutre.
   */
  private func redresser(
    _ mur: CapturedRoom.Surface, cote: Int, frame: ARFrame, taille: CGSize
  ) -> Data? {
    let t = mur.transform
    let L = mur.dimensions.x
    let H = mur.dimensions.y
    let c = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    let u = simd_normalize(SIMD3<Float>(t.columns.0.x, t.columns.0.y, t.columns.0.z))
    let v = simd_normalize(SIMD3<Float>(t.columns.1.x, t.columns.1.y, t.columns.1.z))
    let n = simd_normalize(SIMD3<Float>(t.columns.2.x, t.columns.2.y, t.columns.2.z)) * Float(cote)
    // La droite de qui regarde le mur, la normale tournée vers lui.
    let droite = SIMD3<Float>(n.z, 0, -n.x)
    let x = simd_dot(u, droite) >= 0 ? u : -u
    func dansLImage(_ p: SIMD3<Float>) -> CGPoint {
      let q = frame.camera.projectPoint(p, orientation: .landscapeRight, viewportSize: taille)
      // Core Image compte depuis le bas.
      return CGPoint(x: q.x, y: taille.height - q.y)
    }
    let filtre = CIFilter.perspectiveCorrection()
    filtre.inputImage = CIImage(cvPixelBuffer: frame.capturedImage)
    filtre.topLeft = dansLImage(c - x * (L / 2) + v * (H / 2))
    filtre.topRight = dansLImage(c + x * (L / 2) + v * (H / 2))
    filtre.bottomLeft = dansLImage(c - x * (L / 2) - v * (H / 2))
    filtre.bottomRight = dansLImage(c + x * (L / 2) - v * (H / 2))
    guard let redresse = filtre.outputImage else { return nil }
    let e = redresse.extent
    guard e.width > 1, e.height > 1, e.width.isFinite, e.height.isFinite else { return nil }
    let largeur = Self.LARGEUR
    let hauteur = (largeur * CGFloat(H / L)).rounded()
    let cadre = CGRect(x: 0, y: 0, width: largeur, height: hauteur)
    let mis = redresse
      .transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
      .transformed(by: CGAffineTransform(scaleX: largeur / e.width, y: hauteur / e.height))
    let fond = CIImage(color: CIColor(red: 0.86, green: 0.86, blue: 0.85)).cropped(to: cadre)
    // Le JPEG directement depuis l'image Core Image : sans passer par une
    // image bitmap puis une UIImage, deux copies de moins par photo.
    let espace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
    let qualite = CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String)
    return contexte.jpegRepresentation(
      of: mis.composited(over: fond).cropped(to: cadre),
      colorSpace: espace,
      options: [qualite: 0.8])
  }

  // MARK: - Livrer

  /**
   Les photos gardées, écrites dans les Documents : une par mur, avec le côté
   d'où on la voyait. Le JavaScript les pose derrière l'élévation de la face
   correspondante (`photosDesMurs`).
   */
  func livrer() -> [[String: Any]] {
    queue.sync { () -> [[String: Any]] in
      let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      var out: [[String: Any]] = []
      for (id, m) in meilleures {
        let url = docs.appendingPathComponent("mur-\(UUID().uuidString).jpg")
        do {
          try m.jpeg.write(to: url, options: .atomic)
          out.append([
            "wallId": id.uuidString,
            "path": url.path,
            "cote": m.cote,
            "at": m.at.timeIntervalSince1970 * 1000,
          ])
        } catch {
          continue
        }
      }
      return out
    }
  }
}
