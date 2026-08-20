/**
 * LE MENU DU COMPTE — blanc et bleu, à nous.
 *
 * C'était une Alert système : la feuille grise d'iOS, la même que dans
 * n'importe quelle app — relevé du patron : « trop basique ». C'est
 * maintenant une carte EchoPlan : l'avatar Solar en bleu, le nom, l'état
 * du palier en une ligne, et les gestes en boutons pleins. La CROIX
 * dessinée ferme en haut à droite (la leçon des caractères — jamais un
 * mot ni un « ✕ » au clavier), et le voile referme aussi : c'est le geste
 * que tout le monde essaie en premier.
 *
 * La confirmation de suppression, elle, RESTE une Alert système : pour un
 * geste destructif, la feuille austère du système est un avertissement en
 * soi — la déguiser en jolie carte l'affaiblirait.
 */
import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CloseCross } from './CloseCross';
import { SOLAIRES } from '../ui/solaires';
import { PLANS_GRATUITS, useAccountStore } from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

export function MenuCompte({
  visible,
  fermer,
}: {
  visible: boolean;
  fermer: () => void;
}) {
  const c = useTheme();
  const s = themed(c);
  const compte = useAccountStore((st) => st.compte);
  const pro = useAccountStore((st) => st.pro);
  const plansUtilises = useAccountStore((st) => st.plansUtilises);
  const bonusEssais = useAccountStore((st) => st.bonusEssais);
  const ouvrirPaywall = useAccountStore((st) => st.ouvrirPaywall);
  const deconnecter = useAccountStore((st) => st.deconnecter);
  const supprimerCompte = useAccountStore((st) => st.supprimerCompte);

  const restant = Math.max(0, PLANS_GRATUITS + bonusEssais - plansUtilises);

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
        {/* La carte avale le toucher : un appui DANS le menu ne doit pas
            le refermer par ricochet. */}
        <Pressable style={s.carte} onPress={() => {}}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={s.croix}
            hitSlop={8}
            onPress={fermer}>
            <CloseCross size={22} color={c.inkSoft} />
          </Pressable>
          <View style={s.rondAvatar}>
            <Svg width={34} height={34} viewBox="0 0 24 24">
              <Path d={SOLAIRES.avatar} fill="#FFFFFF" fillRule="evenodd" />
            </Svg>
          </View>
          <Text style={s.nom}>
            {compte?.prenom || compte?.email || 'Mon compte'}
          </Text>
          <Text style={s.etat}>
            {pro
              ? 'EchoPlan Pro · relevés illimités'
              : `Plan gratuit · ${restant} relevé${restant > 1 ? 's' : ''} restant${restant > 1 ? 's' : ''}`}
          </Text>
          {!pro && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Passer en Pro / code promo"
              style={({ pressed }) => [s.cta, pressed && s.enfonce]}
              onPress={() => {
                fermer();
                ouvrirPaywall();
              }}>
              <Text style={s.ctaTexte}>Passer en Pro / code promo</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter"
            style={({ pressed }) => [s.secondaire, pressed && s.enfonce]}
            onPress={() => {
              fermer();
              deconnecter();
            }}>
            <Text style={s.secondaireTexte}>Se déconnecter</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Supprimer mon compte"
            onPress={confirmerSuppression}
            hitSlop={6}>
            <Text style={s.danger}>Supprimer mon compte</Text>
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
      paddingTop: 26,
      alignItems: 'center',
      gap: 10,
    },
    croix: { position: 'absolute', top: 14, right: 14, zIndex: 1 },
    rondAvatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    nom: { color: c.ink, fontSize: 19, fontWeight: '800' },
    etat: { color: c.inkSoft, fontSize: 13.5, marginBottom: 8 },
    cta: {
      alignSelf: 'stretch',
      height: 50,
      borderRadius: 14,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    secondaire: {
      alignSelf: 'stretch',
      height: 50,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaireTexte: { color: c.ink, fontSize: 15, fontWeight: '700' },
    danger: { color: c.danger, fontSize: 14, fontWeight: '700', padding: 6 },
    enfonce: { transform: [{ scale: 0.97 }] },
  });
