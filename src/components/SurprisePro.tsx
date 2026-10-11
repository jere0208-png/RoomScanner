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
 * respire (ContourVif) : c'est la même signature que le badge, la carte du
 * comparatif et le bouton d'abonnement.
 */
import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ContourVif, TexteVif } from './ContourVif';
import { offreDeBienvenue, useAccountStore } from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

export function SurprisePro() {
  const c = useTheme();
  const s = themed(c);
  const visible = useAccountStore((st) => st.surpriseVisible);
  const fermer = useAccountStore((st) => st.fermerSurprise);
  const profiter = useAccountStore((st) => st.profiterSurprise);
  /*
    L'OFFRE EST CELLE D'APPLE, et le popup la dit telle quelle — « −20 % »,
    « 1 mois offert » —, lue à l'App Store. Il ne s'ouvre d'ailleurs que si
    elle existe et s'applique (voir `ouvrirSurprise`) : plus de remise
    promise que l'App Store ne ferait pas.
  */
  const offres = useAccountStore((st) => st.offres);
  const bienvenue = offreDeBienvenue(offres);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={fermer}>
      <View style={s.voile}>
        {/* Toucher à côté referme : un popup qu'on ne peut quitter qu'en
            visant un petit mot gris retient, il ne propose plus. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Fermer"
          onPress={fermer}
        />
        {/*
          UN SEUL CHIFFRE, EN HÉROS — relevé du patron, capture à l'appui :
          « trop de chiffres, les phrases sont cassées ». Trois prix dans
          une phrase coupée et un code dans le bouton : personne ne lit ça.
          Le popup dit UNE chose : −20 %, en grand, dans l'or de la maison.
          Les prix, c'est la page Pro qui les montre, ancien barré à
          l'appui ; le code s'applique tout seul, il n'a pas à s'annoncer.
        */}
        {/*
          UNE SEULE ZONE D'ACHAT : LE BOUTON — revues « Thomas » et
          « Nadia ». Toute la carte, image comprise, menait à l'achat : un
          appui pour la fermer ou pour lire ouvrait la caisse. La carte se
          lit ; le bouton achète ; « Non merci » est un vrai bouton.
        */}
        <View style={s.prise}>
          <ContourVif rayon={24} fond="#FFFFFF">
            <View style={s.carte}>
              <Image
                source={require('../assets/pro/cadeau.png')}
                style={s.cadeau}
                resizeMode="contain"
              />
              <TexteVif texte="Surprise !" taille={22} fond="#FFFFFF" />
              <TexteVif texte={bienvenue?.accroche ?? 'Pro'} taille={44} fond="#FFFFFF" />
              <Text style={s.corps}>{bienvenue?.phrase ?? ''}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="J’en profite"
                style={({ pressed }) => [s.cta, pressed && s.enfonce]}
                onPress={profiter}>
                <Text style={s.ctaTexte}>J’en profite</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Non merci"
                style={({ pressed }) => [s.nonMerci, pressed && s.enfonce]}
                onPress={fermer}>
                <Text style={s.nonMerciTexte}>Non merci</Text>
              </Pressable>
            </View>
          </ContourVif>
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
    nonMerci: {
      alignSelf: 'stretch',
      height: 46,
      borderRadius: 15,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nonMerciTexte: { color: c.ink, fontSize: 15, fontWeight: '700' },
  });
