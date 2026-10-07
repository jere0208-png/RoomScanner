/**
 * « À QUOI SERVENT CES TROIS BOUTONS ? » — la page qui répond avant qu'on
 * pose la question.
 *
 * Relevé du chantier : « les 3 boutons de placement d'éléments élec lors du
 * scan ne sont pas forcément compréhensibles de tous ». PC, INT, LUM sont
 * des abréviations de métier, et même un électricien peut hésiter devant un
 * viseur qu'on ne lui a pas expliqué. Elle s'ouvre une fois, à la première
 * caméra, et jamais plus — sauf si on la rappelle par le « ? ».
 *
 * LE GESTE SE MONTRE, IL NE SE RACONTE PAS. Chaque étape porte une petite
 * scène animée : le viseur qui cherche le mur, l'appareil qui se pose, le
 * repère qui reste pendant que la caméra tourne. Les scènes sont des VUES,
 * pas des SVG animés : `Animated` avec le pilote natif, soixante images par
 * seconde sans toucher au fil JavaScript.
 *
 * LE CADRE EST CELUI DE `Presentation` — le même que le premier lancement :
 * relevé du patron, « des gros titres avec grandes images très visuelles ».
 * La scène occupe la moitié haute de l'écran, agrandie à la largeur du
 * téléphone ; le titre et la phrase en dessous ; un bouton. Une étape à la
 * fois (relevé du chantier : « un step by step en 3 étapes avec possibilité
 * de passer »), et la sortie toujours en haut à droite.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Presentation, type PageDePresentation } from '../../components/Presentation';
import { radius, themedStyles, useTheme, type Palette } from '../../theme';
import { FIXTURE_SYMBOL } from '../../geometry/electrical';
import { CEILING_SYMBOL } from '../../geometry/ceiling';

/** La scène se dessine à cette taille, puis s'agrandit à celle de la carte. */
const SCENE = { w: 292, h: 140 };

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

type Styles = ReturnType<typeof getStyles>;

function Mur({ styles }: { styles: Styles }) {
  return (
    <View style={styles.mur}>
      <View style={styles.plinthe} />
    </View>
  );
}

/** Le viseur : quatre coins, comme à l'écran de scan. */
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

/** Un appareil : le symbole du plan dans une pastille. Même langue partout. */
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
          <Path key={i} d={seg.d} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function SceneViser({ c, styles }: { c: Palette; styles: Styles }) {
  const v = useVaEtVient(1300);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-52, 52] });
  return (
    <View style={styles.scene}>
      <Mur styles={styles} />
      <Animated.View style={[styles.centre, { transform: [{ translateX }] }]}>
        <Viseur c={c} />
      </Animated.View>
    </View>
  );
}

function ScenePoser({ c, styles }: { c: Palette; styles: Styles }) {
  const v = useVaEtVient(520, 600);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const opacity = v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
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

function SceneRester({ c, styles }: { c: Palette; styles: Styles }) {
  const v = useVaEtVient(1500);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [24, -24] });
  return (
    <View style={styles.scene}>
      {/* C'est le MUR qui défile : la caméra tourne, les appareils ne
          bougent pas de leur place sur la cloison. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
        <Mur styles={styles} />
        <View style={[styles.pose, { left: '26%', top: 30 }]}>
          <Pastille c={c} traits={FIXTURE_SYMBOL.inter} taille={30} />
        </View>
        <View style={[styles.pose, { right: '24%', top: 64 }]}>
          <Pastille c={c} traits={CEILING_SYMBOL.dcl} teinte={c.amber} taille={30} />
        </View>
      </Animated.View>
      <View style={styles.centre}>
        <Viseur c={c} />
      </View>
    </View>
  );
}

/* Trois temps, en clair — « Prise » et non « PC » : le jargon est ce qu'on
   vient expliquer. */
const ETAPES = [
  {
    cle: 'viser',
    titre: 'Visez le mur',
    phrase:
      'Le carré au centre de l’écran est votre viseur. Amenez-le à l’endroit exact où l’appareil doit aller.',
    Scene: SceneViser,
  },
  {
    cle: 'poser',
    titre: 'Appuyez sur ce que vous posez',
    phrase:
      'Prise, interrupteur ou point lumineux : un appui, et l’appareil se pose là où vous visez. Rien à mesurer.',
    Scene: ScenePoser,
  },
  {
    cle: 'rester',
    titre: 'Le repère reste sur le mur',
    phrase:
      'Continuez à scanner : ce que vous avez posé ne bouge plus, et se retrouve sur votre plan à la fin du relevé.',
    Scene: SceneRester,
  },
];

export function GuidePose({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const [etape, setEtape] = useState(0);
  useEffect(() => {
    if (visible) setEtape(0);
  }, [visible]);

  const pages: PageDePresentation[] = ETAPES.map(({ cle, titre, phrase, Scene }) => ({
    cle,
    titre,
    phrase,
    visuel: ({ w, h }) => {
      // La scène se dessine à sa taille, puis s'agrandit à la carte : des
      // vues et des traits, rien qui se pixelise.
      const k = Math.max(1, Math.min((w - 32) / SCENE.w, (h - 32) / SCENE.h));
      return (
        <View style={{ width: SCENE.w, height: SCENE.h, transform: [{ scale: k }] }}>
          <Scene c={c} styles={styles} />
        </View>
      );
    },
  }));

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onFermer}>
      <Presentation
        pages={pages}
        rang={etape}
        onRang={setEtape}
        onPasser={onFermer}
        onFinir={onFermer}
        labels={{
          passer: 'Passer l’explication',
          suivant: 'Étape suivante',
          finir: 'Compris, commencer le scan',
          finirTexte: 'C’est compris',
        }}
      />
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    scene: {
      width: SCENE.w,
      height: SCENE.h,
      borderRadius: radius.lg,
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
      borderRadius: 10,
      backgroundColor: c.surfaceSunken,
    },
    plinthe: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 20,
      height: 1.5,
      backgroundColor: c.line,
    },
    centre: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    pose: { position: 'absolute' },
    doigt: { position: 'absolute', right: 18, top: SCENE.h / 2 - 13 },
  }),
);
