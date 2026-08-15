import Foundation
import ARKit
import CoreVideo
import RoomPlan
import simd

/// Incidence minimale pour retenir un échantillon (cosinus de l'angle de vue).
private let kMinIncidence: Float = 0.25

/**
 Relevé des couleurs de la pièce pendant le scan.

 RoomPlan ne rend que de la géométrie : le modèle exporté est uniformément
 blanc. On échantillonne donc en parallèle les images de la caméra ARKit et
 on projette les surfaces détectées dedans, ce qui donne pour chaque mur une
 petite grille de couleurs (une « texture » très basse résolution), une
 couleur moyenne par meuble, et une carte de couleurs du sol.

 Tout est fait en lecture seule sur la session ARKit de RoomPlan : on lit
 `currentFrame` à cadence réduite, sans jamais devenir son delegate — la
 capture RoomPlan n'est donc pas perturbée.
 */
@available(iOS 16.0, *)
final class RoomColorSampler {

  static let shared = RoomColorSampler()

  /// Résolution de la grille relevée sur un mur (le long × en hauteur).
  private static let wallCols = 6
  private static let wallRows = 4
  /// Côté d'une case du sol, en mètres.
  private static let floorCell: Float = 0.4
  /// Cadence de lecture des images (Hz). Au-delà on paie sans rien gagner.
  private static let rate = 3.0

  // MARK: - Accumulateurs

  private struct Accum {
    var sum: [SIMD3<Float>]
    var count: [Int]
    /// Repères géométriques : servent à rattacher un relevé à la surface
    /// finale quand RoomPlan a renuméroté ses identifiants au post-traitement.
    var center = SIMD3<Float>(repeating: 0)
    var axis = SIMD3<Float>(repeating: 0)

    init(cells: Int) {
      sum = Array(repeating: SIMD3<Float>(repeating: 0), count: cells)
      count = Array(repeating: 0, count: cells)
    }

    mutating func add(_ i: Int, _ c: SIMD3<Float>) {
      sum[i] += c
      count[i] += 1
    }

    /// Moyenne globale (toutes cases confondues).
    var mean: SIMD3<Float>? {
      var s = SIMD3<Float>(repeating: 0)
      var n = 0
      for i in 0..<sum.count { s += sum[i]; n += count[i] }
      return n > 0 ? s / Float(n) : nil
    }

    func cell(_ i: Int) -> SIMD3<Float>? {
      count[i] > 0 ? sum[i] / Float(count[i]) : nil
    }
  }

  private let queue = DispatchQueue(label: "com.roomscan.color")
  private var timer: DispatchSourceTimer?
  private weak var session: ARSession?
  private var room: CapturedRoom?
  private var walls: [UUID: Accum] = [:]
  private var objects: [UUID: Accum] = [:]
  /// Sol : grille monde à pas fixe, la pièce peut grandir en cours de scan.
  private var floorTiles: [Int64: (SIMD3<Float>, Int)] = [:]

  // MARK: - Cycle de vie

