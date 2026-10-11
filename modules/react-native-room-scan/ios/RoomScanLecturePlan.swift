import Foundation
import PhotosUI
import React
import UIKit
import Vision
import VisionKit

/**
 * LE PLAN PAPIER, PHOTOGRAPHIÉ — redressé, réduit, et ses textes lus.
 *
 * Relevé du patron : « une page photo qui demande de scanner un plan papier
 * de manière moderne ; si la vision détecte le plan, elle le scanne ».
 *
 * TROIS OUTILS D'APPLE, ET AUCUN DE NOUS.
 *
 *   — LE SCANNER DE DOCUMENTS (`VNDocumentCameraViewController`) : il
 *     cherche la feuille dans l'image, l'entoure, déclenche seul quand elle
 *     est nette et immobile, et rend la page redressée, à plat, comme sortie
 *     d'un scanner. C'est l'outil des Notes d'iOS : l'utilisateur le connaît.
 *   — LE SÉLECTEUR DE PHOTOS (`PHPickerViewController`) : pour un plan déjà
 *     photographié, ou reçu par courriel. Il ne demande aucune autorisation.
 *   — LA LECTURE DE TEXTE (`VNRecognizeTextRequest`) : les chiffres des
 *     cotes et les noms des pièces, lus sur le téléphone, avec leur place.
 *     L'IA les reçoit avec l'image : elle lit mieux un « 3,20 » qu'on lui
 *     confirme.
 *
 * L'image part réduite (2000 pixels au plus grand côté, JPEG 82 %) : assez
 * pour lire une cote, assez léger pour un envoi en 4G.
 *
 * UIKit sur le fil principal, la lecture du texte à côté : elle prend une
 * seconde, l'écran ne se fige pas.
 */
@objc(RoomScanLecturePlan)
class RoomScanLecturePlan: NSObject, VNDocumentCameraViewControllerDelegate,
  PHPickerViewControllerDelegate
{
  private var rendreA: RCTPromiseResolveBlock?

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

  /// Le scanner de documents existe-t-il sur cet appareil ?
  @objc func disponible(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(VNDocumentCameraViewController.isSupported)
  }

  /// Ouvre le scanner. Rend la page redressée, ou `nil` si l'on renonce.
  @objc func scanner(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard VNDocumentCameraViewController.isSupported, let haut = self.sommet() else {
        resolve(nil)
        return
      }
      self.rendreA = resolve
      let camera = VNDocumentCameraViewController()
      camera.delegate = self
      haut.present(camera, animated: true)
    }
  }

  /// Choisit une photo de plan dans la photothèque.
  @objc func importer(
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
      self.rendreA = resolve
      haut.present(picker, animated: true)
    }
  }

  // ------------------------------------------------------------ le scanner

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    // Une feuille, une page : la première est le plan.
    let page: UIImage? = scan.pageCount > 0 ? scan.imageOfPage(at: 0) : nil
    controller.dismiss(animated: true) {
      self.preparer(page)
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) {
      self.rendre(nil)
    }
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    controller.dismiss(animated: true) {
      self.rendre(nil)
    }
  }

  // ------------------------------------------------------------ la photothèque

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    guard
      let fournisseur = results.first?.itemProvider,
      fournisseur.canLoadObject(ofClass: UIImage.self)
    else {
      picker.dismiss(animated: true) {
        self.rendre(nil)
      }
      return
    }
    fournisseur.loadObject(ofClass: UIImage.self) { objet, _ in
      let image = objet as? UIImage
      DispatchQueue.main.async {
        picker.dismiss(animated: true) {
          self.preparer(image)
        }
      }
    }
  }

  // ------------------------------------------------------------ la page prête

  /// Réduit la page, l'encode, lit ses textes — hors du fil principal.
  private func preparer(_ image: UIImage?) {
    guard let image = image else {
      rendre(nil)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      let reduite = Self.reduire(image, plusGrandCote: 2000)
      guard let cg = reduite.cgImage, let jpeg = reduite.jpegData(compressionQuality: 0.82) else {
        self.rendre(nil)
        return
      }
      let resultat: [String: Any] = [
        "base64": jpeg.base64EncodedString(),
        "largeur": cg.width,
        "hauteur": cg.height,
        "textes": Self.lireLesTextes(cg),
      ]
      self.rendre(resultat)
    }
  }

  private func rendre(_ valeur: Any?) {
    DispatchQueue.main.async {
      self.rendreA?(valeur)
      self.rendreA = nil
    }
  }

  /// La page à `plusGrandCote` pixels au plus, droite (l'orientation de la photo appliquée).
  static func reduire(_ image: UIImage, plusGrandCote: CGFloat) -> UIImage {
    let largeur = image.size.width * image.scale
    let hauteur = image.size.height * image.scale
    let k = min(1, plusGrandCote / max(largeur, hauteur, 1))
    let cible = CGSize(width: floor(largeur * k), height: floor(hauteur * k))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: cible, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: cible))
    }
  }

  /**
   * LES TEXTES DE LA PAGE — chaque mot reconnu et son centre, en millièmes
   * de l'image (x vers la droite, y vers le bas : le repère de la lecture).
   * Sans correction de langue : « 3,20 » doit rester « 3,20 ».
   */
  static func lireLesTextes(_ cg: CGImage) -> [[String: Any]] {
    let requete = VNRecognizeTextRequest()
    requete.recognitionLevel = .accurate
    requete.usesLanguageCorrection = false
    requete.recognitionLanguages = ["fr-FR", "en-US"]
    let gestionnaire = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
      try gestionnaire.perform([requete])
    } catch {
      return []
    }
    let observations: [VNRecognizedTextObservation] = requete.results ?? []
    var out: [[String: Any]] = []
    for o in observations.prefix(500) {
      guard let mot = o.topCandidates(1).first?.string else { continue }
      let b = o.boundingBox
      out.append([
        "t": mot,
        "x": Int((b.midX * 1000).rounded()),
        "y": Int(((1 - b.midY) * 1000).rounded()),
      ])
    }
    return out
  }
}
