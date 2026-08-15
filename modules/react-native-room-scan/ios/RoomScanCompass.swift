import Foundation
import ARKit
import CoreMotion

/**
 Où est le nord dans le repère du scan.

 ARKit démarre son monde là où le scan commence : son axe −Z regarde dans la
 direction du téléphone au premier instant, et rien de plus. Deux scans du
 même appartement n'ont donc aucune raison d'être orientés pareil, et le plan
 sort « de travers » par rapport au vrai monde.

 Le magnétomètre, lui, sait où est le nord. On échantillonne donc pendant le
 scan, à 2 Hz, deux choses au même instant :

 - le **cap du téléphone** (`CMDeviceMotion.heading`, en degrés horaires
   depuis le nord magnétique — le repère `.xMagneticNorthZVertical` est
   north-référencé et ne demande AUCUNE autorisation, contrairement au nord
   géographique qui exigerait la localisation) ;
 - la **direction de visée de la caméra dans le monde ARKit**, prise dans la
   colonne 2 de sa matrice (l'axe −Z du repère caméra).

 Leur différence est le cap de l'axe −Z du monde ARKit : une seule valeur,
 constante pour tout le scan, qui suffit ensuite à orienter le plan.

 On la moyenne **circulairement** (somme de vecteurs unitaires) : faire la
 moyenne arithmétique de 359° et 1° donnerait 180°, soit plein sud pour deux
 relevés plein nord.

 Deux réserves, à dire franchement : le magnétomètre est perturbé par le
 métal, et un appartement en est plein (huisseries, radiateurs, câblage) ; et
 c'est le nord **magnétique**, qui s'écarte du géographique d'un degré ou
 deux sous nos latitudes. Pour orienter un plan, c'est sans conséquence.
 */
@available(iOS 16.0, *)
final class RoomScanCompass {

  static let shared = RoomScanCompass()

  private let motion = CMMotionManager()
  private weak var session: ARSession?
  private var timer: Timer?
  /// Somme des vecteurs unitaires des caps relevés (moyenne circulaire).
  private var sumX = 0.0
  private var sumY = 0.0
  private var count = 0

  /// Nombre de relevés en dessous duquel on préfère ne rien affirmer.
  private let minSamples = 4

  func attach(to session: ARSession) {
    self.session = session
    guard motion.isDeviceMotionAvailable else { return }
    if !motion.isDeviceMotionActive {
      motion.deviceMotionUpdateInterval = 0.2
      motion.startDeviceMotionUpdates(using: .xMagneticNorthZVertical)
    }
    timer?.invalidate()
    let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
      self?.sample()
    }
    RunLoop.main.add(t, forMode: .common)
    timer = t
  }

  func reset() {
    sumX = 0
    sumY = 0
    count = 0
  }

  func detach() {
    timer?.invalidate()
    timer = nil
    motion.stopDeviceMotionUpdates()
    session = nil
  }

  private func sample() {
    guard let data = motion.deviceMotion, data.heading >= 0,
          let frame = session?.currentFrame else { return }
    let t = frame.camera.transform
    // Visée de la caméra = −Z de son repère, projetée au sol.
    let fx = Double(-t.columns.2.x)
    let fz = Double(-t.columns.2.z)
    // Téléphone à plat, visant le sol ou le plafond : la projection au sol
    // ne veut plus rien dire, on saute le relevé.
    guard fx * fx + fz * fz > 0.04 else { return }
    // Cap de la visée DANS le monde ARKit, compté comme une boussole :
    // 0° = axe −Z, sens horaire.
    let arkit = atan2(fx, -fz) * 180 / .pi
    let offset = (data.heading - arkit) * .pi / 180
    sumX += cos(offset)
    sumY += sin(offset)
    count += 1
  }

  /// Cap de l'axe −Z du monde ARKit, en degrés horaires depuis le nord.
  /// `nil` tant qu'on n'a pas assez de relevés pour l'affirmer.
  var northOffset: Double? {
    guard count >= minSamples, sumX * sumX + sumY * sumY > 0.01 else { return nil }
    let deg = atan2(sumY, sumX) * 180 / .pi
    return (deg + 360).truncatingRemainder(dividingBy: 360)
  }
}
