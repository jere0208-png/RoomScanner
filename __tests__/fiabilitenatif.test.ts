/**
 * LA FIABILITÉ DU NATIF — revue « fiabilité » : ce qui faisait tourner la
 * caméra pour rien, remplir le disque, ou planter l'app. On ne compile pas
 * le Swift ici : on vérifie que les gardes sont en place, et que le pont
 * expose bien ce que le JS appelle.
 */
import * as fs from 'fs';
import * as path from 'path';

const ios = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'modules', 'react-native-room-scan', 'ios', f), 'utf8');

describe('abandonner un scan éteint la session', () => {
  it('le pont expose abandonRoomScan, le module l’appelle, RoomPlan n’assemble rien', () => {
    expect(ios('RoomScan.m')).toContain('RCT_EXTERN_METHOD(abandonRoomScan)');
    expect(ios('RoomScanModule.swift')).toContain('@objc func abandonRoomScan()');
    const m = ios('RoomScanManager.swift');
    expect(m).toContain('func abandonner()');
    expect(m).toContain('captureSession.stop(pauseARSession: true)');
    expect(m).toContain('captureView?.captureSession.arSession.pause()');
    expect(m).toContain('return !abandonne');
    // Un nouveau relevé repart non abandonné.
    expect(m).toMatch(/sessionEnPanne = false\n\s+abandonne = false/);
  });

  it('la croix du scan passe par l’abandon, avec repli sur la pause pour un binaire ancien', () => {
    const idx = fs.readFileSync(path.join(__dirname, '..', 'modules', 'react-native-room-scan', 'src', 'index.ts'), 'utf8');
    expect(idx).toContain('RoomScanModule?.abandonRoomScan ? RoomScanModule.abandonRoomScan() : RoomScanModule.pauseRoomScan()');
    const hook = fs.readFileSync(path.join(__dirname, '..', 'src', 'native', 'useRoomScan.ts'), 'utf8');
    expect(hook).toMatch(/cancel: \(\) => \{[\s\S]{0,300}abandon\(\)/);
  });
});

describe('les photos de mur rejoignent le dossier des photos', () => {
  it('écrites dans Documents/photos, un nom par mur', () => {
    const s = ios('RoomScanPhotoMur.swift');
    expect(s).toContain('.appendingPathComponent("photos", isDirectory: true)');
    expect(s).toContain('"mur-\\(id.uuidString).jpg"');
  });

  it('les anciennes, à la racine des Documents, se relisent et s’effacent encore — sous garde stricte', () => {
    const s = ios('RoomScanPhoto.swift');
    expect(s).toContain('return ancienneVueDeMur(url)');
    expect(s).toContain('^mur-[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\\\.jpg$');
    // La même garde, rejouée en JS : seul ce nom exact, à la racine des Documents.
    const motif = /^mur-[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\.jpg$/;
    expect(motif.test('mur-3F2504E0-4F89-11D3-9A0C-0305E82C3301.jpg')).toBe(true);
    expect(motif.test('mur-../../etc.jpg')).toBe(false);
    expect(motif.test('scan-1.usdz')).toBe(false);
  });
});

describe('ce qui plantait ne plante plus', () => {
  it('diagnostic : un écrivain vidéo qui ne démarre pas est jeté, pas utilisé', () => {
    const s = ios('RoomScanDiagnostic.swift');
    expect(s).toContain('guard w.startWriting() else {');
    expect(s).toContain('guard w.status == .writing else {');
    expect(s).toContain('private func jeterSegmentCourant()');
  });

  it('tarif .xlsx : une référence de colonne hors d’Excel est ignorée', () => {
    const s = ios('RoomScanTarifPro.swift');
    expect(s).toContain('static let colonnesMax = 16_384');
    expect(s).toContain('if lettres > 3 { return -1 }');
    expect(s).toContain('guard colonne >= 0, colonne < LecteurDeFeuille.colonnesMax else { break }');
  });

  it('aucune promesse ne reste suspendue', () => {
    expect(ios('RoomScanAccount.swift')).toContain('if !session.start() {');
    expect(ios('RoomScanAccount.swift')).toContain('self.signInReject?("apple", "Connexion Apple remplacée');
    expect(ios('RoomScanSupport.swift').match(/self\.mailResolve\?\("cancelled"\)\n\s+self\.mailResolve = resolve/g)).toHaveLength(2);
    expect(ios('RoomScanPhoto.swift')).toContain('self.resolve?(nil)\n    self.resolve = resolve');
    const lp = ios('RoomScanLecturePlan.swift');
    expect(lp).not.toMatch(/rendreA = resolve\n\s+(haut|preparer)/);
    expect(lp).toContain('rendreA?(nil)\n    rendreA = resolve');
  });
});