  /// Démarre la lecture périodique sur la session ARKit de RoomPlan.
  func attach(to session: ARSession) {
    queue.async {
      self.session = session
      guard self.timer == nil else { return }
      let t = DispatchSource.makeTimerSource(queue: self.queue)
      t.schedule(deadline: .now() + 0.5, repeating: 1.0 / Self.rate)
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

  /// Repart de zéro : appelé au démarrage d'un nouveau scan.
  func reset() {
    queue.async {
      self.walls.removeAll()
      self.objects.removeAll()
      self.floorTiles.removeAll()
      self.room = nil
    }
  }

  /// Dernier état connu de la pièce (émis par RoomPlan en temps réel).
  func update(room: CapturedRoom) {
    queue.async { self.room = room }
  }

  // MARK: - Échantillonnage

  private func tick() {
    guard let session = session, let room = room,
          let frame = session.currentFrame else { return }
    guard case .normal = frame.camera.trackingState else { return }
    guard let img = FrameImage(frame: frame) else { return }
    defer { img.release() }

    for wall in room.walls {
      sampleSurface(wall, img: img)
    }
    sampleFloor(room, img: img)
    for object in room.objects {
      sampleObject(object, img: img)
    }
  }

  /// Un mur : grille régulière sur sa face, cases indexées ligne par ligne
  /// (ligne 0 = haut, colonne 0 = extrémité « A » du segment).
  private func sampleSurface(_ s: CapturedRoom.Surface, img: FrameImage) {
    let cols = Self.wallCols
    let rows = Self.wallRows
    var acc = walls[s.identifier] ?? Accum(cells: cols * rows)
    let w = s.dimensions.x
    let h = s.dimensions.y
    let m = s.transform
    acc.center = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
    acc.axis = normalize(SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z))
    let normal = normalize(SIMD3(m.columns.2.x, m.columns.2.y, m.columns.2.z))

    for row in 0..<rows {
      for col in 0..<cols {
        let u = (Float(col) + 0.5) / Float(cols) * w - w / 2
        let v = h / 2 - (Float(row) + 0.5) / Float(rows) * h
        let world4 = m * SIMD4<Float>(u, v, 0, 1)
        let world = SIMD3(world4.x, world4.y, world4.z)
        if let c = img.color(at: world, normal: normal) {
          acc.add(row * cols + col, c)
        }
      }
    }
    walls[s.identifier] = acc
  }

  /// Le sol : grille monde à pas fixe. iOS 17 donne les surfaces de sol ;
  /// avant, on retombe sur le plan passant par la base des murs.
  private func sampleFloor(_ room: CapturedRoom, img: FrameImage) {
    let up = SIMD3<Float>(0, 1, 0)
    var planes: [(y: Float, minX: Float, maxX: Float, minZ: Float, maxZ: Float)] = []

    if #available(iOS 17.0, *), !room.floors.isEmpty {
      for f in room.floors {
        let m = f.transform
        let c = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        // Le sol est orienté librement : on couvre un carré englobant plutôt
        // que de tourner la grille. Les cases hors pièce sont écartées par la
        // profondeur, ou tombent sur le bas d'un mur — sans conséquence.
        let half = max(f.dimensions.x, f.dimensions.y) / 2
        planes.append((c.y, c.x - half, c.x + half, c.z - half, c.z + half))
      }
    } else if !room.walls.isEmpty {
      var y = Float.greatestFiniteMagnitude
      var minX = Float.greatestFiniteMagnitude, maxX = -Float.greatestFiniteMagnitude
      var minZ = Float.greatestFiniteMagnitude, maxZ = -Float.greatestFiniteMagnitude
      for wall in room.walls {
        let m = wall.transform
        let c = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        y = min(y, c.y - wall.dimensions.y / 2)
        let axis = SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z)
        let half = wall.dimensions.x / 2
        for sign in [Float(-1), 1] {
          minX = min(minX, c.x + axis.x * half * sign)
          maxX = max(maxX, c.x + axis.x * half * sign)
          minZ = min(minZ, c.z + axis.z * half * sign)
          maxZ = max(maxZ, c.z + axis.z * half * sign)
        }
      }
      planes.append((y, minX, maxX, minZ, maxZ))
    }

