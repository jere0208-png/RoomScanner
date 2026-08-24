/**
 * L'ALERTE DE SORTIE — la seule fenêtre de l'app qui se pose AU MILIEU.
 *
 * Relevé du patron : « si on quitte un plan sans enregistrer, le pop-up doit
 * être centré et doit afficher une belle page avec l'icône en gros, légère
 * animation de la couleur dans l'icône, avec une lumière halo réaliste
 * dynamique, faisant croire que le gyro est allumé. Donne-lui un effet rouge,
 * plastique transparent. Ensuite gros texte moderne pour avertir, et les
 * boutons en dessous, blanc, contour et texte bleu, pour enregistrer et rouge
 * pour le quitter quand même. »
 *
 * POURQUOI AU MILIEU, ALORS QUE TOUT LE RESTE MONTE DU BAS. Une feuille qui
 * monte du bas se referme d'un glissement : c'est ce qu'on veut d'un menu,
 * qu'on ouvre par curiosité et qu'on referme sans conséquence. Ici, l'appui
 * suivant décide du sort du travail. Une fenêtre posée au centre arrête le
 * regard — c'est la convention de tous les systèmes pour ce qui ne se balaie
 * pas d'un revers de pouce.
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
import Svg, {
  ClipPath,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { SOLAIRES } from '../ui/solaires';
import type { ActionData } from './Sheet';

/** La scène du gyrophare : le halo, le balayage, la sirène. */
const SCENE = 176;
const SIRENE = 96;

/**
 * LE HALO — un dégradé radial, pas une ombre.
 *
 * Une ombre portée (`shadow`) ne sait pas être rouge sur Android, et elle ne
 * bat pas. Un disque en dégradé, lui, se pilote comme n'importe quelle vue :
 * l'opacité et l'échelle partent sur le fil natif, et le battement ne coûte
 * rien au fil JS — c'est la règle de toute l'app pour ce qui bouge en boucle.
 */
function Halo({ teinte }: { teinte: string }) {
  return (
    <Svg width={SCENE} height={SCENE}>
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={teinte} stopOpacity={0.55} />
          <Stop offset="45%" stopColor={teinte} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={teinte} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={SCENE} height={SCENE} fill="url(#halo)" />
    </Svg>
  );
}

/**
 * LE BALAYAGE — deux faisceaux opposés, comme un vrai gyrophare.
 *
 * Un seul faisceau donnerait un radar ; c'est la PAIRE qui fait le
 * gyrophare : la lampe tourne, et l'on voit passer sa lumière deux fois par
 * tour. Ils s'estompent en s'éloignant du centre, parce qu'un faisceau
 * n'éclaire pas à l'infini.
 */
function Faisceaux({ teinte }: { teinte: string }) {
  const r = SCENE / 2;
  const ouverture = 26;
  const rad = (d: number) => (d * Math.PI) / 180;
  const coin = (deg: number) => `${r + r * Math.cos(rad(deg))},${r + r * Math.sin(rad(deg))}`;
  const secteur = (centre: number) =>
    `M${r},${r} L${coin(centre - ouverture)} A${r},${r} 0 0 1 ${coin(centre + ouverture)} Z`;
  return (
    <Svg width={SCENE} height={SCENE}>
      <Defs>
        <RadialGradient id="faisceau" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={teinte} stopOpacity={0.38} />
          <Stop offset="100%" stopColor={teinte} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={secteur(0)} fill="url(#faisceau)" />
      <Path d={secteur(180)} fill="url(#faisceau)" />
    </Svg>
  );
}

/**
 * LA SIRÈNE, EN PLASTIQUE ROUGE TRANSLUCIDE.
 *
 * Trois couches, et il les faut toutes les trois : un dégradé du clair au
 * sombre (le volume d'un dôme), un reflet blanc en haut à gauche (la
 * lumière qui frappe la surface), et le reflet DÉCOUPÉ à la forme de la
 * sirène — sans découpe, la tache blanche déborde et l'on ne voit plus une
 * pièce moulée mais un autocollant.
 */
