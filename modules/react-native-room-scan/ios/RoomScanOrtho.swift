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

 LA NETTETÉ — relevé du patron : « la texture murale est de faible qualité ».
 Trois causes, trois remèdes :
 - LE PIXEL ÉTAIT GROS (2 cm) : il passe à UN centimètre au mur, un et demi au
   sol. La toile ne garde plus des sommes en flottants (16 octets le pixel)
   mais une couleur moyenne et son poids (8 octets) : deux fois plus fin dans
   chaque sens pour une mémoire raisonnable ;
 - LA MOYENNE DE TOUTES LES VUES BROUILLAIT : une vue de biais ou de loin, un
   rien décalée, pesait presque autant que la meilleure. Le poids monte
   désormais à la PUISSANCE QUATRE de la qualité (incidence, distance) : une
   vue deux fois meilleure compte seize fois plus ; le bord de l'objectif,
   moins net, pèse moins que son centre ;
 - LES VUES BOUGÉES SALISSAIENT : le flou de bougé se calcule (vitesse de
   rotation × temps de pose × focale, en pixels) et une image floue ne pèse
   presque plus rien.
 Et chaque pixel de la toile se lit en QUATRE points de l'image de la caméra,
 à l'écart de son empreinte : plus de grain ni de moirage sur un carrelage ou
 un papier peint.
 */
@available(iOS 16.0, *)
final class OrthophotosDuReleve {
  static let shared = OrthophotosDuReleve()

  private let queue = DispatchQueue(label: "com.roomscan.ortho", qos: .utility)
  private var timer: DispatchSourceTimer?
  private weak var session: ARSession?
  private var room: CapturedRoom?
  private var dernierePose: (position: SIMD3<Float>, visee: SIMD3<Float>, instant: TimeInterval)?
  /// Le compte des battements, pour lever le pied quand le téléphone chauffe.
  private var battement = 0

  /// Trois regards par seconde : assez pour tout couvrir en marchant.
  private static let rate = 3.0
  /// Un centimètre le pixel sur les murs, un et demi au sol.
  private static let pasMur: Float = 0.01
  private static let pasSol: Float = 0.015
  /// Au plus 1024 × 400 pixels par face (10 m sur 4), 1024 × 1024 au sol.
  private static let maxMurL = 1024
  private static let maxMurH = 400
  private static let maxSol = 1024

  /// La face d'un mur, vue d'un côté, et la géométrie qui la porte.
  private struct Face {
    var toile: Toile
    var wallId: UUID
    var cote: Int
    var longueur: Float
    var hauteur: Float
    var transform: simd_float4x4
    /// Où la toile est posée dans le monde : son pixel (0, 0), et ses deux pas.
    var origine: SIMD3<Float>
    var du: SIMD3<Float>
    var dv: SIMD3<Float>
  }

  private var faces: [String: Face] = [:]
  private var sol: (toile: Toile, minX: Float, minZ: Float, pas: Float, y: Float)?

  // MARK: - Cycle de vie

