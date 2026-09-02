/**
 * PEINDRE LES PIÈCES — septième des dix améliorations.
 *
 * La maquette rendait deux choses : le blanc cassé du dessin, ou la teinte
 * RELEVÉE au scan. Entre les deux, rien — et c'est justement là que se tient
 * la question qu'un client pose toujours : « et si on mettait du vert
 * d'eau ? ». On répondait en la mimant du doigt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA PALETTE EST IMPOSÉE, et c'est la même doctrine que le mobilier —
 * relevé du patron : « ils ne servent pas à redécorer mais à imaginer la
 * pièce seulement ». Douze teintes de peinture d'intérieur, choisies pour
 * se tenir ensemble. Un sélecteur de couleur libre produirait des maquettes
 * fuchsia qu'on ne montre à personne, et transformerait une application de
 * relevé en logiciel de décoration.
 *
 * CHAQUE FACE PREND LA PEINTURE DE LA PIÈCE QU'ELLE REGARDE. C'est le seul
 * comportement juste, et c'est celui qui coûte : un refend borde DEUX
 * pièces, et peindre le mur entier ferait déborder le vert d'eau du séjour
 * dans la chambre. Les deux faces se colorent donc séparément ; la face
 * extérieure d'un mur de façade, elle, ne regarde aucune pièce et reste au
 * blanc du dessin.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { buildScene, type ScenePalette } from '../src/geometry/scene3d';
import { PEINTURES, hexDePeinture, PEINTURE_DEFAUT } from '../src/ui/peintures';
import type { WallSeg } from '../src/geometry/floorplan';
import type { SurfaceTexture } from 'react-native-room-scan';

const PAL: ScenePalette = {
  floor: '#EEEEEE',
  floorStroke: '#CCCCCC',
  wall: '#FFFFFF',
  wallStroke: '#888888',
  wallTop: '#F4F4F4',
  wallTopStroke: '#949494',
  opening: '#B9C2CE',
  door: '#E8A13B',
  window: '#3EB8E5',
  passage: '#2F6BFF',
  object: '#D8E1F2',
  objectTop: '#E9EEF9',
  objectStroke: '#9FACBF',
};

const mur = (
  id: string,
  roomId: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId,
});

/*
  DEUX PIÈCES MITOYENNES, séparées par un refend — le seul plan qui pose la
  question. Séjour à gauche (0..4), chambre à droite (4..7), le refend en
  x = 4.
*/
const MURS: WallSeg[] = [
  mur('n1', 'r1', 0, 0, 4, 0),
  mur('ref', 'r1', 4, 0, 4, 3),
  mur('s1', 'r1', 4, 3, 0, 3),
  mur('o1', 'r1', 0, 3, 0, 0),
  mur('n2', 'r2', 4, 0, 7, 0),
  mur('e2', 'r2', 7, 0, 7, 3),
  mur('s2', 'r2', 7, 3, 4, 3),
];
const PIECES = [
  { id: 'r1', wallIds: ['n1', 'ref', 's1', 'o1'] },
  { id: 'r2', wallIds: ['n2', 'e2', 's2', 'ref'] },
];

const SAUGE = hexDePeinture('sauge')!;
const ARGILE = hexDePeinture('argile')!;

/** Les pans d'un mur : ses bandes, sans son chant ni son dessus. */
const pans = (
  id: string,
  peintures?: Record<string, string | undefined>,
  options: { showTextures?: boolean; murs?: WallSeg[] } = {},
) => {
  const { faces } = buildScene(options.murs ?? MURS, [], [], {
    palette: PAL,
    showSurfaces: true,
    showTextures: options.showTextures ?? false,
    rooms: PIECES,
    peintures,
  });
  return faces.filter(
    (f) =>
      f.wallId === id &&
      f.pts.length >= 3 &&
      !f.dashed &&
      !!f.fill &&
      Math.abs(f.normal?.y ?? 0) < 0.5,
  );
};

