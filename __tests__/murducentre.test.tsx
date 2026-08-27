/**
 * CE QU'ON TOUCHE PRIME SUR CE QUI EST À CÔTÉ.
 *
 * Relevé du patron : « fais en sorte que le mur ne soit pas sélectionné si on
 * clique sur le centre d'une petite pièce — par exemple je clique sur un
 * meuble dans une petite pièce, c'est le mur qui est sélectionné car proche ».
 *
 * LA SUITE D'UNE HISTOIRE DÉJÀ ÉCRITE. La cible d'un mur faisait trente
 * points en dur ; elle suit désormais son poché (`max(12, poché + 6)`), et le
 * banc `viserlemur` garde ce résultat : au CENTRE d'un placard d'un mètre dix,
 * plus aucun mur n'est attrapé. Ce banc-ci prend le problème par l'autre bout :
 * dans une salle d'eau de 3,8 m², le meuble ne laisse pas de centre libre — il
 * touche presque les murs. Le doigt tombe donc sur le MEUBLE, dans un endroit
 * où le halo du mur passe encore.
 *
 * ET C'EST L'ORDRE DE DESSIN QUI TRANCHAIT, pas la géométrie. Les murs sont
 * peints APRÈS les meubles, donc au-dessus : leur halo — trois points de
 * tolérance de chaque côté du poché — volait l'appui à ce qui était dessous.
 *
 * LA RÈGLE. Un mur a deux zones, et elles n'ont pas le même droit : le POCHÉ,
 * qui est ce qu'on voit et qu'on vise, et le HALO, qui n'est qu'une tolérance
 * pour le tremblement du doigt. Le poché reste au-dessus de tout ; le halo
 * descend SOUS les meubles. Toucher un mur prend le mur ; toucher à côté d'un
 * mur ne le prend que si rien d'autre n'est dessiné là.
 *
 * LE CONTRÔLE EN SENS INVERSE fait la moitié du banc : un appui franchement
 * SUR le poché d'un mur doit toujours donner le mur, et un appui sur le sol
 * nu, à un ou deux points du mur, doit encore le donner — sinon on aurait
 * seulement échangé un défaut contre un autre.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { G, Line, Polygon, Rect } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import type { WallSeg } from '../src/geometry/floorplan';

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
  UN LOGEMENT, ET SA SALLE D'EAU.

  Il faut les deux : le logement entier pour que l'échelle tombe à la
  quarantaine de points par mètre — celle de l'ouverture d'un plan —, et la
  petite pièce pour que le meuble et le mur se disputent le même doigt.

  La salle d'eau fait 1,60 m sur 2,40 m, soit 3,84 m² : le relevé du patron.
*/
const SALLE = { x0: 5, z0: 4, x1: 6.6, z1: 6.4 };
const LOGEMENT = [
  mur('n', 'r1', 0, 0, 12, 0),
  mur('e', 'r1', 12, 0, 12, 9),
  mur('s', 'r1', 12, 9, 0, 9),
  mur('o', 'r1', 0, 9, 0, 0),
  mur('sn', 'r2', SALLE.x0, SALLE.z0, SALLE.x1, SALLE.z0),
  mur('se', 'r2', SALLE.x1, SALLE.z0, SALLE.x1, SALLE.z1),
  mur('ss', 'r2', SALLE.x1, SALLE.z1, SALLE.x0, SALLE.z1),
  mur('so', 'r2', SALLE.x0, SALLE.z1, SALLE.x0, SALLE.z0),
];

/*
  LE MEUBLE QUI REMPLIT LA PIÈCE — une baignoire, 1,50 m sur 0,70 m.

  C'est le cas de chantier : dans une salle d'eau, rien n'est « au milieu ».
  Le meuble longe un mur et son bord arrive à quelques centimètres des
  autres.
*/
const MEUBLE = {
  id: 'o1',
  category: 'bathtub',
  width: 0.7,
  depth: 1.5,
  height: 0.55,
  roomId: 'r2',
  // Contre le mur ouest, comme dans toutes les salles d'eau du monde : son
  // nu arrive sur le nu du poche, a sept centimetres de l'axe du mur.
  transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5.42, 0.28, 5.2, 1],
};

// ---------------------------------------------------------------------------
// QUI RÉPOND SOUS LE DOIGT — le dessin, lu comme le téléphone le lit.
// ---------------------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

