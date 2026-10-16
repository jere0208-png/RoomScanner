/**
 * LE GESTE EN COURS — ce qui suit le doigt, et ce qui peut attendre qu'il
 * se lève.
 *
 * Relevé du patron : « cherche à améliorer les performances de l'app ».
 * Mesuré sur le plan : glisser un mur, un meuble, un spot écrit le magasin à
 * chaque image — c'est voulu, le dessin doit suivre le doigt (le meuble, lui,
 * vit depuis « en vol » : voir `useEnVol`, plus bas). Mais chaque
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
import type { ObjectData } from 'react-native-room-scan';

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

/*
  LE MEUBLE EN VOL — ce que le doigt tient, avant que le magasin ne l'apprenne.

  Relevé du patron sur son iPhone : « optimise la fluidité des déplacements
  de meubles, ça fait un peu lag ». Mesuré sur l'exemple : chaque image d'un
  glisser écrivait le magasin, et tout ce qui le lit se rendait — l'écran du
  plan entier, ses feuilles, ses bandeaux, le métré, le plan lui-même avec
  ses cotes, ses étiquettes et ses vingt-six meubles —, pour un seul meuble
  qui bougeait de deux pixels. Plus de cent millisecondes par image sur le
  banc, quand l'écran en accorde seize.

  Pendant le geste, le meuble vit donc ICI : seules les quelques vues qui le
  dessinent s'y abonnent (`SuitLeDoigt`), et le reste ne se rend plus. Le
  magasin est écrit au lâcher, par les mêmes actions qu'avant — la position,
  l'aimant, la collision et l'unique point d'annulation sont exactement ceux
  d'avant. Seul l'instant de l'écriture a changé.
*/
export const useEnVol = create<{
  objet: ObjectData | null;
  /** Le doigt le tient là où il ne peut pas se poser : il se dessine en rouge. */
  refuse: boolean;
}>(() => ({ objet: null, refuse: false }));

/** Le meuble tenu (ou plus rien) : ne réveille personne si rien n'a changé. */
export function mettreEnVol(objet: ObjectData | null): void {
  const st = useEnVol.getState();
  if (objet === null && (st.objet !== null || st.refuse)) useEnVol.setState({ objet: null, refuse: false });
  else if (objet !== null && st.objet !== objet) useEnVol.setState({ objet });
}

/*
  LE ROUGE DU REFUS VIT AVEC LE MEUBLE EN VOL — et non dans l'éditeur.
  Mesuré sur le gros plan : chaque bascule du rouge (entrer dans un mur, en
  ressortir) rendait l'éditeur entier, cent murs compris, en plein glisser.
*/
export function signalerRefus(refuse: boolean): void {
  if (useEnVol.getState().refuse !== refuse) useEnVol.setState({ refuse });
}
