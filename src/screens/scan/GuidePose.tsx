/**
 * « À QUOI SERVENT CES TROIS BOUTONS ? » — la page qui répond avant qu'on
 * pose la question.
 *
 * Relevé du chantier : « les 3 boutons de placement d'éléments élec lors
 * d'un scan ne sont pas forcément compréhensibles de tous ». C'est juste :
 * PC, INT, LUM sont des abréviations de métier, et même un électricien peut
 * ne pas deviner qu'on POSE quelque chose sur le mur qu'on filme.
 *
 * Elle s'ouvre une fois, à la première caméra, et jamais plus — sauf si on
 * la redemande par le « ? » du bloc. Une explication qui revient à chaque
 * scan devient un obstacle, et on finit par la fermer sans la lire.
 *
 * LE GESTE SE MONTRE, IL NE SE RACONTE PAS. Chaque étape porte une petite
 * scène animée : le viseur qui cherche le mur, l'appareil qui s'y pose, les
 * repères qui restent en place quand la caméra bouge. Trois secondes de
 * boucle, pas un tutoriel de trois minutes.
 *
 * LES SCÈNES SONT DES VUES, PAS DES SVG ANIMÉS. Animer un `<G>` de
 * react-native-svg demande de passer par des props que le typage refuse, et
 * le résultat tourne sur le fil JS. Un décor SVG fixe, des vues animées
 * par-dessus : le mouvement part sur le fil natif, et la page reste fluide
 * même pendant que RoomPlan mouline derrière.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, useTheme, type Palette } from '../../theme';
import { FIXTURE_SYMBOL } from '../../geometry/electrical';
import { CEILING_SYMBOL } from '../../geometry/ceiling';

const SCENE_H = 118;

/** La boucle d'un va-et-vient, montée une fois et arrêtée avec la scène. */
function useVaEtVient(duree: number, delai = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.delay(delai),
        Animated.timing(v, {
          toValue: 1,
          duration: duree,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: duree,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [v, duree, delai]);
  return v;
}

/** Le pan de mur : le décor commun des trois scènes. */
function Mur({ styles }: { styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.mur}>
      <View style={styles.plinthe} />
    </View>
  );
}

/** Le viseur : le carré du centre de l'écran, celui qu'on amène sur le mur. */
function Viseur({ c }: { c: Palette }) {
  const t = 2.6;
  const s = { position: 'absolute' as const, backgroundColor: c.blue };
  return (
    <View style={{ width: 34, height: 34 }}>
      {[
        { top: 0, left: 0, width: 11, height: t },
        { top: 0, left: 0, width: t, height: 11 },
        { top: 0, right: 0, width: 11, height: t },
        { top: 0, right: 0, width: t, height: 11 },
        { bottom: 0, left: 0, width: 11, height: t },
        { bottom: 0, left: 0, width: t, height: 11 },
        { bottom: 0, right: 0, width: 11, height: t },
        { bottom: 0, right: 0, width: t, height: 11 },
      ].map((coin, i) => (
        <View key={i} style={[s, coin, { borderRadius: 1 }]} />
      ))}
    </View>
  );
}

