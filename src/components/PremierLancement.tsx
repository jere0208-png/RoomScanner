/**
 * LE PREMIER LANCEMENT — trois cartes, et on sait à quoi sert l'application.
 *
 * Relevé du patron, après une passe globale : « on doit penser utilisateur
 * simple, sans professionnalisme forcément. On doit rendre la chose ludique. »
 *
 * L'APPLICATION S'OUVRAIT SUR UN BOUTON « COMMENCER LE SCAN », et rien
 * d'autre. Un électricien sait ce qu'il va y trouver ; quelqu'un qui vient
 * refaire son appartement voit un bouton qui lance sa caméra, et il ne sait ni
 * ce qu'il doit balayer, ni ce qu'il obtiendra à la fin. C'est le moment où
 * l'on décide si l'on continue, et c'était le seul écran muet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ET IL NE COÛTE PAS UN OCTET DE PLUS.
 *
 * Les images sont celles de la VITRINE — les cent vingt images cuites au build
 * qui tournent déjà derrière l'accueil (`npm run showcase`). On en prend trois,
 * une par temps : le plan à plat, le volume équipé, le dossier.
 *
 * C'est plus qu'une économie, c'est une garantie de justesse : ces images sont
 * produites par la MÊME géométrie que l'application. Une capture d'écran
 * refaite à la main vieillirait au premier changement de dessin, et personne
 * ne s'en apercevrait — l'accueil montrerait une application qui n'existe
 * plus.
 *
 * TROIS CARTES, PAS CINQ. La vitrine raconte cinq temps parce qu'elle a cinq
 * secondes et personne à retenir. Ici, chaque carte est un appui à donner :
 * on garde le relevé, l'appareillage et le dossier — ce qu'on FAIT, ce qu'on
 * POSE, ce qu'on EMPORTE — et l'on saute les deux étapes intermédiaires, qui
 * sont des détails de dessin.
 */
import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SHOWCASE_IMAGES } from '../assets/showcase';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

/**
 * LES TROIS IMAGES, PRISES DANS LE CYCLE DE LA VITRINE.
 *
 * Les rangs sont ceux des temps forts : le plan à plat pendant « LE RELEVÉ »,
 * le logement équipé pendant « LES PRISES », la feuille pendant « LE
 * DOSSIER ». Ils sont bornés à ce qui existe, parce qu'un cycle raccourci un
 * jour ne doit pas faire tomber l'accueil du premier lancement.
 */
const RANGS = [6, 58, 92];

const CARTES: { titre: string; phrase: string }[] = [
  {
    titre: 'Balayez la pièce',
    phrase:
      'Le téléphone relève les murs, les fenêtres et les meubles. Il en sort un plan coté, sans un coup de mètre.',
  },
  {
    titre: 'Posez vos prises',
    phrase:
      'Prises, interrupteurs, points lumineux : on les place au doigt, et l’application vérifie qu’il n’en manque pas.',
  },
  {
    titre: 'Emportez le dossier',
    phrase:
      'Un PDF avec les plans, les quantités et le prix du matériel. C’est ce qu’on montre, et c’est ce qu’on achète.',
  },
];

export function PremierLancement({ onFini }: { onFini: () => void }) {
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const [rang, setRang] = useState(0);
  const derniere = rang === CARTES.length - 1;
  const carte = CARTES[rang];
  const image = SHOWCASE_IMAGES[Math.min(RANGS[rang], SHOWCASE_IMAGES.length - 1)];

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
          { paddingTop: marges.top + 8, paddingBottom: Math.max(marges.bottom, 14) + 8 },
        ]}>
        {/*
          PASSER EST TOUJOURS POSSIBLE, ET EN HAUT À DROITE.

          Trois cartes, c'est court — et c'est justement pour ça qu'on peut
          les sauter sans rien perdre. Retenir quelqu'un devant une
          présentation est le meilleur moyen qu'il n'en lise aucune.
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
            L'IMAGE DANS SON CADRE D'ÉCRAN : la même proportion que la
            maquette de l'accueil, parce que c'est le même dessin. Un cadre
            aux mauvaises proportions étirerait un plan, ce qui est la seule
            chose qu'une application de métré ne peut pas se permettre.
          */}
          <View style={styles.cadre}>
            <Image
              source={image}
              style={styles.image}
              resizeMode="cover"
              fadeDuration={0}
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
                key={x.titre}
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
    cadre: {
      width: 168,
      height: 342,
      borderRadius: 26,
      overflow: 'hidden',
      backgroundColor: '#080B12',
      ...shadowCard,
      marginBottom: 28,
    },
    image: { width: '100%', height: '100%' },
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
    point: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.line,
    },
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
