/**
 * LA VITRINE DE L'ACCUEIL — un téléphone, et le plan qui se lève dedans.
 *
 * L'accueil expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule image
 * montre mieux — le résultat. On ne vend pas un scanner de pièces avec un
 * mode d'emploi ; on le vend avec le plan qui en sort.
 *
 * L'animation joue le geste de l'app : un plan 2D coté, avec ses appareils
 * électriques, qui se RELÈVE pour devenir un logement meublé en volume. Les
 * cotes s'effacent en montant — on ne cote pas une perspective —, les
 * appareils restent, parce que c'est ce qu'on vient chercher ici.
 *
 * TOUT EST CUIT D'AVANCE.
 *
 * La première version calculait la scène sur l'appareil, vingt-cinq fois par
 * seconde : cent cinquante polygones reprojetés à chaque image, sur un écran
 * qui n'a rien à calculer. Les images sont désormais rendues au build
 * (`npm run showcase`, voir `src/export/showcaseFrames.ts`) et embarquées :
 * le téléphone ne fait plus que les feuilleter. Rien à recalculer, donc rien
 * qui puisse ramer, chauffer, ni diverger d'un appareil à l'autre.
 *
 * Le boîtier, lui, ne bouge plus : c'est le contenu qui raconte, et un
 * téléphone qui se balance en même temps ne fait que brouiller la lecture.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SHOWCASE_IMAGES } from '../assets/showcase';
import { useTheme, type Palette } from '../theme';

/** L'écran du téléphone, en points. Les images font le double, en pixels. */
/*
  La maquette a MAIGRI quand l'accueil a gagné la rangée du compte : à
  132 × 268, le boîtier montait recouvrir le sous-titre. L'écran reste au
  même ratio, les images cuites se réduisent proprement.
*/
const ECRAN = { w: 118, h: 240 };
const BOITIER = { w: ECRAN.w + 14, h: ECRAN.h + 14 };
/** Quinze images par seconde : le cycle complet dure trois secondes et demie. */
const PERIODE = 68;

export function PhoneShowcase() {
  const styles = getStyles(useTheme());
  const [image, setImage] = useState(0);

  useEffect(() => {
    const h = setInterval(
      () => setImage((i) => (i + 1) % SHOWCASE_IMAGES.length),
      PERIODE,
    );
    return () => clearInterval(h);
  }, []);

  return (
    <View style={styles.scene}>
      <View style={styles.boitier}>
        <View style={styles.ecran}>
          {/*
            TOUTES LES IMAGES SONT MONTÉES, une seule est visible.

            Les faire défiler dans un unique `Image` rechargerait la source à
            chaque changement : sur un appareil chargé, la première boucle
            saute une image sur deux avant de se calmer — le genre de défaut
            qu'on met sur le compte du téléphone. Montées ensemble, elles
            sont décodées une fois pour toutes.
          */}
          {SHOWCASE_IMAGES.map((src, i) => (
            <Image
              key={i}
              source={src}
              // L'opacité se pose EN CLAIR, et non par une feuille de styles :
              // celles-ci se réduisent à des identifiants numériques, que ni
              // un banc ni un lecteur ne peuvent relire.
              style={[styles.image, { opacity: i === image ? 1 : 0 }]}
              resizeMode="cover"
              fadeDuration={0}
            />
          ))}
          {/* Le reflet de la dalle : une diagonale claire, très faible. Sans
              lui, l'écran est un trou dans le boîtier. */}
          <View style={styles.reflet} pointerEvents="none" />
        </View>
        {/* L'îlot dynamique : deux points suffisent à dire « iPhone ». */}
        <View style={styles.ilot} pointerEvents="none" />
      </View>
    </View>
  );
}

const getStyles = (() => {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
      scene: { alignItems: 'center', justifyContent: 'center' },
      boitier: {
        width: BOITIER.w,
        height: BOITIER.h,
        borderRadius: 30,
        padding: 7,
        backgroundColor: c.ink,
        // Le bord de l'appareil attrape la lumière : un liseré plus clair
        // que le boîtier, comme le métal d'une tranche.
        borderWidth: 1.5,
        borderColor: c.inkSoft,
        shadowColor: c.ink,
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 10,
      },
      ecran: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      },
      image: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
      },
      reflet: {
        position: 'absolute',
        top: -ECRAN.h * 0.3,
        left: -ECRAN.w * 0.2,
        width: ECRAN.w * 0.7,
        height: ECRAN.h * 1.4,
        backgroundColor: '#FFFFFF',
        opacity: 0.05,
        transform: [{ rotate: '18deg' }],
      },
      ilot: {
        position: 'absolute',
        top: 13,
        alignSelf: 'center',
        width: 42,
        height: 11,
        borderRadius: 6,
        backgroundColor: '#000000',
      },
    });
  return (c: Palette) => {
    let s = cache.get(c);
    if (!s) {
      s = creer(c);
      cache.set(c, s);
    }
    return s;
  };
})();
