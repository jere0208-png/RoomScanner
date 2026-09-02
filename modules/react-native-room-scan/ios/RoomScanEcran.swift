import Foundation
import UIKit

/**
 * TENIR L'ÉCRAN ALLUMÉ PENDANT LA PRÉSENTATION CLIENT.
 *
 * On tend le téléphone au client, on retire la main de l'écran — et iOS
 * baisse la luminosité au bout de trente secondes, puis verrouille. Une
 * visite guidée dure plus que ça, et le seul geste qui la sauve consiste à
 * retoucher l'écran, c'est-à-dire à interrompre ce qu'on montrait.
 *
 * `isIdleTimerDisabled` est la réponse d'UIKit, et elle tient en une ligne.
 * Ce qui mérite d'être écrit, c'est ce qui l'entoure :
 *
 * 1. LE COMPTE SE TIENT CÔTÉ JAVASCRIPT (`ui/veille`), pas ici. Un seul
 *    endroit sait combien de choses veulent l'écran allumé — deux comptes du
 *    même nombre finissent toujours par diverger.
 *
 * 2. ON RELÂCHE À LA MISE EN ARRIÈRE-PLAN, quoi qu'ait dit le JavaScript.
 *    Une application qui garde le drapeau levé en repassant au premier plan
 *    plus tard vide la batterie sans que personne ne comprenne pourquoi —
 *    et le JavaScript, lui, peut très bien ne jamais reprendre la main (un
 *    appel entrant, une application tuée par le système). Le drapeau
 *    retrouve sa valeur quand l'application revient.
 *
 * UIKit sur le fil principal, toujours.
 */
@objc(RoomScanEcran)
class RoomScanEcran: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// Ce que le JavaScript a demandé en dernier : c'est lui qu'on rétablit
  /// au retour de l'arrière-plan.
  private var voulu = false

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(auFond),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(auPremierPlan),
      name: UIApplication.didBecomeActiveNotification,
      object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func auFond() {
    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
  }

  @objc private func auPremierPlan() {
    let v = voulu
    DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = v }
  }

  /// `oui` : retenir l'écran allumé. `non` : lui rendre sa liberté.
  @objc func garderEveille(_ oui: Bool) {
    voulu = oui
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = oui
    }
  }
}
