/**
 * LA PIÈCE SORT DE L'APPLICATION — une image, et le partage.
 *
 * Revues « découvreurs » (agente immobilière, influenceuse déco, designer) :
 * « la vue de la pièce dans Décorer est la plus belle image de l'app, et
 * elle ne peut pas sortir » ; « impossible de faire une photo pendant la
 * visite ». Le plan, lui, savait le faire depuis longtemps : `captureRef`,
 * puis `RoomScan.shareFile`, une image à la fois (voir `shareImage` dans
 * l'écran du relevé). On reprend EXACTEMENT cette mécanique, ici, une fois,
 * pour « Décorer » et pour la visite :
 *
 *   — un verrou : deux appuis, une capture, une feuille de partage ;
 *   — l'état de capture posé à l'écran (rendu de secours, angle figé,
 *     logo), puis deux images avant de prendre la photo — pas un délai
 *     deviné ; un garde-fou d'une seconde si l'effet ne venait pas ;
 *   — un retour au doigt, et « Image prête » quand elle l'est.
 *
 * POURQUOI UN RENDU DE SECOURS. La 3D de l'application passe par SceneKit
 * (Metal) ; `captureRef` lit la vue par `drawViewHierarchyInRect`, qui rend
 * souvent NOIR ce que Metal dessine. Le plan bascule donc sa maquette sur le
 * rendu en JavaScript le temps de la photo (`gpu={!capturing}`) ; « Décorer »
 * et la visite font de même, à partir de `capturant`.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { PixelRatio, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { RoomScan } from 'react-native-room-scan';
import { haptic } from './haptic';
import { alerte } from './alerte';
import { panne } from './panne';

/** Le cadre de l'image : carré pour les réseaux, 4:3 pour une annonce. */
export type FormatImage = 'carre' | 'paysage';
/** Largeur sur hauteur. */
export const RAPPORT: Record<FormatImage, number> = { carre: 1, paysage: 4 / 3 };

/**
 * HAUTE DÉFINITION — 1080 pixels au moins sur le petit côté, ce que les
 * réseaux et les portails d'annonces attendent. Un iPhone à triple densité
 * y est déjà ; un écran à double densité (SE, XR) demande un rendu plus
 * grand que la vue. `captureRef` compte en POINTS et multiplie par la
 * densité de l'écran (voir `RNViewShot.mm`) : on lui donne des points.
 */
export const PETIT_COTE_PX = 1080;
export function tailleDeCapture(
  largeurVue: number,
  hauteurVue: number,
  densite: number = PixelRatio.get(),
): { width: number; height: number } | null {
  if (!(largeurVue > 0) || !(hauteurVue > 0) || !(densite > 0)) return null;
  const k = Math.max(1, PETIT_COTE_PX / densite / Math.min(largeurVue, hauteurVue));
  return { width: Math.round(largeurVue * k), height: Math.round(hauteurVue * k) };
}

/** Combien de temps « Image prête » reste à l'écran. */
export const DUREE_PRETE = 2200;

/**
 * La prise de vue : `capturant` à poser sur la vue (rendu de secours, angle
 * figé, logo), `prete` le temps de dire « Image prête », et `prendre`.
 *
 * « Image prête » se dit DANS la fenêtre qui a pris la photo : l'astuce de
 * l'application vit sous les fenêtres (`AstuceHote`, en bas d'`App`), et
 * « Décorer » comme la visite en sont.
 */
export function usePriseDeVue() {
  const [capturant, setCapturant] = useState<FormatImage | null>(null);
  const [prete, setPrete] = useState(false);
  const verrou = useRef(false);
  const rendue = useRef<(() => void) | null>(null);
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);
  /*
    L'état de capture est à l'écran : TROIS images, et la photo part. Le plan
    en attend deux (la première pose, la seconde est affichée) ; ici le cadre
    change de taille, ou la vue de secours vient d'être montée — la 3D se
    mesure d'abord (`onLayout`), puis se dessine à sa vraie taille.
  */
  useEffect(() => {
    if (!capturant || !rendue.current) return;
    const pret = rendue.current;
    rendue.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => pret())));
  }, [capturant]);
  useEffect(() => {
    if (!prete) return;
    const t = setTimeout(() => vivant.current && setPrete(false), DUREE_PRETE);
    return () => clearTimeout(t);
  }, [prete]);

  const prendre = async (
    cible: RefObject<View | null>,
    format: FormatImage = 'carre',
    /** La taille de la vue capturée, en points, pour viser la haute définition. */
    mesure?: () => { w: number; h: number } | null,
  ) => {
    if (verrou.current) return;
    verrou.current = true;
    haptic('leger');
    let garde: ReturnType<typeof setTimeout> | null = null;
    try {
      const pose = new Promise<void>((r) => {
        rendue.current = r;
        garde = setTimeout(r, 1000);
      });
      setPrete(false);
      setCapturant(format);
      await pose;
      const m = mesure?.();
      const taille = m ? tailleDeCapture(m.w, m.h) : null;
      const uri = await captureRef(cible, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        ...(taille ?? {}),
      });
      if (vivant.current) setCapturant(null);
      haptic('succes');
      if (vivant.current) setPrete(true);
      await RoomScan.shareFile(uri);
    } catch (e) {
      if (vivant.current) setCapturant(null);
      const p = panne('capture', e);
      alerte(p.titre, p.message);
    } finally {
      if (garde) clearTimeout(garde);
      rendue.current = null;
      verrou.current = false;
    }
  };

  return { capturant, prete, prendre };
}
