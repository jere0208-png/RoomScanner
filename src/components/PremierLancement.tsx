/**
 * LE PREMIER LANCEMENT — trois pages, et le plan se fait sous les yeux.
 *
 * Relevé du patron : « refais les étapes animées pour la première utilisation,
 * sans texte juste : un plan 2D sur la première page, plan équipé sur la page
 * 2 et plan 3D sur la page 3. Avec explication de possibilité d'exporter etc. »
 * Puis : « des gros titres avec grandes images très visuelles ».
 *
 * LE PLAN SE FAIT. Les murs se tracent l'un après l'autre, les meubles se
 * posent, le logement se lève. On ne montre pas le résultat : on montre le
 * GESTE, ce qui est la seule chose qu'une présentation puisse apprendre. Et
 * c'est le MÊME logement aux trois pages (voir `PlanAnime`) : trois
 * illustrations sans rapport diraient « voici trois fonctions » ; le même
 * plan qui se trace, se meuble et se lève dit « voici ce qui arrive à VOTRE
 * logement ».
 *
 * LE CADRE EST CELUI DE `Presentation` — le même que le guide d'avant-scan :
 * le visuel grand dans une carte, le titre gras sur deux lignes, les tirets,
 * « Passer », un bouton. Le quadrillage porte le dessin : c'est le papier de
 * l'architecte, celui de l'accueil — la présentation et l'application
 * ouvrent sur la même feuille.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PlanAnime, type EtapeDuPlan } from './PlanAnime';
import { Quadrillage } from './Quadrillage';
import { Presentation, type PageDePresentation } from './Presentation';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import { useUsage } from '../store/usage';

const CARTES: { etape: EtapeDuPlan; titre: string; phrase: string }[] = [
  {
    etape: 'plan',
    titre: 'Balayez la pièce',
    phrase:
      'Le téléphone relève les murs, les fenêtres et les meubles. Il en sort un plan coté, sans un coup de mètre.',
  },
  {
    /*
      LA DEUXIÈME PAGE NE POSE PLUS DE PRISES — refonte grand public. La
      présentation est vue par TOUT le monde, avant la question du mode :
      elle montre ce que tout le monde vient faire. Les prises se proposent
      à la fin, à ceux qu'elles concernent.
    */
    etape: 'meuble',
    titre: 'Aménagez-la',
    phrase:
      'Des meubles du catalogue, une couleur aux murs : on imagine la pièce avant d’y toucher.',
  },
  {
    etape: 'volume',
    titre: 'Entrez dedans',
    /* L'export est nommé par ses formats : le PDF au client, le DXF à
       l'architecte — c'est ce qui dit en une ligne que le travail SORT. */
    phrase:
      'La pièce se lève en 3D et l’on s’y promène au doigt. Le plan part ensuite en PDF à imprimer, ou en DXF pour l’architecte.',
  },
];

/*
  LA QUESTION, EN DERNIÈRE PAGE — et seulement si personne n'y a répondu.
  Après avoir vu ce que fait l'application, pas avant : demander « êtes-vous
  électricien ? » à qui ne sait pas encore ce qu'il a téléchargé, c'est lui
  faire choisir à l'aveugle. « Passer » reste possible et laisse le grand
  public ; le menu du plan reproposera le mode à qui le cherche.
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
    phrase: 'En plus : prises et éclairage sur le plan, normes NF C 15-100 et devis.',
  },
];

export function PremierLancement({ onFini }: { onFini: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const aRepondu = useUsage((u) => u.choisi);
  const choisir = useUsage((u) => u.choisir);
  const [rang, setRang] = useState(0);

  const repondre = (elec: boolean) => {
    haptic('succes');
    choisir(elec);
    onFini();
  };

  const pages = useMemo<PageDePresentation[]>(() => {
    const cartes: PageDePresentation[] = CARTES.map((carte) => ({
      cle: carte.etape,
      titre: carte.titre,
      phrase: carte.phrase,
      visuel: ({ w, h }) => {
        /* Le dessin garde les proportions d'un plan (trois sur quatre) et
           remplit la carte, quel que soit le téléphone. */
        const marge = 24;
        const lw = Math.min(w - marge * 2, ((h - marge * 2) * 292) / 236);
        const lh = (lw * 236) / 292;
        return (
          <View style={[styles.feuille, { width: lw, height: lh }]}>
            <Quadrillage width={lw} height={lh} palette={c} force={1.1} cle="lancement" />
            {/* La clé change à chaque étape : c'est ce qui REJOUE le tracé. */}
            <PlanAnime key={carte.etape} etape={carte.etape} width={lw} height={lh} palette={c} />
          </View>
        );
      },
    }));
    if (aRepondu) return cartes;
    return [
      ...cartes,
      {
        cle: 'question',
        titre: 'À quoi va vous servir EchoPlan ?',
        phrase: '',
        sansBouton: true,
        corps: (
          <View style={styles.question}>
            <Text style={styles.questionTitre}>À quoi va vous servir EchoPlan ?</Text>
            <Text style={styles.questionPhrase}>
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
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aRepondu, c, styles]);

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onFini}>
      <Presentation
        pages={pages}
        rang={rang}
        onRang={setRang}
        onPasser={onFini}
        onFinir={onFini}
        labels={{
          passer: 'Passer la présentation',
          suivant: 'Suivant',
          finir: 'Commencer',
          finirTexte: 'C’est parti',
        }}
      />
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    feuille: {
      borderRadius: radius.lg,
      backgroundColor: c.surface,
      overflow: 'hidden',
      ...shadowCard,
    },
    question: { paddingHorizontal: 4 },
    questionTitre: {
      color: c.ink,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '800',
      letterSpacing: -0.9,
      textAlign: 'center',
    },
    questionPhrase: {
      color: c.inkSoft,
      fontSize: 16,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 22,
    },
    /* Deux cartes pleine largeur : la question se répond du pouce, et chaque
       réponse porte sa phrase — on choisit sur ce qu'on fera, pas sur un mot. */
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
  }),
);
