import Foundation
import ImageIO
import Photos
import PhotosUI
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

  /**
   LA PHOTO S'ÉCRIT À L'ÉCART DE L'ÉCRAN — ramener un original de douze à
   quarante-huit mégapixels à 1600 px, puis l'encoder en JPEG, coûtait
   100 à 300 ms sur le fil principal : l'interface se figeait au retour de
   l'appareil photo. Une file à elle, en série (deux photos ne s'écrivent
   jamais en même temps), et l'on ne revient au fil principal que pour
   rendre la main. La réserve est vidée à chaque photo : les grandes images
   intermédiaires ne s'attardent pas.
   */
  private static let atelier = DispatchQueue(label: "fr.echoplan.photo",
                                             qos: .userInitiated,
                                             autoreleaseFrequency: .workItem)

  /// Efface des photos de repérage. Un scan supprimé ne doit pas laisser
  /// ses images derrière lui : elles s'accumuleraient sans que personne
  /// puisse jamais les retrouver ni les effacer.
  @objc func deletePhotos(_ paths: [String],
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    var n = 0
    for p in paths {
      // Même garde qu'avant, et le chemin d'un ancien conteneur retrouvé :
      // voir `resolvePhoto`.
      guard let url = RoomScanPhoto.resolvePhoto(p) else { continue }
      if (try? FileManager.default.removeItem(at: url)) != nil { n += 1 }
    }
    resolve(n)
  }

  /**
   RETROUVE UNE PHOTO DONT LE CHEMIN DATE D'UN AUTRE CONTENEUR — revue
   « fiabilité » : le plan garde le chemin absolu, qui porte l'UUID du
   conteneur de l'app. Une mise à jour, une restauration, un nouvel iPhone
   changent cet UUID : le fichier est toujours dans `Documents/photos`, mais
   le chemin ne mène plus à rien. On le cherche alors par son nom, dans le
   dossier des photos d'AUJOURD'HUI.

   On ne sort JAMAIS du dossier des photos : un chemin venu du disque ne
   doit pas pouvoir désigner autre chose, ni remonter d'un cran (« .. »).
   `nil` si le fichier n'est nulle part. Le chemin arrive nu, sans préfixe
   de schéma (voir `RoomScanExport.resolveFile`, qui l'ôte avant).
   */
  static func resolvePhoto(_ path: String) -> URL? {
    let url = URL(fileURLWithPath: path)
    let nom = url.lastPathComponent
    guard !nom.isEmpty, nom != ".", nom != ".." else { return nil }
    guard url.deletingLastPathComponent().lastPathComponent == "photos" else {
      return ancienneVueDeMur(url)
    }
    let fm = FileManager.default
    if fm.fileExists(atPath: url.path) { return url }
    guard let docs = fm.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return nil
    }
    let candidat = docs
      .appendingPathComponent("photos", isDirectory: true)
      .appendingPathComponent(nom)
    return fm.fileExists(atPath: candidat.path) ? candidat : nil
  }

  /**
   LES PHOTOS DE MUR D'AVANT — écrites à la racine des Documents
   (`mur-<UUID>.jpg`, voir `PhotographeDesMurs.livrer`). On les relit et on
   les efface encore, mais la garde reste stricte : ce nom exact, à la racine
   des Documents de CE conteneur, et rien d'autre.
   */
  private static func ancienneVueDeMur(_ url: URL) -> URL? {
    let nom = url.lastPathComponent
    guard url.deletingLastPathComponent().lastPathComponent == "Documents",
          nom.range(
            of: "^mur-[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\.jpg$",
            options: .regularExpression) != nil,
          let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    else { return nil }
    let candidat = docs.appendingPathComponent(nom)
    return FileManager.default.fileExists(atPath: candidat.path) ? candidat : nil
  }

  /// Le dossier Documents de CE conteneur : le JS y rebranche, pour les
  /// afficher, les chemins écrits par une installation précédente (voir
  /// `cheminVivant` dans `src/ui/photos.ts`).
  @objc func documentsDir(_ resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    resolve(docs?.path)
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

   LA VIGNETTE SE LIT SANS DÉCODER LA PHOTO — ImageIO réduit le JPEG en le
   lisant : on n'a plus en mémoire, pour chaque mur du dossier, l'image
   entière de 1600 px décodée puis redessinée pour n'en garder que 900.
   L'orientation est appliquée, et l'image n'est jamais agrandie.
   */
  @objc func readPhoto(_ path: String,
                       maxSide: NSNumber,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    // Même garde que pour l'effacement : on ne lit que NOS photos, même
    // écrites par un ancien conteneur (voir `resolvePhoto`).
    guard let url = RoomScanPhoto.resolvePhoto(path),
          let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      resolve(nil)
      return
    }
    let cote: Int = max(1, maxSide.intValue)
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: cote,
    ]
    guard let vignette = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
          let data = UIImage(cgImage: vignette).jpegData(compressionQuality: 0.62) else {
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

  /**
   L'ACCÈS COMPLET, DEMANDÉ À LA PREMIÈRE PHOTO — relevé du patron : « fais
   en sorte que l'album fonctionne vraiment ». On ne demandait que l'ajout
   (`.addOnly`) : il laisse déposer une image, mais ni chercher l'album, ni
   le créer, ni relire une photo par son identifiant. L'album n'existait
   donc jamais, les photos tombaient en vrac dans la pellicule, et la
   relecture d'après réinstallation ne retrouvait rien.

   `.readWrite` est la seule autorisation qui permet les trois. Elle n'est
   demandée qu'une fois, au moment où l'on en a besoin — la première photo
   de repérage, ou la première photo à retrouver après une réinstallation —,
   jamais au lancement : une question posée hors de son contexte est une
   question à laquelle on répond « non ».

   Le rappel arrive sur un fil quelconque : à l'appelant d'y revenir.
   */
  private static func autoriser(_ suite: @escaping (PHAuthorizationStatus) -> Void) {
    let statut = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    guard statut == .notDetermined else {
      suite(statut)
      return
    }
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { nouveau in
      suite(nouveau)
    }
  }

  /// Le mot que le JS comprend pour un état d'accès (voir `AccesPhotos`).
  private static func mot(_ statut: PHAuthorizationStatus) -> String {
    switch statut {
    case .authorized: return "complet"
    case .limited: return "limite"
    case .notDetermined: return "indetermine"
    case .denied, .restricted: return "refuse"
    @unknown default: return "refuse"
    }
  }

  /// L'état de l'accès à la photothèque, SANS rien demander : la page
  /// Confidentialité le montre, et une question n'a rien à faire là.
  @objc func photoAccess(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    resolve(Self.mot(PHPhotoLibrary.authorizationStatus(for: .readWrite)))
  }

  /**
   ÉLARGIR UN ACCÈS LIMITÉ : la feuille du système où l'on coche les photos
   que l'application a le droit de voir.

   C'est le remède d'après une réinstallation en accès limité : la
   sélection d'avant est partie avec l'application, et nos propres photos
   n'y figurent plus. On les recoche, et elles se relisent. Hors accès
   limité, la feuille n'a pas de sens (iOS ne la montrerait pas) : on rend
   simplement l'état, et le JS envoie vers les Réglages.

   Rend l'état d'accès une fois la feuille refermée.
   */
  @objc func pickLimitedPhotos(_ resolve: @escaping RCTPromiseResolveBlock,
                               reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let statut = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard statut == .limited, let haut = Self.ecranDuDessus() else {
        resolve(Self.mot(statut))
        return
      }
      PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: haut) { _ in
        resolve(Self.mot(PHPhotoLibrary.authorizationStatus(for: .readWrite)))
      }
    }
  }

  /// L'écran le plus haut qui ne soit pas en train de partir. Fil principal.
  private static func ecranDuDessus() -> UIViewController? {
    guard let racine = UIApplication.shared.connectedScenes
      .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
      .first?.rootViewController else {
      return nil
    }
    var haut = racine
    while let presente = haut.presentedViewController, !presente.isBeingDismissed {
      haut = presente
    }
    return haut
  }

  /**
   L'album de l'application, cherché puis créé s'il manque.

   Cherché PAR SON NOM : après une réinstallation, c'est l'album d'avant
   qu'on retrouve, au lieu d'en créer un second « EchoPlan » à côté.
   N'a de sens qu'en accès complet — voir `archiver`.
   */
  private func album(_ suite: @escaping (PHAssetCollection?) -> Void) {
    let options = PHFetchOptions()
    options.predicate = NSPredicate(format: "title = %@", Self.ALBUM)
    let trouve = PHAssetCollection.fetchAssetCollections(
      with: .album, subtype: .albumRegular, options: options
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
        withLocalIdentifiers: [id], options: nil
      ).firstObject)
    })
  }

  /**
   Range l'image dans la photothèque et rend son identifiant durable, avec
   l'état de l'accès — le JS en tire le message à montrer.

   - ACCÈS COMPLET : la photo entre dans l'album « EchoPlan ».
   - ACCÈS LIMITÉ : iOS ne laisse ni chercher ni créer d'album. La photo
     entre dans la pellicule, et iOS l'ajoute de lui-même à la sélection
     de l'application : on pourra la relire par son identifiant, comme
     toutes celles qu'on a créées — et seulement celles-là.
   - REFUS : `nil`. Le relevé continue avec le seul fichier local — on ne
     bloque JAMAIS un chantier sur une autorisation.
   */
  private func archiver(_ data: Data,
                        suite: @escaping (String?, PHAuthorizationStatus) -> Void) {
    Self.autoriser { statut in
      switch statut {
      case .authorized:
        self.album { collection in
          self.deposer(data, dans: collection) { id in suite(id, statut) }
        }
      case .limited:
        self.deposer(data, dans: nil) { id in suite(id, statut) }
      default:
        suite(nil, statut)
      }
    }
  }

  /// Crée l'image dans la photothèque, dans l'album s'il y en a un.
  private func deposer(_ data: Data,
                       dans collection: PHAssetCollection?,
                       suite: @escaping (String?) -> Void) {
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

  /**
   L'image d'un identifiant durable, en JPEG, côté long borné.

   On ne relit QUE nos identifiants — ceux que le scan a retenus à la prise
   de vue : jamais de parcours de la photothèque. En accès limité, c'est
   d'ailleurs tout ce qu'iOS laisse voir.
   */
  private func imageDe(_ id: String,
                       maxSide: CGFloat,
                       suite: @escaping (UIImage?) -> Void) {
    guard let asset = PHAsset.fetchAssets(
      withLocalIdentifiers: [id], options: nil
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
      options: options
    ) { image, _ in suite(image) }
  }

  /// La réponse de `restorePhoto`, typée une fois pour toutes : un littéral
  /// mêlant `NSNull` et `String` ne s'infère pas tout seul.
  private static func relue(_ chemin: String?, _ acces: String) -> [String: Any] {
    var r: [String: Any] = ["acces": acces]
    if let chemin = chemin {
      r["path"] = chemin
    } else {
      r["path"] = NSNull()
    }
    return r
  }

  /**
   RELIT UNE PHOTO DEPUIS LA PHOTOTHÈQUE, et la remet dans le cache.

   C'est ce qui rend la réinstallation indolore : le fichier local n'existe
   plus, mais l'identifiant, lui, a voyagé avec le scan. On réécrit l'image
   dans Documents et l'on rend son nouveau chemin — le reste de
   l'application ne voit qu'un fichier, comme avant.

   Rend `{ path, acces }` : `path` vaut `null` quand l'image n'a pas pu être
   relue, et `acces` dit pourquoi — refus, accès limité (la photo existe
   peut-être, mais hors de la sélection), ou accès complet (elle a été
   effacée des Photos). L'accès est demandé ICI s'il ne l'a jamais été :
   après une réinstallation, c'est la première fois qu'on en a besoin, et
   c'est l'utilisateur qui vient d'ouvrir la photo — jamais une demande
   implicite, cachée dans une lecture.
   */
  @objc func restorePhoto(_ id: String,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
    Self.autoriser { statut in
      let acces = Self.mot(statut)
      guard statut == .authorized || statut == .limited else {
        resolve(Self.relue(nil, acces))
        return
      }
      self.imageDe(id, maxSide: 1600) { image in
        guard let image = image else {
          resolve(Self.relue(nil, acces))
          return
        }
        // La photothèque rend l'image sur le fil principal : l'écriture part
        // dans l'atelier (voir `atelier`).
        Self.atelier.async {
          if let chemin = self.save(image)?.chemin {
            resolve(Self.relue(chemin, acces))
          } else {
            resolve(Self.relue(nil, acces))
          }
        }
      }
    }
  }

  /// Prend une photo et renvoie son chemin, ou `nil` si l'utilisateur annule.
  @objc func takePhoto(_ resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
      resolve(nil)
      return
    }
    // Une prise de vue précédente encore en attente se règle (annulée).
    self.resolve?(nil)
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
   la photo est alors simplement mortelle, comme avant. `acces` dit l'état
   de l'autorisation (voir `mot`), pour que le JS l'explique.
   */
  private func finish(_ path: String?, asset: String? = nil, acces: String? = nil) {
    guard let path = path else {
      resolve?(nil)
      resolve = nil
      reject = nil
      return
    }
    // Les clés absentes plutôt que nulles : le JS lit `prise.asset?`.
    var prise: [String: Any] = ["path": path]
    if let asset = asset { prise["asset"] = asset }
    if let acces = acces { prise["acces"] = acces }
    resolve?(prise)
    resolve = nil
    reject = nil
  }

  /**
   UN PIXEL PAR POINT. Sans ce format, le rendu prend l'échelle de l'écran
   (×3) : la photo « ramenée à 1600 px » sortait en 4800 px — neuf fois plus
   lourde, environ 70 Mo en mémoire avant l'encodage. (La relecture pour un
   PDF, elle, passe par ImageIO, qui compte déjà en pixels : voir
   `readPhoto`.)
   */
  static func pixelParPoint() -> UIGraphicsImageRendererFormat {
    let f = UIGraphicsImageRendererFormat.default()
    f.scale = 1
    return f
  }

  /// Écrit l'image en JPEG, côté long ramené à 1600 px. Rend le chemin ET
  /// les octets écrits : la photothèque les reçoit sans relire le disque.
  /// Lourd — à appeler depuis `atelier`, jamais du fil principal.
  private func save(_ image: UIImage) -> (chemin: String, donnees: Data)? {
    let cote: CGFloat = 1600
    let echelle = min(1, cote / max(image.size.width, image.size.height))
    let taille = CGSize(width: image.size.width * echelle,
                        height: image.size.height * echelle)
    let rendu = UIGraphicsImageRenderer(size: taille, format: RoomScanPhoto.pixelParPoint()).image { _ in
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
      return (chemin: url.path, donnees: data)
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
      guard let image = image else {
        self.finish(nil)
        return
      }
      // L'écriture part dans l'atelier (voir `atelier`) ; `finish` et la
      // photothèque restent sur le fil principal, comme avant.
      Self.atelier.async {
        let ecrit = self.save(image)
        DispatchQueue.main.async {
          guard let fait = ecrit else {
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
          self.archiver(fait.donnees) { id, statut in
            let acces = Self.mot(statut)
            DispatchQueue.main.async {
              self.finish(fait.chemin, asset: id, acces: acces)
            }
          }
        }
      }
    }
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) { self.finish(nil) }
  }
}
