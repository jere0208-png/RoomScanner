/**
 * LE POPUP « ESSAI DÉJÀ UTILISÉ » — l'annonce, pas la porte fermée.
 *
 * Il se lève à la connexion quand le TÉLÉPHONE a déjà consommé son relevé
 * gratuit, quel que soit le compte qui entre. Le ton est celui d'un
 * vendeur poli : on explique en une phrase, on tend la page Pro, et
 * « Plus tard » referme sans insister — l'utilisateur garde l'app, ses
 * relevés existants, et le choix.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIX_PRO, useAccountStore } from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

export function EssaiEpuise() {
  const c = useTheme();
  const s = themed(c);
  const visible = useAccountStore((st) => st.essaiEpuiseVisible);
  const fermer = useAccountStore((st) => st.fermerEssaiEpuise);
  const ouvrirPaywall = useAccountStore((st) => st.ouvrirPaywall);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={fermer}>
      <View style={s.voile}>
        <View style={s.carte}>
          <View style={s.pastille}>
            <Text style={s.pastilleTexte}>1/1</Text>
          </View>
          <Text style={s.titre}>Vous avez déjà utilisé votre essai gratuit</Text>
          <Text style={s.corps}>
            Ce téléphone a généré son relevé offert. Passez en Pro pour
            scanner sans limite — vos relevés existants restent à vous.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Passer en Pro"
            style={({ pressed }) => [s.cta, pressed && s.enfonce]}
            onPress={() => {
              fermer();
              ouvrirPaywall();
            }}>
            <Text style={s.ctaTexte}>Passer en Pro — {PRIX_PRO} / mois</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Plus tard"
            onPress={fermer}>
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
      borderRadius: 22,
      backgroundColor: c.surface,
      padding: 24,
      alignItems: 'center',
      gap: 12,
    },
    pastille: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    pastilleTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
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
      marginTop: 6,
    },
    enfonce: { transform: [{ scale: 0.97 }] },
    ctaTexte: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
    plusTard: { color: c.inkFaint, fontSize: 14, fontWeight: '600', padding: 6 },
  });
