/**
 * DES PLANS CONSTRUITS DE BOUT EN BOUT — troisième tournée d'utilisateurs.
 *
 * Six profils ont construit eux-mêmes des plans en 2D et les ont regardés en
 * 3D. Ce banc tient ce qu'ils ont trouvé.
 *
 * Revue « Théo » (aménager un 2 pièces) :
 *   — un meuble plaqué pile contre le mur était jugé « dans le mur » à
 *     l'arrondi près, et glissait de 12 à 18 cm vers le milieu ;
 *   — un meuble qu'on faisait pivoter contre un mur entrait dans la
 *     maçonnerie de 53 à 66 cm ;
 *   — « tv », « table manger », « canape angle » ne trouvaient rien.
 *
 * Revues « Théo », « Nicolas » et « Léa » (pièces accolées) :
 *   — la pièce accolée prenait toute la longueur du mur, la largeur tapée
 *     était ignorée ;
 *   — la retailler déformait la voisine (un mur en biais, 25,00 → 19,97 m²) ;
 *   — une cloison posée dedans ne la coupait jamais : le mur du voisin, d'un
 *     autre groupe, se recollait au pied de la cloison.
 *
 * Revue « Léa » (maison à étage dessinée) : on ne pouvait pas créer d'étage
 * sans scanner, et ce qu'on posait à l'étage atterrissait au
 * rez-de-chaussée — fenêtres, meubles, cotes de baies, hauteurs.
 *
 * Revue « Nicolas » (électricien) : sur la face de derrière d'un mur, les
 * retours de maçonnerie tombaient en miroir.
 *
 * Revue « Karim » (métreur, formes irrégulières) : les cotes affichées
 * retiraient un demi-mur à chaque bout quel que soit l'angle (2,36 pour une
 * face de 2,50 sur le retour d'un L) ; deux murs d'épaisseurs différentes se
 * recollaient en un seul ; la fusion ne survivait pas à « Redétecter ».
 *
 * Revue « Sophie » (T3 dessiné à la main) : épaissir un mur mordait la pièce,
 * une cloison tapée nu à nu jusqu'à un mur épais ne fermait rien, « 0,90 »
 * tapé dans un champ en centimètres donnait une porte de 0,9 cm.
 *
 * Revue « Camille » (agente immobilière, scans corrigés à la main) :
 *   — recouper un mur déjà coupé refaisait un nom déjà pris (`X#1`), et le
 *     recollage jetait le doublon : le WC disparaissait, le couloir s'ouvrait,
 *     une porte flottait dans le vide ;
 *   — retirer un mur d'un plan scanné effaçait TOUTES les pièces : la règle
 *     ne regardait que l'étiquette `roomId`, que les murs scannés n'ont pas.
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

import type { SurfaceData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import {
  trousDuRelevé,
  etendueDeLaPiece,
  longueurCotee,
  filtrerAuNiveau,
  niveauDe,
  wallRuns,
  mergeColinear,
  roomParts,
  segLength,
  splitAtJunctions,
  planFrameAngle,
  straightenWalls,
  posesEnT,
  posesDeMur,
  murNeufCote,
  massifsTechniques,
  type PoseDeMur,
  ecartsAuxMurs,
  centrePourEcart,
  clampFootprint,
  meublesQuiSeChevauchent,
  altitudesDesNiveaux,
  DALLE,
  toFootprint,
  type WallSeg,
} from '../src/geometry/floorplan';
import { poserLibre } from '../src/geometry/poser';
import { masonryRuns, wallFace } from '../src/geometry/electrical';
import { lireCm } from '../src/components/MurNeufSheet';
import { planDifferentials, type Circuit } from '../src/geometry/nfc15100';
import { tableauDepuisLePlan } from '../src/geometry/tableauFini';
import { boardRows, pdfFilename } from '../src/export/pdf';
import { buildObjMaison, objFilename } from '../src/export/model3d';
import { dxfFilename } from '../src/export/dxf';
import { CATALOG_ITEMS, type CatalogItem } from '../src/geometry/catalogue';
import { matchItem } from '../src/screens/result/FurnitureSheet';
import { useAstuce } from '../src/ui/astuce';
import { completerAuxNormes } from '../src/geometry/auto';
import { appartementExemple } from '../src/data/exemple';
import { pocheDesMurs, SUREPAISSEUR_FACADE } from '../src/geometry/poche';

const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});
const uuid = (k: number) => `${String(k).padStart(8, '0')}-AAAA-4BBB-8CCC-DDDDDDDDDDDD`;
const surface = (id: string, cx: number, cz: number, length: number, alongZ = false): SurfaceData => ({
  id, type: 'wall', length, height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('un mur recoupé garde tous ses morceaux', () => {
  it('chaque morceau a un nom à lui, et rien ne se perd au recollage', () => {
    // Le couloir déjà coupé au scan : X et X#1. Une cloison neuve vient buter sur X.
    const murs = [
      mur('X', 0, 0, 2, 0),
      mur('X#1', 2, 0, 4, 0),
      mur('t', 2, 0, 2, 2),
      mur('c', 1, 0, 1, -2),
    ];
    const coupes = splitAtJunctions(murs);
    const ids = coupes.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    const recolles = mergeColinear(coupes);
    const horizontaux = recolles.filter((w) => Math.abs(w.a.z) < 1e-9 && Math.abs(w.b.z) < 1e-9);
    expect(horizontaux.reduce((s, w) => s + segLength(w), 0)).toBeCloseTo(4, 9);
  });

  it('deux murs du même nom ne s’annulent plus au recollage', () => {
    const recolles = mergeColinear([mur('A', 0, 0, 3, 0), mur('A', 5, 0, 5, 3)]);
    expect(recolles).toHaveLength(2);
  });
});

describe('retirer un mur d’un plan scanné', () => {
  it('garde les pièces qui ont encore leurs murs, et leurs noms', () => {
    st().finalize({
      modelPath: '/tmp/a.usdz',
      surfaces: [
        surface(uuid(1), 2.5, 0, 5), surface(uuid(2), 2.5, 4, 5),
        surface(uuid(3), 0, 2, 4, true), surface(uuid(4), 5, 2, 4, true),
        surface(uuid(5), 6.5, 0, 3), surface(uuid(6), 6.5, 4, 3),
        surface(uuid(7), 8, 2, 4, true),
      ],
      objects: [],
    });
    st().oublierArrivage();
    expect(st().rooms.length).toBe(2);
    st().setRoomName(st().rooms[0].id, 'Séjour');
    // Un mur fantôme, au milieu de rien, puis retiré.
    useScanStore.setState({ walls: [...st().walls, { ...mur(uuid(9), 2, 1.5, 2.4, 1.5) }] });
    st().removeWall(uuid(9));
    expect(st().rooms.length).toBe(2);
    expect(st().rooms.map((r) => r.name)).toContain('Séjour');
  });
});

describe('un meuble collé au mur', () => {
  const salon = () => {
    const murs = [mur('n', 0, 0, 4.5, 0), mur('e', 4.5, 0, 4.5, 3.8), mur('s', 4.5, 3.8, 0, 3.8), mur('w', 0, 3.8, 0, 0)].map(
      (w) => ({ ...w, roomId: 'r1' }),
    );
    useScanStore.setState({
      walls: murs,
      rooms: [{ id: 'r1', name: 'Séjour', floor: null, wallIds: murs.map((w) => w.id) }] as never,
      objects: [],
      openings: [],
      fixtures: [],
    });
    return murs;
  };
  const CANAPE: CatalogItem = { key: 'canape3', label: 'Canapé 3 places', w: 2.28, d: 0.95, h: 0.85, category: 'sofa' } as CatalogItem;
  const centre = (id: string) => {
    const o = st().objects.find((x) => x.id === id)!;
    return { x: o.transform[12], z: o.transform[14] };
  };

  it('posé au ras du nu, il y reste', () => {
    const murs = salon();
    const id = st().addObject(CANAPE, 2.25, 1.5);
    const auRas = 0.07 + 0.95 / 2;
    expect(poserLibre({ x: 2.25, z: auRas }, { width: 2.28, depth: 0.95, yaw: 0 }, murs).valide).toBe(true);
    st().rangerMeuble(id, 2.25, auRas);
    expect(centre(id).z).toBeCloseTo(auRas, 3);
    expect(centre(id).x).toBeCloseTo(2.25, 3);
  });

  it('tourné contre le mur, il ne rentre pas dans la maçonnerie', () => {
    const murs = salon();
    const id = st().addObject(CANAPE, 2.25, 1.5);
    st().rangerMeuble(id, 2.25, 0.07 + 0.95 / 2);
    st().rotateObject(id, 1);
    const o = st().objects.find((x) => x.id === id)!;
    const yaw = Math.atan2(o.transform[2], o.transform[0]);
    expect(poserLibre(centre(id), { width: o.width, depth: o.depth, yaw }, murs).valide).toBe(true);
  });
});

describe('chercher un meuble', () => {
  const trouve = (q: string) => CATALOG_ITEMS.filter((it) => matchItem(it, q)).map((it) => it.label);
  it('mot par mot, et avec les mots de tous les jours', () => {
    expect(trouve('tv')).toContain('Télévision');
    expect(trouve('table manger')).toContain('Table à manger');
    expect(trouve('canape angle')).toContain('Canapé d’angle');
    expect(trouve('')).toHaveLength(CATALOG_ITEMS.length);
  });
});

describe('une pièce accolée', () => {
  const aire = (nom: string) => {
    const r = st().rooms.find((x) => x.name === nom)!;
    return roomParts(st().walls, st().rooms).find((p) => p.roomId === r.id)!.surface!;
  };
  const sejourEtMurEst = () => {
    st().commencerAuClavier();
    st().addRoomLibre(4.5, 3.8, 'Séjour', { auNu: true });
    const xs = st().walls.flatMap((w) => [w.a.x, w.b.x]);
    const xMax = Math.max(...xs);
    return st().walls.find((w) => Math.abs(w.a.x - xMax) < 1e-6 && Math.abs(w.b.x - xMax) < 1e-6)!;
  };

  it('tient la largeur tapée, et laisse la voisine telle quelle', () => {
    const est = sejourEtMurEst();
    st().addRoomBox(3.2, 3, 'Chambre', est.id, { auNu: true });
    const e = etendueDeLaPiece(aire('Chambre'));
    expect([e.width, e.depth].map((v) => Math.round(v * 100) / 100).sort()).toEqual([3, 3.2]);
    expect(aire('Séjour').area).toBeCloseTo(17.1, 6);
  });

  it('se retaille sans déformer la voisine', () => {
    const est = sejourEtMurEst();
    st().addRoomBox(3.8, 3, 'Chambre', est.id, { auNu: true });
    const id = st().rooms.find((r) => r.name === 'Chambre')!.id;
    const e = etendueDeLaPiece(aire('Chambre'));
    // Le long du mur partagé, elle passe de 3,80 à 3,00.
    const [l, p] = e.width > e.depth ? [e.width, e.depth] : [e.depth, e.width];
    expect(l).toBeCloseTo(3.8, 6);
    st().resizeRoom(id, p, 3, { auNu: true });
    expect(aire('Séjour').area).toBeCloseTo(17.1, 6);
    const apres = etendueDeLaPiece(aire('Chambre'));
    expect(Math.min(apres.width, apres.depth)).toBeCloseTo(3, 2);
  });

  it('se coupe d’une cloison', () => {
    const est = sejourEtMurEst();
    st().addRoomBox(3.8, 3, 'Chambre', est.id, { auNu: true });
    const id = st().rooms.find((r) => r.name === 'Chambre')!.id;
    const avant = st().rooms.length;
    expect(st().couperPiece(id, { sens: 'longueur', depuis: 1.5, epaisseur: 0.07 })).toBe(true);
    expect(st().rooms.length).toBe(avant + 1);
    expect(aire('Séjour').area).toBeCloseTo(17.1, 6);
  });
});

describe('une maison à étage dessinée', () => {
  const emprise = (n: number) => {
    const ws = st().walls.filter((w) => niveauDe(w) === n);
    const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
    const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  };
  const maison = () => {
    st().commencerAuClavier();
    st().addRoomLibre(9, 7, 'Rez', { auNu: true });
    st().allerAuNiveau(1);
    st().addRoomLibre(9, 7, 'Étage', { auNu: true });
  };
  const murNord = (n: number) => {
    const ws = st().walls.filter((w) => niveauDe(w) === n);
    const z0 = Math.min(...ws.flatMap((w) => [w.a.z, w.b.z]));
    return ws.find((w) => Math.abs(w.a.z - z0) < 1e-6 && Math.abs(w.b.z - z0) < 1e-6)!;
  };

  it('le premier étage se pose d’aplomb sur le rez-de-chaussée', () => {
    maison();
    expect(emprise(1)).toEqual(emprise(0));
    expect(st().rooms.find((r) => r.name === 'Étage')!.niveau).toBe(1);
  });

  it('« Dessiner un étage » est au menu du plan', () => {
    const ecran = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'screens', 'ResultScreen.tsx'), 'utf8');
    expect(ecran).toMatch(/label: 'Dessiner un étage'/);
  });

  it('une fenêtre posée à l’étage y reste, et se cote sur le mur de l’étage', () => {
    maison();
    const nord = murNord(1);
    const id = st().addOpening(nord.id, 'window')!;
    const o = st().openings.find((x) => x.id === id)!;
    expect(niveauDe(o)).toBe(1);
    const jeu = (n: number) =>
      filtrerAuNiveau({ walls: st().walls, openings: st().openings, rooms: st().rooms, fixtures: [], photos: [], objects: [], ceiling: [] }, n);
    expect(jeu(1).openings.map((x) => x.id)).toContain(id);
    expect(jeu(0).openings.map((x) => x.id)).not.toContain(id);
    st().coterOuverture(id, { largeur: 1, hauteur: 1.15, depuis: 4.57, allege: 0.95 } as never);
    const apres = st().openings.find((x) => x.id === id)!;
    const xMin = Math.min(apres.a.x, apres.b.x) - Math.min(nord.a.x, nord.b.x);
    // 4,57 depuis le nu du coin : 4,57 + 7 cm de demi-mur.
    expect(xMin).toBeCloseTo(4.57 + 0.07, 2);
  });

  it('glisser une pièce de l’étage ne la soude pas au rez-de-chaussée', () => {
    maison();
    const rez = JSON.stringify(st().walls.filter((w) => niveauDe(w) === 0));
    const etage = st().rooms.find((r) => r.name === 'Étage')!;
    st().moveRoom(etage.id, 0.03, 0.02);
    expect(JSON.stringify(st().walls.filter((w) => niveauDe(w) === 0))).toBe(rez);
    expect(st().walls.filter((w) => niveauDe(w) === 1).length).toBe(4);
  });

  it('un meuble posé à l’étage appartient à une pièce de l’étage', () => {
    maison();
    const id = st().addObject({ key: 'lit140', label: 'Lit 140', w: 1.4, d: 1.9, h: 0.5, category: 'bed' } as never, 4.5, 3.5);
    const o = st().objects.find((x) => x.id === id)!;
    expect(o.roomId).toBe(st().rooms.find((r) => r.name === 'Étage')!.id);
  });

  it('la hauteur de l’étage ne touche pas le rez-de-chaussée', () => {
    maison();
    st().setAllRoomHeights(2.4);
    expect(st().walls.filter((w) => niveauDe(w) === 1).every((w) => w.height === 2.4)).toBe(true);
    expect(st().walls.filter((w) => niveauDe(w) === 0).every((w) => w.height === 2.5)).toBe(true);
    // Et la pièce suivante de l'étage naît à 2,40.
    st().addRoomLibre(3, 3, 'Chambre', { auNu: true });
    const ch = st().rooms.find((r) => r.name === 'Chambre')!;
    expect(st().walls.find((w) => w.id === ch.wallIds![0])!.height).toBe(2.4);
  });
});

describe('la face de derrière d’un mur', () => {
  it('ses retours tombent où sont les baies, pas en miroir', () => {
    const m = mur('m', 0, 0, 5, 0);
    const porte = { ...mur('p', 0.5, 0, 1.33, 0), type: 'door' as const };
    const face = wallFace(m, undefined, -1);
    const runs = masonryRuns(wallRuns(m, [porte]), segLength(m), face);
    // Vue de derrière, la porte est entre 3,67 et 4,50 depuis la gauche.
    const dansLaPorte = (x: number) => runs.some((r) => x > r.x0 + 1e-6 && x < r.x1 - 1e-6);
    expect(dansLaPorte(4.0)).toBe(false);
    expect(dansLaPorte(1.0)).toBe(true);
  });
});

describe('les formes de Karim', () => {
  const muNu = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({ ...mur(id, ax, az, bx, bz), auNu: true, roomId: 'L' });
  const enL = () => {
    const pts = [[0, 0], [7, 0], [7, 3], [4.5, 3], [4.5, 5], [0, 5]];
    const murs = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return muNu(`l${i}`, p[0], p[1], q[0], q[1]);
    });
    useScanStore.setState({ walls: murs, rooms: [{ id: 'L', name: 'Séjour', floor: null, wallIds: murs.map((w) => w.id) }] as never });
    return murs;
  };

  it('le retour rentrant d’un L se cote à sa face : 2,50, pas 2,36', () => {
    const murs = enL();
    const parts = roomParts(murs, st().rooms);
    const retour = murs.find((w) => w.id === 'l2')!;
    expect(longueurCotee(murs, retour, parts)).toBeCloseTo(2.5, 6);
    // La surface au nu du L, pour mémoire : 7 × 5 − 2,5 × 2, moins les demi-murs.
    expect(parts[0].surface!.area).toBeGreaterThan(28);
  });

  it('deux murs alignés d’épaisseurs différentes restent deux murs', () => {
    const recolles = mergeColinear([{ ...mur('p', 0, 0, 3.1, 0), epaisseur: 0.45 }, mur('c', 3.1, 0, 5.13, 0)]);
    expect(recolles).toHaveLength(2);
  });

  it('la fusion survit à « Redétecter »', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const xs = st().walls.flatMap((w) => [w.a.x, w.b.x]);
    const est = st().walls.find((w) => Math.abs(w.a.x - Math.max(...xs)) < 1e-6 && Math.abs(w.b.x - Math.max(...xs)) < 1e-6)!;
    st().addRoomBox(3, 3, 'Salon', est.id, { auNu: true });
    const [a, b] = st().rooms;
    st().mergeRooms(a.id, b.id);
    expect(st().rooms).toHaveLength(1);
    st().redetectRooms();
    expect(st().rooms).toHaveLength(1);
  });
});

describe('les murs de Sophie', () => {
  it('épaissir un mur dessiné garde la face de la pièce', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4.2, 5.1, 'Séjour', { auNu: true });
    const nord = [...st().walls].sort((p, q) => Math.min(p.a.z, p.b.z) - Math.min(q.a.z, q.b.z))[0];
    st().setEpaisseurMur(nord.id, 0.2);
    const r = st().rooms[0];
    const e = etendueDeLaPiece(roomParts(st().walls, st().rooms).find((p) => p.roomId === r.id)!.surface!);
    expect(Math.max(e.width, e.depth)).toBeCloseTo(5.1, 6);
    expect(Math.min(e.width, e.depth)).toBeCloseTo(4.2, 6);
  });

  it('une cloison tapée nu à nu jusqu’à un mur épais ferme la pièce', () => {
    st().commencerAuClavier();
    st().addRoomLibre(6, 4, 'Séjour', { auNu: true });
    const murs = st().walls;
    for (const w of murs) st().setEpaisseurMur(w.id, 0.2);
    const zs = st().walls.flatMap((w) => [w.a.z, w.b.z]);
    const z0 = Math.min(...zs) + 0.1;
    const z1 = Math.max(...zs) - 0.1;
    const x = Math.min(...st().walls.flatMap((w) => [w.a.x, w.b.x])) + 2.5;
    st().addWallBetween({ x, z: z0 }, { x, z: z1 }, { epaisseur: 0.07 });
    expect(st().rooms).toHaveLength(2);
  });

  it('« 0,90 » dans un champ en centimètres, ce sont 90 cm', () => {
    expect(lireCm('0,90')).toBeCloseTo(0.9, 9);
    expect(lireCm('90')).toBeCloseTo(0.9, 9);
    expect(lireCm('83,5')).toBeCloseTo(0.835, 9);
    expect(lireCm('2,00')).toBeCloseTo(2, 9);
  });

  it('deux meubles posés au même endroit ne s’empilent pas', () => {
    st().commencerAuClavier();
    st().addRoomLibre(5, 4, 'Séjour', { auNu: true });
    const item = { key: 'chaise', label: 'Chaise', w: 0.45, d: 0.5, h: 0.9, category: 'chair' } as never;
    const a = st().addObject(item, 2.5, 2);
    const b = st().addObject(item, 2.5, 2);
    const pa = st().objects.find((o) => o.id === a)!.transform;
    const pb = st().objects.find((o) => o.id === b)!.transform;
    expect(Math.hypot(pa[12] - pb[12], pa[14] - pb[14])).toBeGreaterThan(0.44);
  });
});

describe('les retouches de Camille', () => {
  it('une porte déclarée n’est plus un passage', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const id = st().addOpening(st().walls[0].id, 'opening')!;
    useScanStore.setState({ openings: st().openings.map((o) => (o.id === id ? { ...o, open: true } : o)) });
    st().setOpeningType(id, 'door');
    expect(st().openings.find((o) => o.id === id)!.open).toBeUndefined();
  });

  it('« Scinder » coupe en travers du grand côté', () => {
    st().commencerAuClavier();
    st().addRoomLibre(5.2, 2.4, 'Couloir', { auNu: true });
    st().splitRoom(st().rooms[0].id);
    const parts = roomParts(st().walls, st().rooms);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      const e = etendueDeLaPiece(p.surface!);
      expect(Math.max(e.width, e.depth)).toBeLessThan(3);
    }
  });
});

describe('le tableau projeté de Nicolas', () => {
  const circuit = (id: string, label: string, nature: Circuit['nature'], breaker: number, piece: string): Circuit => ({
    id, label, nature, points: 1, section: 2.5, breaker, rooms: [piece], fixtureIds: [],
  });
  const circuits = [
    circuit('c1', 'Prises séjour', 'prises', 16, 'Séjour'),
    circuit('c2', 'Spécialisé 20 A — Cuisine', 'specialise', 20, 'Four'),
    circuit('c3', 'Spécialisé 20 A — Cuisine', 'specialise', 20, 'Lave-linge'),
    circuit('c4', 'Spécialisé 20 A — Cuisine', 'specialise', 20, 'Lave-vaisselle'),
  ];
  it('trois circuits du même libellé font trois disjoncteurs, chacun sous son différentiel', () => {
    const diffs = planDifferentials(circuits);
    const t = tableauDepuisLePlan(circuits, diffs);
    const dj = t.departs.filter((d) => d.organe === 'disjoncteur').map((d) => d.id);
    expect(dj.sort()).toEqual(['plan-c1', 'plan-c2', 'plan-c3', 'plan-c4']);
  });
  it('et le tableau du PDF aussi', () => {
    const rows = boardRows({ circuits, differentials: planDifferentials(circuits) } as never);
    const legendes = rows.flatMap((r) => r.modules.filter((m) => !m.differentiel).map((m) => m.legende));
    expect(legendes.filter((l) => /Four|Lave-linge|Lave-vaisselle/.test(l)).sort()).toHaveLength(3);
    expect(new Set(legendes).size).toBe(legendes.length);
  });
});

describe('la face où l’on pose', () => {
  it('l’appareil va sur la face qu’on regarde, même sur une cloison', () => {
    st().commencerAuClavier();
    st().addRoomLibre(6, 4, 'Séjour', { auNu: true });
    const zs = st().walls.flatMap((w) => [w.a.z, w.b.z]);
    const x = Math.min(...st().walls.flatMap((w) => [w.a.x, w.b.x])) + 3;
    st().addWallBetween({ x, z: Math.min(...zs) }, { x, z: Math.max(...zs) }, { epaisseur: 0.07 });
    const cloison = st().walls.find((w) => Math.abs(w.a.x - x) < 1e-6 && Math.abs(w.b.x - x) < 1e-6)!;
    for (const cote of [1, -1] as const) {
      const id = st().addFixture('prise', cloison.id, 1, cote)!;
      expect(st().fixtures.find((f) => f.id === id)!.side).toBe(cote);
    }
  });
});

describe('le coin raté de Camille', () => {
  it('se signale, et se ferme d’un appui : la pièce réapparaît', () => {
    const murs = [
      mur('n', 0, 0, 5, 0),
      mur('e', 5, 0, 5, 4),
      mur('s', 5, 4, 0.165, 4),
      mur('w', 0, 3.835, 0, 0),
    ];
    useScanStore.setState({ walls: murs, rooms: [], openings: [] });
    const trous = trousDuRelevé(murs);
    const coin = trous.find((t) => t.coin)!;
    expect(coin).toBeTruthy();
    expect(coin.coin!.x).toBeCloseTo(0, 6);
    expect(coin.coin!.z).toBeCloseTo(4, 6);
    st().comblerTrou(coin);
    const parts = roomParts(st().walls, st().rooms);
    expect(parts).toHaveLength(1);
    expect(parts[0].surface?.exact).toBe(true);
    expect(parts[0].surface!.area).toBeCloseTo(20, 6);
  });
});

describe('la plaque commune de Nicolas', () => {
  it('la prise du four ne passe pas sous la plaque de la crédence', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Cuisine', { auNu: true });
    const m = st().walls[0];
    const credence = st().addFixture('prise', m.id, 1)!;
    st().moveFixture(credence, st().fixtures.find((f) => f.id === credence)!.along, 1.1);
    const four = st().addFixture('prise20', m.id, 1)!;
    const f4 = st().fixtures.find((f) => f.id === four)!;
    const fc = st().fixtures.find((f) => f.id === credence)!;
    expect(f4.group).toBeUndefined();
    expect(fc.group).toBeUndefined();
    // Descendre le four laisse la crédence où elle est.
    st().moveFixture(four, f4.along, 0.25);
    expect(st().fixtures.find((f) => f.id === credence)!.height).toBeCloseTo(1.1, 6);
  });

  it('deux prises côte à côte partagent toujours leur plaque', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Séjour', { auNu: true });
    const m = st().walls[0];
    const a = st().addFixture('prise', m.id, 1)!;
    const b = st().addFixture('prise', m.id, 1)!;
    const ga = st().fixtures.find((f) => f.id === a)!.group;
    expect(ga).toBeTruthy();
    expect(st().fixtures.find((f) => f.id === b)!.group).toBe(ga);
  });
});

describe('un mur posé au bout d’un autre', () => {
  it('le prolonge d’une demi-épaisseur : la face intérieure tombe à la cote tapée', () => {
    st().commencerAuClavier();
    st().addRoomLibre(6, 4, 'Studio', { auNu: true });
    const haut = [...st().walls].sort((p, q) => Math.min(p.a.z, p.b.z) - Math.min(q.a.z, q.b.z))[0];
    const z0 = haut.a.z;
    // Le premier pan d'une cloison : son bout libre là où la salle d'eau doit finir.
    const pan = st().addWallBetween({ x: 2, z: z0 }, { x: 2, z: z0 + 1.6 }, { depuis: haut.id, epaisseur: 0.07 })!;
    const retour = st().addWallBetween({ x: 2, z: z0 + 1.6 }, { x: 0.5, z: z0 + 1.6 }, { depuis: pan, epaisseur: 0.07 })!;
    const p = st().walls.find((w) => w.id === pan)!;
    const r = st().walls.find((w) => w.id === retour)!;
    expect(Math.max(p.a.z, p.b.z)).toBeCloseTo(z0 + 1.635, 6);
    expect(r.a.z).toBeCloseTo(z0 + 1.635, 6);
    // La face du retour côté salle d'eau : à 1,60 de l'axe du mur du haut.
    expect(r.a.z - 0.035 - z0).toBeCloseTo(1.6, 6);
  });
});

describe('« Redresser » chez Karim', () => {
  it('un mur à 80° ne fait plus tourner la maison', () => {
    // Un logement d'équerre et une chambre trapézoïdale : son mur du fond à 80°.
    const murs = [
      mur('h1', 0, 0, 8, 0), mur('h2', 0, 6, 8, 6),
      mur('v1', 0, 0, 0, 6), mur('v2', 8, 0, 8, 6),
      mur('biais', 8, 0, 8 + 4 * Math.cos((80 * Math.PI) / 180), 4 * Math.sin((80 * Math.PI) / 180)),
    ];
    expect(planFrameAngle(murs)).toBeCloseTo(0, 9);
    const droits = straightenWalls(murs);
    const h1 = droits.find((w) => w.id === 'h1')!;
    expect(h1.a.z).toBeCloseTo(h1.b.z, 9);
    const v1 = droits.find((w) => w.id === 'v1')!;
    expect(v1.a.x).toBeCloseTo(v1.b.x, 9);
    const b = droits.find((w) => w.id === 'biais')!;
    expect((Math.atan2(b.b.z - b.a.z, b.b.x - b.a.x) * 180) / Math.PI).toBeCloseTo(80, 6);
  });

  it('un angle tapé reste tel qu’on l’a voulu', () => {
    st().commencerAuClavier();
    st().addRoomLibre(5, 4, 'Chambre', { auNu: true });
    // Le mur de droite, tourné de 4° : dans la tolérance de l'équerre, mais voulu.
    const droite = [...st().walls].sort(
      (p, q) => Math.max(q.a.x, q.b.x) + Math.min(q.a.x, q.b.x) - Math.max(p.a.x, p.b.x) - Math.min(p.a.x, p.b.x),
    )[0];
    const angle = (w: WallSeg) => (Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x) * 180) / Math.PI;
    const voulu = angle(droite) + 4;
    st().setWallAngle(droite.id, voulu);
    st().straightenPlan();
    const apres = st().walls.find((w) => w.id === droite.id) ?? st().walls.find((w) => w.angleVoulu)!;
    expect(apres.angleVoulu).toBe(true);
    // Ses voisins, eux, se remettent d'équerre : à 0,005° près, il reste à 94°.
    expect(angle(apres)).toBeCloseTo(voulu, 1);
    // Les autres murs restent d'aplomb.
    for (const w of st().walls) {
      if (w.angleVoulu) continue;
      const a = ((angle(w) % 90) + 90) % 90;
      expect(Math.min(a, 90 - a)).toBeLessThan(1e-6);
    }
  });
});

describe('le placard de Karim', () => {
  const poserMur = (pose: PoseDeMur, saisie: Parameters<typeof murNeufCote>[2]) => {
    const seg = murNeufCote(st().walls, pose, saisie);
    return seg ? st().addWallBetween(seg.a, seg.b, { epaisseur: saisie.epaisseur, depuis: pose.wallId }) : undefined;
  };
  const chambre = () => {
    st().commencerAuClavier();
    const ch = st().addRoomLibre(3.4, 3.0, 'Chambre', { auNu: true })!;
    st().arreterPiece(ch);
  };
  const astuces = () => {
    const a = useAstuce.getState();
    return [...(a.courante ? [a.courante] : []), ...a.file];
  };
  beforeEach(() => useAstuce.setState({ courante: null, file: [] }));

  it('fermé sans porte, il se dit ; « C’est un placard » le compte, et Redétecter le garde', () => {
    chambre();
    // 0,60 × 1,20 dans l'angle : une cloison en T depuis le mur de gauche, puis l'équerre.
    const gauche = st().walls.find((w) => w.a.x === 0 && w.b.x === 0)!;
    const pose = posesEnT(gauche).find((p) => p.b.x > p.a.x)!;
    const t1 = poserMur(pose, { longueur: 1.2, epaisseur: 0.07, depuis: 0.6, depuisB: gauche.b.z < gauche.a.z })!;
    const T = st().walls.find((w) => w.id === t1)!;
    const versHaut = posesDeMur(st().walls, 1)
      .filter((p) => Math.hypot(p.a.x - T.b.x, p.a.z - T.b.z) < 1e-6)
      .find((p) => p.b.z < p.a.z - 0.5)!;
    poserMur(versHaut, { longueur: 0.6, epaisseur: 0.07 });
    expect(massifsTechniques(st().walls, st().openings, st().rooms)).toHaveLength(1);
    const dit = astuces().find((a) => a.texte.startsWith('Recoin fermé'));
    expect(dit?.action).toBeTruthy();
    dit!.action!.faire();
    expect(massifsTechniques(st().walls, st().openings, st().rooms)).toHaveLength(0);
    const aires = () =>
      Object.fromEntries(
        roomParts(st().walls, st().rooms).map((p) => [st().rooms.find((r) => r.id === p.roomId)!.name, p.surface!.area]),
      );
    expect(aires().Placard).toBeCloseTo(0.72, 3);
    expect(aires().Chambre).toBeCloseTo(10.2 - 1.27 * 0.67, 3);
    st().redetectRooms();
    expect(aires().Placard).toBeCloseTo(0.72, 3);
    // « Annuler » la redétection, puis la déclaration : il redevient une gaine.
    st().undo();
    expect(massifsTechniques(st().walls, st().openings, st().rooms)).toHaveLength(0);
    st().undo();
    expect(massifsTechniques(st().walls, st().openings, st().rooms)).toHaveLength(1);
  });

  it('une niche ouverte ne fausse pas la chambre à la redétection', () => {
    chambre();
    const haut = st().walls.find((w) => w.a.z === 0 && w.b.z === 0)!;
    const pose = posesEnT(haut).find((p) => p.b.z > p.a.z)!;
    // Un retour de 0,60 en 10 cm, à 1,20 du coin, qui ne ferme rien.
    poserMur(pose, { longueur: 0.6, epaisseur: 0.1, depuis: 1.2 });
    // Les 6 dm² sous la cloison sortent du sol, tout de suite et après Redétecter.
    expect(roomParts(st().walls, st().rooms)[0].surface!.area).toBeCloseTo(10.2 - 0.06, 3);
    st().redetectRooms();
    const [p] = roomParts(st().walls, st().rooms);
    expect(p.surface!.exact).toBe(true);
    expect(p.surface!.area).toBeCloseTo(10.2 - 0.06, 3);
  });
});

describe('la façade de Sophie', () => {
  it('un mur dont on a choisi l’épaisseur se dessine à cette épaisseur, sans surépaisseur', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4.2, 5.1, 'Séjour', { auNu: true });
    for (const w of [...st().walls]) st().setEpaisseurMur(w.id, 0.2);
    const { contours } = pocheDesMurs(st().walls, st().openings, st().rooms);
    const xs = contours.flat().map((p) => p.x);
    const zs = contours.flat().map((p) => p.z);
    // L'intérieur reste 4,20 × 5,10 ; la maçonnerie fait 20 cm de chaque côté, pas 30.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4.2 + 0.4, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(5.1 + 0.4, 6);
  });

  it('un mur à l’épaisseur par défaut garde la façade d’un vrai mur extérieur', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4.2, 5.1, 'Séjour', { auNu: true });
    const { contours } = pocheDesMurs(st().walls, st().openings, st().rooms);
    const xs = contours.flat().map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4.2 + 2 * (0.14 + SUREPAISSEUR_FACADE), 6);
  });
});

describe('la fenêtre de Sophie', () => {
  it('poser une ouverture et taper ses cotes s’annulent d’un seul appui', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4.2, 5.1, 'Séjour', { auNu: true });
    const m = st().walls[0];
    const id = st().addOpening(m.id, 'window')!;
    st().coterOuverture(id, { largeur: 1.0, hauteur: 1.25, allege: 0.95, depuis: 0.6 });
    expect(segLength(st().openings[0])).toBeCloseTo(1.0, 6);
    st().undo();
    expect(st().openings).toHaveLength(0);
  });

  it('des cotes reprises plus tard restent un geste à part', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4.2, 5.1, 'Séjour', { auNu: true });
    const m = st().walls[0];
    const id = st().addOpening(m.id, 'window')!;
    st().coterOuverture(id, { largeur: 1.0, hauteur: 1.25, allege: 0.95, depuis: 0.6 });
    st().coterOuverture(id, { largeur: 1.2, hauteur: 1.25, allege: 0.95, depuis: 0.6 });
    st().undo();
    expect(segLength(st().openings[0])).toBeCloseTo(1.0, 6);
  });
});

describe('les noms de Camille', () => {
  it('deux « Cuisine 2 » ne donnent plus « Cuisine 2 2 »', () => {
    st().commencerAuClavier();
    st().addRoomLibre(4, 3, 'Cuisine 2', { auNu: true });
    st().addRoomLibre(3, 3, 'Cuisine 2', { auNu: true });
    st().redetectRooms();
    const noms = st().rooms.map((r) => r.name).sort();
    expect(noms).toEqual(['Cuisine 2', 'Cuisine 3']);
  });

  it('un meuble loin de toute pièce ne la nomme pas', () => {
    st().commencerAuClavier();
    st().addRoomLibre(3, 1.2, '', { auNu: true });
    // Un lit à trois mètres du dégagement : il n'en fait pas une chambre.
    const [p] = roomParts(st().walls, st().rooms);
    const xs = p.surface!.pts.map((q) => q.x);
    const loin = Math.max(...xs) + 3;
    useScanStore.setState({
      objects: [
        { id: 'lit', category: 'bed', width: 1.6, height: 0.5, depth: 2, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, loin, 0.25, 0.6, 1] },
      ],
    });
    st().redetectRooms();
    expect(st().rooms[0].name).not.toMatch(/Chambre/);
  });
});

describe('placer au centimètre, chez Théo', () => {
  it('le chevet se cote jusqu’au lit, pas à travers lui', () => {
    const murs = [
      mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 4), mur('s', 4, 4, 0, 4), mur('o', 0, 4, 0, 0),
    ];
    // Un chevet de 45 cm à gauche d'un lit de 1,60, collés l'un à l'autre.
    const lit = { centre: { x: 2, z: 1.07 }, width: 1.6, depth: 2, yaw: 0, nom: 'lit' };
    const e = ecartsAuxMurs({ x: 0.95, z: 0.3 }, { width: 0.45, depth: 0.4, yaw: 0 }, murs, [lit]);
    const droite = e.find((x) => x.dir.x > 0.5)!;
    expect(droite.vers).toBe('lit');
    expect(droite.ecart).toBeCloseTo(1.2 - (0.95 + 0.225), 6);
    // À gauche, rien entre lui et le mur : la cote reste au nu — le trait
    // de ce mur relevé, x = 0.
    const gauche = e.find((x) => x.dir.x < -0.5)!;
    expect(gauche.vers).toBeUndefined();
    expect(gauche.ecart).toBeCloseTo(0.95 - 0.225, 6);
    // « 0 cm » le colle au lit.
    const p = centrePourEcart({ x: 0.95, z: 0.3 }, droite, 0)!;
    expect(p.x + 0.225).toBeCloseTo(1.2, 6);
  });

  it('un meuble qui mord déjà dans son voisin donne un écart négatif, que « 0 » corrige', () => {
    const murs = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 4), mur('s', 4, 4, 0, 4), mur('o', 0, 4, 0, 0)];
    const voisin = { centre: { x: 2, z: 2 }, width: 0.45, depth: 0.4, yaw: 0, nom: 'chevet' };
    const e = ecartsAuxMurs({ x: 1.6, z: 2 }, { width: 0.45, depth: 0.4, yaw: 0 }, murs, [voisin]);
    const droite = e.find((x) => x.dir.x > 0.5)!;
    expect(droite.ecart).toBeLessThan(0);
    const p = centrePourEcart({ x: 1.6, z: 2 }, droite, 0)!;
    expect(p.x).toBeCloseTo(2 - 0.45, 6);
  });
});

describe('le meuble collé de Théo', () => {
  it('placé à 0 cm, il se dessine contre le mur, sans jour de 2 cm', () => {
    const murs = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
    // Un canapé de 95 cm de profondeur, son dos au nu du mur du haut (0,07).
    const f = clampFootprint({ id: 'canape', category: 'sofa', cx: 2, cz: 0.07 + 0.475, width: 2.28, depth: 0.95, height: 0.8, yCenter: 0.4, yaw: 0 }, murs, { x: 2, z: 1.5 });
    expect(f.cz - 0.475 - 0.07).toBeLessThan(0.0025);
  });

  it('contre une cloison de 7 cm, il reste contre elle', () => {
    const murs = [
      mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3),
      { ...mur('o', 0, 3, 0, 0), epaisseur: 0.07 },
    ];
    const f = clampFootprint({ id: 'bahut', category: 'storage', cx: 0.035 + 0.3, cz: 1.5, width: 0.6, depth: 1.2, height: 0.8, yCenter: 0.4, yaw: 0 }, murs, { x: 2, z: 1.5 });
    expect(f.cx - 0.3 - 0.035).toBeLessThan(0.0025);
  });
});

describe('les fichiers de Léa', () => {
  it('le même dossier donne le même nom de fichier, quel que soit le format', () => {
    const nom = 'Plan du 12/10/2026';
    expect(pdfFilename(nom)).toBe('Plan-du-12-10-2026.pdf');
    expect(objFilename(`${nom} R+1`)).toBe('Plan-du-12-10-2026-R+1.obj');
    expect(dxfFilename(`${nom} R+1`)).toBe('Plan-du-12-10-2026-R+1.dxf');
  });
});

describe('les chevauchements de Théo', () => {
  const boite = (id: string, cx: number, cz: number, width: number, depth: number, y0 = 0, y1 = 0.8, yaw = 0) => ({
    id, cx, cz, width, depth, yaw, y0, y1,
  });
  it('une chaise lâchée dans la table se signale ; deux meubles qui se touchent, non', () => {
    const table = boite('table', 2, 2, 1.6, 0.9);
    const chaise = boite('chaise', 2, 2.5, 0.45, 0.5);
    const voisine = boite('voisine', 2, 2 + 0.45 + 0.25, 0.45, 0.5);
    expect(meublesQuiSeChevauchent([table, chaise])).toEqual([['table', 'chaise']]);
    expect(meublesQuiSeChevauchent([table, voisine])).toEqual([]);
  });

  it('une chaise rangée sous la table ne compte pas ; enfoncée dedans, si', () => {
    const table = { ...boite('table', 2, 2, 1.6, 0.9, 0, 0.75), category: 'table' };
    // Le bord de la chaise passe 15 cm sous le plateau : rangée.
    const rangee = { ...boite('rangee', 2, 2 + 0.45 + 0.25 - 0.15, 0.45, 0.5, 0, 0.9), category: 'chair' };
    expect(meublesQuiSeChevauchent([table, rangee])).toEqual([]);
    const dedans = { ...boite('dedans', 2, 2.1, 0.45, 0.5, 0, 0.9), category: 'chair' };
    expect(meublesQuiSeChevauchent([table, dedans])).toEqual([['table', 'dedans']]);
  });

  it('le plan d’exemple ne s’accuse pas lui-même', () => {
    const ex = appartementExemple();
    const boites = ex.objects.map((o) => {
      const f = toFootprint(o);
      return {
        id: o.id, cx: f.cx, cz: f.cz, width: f.width, depth: f.depth, yaw: f.yaw,
        y0: f.yCenter - f.height / 2, y1: f.yCenter + f.height / 2, category: o.category,
      };
    });
    expect(meublesQuiSeChevauchent(boites)).toEqual([]);
  });

  it('la télé posée sur le meuble bas ne compte pas', () => {
    const meuble = boite('meuble', 2, 2, 1.6, 0.45, 0, 0.5);
    const tele = boite('tele', 2, 2, 1.2, 0.2, 0.5, 1.2);
    expect(meublesQuiSeChevauchent([meuble, tele])).toEqual([]);
  });

  it('deux meubles de biais qui ne se touchent que par l’axe de l’un ne se chevauchent pas', () => {
    const a = boite('a', 0, 0, 1, 1);
    const b = boite('b', 1.25, 0, 1, 1, 0, 0.8, Math.PI / 4);
    // Le losange de b déborde de 0,707 − 0,5 vers a : 0,25 − 0,207 de jour.
    expect(meublesQuiSeChevauchent([a, b])).toEqual([]);
  });
});

describe('« Normes auto » chez Nicolas', () => {
  const murs = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];
  const ctx = {
    rooms: [
      { id: 'r1', name: 'Cuisine', area: 12, wallIds: ['n', 'e', 's', 'o'], interieur: { x: 2, z: 1.5 } },
      // Le DAAF ne va pas en cuisine : il lui faut une autre pièce.
      { id: 'r2', name: 'Séjour', area: 20, wallIds: [], interieur: { x: 6, z: 1.5 } },
    ],
    walls: murs,
    openings: [],
    objects: [],
    fixtures: [],
    ceiling: [],
    id: (() => {
      let k = 0;
      return (p: string) => `${p}-${++k}`;
    })(),
  };

  it('règle aussi ce que le contrôle sait corriger, constat après constat', () => {
    const verifier = (fx: { height: number }[], cl: { kind: string }[]) => {
      const hauts = fx.filter((f) => f.height >= 0.9).length;
      return [
        ...(hauts < 4
          ? [{ message: `Cuisine : ${hauts} socles au-dessus du plan sur 4`, roomId: 'r1', fix: { type: 'poser' as const, kind: 'prise' as const, height: 1.1, label: 'Poser PC 110' } }]
          : []),
        ...(cl.some((c) => c.kind === 'daaf')
          ? []
          : [{ message: 'Aucun détecteur de fumée', fix: { type: 'plafond' as const, kind: 'daaf' as const, label: 'Poser le DAAF' } }]),
      ];
    };
    const r = completerAuxNormes(ctx, verifier);
    expect(r.fixtures.filter((f) => f.height === 1.1)).toHaveLength(4);
    expect(r.ceiling.map((c) => c.kind)).toEqual(['daaf']);
    expect(r.poses).toEqual(['Poser PC 110', 'Poser PC 110', 'Poser PC 110', 'Poser PC 110', 'Poser le DAAF']);
  });

  it('une pose qui ne règle rien est reprise, et le constat laissé', () => {
    const verifier = () => [
      { message: 'Cuisine : socle mal placé', roomId: 'r1', fix: { type: 'poser' as const, kind: 'prise' as const, label: 'Poser' } },
    ];
    const r = completerAuxNormes(ctx, verifier);
    expect(r.fixtures).toHaveLength(0);
    expect(r.poses).toHaveLength(0);
  });
});

describe('la maison empilée de Léa', () => {
  const etage = (n: number, h: number, sol = 0) =>
    [mur('n', 0, 0, 6, 0), mur('e', 6, 0, 6, 7), mur('s', 6, 7, 0, 7), mur('o', 0, 7, 0, 0)].map((w) => ({
      ...w,
      id: `${w.id}${n}`,
      height: h,
      yCenter: sol + h / 2,
      ...(n === 0 ? {} : { niveau: n }),
    }));

  it('chaque niveau a son altitude : hauteur du dessous plus une dalle', () => {
    const alt = altitudesDesNiveaux([...etage(0, 2.5), ...etage(1, 2.4), ...etage(-1, 2.2)]);
    expect(alt.get(0)).toBe(0);
    expect(alt.get(1)).toBeCloseTo(2.5 + DALLE, 9);
    expect(alt.get(-1)).toBeCloseTo(-(2.2 + DALLE), 9);
  });

  it('l’OBJ de la maison pose chaque niveau à sa hauteur, dans ses groupes', () => {
    // L'étage relevé au scan a son sol à −1,30 (ARKit) : il se recale quand même.
    const rdc = etage(0, 2.5);
    const r1 = etage(1, 2.4, -1.3);
    const alt = altitudesDesNiveaux([...rdc, ...r1]);
    const obj = buildObjMaison(
      [
        { niveau: 0, model: { walls: rdc, openings: [], objects: [], rooms: [{ id: 'a', wallIds: rdc.map((w) => w.id) }] } },
        { niveau: 1, model: { walls: r1, openings: [], objects: [], rooms: [{ id: 'b', wallIds: r1.map((w) => w.id) }] } },
      ],
      alt,
    );
    expect(obj).toContain('g RDC Sols');
    expect(obj).toContain('g R+1 Murs');
    const ys = obj
      .split('\n')
      .filter((l) => l.startsWith('v '))
      .map((l) => Number(l.split(' ')[2]));
    expect(Math.min(...ys)).toBeCloseTo(0, 3);
    expect(Math.max(...ys)).toBeCloseTo(2.5 + DALLE + 2.4, 3);
  });
});
