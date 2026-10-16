/**
 * LA NATURE D'UN MUR — maçonnerie, cloison en plaque de plâtre, doublage
 * isolant, à démolir, à créer.
 *
 * Relevé du patron, dossier d'architecte à l'appui (« Rénovation d'une
 * villa », Romeo Architectes) : « fais en sorte qu'on ait la possibilité de
 * marquer la nature des murs, comme les murs intérieurs en placo. Ces murs
 * changeront de visuel sur le plan, comme sur celui fourni ».
 *
 * LES CONVENTIONS DU PLAN FOURNI, relevées au pixel par deux lecteurs :
 *   — la MAÇONNERIE (façades, refends, poteaux) en noir plein, sans contour ;
 *   — la CLOISON en plaque de plâtre en gris uni (#CCCCCC), cernée d'un trait
 *     noir fin ;
 *   — le DOUBLAGE isolant en blanc, rempli de boucles qui se chevauchent sur
 *     toute son épaisseur, une boucle tous les cinq centimètres environ.
 * Et les deux états d'un plan de rénovation que le métier ajoute partout :
 * À DÉMOLIR en jaune, À CRÉER en rouge.
 *
 * UN MUR SANS NATURE SE DESSINE COMME AVANT, en noir — c'est le cas de tout
 * ce que RoomPlan relève : il ne sait pas de quoi un mur est fait. La nature
 * se marque à la main, mur par mur ; un plan ancien n'a rien à migrer.
 *
 * Les teintes se calculent depuis l'encre et le fond du thème : en sombre,
 * le gris de la cloison reste un ton entre les deux, comme en clair.
 */
import { epaisseurDe, type Pt, type WallQuad, type WallSeg } from './floorplan';
import { mixHex } from './appearance';

export type NatureMur = 'porteur' | 'cloison' | 'doublage' | 'demolir' | 'creer';

export interface DefNature {
  cle: NatureMur;
  /** Le nom du menu et de la légende. */
  libelle: string;
  /** Une ligne d'aide : ce que c'est, et ce qu'on y fait. */
  aide: string;
}

/** Dans l'ordre du menu : du plus fréquent au plus rare. */
export const NATURES_MUR: DefNature[] = [
  { cle: 'porteur', libelle: 'Mur porteur, maçonnerie', aide: 'Béton, parpaing, brique, pierre — noir plein, comme sur un plan d’architecte' },
  { cle: 'cloison', libelle: 'Cloison en plaque de plâtre', aide: 'Placo sur ossature — en gris, on y passe les gaines sans saignée' },
  { cle: 'doublage', libelle: 'Doublage isolant', aide: 'Isolant et plaque contre un mur — en boucles, comme l’isolant dessiné' },
  { cle: 'demolir', libelle: 'À démolir', aide: 'Le mur part avec les travaux — en jaune' },
  { cle: 'creer', libelle: 'À créer', aide: 'Le mur se monte pendant les travaux — en rouge' },
];

const PAR_CLE = new Map(NATURES_MUR.map((n) => [n.cle, n]));

/** La nature d'un mur, si on l'a dite ; `null` : un mur comme les autres. */
export function natureDe(w: { nature?: NatureMur }): NatureMur | null {
  return w.nature && PAR_CLE.has(w.nature) ? w.nature : null;
}

export const libelleNature = (n: NatureMur): string => PAR_CLE.get(n)?.libelle ?? n;

/**
 * UN MUR QUI SE DESSINE AUTREMENT QUE LE POCHÉ NOIR.
 *
 * Le porteur est la maçonnerie elle-même : il garde le noir du poché, et ne
 * change que la légende.
 */
export const seDistingue = (w: { nature?: NatureMur; type?: string }): boolean => {
  const n = natureDe(w);
  return (w.type === undefined || w.type === 'wall') && n !== null && n !== 'porteur';
};

/** Les natures présentes sur un plan, dans l'ordre du menu : pour la légende. */
export function naturesPresentes(walls: readonly WallSeg[]): NatureMur[] {
  const vues = new Set(walls.filter((w) => w.type === 'wall').map(natureDe).filter((n): n is NatureMur => n !== null));
  return NATURES_MUR.map((n) => n.cle).filter((c) => vues.has(c));
}

export interface RenduNature {
  /** Le remplissage du corps du mur. */
  fond: string;
  /** Le trait qui le cerne. */
  contour: string;
  /** Le trait en tirets (à démolir). */
  tirets: boolean;
  /** Les boucles de l'isolant, de la couleur du contour. */
  boucles: boolean;
}

/** Le rouge des murs à créer, le jaune des murs à démolir — ceux du métier. */
export const ROUGE_A_CREER = '#D9363E';
export const JAUNE_A_DEMOLIR = '#F2C230';

/**
 * LE RENDU D'UNE NATURE, pour une encre et un fond donnés (le thème à
 * l'écran, le blanc du papier dans le PDF).
 */
