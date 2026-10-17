import Foundation
import ImageIO
import React
import SceneKit
import UIKit
import simd

/**
 * LA VISITE À LA PREMIÈRE PERSONNE — sur SceneKit, le moteur 3D d'iOS.
 *
 * Relevé du patron : « l'exploration n'est pas du tout fluide lorsqu'on se
 * déplace s'il y a un minimum d'éléments (...) le sol en parquet apparaît
 * mal aussi, selon la vue, il disparaît ». La vue était PEINTE en
 * JavaScript, face par face, à chaque image ; ici la scène est bâtie UNE
 * fois, en triangles, et vit sur la carte graphique. Le JavaScript n'envoie
 * plus que la caméra — six nombres par image — et la profondeur se juge au
 * pixel, par le matériel : rien ne passe plus devant ce qui est devant.
 *
 * CE QU'ELLE REÇOIT (voir `geometry/visite3d.ts`, qui l'écrit) :
 *
 *   `maillage` : [x, y, z] × 3 puis [r, g, b] — douze nombres par triangle,
 *                tout le bâti et le mobilier ;
 *   `sols`     : [matière, sens, r, g, b, n] puis n triangles de neuf
 *                coordonnées, un bloc par sol ;
 *   `camera`   : [x, y, z, lacet, tangage, ouverture verticale en degrés] ;
 *   `fond`     : la couleur derrière les baies, « #RRGGBB ».
 *
 * LE PARQUET EST UNE TEXTURE. Les lames (22 cm sur 1,35 m, abouts décalés
 * d'une demi-lame un rang sur deux) sont dessinées dans une image, répétée
 * à l'échelle réelle sur le sol. Elle ne dépend d'aucun tri et ne disparaît
 * sous aucun angle.
 *
 * LA MAQUETTE AUSSI — relevé du patron : « le modèle 3D d'un plan avec des
 * meubles est très lent ; les autres apps sont fluides, peu importe le
 * nombre de meubles ». La vue 3D du plan passe par cette même vue, en mode
 * ORBITE (voir `geometry/maquette3d.ts`) :
 *
 *   `orientes` : même format que `maillage`, mais leur dos n'est jamais
 *                dessiné — c'est ce qui ouvre la maison de poupée ;
 *   `ecorche`  : les faces extérieures des murs, voilées par la carte
 *                graphique quand elles nous font face (`voile`) ;
 *   `orbite`   : [cible (3), axe vers l'œil (3), haut (3), demi-hauteur
 *                visible en mètres] — une caméra ORTHOGRAPHIQUE, qui tombe
 *                au pixel sur la projection des cotes posées par-dessus ;
 *   `levee`, `solY` : le logement qui monte de son sol, au retour d'un scan.
 *
 * LES VRAIS MEUBLES — relevé du patron : « des modèles réalistes de meubles
 * aux mesures réelles, non pas des cubes codés ». `meubles` porte chaque
 * meuble FABRIQUÉ à ses cotes (voir `geometry/modeles3d.ts`), groupé par
 * matière :
 *
 *   [code, r, g, b, rugosité, métal, nSommets, nIndices]
 *   puis nSommets × (x, y, z, nx, ny, nz, u, v), puis les indices.
 *
 * Les normales sont LISSÉES (une arête arrondie accroche la lumière) et les
 * matières sont PHYSIQUES : le chêne a son fil, le lin sa trame, l'inox son
 * reflet, le verre sa transparence. Le code 9 est l'ombre de contact : un
 * voile doux sous chaque meuble posé au sol.
 */
@objc(RoomScanVisite)
final class RoomScanVisite: UIView, SCNSceneRendererDelegate {
  private let vue = SCNView(frame: .zero)
  private let scene = SCNScene()
  private let oeil = SCNNode()
  /// Le bâti : remplacé d'un bloc quand la scène change, jamais retouché.
  /// Tout ce que la vue a bâti — lu aussi par l'export en réalité augmentée.
  let bati = SCNNode()
  /// Les trois lumières, gardées : la maquette les règle autrement.
  private let ambiante = SCNLight()
  private let jour = SCNLight()
  private let contre = SCNLight()

  /*
    CHAQUE PROPRIÉTÉ NE REBÂTIT QUE SI ELLE A CHANGÉ. La couche de
    compatibilité réaffecte TOUTES les propriétés dès que l'une bouge (le fond,
    le voile) : sans ces gardes, le logement entier se rebâtissait — des
    dizaines de milliers de nombres reconvertis en géométrie — pour une
    couleur de fond. Comparer deux tableaux coûte une fraction de ce prix.
  */
  /*
    LES GRANDS TABLEAUX SE CONVERTISSENT UNE FOIS, À L'ARRIVÉE. Gardés en
    nombres objets, ils pesaient quatre à huit fois leur poids en flottants
    toute la vie de la vue, se comparaient élément par élément à chaque
    réaffectation, et se reconvertissaient à chaque reconstruction. On ne
    garde que les flottants ; la propriété ne sert plus qu'à les recevoir.
  */
  private var fMaillage: [Float] = []
  private var fSols: [Float] = []
  private var fOrientes: [Float] = []
  private var fEcorche: [Float] = []
  private var fMeubles: [Float] = []
  private var fTexturees: [Float] = []
  private var fAretes: [Float] = []

  /// Convertit et compare : vrai si les nombres ont changé (ils sont alors gardés).
  private static func recevoir(_ nombres: [NSNumber], dans cible: inout [Float]) -> Bool {
    let ns = nombres as NSArray
    var neufs: [Float] = []
    neufs.reserveCapacity(ns.count)
    for case let x as NSNumber in ns { neufs.append(x.floatValue) }
    if neufs == cible { return false }
    cible = neufs
    return true
  }

