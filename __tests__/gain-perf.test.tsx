/**
 * LOT « GAINS RAPIDES — PERFORMANCE ».
 *
 *   1. Lâcher un meuble ne refait plus les arêtes de la visite : elles se
 *      gardent tant que le bâti ne bouge pas, et leur calcul saute les
 *      voisins hors de la boîte du côté. Sortie STRICTEMENT égale à celle
 *      d'avant (avis de l'architecte) : l'ancien calcul est recopié ici, tel
 *      quel, pour servir de témoin.
 *   2. Devis : un « + » ne redessine que la ligne touchée.
 *   3. L'écran du plan ne se redessine plus quand la bibliothèque bouge sans
 *      toucher au plan ouvert.
 *   4. Lancement : plans et réglages lus d'un seul appel (`getMany`, la
 *      surface d'AsyncStorage 3), un seul `set` pour les réglages.
 */
const mockDisque = new Map<string, string>();
const mockAppels = { getItem: [] as string[], getMany: 0, multiGet: 0 };
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    mockAppels.getItem.push(k);
    return mockDisque.get(k) ?? null;
  }),
  setItem: jest.fn(async (k: string, v: string) => {
    mockDisque.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockDisque.delete(k);
  }),
  // LA SURFACE D'ASYNCSTORAGE 3 : `getMany` / `setMany` / `removeMany`, pas de `multiGet`.
  getMany: jest.fn(async (cles: string[]) => {
    mockAppels.getMany++;
    const out: Record<string, string | null> = {};
    for (const k of cles) out[k] = mockDisque.get(k) ?? null;
    return out;
  }),
  setMany: jest.fn(async (e: Record<string, string>) => {
    for (const [k, v] of Object.entries(e)) mockDisque.set(k, v);
  }),
  removeMany: jest.fn(async (cles: string[]) => {
    for (const k of cles) mockDisque.delete(k);
  }),
  getAllKeys: jest.fn(async () => [...mockDisque.keys()]),
}));

// Chaque vignette d'une ligne du devis demande sa photo : un appel par ligne dessinée.
const mockPhotos = jest.fn();
jest.mock('../src/ui/produits', () => {
  const vrai = jest.requireActual('../src/ui/produits');
  return {
    ...vrai,
    photoDe: (code: string) => {
      mockPhotos(code);
      return vrai.photoDe(code);
    },
  };
});

