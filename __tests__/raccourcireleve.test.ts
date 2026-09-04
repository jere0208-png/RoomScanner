/**
 * « DIS SIRI, NOUVEAU RELEVÉ » — dixième et dernière des améliorations.
 *
 * Un électricien arrive sur un chantier les mains prises. Sortir le
 * téléphone, le déverrouiller, trouver l'icône, attendre l'accueil, viser le
 * bouton : cinq gestes pour commencer ce qu'il est venu faire. La phrase les
 * remplace, et l'appui long sur l'icône aussi — le même raccourci, deux
 * chemins.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI SE MESURE, C'EST CE QU'ON FAIT DE LA DEMANDE.
 *
 * Un raccourci ne dit pas seulement « scanne » : il arrive à un moment, et
 * l'application est quelque part. Sur l'accueil, c'est simple. Mais si un
 * plan est OUVERT AVEC DES MODIFICATIONS NON ENREGISTRÉES, partir scanner
 * les perd — et personne ne relie une perte de travail à une phrase dite
 * trente secondes plus tôt. On refuse, et on dit pourquoi.
 *
 * ET LE RACCOURCI NE FRANCHIT PAS LA BARRIÈRE DU PALIER GRATUIT. Il fait
 * exactement ce que fait le bouton « Commencer le scan », garde comprise :
 * une porte dérobée qui contourne l'offre est un défaut, pas une facilité.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { suiteDuRaccourci, RACCOURCI_SCAN } from '../src/ui/raccourci';

describe('la demande arrive, et l’app est quelque part', () => {
  it('sur l’accueil : on scanne, c’est tout l’objet', () => {
    expect(
      suiteDuRaccourci({ demande: RACCOURCI_SCAN, screen: 'home', dirty: false }),
    ).toEqual({ faire: 'scanner' });
  });

  it('ailleurs mais sans travail en cours : on scanne aussi', () => {
    /*
      Un plan ouvert et enregistré, la bibliothèque, les réglages : rien à
      perdre. Refuser là ferait un raccourci qui marche une fois sur deux
      sans qu'on sache laquelle.
    */
    expect(
      suiteDuRaccourci({ demande: RACCOURCI_SCAN, screen: 'result', dirty: false }),
    ).toEqual({ faire: 'scanner' });
  });

  it('sur un plan MODIFIÉ : on refuse, et on dit pourquoi', () => {
    /*
      Personne ne relie une perte de travail à une phrase dite trente
      secondes plus tôt. Le silence serait le pire des deux : on croirait
      que le raccourci n'a pas marché, on le redirait, et le plan serait
      perdu au second essai.
    */
    const r = suiteDuRaccourci({
      demande: RACCOURCI_SCAN,
      screen: 'result',
      dirty: true,
    });
    expect(r.faire).toBe('dire');
    if (r.faire !== 'dire') return;
    expect(r.message).toMatch(/enregistr/i);
  });

  it('pendant un scan, la demande est sans objet', () => {
    /*
      On est DÉJÀ en train de scanner : recommencer jetterait le relevé en
      cours. Et l'écran de scan ne se quitte pas au milieu.
    */
    expect(
      suiteDuRaccourci({ demande: RACCOURCI_SCAN, screen: 'scan', dirty: true }).faire,
    ).toBe('rien');
    expect(
      suiteDuRaccourci({ demande: RACCOURCI_SCAN, screen: 'camera', dirty: false })
        .faire,
    ).toBe('rien');
  });

  it('pas de demande : rien ne se passe, évidemment', () => {
    expect(
      suiteDuRaccourci({ demande: null, screen: 'home', dirty: false }),
    ).toEqual({ faire: 'rien' });
  });

  it('une demande d’une version future est ignorée, pas devinée', () => {
    /*
      Un raccourci ajouté plus tard — « Ouvrir le dernier plan » — arriverait
      ici sous un nom inconnu. Le prendre pour un scan démarrerait un relevé
      que personne n'a demandé.
    */
    expect(
      suiteDuRaccourci({
        demande: 'ouvrir-le-dernier',
        screen: 'home',
        dirty: false,
      }),
    ).toEqual({ faire: 'rien' });
  });
});

describe('le raccourci passe par la porte, pas par la fenêtre', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('l’écoute vit là où quelque chose est TOUJOURS monté', () => {
    /*
      La demande peut arriver alors que l'accueil ne l'est pas — on dit la
      phrase en marchant, l'application était restée sur un plan. La
      décision se prend donc à la racine, et l'accueil ne reçoit qu'un
      drapeau.
    */
    const app = lire('App.tsx');
    expect(app).toContain('suiteDuRaccourci');
    expect(app).toContain('prendreLaDemande');
    // Au lancement ET à chaque retour au premier plan : le lancement à froid
    // est le cas fréquent, le retour couvre l'autre.
    expect(app).toContain('AppState');
  });

  it('et il déclenche le MÊME geste que le bouton, garde comprise', () => {
    /*
      Une porte dérobée qui contourne l'offre gratuite est un défaut, pas une
      facilité. L'accueil réutilise son propre chemin — `peutCreerPlan` puis
      `start` — au lieu d'en écrire un second.
    */
    const home = lire('src/screens/HomeScreen.tsx');
    expect(home).toContain('raccourciEnAttente');
    expect(home).toContain('peutCreerPlan');
    // Et il ATTEND de savoir si le téléphone sait scanner : consommer la
    // demande pendant la vérification, c'est la perdre sans rien dire.
    expect(home).toMatch(/supported === null/);
  });

  it('deux chemins mènent au même raccourci : la phrase et l’appui long', () => {
    /*
      L'App Intent pour Siri et Spotlight, l'action rapide pour l'appui long
      sur l'icône. Les deux écrivent la MÊME demande — un raccourci qui se
      comporte autrement selon le chemin emprunté est un raccourci qu'on
      n'ose plus employer.
    */
    const app = lire('ios/RoomScanner/AppDelegate.swift');
    expect(app).toContain('AppShortcutsProvider');
    expect(app).toContain('performActionFor');
    // La demande voyage par les réglages partagés : voir l'en-tête du
    // fichier natif.
    expect(app).toContain('roomscan.raccourci');
    const plist = lire('ios/RoomScanner/Info.plist');
    expect(plist).toContain('UIApplicationShortcutItems');
    expect(plist).toContain('nouveau-releve');
  });

  it('et la demande se lit UNE fois : elle s’efface en se lisant', () => {
    /*
      Une demande qui reste écrite redémarre un scan à chaque retour au
      premier plan — on quitte l'app pour prendre une photo, on revient, et
      le relevé recommence.
    */
    const natif = lire('modules/react-native-room-scan/ios/RoomScanRaccourci.swift');
    expect(natif).toContain('removeObject');
  });
});
