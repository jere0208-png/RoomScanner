/**
 * LE MODÈLE DU MEUBLE, DANS SA CARTE — relevé du patron : « le choix des
 * meubles dans Décorer doit afficher le modèle du meuble choisi ».
 *
 * La même vignette que le catalogue (`geometry/vignette3d`) : le modèle de
 * la maquette, de trois quarts, éclairé — ici À SA TEINTE DU MOMENT. Elle
 * se calcule après la première image de la feuille, une par image
 * (`ui/fileVignettes`), et se garde en cache (par meuble, teinte et taille) :
 * revenir sur une carte, ou y faire défiler la bande, ne recalcule rien.
 *
 * Quand la teinte change, l'image d'avant reste affichée jusqu'à ce que la
 * nouvelle soit prête : la carte ne clignote pas.
 */
import React, { useEffect, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';
import type { ObjectData } from 'react-native-room-scan';
import { vignetteDuMeuble, vignetteEnCache, type MeubleAVoir } from '../geometry/vignette3d';
import { apresLaPremiereImage } from '../ui/fileVignettes';

/** Ce que la vignette sait d'un meuble posé : son modèle, ses cotes, sa teinte. */
export function meubleAVoir(
  o: Pick<ObjectData, 'category' | 'modele' | 'width' | 'depth' | 'height' | 'teinte'>,
): MeubleAVoir {
  return {
    key: o.modele || o.category,
    category: o.category,
    w: o.width,
    d: o.depth,
    h: o.height,
    ...(o.teinte ? { teinte: o.teinte } : {}),
  };
}

export function VignetteMeuble({
  objet,
  largeur,
  hauteur,
  devant = false,
  testID,
}: {
  objet: Pick<ObjectData, 'id' | 'category' | 'modele' | 'width' | 'depth' | 'height' | 'teinte'>;
  /** Taille à l'écran, en points. */
  largeur: number;
  hauteur: number;
  /** Calculée avant les autres (la grande vignette du meuble choisi). */
  devant?: boolean;
  testID?: string;
}) {
  // Deux pixels par point au plus : au-delà, l'œil ne voit rien et le coût double.
  const finesse = Math.min(2, PixelRatio.get() || 1);
  const lw = Math.round(largeur * finesse);
  const lh = Math.round(hauteur * finesse);
  const m = meubleAVoir(objet);
  const [uri, setUri] = useState<string | null>(() => vignetteEnCache(m, lw, lh));
  const cle = `${m.key}|${m.category}|${m.w}|${m.d}|${m.h}|${m.teinte ?? ''}|${lw}|${lh}`;
  useEffect(() => {
    const deja = vignetteEnCache(m, lw, lh);
    if (deja) {
      setUri(deja);
      return;
    }
    let vivant = true;
    const annuler = apresLaPremiereImage(() => {
      if (!vivant) return;
      const fraiche = vignetteDuMeuble(m, lw, lh);
      if (vivant) setUri(fraiche);
    }, devant);
    return () => {
      vivant = false;
      annuler();
    };
    // La clé dit tout ce dont l'image dépend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return (
    <View style={{ width: largeur, height: hauteur }} testID={testID} pointerEvents="none">
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          testID={testID ? `${testID}-image` : undefined}
        />
      ) : null}
    </View>
  );
}