    let cell = Self.floorCell
    for p in planes {
      // Garde-fou : une détection aberrante ne doit pas lancer un balayage
      // de plusieurs milliers de cases par image.
      guard p.maxX - p.minX < 40, p.maxZ - p.minZ < 40 else { continue }
      var i = Int(floor(p.minX / cell))
      let iMax = Int(floor(p.maxX / cell))
      while i <= iMax {
        var j = Int(floor(p.minZ / cell))
        let jMax = Int(floor(p.maxZ / cell))
        while j <= jMax {
          let world = SIMD3<Float>(
            (Float(i) + 0.5) * cell, p.y, (Float(j) + 0.5) * cell)
          if let c = img.color(at: world, normal: up) {
            let key = (Int64(i) << 32) | Int64(UInt32(bitPattern: Int32(j)))
            let cur = floorTiles[key] ?? (SIMD3<Float>(repeating: 0), 0)
            floorTiles[key] = (cur.0 + c, cur.1 + 1)
          }
          j += 1
        }
        i += 1
      }
    }
  }

  /// Un meuble : quelques points sur ses faces visibles, moyennés ensemble.
  private func sampleObject(_ o: CapturedRoom.Object, img: FrameImage) {
    var acc = objects[o.identifier] ?? Accum(cells: 1)
    let m = o.transform
    acc.center = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
    let d = o.dimensions
    // Dessus + quatre flancs, 2 × 2 points chacun.
    let faces: [(SIMD3<Float>, SIMD3<Float>, SIMD3<Float>)] = [
      (SIMD3(0, d.y / 2, 0), SIMD3(d.x / 2, 0, 0), SIMD3(0, 0, d.z / 2)),
      (SIMD3(0, 0, d.z / 2), SIMD3(d.x / 2, 0, 0), SIMD3(0, d.y / 2, 0)),
      (SIMD3(0, 0, -d.z / 2), SIMD3(d.x / 2, 0, 0), SIMD3(0, d.y / 2, 0)),
      (SIMD3(d.x / 2, 0, 0), SIMD3(0, 0, d.z / 2), SIMD3(0, d.y / 2, 0)),
      (SIMD3(-d.x / 2, 0, 0), SIMD3(0, 0, d.z / 2), SIMD3(0, d.y / 2, 0)),
    ]
    for (center, ax1, ax2) in faces {
      let nLocal = cross(ax1, ax2)
      guard length(nLocal) > 1e-5 else { continue }
      let n4 = m * SIMD4<Float>(nLocal.x, nLocal.y, nLocal.z, 0)
      let normal = normalize(SIMD3(n4.x, n4.y, n4.z))
      for su in [Float(-0.45), 0.45] {
        for sv in [Float(-0.45), 0.45] {
          let local = center + ax1 * su + ax2 * sv
          let w4 = m * SIMD4<Float>(local.x, local.y, local.z, 1)
          if let c = img.color(at: SIMD3(w4.x, w4.y, w4.z), normal: normal) {
            acc.add(0, c)
          }
        }
      }
    }
    objects[o.identifier] = acc
  }

  // MARK: - Résultat

  /// Couleur et texture d'une surface finale, prêtes pour le pont JS.
  func payload(for s: CapturedRoom.Surface) -> [String: Any] {
    queue.sync { () -> [String: Any] in
      guard let acc = match(s) else { return [:] }
      guard let mean = acc.mean else { return [:] }
      var out: [String: Any] = ["color": Self.hex(mean)]
      let cols = Self.wallCols
      let rows = Self.wallRows
      if acc.sum.count == cols * rows {
        // Les cases jamais vues reprennent la moyenne : pas de trou noir.
        let texels = (0..<(cols * rows)).map { Self.hex(acc.cell($0) ?? mean) }
        out["texture"] = ["cols": cols, "rows": rows, "texels": texels]
      }
      return out
    }
  }

  func color(for o: CapturedRoom.Object) -> String? {
    queue.sync { () -> String? in
      if let mean = objects[o.identifier]?.mean { return Self.hex(mean) }
      // Même renumérotation qu'au post-traitement des murs : on rattache le
      // relevé au meuble le plus proche, à défaut d'identifiant commun.
      let m = o.transform
      let center = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
      var best: (SIMD3<Float>, Float)?
      for acc in objects.values {
        guard let mean = acc.mean else { continue }
        let d = distance(acc.center, center)
        guard d < 0.4 else { continue }
        if best == nil || d < best!.1 { best = (mean, d) }
      }
      return best.map { Self.hex($0.0) }
    }
  }

  /**
   Carte de couleurs du sol, recadrée sur les cases réellement relevées.

   La carte couvre tout le scan : le rendu ne peint que les cases tombant
   dans le contour d'une pièce, la découpe se fait donc côté JS.
   */
  func floorPayload() -> [String: Any]? {
    queue.sync { () -> [String: Any]? in
      guard !floorTiles.isEmpty else { return nil }
      let cell = Self.floorCell
      var i0 = Int.max, i1 = Int.min, j0 = Int.max, j1 = Int.min
      var total = SIMD3<Float>(repeating: 0)
      var n = 0
      for (key, value) in floorTiles {
        let i = Int(key >> 32)
        let j = Int(Int32(bitPattern: UInt32(truncatingIfNeeded: key)))
        i0 = min(i0, i); i1 = max(i1, i)
        j0 = min(j0, j); j1 = max(j1, j)
        total += value.0
        n += value.1
      }
      guard n > 0, i0 <= i1, j0 <= j1 else { return nil }
      let mean = total / Float(n)
      let cols = i1 - i0 + 1
      let rows = j1 - j0 + 1
      // Au-delà, la grille pèse plus qu'elle n'apporte au rendu.
      guard cols <= 64, rows <= 64 else { return ["color": Self.hex(mean)] }

      var texels: [String] = []
      texels.reserveCapacity(cols * rows)
      for j in j0...j1 {
        for i in i0...i1 {
          let key = (Int64(i) << 32) | Int64(UInt32(bitPattern: Int32(j)))
          if let v = floorTiles[key], v.1 > 0 {
            texels.append(Self.hex(v.0 / Float(v.1)))
          } else {
            texels.append(Self.hex(mean))
          }
        }
      }
      return [
        "color": Self.hex(mean),
        "texture": [
          "cols": cols,
          "rows": rows,
          "texels": texels,
          "minX": Float(i0) * cell,
          "maxX": Float(i1 + 1) * cell,
          "minZ": Float(j0) * cell,
          "maxZ": Float(j1 + 1) * cell,
        ],
      ]
    }
  }

  /// Couleur moyenne de tous les murs : sert à teinter le modèle USDZ.
  func averageWallColor() -> SIMD3<Float>? {
    queue.sync { () -> SIMD3<Float>? in
      var s = SIMD3<Float>(repeating: 0)
      var n = 0
      for acc in walls.values {
        if let m = acc.mean { s += m; n += 1 }
      }
      return n > 0 ? s / Float(n) : nil
    }
  }

  func averageFloorColor() -> SIMD3<Float>? {
    queue.sync { () -> SIMD3<Float>? in
      var s = SIMD3<Float>(repeating: 0)
      var n = 0
      for v in floorTiles.values { s += v.0; n += v.1 }
      return n > 0 ? s / Float(n) : nil
    }
  }

  /// Rattache une surface finale à son relevé : par identifiant, sinon par
  /// position et orientation (RoomPlan fusionne des murs au post-traitement).
  private func match(_ s: CapturedRoom.Surface) -> Accum? {
    if let direct = walls[s.identifier] { return direct }
    let m = s.transform
    let center = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
    let axis = normalize(SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z))
    var best: (Accum, Float)?
    for acc in walls.values {
      guard acc.mean != nil else { continue }
      let d = distance(acc.center, center)
      guard d < 0.7, abs(dot(acc.axis, axis)) > 0.94 else { continue }
      if best == nil || d < best!.1 { best = (acc, d) }
    }
    return best?.0
  }

  static func hex(_ c: SIMD3<Float>) -> String {
    let r = Int(max(0, min(255, c.x.rounded())))
    let g = Int(max(0, min(255, c.y.rounded())))
    let b = Int(max(0, min(255, c.z.rounded())))
    return String(format: "#%02X%02X%02X", r, g, b)
  }
}

