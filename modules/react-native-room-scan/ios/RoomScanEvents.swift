import Foundation
import React

@objc(RoomScanEvents)
class RoomScanEvents: RCTEventEmitter {

  // Faible : après un rechargement du JS, l'ancien émetteur ne survit pas à son pont.
  static weak var shared: RoomScanEvents?
  private var hasListeners = false

  override init() {
    super.init()
    RoomScanEvents.shared = self
  }

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["onScanUpdate", "onInstruction", "onScanError", "onVisee", "onTorche"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  func emit(name: String, body: Any) {
    guard hasListeners else { return }
    sendEvent(withName: name, body: body)
  }
}
