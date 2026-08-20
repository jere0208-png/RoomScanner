import Foundation
import RoomPlan
import AVFoundation
import React

@objc(RoomScanModule)
class RoomScanModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func cameraStatus(_ resolve: RCTPromiseResolveBlock,
                          reject: RCTPromiseRejectBlock) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: resolve("granted")
    case .notDetermined: resolve("undetermined")
    default: resolve("denied")
    }
  }

  @objc func requestCamera(_ resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
    AVCaptureDevice.requestAccess(for: .video) { granted in
      resolve(granted)
    }
  }

  /// Torche pendant le scan (fonctionne pendant une session ARKit).
  @objc func setTorch(_ on: Bool,
                      resolve: RCTPromiseResolveBlock,
                      reject: RCTPromiseRejectBlock) {
    guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
      resolve(false)
      return
    }
    do {
      try device.lockForConfiguration()
      device.torchMode = on ? .on : .off
      device.unlockForConfiguration()
      resolve(true)
    } catch {
      resolve(false)
    }
  }

  @objc func isSupported(_ resolve: RCTPromiseResolveBlock,
                         reject: RCTPromiseRejectBlock) {
    if #available(iOS 16.0, *) {
      resolve(RoomCaptureSession.isSupported)   // false sans LiDAR
    } else {
      resolve(false)
    }
  }

  @objc func startRoomScan(_ resolve: RCTPromiseResolveBlock,
                           reject: RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *), RoomCaptureSession.isSupported else {
      reject("UNSUPPORTED", "RoomPlan nécessite un appareil LiDAR sous iOS 16+", nil)
      return
    }
    RoomScanManager.shared.start()
    resolve(nil)
  }

  /**
   UN PASSAGE DE PLUS, qui S'AJOUTE au logement déjà relevé.

   Un appartement ne se scanne pas toujours d'un trait : on relève le
   séjour, on ferme une porte, on relève la chambre. Chaque passage
   écrasait le précédent — il fallait recoller les pièces à la main.
   `StructureBuilder` (iOS 17) les aligne ; ici on lui garde la matière.
   */
  @objc func startAdditionalScan(_ resolve: RCTPromiseResolveBlock,
                                 reject: RCTPromiseRejectBlock) {
    guard #available(iOS 17.0, *), RoomCaptureSession.isSupported else {
      reject(
        "UNSUPPORTED",
        "La réunion de plusieurs relevés demande iOS 17 et un appareil LiDAR",
        nil,
      )
      return
    }
    RoomScanManager.shared.start(fresh: true, additif: true)
    resolve(nil)
  }

  @objc func stopRoomScan(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 16.0, *) else {
      reject("UNSUPPORTED", "iOS 16 requis", nil)
      return
    }
    RoomScanManager.shared.stop(resolve: resolve, reject: reject)
  }

  @objc func pauseRoomScan() {
    if #available(iOS 16.0, *) { RoomScanManager.shared.pause() }
  }

  @objc func resumeRoomScan() {
    if #available(iOS 16.0, *) { RoomScanManager.shared.resume() }
  }
}
