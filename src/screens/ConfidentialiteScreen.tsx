/**
 * CE QUE L'APPLICATION SAIT DE VOUS — la page, pas l'alerte.
 *
 * Le sujet tenait dans une `Alert` de quatre lignes, ouverte depuis une
 * rangée du profil. C'est trop peu pour ce qu'il y a à dire — relevé du
 * patron : « Confidentialité des données doit ouvrir une vraie page avec
 * les informations complètes ». Et c'est aussi la page qu'Apple attend
 * d'une application qui porte des comptes et un abonnement : quatre lignes
 * dans une boîte système ne sont ni lisibles, ni relisibles, ni citables.
 *
 * Le texte dit ce qui est VRAI de l'architecture, et rien de plus : chaque
 * paragraphe correspond à un mécanisme qu'on peut aller lire dans le code.
 * Une politique de confidentialité qui promet ce que le logiciel ne fait
 * pas est un mensonge écrit noir sur blanc.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { useScanStore } from '../store/scanStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';

/** L'adresse à qui l'on écrit — la même que le tchat du service client. */
export const COURRIEL_SUPPORT = 'echoplansupport@gmail.com';

const SECTIONS: { titre: string; texte: string }[] = [
  {
    titre: 'Vos relevés vivent sur votre téléphone',
    texte:
      'Les plans, les cotes, l’appareillage et le métré sont écrits dans le ' +
      'stockage de l’application, sur votre appareil. Ils n’ont besoin ' +
      'd’aucune connexion : EchoPlan fonctionne entièrement hors ligne, et ' +
      'c’est voulu — un chantier n’a pas toujours de réseau.',
  },
  {
    titre: 'Vos photos ne quittent jamais votre appareil',
    texte:
      'Les photos de mur sont rangées dans votre photothèque, dans l’album ' +
      '« EchoPlan ». Elles vous appartiennent : elles suivent vos ' +
      'sauvegardes iCloud et survivent à une réinstallation. Aucune image ' +
      'n’est jamais envoyée à nos serveurs, ni à personne d’autre.',
  },
  {
    titre: 'Ce qui monte sous votre compte, et pourquoi',
    texte:
      'Quand vous êtes connecté, le TEXTE de vos relevés — des murs, des ' +
      'ouvertures, de l’appareillage, et les identifiants de vos photos — ' +
      'est déposé sous votre compte. Quelques dizaines de kilo-octets. ' +
      'C’est ce qui vous les rend après une réinstallation ou sur un ' +
      'nouveau téléphone. Les images, elles, restent chez vous : le plan ne ' +
      'porte que leurs renvois.',
  },
  {
    titre: 'Votre compte, et rien de plus',
    texte:
      'Nous gardons votre identifiant de compte, votre prénom et votre ' +
      'adresse e-mail si vous les avez donnés, un identifiant d’appareil ' +
      '(qui sert à compter le relevé offert), et l’état de votre ' +
      'abonnement. Aucun mot de passe : la connexion par e-mail n’en ' +
      'demande pas, et « Se connecter avec Apple » ne nous transmet que ce ' +
      'qu’Apple veut bien nous dire.',
  },
  {
    titre: 'Le paiement passe par Apple, pas par nous',
    texte:
      'L’abonnement est encaissé par l’App Store. Nous ne voyons jamais ' +
      'votre moyen de paiement : nous demandons seulement à Apple si votre ' +
      'abonnement est actif et jusqu’à quand. La résiliation se fait dans ' +
      'les Réglages de votre iPhone, Apple ID puis Abonnements.',
  },
  {
    titre: 'Aucun traceur, aucune publicité',
    texte:
      'EchoPlan ne contient ni régie publicitaire, ni outil de mesure ' +
      'd’audience, ni traceur tiers. Personne n’achète votre activité, ' +
      'parce que personne ne la reçoit.',
  },
  {
    titre: 'Ce que vous pouvez exiger',
    texte:
      'Supprimer votre compte efface votre identité de nos serveurs et de ' +
      'votre téléphone ; le geste est dans le menu « ⋯ » de la page profil. ' +
      'Vos relevés déjà enregistrés restent sur l’appareil. Vous pouvez ' +
      'aussi demander une copie de ce que nous détenons, ou son ' +
      'effacement, en écrivant à l’adresse ci-dessous — nous répondons.',
  },
];

export function ConfidentialiteScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const setScreen = useScanStore((st) => st.setScreen);

  return (
    <View style={[s.fond, { paddingTop: insets.top }]}>
      <View style={s.barre}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={s.rondBarre}
          hitSlop={10}
          /* On y entre depuis le profil : on y retourne. Renvoyer à
             l'accueil ferait repartir de zéro pour un réglage voisin. */
          onPress={() => setScreen('profil')}>
          <BackChevron color={c.ink} />
        </Pressable>
        <Text style={s.titreBarre}>Confidentialité</Text>
        <View style={s.videBarre} />
      </View>

      <ScrollView
        contentContainerStyle={[
          s.contenu,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={s.chapeau}>
          EchoPlan est une application de chantier : elle garde le moins de
          choses possible, et le plus près possible de vous.
        </Text>
        {SECTIONS.map((sec) => (
          <View key={sec.titre} style={s.bloc}>
            <Text style={s.blocTitre}>{sec.titre}</Text>
            <Text style={s.blocTexte}>{sec.texte}</Text>
          </View>
        ))}
        <Text style={s.contact}>{COURRIEL_SUPPORT}</Text>
      </ScrollView>
    </View>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      marginTop: 8,
      marginBottom: 10,
    },
    rondBarre: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
      shadowOpacity: 0.07,
    },
    titreBarre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    // Le vide qui recentre le titre, et rien de plus : un rond blanc sans
    // geste est un bouton qu'on essaie.
    videBarre: { width: 40, height: 40 },
    contenu: { paddingHorizontal: 22 },
    chapeau: {
      color: c.inkSoft,
      fontSize: 14.5,
      lineHeight: 20,
      marginBottom: 16,
    },
    bloc: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: 16,
      marginBottom: 10,
      ...shadowCard,
      shadowOpacity: 0.05,
    },
    blocTitre: { color: c.ink, fontSize: 15, fontWeight: '800' },
    blocTexte: {
      color: c.inkSoft,
      fontSize: 13.5,
      lineHeight: 19,
      marginTop: 6,
    },
    contact: {
      color: c.blue,
      fontSize: 13.5,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 14,
    },
  });
