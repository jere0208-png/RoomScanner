import Foundation
import React

@objc(RoomScanEvents)
class RoomScanEvents: RCTEventEmitter {

  static var shared: RoomScanEvents?
  private var hasListeners = false

  override init() {
    super.init()
    RoomScanEvents.shared = self
  }

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["onScanUpdate", "onInstruction", "onScanError"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  func emit(name: String, body: Any) {
    guard hasListeners else { return }
    sendEvent(withName: name, body: body)
  }
}
