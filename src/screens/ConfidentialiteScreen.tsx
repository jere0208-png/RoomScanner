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
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { useScanStore } from '../store/scanStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import {
  choisirPhotosVisibles,
  lireAccesPhotos,
  ouvrirReglagesPhotos,
  type AccesPhotos,
} from '../ui/photos';

/** L'adresse à qui l'on écrit — la même que le tchat du service client. */
export const COURRIEL_SUPPORT = 'echoplansupport@gmail.com';

/** Le titre de la section des photos : l'état de l'accès s'affiche dessous. */
const TITRE_PHOTOS = 'Vos photos de repérage restent sur votre appareil';

/**
 * L'ÉTAT DE L'ACCÈS AUX PHOTOS, dit en clair — et le geste qui l'élargit.
 *
 * Relevé du patron : l'album « EchoPlan » doit fonctionner vraiment. Quand
 * il ne peut pas — accès limité ou refusé —, c'est ici qu'on vient voir
 * pourquoi, et d'ici qu'on le répare.
 */
export const ETAT_ACCES_PHOTOS: Record<AccesPhotos, string> = {
  complet: 'Accès complet : vos photos vont dans l’album « EchoPlan ».',
  limite:
    'Accès limité : vos photos sont gardées, mais sans album. Donnez l’accès ' +
    'complet dans les Réglages pour les ranger dans « EchoPlan ».',
  refuse:
    'Accès refusé : vos photos restent dans l’application, et seraient ' +
    'perdues si vous la supprimiez.',
  indetermine: 'Pas encore demandé : la question viendra à votre première photo.',
};

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
    titre: TITRE_PHOTOS,
    texte:
      'À votre première photo de repérage, EchoPlan vous demande l’accès à ' +
      'vos Photos. Avec l’accès complet, vos photos sont rangées dans ' +
      'l’album « EchoPlan » de votre photothèque : elles vous appartiennent, ' +
      'suivent vos sauvegardes iCloud et survivent à une réinstallation. ' +
      'EchoPlan ne relit que les photos qu’il a prises, et ne parcourt ' +
      'jamais les autres. Avec l’accès limité, elles sont enregistrées dans ' +
      'la pellicule, sans album (iOS ne le permet pas). Si vous refusez, ' +
      'elles restent dans l’application et disparaissent avec elle. Les ' +
      'photos prises automatiquement pendant le scan, elles, restent ' +
      'toujours dans l’application. Aucune de ces images n’est envoyée à ' +
      'nos serveurs, ni à personne d’autre. Une seule exception, et ' +
      'seulement à votre demande : la page d’un plan papier que vous ' +
      'faites lire (ci-dessous).',
  },
  {
    titre: 'La lecture d’un plan papier, et elle seule',
    texte:
      'Quand vous faites lire un plan papier, et seulement à ce moment-là, ' +
      'l’image de la feuille (sa photo, ou la page du PDF choisi) part sur ' +
      'notre serveur, qui la fait lire par une intelligence artificielle ' +
      '(Claude, d’Anthropic) : elle rend les murs, les cotes, les pièces et ' +
      'les symboles qu’elle y voit. Nous ne gardons ni l’image ni la ' +
      'lecture. Le fichier lui-même reste sur votre téléphone : seule la ' +
      'page retenue part. Anthropic ne s’en sert pas pour ' +
      'entraîner ses modèles, et ne la conserve qu’un temps limité, pour ses ' +
      'contrôles de sécurité. Seul le nombre de lectures est compté sur ' +
      'votre compte : la première est offerte.',
  },
  {
    titre: 'Ce qui monte sous votre compte, et pourquoi',
    texte:
      'Avec l’abonnement Pro, le texte de vos relevés — des murs, des ' +
      'ouvertures, de l’appareillage, et les identifiants de vos photos — ' +
      'est déposé sous votre compte. Quelques dizaines de kilo-octets. ' +
      'C’est ce qui vous les rend après une réinstallation ou sur un ' +
      'nouveau téléphone. Sans le Pro, rien ne monte : vos relevés restent ' +
      'sur le téléphone. Les images, elles, restent toujours chez vous : le ' +
      'plan ne porte que leurs renvois.',
  },
  {
    titre: 'Votre compte, et rien de plus',
    texte:
      'Nous gardons votre identifiant de compte, votre prénom et votre ' +
      'adresse e-mail si vous les avez donnés, un identifiant d’appareil ' +
      '(qui relie votre téléphone à votre compte), et l’état de votre ' +
      'abonnement. Aucun mot de passe : la connexion par e-mail se prouve ' +
      'par un code à six chiffres envoyé à l’adresse, et « Se connecter avec ' +
      'Apple » ne nous transmet que ce qu’Apple veut bien nous dire.',
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
      'Supprimer votre compte efface votre identité et vos relevés déposés ' +
      'de nos serveurs, et votre identité de votre téléphone ; le geste est ' +
      'dans le menu « ⋯ » de la page profil. ' +
      'Vos relevés déjà enregistrés restent sur l’appareil. Vous pouvez ' +
      'aussi demander une copie de ce que nous détenons, ou son ' +
      'effacement, en écrivant à l’adresse ci-dessous — nous répondons.',
  },
];

