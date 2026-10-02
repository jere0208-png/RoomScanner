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
import { useUsage } from '../store/usage';

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
    /*
      LA DEUXIÈME PAGE NE POSE PLUS DE PRISES — refonte grand public.

      Relevé du patron : « c'est trop axé électricité et pas très intuitif
      pour ceux qui n'y comprennent rien ». La présentation est vue par TOUT
      le monde, avant la question du mode : elle montre donc ce que tout le
      monde vient faire — meubler, essayer une couleur. Les prises se
      proposent à la fin, à ceux qu'elles concernent.
    */
    etape: 'meuble',
    titre: 'Aménagez-la',
    phrase:
      'Des meubles du catalogue, une couleur aux murs : on imagine la pièce avant d’y toucher.',
  },
  {
    etape: 'volume',
    titre: 'Entrez dedans',
    /*
      L'EXPORT EST NOMMÉ, ET PAR SES FORMATS — relevé du patron : « avec
      explication de possibilité d'exporter ».

      « Exportez votre projet » ne dit rien : tout le monde exporte. Trois
      extensions, elles, disent à qui l'on parle — le PDF au client, le DXF à
      l'architecte, le CSV au comptoir — et c'est ce qui fait comprendre en une
      ligne que le travail SORT de l'application.
    */
    phrase:
      'La pièce se lève en 3D et l’on s’y promène au doigt. Le plan part ensuite en PDF à imprimer, ou en DXF pour l’architecte.',
  },
];

/*
  LA QUESTION, EN DERNIÈRE PAGE — et seulement si personne n'y a répondu.

  Relevé du patron : « une proposition pour passer à un mode "Électricité" ».
  C'est ici qu'elle se pose la première fois : après avoir vu ce que fait
  l'application, pas avant — demander « êtes-vous électricien ? » à quelqu'un
  qui ne sait pas encore ce qu'il a téléchargé, c'est lui faire choisir à
  l'aveugle.

  DEUX GRANDES CARTES, ET LA PREMIÈRE EST LA PLUS LARGE DES DEUX PUBLICS.
  « Passer » reste possible : il laisse le grand public, et le menu du plan
  reproposera le mode à qui le cherche.
*/
const CHOIX: { elec: boolean; titre: string; phrase: string }[] = [
  {
    elec: false,
    titre: 'Mesurer et aménager',
    phrase: 'Scanner une pièce, lire ses cotes, la meubler, la partager.',
  },
  {
    elec: true,
    titre: 'Je suis électricien',
    phrase:
      'En plus : prises et éclairage sur le plan, normes NF C 15-100 et devis.',
  },
];

export function PremierLancement({ onFini }: { onFini: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  /* La question ne se pose qu'à qui n'a pas répondu — l'électricien qui avait
     déjà des plans équipés, lui, a été reconnu sans qu'on demande. */
  const aRepondu = useUsage((u) => u.choisi);
  const choisir = useUsage((u) => u.choisir);
  const pages = CARTES.length + (aRepondu ? 0 : 1);
  const [rang, setRang] = useState(0);
  const question = rang >= CARTES.length;
  const derniere = rang === pages - 1;
  const carte = CARTES[Math.min(rang, CARTES.length - 1)];

  const suivant = () => {
    haptic('leger');
    if (derniere) {
      onFini();
      return;
    }
    setRang((r) => r + 1);
  };
  const repondre = (elec: boolean) => {
    haptic('succes');
    choisir(elec);
    onFini();
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

        {question ? (
          <View style={styles.centre}>
            <Text style={styles.titre}>À quoi va vous servir EchoPlan ?</Text>
            <Text style={[styles.phrase, styles.phraseQuestion]}>
              Vous pourrez changer d’avis à tout moment, dans votre profil.
            </Text>
            {CHOIX.map((x) => (
              <Pressable
                key={x.titre}
                accessibilityRole="button"
                accessibilityLabel={x.titre}
                style={({ pressed }) => [styles.choix, pressed && styles.choixEnfonce]}
                onPress={() => repondre(x.elec)}>
                <Text style={styles.choixTitre}>{x.titre}</Text>
                <Text style={styles.choixPhrase}>{x.phrase}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
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
        )}
        <View style={styles.bas}>
          {/* Où l'on en est : trois points, et rien à lire. */}
          <View style={styles.points}>
            {Array.from({ length: pages }, (_, i) => (
              <View
                key={i}
                testID={`point-${i}`}
                style={[styles.point, i === rang && styles.pointVif]}
              />
            ))}
          </View>
          {!question && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={derniere ? 'Commencer' : 'Suivant'}
              style={styles.bouton}
              onPress={suivant}>
              <Text style={styles.boutonTexte}>
                {derniere ? 'C’est parti' : 'Suivant'}
              </Text>
            </Pressable>
          )}
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
    phraseQuestion: { marginBottom: 22 },
    /* Deux cartes pleine largeur : la question se répond du pouce, et chaque
       réponse porte sa phrase — on choisit sur ce qu'on fera, pas sur un
       mot. */
    choix: {
      alignSelf: 'stretch',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingVertical: 18,
      paddingHorizontal: 18,
      marginTop: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      ...shadowCard,
      shadowOpacity: 0.07,
    },
    choixEnfonce: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    choixTitre: { color: c.ink, fontSize: 17, fontWeight: '800' },
    choixPhrase: { color: c.inkSoft, fontSize: 14, lineHeight: 19, marginTop: 4 },
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
