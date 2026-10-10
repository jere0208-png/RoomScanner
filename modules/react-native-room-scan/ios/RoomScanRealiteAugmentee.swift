import ARKit
import Foundation
import QuickLook
import React
import SceneKit
import UIKit
import simd

/**
 LA MAQUETTE CHEZ SOI, EN RÉALITÉ AUGMENTÉE.

 Relevé du patron : « améliore encore nativement l'application pour être au
 top de la concurrence ». Les applications de relevé exportent le fichier de
 RoomPlan — des boîtes grises. Ici, c'est LA MAQUETTE TELLE QU'ON LA VOIT qui
 se pose sur la table : murs en vraies images, meubles à leurs cotes, portes
 et fenêtres en volume.

 - La scène de la vue (`bati`) est recopiée, sans ce qui n'a de sens qu'à
   l'écran : les liserés (une coque gonflée par un nuanceur) et les ombres de
   contact ; l'écorché, qui se voile selon le regard, redevient plein.
 - Elle est ramenée à SOIXANTE CENTIMÈTRES dans sa plus grande longueur,
   posée au sol, centrée : une maquette de table. AR Quick Look laisse
   l'agrandir du bout des doigts jusqu'à la taille réelle.
 - Écrite en USDZ dans un dossier temporaire, ouverte dans AR Quick Look.
 */
extension RoomScanVisite {
  func maquetteEnUSDZ(largeur: Float) -> URL? {
    let copie = SCNNode()
    for enfant in bati.childNodes {
      // Ni liseré ni ombre de contact : ils ne voyagent pas.
      if enfant.renderingOrder == 4 || enfant.renderingOrder == 5 { continue }
      guard enfant.geometry != nil else { continue }
      let n = enfant.clone()
      // Ses matières à lui : on les simplifie sans toucher à la vue.
      if let g = n.geometry?.copy() as? SCNGeometry {
        g.materials = g.materials.map { RoomScanVisite.matierePourLExport($0) }
        n.geometry = g
      }
      copie.addChildNode(n)
    }
    guard !copie.childNodes.isEmpty else { return nil }

    // L'emprise de la maquette, sommet par sommet de chaque boîte englobante.
    var mn = SIMD3<Float>(repeating: Float.greatestFiniteMagnitude)
    var mx = SIMD3<Float>(repeating: -Float.greatestFiniteMagnitude)
    for n in copie.childNodes {
      let (a, b) = n.boundingBox
      for i in 0..<8 {
        let x: Float = (i & 1) == 0 ? a.x : b.x
        let y: Float = (i & 2) == 0 ? a.y : b.y
        let z: Float = (i & 4) == 0 ? a.z : b.z
        let p = n.convertPosition(SCNVector3(x, y, z), to: copie)
        let q = SIMD3<Float>(p.x, p.y, p.z)
        mn = simd_min(mn, q)
        mx = simd_max(mx, q)
      }
    }
    let etendue: Float = max(mx.x - mn.x, mx.z - mn.z)
    guard etendue.isFinite, etendue > 0.1 else { return nil }
    let k: Float = largeur / etendue
    let cx: Float = (mn.x + mx.x) / 2
    let cz: Float = (mn.z + mx.z) / 2
    copie.scale = SCNVector3(k, k, k)
    copie.position = SCNVector3(-cx * k, -mn.y * k, -cz * k)

    let scene = SCNScene()
    scene.rootNode.addChildNode(copie)
    // Un dossier par export : AR Quick Look garde en mémoire ce qu'il a ouvert.
    let tmp = FileManager.default.temporaryDirectory
    let dossier = tmp.appendingPathComponent("ra-\(Int(Date().timeIntervalSince1970 * 1000))")
    if let anciens = try? FileManager.default.contentsOfDirectory(at: tmp, includingPropertiesForKeys: nil) {
      for a in anciens where a.lastPathComponent.hasPrefix("ra-") {
        try? FileManager.default.removeItem(at: a)
      }
    }
    guard (try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)) != nil else {
      return nil
    }
    let url = dossier.appendingPathComponent("Maquette EchoPlan.usdz")
    guard scene.write(to: url, options: nil, delegate: nil, progressHandler: nil) else { return nil }
    return url
  }

  /// Une matière telle qu'elle doit sortir : l'écorché redevient plein.
  static func matierePourLExport(_ m: SCNMaterial) -> SCNMaterial {
    guard let c = m.copy() as? SCNMaterial else { return m }
    if c.shaderModifiers != nil {
      c.shaderModifiers = nil
      c.writesToDepthBuffer = true
      c.transparency = 1
    }
    return c
  }
}

/** AR Quick Look, ouvert sur un fichier. Gardé vivant le temps de l'aperçu. */
final class ApercuEnRA: NSObject, QLPreviewControllerDataSource {
  private static var courant: ApercuEnRA?
  private let url: URL

  init(url: URL) {
    self.url = url
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
    let item = ARQuickLookPreviewItem(fileAt: url)
    item.allowsContentScaling = true
    return item
  }

  /**
   Présente l'aperçu, mais pas avant que l'écran soit libre : la carte du
   bilan peut être en train de se refermer, et présenter par-dessus une
   fenêtre qui part ne fait rien du tout (voir `RoomScanExport`).
   */
  static func montrer(_ url: URL, essais: Int = 0) {
    guard let racine = UIApplication.shared.connectedScenes
      .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
      .first?.rootViewController else { return }
    var haut = racine
    while let p = haut.presentedViewController, !p.isBeingDismissed {
      haut = p
    }
    if (haut.isBeingDismissed || haut.presentedViewController != nil), essais < 15 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        montrer(url, essais: essais + 1)
      }
      return
    }
    let apercu = ApercuEnRA(url: url)
    courant = apercu
    let vc = QLPreviewController()
    vc.dataSource = apercu
    haut.present(vc, animated: true)
  }
}

extension RoomScanVisiteRegie {
  /**
   La maquette de la vue `cle` en réalité augmentée ; à défaut, le modèle que
   RoomPlan a écrit au scan (`secours`). Rend « maquette » ou « releve ».
   */
  @objc func realiteAugmentee(
    _ cle: String, secours: String?,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      var url: URL?
      var source = "maquette"
      if !cle.isEmpty, let vue = RoomScanVisite.parCle(cle) {
        url = vue.maquetteEnUSDZ(largeur: 0.6)
      }
      if url == nil, let s = secours, !s.isEmpty {
        let fm = FileManager.default
        var chemin = s
        if !fm.fileExists(atPath: chemin) {
          // Après une réinstallation, le dossier de l'app change de nom : le
          // fichier se retrouve par le sien.
          let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
          chemin = docs.appendingPathComponent((s as NSString).lastPathComponent).path
        }
        if fm.fileExists(atPath: chemin) {
          url = URL(fileURLWithPath: chemin)
          source = "releve"
        }
      }
      guard let u = url else {
        reject("RA_VIDE", "Aucune maquette à montrer", nil)
        return
      }
      ApercuEnRA.montrer(u)
      resolve(source)
    }
  }
}
