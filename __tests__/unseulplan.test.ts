/**
 * UN SEUL PLAN SANS ABONNEMENT — ET PAS D'ÉTAGE EN PLUS.
 *
 * Relevé du patron : « vérifie que pour un utilisateur pas abonné, il ne peut
 * scanner qu'un seul plan, et même pas ajouter d'étage etc. »
 *
 * CE QUE LA VÉRIFICATION A TROUVÉ. La règle elle-même est juste et tenue par
 * deux bancs (`compte`, `paywall`) : `peutCreerPlan()` rend faux dès qu'un plan
 * a été enregistré. Mais c'est l'OUTIL qui était éprouvé, pas l'OUVRAGE — et
 * CINQ PORTES ne consultaient pas la règle :
 *
 *   — « Scanner un étage de plus », dans le menu des étages ;
 *   — « Scanner un étage » et « Scanner un sous-sol », dans le « … » du plan ;
 *   — « Dupliquer », dans la bibliothèque ;
 *   — « Enregistrer une copie », dans le bandeau du plan.
 *
 * Les trois premières passent toutes par `demarrerEtage` : le palier gratuit se
 * juge donc LÀ, à la porte commune, et non dans chacun des trois boutons — un
 * quatrième bouton demain retomberait sur le même verrou.
 *
 * Les deux dernières créaient une entrée de bibliothèque sans consulter la
 * règle NI la débiter : un plan dupliqué dix fois, c'est dix plans, et le
 * compteur en voyait toujours un. La cinquième est celle qui surprend le plus,
 * parce qu'elle porte le mot « enregistrer » : le geste normal de sauvegarde
 * (`commitCurrent`) débitait bien, sa variante « copie » non.
 *
 * CE QUI RESTE OUVERT, ET C'EST VOULU : « Scanner une pièce ». Une pièce de
 * plus est le MÊME plan — un logement se relève pièce par pièce, c'est le geste
 * normal du premier relevé. Un étage, lui, est un autre niveau : le plan, le
 * métré et le dossier en parlent séparément.
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

const abonne = () => {
  useAccountStore.setState({
    pro: true,
    proVia: 'abonnement',
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

describe('la règle du palier gratuit', () => {
  it('un plan enregistré, et c’est fini', () => {
    st().reset();
    useAccountStore.setState({ pro: false, plansUtilises: 0, bonusEssais: 0 });
    expect(compte().peutCreerPlan()).toBe(true);
    unPlanReleve();
    expect(compte().plansUtilises).toBe(PLANS_GRATUITS);
    expect(compte().peutCreerPlan()).toBe(false);
  });
});

describe('un étage de plus se refuse sans abonnement', () => {
  it('le scan ne part pas, et l’offre s’ouvre à la place', async () => {
    unPlanReleve();
    sansAbonnement();
    await demarrerEtage(1);
    expect(st().etageEnCours).toBeNull();
    expect(st().screen).not.toBe('scan');
    // L'offre à la place de la porte : c'est déjà ce que fait l'accueil.
    expect(compte().surpriseVisible || compte().paywallVisible).toBe(true);
  });

  it('et un sous-sol non plus', async () => {
    unPlanReleve();
    sansAbonnement();
    await demarrerEtage(-1);
    expect(st().screen).not.toBe('scan');
  });

  it('mais un abonné monte son étage', async () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et il porte tout : un verrou qui bloque
      TOUT LE MONDE passerait les deux épreuves du dessus, et l'abonnement ne
      servirait plus à rien.
    */
    unPlanReleve();
    abonne();
    await demarrerEtage(1);
    expect(st().etageEnCours).toBe(1);
    expect(st().screen).toBe('scan');
  });
});

describe('les trois boutons d’étage passent tous par la même porte', () => {
  /*
    LE VERROU EST À LA PORTE COMMUNE, pas dans chaque bouton. Cette épreuve
    tient ce qui rend ce choix sûr : l'écran du plan ne sait lancer un étage
    QUE par `demarrerEtage`. Le jour où quelqu'un appellerait `scannerUnEtage`
    puis `beginScan` à la main, le palier gratuit serait contourné sans qu'une
    seule épreuve de comportement ne bouge.
  */
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

describe('dupliquer un plan compte pour un plan', () => {
  it('sans abonnement, la copie est refusée', () => {
    unPlanReleve();
    sansAbonnement();
    const avant = st().saves.length;
    st().duplicateSave(st().saves[0].id);
    expect(st().saves).toHaveLength(avant);
  });

  it('avec abonnement, elle se fait — et elle se compte', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE, et la moitié du correctif : une copie
      créait une entrée de bibliothèque sans rien débiter. Dupliqué dix fois,
      un plan en faisait dix, et le compteur en voyait toujours un.
    */
    unPlanReleve();
    abonne();
    const avant = st().saves.length;
    const compteAvant = compte().plansUtilises;
    st().duplicateSave(st().saves[0].id);
    expect(st().saves).toHaveLength(avant + 1);
    expect(compte().plansUtilises).toBe(compteAvant + 1);
  });
});
