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
}
