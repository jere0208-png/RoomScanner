/**
 * LE PLAN EN VOL — les murs, les menuiseries et les meubles que le doigt
 * déplace, avant que le magasin ne l'apprenne.
 *
 * Relevé des testeurs (fluidité du plan 2D) : « chaque image d'un coin, d'un
 * côté ou d'une pièce tirée redessine deux fois tout l'écran et tout
 * l'éditeur. Mesuré : environ 210 ms par image sur l'exemple, 370 ms sur
 * 30 pièces, 1,3 s sur 100 pièces ». Le magasin, lui, ne coûtait que deux ou
 * trois millisecondes : tout partait dans le redessin de ceux qui le lisent
 * — l'écran du plan, ses feuilles, ses bandeaux, et l'éditeur avec ses cotes,
 * ses cartouches, ses meubles et ses deux tracés par mur. Pour un coin qui
 * avançait de deux pixels.
 *
 * C'est la recette du meuble (`useEnVol`, `store/geste`), appliquée aux murs
 * et aux pièces : pendant le geste, ce qui bouge vit ICI. Seules les vues qui
 * le dessinent s'y abonnent — le mur tiré et ses voisins, les poignées, la
 * pièce glissée et ses meubles — et le reste du plan ne se rend plus du
 * tout. Au lâcher, le magasin reçoit l'action UNE fois : un rendu, une
 * entrée d'historique.
 *
 * Ce qu'on montre en vol est calculé par l'action elle-même, exécutée à
 * blanc (`simuler`) : la soudure, le dédoublement d'une cloison mitoyenne,
 * les menuiseries qui suivent — tout est déjà là, et rien ne peut différer
 * de ce que le lâcher écrira.
 */
import { create } from 'zustand';
import type { ObjectData } from 'react-native-room-scan';
import { niveauDe, wallQuads, type WallQuad, type WallSeg } from '../geometry/floorplan';
import { finirLeGeste } from './geste';
import {
  cloreLeGesteDansLHistorique,
  simuler,
  useScanStore,
  type ScanState,
} from './scanStore';

export interface PlanEnVol {
  /** Les murs DÉJÀ au plan qui bougent, à leur place en vol (par identifiant). */
  murs: Map<string, WallSeg>;
  /**
   * Les murs qui NAISSENT pendant le geste — la copie d'une cloison mitoyenne
   * qu'une pièce emporte en s'en allant, le morceau d'un mur partagé qu'on
   * coupe. Ils n'ont pas de place au dessin : un calque les montre.
   */
  nes: WallSeg[];
  /** Les onglets des murs en vol : le corps qu'on dessine, calculé une fois. */
  quads: Map<string, WallQuad>;
  /** Les menuiseries qui bougent avec leur mur, à leur place en vol (par identifiant). */
  baies: Map<string, WallSeg>;
  /** Les meubles qui bougent — ceux de la pièce qu'on glisse. */
  meubles: Map<string, ObjectData>;
  /** La pièce qu'on glisse, et de combien : son sol la suit. */
  piece: { id: string; dx: number; dz: number } | null;
}

export const usePlanEnVol = create<{ plan: PlanEnVol | null }>(() => ({ plan: null }));

const memePoint = (p: { x: number; z: number }, q: { x: number; z: number }) =>
  p.x === q.x && p.z === q.z;

/**
 * MONTRE EN VOL ce qu'écrirait `action` — sans rien écrire.
 *
 * `action` appelle l'action du magasin sur l'état qu'on lui passe
 * (`(st) => st.moveWallPoint(…)`). Rend `false` si l'action n'a rien
 * changé : le vol précédent reste alors à l'écran, tel quel.
 */
export function volerLAction(
  action: (st: ScanState) => void,
  piece: PlanEnVol['piece'] = null,
): boolean {
  const avant = useScanStore.getState();
  const apres = simuler(action);
  if (!apres) return false;
  const niveau = avant.niveauCourant;
  const anciens = new Map(avant.walls.map((w) => [w.id, w]));
  /*
    CE QUI BOUGE SE LIT AUX COORDONNÉES, PAS À L'IDENTITÉ : poser un angle
    recopie tous les murs de l'étage, même ceux qu'il ne touche pas.
  */
  const duNiveau = apres.walls.filter((w) => niveauDe(w) === niveau);
  const murs = new Map<string, WallSeg>();
  const nes: WallSeg[] = [];
  for (const w of duNiveau) {
    const v = anciens.get(w.id);
    if (!v) nes.push(w);
    else if (!memePoint(v.a, w.a) || !memePoint(v.b, w.b)) murs.set(w.id, w);
  }
  // Les onglets se calculent sur tout l'étage — c'est le voisin qui fait
  // l'angle — mais on ne garde que ceux de ce qui se dessine en vol.
  const tousLesOnglets = wallQuads(duNiveau);
  const quads = new Map<string, WallQuad>();
  for (const w of [...murs.values(), ...nes]) {
    const q = tousLesOnglets.get(w.id);
    if (q) quads.set(w.id, q);
  }
  const anciennes = new Map(avant.openings.map((o) => [o.id, o]));
  const baies = new Map<string, WallSeg>();
  for (const o of apres.openings) {
    const v = anciennes.get(o.id);
    if (niveauDe(o) === niveau && (!v || !memePoint(v.a, o.a) || !memePoint(v.b, o.b))) baies.set(o.id, o);
  }
  const anciensMeubles = new Map(avant.objects.map((o) => [o.id, o]));
  const meubles = new Map<string, ObjectData>();
  for (const o of apres.objects) {
    const v = anciensMeubles.get(o.id);
    if (v && (v.transform[12] !== o.transform[12] || v.transform[14] !== o.transform[14])) {
      meubles.set(o.id, o);
    }
  }
  usePlanEnVol.setState({ plan: { murs, nes, quads, baies, meubles, piece } });
  return true;
}

/**
 * LE LÂCHER : le magasin reçoit l'action, une fois, et le vol se retire.
 *
 * Sans action (un geste qui n'a rien déplacé, un geste repris par le
 * système), le vol se retire seul et le plan reste tel qu'il était.
 *
 * L'historique se ferme derrière (voir `cloreLeGesteDansLHistorique`), et
 * les analyses de l'écran se refont tout de suite (`finirLeGeste`) : rien ne
 * sert d'attendre un cinquième de seconde que le doigt « se calme », il est
 * levé. Un rendu de l'écran au lâcher, pas deux.
 */
export function atterrir(action?: (st: ScanState) => void): void {
  if (action) {
    action(useScanStore.getState());
    cloreLeGesteDansLHistorique();
    finirLeGeste();
  }
  if (usePlanEnVol.getState().plan !== null) usePlanEnVol.setState({ plan: null });
}

/** Un geste est-il en vol ? */
export const planEnVol = (): boolean => usePlanEnVol.getState().plan !== null;
