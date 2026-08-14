import Foundation
import UIKit
import React

/// Reçoit un PDF encodé en base64 depuis le JS, l'écrit dans un fichier
/// temporaire et ouvre la feuille de partage iOS (AirDrop, Mail, Fichiers…).
@objc(RoomScanExport)
class RoomScanExport: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func sharePDF(_ base64: String,
                      filename: String,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    guard let data = Data(base64Encoded: base64) else {
      reject("BAD_DATA", "PDF base64 invalide", nil)
      return
    }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(filename)
    do {
      try data.write(to: url, options: .atomic)
    } catch {
      reject("WRITE_FAILED", error.localizedDescription, error)
      return
    }

    presentShareSheet(url: url, resolve: resolve, reject: reject)
  }

  /// Partage un fichier local existant (image, .usdz…) via la feuille iOS.
  @objc func shareFile(_ path: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    let clean = path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
    let url = URL(fileURLWithPath: clean)
    guard FileManager.default.fileExists(atPath: url.path) else {
      reject("NOT_FOUND", "Fichier introuvable : \(clean)", nil)
      return
    }
    presentShareSheet(url: url, resolve: resolve, reject: reject)
  }

  private func presentShareSheet(url: URL,
                                 resolve: @escaping RCTPromiseResolveBlock,
                                 reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let root = UIApplication.shared.connectedScenes
        .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
        .first?.rootViewController else {
        reject("NO_VIEW", "Aucune vue pour présenter le partage", nil)
        return
      }
      var top = root
      while let presented = top.presentedViewController { top = presented }
      let sheet = UIActivityViewController(activityItems: [url],
                                           applicationActivities: nil)
      // iPad : la feuille exige un point d'ancrage.
      sheet.popoverPresentationController?.sourceView = top.view
      sheet.popoverPresentationController?.sourceRect = CGRect(
        x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
      top.present(sheet, animated: true)
      resolve(true)
    }
  }
}
