import Foundation
import CoreBluetooth
import React

/**
 LE TÉLÉMÈTRE LASER — la cote juste, prise à la source.

 RoomPlan se trompe de deux à trois centimètres sur une pièce : c'est sans
 conséquence pour un plan d'ambiance, c'est trop pour percer. Le mètre laser
 donne le millimètre, et surtout il le donne DEVANT LE CLIENT — un outil de
 chantier qu'on sort et qui parle à l'application, ça se voit et ça compte.

 CE QU'ON PARLE : le profil BLE des Leica DISTO, qui est le télémètre du
 bâtiment et le seul dont le service soit publiquement documenté. Un service,
 une caractéristique, quatre octets : la distance en mètres, notifiée à
 chaque mesure. Bosch garde son protocole pour lui ; le code est écrit pour
 qu'un second profil s'ajoute sans le refondre — c'est la seule chose qu'on
 puisse honnêtement faire pour eux aujourd'hui.

 CE MODULE NE CHERCHE PAS TOUT SEUL. Le scan Bluetooth vide une batterie et
 fait apparaître une demande d'autorisation : il ne démarre que si
 l'électricien ouvre la feuille du télémètre, et s'arrête dès qu'il la
 ferme. Une application qui écoute la radio en permanence pour un outil
 qu'on sort trois fois par mois, c'est une application qu'on désinstalle.
 */
@objc(RoomScanLaser)
final class RoomScanLaser: RCTEventEmitter {

  /// Le service de distance des DISTO, et la caractéristique qui la porte.
  private static let SERVICE = CBUUID(
    string: "3AB10100-F831-4395-B29D-570977D5BF94",
  )
  private static let DISTANCE = CBUUID(
    string: "3AB10101-F831-4395-B29D-570977D5BF94",
  )

  private var central: CBCentralManager?
  private var trouves: [String: CBPeripheral] = [:]
  private var connecte: CBPeripheral?
  /// Vrai tant que la feuille du télémètre est ouverte.
  private var cherche = false

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["onLaserAppareil", "onLaserEtat", "onLaserMesure"]
  }

  /**
   Ouvre la radio et cherche les télémètres.

   Le `CBCentralManager` n'est créé qu'ICI : l'instancier au chargement du
   module déclencherait la demande d'autorisation Bluetooth au premier
   lancement de l'application, avant même qu'on ait parlé de télémètre.
   */
  @objc func chercher(_ resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    cherche = true
    if central == nil {
      central = CBCentralManager(delegate: self, queue: nil)
    } else {
      demarrerRecherche()
    }
    resolve(true)
  }

  /// Ferme la radio. Appelé quand la feuille se referme.
  @objc func arreter(_ resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
    cherche = false
    central?.stopScan()
    resolve(true)
  }

  @objc func connecter(_ identifiant: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    guard let p = trouves[identifiant] else {
      resolve(false)
      return
    }
    central?.stopScan()
    central?.connect(p, options: nil)
    resolve(true)
  }

  @objc func deconnecter(_ resolve: @escaping RCTPromiseResolveBlock,
                         reject: @escaping RCTPromiseRejectBlock) {
    if let p = connecte { central?.cancelPeripheralConnection(p) }
    connecte = nil
    resolve(true)
  }

  private func demarrerRecherche() {
    guard cherche, central?.state == .poweredOn else { return }
    trouves.removeAll()
    central?.scanForPeripherals(withServices: [Self.SERVICE], options: nil)
    /*
      ON CHERCHE AUSSI SANS FILTRE.

      Certains DISTO n'annoncent pas leur service dans la trame de
      publicité — la place y est comptée, et le nom passe avant. Filtrer
      sur le seul service laissait l'écran vide devant un appareil allumé,
      ce qui est la pire des réponses : l'électricien conclut que ça ne
      marche pas. On regarde donc aussi les noms, et on ne montre que ce
      qui ressemble à un télémètre.
    */
    central?.scanForPeripherals(withServices: nil, options: nil)
  }

  /// Un nom qui ressemble à un télémètre de chantier.
  private static func estUnTelemetre(_ nom: String?) -> Bool {
    guard let n = nom?.uppercased() else { return false }
    return n.contains("DISTO") || n.contains("LEICA")
  }
}

