import Foundation
import React
import UIKit

/**
 LE VERRE DE L'APP — le Liquid Glass d'Apple, et sa réplique avant iOS 26.

 Relevés du patron : « le menu doit s'ouvrir telle une bulle Apple, en
 verre », « mets ce léger effet transparent glass là où tu le juges
 nécessaire », puis, l'IPA en main : « l'effet de verre est raté ; sur
 l'accueil la forme des cards a été modifiée, pas de transparence + flou type
 Apple glass ; pareil pour les autres, il ne se voit pas. Tu dois répliquer le
 liquid glass » — référence à l'appui (Dribbble, « Liquid Glass – Apple's
 Modern UI Trend »).

 IL AVAIT RAISON, POUR TROIS RAISONS :
 — un voile blanc à 70 % rendait le verre OPAQUE : on ne voyait ni à travers,
   ni le flou ;
 — React Native posait PAR-DESSUS le verre une teinte et un reflet, à coins
   circulaires, sur un verre à coins continus : deux formes l'une sur
   l'autre, et la carte n'avait plus son dessin ;
 — iOS ignore DÉFINITIVEMENT un verre posé pendant qu'un parent est
   transparent — et nos cartes entrent en fondu depuis zéro.

 LA MATIÈRE, MAINTENANT :
 — iOS 26 et suivants : LE VRAI LIQUID GLASS (`UIGlassEffect`) — lentille,
   reflets spéculaires, luminance qui s'adapte à ce qu'il y a dessous, teinte
   éventuelle (les tuiles de l'accueil). Il se pose quand la vue est réellement
   visible (comme le fait `expo-glass-effect`) ; React Native ne peint plus
   rien dessus.
 — avant iOS 26 : sa réplique, tout en natif — flou système, voile LÉGER, un
   liseré lumineux en dégradé (clair en haut à gauche, qui s'éteint au milieu
   et se rallume en bas à droite : le bord épais d'un verre), un reflet en haut
   qui s'éteint avant le milieu, et l'ombre de l'élément sur sa forme. Coins
   CIRCULAIRES, ceux de React Native : la carte garde exactement son dessin.

 Il ne prend jamais le doigt et ne porte aucun enfant : il se pose derrière
 le contenu, qui reste en JavaScript.
 */
final class VueDeVerre: UIView {
  private let effet = UIVisualEffectView()
  // La réplique (avant iOS 26).
  private let voileVue = UIView()
  private let reflet = CAGradientLayer()
  private let lisere = CAGradientLayer()
  private let traitDuLisere = CAShapeLayer()

  private var verreSysteme = false
  private var pose = false
  private var guet: CADisplayLink?

  /// Le rayon des coins, en points.
  @objc var rayon: NSNumber = 20 {
    didSet { setNeedsLayout() }
  }

  /// Le thème de l'app, qui n'est pas forcément celui du téléphone.
  @objc var sombre: Bool = false {
    didSet { rafraichir() }
  }

  /// La densité du voile de la réplique, de 0 (verre nu) à 1.
  @objc var voile: NSNumber = 0.22 {
    didSet { rafraichir() }
  }

  /// La teinte du verre, « #RRGGBB » ; vide : verre neutre.
  @objc var teinte: NSString = "" {
    didSet { rafraichir() }
  }

  /// La force de la teinte, de 0 à 1.
  @objc var force: NSNumber = 0.5 {
    didSet { rafraichir() }
  }

  /// L'ombre de l'élément (réplique seulement) : [opacité, rayon, décalage].
  @objc var ombre: NSArray = [0, 0, 0] {
    didSet { rafraichir() }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    effet.isUserInteractionEnabled = false
    effet.clipsToBounds = true
    addSubview(effet)
    verreSysteme = VueDeVerre.verreDisponible
    if !verreSysteme {
      effet.effect = UIBlurEffect(style: .systemUltraThinMaterial)
      voileVue.isUserInteractionEnabled = false
      effet.contentView.addSubview(voileVue)
      reflet.startPoint = CGPoint(x: 0.5, y: 0)
      reflet.endPoint = CGPoint(x: 0.5, y: 1)
      reflet.locations = [0, 0.55]
      reflet.masksToBounds = true
      layer.addSublayer(reflet)
      lisere.startPoint = CGPoint(x: 0, y: 0)
      lisere.endPoint = CGPoint(x: 1, y: 1)
      lisere.locations = [0, 0.5, 1]
      traitDuLisere.fillColor = nil
      traitDuLisere.strokeColor = UIColor.black.cgColor
      lisere.mask = traitDuLisere
      layer.addSublayer(lisere)
      layer.shadowColor = UIColor(red: 0.043, green: 0.051, blue: 0.071, alpha: 1).cgColor
    }
    rafraichir()
  }

  required init?(coder: NSCoder) { nil }

  deinit { guet?.invalidate() }

  // ------------------------------------------------------------ le système

