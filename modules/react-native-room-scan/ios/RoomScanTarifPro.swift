import Compression
import Foundation
import React
import UIKit
import UniformTypeIdentifiers

/**
 LE TARIF DU DISTRIBUTEUR — ouvert depuis Fichiers, lu sur le téléphone.

 Relevé du patron : « trouve un moyen d'avoir aussi les prix pro Rexel,
 Balitrand, Yesss, etc. ». Aucun d'eux ne publie ses prix : ce sont des prix
 NETS, négociés compte par compte, derrière la connexion de l'espace client,
 sans interface publique. Les lire à la place de l'électricien demanderait
 ses identifiants et contournerait les conditions de son distributeur.

 Le chemin du métier existe déjà : chaque distributeur laisse son client
 EXPORTER son tarif — un fichier Excel ou CSV depuis l'espace client, ou le
 fichier que le commercial envoie (au format FAB-DIS). C'est ce fichier
 qu'on ouvre ici : l'électricien le choisit dans Fichiers (ou iCloud Drive,
 ou une pièce jointe enregistrée), et rien ne quitte le téléphone.

 Un CSV est rendu en TEXTE (le JavaScript le découpe : son séparateur et son
 encodage varient d'un distributeur à l'autre, et c'est là qu'on l'éprouve).
 Un classeur Excel est rendu en LIGNES : un .xlsx est une archive zip de XML,
 que l'on ouvre ici sans bibliothèque — le répertoire de l'archive, le
 DEFLATE brut d'Apple (`COMPRESSION_ZLIB`), et deux fichiers XML : les
 chaînes partagées et la première feuille.
 */
@objc(RoomScanTarifPro)
final class RoomScanTarifPro: NSObject, UIDocumentPickerDelegate {
  private var rendre: RCTPromiseResolveBlock?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  private func sommet() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var haut = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    while let suivant = haut?.presentedViewController { haut = suivant }
    return haut
  }

  @objc func choisirUnTarif(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let haut = self.sommet() else {
        resolve(nil)
        return
      }
      var types: [UTType] = [.commaSeparatedText, .tabSeparatedText, .plainText, .text]
      if let xlsx = UTType("org.openxmlformats.spreadsheetml.sheet") { types.append(xlsx) }
      let choix = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
      choix.delegate = self
      choix.allowsMultipleSelection = false
      self.rendre = resolve
      haut.present(choix, animated: true)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    rendre?(nil)
    rendre = nil
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else {
      rendre?(nil)
      rendre = nil
      return
    }
    let resolve = rendre
    rendre = nil
    DispatchQueue.global(qos: .userInitiated).async {
      let nom = url.lastPathComponent
      guard let donnees = try? Data(contentsOf: url) else {
        resolve?(["nom": nom, "erreur": "illisible"])
        return
      }
      if url.pathExtension.lowercased() == "xlsx" {
        if let lignes = Classeur.lignes(donnees) {
          resolve?(["nom": nom, "lignes": lignes])
        } else {
          resolve?(["nom": nom, "erreur": "classeur"])
        }
        return
      }
      // Les exports français sont souvent en Windows-1252 : on essaie l'UTF-8
      // d'abord, et l'on retombe sur le latin sans perdre un accent.
      let texte = String(data: donnees, encoding: .utf8)
        ?? String(data: donnees, encoding: .windowsCP1252)
        ?? String(data: donnees, encoding: .isoLatin1)
      if let texte = texte {
        resolve?(["nom": nom, "texte": texte])
      } else {
        resolve?(["nom": nom, "erreur": "encodage"])
      }
    }
  }
}

/// Un classeur .xlsx réduit à sa première feuille, en lignes de texte.
enum Classeur {
  /// Au-delà, un tarif n'est plus un tarif d'électricien : on s'arrête.
  static let lignesMax = 60_000

  static func lignes(_ zip: Data) -> [[String]]? {
    guard let entrees = repertoire(zip) else { return nil }
    let partagees = entrees["xl/sharedStrings.xml"].flatMap { contenu(zip, $0) }.map(chaines) ?? []
    let feuille = entrees["xl/worksheets/sheet1.xml"]
      ?? entrees.filter { $0.key.hasPrefix("xl/worksheets/sheet") }.sorted { $0.key < $1.key }.first?.value
    guard let f = feuille, let xml = contenu(zip, f) else { return nil }
    let lecteur = LecteurDeFeuille(partagees: partagees)
    let p = XMLParser(data: xml)
    p.delegate = lecteur
    p.parse()
    return lecteur.lignes
  }

  struct Entree {
    let methode: UInt16
    let tailleCompressee: Int
    let taille: Int
    let enTete: Int
  }

  private static func u16(_ d: Data, _ i: Int) -> UInt16 {
    UInt16(d[d.startIndex + i]) | UInt16(d[d.startIndex + i + 1]) << 8
  }

  private static func u32(_ d: Data, _ i: Int) -> UInt32 {
    UInt32(u16(d, i)) | UInt32(u16(d, i + 2)) << 16
  }

