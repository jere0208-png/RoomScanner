/**
 * LA PASTILLE DU DEVIS — « combien j'en aurais pour mon installation ? »
 *
 * Relevé du patron, 27/08/2026 : « Un bouton visible en haut, à gauche de
 * l'icône normes. Animé comme elle, mais en VERT, avec € et ? qui alternent
 * — pour faire comprendre combien j'en aurais pour mon installation
 * actuelle. »
 *
 * POURQUOI DEUX SIGNES ET PAS UNE ICÔNE. Un billet, une calculette, un
 * caddie : chacun dit une moitié de la question et aucun ne dit l'autre. Les
 * deux caractères, eux, la posent en entier — « € ? », combien ça coûte —
 * et personne n'a besoin d'apprendre le pictogramme. Ils se relaient en
 * fondu plutôt qu'en saut : un signe qui clignote se lit comme une alerte,
 * et ce bouton n'alerte de rien.
 *
 * L'ONDE EST CELLE DU CONTRÔLE, EN VERT. La pastille des normes bat en rouge
 * quand quelque chose cloche ; celle-ci bat toujours, doucement, parce
 * qu'elle n'annonce pas un défaut mais une porte qu'on n'a pas encore
 * poussée. Même période, même amplitude — deux boutons voisins qui
 * respireraient à deux rythmes se disputeraient l'œil.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/** Même diamètre que la pastille de contrôle : elles vont par deux. */
const D = 30;

export function DevisPastille({
  /**
   * Y A-T-IL QUELQUE CHOSE À CHIFFRER ?
   *
   * Un logement sans un seul appareil posé n'a pas de prix — il a un plan.
   * La pastille reste alors grise et muette, comme celle des normes devant
   * une installation qui n'a pas commencé : proposer un devis à zéro euro
   * est une réponse, mais pas la bonne.
   */
  actif = true,
  onPress,
}: {
  actif?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const onde = useRef(new Animated.Value(0)).current;
  const bascule = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!actif) {
      onde.stopAnimation();
      onde.setValue(0);
      return;
    }
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(onde, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Le temps mort de la pastille de contrôle : une onde qui enchaîne
        // sans respirer devient un gyrophare.
        Animated.timing(onde, {
          toValue: 0,
          duration: 1,
          delay: 2400,
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [actif, onde]);

  useEffect(() => {
    if (!actif) {
      bascule.stopAnimation();
      bascule.setValue(0);
      return;
    }
    /*
      DEUX SECONDES SUR CHAQUE SIGNE, UN QUART DE SECONDE POUR PASSER.

      Plus vite, les deux caractères se lisent comme un scintillement ; plus
      lentement, on ne voit jamais le second et le bouton n'a plus qu'un
      sens. Le fondu se fait par le MILIEU — l'un s'efface avant que l'autre
      n'arrive — sinon les deux se superposent une fraction de seconde et
      donnent une tache.
    */
    const pause = (v: number) =>
      Animated.timing(bascule, {
        toValue: v,
        duration: 260,
        delay: 2000,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const boucle = Animated.loop(Animated.sequence([pause(1), pause(0)]));
    boucle.start();
    return () => boucle.stop();
  }, [actif, bascule]);

  const teinte = actif ? c.green : c.inkFaint;
  // Chaque signe s'efface au tiers du passage, et l'autre n'apparaît qu'aux
  // deux tiers : jamais tous les deux à la fois.
  const opaciteEuro = bascule.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [1, 0, 0],
  });
  const opaciteQuoi = bascule.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <Animated.View style={styles.cadre}>
      {actif && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.onde,
            {
              borderColor: c.green,
              opacity: onde.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 0.55, 0],
              }),
              transform: [
                {
                  // 1,45 comme le contrôle : au-delà, l'onde lèche son
                  // voisin, et deux boutons côte à côte ne peuvent pas se
                  // marcher dessus.
                  scale: onde.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.45],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      <TouchableOpacity
        accessibilityLabel={
          actif
            ? 'Devis — estimer le prix de cette installation'
            : 'Devis — rien de posé à chiffrer'
        }
        accessibilityRole="button"
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.bouton, { borderColor: teinte }]}
        onPress={onPress}>
        <Animated.View style={[styles.signe, { opacity: opaciteEuro }]}>
          <Text style={[styles.lettre, { color: teinte }]}>€</Text>
        </Animated.View>
        <Animated.View style={[styles.signe, { opacity: opaciteQuoi }]}>
          <Text style={[styles.lettre, { color: teinte }]}>?</Text>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    cadre: {
      width: D,
      height: D,
      alignItems: 'center',
      justifyContent: 'center',
    },
    onde: {
      position: 'absolute',
      width: D,
      height: D,
      borderRadius: D / 2,
      borderWidth: 2,
    },
    bouton: {
      width: D,
      height: D,
      borderRadius: D / 2,
      borderWidth: 2,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.1,
    },
    /* Les deux signes sont EMPILÉS, pas côte à côte : ils occupent la même
       place et se relaient dessus. Posés l'un à côté de l'autre, le bouton
       sauterait de largeur à chaque passage. */
    signe: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lettre: {
      fontSize: 16,
      fontWeight: '800',
      // Un « € » et un « ? » n'ont pas la même hauteur d'œil : sans cette
      // ligne, le second remonte d'un point au moment du fondu.
      lineHeight: 19,
    },
  }),
);
