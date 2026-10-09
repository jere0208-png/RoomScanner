/**
 * LE PREMIER LANCEMENT — le film, puis la question.
 *
 * Relevé du patron : « les tutos de comment ça marche sont mal faits : un
 * tutoriel réaliste, en motion design, fluide et rapide, avec une coupure
 * entre chaque étape et un bouton « Suivant » qui apparaît ». C'est
 * `FilmTutoriel` : cinq chapitres — scanner, le plan, l'aménagement, la 3D,
 * le dossier — qui jouent chacun leur scène, puis attendent qu'on les suive.
 *
 * Le même film se rejoue depuis « Comment ça marche », sur l'accueil.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FilmTutoriel } from './FilmTutoriel';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import { useUsage } from '../store/usage';

/*
  LA QUESTION, APRÈS LE FILM — et seulement si personne n'y a répondu.
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
  const marges = useSafeAreaInsets();
  const aRepondu = useUsage((u) => u.choisi);
  const choisir = useUsage((u) => u.choisir);
  const [question, setQuestion] = useState(false);

  const repondre = (elec: boolean) => {
    haptic('succes');
    choisir(elec);
    onFini();
  };

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onFini}>
      {question ? (
        <View style={[styles.fond, { paddingTop: marges.top + 8, paddingBottom: Math.max(marges.bottom, 14) + 6 }]}>
          <View style={styles.barre}>
            <Pressable accessibilityRole="button" accessibilityLabel="Passer la question" hitSlop={12} onPress={onFini}>
              <Text style={styles.passer}>Passer</Text>
            </Pressable>
          </View>
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
        </View>
      ) : (
        <FilmTutoriel
          onPasser={onFini}
          onFini={() => (aRepondu ? onFini() : setQuestion(true))}
          finTexte={aRepondu ? 'C’est parti' : 'Continuer'}
        />
      )}
    </Modal>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 },
    barre: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 32 },
    passer: { color: c.inkSoft, fontSize: 16, fontWeight: '600' },
    question: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
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
