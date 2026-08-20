/**
 * LE POPUP « AVIS CONTRE UN ESSAI » — la dernière chance, en étoiles.
 *
 * Il se lève quand on REFUSE l'offre de réduction alors que l'essai est
 * épuisé : plutôt qu'une porte fermée, une main tendue — « votre avis nous
 * aide sur l'App Store, et il vous rend UN relevé gratuit ». Cinq étoiles
 * d'or (le jeu Solar, la famille du contour Pro) disent « avis » avant
 * qu'on ait lu un mot.
 *
 * ATTENTION REVUE APPLE : récompenser un avis est contraire aux règles de
 * l'App Store (avis incités). Le patron est prévenu — à revoir avant la
 * soumission. Et le bonus s'encaisse SUR L'HONNEUR : aucune API ne dit si
 * l'avis a été posté ; on ouvre la page, on fait confiance, une seule fois.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { ORS } from './ContourOr';
import { useAccountStore } from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

export function AvisRecompense() {
  const c = useTheme();
  const s = themed(c);
  const visible = useAccountStore((st) => st.avisVisible);
  const fermer = useAccountStore((st) => st.fermerAvis);
  const donner = useAccountStore((st) => st.donnerAvis);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={fermer}>
      <View style={s.voile}>
        <View style={s.carte}>
          {/* Les cinq étoiles : le dessin universel d'un avis. La teinte
              est l'or du contour Pro — même famille, même maison. */}
          <View style={s.etoiles}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Svg key={i} width={30} height={30} viewBox="0 0 24 24">
                <Path d={SOLAIRES.etoile} fill={ORS[1]} fillRule="evenodd" />
              </Svg>
            ))}
          </View>
          <Text style={s.titre}>Un avis, un relevé offert</Text>
          <Text style={s.corps}>
            Dites ce que vous pensez d’EchoPlan sur l’App Store — ça nous
            aide énormément. En échange, un relevé gratuit supplémentaire,
            tout de suite.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Laisser un avis"
            style={({ pressed }) => [s.cta, pressed && s.enfonce]}
            onPress={donner}>
            <Text style={s.ctaTexte}>Laisser un avis ⭐ +1 relevé</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plus tard"
            onPress={fermer}
            hitSlop={8}>
            <Text style={s.plusTard}>Plus tard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    voile: {
      flex: 1,
      backgroundColor: 'rgba(8, 10, 14, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    carte: {
      alignSelf: 'stretch',
      borderRadius: 24,
      backgroundColor: c.surface,
      padding: 24,
      alignItems: 'center',
      gap: 12,
    },
    etoiles: { flexDirection: 'row', gap: 6, marginBottom: 2 },
    titre: {
      color: c.ink,
      fontSize: 19,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 25,
    },
    corps: {
      color: c.inkSoft,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    cta: {
      alignSelf: 'stretch',
      height: 52,
      borderRadius: 15,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    enfonce: { transform: [{ scale: 0.97 }] },
    ctaTexte: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
    plusTard: { color: c.inkFaint, fontSize: 14, fontWeight: '600', padding: 6 },
  });
