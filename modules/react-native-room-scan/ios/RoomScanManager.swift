import Foundation
import RoomPlan
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
    return view
  }

  // MARK: - Commandes du bridge

  func start() {
    DispatchQueue.main.async {
      self.captureView?.captureSession.run(configuration: self.configuration)
    }
  }

  func pause() {
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

  func resume() { start() }

  func stop(resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {
    stopResolver = resolve
    stopRejecter = reject
    // Déclenche le post-traitement RoomPlan ; le résultat final
    // arrive dans captureView(didPresent:error:).
    DispatchQueue.main.async {
      self.captureView?.captureSession.stop()
    }
  }

  private func clearPromise() { stopResolver = nil; stopRejecter = nil }

  // MARK: - RoomCaptureViewDelegate (résultat final)

  // true = laisser RoomPlan post-traiter les données brutes.
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData,
                   error: Error?) -> Bool {
    return true
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

      let payload: [String: Any] = [
        "modelPath": usdzURL.path,
        "surfaces": Self.surfacesJSON(processedResult),
        "objects": Self.objectsJSON(processedResult),
      ]
      stopResolver?(payload)
    } catch {
      stopRejecter?("EXPORT_FAILED", error.localizedDescription, error)
    }
    clearPromise()
  }

  // MARK: - RoomCaptureSessionDelegate (temps réel)

  func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
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
    }
  }

  // MARK: - Sérialisation JSON

  static func surfacesJSON(_ room: CapturedRoom) -> [[String: Any]] {
    func encode(_ s: CapturedRoom.Surface, type: String) -> [String: Any] {
      [
        "id": s.identifier.uuidString,
        "type": type,
        // Pour une surface : x = longueur, y = hauteur (mètres).
        "length": s.dimensions.x,
        "height": s.dimensions.y,
        "confidence": String(describing: s.confidence),
        "transform": matrixToArray(s.transform),
      ]
    }
    return room.walls.map { encode($0, type: "wall") }
         + room.doors.map { encode($0, type: "door") }
         + room.windows.map { encode($0, type: "window") }
         + room.openings.map { encode($0, type: "opening") }
  }

  static func objectsJSON(_ room: CapturedRoom) -> [[String: Any]] {
    room.objects.map { obj in
      [
        "id": obj.identifier.uuidString,
        "category": String(describing: obj.category),
        "width": obj.dimensions.x,
        "height": obj.dimensions.y,
        "depth": obj.dimensions.z,
        "confidence": String(describing: obj.confidence),
        "transform": matrixToArray(obj.transform),
      ]
    }
  }

  /// 16 floats, colonne-major (même convention que simd/SceneKit).
  static func matrixToArray(_ m: simd_float4x4) -> [Float] {
    [m.columns.0, m.columns.1, m.columns.2, m.columns.3]
      .flatMap { [$0.x, $0.y, $0.z, $0.w] }
  }
}
