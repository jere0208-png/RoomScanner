/**
 * LE MOT AU SERVICE CLIENT — un sujet, un message, une photo.
 *
 * Relevé du patron : « ajoute une icône de tchat service clientèle, qui
 * ouvre un popup avec un titre, un message et une pièce jointe ».
 * L'application n'avait aucun moyen de dire quelque chose à son auteur — et
 * sur un chantier, un défaut se raconte en une photo : la pièce jointe est
 * l'essentiel de la demande, pas un supplément.
 *
 * ON N'ENVOIE RIEN À SA PLACE. Le courrier s'ouvre rempli d'avance dans le
 * composeur d'iOS, et c'est lui qui appuie sur « Envoyer ». Son adresse
 * reste la sienne, ce qui nous permet de lui répondre — et rien ne part
 * sans qu'il l'ait vu.
 *
 * LE CONTEXTE PART AVEC LE MESSAGE. Un « ça ne marche pas » sans version ni
 * modèle coûte trois allers-retours avant de commencer à chercher : la
 * version de l'app et le nombre de relevés sont ajoutés en pied de
 * courrier, où l'utilisateur les voit avant d'envoyer.
 */
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CloseCross } from './CloseCross';
import { SheetShell } from './Sheet';
import { SOLAIRES } from '../ui/solaires';
import { choisirPieceJointe, ecrireAuSupport } from '../native/support';
import { useAccountStore } from '../store/accountStore';
import { useScanStore } from '../store/scanStore';
import { radius, useTheme, type Palette } from '../theme';
import { alerte } from '../ui/alerte';

