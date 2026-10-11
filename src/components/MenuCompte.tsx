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
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Linking,
} from 'react-native';
import { useAccountStore } from '../store/accountStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import { alerte } from '../ui/alerte';

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

  /*
    L'ABONNEMENT N'EST PAS LE COMPTE — revue « Thomas » : supprimer son
    compte laissait Apple prélever l'abonnement, sans un mot. On le dit, on
    ouvre la gestion d'Apple d'un geste, et l'on confirme ce qui a été
    effacé — ou qu'on n'a rien pu effacer en ligne.
  */
  const supprimerVraiment = async () => {
    fermer();
    const issue = await supprimerCompte();
    if (issue === 'echec') {
      alerte(
        'Suppression impossible pour l’instant',
        'Nos serveurs n’ont pas répondu : rien n’a été effacé. Vérifiez la ' +
          'connexion, puis recommencez.',
      );
    } else {
      alerte(
        'Compte supprimé',
        issue === 'efface'
          ? 'Votre compte et vos plans en ligne sont effacés de nos serveurs.'
          : 'Le compte est retiré de ce téléphone. Il n’était pas relié à ' +
              'nos serveurs : rien n’y était déposé à son nom.',
      );
    }
  };
  const confirmerSuppression = () =>
    alerte(
      'Supprimer le compte ?',
      'Votre compte et les plans déposés en ligne sont effacés de nos ' +
        'serveurs. Les relevés enregistrés sur ce téléphone y restent. ' +
        'Un abonnement Pro, lui, continue d’être facturé par Apple tant ' +
        'que vous ne l’avez pas résilié.',
      [
        { label: 'Annuler' },
        {
          label: 'Gérer mon abonnement',
          onPress: () => {
            Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});
          },
        },
        {
          label: 'Supprimer',
          danger: true,
          onPress: () => {
            supprimerVraiment().catch(() => {});
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
