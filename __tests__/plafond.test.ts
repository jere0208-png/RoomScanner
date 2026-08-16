jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

/**
 * Le plafond, et LE TRAIT QUI DIT QUI COMMANDE QUOI.
 *
 * Le plan coté dit où sont les murs, la liste dit ce qu'il faut acheter ;
 * aucun des deux ne dit quel interrupteur allume quel point lumineux. C'est
 * pourtant la seule question qui reste une fois les gaines tirées, et celle
 * qui coûte une matinée quand personne n'y a répondu par écrit.
 *
 * On vérifie ici les trois choses dont dépend ce plan : la géométrie du lien
 * (une courbe, pas une droite, et qui s'arrête au bord du symbole), le
 * bilan par pièce, et la feuille PDF elle-même.
 */
import {
  CEILINGS,
  CEILING_KINDS,
  CEILING_SYMBOL,
  lightingLoad,
  linkAnchor,
  linkCurve,
  type CeilingFixture,
} from '../src/geometry/ceiling';
import { buildScanPdf } from '../src/export/pdf';
import type { WallSeg } from '../src/geometry/floorplan';
import type { Fixture } from '../src/geometry/electrical';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const W: WallSeg[] = [
  mur('n', 0, 0, 5, 0),
  mur('e', 5, 0, 5, 4),
  mur('s', 5, 4, 0, 4),
  mur('w', 0, 4, 0, 0),
];
const R = [{ id: 'r1', name: 'Séjour', wallIds: W.map((w) => w.id) }];
const FX: Fixture[] = [
  { id: 'i1', kind: 'inter', wallId: 'n', along: 0.4, height: 1.1, side: 1 },
  { id: 'i2', kind: 'va', wallId: 's', along: 0.4, height: 1.1, side: 1 },
];
const PLAFOND: CeilingFixture[] = [
  { id: 'p1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 }, commands: ['i1', 'i2'] },
  { id: 'p2', kind: 'daaf', roomId: 'r1', at: { x: 1, z: 1 } },
  { id: 'p3', kind: 'spot', roomId: 'r1', at: { x: 4, z: 3 }, commands: ['i1'] },
];

describe('le catalogue du plafond', () => {
  it('chaque appareil a son symbole et sa note', () => {
    for (const k of CEILING_KINDS) {
      expect(CEILING_SYMBOL[k].length).toBeGreaterThan(0);
      expect(CEILINGS[k].note.length).toBeGreaterThan(20);
      expect(CEILINGS[k].d).toBeGreaterThan(0.05);
    }
  });

  it('ce qui n’éclaire pas ne se commande pas', () => {
    // Un détecteur de fumée n'a pas d'interrupteur, et une VMC non plus.
    expect(CEILINGS.daaf.commandable).toBe(false);
    expect(CEILINGS.vmc.commandable).toBe(false);
    expect(CEILINGS.dcl.commandable).toBe(true);
  });
});

describe('le lien de commande', () => {
  const a = { x: 0.4, z: 0.16 };
  const b = { x: 2.5, z: 2 };

  it('s’arrête AU BORD du symbole, pas en son centre', () => {
    // Un trait qui finit au milieu d'une croix la barre et la rend
    // illisible : c'est le symbole qu'on doit reconnaître, pas le trait.
    const bout = linkAnchor(a, b, 0.15);
    const reste = Math.hypot(b.x - bout.x, b.z - bout.z);
    expect(reste).toBeCloseTo(0.15, 6);
  });

  it('est une COURBE : on ne le confond ni avec une cote ni avec une gaine', () => {
    const pts = linkCurve(a, b);
    expect(pts.length).toBeGreaterThan(6);
    // Le milieu s'écarte franchement de la corde.
    const m = pts[Math.floor(pts.length / 2)];
    const droite = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    expect(Math.hypot(m.x - droite.x, m.z - droite.z)).toBeGreaterThan(0.1);
    // Mais il part et arrive bien où il faut.
    expect(pts[0].x).toBeCloseTo(a.x, 6);
    expect(pts[pts.length - 1].x).toBeCloseTo(b.x, 6);
  });

  it('deux liens partant du même point ne se superposent pas', () => {
    const c = { x: 4, z: 3 };
    const u = linkCurve(a, b);
    const v = linkCurve(a, c);
    const mu = u[6];
    const mv = v[6];
    expect(Math.hypot(mu.x - mv.x, mu.z - mv.z)).toBeGreaterThan(0.3);
  });
});

describe('le bilan par pièce', () => {
  it('compte les points lumineux, pas les détecteurs', () => {
    const load = lightingLoad(PLAFOND).get('r1')!;
    // DCL + spot = deux points ; le détecteur de fumée n'éclaire rien.
    expect(load.points).toBe(2);
    expect(load.watts).toBe(CEILINGS.dcl.watts + CEILINGS.spot.watts);
  });
});

describe('la feuille d’implantation', () => {
  const latin1 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  };
  const doc = (ceiling?: CeilingFixture[]) =>
    latin1(
      buildScanPdf(
        { name: 'Séjour', walls: W, openings: [], objects: [], rooms: R, fixtures: FX },
        false,
        { metre: false, ceiling },
      ),
    );
  const texte = (src: string) =>
    (src.match(/\(((?:[^()\\]|\\.)*)\) Tj/g) ?? [])
      .map((m) => m.slice(1, m.lastIndexOf(')')))
      .join(' | ');

  it('n’existe que si le plafond est équipé', () => {
    const pages = (src: string) => (src.match(/\/Type \/Page /g) ?? []).length;
    expect(pages(doc(PLAFOND))).toBe(pages(doc()) + 1);
    expect(texte(doc())).not.toContain('implantation');
  });

  it('porte les appareils, leur sigle et la légende du lien', () => {
    const vu = texte(doc(PLAFOND));
    expect(vu).toContain('implantation');
    expect(vu).toContain('DCL');
    expect(vu).toContain('DAAF');
    expect(vu).toContain('Lien de commande');
  });

  it('garde les cotes du plan : un point lumineux se pose au mètre près', () => {
    expect(texte(doc(PLAFOND))).toMatch(/5,00 m/);
  });

  it('et rien ne sort de la feuille', () => {
    const src = doc(PLAFOND);
    const re = /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (m|l) /g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      expect(parseFloat(m[1])).toBeGreaterThanOrEqual(-1);
      expect(parseFloat(m[1])).toBeLessThanOrEqual(596.28);
      expect(parseFloat(m[2])).toBeGreaterThanOrEqual(-1);
      expect(parseFloat(m[2])).toBeLessThanOrEqual(842.89);
    }
  });
});

