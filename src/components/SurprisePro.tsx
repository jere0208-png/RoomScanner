/**
 * LE POPUP « SURPRISE ! » — le cadeau qui tend la page Pro.
 *
 * Un cadeau 3D en argile, « Surprise ! » en typo d'or, et l'offre de
 * bienvenue : −20 % sur la première souscription (code FIRST20). Il se
 * lève à la PREMIÈRE inscription de l'appareil, et quand l'essai épuisé
 * bloque un nouveau scan — l'offre à la place de la porte fermée.
 *
 * TOUTE LA CARTE EST LE BOUTON. Relevé du patron : « le clic sur ce
 * pop-up rentre automatiquement le code ». Personne ne recopie un code
 * depuis un popup fermé : le clic applique la remise, ouvre la page Pro
 * et le champ arrive déjà rempli. « Plus tard » referme sans insister —
 * comme partout, jamais une porte fermée.
 *
 * La carte porte la peau du Pro — couvercle blanc, contour d'or, typo qui
 * respire (ContourOr) : c'est la même signature que le badge, la carte du
 * comparatif et le bouton d'abonnement.
 */
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ContourOr, TexteOr } from './ContourOr';
import { useAccountStore } from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

export function SurprisePro() {
  const c = useTheme();
  const s = themed(c);
  const visible = useAccountStore((st) => st.surpriseVisible);
  const fermer = useAccountStore((st) => st.fermerSurprise);
  const profiter = useAccountStore((st) => st.profiterSurprise);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={fermer}>
      <View style={s.voile}>
        {/*
          UN SEUL CHIFFRE, EN HÉROS — relevé du patron, capture à l'appui :
          « trop de chiffres, les phrases sont cassées ». Trois prix dans
          une phrase coupée et un code dans le bouton : personne ne lit ça.
          Le popup dit UNE chose : −20 %, en grand, dans l'or de la maison.
          Les prix, c'est la page Pro qui les montre, ancien barré à
          l'appui ; le code s'applique tout seul, il n'a pas à s'annoncer.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="J’en profite"
          style={({ pressed }) => [s.prise, pressed && s.enfonce]}
          onPress={profiter}>
          <ContourOr rayon={24} fond="#FFFFFF">
            <View style={s.carte}>
              <Image
                source={require('../assets/pro/cadeau.png')}
                style={s.cadeau}
                resizeMode="contain"
              />
              <TexteOr texte="Surprise !" taille={22} fond="#FFFFFF" />
              <TexteOr texte="−20 %" taille={44} fond="#FFFFFF" />
              <Text style={s.corps}>
                sur votre abonnement Pro,{'\n'}pour votre première
                souscription.
              </Text>
              {/* L'affordance du geste : un bouton dessiné — mais c'est
                  toute la carte qui répond, on ne peut pas le rater. */}
              <View style={s.cta}>
                <Text style={s.ctaTexte}>J’en profite</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Plus tard"
                onPress={fermer}
                hitSlop={8}>
                <Text style={s.plusTard}>Plus tard</Text>
              </Pressable>
            </View>
          </ContourOr>
        </Pressable>
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
    prise: { alignSelf: 'stretch' },
    enfonce: { transform: [{ scale: 0.98 }] },
    carte: {
      padding: 24,
      alignItems: 'center',
      gap: 12,
    },
    cadeau: { width: 132, height: 132, marginBottom: -4 },
    corps: {
      color: c.inkSoft,
      fontSize: 14.5,
      lineHeight: 21,
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
    ctaTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    plusTard: { color: c.inkFaint, fontSize: 14, fontWeight: '600', padding: 6 },
  });
