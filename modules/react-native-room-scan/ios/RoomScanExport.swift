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

  /// Écrit un texte (OBJ, CSV…) en fichier temporaire et ouvre le partage.
  @objc func shareText(_ content: String,
                       filename: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent(filename)
    do {
      try content.write(to: url, atomically: true, encoding: .utf8)
    } catch {
      reject("WRITE_FAILED", error.localizedDescription, error)
      return
    }
    presentShareSheet(url: url, resolve: resolve, reject: reject)
  }

  /// Retrouve un fichier même si le chemin absolu date d'une ancienne
  /// installation : l'UUID du conteneur change à chaque réinstallation,
  /// mais les Documents sont migrés — on re-résout par le nom de fichier.
  static func resolveFile(_ path: String) -> URL? {
    let clean = path.hasPrefix("file://") ? String(path.dropFirst(7)) : path
    let url = URL(fileURLWithPath: clean)
    if FileManager.default.fileExists(atPath: url.path) { return url }
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let candidate = docs.appendingPathComponent(url.lastPathComponent)
    return FileManager.default.fileExists(atPath: candidate.path) ? candidate : nil
  }

  /// Partage un fichier local existant (image, .usdz…) via la feuille iOS.
  @objc func shareFile(_ path: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    guard let url = RoomScanExport.resolveFile(path) else {
      reject("NOT_FOUND", "Fichier introuvable : \(path)", nil)
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
      Self.presentWhenReady(root: root, url: url, tries: 0)
      resolve(true)
    }
  }

  /**
   Présente la feuille de partage, mais pas avant que l'écran soit libre.

   iOS ne présente pas deux contrôleurs à la fois, et une fenêtre en train
   de se fermer reste en place quelques dixièmes de seconde : présenter
   dessus **ne fait rien du tout**, sans la moindre erreur ni exception.
   C'est ce qui rendait « Image », « Modèle 3D » et « Liste du matériel »
   muets au clic — le partage était demandé pendant que la fenêtre de choix
   se refermait. Le PDF, lui, marchait : il passe par un changement d'écran.

   On attend donc que plus rien ne soit en cours de fermeture, par pas de
   100 ms, une seconde au maximum.
   */
  private static func presentWhenReady(root: UIViewController, url: URL, tries: Int) {
    var top = root
    while let presented = top.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    if (top.isBeingDismissed || top.presentedViewController != nil), tries < 10 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        presentWhenReady(root: root, url: url, tries: tries + 1)
      }
      return
    }
    let sheet = UIActivityViewController(activityItems: [url],
                                         applicationActivities: nil)
    // iPad : la feuille exige un point d'ancrage.
    sheet.popoverPresentationController?.sourceView = top.view
    sheet.popoverPresentationController?.sourceRect = CGRect(
      x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
    top.present(sheet, animated: true)
  }
}