  /// Le répertoire central de l'archive : nom → où et comment lire l'entrée.
  static func repertoire(_ d: Data) -> [String: Entree]? {
    guard d.count > 22 else { return nil }
    var fin = -1
    var i = d.count - 22
    while i >= max(0, d.count - 65_557) {
      if u32(d, i) == 0x0605_4b50 {
        fin = i
        break
      }
      i -= 1
    }
    guard fin >= 0 else { return nil }
    let nombre = Int(u16(d, fin + 10))
    var p = Int(u32(d, fin + 16))
    var out: [String: Entree] = [:]
    for _ in 0..<nombre {
      guard p + 46 <= d.count, u32(d, p) == 0x0201_4b50 else { return nil }
      let methode = u16(d, p + 10)
      let comp = Int(u32(d, p + 20))
      let taille = Int(u32(d, p + 24))
      let ln = Int(u16(d, p + 28))
      let le = Int(u16(d, p + 30))
      let lc = Int(u16(d, p + 32))
      let local = Int(u32(d, p + 42))
      guard p + 46 + ln <= d.count else { return nil }
      let nom = String(decoding: d.subdata(in: (d.startIndex + p + 46)..<(d.startIndex + p + 46 + ln)), as: UTF8.self)
      out[nom] = Entree(methode: methode, tailleCompressee: comp, taille: taille, enTete: local)
      p += 46 + ln + le + lc
    }
    return out
  }

  /// Le contenu décompressé d'une entrée (rangée telle quelle, ou DEFLATE).
  static func contenu(_ d: Data, _ e: Entree) -> Data? {
    let h = e.enTete
    guard h + 30 <= d.count, u32(d, h) == 0x0403_4b50 else { return nil }
    let debut = h + 30 + Int(u16(d, h + 26)) + Int(u16(d, h + 28))
    guard debut + e.tailleCompressee <= d.count else { return nil }
    let brut = d.subdata(in: (d.startIndex + debut)..<(d.startIndex + debut + e.tailleCompressee))
    if e.methode == 0 { return brut }
    guard e.methode == 8, e.taille > 0 else { return nil }
    var sortie = Data(count: e.taille)
    let n = sortie.withUnsafeMutableBytes { (dst: UnsafeMutableRawBufferPointer) -> Int in
      brut.withUnsafeBytes { (src: UnsafeRawBufferPointer) -> Int in
        guard let a = dst.bindMemory(to: UInt8.self).baseAddress,
          let b = src.bindMemory(to: UInt8.self).baseAddress
        else { return 0 }
        return compression_decode_buffer(a, e.taille, b, brut.count, nil, COMPRESSION_ZLIB)
      }
    }
    return n == e.taille ? sortie : nil
  }

  /// Les chaînes partagées, dans l'ordre : une par `<si>`, ses `<t>` mis bout à bout.
  static func chaines(_ xml: Data) -> [String] {
    let l = LecteurDeChaines()
    let p = XMLParser(data: xml)
    p.delegate = l
    p.parse()
    return l.out
  }
}

/// Les chaînes partagées d'un classeur.
final class LecteurDeChaines: NSObject, XMLParserDelegate {
  var out: [String] = []
  private var cour = ""
  private var dansT = false

  func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
    if e == "si" { cour = "" }
    if e == "t" { dansT = true }
  }

  func parser(_ p: XMLParser, foundCharacters s: String) { if dansT { cour += s } }

  func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
    if e == "t" { dansT = false }
    if e == "si" { out.append(cour) }
  }
}

/// La feuille, cellule par cellule : `A1`, `B1`… rangées à leur colonne.
final class LecteurDeFeuille: NSObject, XMLParserDelegate {
  let partagees: [String]
  var lignes: [[String]] = []
  private var ligne: [String] = []
  private var colonne = 0
  private var type = ""
  private var valeur = ""
  private var dansValeur = false

  init(partagees: [String]) { self.partagees = partagees }

  private static func indice(_ ref: String) -> Int {
    var n = 0
    for c in ref.unicodeScalars {
      guard c.value >= 65 && c.value <= 90 else { break }
      n = n * 26 + Int(c.value - 64)
    }
    return max(0, n - 1)
  }

  func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String] = [:]) {
    switch e {
    case "row":
      ligne = []
    case "c":
      colonne = a["r"].map(LecteurDeFeuille.indice) ?? ligne.count
      type = a["t"] ?? ""
      valeur = ""
    case "v", "t":
      dansValeur = true
    default:
      break
    }
  }

  func parser(_ p: XMLParser, foundCharacters s: String) { if dansValeur { valeur += s } }

  func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
    switch e {
    case "v", "t":
      dansValeur = false
    case "c":
      var texte = valeur
      if type == "s", let i = Int(valeur), i >= 0, i < partagees.count { texte = partagees[i] }
      while ligne.count < colonne { ligne.append("") }
      if ligne.count == colonne { ligne.append(texte) } else { ligne[colonne] = texte }
    case "row":
      lignes.append(ligne)
      if lignes.count >= Classeur.lignesMax { p.abortParsing() }
    default:
      break
    }
  }
}
