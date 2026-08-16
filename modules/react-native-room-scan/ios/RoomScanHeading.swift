import Foundation
import CoreMotion
import React

/**
 Le cap du téléphone, en direct — pour la couronne cardinale du plan.

 La boussole du scan (`RoomScanCompass`) répond à une autre question : elle
 relève, UNE FOIS, l'orientation du repère ARKit par rapport au nord, et ce
 chiffre-là ne bouge plus ensuite. Sur le plan, on veut l'inverse : où
 regarde l'utilisateur EN CE MOMENT, pour lui dire quel mur est au nord sans
 qu'il ait à se repérer dans sa tête.

 On ouvre donc les mises à jour de mouvement dans le repère
 `.xMagneticNorthZVertical` — north-référencé, et surtout sans autorisation
 à demander, contrairement au nord géographique qui passerait par la
 localisation. L'écran interroge à sa cadence (quelques fois par seconde) :
 pas d'événements à pousser, pas d'abonnement à défaire, et rien qui
 continue de tourner quand personne ne regarde.

 Deux réserves, les mêmes que pour le scan : le magnétomètre est perturbé
 par le métal, dont un appartement est plein, et c'est le nord magnétique.
 Pour dire « ce mur-là est au nord », c'est amplement suffisant.
 */
@objc(RoomScanHeading)
class RoomScanHeading: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { true }

  private let motion = CMMotionManager()

  /// Démarre le magnétomètre. Sans appel, `heading` répondra `nil`.
  @objc func start(_ resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    guard motion.isDeviceMotionAvailable else {
      resolve(false)
      return
    }
    if !motion.isDeviceMotionActive {
      motion.deviceMotionUpdateInterval = 0.1
      motion.startDeviceMotionUpdates(using: .xMagneticNorthZVertical)
    }
    resolve(true)
  }

  /// Arrête tout : un magnétomètre qui tourne pour un écran fermé coûte
  /// de la batterie et n'apprend rien à personne.
  @objc func stop(_ resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
    motion.stopDeviceMotionUpdates()
    resolve(true)
  }

  /**
   Le cap courant, en degrés horaires depuis le nord magnétique.

   `nil` quand le relevé n'est pas encore prêt, ou quand le téléphone est à
   plat : `heading` vaut alors −1, et affirmer un cap dans ce cas ferait
   tourner la couronne au hasard.
   */
  @objc func heading(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    guard let data = motion.deviceMotion, data.heading >= 0 else {
      resolve(nil)
      return
    }
    resolve(data.heading)
  }
}
