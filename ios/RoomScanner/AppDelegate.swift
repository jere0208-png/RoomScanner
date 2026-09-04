import AppIntents
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

/*
  LE RACCOURCI « NOUVEAU RELEVÉ » — dixième et dernière des améliorations.

  Un électricien arrive sur un chantier les mains prises. Sortir le
  téléphone, le déverrouiller, trouver l'icône, attendre l'accueil, viser le
  bouton : cinq gestes pour commencer ce qu'il est venu faire. « Dis Siri,
  nouveau relevé » les remplace, et l'appui long sur l'icône aussi.

  ──────────────────────────────────────────────────────────────────────────
  POURQUOI TOUT CECI VIT DANS `AppDelegate.swift`, ET NON DANS SON PROPRE
  FICHIER.

  Un `AppShortcutsProvider` doit être compilé DANS LE TARGET DE
  L'APPLICATION : le système ne va pas le chercher dans une bibliothèque
  liée. Or ajouter un fichier au target demande de retoucher à la main le
  `project.pbxproj` — trois insertions dans trois sections, sans compilateur
  local pour dire si l'on s'est trompé. Ce fichier-ci est DÉJÀ dans le
  target ; y poser cinquante lignes bien séparées coûte moins cher qu'un
  projet Xcode cassé qu'on ne découvrirait qu'au build.

  ET LA DEMANDE PASSE PAR LES RÉGLAGES PARTAGÉS. L'application voit la
  bibliothèque des modules natifs, l'inverse est faux : `UserDefaults` est le
  seul endroit que les deux côtés voient, et il survit à un lancement à
  froid — le cas le plus fréquent, puisqu'on dit la phrase justement quand
  l'application est fermée. Voir `RoomScanRaccourci`.
*/
private let CLE_RACCOURCI = "roomscan.raccourci"
private let DEMANDE_SCAN = "nouveau-releve"

private func poserLaDemande() {
  UserDefaults.standard.set(DEMANDE_SCAN, forKey: CLE_RACCOURCI)
}

/// L'intention, telle que Siri et Spotlight la connaissent.
@available(iOS 16.0, *)
struct NouveauReleveIntent: AppIntent {
  static var title: LocalizedStringResource = "Nouveau relevé"
  static var description = IntentDescription(
    "Ouvre EchoPlan et démarre un relevé de pièce.")
  /*
    L'APPLICATION S'OUVRE, ET C'EST ELLE QUI SCANNE.

    L'intention ne lance pas le relevé elle-même : elle pose la demande et
    laisse l'accueil l'exécuter par SON chemin — celui du bouton, garde du
    palier gratuit comprise. Une porte dérobée qui contournerait l'offre
    serait un défaut, pas une facilité.
  */
  static var openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    poserLaDemande()
    return .result()
  }
}

@available(iOS 16.0, *)
struct RaccourcisEchoPlan: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: NouveauReleveIntent(),
      phrases: [
        "Nouveau relevé avec \(.applicationName)",
        "Démarre un relevé avec \(.applicationName)",
        "Nouveau plan avec \(.applicationName)",
      ],
      shortTitle: "Nouveau relevé",
      systemImageName: "camera.viewfinder")
  }
}

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "RoomScanner",
      in: window,
      launchOptions: launchOptions
    )

    /*
      L'APPUI LONG SUR L'ICÔNE, QUAND IL A LANCÉ L'APPLICATION.

      iOS livre alors l'action dans les options de lancement et n'appellera
      PAS `performActionFor` : sans cette lecture, le raccourci ne marcherait
      que sur une application déjà ouverte, c'est-à-dire jamais dans le cas
      qui compte.
    */
    if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
       item.type == DEMANDE_SCAN {
      poserLaDemande()
    }

    return true
  }

  /// L'appui long sur l'icône, application déjà lancée.
  func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard shortcutItem.type == DEMANDE_SCAN else {
      completionHandler(false)
      return
    }
    poserLaDemande()
    completionHandler(true)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
