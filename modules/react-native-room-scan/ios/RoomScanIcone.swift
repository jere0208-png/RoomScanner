import Foundation
import React
import UIKit

/**
 * CHANGER L'ICÔNE DE L'APPLICATION.
 *
 * Quatre habits pour le même glyphe — voir `ui/icone`. UIKit fait presque
 * tout ; ce qui mérite d'être écrit, c'est ce qui l'entoure.
 *
 * 1. ON NE DEMANDE RIEN QUAND RIEN NE CHANGE. `setAlternateIconName` fait
 *    apparaître une alerte du système à CHAQUE appel, même pour reposer
 *    l'icône déjà en place. Reposée sans raison — au retour d'un écran, à la
 *    relecture d'un réglage — elle donnerait une alerte surgie de nulle
 *    part, et personne ne saurait ce qu'il vient de faire.
 *
 * 2. ON VÉRIFIE QUE LE SYSTÈME SAIT LE FAIRE. `supportsAlternateIcons` est
 *    faux sur certains contextes (extensions, iPad en Slide Over sur
 *    d'anciennes versions) : on rend `false` plutôt que d'appeler et de
 *    récolter une erreur qui ne dit rien.
 *
 * 3. UIKIT SUR LE FIL PRINCIPAL, toujours. Et la réponse est rendue APRÈS
 *    que le système a conclu : le JavaScript enregistre son réglage sur un
 *    fait, pas sur une intention.
 */
@objc(RoomScanIcone)
class RoomScanIcone: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// `nom` : le jeu du catalogue, ou une chaîne vide pour l'icône d'origine.
  @objc func poser(
    _ nom: NSString?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject _: @escaping RCTPromiseRejectBlock
  ) {
    // Une chaîne vide vaut « l'originale » : le pont JavaScript ne transporte
    // pas `nil` de façon fiable pour un argument de chaîne.
    let voulu: String? = {
      guard let n = nom as String?, !n.isEmpty else { return nil }
      return n
    }()
    DispatchQueue.main.async {
      let app = UIApplication.shared
      guard app.supportsAlternateIcons else {
        resolve(false)
        return
      }
      // Rien à changer : pas d'alerte, et on le dit quand même réussi —
      // l'icône demandée EST celle qui est posée.
      if app.alternateIconName == voulu {
        resolve(true)
        return
      }
      app.setAlternateIconName(voulu) { erreur in
        resolve(erreur == nil)
      }
    }
  }
}
