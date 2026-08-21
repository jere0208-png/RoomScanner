import Foundation
import Photos
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

  // MARK: - Le coffre : la photothèque de l'utilisateur

  /**
   POURQUOI LA PHOTOTHÈQUE, ET PAS SEULEMENT LES DOCUMENTS DE L'APP.

   Relevé du chantier : « fais en sorte que les photos soient stockées dans
   l'appareil de la personne et soient lues même s'il réinstalle
   l'application ». Les Documents de l'app ne survivent PAS à une
   désinstallation : la photo d'un mur, prise sur un chantier, disparaissait
   avec l'app — sans que personne ne l'ait effacée.

   La photothèque, elle, appartient à l'utilisateur, pas à nous. Une image
   qui y entre survit à la réinstallation, part dans sa sauvegarde iCloud,
   se retrouve dans ses Photos et se partage sans passer par nous. Le scan
   ne retient donc plus seulement un chemin de fichier — volatile — mais
   l'IDENTIFIANT DURABLE de l'image dans sa photothèque.

   Le fichier dans Documents reste : c'est le cache, celui qu'on relit vite
   pour l'affichage et le PDF. S'il a disparu, l'identifiant le reconstruit.
   */
  private static let ALBUM = "EchoPlan"

  /// L'album de l'application, cherché puis créé s'il manque.
  private func album(_ suite: @escaping (PHAssetCollection?) -> Void) {
    let options = PHFetchOptions()
    options.predicate = NSPredicate(format: "title = %@", Self.ALBUM)
    let trouve = PHAssetCollection.fetchAssetCollections(
      with: .album, subtype: .albumRegular, options: options,
    )
    if let deja = trouve.firstObject {
      suite(deja)
      return
    }
    var marque: String?
    PHPhotoLibrary.shared().performChanges({
      let req = PHAssetCollectionChangeRequest
        .creationRequestForAssetCollection(withTitle: Self.ALBUM)
      marque = req.placeholderForCreatedAssetCollection.localIdentifier
    }, completionHandler: { ok, _ in
      guard ok, let id = marque else {
        suite(nil)
        return
      }
      suite(PHAssetCollection.fetchAssetCollections(
        withLocalIdentifiers: [id], options: nil,
      ).firstObject)
    })
  }

  /**
   Range l'image dans la photothèque et rend son identifiant durable.

   `nil` si l'utilisateur refuse l'accès : le relevé continue avec le seul
   fichier local — on ne bloque JAMAIS un chantier sur une autorisation.
   */
  private func archiver(_ data: Data, suite: @escaping (String?) -> Void) {
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { statut in
      guard statut == .authorized || statut == .limited else {
        suite(nil)
        return
      }
      self.album { collection in
        var marque: String?
        PHPhotoLibrary.shared().performChanges({
          let req = PHAssetCreationRequest.forAsset()
          req.addResource(with: .photo, data: data, options: nil)
          marque = req.placeholderForCreatedAsset?.localIdentifier
          // L'album n'est qu'un rangement : sans lui la photo existe
          // quand même, dans la pellicule.
          if let c = collection,
             let ajout = PHAssetCollectionChangeRequest(for: c),
             let p = req.placeholderForCreatedAsset {
            ajout.addAssets([p] as NSArray)
          }
        }, completionHandler: { ok, _ in
          suite(ok ? marque : nil)
        })
      }
    }
  }

  /// L'image d'un identifiant durable, en JPEG, côté long borné.
  private func imageDe(_ id: String,
                       maxSide: CGFloat,
                       suite: @escaping (UIImage?) -> Void) {
    guard let asset = PHAsset.fetchAssets(
      withLocalIdentifiers: [id], options: nil,
    ).firstObject else {
      suite(nil)
      return
    }
    let options = PHImageRequestOptions()
    options.isSynchronous = false
    options.deliveryMode = .highQualityFormat
    // La photo peut n'être qu'en iCloud : on accepte de la télécharger,
    // c'est le prix d'un relevé qu'on croyait perdu.
    options.isNetworkAccessAllowed = true
    PHImageManager.default().requestImage(
      for: asset,
      targetSize: CGSize(width: maxSide, height: maxSide),
      contentMode: .aspectFit,
      options: options,
    ) { image, _ in suite(image) }
  }

  /**
   RELIT UNE PHOTO DEPUIS LA PHOTOTHÈQUE, et la remet dans le cache.

   C'est ce qui rend la réinstallation indolore : le fichier local n'existe
   plus, mais l'identifiant, lui, a voyagé avec le scan. On réécrit l'image
   dans Documents et l'on rend son nouveau chemin — le reste de
   l'application ne voit qu'un fichier, comme avant.
   */
  @objc func restorePhoto(_ id: String,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    imageDe(id, maxSide: 1600) { image in
      guard let image = image else {
        resolve(nil)
        return
      }
      resolve(self.save(image))
    }
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

  /**
   Rend ce que la prise a produit : le fichier de cache ET l'identifiant
   durable dans la photothèque.

   `nil` d'un bloc quand l'utilisateur a renoncé. L'identifiant seul peut
   manquer — accès à la photothèque refusé — sans que le relevé en souffre :
   la photo est alors simplement mortelle, comme avant.
   */
  private func finish(_ path: String?, asset: String? = nil) {
    guard let path = path else {
      resolve?(nil)
      resolve = nil
      reject = nil
      return
    }
    resolve?(["path": path, "asset": asset as Any])
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
      guard let image = image, let chemin = self.save(image) else {
        self.finish(nil)
        return
      }
      /*
        LE FICHIER D'ABORD, LE COFFRE ENSUITE.

        Le chemin local est écrit et sûr avant qu'on parle à la
        photothèque : si l'autorisation est refusée, ou si le rangement
        échoue, le relevé garde sa photo. On ne perd jamais l'image pour
        une question de permission.
      */
      guard let data = FileManager.default.contents(atPath: chemin) else {
        self.finish(chemin)
        return
      }
      self.archiver(data) { id in
        DispatchQueue.main.async { self.finish(chemin, asset: id) }
      }
    }
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) { self.finish(nil) }
  }
}
