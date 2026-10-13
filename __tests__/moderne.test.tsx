/**
 * L'APP AU TOP DE LA CONCURRENCE — moderne et ludique.
 *
 * Relevé du patron : « améliore encore nativement l'application pour être au
 * top de la concurrence des applications du même style ; on doit proposer
 * mieux, repense la chose en modernité et ludique » — puis « refonte des
 * icônes du menu "…" : trop simples, SVG IA facilement détectable ; garde une
 * cohérence avec les icônes qu'on a déjà ailleurs ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NativeModules, ScrollView } from 'react-native';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { bilanDuReleve, type BilanDuReleve } from '../src/geometry/bilan';
import { BilanDuReleveCarte } from '../src/components/BilanDuReleve';
import { trouvaille } from '../src/components/CompteurVivant';
import { fichesSpotlight, indexerLesPlans } from '../src/ui/spotlight';
import { PREFIXE_OUVRIR, suiteDuRaccourci } from '../src/ui/raccourci';
import {
  annoncerLaMaquette,
  cleDeLaMaquette,
  voirEnRealiteAugmentee,
} from '../src/ui/realiteAugmentee';
import { ActionSheet } from '../src/components/Sheet';
import { SOLAIRES } from '../src/ui/solaires';
import type { WallSeg } from '../src/geometry/floorplan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const natifs = NativeModules as Record<string, unknown>;

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  extra: Partial<WallSeg> = {},
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
  ...extra,
});
const PIECE = (extra: Partial<WallSeg> = {}) => [
  mur('n', 0, 0, 4, 0, extra),
  mur('e', 4, 0, 4, 3, extra),
  mur('s', 4, 3, 0, 3, extra),
  mur('o', 0, 3, 0, 0, extra),
];
const porte: WallSeg = {
  ...mur('p', 0, 1, 0, 1.9),
  type: 'door',
  height: 2.05,
  yCenter: 1.025,
};

describe('le bilan du relevé', () => {
  it('un relevé parfait : cent sur cent, trois étoiles, rien à conseiller', () => {
    const b = bilanDuReleve({
      rooms: [
        {
          id: 'r1',
          // La couleur du sol relevée (plus d'image : voir `couleurmajoritaire`).
          floor: { texture: { texels: ['#C8B89A'] } },
          releve: { plafond: { hauteur: 2.5 } },
        },
      ],
      walls: PIECE({ confidence: 'high', color: '#D2BE9A' }),
      openings: [porte],
      objects: [],
    })!;
    expect(b.pieces).toBe(1);
    expect(b.surface).toBe(12);
    expect(b.murs).toBe(4);
    expect(b.portes).toBe(1);
    expect(b.score).toBe(100);
    expect(b.etoiles).toBe(3);
    expect(b.mention).toBe('Excellent');
    expect(b.conseil).toBeNull();
  });

  it('des murs mal vus et sans couleur : la note baisse, et le conseil vise ce qui manque le plus', () => {
    const b = bilanDuReleve({
      rooms: [{ id: 'r1' }],
      walls: PIECE({ confidence: 'low' }),
      openings: [],
      objects: [],
    })!;
    expect(b.score).toBe(35);
    expect(b.etoiles).toBe(1);
    expect(b.mention).toBe('À compléter');
    // Vingt-cinq points perdus sur la précision : le plus gros manque.
    expect(b.conseil).toMatch(/passage lent/);
  });

  it('chaque critère se lit, sur son barème', () => {
    const b = bilanDuReleve({
      rooms: [{ id: 'r1' }],
      walls: PIECE(),
      openings: [],
      objects: [],
    })!;
    expect(b.criteres.map(c => c.cle)).toEqual([
      'structure',
      'precision',
      'murs',
      'sol',
      'plafond',
    ]);
    expect(b.criteres.reduce((s, c) => s + c.sur, 0)).toBe(100);
  });

  it('sans un seul mur, pas de bilan — une fête sur un plan vide serait une moquerie', () => {
    expect(
      bilanDuReleve({ rooms: [], walls: [], openings: [], objects: [] }),
    ).toBeNull();
  });

  it('la fin du scan montre le bilan au lieu du simple bandeau', () => {
    const hook = lire('src/native/useRoomScan.ts');
    expect(hook).toContain('montrerLeBilan();');
    expect(hook).toContain('useBilanStore.getState().montrer(bilan)');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('<BilanDuReleveCarte');
  });
});

describe('la carte du bilan', () => {
  const BILAN: BilanDuReleve = {
    pieces: 3,
    surface: 48,
    murs: 14,
    portes: 4,
    fenetres: 5,
    meubles: 12,
    score: 88,
    etoiles: 3,
    mention: 'Excellent',
    criteres: [
      { cle: 'structure', libelle: 'Pièces refermées', points: 35, sur: 35 },
      { cle: 'precision', libelle: 'Murs bien vus', points: 22, sur: 25 },
      { cle: 'murs', libelle: 'Murs en vraie image', points: 16, sur: 20 },
      { cle: 'sol', libelle: 'Sol en vraie image', points: 10, sur: 12 },
      { cle: 'plafond', libelle: 'Plafond mesuré', points: 5, sur: 8 },
    ],
    conseil:
      'Levez le téléphone vers le plafond un instant : sa hauteur sera mesurée.',
  };
  const bouton = (t: renderer.ReactTestRenderer, label: string) =>
    t.root.findAll(
      (n: ReactTestInstance) =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function',
      {
        deep: false,
      },
    )[0];

  it('la note, la mention, les chiffres, le conseil — et les deux portes', () => {
    jest.useFakeTimers();
    const onVoir3D = jest.fn();
    const onRA = jest.fn();
    const onFermer = jest.fn();
    let t!: renderer.ReactTestRenderer;
    act(() => {
      t = renderer.create(
        <BilanDuReleveCarte
          bilan={BILAN}
          onFermer={onFermer}
          onVoir3D={onVoir3D}
          onRealiteAugmentee={onRA}
        />,
      );
    });
    const textes = t.root
      .findAllByType('Text' as never)
      .map(n => [].concat(n.props.children).join(''));
    expect(textes).toContain('Excellent');
    expect(textes).toContain('Relevé terminé');
    expect(textes.some(x => /plafond un instant/.test(x))).toBe(true);
    expect(
      t.root.findAll(
        n => n.props.accessibilityLabel === 'Qualité du relevé : 88 sur 100',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      t.root.findAll(n => n.props.accessibilityLabel === '48 m²').length,
    ).toBeGreaterThan(0);
    act(() => bouton(t, 'Voir en 3D').props.onPress());
    act(() => bouton(t, 'Voir en réalité augmentée').props.onPress());
    act(() => bouton(t, 'Continuer sur le plan').props.onPress());
    expect(onVoir3D).toHaveBeenCalledTimes(1);
    expect(onRA).toHaveBeenCalledTimes(1);
    expect(onFermer).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
    jest.useRealTimers();
  });

  it('tient sur un écran, sans défiler : cinq jauges, le conseil qui désigne la plus faible, une croix', () => {
    // Relevé du patron : « une refonte de la page de la note du scan (…) pas
    // de scroll à faire, tout sur la même page d'écran, de manière responsive. »
    jest.useFakeTimers();
    const onFermer = jest.fn();
    let t!: renderer.ReactTestRenderer;
    act(() => {
      t = renderer.create(
        <BilanDuReleveCarte bilan={BILAN} onFermer={onFermer} onVoir3D={() => {}} onRealiteAugmentee={() => {}} />,
      );
    });
    expect(t.root.findAllByType(ScrollView)).toHaveLength(0);
    for (const k of BILAN.criteres) {
      expect(t.root.findAll((n) => n.props.accessibilityLabel === `${k.libelle} : ${k.points} sur ${k.sur}`).length).toBeGreaterThan(0);
    }
    act(() => bouton(t, 'Fermer le bilan').props.onPress());
    expect(onFermer).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
    jest.useRealTimers();
  });

  it('sans bilan, rien à l’écran', () => {
    let t!: renderer.ReactTestRenderer;
    act(() => {
      t = renderer.create(
        <BilanDuReleveCarte
          bilan={null}
          onFermer={() => {}}
          onVoir3D={() => {}}
          onRealiteAugmentee={() => {}}
        />,
      );
    });
    expect(t.toJSON()).toBeNull();
  });
});

describe('le scan vivant', () => {
  it('on ne fête que ce qui dépasse le plus haut déjà vu', () => {
    expect(trouvaille(1, 0)).toEqual({ fete: 1, record: 1 });
    expect(trouvaille(3, 1)).toEqual({ fete: 2, record: 3 });
    // RoomPlan réunit deux murs, puis les re-sépare : pas de seconde fête.
    expect(trouvaille(2, 3)).toEqual({ fete: 0, record: 3 });
    expect(trouvaille(3, 3)).toEqual({ fete: 0, record: 3 });
  });

  it('les compteurs du scan sont vivants, les ouvertures vibrent plus franc', () => {
    const ecran = lire('src/screens/ScanScreen.tsx');
    expect(ecran).toContain('<CompteurVivant');
    expect(ecran).toContain("['Portes', doorCount, true]");
    const compteur = lire('src/components/CompteurVivant.tsx');
    expect(compteur).toContain("haptic(ouverture ? 'accroche' : 'leger')");
    expect(compteur).toContain('ECART_MIN = 350');
  });
});

describe('la maquette chez soi, en réalité augmentée', () => {
  afterEach(() => {
    delete natifs.RoomScanVisiteRegie;
    annoncerLaMaquette(null);
  });

  it('la vue 3D s’annonce, et la régie reçoit sa clé et le modèle de secours', async () => {
    const realiteAugmentee = jest.fn(async () => 'maquette');
    natifs.RoomScanVisiteRegie = { realiteAugmentee };
    annoncerLaMaquette('maquette-1');
    expect(cleDeLaMaquette()).toBe('maquette-1');
    const r = await voirEnRealiteAugmentee({ secours: '/scan.usdz' });
    expect(r).toEqual({ ok: true, source: 'maquette' });
    expect(realiteAugmentee).toHaveBeenCalledWith('maquette-1', '/scan.usdz');
  });

  it('un ancien binaire le dit, sans planter', async () => {
    const r = await voirEnRealiteAugmentee();
    expect(r.ok).toBe(false);
  });

  it('un refus du natif se dit aussi', async () => {
    natifs.RoomScanVisiteRegie = {
      realiteAugmentee: jest.fn(async () =>
        Promise.reject(new Error('RA_VIDE')),
      ),
    };
    const r = await voirEnRealiteAugmentee();
    expect(r.ok).toBe(false);
  });

  it('le natif écrit la maquette en USDZ, réduite pour la table, et l’ouvre dans AR Quick Look', () => {
    const ra = lire(
      'modules/react-native-room-scan/ios/RoomScanRealiteAugmentee.swift',
    );
    expect(ra).toContain('func maquettePourLExport(largeur: Float) -> SCNScene?');
    // L'écriture, qui réencode chaque image, ne fige plus l'écran.
    expect(ra).toContain('static func ecrireEnUSDZ(_ scene: SCNScene) -> URL?');
    expect(ra).toContain('DispatchQueue.global(qos: .userInitiated).async {');
    expect(ra).toContain(
      'scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)',
    );
    expect(ra).toContain('ARQuickLookPreviewItem(fileAt: url)');
    expect(ra).toContain('item.allowsContentScaling = true');
    // Ni liseré ni ombre : ils n'ont de sens qu'à l'écran.
    expect(ra).toContain(
      'enfant.renderingOrder == 4 || enfant.renderingOrder == 5',
    );
    const pont = lire('modules/react-native-room-scan/ios/RoomScan.m');
    expect(pont).toContain(
      'RCT_EXTERN_METHOD(realiteAugmentee:(NSString *)cle',
    );
    const iso = lire('src/components/Iso3DView.tsx');
    expect(iso).toContain('annoncerLaMaquette(cleMaquette)');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('accessibilityLabel="Réalité augmentée"');
  });
});

describe('les plans dans la recherche de l’iPhone', () => {
  afterEach(() => {
    delete natifs.RoomScanRaccourci;
  });

  const PLANS = [
    {
      id: 'a',
      name: 'Maison Martin',
      updatedAt: Date.UTC(2026, 9, 3),
      client: 'M. Martin',
      address: '12 rue des Lilas',
      rooms: [1, 2, 3],
    },
    {
      id: 'b',
      name: 'Brouillon',
      updatedAt: Date.UTC(2026, 9, 4),
      supprimeLe: Date.UTC(2026, 9, 5),
    },
  ];

  it('chaque plan enregistré, avec de quoi le retrouver : client, rue, pièces, date', () => {
    const f = fichesSpotlight(PLANS);
    expect(f).toHaveLength(1);
    expect(f[0].titre).toBe('Maison Martin');
    expect(f[0].description).toContain('M. Martin');
    expect(f[0].description).toContain('12 rue des Lilas');
    expect(f[0].description).toContain('3 pièces');
    expect(f[0].motsCles).toEqual(
      expect.arrayContaining(['EchoPlan', 'M. Martin', '12 rue des Lilas']),
    );
  });

  it('l’index passe au natif, et se tait sans lui', () => {
    expect(() => indexerLesPlans(PLANS)).not.toThrow();
    const indexer = jest.fn();
    natifs.RoomScanRaccourci = { indexer };
    indexerLesPlans(PLANS);
    expect(indexer).toHaveBeenCalledWith(fichesSpotlight(PLANS));
  });

  it('un plan touché dans Spotlight s’ouvre — sans jeter un relevé ni un plan modifié', () => {
    const demande = `${PREFIXE_OUVRIR}abc`;
    expect(suiteDuRaccourci({ demande, screen: 'home', dirty: false })).toEqual(
      { faire: 'ouvrir', id: 'abc' },
    );
    expect(
      suiteDuRaccourci({ demande, screen: 'result', dirty: false }),
    ).toEqual({ faire: 'ouvrir', id: 'abc' });
    expect(
      suiteDuRaccourci({ demande, screen: 'scan', dirty: false }).faire,
    ).toBe('rien');
    expect(
      suiteDuRaccourci({ demande, screen: 'result', dirty: true }).faire,
    ).toBe('dire');
    expect(
      suiteDuRaccourci({
        demande: PREFIXE_OUVRIR,
        screen: 'home',
        dirty: false,
      }).faire,
    ).toBe('rien');
  });

  it('le natif indexe, et l’app reçoit le toucher par le chemin des raccourcis', () => {
    const r = lire(
      'modules/react-native-room-scan/ios/RoomScanRaccourci.swift',
    );
    expect(r).toContain('CSSearchableIndex.default()');
    expect(r).toContain('deleteSearchableItems(withDomainIdentifiers:');
    const app = lire('ios/RoomScanner/AppDelegate.swift');
    expect(app).toContain('CSSearchableItemActionType');
    expect(app).toContain(
      'UserDefaults.standard.set("ouvrir-" + id, forKey: CLE_RACCOURCI)',
    );
    const pod = lire('modules/react-native-room-scan/RoomScan.podspec');
    expect(pod).toContain('"CoreSpotlight"');
    const js = lire('App.tsx');
    expect(js).toContain('indexerLesPlans(saves)');
    expect(js).toContain("suite.faire === 'ouvrir'");
  });
});

describe('le menu « … » parle la langue de l’app', () => {
  it('chaque choix porte une silhouette Solar, pleine, dans sa tuile — plus aucun trait tracé à la main', () => {
    let t!: renderer.ReactTestRenderer;
    act(() => {
      t = renderer.create(
        <ActionSheet
          data={{
            title: 'Plan',
            actions: [
              {
                label: 'Supprimer',
                icon: 'supprimer',
                danger: true,
                onPress: () => {},
              },
              { label: 'Scanner un étage', icon: 'etage', onPress: () => {} },
              {
                label: 'Relever le tableau existant',
                icon: 'tableau',
                onPress: () => {},
              },
            ],
          }}
          onClose={() => {}}
        />,
      );
    });
    const traces = t.root.findAll(
      n => typeof n.props.d === 'string' && n.props.fillRule === 'evenodd',
      { deep: true },
    );
    const ds = traces.map(n => n.props.d as string);
    expect(ds).toEqual(
      expect.arrayContaining([
        SOLAIRES.supprimer,
        SOLAIRES.etage,
        SOLAIRES.tableau,
      ]),
    );
    expect(t.root.findAll(n => n.props.strokeWidth === 2.2).length).toBe(0);
    act(() => t.unmount());
  });

  it('les nouvelles silhouettes viennent du jeu, et une régénération ne redessine pas les anciennes', () => {
    const outil = lire('tools/gen-solaires.mjs');
    expect(outil).toContain('solar.json?icons=');
    expect(outil).toContain("process.argv.includes('--rafraichir')");
    const jeu = lire('src/ui/solaires.ts');
    for (const cle of [
      'renommer',
      'hauteur',
      'sortir',
      'etage',
      'soussol',
      'murer',
      'rouleau',
      'tableau',
    ]) {
      expect(jeu).toMatch(new RegExp(`\\n  ${cle}:\\n`));
    }
    const feuille = lire('src/components/Sheet.tsx');
    expect(feuille).toContain('redetecter: SOLAIRES.baguette');
    expect(feuille).not.toContain(
      'strokeLinecap="round"\n                      strokeLinejoin',
    );
  });
});
