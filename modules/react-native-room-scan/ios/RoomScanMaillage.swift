import ARKit
import Foundation
import simd

/**
 * LE MAILLAGE LIDAR, RELEVÉ TEL QUEL À LA FIN DU SCAN.
 *
 * Relevé du patron : « lent pour vraiment comprendre la structure des
 * parois, ne forme pas les angles des retours de volets roulants ». RoomPlan
 * rend des murs plans ; sous lui, ARKit tient la vraie surface — un maillage
 * de triangles à un ou deux centimètres, classé (mur, sol, plafond, porte,
 * fenêtre…). On le lit dans la session de RoomPlan, sans rien lui disputer,
 * juste avant qu'elle ne s'arrête, et on l'écrit dans un fichier compact :
 * c'est la matière sur laquelle la détection des coffres, des retours et
 * des épaisseurs se bâtira, au banc, sur des pièces réelles.
 *
 * LE FORMAT, petit-boutiste (lu par `geometry/maillage.ts`) :
 *
 *   "EPM1" · u32 ancres · par ancre : u32 sommets, u32 faces, u8 classé,
 *   f32 × 3 × sommets (monde ARKit), u32 × 3 × faces, u8 × faces si classé.
 *
 * UN SEUL FICHIER À LA FOIS : six à dix mégaoctets par pièce, il n'y a pas
 * de raison d'en garder dix. Le précédent s'efface quand le suivant s'écrit.
 */
enum RoomScanMaillage {

  /// Relève le maillage de cette session ; rend ce qu'on en dira au JS.
  static func relever(from session: ARSession) -> [String: Any] {
    construire(ancresDe(session))
  }

  /// Les ancres de maillage de l'image courante — à prendre sur le fil
  /// principal, AVANT l'arrêt de la session : c'est instantané.
  static func ancresDe(_ session: ARSession) -> [ARMeshAnchor] {
    session.currentFrame?.anchors.compactMap { $0 as? ARMeshAnchor } ?? []
  }

