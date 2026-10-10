import Foundation
import React
import UIKit

/**
 LE VERRE DE L'APP — une matière, et SA LUMIÈRE.

 Relevés du patron : « le menu doit s'ouvrir telle une bulle Apple, en
 verre », « mets ce léger effet transparent glass là où tu le juges
 nécessaire », « tu dois répliquer le liquid glass » (Dribbble, « Liquid
 Glass – Apple's Modern UI Trend »), puis, captures à l'appui : « il n'y a
 plus aucune couleur sur les cards de l'accueil » et « je ne vois pas
 l'effet ».

 CE QUE LES DEUX CAPTURES ONT APPRIS :
 — le Liquid Glass d'iOS est une matière qui RÉFRACTE ce qu'il y a derrière.
   Sur une page unie, il n'a rien à déformer : il devient invisible. Le
   verre de la référence se lit autrement — par sa LUMIÈRE : un liseré
   spéculaire clair en haut à gauche qui se rallume en bas à droite (le bord
   épais d'une dalle de verre), un reflet dans le haut, un creux plus sombre
   dans le bas qui donne l'épaisseur, et une ombre douce teintée de sa
   couleur. Cette lumière est DESSINÉE ici, sur toutes les versions d'iOS :
   elle ne dépend plus de ce qu'il y a derrière ;
 — iOS abandonne en silence un Liquid Glass posé pendant que l'élément est
   encore presque transparent, et nos cartes entrent en fondu : il se pose à
   pleine opacité ;
 — sous lui, un fond porte la couleur de l'élément (la teinte d'une tuile, un
   voile clair ailleurs) : le verre la reprend, et sans lui la carte garde sa
   couleur.

 LA MATIÈRE : iOS 26 et suivants, le vrai `UIGlassEffect` (lentille sur ce qui
 passe dessous — le plan, la caméra, la visite) ; avant, un flou système au
 voile léger. Coins circulaires pour la réplique, ceux de React Native.

 Il ne prend jamais le doigt et ne porte aucun enfant : il se pose derrière
 le contenu, qui reste en JavaScript.
 */
final class VueDeVerre: UIView {
  /// La couleur de l'élément, sous le verre (iOS 26).
  private let secours = UIView()
  /// Le verre (iOS 26) ou le flou (avant).
  private let effet = UIVisualEffectView()
  /// Le voile de la réplique (avant iOS 26).
  private let voileVue = UIView()
  // LA LUMIÈRE DU VERRE — dessinée, sur toutes les versions.
  private let reflet = CAGradientLayer()
  private let creux = CAGradientLayer()
  private let lisere = CAGradientLayer()
  private let traitDuLisere = CAShapeLayer()

  private var verreSysteme = false
  private var pose = false
  /// Ce que la forme a déjà reçu : on ne refait rien qui n'a pas changé.
  private var rayonForme: CGFloat = -1
  private var tailleLumiere: CGSize = .zero
  private var rayonLumiere: CGFloat = -1

  /// Le rayon des coins, en points.
  @objc var rayon: NSNumber = 20 {
    didSet { setNeedsLayout() }
  }

  /*
    CHAQUE PROPRIÉTÉ NE REFAIT QUE SI ELLE A CHANGÉ. La couche d'interopérabilité
    de React Native réaffecte TOUTES les propriétés d'une vue dès que l'une
    bouge : sans ces gardes, chaque nouveau rendu d'une pastille reposait un
    verre neuf.
  */

  /// Le thème de l'app, qui n'est pas forcément celui du téléphone.
  @objc var sombre: Bool = false {
    didSet { if oldValue != sombre { rafraichir() } }
  }

  /// La densité du voile de la réplique, de 0 (verre nu) à 1.
  @objc var voile: NSNumber = 0.22 {
    didSet { if !verreSysteme && oldValue != voile { rafraichir() } }
  }

  /// La teinte du verre, « #RRGGBB » ; vide : verre neutre.
  @objc var teinte: NSString = "" {
    didSet { if !oldValue.isEqual(to: teinte as String) { rafraichir() } }
  }

  /// La force de la teinte, de 0 à 1.
  @objc var force: NSNumber = 0.5 {
    didSet { if oldValue != force { rafraichir() } }
  }

