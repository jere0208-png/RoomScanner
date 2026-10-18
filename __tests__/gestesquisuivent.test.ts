/**
 * CE QUI EST POSÉ SUR LES MURS SUIT LES GESTES — enquête des gestes
 * d'édition (2D/3D), une épreuve par trouvaille, sur l'appartement
 * d'exemple :
 *   1. l'appareillage garde sa cote depuis le bout fixe de son mur, ou
 *      depuis le coin déplacé quand le mur raccourci ne le loge plus ;
 *   2. les baies d'un mur voisin entraîné suivent leur mur ;
 *   3. une cloison alignée sur celle qu'on pousse reste droite ;
 *   4. « Redresser » s'annule d'un seul geste ;
 *   5. un bout de mur ne se soude pas à son autre bout ;
 *   6. « Largeur de la menuiserie » reste dans le mur ;
 *   7. « Ajouter une pièce » ne se pose jamais sur une pièce ;
 *   8. retirer au rez ne laisse pas de baie accrochée à l'étage ;
 *   9. « Diviser » ne coupe pas une porte ;
 *  10. retirer un étage ne laisse pas de commande pendante.
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
import { useScanStore } from '../src/store/scanStore';
import { murDeLOuverture, pointOnSeg, roomParts, segLength, type WallSeg } from '../src/geometry/floorplan';
import { pointInPolygon } from '../src/geometry/appearance';
import { buildScene, type ScenePalette } from '../src/geometry/scene3d';

const st = () => useScanStore.getState();
const PAL: ScenePalette = {
  floor: '#EEEEEE', floorStroke: '#CCCCCC', wall: '#FFFFFF', wallStroke: '#888888', wallTop: '#F4F4F4',
  wallTopStroke: '#949494', opening: '#B9C2CE', door: '#E8A13B', window: '#3EB8E5', passage: '#2F6BFF',
  object: '#D8E1F2', objectTop: '#E9EEF9', objectStroke: '#9FACBF',
};

// ------------------------------------------------------------- l'état comparé
const CHAMPS = ['walls', 'openings', 'objects', 'rooms', 'fixtures', 'photos', 'ceiling', 'notes', 'mesures'] as const;
const photo = () => {
  const s = st() as unknown as Record<string, unknown>;
  return JSON.stringify(CHAMPS.map((k) => s[k]));
};

// ------------------------------------------------------------- les invariants
function invariants(opts: { scene?: boolean } = {}): string[] {
  const s = st();
  const out: string[] = [];
  const murs = s.walls;
  const parId = new Map(murs.map((w) => [w.id, w]));
  // ids uniques
  const dbl = (nom: string, ids: string[]) => {
    const vus = new Set<string>();
    for (const id of ids) {
      if (vus.has(id)) out.push(`DOUBLON ${nom} ${id}`);
      vus.add(id);
    }
  };
  dbl('mur', murs.map((w) => w.id));
  dbl('ouverture', s.openings.map((w) => w.id));
  dbl('mur/ouverture', [...murs.map((w) => w.id), ...s.openings.map((w) => w.id)]);
  dbl('piece', s.rooms.map((r) => r.id));
  dbl('appareil', s.fixtures.map((f) => f.id));
  dbl('plafond', s.ceiling.map((c) => c.id));
  dbl('meuble', s.objects.map((o) => o.id));
  for (const w of murs) {
    const ok = [w.a.x, w.a.z, w.b.x, w.b.z, w.height, w.yCenter].every(Number.isFinite);
    if (!ok) out.push(`MUR NaN ${w.id}`);
    else if (segLength(w) < 0.01) out.push(`MUR NUL ${w.id} L=${segLength(w).toFixed(4)}`);
  }
  for (const o of s.openings) {
    const ok = [o.a.x, o.a.z, o.b.x, o.b.z, o.height, o.yCenter].every(Number.isFinite);
    if (!ok) {
      out.push(`OUVERTURE NaN ${o.id}`);
      continue;
    }
    if (segLength(o) < 0.05) out.push(`OUVERTURE NULLE ${o.id}`);
    const m = murDeLOuverture(o, murs.filter((w) => (w.niveau ?? 0) === (o.niveau ?? 0)));
    if (!m) {
      out.push(`OUVERTURE ORPHELINE ${o.id}`);
      continue;
    }
    const da = pointOnSeg(o.a, m.a, m.b);
    const db = pointOnSeg(o.b, m.a, m.b);
    // pointOnSeg rend t borné ? on recalcule
    const L = segLength(m);
    const ux = (m.b.x - m.a.x) / L;
    const uz = (m.b.z - m.a.z) / L;
    const t = (p: { x: number; z: number }) => (p.x - m.a.x) * ux + (p.z - m.a.z) * uz;
    const n = (p: { x: number; z: number }) => Math.abs(-(p.x - m.a.x) * uz + (p.z - m.a.z) * ux);
    if (n(o.a) > 0.05 || n(o.b) > 0.05) out.push(`OUVERTURE HORS LIGNE ${o.id} sur ${m.id} (${n(o.a).toFixed(3)},${n(o.b).toFixed(3)})`);
    else if (Math.min(t(o.a), t(o.b)) < -0.02 || Math.max(t(o.a), t(o.b)) > L + 0.02)
      out.push(`OUVERTURE DEBORDE ${o.id} sur ${m.id} [${t(o.a).toFixed(2)},${t(o.b).toFixed(2)}] L=${L.toFixed(2)}`);
    void da;
    void db;
  }
  for (const r of s.rooms) {
    for (const id of r.wallIds ?? []) if (!parId.has(id)) out.push(`PIECE->MUR ABSENT ${r.id}->${id}`);
    dbl(`murs de la piece ${r.id}`, r.wallIds ?? []);
  }
  const roomIds = new Set(s.rooms.map((r) => r.id));
  const tousIds = new Set([...s.fixtures.map((f) => f.id), ...s.ceiling.map((c) => c.id)]);
  for (const f of s.fixtures) {
    const w = parId.get(f.wallId);
    if (!w) {
      out.push(`APPAREIL->MUR ABSENT ${f.id}->${f.wallId}`);
      continue;
    }
    if (!Number.isFinite(f.along)) out.push(`APPAREIL along NaN ${f.id}`);
    else if (f.along < -0.01 || f.along > segLength(w) + 0.01)
      out.push(`APPAREIL HORS MUR ${f.id} along=${f.along.toFixed(2)} L=${segLength(w).toFixed(2)} (${f.wallId})`);
    for (const c of f.commands ?? []) if (!tousIds.has(c)) out.push(`COMMANDE PENDANTE ${f.id}->${c}`);
  }
  for (const c of s.ceiling) {
    if (!roomIds.has(c.roomId)) out.push(`PLAFOND->PIECE ABSENTE ${c.id}->${c.roomId}`);
    if (![c.at.x, c.at.z].every(Number.isFinite)) out.push(`PLAFOND NaN ${c.id}`);
    for (const k of c.commands ?? []) if (!tousIds.has(k)) out.push(`COMMANDE PENDANTE ${c.id}->${k}`);
  }
  if (opts.scene !== false) {
    try {
      const sc = buildScene(murs, s.openings, s.objects, {
        palette: PAL,
        rooms: s.rooms as never,
        fixtures: s.fixtures,
        ceiling: s.ceiling,
        showSurfaces: true,
        showSol: true,
      });
      let nan = 0;
      for (const f of sc.faces) for (const p of f.pts) if (![p.x, p.y, p.z].every(Number.isFinite)) nan++;
      if (nan) out.push(`SCENE ${nan} sommets NaN`);
      for (const a of sc.appareils ?? []) {
        const v = JSON.stringify(a);
        if (v.includes('null')) {
          /* null peut venir d'un NaN sérialisé */
          const nums = Object.values(a as unknown as Record<string, unknown>).filter((x) => typeof x === 'number') as number[];
          if (nums.some((x) => !Number.isFinite(x))) out.push(`SCENE appareil NaN`);
        }
      }
    } catch (e) {
      out.push(`SCENE EXCEPTION ${(e as Error).message}`);
    }
  }
  return out;
}


