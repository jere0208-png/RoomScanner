/**
 * LES COUACS DE LA REVUE « APP STORE » — et un de la revue « rénovation ».
 *
 *   — le manifeste de confidentialité taisait deux données qui partent :
 *     la page d'un plan papier (lue chez Anthropic) et l'abonnement (la
 *     transaction Apple inscrite au compte) ;
 *   — ce manifeste n'était pas dans la phase Resources : il n'entrait pas
 *     dans le paquet, donc Apple ne le voyait pas ;
 *   — la phrase de la caméra oubliait les photos de repérage ;
 *   — « Scanner un étage » partait sans l'autorisation caméra ;
 *   — « rien n'est gardé » sur la lecture de plan : Anthropic garde un temps ;
 *   — des restes du modèle de départ (paquet `new-app-screen`, réseau local
 *     ouvert en production) ;
 *   — la fiche annonçait l'iPad, que l'app ne vise pas ;
 *   — la pastille « RA » ne disait rien à personne.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoomScan } from 'react-native-room-scan';
import { demarrerComplement, demarrerEtage } from '../src/native/useRoomScan';
import { useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const st = () => useScanStore.getState();

describe('le manifeste de confidentialité', () => {
  const manifeste = lire('ios/RoomScanner/PrivacyInfo.xcprivacy');

  /** Le bloc `<dict>` d'un type de donnée déclaré, ou '' s'il manque. */
  const bloc = (type: string) => {
    const i = manifeste.indexOf(`<string>${type}</string>`);
    if (i < 0) return '';
    return manifeste.slice(i, manifeste.indexOf('</dict>', i));
  };

  it('déclare la page du plan papier : non liée, sans pistage, pour l’app', () => {
    const b = bloc('NSPrivacyCollectedDataTypePhotosorVideos');
    expect(b).toMatch(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<false\/>/);
    expect(b).toMatch(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/);
    expect(b).toContain('NSPrivacyCollectedDataTypePurposeAppFunctionality');
  });

  it('déclare l’abonnement : lié au compte, sans pistage, pour l’app', () => {
    const b = bloc('NSPrivacyCollectedDataTypePurchaseHistory');
    expect(b).toMatch(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/);
    expect(b).toMatch(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/);
    expect(b).toContain('NSPrivacyCollectedDataTypePurposeAppFunctionality');
  });
});

describe('le projet Xcode', () => {
  const pbx = lire('ios/RoomScanner.xcodeproj/project.pbxproj');

  it('copie le manifeste dans le paquet (phase Resources)', () => {
    const ref = pbx.match(
      /(\w{24}) \/\* PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile; fileRef = (\w{24}) \/\* PrivacyInfo\.xcprivacy \*\/; \};/,
    );
    expect(ref).not.toBeNull();
    // La référence est bien celle du fichier du groupe RoomScanner.
    expect(pbx).toContain(
      `${ref![2]} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference;`,
    );
    const debut = pbx.indexOf('isa = PBXResourcesBuildPhase;');
    const phase = pbx.slice(debut, pbx.indexOf(');', debut));
    expect(phase).toContain(`${ref![1]} /* PrivacyInfo.xcprivacy in Resources */`);
  });

  it('ne garde le réseau local (Metro) qu’en Debug', () => {
    const id = pbx.match(/(\w{24}) \/\* Local networking : Debug only \*\/,/)?.[1];
    expect(id).toBeDefined();
    const debut = pbx.indexOf(`${id} /* Local networking : Debug only */ = {`);
    expect(debut).toBeGreaterThan(0);
    const phase = pbx.slice(debut, pbx.indexOf('};', debut));
    expect(phase).toContain('isa = PBXShellScriptBuildPhase;');
    // Après le traitement de l'Info.plist du paquet, jamais avant.
    expect(phase).toContain('"$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)",');
    expect(phase).toContain('!= \\"Debug\\"');
    expect(phase).toContain('Delete :NSAppTransportSecurity:NSAllowsLocalNetworking');
    // Une clé déjà absente ne casse pas la construction.
    expect(phase).toContain('|| true');
  });
});