function Sirene({ teinte, sombre }: { teinte: string; sombre: string }) {
  return (
    <Svg width={SIRENE} height={SIRENE} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="plastique" x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0%" stopColor="#FF8A90" />
          <Stop offset="45%" stopColor={teinte} />
          <Stop offset="100%" stopColor={sombre} />
        </LinearGradient>
        <ClipPath id="dome">
          <Path d={SOLAIRES.sirene} />
        </ClipPath>
      </Defs>
      <Path d={SOLAIRES.sirene} fill="url(#plastique)" fillRule="evenodd" />
      <Ellipse
        cx={9}
        cy={11}
        rx={3.6}
        ry={2.4}
        fill="#FFFFFF"
        opacity={0.42}
        clipPath="url(#dome)"
      />
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
  const battement = useRef(new Animated.Value(0)).current;
  const tour = useRef(new Animated.Value(0)).current;
  const ouverte = !!data;
  useEffect(() => {
    if (!ouverte) return;
    battement.setValue(0);
    tour.setValue(0);
    /*
      DEUX HORLOGES, ET C'EST CE QUI FAIT LE GYROPHARE.

      La lampe BAT (elle s'allume et s'éteint) pendant que le miroir TOURNE.
      Une seule horloge donnerait un clignotant ou un radar ; les deux
      ensemble, à des rythmes qui ne tombent pas juste l'un sur l'autre,
      donnent cette lumière qui n'est jamais deux fois la même.
    */
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(battement, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(battement, {
          toValue: 0,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const rotation = Animated.loop(
      Animated.timing(tour, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    boucle.start();
    rotation.start();
    return () => {
      boucle.stop();
      rotation.stop();
    };
  }, [ouverte, battement, tour]);

  if (!data) return null;
  const [garder, jeter] = data.actions;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* L'appui à côté ne décide de rien : il referme, et l'on reste sur
          le plan. C'est l'issue de secours de qui a touché par erreur. */}
      <Pressable style={styles.voile} onPress={onClose}>
        <Pressable style={styles.carte} onPress={() => {}}>
          <View style={styles.scene}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.couche,
                {
                  opacity: battement.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.35, 1],
                  }),
                  transform: [
                    {
                      scale: battement.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.88, 1.12],
                      }),
                    },
                  ],
                },
              ]}>
              <Halo teinte={c.danger} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.couche,
                {
                  opacity: battement.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.5, 1],
                  }),
                  transform: [
                    {
                      rotate: tour.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}>
              <Faisceaux teinte={c.danger} />
            </Animated.View>
            {/* La lampe elle-même respire : c'est la « légère animation de
                la couleur » du relevé — le rouge s'éclaircit et retombe,
                sans jamais s'éteindre. */}
            <Animated.View
              pointerEvents="none"
              style={{
                opacity: battement.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.82, 1],
                }),
              }}>
              <Sirene teinte={c.danger} sombre="#8E1A22" />
            </Animated.View>
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
      maxWidth: 380,
      backgroundColor: c.surface,
      borderRadius: 28,
      paddingHorizontal: 22,
      paddingTop: 10,
      paddingBottom: 20,
      alignItems: 'center',
      ...shadowCard,
      shadowOpacity: 0.28,
      shadowRadius: 30,
    },
    scene: {
      width: SCENE,
      height: SCENE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Les couches du gyrophare se superposent, toutes centrées. */
    couche: {
      position: 'absolute',
      width: SCENE,
      height: SCENE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* GROS TEXTE MODERNE : c'est un avertissement, il se lit d'un coup
       d'œil et à bout de bras, sur un chantier. */
    titre: {
      color: c.ink,
      fontSize: 25,
      fontWeight: '800',
      letterSpacing: -0.7,
      textAlign: 'center',
      marginTop: 2,
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
