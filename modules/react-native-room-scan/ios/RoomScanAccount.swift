import Foundation
import AuthenticationServices
import StoreKit
import UIKit
import React

/**
 * Le compte, côté natif : trousseau, Apple, achat.
 *
 * LE MARQUEUR VIT DANS LE TROUSSEAU (Keychain) : il survit à la
 * désinstallation de l'app. C'est lui qui porte « un seul compte par
 * téléphone » et le compteur de plans du palier gratuit — supprimer et
 * réinstaller ne remet rien à zéro.
 *
 * La connexion Apple exige l'entitlement « Sign in with Apple » : sur un
 * IPA de développement non signé, elle échoue proprement et l'app propose
 * l'e-mail. L'achat passe par StoreKit 2 : le produit doit exister dans
 * App Store Connect, sinon l'erreur le dit en clair.
 */
@objc(RoomScanAccount)
class RoomScanAccount: NSObject, ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding,
  ASWebAuthenticationPresentationContextProviding
{
  private let service = "fr.echoplan.compte"
  private var signInResolve: RCTPromiseResolveBlock?
  private var signInReject: RCTPromiseRejectBlock?
  /** La feuille web OAuth en cours : retenue, sinon iOS la ferme aussitôt. */
  private var sessionWeb: ASWebAuthenticationSession?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  /**
   L'ÉCOUTE DES TRANSACTIONS, dès que le module existe.

   Tout ne passe pas par le bouton « S'abonner » : un renouvellement, un code
   d'offre utilisé depuis l'App Store, un achat validé plus tard par un parent
   (« Demander l'achat ») arrivent PAR ICI. Apple demande qu'on les écoute et
   qu'on les solde — sans quoi ils reviennent à chaque lancement, et StoreKit
   le signale à la revue. Le JS relit ensuite l'échéance (`proExpiry`).
   */
  private var ecoute: Task<Void, Never>?

  override init() {
    super.init()
    ecoute = Task.detached {
      for await resultat in Transaction.updates {
        if case .verified(let transaction) = resultat {
          await transaction.finish()
        }
      }
    }
  }

  deinit { ecoute?.cancel() }

  /**
   LES PRODUITS, TELS QUE L'APP STORE LES VEND — prix, période, offre.

   Le prix ne s'écrit plus en dur dans l'app : il change avec le pays de
   l'App Store, et avec App Store Connect. On rend pour chaque produit son
   prix AFFICHABLE (« 4,90 € », déjà dans la bonne monnaie), sa valeur, sa
   période, et l'offre de lancement s'il y en a une ET que cet utilisateur y
   a droit (Apple n'en accorde qu'une par groupe d'abonnements).
   */
  @objc func proProducts(
    _ productIds: [String],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let produits = try await Product.products(for: productIds)
        var out: [[String: Any]] = []
        for p in produits {
          var ligne: [String: Any] = [
            "id": p.id,
            "prix": p.displayPrice,
            "valeur": NSDecimalNumber(decimal: p.price).doubleValue,
          ]
          if let abo = p.subscription {
            ligne["periode"] = Self.periode(abo.subscriptionPeriod)
            if let intro = abo.introductoryOffer {
              let eligible = await abo.isEligibleForIntroOffer
              var offre: [String: Any] = [
                "prix": intro.displayPrice,
                "valeur": NSDecimalNumber(decimal: intro.price).doubleValue,
                "periode": Self.periode(intro.period),
                "nombre": intro.periodCount,
                "eligible": eligible,
              ]
              switch intro.paymentMode {
              case .freeTrial: offre["mode"] = "essai"
              case .payAsYouGo: offre["mode"] = "remise"
              case .payUpFront: offre["mode"] = "avance"
              default: offre["mode"] = "autre"
              }
              ligne["offre"] = offre
            }
          }
          out.append(ligne)
        }
        resolve(out)
      } catch {
        reject("produits", "Produits indisponibles : \(error.localizedDescription)", error)
      }
    }
  }

  private static func periode(_ p: Product.SubscriptionPeriod) -> [String: Any] {
    let unite: String
    switch p.unit {
    case .day: unite = "jour"
    case .week: unite = "semaine"
    case .month: unite = "mois"
    case .year: unite = "an"
    @unknown default: unite = "mois"
    }
    return ["unite": unite, "valeur": p.value]
  }

  /**
   LA FEUILLE DES CODES D'OFFRE — celle d'Apple.

   Un code maison qui débloque le Pro sans passer par l'App Store est
   interdit (règle 3.1.1). Les codes d'offre, eux, se créent dans App Store
   Connect et se saisissent dans cette feuille-ci : l'abonnement accordé
   arrive ensuite par `Transaction.updates`. On rend la main quand la
   feuille se ferme ; le JS relit alors l'échéance.
   */
  @objc func presentOfferCode(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      guard let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive })
        ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
      else {
        reject("code", "Aucune fenêtre pour présenter la feuille", nil)
        return
      }
      do {
        try await AppStore.presentOfferCodeRedeemSheet(in: scene)
        resolve(true)
      } catch {
        reject("code", "Feuille des codes indisponible : \(error.localizedDescription)", error)
      }
    }
  }

  // ---------------------------------------------------------- trousseau

  @objc func accountMarker(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data,
      let texte = String(data: data, encoding: .utf8)
    {
      resolve(texte)
    } else {
      resolve(nil)
    }
  }

  @objc func setAccountMarker(
    _ json: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let data = json.data(using: .utf8) ?? Data()
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
    ]
    let update: [String: Any] = [kSecValueData as String: data]
    let status = SecItemUpdate(base as CFDictionary, update as CFDictionary)
    if status == errSecItemNotFound {
      var ajout = base
      ajout[kSecValueData as String] = data
      ajout[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
      SecItemAdd(ajout as CFDictionary, nil)
    }
    resolve(true)
  }

  // -------------------------------------------------------------- Apple

  @objc func appleSignIn(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      self.signInResolve = resolve
      self.signInReject = reject
      let provider = ASAuthorizationAppleIDProvider()
      let request = provider.createRequest()
      request.requestedScopes = [.fullName, .email]
      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = self
      controller.presentationContextProvider = self
      controller.performRequests()
    }
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential
    else {
      signInReject?("apple", "Réponse Apple inattendue", nil)
      nettoie()
      return
    }
    var sortie: [String: Any] = ["id": cred.user]
    if let prenom = cred.fullName?.givenName { sortie["prenom"] = prenom }
    if let email = cred.email { sortie["email"] = email }
    signInResolve?(sortie)
    nettoie()
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    signInReject?("apple", "Connexion Apple annulée ou indisponible", error)
    nettoie()
  }

  private func nettoie() {
    signInResolve = nil
    signInReject = nil
  }

  func presentationAnchor(for controller: ASAuthorizationController)
    -> ASPresentationAnchor
  {
    return fenetre()
  }

  func presentationAnchor(for session: ASWebAuthenticationSession)
    -> ASPresentationAnchor
  {
    return fenetre()
  }

  private func fenetre() -> ASPresentationAnchor {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }

  // -------------------------------------------------------------- achat

  @objc func purchasePro(
    _ productId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let produits = try await Product.products(for: [productId])
        guard let produit = produits.first else {
          reject(
            "achat",
            "Produit introuvable — configurez \(productId) dans App Store Connect.",
            nil)
          return
        }
        let resultat = try await produit.purchase()
        switch resultat {
        case .success(let verification):
          if case .verified(let transaction) = verification {
            await transaction.finish()
            resolve(true)
          } else {
            reject("achat", "Transaction non vérifiée par l’App Store", nil)
          }
        case .userCancelled:
          resolve(false)
        case .pending:
          resolve(false)
        @unknown default:
          resolve(false)
        }
      } catch {
        reject("achat", "Achat impossible : \(error.localizedDescription)", error)
      }
    }
  }

  /**
   * La feuille web de connexion (Google via le serveur) : ouvre l'URL dans
   * une ASWebAuthenticationSession et rend l'URL de retour au schéma de
   * l'app. C'est la session elle-même qui livre le retour — un lien forgé
   * depuis ailleurs n'atteint jamais ce chemin.
   */
  @objc func webAuth(
    _ url: String,
    scheme: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let depart = URL(string: url) else {
      reject("web", "URL de connexion invalide", nil)
      return
    }
    DispatchQueue.main.async {
      let session = ASWebAuthenticationSession(
        url: depart,
        callbackURLScheme: scheme
      ) { retour, erreur in
        self.sessionWeb = nil
        if let retour = retour {
          resolve(retour.absoluteString)
        } else {
          reject("web", "Connexion annulée", erreur)
        }
      }
      session.presentationContextProvider = self
      session.prefersEphemeralWebBrowserSession = false
      self.sessionWeb = session
      session.start()
    }
  }

  /** « Restaurer l'achat » : l'App Store dit si ce compte Apple détient
   *  déjà l'abonnement — nouvel appareil ou réinstallation. */
  @objc func restorePro(
    _ productId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      for await resultat in Transaction.currentEntitlements {
        if case .verified(let transaction) = resultat,
          transaction.productID == productId
        {
          resolve(true)
          return
        }
      }
      resolve(false)
    }
  }

  /**
   * L'ÉCHÉANCE DE L'ABONNEMENT — relevé du patron : « sur le profil on doit
   * voir la date d'expiration de l'abonnement ».
   *
   * C'est la question qu'on vient poser à la page profil après avoir payé :
   * jusqu'à quand est-ce réglé, et qu'est-ce qui se passe ensuite. L'App
   * Store est la seule source honnête — c'est lui qui encaisse, et lui seul
   * qui sait si l'utilisateur a résilié depuis les Réglages d'iOS.
   *
   * On rend la transaction la plus LOINTAINE des produits demandés (qui
   * passe du mensuel à l'annuel en détient deux le temps d'un cycle), et
   * `reconduit` dit si un prélèvement suivra : sans lui, on écrirait
   * « renouvellement le 3 novembre » à quelqu'un qui a résilié, c'est-à-dire
   * exactement le contraire de la vérité.
   */
  @objc func proExpiry(
    _ productIds: [String],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      var echeance: Date?
      var produitActif: String?
      for await resultat in Transaction.currentEntitlements {
        guard case .verified(let transaction) = resultat,
          productIds.contains(transaction.productID),
          let fin = transaction.expirationDate
        else { continue }
        if echeance == nil || fin > echeance! {
          echeance = fin
          produitActif = transaction.productID
        }
      }
      guard let fin = echeance, let produit = produitActif else {
        /*
          AUCUN ABONNEMENT EN COURS — et on le DIT, au lieu de rendre rien.
          `currentEntitlements` se lit hors ligne : c'est une réponse, pas un
          silence. Le JS s'en sert pour retirer le Pro d'un abonnement
          résilié ou échu, ce qu'il ne savait pas faire.
        */
        resolve(["aucun": true])
        return
      }
      // Le renouvellement se lit sur l'ABONNEMENT, pas sur la transaction :
      // résilier ne touche pas l'achat déjà encaissé, il coupe la suite.
      var reconduit = true
      if let produits = try? await Product.products(for: [produit]),
        let p = produits.first,
        let abonnement = p.subscription,
        let statuts = try? await abonnement.status
      {
        for statut in statuts {
          if case .verified(let info) = statut.renewalInfo {
            reconduit = info.willAutoRenew
          }
        }
      }
      resolve([
        "produit": produit,
        "expiration": fin.timeIntervalSince1970 * 1000,
        "reconduit": reconduit,
      ])
    }
  }
}
