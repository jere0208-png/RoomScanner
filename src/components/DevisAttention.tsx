/**
 * ATTENTION — les luminaires ne sont pas du devis.
 *
 * Relevé du patron : « enlève la deuxième page explicative. À la place fais
 * une page dynamique "Attention" : les luminaires ne sont pas compris dans le
 * devis, il faudra vous-même les choisir en magasin ou chez un fournisseur
 * électrique. »
 *
 * TROISIÈME VERSION DE CETTE PAGE, et chacune corrigeait la précédente.
 *
 *   PREMIÈRE — une liste d'exclusions : luminaires, main-d'œuvre, chutes.
 *   Elle répondait à une question que personne ne se pose devant un devis
 *   qu'il n'a pas encore vu. « On ne comprend pas bien pour ce qui est
 *   compté. »
 *
 *   DEUXIÈME — une démonstration animée : un tableau, un interrupteur, un
 *   point lumineux, la gaine qui avance et le compteur qui monte, le ticket
 *   qui se remplit. Elle expliquait la MÉTHODE, et c'est une belle réponse à
 *   une question que l'écran suivant traite déjà : le ticket montre chaque
 *   ligne, avec sa quantité et son prix. Elle faisait perdre cinq secondes
 *   entre le choix et le prix.
 *
 *   TROISIÈME — celle-ci. Une seule chose à dire, et c'est la seule qui
 *   coûte de l'argent à celui qui la découvre trop tard : les luminaires ne
 *   sont pas là, et il faudra les acheter ailleurs. Un avertissement se lit
 *   en deux secondes ou ne se lit pas.
 *
 * ELLE EST « DYNAMIQUE » PARCE QU'UN AVERTISSEMENT DOIT ARRÊTER L'ŒIL. Le
 * signe se pose avec un rebond, puis une bague respire autour de lui — le
 * même geste que la pastille de contrôle sur le plan, au même rythme. Ce
 * n'est pas de l'ornement : sur une page qu'on traverse pour aller voir un
 * prix, un texte immobile se saute.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

/**
 * LE DIAMÈTRE DU SIGNE, en points.
 *
 * Un seul nombre pour le cadre, la bague et le disque : ils doivent rester
 * d'accord, et trois « 78 » recopiés ne le restent jamais. C'est aussi ce que
 * demande le banc des ronds — un rond à taille écrite en clair doit déclarer
 * son centrage, et celui-ci n'a rien à centrer.
 */
const D = 78;

export function DevisAttention() {
  const c = useTheme();
  const styles = getStyles(c);
  const pose = useRef(new Animated.Value(0)).current;
  const onde = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /*
      LE SIGNE SE POSE, PUIS LA BAGUE RESPIRE.

      Le rebond dit « voilà quelque chose » ; l'onde dit « c'est encore là ».
      L'un sans l'autre ne suffit pas : un rebond seul s'oublie dès qu'il est
      fini, une onde seule n'attire pas le regard qui n'était pas là au
      départ.
    */
    Animated.timing(pose, {
      toValue: 1,
      duration: 520,
      easing: Easing.elastic(1.2),
      useNativeDriver: true,
    }).start();
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
          delay: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [pose, onde]);

  return (
    <View style={styles.cadre}>
      <View style={styles.signeCadre}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.onde,
            {
              borderColor: c.amber,
              opacity: onde.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 0.5, 0],
              }),
              transform: [
                {
                  scale: onde.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.5],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.signe,
            {
              opacity: pose.interpolate({
                inputRange: [0, 0.25, 1],
                outputRange: [0, 1, 1],
              }),
              transform: [
                {
                  scale: pose.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ],
            },
          ]}>
          {/* Le triangle et son point : le signe d'avertissement, celui que
              personne n'a besoin d'apprendre. */}
          <Svg width={40} height={40} viewBox="0 0 24 24">
            <Path
              d="M12 3.2 L22 20.4 H2 Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.1}
              strokeLinejoin="round"
            />
            <Path
              d="M12 9.4 v4.6"
              stroke="#FFFFFF"
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <Path
              d="M12 17.1 v0.1"
              stroke="#FFFFFF"
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      </View>

      <Text style={styles.titre}>Attention</Text>
      <Text style={styles.message}>
        Les luminaires ne sont pas compris dans le devis : il faudra vous-même
        les choisir en magasin ou chez un fournisseur électrique.
      </Text>
      {/*
        ET CE QUI EST COMPTÉ, EN UNE LIGNE.

        Un avertissement qui ne dit que ce qui MANQUE laisse croire qu'il
        manque aussi le reste. Une ligne suffit à refermer la question, et
        elle évite le seul contresens possible : croire qu'il faudra aussi
        acheter de quoi les alimenter.
      */}
      <Text style={styles.rassure}>
        Tout ce qui les alimente — la boîte, la gaine, le fil, l’interrupteur —
        est bien compté.
      </Text>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    cadre: { alignItems: 'center', paddingTop: 18, paddingHorizontal: 6 },
    /* Le cadre fait la taille du signe : l'onde déborde SANS pousser le
       texte — elle est absolue, et ne prend aucun toucher. */
    signeCadre: {
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
      borderWidth: 2.5,
    },
    signe: {
      width: D,
      height: D,
      borderRadius: D / 2,
      backgroundColor: c.amber,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titre: {
      color: c.ink,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
      marginTop: 18,
    },
    message: {
      color: c.inkSoft,
      fontSize: 15.5,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 10,
    },
    rassure: {
      color: c.inkFaint,
      fontSize: 13,
      lineHeight: 18.5,
      textAlign: 'center',
      marginTop: 14,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
  }),
);