function ouvrirDeuxNiveaux() {
  st().ouvrirExemple();
  const s = st();
  const up = <T extends { id: string }>(x: T): T => ({ ...x, id: `${x.id}@1`, niveau: 1 });
  const walls = [
    ...s.walls,
    ...s.walls.map((w) => ({ ...up(w), yCenter: w.yCenter + 2.7 })),
  ] as WallSeg[];
  const rooms = [...s.rooms, ...s.rooms.map((r) => ({ ...up(r), wallIds: (r.wallIds ?? []).map((i) => `${i}@1`) }))];
  const openings = [...s.openings, ...s.openings.map((o) => ({ ...up(o), yCenter: o.yCenter + 2.7 }))] as WallSeg[];
  useScanStore.setState({ walls, rooms, openings });
}



let horloge = 1_000_000;
beforeAll(() => {
  jest.spyOn(Date, 'now').mockImplementation(() => horloge);
});
beforeEach(() => {
  horloge += 10_000;
  mockMagasin.clear();
  st().ouvrirExemple();
});

const mur = (id: string) => st().walls.find((w) => w.id === id)!;
/** Le point du monde où se trouve un appareil (sur l'axe de son mur). */
const ouEst = (fid: string) => {
  const f = st().fixtures.find((x) => x.id === fid)!;
  const w = mur(f.wallId);
  const L = segLength(w);
  return { x: w.a.x + ((w.b.x - w.a.x) * f.along) / L, z: w.a.z + ((w.b.z - w.a.z) * f.along) / L, L, along: f.along };
};
const ecartALaLigne = (p: { x: number; z: number }, w: WallSeg) => {
  const L = segLength(w);
  return Math.abs((-(p.x - w.a.x) * (w.b.z - w.a.z) + (p.z - w.a.z) * (w.b.x - w.a.x)) / L);
};
const ouverture = (id: string) => st().openings.find((o) => o.id === id)!;

