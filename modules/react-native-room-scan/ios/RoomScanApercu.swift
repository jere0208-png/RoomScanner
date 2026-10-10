import CoreImage
import Foundation
import PDFKit
import React
import UIKit

/**
 L'APERÇU DU DOSSIER — chaque feuille du PDF, en image.

 Relevé du patron : « lors de l'export PDF, si l'utilisateur n'a pas
 d'abonnement, donne-lui la possibilité de voir son PDF flouté, mais assez
 pour voir que c'est son plan, avec de gros filigranes EchoPlan. C'est une
 technique de confiance, et son PDF doit donner l'envie d'acheter pour
 déflouter et télécharger. »

 Le document est bâti en JavaScript ; on le rend ici, feuille par feuille, en
 JPEG. Pour l'abonné : net. Pour les autres : le FLOU et le FILIGRANE sont
 GRAVÉS DANS L'IMAGE, ici, avant qu'elle ne quitte le natif — l'écran ne reçoit
 jamais la feuille nette, et aucun calque retiré ne la rendrait lisible.

 Le flou est réglé pour qu'on reconnaisse SON logement — les murs, les
 pièces, la forme du plan — sans pouvoir lire une cote : c'est la preuve
 que le dossier existe, pas le dossier.
 */
extension RoomScanExport {

  @objc func apercuPdf(_ base64: String,
                       largeur: NSNumber,
                       flou: NSNumber,
                       filigrane: String,
                       maxPages: NSNumber,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let data = Data(base64Encoded: base64),
            let document = PDFDocument(data: data) else {
        reject("BAD_DATA", "PDF illisible", nil)
        return
      }
      let w = max(120, CGFloat(truncating: largeur))
      let rayon = max(0, CGFloat(truncating: flou))
      let n = min(document.pageCount, max(1, maxPages.intValue))
      let contexte = CIContext(options: nil)
      var sorties: [String] = []
      for i in 0..<n {
        guard let page = document.page(at: i) else { continue }
        let boite = page.bounds(for: .mediaBox)
        guard boite.width > 0, boite.height > 0 else { continue }
        let k = w / boite.width
        let taille = CGSize(width: round(boite.width * k), height: round(boite.height * k))
        var image = RoomScanExport.rendre(page, taille: taille)
        if rayon > 0, let floue = RoomScanExport.flouter(image, rayon: rayon, contexte: contexte) {
          image = floue
        }
        if !filigrane.isEmpty {
          image = RoomScanExport.filigraner(image, texte: filigrane)
        }
        if let jpeg = image.jpegData(compressionQuality: 0.72) {
          sorties.append(jpeg.base64EncodedString())
        }
      }
      resolve(sorties)
    }
  }

  /// La feuille, à la taille voulue, sur fond blanc.
  static func rendre(_ page: PDFPage, taille: CGSize) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let vignette = page.thumbnail(of: taille, for: .mediaBox)
    return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: taille))
      // La vignette garde les proportions de la feuille : on la centre.
      let v = vignette.size
      let origine = CGPoint(x: (taille.width - v.width) / 2, y: (taille.height - v.height) / 2)
      vignette.draw(in: CGRect(origin: origine, size: v))
    }
  }

  /// Le flou : assez pour qu'aucune cote ne se lise, pas assez pour perdre le plan.
  static func flouter(_ image: UIImage, rayon: CGFloat, contexte: CIContext) -> UIImage? {
    guard let entree = CIImage(image: image),
          let filtre = CIFilter(name: "CIGaussianBlur") else { return nil }
    filtre.setValue(entree.clampedToExtent(), forKey: kCIInputImageKey)
    filtre.setValue(rayon, forKey: kCIInputRadiusKey)
    guard let sortie = filtre.outputImage?.cropped(to: entree.extent),
          let cg = contexte.createCGImage(sortie, from: entree.extent) else { return nil }
    return UIImage(cgImage: cg)
  }

  /// Le filigrane : le nom de la marque, en grand, en biais, sur toute la feuille.
  static func filigraner(_ image: UIImage, texte: String) -> UIImage {
    let taille = image.size
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      image.draw(in: CGRect(origin: .zero, size: taille))
      let cg = ctx.cgContext
      let corps = max(26, taille.width / 6)
      let attributs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: corps, weight: .heavy),
        .foregroundColor: UIColor(red: 0.12, green: 0.36, blue: 1.0, alpha: 0.30),
      ]
      let mot = texte as NSString
      let mesure = mot.size(withAttributes: attributs)
      cg.saveGState()
      cg.translateBy(x: taille.width / 2, y: taille.height / 2)
      cg.rotate(by: -CGFloat.pi / 7)
      let pas = mesure.height * 1.8
      let lignes = Int(ceil(taille.height * 1.6 / pas))
      let demi = lignes / 2
      for k in -demi...demi {
        let decalage = abs(k) % 2 == 0 ? 0 : mesure.width * 0.55
        var x = -taille.width * 1.25 + decalage
        while x < taille.width * 1.25 {
          mot.draw(at: CGPoint(x: x, y: CGFloat(k) * pas - mesure.height / 2), withAttributes: attributs)
          x += mesure.width * 1.3
        }
      }
      cg.restoreGState()
    }
  }
}