  /**
   LE MAILLAGE, CONSTRUIT HORS DU FIL DE L'INTERFACE. Des centaines de
   milliers de sommets passés dans le monde, quelques mégaoctets écrits sur
   le disque : fait sur le fil principal, l'écran se figeait au toucher de
   « Terminer ». Les ancres sont des instantanés immuables : on les lit d'une
   autre file sans risque.
   */
  static func construire(_ ancres: [ARMeshAnchor]) -> [String: Any] {
    guard !ancres.isEmpty else {
      return ["ancres": 0, "faces": 0, "sommets": 0, "classe": false]
    }

    /*
      LA TAILLE DU FICHIER EST CONNUE D'AVANCE — on la réserve d'un coup.
      Sans cela, `Data` regrandissait (et recopiait) des mégaoctets au fil
      des ancres, et chaque tableau passait par un `Data` intermédiaire
      avant d'être recopié une seconde fois. Les octets écrits sont les
      mêmes, dans le même ordre.
    */
    var total = 8
    for ancre in ancres {
      let g = ancre.geometry
      let deSommets: Int = g.vertices.count * 3 * MemoryLayout<Float>.size
      let deFaces: Int = g.faces.count * 3 * MemoryLayout<UInt32>.size
      let deClasses: Int = g.classification != nil ? g.faces.count : 0
      total += 9 + deSommets + deFaces + deClasses
    }
    var data = Data()
    data.reserveCapacity(total)
    data.append(contentsOf: Array("EPM1".utf8))
    func u32(_ v: Int) {
      var x = UInt32(max(0, v)).littleEndian
      withUnsafeBytes(of: &x) { data.append(contentsOf: $0) }
    }
    u32(ancres.count)
    var nSommets = 0
    var nFaces = 0
    var classe = false
    // LE VOLUME : où est le sol, et à quelle hauteur est le plafond, carreau
    // par carreau (voir `volume`).
    var hauteursDuSol = [Float]()
    var plafond: [SIMD2<Int32>: SIMD2<Float>] = [:]

    for ancre in ancres {
      let g = ancre.geometry
      let vs = g.vertices
      let fs = g.faces
      let n = vs.count
      let m = fs.count
      u32(n)
      u32(m)
      let aClasse = g.classification != nil
      data.append(aClasse ? 1 : 0)

      // Les sommets, passés dans le monde : l'ancre a sa propre origine.
      let t = ancre.transform
      let base = vs.buffer.contents().advanced(by: vs.offset)
      var flottants = [Float]()
      flottants.reserveCapacity(n * 3)
      for i in 0..<n {
        let p = base.advanced(by: i * vs.stride).assumingMemoryBound(to: Float.self)
        let w = t * SIMD4<Float>(p[0], p[1], p[2], 1)
        flottants.append(w.x)
        flottants.append(w.y)
        flottants.append(w.z)
      }
      flottants.withUnsafeBufferPointer { data.append($0) }

      // Les faces : trois indices chacune, sur deux ou quatre octets selon
      // ce qu'ARKit a choisi — on les ressort toujours sur quatre.
      let fb = fs.buffer.contents()
      var indices = [UInt32]()
      indices.reserveCapacity(m * 3)
      for i in 0..<m {
        for k in 0..<3 {
          let decalage = (i * fs.indexCountPerPrimitive + k) * fs.bytesPerIndex
          if fs.bytesPerIndex == 4 {
            indices.append(fb.advanced(by: decalage).assumingMemoryBound(to: UInt32.self).pointee)
          } else {
            indices.append(UInt32(fb.advanced(by: decalage).assumingMemoryBound(to: UInt16.self).pointee))
          }
        }
      }
      indices.withUnsafeBufferPointer { data.append($0) }

      // La classe de chaque face, un octet (ARMeshClassification).
      if let c = g.classification {
        let cb = c.buffer.contents().advanced(by: c.offset)
        var classes = [UInt8](repeating: 0, count: m)
        for i in 0..<m {
          classes[i] = cb.advanced(by: i * c.stride).assumingMemoryBound(to: UInt8.self).pointee
        }
        data.append(contentsOf: classes)
        classe = true
        accumuler(sommets: flottants, indices: indices, classes: classes,
                  sol: &hauteursDuSol, plafond: &plafond)
      }
      nSommets += n
      nFaces += m
    }

    var out: [String: Any] = [
      "ancres": ancres.count,
      "faces": nFaces,
      "sommets": nSommets,
      "classe": classe,
      "octets": data.count,
    ]
    if let v = volume(sol: hauteursDuSol, plafond: plafond) {
      out["volume"] = v
    }
    let fm = FileManager.default
    guard let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return out
    }
    // Le précédent s'en va : un seul maillage gardé, le dernier.
    if let tous = try? fm.contentsOfDirectory(at: docs, includingPropertiesForKeys: nil) {
      for url in tous where url.lastPathComponent.hasPrefix("maillage-")
        && url.pathExtension == "bin" {
        try? fm.removeItem(at: url)
      }
    }
    let url = docs.appendingPathComponent("maillage-\(UUID().uuidString).bin")
    if (try? data.write(to: url, options: .atomic)) != nil {
      out["fichier"] = url.path
    }
    return out
  }

  /**
   LE VOLUME DE LA PIÈCE, LU DANS LE MAILLAGE.

   RoomPlan rend des murs droits d'une hauteur chacun : un plafond rampant,
   une sous-pente, un plafond qui descend au-dessus d'un placard n'y existent
   pas. Le LiDAR, lui, les a vus : ARKit classe chaque triangle (sol,
   plafond…). On en tire deux choses, sans rien deviner :

   - LE SOL : la hauteur médiane des triangles classés sol. C'est le zéro de
     toutes les hauteurs — RoomPlan, lui, travaille dans le repère de la
     session, où le sol n'est pas à zéro ;
   - LE PLAFOND, CARREAU PAR CARREAU : un quadrillage de 25 cm où chaque
     case porte la hauteur moyenne des triangles de plafond qui la couvrent,
     en centimètres au-dessus du sol (0 : pas vu).

   Le JavaScript en déduit, pièce par pièce, la hauteur sous plafond (la plus
   basse, la plus haute, la moyenne), le volume, et la surface où l'on tient
   debout — la loi Carrez ne compte pas ce qui est sous 1,80 m.
   */
  static let pasDuPlafond: Float = 0.25

  /// Classe ARKit d'un triangle : 2 sol, 3 plafond (`ARMeshClassification`).
  static func accumuler(
    sommets: [Float], indices: [UInt32], classes: [UInt8],
    sol: inout [Float], plafond: inout [SIMD2<Int32>: SIMD2<Float>]
  ) {
    let n = sommets.count / 3
    for i in 0..<classes.count {
      let k = classes[i]
      guard k == 2 || k == 3, i * 3 + 2 < indices.count else { continue }
      let a = Int(indices[i * 3])
      let b = Int(indices[i * 3 + 1])
      let c = Int(indices[i * 3 + 2])
      guard a < n, b < n, c < n else { continue }
      let x = (sommets[a * 3] + sommets[b * 3] + sommets[c * 3]) / 3
      let y = (sommets[a * 3 + 1] + sommets[b * 3 + 1] + sommets[c * 3 + 1]) / 3
      let z = (sommets[a * 3 + 2] + sommets[b * 3 + 2] + sommets[c * 3 + 2]) / 3
      // Une coordonnée non finie ferait planter la conversion en entier.
      guard x.isFinite, y.isFinite, z.isFinite else { continue }
      if k == 2 {
        // Cent mille hauteurs suffisent à une médiane juste.
        if sol.count < 100_000 { sol.append(y) }
      } else {
        let cle = SIMD2<Int32>(Int32((x / pasDuPlafond).rounded(.down)), Int32((z / pasDuPlafond).rounded(.down)))
        plafond[cle, default: SIMD2<Float>(0, 0)] += SIMD2<Float>(y, 1)
      }
    }
  }

  // MARK: - Le coffre de volet roulant

  /// Tous les sommets du maillage, passés dans le monde — pour lire le
  /// relief au-dessus des baies une fois la pièce assemblée.
  static func sommetsDuMonde(_ ancres: [ARMeshAnchor]) -> [SIMD3<Float>] {
    var out = [SIMD3<Float>]()
    out.reserveCapacity(ancres.reduce(0) { $0 + $1.geometry.vertices.count })
    for ancre in ancres {
      let vs = ancre.geometry.vertices
      let t = ancre.transform
      let base = vs.buffer.contents().advanced(by: vs.offset)
      for i in 0..<vs.count {
        let p = base.advanced(by: i * vs.stride).assumingMemoryBound(to: Float.self)
        let w = t * SIMD4<Float>(p[0], p[1], p[2], 1)
        guard w.x.isFinite, w.y.isFinite, w.z.isFinite else { continue }
        out.append(SIMD3<Float>(w.x, w.y, w.z))
      }
    }
    return out
  }

  /// Une baie telle que RoomPlan la donne : son repère, sa largeur, sa hauteur.
  struct Baie {
    let id: String
    let transform: simd_float4x4
    let largeur: Float
    let hauteur: Float
  }

  static let pasDuProfil: Float = 0.02
  /// Le profil part dix centimètres sous le haut de la baie…
  static let depuisLeHaut: Float = -0.10
  /// … et monte d'un mètre en tout.
  static let tranchesDuProfil = 50

  /**
   LE RELIEF AU-DESSUS DE CHAQUE BAIE — relevé du patron : « les coffrages de
   volets roulants ne sont pas détectés ; pourtant il y a bien une forme
   différente d'un mur plat ».

   RoomPlan lisse le mur en un plan : le coffre y disparaît. Le maillage,
   lui, l'a vu. Pour chaque baie, on range les sommets qui la surplombent
   (sur sa largeur, dix centimètres retirés à chaque bout) en tranches de
   deux centimètres, et l'on garde de chaque tranche l'ÉCART MÉDIAN au plan
   de la baie, en centimètres, compté positif vers la pièce. Le même relevé
   sur une bande du mur voisin (de 25 à 60 cm au-delà des tableaux) sert de
   témoin : une saillie qui court aussi là est une retombée, pas un coffre.

   Le côté de la pièce est celui où la caméra est passée (`trajet`, x et z
   à la suite). Le JavaScript tranche (`geometry/coffreLidar`).
   */
  static func profilsAuDessus(
    sommets: [SIMD3<Float>], baies: [Baie], trajet: [Float]
  ) -> [String: [String: Any]] {
    var out: [String: [String: Any]] = [:]
    guard !sommets.isEmpty else { return out }
    let n = tranchesDuProfil
    for baie in baies {
      let t = baie.transform
      let c = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
      var ex = SIMD3<Float>(t.columns.0.x, 0, t.columns.0.z)
      guard simd_length(ex) > 1e-4, baie.largeur > 0.2 else { continue }
      ex = simd_normalize(ex)
      // La normale, à plat : perpendiculaire à la largeur.
      var nz = SIMD3<Float>(-ex.z, 0, ex.x)
      let demi = baie.largeur / 2
      let haut = c.y + baie.hauteur / 2

      // Le côté de la pièce : celui où la caméra est passée, à moins de 4 m.
      var devant = 0
      var derriere = 0
      var i = 0
      while i + 1 < trajet.count {
        let dx = trajet[i] - c.x
        let dz = trajet[i + 1] - c.z
        if dx * dx + dz * dz < 16 {
          let s = dx * nz.x + dz * nz.z
          if s > 0.1 { devant += 1 } else if s < -0.1 { derriere += 1 }
        }
        i += 2
      }
      let oriente = devant + derriere >= 3 && devant != derriere
      if oriente && derriere > devant { nz = -nz }

      var baieT = [[Float]](repeating: [], count: n)
      var temoinT = [[Float]](repeating: [], count: n)
      for p in sommets {
        let v = p.y - haut - depuisLeHaut
        guard v >= 0 else { continue }
        let k = Int(v / pasDuProfil)
        guard k < n else { continue }
        let dx = p.x - c.x
        let dz = p.z - c.z
        let w = dx * nz.x + dz * nz.z
        guard abs(w) <= 0.6 else { continue }
        let u = abs(dx * ex.x + dz * ex.z)
        let e = oriente ? w : abs(w)
        if u <= demi - 0.1 {
          baieT[k].append(e)
        } else if u >= demi + 0.25 && u <= demi + 0.6 {
          temoinT[k].append(e)
        }
      }
      func medianes(_ tranches: [[Float]]) -> ([Int], [Int]) {
        var m = [Int]()
        var comptes = [Int]()
        for x in tranches {
          comptes.append(x.count)
          if x.isEmpty {
            m.append(0)
          } else {
            let s = x.sorted()
            m.append(Int((s[s.count / 2] * 100).rounded()))
          }
        }
        return (m, comptes)
      }
      let (ecarts, nombres) = medianes(baieT)
      let (temoin, nombresTemoin) = medianes(temoinT)
      guard nombres.contains(where: { $0 > 0 }) else { continue }
      out[baie.id] = [
        "pas": pasDuProfil,
        "depuis": depuisLeHaut,
        "ecarts": ecarts,
        "nombres": nombres,
        "temoin": temoin,
        "nombresTemoin": nombresTemoin,
        "oriente": oriente,
      ]
    }
    return out
  }

  // MARK: - L'encadrement réel des baies

  /// Les tableaux et l'appui se lisent de dix centimètres DANS la baie…
  static let depuisLeBord: Float = -0.10
  /// … à trente centimètres sur le mur : vingt tranches de deux centimètres.
  static let tranchesDuBord = 20

  /**
   L'ENCADREMENT RÉEL DE CHAQUE BAIE — relevé du patron, vidéo d'un scan à
   l'appui : « l'encadrement de l'ouvrant n'est pas correctement pris en
   compte ; il y a une marge de quelques centimètres que le scan ne repère
   pas, pourtant bien visible à l'écran ».

   RoomPlan cadre la baie à quelques centimètres près : son rectangle tombe
   sur la face du linteau, au milieu du tableau. Le maillage voit où le mur
   plein reprend. Pour chaque côté de la baie (gauche : vers le bout A,
   droite : vers le bout B) et pour son appui, on range les sommets en
   tranches de deux centimètres, de dix centimètres dans la baie à trente
   sur le mur, et l'on garde de chaque tranche l'écart médian au plan de la
   baie (cm, positif vers la pièce) et le nombre de points. Les côtés se
   lisent sur la hauteur de la baie, quinze centimètres retirés en haut et
   en bas ; l'appui sur sa largeur, dix centimètres retirés à chaque bout.
   Le JavaScript lit où le mur reprend (`geometry/logique`).
   */
  static func profilsDesTableaux(
    sommets: [SIMD3<Float>], baies: [Baie], trajet: [Float]
  ) -> [String: [String: Any]] {
    var out: [String: [String: Any]] = [:]
    guard !sommets.isEmpty else { return out }
    let n = tranchesDuBord
    for baie in baies {
      let t = baie.transform
      let c = SIMD3<Float>(t.columns.3.x, t.columns.3.y, t.columns.3.z)
      var ex = SIMD3<Float>(t.columns.0.x, 0, t.columns.0.z)
      guard simd_length(ex) > 1e-4, baie.largeur > 0.3, baie.hauteur > 0.3 else { continue }
      ex = simd_normalize(ex)
      var nz = SIMD3<Float>(-ex.z, 0, ex.x)
      let demi = baie.largeur / 2
      let bas = c.y - baie.hauteur / 2
      let haut = c.y + baie.hauteur / 2

      // Le côté de la pièce : celui où la caméra est passée, à moins de 4 m.
      var devant = 0
      var derriere = 0
      var i = 0
      while i + 1 < trajet.count {
        let dx = trajet[i] - c.x
        let dz = trajet[i + 1] - c.z
        if dx * dx + dz * dz < 16 {
          let s = dx * nz.x + dz * nz.z
          if s > 0.1 { devant += 1 } else if s < -0.1 { derriere += 1 }
        }
        i += 2
      }
      let oriente = devant + derriere >= 3 && devant != derriere
      if oriente && derriere > devant { nz = -nz }

      var gaucheT = [[Float]](repeating: [], count: n)
      var droiteT = [[Float]](repeating: [], count: n)
      var dessousT = [[Float]](repeating: [], count: n)
      for p in sommets {
        let dx = p.x - c.x
        let dz = p.z - c.z
        let w = dx * nz.x + dz * nz.z
        guard abs(w) <= 0.6 else { continue }
        let e = oriente ? w : abs(w)
        let u = dx * ex.x + dz * ex.z
        if p.y >= bas + 0.15 && p.y <= haut - 0.15 {
          let vd = u - demi - depuisLeBord
          if vd >= 0 {
            let k = Int(vd / pasDuProfil)
            if k < n { droiteT[k].append(e) }
          }
          let vg = -u - demi - depuisLeBord
          if vg >= 0 {
            let k = Int(vg / pasDuProfil)
            if k < n { gaucheT[k].append(e) }
          }
        }
        if abs(u) <= demi - 0.1 {
          let vb = bas - depuisLeBord - p.y
          if vb >= 0 {
            let k = Int(vb / pasDuProfil)
            if k < n { dessousT[k].append(e) }
          }
        }
      }
      func medianes(_ tranches: [[Float]]) -> ([Int], [Int]) {
        var m = [Int]()
        var comptes = [Int]()
        for x in tranches {
          comptes.append(x.count)
          if x.isEmpty {
            m.append(0)
          } else {
            let s = x.sorted()
            m.append(Int((s[s.count / 2] * 100).rounded()))
          }
        }
        return (m, comptes)
      }
      let (gauche, nombresGauche) = medianes(gaucheT)
      let (droite, nombresDroite) = medianes(droiteT)
      let (dessous, nombresDessous) = medianes(dessousT)
      let vu = nombresGauche.contains(where: { $0 > 0 })
        || nombresDroite.contains(where: { $0 > 0 })
        || nombresDessous.contains(where: { $0 > 0 })
      guard vu else { continue }
      out[baie.id] = [
        "pas": pasDuProfil,
        "depuis": depuisLeBord,
        "gauche": gauche,
        "nombresGauche": nombresGauche,
        "droite": droite,
        "nombresDroite": nombresDroite,
        "dessous": dessous,
        "nombresDessous": nombresDessous,
        "oriente": oriente,
      ]
    }
    return out
  }

  static func volume(sol: [Float], plafond: [SIMD2<Int32>: SIMD2<Float>]) -> [String: Any]? {
    guard sol.count >= 20, !plafond.isEmpty else { return nil }
    let tries = sol.sorted()
    let solY = tries[tries.count / 2]
    let xs = plafond.keys.map { $0.x }
    let zs = plafond.keys.map { $0.y }
    guard let x0 = xs.min(), let x1 = xs.max(), let z0 = zs.min(), let z1 = zs.max() else { return nil }
    let cols = Int(x1 - x0) + 1
    let rangees = Int(z1 - z0) + 1
    // Un logement tient dans soixante mètres de côté : au-delà, c'est du bruit.
    guard cols > 0, rangees > 0, cols * rangees <= 60_000 else { return nil }
    var hauteurs = [Int](repeating: 0, count: cols * rangees)
    for (cle, v) in plafond where v.y >= 2 {
      let cm = Int(((v.x / v.y - solY) * 100).rounded())
      // Sous 60 cm ou au-dessus de six mètres, ce n'est pas un plafond.
      guard cm >= 60, cm <= 600 else { continue }
      hauteurs[Int(cle.y - z0) * cols + Int(cle.x - x0)] = cm
    }
    return [
      "sol": solY,
      "pas": pasDuPlafond,
      "minX": Float(x0) * pasDuPlafond,
      "minZ": Float(z0) * pasDuPlafond,
      "cols": cols,
      "rows": rangees,
      "plafond": hauteurs,
    ]
  }
}