  /// L'ombre de l'élément : [opacité, rayon, décalage]. Zéro : celle du verre.
  @objc var ombre: NSArray = [0, 0, 0] {
    didSet { if !oldValue.isEqual(ombre) { rafraichir() } }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    verreSysteme = VueDeVerre.verreDisponible
    if verreSysteme {
      secours.isUserInteractionEnabled = false
      addSubview(secours)
    }
    effet.isUserInteractionEnabled = false
    effet.clipsToBounds = true
    addSubview(effet)
    if !verreSysteme {
      effet.effect = UIBlurEffect(style: .systemUltraThinMaterial)
      voileVue.isUserInteractionEnabled = false
      effet.contentView.addSubview(voileVue)
    }
    // Le reflet du haut : il s'éteint avant le milieu.
    reflet.startPoint = CGPoint(x: 0.5, y: 0)
    reflet.endPoint = CGPoint(x: 0.5, y: 1)
    reflet.locations = [0, 0.3, 0.6]
    reflet.masksToBounds = true
    layer.addSublayer(reflet)
    // Le creux du bas : l'épaisseur de la dalle.
    creux.startPoint = CGPoint(x: 0.5, y: 0)
    creux.endPoint = CGPoint(x: 0.5, y: 1)
    creux.locations = [0.55, 1]
    creux.masksToBounds = true
    layer.addSublayer(creux)
    // Le liseré : clair en haut à gauche, éteint au milieu, rallumé en bas à
    // droite — le bord épais d'un verre qui prend la lumière.
    lisere.startPoint = CGPoint(x: 0, y: 0)
    lisere.endPoint = CGPoint(x: 1, y: 1)
    lisere.locations = [0, 0.3, 0.7, 1]
    traitDuLisere.fillColor = nil
    traitDuLisere.strokeColor = UIColor.black.cgColor
    lisere.mask = traitDuLisere
    // Un dégradé masqué se recalcule hors écran à chaque image animée :
    // rasterisé, il se dessine une fois et se recolle ensuite.
    lisere.shouldRasterize = true
    lisere.rasterizationScale = UIScreen.main.scale
    layer.addSublayer(lisere)
    rafraichir()
  }

  required init?(coder: NSCoder) { nil }

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

  /// L'ombre d'un verre teinté : sa couleur, assombrie — une lueur, pas un gris.
  private func couleurDOmbre() -> UIColor {
    guard let t = couleurDeTeinte() else {
      return UIColor(red: 0.043, green: 0.051, blue: 0.071, alpha: 1)
    }
    var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    t.getHue(&h, saturation: &s, brightness: &b, alpha: &a)
    return UIColor(hue: h, saturation: min(1, s + 0.35), brightness: b * 0.55, alpha: 1)
  }

  /// La vue est-elle vraiment à l'écran ? Un verre posé sous un fondu qui
  /// commence est abandonné par iOS, et ne revient jamais.
  private var visible: Bool {
    guard window != nil else { return false }
    var opacite: CGFloat = 1
    var v: UIView? = self
    while let courante = v {
      if courante.isHidden { return false }
      opacite *= courante.alpha
      v = courante.superview
    }
    // PLEINEMENT visible.
    return opacite > 0.98
  }

