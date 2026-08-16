import Foundation
import UIKit

/// Retours haptiques.
///
/// Un plan se manipule au doigt, et le doigt ne regarde pas l'écran : c'est
/// la main qui doit sentir la butée contre un mur, l'accrochage à l'entraxe,
/// le franchissement d'un seuil de conformité. Trois familles suffisent, et
/// il ne faut surtout pas plus : un appareil qui vibre à tout propos, on
/// coupe le retour haptique du système.
@objc(RoomScanHaptics)
class RoomScanHaptics: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// Générateurs gardés en vie : les recréer à chaque coup ajoute une
  /// latence de préparation qu'on sent comme un retard sur le geste.
  private let leger = UIImpactFeedbackGenerator(style: .light)
  private let butee = UIImpactFeedbackGenerator(style: .medium)
  private let choix = UISelectionFeedbackGenerator()
  private let avis = UINotificationFeedbackGenerator()

  /// `kind` : leger | butee | accroche | succes | alerte.
  @objc func tap(_ kind: NSString) {
    DispatchQueue.main.async {
      switch kind as String {
      case "butee":
        self.butee.prepare()
        self.butee.impactOccurred()
      case "accroche":
        self.choix.prepare()
        self.choix.selectionChanged()
      case "succes":
        self.avis.prepare()
        self.avis.notificationOccurred(.success)
      case "alerte":
        self.avis.prepare()
        self.avis.notificationOccurred(.warning)
      default:
        self.leger.prepare()
        self.leger.impactOccurred()
      }
    }
  }
}