// MARK: - Lecture d'une image caméra

/**
 Une image ARKit prête à être interrogée en coordonnées monde.

 La projection passe par la pose et les intrinsèques de la caméra, donc
 directement dans le repère de `capturedImage` (paysage) : aucune histoire
 d'orientation d'interface à gérer. Quand la carte de profondeur LiDAR est
 disponible, elle sert à écarter les points cachés par un obstacle.
 */
@available(iOS 16.0, *)
private struct FrameImage {
  let buffer: CVPixelBuffer
  let depth: CVPixelBuffer?
  let width: Int
  let height: Int
  let camPos: SIMD3<Float>
  let camInv: simd_float4x4
  let fx: Float, fy: Float, cx: Float, cy: Float
  let fullRange: Bool

  init?(frame: ARFrame) {
    let b = frame.capturedImage
    guard CVPixelBufferLockBaseAddress(b, .readOnly) == kCVReturnSuccess else {
      return nil
    }
    buffer = b
    width = CVPixelBufferGetWidth(b)
    height = CVPixelBufferGetHeight(b)
    let fmt = CVPixelBufferGetPixelFormatType(b)
    fullRange = fmt == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
    guard CVPixelBufferGetPlaneCount(b) >= 2 else {
      CVPixelBufferUnlockBaseAddress(b, .readOnly)
      return nil
    }

    let d = frame.sceneDepth?.depthMap ?? frame.smoothedSceneDepth?.depthMap
    if let d = d, CVPixelBufferLockBaseAddress(d, .readOnly) == kCVReturnSuccess {
      depth = d
    } else {
      depth = nil
    }

    let t = frame.camera.transform
    camPos = SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    camInv = t.inverse
    let k = frame.camera.intrinsics
    fx = k.columns.0.x
    fy = k.columns.1.y
    cx = k.columns.2.x
    cy = k.columns.2.y
  }

