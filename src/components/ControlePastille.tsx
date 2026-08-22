/**
 * LA PASTILLE DE CONTRÔLE — le verdict des normes, lisible sans l'ouvrir.
 *
 * Relevé du patron : « mets le bouton contrôle en plus petit à côté du
 * switch 2D/3D, avec une légère onde rouge qui bump du bouton si
 * l'appartement n'est pas aux normes ; si rien n'est à redire, le contour
 * devient vert fixe. »
 *
 * Le contrôle vivait dans la colonne du bas, en pastille pleine largeur qui
 * apparaissait et disparaissait avec les constats : un verdict qui bouge de
 * place ne se consulte pas, il se cherche. Il tient maintenant dans un rond
 * posé contre le sélecteur de vue — toujours là, toujours au même endroit —
 * et c'est sa COULEUR qui parle : rouge qui pulse tant qu'une alerte reste,
 * vert plein quand le logement est bon.
 *
 * L'onde est une seule bague qui s'élargit en s'effaçant, quatre secondes
 * de période : assez lente pour dire « viens voir » sans crier — le mot du
 * patron est « légère ».
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/** Diamètre du bouton : plus petit que la pastille 2D/3D, comme demandé. */
const D = 30;

export function ControlePastille({
  alertes,
  commence = true,
  onPress,
}: {
  alertes: number;
  /*
    L'INSTALLATION A-T-ELLE COMMENCÉ ?

    Trouvé en parcourant l'application comme un utilisateur qui la
    découvre : on pose un séjour — le premier geste de l'app — et la
    pastille passe aussitôt au rouge, onde qui bat, « 3 points à
    corriger ». Les constats sont justes (cinq socles exigés, aucun posé)
    mais ils reprochent à quelqu'un de n'avoir pas encore fait ce qu'il
    vient d'ouvrir l'application pour faire.

    Une pièce sans le moindre appareil n'est pas une installation NON
    CONFORME : c'est une installation qui n'existe pas encore. Le verdict
    attend donc le premier appareil posé.
  */
  commence?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const onde = useRef(new Animated.Value(0)).current;
  const enAlerte = alertes > 0 && commence;

  useEffect(() => {
    if (!enAlerte) {
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
        // La bague repart de zéro après un temps mort : une onde qui
        // enchaîne sans respirer devient un gyrophare.
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
  }, [enAlerte, onde]);

  const teinte = !commence ? c.inkFaint : enAlerte ? c.danger : c.green;
  return (
    <Animated.View style={styles.cadre}>
      {enAlerte && commence && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.onde,
            {
              borderColor: c.danger,
              opacity: onde.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 0.55, 0],
              }),
              transform: [
                {
                  // 1,45 et pas plus — relevé du patron : « fais moins
                  // propager l'onde ». À 1,9 elle léchait le sélecteur de
                  // vue ; elle doit dire « viens voir », pas envahir.
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
          !commence
            ? // Rien n'est encore posé : la pastille INVITE, elle ne juge
              // pas. Elle ouvre le même écran, qui dira quoi poser.
              'Contrôle des normes'
            : enAlerte
              ? `Contrôle — ${alertes} point${alertes > 1 ? 's' : ''} à corriger`
              : 'Contrôle — conforme'
        }
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.bouton, { borderColor: teinte }]}
        onPress={onPress}>
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path d={SOLAIRES.bouclier} fill={teinte} fillRule="evenodd" />
        </Svg>
      </TouchableOpacity>
    </Animated.View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /* Le cadre fait la taille du bouton : l'onde déborde SANS pousser la
       rangée — elle est absolue, et ne prend aucun toucher. */
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
  }),
);
