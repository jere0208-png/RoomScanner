import Foundation
import ARKit
import AVFoundation
import RoomPlan
import SceneKit
import simd
import React

/// Détient la session RoomPlan. La vue (RoomScanViewManager) et le module
/// bridge (RoomScanModule) parlent tous deux à ce singleton.
@available(iOS 16.0, *)
final class RoomScanManager: NSObject, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {

  static let shared = RoomScanManager()

  private(set) var captureView: RoomCaptureView?
  private let configuration = RoomCaptureSession.Configuration()
  private var stopResolver: RCTPromiseResolveBlock?
  private var stopRejecter: RCTPromiseRejectBlock?
  private var lastLiveEmit = Date.distantPast
  /// Les cinq nombres du dernier aperçu envoyé : on ne renvoie pas le même.
  private var dernierApercu: [Int] = []
  /**
   CE QUE LE SCAN COÛTE — relevé au départ, rendu à la fin.

   Relevé du patron : « la recherche scan consomme beaucoup de batterie ».
   Sans chiffre, on ne saura jamais si l'on a gagné quelque chose : iOS donne
   le niveau à 1 % près, c'est assez pour comparer un scan à l'autre.
   */
  private var debutDuScan: Date?
  private var batterieAuDepart: Float = -1
  /// Le maillage LiDAR relevé à l'arrêt (voir `RoomScanMaillage`) — bâti
  /// sur une file de fond, sous verrou ; la livraison attend qu'il soit prêt.
  private var maillageReleve: [String: Any]?
  /// Ses sommets, dans le monde : on y lit le relief au-dessus des baies
  /// (voir `RoomScanMaillage.profilsAuDessus`).
  private var sommetsReleves: [SIMD3<Float>] = []
  private let verrouMaillage = NSLock()
  private let maillageFini = DispatchGroup()
  /**
   LE MAILLAGE D'UN AUTRE SCAN NE PART PAS AVEC CELUI-CI. Chaque arrêt a son
   numéro ; un maillage bâti pour un arrêt précédent (ou jamais bâti, sans
   session) ne se livre pas : il pointerait vers un fichier déjà effacé.
   */
  private var generationMaillage = 0
  /// La session est arrêtée par une PAUSE : « Terminer » livre ce qui est assemblé.
  private var enPause = false
  /// Le dernier passage post-traité, pour « Terminer » pendant une pause (iOS 16).
  private var dernierePiece: CapturedRoom?
  /**
   LE POST-TRAITEMENT DÉMARRE DÈS LES DONNÉES BRUTES. La vue post-traite de
   son côté avant d'appeler `didPresent` ; notre passe (`embellir`) attendait
   qu'elle ait fini pour commencer. Lancée dès `didEndWith`, elle tourne
   EN MÊME TEMPS : l'assemblage ne dure plus que la plus longue des deux.
   */
  private var embelli: Task<CapturedRoom?, Never>?
  /// La dernière consigne de RoomPlan envoyée au JS : on ne la redit pas.
  private var derniereInstruction = ""
  // startRoomScan() est appelé côté JS AVANT que la vue AR soit montée :
  // on mémorise la demande et on lance la session à la création de la vue.
  private var pendingStart = false

  /**
   LES RELEVÉS DÉJÀ FAITS, en attente de fusion.

   Un logement ne se scanne pas toujours d'un trait : on relève le séjour,
   on ferme une porte, on relève la chambre. Jusqu'ici chaque scan écrasait
   le précédent — il fallait recoller les pièces à la main, mur par mur.

   `StructureBuilder` (iOS 17) sait aligner plusieurs PIÈCES en une
   structure unique : c'est lui qui fait le travail, à condition qu'on garde
   chaque passage. On empile donc les pièces déjà construites — pas les
   données brutes, qu'il faudrait reconstruire à chaque fois.
   */
  private var releves: [CapturedRoom] = []
  /// Le prochain `stop()` s'AJOUTE au relevé au lieu de le remplacer.
  private var additif = false
  /// Les données brutes du passage en cours (remplies par `didEndWith`).
  private var dernierReleve: CapturedRoomData?

  /**
   L'ÉLEC POSÉE PENDANT LE SCAN, au viseur.

   Relevé du chantier : « pendant un scan, permet d'ajouter manuellement des
   PC, inter, point lumineux ». C'est le bon moment pour le faire — on est
   DEVANT le mur, on voit la boîte existante, on sait où passera la
   nouvelle. Chaque appui mémorise le point du monde que vise le centre de
   l'écran ; le JS en fera des appareils, rattachés à leur mur ou au
   plafond de leur pièce.
   */
  private var ancresElec: [[String: Any]] = []
  /**
   LE CHEMIN DE LA CAMÉRA, au sol, tous les quinze centimètres :
   `[x0, z0, x1, z1…]`. Ce qu'aucun de ses points ne voit sans traverser un
   mur — la pièce aperçue par la porte — ne compte pas : voir `VuDuTrajet`
   et `geometry/traversee.ts`. Un passage ajouté le prolonge ; un relevé neuf
   repart de zéro.
   */
  private var trajet: [Float] = []

  /*
    LA TORCHE S'ALLUME TOUTE SEULE QUAND IL FAIT SOMBRE — relevé du patron :
    « lorsque lors d'un scan il n'y a pas assez de lumière, active
    automatiquement le flash ». Deux signaux : RoomPlan qui le demande lui-même
    (« plus de lumière »), et la lumière qu'ARKit mesure à chaque image,
    restée trop faible une seconde et demie. Une fois. Et si on l'éteint à
    la main, elle ne se rallume plus d'elle-même de tout le scan : c'est un
    choix, pas un oubli.
  */
  private var torcheAuto = false
  private var torcheRefusee = false
  private var sombreDepuis: Date?

  /**
   LA DERNIÈRE PIÈCE VUE, telle que la session la connaît à l'instant.

   Elle sert à NOMMER le mur visé au moment de la pose. Sans cela, une ancre
   n'est qu'un point du monde ARKit — et le modèle livré, lui, passe par
   `RoomBuilder` (et par `StructureBuilder` dès qu'il y a plusieurs
   passages), qui RECALENT la géométrie dans leur propre repère. Les points
   tombaient alors à des mètres de tout mur, et le plan sortait vide de ce
   qu'on venait d'y poser.
   */
  private var vueCourante: CapturedRoom?

  /**
   LES REPÈRES PLANTÉS DANS LA PIÈCE, en réalité augmentée.

   Relevé du chantier : « tu peux afficher sur le mur du scan les ajouts ?
   Un bloc PC ou peu importe ce qu'on ajoute, qui se place sur le mur qu'on
   vise et il reste pendant le scan ».

   C'est ce qui manquait pour travailler en confiance : un compteur qui
   monte dit qu'on a appuyé, pas qu'on a visé juste. Un carré posé sur le
   mur, lui, se relit d'un coup d'œil — on voit ses trois prises alignées,
   ou celle qui a glissé sur la fenêtre.

   PREMIÈRE TENTATIVE, ET SON ÉCHEC : une `ARSCNView` transparente
   par-dessus, partageant la session. Elle a pris le rendu à RoomPlan —
   « on ne voit plus du tout ce qu'on scanne », écran noir, les repères
   flottant seuls dans le vide. Une session ARKit ne se rend qu'une fois.

   La couche a d'abord PROJETÉ des étiquettes. Elle pose maintenant les
   VRAIS MODÈLES, dans une scène SceneKit sans session, dont la caméra est
   recopiée à chaque image sur celle d'ARKit (voir `ScenePoseAR`). Rien
   n'est disputé à RoomPlan — on ne fait que lire sa session.
   */
  private var couche: ScenePoseAR?

