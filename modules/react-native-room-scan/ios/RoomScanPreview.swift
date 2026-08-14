import Foundation
import QuickLook
import UIKit

/// Visionneuse 3D native : ouvre le .usdz exporté par RoomPlan dans
/// QuickLook (rendu Apple, gratuit, avec mode AR intégré).
@objc(RoomScanPreview)
class RoomScanPreview: NSObject, QLPreviewControllerDataSource {

  private var fileURL: URL?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func presentUSDZ(_ path: String) {
    DispatchQueue.main.async {
      self.fileURL = URL(fileURLWithPath: path)
      let controller = QLPreviewController()
      controller.dataSource = self

      guard let root = UIApplication.shared.connectedScenes
        .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
        .first?.rootViewController else { return }
      var top = root
      while let presented = top.presentedViewController { top = presented }
      top.present(controller, animated: true)
    }
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    fileURL == nil ? 0 : 1
  }

  func previewController(_ controller: QLPreviewController,
                         previewItemAt index: Int) -> QLPreviewItem {
    fileURL! as NSURL
  }
}