export function SupportSheet({
  visible,
  fermer,
}: {
  visible: boolean;
  fermer: () => void;
}) {
  const c = useTheme();
  const s = themed(c);
  const [sujet, setSujet] = useState('');
  const [message, setMessage] = useState('');
  const [piece, setPiece] = useState<string | null>(null);
  const [envoiEnCours, setEnvoi] = useState(false);
  const compte = useAccountStore((st) => st.compte);
  const pro = useAccountStore((st) => st.pro);
  const saves = useScanStore((st) => st.saves);

  /* Un message vide n'a rien à envoyer, et un sujet vide arrive dans la
     boîte du support comme « (sans objet) » — on demande les deux. */
  const pret = sujet.trim().length > 0 && message.trim().length > 0;

  const rendreEtFermer = () => {
    setSujet('');
    setMessage('');
    setPiece(null);
    fermer();
  };

  const envoyer = async () => {
    if (!pret || envoiEnCours) return;
    setEnvoi(true);
    const pied =
      `\n\n— — —\nEnvoyé depuis EchoPlan (${Platform.OS} ${Platform.Version})` +
      `\nCompte : ${compte?.email || compte?.prenom || 'non renseigné'}` +
      `\nFormule : ${pro ? 'Pro' : 'Gratuit'} · ${saves.length} relevé(s)`;
    try {
      const sortie = await ecrireAuSupport(sujet.trim(), message.trim() + pied, piece);
      if (sortie === 'unavailable' && piece) {
        // Le repli `mailto:` ne sait pas porter de fichier : on le DIT,
        // plutôt que de laisser croire que la photo est partie.
        alerte(
          'Photo non jointe',
          'Votre iPhone n’a pas de compte dans l’app Mail : le message s’est ' +
            'ouvert sans la photo. Vous pouvez l’ajouter à la main avant ' +
            'd’envoyer.',
        );
      }
    } finally {
      setEnvoi(false);
      rendreEtFermer();
    }
  };

  /*
    UNE FEUILLE DU BAS, PAS UNE CARTE CENTRÉE.

    Relevé du patron, capture à l'appui : « le bouton Envoyer n'est plus
    visible à cause du clavier ». Le formulaire était centré : le clavier
    monte, prend la moitié basse de l'écran, et le bouton passe dessous. On
    tape son message et l'on ne peut plus l'envoyer.

    C'est la leçon que toutes les fenêtres de cette application ont déjà
    apprise — « le seul endroit de l'écran que le clavier ne peut pas
    recouvrir, c'est le bas, puisque la feuille MONTE AVEC LUI ». Le
    formulaire prend donc la coquille commune, qui porte déjà la montée, la
    descente, le voile qui referme, et le décalage du clavier.
  */
  return (
    <SheetShell visible={visible} onClose={rendreEtFermer}>
      <>
      {/*
        UNE SEULE CROIX, ET C'EST CELLE DE LA COQUILLE.

        Relevé du patron : « la croix pour quitter la fenêtre de contact du
        service client ». Il y en avait DEUX, l'une sur l'autre en haut à
        droite — celle que `SheetShell` pose pour TOUTES les feuilles, et
        une seconde écrite ici avant que la coquille n'en ait une.

        Deux croix superposées, c'est une cible tactile qui se partage en
        deux et un lecteur d'écran qui annonce « Fermer, Fermer ». Rien ne
        casse, et tout le monde voit que quelque chose ne va pas.

        Le titre garde en revanche sa place réservée à droite : la croix de
        la coquille est posée en ABSOLU — elle ne pousse rien — et sans
        cette réserve un titre long passerait dessous.
      */}
      <View style={s.entete}>
        <Text style={s.titre}>Écrire au service client</Text>
      </View>
      <Text style={s.sous}>
        Une question, un défaut, une idée : on répond à la même adresse.
      </Text>

      <TextInput
        accessibilityLabel="Sujet"
        style={s.champ}
        placeholder="Sujet"
        placeholderTextColor={c.inkFaint}
        value={sujet}
        onChangeText={setSujet}
      />
      {/*
        LE MESSAGE EST HAUT — on écrit un paragraphe, pas une ligne.
        `textAlignVertical` pour Android : sans lui, le texte se centre
        dans la boîte et l'on tape au milieu du vide.
      */}
      <TextInput
        accessibilityLabel="Message"
        style={[s.champ, s.champLong]}
        placeholder="Votre message…"
        placeholderTextColor={c.inkFaint}
        value={message}
        onChangeText={setMessage}
        multiline
        textAlignVertical="top"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Joindre une photo"
        style={({ pressed }) => [s.joindre, pressed && s.enfonce]}
        onPress={async () => {
          const chemin = await choisirPieceJointe();
          if (chemin) setPiece(chemin);
        }}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d={SOLAIRES.image} fill={c.blue} fillRule="evenodd" />
        </Svg>
        <Text style={s.joindreMot} numberOfLines={1}>
          {piece ? 'Photo jointe' : 'Joindre une photo'}
        </Text>
        {!!piece && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retirer la photo"
            hitSlop={10}
            onPress={() => setPiece(null)}>
            <CloseCross size={16} color={c.inkFaint} />
          </Pressable>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Envoyer le message"
        accessibilityState={{ disabled: !pret }}
        disabled={!pret || envoiEnCours}
        style={({ pressed }) => [
          s.envoyer,
          !pret && s.envoyerEteint,
          pressed && s.enfonce,
        ]}
        onPress={envoyer}>
        <Text style={s.envoyerMot}>Envoyer</Text>
      </Pressable>
      </>
    </SheetShell>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    entete: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    titre: {
      flex: 1,
      color: c.ink,
      fontSize: 17,
      fontWeight: '800',
      // La place de la croix de la coquille, posée en absolu à douze points
      // du bord : sans cette réserve, un titre long passerait dessous.
      paddingRight: 34,
    },
    sous: { color: c.inkSoft, fontSize: 12.5, lineHeight: 17, marginTop: 4 },
    champ: {
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.bg,
      color: c.ink,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 15,
      marginTop: 12,
    },
    champLong: { height: 116 },
    joindre: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      backgroundColor: c.blueSoft,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginTop: 12,
    },
    joindreMot: { color: c.blue, fontSize: 13.5, fontWeight: '700' },
    envoyer: {
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
    },
    // Éteint tant qu'il n'y a rien à envoyer : un bouton qui ne fait rien
    // doit se voir avant d'être touché, pas après.
    envoyerEteint: { backgroundColor: c.lineStrong },
    envoyerMot: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
    enfonce: { transform: [{ scale: 0.97 }] },
  });