export function renduNature(n: NatureMur, encre: string, fondPapier: string): RenduNature {
  switch (n) {
    case 'cloison':
      // #CCCCCC sur blanc, à l'encre près : quatre cinquièmes vers le fond.
      return { fond: mixHex(encre, fondPapier, 0.78), contour: encre, tirets: false, boucles: false };
    case 'doublage':
      return { fond: fondPapier, contour: encre, tirets: false, boucles: true };
    case 'demolir':
      return { fond: mixHex(JAUNE_A_DEMOLIR, fondPapier, 0.2), contour: encre, tirets: true, boucles: false };
    case 'creer':
      return { fond: mixHex(ROUGE_A_CREER, fondPapier, 0.72), contour: ROUGE_A_CREER, tirets: false, boucles: false };
    default:
      return { fond: encre, contour: encre, tirets: false, boucles: false };
  }
}

/** Le contour d'un corps de mur, dans l'ordre : une face, puis l'autre. */
export const contourDuQuad = (q: WallQuad): Pt[] => [q.a1, q.b1, q.b2, q.a2];

/**
 * LES BOUCLES DE L'ISOLANT, le long d'un corps de mur (m).
 *
 * Une cycloïde allongée : sur l'axe du mur, une boucle tous les cinq
 * centimètres pour un doublage de dix (le pas suit la demi-épaisseur), qui
 * va d'une face à l'autre. C'est le dessin de l'isolant souple sur le plan
 * fourni ; le rendu le découpe ensuite au poché, baies comprises.
 */
export function bouclesDuDoublage(q: WallQuad): Pt[] {
  const A = { x: (q.a1.x + q.a2.x) / 2, z: (q.a1.z + q.a2.z) / 2 };
  const B = { x: (q.b1.x + q.b2.x) / 2, z: (q.b1.z + q.b2.z) / 2 };
  const L = Math.hypot(B.x - A.x, B.z - A.z);
  const demi = Math.hypot(q.a1.x - q.a2.x, q.a1.z - q.a2.z) / 2;
  if (L < 1e-3 || demi < 1e-3) return [];
  const u = { x: (B.x - A.x) / L, z: (B.z - A.z) / L };
  // La normale, vers la face 1.
  let n = { x: -u.z, z: u.x };
  if ((q.a1.x - A.x) * n.x + (q.a1.z - A.z) * n.z < 0) n = { x: -n.x, z: -n.z };
  const pas = Math.max(0.03, demi);
  const tours = Math.max(1, Math.round(L / pas));
  const pasReel = L / tours;
  const amplitude = demi * 0.86;
  const recul = pasReel * 0.42;
  const parTour = 14;
  const pts: Pt[] = [];
  for (let i = 0; i <= tours * parTour; i++) {
    const th = (i / parTour) * Math.PI * 2;
    const le = (i / parTour) * pasReel - recul * Math.sin(th);
    const tr = -amplitude * Math.cos(th);
    pts.push({ x: A.x + u.x * le + n.x * tr, z: A.z + u.z * le + n.z * tr });
  }
  return pts;
}

const cleNoeud = (p: Pt) => `${Math.round(p.x * 1000)}|${Math.round(p.z * 1000)}`;

export interface DessinDesNatures {
  /**
   * Le corps de chaque mur marqué (rempli, sans trait), ses filets (les
   * traits à tirer : ses deux faces, et son bout s'il finit dans le vide),
   * et ses boucles s'il est un doublage.
   */
  corps: { id: string; nature: NatureMur; contour: Pt[]; filets: Pt[][]; boucles: Pt[] | null }[];
  /** Le cœur d'un nœud dont tous les murs partagent une même nature. */
  coeurs: { poly: Pt[]; nature: NatureMur }[];
  /** La maçonnerie à repeindre PAR-DESSUS : elle reprend la main aux butées. */
  maconnerie: Pt[][];
}

/**
 * CE QUE LE PLAN PEINT PAR-DESSUS LE POCHÉ — partagé par l'écran et le PDF.
 *
 * LA CLOISON BUTE D'ÉQUERRE CONTRE LA MAÇONNERIE. L'onglet d'un nœud en T
 * taillait le bout d'une cloison en pointe de flèche dans le noir. Un bout
 * qui touche un mur d'une autre nature est donc prolongé d'équerre jusqu'au
 * nœud, et la maçonnerie de ce nœud se repeint ensuite par-dessus : la
 * cloison s'arrête net à la face du mur, comme sur le plan d'architecte. Entre
 * deux murs de même nature, l'onglet reste — un angle de cloisons est un
 * angle.
 */