  func attach(to session: ARSession) {
    queue.async {
      self.session = session
      guard self.timer == nil else { return }
      let t = DispatchSource.makeTimerSource(queue: self.queue)
      // Un peu de jeu : le système regroupe les réveils, la batterie y gagne.
      t.schedule(deadline: .now() + 0.6, repeating: 1.0 / Self.rate, leeway: .milliseconds(40))
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
    /*
      LA CHALEUR DÉCIDE AUSSI. RoomPlan chauffe déjà le téléphone ; quand iOS
      le dit chaud, on ne regarde plus qu'une fois sur trois ; brûlant, plus
      du tout — mieux vaut des murs un peu moins nets qu'un scan qui coupe.
    */
    battement &+= 1
    let chaleur = ProcessInfo.processInfo.thermalState
    if chaleur == .critical { return }
    if chaleur == .serious && battement % 3 != 0 { return }
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
    let nettete = Self.nettete(frame: frame, oeil: oeil, visee: visee, avant: dernierePose)
    dernierePose = (oeil, visee, frame.timestamp)
    // Une image franchement bougée n'apporte que du flou : on la passe.
    guard nettete > 0.04 else { return }
    guard let vue = VueDeCamera(frame: frame) else { return }
    defer { vue.liberer() }

    for mur in room.walls {
      projeterLeMur(mur, vue: vue, oeil: oeil, nettete: nettete)
    }
    projeterLeSol(room, vue: vue, oeil: oeil, nettete: nettete)
  }

  /**
   LE FLOU DE BOUGÉ, EN PIXELS : la vitesse de rotation de la caméra (et sa
   translation, ramenée à un regard à deux mètres) multipliée par le temps de
   pose et la focale. Quatre pixels de traîne divisent le poids par deux ;
   douze, par dix.
   */
  private static func nettete(
    frame: ARFrame, oeil: SIMD3<Float>, visee: SIMD3<Float>,
    avant: (position: SIMD3<Float>, visee: SIMD3<Float>, instant: TimeInterval)?
  ) -> Float {
    guard let a = avant else { return 1 }
    let dt = Float(frame.timestamp - a.instant)
    guard dt > 0.01, dt < 2 else { return 1 }
    let cosinus: Float = max(-1, min(1, simd_dot(a.visee, visee)))
    let rotation: Float = acos(cosinus) / dt
    let translation: Float = simd_distance(a.position, oeil) / dt / 2
    let pose = Float(frame.camera.exposureDuration)
    let focale: Float = frame.camera.intrinsics.columns.0.x
    let vitesse: Float = rotation + translation
    let trainee: Float = vitesse * max(pose, 1.0 / 240.0) * focale
    let r: Float = trainee / 4
    return 1 / (1 + r * r)
  }

  private func projeterLeMur(_ mur: CapturedRoom.Surface, vue: VueDeCamera, oeil: SIMD3<Float>, nettete: Float) {
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
    /*
      LE PIXEL (i, j) DE LA FACE, DANS LE MONDE — puis dans la caméra. Le
      monde est affine dans les deux indices : on calcule l'origine et les
      deux pas une fois, chaque pixel n'est plus que deux additions.
      Vue de son côté, la gauche de l'image est la gauche de celui qui
      regarde : du côté +z du mur, l'axe x va vers la droite ; de l'autre,
      vers la gauche.
    */
    // En sous-expressions typées : d'un seul tenant, le compilateur abandonne.
    let sens = Float(cote)
    let pasU: Float = sens * L / Float(w)
    let pasV: Float = H / Float(h)
    let du: SIMD3<Float> = axe * pasU
    let dv: SIMD3<Float> = haut * (-pasV)
    let gauche: SIMD3<Float> = axe * (-sens * L / 2)
    let dessus: SIMD3<Float> = haut * (H / 2)
    let demiPas: SIMD3<Float> = (du + dv) * 0.5
    let origine: SIMD3<Float> = centre + gauche + dessus + demiPas
    var face: Face
    let ancienne: Face? = faces.removeValue(forKey: cle)
    if var f = ancienne, abs(f.longueur - L) < 0.1, abs(f.hauteur - H) < 0.1, f.toile.w == w, f.toile.h == h {
      f.transform = t
      face = f
    } else {
      /*
        UN MUR QUI GRANDIT GARDE CE QU'ON EN A VU. RoomPlan affine ses murs
        en marchant : un centimètre de plus changeait la taille de la toile,
        et tout ce que les vues précédentes avaient fondu repartait de zéro
        — chaque image ne gardait que les dernières secondes du scan. Les
        pixels anciens sont maintenant recopiés à leur place dans le monde.
      */
      var neuve = Toile(w: w, h: h)
      if let f = ancienne {
        neuve.recopier(f.toile, origine: origine, du: du, dv: dv,
                       ancienne: f.origine, adu: f.du, adv: f.dv, normale: normale)
      }
      face = Face(toile: neuve, wallId: mur.identifier, cote: cote, longueur: L, hauteur: H,
                  transform: t, origine: origine, du: du, dv: dv)
    }
    face.origine = origine
    face.du = du
    face.dv = dv
    // La qualité à la puissance quatre : la meilleure vue l'emporte nettement.
    let q: Float = incidence / max(distance, 0.5)
    let q2: Float = q * q
    let poids: Float = q2 * q2 * nettete
    vue.projeter(toile: &face.toile, origine: origine, du: du, dv: dv, poids: poids)
    faces[cle] = face
  }

  private func projeterLeSol(_ room: CapturedRoom, vue: VueDeCamera, oeil: SIMD3<Float>, nettete: Float) {
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
            neuve.couleur[jj * neuve.w + ii] = ancien.toile.couleur[j * ancien.toile.w + i]
            neuve.poids[jj * neuve.w + ii] = ancien.toile.poids[j * ancien.toile.w + i]
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
    let q: Float = 1 / max(distance, 0.5)
    let q2: Float = q * q
    vue.projeter(toile: &s.toile, origine: origine, du: du, dv: dv, poids: q2 * q2 * nettete, normale: SIMD3<Float>(0, 1, 0))
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
      /*
        LES FACES S'ÉCRIVENT EN PARALLÈLE. Chacune se comble et s'encode seule,
        sans rien partager : sur les six cœurs de l'iPhone, l'assemblage
        n'attend plus la somme des faces, mais la plus longue.
      */
      let liste = Array(faces.values)
      var rendus = [[String: Any]?](repeating: nil, count: liste.count)
      rendus.withUnsafeMutableBufferPointer { tampon in
        let sorties = tampon
        DispatchQueue.concurrentPerform(iterations: liste.count) { k in
          sorties[k] = Self.livrerLaFace(liste[k], docs: docs)
        }
      }
      let murs: [[String: Any]] = rendus.compactMap { $0 }
      var sortie: [String: Any] = ["murs": murs]
      if let s = sol {
        let vus = s.toile.poids.reduce(0) { $0 + ($1 > 0 ? 1 : 0) }
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

  /// Une face de mur, en JPEG dans les Documents ; rien si elle est trop peu vue.
  private static func livrerLaFace(_ f: Face, docs: URL) -> [String: Any]? {
    let vus = f.toile.poids.reduce(0) { $0 + ($1 > 0 ? 1 : 0) }
    let couverture = Float(vus) / Float(max(1, f.toile.w * f.toile.h))
    guard couverture >= 0.12, let jpeg = Self.jpeg(f.toile) else { return nil }
    let url = docs.appendingPathComponent("ortho-mur-\(UUID().uuidString).jpg")
    guard (try? jpeg.write(to: url, options: .atomic)) != nil else { return nil }
    let t = f.transform
    let yBas: Float = t.columns.3.y - f.hauteur / 2
    return [
      "wallId": f.wallId.uuidString,
      "cote": f.cote,
      "path": url.path,
      "cx": t.columns.3.x,
      "cz": t.columns.3.z,
      "dx": t.columns.0.x,
      "dz": t.columns.0.z,
      "longueur": f.longueur,
      "hauteur": f.hauteur,
      "yBas": yBas,
      "couverture": couverture,
    ]
  }

  /// La toile en JPEG : moyenne pondérée, trous comblés, sRGB.
  private static func jpeg(_ toile: Toile) -> Data? {
    let w = toile.w
    let h = toile.h
    var rgb = [SIMD3<Float>](repeating: SIMD3<Float>(-1, -1, -1), count: w * h)
    var somme = SIMD3<Float>(0, 0, 0)
    var n: Float = 0
    for k in 0..<(w * h) where toile.poids[k] > 0 {
      let o = toile.couleur[k]
      let brute = SIMD3<Float>(Float(o.x), Float(o.y), Float(o.z))
      let c: SIMD3<Float> = brute * Toile.unSur256
      rgb[k] = c
      somme += c
      n += 1
    }
    guard n > 0 else { return nil }
    let moyenne = somme / n
    /*
      LES TROUS SE COMBLENT PAR LEURS VOISINS, de proche en proche : chaque
      pixel inconnu au bord d'un trou prend la moyenne de ses voisins connus,
      puis le front avance d'un pixel — quatre-vingts fronts, quatre-vingts
      centimètres. On ne visite que les trous (au centimètre, repasser toute
      la toile quarante fois coûtait des secondes) ; au-delà, la couleur
      moyenne de la face.
    */
    var vu = [Bool](repeating: false, count: w * h)
    for k in 0..<(w * h) where rgb[k].x >= 0 { vu[k] = true }
    // Le voisin `d` (0 gauche, 1 droite, 2 dessus, 3 dessous) de `k`, ou −1 —
    // sans tableau : il en naissait un par pixel visité, des centaines de mille.
    func voisin(_ k: Int, _ d: Int) -> Int {
      let i = k % w
      switch d {
      case 0: return i > 0 ? k - 1 : -1
      case 1: return i < w - 1 ? k + 1 : -1
      case 2: return k >= w ? k - w : -1
      default: return k + w < w * h ? k + w : -1
      }
    }
    var marque = vu
    var front: [Int] = []
    for k in 0..<(w * h) where !vu[k] {
      for d in 0..<4 {
        let q = voisin(k, d)
        if q >= 0, vu[q] {
          front.append(k)
          marque[k] = true
          break
        }
      }
    }
    var couche = 0
    while !front.isEmpty && couche < 80 {
      var valeurs = [SIMD3<Float>](repeating: SIMD3<Float>(0, 0, 0), count: front.count)
      for (n, k) in front.enumerated() {
        var acc = SIMD3<Float>(0, 0, 0)
        var c: Float = 0
        for d in 0..<4 {
          let q = voisin(k, d)
          if q >= 0, vu[q] {
            acc += rgb[q]
            c += 1
          }
        }
        valeurs[n] = c > 0 ? acc / c : moyenne
      }
      for (n, k) in front.enumerated() {
        rgb[k] = valeurs[n]
        vu[k] = true
      }
      var suivant: [Int] = []
      for k in front {
        for d in 0..<4 {
          let q = voisin(k, d)
          if q >= 0, !marque[q] {
            marque[q] = true
            suivant.append(q)
          }
        }
      }
      front = suivant
      couche += 1
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
    return UIImage(cgImage: image).jpegData(compressionQuality: 0.9)
  }
}

/**
 Une toile : pour chaque pixel, la MOYENNE pondérée des couleurs vues et le
 poids qu'elle porte déjà.

 LA MOYENNE EN SEIZE BITS (8.8, au 256ᵉ de niveau). En huit bits, chaque mise
 à jour s'arrondissait au niveau : passé une dizaine de vues, un écart de
 moins de cinq niveaux ne déplaçait plus rien — le grain des premières vues
 restait figé dans l'image. Douze octets le pixel : la précision qui manquait,
 pour un tiers de mémoire de plus.
 */
fileprivate struct Toile {
  let w: Int
  let h: Int
  var couleur: [SIMD4<UInt16>]
  var poids: [Float]
  init(w: Int, h: Int) {
    self.w = w
    self.h = h
    couleur = [SIMD4<UInt16>](repeating: SIMD4<UInt16>(0, 0, 0, 0), count: w * h)
    poids = [Float](repeating: 0, count: w * h)
  }

  static let unSur256: Float = 1.0 / 256.0

  /// Ajoute une vue au pixel `k` : la moyenne glisse vers elle selon son poids.
  mutating func ajouter(_ k: Int, r: Float, g: Float, b: Float, w: Float) {
    let avant: Float = poids[k]
    let total: Float = avant + w
    guard total > 0 else { return }
    let t: Float = w / total
    let c = couleur[k]
    let cr: Float = Float(c.x) * Toile.unSur256
    let cg: Float = Float(c.y) * Toile.unSur256
    let cb: Float = Float(c.z) * Toile.unSur256
    let nr: Float = cr + (r - cr) * t
    let ng: Float = cg + (g - cg) * t
    let nb: Float = cb + (b - cb) * t
    couleur[k] = SIMD4<UInt16>(Toile.fixe(nr), Toile.fixe(ng), Toile.fixe(nb), 0)
    poids[k] = total
  }

  static func fixe(_ v: Float) -> UInt16 {
    let x: Float = (v * 256).rounded()
    return UInt16(max(0, min(65280, x)))
  }

  /**
   Recopie la toile d'avant du même mur, chaque pixel à sa place dans le
   monde : le pixel (i, j) d'ici est le pixel (i0 + a1·i + a2·j, j0 + b1·i +
   b2·j) de là-bas. Un mur qui a basculé ou reculé de plus de cinq
   centimètres repart de zéro — ses anciens pixels ne sont plus à leur place.
   */
  mutating func recopier(
    _ a: Toile, origine: SIMD3<Float>, du: SIMD3<Float>, dv: SIMD3<Float>,
    ancienne: SIMD3<Float>, adu: SIMD3<Float>, adv: SIMD3<Float>, normale: SIMD3<Float>
  ) {
    let u2: Float = simd_length_squared(adu)
    let v2: Float = simd_length_squared(adv)
    guard u2 > 1e-10, v2 > 1e-10 else { return }
    let ecart: SIMD3<Float> = origine - ancienne
    guard abs(simd_dot(ecart, normale)) < 0.05 else { return }
    let lu: Float = simd_length(du)
    let lau: Float = u2.squareRoot()
    guard lu > 1e-6 else { return }
    let alignement: Float = simd_dot(du, adu) / (lu * lau)
    guard alignement > 0.98 else { return }
    let i0: Float = simd_dot(ecart, adu) / u2
    let a1: Float = simd_dot(du, adu) / u2
    let a2: Float = simd_dot(dv, adu) / u2
    let j0: Float = simd_dot(ecart, adv) / v2
    let b1: Float = simd_dot(du, adv) / v2
    let b2: Float = simd_dot(dv, adv) / v2
    for j in 0..<h {
      let fj = Float(j)
      let ri: Float = i0 + a2 * fj
      let rj: Float = j0 + b2 * fj
      for i in 0..<w {
        let fi = Float(i)
        let ii = Int((ri + a1 * fi).rounded())
        let jj = Int((rj + b1 * fi).rounded())
        guard ii >= 0, ii < a.w, jj >= 0, jj < a.h else { continue }
        let k = jj * a.w + ii
        guard a.poids[k] > 0 else { continue }
        couleur[j * w + i] = a.couleur[k]
        poids[j * w + i] = a.poids[k]
      }
    }
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
  // Les tampons, verrouillés le temps de la vue : leurs adresses lues une fois.
  let dBase: UnsafeMutableRawPointer
  let dLigne: Int
  let profondeurL: Int
  let profondeurH: Int
  let echelleX: Float
  let echelleY: Float
  let yBase: UnsafeMutableRawPointer
  let yLigne: Int
  let cBase: UnsafeMutableRawPointer
  let cLigne: Int
  /// La confiance du LiDAR, pixel par pixel (faible, moyenne, haute), si ARKit la donne.
  let confiance: CVPixelBuffer?
  let confBase: UnsafeMutableRawPointer?
  let confLigne: Int
  /// Les bornes et les inverses qu'on recalculait à chaque pixel.
  let uMax: Float
  let vMax: Float
  let unSurCx: Float
  let unSurCy: Float

  init?(frame: ARFrame) {
    let b = frame.capturedImage
    let donnees = frame.sceneDepth ?? frame.smoothedSceneDepth
    guard let d = donnees?.depthMap else { return nil }
    guard CVPixelBufferGetPlaneCount(b) >= 2 else { return nil }
    guard CVPixelBufferLockBaseAddress(b, .readOnly) == kCVReturnSuccess else { return nil }
    guard CVPixelBufferLockBaseAddress(d, .readOnly) == kCVReturnSuccess else {
      CVPixelBufferUnlockBaseAddress(b, .readOnly)
      return nil
    }
    guard let db = CVPixelBufferGetBaseAddress(d),
          let yb = CVPixelBufferGetBaseAddressOfPlane(b, 0),
          let cb = CVPixelBufferGetBaseAddressOfPlane(b, 1)
    else {
      CVPixelBufferUnlockBaseAddress(b, .readOnly)
      CVPixelBufferUnlockBaseAddress(d, .readOnly)
      return nil
    }
    image = b
    profondeur = d
    largeur = CVPixelBufferGetWidth(b)
    hauteur = CVPixelBufferGetHeight(b)
    dBase = db
    dLigne = CVPixelBufferGetBytesPerRow(d)
    profondeurL = CVPixelBufferGetWidth(d)
    profondeurH = CVPixelBufferGetHeight(d)
    echelleX = Float(profondeurL) / Float(largeur)
    echelleY = Float(profondeurH) / Float(hauteur)
    yBase = yb
    yLigne = CVPixelBufferGetBytesPerRowOfPlane(b, 0)
    cBase = cb
    cLigne = CVPixelBufferGetBytesPerRowOfPlane(b, 1)
    if let c = donnees?.confidenceMap, CVPixelBufferLockBaseAddress(c, .readOnly) == kCVReturnSuccess {
      confiance = c
      confBase = CVPixelBufferGetBaseAddress(c)
      confLigne = CVPixelBufferGetBytesPerRow(c)
    } else {
      confiance = nil
      confBase = nil
      confLigne = 0
    }
    uMax = Float(largeur - 9)
    vMax = Float(hauteur - 9)
    pleineEchelle = CVPixelBufferGetPixelFormatType(b) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    let t = frame.camera.transform
    oeil = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    inverse = t.inverse
    let k = frame.camera.intrinsics
    fx = k.columns.0.x
    fy = k.columns.1.y
    cx = k.columns.2.x
    cy = k.columns.2.y
    unSurCx = 1 / max(k.columns.2.x, 1)
    unSurCy = 1 / max(k.columns.2.y, 1)
  }

  func liberer() {
    CVPixelBufferUnlockBaseAddress(image, .readOnly)
    CVPixelBufferUnlockBaseAddress(profondeur, .readOnly)
    if let c = confiance { CVPixelBufferUnlockBaseAddress(c, .readOnly) }
  }

  /**
   Projette une toile entière : le pixel (i, j) est au point du monde
   `origine + i·du + j·dv`. Ce que la caméra voit — devant elle, dans
   l'image, à la profondeur attendue à huit centimètres près — rejoint la
   moyenne pondérée du pixel.

   La toile se parcourt PAR BLOCS de seize pixels : un bloc dont les quatre
   coins tombent du même côté hors de l'image (ou derrière l'objectif) est
   écarté d'un coup — au centimètre, la plupart des murs ne sont pas dans le
   champ, et l'on ne paie plus que ce qu'on voit.
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
    let pasTexel: Float = max(simd_length(du), simd_length(dv))
    let bloc = 16
    var bj = 0
    while bj < toile.h {
      let j1 = min(toile.h, bj + bloc)
      var bi = 0
      while bi < toile.w {
        let i1 = min(toile.w, bi + bloc)
        if blocVisible(o: o, pu: pu, pv: pv, i0: bi, j0: bj, i1: i1, j1: j1) {
          for j in bj..<j1 {
            let fj = Float(j)
            var p: SIMD3<Float> = o + pv * fj
            p += pu * Float(bi)
            for i in bi..<i1 {
              lirePixel(
                toile: &toile, k: j * toile.w + i, p: p, i: i, j: j, origine: origine,
                du: du, dv: dv, pasTexel: pasTexel, poids: poids, normale: normale)
              p += pu
            }
          }
        }
        bi = i1
      }
      bj = j1
    }
  }

  /// Un bloc est-il, peut-être, dans le champ ? Prudent : dans le doute, oui.
  private func blocVisible(o: SIMD3<Float>, pu: SIMD3<Float>, pv: SIMD3<Float>, i0: Int, j0: Int, i1: Int, j1: Int) -> Bool {
    var derriere = 0
    var loin = 0
    var gauche = 0
    var droite = 0
    var haut = 0
    var bas = 0
    for (i, j) in [(i0, j0), (i1, j0), (i0, j1), (i1, j1)] {
      let a: SIMD3<Float> = pu * Float(i)
      let b: SIMD3<Float> = pv * Float(j)
      let p: SIMD3<Float> = o + a + b
      let z: Float = -p.z
      if z <= 0.25 {
        derriere += 1
        continue
      }
      if z >= 6 { loin += 1 }
      let u: Float = fx * (p.x / z) + cx
      let v: Float = fy * (-p.y / z) + cy
      if u < 0 { gauche += 1 }
      if u >= Float(largeur) { droite += 1 }
      if v < 0 { haut += 1 }
      if v >= Float(hauteur) { bas += 1 }
    }
    if derriere == 4 || loin == 4 { return false }
    // Un coin derrière l'objectif renverse la projection : on ne tranche pas.
    if derriere > 0 { return true }
    return gauche < 4 && droite < 4 && haut < 4 && bas < 4
  }

  /// Un pixel de la toile : visible, il prend la couleur lue en quatre points.
  private func lirePixel(
    toile: inout Toile, k: Int, p: SIMD3<Float>, i: Int, j: Int, origine: SIMD3<Float>,
    du: SIMD3<Float>, dv: SIMD3<Float>, pasTexel: Float, poids: Float, normale: SIMD3<Float>?
  ) {
    // Repère ARKit : −z devant l'objectif.
    let z = -p.z
    guard z > 0.25, z < 6 else { return }
    let unSurZ: Float = 1 / z
    let u: Float = fx * (p.x * unSurZ) + cx
    let v: Float = fy * (-p.y * unSurZ) + cy
    guard u >= 8, v >= 8, u < uMax, v < vMax else { return }
    // La profondeur : le point doit être CE que la caméra voit.
    let px = min(profondeurL - 1, max(0, Int(u * echelleX)))
    let py = min(profondeurH - 1, max(0, Int(v * echelleY)))
    let mesure = dBase.advanced(by: py * dLigne).assumingMemoryBound(to: Float32.self)[px]
    guard mesure > 0.05, abs(mesure - z) < 0.08 else { return }
    /*
      LA PROFONDEUR DOUTEUSE NE DÉCIDE PAS. Le LiDAR doute surtout au BORD
      des objets — exactement là où un canapé déborde sur le mur derrière
      lui ; en confiance faible, le point n'est pas lu.
    */
    if let cb = confBase {
      let fiabilite = cb.advanced(by: py * confLigne).assumingMemoryBound(to: UInt8.self)[px]
      guard Int(fiabilite) >= ARConfidenceLevel.medium.rawValue else { return }
    }
    var w = poids
    if let n = normale {
      // Au sol, l'incidence se juge au pixel : le regard rasant pèse peu.
      let fi = Float(i)
      let fj = Float(j)
      let mx: Float = origine.x + du.x * fi + dv.x * fj
      let mz: Float = origine.z + du.z * fi + dv.z * fj
      let monde = SIMD3<Float>(mx, origine.y, mz)
      let vers = simd_normalize(oeil - monde)
      let cosinus = abs(simd_dot(n, vers))
      guard cosinus > 0.3 else { return }
      let c2: Float = cosinus * cosinus
      w *= c2 * c2
    }
    // Le bord de l'objectif, moins net et plus sombre, pèse moins que son centre.
    let ex: Float = (u - cx) * unSurCx
    let ey: Float = (v - cy) * unSurCy
    let bord: Float = ex * ex + ey * ey
    w *= max(0.15, 1 - 0.45 * bord)
    /*
      QUATRE LECTURES, à l'écart de l'empreinte du pixel dans l'image : un
      centimètre vu à deux mètres couvre sept pixels de la caméra ; en lire
      un seul, c'était tirer au sort son grain.
    */
    let empreinte: Float = fx * pasTexel / z
    let e: Float = min(6, max(0.5, empreinte * 0.25))
    // La conversion en RGB est linéaire : on moyenne les quatre lectures en
    // Y'CbCr, et l'on ne convertit qu'une fois au lieu de quatre.
    let c1 = ycc(u: u - e, v: v - e)
    let c2 = ycc(u: u + e, v: v - e)
    let c3 = ycc(u: u - e, v: v + e)
    let c4 = ycc(u: u + e, v: v + e)
    let haut: SIMD3<Float> = c1 + c2
    let bas: SIMD3<Float> = c3 + c4
    let moy: SIMD3<Float> = (haut + bas) * 0.25
    let m: SIMD3<Float> = enRGB(moy)
    toile.ajouter(k, r: m.x, g: m.y, b: m.z, w: w)
  }

  /// Y', Cb, Cr au pixel le plus proche de (u, v), bruts (0–255).
  private func ycc(u: Float, v: Float) -> SIMD3<Float> {
    let ix = min(largeur - 1, max(0, Int(u.rounded())))
    let iy = min(hauteur - 1, max(0, Int(v.rounded())))
    let yy = Float(yBase.advanced(by: iy * yLigne).assumingMemoryBound(to: UInt8.self)[ix])
    let cRang = cBase.advanced(by: (iy / 2) * cLigne).assumingMemoryBound(to: UInt8.self)
    let cb = Float(cRang[(ix / 2) * 2])
    let cr = Float(cRang[(ix / 2) * 2 + 1])
    return SIMD3<Float>(yy, cb, cr)
  }

  /// Y'CbCr (BT.601) → RGB.
  private func enRGB(_ c: SIMD3<Float>) -> SIMD3<Float> {
    var yy: Float = c.x
    if !pleineEchelle { yy = (yy - 16) * (255.0 / 219.0) }
    let cb: Float = c.y - 128
    let cr: Float = c.z - 128
    let r: Float = yy + 1.402 * cr
    let g: Float = yy - 0.344136 * cb - 0.714136 * cr
    let b: Float = yy + 1.772 * cb
    return SIMD3<Float>(r, g, b)
  }
}