describe('les textes', () => {
  it('la caméra dit ses trois usages, photos de repérage comprises', () => {
    const plist = lire('ios/RoomScanner/Info.plist');
    const phrase = plist.match(
      /NSCameraUsageDescription<\/key>\s*<string>([^<]*)<\/string>/,
    )?.[1];
    expect(phrase).toContain('scanner vos pièces');
    expect(phrase).toContain('photos de repérage');
    expect(phrase).toContain('plans papier');
  });

  it('la lecture de plan ne promet plus que « rien n’est gardé »', () => {
    const ecran = lire('src/screens/LecturePlanScreen.tsx');
    expect(ecran).not.toContain('rien n’est gardé.');
    expect(ecran).toContain('nous ne gardons rien.');
  });

  it('la fiche App Store ne parle plus de l’iPad (l’app vise l’iPhone seul)', () => {
    expect(lire('ios/RoomScanner.xcodeproj/project.pbxproj')).toContain(
      'TARGETED_DEVICE_FAMILY = 1;',
    );
    const fiche = lire('docs/fiche-app-store.md');
    expect(fiche).not.toMatch(/iPad/);
    expect(fiche).toContain('le scan nécessite un iPhone équipé du LiDAR');
  });

  it('la pastille de réalité augmentée dit « Sur la table », plus « RA »', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).not.toContain('>RA</Text>');
    expect(ecran).toContain('<Text style={styles.vuePastilleTexte}>Sur la table</Text>');
  });

  it('le modèle de départ n’est plus une dépendance', () => {
    const pkg = JSON.parse(lire('package.json'));
    expect(pkg.dependencies['@react-native/new-app-screen']).toBeUndefined();
    const lock = JSON.parse(lire('package-lock.json'));
    expect(lock.packages[''].dependencies['@react-native/new-app-screen']).toBeUndefined();
    expect(lock.packages['node_modules/@react-native/new-app-screen']).toBeUndefined();
  });
});

describe('scanner depuis un plan ouvert demande la caméra', () => {
  const cameraStatus = RoomScan.cameraStatus as jest.Mock;
  const requestCamera = RoomScan.requestCamera as jest.Mock;
  const start = RoomScan.start as jest.Mock;

  beforeEach(() => {
    st().reset();
    useAccountStore.setState({ pro: true, surpriseVisible: false, paywallVisible: false });
    useScanStore.setState({ screen: 'result', supported: true, etageEnCours: null } as never);
    cameraStatus.mockClear();
    requestCamera.mockClear();
    start.mockClear();
  });

  afterEach(() => {
    cameraStatus.mockImplementation(async () => 'granted');
    requestCamera.mockImplementation(async () => true);
  });

  it('jamais demandée : la question du système, puis l’étage part', async () => {
    cameraStatus.mockImplementation(async () => 'undetermined');
    requestCamera.mockImplementation(async () => true);
    await demarrerEtage(1);
    expect(requestCamera).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(st().etageEnCours).toBe(1);
    expect(st().screen).toBe('scan');
  });

  it('refusée à la question : un refus dit, et rien de commencé', async () => {
    cameraStatus.mockImplementation(async () => 'undetermined');
    requestCamera.mockImplementation(async () => false);
    await expect(demarrerEtage(1)).rejects.toThrow(/caméra/);
    expect(start).not.toHaveBeenCalled();
    expect(st().etageEnCours).toBeNull();
    expect(st().screen).toBe('result');
  });

  it('refusée avant : on le dit sans redemander — et le plan ouvert reste', async () => {
    cameraStatus.mockImplementation(async () => 'denied');
    await expect(demarrerEtage(-1)).rejects.toThrow(/Réglages/);
    expect(requestCamera).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(st().etageEnCours).toBeNull();
    // Pas la page caméra : son « Autoriser » repartirait d'un relevé neuf.
    expect(st().screen).toBe('result');
  });

  it('« Scanner une pièce de plus » suit la même règle', async () => {
    cameraStatus.mockImplementation(async () => 'denied');
    await expect(demarrerComplement()).rejects.toThrow(/caméra/);
    expect(start).not.toHaveBeenCalled();
    expect(RoomScan.startAdditional as jest.Mock).not.toHaveBeenCalled();
    expect(st().complementEnCours).toBeFalsy();
  });
});
