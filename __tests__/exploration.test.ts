/**
 * L'EXPLORATION — entrer dans la pièce, et s'y promener comme dans un jeu.
 *
 * Relevé du patron : « enlève la visualisation vidéo, mais ajoute un vrai
 * mode où l'on rentre dans la pièce créée, sous forme de point qui se balade
 * avec nos déplacements comme un jeu vidéo mobile, avec collisions sur murs
 * et meubles etc. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * « UN VRAI MODE » — PARCE QU'IL Y EN A EU UN FAUX.
 *
 * Une visite intérieure a existé (commit 8bce4e5), et elle a été retirée deux
 * heures plus tard : « à l'usage, elle butait trop souvent ». En relisant son
 * code, trois causes, et ce banc les vise une par une :
 *
 * 1. LA PORTE SE TESTAIT SUR L'AXE DU MUR, PAS SUR SES BOUTS. Le passage était
 *    accordé quand le point tombait « dans le trou » ; à côté, le mur
 *    repoussait perpendiculairement à lui-même, y compris contre le chant du
 *    montant. On restait donc collé au chambranle, poussé de travers, au lieu
 *    de glisser dans l'embrasure. Ici, un mur percé devient DEUX segments
 *    pleins dont les bouts sont ARRONDIS : on glisse sur le montant comme sur
 *    une rampe, et il nous verse dans la porte.
 *
 * 2. LES MEUBLES NE COMPTAIENT PAS. On traversait le canapé. Le patron le
 *    demande en toutes lettres : « collisions sur murs ET meubles ».
 *
 * 3. DEUX PASSES DE RÉSOLUTION. Dans un angle où deux murs et un meuble se
 *    rencontrent, deux passes ne suffisent pas à tout départager : le point
 *    restait dedans, et le pas suivant le faisait trembler.
 *
 * ET CE BANC NE REGARDE PAS L'ÉCRAN : la marche est de la géométrie, et une
 * géométrie s'éprouve à la règle. Le dessin, lui, est celui de la 3D — avec
 * un sol et un plafond qu'elle sait désormais montrer de l'intérieur.
 */
import {
  HAUTEUR_OEIL,
  RAYON_VISITEUR,
  deplacer,
  estLibre,
  obstaclesDeLaVisite,
  pointDeDepart,
  type Obstacle,
} from '../src/geometry/exploration';
import type { Pt, WallSeg } from '../src/geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';

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

const ouverture = (
  id: string,
  type: 'door' | 'window' | 'opening',
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: type === 'window' ? 1.2 : 2.1,
  yCenter: type === 'window' ? 1.5 : 1.05,
});

/** Un meuble droit, posé à `bas` mètres du sol. */
const objet = (
  id: string,
  category: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  bas = 0,
  roomId = 'sejour',
): ObjectData => ({
  id,
  category,
  width: w,
  depth: d,
  height: h,
  roomId,
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, bas + h / 2, cz, 1],
});

/*
  DEUX PIÈCES ET UNE PORTE — le plus petit logement qui pose toutes les
  questions. Séjour de 5 × 4 m à gauche, chambre de 3 × 4 m à droite, un
  refend en x = 5 percé d'une porte de 80 cm (z de 1,6 à 2,4). Une fenêtre au
  nord du séjour, qu'on ne traverse pas.
*/
const MURS: WallSeg[] = [
  mur('n1', 'sejour', 0, 0, 5, 0),
  mur('ref', 'sejour', 5, 0, 5, 4),
  mur('s1', 'sejour', 5, 4, 0, 4),
  mur('o1', 'sejour', 0, 4, 0, 0),
  mur('n2', 'chambre', 5, 0, 8, 0),
  mur('e2', 'chambre', 8, 0, 8, 4),
  mur('s2', 'chambre', 8, 4, 5, 4),
];
const PIECES = [
  { id: 'sejour', name: 'Séjour', wallIds: ['n1', 'ref', 's1', 'o1'] },
  { id: 'chambre', name: 'Chambre', wallIds: ['n2', 'e2', 's2', 'ref'] },
];
const PORTE = ouverture('porte', 'door', 5, 1.6, 5, 2.4);
const FENETRE = ouverture('fenetre', 'window', 1, 0, 2.5, 0);