export function dessinDesNatures(
  walls: readonly WallSeg[],
  quads: Map<string, WallQuad>,
  jonctions: { poly: Pt[]; nature: NatureMur | null; p: Pt }[],
): DessinDesNatures | null {
  const murs = walls.filter((w) => w.type === 'wall');
  const marques = murs.filter(seDistingue);
  if (marques.length === 0) return null;
  // Les natures qui se rencontrent à chaque nœud, et combien de bras y arrivent.
  const auNoeud = new Map<string, Set<NatureMur | null>>();
  const bras = new Map<string, number>();
  for (const w of murs) {
    for (const p of [w.a, w.b]) {
      const k = cleNoeud(p);
      const s = auNoeud.get(k) ?? new Set<NatureMur | null>();
      s.add(natureDe(w));
      auNoeud.set(k, s);
      bras.set(k, (bras.get(k) ?? 0) + 1);
    }
  }
  const butee = (p: Pt) => (auNoeud.get(cleNoeud(p))?.size ?? 1) > 1;
  /** Une maçonnerie (non marquée, ou porteuse) arrive à ce nœud. */
  const maconneAu = (k: string) => {
    const s = auNoeud.get(k);
    return !!s && (s.has(null) || s.has('porteur'));
  };
  const corps: DessinDesNatures['corps'] = [];
  const maconnerie: Pt[][] = [];
  for (const w of marques) {
    const q = quads.get(w.id);
    if (!q) continue;
    const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    if (L < 1e-6) continue;
    const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    const perp = (face: Pt, p: Pt) => {
      // Le pied de la perpendiculaire menée de `p` à la face (droite de direction u).
      const t = (p.x - face.x) * u.x + (p.z - face.z) * u.z;
      return { x: face.x + u.x * t, z: face.z + u.z * t };
    };
    const ext: WallQuad = {
      a1: butee(w.a) ? perp(q.a1, w.a) : q.a1,
      a2: butee(w.a) ? perp(q.a2, w.a) : q.a2,
      b1: butee(w.b) ? perp(q.b1, w.b) : q.b1,
      b2: butee(w.b) ? perp(q.b2, w.b) : q.b2,
    };
    /*
      LE FILET COURT LE LONG DES FACES — pas autour du bout. Les onglets d'un
      nœud font s'arrêter chaque face là où elle rencontre sa voisine : deux
      cloisons en T se lisent d'un seul tenant, sans trait en travers. Seul
      un bout qui finit dans le vide (un retour de cloison) se ferme.
    */
    const filets: Pt[][] = [
      [ext.a1, ext.b1],
      [ext.a2, ext.b2],
    ];
    if ((bras.get(cleNoeud(w.a)) ?? 1) === 1) filets.push([ext.a1, ext.a2]);
    if ((bras.get(cleNoeud(w.b)) ?? 1) === 1) filets.push([ext.b1, ext.b2]);
    corps.push({
      id: w.id,
      nature: w.nature!,
      contour: contourDuQuad(ext),
      filets,
      boucles: w.nature === 'doublage' ? bouclesDuDoublage(ext) : null,
    });
  }
  /*
    LA MAÇONNERIE QUI TOUCHE UNE BUTÉE se repeint, prolongée d'équerre au-delà
    du nœud de la demi-épaisseur du mur marqué : dans un angle en L, elle
    couvre ainsi tout le coin, et la cloison s'arrête à sa face.
  */
  const demiMarque = new Map<string, number>();
  for (const w of marques) {
    for (const p of [w.a, w.b]) {
      const k = cleNoeud(p);
      demiMarque.set(k, Math.max(demiMarque.get(k) ?? 0, epaisseurDe(w) / 2));
    }
  }
  for (const w of murs) {
    if (seDistingue(w)) continue;
    // Un porteur n'a à reprendre la main qu'aux nœuds où il bute une cloison.
    const ka = cleNoeud(w.a);
    const kb = cleNoeud(w.b);
    const extA = butee(w.a) ? demiMarque.get(ka) ?? 0 : 0;
    const extB = butee(w.b) ? demiMarque.get(kb) ?? 0 : 0;
    if (extA === 0 && extB === 0) continue;
    const q = quads.get(w.id);
    const L = Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z);
    if (!q || L < 1e-6) continue;
    const u = { x: (w.b.x - w.a.x) / L, z: (w.b.z - w.a.z) / L };
    const pied = (face: Pt, p: Pt) => {
      const t = (p.x - face.x) * u.x + (p.z - face.z) * u.z;
      return { x: face.x + u.x * t, z: face.z + u.z * t };
    };
    const finA = { x: w.a.x - u.x * extA, z: w.a.z - u.z * extA };
    const finB = { x: w.b.x + u.x * extB, z: w.b.z + u.z * extB };
    maconnerie.push(
      contourDuQuad({
        a1: extA > 0 ? pied(q.a1, finA) : q.a1,
        a2: extA > 0 ? pied(q.a2, finA) : q.a2,
        b1: extB > 0 ? pied(q.b1, finB) : q.b1,
        b2: extB > 0 ? pied(q.b2, finB) : q.b2,
      }),
    );
  }
  const coeurs: DessinDesNatures['coeurs'] = [];
  for (const j of jonctions) {
    if (j.nature && j.nature !== 'porteur') {
      coeurs.push({ poly: j.poly, nature: j.nature });
      continue;
    }
    /*
      Un cœur de natures mêlées n'est noir que si une maçonnerie y arrive :
      une cloison qui rencontre un doublage n'a pas de noir entre elles.
    */
    if (maconneAu(cleNoeud(j.p))) maconnerie.push(j.poly);
  }
  return { corps, coeurs, maconnerie };
}
