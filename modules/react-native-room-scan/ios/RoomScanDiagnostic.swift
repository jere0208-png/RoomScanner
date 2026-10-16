import Foundation
import AVFoundation
import ObjectiveC
import ReplayKit
import React
import UIKit

/**
 LE MODE DIAGNOSTIC — les dix dernières secondes, pour corriger.

 Relevé du patron : « un mode diagnostique […] au clic sur un bouton visible,
 les 10 dernières secondes de mes faits et gestes te seront envoyés, écran
 compris, pour corriger ». Réservé à l'administrateur (le JavaScript ne l'arme
 que si le serveur l'a confirmé, voir `src/diagnostic/`). Trois pièces :

 1. L'ÉCRAN EN BOUCLE. ReplayKit capture l'écran (micro coupé) ; on l'écrit
    par SEGMENTS de ~3 s (AVAssetWriter, H.264, demi-résolution, ~1,2 Mbit/s)
    et on ne garde que les cinq derniers sur disque. `figer()` assemble ceux
    qui couvrent les dix dernières secondes en un mp4, puis la capture reprend.
    ReplayKit refusé ou indisponible : la vidéo est `null`, le reste marche.

 2. LES GESTES DE PARTOUT. On échange une seule fois l'implémentation de
    `UIWindow.sendEvent(_:)` : chaque toucher est noté (début/fin/annulé, sa
    position, et l'étiquette d'accessibilité de la vue touchée). Cela couvre
    les modales et le scan RoomPlan, que rien d'autre ne voit. Le drapeau
    `actif` est vérifié EN PREMIER : coupé, l'échange ne coûte rien.

 3. LE BOUTON VISIBLE. Une petite fenêtre transparente posée au-dessus de
    tout (feuilles, page Pro, scan), qui ne capte que les touchers sur son
    bouton rond. Appui → on fige l'instant (pour que ce soit bien celui de
    l'appui), puis une alerte « Envoyer au développeur » avec un champ libre ;
    « Envoyer » émet l'événement `envoyer` vers le JavaScript.

 UIKit TOUJOURS SUR LE FIL PRINCIPAL ; l'écriture vidéo sur sa propre file.
 */
@objc(RoomScanDiagnostic)
final class RoomScanDiagnostic: RCTEventEmitter {

  static weak var shared: RoomScanDiagnostic?
  private var hasListeners = false

  /// Vérifié EN PREMIER par l'échange de `sendEvent` : coupé, rien ne coûte.
  static var actif = false

  // MARK: - Gestes (tampon circulaire 60 s)

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
  /// Les segments finis, du plus vieux au plus récent — cinq au plus.
  private var segments: [URL] = []
  private var largeur = 0
  private var hauteur = 0

  private var boutonFenetre: UIWindow?
  private weak var boutonVue: UIView?
  private var observateur: NSObjectProtocol?

  /// Ce qu'un figé rend : la vidéo (ou rien) et les gestes des dix secondes.
  private struct Fige {
    let video: String?
    let gestes: [[String: Any]]
  }

  override init() {
    super.init()
    RoomScanDiagnostic.shared = self
  }

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! { ["envoyer"] }
  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  // MARK: - API exposée au JavaScript

  @objc func demarrer(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    RoomScanDiagnostic.actif = true
    RoomScanDiagnostic.installerEchange()
    observerRetourPremierPlan()
    demarrerCapture()
    montrerBouton()
    resolve(true)
  }

  @objc func arreter(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    RoomScanDiagnostic.actif = false
    arreterCapture()
    cacherBouton()
    RoomScanDiagnostic.fileGestes.async { RoomScanDiagnostic.gestes.removeAll() }
    resolve(true)
  }

  @objc func figer(_ resolve: @escaping RCTPromiseResolveBlock,
                   reject: @escaping RCTPromiseRejectBlock) {
    figerInterne { f in
      resolve(["video": f.video ?? NSNull(), "gestes": f.gestes])
    }
  }

  // MARK: - Les gestes

