/**
 * LE BOUTON DU DIAGNOSTIC EST UN INTERRUPTEUR — relevé du patron : « le
 * diagnostic ne doit pas agir sur seulement 10 s ; le bouton doit agir comme
 * un bouton ON (il clignote si actif), il enregistre tout ce qui se passe, et
 * au clic de nouveau on clôt, avec toujours la possibilité de rajouter une
 * note, et envoi ».
 *
 * Le natif ne se compile pas au banc : on lit sa source, et le pont qui
 * l'expose, pour tenir ce qui fait le geste.
 */
import * as fs from 'fs';
import * as path from 'path';

const lire = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const swift = lire('modules', 'react-native-room-scan', 'ios', 'RoomScanDiagnostic.swift');
const pont = lire('modules', 'react-native-room-scan', 'ios', 'RoomScan.m');

describe('le bouton-interrupteur du diagnostic', () => {
  it('premier appui : la session démarre ; second : elle se clôt', () => {
    expect(swift).toMatch(/if RoomScanDiagnostic\.enregistre \{\s*clore\(\)\s*\} else \{\s*commencerSession\(\)\s*\}/);
  });

  it('il clignote tant qu’il enregistre, et porte un carré d’arrêt', () => {
    expect(swift).toContain('b.layer.add(a, forKey: "clignote")');
    expect(swift).toContain('a.repeatCount = .infinity');
    expect(swift).toContain('UIImage(systemName: "stop.fill")');
    expect(swift).toContain('"Diagnostic : arrêter l’enregistrement"');
  });

  it('il garde toute la session : plus de fenêtre de dix secondes', () => {
    expect(swift).not.toMatch(/10_000|elaguerSegments|seconds: 10/);
    expect(swift).toContain('private static let dureeTranche: Double = 60');
    expect(swift).toContain('private static let dureeMaxSession: Double = 20 * 60');
    // Les gestes ne sont notés qu'en session.
    expect(swift).toContain('guard RoomScanDiagnostic.enregistre else { return }');
  });

  it('à la fin : une note, puis Envoyer, Reprendre ou Jeter', () => {
    expect(swift).toContain('a.addTextField');
    expect(swift).toContain('UIAlertAction(title: "Envoyer"');
    expect(swift).toContain('UIAlertAction(title: "Reprendre l’enregistrement"');
    expect(swift).toContain('UIAlertAction(title: "Jeter", style: .destructive)');
    expect(swift).toContain('override func supportedEvents() -> [String]! { ["envoyer", "debut", "jete"] }');
  });

  it('le pont expose ce que le JavaScript appelle, et plus `figer`', () => {
    expect(pont).toContain('RCT_EXTERN_METHOD(enCours:');
    expect(pont).not.toContain('RCT_EXTERN_METHOD(figer:');
    expect(swift).toContain('@objc func enCours(');
  });
});
