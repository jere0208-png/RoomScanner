/**
 * « RECADRER » : DE QUOI REMETTRE LE PLAN DROIT ET ENTIER, hors de l'écran.
 *
 * Le plan remonte une fonction tant qu'il a été déplacé, zoomé ou tourné, et
 * `null` quand il est déjà cadré (voir `onRecadreur` dans l'éditeur). La
 * pastille de la rangée du haut la lit ici, et SEULE elle se rend quand elle
 * change : remonter l'état dans l'écran du plan le faisait se rendre tout
 * entier au lâcher d'un geste — exactement ce que le banc du meuble fluide
 * interdit (`meublefluide.test.tsx`).
 */
import { create } from 'zustand';

export const useRecadrage = create<{ recadrer: (() => void) | null }>(() => ({ recadrer: null }));

/** À passer tel quel à `onRecadreur` : une référence stable. */
export function poserLeRecadreur(recadrer: (() => void) | null): void {
  if (useRecadrage.getState().recadrer !== recadrer) useRecadrage.setState({ recadrer });
}
