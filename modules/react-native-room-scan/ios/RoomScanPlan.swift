import Foundation
import UIKit
import Vision
import React

/**
 LA PHOTO D'UN PLAN PAPIER, ET CE QUE LE TÉLÉPHONE Y LIT.

 Ce module ne comprend RIEN au plan : il rend deux choses, et deux
 seulement — l'image en niveaux de gris, et les textes que Vision y a
 reconnus. Tout le reste — murs, menuiseries, symboles, échelle — se déduit
 en JavaScript, dans `src/papier/`, parce que ce qui se déduit se teste, et
 qu'un moteur de lecture écrit ici ne serait éprouvé nulle part.

 POURQUOI L'OCR RESTE NATIF. `VNRecognizeTextRequest` lit un texte imprimé
 depuis dix ans, gratuitement, hors ligne, dans toutes les langues, et mieux
 que tout ce qu'on écrirait à la main. Ce sont ses lignes qui donnent
 l'ÉCHELLE du plan — les cotes écrites, seule source exacte — et les noms des
 pièces.

 POURQUOI DU GRIS, ET EN BASE64. Un plan est un dessin au trait : la couleur
 n'y porte que du décor, et la garder triplerait le volume. Quant au
 transport, une photo fait un à trois millions de pixels ; les passer en
 tableau de nombres à travers le pont React Native voudrait dire sérialiser
 autant d'entiers en JSON. Le base64 coûte un tiers de plus en octets et cent
 fois moins en temps.

 DEUX MILLE PIXELS DE CÔTÉ SUFFISENT. Au-delà, on ne lit pas mieux : la
 recherche de droites coûte le carré de la taille, et le JavaScript réduit de
 toute façon l'image avant de travailler. Autant ne pas la transporter.
 */
