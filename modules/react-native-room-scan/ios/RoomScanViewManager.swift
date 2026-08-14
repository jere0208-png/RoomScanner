import Foundation
import RoomPlan
import React

@objc(RoomScanViewManager)
class RoomScanViewManager: RCTViewManager {

  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! {
    if #available(iOS 16.0, *), RoomCaptureSession.isSupported {
      return RoomScanManager.shared.makeCaptureView()
    }
    // Fallback sur appareil non supporté : vue noire, le JS affiche le message.
    let fallback = UIView()
    fallback.backgroundColor = .black
    return fallback
  }
}
