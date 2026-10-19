import Foundation
import AVFoundation
import ObjectiveC
import ReplayKit
import React
import UIKit

/**
 LE MODE DIAGNOSTIC — une session enregistrée, du premier appui au second.

 Premier relevé du patron : « au clic sur un bouton visible, les 10 dernières
 secondes de mes faits et gestes te seront envoyés, écran compris ». Second
 relevé : « le diagnostic ne doit pas agir sur seulement 10 s ; le bouton doit
 agir comme un bouton ON (il clignote si actif), il enregistre tout ce qui se
 passe, et au clic de nouveau on clôt, avec toujours la possibilité de
 rajouter une note, et envoi ». Réservé à l'administrateur (le JavaScript ne
 l'arme que si le serveur l'a confirmé, voir `src/diagnostic/`). Trois pièces :

 1. L'ÉCRAN, TOUTE LA SESSION. ReplayKit capture l'écran (micro coupé) dès le
    premier appui ; on l'écrit par TRANCHES d'une minute (AVAssetWriter, H.264,
    demi-résolution, ~0,9 Mbit/s, soit ~7 Mo la minute) et on les garde TOUTES
    jusqu'au second appui. Chaque tranche part au serveur dans sa propre
    requête : aucune ne dépasse ce qu'un envoi mobile supporte. Vingt minutes
    au plus — au-delà, la session se clôt d'elle-même et propose l'envoi.
    ReplayKit refusé ou indisponible : pas de vidéo, le reste marche.

 2. LES GESTES DE PARTOUT. On échange une seule fois l'implémentation de
    `UIWindow.sendEvent(_:)` : chaque toucher est noté (début/fin/annulé, sa
    position, et l'étiquette d'accessibilité de la vue touchée). Cela couvre
    les modales et le scan RoomPlan, que rien d'autre ne voit. Le drapeau
    `enregistre` est vérifié EN PREMIER : hors session, l'échange ne coûte rien.

 3. LE BOUTON-INTERRUPTEUR. Une petite fenêtre transparente posée au-dessus de
    tout (feuilles, page Pro, scan), qui ne capte que les touchers sur son
    bouton rond. Au repos : un rond rouge. Premier appui : la session démarre,
    le bouton CLIGNOTE et porte un carré d'arrêt. Second appui : la session se
    clôt, et une alerte propose une note, « Envoyer », « Reprendre
    l'enregistrement » (un appui de trop ne perd rien) ou « Jeter ».
    « Envoyer » émet l'événement `envoyer` vers le JavaScript, avec les
    tranches de vidéo, tous les gestes, le début et la fin de la session ;
    le démarrage émet `debut`, l'abandon `jete`.

 UIKit TOUJOURS SUR LE FIL PRINCIPAL ; l'écriture vidéo sur sa propre file.
 */
@objc(RoomScanDiagnostic)
final class RoomScanDiagnostic: RCTEventEmitter {

  static weak var shared: RoomScanDiagnostic?
  private var hasListeners = false

  /// Le mode est armé (le bouton est là).
  static var actif = false
  /// Une session enregistre — vérifié EN PREMIER par l'échange de `sendEvent`.
  static var enregistre = false

  /// Une tranche de vidéo par minute.
  private static let dureeTranche: Double = 60
  /// Une session dure vingt minutes au plus.
  private static let dureeMaxSession: Double = 20 * 60
  /// Les gestes d'une session, au plus (une boucle de touchers ne mange pas la mémoire).
  private static let plafondGestes = 60_000

  // MARK: - Gestes (toute la session)

  private struct Geste {
    let phase: String
    let x: Double
    let y: Double
    let cible: String?
    let at: Double
  }
  private static let fileGestes = DispatchQueue(label: "echoplan.diag.gestes")
  private static var gestes: [Geste] = []

  // MARK: - Écran (segments ReplayKit)

  private let fileVideo = DispatchQueue(label: "echoplan.diag.video")
  private var capture = false
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var sessionDemarree = false
  private var debutSegment: CMTime = .zero
  private var segmentCourant: URL?
  /// Les tranches finies de la session, de la plus vieille à la plus récente.
  private var segments: [URL] = []
  private var largeur = 0
  private var hauteur = 0