const CANAPE = objet('canape', 'sofa', 2.5, 3.2, 2.0, 0.9, 0.85);
const TAPIS = objet('tapis', 'tapis', 2.5, 1.8, 2.0, 1.4, 0.02);
const ELEMENT_HAUT = objet('haut', 'storage', 4.4, 0.3, 1.0, 0.35, 0.7, 1.4);

const OBST = obstaclesDeLaVisite(
  MURS,
  [PORTE, FENETRE],
  [CANAPE, TAPIS, ELEMENT_HAUT],
  PIECES,
);

/** Où l'on est, par rapport au refend : séjour, chambre, ou dans le mur. */
const piece = (p: Pt) => (p.x < 5 ? 'sejour' : 'chambre');

/** Le pas d'une image à trente images par seconde, à 1,4 m/s. */
const PAS = 1.4 / 30;

/** Marche N images dans une direction (radians, 0 = +x). */
const marcher = (depuis: Pt, cap: number, images: number, pas = PAS): Pt => {
  let p = depuis;
  for (let i = 0; i < images; i++) {
    p = deplacer(
      p,
      { x: p.x + Math.cos(cap) * pas, z: p.z + Math.sin(cap) * pas },
      OBST,
    );
  }
  return p;
};

/** La distance d'un point à un segment, pour vérifier qu'on ne pénètre rien. */

describe('ce qui arrête, et ce qui laisse passer', () => {
  it('une porte perce son mur : le refend devient deux pans pleins', () => {
    const refend = OBST.filter(
      (o): o is Extract<Obstacle, { kind: 'mur' }> =>
        o.kind === 'mur' && Math.abs(o.a.x - 5) < 1e-6 && Math.abs(o.b.x - 5) < 1e-6,
    );
    expect(refend).toHaveLength(2);
  });

  it('une fenêtre, non : on ne l’enjambe pas', () => {
    const nord = OBST.filter(
      (o) => o.kind === 'mur' && Math.abs(o.a.z) < 1e-6 && Math.abs(o.b.z) < 1e-6 && o.b.x <= 5 + 1e-6,
    );
    expect(nord).toHaveLength(1);
  });

  it('le canapé arrête ; le tapis et l’élément haut, non', () => {
    /*
      Un tapis se marche dessus, et l'on passe SOUS un élément de cuisine
      accroché à 1,40 m. Les faire buter, ce serait buter dans le vide — la
      chose même qui a fait retirer la première visite.
    */
    const meubles = OBST.filter((o) => o.kind === 'meuble');
    expect(meubles).toHaveLength(1);
    expect(estLibre({ x: 2.5, z: 3.2 }, OBST)).toBe(false); // sur le canapé
    expect(estLibre({ x: 2.5, z: 1.8 }, OBST)).toBe(true); // sur le tapis
    // Sous l'élément haut : DANS son emprise (z de 0,125 à 0,475), et libre.
    expect(estLibre({ x: 4.4, z: 0.4 }, OBST)).toBe(true);
  });
});

