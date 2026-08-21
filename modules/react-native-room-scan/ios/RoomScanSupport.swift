import Foundation
import MessageUI
import PhotosUI
import React
import UIKit

/**
 * ÉCRIRE AU SERVICE CLIENT, DEPUIS L'APPLICATION.
 *
 * Relevé du patron : « ajoute une icône de tchat service clientèle, qui
 * ouvre un popup avec un titre, un message et une pièce jointe, qui va à
 * echoplansupport@gmail.com ». L'application n'avait aucun moyen de dire
 * quelque chose à son auteur — et sur un chantier, un défaut se raconte en
 * une photo, d'où la pièce jointe.
 *
 * DEUX DÉCISIONS QUI TIENNENT TOUT LE FICHIER.
 *
 * 1. C'EST L'UTILISATEUR QUI ENVOIE. On ouvre le composeur d'iOS, rempli
 *    d'avance ; le doigt qui appuie sur « Envoyer » est le sien. Aucun
 *    courrier ne part dans son dos, et son adresse d'expéditeur reste la
 *    sienne — c'est aussi ce qui nous permet de lui RÉPONDRE.
 * 2. LE COMPOSEUR PEUT NE PAS EXISTER : beaucoup d'iPhone n'ont pas de
 *    compte dans l'app Mail (tout se passe dans Gmail). On le dit alors au
 *    JavaScript (`unavailable`), qui bascule sur un simple `mailto:` — sans
 *    pièce jointe, et il le prévient.
 *
 * UIKit sur le fil principal, toujours : présenter une fenêtre depuis un
 * autre fil est le crash le plus banal de cette base.
 */
@objc(RoomScanSupport)
class RoomScanSupport: NSObject, MFMailComposeViewControllerDelegate,
  PHPickerViewControllerDelegate
{
  private var mailResolve: RCTPromiseResolveBlock?
  private var pickResolve: RCTPromiseResolveBlock?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  /// Le contrôleur le plus haut, celui qui peut présenter sans conflit.
  private func sommet() -> UIViewController? {
    guard
      let root = UIApplication.shared.connectedScenes
        .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
        .first?.rootViewController
    else { return nil }
    var haut = root
    while let presente = haut.presentedViewController, !presente.isBeingDismissed {
      haut = presente
    }
    return haut
  }

  /**
   * Ouvre le composeur d'iOS, pré-rempli. Rend « sent », « cancelled » ou
   * « unavailable » — jamais une erreur : ne pas avoir de compte Mail n'est
   * pas une panne, c'est un cas ordinaire qui appelle un autre chemin.
   */
  @objc func composeMail(
    _ destinataire: String,
    subject: String,
    body: String,
    attachment: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard MFMailComposeViewController.canSendMail(), let haut = self.sommet()
      else {
        resolve("unavailable")
        return
      }
      let vue = MFMailComposeViewController()
      vue.mailComposeDelegate = self
      vue.setToRecipients([destinataire])
      vue.setSubject(subject)
      vue.setMessageBody(body, isHTML: false)
      if let chemin = attachment, !chemin.isEmpty {
        let url = URL(fileURLWithPath: chemin.replacingOccurrences(
          of: "file://", with: ""))
        if let donnees = try? Data(contentsOf: url) {
          vue.addAttachmentData(
            donnees,
            mimeType: url.pathExtension.lowercased() == "png"
              ? "image/png" : "image/jpeg",
            fileName: url.lastPathComponent)
        }
      }
      self.mailResolve = resolve
      haut.present(vue, animated: true)
    }
  }

  func mailComposeController(
    _ controller: MFMailComposeViewController,
    didFinishWith result: MFMailComposeResult,
    error: Error?
  ) {
    let sortie = result == .sent ? "sent" : "cancelled"
    controller.dismiss(animated: true) {
      self.mailResolve?(sortie)
      self.mailResolve = nil
    }
  }

  /**
   * Choisit UNE image dans la photothèque et la copie dans le dossier
   * temporaire : le composeur a besoin d'octets, pas d'un identifiant de
   * photothèque. `nil` si l'utilisateur renonce.
   *
   * `PHPickerViewController` ne demande AUCUNE autorisation : l'utilisateur
   * choisit dans une fenêtre qui appartient au système, et l'application ne
   * reçoit que ce qu'il a désigné. C'est le bon outil pour une pièce jointe
   * — demander l'accès à toute la photothèque pour une capture d'écran
   * serait disproportionné.
   */
  @objc func pickImage(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let haut = self.sommet() else {
        resolve(nil)
        return
      }
      var config = PHPickerConfiguration()
      config.filter = .images
      config.selectionLimit = 1
      let picker = PHPickerViewController(configuration: config)
      picker.delegate = self
      self.pickResolve = resolve
      haut.present(picker, animated: true)
    }
  }

  func picker(
    _ picker: PHPickerViewController,
    didFinishPicking results: [PHPickerResult]
  ) {
    let rendre = { (chemin: String?) in
      DispatchQueue.main.async {
        picker.dismiss(animated: true) {
          self.pickResolve?(chemin as Any)
          self.pickResolve = nil
        }
      }
    }
    guard let fournisseur = results.first?.itemProvider,
      fournisseur.canLoadObject(ofClass: UIImage.self)
    else {
      rendre(nil)
      return
    }
    fournisseur.loadObject(ofClass: UIImage.self) { objet, _ in
      guard let image = objet as? UIImage,
        let donnees = image.jpegData(compressionQuality: 0.8)
      else {
        rendre(nil)
        return
      }
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("echoplan-piece-\(Int(Date().timeIntervalSince1970)).jpg")
      do {
        try donnees.write(to: url)
        rendre(url.path)
      } catch {
        rendre(nil)
      }
    }
  }
}