/* QUI SE REND — comme `maj-plan2d` : chaque composant lit sa palette en tête de rendu. */
jest.mock('../src/theme', () => {
  const vrai = jest.requireActual('../src/theme');
  return {
    ...vrai,
    useTheme: () => {
      const g = globalThis as unknown as { __rendus?: Map<string, number> };
      if (g.__rendus) {
        const ligne = (new Error().stack ?? '').split('\n')[2] ?? '';
        const nom = /at (\w+)/.exec(ligne)?.[1] ?? '?';
        g.__rendus.set(nom, (g.__rendus.get(nom) ?? 0) + 1);
      }
      return vrai.useTheme();
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { appartementExemple } from '../src/data/exemple';
import { buildScene, type P3 } from '../src/geometry/scene3d';
import { maillageDeLaMaquette } from '../src/geometry/maquette3d';
import {
  aretesDuBati,
  maillageDeLaVisite,
  normaleDuContour,
  oublierLesAretesGardees,
} from '../src/geometry/visite3d';
import { chiffrerLePlan } from '../src/geometry/devisplan';
import type { Fixture, FixtureKind } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';
import { GAMMES } from '../src/geometry/prix';
import { ATTENTE_MIN } from '../src/components/PrixQuiSActualisent';
import { DevisScreen, memeArticle } from '../src/screens/DevisScreen';
import { ResultScreen } from '../src/screens/ResultScreen';
import { useAccountStore } from '../src/store/accountStore';
import { finirLeGeste } from '../src/store/geste';
import { atterrir } from '../src/store/planEnVol';
import { resetPersistCache, useScanStore, type SavedScan } from '../src/store/scanStore';
import { useUsage } from '../src/store/usage';
import { MAQUETTE } from '../src/ui/maquette';

beforeAll(() => jest.useFakeTimers({ doNotFake: ['hrtime', 'performance'] }));
afterAll(() => jest.useRealTimers());

const st = () => useScanStore.getState();
const g = globalThis as unknown as { __rendus?: Map<string, number> };
let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  g.__rendus = undefined;
  atterrir();
  finirLeGeste();
});

/** Les rendus de chaque composant pendant `f`. */
function compter(f: () => void) {
  g.__rendus = new Map();
  f();
  const r = g.__rendus;
  g.__rendus = undefined;
  return { de: (nom: string) => r.get(nom) ?? 0 };
}

/* ------------------------------------------------------------------------ */
/* LE TÉMOIN : le calcul des arêtes tel qu'il était avant ce lot, recopié.   */
/* ------------------------------------------------------------------------ */
function aretesDeReference(polysBruts: { pts: P3[]; n: P3 }[]): number[] {
  const TOL = 0.005;
  const CASE = 0.5;
  /*
    DES NORMALES DE LONGUEUR UN — relevé du patron, sur capture : « il y a
    toujours au-dessus des ouvrants les traits verticaux ». La normale d'un
    contour (`normaleDuContour`) a la longueur de son aire : deux pans d'un
    même plan, petits, avaient un produit scalaire bien sous le seuil — ils
    passaient pour un angle, et chaque joint de linteau laissait son trait.
  */
  const polys = polysBruts.map(({ pts, n }) => {
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    return { pts, n: { x: n.x / l, y: n.y / l, z: n.z / l } };
  });
  // Tous les côtés de toutes les faces, avec la normale de leur face.
  const cotes: { a: P3; b: P3; n: P3; f: number }[] = [];
  const centres: P3[] = polys.map(({ pts }) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const p of pts) {
      x += p.x;
      y += p.y;
      z += p.z;
    }
    return { x: x / pts.length, y: y / pts.length, z: z / pts.length };
  });
  polys.forEach(({ pts, n }, f) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) >= 0.02) cotes.push({ a, b, n, f });
    }
  });
  // Une grille de cases d'un demi-mètre : on ne compare que des voisins.
  const caseDe = (v: number) => Math.floor(v / CASE);
  const cleCase = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const grille = new Map<string, number[]>();
  const casesDe = (a: P3, b: P3, cb: (k: string) => void) => {
    for (let i = caseDe(Math.min(a.x, b.x) - TOL); i <= caseDe(Math.max(a.x, b.x) + TOL); i++) {
      for (let j = caseDe(Math.min(a.y, b.y) - TOL); j <= caseDe(Math.max(a.y, b.y) + TOL); j++) {
        for (let k = caseDe(Math.min(a.z, b.z) - TOL); k <= caseDe(Math.max(a.z, b.z) + TOL); k++) cb(cleCase(i, j, k));
      }
    }
  };
  cotes.forEach((c, idx) => {
    casesDe(c.a, c.b, (k) => {
      const l = grille.get(k);
      if (l) l.push(idx);
      else grille.set(k, [idx]);
    });
  });
  const distAuSegment = (p: P3, a: P3, b: P3): { d: number; t: number } => {
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const uz = b.z - a.z;
    const l2 = ux * ux + uy * uy + uz * uz;
    const t = l2 > 0 ? ((p.x - a.x) * ux + (p.y - a.y) * uy + (p.z - a.z) * uz) / l2 : 0;
    const tc = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(a.x + ux * tc - p.x, a.y + uy * tc - p.y, a.z + uz * tc - p.z), t };
  };
  const voisins = (a: P3, b: P3): Set<number> => {
    const out = new Set<number>();
    casesDe(a, b, (k) => {
      for (const idx of grille.get(k) ?? []) out.add(idx);
    });
    return out;
  };
  /*
    LES JOINTS EN T. Le linteau au-dessus d'une porte touche le pan de mur
    voisin sur une partie seulement de sa hauteur : leurs côtés ne partagent
    pas leurs extrémités. Chaque côté se coupe donc aux sommets des faces
    voisines qui tombent dessus, et chaque tronçon se juge à son milieu.

    UN JOINT AU MILIEU D'UNE SURFACE PLATE NE LAISSE PAS DE TRAIT — relevé du
    patron : « des arêtes sont au-dessus des ouvrants, il ne devrait pas y en
    avoir ». Le linteau est un bloc : ses bouts, cachés dans l'épaisseur du
    mur contre le pan voisin, faisaient croire à un angle. Dès que deux faces
    d'un même plan se trouvent de part et d'autre d'un tronçon, la surface
    continue : ce qui est derrière ne compte pas.
  */
  const vus = new Set<string>();
  const cle = (p: P3) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)},${Math.round(p.z * 100)}`;
  const out: number[] = [];
  for (const c of cotes) {
    const proches = voisins(c.a, c.b);
    const coupes = [0, 1];
    for (const idx of proches) {
      for (const p of [cotes[idx].a, cotes[idx].b]) {
        const { d, t } = distAuSegment(p, c.a, c.b);
        if (d < TOL && t > 0.001 && t < 0.999) coupes.push(t);
      }
    }
    coupes.sort((x, y) => x - y);
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const dz = c.b.z - c.a.z;
    for (let k = 0; k + 1 < coupes.length; k++) {
      const t0 = coupes[k];
      const t1 = coupes[k + 1];
      if (t1 - t0 < 1e-3) continue;
      const at = (t: number) => ({ x: c.a.x + dx * t, y: c.a.y + dy * t, z: c.a.z + dz * t });
      const a = at(t0);
      const b = at(t1);
      if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < 0.02) continue;
      const ka = cle(a);
      const kb = cle(b);
      const k2 = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (vus.has(k2)) continue;
      vus.add(k2);
      const m = at((t0 + t1) / 2);
      // Les faces qui touchent ce tronçon en son milieu.
      const touchees: number[] = [];
      for (const idx of voisins(m, m)) {
        const o = cotes[idx];
        if (touchees.includes(o.f)) continue;
        if (distAuSegment(m, o.a, o.b).d < TOL) touchees.push(o.f);
      }
      // Une surface plate qui continue de part et d'autre : un joint.
      let joint = false;
      for (let i = 0; i < touchees.length && !joint; i++) {
        const p = polys[touchees[i]].n;
        // Le côté de la face, dans son plan : de quel côté du tronçon est son centre.
        const cote = (f: number) => {
          const n = polys[f].n;
          const sx = n.y * dz - n.z * dy;
          const sy = n.z * dx - n.x * dz;
          const sz = n.x * dy - n.y * dx;
          const q = centres[f];
          return (q.x - m.x) * sx + (q.y - m.y) * sy + (q.z - m.z) * sz;
        };
        for (let j = i + 1; j < touchees.length && !joint; j++) {
          const q = polys[touchees[j]].n;
          if (p.x * q.x + p.y * q.y + p.z * q.z < 0.94) continue;
          if (cote(touchees[i]) * cote(touchees[j]) < 0) joint = true;
        }
      }
      if (joint) continue;
      const normales = touchees.map((f) => polys[f].n);
      if (normales.length >= 2) {
        let pli = false;
        for (let i = 1; i < normales.length && !pli; i++) {
          const p = normales[0];
          const q = normales[i];
          if (p.x * q.x + p.y * q.y + p.z * q.z < 0.94) pli = true;
        }
        if (!pli) continue;
      }
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (const q of normales) {
        mx += q.x;
        my += q.y;
        mz += q.z;
      }
      const l = Math.hypot(mx, my, mz) || 1;
      const d = 0.004 / l;
      out.push(a.x + mx * d, a.y + my * d, a.z + mz * d, b.x + mx * d, b.y + my * d, b.z + mz * d);
    }
  }
  return out;
}


/** Les faces du bâti de l'exemple, telles que la visite les reçoit. */
function scene(objets?: ReturnType<typeof appartementExemple>['objects']) {
  const ex = appartementExemple();
  return buildScene(ex.walls, ex.openings, objets ?? ex.objects, {
    palette: MAQUETTE,
    showSurfaces: true,
    plafonds: true,
    rooms: ex.rooms,
  });
}
const polysDe = (faces: ReturnType<typeof scene>['faces']) =>
  faces
    .filter((f) => f.pts.length >= 3 && f.fill && !f.ombre && !f.meuble && !f.appareil)
    .map((f) => ({ pts: f.pts, n: normaleDuContour(f.pts) }));

describe('1. les arêtes de la visite', () => {
  beforeEach(() => oublierLesAretesGardees());

  it('le préfiltre rend STRICTEMENT les mêmes arêtes que le calcul d’avant (exemple complet)', () => {
    const polys = polysDe(scene().faces);
    expect(polys.length).toBeGreaterThan(100);
    const avant = aretesDeReference(polys);
    const apres = aretesDuBati(polys);
    expect(apres.length).toBeGreaterThan(0);
    expect(apres).toEqual(avant);
  });

  it('les mêmes arêtes aussi sur les maillages de la visite et de la maquette', () => {
    const { faces } = scene();
    const visite = maillageDeLaVisite(faces, { sansMeubles: true });
    const maquette = maillageDeLaMaquette(faces, { sansMeubles: true });
    // Le témoin, sur les mêmes faces que la visite (normales tournées comme elle).
    const tourner = (plafonds: boolean) =>
      faces
        .filter(
          (f) =>
            f.pts.length >= 3 &&
            f.fill &&
            !f.ombre &&
            !f.meuble &&
            !f.appareil &&
            !f.enVolume &&
            !f.habillage?.length &&
            (plafonds || !f.isCeiling),
        )
        .map((f) => {
          const voulue: P3 | null = f.isFloor ? { x: 0, y: 1, z: 0 } : f.isCeiling ? { x: 0, y: -1, z: 0 } : f.normal ?? null;
          const n = normaleDuContour(f.pts);
          const envers = voulue && n.x * voulue.x + n.y * voulue.y + n.z * voulue.z < 0;
          return { pts: f.pts, n: envers ? { x: -n.x, y: -n.y, z: -n.z } : n };
        });
    expect(visite.aretes).toEqual(aretesDeReference(tourner(true)));
    expect(maquette.aretes.length).toBeGreaterThan(0);
  });

  it('des joints en T et des pans coplanaires : même sortie que le témoin', () => {
    const pan = (x0: number, x1: number, y0: number, y1: number) => ({
      pts: [
        { x: x0, y: y0, z: 0 },
        { x: x1, y: y0, z: 0 },
        { x: x1, y: y1, z: 0 },
        { x: x0, y: y1, z: 0 },
      ],
      n: { x: 0, y: 0, z: 3 },
    });
    const retour = {
      pts: [
        { x: 2, y: 0, z: 0 },
        { x: 2, y: 0, z: 0.2 },
        { x: 2, y: 2.5, z: 0.2 },
        { x: 2, y: 2.5, z: 0 },
      ],
      n: { x: 0.5, y: 0, z: 0 },
    };
    const polys = [pan(0, 0.9, 0, 2.5), pan(0.9, 1.8, 2.1, 2.5), pan(1.8, 2, 0, 2.5), retour];
    expect(aretesDuBati(polys)).toEqual(aretesDeReference(polys));
  });

  it('lâcher un meuble : le bâti n’a pas bougé, les arêtes ne se refont pas', () => {
    const ex = appartementExemple();
    const un = maillageDeLaVisite(scene().faces, { sansMeubles: true });
    // Le premier meuble, poussé de quarante centimètres.
    const deplaces = ex.objects.map((o, i) => {
      if (i !== 0) return o;
      const t = [...o.transform];
      t[12] += 0.4;
      return { ...o, transform: t };
    });
    const deux = maillageDeLaVisite(scene(deplaces).faces, { sansMeubles: true });
    // Le même tableau : rien n'a été recalculé.
    expect(deux.aretes).toBe(un.aretes);
  });

  it('un mur qui bouge refait les arêtes, et la maquette garde les siennes à côté', () => {
    const polys = polysDe(scene().faces);
    const a = aretesDuBati(polys);
    // La maquette (une autre liste de faces) ne chasse pas la visite.
    const sansPlafond = polys.slice(1);
    const b = aretesDuBati(sansPlafond);
    expect(aretesDuBati(polys)).toBe(a);
    expect(aretesDuBati(sansPlafond)).toBe(b);
    // Un sommet déplacé d'un millimètre : on recalcule.
    const bouge = polys.map((p, i) => (i === 0 ? { ...p, pts: p.pts.map((q) => ({ ...q, x: q.x + 0.001 })) } : p));
    const c = aretesDuBati(bouge);
    expect(c).not.toBe(a);
    expect(c).toEqual(aretesDeReference(bouge));
  });
});

/* ------------------------------------------------------------------------ */
describe('2. devis : un « + » ne redessine que sa ligne', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
    id,
    type: 'wall',
    a: { x: ax, z: az },
    b: { x: bx, z: bz },
    height: 2.5,
    yCenter: 1.25,
    roomId: 'r1',
  });
  const MURS = [mur('n', 0, 0, 5, 0), mur('e', 5, 0, 5, 4), mur('s', 5, 4, 0, 4), mur('o', 0, 4, 0, 0)];
  const fx = (id: string, kind: FixtureKind, along: number): Fixture => ({
    id,
    kind,
    wallId: 'n',
    along,
    height: kind === 'inter' ? 1.1 : 0.25,
    side: 1,
  });
  const APPAREILS: Fixture[] = [
    fx('p1', 'prise', 0.6),
    fx('p2', 'prise', 1.2),
    fx('p3', 'prise', 2.2),
    fx('i1', 'inter', 3),
    fx('l1', 'rj45', 2.5),
    fx('tb', 'tableau', 4.8),
  ];
  const ROOMS = [{ id: 'r1', name: 'Séjour', floor: null }];

  it('le comparateur : même contenu, objets neufs → pas de rendu ; une quantité changée → rendu', () => {
    const d1 = chiffrerLePlan(MURS, ROOMS as never, APPAREILS, [], GAMMES[0].id, undefined, []);
    const d2 = chiffrerLePlan(MURS, ROOMS as never, APPAREILS, [], GAMMES[0].id, undefined, []);
    const l1 = d1.lignes.find((l) => l.offres && l.offres.length > 0) ?? d1.lignes[0];
    const l2 = d2.lignes.find((l) => l.code === l1.code && l.libelle === l1.libelle)!;
    expect(l2).not.toBe(l1);
    const f = () => {};
    const base = { styles: {} as never, couleurs: {} as never, onBasculer: f, onMoins: f, onPlus: f, onPrix: f };
    const vente = (l: typeof l1) => ({ ligne: l, puHt: 10, brutHt: 20, totalHt: 20, auCoefficient: false });
    expect(memeArticle({ ...base, ligne: l1, vente: vente(l1) }, { ...base, ligne: l2, vente: vente(l2) })).toBe(true);
    expect(memeArticle({ ...base, ligne: l1 }, { ...base, ligne: { ...l2, quantite: l2.quantite + 1 } })).toBe(false);
    expect(
      memeArticle({ ...base, ligne: l1, vente: vente(l1) }, { ...base, ligne: l2, vente: { ...vente(l2), totalHt: 30 } }),
    ).toBe(false);
    // Un rappel différent, un prix d'achat différent : on redessine.
    expect(memeArticle({ ...base, ligne: l1 }, { ...base, ligne: l2, onPlus: () => {} })).toBe(false);
    expect(memeArticle({ ...base, ligne: l1, pro: { pu: 1, designation: 'a', par: 'ref' } }, { ...base, ligne: l2, pro: { pu: 2, designation: 'a', par: 'ref' } })).toBe(false);
  });

  it('sur la page : « + » ne redessine que sa ligne, et le prix d’une autre ligne s’ouvre juste', async () => {
    useAccountStore.setState({ pro: true, plansUtilises: 0, bonusEssais: 0 } as never);
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      useScanStore.setState({
        walls: MURS,
        openings: [],
        objects: [],
        rooms: ROOMS as never,
        fixtures: APPAREILS,
        ceiling: [],
        photos: [],
        notes: [],
        niveauCourant: 0,
        screen: 'devis',
        gammeDevis: GAMMES[0].id,
        devisEcartes: [],
        devisQuantites: {},
        devisAjouts: [],
        devisPrix: {},
        etapeDevis: 0,
      } as never);
      t = TestRenderer.create(<DevisScreen />);
    });
    arbre = t;
    const mesurer = () =>
      act(() => {
        for (const n of t.root.findAllByType(View)) {
          if (typeof n.props.onLayout === 'function') {
            n.props.onLayout({ nativeEvent: { layout: { width: 360, height: 240 } } });
          }
        }
      });
    mesurer();
    const boutons = (nom: string) =>
      t.root.findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          typeof n.type !== 'string' &&
          String(n.props?.accessibilityLabel ?? '').startsWith(nom),
      );
    act(() => boutons('Voir le prix').pop()!.props.onPress());
    await act(async () => {
      jest.advanceTimersByTime(ATTENTE_MIN + 50);
    });
    mesurer();
    const plus = boutons('Un ').filter((b) => String(b.props.accessibilityLabel).endsWith(' de plus'));
    // Une ligne par libellé (le bouton composite et son hôte portent le même libellé).
    const libelles = [...new Set(plus.map((b) => String(b.props.accessibilityLabel)))];
    expect(libelles.length).toBeGreaterThanOrEqual(3);
    const premier = libelles[0].replace(/^Un /, '').replace(/ de plus$/, '');
    const avant = Object.keys(st().devisQuantites).length;
    mockPhotos.mockClear();
    act(() => plus[0].props.onPress());
    // La quantité a bien bougé…
    expect(Object.keys(st().devisQuantites).length + st().devisAjouts.length).toBeGreaterThan(avant);
    // … et seule la ligne touchée a redemandé sa vignette (une ligne : un ou deux appels).
    expect(mockPhotos.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mockPhotos.mock.calls.length).toBeLessThan(libelles.length);

    // Le prix d'une AUTRE ligne, restée telle quelle : le champ s'ouvre sur son prix.
    const modifier = boutons('Modifier le prix').filter((b) => !String(b.props.accessibilityLabel).endsWith(premier));
    expect(modifier.length).toBeGreaterThan(0);
    act(() => modifier[0].props.onPress());
    const champ = t.root.findAllByType(TextInput).filter((x) => typeof x.props.onSubmitEditing === 'function').pop()!;
    expect(String(champ.props.value)).toMatch(/^\d+,\d{2}$/);
  });
});

/* ------------------------------------------------------------------------ */
describe('3. l’écran du plan et la bibliothèque', () => {
  const plan = (id: string, updatedAt: number, extra: Partial<SavedScan> = {}): SavedScan =>
    ({
      id,
      name: `Plan ${id}`,
      createdAt: 1_000,
      updatedAt,
      modelPath: null,
      walls: [],
      openings: [],
      objects: [],
      rooms: [],
      ...extra,
    }) as SavedScan;

  it('la bibliothèque qui bouge sans toucher au plan ouvert ne redessine pas l’écran', () => {
    useUsage.setState({ modeElec: false, charge: true, choisi: true });
    act(() => {
      st().ouvrirExemple();
    });
    const quand = new Date(2026, 9, 17, 9, 5).getTime();
    act(() => {
      useScanStore.setState({ saves: [plan('ouvert', quand), plan('autre', 2_000)], currentSaveId: 'ouvert', dirty: false });
    });
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ResultScreen />);
    });
    arbre = tree;
    const textes = () => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
    expect(textes().some((m) => m.startsWith('Dernière MAJ : ') && m.endsWith('09h05'))).toBe(true);

    // Une réécriture de la liste, un autre plan modifié : l'écran ne bouge pas.
    const r = compter(() =>
      act(() => {
        const [ouvert, autre] = st().saves;
        useScanStore.setState({ saves: [ouvert, { ...autre, updatedAt: 3_000, name: 'Renommé' }] });
      }),
    );
    expect(r.de('ResultScreen')).toBe(0);

    // Le plan ouvert, lui, se redate : l'écran le dit.
    const plusTard = new Date(2026, 9, 17, 10, 40).getTime();
    const r2 = compter(() =>
      act(() => {
        const [ouvert, autre] = st().saves;
        useScanStore.setState({ saves: [{ ...ouvert, updatedAt: plusTard }, autre] });
      }),
    );
    expect(r2.de('ResultScreen')).toBeGreaterThan(0);
    expect(textes().some((m) => m.startsWith('Dernière MAJ : ') && m.endsWith('10h40'))).toBe(true);
  });

  it('le plan ouvert passe à la corbeille : l’écran le voit sans lire toute la bibliothèque', () => {
    useUsage.setState({ modeElec: true, charge: true, choisi: true });
    act(() => {
      st().ouvrirExemple();
    });
    act(() => {
      useScanStore.setState({ saves: [plan('ouvert', 5_000)], currentSaveId: 'ouvert', dirty: true });
    });
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ResultScreen />);
    });
    arbre = tree;
    const textes = () => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
    // Un plan client retouché, en mode Électricité : il attend la décision.
    expect(textes()).toContain('Modifications non enregistrées');
    // Gardé douze heures (corbeille) : c'est lui tout entier qui attend, et s'enregistre seul.
    act(() => {
      useScanStore.setState({ saves: [plan('ouvert', 5_000, { supprimeLe: 9_000 })] });
    });
    expect(textes()).toContain('Enregistrement automatique…');
    act(() => {
      useScanStore.setState({ saves: [plan('ouvert', 5_000)] });
    });
    expect(textes()).toContain('Modifications non enregistrées');
  });
});

/* ------------------------------------------------------------------------ */
describe('4. le lancement lit plans et réglages d’un seul appel', () => {
  const INDEX = 'roomscanner.index.v2';
  const cle = (id: string) => `roomscanner.scan.v2.${id}`;
  const REGLAGES = [
    'roomscanner.themePref.v1',
    'roomscanner.accentPref.v1',
    'roomscanner.iconePref.v1',
    'roomscanner.openingColors.v1',
    'roomscanner.showFurniture.v1',
    'roomscanner.showSurfaces.v1',
    'roomscanner.showTextures.v1',
  ];
  const ranger = (n: number) => {
    mockDisque.clear();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `p${i}`;
      ids.push(id);
      mockDisque.set(
        cle(id),
        JSON.stringify({ id, name: `Chantier ${i}`, createdAt: 1_000, updatedAt: 1_000 + i, modelPath: null, walls: [], openings: [], objects: [], rooms: [] }),
      );
    }
    mockDisque.set(INDEX, JSON.stringify(ids));
    mockDisque.set('roomscanner.themePref.v1', 'dark');
    mockDisque.set('roomscanner.accentPref.v1', 'graphite');
    mockDisque.set('roomscanner.showFurniture.v1', '0');
    mockDisque.set('roomscanner.showTextures.v1', '1');
    // Une valeur abîmée : ignorée, comme avant.
    mockDisque.set('roomscanner.showSurfaces.v1', 'peut-être');
  };
  const relancer = async () => {
    resetPersistCache();
    mockAppels.getItem = [];
    mockAppels.getMany = 0;
    await act(async () => {
      await st().loadSaves();
    });
  };
  const stockage = AsyncStorage as unknown as Record<string, unknown>;

  it('trente plans : aucun plan ni réglage lu un par un (surface d’AsyncStorage 3)', async () => {
    ranger(30);
    useScanStore.setState({ themePref: 'system', showFurniture: true, showSurfaces: true, showTextures: false } as never);
    await relancer();
    expect(st().saves.length).toBe(30);
    // Un lot pour les réglages, un pour les plans.
    expect(mockAppels.getMany).toBe(2);
    expect(mockAppels.getItem.filter((k) => k.startsWith('roomscanner.scan.v2.'))).toEqual([]);
    expect(mockAppels.getItem.filter((k) => REGLAGES.includes(k))).toEqual([]);
    // Les réglages valables sont posés, l'abîmé ignoré.
    expect(st().themePref).toBe('dark');
    expect(st().accentPref).toBe('graphite');
    expect(st().showFurniture).toBe(false);
    expect(st().showTextures).toBe(true);
    expect(st().showSurfaces).toBe(true);
  });

  it('un seul réveil du magasin pour les sept réglages', async () => {
    ranger(2);
    const reveils: string[][] = [];
    const desabonner = useScanStore.subscribe((apres, avant) => {
      const changes = (['themePref', 'accentPref', 'showFurniture', 'showTextures'] as const).filter(
        (k) => apres[k] !== avant[k],
      );
      if (changes.length) reveils.push([...changes]);
    });
    useScanStore.setState({ themePref: 'system', accentPref: 'indigo', showFurniture: true, showTextures: false } as never);
    reveils.length = 0;
    await relancer();
    desabonner();
    expect(reveils).toEqual([['themePref', 'accentPref', 'showFurniture', 'showTextures']]);
  });

  it('le stockage refuse le lot : la boucle prend le relais, rien n’est perdu', async () => {
    ranger(5);
    const vrai = stockage.getMany;
    stockage.getMany = jest.fn(async () => {
      throw new Error('lot refusé');
    });
    try {
      useScanStore.setState({ themePref: 'system' } as never);
      await relancer();
      expect(st().saves.length).toBe(5);
      expect(st().themePref).toBe('dark');
      expect(mockAppels.getItem.filter((k) => k.startsWith('roomscanner.scan.v2.')).length).toBe(5);
    } finally {
      stockage.getMany = vrai;
    }
  });

  it('une ancienne surface (`multiGet` seul) reste comprise', async () => {
    ranger(4);
    const vrai = stockage.getMany;
    delete stockage.getMany;
    const multiGet = jest.fn(async (cles: string[]) => cles.map((k) => [k, mockDisque.get(k) ?? null] as const));
    stockage.multiGet = multiGet;
    try {
      await relancer();
      expect(st().saves.length).toBe(4);
      expect(multiGet).toHaveBeenCalledTimes(2);
      expect(mockAppels.getItem.filter((k) => k.startsWith('roomscanner.scan.v2.'))).toEqual([]);
    } finally {
      delete stockage.multiGet;
      stockage.getMany = vrai;
    }
  });
});