/** Une pastille d'appareil, avec le symbole du plan. */
function Pastille({
  c,
  traits,
  teinte,
  taille = 34,
}: {
  c: Palette;
  traits: readonly { d: string }[];
  teinte?: string;
  taille?: number;
}) {
  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        backgroundColor: teinte ?? c.blue,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Svg width={taille * 0.6} height={taille * 0.6} viewBox="-14 -14 28 28">
        {traits.map((seg, i) => (
          <Path
            key={i}
            d={seg.d}
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

/** ÉTAPE 1 — le viseur cherche le mur : il va et vient, puis se cale. */
function SceneViser({
  c,
  styles,
}: {
  c: Palette;
  styles: ReturnType<typeof getStyles>;
}) {
  const v = useVaEtVient(1300);
  const translateX = v.interpolate({
    inputRange: [0, 1],
    outputRange: [-52, 52],
  });
  return (
    <View style={styles.scene}>
      <Mur styles={styles} />
      <Animated.View style={[styles.centre, { transform: [{ translateX }] }]}>
        <Viseur c={c} />
      </Animated.View>
    </View>
  );
}

/** ÉTAPE 2 — on appuie : l'appareil se pose à l'endroit visé. */
function ScenePoser({
  c,
  styles,
}: {
  c: Palette;
  styles: ReturnType<typeof getStyles>;
}) {
  const v = useVaEtVient(520, 600);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const opacity = v.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 1, 1],
  });
  return (
    <View style={styles.scene}>
      <Mur styles={styles} />
      <View style={styles.centre}>
        <Viseur c={c} />
      </View>
      <Animated.View style={[styles.centre, { opacity, transform: [{ scale }] }]}>
        <Pastille c={c} traits={FIXTURE_SYMBOL.prise} />
      </Animated.View>
      {/* Le doigt qui appuie sur le bouton, à droite : c'est ce geste-là
          qu'on décrit, et il vient du bord de l'écran. */}
      <Animated.View style={[styles.doigt, { opacity }]}>
        <Pastille c={c} traits={FIXTURE_SYMBOL.prise} taille={26} />
      </Animated.View>
    </View>
  );
}

/** ÉTAPE 3 — la caméra bouge, les repères RESTENT sur leur mur. */
function SceneRester({
  c,
  styles,
}: {
  c: Palette;
  styles: ReturnType<typeof getStyles>;
}) {
  const v = useVaEtVient(1500);
  const translateX = v.interpolate({
    inputRange: [0, 1],
    outputRange: [24, -24],
  });
  return (
    <View style={styles.scene}>
      {/* C'est le MUR qui défile : la caméra tourne, les appareils ne
          bougent pas de leur place sur la cloison. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
        <Mur styles={styles} />
        <View style={[styles.pose, { left: '26%', top: 26 }]}>
          <Pastille c={c} traits={FIXTURE_SYMBOL.inter} taille={30} />
        </View>
        <View style={[styles.pose, { right: '24%', top: 54 }]}>
          <Pastille
            c={c}
            traits={CEILING_SYMBOL.dcl}
            teinte={c.amber}
            taille={30}
          />
        </View>
      </Animated.View>
      <View style={styles.centre}>
        <Viseur c={c} />
      </View>
    </View>
  );
}

const ETAPES = [
  {
    titre: 'Visez le mur',
    texte:
      'Le carré au centre de l’écran est votre viseur. Amenez-le à l’endroit exact où l’appareil doit aller.',
    Scene: SceneViser,
  },
  {
    titre: 'Appuyez sur ce que vous posez',
    texte:
      'Prise, interrupteur ou point lumineux : un appui, et l’appareil se pose là où vous visez. Rien à mesurer.',
    Scene: ScenePoser,
  },
  {
    titre: 'Le repère reste sur le mur',
    texte:
      'Continuez à scanner : ce que vous avez posé ne bouge plus, et se retrouve sur votre plan à la fin du relevé.',
    Scene: SceneRester,
  },
];

export function GuidePose({
  visible,
  onFermer,
}: {
  visible: boolean;
  onFermer: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onFermer}>
      <View style={styles.fond}>
        <View style={styles.carte}>
          <Text style={styles.titre}>Posez vos appareils en scannant</Text>
          <Text style={styles.chapeau}>
            Vous êtes devant le mur : c’est le meilleur moment pour dire où
            iront les prises et les interrupteurs.
          </Text>
          <ScrollView
            style={styles.corps}
            contentContainerStyle={styles.corpsFond}
            showsVerticalScrollIndicator={false}>
            {ETAPES.map(({ titre, texte, Scene }, i) => (
              <View key={titre} style={styles.etape}>
                <Scene c={c} styles={styles} />
                <View style={styles.etapeTexte}>
                  <View style={styles.numero}>
                    <Text style={styles.numeroTexte}>{i + 1}</Text>
                  </View>
                  <View style={styles.etapeMots}>
                    <Text style={styles.etapeTitre}>{titre}</Text>
                    <Text style={styles.etapeCorps}>{texte}</Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.valider}
            accessibilityLabel="Compris, commencer le scan"
            onPress={onFermer}>
            <Text style={styles.validerTexte}>C’est compris</Text>
          </TouchableOpacity>
          <Text style={styles.rappel}>
            Le « ? » rouvre cette page pendant le scan.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (c: Palette) =>
  StyleSheet.create({
    fond: {
      flex: 1,
      backgroundColor: 'rgba(11,13,18,0.72)',
      justifyContent: 'center',
      padding: 18,
    },
    carte: {
      backgroundColor: c.bg,
      borderRadius: radius.lg,
      padding: 20,
      maxHeight: '88%',
    },
    titre: { color: c.ink, fontSize: 20, fontWeight: '800' },
    chapeau: { color: c.inkSoft, fontSize: 13.5, lineHeight: 19, marginTop: 6 },
    corps: { marginTop: 14 },
    corpsFond: { paddingBottom: 6 },
    etape: { marginBottom: 18 },
    scene: {
      height: SCENE_H,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mur: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      margin: 12,
      borderRadius: 8,
      backgroundColor: c.surfaceSunken,
    },
    plinthe: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 18,
      height: 1.5,
      backgroundColor: c.line,
    },
    centre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    pose: { position: 'absolute' },
    doigt: { position: 'absolute', right: 18, top: SCENE_H / 2 - 13 },
    etapeTexte: { flexDirection: 'row', gap: 10, marginTop: 10 },
    numero: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numeroTexte: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    etapeMots: { flex: 1 },
    etapeTitre: { color: c.ink, fontSize: 15, fontWeight: '700' },
    etapeCorps: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
    valider: {
      backgroundColor: c.blue,
      borderRadius: radius.md,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    validerTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    rappel: {
      color: c.inkFaint,
      fontSize: 11.5,
      textAlign: 'center',
      marginTop: 10,
    },
  });