describe('1. l’appareillage suit son mur quand le mur change de longueur', () => {
  it('tirer le coin (0,0) du séjour de 30 cm : fenêtres et prises du mur nord restent en place', () => {
    const fenetre0 = { ...ouverture('fenetre-sejour').a };
    const prise0 = ouEst('exemple-prise-frigo');
    st().moveWallPoint('nord', 'a', { x: 0.3, z: 0 });
    const fenetre1 = ouverture('fenetre-sejour').a;
    const prise1 = ouEst('exemple-prise-frigo');
    // La fenêtre, posée sur le même mur, n'a pas bougé (cote gardée depuis le bout fixe)…
    expect(fenetre1.x).toBeCloseTo(fenetre0.x, 6);
    // … la prise du frigo, elle, est partie avec le coin tiré.
    expect(`prise frigo à x=${prise1.x.toFixed(2)}`).toBe(`prise frigo à x=${prise0.x.toFixed(2)}`);
  });

  it('taper 2,10 m au mur sud du bureau : la prise reste à 40 cm du coin déplacé, le RJ à sa cote du coin fixe', () => {
    const prise0 = ouEst('exemple-prise-bureau');
    st().setWallLength('sud#2', 2.1);
    const w = mur('sud#2');
    // Le coin gauche (x = 0) est resté fixe, c'est la règle « le coin de gauche ne bouge pas ».
    expect(Math.min(w.a.x, w.b.x)).toBeCloseTo(0, 6);
    const prise1 = ouEst('exemple-prise-bureau');
    const rj = ouEst('exemple-bureau-plan');
    // La prise était à 40 cm du coin déplacé (x = 2,60) : le mur de 2,10 ne
    // la loge plus à 2,20 du coin fixe, elle reste à 40 cm du coin.
    expect(prise0.x.toFixed(2)).toBe('2.20');
    expect({ prise: prise1.x.toFixed(2), rjDansLeMur: rj.along <= rj.L + 0.01, rj: rj.x.toFixed(2) }).toEqual({
      prise: '1.70',
      rjDansLeMur: true,
      rj: '0.45',
    });
  });

  it('raccourcir le mur nord du séjour à 4,50 m : la prise sous la fenêtre reste dans le séjour', () => {
    st().setWallLength('nord', 4.5);
    const p = ouEst('exemple-prise-fenetre');
    const parts = roomParts(st().walls, st().rooms);
    const chambre = parts.find((x) => st().rooms.find((r) => r.id === x.roomId)?.name === 'Chambre')!;
    expect({
      dansSonMur: p.along <= p.L + 0.01,
      dansLaChambre: pointInPolygon({ x: p.x, z: p.z + 0.2 }, chambre.surface!.pts),
    }).toEqual({ dansSonMur: true, dansLaChambre: false });
  });
});

