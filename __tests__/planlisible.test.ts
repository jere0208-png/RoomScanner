import { buildScanPdf } from '../src/export/pdf';
import {
  SNAPSHOT_FIXTURES,
  SNAPSHOT_OBJECTS,
  SNAPSHOT_OPENINGS,
  SNAPSHOT_ROOMS,
  SNAPSHOT_WALLS,
} from '../src/export/snapshotFixture';
import type { CeilingFixture } from '../src/geometry/ceiling';

const ROOMS = SNAPSHOT_ROOMS.map((r, i) => ({
  ...r,
  name: i === 0 ? 'Séjour' : 'Cuisine',
}));

const PLAFOND: CeilingFixture[] = [
  { id: 'pl1', kind: 'dcl', roomId: SNAPSHOT_ROOMS[0].id, at: { x: 1.6, z: 1.4 } },
  { id: 'pl2', kind: 'daaf', roomId: SNAPSHOT_ROOMS[0].id, at: { x: 1.75, z: 1.4 } },
  ...[0, 1, 2].map((i) => ({
    id: `sp${i}`,
    kind: 'spot' as const,
    roomId: SNAPSHOT_ROOMS[1]?.id ?? SNAPSHOT_ROOMS[0].id,
    at: { x: 3.6 + i * 0.6, z: 1.2 },
    row: 'ln1',
    axe: 'longueur' as const,
  })),
];

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

interface Mot { texte: string; x: number; y: number; taille: number }

const motsDu = (src: string): Mot[] => {
  const page = src.split('(FEUILLE)')[0];
  const re = /BT \/F\d ([\d.]+) Tf [^]*?([-\d.]+) ([-\d.]+) Tm \(([^)]*)\) Tj/g;
  const out: Mot[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(page))) {
    out.push({ taille: Number(m[1]), x: Number(m[2]), y: Number(m[3]), texte: m[4] });
  }
  return out;
};

const emprise = (m: Mot) => ({ x: m.x, y: m.y, w: m.texte.length * m.taille * 0.5, h: m.taille });
const touche = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const plan = () =>
  latin1(
    buildScanPdf(
      {
        name: 'T2 Pasteur',
        walls: SNAPSHOT_WALLS,
        openings: SNAPSHOT_OPENINGS,
        objects: SNAPSHOT_OBJECTS,
        rooms: ROOMS,
        fixtures: SNAPSHOT_FIXTURES,
        roomNames: Object.fromEntries(ROOMS.map((r) => [r.id, r.name])),
        notes: [
          { id: 'n1', text: 'Colonne montante à reprendre', at: { x: 1.2, z: 2.2 } },
          { id: 'n2', text: 'Attente TV à confirmer', at: { x: 3.2, z: 1.1 } },
          { id: 'n3', text: 'Gaine à reprendre', at: { x: 2.4, z: 2.4 } },
        ],
        north: 12,
      } as never,
      false,
      { ceiling: PLAFOND, showSurfaces: true, metre: false, measures2D: true } as never,
    ),
  );

describe('le plan imprimé se lit', () => {
  /*
    AUCUN MOT SUR UN AUTRE — releve du patron : « fais en sorte que chaque
    ligne et chaque mesure n'empiete pas une autre et sa lisibilite
    complete ».

    Le plan ecrit une dizaine de familles de mots — nom de meuble, cote de
    mur, largeur de menuiserie, cote d'appareil, sigle, repere de circuit,
    cartouche de piece, note, numero de mur — et chacune tenait sa propre
    liste, quand elle en tenait une. Deux familles qui ne se voient pas se
    marchent forcement dessus un jour : c'etait « Canape » sous une note, et
    la largeur d'une porte sous la cote d'une prise.

    Elles partagent maintenant UNE reserve, dans l'ordre de ce qu'elles
    peuvent ceder. Ce banc le verifie la ou ca se voit : sur le document.
  */
  it('n’écrit aucun mot par-dessus un autre', () => {
    const mots = motsDu(plan()).filter((m) => m.y > 120 && m.y < 700);
    const paires: string[] = [];
    for (let i = 0; i < mots.length; i++) {
      for (let j = i + 1; j < mots.length; j++) {
        if (touche(emprise(mots[i]), emprise(mots[j]))) {
          paires.push(`${mots[i].texte} / ${mots[j].texte}`);
        }
      }
    }
    expect(paires).toEqual([]);
  });

  /*
    ET IL NE PERD RIEN EN CHEMIN. Une reserve trop stricte reglerait le
    probleme en effacant les cotes : le banc compte donc aussi ce qui
    s'ecrit. Deux appareils voisins peuvent encore se disputer la place — la
    valeur cede alors, la ligne de cote reste —, mais pas au point de vider
    le plan.
  */
  it('et garde ses cotes, ses sigles et ses cartouches', () => {
    const vus = motsDu(plan())
      .filter((m) => m.y > 120 && m.y < 700)
      .map((m) => m.texte);
    expect(vus).toContain('Séjour');
    expect(vus).toContain('Cuisine');
    expect(vus).toContain('DCL');
    expect(vus).toContain('DAAF');
    expect(vus.filter((t) => /^\d+$/.test(t)).length).toBeGreaterThanOrEqual(12);
    expect(vus.filter((t) => t.includes('m')).length).toBeGreaterThanOrEqual(4);
  });

  /*
    LE SOL EST BLANC — releve du patron : « fais la surface blanche et non
    avec des petits points ». Le semis vient de l'ecran, ou il donne
    l'echelle sous le doigt ; sur le papier, c'est du bruit sous ce qu'on
    est venu lire, et une cartouche d'encre.
  */
  it('ne seme plus de points sur le sol', () => {
    // Le semis se dessinait en centaines de disques minuscules : le flux
    // n'en porte plus un seul de ce rayon-la.
    const src = plan();
    const petits = src.match(/0\.55 0 0 0\.55/g) ?? [];
    expect(petits).toHaveLength(0);
  });
});
