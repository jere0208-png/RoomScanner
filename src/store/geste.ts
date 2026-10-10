/**
 * LE GESTE EN COURS — ce qui suit le doigt, et ce qui peut attendre qu'il
 * se lève.
 *
 * Relevé du patron : « cherche à améliorer les performances de l'app ».
 * Mesuré sur le plan : glisser un mur, un meuble, un spot écrit le magasin à
 * chaque image — c'est voulu, le dessin doit suivre le doigt. Mais chaque
 * écriture relançait aussi, soixante fois par seconde, des analyses que
 * personne ne lit pendant le geste : les cheminements de câbles, le total du
 * devis, les diagnostics de conformité, la scène de la visite 3D. Sur un T2,
 * quelques dizaines de millisecondes par image sur l'iPhone : le glisser
 * saccadait.
 *
 * Le magasin signale ici chaque pas d'un geste continu (voir `pushHistory`) ;
 * le geste est fini quand le doigt n'a rien envoyé depuis un instant. Les
 * analyses lisent leurs entrées par `useFigePendantLeGeste` : elles gardent
 * leur dernier résultat tant que le doigt bouge, et se refont UNE fois, au
 * lâcher. Le dessin, lui, ne passe pas par ici : il reste immédiat.
 */
import { useRef } from 'react';
import { create } from 'zustand';

/** Le temps sans mouvement après lequel un geste est fini, en ms. */
export const FIN_DU_GESTE_MS = 220;

export const useGeste = create<{ enCours: boolean }>(() => ({ enCours: false }));

let fin: ReturnType<typeof setTimeout> | null = null;

/** Un pas de geste continu : le geste est en cours, et le reste un instant. */
export function pasDeGeste(): void {
  if (!useGeste.getState().enCours) useGeste.setState({ enCours: true });
  if (fin) clearTimeout(fin);
  fin = setTimeout(() => {
    fin = null;
    useGeste.setState({ enCours: false });
  }, FIN_DU_GESTE_MS);
}

/** Termine le geste tout de suite (bancs d'essai, sortie d'écran). */
export function finirLeGeste(): void {
  if (fin) clearTimeout(fin);
  fin = null;
  if (useGeste.getState().enCours) useGeste.setState({ enCours: false });
}

/**
 * La valeur, figée pendant un geste : la dernière vue avant qu'il commence,
 * puis la nouvelle dès qu'il est fini (le composant se redessine alors, et
 * ses calculs se refont une fois).
 */
export function useFigePendantLeGeste<T>(valeur: T): T {
  const enCours = useGeste((s) => s.enCours);
  const garde = useRef(valeur);
  if (!enCours) garde.current = valeur;
  return garde.current;
}