describe('2. tourner un mur : les menuiseries des murs VOISINS suivent leur mur', () => {
  it('5° sur le mur nord du séjour : la fenêtre de la chambre reste sur son mur', () => {
    const ang = 0; // nord est horizontal, de (0,0) à (5,0)
    st().setWallAngle('nord', ang + 5);
    const f = ouverture('fenetre-chambre');
    const hote = murDeLOuverture(f, st().walls)!;
    expect(hote.id).toBe('nord#1');
    const ecart = Math.max(ecartALaLigne(f.a, hote), ecartALaLigne(f.b, hote));
    expect(`écart fenêtre/mur ${ecart.toFixed(3)} m`).toBe('écart fenêtre/mur 0.000 m');
  });
});

describe('3. pousser une cloison alignée sur une autre : la voisine reste droite', () => {
  it('décaler de 20 cm le mur séjour/bureau : le mur séjour/entrée, l’entrée et son passage ne bougent pas', () => {
    const aire = () => {
      const parts = roomParts(st().walls, st().rooms);
      const id = st().rooms.find((r) => r.name === 'Entrée')!.id;
      return parts.find((p) => p.roomId === id)?.surface?.area ?? 0;
    };
    const avant = aire();
    st().moveWall('sejour-sud', 0, 0.2, false);
    const w = mur('sejour-sud#1');
    const p = ouverture('passage');
    expect({
      murEntreeDroit: Math.abs(w.a.z - w.b.z) < 1e-6,
      aireEntree: aire().toFixed(2),
      passageSurSonMur: Math.max(ecartALaLigne(p.a, w), ecartALaLigne(p.b, w)) < 0.01,
    }).toEqual({ murEntreeDroit: true, aireEntree: avant.toFixed(2), passageSurSonMur: true });
  });
});

describe('4. « Redresser » s’annule d’un seul geste', () => {
  it('un seul Annuler rend le plan d’avant le redressement', () => {
    // Un plan un peu de travers, comme un vrai relevé.
    st().moveWallPoint('ouest', 'a', { x: -0.09, z: 6 });
    horloge += 10_000;
    const avant = photo();
    st().straightenPlan();
    expect(photo()).not.toBe(avant);
    horloge += 10_000;
    st().undo();
    const apres1 = photo();
    st().undo();
    const apres2 = photo();
    expect({ unAnnuler: apres1 === avant, deuxAnnuler: apres2 === avant }).toEqual({ unAnnuler: true, deuxAnnuler: false });
  });
  it('et le « Annuler » de l’astuce laisse les murs redressés', () => {
    // Le coin sud-ouest relevé 9 cm de travers, comme sur un vrai scan.
    const coin = (p: { x: number; z: number }) => (Math.abs(p.x) < 1e-9 && Math.abs(p.z - 6) < 1e-9 ? { x: -0.09, z: 6 } : p);
    useScanStore.setState({ walls: st().walls.map((w) => ({ ...w, a: coin(w.a), b: coin(w.b) })) });
    horloge += 10_000;
    // Le coin tiré de travers : le plus petit x des murs vaut −0,09.
    const xMin = () => Math.min(...st().walls.flatMap((w) => [w.a.x, w.b.x]));
    const piecesAvant = st().rooms.map((r) => r.id).join(',');
    expect(xMin()).toBeCloseTo(-0.09, 6);
    st().straightenPlan();
    const xRedresse = xMin();
    expect(xRedresse).not.toBeCloseTo(-0.09, 3);
    horloge += 10_000;
    st().undo(); // le bouton « Annuler » de l'astuce « Murs alignés et remis d'équerre »
    expect({ xMin: xMin().toFixed(3), pieces: st().rooms.map((r) => r.id).join(',') }).toEqual({
      xMin: '-0.090',
      pieces: piecesAvant,
    });
  });
});

