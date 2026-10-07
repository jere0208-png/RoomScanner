import Foundation
import React
import UIKit

/**
 * LE VERRE — la matière translucide d'iOS, pour ce qui se pose sur une image.
 *
 * Relevé du patron : « le joystick prend trop de place, on doit utiliser un
 * effet "glass" transparent pour juste montrer que l'on peut avancer et
 * tourner, sans gêner la vision ». Un voile blanc à 90 % cache ce qu'il y a
 * dessous ; le verre d'iOS (`UIVisualEffectView`) le laisse deviner, flouté,
 * et prend de lui-même la teinte du mode clair ou sombre. C'est celui des
 * commandes de Plans, de Musique, de l'appareil photo : l'œil le connaît.
 *
 * Une `RCTView` ordinaire — rayons, enfants, tout ce que React sait faire —
 * avec un effet de flou glissé en premier sous-vue. React remplace ses
 * sous-vues à chaque mise à jour : on remet le verre dessous à chaque fois.
 *
 *   `epais` : un matériau plus couvrant, pour un texte qui doit rester lisible
 *             sur un fond chargé (la mini-carte) ; sinon le plus fin.
 */
@objc(RoomScanVerre)
final class RoomScanVerre: RCTView {
  private let effet = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterial))

  @objc var epais: Bool = false {
    didSet {
      effet.effect = UIBlurEffect(style: epais ? .systemThinMaterial : .systemUltraThinMaterial)
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    clipsToBounds = true
    effet.isUserInteractionEnabled = false
    effet.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    effet.frame = bounds
    insertSubview(effet, at: 0)
  }

  required init?(coder: NSCoder) { nil }

  override func didUpdateReactSubviews() {
    super.didUpdateReactSubviews()
    // React vient de réécrire les sous-vues : le verre repasse dessous.
    insertSubview(effet, at: 0)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    effet.frame = bounds
    // Le rayon du style suit : un verre carré sous un angle arrondi se
    // verrait aux coins.
    effet.layer.cornerRadius = layer.cornerRadius
    effet.clipsToBounds = true
  }
}

/** Le gestionnaire qui expose la vue à React Native. */
@objc(RoomScanVerreManager)
final class RoomScanVerreManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { RoomScanVerre() }
}