describe('on ne traverse jamais rien', () => {
  it('ni un mur, ni un meuble, quelle que soit la direction', () => {
    /*
      Le banc de la première visite lançait le visiteur dans soixante-douze
      directions ; celui-ci le fait partir de quatre points différents, et
      vérifie à CHAQUE image qu'il garde ses distances. Une seule image
      dans un mur, et le pas suivant le ressortirait de l'autre côté.
    */
    const departs: Pt[] = [
      { x: 1.2, z: 1.2 },
      { x: 3.8, z: 2.0 },
      { x: 6.5, z: 1.0 },
      { x: 7.2, z: 3.2 },
    ];
    for (const d of departs) {
      for (let k = 0; k < 72; k++) {
        const cap = (k / 72) * Math.PI * 2;
        let p = d;
        for (let i = 0; i < 150; i++) {
          const avant = p;
          p = deplacer(p, { x: p.x + Math.cos(cap) * PAS, z: p.z + Math.sin(cap) * PAS }, OBST);
          expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
          expect(estLibre(p, OBST, RAYON_VISITEUR * 0.98)).toBe(true);
          /*
            ON NE CHANGE DE PIÈCE QUE PAR LA PORTE — et c'est le PAS DE
            FRANCHISSEMENT qu'on juge. La première version de ce banc
            vérifiait la hauteur de l'embrasure à chaque image passée dans
            l'autre pièce ; or on continue de marcher après la porte, et
            l'on a bien le droit d'aller dans un coin de la chambre.
          */
          if (piece(p) !== piece(avant)) {
            const zPassage = (avant.z + p.z) / 2;
            expect(zPassage).toBeGreaterThan(1.6);
            expect(zPassage).toBeLessThan(2.4);
          }
        }
        // Et l'on reste dans le logement.
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(8);
        expect(p.z).toBeGreaterThan(0);
        expect(p.z).toBeLessThan(4);
      }
    }
  });

  it('même un pas de trois mètres d’un coup ne passe pas au travers', () => {
    /*
      Une image perdue, un doigt qui balaie vite : le pas arrive gros. La
      première visite le testait au point d'arrivée — et le point d'arrivée
      était de l'autre côté d'une cloison de sept centimètres, au large.
    */
    const p = deplacer({ x: 3.5, z: 1.0 }, { x: 6.5, z: 1.0 }, OBST);
    expect(piece(p)).toBe('sejour');
    expect(p.x).toBeLessThan(5);
  });
});

describe('on glisse au lieu de buter', () => {
  it('contre un mur, en biais : on file le long de la cloison', () => {
    /*
      C'est ce qui fait la différence entre un jeu et un labyrinthe : pousser
      en diagonale contre un mur ne retire que ce qui le traverse, et l'on
      avance le long de lui.
    */
    const depart = { x: 1.0, z: 0.8 };
    // Vers le nord-est : moitié dans le mur nord, moitié le long.
    const p = marcher(depart, -Math.PI / 4, 45);
    expect(p.x - depart.x).toBeGreaterThan(0.6);
    expect(p.z).toBeGreaterThan(0.07 + RAYON_VISITEUR - 1e-3);
  });

  it('contre le canapé aussi', () => {
    const depart = { x: 1.2, z: 2.2 };
    // Vers le sud-est : le canapé est au sud.
    const p = marcher(depart, Math.PI / 4, 45);
    expect(p.x - depart.x).toBeGreaterThan(0.6);
    expect(estLibre(p, OBST)).toBe(true);
  });

  it('dans un angle, on s’arrête net, sans trembler', () => {
    // Coin nord-ouest du séjour, poussé droit dedans pendant deux secondes.
    let p: Pt = { x: 0.6, z: 0.6 };
    const traces: Pt[] = [];
    for (let i = 0; i < 60; i++) {
      p = deplacer(p, { x: p.x - PAS, z: p.z - PAS }, OBST);
      traces.push(p);
    }
    // Les dix dernières images : immobile, au millimètre.
    const fin = traces.slice(-10);
    for (const q of fin) {
      expect(Math.hypot(q.x - fin[0].x, q.z - fin[0].z)).toBeLessThan(1e-3);
    }
    expect(estLibre(p, OBST, RAYON_VISITEUR * 0.98)).toBe(true);
  });
});

describe('la porte se passe sans viser', () => {
  it('droit au centre : on change de pièce', () => {
    const p = marcher({ x: 4.0, z: 2.0 }, 0, 60);
    expect(piece(p)).toBe('chambre');
  });

  it('à vingt centimètres du centre : le montant nous verse dedans', () => {
    /*
      C'EST L'ÉPREUVE QUI DIT SI LA VISITE « BUTE ». Personne ne vise une
      porte au centimètre avec un pouce. Celle-ci arrive vingt centimètres
      trop au sud : le bout ARRONDI du montant la fait glisser vers
      l'embrasure, et elle passe — au lieu de rester collée au chambranle.
    */
    for (const decalage of [-0.2, 0.2]) {
      const p = marcher({ x: 4.0, z: 2.0 + decalage }, 0, 75);
      expect(`${decalage} : ${piece(p)}`).toBe(`${decalage} : chambre`);
    }
  });

  it('et en biais aussi', () => {
    // On vient de loin, en diagonale, comme on marche dans un vrai logement.
    const p = marcher({ x: 3.4, z: 0.9 }, Math.atan2(1.1, 1.6), 90);
    expect(piece(p)).toBe('chambre');
  });
});

