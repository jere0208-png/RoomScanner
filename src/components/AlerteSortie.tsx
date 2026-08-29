/**
 * L'ALERTE DE SORTIE — la seule fenêtre de l'app qui se pose AU MILIEU.
 *
 * POURQUOI AU MILIEU, ALORS QUE TOUT LE RESTE MONTE DU BAS. Une feuille qui
 * monte du bas se referme d'un glissement : c'est ce qu'on veut d'un menu,
 * qu'on ouvre par curiosité et qu'on referme sans conséquence. Ici, l'appui
 * suivant décide du sort du travail. Une fenêtre posée au centre arrête le
 * regard — c'est la convention de tous les systèmes pour ce qui ne se balaie
 * pas d'un revers de pouce.
 *
 * DEUX DESSINS, ET LE SECOND EST CELUI-CI.
 *
 *   PREMIER — UN GYROPHARE. Relevé du patron : « une belle page avec l'icône
 *   en gros, légère animation de la couleur dans l'icône, avec une lumière
 *   halo réaliste dynamique, faisant croire que le gyro est allumé. Donne-lui
 *   un effet rouge, plastique transparent. » Une sirène en dégradé, un halo
 *   qui bat, deux faisceaux qui tournent. C'était juste, et c'était BEAUCOUP :
 *   cent soixante-seize points de scène, trois couches animées et deux
 *   horloges pour dire « attention ».
 *
 *   SECOND — UN BLOC ET UNE POUBELLE. Relevé du patron, référence à l'appui
 *   (une fenêtre de suppression de compte, en clair et en sombre) : « je
 *   voulais un avertissement de ce type, dans le design du bloc, de la
 *   poubelle etc. » C'est le motif que tout le monde reconnaît sans le lire :
 *   un badge d'anneaux concentriques, l'icône de ce qu'on va perdre au
 *   milieu, un gros titre, une phrase, et les deux issues.
 *
 * CE QUI N'A PAS CHANGÉ, ET NE DOIT PAS. Les BOUTONS : « blanc, contour et
 * texte bleu, pour enregistrer et rouge pour le quitter quand même » — c'est
 * un relevé antérieur, et il tient toujours. Le nouveau parle du BLOC, pas des
 * issues.
 *
 * ELLE PARLE LE MÊME LANGAGE QUE LA GARDE. Elle ne décide de rien : elle
 * REND une `ActionData` — le titre, la phrase, et deux issues dans l'ordre
 * que `garderLeTravail` a fixé. La première est celle qu'on veut neuf fois
 * sur dix (enregistrer), la seconde est marquée destructrice. Changer le
 * dessin de la fenêtre ne doit jamais changer ce qu'elle propose.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { SOLAIRES } from '../ui/solaires';
import type { ActionData } from './Sheet';

/**
 * LE BADGE — trois anneaux concentriques, et la poubelle au centre.
 *
 * C'est la signature de ce motif de fenêtre, et ce n'est pas décoratif : les
 * anneaux font une CIBLE. L'œil tombe au centre avant d'avoir lu une ligne, et
 * ce qu'il y trouve est le dessin de ce qu'on s'apprête à perdre.
 *
 * ILS S'ÉTEIGNENT VERS LE DEHORS — dix-huit, douze, sept centièmes. Trois
 * anneaux de même densité feraient une cocarde ; c'est la dégressivité qui
 * donne la lueur.
 */
const BADGE = 112;
const ANNEAUX = [
  { r: 56, opacite: 0.07 },
  { r: 44, opacite: 0.12 },
  { r: 32, opacite: 0.18 },
];
/** L'icône, en points : la moitié du disque plein qui la porte. */
const ICONE = 30;

function Poubelle({ teinte }: { teinte: string }) {
  return (
    <Svg width={ICONE} height={ICONE} viewBox="0 0 24 24">
      <Path d={SOLAIRES.supprimer} fill={teinte} />
    </Svg>
  );
}

