/**
 * LE PREMIER LANCEMENT — trois étapes, et le plan se fait sous les yeux.
 *
 * Relevé du patron : « refais les étapes animées pour la première utilisation,
 * sans texte juste : un plan 2D sur la première page, plan équipé sur la page
 * 2 et plan 3D sur la page 3. Avec explication de possibilité d'exporter etc. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DESSINS, ET LE SECOND EST CELUI-CI.
 *
 * PREMIER — TROIS PHOTOS. Les cartes montraient trois images cuites de la
 * vitrine de l'accueil : le plan à plat, le volume équipé, la feuille du
 * dossier. C'était juste, gratuit, et FIGÉ — trois captures d'écran dans une
 * présentation, c'est-à-dire ce que fait tout le monde.
 *
 * SECOND — LE PLAN SE FAIT. Les murs se tracent l'un après l'autre, les
 * appareils se posent, le logement se lève. On ne montre plus le résultat : on
 * montre le GESTE, ce qui est la seule chose qu'une présentation puisse
 * apprendre.
 *
 * ET C'EST LE MÊME LOGEMENT AUX TROIS PAGES (voir `PlanAnime`). Trois
 * illustrations sans rapport diraient « voici trois fonctions » ; le même plan
 * qui se trace, s'équipe et se lève dit « voici ce qui arrive à VOTRE
 * logement ».
 *
 * LE QUADRILLAGE PORTE LES TROIS. C'est le papier de l'architecte, et c'est
 * celui de l'accueil : la présentation et l'application ouvrent sur la même
 * feuille, ce qui fait de la première une promesse tenue plutôt qu'une
 * affiche.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlanAnime, type EtapeDuPlan } from './PlanAnime';
import { Quadrillage } from './Quadrillage';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

/** Le cadre du dessin, en points. Trois sur quatre : les proportions d'un plan. */
const CADRE = { w: 292, h: 236 };

const CARTES: { etape: EtapeDuPlan; titre: string; phrase: string }[] = [
  {
    etape: 'plan',
    titre: 'Balayez la pièce',
    phrase:
      'Le téléphone relève les murs, les fenêtres et les meubles. Il en sort un plan coté, sans un coup de mètre.',
  },
  {
    etape: 'equipe',
    titre: 'Placez vos prises',
    phrase:
      'Prises, interrupteurs, points lumineux : on les pose au doigt, et l’application vérifie qu’il n’en manque pas.',
  },
  {
    etape: 'volume',
    titre: 'Emportez le dossier',
    /*
      L'EXPORT EST NOMMÉ, ET PAR SES FORMATS — relevé du patron : « avec
      explication de possibilité d'exporter ».

      « Exportez votre projet » ne dit rien : tout le monde exporte. Trois
      extensions, elles, disent à qui l'on parle — le PDF au client, le DXF à
      l'architecte, le CSV au comptoir — et c'est ce qui fait comprendre en une
      ligne que le travail SORT de l'application.
    */
    phrase:
      'Le logement en volume, et tout ce qui va avec : le PDF des plans pour le client, le DXF pour l’architecte, la liste du matériel en CSV.',
  },
];

export function PremierLancement({ onFini }: { onFini: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const [rang, setRang] = useState(0);
  const derniere = rang === CARTES.length - 1;
  const carte = CARTES[rang];

  const suivant = () => {
    haptic('leger');
    if (derniere) {
      onFini();
      return;
    }
    setRang((r) => r + 1);
  };

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onFini}>
      <View
        style={[
          styles.fond,
          {
            paddingTop: marges.top + 8,
            paddingBottom: Math.max(marges.bottom, 14) + 8,
          },
        ]}>
        {/*
          PASSER EST TOUJOURS POSSIBLE, ET EN HAUT À DROITE.

          Trois cartes, c'est court — et c'est justement pour ça qu'on peut les
          sauter sans rien perdre. Retenir quelqu'un devant une présentation
          est le meilleur moyen qu'il n'en lise aucune.
        */}
        <View style={styles.barre}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Passer la présentation"
            hitSlop={12}
            onPress={onFini}>
            <Text style={styles.passer}>Passer</Text>
          </Pressable>
        </View>

        <View style={styles.centre}>
          {/*
            LE DESSIN SUR SON PAPIER. Le quadrillage vit DANS la carte et pas
            derrière l'écran : c'est une feuille qu'on pose, et une feuille a
            des bords — même fondus.
          */}
          <View style={styles.feuille}>
            <Quadrillage
              width={CADRE.w}
              height={CADRE.h}
              palette={c}
              force={1.1}
              cle="lancement"
            />
            {/*
              LA CLÉ CHANGE À CHAQUE ÉTAPE, et c'est ce qui REJOUE l'animation.
              Sans elle, React garderait le même composant d'une page à
              l'autre : le plan se tracerait une fois, et les deux pages
              suivantes s'afficheraient déjà finies.
            */}
            <PlanAnime
              key={carte.etape}
              etape={carte.etape}
              width={CADRE.w}
              height={CADRE.h}
              palette={c}
            />
          </View>
          <Text style={styles.titre}>{carte.titre}</Text>
          <Text style={styles.phrase}>{carte.phrase}</Text>
        </View>

        <View style={styles.bas}>
          {/* Où l'on en est : trois points, et rien à lire. */}
          <View style={styles.points}>
            {CARTES.map((x, i) => (
              <View
                key={x.etape}
                testID={`point-${i}`}
                style={[styles.point, i === rang && styles.pointVif]}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={derniere ? 'Commencer' : 'Suivant'}
            style={styles.bouton}
            onPress={suivant}>
            <Text style={styles.boutonTexte}>
              {derniere ? 'C’est parti' : 'Suivant'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 24 },
    barre: { alignItems: 'flex-end', minHeight: 30 },
    passer: { color: c.inkFaint, fontSize: 15, fontWeight: '600' },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    feuille: {
      width: CADRE.w,
      height: CADRE.h,
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      overflow: 'hidden',
      marginBottom: 30,
      ...shadowCard,
    },
    titre: {
      color: c.ink,
      fontSize: 25,
      fontWeight: '800',
      letterSpacing: -0.6,
      textAlign: 'center',
    },
    phrase: {
      color: c.inkSoft,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 10,
      maxWidth: 330,
    },
    bas: { gap: 18 },
    points: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
    point: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.line },
    pointVif: { backgroundColor: c.blue, width: 18 },
    bouton: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boutonTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  }),
);
