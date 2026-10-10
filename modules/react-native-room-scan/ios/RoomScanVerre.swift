import Foundation
import React
import UIKit

/**
 LE VERRE DE L'APP — la matière des bulles d'iOS, derrière ce qui flotte.

 Relevés du patron : « à la sélection d'un élément du plan 2D, le menu doit
 s'ouvrir telle une bulle Apple, en verre », puis « mets ce léger effet
 transparent glass là où tu le juges nécessaire, pour la cohérence ». Une
 carte blanche opaque posée sur le plan le cachait : le verre le LAISSE
 VOIR, flouté — on garde sous les yeux ce qu'on est en train de régler.

 CE QUI L'AVAIT FAIT RETIRER, DEUX FOIS, ET CE QUI A CHANGÉ :
 — « les boutons grisés » : le matériau seul prend la couleur de ce qu'il
   recouvre ; sur la page gris clair de l'app, un bouton en verre devenait
   gris clair, la couleur d'un bouton éteint. Le VOILE (`voile`) est
   maintenant dense — blanc à 70 % par défaut en clair — : le verre reste
   un blanc net, et ne laisse passer qu'un soupçon de ce qu'il couvre ;
 — « le contour de faible qualité qui présente des pixels » : le filet était
   dessiné par React Native en image redimensionnée par-dessus le flou. Le
   liseré est ici celui de la couche, vectoriel, et React Native n'en
   dessine plus aucun sur un élément en verre ;
 — l'ombre : une carte transparente laisserait l'ombre de chaque lettre ;
   elle se calcule donc sur la FORME, et c'est l'élément qui la donne
   (`ombre` : opacité, rayon, décalage) — la même que quand il était plein.

 C'est le matériau du système (`systemUltraThinMaterial`) : le même flou que
 le Centre de contrôle, qui suit les réglages d'accessibilité (transparence
 réduite : il devient opaque de lui-même). Il ne prend jamais le doigt et ne
 porte aucun enfant : il se pose derrière le contenu, qui reste en
 JavaScript.
 */
final class VueDeVerre: UIView {
  private let effet = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))
  private let teinte = UIView()

  /// Le rayon des coins, en points (continus, comme ceux d'iOS).
  @objc var rayon: NSNumber = 20 {
    didSet { setNeedsLayout() }
  }

  /// Le thème de l'app, qui n'est pas forcément celui du téléphone.
  @objc var sombre: Bool = false {
    didSet { appliquerTheme() }
  }

  /// La densité du voile, de 0 (verre nu) à 1 (plein).
  @objc var voile: NSNumber = 0.7 {
    didSet { appliquerTheme() }
  }

  /// L'ombre de l'élément : [opacité, rayon, décalage vertical].
  @objc var ombre: NSArray = [0, 0, 0] {
    didSet { appliquerOmbre() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    effet.isUserInteractionEnabled = false
    effet.clipsToBounds = true
    teinte.isUserInteractionEnabled = false
    effet.contentView.addSubview(teinte)
    addSubview(effet)
    layer.shadowColor = UIColor(red: 0.043, green: 0.051, blue: 0.071, alpha: 1).cgColor
    appliquerTheme()
    appliquerOmbre()
  }

  required init?(coder: NSCoder) { nil }

  private func appliquerTheme() {
    let v = CGFloat(truncating: voile)
    overrideUserInterfaceStyle = sombre ? .dark : .light
    teinte.backgroundColor = sombre
      ? UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: min(0.85, v * 0.75))
      : UIColor(white: 1, alpha: v)
    effet.layer.borderColor = sombre
      ? UIColor(white: 1, alpha: 0.14).cgColor
      : UIColor(white: 1, alpha: 0.8).cgColor
  }

  private func appliquerOmbre() {
    let n = ombre.compactMap { ($0 as? NSNumber).map { CGFloat(truncating: $0) } }
    layer.shadowOpacity = Float(n.count > 0 ? n[0] : 0)
    layer.shadowRadius = n.count > 1 ? n[1] : 0
    layer.shadowOffset = CGSize(width: 0, height: n.count > 2 ? n[2] : 0)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let r = min(CGFloat(truncating: rayon), bounds.width / 2, bounds.height / 2)
    effet.frame = bounds
    teinte.frame = effet.contentView.bounds
    teinte.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effet.layer.cornerRadius = r
    effet.layer.cornerCurve = .continuous
    effet.layer.borderWidth = 1 / UIScreen.main.scale
    layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: r).cgPath
  }
}

@objc(RoomScanVerreManager)
final class RoomScanVerreManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { VueDeVerre() }
}