/**
 * La liaison, dans le store : c'est elle qu'on manipule au doigt.
 *
 * Un point lumineux peut être allumé par une commande, par deux — c'est un
 * va-et-vient — et une même commande peut allumer plusieurs points. Le
 * modèle doit tenir les trois cas sans rien perdre, et savoir défaire.
 */
describe('relier une commande à un point', () => {
  const poser = () => {
    useScanStore.setState({
      walls: W,
      openings: [],
      rooms: R,
      objects: [],
      fixtures: FX,
      photos: [],
      ceiling: [
        { id: 'p1', kind: 'dcl', roomId: 'r1', at: { x: 2.5, z: 2 } },
        { id: 'p2', kind: 'spot', roomId: 'r1', at: { x: 4, z: 3 } },
      ],
    });
  };

  it('un interrupteur allume un point', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual(['i1']);
  });

  it('deux commandes pour un point : le va-et-vient', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    useScanStore.getState().toggleCeilingCommand('p1', 'i2');
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual(['i1', 'i2']);
  });

  it('une commande peut allumer plusieurs points', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    useScanStore.getState().toggleCeilingCommand('p2', 'i1');
    const cl = useScanStore.getState().ceiling;
    expect(cl[0].commands).toEqual(['i1']);
    expect(cl[1].commands).toEqual(['i1']);
  });

  it('le même geste défait le lien', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual([]);
  });

  it('et un retour en arrière rétablit ce qui était lié', () => {
    poser();
    useScanStore.getState().toggleCeilingCommand('p1', 'i1');
    jest.advanceTimersByTime(2000);
    useScanStore.getState().toggleCeilingCommand('p1', 'i2');
    useScanStore.getState().undo();
    const cl = useScanStore.getState().ceiling.find((c) => c.id === 'p1')!;
    expect(cl.commands).toEqual(['i1']);
  });
});