  private func poserLeVerre() {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      pose = true
      arreterLeGuet()
      // On vide d'abord : réaffecter un verre sur un verre ne le repeint pas.
      effet.effect = UIVisualEffect()
      let verre = UIGlassEffect(style: .regular)
      // La couleur vient du fond de secours, dessous : le verre la reprend.
      verre.isInteractive = false
      effet.overrideUserInterfaceStyle = sombre ? .dark : .light
      effet.effect = verre
      formerLeVerre()
    }
    #endif
  }

  private func formerLeVerre() {
    rayonForme = rayonEffectif
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
    GuetDesVerres.partage.ajouter(self)
  }

  fileprivate func battement() {
    if visible { setNeedsLayout() }
  }

  private func arreterLeGuet() {
    GuetDesVerres.partage.retirer(self)
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

  // ------------------------------------------------------------ la lumière

  private var rayonEffectif: CGFloat {
    min(CGFloat(truncating: rayon), bounds.width / 2, bounds.height / 2)
  }

  private func rafraichir() {
    let fume = sombre
    // LE FOND : la couleur de l'élément, sous le verre ou dans le flou.
    if verreSysteme {
      secours.backgroundColor = couleurDeTeinte()
        ?? (fume ? UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: 0.32) : UIColor(white: 1, alpha: 0.34))
      // Seul le thème change la matière du verre lui-même.
      if pose && effet.overrideUserInterfaceStyle != (fume ? .dark : .light) { poserLeVerre() }
    } else {
      overrideUserInterfaceStyle = fume ? .dark : .light
      let v = CGFloat(truncating: voile)
      voileVue.backgroundColor = couleurDeTeinte()
        ?? (fume ? UIColor(red: 0.08, green: 0.09, blue: 0.11, alpha: v) : UIColor(white: 1, alpha: v))
    }
    // LA LUMIÈRE : reflet en haut, creux en bas, liseré au bord. Sur un verre
    // teinté, le reflet se retient : c'est la couleur qu'on reconnaît.
    let teintee = couleurDeTeinte() != nil
    let haut: CGFloat = fume ? 0.20 : (teintee ? 0.36 : 0.55)
    reflet.colors = [
      UIColor(white: 1, alpha: haut).cgColor,
      UIColor(white: 1, alpha: haut * 0.25).cgColor,
      UIColor(white: 1, alpha: 0).cgColor,
    ]
    creux.colors = [
      UIColor(white: 0, alpha: 0).cgColor,
      UIColor(white: 0, alpha: fume ? 0.20 : (teintee ? 0.10 : 0.07)).cgColor,
    ]
    lisere.colors = fume
      ? [UIColor(white: 1, alpha: 0.55).cgColor, UIColor(white: 1, alpha: 0.12).cgColor,
         UIColor(white: 1, alpha: 0.04).cgColor, UIColor(white: 1, alpha: 0.30).cgColor]
      : [UIColor(white: 1, alpha: 1).cgColor, UIColor(white: 1, alpha: 0.45).cgColor,
         UIColor(white: 1, alpha: 0.18).cgColor, UIColor(white: 1, alpha: 0.75).cgColor]
    // L'OMBRE : celle de l'élément, ou celle d'une dalle de verre posée.
    let n = ombre.compactMap { ($0 as? NSNumber).map { CGFloat(truncating: $0) } }
    let demandee = (n.first ?? 0) > 0
    layer.shadowColor = couleurDOmbre().cgColor
    if demandee {
      layer.shadowOpacity = Float(n[0])
      layer.shadowRadius = n.count > 1 ? n[1] : 8
      layer.shadowOffset = CGSize(width: 0, height: n.count > 2 ? n[2] : 2)
    } else {
      layer.shadowOpacity = teintee ? (fume ? 0.45 : 0.30) : (fume ? 0.35 : 0.12)
      layer.shadowRadius = 18
      layer.shadowOffset = CGSize(width: 0, height: 8)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effet.frame = bounds
    let r = rayonEffectif
    if verreSysteme {
      secours.frame = bounds
      secours.layer.cornerRadius = r
      secours.layer.cornerCurve = .continuous
      if !pose {
        if visible { poserLeVerre() } else { guetter() }
      } else if r != rayonForme {
        formerLeVerre()
      }
    } else {
      // Les coins de React Native : circulaires. La carte garde son dessin.
      effet.layer.cornerRadius = r
      effet.layer.cornerCurve = .circular
      voileVue.frame = effet.contentView.bounds
    }
    // Rien n'a bougé : la lumière est déjà la bonne.
    if bounds.size == tailleLumiere && r == rayonLumiere { return }
    tailleLumiere = bounds.size
    rayonLumiere = r
    let courbe: CALayerCornerCurve = verreSysteme ? .continuous : .circular
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    for l in [reflet, creux] {
      l.frame = bounds
      l.cornerRadius = r
      l.cornerCurve = courbe
    }
    lisere.frame = bounds
    let largeur: CGFloat = 1.5
    traitDuLisere.lineWidth = largeur
    traitDuLisere.path = UIBezierPath(
      roundedRect: bounds.insetBy(dx: largeur / 2, dy: largeur / 2),
      cornerRadius: max(0, r - largeur / 2)
    ).cgPath
    layer.shadowPath = UIBezierPath(roundedRect: bounds, cornerRadius: r).cgPath
    CATransaction.commit()
  }
}

/**
 UN SEUL GUET POUR TOUS LES VERRES QUI ATTENDENT D'ÊTRE VISIBLES.

 Chaque pastille avait le sien, à la cadence de l'écran — cent vingt fois par
 seconde sur ProMotion — et une rangée montée cachée (opacité nulle, en
 attendant son tour) en gardait vingt en marche : l'écran ne redescendait
 jamais sous 120 Hz. Un guet partagé, à dix battements par seconde, qui
 s'arrête quand plus personne n'attend.
 */
private final class GuetDesVerres: NSObject {
  static let partage = GuetDesVerres()
  private let vues = NSHashTable<VueDeVerre>.weakObjects()
  private var lien: CADisplayLink?

  func ajouter(_ v: VueDeVerre) {
    vues.add(v)
    guard lien == nil else { return }
    let l = CADisplayLink(target: self, selector: #selector(battre))
    if #available(iOS 15.0, *) {
      l.preferredFrameRateRange = CAFrameRateRange(minimum: 4, maximum: 10, preferred: 10)
    } else {
      l.preferredFramesPerSecond = 10
    }
    l.add(to: .main, forMode: .common)
    lien = l
  }

  func retirer(_ v: VueDeVerre) {
    vues.remove(v)
    if vues.allObjects.isEmpty { arreter() }
  }

  private func arreter() {
    lien?.invalidate()
    lien = nil
  }

  @objc private func battre() {
    let attente = vues.allObjects
    if attente.isEmpty {
      arreter()
      return
    }
    for v in attente { v.battement() }
  }
}

@objc(RoomScanVerreManager)
final class RoomScanVerreManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { VueDeVerre() }
}
