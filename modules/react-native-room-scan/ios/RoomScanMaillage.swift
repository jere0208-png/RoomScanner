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
    guard let frame = session.currentFrame else {
      return ["ancres": 0, "faces": 0, "sommets": 0, "classe": false]
    }
    let ancres = frame.anchors.compactMap { $0 as? ARMeshAnchor }
    guard !ancres.isEmpty else {
      return ["ancres": 0, "faces": 0, "sommets": 0, "classe": false]
    }

    var data = Data()
    data.append(contentsOf: Array("EPM1".utf8))
    func u32(_ v: Int) {
      var x = UInt32(max(0, v)).littleEndian
      withUnsafeBytes(of: &x) { data.append(contentsOf: $0) }
    }
    u32(ancres.count)
    var nSommets = 0
    var nFaces = 0
    var classe = false

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
      flottants.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }

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
      indices.withUnsafeBufferPointer { data.append(Data(buffer: $0)) }

      // La classe de chaque face, un octet (ARMeshClassification).
      if let c = g.classification {
        let cb = c.buffer.contents().advanced(by: c.offset)
        var classes = [UInt8](repeating: 0, count: m)
        for i in 0..<m {
          classes[i] = cb.advanced(by: i * c.stride).assumingMemoryBound(to: UInt8.self).pointee
        }
        data.append(contentsOf: classes)
        classe = true
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
}