/** Une transformation SVG « translate(...) rotate(...) », appliquée à un point. */
function appliquer(t: string, p: Pt): Pt {
  let out = p;
  const morceaux = [...t.matchAll(/(translate|rotate)\(([^)]*)\)/g)];
  // Les transformations se lisent de DROITE à GAUCHE : la dernière écrite
  // s'applique la première au point local.
  for (let i = morceaux.length - 1; i >= 0; i--) {
    const [, nom, args] = morceaux[i];
    const v = args.split(',').map((s) => Number(s.trim()));
    if (nom === 'translate') out = { x: out.x + (v[0] || 0), y: out.y + (v[1] || 0) };
    else {
      const a = ((v[0] || 0) * Math.PI) / 180;
      out = {
        x: out.x * Math.cos(a) - out.y * Math.sin(a),
        y: out.x * Math.sin(a) + out.y * Math.cos(a),
      };
    }
  }
  return out;
}

/** Un point local d'un nœud, porté dans le repère de la page. */
function versLaPage(noeud: TestRenderer.ReactTestInstance, p: Pt): Pt {
  const chaine: string[] = [];
  let n: TestRenderer.ReactTestInstance | null = noeud;
  while (n) {
    if (n.type === G && typeof n.props.transform === 'string') {
      chaine.push(n.props.transform);
    }
    n = n.parent;
  }
  // De la feuille vers la racine : chaque groupe traversé en montant.
  return chaine.reduce((q, t) => appliquer(t, q), p);
}

const dansLePolygone = (p: Pt, s: Pt[]) => {
  let dedans = false;
  for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
    if (
      s[i].y > p.y !== s[j].y > p.y &&
      p.x < ((s[j].x - s[i].x) * (p.y - s[i].y)) / (s[j].y - s[i].y) + s[i].x
    ) {
      dedans = !dedans;
    }
  }
  return dedans;
};

const distanceAuSegment = (p: Pt, a: Pt, b: Pt) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
};

/** Une forme qu'on VOIT : elle a une couleur, elle n'est pas là que pour le doigt. */
const seVoit = (q: Record<string, unknown>) => {
  const vif = (v: unknown) =>
    typeof v === 'string' && v !== 'transparent' && v !== 'none';
  return vif(q.fill) || vif(q.stroke);
};

/**
 * Ce nœud, ou l'un de ses dessins, couvre-t-il ce point de la page ?
 *
 * `visible` restreint la question à ce qui SE VOIT : c'est toute la
 * différence entre le poché d'un mur, qu'on vise, et son halo, qui n'est
 * qu'une tolérance posée à côté.
 */
function couvre(
  noeud: TestRenderer.ReactTestInstance,
  p: Pt,
  visible = false,
): boolean {
  const formes = [
    ...noeud.findAllByType(Rect),
    ...noeud.findAllByType(Polygon),
    ...noeud.findAllByType(Line),
  ];
  if (noeud.type === Rect || noeud.type === Polygon || noeud.type === Line) {
    formes.push(noeud);
  }
  for (const f of formes) {
    const q = f.props as Record<string, unknown>;
    if (visible && !seVoit(q)) continue;
    if (f.type === Rect) {
      const x = Number(q.x) || 0;
      const y = Number(q.y) || 0;
      const w = Number(q.width) || 0;
      const h = Number(q.height) || 0;
      const coins = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ].map((c) => versLaPage(f, c));
      if (dansLePolygone(p, coins)) return true;
    } else if (f.type === Polygon) {
      const pts = String(q.points ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => {
          const [a, b] = s.split(',').map(Number);
          return versLaPage(f, { x: a, y: b });
        });
      if (pts.length >= 3 && dansLePolygone(p, pts)) return true;
    } else {
      const a = versLaPage(f, { x: Number(q.x1) || 0, y: Number(q.y1) || 0 });
      const b = versLaPage(f, { x: Number(q.x2) || 0, y: Number(q.y2) || 0 });
      const large = Number(q.strokeWidth) || 1;
      if (distanceAuSegment(p, a, b) <= large / 2) return true;
    }
  }
  return false;
}

/**
 * L'APPUI, RENDU COMME LE FAIT LE TÉLÉPHONE : c'est le DERNIER dessin peint
 * sous le doigt qui répond, pas le premier trouvé.
 *
 * `findAll` parcourt l'arbre dans l'ordre de peinture ; le dernier de la
 * liste est donc celui du dessus. On relève les cibles UNE fois — les
 * balayer point par point coûterait sinon un parcours d'arbre par appui.
 */
