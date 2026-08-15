import Foundation
import RoomPlan
import SceneKit
import simd
import React

/// Détient la session RoomPlan. La vue (RoomScanViewManager) et le module
/// bridge (RoomScanModule) parlent tous deux à ce singleton.
@available(iOS 16.0, *)
final class RoomScanManager: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {

  static let shared = RoomScanManager()

  private(set) var captureView: RoomCaptureView?
  private let configuration = RoomCaptureSession.Configuration()
  private var stopResolver: RCTPromiseResolveBlock?
  private var stopRejecter: RCTPromiseRejectBlock?
  private var lastLiveEmit = Date.distantPast
  // startRoomScan() est appelé côté JS AVANT que la vue AR soit montée :
  // on mémorise la demande et on lance la session à la création de la vue.
  private var pendingStart = false

  // MARK: - Multi-pièces (iOS 17+)
  //
  // Une pièce se clôt par `stop(pauseARSession: false)` : la session RoomPlan
  // s'arrête et se post-traite, mais la session ARKit sous-jacente RESTE
  // vivante. On marche jusqu'à la pièce suivante, on relance une capture, et
  // comme le repère monde d'ARKit n'a pas bougé, toutes les pièces sortent
  // déjà recalées les unes par rapport aux autres — sans aucun recollement
  // géométrique à faire côté JS.

  /// Données brutes de chaque pièce close, dans l'ordre de capture.
  private var roomData: [CapturedRoomData] = []
  /// Pièces post-traitées, exprimées dans le repère commun de la session.
  private var rooms: [CapturedRoom] = []
  /// Promesse de `finishRoom` en attente du post-traitement de la pièce.
  private var roomResolver: RCTPromiseResolveBlock?
  private var roomRejecter: RCTPromiseRejectBlock?
  /// true dès la première pièce close : la vue ne présente plus le résultat,
  /// c'est nous qui post-traitons (RoomBuilder) puis assemblons.
  private var multiRoom = false

  override init() { super.init() }

  // RoomCaptureViewDelegate hérite de NSCoding : implémentations requises.
  func encode(with coder: NSCoder) {}
  required init?(coder: NSCoder) { super.init() }

  // MARK: - Cycle de vie de la vue

  func makeCaptureView() -> RoomCaptureView {
    let view = RoomCaptureView(frame: .zero)
    view.delegate = self
    view.captureSession.delegate = self
    captureView = view
    // Relevé des couleurs : lecture seule sur la session ARKit de RoomPlan.
    RoomColorSampler.shared.attach(to: view.captureSession.arSession)
    if pendingStart {
      pendingStart = false
      view.captureSession.run(configuration: configuration)
    }
    return view
  }

  // MARK: - Commandes du bridge

  /// `fresh` : nouveau scan (les couleurs relevées repartent de zéro).
  /// Une reprise après pause conserve ce qui a déjà été relevé.
  func start(fresh: Bool = true) {
    if fresh {
      RoomColorSampler.shared.reset()
      roomData.removeAll()
      rooms.removeAll()
      multiRoom = false
    }
    DispatchQueue.main.async {
      // Une vue d'un scan précédent peut encore traîner, détachée de l'écran :
      // ne relancer la session que sur une vue réellement affichée.
      if let view = self.captureView, view.window != nil {
        RoomColorSampler.shared.attach(to: view.captureSession.arSession)
        view.captureSession.run(configuration: self.configuration)
      } else {
        self.pendingStart = true
      }
    }
  }

