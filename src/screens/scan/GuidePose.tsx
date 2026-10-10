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
 * LE PRODUIT, PLUS LE SYMBOLE — relevé du patron : « revois complètement
 * l'interface du scan pour le placement des produits électriques, intègre
 * directement les éléments en 3D, et revois aussi les icônes pour du
 * réaliste ». Le scan propose un rail de produits en photo, et le produit
 * choisi flotte au viseur à sa cote ; le guide montre donc ces trois temps
 * — choisir, viser, poser — avec les mêmes photos.
 *
 * LE CADRE EST CELUI DE `Presentation` — le même que le premier lancement :
 * relevé du patron, « des gros titres avec grandes images très visuelles ».
 * La scène occupe la moitié haute de l'écran, agrandie à la largeur du
 * téléphone ; le titre et la phrase en dessous ; un bouton. Une étape à la
 * fois (relevé du chantier : « un step by step en 3 étapes avec possibilité
 * de passer »), et la sortie toujours en haut à droite.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { Presentation, type PageDePresentation } from '../../components/Presentation';
import { radius, themedStyles, useTheme, type Palette } from '../../theme';
import { VignetteProduit } from '../../components/VignetteProduit';

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

/** Un produit : sa photo sur un rond clair, comme au rail du scan. */
function Produit({
  code,
  taille = 34,
  styles,
}: {
  code: string;
  taille?: number;
  styles: Styles;
}) {
  return (
    <View style={[styles.produit, { width: taille, height: taille, borderRadius: taille / 2 }]}>
      <VignetteProduit code={code} libelle="" taille={Math.round(taille * 0.84)} />
    </View>
  );
}

/** Le rail du scan, en miniature : trois produits, le premier choisi. */
function Rail({
  styles,
  actif,
}: {
  styles: Styles;
  actif: Animated.AnimatedInterpolation<number> | Animated.Value | number;
}) {
  return (
    <View style={styles.rail}>
      {['meca-prise', 'meca-inter', 'meca-applique'].map((code, i) => (
        <View key={code} style={styles.railTuile}>
          {i === 0 && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.railChoix, { opacity: actif }]} />
          )}
          <Produit code={code} taille={24} styles={styles} />
        </View>
      ))}
    </View>
  );
}

function SceneChoisir({ styles }: { c: Palette; styles: Styles }) {
  const v = useVaEtVient(650, 300);
  return (
    <View style={styles.scene}>
      <Mur styles={styles} />
      <Rail styles={styles} actif={v} />
    </View>
  );
}

function SceneViser({ c, styles }: { c: Palette; styles: Styles }) {
  const v = useVaEtVient(1300);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-46, 46] });
  const fantome = useVaEtVient(520);
  const opacity = fantome.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  return (
    <View style={styles.scene}>
      <Mur styles={styles} />
      <Animated.View style={[styles.centre, { transform: [{ translateX }] }]}>
        <Viseur c={c} />
        {/* Le produit flotte dans le viseur, transparent : là où il se posera. */}
        <Animated.View style={[styles.centre, { opacity }]}>
          <Produit code="meca-prise" taille={22} styles={styles} />
        </Animated.View>
      </Animated.View>
      <View style={styles.phrase}>
        <Text style={styles.phraseTexte}>Prise plinthe · 25 cm</Text>
      </View>
      <Rail styles={styles} actif={1} />
    </View>
  );
}

function ScenePoser({ c, styles }: { c: Palette; styles: Styles }) {
  const v = useVaEtVient(1500);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [24, -24] });
  return (
    <View style={styles.scene}>
      {/* C'est le MUR qui défile : la caméra tourne, les produits posés ne
          bougent pas de leur place sur la cloison. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
        <Mur styles={styles} />
        <View style={[styles.pose, { left: '22%', top: 38 }]}>
          <Produit code="meca-inter" taille={24} styles={styles} />
        </View>
        <View style={[styles.pose, { left: '44%', top: 92 }]}>
          <Produit code="meca-prise" taille={24} styles={styles} />
        </View>
        <View style={[styles.pose, { left: '64%', top: 22 }]}>
          <Produit code="meca-applique" taille={24} styles={styles} />
        </View>
      </Animated.View>
      <View style={styles.centre}>
        <Viseur c={c} />
      </View>
      {/* Le déclencheur, sous le pouce : c'est lui qui pose. */}
      <View style={styles.declencheur}>
        <Produit code="meca-prise" taille={22} styles={styles} />
      </View>
    </View>
  );
}

/* Trois temps, en clair — et les produits en photo, comme au scan. */
const ETAPES = [
  {
    cle: 'choisir',
    titre: 'Choisissez le produit',
    phrase:
      'Prise, interrupteur, applique, point lumineux… Ils sont en photo sur le côté de l’écran : touchez celui que vous posez.',
    Scene: SceneChoisir,
  },
  {
    cle: 'viser',
    titre: 'Visez le mur',
    phrase:
      'Le produit apparaît en 3D au centre de l’écran, déjà à la bonne hauteur : 25 cm pour une prise de plinthe, 1,10 m pour un interrupteur.',
    Scene: SceneViser,
  },
  {
    cle: 'poser',
    titre: 'Appuyez : il reste sur le mur',
    phrase:
      'Le gros bouton pose le produit pour de bon. Continuez à scanner : il se retrouve sur votre plan à la fin du relevé.',
    Scene: ScenePoser,
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
    produit: {
      backgroundColor: '#F4F6FA',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.line,
    },
    rail: {
      position: 'absolute',
      right: 18,
      top: 18,
      bottom: 18,
      width: 36,
      borderRadius: 12,
      backgroundColor: 'rgba(12,14,20,0.72)',
      alignItems: 'center',
      justifyContent: 'space-evenly',
    },
    railTuile: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    railChoix: { borderRadius: 9, borderWidth: 2, borderColor: '#34C759' },
    phrase: {
      position: 'absolute',
      bottom: 22,
      alignSelf: 'center',
      backgroundColor: 'rgba(12,14,20,0.72)',
      borderRadius: 9,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    phraseTexte: { color: '#F4F6FA', fontSize: 9, fontWeight: '700' },
    declencheur: {
      position: 'absolute',
      right: 18,
      bottom: 16,
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 3,
      borderColor: '#F4F6FA',
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