describe('5. tirer le bout d’un mur court près de son autre bout ne le réduit pas à zéro', () => {
  it('le retour de refend de 60 cm, ramené à 20 cm, mesure 20 cm', () => {
    expect(segLength(mur('refend#1'))).toBeCloseTo(0.6, 6);
    st().moveWallPoint('refend#1', 'b', { x: 5, z: 3.8 });
    const w = mur('refend#1');
    const sc = buildScene(st().walls, st().openings, st().objects, { palette: PAL, rooms: st().rooms as never, fixtures: st().fixtures });
    const nan = sc.faces.reduce((n, f) => n + f.pts.filter((p) => ![p.x, p.y, p.z].every(Number.isFinite)).length, 0);
    expect({ longueur: segLength(w).toFixed(2), sommetsNaN: nan }).toEqual({ longueur: '0.20', sommetsNaN: 0 });
  });
});

describe('6. « Largeur de la menuiserie » borne la baie à son mur', () => {
  it('porte posée à 10 cm du coin, élargie à 1,00 m : elle ne déborde pas dans le mur voisin', () => {
    // Une porte de 73 à 10 cm du coin de la salle d'eau (refend#2 va de z=4,20 à 6,00).
    useScanStore.setState({
      openings: st().openings.map((o) => (o.id === 'porte-sde' ? { ...o, a: { x: 5, z: 4.3 }, b: { x: 5, z: 5.03 } } : o)),
    });
    st().resizeOpening('porte-sde', 1.0);
    const o = ouverture('porte-sde');
    const w = mur('refend#2');
    const t0 = Math.min(o.a.z, o.b.z) - w.a.z;
    expect(`début de la porte à ${t0.toFixed(3)} m du bout du mur`).toBe(
      `début de la porte à ${Math.max(0, t0).toFixed(3)} m du bout du mur`,
    );
    expect(invariants({ scene: false }).filter((x) => x.includes('porte-sde'))).toEqual([]);
  });
});

describe('7. « Ajouter une pièce » contre un refend ne la pose jamais sur une pièce existante', () => {
  it('pièce de 3 × 2 accolée au refend séjour/chambre', () => {
    st().addRoomBox(3, 2, 'Dressing', 'refend', { auNu: true });
    const parts = roomParts(st().walls, st().rooms);
    const neuve = st().rooms.find((r) => r.name === 'Dressing')!;
    const pn = parts.find((p) => p.roomId === neuve.id)!;
    const centre = pn.labelAt;
    const sous = parts
      .filter((p) => p.roomId !== neuve.id && p.surface && pointInPolygon(centre, p.surface.pts))
      .map((p) => st().rooms.find((r) => r.id === p.roomId)!.name);
    expect(sous).toEqual([]);
  });
});