  private func gestesRecents() -> [[String: Any]] {
    var out: [[String: Any]] = []
    RoomScanDiagnostic.fileGestes.sync {
      let depuis = Date().timeIntervalSince1970 * 1000 - 10_000
      out = RoomScanDiagnostic.gestes.filter { $0.at >= depuis }.map { g in
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
  /// par `actif`. Jamais rien de personnel : une position et une étiquette.
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
      let limite = at - 60_000
      gestes.removeAll { $0.at < limite }
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

  private func arreterCapture() {
    guard capture else { return }
    capture = false
    RPScreenRecorder.shared().stopCapture { _ in }
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
      // Rouler tous les ~3 s.
      if self.writer != nil, self.sessionDemarree,
        CMTimeGetSeconds(CMTimeSubtract(pts, self.debutSegment)) >= 3.0 {
        self.rouler()
      }
      if self.writer == nil { self.ouvrirSegment() }
      guard let w = self.writer, let inp = self.input else { return }
      if !self.sessionDemarree {
        guard w.status == .unknown else { return }
        w.startWriting()
        w.startSession(atSourceTime: pts)
        self.sessionDemarree = true
        self.debutSegment = pts
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
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_200_000],
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

  /// Ferme le segment courant (sans bloquer) et le range dans la liste.
  private func rouler() {
    guard let w = writer, let inp = input, sessionDemarree, let url = segmentCourant else {
      writer = nil
      input = nil
      sessionDemarree = false
      segmentCourant = nil
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
          self.elaguerSegments()
        } else {
          try? FileManager.default.removeItem(at: url)
        }
      }
    }
  }

  /// On ne garde que les cinq derniers segments (~15 s) ; les plus vieux partent.
  private func elaguerSegments() {
    while segments.count > 5 {
      let vieux = segments.removeFirst()
      try? FileManager.default.removeItem(at: vieux)
    }
  }

  // MARK: - Figer

  private func figerInterne(_ completion: @escaping (Fige) -> Void) {
    let gestes = gestesRecents()
    guard capture else {
      completion(Fige(video: nil, gestes: gestes))
      return
    }
    fileVideo.async {
      self.terminerSegmentCourant {
        let liste = self.segments
        guard !liste.isEmpty else {
          completion(Fige(video: nil, gestes: gestes))
          return
        }
        self.assembler(liste) { url in
          completion(Fige(video: url?.path, gestes: gestes))
        }
      }
    }
  }

  /// Comme `rouler`, mais rend la main une fois le segment rangé : `figer` doit
  /// pouvoir assembler ce qui vient d'être écrit. À appeler sur `fileVideo`.
  private func terminerSegmentCourant(_ completion: @escaping () -> Void) {
    guard let w = writer, let inp = input, sessionDemarree, let url = segmentCourant else {
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
          self.elaguerSegments()
        } else {
          try? FileManager.default.removeItem(at: url)
        }
        completion()
      }
    }
  }

  /// Assemble les segments et ne garde que les ~10 dernières secondes (mp4,
  /// copie directe des pistes). À appeler sur `fileVideo`.
  private func assembler(_ liste: [URL], _ completion: @escaping (URL?) -> Void) {
    let compo = AVMutableComposition()
    guard
      let piste = compo.addMutableTrack(
        withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      completion(nil)
      return
    }
    var curseur = CMTime.zero
    for u in liste {
      let asset = AVURLAsset(url: u)
      guard let vp = asset.tracks(withMediaType: .video).first else { continue }
      let plage = CMTimeRange(start: .zero, duration: asset.duration)
      do {
        try piste.insertTimeRange(plage, of: vp, at: curseur)
        piste.preferredTransform = vp.preferredTransform
        curseur = CMTimeAdd(curseur, asset.duration)
      } catch {
        // Un segment illisible ne doit pas emporter tout l'assemblage.
      }
    }
    guard curseur > .zero else {
      completion(nil)
      return
    }
    let dix = CMTime(seconds: 10, preferredTimescale: 600)
    if curseur > dix {
      compo.removeTimeRange(CMTimeRange(start: .zero, duration: CMTimeSubtract(curseur, dix)))
    }
    let sortie = FileManager.default.temporaryDirectory
      .appendingPathComponent("echoplan-diagnostic-\(UUID().uuidString).mp4")
    try? FileManager.default.removeItem(at: sortie)
    guard
      let export = AVAssetExportSession(asset: compo, presetName: AVAssetExportPresetPassthrough)
    else {
      completion(nil)
      return
    }
    export.outputURL = sortie
    export.outputFileType = .mp4
    export.exportAsynchronously {
      completion(export.status == .completed ? sortie : nil)
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
      bouton.accessibilityLabel = "Diagnostic : envoyer au développeur"
      bouton.addTarget(self, action: #selector(self.appuiBouton), for: .touchUpInside)
      let pan = UIPanGestureRecognizer(target: self, action: #selector(self.glisser(_:)))
      bouton.addGestureRecognizer(pan)
      vc.view.addSubview(bouton)

      f.boutonCible = bouton
      self.boutonVue = bouton
      self.boutonFenetre = f
      f.isHidden = false
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
    // Figer D'ABORD : l'instant envoyé doit être celui de l'appui.
    figerInterne { f in
      DispatchQueue.main.async { self.presenterAlerte(f) }
    }
  }

  private func presenterAlerte(_ f: Fige) {
    let a = UIAlertController(
      title: "Envoyer au développeur",
      message: "Les 10 dernières secondes de votre écran et de vos gestes seront envoyées.",
      preferredStyle: .alert)
    a.addTextField { tf in tf.placeholder = "Ce qui s’est passé (facultatif)" }
    a.addAction(UIAlertAction(title: "Annuler", style: .cancel))
    a.addAction(
      UIAlertAction(title: "Envoyer", style: .default) { [weak self, weak a] _ in
        let message = a?.textFields?.first?.text ?? ""
        self?.emettreEnvoi(message: message, fige: f)
      })
    sommetPrincipal()?.present(a, animated: true)
  }

  private func emettreEnvoi(message: String, fige: Fige) {
    guard hasListeners else { return }
    sendEvent(
      withName: "envoyer",
      body: [
        "message": message,
        "video": fige.video ?? NSNull(),
        "gestes": fige.gestes,
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
      // ReplayKit coupe la capture en arrière-plan : on la relance au retour.
      self.demarrerCapture()
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
    guard RoomScanDiagnostic.actif else { return }
    RoomScanDiagnostic.noter(event, fenetre: self)
  }
}
