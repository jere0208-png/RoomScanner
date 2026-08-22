import Foundation
import ARKit
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

   La couche ne dessine donc plus en 3D : elle PROJETTE. À chaque image,
   chaque repère est ramené du monde vers l'écran par la caméra elle-même
   (`ARCamera.projectPoint`), et une étiquette se pose à cet endroit. Rien
   n'est disputé à RoomPlan — on ne fait que lire sa session.
   */
  private var couche: RepereLayerView?

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

    let calque = RepereLayerView(frame: .zero)
    calque.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    calque.session = scan.captureSession.arSession
    calque.backgroundColor = .clear
    calque.isUserInteractionEnabled = false
    boite.addSubview(calque)
    couche = calque
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
    if fresh {
      RoomColorSampler.shared.reset()
      RoomScanCompass.shared.reset()
      // Un relevé tout neuf oublie les passages précédents ; un passage
      // ajouté les garde, ce sont eux qu'on va fusionner.
      if !additif {
        releves.removeAll()
        ancresElec.removeAll()
        viderReperes()
      }
    }
    if additif { self.additif = true }
    DispatchQueue.main.async {
      // Une vue d'un scan précédent peut encore traîner, détachée de l'écran :
      // ne relancer la session que sur une vue réellement affichée.
      if let view = self.captureView, view.window != nil {
        RoomColorSampler.shared.attach(to: view.captureSession.arSession)
        RoomScanCompass.shared.attach(to: view.captureSession.arSession)
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
    guard let session = captureView?.captureSession.arSession,
          let frame = session.currentFrame else { return false }
    // Le centre de l'image, en coordonnées normalisées : c'est là qu'est le
    // viseur, et c'est ce que l'œil aligne sur la boîte.
    let centre = CGPoint(x: 0.5, y: 0.5)
    let cibles: [ARRaycastQuery.Target] = [.existingPlaneGeometry, .estimatedPlane]
    for cible in cibles {
      // `ARFrame.raycastQuery` rend toujours une requête (à la différence
      // de celle d'`ARView`, qui peut échouer à cadrer le point).
      let query = frame.raycastQuery(
        from: centre, allowing: cible, alignment: .any,
      )
      guard let hit = session.raycast(query).first else { continue }
      let p = hit.worldTransform.columns.3
      /*
        SUR UN MUR, ET NULLE PART AILLEURS — relevé du chantier : « les
        éléments doivent pouvoir se mettre sur les murs uniquement ».

        Le rayon s'arrête sur la première surface qu'ARKit connaît : le
        sol, une table, un plan estimé en l'air. On en tirait des appareils
        posés dans le vide, que le plan jetait ensuite sans rien dire. On
        exige donc un mur RELEVÉ, sauf pour l'éclairage, qui a le droit
        d'être au plafond — là où RoomPlan ne modélise aucune surface.
      */
      let mur = Self.murLePlusProche(de: p, dans: vueCourante)
      let auPlafond = ["dcl", "spot"].contains(kind) && p.y > 1.9
      if mur == nil && !auPlafond { continue }
      var ancre: [String: Any] = [
        "kind": kind,
        "x": p.x,
        "y": p.y,
        "z": p.z,
      ]
      /*
        ON NOMME LE MUR VISÉ, et l'on relève la cote SUR LUI.

        Un identifiant ne se déplace pas : c'est la seule information qui
        survive au recalage du modèle. La cote se lit dans le repère du mur
        — abscisse depuis son bord, hauteur au-dessus de son pied — les
        deux mesures que l'établi et le plan emploient déjà.
      */
      if let mur = mur {
        let inv = simd_inverse(mur.transform)
        let local = inv * SIMD4<Float>(p.x, p.y, p.z, 1)
        let basMur = mur.transform.columns.3.y - mur.dimensions.y / 2
        ancre["wallId"] = mur.identifier.uuidString
        ancre["along"] = local.x + mur.dimensions.x / 2
        ancre["height"] = p.y - basMur
      }
      ancresElec.append(ancre)
      // Et le repère se plante dans la pièce, à l'aplomb de ce qu'on vise.
      planterRepere(kind: kind, sur: hit.worldTransform)
      return [
        "ok": true,
        // La cote au-dessus du PIED DU MUR quand on en a un ; sinon la
        // hauteur dans le monde, qui vaut celle du sol du scan.
        "height": (ancre["height"] as? Float) ?? p.y,
        "plafond": mur == nil && auPlafond,
      ]
    }
    return false
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

  /**
   PLANTE UN REPÈRE SUR LE MUR VISÉ.

   Un carré plat, plaqué à la surface, de la couleur du métier : ambre pour
   les prises, bleu pour les commandes, doré pour l'éclairage. Il porte son
   sigle — c'est ce qu'on relit de loin, exactement comme sur le plan.

   Deux centimètres devant le nu : à fleur, le rendu clignote (les deux
   surfaces se disputent la profondeur), et le repère semble grésiller.
   */
  private func planterRepere(kind: String, sur transform: simd_float4x4) {
    let p = transform.columns.3
    couche?.ajouter(kind: kind, at: SIMD3<Float>(p.x, p.y, p.z))
  }

  /// Un relevé tout neuf repart d'une pièce vide de repères.
  private func viderReperes() { couche?.vider() }

  func pause() {
    RoomColorSampler.shared.detach()
    DispatchQueue.main.async {
      if #available(iOS 17.0, *) {
        // Garde la session ARKit chaude : la reprise relocalise
        // au lieu de repartir de zéro.
        self.captureView?.captureSession.stop(pauseARSession: false)
      } else {
        self.captureView?.captureSession.stop()
      }
    }
  }

  func resume() { start(fresh: false) }

  func stop(resolve: @escaping RCTPromiseResolveBlock,
            reject: @escaping RCTPromiseRejectBlock) {
    stopResolver = resolve
    stopRejecter = reject
    // La session se fige : continuer à lire `currentFrame` ne ferait que
    // rejouer la dernière image et fausser les moyennes.
    RoomColorSampler.shared.detach()
    // Déclenche le post-traitement RoomPlan ; le résultat final
    // arrive dans captureView(didPresent:error:).
    DispatchQueue.main.async {
      self.captureView?.captureSession.stop()
    }
  }

  private func clearPromise() { stopResolver = nil; stopRejecter = nil }

  // MARK: - RoomCaptureViewDelegate (résultat final)

  // true = laisser RoomPlan post-traiter les données brutes.
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData,
                   error: Error?) -> Bool {
    return true
  }

  // Le modèle final, nettoyé et paramétrique.
  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    if let error = error {
      stopRejecter?("SCAN_PROCESSING_FAILED", error.localizedDescription, error)
      clearPromise()
      return
    }

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
        // Le passage qui vient de finir, post-traité par nos soins.
        let piece = await Self.embellir(brut) ?? processedResult
        // Plusieurs passages : on les aligne en une structure unique.
        let fusion =
          anciens.isEmpty ? nil : await Self.fusionner(anciens + [piece])
        await MainActor.run {
          self.releves = anciens + [piece]
          self.dernierReleve = nil
          self.additif = false
          if let structure = fusion {
            self.livrer(
              walls: structure.walls,
              doors: structure.doors,
              windows: structure.windows,
              openings: structure.openings,
              objets: structure.objects,
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
      exporter: { url in try room.export(to: url, exportOptions: .parametric) },
    )
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
    exporter: (URL) throws -> Void,
  ) {
    do {
      let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      let usdzURL = docs.appendingPathComponent("scan-\(UUID().uuidString).usdz")
      // .parametric = murs/portes propres (pas le maillage brut).
      try exporter(usdzURL)
      // L'USDZ RoomPlan est blanc uniforme : invisible sur le fond blanc
      // de Quick Look. On le teinte, avec les couleurs relevées si on en a.
      Self.tintModel(at: usdzURL)

      var payload: [String: Any] = [
        "modelPath": usdzURL.path,
        "surfaces": Self.surfacesJSON(
          walls: walls, doors: doors, windows: windows, openings: openings,
          withColors: true,
        ),
        "objects": Self.objectsJSON(objets, withColors: true),
        // Ce qu'on a posé au viseur pendant le relevé : des points du
        // monde, que le JS rattachera aux murs et aux plafonds.
        "elec": ancresElec,
        // Combien de passages composent ce relevé : le JS s'en sert pour
        // dire « deux pièces réunies » plutôt que de laisser deviner.
        "passages": releves.count,
      ]
      if let floor = RoomColorSampler.shared.floorPayload() {
        payload["floor"] = floor
      }
      // Cap du monde ARKit : absent si le magnétomètre n'a rien donné de
      // sûr — mieux vaut pas de rose des vents qu'une fausse.
      if let north = RoomScanCompass.shared.northOffset {
        payload["north"] = north
      }
      RoomColorSampler.shared.detach()
      RoomScanCompass.shared.detach()
      stopResolver?(payload)
    } catch {
      stopRejecter?("EXPORT_FAILED", error.localizedDescription, error)
    }
    clearPromise()
  }

  // MARK: - RoomCaptureSessionDelegate (temps réel)

  func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
    // Le releveur de couleurs a besoin de la géométrie la plus fraîche
    // possible : on la lui passe à chaque mise à jour, sans throttle.
    RoomColorSampler.shared.update(room: room)
    // C'est elle qui nommera le mur visé à la prochaine pose.
    vueCourante = room
    // Throttle à 2 Hz : le JS n'a besoin que d'un aperçu.
    guard Date().timeIntervalSince(lastLiveEmit) > 0.5 else { return }
    lastLiveEmit = Date()
    RoomScanEvents.shared?.emit(name: "onScanUpdate", body: [
      "wallCount": room.walls.count,
      "objectCount": room.objects.count,
      "doorCount": room.doors.count,
      "windowCount": room.windows.count,
      "surfaces": Self.surfacesJSON(room),
    ])
  }

  func captureSession(_ session: RoomCaptureSession,
                      didProvide instruction: RoomCaptureSession.Instruction) {
    RoomScanEvents.shared?.emit(name: "onInstruction",
                                body: ["instruction": String(describing: instruction)])
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
      return out
    }
  }

  /// Recolore l'USDZ exporté : sans teinte, tout est blanc sur fond blanc
  /// dans Quick Look. Les couleurs relevées pendant le scan sont employées
  /// quand elles existent. Non fatal : en cas d'échec, le modèle reste blanc.
  static func tintModel(at url: URL) {
    do {
      let scene = try SCNScene(url: url, options: nil)
      let sampled = { (c: SIMD3<Float>) in
        UIColor(red: CGFloat(c.x / 255), green: CGFloat(c.y / 255),
                blue: CGFloat(c.z / 255), alpha: 1)
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
