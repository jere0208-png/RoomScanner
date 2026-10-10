import Foundation
import RoomPlan
import simd

/**
 CE QU'ON VOIT PAR LA PORTE NE COMPTE PAS — pendant le scan.

 Relevé du patron : « si on est dans une pièce, ça ne scanne pas la pièce au
 fond derrière la porte ; il faut traverser l'ouvrant ». Le tri du relevé
 lui-même se fait à la fin, en JavaScript (`geometry/traversee.ts`) ; ce
 fichier en est la version de poche, pour les compteurs du scan : le mur du
 fond de la chambre, aperçu par la porte, ne fait pas « +1 », et ses bouts
 libres ne font pas croire qu'un mur manque.

 Même règle : un élément compte si un point du chemin de la caméra le voit en
 ligne droite sans traverser de mur. Les murs sont allongés de huit
 centimètres aux deux bouts, pour qu'un regard ne passe pas par l'interstice
 d'un coin.
 */
enum VuDuTrajet {
  struct Trait {
    let a: SIMD2<Float>
    let b: SIMD2<Float>
  }

  /// Le mur au sol, allongé de `allonge` à chaque bout.
  static func trait(_ s: CapturedRoom.Surface, allonge: Float) -> Trait {
    let t = s.transform
    let c = SIMD2<Float>(t.columns.3.x, t.columns.3.z)
    var u = SIMD2<Float>(t.columns.0.x, t.columns.0.z)
    let l: Float = simd_length(u)
    u = l > 1e-6 ? u / l : SIMD2<Float>(1, 0)
    let demi: Float = s.dimensions.x / 2 + allonge
    let d: SIMD2<Float> = u * demi
    return Trait(a: c - d, b: c + d)
  }

  private static func orient(_ p: SIMD2<Float>, _ q: SIMD2<Float>, _ r: SIMD2<Float>) -> Float {
    let a: Float = (q.x - p.x) * (r.y - p.y)
    let b: Float = (q.y - p.y) * (r.x - p.x)
    return a - b
  }

  /// Le segment [p, q] coupe-t-il franchement le trait ?
  private static func coupe(_ p: SIMD2<Float>, _ q: SIMD2<Float>, _ t: Trait) -> Bool {
    let d1 = orient(t.a, t.b, p)
    let d2 = orient(t.a, t.b, q)
    guard (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) else { return false }
    let d3 = orient(p, q, t.a)
    let d4 = orient(p, q, t.b)
    return (d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)
  }

  /// Un point est-il vu d'un point du chemin sans traverser de mur (hormis `sauf`) ?
  static func vu(_ cible: SIMD2<Float>, chemin: [SIMD2<Float>], murs: [Trait], sauf: Set<Int>) -> Bool {
    for p in chemin {
      let v: SIMD2<Float> = cible - p
      let L: Float = simd_length(v)
      if L < 0.05 { return true }
      let k: Float = max(0, (L - 0.04) / L)
      let fin: SIMD2<Float> = p + v * k
      var libre = true
      for (i, m) in murs.enumerated() where !sauf.contains(i) {
        if coupe(p, fin, m) {
          libre = false
          break
        }
      }
      if libre { return true }
    }
    return false
  }

  /// Les murs parallèles qui passent à moins de `ecart` du milieu de `s` : ses porteurs.
  static func porteurs(_ s: Trait, murs: [Trait], ecart: Float) -> Set<Int> {
    let ab: SIMD2<Float> = s.b - s.a
    let l: Float = simd_length(ab)
    guard l > 1e-6 else { return [] }
    let u: SIMD2<Float> = ab / l
    let somme: SIMD2<Float> = s.a + s.b
    let m: SIMD2<Float> = somme * 0.5
    var out = Set<Int>()
    for (i, w) in murs.enumerated() {
      let wv: SIMD2<Float> = w.b - w.a
      let wl: Float = simd_length(wv)
      guard wl > 1e-6 else { continue }
      let v: SIMD2<Float> = wv / wl
      if abs(simd_dot(u, v)) < 0.97 { continue }
      let r: SIMD2<Float> = m - w.a
      let le: Float = simd_dot(r, v)
      let travers: Float = abs(r.x * -v.y + r.y * v.x)
      if travers <= ecart, le >= -0.1, le <= wl + 0.1 { out.insert(i) }
    }
    return out
  }

  /**
   Ce que le chemin voit de la pièce : les murs, ouvertures et meubles qui
   comptent. Sans chemin assez long, tout compte — on ne trie pas à l'aveugle.
   */
  static func filtrer(_ room: CapturedRoom, chemin brut: [Float]) -> (
    murs: [CapturedRoom.Surface], portes: Int, fenetres: Int, objets: Int
  ) {
    var chemin: [SIMD2<Float>] = []
    var i = 0
    while i + 1 < brut.count {
      chemin.append(SIMD2<Float>(brut[i], brut[i + 1]))
      i += 2
    }
    // Pendant le scan, cent cinquante regards suffisent à juger.
    if chemin.count > 150 {
      let pas = Double(chemin.count) / 150
      chemin = (0..<150).map { chemin[Int(Double($0) * pas)] }
    }
    guard chemin.count >= 3, room.walls.count >= 3 else {
      return (room.walls, room.doors.count, room.windows.count, room.objects.count)
    }
    let traits = room.walls.map { trait($0, allonge: 0.08) }
    var murs: [CapturedRoom.Surface] = []
    for (k, w) in room.walls.enumerated() {
      let t = trait(w, allonge: 0)
      var sauf = porteurs(t, murs: traits, ecart: 0.12)
      sauf.insert(k)
      let ab: SIMD2<Float> = t.b - t.a
      for f in [Float(0.15), 0.5, 0.85] {
        let p: SIMD2<Float> = t.a + ab * f
        if vu(p, chemin: chemin, murs: traits, sauf: sauf) {
          murs.append(w)
          break
        }
      }
    }
    // Trop peu de murs gardés : le chemin n'est sans doute pas dans leur repère.
    guard murs.count >= 3 else {
      return (room.walls, room.doors.count, room.windows.count, room.objects.count)
    }
    func ouverture(_ s: CapturedRoom.Surface) -> Bool {
      let t = trait(s, allonge: 0)
      let somme: SIMD2<Float> = t.a + t.b
      let m: SIMD2<Float> = somme * 0.5
      return vu(m, chemin: chemin, murs: traits, sauf: porteurs(t, murs: traits, ecart: 0.25))
    }
    let portes = room.doors.filter(ouverture).count
    let fenetres = room.windows.filter(ouverture).count
    let objets = room.objects.filter { o in
      let c = SIMD2<Float>(o.transform.columns.3.x, o.transform.columns.3.z)
      return vu(c, chemin: chemin, murs: traits, sauf: [])
    }.count
    return (murs, portes, fenetres, objets)
  }
}