  /// Le Liquid Glass est-il là ? (iOS 26 et un SDK qui le connaît.)
  static var verreDisponible: Bool {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      guard let classe = NSClassFromString("UIGlassEffect") as? NSObject.Type else { return false }
      return classe.responds(to: Selector(("effectWithStyle:")))
    }
    #endif
    return false
  }

  private func couleurDeTeinte() -> UIColor? {
    let hex = (teinte as String).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard hex.count == 6, let v = UInt32(hex, radix: 16) else { return nil }
    return UIColor(
      red: CGFloat((v >> 16) & 0xFF) / 255,
      green: CGFloat((v >> 8) & 0xFF) / 255,
      blue: CGFloat(v & 0xFF) / 255,
      alpha: CGFloat(truncating: force)
    )
  }

  /// La vue est-elle vraiment à l'écran ? Un verre posé à opacité nulle ne
  /// revient jamais : iOS l'abandonne en silence.
  private var visible: Bool {
    guard window != nil else { return false }
    var opacite: CGFloat = 1
    var v: UIView? = self
    while let courante = v {
      if courante.isHidden { return false }
      opacite *= courante.alpha
      v = courante.superview
    }
    return opacite > 0.02
  }

  private func poserLeVerre() {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      pose = true
      arreterLeGuet()
      // On vide d'abord : réaffecter un verre sur un verre ne le repeint pas.
      effet.effect = UIVisualEffect()
      let verre = UIGlassEffect(style: .regular)
      verre.tintColor = couleurDeTeinte()
      verre.isInteractive = false
      effet.overrideUserInterfaceStyle = sombre ? .dark : .light
      effet.effect = verre
      formerLeVerre()
    }
    #endif
  }

  private func formerLeVerre() {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      let r = UICornerRadius(floatLiteral: Double(rayonEffectif))
      effet.cornerConfiguration = .corners(
        topLeftRadius: r,
        topRightRadius: r,
        bottomLeftRadius: r,
        bottomRightRadius: r
      )
    }
    #endif
  }

  private func guetter() {
    guard guet == nil else { return }
    let lien = CADisplayLink(target: Relais(self), selector: #selector(Relais.battre))
    lien.add(to: .main, forMode: .common)
    guet = lien
  }

  fileprivate func battement() {
    if visible { setNeedsLayout() }
  }

  private func arreterLeGuet() {
    guet?.invalidate()
    guet = nil
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard verreSysteme else { return }
    if window == nil {
      pose = false
      arreterLeGuet()
    } else {
      setNeedsLayout()
    }
  }

  // ------------------------------------------------------------ la réplique

  private var rayonEffectif: CGFloat {
    min(CGFloat(truncating: rayon), bounds.width / 2, bounds.height / 2)
  }

  private func rafraichir() {
    if verreSysteme {
      if pose { poserLeVerre() }
      return
    }
    overrideUserInterfaceStyle = sombre ? .dark : .light
    let v = CGFloat(truncating: voile)
    voileVue.backgroundColor = couleurDeTeinte()
      ?? (sombre ? UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: v) : UIColor(white: 1, alpha: v))
    reflet.colors = [
      UIColor(white: 1, alpha: sombre ? 0.10 : 0.38).cgColor,
      UIColor(white: 1, alpha: 0).cgColor,
    ]
    lisere.colors = sombre
      ? [UIColor(white: 1, alpha: 0.45).cgColor, UIColor(white: 1, alpha: 0.06).cgColor, UIColor(white: 1, alpha: 0.22).cgColor]
      : [UIColor(white: 1, alpha: 0.95).cgColor, UIColor(white: 1, alpha: 0.25).cgColor, UIColor(white: 1, alpha: 0.6).cgColor]
    let n = ombre.compactMap { ($0 as? NSNumber).map { CGFloat(truncating: $0) } }
    // Sans ombre demandée, celle d'un verre posé : douce, large, à peine là.
    layer.shadowOpacity = Float(n.first.map { $0 > 0 ? $0 : 0.10 } ?? 0.10)
    layer.shadowRadius = n.count > 1 && n[1] > 0 ? n[1] : 16
    layer.shadowOffset = CGSize(width: 0, height: n.count > 2 && n[2] > 0 ? n[2] : 6)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effet.frame = bounds
    let r = rayonEffectif
    if verreSysteme {
      if !pose {
        if visible { poserLeVerre() } else { guetter() }
      } else {
        formerLeVerre()
      }
      return
    }
    // Les coins de React Native : circulaires. La carte garde son dessin.
    effet.layer.cornerRadius = r
    effet.layer.cornerCurve = .circular
    voileVue.frame = effet.contentView.bounds
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    reflet.frame = bounds
    reflet.cornerRadius = r
    reflet.cornerCurve = .circular
    lisere.frame = bounds
    let largeur: CGFloat = 1.2
    traitDuLisere.lineWidth = largeur
    traitDuLisere.path = UIBezierPath(
      roundedRect: bounds.insetBy(dx: largeur / 2, dy: largeur / 2),
      cornerRadius: max(0, r - largeur / 2)
    ).cgPath
    layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: r).cgPath
    CATransaction.commit()
  }
}

/// Le guet ne retient pas la vue : un relais faible.
private final class Relais: NSObject {
  private weak var vue: VueDeVerre?
  init(_ vue: VueDeVerre) { self.vue = vue }
  @objc func battre() { vue?.battement() }
}

@objc(RoomScanVerreManager)
final class RoomScanVerreManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { VueDeVerre() }
}