function cibles(t: TestRenderer.ReactTestRenderer) {
  return t.root.findAll(
    (n) => typeof n.type !== 'string' && typeof n.props?.onPress === 'function',
  );
}

/** De quoi est faite cette cible — de quoi on parle quand elle gagne. */
function nommer(n: TestRenderer.ReactTestInstance): string {
  const etiquette = String(n.props.accessibilityLabel ?? '');
  if (etiquette) return etiquette;
  const halo = n
    .findAllByType(Line)
    .some((l) => l.props.stroke === 'transparent' && Number(l.props.strokeWidth) >= 12);
  if (halo) return 'mur';
  const mots = n
    .findAll((x) => typeof x.props?.children === 'string')
    .map((x) => String(x.props.children));
  return mots.length > 0 ? `« ${mots[0]} »` : 'autre';
}

function toucher(
  liste: ReturnType<typeof cibles>,
  p: Pt,
): TestRenderer.ReactTestInstance {
  const dessus = liste.filter((n) => couvre(n, p)).pop();
  if (!dessus) throw new Error(`rien sous le doigt en ${p.x},${p.y}`);
  act(() => dessus.props.onPress());
  return dessus;
}

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (fait: string[]) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    useScanStore.setState({
      walls: LOGEMENT,
      openings: [],
      objects: [MEUBLE] as never,
      rooms: [
        { id: 'r1', name: 'Séjour', floor: null },
        { id: 'r2', name: "Salle d'eau", floor: null },
      ] as never,
      fixtures: [],
      ceiling: [],
      photos: [],
      notes: [],
      niveauCourant: 0,
      showFurniture: true,
    });
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures={false}
        editable
        selectedWallId={null}
        onSelectWall={(id) => fait.push(`mur:${id}`)}
        onSelectObject={(id) => fait.push(`meuble:${id}`)}
        onSelectRoom={(id) => fait.push(`piece:${id}`)}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({ nativeEvent: { layout: { width: 600, height: 480 } } });
  });
  arbre = t;
  return t;
};

/** L'aplat dessiné du meuble, en points de page. */
function aplatDuMeuble(t: TestRenderer.ReactTestRenderer): Pt[] {
  const cible = t.root
    .findAllByType(Rect)
    .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Meuble '))!;
  // Le premier rectangle du même groupe, c'est le dessin ; la cible, elle,
  // est posée en dernier et déborde de la marge de prise.
  const dessin = cible.parent!.findAllByType(Rect)[0];
  const x = Number(dessin.props.x);
  const y = Number(dessin.props.y);
  const w = Number(dessin.props.width);
  const h = Number(dessin.props.height);
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map((c) => versLaPage(dessin, c));
}