/** Les teintes d'un mur, du côté qui regarde vers `x` croissant ou non. */
const parCote = (fs: ReturnType<typeof pans>) => {
  const versMoinsX = new Set<string>();
  const versPlusX = new Set<string>();
  for (const f of fs) {
    const nx = f.normal?.x ?? 0;
    // Un chant a une normale le long du mur : on ne juge que les grandes
    // faces, dont la normale est perpendiculaire au refend.
    if (nx < -0.5) versMoinsX.add(f.fill!);
    else if (nx > 0.5) versPlusX.add(f.fill!);
  }
  return { versMoinsX: [...versMoinsX], versPlusX: [...versPlusX] };
};

describe('la palette est imposée, et elle se tient', () => {
  it('douze teintes de peinture d’intérieur, aux clés uniques', () => {
    expect(PEINTURES.length).toBeGreaterThanOrEqual(12);
    const cles = PEINTURES.map((p) => p.cle);
    expect(new Set(cles).size).toBe(cles.length);
    for (const p of PEINTURES) {
      expect(p.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(p.nom.length).toBeGreaterThan(2);
    }
  });

  it('le blanc cassé ouvre la liste : c’est l’état de départ d’un mur', () => {
    expect(PEINTURES[0].cle).toBe(PEINTURE_DEFAUT);
  });

  it('une clé inconnue ne rend pas une couleur au hasard', () => {
    /*
      Un dossier enregistré par une version future porterait une clé que
      celle-ci ne connaît pas. Rendre `null` la fait retomber sur le blanc
      du dessin ; rendre `undefined` de manière détournée — ou pire, la
      première teinte — repeindrait la pièce sans prévenir.
    */
    expect(hexDePeinture('mauve-du-futur')).toBeNull();
    expect(hexDePeinture(undefined)).toBeNull();
    expect(hexDePeinture('')).toBeNull();
  });
});

describe('chaque face prend la peinture de la pièce qu’elle regarde', () => {
  it('un refend entre deux pièces porte DEUX teintes, une par côté', () => {
    /*
      C'est tout l'enjeu. Peindre le mur entier ferait déborder le vert
      d'eau du séjour dans la chambre — et sur une maquette qu'on montre à
      un client, une couleur qui traverse une cloison se voit avant tout le
      reste.
    */
    const cotes = parCote(pans('ref', { r1: SAUGE, r2: ARGILE }));
    expect(cotes.versMoinsX).toEqual([SAUGE]);
    expect(cotes.versPlusX).toEqual([ARGILE]);
  });

  it('une pièce peinte, sa voisine non : la voisine garde le blanc', () => {
    const cotes = parCote(pans('ref', { r1: SAUGE }));
    expect(cotes.versMoinsX).toEqual([SAUGE]);
    expect(cotes.versPlusX).toEqual([PAL.wall]);
  });

  it('la face extérieure d’un mur de façade ne regarde rien : elle reste blanche', () => {
    /*
      Le mur ouest du séjour : sa face intérieure prend la peinture, sa face
      extérieure donne sur la rue. Un logement peint en vert d'eau JUSQUE
      SUR SA FAÇADE n'aide personne à imaginer quoi que ce soit.
    */
    const fs = pans('o1', { r1: SAUGE });
    const teintes = new Set(fs.map((f) => f.fill));
    expect(teintes.has(SAUGE)).toBe(true);
    expect(teintes.has(PAL.wall)).toBe(true);
  });

  it('sans peinture, rien ne change : le mur reste au blanc du dessin', () => {
    const teintes = new Set(pans('ref').map((f) => f.fill));
    expect([...teintes]).toEqual([PAL.wall]);
  });

  it('un pan peint reste UNI : la découpe en bandes ne le raye pas', () => {
    /*
      La leçon de la maison, troisième passage sur le sujet : « il y a des
      bandes sur les murs en couleur, tout doit être uni ». Elle vaut aussi
      pour la peinture choisie.
    */
    const cote = parCote(pans('ref', { r1: SAUGE })).versMoinsX;
    expect(cote).toHaveLength(1);
  });
});

describe('la peinture choisie l’emporte sur la couleur relevée', () => {
  const NUANCES: SurfaceTexture = {
    cols: 4,
    rows: 2,
    texels: ['#3E5A32', '#415D35', '#3B5730', '#425E36', '#3E5A32', '#405C34',
      '#3D5931', '#415D35'],
  };
  const MURS_RELEVES: WallSeg[] = MURS.map((w) =>
    w.id === 'ref' ? { ...w, color: '#3E5A32', texture: NUANCES } : w,
  );

  it('on a choisi une teinte : c’est elle qu’on voit, pas celle du scan', () => {
    /*
      Le relevé dit ce qui EST ; la peinture dit ce qu'on PROJETTE. Quand on
      vient de choisir une couleur, on veut la voir — c'est la seule raison
      pour laquelle on l'a choisie.
    */
    const cotes = parCote(
      pans('ref', { r1: SAUGE }, { showTextures: true, murs: MURS_RELEVES }),
    );
    expect(cotes.versMoinsX).toEqual([SAUGE]);
  });

  it('mais du côté non peint, le relevé garde la parole', () => {
    const cotes = parCote(
      pans('ref', { r1: SAUGE }, { showTextures: true, murs: MURS_RELEVES }),
    );
    expect(cotes.versPlusX).not.toEqual([PAL.wall]);
    expect(cotes.versPlusX).toHaveLength(1);
  });
});

describe('le magasin retient la peinture', () => {
  const { useScanStore } =
    require('../src/store/scanStore') as typeof import('../src/store/scanStore');

  beforeEach(() => {
    useScanStore.setState({
      rooms: [
        { id: 'r1', name: 'Séjour' },
        { id: 'r2', name: 'Chambre' },
      ],
      walls: MURS,
      dirty: false,
    });
  });

  it('on peint une pièce, elle seule change', () => {
    useScanStore.getState().setRoomPeinture('r1', 'sauge');
    const rooms = useScanStore.getState().rooms;
    expect(rooms.find((r) => r.id === 'r1')?.peinture).toBe('sauge');
    expect(rooms.find((r) => r.id === 'r2')?.peinture).toBeUndefined();
    expect(useScanStore.getState().dirty).toBe(true);
  });

  it('la clé s’efface plutôt que de valoir « null » dans le dossier', () => {
    /*
      Un champ retiré ne pèse rien dans un dossier enregistré, et surtout il
      relit comme une pièce jamais peinte — ce qu'elle est redevenue. Un
      `peinture: null` traîné dans le fichier obligerait chaque lecteur à
      distinguer deux façons de dire « pas de peinture ».
    */
    useScanStore.getState().setRoomPeinture('r1', 'sauge');
    useScanStore.getState().setRoomPeinture('r1', null);
    const r1 = useScanStore.getState().rooms.find((r) => r.id === 'r1')!;
    expect('peinture' in r1).toBe(false);
  });

  it('repeindre de la même teinte ne pose pas de point d’annulation', () => {
    /*
      La leçon de la maison : « la garde passe avant le point de reprise ».
      Un point d'historique sans changement donne, au doigt : on touche
      « Annuler », il ne se passe rien, on touche une seconde fois, et là ça
      revient trop loin en arrière.
    */
    useScanStore.getState().setRoomPeinture('r1', 'sauge');
    const avant = useScanStore.getState().canUndo;
    useScanStore.setState({ dirty: false });
    useScanStore.getState().setRoomPeinture('r1', 'sauge');
    expect(useScanStore.getState().dirty).toBe(false);
    expect(useScanStore.getState().canUndo).toBe(avant);
  });

  it('et l’annulation la retire', () => {
    useScanStore.getState().setRoomPeinture('r1', 'sauge');
    useScanStore.getState().undo();
    expect(
      useScanStore.getState().rooms.find((r) => r.id === 'r1')?.peinture,
    ).toBeUndefined();
  });

  it('une pièce qui n’existe pas ne fabrique rien', () => {
    useScanStore.getState().setRoomPeinture('fantome', 'sauge');
    expect(useScanStore.getState().rooms).toHaveLength(2);
    expect(useScanStore.getState().dirty).toBe(false);
  });
});

describe('le geste est offert là où l’on décrit la pièce', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('le bandeau de pièce porte « Peindre », et l’écran ouvre le nuancier', () => {
    expect(lire('src/components/RoomBar.tsx')).toContain('mot="Peindre"');
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('PeintureSheet');
    expect(ecran).toContain('setRoomPeinture');
  });

  it('et la 3D reçoit les teintes, pas les clés', () => {
    expect(lire('src/components/Iso3DView.tsx')).toContain('hexDePeinture');
  });
});