extension RoomScanLaser: CBCentralManagerDelegate {

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    switch central.state {
    case .poweredOn:
      sendEvent(withName: "onLaserEtat", body: ["etat": "pret"])
      demarrerRecherche()
    case .poweredOff:
      sendEvent(withName: "onLaserEtat", body: ["etat": "eteint"])
    case .unauthorized:
      sendEvent(withName: "onLaserEtat", body: ["etat": "refuse"])
    case .unsupported:
      sendEvent(withName: "onLaserEtat", body: ["etat": "indisponible"])
    default:
      break
    }
  }

  func centralManager(_ central: CBCentralManager,
                      didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any],
                      rssi RSSI: NSNumber) {
    let nom = peripheral.name
      ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let annonce =
      (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
      .contains(Self.SERVICE) ?? false
    guard annonce || Self.estUnTelemetre(nom) else { return }
    let id = peripheral.identifier.uuidString
    trouves[id] = peripheral
    sendEvent(
      withName: "onLaserAppareil",
      body: ["id": id, "nom": nom ?? "Télémètre", "force": RSSI.intValue],
    )
  }

  func centralManager(_ central: CBCentralManager,
                      didConnect peripheral: CBPeripheral) {
    connecte = peripheral
    peripheral.delegate = self
    peripheral.discoverServices([Self.SERVICE])
    sendEvent(
      withName: "onLaserEtat",
      body: ["etat": "connecte", "nom": peripheral.name ?? "Télémètre"],
    )
  }

  func centralManager(_ central: CBCentralManager,
                      didFailToConnect peripheral: CBPeripheral,
                      error: Error?) {
    sendEvent(withName: "onLaserEtat", body: ["etat": "echec"])
  }

  func centralManager(_ central: CBCentralManager,
                      didDisconnectPeripheral peripheral: CBPeripheral,
                      error: Error?) {
    connecte = nil
    sendEvent(withName: "onLaserEtat", body: ["etat": "deconnecte"])
    // La feuille est encore ouverte : on se remet à chercher, l'appareil
    // s'est peut-être seulement mis en veille entre deux mesures.
    demarrerRecherche()
  }
}

extension RoomScanLaser: CBPeripheralDelegate {

  func peripheral(_ peripheral: CBPeripheral,
                  didDiscoverServices error: Error?) {
    for s in peripheral.services ?? [] where s.uuid == Self.SERVICE {
      peripheral.discoverCharacteristics([Self.DISTANCE], for: s)
    }
  }

  func peripheral(_ peripheral: CBPeripheral,
                  didDiscoverCharacteristicsFor service: CBService,
                  error: Error?) {
    for c in service.characteristics ?? [] where c.uuid == Self.DISTANCE {
      // On S'ABONNE : c'est l'appareil qui pousse sa mesure quand on
      // appuie sur son bouton. Interroger la caractéristique en boucle
      // aurait vidé les deux batteries pour le même résultat.
      peripheral.setNotifyValue(true, for: c)
    }
  }

  func peripheral(_ peripheral: CBPeripheral,
                  didUpdateValueFor characteristic: CBCharacteristic,
                  error: Error?) {
    guard characteristic.uuid == Self.DISTANCE,
          let data = characteristic.value,
          data.count >= 4 else { return }
    /*
      QUATRE OCTETS, UN FLOTTANT, DES MÈTRES.

      Le DISTO envoie la distance en virgule flottante 32 bits, petit-
      boutien, dans l'unité réglée sur l'appareil — le mètre par défaut.
      On ne convertit rien : si l'électricien a mis son télémètre en
      pieds, c'est son appareil qu'il règle, pas l'application qui devine.
    */
    let metres = data.withUnsafeBytes { brut -> Float in
      brut.loadUnaligned(as: Float32.self)
    }
    guard metres.isFinite, metres > 0, metres < 200 else { return }
    sendEvent(withName: "onLaserMesure", body: ["metres": Double(metres)])
  }
}