describe('un doigt posé sur le meuble d’une petite pièce', () => {
  it('prend le meuble, sur toute sa surface dessinée', () => {
    /*
      TOUT LE DESSIN, PAS SEULEMENT SON CENTRE.

      Au centre d'un meuble, personne ne s'est jamais trompé. C'est au BORD
      que le halo du mur passait — et une baignoire, dans une salle d'eau,
      est plaquée contre le mur : son nu et le nu du poché ne font qu'un.
      Les trois points de tolérance du mur mordent donc sur le meuble sur
      toute sa longueur, et c'est là que le doigt tombe une fois sur deux.

      On balaie donc le rectangle dessiné, au centre de chaque case d'une
      grille — jamais sur une arête, où le pixel lui-même hésite. Aucun de
      ces points n'appartient au poché d'un mur : ils sont tous, sans
      discussion, sur le meuble.
    */
    const fait: string[] = [];
    const t = monter(fait);
    const liste = cibles(t);
    const cibleDuMeuble = t.root
      .findAllByType(Rect)
      .find((n) => String(n.props.accessibilityLabel ?? '').startsWith('Meuble '))!;
    const coins = aplatDuMeuble(t);
    const x0 = Math.min(...coins.map((c) => c.x));
    const y0 = Math.min(...coins.map((c) => c.y));
    const w = Math.max(...coins.map((c) => c.x)) - x0;
    const h = Math.max(...coins.map((c) => c.y)) - y0;
    const PAS = 16;
    const voleurs: string[] = [];
    for (let i = 0; i < PAS; i++) {
      for (let j = 0; j < PAS; j++) {
        const pt = {
          x: x0 + ((i + 0.5) * w) / PAS,
          y: y0 + ((j + 0.5) * h) / PAS,
        };
        const dessus = toucher(liste, pt);
        /*
          LA RÈGLE S'EST DURCIE, ET C'EST LE PATRON QUI L'A DURCIE.

          Première version : « ce qu'on VOIT a le droit de prendre l'appui,
          ce qu'on ne voit pas, non ». Le halo invisible d'un mur n'avait
          rien à voler ; un cartouche de pièce, lui, est dessiné par-dessus
          le meuble, et on lui accordait l'appui.

          Relevé du patron, quelques jours plus tard : « un meuble est
          parfois difficile à cliquer selon son emplacement… fais en sorte
          que là où le doigt touche, si l'élément est dessus il est
          STRICTEMENT sélectionné ». Il a raison, et la première règle était
          une demi-mesure : un cartouche qui n'a pas trouvé où s'écarter se
          pose SUR un meuble, et il n'a pas plus de droit qu'un halo à
          prendre ce qu'il recouvre. Le meuble est ce qu'on visait.
        */
        if (dessus !== cibleDuMeuble) voleurs.push(nommer(dessus));
      }
    }
    expect(
      `${voleurs.length} appuis volés au meuble : ${[...new Set(voleurs)].sort().join(', ')}`,
    ).toBe('0 appuis volés au meuble : ');
  });

  it('et le mur reste pris quand c’est lui qu’on touche', () => {
    // Le contrôle en sens inverse. Sans lui, on aurait pu rendre le mur
    // intouchable et déclarer le défaut corrigé.
    const fait: string[] = [];
    const t = monter(fait);
    const liste = cibles(t);
    const halos = t.root
      .findAllByType(Line)
      .filter(
        (n) => n.props.stroke === 'transparent' && Number(n.props.strokeWidth) >= 12,
      );
    expect(halos.length).toBeGreaterThanOrEqual(LOGEMENT.length);
    // Le mur ouest de la salle d'eau, en son milieu : franchement sur l'axe
    // du poché, rien d'autre n'est dessiné là.
    const axe = halos
      .map((n) => ({
        a: { x: Number(n.props.x1), y: Number(n.props.y1) },
        b: { x: Number(n.props.x2), y: Number(n.props.y2) },
      }))
      .map((s) => ({ ...s, l: Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) }))
      // Les quatre murs de la salle d'eau sont les plus courts du plan.
      .sort((p, q) => p.l - q.l)[0];
    toucher(liste, { x: (axe.a.x + axe.b.x) / 2, y: (axe.a.y + axe.b.y) / 2 });
    expect(fait).toEqual([expect.stringMatching(/^mur:s[nseo]$/)]);
  });

  it('et la tolérance à côté du mur sert encore, là où rien n’est dessiné', () => {
    /*
      LE HALO N'EST PAS SUPPRIMÉ, IL EST DESCENDU.

      Un mur dessiné fin resterait invisable sans ses trois points de
      tolérance de chaque côté. On les garde : sur le sol nu, à un point du
      bord du poché, c'est toujours le mur qui répond.
    */
    const fait: string[] = [];
    const t = monter(fait);
    const liste = cibles(t);
    const cible = t.root
      .findAllByType(Line)
      .filter(
        (n) => n.props.stroke === 'transparent' && Number(n.props.strokeWidth) >= 12,
      )
      .map((n) => ({
        a: { x: Number(n.props.x1), y: Number(n.props.y1) },
        b: { x: Number(n.props.x2), y: Number(n.props.y2) },
        large: Number(n.props.strokeWidth),
        l: Math.hypot(
          Number(n.props.x2) - Number(n.props.x1),
          Number(n.props.y2) - Number(n.props.y1),
        ),
      }))
      // Le mur nord du logement : loin de la salle d'eau, rien ne le gêne.
      .sort((p, q) => q.l - p.l)[0];
    const dx = (cible.b.x - cible.a.x) / cible.l;
    const dy = (cible.b.y - cible.a.y) / cible.l;
    // Un point en deçà du bord du halo, du côté de la pièce.
    const mil = { x: (cible.a.x + cible.b.x) / 2, y: (cible.a.y + cible.b.y) / 2 };
    toucher(liste, {
      x: mil.x - dy * (cible.large / 2 - 1),
      y: mil.y + dx * (cible.large / 2 - 1),
    });
    expect(fait).toEqual([expect.stringMatching(/^mur:/)]);
  });
});
