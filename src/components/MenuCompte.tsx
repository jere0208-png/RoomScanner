/**
 * LE MENU DES TROIS POINTS DE LA PAGE PROFIL.
 *
 * Il a été une carte de compte à part entière — avatar, nom, état du
 * palier, boutons — ouverte depuis l'accueil, parce que le compte n'avait
 * nulle part d'autre où vivre. La page profil porte maintenant tout cela,
 * et en grand : répéter ici le nom et l'offre ferait un doublon de la page
 * qu'on vient de quitter.
 *
 * Il ne lui reste donc que ce qu'un « ⋯ » doit contenir : les deux gestes
 * qu'on ne pose pas par mégarde. Se déconnecter, et supprimer son compte —
 * ce dernier en rouge, et confirmé par une Alert système : pour un geste
 * destructif, la feuille austère du système est un avertissement en soi,
 * la déguiser en jolie carte l'affaiblirait.
 */
import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccountStore } from '../store/accountStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';

export function MenuCompte({
  visible,
  fermer,
}: {
  visible: boolean;
  fermer: () => void;
}) {
  const c = useTheme();
  const s = themed(c);
  const deconnecter = useAccountStore((st) => st.deconnecter);
  const supprimerCompte = useAccountStore((st) => st.supprimerCompte);

  const confirmerSuppression = () =>
    Alert.alert(
      'Supprimer le compte ?',
      'Vos relevés restent sur l’appareil, mais l’identité est effacée. ' +
        'Le palier gratuit déjà consommé ne se remet pas à zéro.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            fermer();
            supprimerCompte();
          },
        },
      ],
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={fermer}>
      {/* Le voile referme : c'est le geste que tout le monde essaie. */}
      <Pressable testID="voile-compte" style={s.voile} onPress={fermer}>
        {/*
          LE MENU TOMBE SOUS SON BOUTON, en haut à droite. Un menu de « ⋯ »
          centré au milieu de l'écran perd le lien avec ce qui l'a ouvert :
          on le cherche des yeux là où le doigt vient d'appuyer.
        */}
        <Pressable style={s.carte} onPress={() => {}}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter"
            style={({ pressed }) => [s.entree, pressed && s.enfoncee]}
            onPress={() => {
              fermer();
              deconnecter();
            }}>
            <Text style={s.entreeTexte}>Se déconnecter</Text>
          </Pressable>
          <View style={s.filet} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Supprimer mon compte"
            style={({ pressed }) => [s.entree, pressed && s.enfoncee]}
            onPress={confirmerSuppression}>
            <Text style={[s.entreeTexte, s.danger]}>Supprimer mon compte</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    voile: {
      flex: 1,
      backgroundColor: 'rgba(8, 10, 14, 0.35)',
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      paddingTop: 96,
      paddingHorizontal: 20,
    },
    carte: {
      minWidth: 220,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      paddingVertical: 4,
      ...shadowCard,
    },
    entree: { paddingVertical: 14, paddingHorizontal: 18 },
    enfoncee: { backgroundColor: c.surfaceSunken },
    entreeTexte: { color: c.ink, fontSize: 15, fontWeight: '600' },
    danger: { color: c.danger },
    filet: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.line,
      marginHorizontal: 12,
    },
  });
