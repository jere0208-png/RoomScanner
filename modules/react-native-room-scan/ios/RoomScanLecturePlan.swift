import Foundation
import PDFKit
import PhotosUI
import React
import UIKit
import UniformTypeIdentifiers
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
 *   — LE SÉLECTEUR DE FICHIERS (`UIDocumentPickerViewController`) — relevé
 *     du patron : « on doit aussi pouvoir lire un fichier PDF ou image au
 *     lieu de scanner le papier ». Le plan d'architecte arrive en PDF par
 *     courriel : l'imprimer pour le photographier, c'était perdre sa
 *     netteté. Un PDF se rend à haute définition (PDFKit), et sa page la
 *     plus cotée est retenue — l'écran laisse en changer avant de lire.
 *
 * L'image part réduite (2000 pixels au plus grand côté, JPEG 82 %) : assez
 * pour lire une cote, assez léger pour un envoi en 4G. Les textes, eux, se
 * lisent sur une page plus fine quand on l'a (un PDF rendu à 4500 pixels) :
 * leur place est donnée en millièmes, elle ne dépend pas de la taille.
 *
 * UIKit sur le fil principal, la lecture du texte à côté : elle prend une
 * seconde, l'écran ne se fige pas.
 */
@objc(RoomScanLecturePlan)
class RoomScanLecturePlan: NSObject, VNDocumentCameraViewControllerDelegate,
  PHPickerViewControllerDelegate, UIDocumentPickerDelegate
{
  private var rendreA: RCTPromiseResolveBlock?
  /// Le PDF ouvert : on y change de page sans le rouvrir.
  private var pdf: PDFDocument?

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

  /// Ouvre un plan reçu en fichier : un PDF, ou une image (JPEG, PNG, HEIC…).
  @objc func ouvrirUnFichier(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let haut = self.sommet() else {
        resolve(nil)
        return
      }
      // Une COPIE : le fichier reste lisible sans droit d'accès à tenir ouvert.
      let selecteur = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf, .image], asCopy: true)
      selecteur.delegate = self
      selecteur.allowsMultipleSelection = false
      self.rendreA = resolve
      haut.present(selecteur, animated: true)
    }
  }

  /// Une autre page du PDF ouvert (comptée à partir de 1).
  @objc func pageDuPdf(
    _ n: NSNumber,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let doc = pdf, n.intValue >= 1, n.intValue <= doc.pageCount else {
      resolve(nil)
      return
    }
    rendreA = resolve
    preparerLaPage(doc, n.intValue - 1)
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

  // ------------------------------------------------------------ le fichier

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else {
      rendre(nil)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      self.lireLeFichier(url)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    rendre(nil)
  }

  /// Un PDF : sa meilleure page, rendue. Une image : comme une photo.
  private func lireLeFichier(_ url: URL) {
    let estUnPdf =
      UTType(filenameExtension: url.pathExtension)?.conforms(to: .pdf) ?? false
    if estUnPdf {
      guard let doc = PDFDocument(url: url) else {
        rendre(["erreur": "format"])
        return
      }
      if doc.isLocked {
        rendre(["erreur": "protege"])
        return
      }
      if doc.pageCount == 0 {
        rendre(["erreur": "vide"])
        return
      }
      pdf = doc
      preparerLaPage(doc, Self.meilleurePage(doc))
      return
    }
    pdf = nil
    guard let donnees = try? Data(contentsOf: url), let image = UIImage(data: donnees) else {
      // Un PDF arrivé sans son extension : on le reconnaît à son contenu.
      if let doc = PDFDocument(url: url), !doc.isLocked, doc.pageCount > 0 {
        pdf = doc
        preparerLaPage(doc, Self.meilleurePage(doc))
      } else {
        rendre(["erreur": "format"])
      }
      return
    }
    // Une image reçue est souvent plus fine qu'une photo : ses textes se
    // lisent avant la réduction.
    preparer(image, lecture: 3000)
  }

  /// La page `i` du PDF, rendue à haute définition puis préparée.
  private func preparerLaPage(_ doc: PDFDocument, _ i: Int) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let page = doc.page(at: i) else {
        self.rendre(nil)
        return
      }
      let image = Self.rendreLaPage(page, plusGrandCote: 4500)
      self.preparer(image, lecture: 4500, enPlus: ["page": i + 1, "pages": doc.pageCount])
    }
  }

  /**
   * LA PAGE QUI PORTE LE PLUS DE COTES. Un dossier d'architecte s'ouvre sur
   * une page de garde, une notice, un tableau des surfaces : le plan est
   * celle où l'on compte le plus de nombres — « 3,20 », « 450 ». Un PDF
   * scanné n'a pas de texte : sa première page, alors.
   */
  static func meilleurePage(_ doc: PDFDocument) -> Int {
    guard doc.pageCount > 1,
      let motif = try? NSRegularExpression(pattern: "\\b\\d{1,3}[,.]\\d{1,2}\\b|\\b\\d{2,4}\\b")
    else { return 0 }
    var meilleure = 0
    var record = 0
    for i in 0..<min(doc.pageCount, 60) {
      guard let texte = doc.page(at: i)?.string, !texte.isEmpty else { continue }
      let n = motif.numberOfMatches(in: texte, range: NSRange(texte.startIndex..., in: texte))
      if n > record {
        record = n
        meilleure = i
      }
    }
    return meilleure
  }

  /**
   * LA PAGE PDF EN IMAGE, sur fond blanc, à `plusGrandCote` pixels — et dans
   * le sens où on la lit : un plan A3 est souvent enregistré couché (/Rotate
   * 90), PDFKit le redresse à l'écran, on le redresse ici aussi.
   */
  static func rendreLaPage(_ page: PDFPage, plusGrandCote: CGFloat) -> UIImage {
    let boite = page.bounds(for: .cropBox)
    let rotation = ((page.rotation % 360) + 360) % 360
    let couchee = rotation == 90 || rotation == 270
    let l = couchee ? boite.height : boite.width
    let h = couchee ? boite.width : boite.height
    let k = plusGrandCote / max(l, h, 1)
    let taille = CGSize(width: floor(l * k), height: floor(h * k))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: taille))
      let g = ctx.cgContext
      // Le repère du PDF : y vers le haut.
      g.translateBy(x: 0, y: taille.height)
      g.scaleBy(x: 1, y: -1)
      // La rotation de la page, dans le sens horaire comme le veut /Rotate.
      switch rotation {
      case 90:
        g.translateBy(x: 0, y: taille.height)
        g.rotate(by: -.pi / 2)
      case 180:
        g.translateBy(x: taille.width, y: taille.height)
        g.rotate(by: .pi)
      case 270:
        g.translateBy(x: taille.width, y: 0)
        g.rotate(by: .pi / 2)
      default:
        break
      }
      g.scaleBy(x: k, y: k)
      g.translateBy(x: -boite.minX, y: -boite.minY)
      if let ref = page.pageRef {
        g.drawPDFPage(ref)
      } else {
        page.draw(with: .cropBox, to: g)
      }
    }
  }

  // ------------------------------------------------------------ la page prête

  /// Réduit la page, l'encode, lit ses textes — hors du fil principal.
  /// `lecture` : la finesse à laquelle les textes se lisent, quand l'image
  /// en a plus que les 2000 pixels qui partent.
  private func preparer(_ image: UIImage?, lecture: CGFloat = 2000, enPlus: [String: Any] = [:]) {
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
      let pourLire =
        lecture > 2000 ? (Self.reduire(image, plusGrandCote: lecture).cgImage ?? cg) : cg
      var resultat: [String: Any] = [
        "base64": jpeg.base64EncodedString(),
        "largeur": cg.width,
        "hauteur": cg.height,
        "textes": Self.lireLesTextes(pourLire),
      ]
      resultat.merge(enPlus) { garde, _ in garde }
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