  /**
   CE QUE LE JAVASCRIPT A CONFIÉ POUR LA POSE : les modèles des produits et
   les règles de hauteur. Gardés ici, car la vue de scan peut naître APRÈS
   l'envoi — React monte l'écran, puis envoie, sans attendre le natif.
   */
  private var modelesPose: [String: [Float]] = [:]
  private var reglages = ReglagesPose()
  private var kindChoisi: String?

  override init() { super.init() }

  // RoomCaptureViewDelegate hérite de NSCoding : implémentations requises.
  func encode(with coder: NSCoder) {}
  required init?(coder: NSCoder) { super.init() }

  // MARK: - Cycle de vie de la vue

  /**
   La vue montrée à l'écran : le scan de RoomPlan, et NOTRE couche par
   dessus. Un conteneur les tient l'une sur l'autre — la couche ne reçoit
   aucun toucher, c'est un calque, pas un bouton.
   */
  func makeContainer() -> UIView {
    /*
      LA COUCHE PRÉCÉDENTE S'EN VA D'ABORD.

      React remonte l'écran de scan à chaque passage : sans ce ménage, on
      empilait une couche et son horloge par relevé, toutes à battre sur
      des sessions mortes. « Le scan ne fonctionne plus du tout » — il
      finissait étouffé sous ses propres restes.
    */
    couche?.removeFromSuperview()
    couche = nil
    let boite = UIView(frame: .zero)
    let scan = makeCaptureView()
    scan.frame = boite.bounds
    scan.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    boite.addSubview(scan)

    let calque = ScenePoseAR(frame: .zero)
    calque.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    calque.session = scan.captureSession.arSession
    calque.manager = self
    boite.addSubview(calque)
    couche = calque
    if !modelesPose.isEmpty { calque.definirModeles(modelesPose) }
    calque.choisir(kindChoisi)
    return boite
  }

  func makeCaptureView() -> RoomCaptureView {
    let view = RoomCaptureView(frame: .zero)
    view.delegate = self
    view.captureSession.delegate = self
    captureView = view
    // Relevé des couleurs ET du cap : lecture seule sur la session ARKit
    // de RoomPlan, l'un comme l'autre.
    RoomColorSampler.shared.attach(to: view.captureSession.arSession)
    RoomScanCompass.shared.attach(to: view.captureSession.arSession)
    PhotographeDesMurs.shared.attach(to: view.captureSession.arSession)
    if pendingStart {
      pendingStart = false
      view.captureSession.run(configuration: configuration)
    }
    return view
  }

  // MARK: - Commandes du bridge

  /// `fresh` : nouveau scan (les couleurs relevées repartent de zéro).
  /// Une reprise après pause conserve ce qui a déjà été relevé.
  /// `additif` : ce passage S'AJOUTE au logement déjà relevé.
  func start(fresh: Bool = true, additif: Bool = false) {
    /*
      SUR LE FIL PRINCIPAL, TOUJOURS. Le pont appelle depuis un fil de fond ;
      ces listes sont lues et écrites par les rappels de RoomPlan, sur le fil
      principal — deux fils sur le même tableau, c'est un plantage en
      attente. On s'y rend d'abord.
    */
    guard Thread.isMainThread else {
      DispatchQueue.main.async { self.start(fresh: fresh, additif: additif) }
      return
    }
    enPause = false
    derniereInstruction = ""
    if fresh {
      RoomColorSampler.shared.reset()
      RoomScanCompass.shared.reset()
      // Un relevé tout neuf oublie les passages précédents ; un passage
      // ajouté les garde, ce sont eux qu'on va fusionner.
      if !additif {
        releves.removeAll()
        ancresElec.removeAll()
        trajet.removeAll()
        torcheAuto = false
        torcheRefusee = false
        sombreDepuis = nil
        viderReperes()
        // Les photos des murs suivent le relevé : un passage ajouté les garde.
        PhotographeDesMurs.shared.reset()
      }
    }
    if additif { self.additif = true }
    dernierApercu = []
    DispatchQueue.main.async {
      UIDevice.current.isBatteryMonitoringEnabled = true
      // Une reprise après pause ne remet pas le compteur à zéro : la mesure
      // couvre tout le relevé, pas son dernier morceau.
      if fresh || self.debutDuScan == nil {
        self.debutDuScan = Date()
        self.batterieAuDepart = UIDevice.current.batteryLevel
      }
      // Une vue d'un scan précédent peut encore traîner, détachée de l'écran :
      // ne relancer la session que sur une vue réellement affichée.
      if let view = self.captureView, view.window != nil {
        RoomColorSampler.shared.attach(to: view.captureSession.arSession)
        RoomScanCompass.shared.attach(to: view.captureSession.arSession)
        PhotographeDesMurs.shared.attach(to: view.captureSession.arSession)
        view.captureSession.run(configuration: self.configuration)
      } else {
        self.pendingStart = true
      }
    }
  }

  /**
   POSE UN APPAREIL À L'ENDROIT VISÉ — au centre de l'écran.

   Un rayon part du milieu de l'image et s'arrête sur la première surface
   qu'ARKit connaît : le mur d'en face, le plafond au-dessus. On ne retient
   que le POINT — le type, la face et la pièce sont l'affaire du JS, qui a
   le plan sous la main.

   Rend `false` quand le rayon ne rencontre rien : sans surface reconnue à
   cet endroit, poser au jugé mettrait un appareil au hasard dans le plan,
   et personne ne saurait d'où il sort.
   */
  /**
   POSE AU VISEUR — et ce qu'on rend au JS.

   Le retour était un simple oui/non. Relevé du patron : « un message doit
   apparaître sans gêner : "Prise plinthe placée à 25 cm" ». Cette phrase se
   dit AU MOMENT DE LA POSE, devant le mur — pas une heure plus tard, à la
   fin du scan, quand le modèle est enfin découpé.

   Or la hauteur relevée n'existe qu'ICI : c'est le raycast qui la donne, et
   personne d'autre ne la connaît avant la finalisation. On la rend donc
   tout de suite, avec ce qu'on a visé.

   `false` reste `false` en cas d'échec : le JS teste la vérité de la
   réponse, et un dictionnaire est vrai là où `false` ne l'est pas — rien à
   changer chez les appelants qui ne veulent que le oui/non.
   */
  func poserAuViseur(kind: String) -> Any {
    /*
      LA POSE EST LA VISÉE — celle que le fantôme montrait à l'instant.

      Le produit transparent qui flotte au viseur et celui qui se pose sont
      calculés par la même fonction (`viser`) : à l'abscisse visée, à la cote
      du métier, plaqué au mur et tourné vers la pièce. Ce qu'on voit est ce
      qu'on pose.
    */
    guard let v = viser(kind: kind) else { return false }
    var ancre: [String: Any] = [
      "kind": kind,
      "x": v.point.x,
      "y": v.point.y,
      "z": v.point.z,
    ]
    /*
      ON NOMME LE MUR VISÉ, et l'on relève la cote SUR LUI.

      Un identifiant ne se déplace pas : c'est la seule information qui
      survive au recalage du modèle. La cote se lit dans le repère du mur
      — abscisse depuis son bord, hauteur au-dessus de son pied — les
      deux mesures que l'établi et le plan emploient déjà.
    */
    if let mur = v.mur {
      ancre["wallId"] = mur.identifier.uuidString
      ancre["along"] = v.along
      ancre["height"] = v.hauteur
    }
    // Au plafond, on le DIT : le JavaScript ne le devinerait qu'à la
    // distance des murs, et un point lumineux visé près d'une cloison
    // devenait une applique.
    if v.plafond { ancre["plafond"] = true }
    ancresElec.append(ancre)
    couche?.poser(kind: kind, monde: v.monde)
    return [
      "ok": true,
      "height": v.hauteur,
      "plafond": v.plafond,
    ]
  }

