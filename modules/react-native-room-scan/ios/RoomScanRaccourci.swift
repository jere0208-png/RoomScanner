import Foundation
import React

/**
 * LA DEMANDE D'UN RACCOURCI, DU SYSTÈME JUSQU'AU JAVASCRIPT.
 *
 * « Dis Siri, nouveau relevé », ou un appui long sur l'icône : dans les deux
 * cas, c'est le TARGET DE L'APPLICATION qui reçoit l'événement — l'App Intent
 * et l'action rapide vivent dans `AppDelegate.swift`. Ce module-ci vit dans
 * la bibliothèque des modules natifs, et les deux ne peuvent pas s'appeler
 * l'un l'autre : l'application voit la bibliothèque, l'inverse est faux.
 *
 * LA DEMANDE VOYAGE DONC PAR LES RÉGLAGES PARTAGÉS (`UserDefaults`), sous une
 * clé unique. Ce n'est pas un détour : c'est le seul endroit que les deux
 * côtés voient, et il survit à un lancement à froid — le cas le plus
 * fréquent, puisqu'on dit la phrase justement quand l'application est
 * fermée.
 *
 * ET ELLE SE PREND, ELLE NE SE LIT PAS. Une demande qui reste écrite
 * redémarre un scan à chaque retour au premier plan : on quitte
 * l'application pour prendre une photo, on revient, et le relevé recommence.
 */
@objc(RoomScanRaccourci)
class RoomScanRaccourci: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  /// La clé partagée avec le target de l'application. Elle est écrite en
  /// toutes lettres des deux côtés, et un banc vérifie qu'elles s'accordent.
  static let CLE = "roomscan.raccourci"

  /// Rend la demande en attente, et l'efface. `nil` s'il n'y en a pas.
  @objc func prendre(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject _: @escaping RCTPromiseRejectBlock
  ) {
    let reglages = UserDefaults.standard
    let demande = reglages.string(forKey: RoomScanRaccourci.CLE)
    if demande != nil {
      reglages.removeObject(forKey: RoomScanRaccourci.CLE)
    }
    resolve(demande)
  }
}
