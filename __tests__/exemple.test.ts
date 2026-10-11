/**
 * L'APPARTEMENT D'EXEMPLE — ce qu'on montre avant d'avoir relevé quoi que
 * ce soit. Il est la vitrine de l'application : un meuble planté dans un
 * mur, une pièce sans nom ou une fenêtre qui flotte s'y verraient avant tout
 * le reste. Ce banc tient qu'il est propre, comme le serait un vrai relevé.
 */
import { appartementExemple, NOM_EXEMPLE } from '../src/data/exemple';
import { murDeLOuverture, roomOf, roomParts, solDesMurs, totalArea, wallQuadsOf } from '../src/geometry/floorplan';
import {
  COMMANDES_MURALES,
  facePoint,
  faceX,
  overlaps,
  wallFace,
  type Fixture,
  type FixtureKind,
} from '../src/geometry/electrical';
import {
  checkElectrical,
  fixturePlacement,
  roomInputsOf,
  roomUse,
  wallToRooms,
  worktopsOnWall,
  type Worktop,
} from '../src/geometry/nfc15100';
import { volumeAt, volumeVerdict, wetZones, type VolumeVerdict } from '../src/geometry/volumes';
import { poserLibre } from '../src/geometry/poser';
import { checkPlan } from '../src/geometry/diagnostics';

const ex = appartementExemple();
const parts = roomParts(ex.walls, ex.rooms);

describe('l’appartement d’exemple', () => {
  it('porte un nom qui le distingue d’un vrai plan', () => {
    expect(NOM_EXEMPLE).toBe('Appartement exemple');
  });

  it('a ses cinq pièces, nommées, et ses 48 m²', () => {
    expect(ex.rooms.map((r) => r.name).sort()).toEqual(
      ['Bureau', 'Chambre', 'Entrée', 'Salle d’eau', 'Séjour'].sort(),
    );
    expect(parts.every((p) => p.surface?.exact)).toBe(true);
    expect(Math.round(totalArea(parts)!.area)).toBe(48);
  });

  it('chaque meuble est dans une pièce, et aucun ne mord dans un mur', () => {
    expect(ex.objects.length).toBeGreaterThan(15);
    for (const o of ex.objects) {
      const t = o.transform;
      const yaw = Math.atan2(t[2], t[0]);
      const pose = poserLibre({ x: t[12], z: t[14] }, { width: o.width, depth: o.depth, yaw }, ex.walls);
      expect([o.id, pose.valide]).toEqual([o.id, true]);
      expect([o.id, !!o.roomId]).toEqual([o.id, true]);
    }
  });

  it('chaque menuiserie est posée sur un mur', () => {
    for (const o of ex.openings) {
      expect([o.id, !!murDeLOuverture(o, ex.walls)]).toEqual([o.id, true]);
    }
    // Une porte d'entrée, une pièce de jour éclairée : c'est un logement.
    expect(ex.openings.filter((o) => o.type === 'window').length).toBeGreaterThanOrEqual(4);
    expect(ex.openings.some((o) => o.id === 'porte-entree')).toBe(true);
  });

  /*
    LA VITRINE NE S'ACCUSE PAS ELLE-MÊME — capture du patron : dix-sept
    « points à corriger » sur l'exemple, dont huit « Une baie s'arrête à
    204 cm, les autres à 230 ». Un plan d'exemple qui se dit faux apprend à
    ignorer le contrôle.
  */
  it('le contrôle du plan n’y trouve rien à redire', () => {
    expect(checkPlan(ex.walls, ex.rooms, ex.openings).map((i) => i.message)).toEqual([]);
  });

  it('et ses linteaux de façade s’alignent, comme dans tout logement', () => {
    const hauts = ex.openings
      .filter((o) => o.type === 'window')
      .map((o) => Math.round((o.yCenter + o.height / 2) * 100));
    expect(new Set(hauts)).toEqual(new Set([215]));
  });
});