  /**
   CE QUE VISE LE CENTRE DE L'ÉCRAN, pour ce produit-là.

   Un rayon part du milieu de l'image et s'arrête sur la première surface
   qu'ARKit connaît. SUR UN MUR RELEVÉ — relevé du chantier : « les éléments
   doivent pouvoir se mettre sur les murs uniquement » —, sauf pour ce qui
   va au plafond, que RoomPlan ne modélise pas : là, on reconnaît le plafond
   à sa hauteur au-dessus du sol (ou au regard levé vers lui).

   AU MUR, LA COTE DU MÉTIER : la hauteur visée choisit le palier (plinthe
   ou plan de travail), un interrupteur va à 1,10 m quoi qu'on vise. Le
   modèle se plaque au nu, tourné vers la caméra — c'est-à-dire vers la
   pièce d'où l'on vise.
   */
  /*
    LA DERNIÈRE VISÉE, GARDÉE TANT QUE L'ŒIL NE BOUGE PAS. Le viseur vise vingt
    fois par seconde, jusqu'à deux lancers de rayon chacun, sur le fil de
    l'interface — y compris quand le téléphone est posé contre le mur, le
    temps de choisir. Moins de cinq millimètres et d'un demi-degré depuis la
    dernière fois, et moins d'une demi-seconde : c'est la même visée.
  */
  private var viseeGardee: (oeil: simd_float4x4, kind: String, quand: CFTimeInterval, visee: Visee?)?

  private static func memeOeil(_ a: simd_float4x4, _ b: simd_float4x4) -> Bool {
    let d = a.columns.3 - b.columns.3
    let ecart = SIMD3<Float>(d.x, d.y, d.z)
    let va = SIMD3<Float>(a.columns.2.x, a.columns.2.y, a.columns.2.z)
    let vb = SIMD3<Float>(b.columns.2.x, b.columns.2.y, b.columns.2.z)
    return simd_length(ecart) < 0.005 && simd_dot(simd_normalize(va), simd_normalize(vb)) > 0.99996
  }

  func viser(kind: String) -> Visee? {
    guard let frame = captureView?.captureSession.arSession.currentFrame else { return nil }
    let oeil = frame.camera.transform
    let maintenant = CACurrentMediaTime()
    if let g = viseeGardee, g.kind == kind, maintenant - g.quand < 0.5, Self.memeOeil(g.oeil, oeil) {
      return g.visee
    }
    let v = viserSansMemoire(kind: kind)
    viseeGardee = (oeil, kind, maintenant, v)
    return v
  }

  private func viserSansMemoire(kind: String) -> Visee? {
    guard let session = captureView?.captureSession.arSession,
          let frame = session.currentFrame else { return nil }
    let centre = CGPoint(x: 0.5, y: 0.5)
    let cam = frame.camera.transform.columns.3
    let regard = -frame.camera.transform.columns.2
    let auPlafondPossible = reglages.plafond.contains(kind)
    let plafondSeul = reglages.plafondSeul.contains(kind)
    let cibles: [ARRaycastQuery.Target] = [.existingPlaneGeometry, .estimatedPlane]
    for cible in cibles {
      // `ARFrame.raycastQuery` rend toujours une requête (à la différence
      // de celle d'`ARView`, qui peut échouer à cadrer le point).
      let query = frame.raycastQuery(from: centre, allowing: cible, alignment: .any)
      guard let hit = session.raycast(query).first else { continue }
      let p4 = hit.worldTransform.columns.3
      let p = SIMD3<Float>(p4.x, p4.y, p4.z)
      if !plafondSeul, let mur = Self.murLePlusProche(de: p4, dans: vueCourante) {
        let inv = simd_inverse(mur.transform)
        let local = inv * SIMD4<Float>(p.x, p.y, p.z, 1)
        let basMur = mur.transform.columns.3.y - mur.dimensions.y / 2
        let vise = p.y - basMur
        let nature = reglages.auMur[kind] ?? kind
        let h = min(max(reglages.aimanter(nature, vise), 0.05), max(0.06, mur.dimensions.y - 0.05))
        var n = SIMD3<Float>(mur.transform.columns.2.x, 0, mur.transform.columns.2.z)
        n = simd_length(n) > 1e-4 ? simd_normalize(n) : SIMD3<Float>(0, 0, 1)
        if simd_dot(n, SIMD3<Float>(cam.x - p.x, 0, cam.z - p.z)) < 0 { n = -n }
        let x = SIMD3<Float>(n.z, 0, -n.x)
        // Deux millimètres devant le nu : à fleur, le modèle et le mur se
        // disputeraient la profondeur.
        let pos = SIMD3<Float>(p.x, basMur + h, p.z) + n * 0.002
        let monde = simd_float4x4(columns: (
          SIMD4<Float>(x, 0),
          SIMD4<Float>(0, 1, 0, 0),
          SIMD4<Float>(n, 0),
          SIMD4<Float>(pos, 1)
        ))
        return Visee(
          monde: monde, point: p, mur: mur,
          along: local.x + mur.dimensions.x / 2, hauteur: h, plafond: false)
      }
      guard auPlafondPossible else { continue }
      let sol = solEstime()
      let assezHaut = sol.map { p.y - $0 > 1.8 } ?? false
      let leve = regard.y > 0.35 && p.y > cam.y + 0.3
      if assezHaut || leve {
        var monde = matrix_identity_float4x4
        monde.columns.3 = SIMD4<Float>(p.x, p.y - 0.002, p.z, 1)
        return Visee(
          monde: monde, point: p, mur: nil, along: 0,
          hauteur: sol.map { p.y - $0 } ?? 0, plafond: true)
      }
    }
    return nil
  }

  /**
   LE SOL DE LA PIÈCE, dans le monde d'ARKit.

   L'origine du monde est là où le téléphone a démarré, à hauteur de main :
   le plafond n'est donc pas « au-dessus de 1,90 m » mais à 1,90 m au-dessus
   du SOL. Le pied le plus bas des murs relevés le donne.
   */
  private func solEstime() -> Float? {
    guard let murs = vueCourante?.walls, !murs.isEmpty else { return nil }
    return murs.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min()
  }

  /// Les modèles et les règles de la pose, venus du JavaScript.
  func configurerPose(_ d: [String: Any]) {
    if let m = d["modeles"] as? [String: [NSNumber]] {
      modelesPose = m.mapValues { $0.map { $0.floatValue } }
      couche?.definirModeles(modelesPose)
    }
    reglages = ReglagesPose(d)
  }

  /// Le produit choisi au rail : c'est lui qui flotte au viseur.
  func choisirAuViseur(_ kind: String?) {
    kindChoisi = kind
    couche?.choisir(kind)
  }

