/**
 * SCANNER EST LIBRE, EXPORTER EST PRO.
 *
 * Relevé du patron, avant le lancement : « l'utilisateur doit trouver un
 * intérêt à l'achat ». L'ancienne règle — un seul logement sans abonnement,
 * pas même un étage de plus — ne faisait jamais payer celui qui n'a qu'un
 * appartement, c'est-à-dire presque tout le monde. Le modèle choisi :
 * scanner, mesurer, meubler, explorer et « Ce qu'il faut acheter » sont
 * gratuits et sans limite ; le Pro, c'est ENVOYER son plan (PDF, DXF, 3D,
 * CSV, liste du matériel), le sauvegarder en ligne, et le devis.
 *
 * Ce banc tient les deux moitiés : aucune porte de création ne se ferme
 * plus (étage, sous-sol, copie), et chaque export, lui, se ferme.
 *
 * LES TROIS BOUTONS D'ÉTAGE PASSENT ENCORE PAR `demarrerEtage`, et c'est
 * gardé : si un palier revenait un jour, il n'y aurait qu'une porte à
 * fermer.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoomScan } from 'react-native-room-scan';
import { demarrerEtage } from '../src/native/useRoomScan';
import { PLANS_GRATUITS, useAccountStore } from '../src/store/accountStore';
import { useScanStore } from '../src/store/scanStore';
import {
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';

const st = () => useScanStore.getState();
const compte = () => useAccountStore.getState();

/** Un logement relevé, ouvert à l'écran, et déjà enregistré. */
const unPlanReleve = () => {
  st().reset();
  /*
    LE COMPTEUR REPART DE ZÉRO POUR POSER LE PLAN. Depuis qu'une copie se
    débite, `saveAsCopy` refuse quand le palier est épuisé : sans cette remise
    à zéro, l'épreuve suivante ne pourrait plus poser son logement de départ —
    et elle passerait au vert en n'ayant rien enregistré du tout.
  */
  useAccountStore.setState({ pro: false, plansUtilises: 0, bonusEssais: 0 });
  useScanStore.setState({
    screen: 'result',
    scanName: 'Chantier',
    walls: SNAPSHOT_WALLS,
    openings: SNAPSHOT_OPENINGS,
    objects: SNAPSHOT_OBJECTS,
    rooms: SNAPSHOT_ROOMS.map((r, i) => ({
      id: r.id,
      name: `Pièce ${i + 1}`,
      floor: null,
    })) as never,
    fixtures: [],
    ceiling: [],
    photos: [],
  });
  st().saveAsCopy('Chantier');
};

/** Le palier gratuit, épuisé — un plan enregistré, pas d'abonnement. */
const sansAbonnement = () => {
  useAccountStore.setState({
    pro: false,
    proVia: null,
    plansUtilises: PLANS_GRATUITS,
    bonusEssais: 0,
    surpriseVisible: false,
    paywallVisible: false,
  });
};

beforeEach(() => {
  mockMagasin.clear();
  (RoomScan.start as jest.Mock).mockClear?.();
});

describe('sans abonnement, on scanne autant qu’on veut', () => {
  it('un plan enregistré n’en ferme aucun autre', () => {
    unPlanReleve();
    sansAbonnement();
    expect(compte().peutCreerPlan()).toBe(true);
  });

  it('un étage de plus part au scan, sans offre en travers', async () => {
    unPlanReleve();
    sansAbonnement();
    await demarrerEtage(1);
    expect(st().etageEnCours).toBe(1);
    expect(st().screen).toBe('scan');
    expect(compte().surpriseVisible || compte().paywallVisible).toBe(false);
  });

  it('un sous-sol aussi', async () => {
    unPlanReleve();
    sansAbonnement();
    await demarrerEtage(-1);
    expect(st().screen).toBe('scan');
  });

  it('et une copie se fait — elle se compte, sans rien fermer', () => {
    unPlanReleve();
    sansAbonnement();
    const avant = st().saves.length;
    const compteAvant = compte().plansUtilises;
    st().duplicateSave(st().saves[0].id);
    expect(st().saves).toHaveLength(avant + 1);
    expect(compte().plansUtilises).toBe(compteAvant + 1);
  });
});

describe('les trois boutons d’étage passent tous par la même porte', () => {
  const source = readFileSync(
    join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
    'utf8',
  );

  it('l’écran du plan n’ouvre pas le scan par un autre chemin', () => {
    expect(source).toContain('demarrerEtage(');
    expect(source).not.toContain('scannerUnEtage(');
    expect(source).not.toContain('RoomScan.start(');
  });
});

describe('ce qui se vend : envoyer son plan', () => {
  const avecCompte = (pro: boolean) =>
    useAccountStore.setState({
      compte: { id: 'email:a@b.fr', methode: 'email' },
      invite: false,
      pro,
      proVia: pro ? 'abonnement' : null,
      surpriseVisible: false,
      paywallVisible: false,
      offres: null,
    });

  it('un compte gratuit qui exporte rencontre l’offre, et rien ne part', () => {
    avecCompte(false);
    expect(compte().exportOuvert()).toBe(false);
    expect(compte().surpriseVisible || compte().paywallVisible).toBe(true);
  });

  it('l’abonné exporte sans un mot', () => {
    /* LE CONTRÔLE EN SENS INVERSE : un verrou qui fermerait tout le monde
       passerait l'épreuve du dessus, et l'abonnement ne servirait à rien. */
    avecCompte(true);
    expect(compte().exportOuvert()).toBe(true);
    expect(compte().surpriseVisible || compte().paywallVisible).toBe(false);
  });

  it('chaque export consulte la barrière ; l’image filigranée reste libre', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    for (const f of ['shareObj', 'shareMaterial', 'shareCsv', 'shareDxf']) {
      const corps = src.slice(src.indexOf(`const ${f} = async`), src.indexOf(`const ${f} = async`) + 400);
      expect(`${f} : ${corps.includes('exportOuvert()')}`).toBe(`${f} : true`);
    }
    const image = src.slice(src.indexOf('const shareImage = async'), src.indexOf('const shareObj = async'));
    expect(image).not.toContain('exportOuvert()');
  });

  it('le devis détaillé est Pro : la pastille ouvre l’offre à sa place', () => {
    const src = readFileSync(
      join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'),
      'utf8',
    );
    const i = src.indexOf("setScreen('devis');");
    const avant = src.slice(i - 500, i);
    expect(avant).toContain('.pro');
    expect(avant).toContain('ouvrirSurprise()');
  });
});