/*
  L'INSTALLATION ÉLECTRIQUE DE LA VITRINE — relevé du patron : « ajoute sur
  le plan d'exemple des éléments électriques aussi, avec des positionnements
  bien pensés (prise derrière le frigo pour son alimentation, sortie de câble
  derrière le meuble de la plaque électrique, et autres) ».

  Une installation d'électricien, pas un semis de symboles : chaque appareil
  ménager a son alimentation DERRIÈRE lui, chaque pièce son point lumineux
  commandé depuis sa porte, le tableau près de l'entrée — et le contrôle
  NF C 15-100 de l'application n'y trouve rien à redire.
*/
describe('l’installation électrique de l’exemple', () => {
  const murs = new Map(ex.walls.map((w) => [w.id, w]));
  /** Le point du monde où se trouve un appareil, sur l'axe de son mur. */
  const ou = (f: Fixture) => {
    const w = murs.get(f.wallId)!;
    const len = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    const t = f.along / len;
    return { x: w.a.x + (w.b.x - w.a.x) * t, z: w.a.z + (w.b.z - w.a.z) * t };
  };
  const meubleDe = (modele: string) => ex.objects.find((o) => o.modele === modele)!;
  /** L'appareil de cette nature posé DERRIÈRE ce meuble : dans son emprise, sur le mur qu'il touche. */
  const derriere = (modele: string, kinds: FixtureKind[]) => {
    const o = meubleDe(modele);
    const c = { x: o.transform[12], z: o.transform[14] };
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    // L'arrière du meuble : son côté +z local, à une demi-profondeur.
    const dos = { x: c.x + Math.sin(yaw) * (o.depth / 2), z: c.z + Math.cos(yaw) * (o.depth / 2) };
    return ex.fixtures.filter((f) => {
      if (!kinds.includes(f.kind)) return false;
      const p = ou(f);
      const lateral = Math.abs((p.x - dos.x) * Math.cos(yaw) - (p.z - dos.z) * Math.sin(yaw));
      return Math.hypot(p.x - dos.x, p.z - dos.z) < o.width / 2 + 0.12 && lateral < o.width / 2;
    });
  };

  it('chaque appareil ménager est alimenté par-derrière', () => {
    expect(derriere('frigo', ['prise'])).toHaveLength(1);
    expect(derriere('plaque', ['sortieCable'])).toHaveLength(1);
    expect(derriere('ll', ['prise20'])).toHaveLength(1);
  });

  it('chaque appareil a un mur, une pièce, et sa face donne dans la pièce', () => {
    expect(ex.fixtures.length).toBeGreaterThan(15);
    const inputs = roomInputsOf(ex.rooms, parts);
    const placement = fixturePlacement(ex.fixtures, ex.walls, inputs);
    for (const f of ex.fixtures) {
      expect([f.id, murs.has(f.wallId)]).toEqual([f.id, true]);
      expect([f.id, placement.has(f.id)]).toEqual([f.id, true]);
    }
    expect(new Set(ex.fixtures.map((f) => f.id)).size).toBe(ex.fixtures.length);
  });

  it('aucune plaque n’en chevauche une autre', () => {
    const quads = wallQuadsOf(ex.walls);
    for (const a of ex.fixtures) {
      for (const b of ex.fixtures) {
        if (a.id >= b.id || a.wallId !== b.wallId || a.side !== b.side) continue;
        const face = wallFace(murs.get(a.wallId)!, quads.get(a.wallId), a.side);
        const pa = { x: faceX(face, a.along), y: a.height, kind: a.kind };
        const pb = { x: faceX(face, b.along), y: b.height, kind: b.kind };
        expect([a.id, b.id, overlaps(pa, pb)]).toEqual([a.id, b.id, false]);
      }
    }
  });

  it('chaque pièce a son point lumineux, commandé par un interrupteur de la pièce', () => {
    const inputs = roomInputsOf(ex.rooms, parts);
    const placement = fixturePlacement(ex.fixtures, ex.walls, inputs);
    for (const r of ex.rooms) {
      const points = ex.ceiling.filter((c) => c.roomId === r.id && c.kind === 'dcl');
      expect([r.name, points.length > 0]).toEqual([r.name, true]);
      for (const p of points) {
        const cmd = (p.commands ?? []).map((id) => ex.fixtures.find((f) => f.id === id));
        expect([r.name, cmd.length > 0 && cmd.every((f) => !!f && COMMANDES_MURALES.includes(f.kind))]).toEqual([r.name, true]);
        expect([r.name, cmd.some((f) => placement.get(f!.id) === r.id)]).toEqual([r.name, true]);
      }
    }
  });

  it('le tableau et le détecteur de fumée sont dans l’entrée ; la VMC extrait en salle d’eau', () => {
    const entree = ex.rooms.find((r) => r.name === 'Entrée')!;
    const sde = ex.rooms.find((r) => r.name === 'Salle d’eau')!;
    const inputs = roomInputsOf(ex.rooms, parts);
    const placement = fixturePlacement(ex.fixtures, ex.walls, inputs);
    const tableaux = ex.fixtures.filter((f) => f.kind === 'tableau');
    expect(tableaux).toHaveLength(1);
    expect(placement.get(tableaux[0].id)).toBe(entree.id);
    expect(ex.ceiling.filter((c) => c.kind === 'daaf').map((c) => c.roomId)).toEqual([entree.id]);
    expect(ex.ceiling.some((c) => c.kind === 'vmc' && c.roomId === sde.id)).toBe(true);
  });

  it('le contrôle NF C 15-100 de l’application n’y lève aucune alerte', () => {
    const inputs = roomInputsOf(ex.rooms, parts);
    const placement = fixturePlacement(ex.fixtures, ex.walls, inputs);
    const quads = wallQuadsOf(ex.walls);
    // Les volumes de la salle d'eau, comme l'écran les calcule.
    const zones = wetZones(ex.objects, solDesMurs(ex.walls));
    expect(zones.length).toBeGreaterThan(0);
    const volumes = new Map<string, VolumeVerdict>();
    for (const f of ex.fixtures) {
      const face = wallFace(murs.get(f.wallId)!, quads.get(f.wallId), f.side);
      const p = facePoint(face, faceX(face, f.along), 0.05);
      const v = volumeAt({ x: p.x, z: p.z }, f.height, zones);
      if (v !== null) volumes.set(f.id, volumeVerdict(f.kind, v));
    }
    // Les plans de travail, comme l'écran les calcule.
    const worktops = new Map<string, { x: (f: Fixture) => number; plans: Worktop[] }>();
    for (const w of ex.walls) {
      const piece = ex.rooms.find((r) => r.id === roomOf(w));
      const cuisine = roomUse(piece?.name ?? '', piece?.kind) === 'cuisine';
      for (const side of [1, -1] as const) {
        const face = wallFace(w, quads.get(w.id), side);
        const plans = worktopsOnWall(face, ex.objects, cuisine, solDesMurs(ex.walls));
        if (plans.length === 0) continue;
        worktops.set(w.id, { x: (f: Fixture) => faceX(face, f.along), plans });
        break;
      }
    }
    const issues = checkElectrical(
      inputs,
      ex.fixtures,
      wallToRooms(inputs),
      placement,
      volumes,
      worktops,
      ex.ceiling,
      { walls: ex.walls, openings: ex.openings },
    );
    expect(issues.filter((i) => i.severity === 'alerte').map((i) => i.message)).toEqual([]);
    // Ni appareil mal posé, ni hauteurs presque alignées : une pose soignée.
    expect(issues.filter((i) => i.code === 'pose' || i.code === 'alignement').map((i) => i.message)).toEqual([]);
  });
});

describe('l’exemple ouvert dans l’application', () => {
  it('arrive avec son installation : appareils au mur et au plafond', () => {
    // Le magasin lit le stockage au chargement : on le neutralise.
    jest.isolateModules(() => {
      jest.doMock('@react-native-async-storage/async-storage', () => ({
        getItem: jest.fn(async () => null),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
      }));
      const { useScanStore } = require('../src/store/scanStore');
      useScanStore.getState().ouvrirExemple();
      const s = useScanStore.getState();
      expect(s.fixtures.length).toBe(ex.fixtures.length);
      expect(s.ceiling.length).toBe(ex.ceiling.length);
      expect(s.ceiling.length).toBeGreaterThan(5);
      // Un exemple qu'on vient d'ouvrir n'a rien à enregistrer.
      expect(s.dirty).toBe(false);
    });
  });
});