export function AlerteSortie({
  data,
  onClose,
}: {
  data: ActionData | null;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const souffle = useRef(new Animated.Value(0)).current;
  const ouverte = !!data;
  useEffect(() => {
    if (!ouverte) return;
    souffle.setValue(0);
    /*
      UN SOUFFLE, PAS UN GYROPHARE.

      Le dessin d'avant tournait et battait ; celui-ci respire. Les anneaux
      s'éclairent et retombent en une seconde et demie, sans jamais s'éteindre
      — assez pour que la fenêtre soit vivante, trop peu pour qu'elle attire
      l'œil ailleurs que sur ce qu'il faut lire.

      SUR LE FIL NATIF, comme tout ce qui boucle dans cette application : une
      fenêtre modale ne doit rien coûter au fil qui gère les appuis, puisque
      c'est un appui qu'on attend.
    */
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(souffle, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [ouverte, souffle]);

  if (!data) return null;
  const [garder, jeter] = data.actions;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* L'appui à côté ne décide de rien : il referme, et l'on reste sur
          le plan. C'est l'issue de secours de qui a touché par erreur. */}
      <Pressable style={styles.voile} onPress={onClose}>
        <Pressable style={styles.carte} onPress={() => {}}>
          <View style={styles.badge}>
            {ANNEAUX.map((a, i) => (
              <Animated.View
                key={a.r}
                pointerEvents="none"
                style={[
                  styles.anneau,
                  {
                    width: a.r * 2,
                    height: a.r * 2,
                    borderRadius: a.r,
                    backgroundColor: c.danger,
                    /*
                      SEULS LES DEUX ANNEAUX DU DEHORS RESPIRENT. Le disque du
                      centre porte l'icône : le faire varier ferait clignoter
                      la poubelle, et une icône qui clignote se lit comme une
                      erreur, pas comme un avertissement.
                    */
                    opacity:
                      i === ANNEAUX.length - 1
                        ? a.opacite
                        : souffle.interpolate({
                            inputRange: [0, 1],
                            outputRange: [a.opacite * 0.55, a.opacite * 1.25],
                          }),
                  },
                ]}
              />
            ))}
            <Poubelle teinte={c.danger} />
          </View>

          <Text style={styles.titre}>{data.title}</Text>
          {data.subtitle ? (
            <Text style={styles.phrase}>{data.subtitle}</Text>
          ) : null}

          {/*
            LE GESTE QU'ON VEUT EN PREMIER, ET EN BLEU.

            Blanc, cerné de bleu, texte bleu : c'est l'issue sûre, celle qui
            ne coûte rien. Le rouge dessous ne se touche pas par mégarde —
            on ne confond pas un bouton blanc et un bouton rouge, même en
            répondant sans lire.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={garder?.label}
            style={styles.btnGarder}
            onPress={() => {
              onClose();
              garder?.onPress();
            }}>
            <Text style={styles.btnGarderTexte}>{garder?.label}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={jeter?.label}
            style={styles.btnJeter}
            onPress={() => {
              onClose();
              jeter?.onPress();
            }}>
            <Text style={styles.btnJeterTexte}>{jeter?.label}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /* AU MILIEU, et sur un voile plus dense que celui des feuilles : ce
       qui se décide ici ne se balaie pas d'un revers de pouce. */
    voile: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    carte: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: c.surface,
      borderRadius: 28,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 20,
      alignItems: 'center',
      ...shadowCard,
      shadowOpacity: 0.28,
      shadowRadius: 30,
    },
    badge: {
      width: BADGE,
      height: BADGE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Les anneaux se superposent, tous centrés sur l'icône. */
    anneau: { position: 'absolute' },
    /* GROS TEXTE MODERNE : c'est un avertissement, il se lit d'un coup
       d'œil et à bout de bras, sur un chantier. */
    titre: {
      color: c.ink,
      fontSize: 25,
      fontWeight: '800',
      letterSpacing: -0.7,
      textAlign: 'center',
      marginTop: 18,
    },
    phrase: {
      color: c.inkSoft,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 22,
    },
    btnGarder: {
      alignSelf: 'stretch',
      backgroundColor: c.surface,
      borderRadius: radius.pill,
      borderWidth: 1.6,
      borderColor: c.blue,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnGarderTexte: { color: c.blue, fontSize: 16.5, fontWeight: '800' },
    btnJeter: {
      alignSelf: 'stretch',
      backgroundColor: c.danger,
      borderRadius: radius.pill,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
    },
    btnJeterTexte: { color: '#FFFFFF', fontSize: 16.5, fontWeight: '800' },
  }),
);