describe('8. retirer une pièce du rez-de-chaussée emporte ses menuiseries, même sous un mur d’étage', () => {
  it('deux niveaux superposés : la salle d’eau du rez part avec sa fenêtre', () => {
    ouvrirDeuxNiveaux();
    const sde = st().rooms.find((r) => r.name === 'Salle d’eau' && (r.niveau ?? 0) === 0)!;
    st().removeRoom(sde.id);
    const orphelines = st()
      .openings.filter((o) => (o.niveau ?? 0) === 0)
      .filter((o) => !murDeLOuverture(o, st().walls.filter((w) => (w.niveau ?? 0) === 0)))
      .map((o) => o.id);
    expect(orphelines).toEqual([]);
  });
  it('et pareil pour « Retirer » un mur', () => {
    ouvrirDeuxNiveaux();
    st().removeWall('est#1');
    const reste = st().openings.find((o) => o.id === 'fenetre-sde');
    expect(reste).toBeUndefined();
  });
});

describe('9. « Diviser » une pièce ne pose pas la cloison au travers d’une porte', () => {
  it('l’entrée divisée : aucune menuiserie à cheval sur deux murs', () => {
    st().splitRoom(st().rooms.find((r) => r.name === 'Entrée')!.id);
    const aCheval = st().openings.filter((o) => {
      const w = murDeLOuverture(o, st().walls);
      if (!w) return false;
      const L = segLength(w);
      const t = (p: { x: number; z: number }) => ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.z - w.a.z) * (w.b.z - w.a.z)) / L;
      return Math.min(t(o.a), t(o.b)) < -0.02 || Math.max(t(o.a), t(o.b)) > L + 0.02;
    });
    expect(aCheval.map((o) => o.id)).toEqual([]);
  });
});

describe('10. retirer un étage ne laisse pas de commande vers un interrupteur disparu', () => {
  it('va-et-vient d’escalier : le point lumineux du rez commandé depuis l’étage', () => {
    ouvrirDeuxNiveaux();
    const inter = st().addFixture('va', 'refend@1')!;
    expect(inter).toBeTruthy();
    st().toggleCeilingCommand('exemple-dcl-entree', inter);
    expect(st().ceiling.find((c) => c.id === 'exemple-dcl-entree')!.commands).toContain(inter);
    horloge += 10_000;
    st().retirerNiveau(1);
    expect(st().fixtures.some((f) => f.id === inter)).toBe(false);
    expect(st().ceiling.find((c) => c.id === 'exemple-dcl-entree')!.commands ?? []).not.toContain(inter);
  });
});


describe('11. un mur poussé à un T ne laisse pas deux murs l’un sur l’autre', () => {
  it('2,10 m au mur sud du bureau : le refend du séjour et celui de l’entrée partagent UN morceau', () => {
    st().setWallLength('sud#2', 2.1);
    const cle = (w: WallSeg) =>
      [w.a, w.b]
        .map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)
        .sort()
        .join('|');
    const vus = new Map<string, string>();
    const superposes: string[] = [];
    for (const w of st().walls) {
      const k = `${w.niveau ?? 0}:${cle(w)}`;
      if (vus.has(k)) superposes.push(`${vus.get(k)} / ${w.id}`);
      vus.set(k, w.id);
    }
    expect(superposes).toEqual([]);
    // Et le séjour, le bureau, l'entrée restent fermés.
    const parts = roomParts(st().walls, st().rooms);
    for (const nom of ['Séjour-cuisine', 'Bureau', 'Entrée']) {
      const id = st().rooms.find((r) => r.name === nom)!.id;
      expect(parts.find((p) => p.roomId === id)?.surface?.exact).toBe(true);
    }
  });

  it('pousser la cloison séjour/bureau : ce que le bureau perd, le séjour le gagne', () => {
    const aire = (nom: string) => {
      const id = st().rooms.find((r) => r.name === nom)!.id;
      return roomParts(st().walls, st().rooms).find((p) => p.roomId === id)!.surface!.area;
    };
    const avant = aire('Séjour-cuisine') + aire('Bureau');
    const bureau = aire('Bureau');
    st().moveWall('sejour-sud', 0, 0.2, false);
    expect(aire('Bureau')).toBeLessThan(bureau - 0.4);
    expect(aire('Séjour-cuisine') + aire('Bureau')).toBeCloseTo(avant, 6);
  });
});
