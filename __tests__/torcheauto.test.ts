/**
 * LA TORCHE S'ALLUME TOUTE SEULE QUAND IL FAIT SOMBRE.
 *
 * Relevé du patron : « lorsque lors d'un scan il n'y a pas assez de lumière,
 * active automatiquement le flash ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('la torche automatique', () => {
  const m = lire('modules/react-native-room-scan/ios/RoomScanManager.swift');

  it('RoomPlan réclame de la lumière : la torche s’allume', () => {
    expect(m).toContain('if case .turnOnLight = instruction { allumerLaTorche() }');
  });

  it('ou la lumière mesurée par ARKit reste trop faible une seconde et demie', () => {
    expect(m).toContain('session.arSession.currentFrame?.lightEstimate?.ambientIntensity');
    expect(m).toContain('guard lumiere < 150 else {');
    expect(m).toContain('if Date().timeIntervalSince(debut) > 1.5 { allumerLaTorche() }');
  });

  it('une fois, et jamais contre le choix de l’utilisateur', () => {
    expect(m).toContain('guard !torcheAuto, !torcheRefusee else { return }');
    // Éteinte à la main, elle ne se rallume plus d'elle-même de tout le scan.
    expect(m).toContain('if !on && self.torcheAuto { self.torcheRefusee = true }');
    expect(lire('modules/react-native-room-scan/ios/RoomScanModule.swift')).toContain(
      'RoomScanManager.shared.torcheManuelle(on)',
    );
    // Un relevé neuf repart de zéro.
    const debut = m.slice(m.indexOf('func start(fresh:'), m.indexOf('POSE UN APPAREIL'));
    expect(debut).toContain('torcheRefusee = false');
  });

  it('l’écran le montre : le bouton passe allumé, un mot le dit', () => {
    expect(lire('modules/react-native-room-scan/ios/RoomScanEvents.swift')).toContain('"onTorche"');
    expect(m).toContain('RoomScanEvents.shared?.emit(name: "onTorche", body: ["on": true, "auto": true])');
    const ecran = lire('src/screens/ScanScreen.tsx');
    expect(ecran).toContain("scanEvents.addListener('onTorche'");
    expect(ecran).toContain('setTorch(!!e.on);');
    expect(ecran).toContain('Peu de lumière — torche allumée');
  });
});