  func pause() {
    RoomColorSampler.shared.detach()
    DispatchQueue.main.async {
      if #available(iOS 17.0, *) {
        // Garde la session ARKit chaude : la reprise relocalise
        // au lieu de repartir de zéro.
        self.captureView?.captureSession.stop(pauseARSession: false)
      } else {
        self.captureView?.captureSession.stop()
      }
    }
  }

  func resume() { start(fresh: false) }

  func stop(resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {
    stopResolver = resolve
    stopRejecter = reject
    // La session se fige : continuer à lire `currentFrame` ne ferait que
    // rejouer la dernière image et fausser les moyennes.
    RoomColorSampler.shared.detach()
    // Déclenche le post-traitement RoomPlan ; le résultat final
    // arrive dans captureView(didPresent:error:).
    DispatchQueue.main.async {
      self.captureView?.captureSession.stop()
    }
  }

  private func clearPromise() { stopResolver = nil; stopRejecter = nil }

  // MARK: - Multi-pièces

  /// Clôt la pièce courante en gardant la session ARKit chaude.
  /// La promesse se résout quand RoomBuilder a fini de post-traiter.
  @available(iOS 17.0, *)
  func finishRoom(resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
    guard roomResolver == nil else {
      reject("ROOM_BUSY", "Une pièce est déjà en cours de traitement", nil)
      return
    }
    multiRoom = true
    roomResolver = resolve
    roomRejecter = reject
    // La géométrie ne bougera plus : inutile de continuer à lire la caméra.
    RoomColorSampler.shared.detach()
    DispatchQueue.main.async {
      self.captureView?.captureSession.stop(pauseARSession: false)
    }
  }

  /// Relance la capture pour la pièce suivante, dans le même repère monde.
  func nextRoom() {
    DispatchQueue.main.async {
      guard let view = self.captureView else {
        self.pendingStart = true
        return
      }
      RoomColorSampler.shared.attach(to: view.captureSession.arSession)
      view.captureSession.run(configuration: self.configuration)
    }
  }

  /// Assemble les pièces closes, exporte le modèle et rend le tout au JS.
  @available(iOS 17.0, *)
  func finishScan(resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
    RoomColorSampler.shared.detach()
    let captured = rooms
    let raw = roomData
    guard !captured.isEmpty else {
      reject("NO_ROOM", "Aucune pièce terminée", nil)
      return
    }
    Task {
      let docs = FileManager.default.urls(for: .documentDirectory,
                                          in: .userDomainMask)[0]
      let usdzURL = docs.appendingPathComponent("scan-\(UUID().uuidString).usdz")
      var exported = false

      // Plusieurs pièces : StructureBuilder les fusionne en un seul volume
      // (murs mitoyens dédoublonnés). Le modèle n'est qu'un livrable : si
      // l'assemblage échoue, le plan reste juste, on exporte la 1re pièce.
      if captured.count > 1 {
        do {
          let structure = try await StructureBuilder(options: [.beautifyObjects])
            .capturedStructure(from: raw)
          try structure.export(to: usdzURL, exportOptions: .parametric)
          exported = true
        } catch {
          exported = false
        }
      }
      if !exported {
        do {
          try captured[0].export(to: usdzURL, exportOptions: .parametric)
          exported = true
        } catch {
          exported = false
        }
      }
      if exported { Self.tintModel(at: usdzURL) }

      var payload: [String: Any] = [
        "rooms": captured.enumerated().map { Self.roomJSON($0.element, index: $0.offset) },
      ]
      if exported { payload["modelPath"] = usdzURL.path }
      RoomColorSampler.shared.detach()
      DispatchQueue.main.async { resolve(payload) }
    }
  }

  /// Une pièce complète pour le pont JS : géométrie + couleurs + sol recadré.
  static func roomJSON(_ room: CapturedRoom, index: Int) -> [String: Any] {
    var out: [String: Any] = [
      "id": "room-\(index + 1)",
      "surfaces": surfacesJSON(room, withColors: true),
      "objects": objectsJSON(room, withColors: true),
    ]
    if let label = roomLabel(room) { out["label"] = label }
    if let floor = RoomColorSampler.shared.floorPayload(within: footprint(of: room)) {
      out["floor"] = floor
    }
    return out
  }

  /// Étiquette RoomPlan de la pièce (`livingRoom`, `kitchen`…), si classée.
  static func roomLabel(_ room: CapturedRoom) -> String? {
    guard #available(iOS 17.0, *) else { return nil }
    guard let section = room.sections.first else { return nil }
    return String(describing: section.label)
  }

  /// Emprise au sol d'une pièce (mètres, repère monde) d'après ses murs.
  static func footprint(of room: CapturedRoom) -> (minX: Float, maxX: Float,
                                                   minZ: Float, maxZ: Float)? {
    var minX = Float.greatestFiniteMagnitude
    var maxX = -Float.greatestFiniteMagnitude
    var minZ = Float.greatestFiniteMagnitude
    var maxZ = -Float.greatestFiniteMagnitude
    for wall in room.walls {
      let m = wall.transform
      let c = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
      let dir = SIMD3(m.columns.0.x, m.columns.0.y, m.columns.0.z)
      let half = wall.dimensions.x / 2
      for end in [c - dir * half, c + dir * half] {
        minX = min(minX, end.x); maxX = max(maxX, end.x)
        minZ = min(minZ, end.z); maxZ = max(maxZ, end.z)
      }
    }
    guard minX < maxX, minZ < maxZ else { return nil }
    return (minX, maxX, minZ, maxZ)
  }

  // MARK: - RoomCaptureViewDelegate (résultat final)

  // true = laisser RoomPlan post-traiter et présenter le résultat. En
  // multi-pièces c'est nous qui post-traitons (RoomBuilder), pièce par pièce.
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData,
                   error: Error?) -> Bool {
    return !multiRoom
  }

  // Le modèle final, nettoyé et paramétrique.
  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    if let error = error {
      stopRejecter?("SCAN_PROCESSING_FAILED", error.localizedDescription, error)
      clearPromise()
      return
    }

    do {
      let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      let usdzURL = docs.appendingPathComponent("scan-\(UUID().uuidString).usdz")
      // .parametric = murs/portes propres (pas le maillage brut).
      try processedResult.export(to: usdzURL, exportOptions: .parametric)
      // L'USDZ RoomPlan est blanc uniforme : invisible sur le fond blanc
      // de Quick Look. On le teinte, avec les couleurs relevées si on en a.
      Self.tintModel(at: usdzURL)

      var payload: [String: Any] = [
        "modelPath": usdzURL.path,
        "surfaces": Self.surfacesJSON(processedResult, withColors: true),
        "objects": Self.objectsJSON(processedResult, withColors: true),
      ]
      if let floor = RoomColorSampler.shared.floorPayload() {
        payload["floor"] = floor
      }
      RoomColorSampler.shared.detach()
      stopResolver?(payload)
    } catch {
      stopRejecter?("EXPORT_FAILED", error.localizedDescription, error)
    }
    clearPromise()
  }

  // MARK: - RoomCaptureSessionDelegate (temps réel)

  func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
    // Le releveur de couleurs a besoin de la géométrie la plus fraîche
    // possible : on la lui passe à chaque mise à jour, sans throttle.
    RoomColorSampler.shared.update(room: room)
    // Throttle à 2 Hz : le JS n'a besoin que d'un aperçu.
    guard Date().timeIntervalSince(lastLiveEmit) > 0.5 else { return }
    lastLiveEmit = Date()
    RoomScanEvents.shared?.emit(name: "onScanUpdate", body: [
      "wallCount": room.walls.count,
      "objectCount": room.objects.count,
      "doorCount": room.doors.count,
      "windowCount": room.windows.count,
      "surfaces": Self.surfacesJSON(room),
    ])
  }

  func captureSession(_ session: RoomCaptureSession,
                      didProvide instruction: RoomCaptureSession.Instruction) {
    RoomScanEvents.shared?.emit(name: "onInstruction",
                                body: ["instruction": String(describing: instruction)])
  }

  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData,
                      error: Error?) {
    if let error = error {
      RoomScanEvents.shared?.emit(name: "onScanError",
                                  body: ["message": error.localizedDescription])
      if roomResolver != nil {
        roomRejecter?("ROOM_CAPTURE_FAILED", error.localizedDescription, error)
        roomResolver = nil
        roomRejecter = nil
      }
      return
    }
    // Hors multi-pièces (iOS 16), le résultat arrive par captureView(didPresent:).
    guard #available(iOS 17.0, *), multiRoom, roomResolver != nil else { return }
    let index = roomData.count
    roomData.append(data)
    buildRoom(from: data, index: index)
  }

  /// Post-traitement d'une pièce, hors de RoomCaptureView : c'est ce qui
  /// permet de garder la vue en mode capture d'une pièce à l'autre.
  @available(iOS 17.0, *)
  private func buildRoom(from data: CapturedRoomData, index: Int) {
    Task {
      do {
        let room = try await RoomBuilder(options: [.beautifyObjects])
          .capturedRoom(from: data)
        DispatchQueue.main.async { self.roomDidProcess(room, index: index) }
      } catch {
        DispatchQueue.main.async { self.roomDidFail(error, index: index) }
      }
    }
  }

  private func roomDidProcess(_ room: CapturedRoom, index: Int) {
    rooms.append(room)
    roomResolver?([
      "index": index,
      "wallCount": room.walls.count,
      "objectCount": room.objects.count,
      "doorCount": room.doors.count,
      "windowCount": room.windows.count,
      "label": Self.roomLabel(room) ?? "",
    ])
    roomResolver = nil
    roomRejecter = nil
  }

  private func roomDidFail(_ error: Error, index: Int) {
    // La pièce ne compte pas : sinon StructureBuilder assemblerait des
    // données dont on n'a jamais tiré de géométrie.
    if roomData.count == index + 1 { roomData.removeLast() }
    roomRejecter?("ROOM_PROCESSING_FAILED", error.localizedDescription, error)
    roomResolver = nil
    roomRejecter = nil
  }

  // MARK: - Sérialisation JSON

  /// `withColors` : seul le résultat final porte les couleurs relevées —
  /// les inclure dans le flux temps réel coûterait cher pour rien.
  static func surfacesJSON(_ room: CapturedRoom,
                           withColors: Bool = false) -> [[String: Any]] {
    func encode(_ s: CapturedRoom.Surface, type: String) -> [String: Any] {
      var out: [String: Any] = [
        "id": s.identifier.uuidString,
        "type": type,
        // Pour une surface : x = longueur, y = hauteur (mètres).
        "length": s.dimensions.x,
        "height": s.dimensions.y,
        "confidence": String(describing: s.confidence),
        "transform": matrixToArray(s.transform),
      ]
      if withColors {
        out.merge(RoomColorSampler.shared.payload(for: s)) { a, _ in a }
      }
      return out
    }
    return room.walls.map { encode($0, type: "wall") }
         + room.doors.map { encode($0, type: "door") }
         + room.windows.map { encode($0, type: "window") }
         + room.openings.map { encode($0, type: "opening") }
  }

  static func objectsJSON(_ room: CapturedRoom,
                          withColors: Bool = false) -> [[String: Any]] {
    room.objects.map { obj in
      var out: [String: Any] = [
        "id": obj.identifier.uuidString,
        "category": String(describing: obj.category),
        "width": obj.dimensions.x,
        "height": obj.dimensions.y,
        "depth": obj.dimensions.z,
        "confidence": String(describing: obj.confidence),
        "transform": matrixToArray(obj.transform),
      ]
      if withColors, let color = RoomColorSampler.shared.color(for: obj) {
        out["color"] = color
      }
      return out
    }
  }

  /// Recolore l'USDZ exporté : sans teinte, tout est blanc sur fond blanc
  /// dans Quick Look. Les couleurs relevées pendant le scan sont employées
  /// quand elles existent. Non fatal : en cas d'échec, le modèle reste blanc.
  static func tintModel(at url: URL) {
    do {
      let scene = try SCNScene(url: url, options: nil)
      let sampled = { (c: SIMD3<Float>) in
        UIColor(red: CGFloat(c.x / 255), green: CGFloat(c.y / 255),
                blue: CGFloat(c.z / 255), alpha: 1)
      }
      let wallColor = RoomColorSampler.shared.averageWallColor().map(sampled)
        ?? UIColor(red: 0.86, green: 0.88, blue: 0.92, alpha: 1)
      let objectColor = UIColor(red: 0.62, green: 0.68, blue: 0.78, alpha: 1)
      let floorColor = RoomColorSampler.shared.averageFloorColor().map(sampled)
        ?? UIColor(red: 0.78, green: 0.80, blue: 0.84, alpha: 1)
      scene.rootNode.enumerateHierarchy { node, _ in
        guard let geometry = node.geometry else { return }
        let name = (node.name ?? "").lowercased()
        let isStructure = name.contains("wall") || name.contains("door")
          || name.contains("window") || name.contains("opening")
        let isFloor = name.contains("floor")
        for material in geometry.materials {
          material.diffuse.contents =
            isFloor ? floorColor : (isStructure ? wallColor : objectColor)
          material.roughness.contents = 0.7
        }
      }
      try scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)
    } catch {
      // Modèle laissé tel quel.
    }
  }

  /// 16 floats, colonne-major (même convention que simd/SceneKit).
  static func matrixToArray(_ m: simd_float4x4) -> [Float] {
    [m.columns.0, m.columns.1, m.columns.2, m.columns.3]
      .flatMap { [$0.x, $0.y, $0.z, $0.w] }
  }
}
