import Foundation
import UIKit
import React

/**
 Photo de repérage.

 Un relevé se fait vite ; sa relecture, trois jours plus tard, achoppe
 toujours sur la même question — « c'était quoi, ce mur ? ». Une photo
 punaisée sur le plan y répond mieux qu'une note.

 On passe par `UIImagePickerController` plutôt que par une session AVCapture
 maison : c'est l'appareil photo du système, avec sa mise au point, son
 exposition et son autorisation déjà accordée pour le scan. L'image part
 dans Documents, redimensionnée — un plan n'a pas besoin de douze mégapixels,
 et la sauvegarde du scan les traînerait à chaque écriture.
 */
@objc(RoomScanPhoto)
class RoomScanPhoto: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?

  /// Efface des photos de repérage. Un scan supprimé ne doit pas laisser
  /// ses images derrière lui : elles s'accumuleraient sans que personne
  /// puisse jamais les retrouver ni les effacer.
  @objc func deletePhotos(_ paths: [String],
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    var n = 0
    for p in paths {
      // On ne sort JAMAIS du dossier des photos : un chemin venu du disque
      // ne doit pas pouvoir désigner autre chose.
      let url = URL(fileURLWithPath: p)
      guard url.deletingLastPathComponent().lastPathComponent == "photos" else {
        continue
      }
      if (try? FileManager.default.removeItem(at: url)) != nil { n += 1 }
    }
    resolve(n)
  }

  /**
   FAIT LE MÉNAGE DES MODÈLES 3D.

   Chaque relevé écrit un `.usdz` dans les Documents de l'app — quelques
   mégaoctets — et personne ne l'effaçait jamais : supprimer un scan
   emportait ses photos, jamais son modèle. Vingt chantiers plus tard, le
   téléphone est plein, et l'installation d'une mise à jour échoue faute de
   place. C'est arrivé.

   On garde ceux que la bibliothèque référence encore, et l'on efface les
   autres. Comme pour les photos, la garde est stricte : rien en dehors des
   fichiers que l'app a elle-même écrits (« scan-….usdz », à la racine des
   Documents) ne peut être touché, quel que soit le chemin reçu.
   */
  @objc func cleanModels(_ gardes: [String],
                         resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    let fm = FileManager.default
    guard let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first,
          let tous = try? fm.contentsOfDirectory(
            at: docs, includingPropertiesForKeys: [.fileSizeKey]
          ) else {
      resolve(0)
      return
    }
    let vivants = Set(gardes.map { URL(fileURLWithPath: $0).lastPathComponent })
    var octets = 0
    for url in tous {
      let nom = url.lastPathComponent
      guard nom.hasPrefix("scan-"), nom.hasSuffix(".usdz") else { continue }
      guard !vivants.contains(nom) else { continue }
      let taille = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
      if (try? fm.removeItem(at: url)) != nil { octets += taille }
    }
    // Les octets rendus : l'app peut le DIRE, et pas seulement le faire.
    resolve(octets)
  }

  /**
   Relit une photo de repérage, réduite, en JPEG base64.

   Le PDF ne sait embarquer que des octets : un chemin de fichier ne lui
   sert à rien. Et on ne veut pas y verser l'image telle quelle — 1600 px
   par mur, sur douze murs, feraient un dossier qu'aucune messagerie ne
   laisse passer. On la ramène donc au format où elle sera imprimée : une
   vignette sous l'élévation, jamais plus large qu'un tiers de page.

   `nil` si le fichier n'existe plus (photo effacée hors de l'app) : la
   feuille sortira sans elle, ce qui vaut mieux qu'un export qui échoue.
   */
  @objc func readPhoto(_ path: String,
                       maxSide: NSNumber,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    let url = URL(fileURLWithPath: path)
    // Même garde que pour l'effacement : on ne lit que NOS photos.
    guard url.deletingLastPathComponent().lastPathComponent == "photos",
          let image = UIImage(contentsOfFile: path) else {
      resolve(nil)
      return
    }
    let cote = CGFloat(truncating: maxSide)
    let echelle = min(1, cote / max(image.size.width, image.size.height))
    let taille = CGSize(width: image.size.width * echelle,
                        height: image.size.height * echelle)
    let rendu = UIGraphicsImageRenderer(size: taille).image { _ in
      image.draw(in: CGRect(origin: .zero, size: taille))
    }
    guard let data = rendu.jpegData(compressionQuality: 0.62) else {
      resolve(nil)
      return
    }
    resolve(data.base64EncodedString())
  }

  /// Prend une photo et renvoie son chemin, ou `nil` si l'utilisateur annule.
  @objc func takePhoto(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
      resolve(nil)
      return
    }
    self.resolve = resolve
    self.reject = reject
    DispatchQueue.main.async { self.present(attempt: 0) }
  }

  /// Même précaution que le partage : on attend que l'écran soit libre.
  private func present(attempt: Int) {
    guard let root = UIApplication.shared.connectedScenes
      .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
      .first?.rootViewController else {
      finish(nil)
      return
    }
    var top = root
    while let presented = top.presentedViewController {
      if presented.isBeingDismissed { break }
      top = presented
    }
    if top.isBeingDismissed || top.isBeingPresented {
      if attempt > 20 { finish(nil); return }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        self.present(attempt: attempt + 1)
      }
      return
    }
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.allowsEditing = false
    picker.delegate = self
    top.present(picker, animated: true)
  }

  private func finish(_ path: String?) {
    resolve?(path)
    resolve = nil
    reject = nil
  }

  /// Écrit l'image en JPEG, côté long ramené à 1600 px.
  private func save(_ image: UIImage) -> String? {
    let cote: CGFloat = 1600
    let echelle = min(1, cote / max(image.size.width, image.size.height))
    let taille = CGSize(width: image.size.width * echelle,
                        height: image.size.height * echelle)
    let rendu = UIGraphicsImageRenderer(size: taille).image { _ in
      image.draw(in: CGRect(origin: .zero, size: taille))
    }
    guard let data = rendu.jpegData(compressionQuality: 0.72) else { return nil }
    let dossier = FileManager.default
      .urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("photos", isDirectory: true)
    try? FileManager.default.createDirectory(at: dossier,
                                             withIntermediateDirectories: true)
    let url = dossier.appendingPathComponent("p-\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
    do {
      try data.write(to: url)
      return url.path
    } catch {
      return nil
    }
  }
}

extension RoomScanPhoto: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    let image = info[.originalImage] as? UIImage
    picker.dismiss(animated: true) {
      self.finish(image.flatMap { self.save($0) })
    }
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) { self.finish(nil) }
  }
}