  @objc var maillage: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fMaillage) { rebatir(.bati) } }
  }

  /*
    LES ARÊTES DU BÂTI — relevé du patron : « ajoute des arêtes légères sur les
    murs et plafonds, plus visibles, et autour des ouvrants sans porte ; on
    doit mieux voir les fins de chaque pan de mur ». Six nombres par segment
    (deux extrémités), calculés par le JavaScript (voir `aretesDuBati`) : les
    fins de mur, les angles, les jonctions avec le plafond et le sol, les
    tableaux des ouvertures. Un trait fin, gris, à peine posé.
  */
  @objc var aretes: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fAretes) { rebatir(.bati) } }
  }

  @objc var sols: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fSols) { rebatir(.sols) } }
  }

  @objc var camera: [NSNumber] = [] {
    didSet { if camera != oldValue { placerOeil() } }
  }

  @objc var fond: String = "#DCE8F4" {
    didSet {
      vue.backgroundColor = couleur(fond) ?? .white
      guard fond != oldValue else { return }
      // Le ciel de la visite se refait sur la nouvelle teinte.
      if modePose == false { scene.background.contents = Self.imageDuCiel(couleur(fond) ?? .white) }
    }
  }

  /*
    LA VISITE OU LA MAQUETTE — ce que la vue montre décide du ciel, du jour
    et du liseré. `nil` tant que rien n'est posé ; `true` en maquette.
  */
  private var modePose: Bool?

  /**
   * LA VUE CHANGE DE MODE : visite (à hauteur d'œil) ou maquette (en orbite).
   *
   * EN VISITE, DU SEMI-RÉALISME — relevé du patron : « les meubles font trop
   * dessin animé, on veut que les visiteurs se projettent ; le bleu uni des
   * fenêtres et baies fait trop cartoon ». Le liseré des meubles — un trait
   * de dessin, utile vu de loin sur la maquette — se retire ; derrière les
   * baies, un vrai dehors : un ciel, un horizon voilé, un sol lointain.
   */
  /*
    LE BLANC D'UN MUR RESTE BLANC EN VISITE — relevé du patron : « en visite,
    le plus blanc donne un gris ». Sous la lumière fixe de la pièce, un mur
    vertical ne reçoit que l'ambiance et un peu du jour : il sortait aux deux
    tiers de sa teinte, un blanc pur en gris. Murs et plafonds reçoivent en
    plus un quart de leur propre teinte — la lumière que les murs se renvoient
    entre eux : un blanc reste blanc, une couleur reste elle-même. Les meubles
    et les sols n'en reçoivent rien. La maquette garde son rendu.
  */
  static let CLARTE_DES_MURS: CGFloat = 0.25
  static let nuanceurClarte = """
    #pragma arguments
    float clarte;
    #pragma body
    _output.color.rgb += _surface.diffuse.rgb * clarte;
    """
  /// Les matières du bâti, qui reçoivent la clarté des murs.
  private var matieresDuBati: [SCNMaterial] = []
  private var clarteDesMurs: CGFloat { modePose == false ? Self.CLARTE_DES_MURS : 0 }

  private func regleLeMode(maquette: Bool) {
    guard modePose != maquette else { return }
    modePose = maquette
    for m in matieresDuBati { m.setValue(NSNumber(value: Float(clarteDesMurs)), forKey: "clarte") }
    /*
      UN LISERÉ LÉGER, FINALEMENT — relevé du patron, après l'avoir vu
      retiré : « les meubles se fondent dans le mur, peut-être qu'un léger
      contour est nécessaire finalement ». En visite, il revient en voile
      plus léger encore qu'en maquette : un souffle au bord d'un meuble
      blanc devant un mur blanc, pas un trait.
    */
    matiereContour.transparency = maquette ? 0.32 : choix.lisere
    scene.background.contents = maquette ? nil : Self.imageDuCiel(couleur(fond) ?? .white)
    reglerLeJour()
  }

  /*
    LE RENDU DE LA VISITE — relevé du patron : « fais une refonte de la
    visite plus propre et réaliste ». Il règle le liseré des meubles, la
    teinte de matière des meubles et du sol, le veinage du parquet et
    l'ombre de contact. La couleur des murs, elle, vient du JavaScript (la
    palette) ; la lumière est fixe (voir `JOUR_VISITE`).
  */
  struct Rendu {
    /// L'opacité du liseré des meubles, en visite.
    let lisere: CGFloat
    /// La luminance maximale d'un meuble, d'un sol — `nil` : la teinte telle quelle.
    let albedoMeubles: CGFloat?
    let albedoSol: CGFloat?
    let veinage: Bool
    /// L'opacité de l'ombre de contact au pied des meubles.
    let ombre: CGFloat
  }

  /// Le rendu retenu par le patron (« Chaleureux du soir »), sans les lampes.
  static let RENDU = Rendu(lisere: 0.24, albedoMeubles: 0.84, albedoSol: 0.74, veinage: true, ombre: 0.55)

  /// Le rendu de la visite (voir `RENDU`).
  private let choix: Rendu = RoomScanVisite.RENDU

  @objc var orientes: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fOrientes) { rebatir(.bati) } }
  }

  @objc var ecorche: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fEcorche) { rebatir(.bati) } }
  }

  /// Le voile de l'écorché : une matière qui change, pas un logement à rebâtir.
  @objc var voile: Bool = true {
    didSet { if voile != oldValue { appliquerVoile() } }
  }

  @objc var orbite: [NSNumber] = [] {
    didSet { if orbite != oldValue { placerOeil() } }
  }

  @objc var levee: NSNumber = 1 {
    didSet { if levee != oldValue { lever() } }
  }

  @objc var solY: NSNumber = 0 {
    didSet { if solY != oldValue { lever() } }
  }

  @objc var meubles: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fMeubles) { rebatir(.meubles) } }
  }

  /// Les vraies images du relevé (chemins des orthophotos), dans l'ordre.
  @objc var textures: [NSString] = [] {
    didSet { if textures != oldValue { rebatir(.images) } }
  }

  /// Les faces habillées d'une vraie image : 16 nombres par triangle.
  @objc var texturees: [NSNumber] {
    get { [] }
    set { if Self.recevoir(newValue, dans: &fTexturees) { rebatir(.images) } }
  }

  /*
    LA CLÉ DE LA VUE — pour que la caméra lui parvienne SANS PASSER PAR LES
    PROPRIÉTÉS. Relevé du patron : « la visite est bug encore plus qu'avant
    pour le déplacement ».

    La vue est un composant de l'ancienne architecture, monté par la couche
    de compatibilité de React Native : à CHAQUE propriété changée, elle
    reconvertit et recompare TOUTES les autres — maillage, sols, meubles,
    des dizaines de milliers de nombres — sur le fil principal, celui-là
    même qui dessine. La caméra changeant soixante fois par seconde, la marche
    payait soixante fois par seconde le poids de tout le logement ; et depuis
    que les meubles sont de vrais modèles, ce poids a décuplé.

    La caméra passe donc par `RoomScanVisiteRegie`, qui retrouve la vue par
    cette clé et lui pose ses six nombres, rien d'autre.
  */
  private static let registre = NSMapTable<NSString, RoomScanVisite>.strongToWeakObjects()

  @objc var cle: String = "" {
    didSet {
      if !oldValue.isEmpty { RoomScanVisite.registre.removeObject(forKey: oldValue as NSString) }
      guard !cle.isEmpty else { return }
      RoomScanVisite.registre.setObject(self, forKey: cle as NSString)
      /*
        CE QUI EST ARRIVÉ AVANT LA VUE. La régie peut poser une caméra avant
        que la vue ne soit montée — elles empruntent deux chemins vers le fil
        principal. La valeur attend sa vue, et s'applique au tour suivant,
        APRÈS les propriétés de montage, qui sont plus anciennes qu'elle.
      */
      let cle = self.cle
      DispatchQueue.main.async { [weak self] in
        guard let self, self.cle == cle else { return }
        RoomScanVisite.appliquerEnAttente(cle, a: self)
      }
    }
  }

  static func parCle(_ cle: String) -> RoomScanVisite? {
    registre.object(forKey: cle as NSString)
  }

  /** Ce que la régie a posé pour une clé dont la vue n'était pas encore là. */
  private static var camerasEnAttente: [String: [NSNumber]] = [:]
  private static var orbitesEnAttente: [String: [NSNumber]] = [:]
  private static var leveesEnAttente: [String: (NSNumber, NSNumber)] = [:]

  static func attendre(_ cle: String, camera: [NSNumber]) { camerasEnAttente[cle] = camera }
  static func attendre(_ cle: String, orbite: [NSNumber]) { orbitesEnAttente[cle] = orbite }
  static func attendre(_ cle: String, levee: NSNumber, solY: NSNumber) {
    leveesEnAttente[cle] = (levee, solY)
  }

  private static func appliquerEnAttente(_ cle: String, a vue: RoomScanVisite) {
    if let c = camerasEnAttente.removeValue(forKey: cle) { vue.poserCamera(c) }
    if let o = orbitesEnAttente.removeValue(forKey: cle) { vue.poserOrbite(o) }
    if let l = leveesEnAttente.removeValue(forKey: cle) { vue.poserLevee(l.0, solY: l.1) }
  }

  /** La caméra de la visite, posée directement : voir `cle`. */
  func poserCamera(_ valeurs: [NSNumber]) {
    camera = valeurs
  }

  /** La caméra de la maquette en orbite, posée directement : voir `cle`. */
  func poserOrbite(_ valeurs: [NSNumber]) {
    orbite = valeurs
  }

  /** La levée de la maquette au retour d'un scan, posée directement. */
  func poserLevee(_ k: NSNumber, solY y: NSNumber) {
    solY = y
    levee = k
  }

  // ------------------------------------------------------------- lumière

  /*
    LE DIFFUSEUR D'UN LUMINAIRE, TOUJOURS ÉTEINT — relevé du patron : « le
    système de lumière est mal fait ; supprime la possibilité d'éclairer la
    pièce en appuyant sur le bouton lors de la visite ». Le luminaire garde
    sa forme, et son diffuseur un blanc opalin : il ne s'allume plus. Une
    seule matière, créée une fois, pour tous les diffuseurs.
  */
  private lazy var diffuseurEteint: SCNMaterial = Self.fabriquerDiffuseurEteint()

  /** Un blanc opalin, qui reçoit la lumière comme le reste. */
  private static func fabriquerDiffuseurEteint() -> SCNMaterial {
    let m = SCNMaterial()
    m.isDoubleSided = false
    m.cullMode = .back
    m.lightingModel = .physicallyBased
    m.diffuse.contents = UIColor(red: 0.92, green: 0.91, blue: 0.88, alpha: 1)
    m.roughness.contents = NSNumber(value: 0.55)
    m.metalness.contents = NSNumber(value: 0)
    return m
  }

  /*
    LE JOUR DE LA VUE — l'éclairage de base d'une pièce, celui d'avant les
    lampes de la visite (relevé du patron : « rends l'éclairage qu'on avait
    de base d'une pièce »). Une ambiance franche, un jour qui vient d'en haut
    et d'un côté, un contre-jour plus faible de l'autre : fixes, ils ne
    dépendent d'aucune lampe. La maquette garde le sien : vue de dessus,
    l'arase des murs et les sols saturaient avec les réglages de la visite.
  */
  static let JOUR_VISITE: (ambiance: CGFloat, jour: CGFloat, contre: CGFloat) = (620, 420, 200)
  static let JOUR_MAQUETTE: (ambiance: CGFloat, jour: CGFloat, contre: CGFloat) = (640, 380, 160)

  private func reglerLeJour() {
    let maquette = orbite.count >= 10
    let j = maquette ? Self.JOUR_MAQUETTE : Self.JOUR_VISITE
    ambiante.intensity = j.ambiance
    jour.intensity = j.jour
    contre.intensity = j.contre
    reveiller(0.6)
  }

  /*
    LA COULEUR D'UN MEUBLE NE DÉPASSE PAS SA TEINTE — relevé du patron : « la
    lumière sur les meubles est toujours trop élevée, tout devient blanc ;
    ils doivent gagner au plus 10 % de leur couleur de base ». Quelle que
    soit la lumière qui l'atteint — jour, environnement —, un meuble
    ne peut plus devenir plus clair que sa teinte relevée majorée de 15 %
    (la marge du jour sur une face bien éclairée), plus sa propre émission
    (l'appareillage). Un tissu beige reste beige en plein jour.
  */
  private static let nuanceurPlafondDesMeubles = """
    #pragma body
    _output.color.rgb = min(_output.color.rgb, _surface.diffuse.rgb * 1.15 + _surface.emission.rgb);
    """

  /// Le parquet et le carrelage, dessinés une fois par matière et par teinte.
  private static var imagesDesSols: [String: UIImage] = [:]

  /*
    CHAQUE FAMILLE A SON NŒUD, ET NE SE REBÂTIT QUE SI ELLE CHANGE. Tout
    changement — le voile basculé, les images arrivées, une lampe de plus —
    défaisait le logement entier et le renvoyait à la carte graphique. Les
    murs, les sols, les images et les meubles ont chacun leur nœud ; seul
    celui qui a changé se refait.
  */
  private struct Sale: OptionSet {
    let rawValue: Int
    static let bati = Sale(rawValue: 1)
    static let sols = Sale(rawValue: 2)
    static let images = Sale(rawValue: 4)
    static let meubles = Sale(rawValue: 8)
    static let tout: Sale = [.bati, .sols, .images, .meubles]
  }
  private var sale: Sale = []
  private let gBati = SCNNode()
  private let gSols = SCNNode()
  private let gImages = SCNNode()
  private let gMeubles = SCNNode()
  /// La matière de l'écorché : le voile s'y pose ou s'en retire.
  private var matiereEcorche: SCNMaterial?

  /**
   * LE LISERÉ DES MEUBLES — relevé du patron : « les meubles blancs sont trop
   * blancs et se fondent dans le sol blanc sans texture ; donne-leur un
   * aspect différent, comme un léger contour sur leurs formes ».
   *
   * La « coque inversée » des dessins au trait : chaque meuble est redessiné
   * une seconde fois, gonflé le long de ses normales et vu par l'intérieur
   * (seules ses faces arrière se peignent). Là où le meuble se découpe sur le
   * sol ou sur un mur, cette coque dépasse d'un cheveu : un liseré sombre
   * tout autour de la forme, coussins arrondis compris.
   *
   * Son épaisseur se recalcule à chaque mouvement de caméra pour rester
   * d'un point à l'écran, quel que soit le zoom.
   */
  private var epaisseurContour: Float = 0.006
  /*
    UNE SEULE MATIÈRE POUR TOUS LES LISERÉS. Elles étaient toutes identiques,
    une par meuble — et pendant un pincement de la maquette, l'épaisseur se
    réécrivait dans chacune, à chaque image. Une matière, une écriture.
  */
  private lazy var matiereContour: SCNMaterial = Self.fabriquerContour(epaisseur: self.epaisseurContour)

  override init(frame: CGRect) {
    super.init(frame: frame)
    // La vue ne reçoit jamais le doigt : la manette et le regard sont au
    // JavaScript, par-dessus.
    isUserInteractionEnabled = false
    vue.isUserInteractionEnabled = false
    vue.scene = scene
    vue.backgroundColor = couleur(fond) ?? .white
    vue.antialiasingMode = .multisampling4X
    vue.preferredFramesPerSecond = 60
    /*
      DEUX PIXELS PAR POINT, PAS TROIS. Sur un écran « 3× », la visite
      rendait 2,25 fois plus de pixels qu'à 2× — en plein écran, soixante
      fois par seconde, anticrénelage 4× compris. Dans une scène 3D lissée,
      la différence ne se voit pas ; la carte graphique, la batterie et la
      chaleur, si.
    */
    vue.contentScaleFactor = min(2, UIScreen.main.scale)
    vue.autoenablesDefaultLighting = false
    vue.allowsCameraControl = false
    vue.delegate = self
    addSubview(vue)

    // L'ŒIL. L'ouverture est VERTICALE, comme celle que le JavaScript
    // calcule depuis la largeur de l'écran ; le près est à cinq
    // centimètres, pour qu'un mur frôlé ne se troue pas.
    let cam = SCNCamera()
    cam.zNear = 0.05
    cam.zFar = 120
    cam.fieldOfView = 60
    cam.projectionDirection = .vertical
    cam.wantsHDR = false
    /*
      PLUS D'OCCLUSION AMBIANTE — relevé du patron : « dans la visite 3D, il
      y a des ombres bizarres au-dessus et en dessous de chaque mur ».
      L'occlusion « en espace écran » assombrit ce qui est proche en
      profondeur à l'écran : le pied et la tête de chaque mur, contre le sol
      et le plafond, en bandes sales qui bougeaient avec la caméra — et elle
      coûtait une passe de rendu à chaque image. Les meubles se lisent déjà
      par leur liseré et leur ombre de contact ; les angles, par la lumière.
    */
    cam.screenSpaceAmbientOcclusionIntensity = 0
    oeil.camera = cam
    scene.rootNode.addChildNode(oeil)
    vue.pointOfView = oeil

    // LA LUMIÈRE : une ambiance franche, un jour qui vient d'en haut et
    // d'un côté, un contre-jour plus faible de l'autre — assez pour que
    // deux murs d'une même teinte se distinguent à l'angle.
    ambiante.type = .ambient
    ambiante.intensity = RoomScanVisite.JOUR_VISITE.ambiance
    ambiante.color = UIColor.white
    let noeudAmbiant = SCNNode()
    noeudAmbiant.light = ambiante
    scene.rootNode.addChildNode(noeudAmbiant)

    /*
      DES MEUBLES QUI GARDENT LEUR COULEUR — premier diagnostic du patron :
      « lumière trop forte sur les meubles, ça les rend blancs ». Les meubles
      sont en matière PHYSIQUE : en plus de l'ambiance, du jour et du
      contre-jour, ils recevaient un environnement fort (0,7, un ciel blanc
      au-dessus) qui poussait un tissu clair au blanc. L'environnement ne
      sert plus qu'à donner un reflet au chrome (0,2, plus bas).

      PAS DE SECONDE AMBIANCE « POUR LES MEUBLES » — tentée, et retirée :
      SceneKit n'applique pas le masque de catégorie à une lumière AMBIANTE.
      La seconde s'ajoutait donc à la première sur TOUT (≈ 1 060 au lieu de
      640) : la maquette sortait d'un blanc uni, murs, sols et meubles
      confondus avec le fond (relevé du patron, captures à l'appui). Une seule
      ambiance, pour tout.
    */

    jour.type = .directional
    jour.intensity = RoomScanVisite.JOUR_VISITE.jour
    jour.castsShadow = false
    let noeudJour = SCNNode()
    noeudJour.light = jour
    noeudJour.eulerAngles = SCNVector3(x: -Float.pi / 2.6, y: Float.pi / 5, z: 0)
    scene.rootNode.addChildNode(noeudJour)

    contre.type = .directional
    contre.intensity = RoomScanVisite.JOUR_VISITE.contre
    contre.castsShadow = false
    let noeudContre = SCNNode()
    noeudContre.light = contre
    noeudContre.eulerAngles = SCNVector3(x: -Float.pi / 3.5, y: Float.pi / 5 + Float.pi, z: 0)
    scene.rootNode.addChildNode(noeudContre)

    scene.rootNode.addChildNode(bati)
    for g in [gBati, gSols, gImages, gMeubles] { bati.addChildNode(g) }

    // L'ENVIRONNEMENT des matériaux physiques : un ciel clair au-dessus, un
    // sol chaud dessous. Sans lui, un chrome ne reflète rien et paraît noir.
    // Il n'éclaire que les meubles : le bâti reste en Lambert.
    scene.lightingEnvironment.contents = RoomScanVisite.imageDEnvironnement()
    scene.lightingEnvironment.intensity = 0.2
  }

  required init?(coder: NSCoder) { nil }

  override func layoutSubviews() {
    super.layoutSubviews()
    let change = vue.frame.size != bounds.size
    vue.frame = bounds
    if change { reveiller() }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { reveiller() }
  }

  /*
    LA PREMIÈRE IMAGE, MÊME SANS GESTE — vu sur les captures du simulateur :
    la maquette restait blanche à l'ouverture de la 3D, et n'apparaissait
    qu'au premier glissement. La scène était posée avant que la vue n'ait sa
    taille et sa fenêtre ; rendue à la demande, elle attendait un
    changement. Une demi-seconde de rendu continu à chaque mise en place, puis
    on rend la main au rendu à la demande.
  */
  /*
    ET CHAQUE CHANGEMENT RÉVEILLE LE RENDU — revue I5 : la demi-seconde ne
    couvrait que la mise en place. Un logement meublé se bâtit en plus de
    temps que ça, et la caméra en trois quarts arrive par la régie après le
    montage : l'un et l'autre tombaient hors de la fenêtre, la vue restait
    sur l'image d'avant (blanche, ou de face) jusqu'au premier glissement.
    Le bâti, la caméra et la levée réveillent donc le rendu à leur tour, et
    le réveil se PROLONGE au lieu d'être coupé par le minuteur du précédent.
  */
  private var finDuReveil = DispatchTime.now()
  private var sommeilPrevu = false

  private func reveiller(_ duree: Double = 0.6) {
    vue.isPlaying = true
    vue.setNeedsDisplay()
    let fin = DispatchTime.now() + duree
    if fin > finDuReveil { finDuReveil = fin }
    guard !sommeilPrevu else { return }
    sommeilPrevu = true
    planifierSommeil()
  }

  private func planifierSommeil() {
    DispatchQueue.main.asyncAfter(deadline: finDuReveil) { [weak self] in
      guard let self = self else { return }
      if DispatchTime.now() < self.finDuReveil {
        self.planifierSommeil()
        return
      }
      self.sommeilPrevu = false
      self.vue.isPlaying = false
    }
  }

  /*
    LA PREMIÈRE IMAGE, ANNONCÉE — pour que l'écran retire sa silhouette
    d'attente au moment où la maquette est réellement à l'écran, ni avant
    (un trou blanc), ni après (une attente pour rien).
  */
  @objc var onPremiereImage: RCTDirectEventBlock?
  /// Écrit sur le fil principal, lu sur celui du rendu : un simple drapeau.
  private var guetteLaPremiere = false
  private var premiereAnnoncee = false

  func renderer(_ renderer: SCNSceneRenderer, didRenderScene scene: SCNScene, atTime time: TimeInterval) {
    guard guetteLaPremiere else { return }
    guetteLaPremiere = false
    DispatchQueue.main.async { [weak self] in
      guard let self = self, !self.premiereAnnoncee else { return }
      self.premiereAnnoncee = true
      self.onPremiereImage?([:])
    }
  }

  // ------------------------------------------------------------ couleurs

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

  /** `a` tiré vers `b` d'une fraction `t`. */
  private func melange(_ a: UIColor, _ b: UIColor, _ t: CGFloat) -> UIColor {
    var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
    var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
    a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
    b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    let k = max(0, min(1, t))
    return UIColor(
      red: r1 + (r2 - r1) * k,
      green: g1 + (g2 - g1) * k,
      blue: b1 + (b2 - b1) * k,
      alpha: 1)
  }

  // ------------------------------------------------------------- caméra

  private func placerOeil() {
    if orbite.count >= 10 {
      placerOrbite()
      return
    }
    oeil.camera?.usesOrthographicProjection = false
    regleLeMode(maquette: false)
    regleLeContour(0.003)
    guard camera.count >= 6 else { return }
    let x = camera[0].floatValue
    let y = camera[1].floatValue
    let z = camera[2].floatValue
    let lacet = camera[3].floatValue
    let tangage = camera[4].floatValue
    let ouverture = camera[5].doubleValue
    guard x.isFinite, y.isFinite, z.isFinite, lacet.isFinite, tangage.isFinite,
      ouverture.isFinite, ouverture > 1, ouverture < 179
    else { return }
    // Le même repère que `povBase` côté JavaScript : lacet 0 regarde +z,
    // π/2 regarde +x ; le tangage positif lève les yeux.
    let cp = cosf(tangage)
    let sp = sinf(tangage)
    let avant = SCNVector3(x: sinf(lacet) * cp, y: sp, z: cosf(lacet) * cp)
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0
    SCNTransaction.disableActions = true
    oeil.position = SCNVector3(x: x, y: y, z: z)
    oeil.look(
      at: SCNVector3(x: x + avant.x, y: y + avant.y, z: z + avant.z),
      up: SCNVector3(x: 0, y: 1, z: 0),
      localFront: SCNVector3(x: 0, y: 0, z: -1))
    oeil.camera?.fieldOfView = CGFloat(ouverture)
    SCNTransaction.commit()
  }

  /**
   * LA CAMÉRA DE LA MAQUETTE — orthographique, comme la projection des cotes
   * posées par-dessus en JavaScript. L'œil se pose sur l'axe, loin, et
   * regarde la cible ; « haut » reste le haut de l'écran. La demi-hauteur
   * visible fait l'échelle : c'est elle qui zoome.
   */
  private func placerOrbite() {
    let o = orbite.map { $0.floatValue }
    guard o.count >= 10, o.allSatisfy({ $0.isFinite }), o[9] > 0.01 else { return }
    let cible = SCNVector3(x: o[0], y: o[1], z: o[2])
    let vers = SCNVector3(x: o[3], y: o[4], z: o[5])
    let haut = SCNVector3(x: o[6], y: o[7], z: o[8])
    // Assez loin pour que tout le logement soit devant l'œil, quel que soit
    // l'angle ; la profondeur visible suit.
    let recul: Float = 80
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0
    SCNTransaction.disableActions = true
    if let cam = oeil.camera {
      cam.usesOrthographicProjection = true
      cam.orthographicScale = Double(o[9])
      cam.zNear = 1
      cam.zFar = Double(recul * 2)
      // L'occlusion ambiante est faite pour une perspective : sur une vue
      // orthographique, elle creuse des halos là où il n'y a rien.
      cam.screenSpaceAmbientOcclusionIntensity = 0
    }
    /*
      LA LUMIÈRE DE LA MAQUETTE. Vue de dessus, l'arase des murs et les sols
      reçoivent le jour de face : avec les réglages de la visite, ils
      saturaient en blanc, et le sable du sol ne se distinguait plus du blanc
      cassé des murs. On rend au dessus SA couleur, et les flancs gardent
      assez d'écart pour qu'un angle se lise.
    */
    regleLeMode(maquette: true)
    oeil.position = SCNVector3(
      x: cible.x + vers.x * recul, y: cible.y + vers.y * recul, z: cible.z + vers.z * recul)
    oeil.look(at: cible, up: haut, localFront: SCNVector3(x: 0, y: 0, z: -1))
    SCNTransaction.commit()
    reveiller(0.2)
    // Quatre cinquièmes de point d'écran, en mètres, au zoom de cette image.
    let hauteur = Float(max(1, bounds.height))
    regleLeContour(o[9] * 2 / hauteur * 0.8)
  }

  /**
   * LA LEVÉE — le logement monte de son sol, au retour d'un scan. Le sol ne
   * bouge pas : tout ce qui est dessus s'écrase vers lui, puis se relève.
   * C'est exactement ce que fait la projection des cotes par-dessus.
   */
  private func lever() {
    let k = max(0.001, min(1, levee.floatValue))
    let y0 = solY.floatValue
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0
    SCNTransaction.disableActions = true
    bati.scale = SCNVector3(x: 1, y: k, z: 1)
    bati.position = SCNVector3(x: 0, y: y0 * (1 - k), z: 0)
    SCNTransaction.commit()
    reveiller(0.2)
  }

  // --------------------------------------------------------------- bâti

  /*
    UNE RECONSTRUCTION PAR PASSAGE, PAS PAR PROPRIÉTÉ. Au montage, la vue
    reçoit ses tableaux un par un — maillage, sols, orientés, écorché — et
    chacun relançait la construction de tout le bâti. On la reporte au tour
    suivant de la boucle principale : quatre propriétés, une construction.
  */
  private var rebatirPrevu = false

  private func rebatir(_ s: Sale = .tout) {
    sale.formUnion(s)
    guard !rebatirPrevu else { return }
    rebatirPrevu = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.rebatirPrevu = false
      self.rebatirMaintenant()
    }
  }

  private static func vider(_ n: SCNNode) {
    for enfant in n.childNodes { enfant.removeFromParentNode() }
  }

  private func rebatirMaintenant() {
    let s = sale
    sale = []
    if s.contains(.bati) {
      Self.vider(gBati)
      matiereEcorche = nil
      matieresDuBati.removeAll()
      if let g = geometrie(fMaillage, deuxFaces: true) {
        gBati.addChildNode(SCNNode(geometry: g))
      }
      if let a = noeudDesAretes() { gBati.addChildNode(a) }
      if let g = geometrie(fOrientes, deuxFaces: false) {
        gBati.addChildNode(SCNNode(geometry: g))
      }
      if let g = geometrie(fEcorche, deuxFaces: false) {
        matiereEcorche = g.firstMaterial
        appliquerVoile()
        let n = SCNNode(geometry: g)
        // Peint après le reste : un voile se pose sur ce qu'il voile.
        n.renderingOrder = 10
        gBati.addChildNode(n)
      }
    }
    if s.contains(.sols) {
      Self.vider(gSols)
      for n in noeudsDesSols() { gSols.addChildNode(n) }
    }
    if s.contains(.images) {
      Self.vider(gImages)
      for n in noeudsTextures() { gImages.addChildNode(n) }
    }
    if s.contains(.meubles) {
      Self.vider(gMeubles)
      for n in noeudsDesMeubles() { gMeubles.addChildNode(n) }
    }
    if !premiereAnnoncee && !gBati.childNodes.isEmpty { guetteLaPremiere = true }
    reveiller()
  }

  /*
    L'ÉCORCHÉ, CALCULÉ AU PIXEL. Une face extérieure de mur qui nous fait face
    masque la pièce : elle se voile, jusqu'à quinze pour cent, de quoi garder
    la trace du mur. Vue de champ, elle reste pleine. La normale est dans le
    repère de l'œil : sa composante z dit à quel point la face nous regarde —
    le même nombre que le JavaScript appelait « vers ».
  */
  private static let nuanceurVoile = """
    #pragma transparent
    #pragma body
    float vers = normalize(_surface.normal).z;
    float a = 1.0 - 0.85 * smoothstep(0.08, 0.5, vers);
    _output.color = float4(_output.color.rgb * a, a);
    """

  /// Pose ou retire le voile de l'écorché, sans rien rebâtir.
  private func appliquerVoile() {
    guard let m = matiereEcorche else { return }
    if voile {
      m.shaderModifiers = [.fragment: Self.nuanceurVoile]
      m.blendMode = .alpha
      m.writesToDepthBuffer = false
    } else {
      // Sans voile, la façade redevient un mur comme les autres.
      m.shaderModifiers = [.fragment: Self.nuanceurClarte]
      m.writesToDepthBuffer = true
    }
  }

  // ------------------------------------------------------------- vraies images

  /**
   LES MURS ET LES SOLS EN VRAIES IMAGES — relevé du patron : « une
   reproduction à l'identique, sur le modèle 3D, de ce que l'on scanne ».

   Chaque face qu'une orthophoto couvre arrive ici plutôt que dans le
   maillage teinté : seize nombres par triangle — le rang de son image dans
   `textures`, puis trois sommets (x, y, z, u, v). Un nœud par image, une
   matière qui porte l'image ; l'image est lue une fois et gardée.

   L'image a déjà sa lumière — celle de la pièce au moment du scan : une
   part de son éclat lui revient en émission, pour qu'elle ne s'assombrisse
   pas une seconde fois sous l'éclairage de la scène.
   */
  private func noeudsTextures() -> [SCNNode] {
    let v = fTexturees
    let n = v.count / 16
    guard n > 0, !textures.isEmpty else { return [] }
    var parImage: [Int: [Int]] = [:]
    for t in 0..<n {
      parImage[Int(v[t * 16]), default: []].append(t)
    }
    var noeuds: [SCNNode] = []
    for (k, liste) in parImage {
      guard k >= 0, k < textures.count, let image = Self.image(textures[k] as String) else { continue }
      var sommets: [SCNVector3] = []
      var normales: [SCNVector3] = []
      var uvs: [CGPoint] = []
      sommets.reserveCapacity(liste.count * 3)
      normales.reserveCapacity(liste.count * 3)
      uvs.reserveCapacity(liste.count * 3)
      for t in liste {
        let b = t * 16 + 1
        var p: [SIMD3<Float>] = []
        var q: [CGPoint] = []
        for s in 0..<3 {
          let o = b + s * 5
          p.append(SIMD3<Float>(v[o], v[o + 1], v[o + 2]))
          q.append(CGPoint(x: CGFloat(v[o + 3]), y: CGFloat(v[o + 4])))
        }
        let c = simd_cross(p[1] - p[0], p[2] - p[0])
        let l = simd_length(c)
        guard l > 1e-9 else { continue }
        let nrm = c / l
        for s in 0..<3 {
          sommets.append(SCNVector3(p[s].x, p[s].y, p[s].z))
          normales.append(SCNVector3(nrm.x, nrm.y, nrm.z))
          uvs.append(q[s])
        }
      }
      guard !sommets.isEmpty else { continue }
      let indices = (0..<Int32(sommets.count)).map { $0 }
      let geometrie = SCNGeometry(
        sources: [
          SCNGeometrySource(vertices: sommets),
          SCNGeometrySource(normals: normales),
          SCNGeometrySource(textureCoordinates: uvs),
        ],
        elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
      let m = SCNMaterial()
      m.lightingModel = .lambert
      m.diffuse.contents = image
      m.diffuse.wrapS = .clamp
      m.diffuse.wrapT = .clamp
      m.diffuse.mipFilter = .linear
      // Un mur vu de biais garde son détail : filtrage anisotrope.
      m.diffuse.maxAnisotropy = 16
      m.diffuse.minificationFilter = .linear
      m.diffuse.magnificationFilter = .linear
      m.emission.contents = image
      m.emission.intensity = 0.35
      m.isDoubleSided = false
      geometrie.materials = [m]
      noeuds.append(SCNNode(geometry: geometrie))
    }
    return noeuds
  }

  /// Les images déjà lues : un passage de la caméra ne relit pas le disque.
  /// Soixante-quatre mégaoctets d'images décodées au plus : au-delà, le cache
  /// rend la mémoire au système au lieu de grossir sans fin.
  private static let imagesLues: NSCache<NSString, UIImage> = {
    let c = NSCache<NSString, UIImage>()
    c.totalCostLimit = 64 << 20
    return c
  }()

  /**
   L'image d'un chemin — retrouvée par son nom si l'app a été réinstallée.
   DÉCODÉE ICI, PAS À LA PREMIÈRE IMAGE : lue paresseusement, chaque JPEG se
   décodait au moment où la carte graphique le réclamait — tous ensemble, sur
   la première image de la visite, qui sautait.
   */
  static func image(_ chemin: String) -> UIImage? {
    if let deja = imagesLues.object(forKey: chemin as NSString) { return deja }
    guard let url = RoomScanExport.resolveFile(chemin),
          let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let options: [CFString: Any] = [kCGImageSourceShouldCacheImmediately: true]
    guard let cg = CGImageSourceCreateImageAtIndex(src, 0, options as CFDictionary) else { return nil }
    let image = UIImage(cgImage: cg)
    let cout: Int = cg.bytesPerRow * cg.height
    imagesLues.setObject(image, forKey: chemin as NSString, cost: cout)
    return image
  }

  // ------------------------------------------------------------- meubles

  /** Les meubles : un nœud par matière, toutes les pièces de la scène dedans. */
  private func noeudsDesMeubles() -> [SCNNode] {
    let v = fMeubles
    var k = 0
    var out: [SCNNode] = []
    while k + 8 <= v.count {
      // Un DIFFUSEUR de lampe porte son rang dans son code : 5 + 100 × (rang + 1).
      let brut = Int(v[k])
      let lampe = brut >= 100 ? brut / 100 - 1 : -1
      let code = brut % 100
      let teinte = UIColor(
        red: CGFloat(v[k + 1]), green: CGFloat(v[k + 2]), blue: CGFloat(v[k + 3]), alpha: 1)
      let rugosite = CGFloat(v[k + 4])
      let metal = CGFloat(v[k + 5])
      let nS = Int(v[k + 6])
      let nI = Int(v[k + 7])
      k += 8
      guard nS > 0, nI > 0, k + nS * 8 + nI <= v.count else { break }
      /*
        LES SOMMETS PARTENT D'UN BLOC. Le JavaScript les range déjà comme la
        carte graphique les lit — position, normale, coordonnées d'image,
        huit flottants par sommet : on les copie tels quels, au lieu de trois
        tableaux refaits sommet par sommet (et une seconde fois pour la coque).
      */
      let debut = k
      let fin = k + nS * 8
      let donnees: Data = v[debut..<fin].withUnsafeBufferPointer { Data(buffer: $0) }
      let positions = Self.source(donnees, .vertex, nS, composantes: 3, decalage: 0)
      let normales = Self.source(donnees, .normal, nS, composantes: 3, decalage: 12)
      let uvs = Self.source(donnees, .texcoord, nS, composantes: 2, decalage: 24)
      k = fin
      var indices: [UInt32] = []
      indices.reserveCapacity(nI)
      let dernier = Float(nS - 1)
      for j in 0..<nI {
        indices.append(UInt32(max(0, min(dernier, v[k + j]))))
      }
      k += nI
      let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
      let g = SCNGeometry(sources: [positions, normales, uvs], elements: [element])
      g.materials = [materiauDuMeuble(code, teinte, rugosite, metal)]
      let n = SCNNode(geometry: g)
      // Le diffuseur d'un luminaire du plan : toujours éteint (voir `diffuseurEteint`).
      if code == 5 && lampe >= 0 { g.materials = [diffuseurEteint] }
      // Ce qui se pose PAR-DESSUS le reste — l'ombre, le verre — passe après.
      if code == 9 { n.renderingOrder = 5 }
      if code == 3 || code == 6 { n.renderingOrder = 6 }
      out.append(n)
      // Le liseré : pour ce qui a une forme pleine (ni ombre, ni verre, ni
      // feuille, ni lumière — un diffuseur allumé n'a pas de bord sombre).
      if code != 9 && code != 3 && code != 4 && code != 5 && code != 6 {
        if let coque = noeudDeContour(v, debut: debut, nS: nS, indices: indices,
                                      positions: positions, element: element) {
          out.append(coque)
        }
      }
    }
    return out
  }

  /// Une source de sommets lue dans le bloc : huit flottants (32 octets) par sommet.
  private static func source(
    _ d: Data, _ s: SCNGeometrySource.Semantic, _ n: Int, composantes: Int, decalage: Int
  ) -> SCNGeometrySource {
    SCNGeometrySource(
      data: d, semantic: s, vectorCount: n, usesFloatComponents: true,
      componentsPerVector: composantes, bytesPerComponent: 4,
      dataOffset: decalage, dataStride: 32)
  }

  /**
   * La coque d'un groupe : les mêmes triangles (la même source de positions,
   * le même élément), avec une normale SOUDÉE par position (la moyenne des
   * normales des sommets confondus) — sans quoi la coque se fendrait à chaque
   * arête vive d'une boîte.
   */
  private func noeudDeContour(
    _ v: [Float], debut: Int, nS: Int, indices: [UInt32],
    positions: SCNGeometrySource, element: SCNGeometryElement
  ) -> SCNNode? {
    guard nS > 0, !indices.isEmpty else { return nil }
    func point(_ i: Int) -> SCNVector3 {
      let b = debut + i * 8
      return SCNVector3(x: v[b], y: v[b + 1], z: v[b + 2])
    }
    // La position, arrondie au demi-millimètre, en clé ENTIÈRE : une chaîne
    // fabriquée par sommet coûtait plus que tout le reste de la coque.
    var cumul: [SIMD3<Int32>: SCNVector3] = [:]
    var cles: [SIMD3<Int32>] = []
    cles.reserveCapacity(nS)
    // Les normales géométriques, par triangle, cumulées sur leurs sommets.
    var parSommet = [SCNVector3](repeating: SCNVector3(x: 0, y: 0, z: 0), count: nS)
    var t = 0
    while t + 2 < indices.count {
      let a = Int(indices[t]), b = Int(indices[t + 1]), c = Int(indices[t + 2])
      t += 3
      guard a < nS, b < nS, c < nS else { continue }
      let n = normale(point(a), point(b), point(c))
      parSommet[a] = SCNVector3(x: parSommet[a].x + n.x, y: parSommet[a].y + n.y, z: parSommet[a].z + n.z)
      parSommet[b] = SCNVector3(x: parSommet[b].x + n.x, y: parSommet[b].y + n.y, z: parSommet[b].z + n.z)
      parSommet[c] = SCNVector3(x: parSommet[c].x + n.x, y: parSommet[c].y + n.y, z: parSommet[c].z + n.z)
    }
    for k in 0..<nS {
      let p = point(k)
      let cle = SIMD3<Int32>(
        Int32((p.x * 2000).rounded()), Int32((p.y * 2000).rounded()), Int32((p.z * 2000).rounded()))
      cles.append(cle)
      let deja = cumul[cle] ?? SCNVector3(x: 0, y: 0, z: 0)
      cumul[cle] = SCNVector3(
        x: deja.x + parSommet[k].x, y: deja.y + parSommet[k].y, z: deja.z + parSommet[k].z)
    }
    var soudees: [SCNVector3] = []
    soudees.reserveCapacity(nS)
    for cle in cles {
      let w = cumul[cle] ?? SCNVector3(x: 0, y: 1, z: 0)
      let l = sqrtf(w.x * w.x + w.y * w.y + w.z * w.z)
      soudees.append(l > 1e-6 ? SCNVector3(x: w.x / l, y: w.y / l, z: w.z / l) : SCNVector3(x: 0, y: 1, z: 0))
    }
    let g = SCNGeometry(sources: [positions, SCNGeometrySource(normals: soudees)], elements: [element])
    g.materials = [matiereContour]
    let noeud = SCNNode(geometry: g)
    // Après le reste : un voile se pose sur ce qui est déjà peint.
    noeud.renderingOrder = 4
    return noeud
  }

  /// La matière des liserés — une seule, partagée par tous les meubles.
  private static func fabriquerContour(epaisseur: Float) -> SCNMaterial {
    let m = SCNMaterial()
    m.lightingModel = .constant
    /*
      UN VOILE AU BORD, PAS UN TRAIT DE BANDE DESSINÉE — relevé du patron :
      « réduis l'opacité des contours de meubles, ça fait trop dessin animé ;
      je cherche juste à mieux différencier les meubles des murs et des
      sols ». Un gris chaud plus clair, au tiers de son opacité : le bord d'un
      meuble blanc se détache du mur blanc d'un souffle, sans être cerné.
      Il n'écrit pas la profondeur : un voile ne doit rien cacher.
    */
    m.diffuse.contents = UIColor(red: 0.42, green: 0.40, blue: 0.37, alpha: 1)
    m.transparency = 0.32
    m.blendMode = .alpha
    m.writesToDepthBuffer = false
    // Seules les faces ARRIÈRE : la coque ne se voit qu'au bord de la forme.
    m.cullMode = .front
    m.isDoubleSided = false
    m.shaderModifiers = [
      .geometry: """
      #pragma arguments
      float epaisseur;
      #pragma body
      _geometry.position.xyz += _geometry.normal * epaisseur;
      """
    ]
    m.setValue(NSNumber(value: epaisseur), forKey: "epaisseur")
    return m
  }

  /** L'épaisseur du liseré, en mètres — un point d'écran, au zoom du moment. */
  private func regleLeContour(_ metres: Float) {
    guard metres.isFinite, metres > 0 else { return }
    let voulue = min(0.05, max(0.002, metres))
    // Rien à reposer : en visite, l'épaisseur est fixe, et chaque image
    // réécrivait la même valeur dans chaque matériau.
    if voulue == epaisseurContour { return }
    epaisseurContour = voulue
    matiereContour.setValue(NSNumber(value: epaisseurContour), forKey: "epaisseur")
  }

  /** Une matière physique : teinte, rugosité, métal — et ce que son code ajoute. */
  private func materiauDuMeuble(
    _ code: Int, _ teinteRelevee: UIColor, _ rugosite: CGFloat, _ metal: CGFloat
  ) -> SCNMaterial {
    let m = SCNMaterial()
    m.lightingModel = .physicallyBased
    // Les matières pleines prennent une teinte de matière réelle (voir
    // `teinteReelle`) ; le verre, la lumière, l'ombre et l'appareillage non.
    let teinte: UIColor
    if let plafond = choix.albedoMeubles, [0, 1, 2, 4].contains(code) && metal < 0.5 {
      teinte = Self.teinteReelle(teinteRelevee, plafond: plafond)
    } else {
      teinte = teinteRelevee
    }
    m.diffuse.contents = teinte
    m.roughness.contents = NSNumber(value: Float(rugosite))
    m.metalness.contents = NSNumber(value: Float(metal))
    m.isDoubleSided = false
    m.cullMode = .back
    switch code {
    case 1, 2:
      /*
        PLUS DE TEXTURE DESSINÉE SUR LES MEUBLES — relevé du patron : « enlève
        les textures sur les meubles ». Le fil du bois et la trame du tissu,
        dessinés à la main, faisaient des rayures plus que de la matière. Le
        bois et le tissu gardent leur teinte et leur rugosité : c'est la
        lumière qui fait la matière.
      */
      break
    case 3:
      m.transparency = 0.3
      m.transparencyMode = .dualLayer
      m.isDoubleSided = true
      m.writesToDepthBuffer = false
    case 4:
      m.isDoubleSided = true
    case 7:
      /*
        L'APPAREILLAGE SE VOIT MÊME SANS LAMPE — relevé du patron : « les
        éléments élec sont trop gris sans lumière ». Une part de sa propre
        teinte en émission : une prise blanche reste blanche dans un coin
        d'ombre, sans briller.
      */
      m.emission.contents = teinte
      m.emission.intensity = 0.22
    case 5:
      // CE QUI ÉCLAIRE — le diffuseur d'une applique, le verre d'un spot,
      // une ampoule : il donne la lumière au lieu de la recevoir. Il se
      // peint donc de sa propre teinte, sans ombre, comme une lampe allumée.
      m.lightingModel = .constant
    case 6:
      /*
        LE VITRAGE, UN VRAI VERRE — relevé du patron : « le bleu uni des
        fenêtres et baies est à revoir, ça fait trop cartoon ; on veut du
        semi-réalisme ». Il n'est plus peint : on voit À TRAVERS, le ciel et
        l'horizon que la visite pose dehors (`imageDuCiel`). Face à lui, il
        est presque invisible — un voile vert d'eau, la teinte d'un double
        vitrage ; de biais, il renvoie le jour comme une vitre (Fresnel).
      */
      m.lightingModel = .constant
      m.diffuse.contents = UIColor.white
      m.blendMode = .alpha
      m.isDoubleSided = true
      m.writesToDepthBuffer = false
      m.shaderModifiers = [.fragment: Self.nuanceurVerre]
    case 9:
      m.lightingModel = .constant
      m.diffuse.contents = RoomScanVisite.imageDOmbre(choix.ombre)
      m.blendMode = .alpha
      m.writesToDepthBuffer = false
    default:
      break
    }
    // Le plafond de couleur : les matières pleines, ni verre, ni lumière,
    // ni ombre, ni métal (un chrome vit de ses reflets).
    if [0, 1, 2, 4, 7].contains(code) && metal < 0.5 {
      m.shaderModifiers = [.fragment: Self.nuanceurPlafondDesMeubles]
    }
    return m
  }

  /*
    UNE TEINTE DE MATIÈRE RÉELLE — relevé du patron : « les meubles font trop
    dessin animé ». Rien de ce qu'on pose dans une pièce ne renvoie toute la
    lumière : un drap blanc en rend huit dixièmes, une laque un peu moins.
    Un meuble d'un blanc parfait, d'un aplat franc, est ce qui signe le
    dessin. La teinte relevée garde sa couleur, plafonnée à ces huit
    dixièmes, et perd un soupçon de sa saturation — celle des catalogues.
  */
  static func teinteReelle(_ c: UIColor, plafond: CGFloat = 0.8) -> UIColor {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    c.getRed(&r, green: &g, blue: &b, alpha: &a)
    let l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    let k: CGFloat = l > plafond ? plafond / l : 1
    let gris = l * k
    let d: CGFloat = 0.08
    return UIColor(
      red: (r * k) * (1 - d) + gris * d,
      green: (g * k) * (1 - d) + gris * d,
      blue: (b * k) * (1 - d) + gris * d,
      alpha: 1)
  }

  /*
    LE VERRE — presque rien de face, un reflet de biais. La normale et la
    position sont dans le repère de l'œil : le cosinus entre la normale et
    le regard dit à quel point on le voit de face. Couleur prémultipliée,
    comme le voile de l'écorché.
  */
  static let nuanceurVerre = """
    #pragma transparent
    #pragma body
    float3 n = normalize(_surface.normal);
    float3 v = normalize(-_surface.position);
    float f = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 4.0);
    float3 verre = float3(0.80, 0.88, 0.87);
    float3 reflet = float3(0.95, 0.96, 0.97);
    float a = 0.10 + 0.50 * f;
    _output.color = float4(mix(verre, reflet, float3(f)) * a, a);
    """

  /**
   * LE DEHORS DE LA VISITE — un ciel, un horizon voilé, un sol lointain.
   *
   * Une image « équirectangulaire » posée en fond de scène : SceneKit la
   * tend tout autour de l'œil, et elle tourne avec le regard. Par une baie,
   * on voit donc le ciel en levant les yeux, l'horizon à hauteur d'œil, un
   * sol de campagne en les baissant — au lieu d'un aplat bleu. La teinte de
   * la scène (`fond`) donne celle du ciel.
   */
  static func imageDuCiel(_ fond: UIColor) -> UIImage {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    fond.getRed(&r, green: &g, blue: &b, alpha: &a)
    func vers(_ t: CGFloat, _ cr: CGFloat, _ cg: CGFloat, _ cb: CGFloat) -> CGColor {
      UIColor(red: r + (cr - r) * t, green: g + (cg - g) * t, blue: b + (cb - b) * t, alpha: 1).cgColor
    }
    let taille = CGSize(width: 1024, height: 512)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.preferredRange = .standard
    return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      let c = ctx.cgContext
      let couleurs = [
        vers(0.55, 0.40, 0.60, 0.84),  // le zénith, d'un bleu plus profond
        vers(0.15, 0.62, 0.76, 0.90),
        vers(0.55, 0.93, 0.94, 0.94),  // l'horizon, voilé de brume
        UIColor(red: 0.80, green: 0.81, blue: 0.77, alpha: 1).cgColor,  // le lointain
        UIColor(red: 0.62, green: 0.65, blue: 0.56, alpha: 1).cgColor,
        UIColor(red: 0.46, green: 0.50, blue: 0.40, alpha: 1).cgColor,  // le sol, sous les pieds
      ] as CFArray
      let positions: [CGFloat] = [0, 0.32, 0.497, 0.503, 0.58, 1]
      if let degrade = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: couleurs, locations: positions)
      {
        c.drawLinearGradient(degrade, start: .zero, end: CGPoint(x: 0, y: taille.height), options: [])
      }
      // Quelques nuages, très doux : un ciel n'est jamais un dégradé parfait.
      var graine: UInt64 = 0x2545_F491_4F6C_DD1D
      func hasard() -> CGFloat {
        graine = graine &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
        return CGFloat((graine >> 33) & 0xFF_FFFF) / CGFloat(0xFF_FFFF)
      }
      for _ in 0..<26 {
        let largeur = 60 + hasard() * 180
        let hauteur = largeur * (0.18 + hasard() * 0.15)
        let x = hasard() * taille.width
        let y = 60 + hasard() * 170
        c.setFillColor(UIColor(white: 1, alpha: 0.05 + hasard() * 0.08).cgColor)
        for dx in [-taille.width, 0, taille.width] {
          c.fillEllipse(in: CGRect(x: x + dx - largeur / 2, y: y - hauteur / 2, width: largeur, height: hauteur))
        }
      }
    }
  }

  /**
   * L'OMBRE DE CONTACT : un carré noir dont l'opacité reste franche jusqu'au
   * bord du meuble, puis s'éteint sur la marge. C'est elle qui fait POSER un
   * meuble — sans elle, il flotte, même parfaitement à sa place.
   */
  private static var ombres: [Int: UIImage] = [:]
  private static func imageDOmbre(_ opacite: CGFloat) -> UIImage {
    let cle = Int(opacite * 100)
    if let deja = ombres[cle] { return deja }
    let image = dessinerOmbre(Double(opacite))
    ombres[cle] = image
    return image
  }

  private static func dessinerOmbre(_ opacite: Double) -> UIImage {
    let n = 128
    var pixels = [UInt8](repeating: 0, count: n * n * 4)
    for y in 0..<n {
      for x in 0..<n {
        let u = abs((Double(x) + 0.5) / Double(n) * 2 - 1)
        let w = abs((Double(y) + 0.5) / Double(n) * 2 - 1)
        let d = pow(pow(u, 4) + pow(w, 4), 0.25)
        let a = max(0, min(1, (1 - d) / 0.25))
        pixels[(y * n + x) * 4 + 3] = UInt8(pow(a, 1.6) * opacite * 255)
      }
    }
    guard let fournisseur = CGDataProvider(data: Data(pixels) as CFData),
      let image = CGImage(
        width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
        provider: fournisseur, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    else { return UIImage() }
    return UIImage(cgImage: image)
  }

  /** Le ciel des matériaux physiques : blanc en haut, gris chaud à l'horizon, sol beige. */
  private static func imageDEnvironnement() -> UIImage {
    let taille = CGSize(width: 256, height: 128)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.preferredRange = .standard
    return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
      let couleurs =
        [
          UIColor.white.cgColor,
          UIColor(red: 0.91, green: 0.9, blue: 0.88, alpha: 1).cgColor,
          UIColor(red: 0.72, green: 0.69, blue: 0.65, alpha: 1).cgColor,
        ] as CFArray
      let positions: [CGFloat] = [0, 0.5, 1]
      if let degrade = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: couleurs, locations: positions)
      {
        ctx.cgContext.drawLinearGradient(
          degrade, start: .zero, end: CGPoint(x: 0, y: taille.height), options: [])
      }
    }
  }

  /** La normale d'un triangle, par son sens de parcours. */
  private func normale(_ a: SCNVector3, _ b: SCNVector3, _ c: SCNVector3) -> SCNVector3 {
    let ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
    let vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    let l = sqrtf(nx * nx + ny * ny + nz * nz)
    guard l > 1e-9 else { return SCNVector3(x: 0, y: 1, z: 0) }
    return SCNVector3(x: nx / l, y: ny / l, z: nz / l)
  }

  /**
   * TOUT UN GROUPE EN UNE GÉOMÉTRIE : une couleur par sommet, une normale par
   * triangle. Une seule pièce de géométrie, c'est un seul appel de dessin
   * — c'est ce qui fait que deux mille faces ne coûtent rien.
   *
   * `deuxFaces` : le mobilier tel qu'on le décrit n'a pas toujours un sens
   * de parcours fiable, il se dessine des deux côtés. Les faces ORIENTÉES,
   * elles, ne montrent jamais leur dos : vu de l'extérieur, le mur du devant
   * ne cache pas la pièce.
   */
  private func geometrie(_ source: [Float], deuxFaces: Bool) -> SCNGeometry? {
    let v = source
    let parTriangle = 12
    let n = v.count / parTriangle
    guard n > 0 else { return nil }
    var sommets: [SCNVector3] = []
    var normales: [SCNVector3] = []
    var couleurs: [Float] = []
    var indices: [Int32] = []
    sommets.reserveCapacity(n * 3)
    normales.reserveCapacity(n * 3)
    couleurs.reserveCapacity(n * 12)
    indices.reserveCapacity(n * 3)
    for t in 0..<n {
      let b = t * parTriangle
      let p0 = SCNVector3(x: v[b], y: v[b + 1], z: v[b + 2])
      let p1 = SCNVector3(x: v[b + 3], y: v[b + 4], z: v[b + 5])
      let p2 = SCNVector3(x: v[b + 6], y: v[b + 7], z: v[b + 8])
      let nrm = normale(p0, p1, p2)
      // Sans petit tableau par triangle : des dizaines de milliers
      // d'allocations de moins à l'ouverture de la visite.
      sommets.append(p0)
      sommets.append(p1)
      sommets.append(p2)
      normales.append(nrm)
      normales.append(nrm)
      normales.append(nrm)
      let r = v[b + 9], g = v[b + 10], bl = v[b + 11]
      for _ in 0..<3 {
        couleurs.append(r)
        couleurs.append(g)
        couleurs.append(bl)
        couleurs.append(1)
      }
      let i = Int32(t * 3)
      indices.append(i)
      indices.append(i + 1)
      indices.append(i + 2)
    }
    let sourceSommets = SCNGeometrySource(vertices: sommets)
    let sourceNormales = SCNGeometrySource(normals: normales)
    let donnees = couleurs.withUnsafeBufferPointer { Data(buffer: $0) }
    let sourceCouleurs = SCNGeometrySource(
      data: donnees,
      semantic: .color,
      vectorCount: sommets.count,
      usesFloatComponents: true,
      componentsPerVector: 4,
      bytesPerComponent: MemoryLayout<Float>.size,
      dataOffset: 0,
      dataStride: 4 * MemoryLayout<Float>.size)
    let element = SCNGeometryElement(indices: indices, primitiveType: .triangles)
    let g = SCNGeometry(
      sources: [sourceSommets, sourceNormales, sourceCouleurs], elements: [element])
    let m = SCNMaterial()
    m.lightingModel = .lambert
    m.diffuse.contents = UIColor.white
    m.locksAmbientWithDiffuse = true
    // Les deux côtés pour ce qui n'a pas de sens : une face dont le sens de
    // parcours s'est trompé reste un mur, pas un trou.
    m.isDoubleSided = deuxFaces
    m.cullMode = .back
    m.shaderModifiers = [.fragment: Self.nuanceurClarte]
    m.setValue(NSNumber(value: Float(clarteDesMurs)), forKey: "clarte")
    matieresDuBati.append(m)
    g.materials = [m]
    return g
  }

  /** Les arêtes : des segments, un trait fin et léger, un peu décollé des faces. */
  private func noeudDesAretes() -> SCNNode? {
    let v = fAretes
    let n = v.count / 6
    guard n > 0 else { return nil }
    var sommets: [SCNVector3] = []
    sommets.reserveCapacity(n * 2)
    for k in 0..<(n * 2) {
      sommets.append(SCNVector3(x: v[k * 3], y: v[k * 3 + 1], z: v[k * 3 + 2]))
    }
    let indices = (0..<Int32(n * 2)).map { $0 }
    let g = SCNGeometry(
      sources: [SCNGeometrySource(vertices: sommets)],
      elements: [SCNGeometryElement(indices: indices, primitiveType: .line)])
    let m = SCNMaterial()
    m.lightingModel = .constant
    m.diffuse.contents = UIColor(red: 0.33, green: 0.31, blue: 0.29, alpha: 1)
    m.transparency = 0.42
    m.blendMode = .alpha
    m.writesToDepthBuffer = false
    m.isDoubleSided = true
    g.materials = [m]
    let noeud = SCNNode(geometry: g)
    // Après les faces : un trait se pose sur ce qu'il souligne.
    noeud.renderingOrder = 3
    return noeud
  }

  // --------------------------------------------------------------- sols

  /** La tuile d'une matière, en mètres : le long des lames, puis en travers. */
  private func tuile(_ matiere: Int) -> (CGFloat, CGFloat) {
    switch matiere {
    case 1: return (1.35, 0.44)  // une lame de long, deux lames de large
    case 2: return (0.6, 0.6)  // un carreau
    default: return (1, 1)
    }
  }

  /**
   * L'IMAGE D'UN SOL, à répéter. Elle se dessine une fois par sol, dans la
   * teinte relevée : parquet ou carrelage, le sol garde SA couleur.
   */
  private func imageDuSol(_ matiere: Int, _ teinte: UIColor) -> UIImage? {
    // Dessinée une fois par matière et par teinte, pour toutes les vues.
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 0
    teinte.getRed(&r, green: &g, blue: &b, alpha: &a)
    let cle = "\(matiere)-\(Int(r * 255))-\(Int(g * 255))-\(Int(b * 255))-\(choix.veinage)"
    if let deja = Self.imagesDesSols[cle] { return deja }
    let image = dessinerLeSol(matiere, teinte)
    if let image = image { Self.imagesDesSols[cle] = image }
    return image
  }

  private func dessinerLeSol(_ matiere: Int, _ teinte: UIColor) -> UIImage? {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.preferredRange = .standard
    let joint = melange(teinte, UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1), 0.3)
    if matiere == 1 {
      // 1,35 m × 0,44 m → 512 × 167 px : une lame par rang, et le rang du
      // dessous décalé d'une demi-lame.
      let taille = CGSize(width: 512, height: 167)
      return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
        let c = ctx.cgContext
        let lame = taille.height / 2
        // Trois lames, trois tons — un parquet n'est jamais uni.
        let tons: [(CGRect, CGFloat)] = [
          (CGRect(x: 0, y: 0, width: taille.width, height: lame), 0.05),
          (CGRect(x: 0, y: lame, width: taille.width / 2, height: lame), -0.03),
          (CGRect(x: taille.width / 2, y: lame, width: taille.width / 2, height: lame), 0.01),
        ]
        for (zone, ton) in tons {
          let fond = ton >= 0
            ? melange(teinte, .white, ton)
            : melange(teinte, .black, -ton)
          c.setFillColor(fond.cgColor)
          c.fill(zone)
        }
        /*
          LE FIL DU BOIS — relevé du patron : « de vraies textures ». Un
          parquet uni, à trois aplats, signait le dessin. Chaque lame reçoit
          son veinage : des fils sinueux le long de la lame, plus sombres ou
          plus clairs d'un rien, serrés par endroits, et de loin en loin un
          nœud. Le tirage est fixe : le même parquet à chaque visite.
        */
        let avecVeinage = self.choix.veinage
        var graine: UInt64 = 0x51_7CC1_B727_220A
        func hasard() -> CGFloat {
          graine = graine &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
          return CGFloat((graine >> 33) & 0xFF_FFFF) / CGFloat(0xFF_FFFF)
        }
        let fonce = melange(teinte, UIColor(red: 0.25, green: 0.15, blue: 0.08, alpha: 1), 0.55)
        let clair = melange(teinte, .white, 0.35)
        for (zone, _) in tons where avecVeinage {
          c.saveGState()
          c.clip(to: zone)
          for k in 0..<34 {
            let y0 = zone.minY + hasard() * zone.height
            let amplitude = 0.6 + hasard() * 2.4
            let periode = 50 + hasard() * 120
            let phase = hasard() * 6.28
            let sombre = hasard() < 0.7
            c.setStrokeColor((sombre ? fonce : clair).withAlphaComponent(0.08 + hasard() * 0.14).cgColor)
            c.setLineWidth(0.5 + hasard() * 1.6)
            c.beginPath()
            var x = zone.minX
            while x <= zone.maxX + 8 {
              let y = y0 + CGFloat(sin(Double(x / periode) + Double(phase) + Double(k) * 0.3)) * amplitude
              if x == zone.minX { c.move(to: CGPoint(x: x, y: y)) } else { c.addLine(to: CGPoint(x: x, y: y)) }
              x += 8
            }
            c.strokePath()
          }
          // Un nœud, une lame sur deux.
          if hasard() < 0.5 {
            let cx = zone.minX + 40 + hasard() * (zone.width - 80)
            let cy = zone.minY + zone.height * (0.3 + hasard() * 0.4)
            for anneau in 0..<4 {
              let r = CGFloat(anneau) * 2.2 + 2.5
              c.setStrokeColor(fonce.withAlphaComponent(0.22 - CGFloat(anneau) * 0.04).cgColor)
              c.setLineWidth(1)
              c.strokeEllipse(in: CGRect(x: cx - r * 2.2, y: cy - r, width: r * 4.4, height: r * 2))
            }
          }
          c.restoreGState()
        }
        c.setStrokeColor(joint.cgColor)
        c.setLineWidth(2)
        // Les rangs : en haut de la tuile (qui se répète) et entre les deux.
        c.move(to: CGPoint(x: 0, y: 1)); c.addLine(to: CGPoint(x: taille.width, y: 1))
        c.move(to: CGPoint(x: 0, y: lame)); c.addLine(to: CGPoint(x: taille.width, y: lame))
        // Les abouts : au bord pour le rang du haut, au milieu pour celui du bas.
        c.move(to: CGPoint(x: 1, y: 0)); c.addLine(to: CGPoint(x: 1, y: lame))
        c.move(to: CGPoint(x: taille.width / 2, y: lame))
        c.addLine(to: CGPoint(x: taille.width / 2, y: taille.height))
        c.strokePath()
      }
    }
    if matiere == 2 {
      let taille = CGSize(width: 256, height: 256)
      return UIGraphicsImageRenderer(size: taille, format: format).image { ctx in
        let c = ctx.cgContext
        c.setFillColor(teinte.cgColor)
        c.fill(CGRect(origin: .zero, size: taille))
        c.setStrokeColor(joint.cgColor)
        c.setLineWidth(3)
        c.move(to: CGPoint(x: 0, y: 1.5)); c.addLine(to: CGPoint(x: taille.width, y: 1.5))
        c.move(to: CGPoint(x: 1.5, y: 0)); c.addLine(to: CGPoint(x: 1.5, y: taille.height))
        c.strokePath()
      }
    }
    return nil
  }

  private func noeudsDesSols() -> [SCNNode] {
    let v = fSols
    var i = 0
    var out: [SCNNode] = []
    while i + 6 <= v.count {
      let matiere = Int(v[i])
      let sens = Int(v[i + 1])
      /*
        UN SOL DE MATIÈRE RÉELLE : le chêne clair d'un parquet renvoie six à
        sept dixièmes de la lumière, pas tout. Plafonné à sept dixièmes, il
        cesse de sortir délavé, d'un pêche d'écran.
      */
      let brute = UIColor(
        red: CGFloat(v[i + 2]), green: CGFloat(v[i + 3]), blue: CGFloat(v[i + 4]), alpha: 1)
      let teinte = choix.albedoSol.map { Self.teinteReelle(brute, plafond: $0) } ?? brute
      let n = Int(v[i + 5])
      i += 6
      // Un tableau tronqué ne doit pas faire tomber l'application.
      guard n > 0, i + n * 9 <= v.count else { break }
      let (long, large) = tuile(matiere)
      var sommets: [SCNVector3] = []
      var uv: [CGPoint] = []
      var indices: [Int32] = []
      for t in 0..<n {
        for k in 0..<3 {
          let b = i + t * 9 + k * 3
          let x = v[b], y = v[b + 1], z = v[b + 2]
          sommets.append(SCNVector3(x: x, y: y, z: z))
          // Les coordonnées de texture sont le MONDE, à l'échelle de la
          // tuile : les lames courent le long de x ou de z, jamais le long
          // de la pièce approximée.
          let leLong = CGFloat(sens == 0 ? x : z)
          let enTravers = CGFloat(sens == 0 ? z : x)
          uv.append(CGPoint(x: leLong / long, y: enTravers / large))
          indices.append(Int32(sommets.count - 1))
        }
      }
      i += n * 9
      let normales = [SCNVector3](repeating: SCNVector3(x: 0, y: 1, z: 0), count: sommets.count)
      let g = SCNGeometry(
        sources: [
          SCNGeometrySource(vertices: sommets),
          SCNGeometrySource(normals: normales),
          SCNGeometrySource(textureCoordinates: uv),
        ],
        elements: [SCNGeometryElement(indices: indices, primitiveType: .triangles)])
      let m = SCNMaterial()
      m.lightingModel = .lambert
      m.isDoubleSided = true
      m.locksAmbientWithDiffuse = true
      if let image = imageDuSol(matiere, teinte) {
        m.diffuse.contents = image
        m.diffuse.wrapS = .repeat
        m.diffuse.wrapT = .repeat
        m.diffuse.mipFilter = .linear
        m.diffuse.minificationFilter = .linear
        m.diffuse.magnificationFilter = .linear
        m.diffuse.maxAnisotropy = 8
      } else {
        m.diffuse.contents = teinte
      }
      g.materials = [m]
      out.append(SCNNode(geometry: g))
    }
    return out
  }
}

/** Le gestionnaire qui expose la vue à React Native. */
/**
 * LA RÉGIE DE LA VISITE — la caméra, posée sans passer par les propriétés.
 * Voir `RoomScanVisite.cle`.
 */
@objc(RoomScanVisiteRegie)
final class RoomScanVisiteRegie: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func camera(_ cle: String, valeurs: [NSNumber]) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserCamera(valeurs)
      } else {
        RoomScanVisite.attendre(cle, camera: valeurs)
      }
    }
  }

  @objc func orbite(_ cle: String, valeurs: [NSNumber]) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserOrbite(valeurs)
      } else {
        RoomScanVisite.attendre(cle, orbite: valeurs)
      }
    }
  }

  @objc func levee(_ cle: String, k: NSNumber, solY: NSNumber) {
    DispatchQueue.main.async {
      if let vue = RoomScanVisite.parCle(cle) {
        vue.poserLevee(k, solY: solY)
      } else {
        RoomScanVisite.attendre(cle, levee: k, solY: solY)
      }
    }
  }
}

@objc(RoomScanVisiteManager)
final class RoomScanVisiteManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }
  override func view() -> UIView! { RoomScanVisite() }
}
