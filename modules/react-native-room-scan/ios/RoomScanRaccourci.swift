import CoreSpotlight
import Foundation
import React
import UniformTypeIdentifiers

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

  /**
   LES PLANS DANS LA RECHERCHE DE L'IPHONE — Spotlight, sur l'appareil
   seulement. L'index est REMPLACÉ à chaque fois : un plan supprimé ou
   renommé ne traîne pas dans la recherche. Un plan touché revient par
   `AppDelegate` (« ouvrir-plan:<id> »), comme un raccourci.
   */
  static let DOMAINE = "echoplan.plans"

  @objc func indexer(_ fiches: NSArray) {
    var items: [CSSearchableItem] = []
    for f in fiches {
      guard let d = f as? NSDictionary,
            let id = d["id"] as? String,
            let titre = d["titre"] as? String else { continue }
      let a = CSSearchableItemAttributeSet(contentType: UTType.content)
      a.title = titre
      a.contentDescription = d["description"] as? String
      a.keywords = d["motsCles"] as? [String]
      items.append(CSSearchableItem(
        uniqueIdentifier: "plan:\(id)",
        domainIdentifier: RoomScanRaccourci.DOMAINE,
        attributeSet: a))
    }
    let index = CSSearchableIndex.default()
    index.deleteSearchableItems(withDomainIdentifiers: [RoomScanRaccourci.DOMAINE]) { _ in
      guard !items.isEmpty else { return }
      index.indexSearchableItems(items) { _ in }
    }
  }
}