  func release() {
    CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
    if let d = depth { CVPixelBufferUnlockBaseAddress(d, .readOnly) }
  }

  /// Couleur (0…255 par canal) du point monde, ou nil s'il n'est pas
  /// visible : hors champ, vu de trop biais, ou caché par un obstacle.
  func color(at world: SIMD3<Float>, normal: SIMD3<Float>) -> SIMD3<Float>? {
    let toCam = camPos - world
    let dist = length(toCam)
    guard dist > 0.2, dist < 8 else { return nil }
    // Le signe de la normale dépend de la convention RoomPlan : on ne
    // regarde que l'incidence. L'occultation est traitée par la profondeur.
    guard abs(dot(normal, toCam / dist)) > kMinIncidence else { return nil }

    let p = camInv * SIMD4<Float>(world.x, world.y, world.z, 1)
    // Repère ARKit : +X à droite, +Y en haut, −Z devant l'objectif.
    let z = -p.z
    guard z > 0.15 else { return nil }
    let u = fx * (p.x / z) + cx
    let v = fy * (-p.y / z) + cy
    let ix = Int(u.rounded())
    let iy = Int(v.rounded())
    // Marge de bord : les pixels extrêmes sont les plus déformés.
    guard ix >= 8, iy >= 8, ix < width - 8, iy < height - 8 else { return nil }

    if let d = depth {
      let dw = CVPixelBufferGetWidth(d)
      let dh = CVPixelBufferGetHeight(d)
      let dx = min(dw - 1, max(0, Int(u / Float(width) * Float(dw))))
      let dy = min(dh - 1, max(0, Int(v / Float(height) * Float(dh))))
      let row = CVPixelBufferGetBaseAddress(d)!
        .advanced(by: dy * CVPixelBufferGetBytesPerRow(d))
        .assumingMemoryBound(to: Float32.self)
      let measured = row[dx]
      // Quelque chose de nettement plus proche : le point est masqué.
      if measured > 0.05 && measured < z - 0.25 { return nil }
    }

    return yuv(x: ix, y: iy)
  }

  /// Conversion Y'CbCr (BT.601) → RGB 0…255.
  private func yuv(x: Int, y: Int) -> SIMD3<Float> {
    let yRow = CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!
      .advanced(by: y * CVPixelBufferGetBytesPerRowOfPlane(buffer, 0))
      .assumingMemoryBound(to: UInt8.self)
    let cRow = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)!
      .advanced(by: (y / 2) * CVPixelBufferGetBytesPerRowOfPlane(buffer, 1))
      .assumingMemoryBound(to: UInt8.self)
    var yy = Float(yRow[x])
    let cb = Float(cRow[(x / 2) * 2]) - 128
    let cr = Float(cRow[(x / 2) * 2 + 1]) - 128
    if !fullRange {
      yy = (yy - 16) * (255.0 / 219.0)
    }
    return SIMD3(
      yy + 1.402 * cr,
      yy - 0.344136 * cb - 0.714136 * cr,
      yy + 1.772 * cb)
  }
}