/**
 * L'accès aux Photos, relu à l'ouverture et à chaque retour dans l'app :
 * on revient des Réglages, la ligne doit déjà dire le nouvel état. Rien
 * hors iOS — il n'y a alors pas de photothèque à expliquer.
 */
function AccesPhotosLigne({ s }: { s: ReturnType<typeof themed> }) {
  const [acces, setAcces] = React.useState<AccesPhotos | null>(null);
  React.useEffect(() => {
    let vivant = true;
    const relire = () => {
      lireAccesPhotos().then((a) => {
        if (vivant) setAcces(a);
      });
    };
    relire();
    const abo = AppState.addEventListener?.('change', (etat) => {
      if (etat === 'active') relire();
    });
    return () => {
      vivant = false;
      abo?.remove?.();
    };
  }, []);
  if (!acces) return null;
  return (
    <View style={s.acces}>
      <Text style={s.accesTexte}>{ETAT_ACCES_PHOTOS[acces]}</Text>
      {acces === 'limite' && (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            choisirPhotosVisibles().then((a) => a && setAcces(a));
          }}>
          <Text style={s.accesGeste}>Choisir les photos visibles</Text>
        </Pressable>
      )}
      {(acces === 'limite' || acces === 'refuse') && (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={ouvrirReglagesPhotos}>
          <Text style={s.accesGeste}>Ouvrir les Réglages</Text>
        </Pressable>
      )}
    </View>
  );
}

export function ConfidentialiteScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const setScreen = useScanStore((st) => st.setScreen);

  return (
    /* Le bord gauche ramène au profil, comme la flèche : le geste vit
       partout où elle vit. En enveloppe, il ne vole aucun appui. */
    <RetourGlisse
      onRetour={() => setScreen('profil')}
      style={[s.fond, { paddingTop: insets.top }]}>
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
            {sec.titre === TITRE_PHOTOS && <AccesPhotosLigne s={s} />}
          </View>
        ))}
        <Text style={s.contact}>{COURRIEL_SUPPORT}</Text>
      </ScrollView>
    </RetourGlisse>
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
    blocTitre: { color: c.ink, fontSize: 15, fontWeight: '600' },
    blocTexte: {
      color: c.inkSoft,
      fontSize: 13.5,
      lineHeight: 19,
      marginTop: 6,
    },
    acces: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
      gap: 8,
    },
    accesTexte: { color: c.ink, fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
    accesGeste: { color: c.blue, fontSize: 13.5, fontWeight: '700' },
    contact: {
      color: c.blue,
      fontSize: 13.5,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 14,
    },
  });