describe('l’entrée dans le logement', () => {
  it('se fait dans la plus grande pièce, à l’écart de tout', () => {
    const d = pointDeDepart(MURS, PIECES, OBST)!;
    expect(d).not.toBeNull();
    expect(piece(d.at)).toBe('sejour');
    // Pas collé à un mur ni dans le canapé : on doit pouvoir tourner sur
    // place dès la première image.
    expect(estLibre(d.at, OBST, RAYON_VISITEUR * 2)).toBe(true);
  });

  it('et le regard part vers là où il y a le plus à voir', () => {
    /*
      Entrer le nez dans un mur, c'est commencer par chercher où l'on est. Le
      regard part dans la direction la plus dégagée — la profondeur de la
      pièce, celle qui dit d'un coup où l'on se trouve.
    */
    const d = pointDeDepart(MURS, PIECES, OBST)!;
    let libre = 0;
    let p = d.at;
    for (let i = 0; i < 200; i++) {
      const q = { x: p.x + Math.cos(d.yaw) * 0.02, z: p.z + Math.sin(d.yaw) * 0.02 };
      if (!estLibre(q, OBST)) break;
      p = q;
      libre += 0.02;
    }
    expect(libre).toBeGreaterThan(1.5);
  });

  it('et l’on entre EN RETRAIT : la pièce est devant soi, pas autour', () => {
    /*
      Au cœur de la pièce, la direction la plus profonde part souvent vers
      une porte d'un mur proche — on se retrouvait le nez à deux mètres d'une
      cloison. Les visites des agences commencent depuis le seuil : on
      recule dans le dos du regard, et la profondeur devant soi grandit.
    */
    const d = pointDeDepart(MURS, PIECES, OBST)!;
    const course = (sens: number) => {
      let n = 0;
      let p = d.at;
      for (let i = 0; i < 400; i++) {
        const q = {
          x: p.x + Math.cos(d.yaw) * sens * 0.02,
          z: p.z + Math.sin(d.yaw) * sens * 0.02,
        };
        if (!estLibre(q, OBST)) break;
        p = q;
        n += 0.02;
      }
      return n;
    };
    expect(course(1)).toBeGreaterThan(course(-1) * 2);
  });

  it('à hauteur d’œil d’un adulte', () => {
    expect(HAUTEUR_OEIL).toBeGreaterThan(1.5);
    expect(HAUTEUR_OEIL).toBeLessThan(1.75);
  });
});

describe('ce qui ne doit jamais casser', () => {
  it('un pas qui n’est pas un nombre ne bouge rien', () => {
    const p = deplacer({ x: 2, z: 2 }, { x: NaN, z: 2 }, OBST);
    expect(p).toEqual({ x: 2, z: 2 });
  });

  it('quelqu’un posé DANS un meuble en ressort au premier pas', () => {
    /*
      On ne commence jamais dans un canapé — mais le plan peut changer sous
      les pieds : un meuble glissé depuis l'écran du plan, un relevé rouvert.
      Le pas suivant doit l'en sortir, pas l'y enfermer : poussé depuis ses
      bords, un point DEDANS est renvoyé vers l'intérieur.
    */
    const p = deplacer({ x: 2.5, z: 3.15 }, { x: 2.5, z: 3.15 }, OBST);
    expect(estLibre(p, OBST, RAYON_VISITEUR * 0.98)).toBe(true);
  });

  it('un logement sans pièce a quand même une entrée', () => {
    const d = pointDeDepart(MURS, [], OBST);
    expect(d).not.toBeNull();
    expect(estLibre(d!.at, OBST)).toBe(true);
  });
});
