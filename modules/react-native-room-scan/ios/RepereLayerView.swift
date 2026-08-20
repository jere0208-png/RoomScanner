import Foundation
import ARKit
import UIKit

/**
 LES REPÈRES POSÉS PENDANT LE SCAN — projetés, jamais rendus.

 Relevé du chantier : « tu peux afficher sur le mur du scan les ajouts ? Un
 bloc PC ou peu importe ce qu'on ajoute, qui se place sur le mur qu'on vise
 et il reste pendant le scan ».

 PREMIÈRE TENTATIVE, ET SON ÉCHEC — une `ARSCNView` transparente par-dessus
 la vue de scan, partageant sa session. Elle a pris le rendu à RoomPlan :
 « on ne voit plus du tout ce qu'on scanne », écran noir, les repères
 flottant seuls dans le vide. Une session ARKit ne se rend qu'UNE fois, et
 c'est RoomPlan qui la rend — lui seul sait dessiner ses guides.

 On ne dessine donc plus en 3D : on PROJETTE. À chaque image, la caméra
 elle-même ramène chaque point du monde vers l'écran
 (`ARCamera.projectPoint`), et une étiquette se pose à cet endroit. La vue
 ne fait que LIRE la session — rien ne lui est disputé.

 Deux conséquences heureuses : les étiquettes gardent leur taille et
 restent lisibles de loin (un carré de neuf centimètres, à quatre mètres,
 ne fait plus rien), et le coût est nul — une poignée de projections par
 image, pas un second rendu de la scène.
 */
/**
 Le relais qui ne retient pas sa vue.

 `CADisplayLink` garde une référence FORTE sur sa cible : la vue ne se
 libérerait jamais, et son horloge continuerait de battre sur une session
 morte. Le relais, lui, ne tient sa vue que faiblement.
 */
@available(iOS 16.0, *)
private final class RelaisFaible {
  weak var cible: RepereLayerView?
  init(cible: RepereLayerView) { self.cible = cible }
  @objc func battre() { cible?.rafraichir() }
}

@available(iOS 16.0, *)
final class RepereLayerView: UIView {

  /// La session à LIRE. On ne l'exécute pas, on ne la met jamais en pause.
  weak var session: ARSession? {
    didSet { demarrerHorloge() }
  }

  private struct Repere {
    let position: SIMD3<Float>
    let vue: UIView
  }

  private var reperes: [Repere] = []
  private var horloge: CADisplayLink?

  deinit { horloge?.invalidate() }

  /**
   L'HORLOGE S'ARRÊTE AVEC LA VUE.

   `CADisplayLink` retient fortement sa cible : une vue de scan quittée
   gardait donc son horloge vivante, à battre trente fois par seconde sur
   une session qui n'existe plus. Deux scans de suite, et l'app traînait
   autant d'horloges que de passages — « le scan ne fonctionne plus du
   tout ». Un relais faible casse le cycle, et le départ de l'écran
   l'invalide.
   */
  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      horloge?.invalidate()
      horloge = nil
    } else if session != nil && horloge == nil {
      demarrerHorloge()
    }
  }

  private func demarrerHorloge() {
    horloge?.invalidate()
    guard session != nil else { return }
    let h = CADisplayLink(target: RelaisFaible(cible: self),
                          selector: #selector(RelaisFaible.battre))
    // Trente images par seconde suffisent : ces étiquettes suivent un
    // mouvement de main, pas une animation.
    h.preferredFramesPerSecond = 30
    h.add(to: .main, forMode: .common)
    horloge = h
  }

  /// Pose un repère à cet endroit du monde.
  func ajouter(kind: String, at position: SIMD3<Float>) {
    let (teinte, sigle) = Self.habit(de: kind)
    let etiquette = UILabel()
    etiquette.text = sigle
    etiquette.textColor = .white
    etiquette.font = .systemFont(ofSize: 11, weight: .heavy)
    etiquette.textAlignment = .center
    etiquette.backgroundColor = teinte
    etiquette.layer.cornerRadius = 7
    etiquette.layer.masksToBounds = true
    etiquette.frame = CGRect(x: 0, y: 0, width: 36, height: 24)
    // Cachée jusqu'à la première projection : sans cela elle apparaît une
    // image au coin de l'écran avant de rejoindre sa place.
    etiquette.isHidden = true
    addSubview(etiquette)
    reperes.append(Repere(position: position, vue: etiquette))
  }

  func retirerDernier() {
    guard let dernier = reperes.popLast() else { return }
    dernier.vue.removeFromSuperview()
  }

  func vider() {
    for r in reperes { r.vue.removeFromSuperview() }
    reperes.removeAll()
  }

  /// La couleur du métier, et le sigle qu'on relit de loin.
  private static func habit(de kind: String) -> (UIColor, String) {
    switch kind {
    case "inter", "va", "poussoir", "variateur":
      return (UIColor(red: 0.12, green: 0.36, blue: 1, alpha: 0.92), "INT")
    case "dcl", "spot", "applique":
      return (UIColor(red: 0.88, green: 0.64, blue: 0.23, alpha: 0.92), "LUM")
    default:
      return (UIColor(red: 0.91, green: 0.55, blue: 0.13, alpha: 0.92), "PC")
    }
  }

  @objc func rafraichir() {
    guard let frame = session?.currentFrame, bounds.width > 1 else { return }
    let orientation = UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }
      .first ?? .portrait
    let taille = bounds.size
    for r in reperes {
      /*
        DERRIÈRE LA CAMÉRA, ON NE MONTRE RIEN.

        `projectPoint` rend un point d'écran même pour ce qui est dans le
        dos : l'étiquette d'un mur qu'on a dépassé revenait alors se poser
        au milieu de l'image, à l'envers. On regarde donc d'abord de quel
        côté de l'objectif le repère se trouve.
      */
      let versCamera = frame.camera.transform.columns.3
      let avant = SIMD3<Float>(
        -frame.camera.transform.columns.2.x,
        -frame.camera.transform.columns.2.y,
        -frame.camera.transform.columns.2.z,
      )
      let ecart = r.position - SIMD3<Float>(versCamera.x, versCamera.y, versCamera.z)
      if simd_dot(ecart, avant) <= 0.05 {
        r.vue.isHidden = true
        continue
      }
      let p = frame.camera.projectPoint(
        r.position, orientation: orientation, viewportSize: taille,
      )
      if p.x.isNaN || p.y.isNaN {
        r.vue.isHidden = true
        continue
      }
      r.vue.center = p
      r.vue.isHidden = false
    }
  }
}
