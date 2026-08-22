import Foundation
import React
import UIKit

/**
 * LE CANEVAS DE LA VUE 3D — une seule vue pour tout le modèle.
 *
 * Relevé du patron : « le meublé est lourd, à peine quelques meubles et une
 * latence est largement visible ; pourtant sur MagicScan, un grand nombre de
 * meubles et aucun problème ». La comparaison est juste et elle désigne la
 * vraie limite : ces applications dessinent leur 3D dans un canevas
 * accéléré, là où nous posions UNE VUE NATIVE PAR FACE — cinq cent
 * cinquante, réconciliées par React et repeintes à chaque image du geste.
 *
 * Le calcul n'a jamais été en cause : trois dixièmes de milliseconde pour
 * trier et projeter un logement meublé. Tout ce qui a été écrit reste donc
 * en place — la scène, le tri du peintre, l'écorché, l'appareillage — et
 * seule la dernière étape change : au lieu de trois cents balises, un
 * tableau de nombres que cette vue dessine d'un trait.
 *
 * CE QU'ELLE REÇOIT, et pourquoi sous cette forme :
 *
 *   `formes` : [rang du style, nombre de points, x, y, x, y, …] × formes
 *   `styles` : « fond,trait,épaisseur,pointillé,opacité du fond,opacité du
 *               trait », une chaîne par style
 *
 * Un tableau de nombres se convertit d'un bloc ; une chaîne se découpe
 * caractère par caractère. Et les styles se répètent — deux cents faces d'un
 * mur partagent la même peau —, d'où ce partage : les formes en nombres,
 * les styles en clair, chacun dit une seule fois.
 *
 * LE DESSIN SUIT L'ORDRE REÇU, sans exception. C'est le tri du peintre, et
 * c'est lui qui empêche un meuble de traverser une cloison : réordonner
 * quoi que ce soit ici reviendrait à défaire, en dernière ligne, tout ce que
 * la géométrie a établi.
 */
@objc(RoomScanCanvas)
final class RoomScanCanvas: UIView {
  /** Les formes à plat. Chaque affectation redemande un dessin. */
  @objc var formes: [NSNumber] = [] {
    didSet { setNeedsDisplay() }
  }

  /** Les styles, un par rang. */
  @objc var styles: [String] = [] {
    didSet { setNeedsDisplay() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    // Le fond est celui de la carte, posé par le JavaScript : le canevas ne
    // peint que le modèle, et laisse voir ce qu'il y a dessous.
    backgroundColor = .clear
    isOpaque = false
    // La vue ne reçoit jamais le doigt : les gestes appartiennent au
    // conteneur, qui les lit déjà (rotation, pincement).
    isUserInteractionEnabled = false
    contentMode = .redraw
  }

  required init?(coder: NSCoder) { nil }

  /** Une couleur écrite « #RRGGBB ». `none` et l'illisible rendent `nil`. */
  private func couleur(_ texte: String) -> UIColor? {
    guard texte.hasPrefix("#"), texte.count == 7 else { return nil }
    var v: UInt64 = 0
    Scanner(string: String(texte.dropFirst())).scanHexInt64(&v)
    return UIColor(
      red: CGFloat((v & 0xFF0000) >> 16) / 255,
      green: CGFloat((v & 0x00FF00) >> 8) / 255,
      blue: CGFloat(v & 0x0000FF) / 255,
      alpha: 1)
  }

  /** Un style décodé, prêt à peindre. */
  private struct Peau {
    let fond: UIColor?
    let trait: UIColor?
    let epaisseur: CGFloat
    let pointille: Bool
    let opaciteFond: CGFloat
    let opaciteTrait: CGFloat
  }

  private func lire(_ texte: String) -> Peau {
    let p = texte.components(separatedBy: ",")
    guard p.count >= 6 else {
      return Peau(
        fond: nil, trait: nil, epaisseur: 1, pointille: false,
        opaciteFond: 1, opaciteTrait: 1)
    }
    return Peau(
      fond: couleur(p[0]),
      trait: couleur(p[1]),
      epaisseur: CGFloat(Double(p[2]) ?? 1),
      pointille: (Double(p[3]) ?? 0) > 0.5,
      opaciteFond: CGFloat(Double(p[4]) ?? 1),
      opaciteTrait: CGFloat(Double(p[5]) ?? 1))
  }

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext(), !formes.isEmpty else { return }
    ctx.setLineJoin(.round)
    ctx.setLineCap(.round)
    // Les peaux se décodent UNE fois par image, pas une fois par forme :
    // trois cents formes partagent une poignée de styles.
    let peaux = styles.map(lire)

    var i = 0
    while i + 1 < formes.count {
      let rang = formes[i].intValue
      let n = formes[i + 1].intValue
      let debut = i + 2
      i = debut + n * 2
      // Un tableau tronqué ne doit pas faire tomber l'application : on
      // s'arrête là où les nombres s'arrêtent.
      guard n >= 2, i <= formes.count, rang >= 0, rang < peaux.count else { break }
      let peau = peaux[rang]

      let chemin = CGMutablePath()
      chemin.move(
        to: CGPoint(
          x: CGFloat(formes[debut].doubleValue),
          y: CGFloat(formes[debut + 1].doubleValue)))
      for k in 1..<n {
        chemin.addLine(
          to: CGPoint(
            x: CGFloat(formes[debut + k * 2].doubleValue),
            y: CGFloat(formes[debut + k * 2 + 1].doubleValue)))
      }
      // Deux points, c'est une ARÊTE : elle ne se referme pas, sinon le
      // trait revient sur lui-même et double son épaisseur apparente.
      let ferme = n > 2
      if ferme { chemin.closeSubpath() }

      if ferme, let fond = peau.fond {
        ctx.setFillColor(fond.withAlphaComponent(peau.opaciteFond).cgColor)
        ctx.addPath(chemin)
        ctx.fillPath()
      }
      if let trait = peau.trait, peau.epaisseur > 0 {
        ctx.setStrokeColor(trait.withAlphaComponent(peau.opaciteTrait).cgColor)
        ctx.setLineWidth(peau.epaisseur)
        // Le pointillé des passages : le même rythme que la vue SVG (6/4),
        // sans quoi une baie change d'allure selon le chemin de rendu.
        ctx.setLineDash(phase: 0, lengths: peau.pointille ? [6, 4] : [])
        ctx.addPath(chemin)
        ctx.strokePath()
      }
    }
    ctx.setLineDash(phase: 0, lengths: [])
  }
}

/** Le gestionnaire qui expose la vue à React Native. */
@objc(RoomScanCanvasManager)
final class RoomScanCanvasManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { RoomScanCanvas() }
}