@objc(RoomScanPlan)
class RoomScanPlan: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  private var resolve: RCTPromiseResolveBlock?

  /// Côté long de l'image transportée. Voir l'en-tête.
  private let coteMax: CGFloat = 2000

  /**
   Demande une photo de plan : l'appareil (`camera`) ou la photothèque
   (`galerie`), puis rend l'image en gris et les textes lus.

   Rend `nil` — jamais une erreur — si l'utilisateur renonce ou si la source
   n'existe pas : fermer un sélecteur d'images n'est pas une panne.
   */
  @objc func choisirPlan(_ source: String,
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    let type: UIImagePickerController.SourceType =
      source == "camera" ? .camera : .photoLibrary
    guard UIImagePickerController.isSourceTypeAvailable(type) else {
      resolve(nil)
      return
    }
    self.resolve = resolve
    DispatchQueue.main.async { self.presenter(type, attempt: 0) }
  }

  /// Même précaution que la photo de repérage : on attend que l'écran soit
  /// libre, sinon la présentation est avalée sans un mot.
  private func presenter(_ type: UIImagePickerController.SourceType, attempt: Int) {
    guard let root = UIApplication.shared.connectedScenes
      .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
      .first?.rootViewController else {
      rendre(nil)
      return
    }
    var top = root
    while let presented = top.presentedViewController {
      if presented.isBeingDismissed { break }
      top = presented
    }
    if top.isBeingDismissed || top.isBeingPresented {
      if attempt > 20 { rendre(nil); return }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        self.presenter(type, attempt: attempt + 1)
      }
      return
    }
    let picker = UIImagePickerController()
    picker.sourceType = type
    picker.allowsEditing = false
    picker.delegate = self
    top.present(picker, animated: true)
  }

  private func rendre(_ valeur: [String: Any]?) {
    resolve?(valeur)
    resolve = nil
  }

  /**
   Ramène l'image à `coteMax`, la redresse et la met en niveaux de gris.

   Le passage par un contexte de dessin n'est pas qu'une mise à l'échelle :
   il NORMALISE L'ORIENTATION. Une photo prise en portrait porte son sens
   dans ses métadonnées et non dans ses pixels ; sans ce redressement, le
   plan arriverait couché en JavaScript, et tout ce qui suit — l'angle de la
   feuille, les murs d'équerre — travaillerait de travers.
   */
  private func enGris(_ image: UIImage) -> (Data, Int, Int)? {
    let echelle = min(1, coteMax / max(image.size.width, image.size.height))
    let l = Int((image.size.width * echelle).rounded())
    let h = Int((image.size.height * echelle).rounded())
    guard l > 0, h > 0 else { return nil }
    var octets = [UInt8](repeating: 255, count: l * h)
    let espace = CGColorSpaceCreateDeviceGray()
    let ok = octets.withUnsafeMutableBytes { brut -> Bool in
      guard let base = brut.baseAddress,
            let ctx = CGContext(data: base,
                                width: l,
                                height: h,
                                bitsPerComponent: 8,
                                bytesPerRow: l,
                                space: espace,
                                bitmapInfo: CGImageAlphaInfo.none.rawValue) else {
        return false
      }
      UIGraphicsPushContext(ctx)
      // Le repère de Core Graphics monte, celui d'UIKit descend : on
      // retourne le contexte avant de dessiner, faute de quoi le plan
      // arriverait à l'envers.
      ctx.translateBy(x: 0, y: CGFloat(h))
      ctx.scaleBy(x: 1, y: -1)
      image.draw(in: CGRect(x: 0, y: 0, width: CGFloat(l), height: CGFloat(h)))
      UIGraphicsPopContext()
      return true
    }
    guard ok else { return nil }
    return (Data(octets), l, h)
  }

  /**
   Les textes de l'image, avec leur boîte EN PIXELS.

   Vision rend des boîtes normalisées dont l'origine est en bas à gauche ;
   le JavaScript travaille en pixels depuis le haut. La conversion se fait
   ici, une bonne fois : la faire de l'autre côté obligerait à transporter
   une convention de plus.

   On demande le français ET l'anglais : un plan français porte des cotes en
   chiffres, des noms de pièces en français, et souvent un cartouche de
   logiciel en anglais.
   */
  private func textes(de image: UIImage, largeur: Int, hauteur: Int) -> [[String: Any]] {
    guard let cg = image.cgImage else { return [] }
    let requete = VNRecognizeTextRequest()
    requete.recognitionLevel = .accurate
    requete.usesLanguageCorrection = false
    if #available(iOS 16.0, *) {
      requete.revision = VNRecognizeTextRequestRevision3
    }
    requete.recognitionLanguages = ["fr-FR", "en-US"]
    // Un plan est couvert de nombres à deux ou trois chiffres : sans cela,
    // la correction linguistique les remplacerait par des mots.
    let handler = VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:])
    do {
      try handler.perform([requete])
    } catch {
      return []
    }
    guard let lignes = requete.results else { return [] }
    var out: [[String: Any]] = []
    for ligne in lignes {
      guard let meilleure = ligne.topCandidates(1).first else { continue }
      let b = ligne.boundingBox
      out.append([
        "texte": meilleure.string,
        "x": b.minX * CGFloat(largeur),
        "y": (1 - b.maxY) * CGFloat(hauteur),
        "l": b.width * CGFloat(largeur),
        "h": b.height * CGFloat(hauteur),
        "sur": meilleure.confidence,
      ])
    }
    return out
  }
}

extension RoomScanPlan: UIImagePickerControllerDelegate, UINavigationControllerDelegate {

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) { self.rendre(nil) }
  }

  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    let image = info[.originalImage] as? UIImage
    picker.dismiss(animated: true) {
      guard let image = image, let (gris, l, h) = self.enGris(image) else {
        self.rendre(nil)
        return
      }
      // La reconnaissance de texte prend une à deux secondes sur un plan
      // chargé : elle ne se fait pas sur le fil principal, sinon l'écran se
      // fige pendant que le sélecteur se referme.
      DispatchQueue.global(qos: .userInitiated).async {
        let lus = self.textes(de: image, largeur: l, hauteur: h)
        let charge: [String: Any] = [
          "largeur": l,
          "hauteur": h,
          "gris": gris.base64EncodedString(),
          "textes": lus,
        ]
        DispatchQueue.main.async { self.rendre(charge) }
      }
    }
  }
}