  /**
   LE PLUS GRAND TROU DU CONTOUR — un mur qui manque, pendant qu'on peut
   encore aller le balayer.

   Proposé comme amélioration du scan : une pièce dont un pan n'a pas été vu
   ressort OUVERTE — le plan doit la refermer à la main, en ligne droite, et
   l'on ne sait plus ce qu'il y avait là (une porte ? un retour ?). Deux bouts
   de mur LIBRES (rien à moins de trente centimètres) qui se font face à moins
   de trois mètres et demi : c'est presque toujours le mur qui manque entre
   eux. En mètres ; zéro quand tout est fermé.
   */
  /**
   Un point de plus au chemin de la caméra, s'il s'est éloigné de quinze
   centimètres du dernier. On ne garde de l'image que sa position : l'image
   elle-même n'est pas retenue (ARKit cale quand on garde ses images).
   */
  private func noterLeTrajet(_ session: RoomCaptureSession) {
    guard let c = session.arSession.currentFrame?.camera.transform.columns.3 else { return }
    let n = trajet.count
    if n >= 2 {
      let dx: Float = c.x - trajet[n - 2]
      let dz: Float = c.z - trajet[n - 1]
      if dx * dx + dz * dz < 0.0225 { return }
    }
    trajet.append(c.x)
    trajet.append(c.z)
  }

  /// Sous cent cinquante lumens (mille : une pièce bien éclairée), une
  /// seconde et demie durant, l'image se brouille : la torche s'allume.
  private func surveillerLaLumiere(_ session: RoomCaptureSession) {
    guard !torcheAuto, !torcheRefusee,
          let lumiere = session.arSession.currentFrame?.lightEstimate?.ambientIntensity else { return }
    guard lumiere < 150 else {
      sombreDepuis = nil
      return
    }
    guard let debut = sombreDepuis else {
      sombreDepuis = Date()
      return
    }
    if Date().timeIntervalSince(debut) > 1.5 { allumerLaTorche() }
  }

  private func allumerLaTorche() {
    guard !torcheAuto, !torcheRefusee else { return }
    guard let device = AVCaptureDevice.default(for: .video), device.hasTorch,
          device.torchMode != .on else { return }
    do {
      try device.lockForConfiguration()
      device.torchMode = .on
      device.unlockForConfiguration()
    } catch {
      return
    }
    torcheAuto = true
    RoomScanEvents.shared?.emit(name: "onTorche", body: ["on": true, "auto": true])
  }

  /// Le geste sur la torche : éteinte à la main, elle ne se rallume plus d'elle-même.
  func torcheManuelle(_ on: Bool) {
    DispatchQueue.main.async {
      if !on && self.torcheAuto { self.torcheRefusee = true }
      if !on { self.torcheAuto = false }
    }
  }

  static func trouDuContour(_ murs: [CapturedRoom.Surface]) -> Float {
    let segs: [(SIMD2<Float>, SIMD2<Float>)] = murs.map { m in
      let t = m.transform
      let c = SIMD2<Float>(t.columns.3.x, t.columns.3.z)
      var u = SIMD2<Float>(t.columns.0.x, t.columns.0.z)
      u = simd_length(u) > 1e-5 ? simd_normalize(u) : SIMD2<Float>(1, 0)
      let h = m.dimensions.x / 2
      return (c - u * h, c + u * h)
    }
    func distance(_ p: SIMD2<Float>, _ s: (SIMD2<Float>, SIMD2<Float>)) -> Float {
      let ab = s.1 - s.0
      let l2 = simd_dot(ab, ab)
      let t = l2 > 1e-6 ? max(0, min(1, simd_dot(p - s.0, ab) / l2)) : 0
      return simd_distance(p, s.0 + ab * t)
    }
    var libres: [SIMD2<Float>] = []
    for (i, s) in segs.enumerated() {
      for p in [s.0, s.1] {
        var touche = false
        for (j, o) in segs.enumerated() where j != i && distance(p, o) < 0.3 {
          touche = true
          break
        }
        if !touche { libres.append(p) }
      }
    }
    var pire: Float = 0
    for i in 0..<libres.count {
      for j in (i + 1)..<libres.count {
        let d = simd_distance(libres[i], libres[j])
        if d >= 0.3, d < 3.5 { pire = max(pire, d) }
      }
    }
    return pire
  }

  /**
   LE MUR LE PLUS PROCHE d'un point, dans la pièce vue à l'instant.

   On mesure à la SURFACE, pas à son centre : un mur de quatre mètres a son
   centre à deux mètres de ses bords, et le plus proche au sens du centre
   n'est pas celui qu'on regarde. Quarante centimètres de tolérance : le nu
   du mur, l'épaisseur, et la main qui ne vise pas au centimètre.
   */
  static func murLePlusProche(de p: SIMD4<Float>,
                              dans room: CapturedRoom?) -> CapturedRoom.Surface? {
    guard let room = room else { return nil }
    var meilleur: (CapturedRoom.Surface, Float)?
    for mur in room.walls {
      let inv = simd_inverse(mur.transform)
      let local = inv * SIMD4<Float>(p.x, p.y, p.z, 1)
      // Hors du pan, en longueur ou en hauteur : ce n'est pas ce mur-là.
      let demiL = mur.dimensions.x / 2
      let demiH = mur.dimensions.y / 2
      if abs(local.x) > demiL + 0.1 || abs(local.y) > demiH + 0.2 { continue }
      let ecart = abs(local.z)
      if ecart > 0.4 { continue }
      if meilleur == nil || ecart < meilleur!.1 { meilleur = (mur, ecart) }
    }
    return meilleur?.0
  }

  /// Le dernier appareil posé s'enlève : on vise mal une fois sur dix.
  func retirerDerniereAncre() -> Bool {
    guard !ancresElec.isEmpty else { return false }
    ancresElec.removeLast()
    // Le repère part avec l'ancre : deux comptes qui divergent, et l'on ne
    // sait plus lequel croire.
    couche?.retirerDernier()
    return true
  }

  /// Un relevé tout neuf repart d'une pièce vide de repères.
  private func viderReperes() { couche?.vider() }