  private var boutonFenetre: UIWindow?
  private weak var boutonVue: UIButton?
  private var observateur: NSObjectProtocol?

  /// Le début de la session, en ms depuis 1970 (0 : pas de session).
  private var debutSession: Double = 0
  /// Le temps déjà enregistré avant une reprise (s), pour la borne des vingt minutes.
  private var dureeAvantReprise: Double = 0
  private var repriseA: Date?
  private var minuterie: Timer?

  /// Ce qu'une session close rend : ses tranches de vidéo et ses gestes.
  private struct Session {
    let videos: [String]
    let gestes: [[String: Any]]
    /// Début et fin de la session, en ms depuis 1970 : le JavaScript y borne
    /// le fil de ses évènements (on tape la note APRÈS la fin).
    let debut: Double
    let fin: Double
  }

  override init() {
    super.init()
    RoomScanDiagnostic.shared = self
  }

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! { ["envoyer", "debut", "jete"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  // MARK: - API exposée au JavaScript

  /// Arme le mode : le bouton paraît, rien n'enregistre encore.
  @objc func demarrer(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    RoomScanDiagnostic.actif = true
    RoomScanDiagnostic.installerEchange()
    observerRetourPremierPlan()
    montrerBouton()
    resolve(true)
  }

  /// Désarme le mode : une session en cours est jetée, le bouton s'en va.
  @objc func arreter(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    RoomScanDiagnostic.actif = false
    DispatchQueue.main.async { self.jeterSession(emettre: false) }
    cacherBouton()
    resolve(true)
  }

  /// Une session enregistre-t-elle ? (pour le JavaScript et le banc)
  @objc func enCours(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    resolve(RoomScanDiagnostic.enregistre)
  }

  // MARK: - La session

  /// Premier appui : on repart de rien, et tout s'enregistre.
  private func commencerSession() {
    nettoyerFichiers()
    RoomScanDiagnostic.fileGestes.sync { RoomScanDiagnostic.gestes.removeAll() }
    debutSession = Date().timeIntervalSince1970 * 1000
    dureeAvantReprise = 0
    reprendre()
    if hasListeners { sendEvent(withName: "debut", body: ["debut": debutSession]) }
  }

  /// La session (re)part : capture, gestes, clignotement, minuterie des vingt minutes.
  private func reprendre() {
    RoomScanDiagnostic.enregistre = true
    repriseA = Date()
    demarrerCapture()
    etatBouton(enregistre: true)
    minuterie?.invalidate()
    let reste = max(1, RoomScanDiagnostic.dureeMaxSession - dureeAvantReprise)
    minuterie = Timer.scheduledTimer(withTimeInterval: reste, repeats: false) { [weak self] _ in
      self?.clore(limite: true)
    }
  }

  /// Second appui (ou vingt minutes) : la session s'arrête et propose l'envoi.
  private func clore(limite: Bool = false) {
    guard RoomScanDiagnostic.enregistre else { return }
    RoomScanDiagnostic.enregistre = false
    minuterie?.invalidate()
    minuterie = nil
    if let r = repriseA { dureeAvantReprise += Date().timeIntervalSince(r) }
    repriseA = nil
    etatBouton(enregistre: false)
    let fin = Date().timeIntervalSince1970 * 1000
    let gestes = gestesDeLaSession()
    let debut = debutSession
    suspendreCapture {
      let videos = self.segments.map { $0.path }
      let s = Session(videos: videos, gestes: gestes, debut: debut, fin: fin)
      DispatchQueue.main.async { self.presenterAlerte(s, limite: limite) }
    }
  }

  /// « Jeter » : les tranches s'effacent, le JavaScript vide son fil.
  private func jeterSession(emettre: Bool) {
    RoomScanDiagnostic.enregistre = false
    minuterie?.invalidate()
    minuterie = nil
    repriseA = nil
    debutSession = 0
    etatBouton(enregistre: false)
    arreterCapture()
    RoomScanDiagnostic.fileGestes.async { RoomScanDiagnostic.gestes.removeAll() }
    if emettre && hasListeners { sendEvent(withName: "jete", body: [:]) }
  }

  // MARK: - Les gestes

  private func gestesDeLaSession() -> [[String: Any]] {
    var out: [[String: Any]] = []
    RoomScanDiagnostic.fileGestes.sync {
      out = RoomScanDiagnostic.gestes.map { g in
        var d: [String: Any] = ["phase": g.phase, "x": g.x, "y": g.y, "at": g.at]
        if let c = g.cible { d["cible"] = c }
        return d
      }
    }
    return out
  }

  private static var echangeFait = false

  private static func installerEchange() {
    guard !echangeFait else { return }
    echangeFait = true
    guard
      let original = class_getInstanceMethod(UIWindow.self, #selector(UIWindow.sendEvent(_:))),
      let remplacant = class_getInstanceMethod(UIWindow.self, #selector(UIWindow.rsd_sendEvent(_:)))
    else { return }
    method_exchangeImplementations(original, remplacant)
  }

  /// Note les touchers d'un évènement — appelé depuis l'échange, déjà protégé
  /// par `enregistre`. Jamais rien de personnel : une position et une étiquette.
  static func noter(_ event: UIEvent, fenetre: UIWindow) {
    guard event.type == .touches, let touches = event.allTouches else { return }
    let at = Date().timeIntervalSince1970 * 1000
    var paquet: [Geste] = []
    for t in touches {
      let phase: String
      switch t.phase {
      case .began: phase = "debut"
      case .ended: phase = "fin"
      case .cancelled: phase = "annule"
      default: continue
      }
      let p = t.location(in: fenetre)
      paquet.append(
        Geste(phase: phase, x: Double(p.x), y: Double(p.y), cible: etiquette(t.view), at: at))
    }
    guard !paquet.isEmpty else { return }
    fileGestes.async {
      gestes.append(contentsOf: paquet)
      if gestes.count > plafondGestes { gestes.removeFirst(gestes.count - plafondGestes) }
    }
  }

  /// L'étiquette d'accessibilité de la vue touchée, en remontant les
  /// superviews jusqu'à en trouver une.
  private static func etiquette(_ vue: UIView?) -> String? {
    var v = vue
    while let cur = v {
      if let l = cur.accessibilityLabel, !l.isEmpty { return l }
      if let id = cur.accessibilityIdentifier, !id.isEmpty { return id }
      v = cur.superview
    }
    return nil
  }

  // MARK: - La capture et les segments

  private func demarrerCapture() {
    let rec = RPScreenRecorder.shared()
    guard rec.isAvailable, !capture else { return }
    rec.isMicrophoneEnabled = false
    capture = true
    rec.startCapture(handler: { [weak self] sample, type, err in
      guard err == nil, type == .video else { return }
      self?.recevoirVideo(sample)
    }, completionHandler: { [weak self] err in
      // ReplayKit refusé ou indisponible : la vidéo sera `null`, le reste marche.
      if err != nil { self?.capture = false }
    })
  }

  /// Arrête la capture en GARDANT les tranches : la session se clôt, on va
  /// les envoyer (ou reprendre). Rend la main une fois la dernière rangée.
  private func suspendreCapture(_ completion: @escaping () -> Void) {
    if capture {
      capture = false
      RPScreenRecorder.shared().stopCapture { _ in }
    }
    fileVideo.async {
      self.terminerSegmentCourant {
        completion()
      }
    }
  }

  /// Les tranches de la session envoyée juste avant : son envoi peut être
  /// encore en cours quand la suivante démarre — on ne les efface qu'une
  /// session plus tard.
  private var anciennes: [URL] = []

  /// Range les tranches de la session précédente, et efface celles d'avant.
  private func nettoyerFichiers() {
    fileVideo.async {
      for u in self.anciennes { try? FileManager.default.removeItem(at: u) }
      self.anciennes = self.segments
      self.segments = []
    }
  }

  private func arreterCapture() {
    if capture {
      capture = false
      RPScreenRecorder.shared().stopCapture { _ in }
    }
    fileVideo.async {
      self.input?.markAsFinished()
      self.writer?.finishWriting {}
      self.writer = nil
      self.input = nil
      self.sessionDemarree = false
      for u in self.segments { try? FileManager.default.removeItem(at: u) }
      if let c = self.segmentCourant { try? FileManager.default.removeItem(at: c) }
      self.segments = []
      self.segmentCourant = nil
      self.largeur = 0
      self.hauteur = 0
    }
  }

  private func recevoirVideo(_ sample: CMSampleBuffer) {
    guard CMSampleBufferDataIsReady(sample) else { return }
    fileVideo.async {
      guard self.capture else { return }
      let pts = CMSampleBufferGetPresentationTimeStamp(sample)
      guard let pb = CMSampleBufferGetImageBuffer(sample) else { return }
      if self.largeur == 0 {
        let w = CVPixelBufferGetWidth(pb)
        let h = CVPixelBufferGetHeight(pb)
        // Demi-résolution, arrondie au pair (H.264 exige des dimensions paires).
        self.largeur = max(2, (w / 2) & ~1)
        self.hauteur = max(2, (h / 2) & ~1)
      }
      // Une tranche par minute.
      if self.writer != nil, self.sessionDemarree,
        CMTimeGetSeconds(CMTimeSubtract(pts, self.debutSegment)) >= RoomScanDiagnostic.dureeTranche {
        self.rouler()
      }
      if self.writer == nil { self.ouvrirSegment() }
      guard let w = self.writer, let inp = self.input else { return }
      if !self.sessionDemarree {
        guard w.status == .unknown else { return }
        /*
          UN ÉCRIVAIN QUI NE DÉMARRE PAS NE TUE PAS L'APP — relevé
          « fiabilité » : disque plein, encodeur pris pendant le passage en
          arrière-plan. `startWriting` rend faux, le statut passe à
          `.failed`, et `startSession` levait une exception. On jette ce
          segment ; l'image suivante en ouvrira un autre.
        */
        guard w.startWriting() else {
          self.jeterSegmentCourant()
          return
        }
        w.startSession(atSourceTime: pts)
        self.sessionDemarree = true
        self.debutSegment = pts
      }
      guard w.status == .writing else {
        if w.status == .failed { self.jeterSegmentCourant() }
        return
      }
      if inp.isReadyForMoreMediaData {
        inp.append(sample)
      }
    }
  }

  private func ouvrirSegment() {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("echoplan-seg-\(UUID().uuidString).mp4")
    guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
    let reglages: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: largeur,
      AVVideoHeightKey: hauteur,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 900_000],
    ]
    let inp = AVAssetWriterInput(mediaType: .video, outputSettings: reglages)
    inp.expectsMediaDataInRealTime = true
    guard w.canAdd(inp) else { return }
    w.add(inp)
    writer = w
    input = inp
    segmentCourant = url
    sessionDemarree = false
  }

  /// Le segment courant ne servira pas : l'écrivain lâché, son fichier effacé.
  private func jeterSegmentCourant() {
    if let w = writer, w.status == .writing { w.cancelWriting() }
    if let url = segmentCourant { try? FileManager.default.removeItem(at: url) }
    writer = nil
    input = nil
    sessionDemarree = false
    segmentCourant = nil
  }

  /// Ferme le segment courant (sans bloquer) et le range dans la liste.
  private func rouler() {
    guard let w = writer, let inp = input, sessionDemarree, let url = segmentCourant else {
      writer = nil
      input = nil
      sessionDemarree = false
      segmentCourant = nil
      return
    }
    // Un écrivain tombé en panne ne se ferme pas : on le jette.
    guard w.status == .writing else {
      jeterSegmentCourant()
      return
    }
    inp.markAsFinished()
    writer = nil
    input = nil
    sessionDemarree = false
    segmentCourant = nil
    w.finishWriting {
      self.fileVideo.async {
        if w.status == .completed {
          self.segments.append(url)
        } else {
          try? FileManager.default.removeItem(at: url)
        }
      }
    }
  }

  /// Comme `rouler`, mais rend la main une fois la tranche rangée : la session
  /// close doit pouvoir envoyer ce qui vient d'être écrit. À appeler sur `fileVideo`.
  private func terminerSegmentCourant(_ completion: @escaping () -> Void) {
    guard let w = writer, let inp = input, sessionDemarree, let url = segmentCourant else {
      completion()
      return
    }
    guard w.status == .writing else {
      jeterSegmentCourant()
      completion()
      return
    }
    inp.markAsFinished()
    writer = nil
    input = nil
    sessionDemarree = false
    segmentCourant = nil
    w.finishWriting {
      self.fileVideo.async {
        if w.status == .completed {
          self.segments.append(url)
        } else {
          try? FileManager.default.removeItem(at: url)
        }
        completion()
      }
    }
  }

  // MARK: - Le bouton flottant

  private func montrerBouton() {
    DispatchQueue.main.async {
      guard self.boutonFenetre == nil else { return }
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      guard
        let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
      else { return }
      let f = FenetreBouton(windowScene: scene)
      f.windowLevel = .alert + 1
      f.backgroundColor = .clear
      let vc = UIViewController()
      vc.view.backgroundColor = .clear
      f.rootViewController = vc

      let bouton = UIButton(type: .system)
      let cote: CGFloat = 52
      let bornes = scene.coordinateSpace.bounds
      bouton.frame = CGRect(
        x: bornes.width - cote - 16, y: bornes.height * 0.4, width: cote, height: cote)
      bouton.layer.cornerRadius = cote / 2
      bouton.backgroundColor = UIColor.systemRed.withAlphaComponent(0.9)
      bouton.tintColor = .white
      let image =
        UIImage(systemName: "ladybug.fill") ?? UIImage(systemName: "exclamationmark.bubble.fill")
      bouton.setImage(image, for: .normal)
      bouton.accessibilityLabel = "Diagnostic : démarrer l’enregistrement"
      bouton.addTarget(self, action: #selector(self.appuiBouton), for: .touchUpInside)
      let pan = UIPanGestureRecognizer(target: self, action: #selector(self.glisser(_:)))
      bouton.addGestureRecognizer(pan)
      vc.view.addSubview(bouton)

      f.boutonCible = bouton
      self.boutonVue = bouton
      self.boutonFenetre = f
      f.isHidden = false
      // Revenu au premier plan en pleine session : il reclignote.
      if RoomScanDiagnostic.enregistre { self.etatBouton(enregistre: true) }
    }
  }

  /// AU REPOS, un rond rouge ; EN SESSION, il clignote et porte un carré d'arrêt.
  private func etatBouton(enregistre: Bool) {
    DispatchQueue.main.async {
      guard let b = self.boutonVue else { return }
      b.layer.removeAnimation(forKey: "clignote")
      b.alpha = 1
      if enregistre {
        b.setImage(UIImage(systemName: "stop.fill"), for: .normal)
        b.accessibilityLabel = "Diagnostic : arrêter l’enregistrement"
        b.layer.borderWidth = 3
        b.layer.borderColor = UIColor.white.cgColor
        let a = CABasicAnimation(keyPath: "opacity")
        a.fromValue = 1
        a.toValue = 0.3
        a.duration = 0.6
        a.autoreverses = true
        a.repeatCount = .infinity
        b.layer.add(a, forKey: "clignote")
      } else {
        b.setImage(
          UIImage(systemName: "ladybug.fill") ?? UIImage(systemName: "exclamationmark.bubble.fill"),
          for: .normal)
        b.accessibilityLabel = "Diagnostic : démarrer l’enregistrement"
        b.layer.borderWidth = 0
      }
    }
  }

  private func cacherBouton() {
    DispatchQueue.main.async {
      self.boutonFenetre?.isHidden = true
      self.boutonFenetre = nil
      self.boutonVue = nil
    }
  }

  @objc private func glisser(_ g: UIPanGestureRecognizer) {
    guard let b = g.view, let parent = b.superview else { return }
    let t = g.translation(in: parent)
    b.center = CGPoint(x: b.center.x + t.x, y: b.center.y + t.y)
    g.setTranslation(.zero, in: parent)
  }

  @objc private func appuiBouton() {
    if RoomScanDiagnostic.enregistre {
      clore()
    } else {
      commencerSession()
    }
  }

  /// La durée lisible d'une session : « 3 min 12 s », « 45 s ».
  private func dureeLisible(_ s: Session) -> String {
    let total = Int(max(0, (s.fin - s.debut) / 1000).rounded())
    let m = total / 60
    let r = total % 60
    return m > 0 ? "\(m) min \(r) s" : "\(r) s"
  }

  private func presenterAlerte(_ s: Session, limite: Bool) {
    let a = UIAlertController(
      title: limite ? "Vingt minutes enregistrées" : "Enregistrement terminé",
      message:
        "\(dureeLisible(s)) d’écran, tous vos gestes et le journal de l’app seront envoyés. Décrivez le problème :",
      preferredStyle: .alert)
    a.addTextField { tf in
      tf.placeholder = "Ce qui ne va pas (facultatif)"
      tf.autocapitalizationType = .sentences
    }
    a.addAction(
      UIAlertAction(title: "Envoyer", style: .default) { [weak self, weak a] _ in
        let message = a?.textFields?.first?.text ?? ""
        self?.emettreEnvoi(message: message, session: s)
      })
    if !limite {
      // Un second appui par mégarde ne perd rien : la session continue.
      a.addAction(
        UIAlertAction(title: "Reprendre l’enregistrement", style: .default) { [weak self] _ in
          self?.reprendre()
        })
    }
    a.addAction(
      UIAlertAction(title: "Jeter", style: .destructive) { [weak self] _ in
        self?.jeterSession(emettre: true)
      })
    sommetPrincipal()?.present(a, animated: true)
  }

  private func emettreEnvoi(message: String, session: Session) {
    guard hasListeners else { return }
    sendEvent(
      withName: "envoyer",
      body: [
        "message": message,
        "videos": session.videos,
        "gestes": session.gestes,
        "debut": session.debut,
        "fin": session.fin,
      ])
  }

  /// Le contrôleur le plus haut de la fenêtre PRINCIPALE (jamais celle du
  /// bouton) : c'est de là qu'on présente l'alerte, par-dessus tout le reste.
  private func sommetPrincipal() -> UIViewController? {
    let fenetres = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .filter { !($0 is FenetreBouton) }
    guard let cle = fenetres.first(where: { $0.isKeyWindow }) ?? fenetres.first else { return nil }
    var haut = cle.rootViewController
    while let p = haut?.presentedViewController, !p.isBeingDismissed { haut = p }
    return haut
  }

  // MARK: - Retour au premier plan

  private func observerRetourPremierPlan() {
    guard observateur == nil else { return }
    observateur = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      guard let self, RoomScanDiagnostic.actif else { return }
      // ReplayKit coupe la capture en arrière-plan : on la relance au retour,
      // en pleine session seulement (une nouvelle tranche commence). Le
      // drapeau `capture` est resté levé : on le baisse si ReplayKit ne
      // capture plus, sans quoi la relance ne partirait jamais.
      if RoomScanDiagnostic.enregistre {
        if !RPScreenRecorder.shared().isRecording { self.capture = false }
        self.demarrerCapture()
      }
      if self.boutonFenetre == nil { self.montrerBouton() }
    }
  }
}

/**
 LA FENÊTRE DU BOUTON — transparente, et qui ne capte QUE son bouton.

 `hitTest` rend `nil` partout ailleurs : tout ce qui n'est pas le bouton
 traverse vers l'application dessous. Sans cela, une fenêtre pleine écran
 posée au-dessus de tout avalerait chaque toucher du plan et du scan.
 */
final class FenetreBouton: UIWindow {
  weak var boutonCible: UIView?
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let b = boutonCible else { return nil }
    return b.frame.contains(point) ? super.hitTest(point, with: event) : nil
  }
}

extension UIWindow {
  /// L'implémentation échangée avec `sendEvent(_:)` : après l'échange, cet
  /// appel-ci rejoint l'original. On délègue d'abord, on note ensuite.
  @objc fileprivate func rsd_sendEvent(_ event: UIEvent) {
    self.rsd_sendEvent(event)
    guard RoomScanDiagnostic.enregistre else { return }
    RoomScanDiagnostic.noter(event, fenetre: self)
  }
}
