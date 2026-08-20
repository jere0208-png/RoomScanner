import Foundation
import RoomPlan
import React

@objc(RoomScanViewManager)
class RoomScanViewManager: RCTViewManager {

  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! {
    if #available(iOS 16.0, *), RoomCaptureSession.isSupported {
      // Le scan, et NOTRE couche de repères par-dessus : les appareils
      // posés au viseur restent plantés sur leur mur pendant tout le relevé.
      return RoomScanManager.shared.makeContainer()
    }
    // Fallback sur appareil non supporté : vue noire, le JS affiche le message.
    let fallback = UIView()
    fallback.backgroundColor = .black
    return fallback
  }
}