  func pause() {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { self.pause() }
      return
    }
    enPause = true
    RoomColorSampler.shared.detach()
    PhotographeDesMurs.shared.detach()
    // La boussole aussi : en pause, ses capteurs tournaient pour rien. La
    // reprise la rattache (voir `start`).
    RoomScanCompass.shared.detach()
    DispatchQueue.main.async {
      self.couche?.suspendre(true)
      if #available(iOS 17.0, *) {
        // Garde la session ARKit chaude : la reprise relocalise
        // au lieu de repartir de zéro.
        self.captureView?.captureSession.stop(pauseARSession: false)
      } else {
        self.captureView?.captureSession.stop()
      }
    }
  }

  func resume() {
    DispatchQueue.main.async { self.couche?.suspendre(false) }
    start(fresh: false)
  }

  func stop(resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { self.stop(resolve: resolve, reject: reject) }
      return
    }
    /*
      UN SECOND « TERMINER » ATTEND LE MÊME RÉSULTAT. Il écrasait la promesse
      du premier, qui ne se réglait jamais ; les deux reçoivent maintenant
      le relevé, et l'assemblage ne repart pas une seconde fois.
    */
    if let r0 = stopResolver, let j0 = stopRejecter {
      stopResolver = { v in
        r0(v)
        resolve(v)
      }
      stopRejecter = { c, m, e in
        j0(c, m, e)
        reject(c, m, e)
      }
      return
    }
    // Sans vue de scan, rien ne s'assemblera : on le dit tout de suite.
    guard captureView != nil else {
      reject("NO_SCAN", "Aucun scan en cours", nil)
      return
    }
    stopResolver = resolve
    stopRejecter = reject
    /*
      « TERMINER » PENDANT UNE PAUSE. La pause a déjà arrêté la session et
      assemblé son passage : arrêter une session arrêtée ne rappelle
      personne, et la promesse attendait pour toujours. On livre ce qui est
      assemblé — les passages réunis, ou le dernier. Si l'assemblage de la
      pause tourne encore, c'est lui qui livrera, en trouvant la promesse.
    */
    if enPause && dernierReleve == nil && embelli == nil {
      if #available(iOS 17.0, *), !releves.isEmpty {
        lancerLeMaillage()
        let pieces = releves
        Task { [weak self] in
          var fusion: CapturedStructure? = nil
          if pieces.count > 1 { fusion = await Self.fusionner(pieces) }
          await MainActor.run {
            guard let self = self else { return }
            if let structure = fusion {
              self.livrer(
                walls: structure.walls,
                doors: structure.doors,
                windows: structure.windows,
                openings: structure.openings,
                objets: structure.objects,
                sections: Self.sectionsJSON(structure.sections),
                exporter: { url in
                  try structure.export(to: url, exportOptions: .parametric)
                },
              )
            } else if let piece = pieces.last {
              self.livrerPiece(piece)
            }
          }
        }
        return
      }
      if let piece = dernierePiece {
        lancerLeMaillage()
        livrerPiece(piece)
        return
      }
    }
    // La session se fige : continuer à lire `currentFrame` ne ferait que
    // rejouer la dernière image et fausser les moyennes.
    RoomColorSampler.shared.detach()
    PhotographeDesMurs.shared.detach()
    // Déclenche le post-traitement RoomPlan ; le résultat final
    // arrive dans captureView(didPresent:error:).
    DispatchQueue.main.async {
      // La couche des poses se fige avec le scan : l'assemblage a besoin
      // de la carte graphique.
      self.couche?.suspendre(true)
      // Le maillage se lit AVANT l'arrêt : une session arrêtée n'a plus
      // d'image courante, donc plus d'ancres.
      self.lancerLeMaillage()
      self.captureView?.captureSession.stop()
    }
  }

  /**
   Le maillage LiDAR de CET arrêt, bâti sur une file de fond. Son numéro
   empêche un maillage d'un arrêt précédent d'être livré à sa place.
   */
  private func lancerLeMaillage() {
    generationMaillage &+= 1
    let generation: Int = generationMaillage
    verrouMaillage.lock()
    maillageReleve = nil
    sommetsReleves = []
    verrouMaillage.unlock()
    guard let session = captureView?.captureSession.arSession else { return }
    let ancres = RoomScanMaillage.ancresDe(session)
    maillageFini.enter()
    DispatchQueue.global(qos: .userInitiated).async {
      let maillage = RoomScanMaillage.construire(ancres)
      let sommets = RoomScanMaillage.sommetsDuMonde(ancres)
      self.verrouMaillage.lock()
      if generation == self.generationMaillage {
        self.maillageReleve = maillage
        self.sommetsReleves = sommets
      }
      self.verrouMaillage.unlock()
      self.maillageFini.leave()
    }
  }

  private func clearPromise() { stopResolver = nil; stopRejecter = nil }

  /// Durée, batterie consommée (en points de pour cent) et chaleur.
  private func energieDuScan() -> [String: Any] {
    var out: [String: Any] = [
      "secondes": debutDuScan.map { Date().timeIntervalSince($0) } ?? 0,
    ]
    let fin = UIDevice.current.batteryLevel
    // Simulateur, ou niveau inconnu : −1. On ne l'invente pas.
    if batterieAuDepart >= 0, fin >= 0 {
      out["batterie"] = max(0, Double(batterieAuDepart - fin) * 100)
    }
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: out["thermique"] = "frais"
    case .fair: out["thermique"] = "tiède"
    case .serious: out["thermique"] = "chaud"
    case .critical: out["thermique"] = "brûlant"
    @unknown default: break
    }
    return out
  }

  // MARK: - RoomCaptureViewDelegate (résultat final)

  // true = laisser RoomPlan post-traiter les données brutes.
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData,
                   error: Error?) -> Bool {
    return true
  }

  // Le modèle final, nettoyé et paramétrique.
  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    /*
      UNE PAUSE N'ASSEMBLE QUE POUR LA SUITE. Elle arrête la session, et
      RoomPlan rappelle ici comme pour « Terminer » : on écrivait alors le
      modèle, les photos, les orthophotos — des secondes de calcul et des
      fichiers orphelins, pour une promesse que personne n'attendait. Le
      passage est gardé (la fusion en a besoin) ; la livraison attend
      qu'on la demande.
    */
    let attendu: Bool = stopResolver != nil
    let tache = embelli
    embelli = nil
    if let error = error {
      /*
        LA VUE A ÉCHOUÉ, MAIS LES DONNÉES BRUTES SONT LÀ : notre propre
        passe peut encore en tirer le relevé. On ne perd un scan entier
        qu'en dernier recours.
      */
      if let brut = dernierReleve {
        Task { [weak self] in
          var piece: CapturedRoom? = await tache?.value ?? nil
          if piece == nil { piece = await Self.embellir(brut) }
          await MainActor.run {
            guard let self = self else { return }
            self.dernierReleve = nil
            if let piece = piece {
              self.releves.append(piece)
              self.dernierePiece = piece
              if self.stopResolver != nil { self.livrerPiece(piece) }
            } else {
              RoomScanCompass.shared.detach()
              self.stopRejecter?("SCAN_PROCESSING_FAILED", error.localizedDescription, error)
              self.clearPromise()
            }
          }
        }
        return
      }
      RoomScanCompass.shared.detach()
      stopRejecter?("SCAN_PROCESSING_FAILED", error.localizedDescription, error)
      clearPromise()
      return
    }
    dernierePiece = processedResult

    /*
     NOTRE PROPRE POST-TRAITEMENT, quand on peut faire mieux que la vue.

     `RoomCaptureView` post-traite avec les options par défaut. Deux
     réglages nous manquent :

     - `.beautifyObjects` redresse les meubles détectés — leurs cotes
       cessent d'être « à peu près » ;
     - et surtout, dès qu'il y a PLUSIEURS passages, `StructureBuilder`
       (iOS 17) les aligne en une structure unique. C'est la réponse au
       logement qu'on relève pièce par pièce : jusqu'ici chaque scan
       écrasait le précédent.

     Tout cela est asynchrone. Si quoi que ce soit échoue, on retombe sur
     le résultat de la vue, qui est déjà bon : un dossier livré vaut mieux
     qu'un dossier parfait qui n'arrive pas.
     */
    if #available(iOS 17.0, *), let brut = dernierReleve {
      let anciens = releves
      Task { [weak self] in
        guard let self = self else { return }
        // Le passage qui vient de finir, post-traité par nos soins — souvent
        // déjà prêt, lancé dès les données brutes (voir `embelli`).
        var propre: CapturedRoom? = await tache?.value ?? nil
        if propre == nil { propre = await Self.embellir(brut) }
        let piece: CapturedRoom = propre ?? processedResult
        // Plusieurs passages : on les aligne en une structure unique.
        let fusion =
          anciens.isEmpty ? nil : await Self.fusionner(anciens + [piece])
        await MainActor.run {
          self.releves = anciens + [piece]
          self.dernierReleve = nil
          self.dernierePiece = piece
          self.additif = false
          // Personne n'attend ce passage (une pause) : il est gardé, pas livré.
          // « Terminer » arrivé entre-temps a posé sa promesse : on livre.
          guard attendu || self.stopResolver != nil else { return }
          if let structure = fusion {
            self.livrer(
              walls: structure.walls,
              doors: structure.doors,
              windows: structure.windows,
              openings: structure.openings,
              objets: structure.objects,
              sections: Self.sectionsJSON(structure.sections),
              exporter: { url in
                try structure.export(to: url, exportOptions: .parametric)
              },
            )
          } else {
            self.livrerPiece(piece)
          }
        }
      }
      return
    }
    // iOS 16 : les données brutes ne servent plus ; la passe anticipée non plus.
    dernierReleve = nil
    tache?.cancel()
    guard attendu else { return }
    livrerPiece(processedResult)
  }

  /// Une pièce seule : mêmes listes, l'export du modèle en plus.
  private func livrerPiece(_ room: CapturedRoom) {
    livrer(
      walls: room.walls,
      doors: room.doors,
      windows: room.windows,
      openings: room.openings,
      objets: room.objects,
      sections: Self.sectionsDe(room),
      sols: Self.solsDe(room),
      exporter: { url in try room.export(to: url, exportOptions: .parametric) },
    )
  }

  /**
   LES SOLS QUE ROOMPLAN A MESURÉS (iOS 17) — le polygone exact de chaque sol,
   dans le monde. Le JavaScript reconstruit le contour des pièces à partir des
   murs ; quand une boucle ne se referme pas, la surface n'est qu'approchée.
   Le sol relevé, lui, a sa vraie forme : c'est la surface qu'on annoncera.
   */
  static func solsDe(_ room: CapturedRoom) -> [[String: Any]] {
    guard #available(iOS 17.0, *) else { return [] }
    return room.floors.compactMap { sol -> [String: Any]? in
      let coins = sol.polygonCorners
      guard coins.count >= 3 else { return nil }
      let t = sol.transform
      var plat: [Float] = []
      var y: Float = 0
      for c in coins {
        let w = t * SIMD4<Float>(c.x, c.y, c.z, 1)
        plat.append(w.x)
        plat.append(w.z)
        y += w.y
      }
      return [
        "id": sol.identifier.uuidString,
        "coins": plat,
        "y": y / Float(coins.count),
      ]
    }
  }

  /// Les sections d'une pièce (iOS 17) : son type, et un point dedans.
  static func sectionsDe(_ room: CapturedRoom) -> [[String: Any]] {
    guard #available(iOS 17.0, *) else { return [] }
    return sectionsJSON(room.sections)
  }

  @available(iOS 17.0, *)
  static func sectionsJSON(_ sections: [CapturedRoom.Section]) -> [[String: Any]] {
    sections.map { s in
      [
        "label": String(describing: s.label),
        "x": s.center.x,
        "y": s.center.y,
        "z": s.center.z,
      ]
    }
  }

  /**
   ASSEMBLE LES PASSAGES en un seul modèle.

   Un seul relevé : `RoomBuilder` avec l'embellissement des objets. Plusieurs :
   `StructureBuilder`, qui les aligne — c'est lui qui recolle les pièces.
   `nil` si l'assemblage échoue : l'appelant garde alors le résultat de la
   vue, qui n'a rien perdu.
   */
  @available(iOS 17.0, *)
  static func fusionner(_ pieces: [CapturedRoom]) async -> CapturedStructure? {
    do {
      let batisseur = StructureBuilder(options: [.beautifyObjects])
      return try await batisseur.capturedStructure(from: pieces)
    } catch {
      return nil
    }
  }

  /**
   UN SEUL PASSAGE, mais mieux post-traité que par la vue.

   `.beautifyObjects` redresse les meubles détectés : leurs cotes cessent
   d'être « à peu près ». `nil` en cas d'échec — la vue a déjà produit un
   résultat correct, et un dossier livré vaut mieux qu'un dossier parfait
   qui n'arrive pas.
   */
  @available(iOS 16.0, *)
  static func embellir(_ brut: CapturedRoomData) async -> CapturedRoom? {
    do {
      return try await RoomBuilder(options: [.beautifyObjects])
        .capturedRoom(from: brut)
    } catch {
      return nil
    }
  }

  /**
   Écrit le modèle, sérialise, et résout la promesse du `stop()`.

   Elle prend des LISTES plutôt qu'un `CapturedRoom` : un relevé fusionné
   est une `CapturedStructure`, qui n'est pas convertible en pièce. Les
   deux portent les mêmes types de surfaces et d'objets — c'est tout ce
   dont la sérialisation a besoin —, et chacune sait s'exporter, d'où la
   fermeture.
   */
  private func livrer(
    walls: [CapturedRoom.Surface],
    doors: [CapturedRoom.Surface],
    windows: [CapturedRoom.Surface],
    openings: [CapturedRoom.Surface],
    objets: [CapturedRoom.Object],
    sections: [[String: Any]] = [],
    sols: [[String: Any]] = [],
    exporter: @escaping (URL) throws -> Void,
  ) {
    /*
      CE QUI LIT LE RELEVÉ RESTE ICI, SUR LE FIL PRINCIPAL — c'est instantané.
      CE QUI ÉCRIT SUR LE DISQUE PART SUR UNE FILE DE FOND : l'export du
      modèle, sa teinte (relu puis réécrit), les photos des murs, l'attente du
      maillage. Fait ici, tout cela figeait l'écran d'assemblage — la roue
      cessait de tourner au moment exact où l'on attend. La promesse se
      résout de la file de fond : React Native le permet.
    */
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let usdzURL = docs.appendingPathComponent("scan-\(UUID().uuidString).usdz")
    /*
      LES SURFACES ET LES MEUBLES SE SÉRIALISENT SUR LA FILE DE FOND, eux
      aussi : chacun interroge le releveur de couleurs (une attente sur sa
      file par surface), et cela figeait l'écran d'assemblage au moment même
      où l'on regarde la roue tourner. Ici ne restent que les lectures
      instantanées.
    */
    var payload: [String: Any] = [
        "modelPath": usdzURL.path,
        // Ce qu'on a posé au viseur pendant le relevé : des points du
        // monde, que le JS rattachera aux murs et aux plafonds.
        "elec": ancresElec,
        // Le chemin de la caméra : ce qu'on n'a vu que par une porte sera
        // écarté (voir `geometry/traversee.ts`).
        "trajet": trajet,
        // Combien de passages composent ce relevé : le JS s'en sert pour
        // dire « deux pièces réunies » plutôt que de laisser deviner.
        "passages": releves.count,
        /*
          CE QUE ROOMPLAN DIT DE CHAQUE PIÈCE (iOS 17) — cuisine, salle de
          bains, chambre, séjour, salle à manger —, avec un point dedans. Le
          JS ne nommait les pièces que d'après leurs meubles.
        */
        "sections": sections,
        // Le polygone exact de chaque sol (iOS 17), quand RoomPlan l'a mesuré.
        "sols": sols,
      ]
    // Cap du monde ARKit : absent si le magnétomètre n'a rien donné de
    // sûr — mieux vaut pas de rose des vents qu'une fausse.
    if let north = RoomScanCompass.shared.northOffset {
      payload["north"] = north
    }
    payload["energie"] = energieDuScan()
    RoomColorSampler.shared.detach()
    RoomScanCompass.shared.detach()
    let resolve = stopResolver
    clearPromise()
    let pret = payload
    let generation: Int = generationMaillage
    // Les baies, pour lire leur coffre dans le maillage (voir plus bas).
    let baies: [RoomScanMaillage.Baie] = (windows + doors + openings).map {
      RoomScanMaillage.Baie(
        id: $0.identifier.uuidString, transform: $0.transform,
        largeur: $0.dimensions.x, hauteur: $0.dimensions.y)
    }
    let chemin: [Float] = trajet
    DispatchQueue.global(qos: .userInitiated).async {
      var sortie = pret
      sortie["surfaces"] = Self.surfacesJSON(
        walls: walls, doors: doors, windows: windows, openings: openings,
        withColors: true,
      )
      sortie["objects"] = Self.objectsJSON(objets, withColors: true)
      if let floor = RoomColorSampler.shared.floorPayload() {
        sortie["floor"] = floor
      }
      /*
        LE MODÈLE 3D EST UN PLUS, PAS LE RELEVÉ. Un export qui échoue
        jetait tout — murs, meubles, appareillage posé, photos, maillage —
        alors que le relevé était complet. Il part maintenant sans modèle.
      */
      do {
        // .parametric = murs/portes propres (pas le maillage brut).
        try exporter(usdzURL)
        // L'USDZ RoomPlan est blanc uniforme : invisible sur le fond blanc
        // de Quick Look. On le teinte, avec les couleurs relevées si on en a.
        Self.tintModel(at: usdzURL)
      } catch {
        sortie["modelPath"] = ""
      }
      // Chaque mur, photographié de face et redressé (voir `PhotographeDesMurs`).
      sortie["photosMurs"] = PhotographeDesMurs.shared.livrer()
      PhotographeDesMurs.shared.detach()
      // Le maillage se bâtit pendant l'assemblage de RoomPlan, qui dure
      // plusieurs secondes : il est presque toujours prêt. Au pire, on
      // l'attend trois secondes — sans lui, le plan reste entier.
      _ = self.maillageFini.wait(timeout: .now() + 3)
      self.verrouMaillage.lock()
      let maillage = generation == self.generationMaillage ? self.maillageReleve : nil
      let sommets = generation == self.generationMaillage ? self.sommetsReleves : []
      self.sommetsReleves = []
      self.verrouMaillage.unlock()
      if let maillage = maillage {
        sortie["maillage"] = maillage
      }
      /*
        LE COFFRE DE VOLET ROULANT, que RoomPlan lisse dans le plan du mur :
        le relief du maillage au-dessus de chaque baie, que le JS lira.
      */
      let dessus = RoomScanMaillage.profilsAuDessus(sommets: sommets, baies: baies, trajet: chemin)
      if !dessus.isEmpty {
        sortie["dessus"] = dessus
      }
      /*
        L'ENCADREMENT RÉEL DES BAIES : où le mur plein reprend, de chaque côté
        et sous l'appui (voir `profilsDesTableaux`).
      */
      let tableaux = RoomScanMaillage.profilsDesTableaux(sommets: sommets, baies: baies, trajet: chemin)
      if !tableaux.isEmpty {
        sortie["tableaux"] = tableaux
      }
      resolve?(sortie)
    }
  }

  // MARK: - RoomCaptureSessionDelegate (temps réel)

  func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
    // Le releveur de couleurs a besoin de la géométrie la plus fraîche
    // possible : on la lui passe à chaque mise à jour, sans throttle.
    RoomColorSampler.shared.update(room: room)
    PhotographeDesMurs.shared.update(room: room)
    // C'est elle qui nommera le mur visé à la prochaine pose.
    vueCourante = room
    noterLeTrajet(session)
    surveillerLaLumiere(session)
    /*
      CINQ NOMBRES, DEUX FOIS PAR SECONDE AU PLUS, ET SEULEMENT S'ILS CHANGENT.

      Les surfaces entières — identifiant, dimensions, confiance, matrice de
      seize nombres chacune — traversaient le pont deux fois par seconde,
      pour que le JavaScript en tire UN compte : les murs que RoomPlan voit
      mal. Le compte se fait ici. Et un aperçu identique au précédent ne part
      pas : réveiller le JavaScript pour lui redire la même chose, c'est de
      la batterie pour rien.
    */
    guard Date().timeIntervalSince(lastLiveEmit) > 0.5 else { return }
    // Le calcul qui suit ne se refait qu'une fois par demi-seconde, même
    // quand l'aperçu ne change pas (il se refaisait à chaque rappel).
    lastLiveEmit = Date()
    /*
      CE QU'ON VOIT PAR LA PORTE NE COMPTE PAS : le mur du fond de la chambre
      aperçue ne fait pas « +1 », et ses bouts libres ne font pas croire
      qu'un mur manque. Il faut entrer (voir `VuDuTrajet`).
    */
    let vus = VuDuTrajet.filtrer(room, chemin: trajet)
    // « medium » compte autant que « low » : un mur moyen est un mur qu'on
    // ferait mieux de repasser, et c'est gratuit tant qu'on est devant.
    let doutes = vus.murs.filter { s in
      if case .high = s.confidence { return false }
      return true
    }
    let douteux = doutes.count
    /*
      LEQUEL — relevé du patron : « il est dit qu'un mur a été mal détecté,
      mais on n'informe pas lequel ». Le plus proche des murs douteux, vu du
      téléphone : son côté, sa distance, sa longueur.
    */
    let lequel: [String: Any]? = session.arSession.currentFrame.flatMap {
      Self.murDouteuxLePlusProche(doutes, camera: $0.camera.transform)
    }
    // Le plus grand trou du contour, au centimètre (voir `trouDuContour`).
    let trou = Self.trouDuContour(vus.murs)
    let apercu = [
      vus.murs.count, vus.objets, vus.portes, vus.fenetres, douteux,
      Int((trou * 100).rounded()),
      // Le mur nommé change de côté, ou d'un demi-mètre : on le redit.
      (lequel?["code"] as? Int) ?? -1,
      Int((((lequel?["distance"] as? Float) ?? 0) * 2).rounded()),
    ]
    guard apercu != dernierApercu else { return }
    dernierApercu = apercu
    var corps: [String: Any] = [
      "wallCount": vus.murs.count,
      "objectCount": vus.objets,
      "doorCount": vus.portes,
      "windowCount": vus.fenetres,
      "mursDouteux": douteux,
      "trouContour": trou,
    ]
    if let l = lequel { corps["murDouteux"] = l.filter { $0.key != "code" } }
    RoomScanEvents.shared?.emit(name: "onScanUpdate", body: corps)
  }

  /**
   OÙ EST LE MUR DOUTEUX LE PLUS PROCHE, VU DU TÉLÉPHONE — devant, derrière,
   à gauche ou à droite (le cap de la caméra, à plat), sa distance au point
   le plus proche du mur, sa longueur. `code` ne sert qu'à savoir s'il a
   changé.
   */
  static func murDouteuxLePlusProche(
    _ murs: [CapturedRoom.Surface], camera: simd_float4x4
  ) -> [String: Any]? {
    let oeil = SIMD2<Float>(camera.columns.3.x, camera.columns.3.z)
    var avant = SIMD2<Float>(-camera.columns.2.x, -camera.columns.2.z)
    var droite = SIMD2<Float>(camera.columns.0.x, camera.columns.0.z)
    guard simd_length(avant) > 1e-4, simd_length(droite) > 1e-4 else { return nil }
    avant = simd_normalize(avant)
    droite = simd_normalize(droite)
    var mieux: (d: Float, p: SIMD2<Float>, l: Float)? = nil
    for m in murs {
      let t = m.transform
      let c = SIMD2<Float>(t.columns.3.x, t.columns.3.z)
      var u = SIMD2<Float>(t.columns.0.x, t.columns.0.z)
      guard simd_length(u) > 1e-4 else { continue }
      u = simd_normalize(u)
      let demi = m.dimensions.x / 2
      let s = max(-demi, min(demi, simd_dot(oeil - c, u)))
      let p = c + u * s
      let d = simd_length(p - oeil)
      if mieux == nil || d < mieux!.d { mieux = (d: d, p: p, l: m.dimensions.x) }
    }
    guard let m = mieux else { return nil }
    let vers = m.p - oeil
    let l = simd_length(vers)
    let dir = l > 1e-4 ? vers / l : avant
    let f = simd_dot(dir, avant)
    let r = simd_dot(dir, droite)
    let cote: String
    let code: Int
    if f > 0.7 { cote = "devant"; code = 0 }
    else if f < -0.7 { cote = "derriere"; code = 1 }
    else if r > 0 { cote = "droite"; code = 2 }
    else { cote = "gauche"; code = 3 }
    return ["cote": cote, "distance": m.d, "longueur": m.l, "code": code]
  }

  func captureSession(_ session: RoomCaptureSession,
                      didProvide instruction: RoomCaptureSession.Instruction) {
    // La même consigne, redite à chaque image, réveillait le JS pour rien.
    let texte: String = String(describing: instruction)
    // RoomPlan réclame de la lumière : on la lui donne.
    if case .turnOnLight = instruction { allumerLaTorche() }
    guard texte != derniereInstruction else { return }
    derniereInstruction = texte
    RoomScanEvents.shared?.emit(name: "onInstruction", body: ["instruction": texte])
  }

  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData,
                      error: Error?) {
    if let error = error {
      RoomScanEvents.shared?.emit(name: "onScanError",
                                  body: ["message": error.localizedDescription])
      return
    }
    // Les données BRUTES de ce passage : c'est d'elles que `RoomBuilder` et
    // `StructureBuilder` partent. La vue, elle, produira son propre résultat
    // post-traité — on ne s'en sert que comme filet de sécurité.
    dernierReleve = data
    // Notre passe démarre tout de suite, en même temps que celle de la vue
    // (iOS 17 : c'est là qu'elle sert, voir `didPresent`).
    if #available(iOS 17.0, *) {
      embelli = Task { await Self.embellir(data) }
    }
  }

  // MARK: - Sérialisation JSON

  /// `withColors` : seul le résultat final porte les couleurs relevées —
  /// les inclure dans le flux temps réel coûterait cher pour rien.
  static func surfacesJSON(
    walls: [CapturedRoom.Surface],
    doors: [CapturedRoom.Surface],
    windows: [CapturedRoom.Surface],
    openings: [CapturedRoom.Surface],
    withColors: Bool = false,
  ) -> [[String: Any]] {
    func encode(_ s: CapturedRoom.Surface, type: String) -> [String: Any] {
      var out: [String: Any] = [
        "id": s.identifier.uuidString,
        "type": type,
        // Pour une surface : x = longueur, y = hauteur (mètres).
        "length": s.dimensions.x,
        "height": s.dimensions.y,
        "confidence": String(describing: s.confidence),
        // `door(isOpen: true)` : c'est ce qui distingue une porte ouverte.
        "category": String(describing: s.category),
        "transform": matrixToArray(s.transform),
      ]
      if withColors {
        out.merge(RoomColorSampler.shared.payload(for: s)) { a, _ in a }
      }
      return out
    }
    return walls.map { encode($0, type: "wall") }
         + doors.map { encode($0, type: "door") }
         + windows.map { encode($0, type: "window") }
         + openings.map { encode($0, type: "opening") }
  }

  /// Raccourci pour une pièce entière — le flux temps réel s'en sert.
  static func surfacesJSON(_ room: CapturedRoom,
                           withColors: Bool = false) -> [[String: Any]] {
    surfacesJSON(
      walls: room.walls, doors: room.doors, windows: room.windows,
      openings: room.openings, withColors: withColors,
    )
  }

  static func objectsJSON(_ objets: [CapturedRoom.Object],
                          withColors: Bool = false) -> [[String: Any]] {
    objets.map { obj in
      var out: [String: Any] = [
        "id": obj.identifier.uuidString,
        "category": String(describing: obj.category),
        "width": obj.dimensions.x,
        "height": obj.dimensions.y,
        "depth": obj.dimensions.z,
        "confidence": String(describing: obj.confidence),
        "transform": matrixToArray(obj.transform),
      ]
      if withColors, let color = RoomColorSampler.shared.color(for: obj) {
        out["color"] = color
      }
      // Le dessus et les côtés, chacun sa couleur (voir `sampleObject`).
      if withColors {
        let couleurs = RoomColorSampler.shared.couleurs(for: obj)
        if !couleurs.isEmpty { out["couleurs"] = couleurs }
      }
      /*
        CE QUE ROOMPLAN PRÉCISE DU MEUBLE — canapé d'angle, table ronde,
        tabouret, étagère ouverte. Le type et la valeur, en clair :
        « SofaType:lShaped ». C'est ce qui donne au modèle 3D sa forme.
      */
      if #available(iOS 17.0, *) {
        let precisions = obj.attributes.map { a in
          "\(String(describing: type(of: a))):\(String(describing: a))"
        }
        if !precisions.isEmpty { out["attributes"] = precisions }
      }
      return out
    }
  }

  /// Recolore l'USDZ exporté : sans teinte, tout est blanc sur fond blanc
  /// dans Quick Look. Les couleurs relevées pendant le scan sont employées
  /// quand elles existent. Non fatal : en cas d'échec, le modèle reste blanc.
  static func tintModel(at url: URL) {
    do {
      let scene = try SCNScene(url: url, options: nil)
      /*
        LES MOYENNES SONT EN LUMIÈRE LINÉAIRE, de 0 à 1 (voir
        `RoomColorSampler`) : les diviser par 255 rendait des murs et un sol
        presque noirs dans le modèle exporté. On les ramène en sRGB.
      */
      let sampled = { (c: SIMD3<Float>) -> UIColor in
        func srgb(_ v: Float) -> CGFloat {
          let e = max(0, min(1, v))
          return CGFloat(e <= 0.0031308 ? 12.92 * e : 1.055 * pow(e, 1 / 2.4) - 0.055)
        }
        return UIColor(red: srgb(c.x), green: srgb(c.y), blue: srgb(c.z), alpha: 1)
      }
      let wallColor = RoomColorSampler.shared.averageWallColor().map(sampled)
        ?? UIColor(red: 0.86, green: 0.88, blue: 0.92, alpha: 1)
      let objectColor = UIColor(red: 0.62, green: 0.68, blue: 0.78, alpha: 1)
      let floorColor = RoomColorSampler.shared.averageFloorColor().map(sampled)
        ?? UIColor(red: 0.78, green: 0.80, blue: 0.84, alpha: 1)
      scene.rootNode.enumerateHierarchy { node, _ in
        guard let geometry = node.geometry else { return }
        let name = (node.name ?? "").lowercased()
        let isStructure = name.contains("wall") || name.contains("door")
          || name.contains("window") || name.contains("opening")
        let isFloor = name.contains("floor")
        for material in geometry.materials {
          material.diffuse.contents =
            isFloor ? floorColor : (isStructure ? wallColor : objectColor)
          material.roughness.contents = 0.7
        }
      }
      try scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)
    } catch {
      // Modèle laissé tel quel.
    }
  }

  /// 16 floats, colonne-major (même convention que simd/SceneKit).
  static func matrixToArray(_ m: simd_float4x4) -> [Float] {
    [m.columns.0, m.columns.1, m.columns.2, m.columns.3]
      .flatMap { [$0.x, $0.y, $0.z, $0.w] }
  }
}
