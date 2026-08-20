/**
 * LA PAGE PRO — deux colonnes, un prix, un code.
 *
 * Le comparatif se lit en une passe : ce que le gratuit donne (UN relevé
 * complet, avec tout — plan coté, 3D, dossier PDF ; brider la qualité du
 * premier plan ferait fuir avant d'avoir convaincu), et ce que le Pro
 * ajoute : les relevés ILLIMITÉS. 4,90 € par mois, sans engagement.
 *
 * Le champ « code promo » déverrouille localement (offres du patron —
 * CARIDI12). L'achat réel passe par StoreKit : tant que le produit n'existe
 * pas dans App Store Connect, le bouton explique au lieu d'échouer en
 * silence.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgePro } from '../components/BadgePro';
import { ContourOr, TexteOr, TRAIT } from '../components/ContourOr';
import {
  CODE_BIENVENUE,
  PRIX_PRO,
  prixRemise,
  useAccountStore,
} from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

const GRATUIT = [
  '1 relevé complet',
  'Plan 2D coté et 3D',
  'Dossier PDF et exports',
];
const PRO = [
  'Relevés illimités',
  'Tous les exports, sans limite',
  'Les nouveautés en premier',
];

export function PaywallScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const visible = useAccountStore((st) => st.paywallVisible);
  const fermer = useAccountStore((st) => st.fermerPaywall);
  const utiliserCode = useAccountStore((st) => st.utiliserCode);
  const acheterPro = useAccountStore((st) => st.acheterPro);
  const restaurerPro = useAccountStore((st) => st.restaurerPro);
  const remisePct = useAccountStore((st) => st.remisePct);
  const codeOffert = useAccountStore((st) => st.codeOffert);
  const [code, setCode] = useState('');

  /*
    LE CODE OFFERT ARRIVE DÉJÀ ÉCRIT. La surprise applique FIRST20 toute
    seule ; le champ le MONTRE, pour que la remise ait une explication
    visible — un prix qui baisse sans raison ressemble à une erreur.
  */
  useEffect(() => {
    if (visible && codeOffert) setCode(codeOffert);
  }, [visible, codeOffert]);

  const valideCode = () => {
    if (utiliserCode(code)) {
      Alert.alert('Bienvenue en Pro', 'Le code a été appliqué : tout est débloqué.');
    } else {
      Alert.alert('Code inconnu', 'Vérifiez le code — il ne correspond à aucune offre.');
    }
  };

  const acheter = async () => {
    try {
      await acheterPro();
    } catch (e) {
      Alert.alert('Achat impossible', (e as Error).message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={fermer}>
      <ScrollView
        style={s.fond}
        contentContainerStyle={[
          s.contenu,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          style={s.fermer}
          onPress={fermer}>
          <Text style={s.fermerTexte}>✕</Text>
        </Pressable>

        <Text style={s.titre}>Passez en Pro</Text>
        <Text style={s.sousTitre}>
          Le plan gratuit couvre un relevé — le Pro les rend illimités.
        </Text>

        <View style={s.colonnes}>
          <View style={[s.carte, s.carteGratuit]}>
            {/* Les pouces d'argile disent le verdict d'un coup d'œil —
                relevé du patron : en bas pour le gratuit, en l'air pour
                le Pro. */}
            <Image
              testID="pouce-gratuit"
              source={require('../assets/pro/pouce-bas.png')}
              style={s.pouce}
              resizeMode="contain"
            />
            <Text style={s.carteTitre}>Gratuit</Text>
            <Text style={s.cartePrix}>0 €</Text>
            {GRATUIT.map((l) => (
              <Text key={l} style={s.ligne}>
                ✓ {l}
              </Text>
            ))}
          </View>
          <View style={s.colonnePro}>
            {/* La carte qu'on vend a la peau EXACTE du badge : couvercle
                blanc, contour d'or, et les mots qui vendent — « Pro », le
                prix — troués sur la même bande qui glisse (ContourOr). Les
                bénéfices restent à l'encre : on les LIT, on ne les admire
                pas. */}
            <ContourOr rayon={20} fond={c.surface} style={s.pleine}>
              <View style={s.carteDedans}>
                <Image
                  testID="pouce-pro"
                  source={require('../assets/pro/pouce-haut.png')}
                  style={s.pouce}
                  resizeMode="contain"
                />
                <TexteOr
                  texte="Pro"
                  taille={14}
                  graisse="700"
                  fond={c.surface}
                  style={s.aGauche}
                />
                <View style={s.prixRangee}>
                  <TexteOr
                    texte={remisePct > 0 ? prixRemise(remisePct) : PRIX_PRO}
                    taille={26}
                    fond={c.surface}
                  />
                  {/* L'ancien prix reste visible, barré : une remise sans
                      référence n'est qu'un prix comme un autre. */}
                  {remisePct > 0 && (
                    <Text style={s.prixBarre}>{PRIX_PRO}</Text>
                  )}
                  <TexteOr
                    texte="/ mois"
                    taille={13}
                    graisse="600"
                    fond={c.surface}
                    style={s.parMoisCale}
                  />
                </View>
                {PRO.map((l) => (
                  <Text key={l} style={s.ligne}>
                    ✓ {l}
                  </Text>
                ))}
              </View>
            </ContourOr>
            {/* Le badge flotte AU-DESSUS du bord de la carte : il vit hors
                du rognage du contour, sinon sa moitié haute serait coupée. */}
            <BadgePro style={s.badge} />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="S’abonner"
          style={({ pressed }) => [s.ctaCadre, pressed && s.enfonce]}
          onPress={acheter}>
          {/* Le geste qu'on vend a la peau du badge : blanc, contour d'or,
              et le mot lui-même respire — c'est la signature du Pro. */}
          <ContourOr rayon={16} fond={c.surface} style={s.pleine}>
            <View style={s.ctaDedans}>
              <TexteOr
                texte={`S’abonner — ${
                  remisePct > 0 ? prixRemise(remisePct) : PRIX_PRO
                } / mois`}
                taille={16.5}
                fond={c.surface}
              />
            </View>
          </ContourOr>
        </Pressable>
        {remisePct > 0 && (
          <Text style={s.remiseNote}>
            Code {CODE_BIENVENUE} appliqué — −{remisePct} % sur votre
            abonnement.
          </Text>
        )}
        <Text style={s.sansEngagement}>Sans engagement, résiliable à tout moment.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restaurer l’achat"
          onPress={async () => {
            try {
              const ok = await restaurerPro();
              Alert.alert(
                ok ? 'Abonnement restauré' : 'Aucun achat trouvé',
                ok
                  ? 'Votre Pro est de retour.'
                  : 'L’App Store ne connaît pas d’abonnement pour ce compte Apple.',
              );
            } catch (e) {
              Alert.alert('Restauration impossible', (e as Error).message);
            }
          }}>
          <Text style={s.restaurer}>Restaurer l’achat</Text>
        </Pressable>

        <View style={s.promo}>
          <TextInput
            style={s.champ}
            placeholder="Code promo"
            placeholderTextColor={c.inkFaint}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Appliquer le code"
            style={({ pressed }) => [s.btnCode, pressed && s.enfonce]}
            onPress={valideCode}>
            <Text style={s.btnCodeTexte}>Appliquer</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    contenu: { paddingHorizontal: 22 },
    fermer: {
      alignSelf: 'flex-end',
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fermerTexte: { color: c.inkSoft, fontSize: 16, fontWeight: '700' },
    titre: { color: c.ink, fontSize: 28, fontWeight: '800', marginTop: 6 },
    sousTitre: { color: c.inkSoft, fontSize: 15, marginTop: 6, lineHeight: 21 },
    // La refonte moderne : plus d'air (gap 14, rayon 20), un filet d'un
    // cheveu sur la carte Gratuit — le contour des cartes de l'app — et
    // les pouces d'argile en tête de colonne.
    colonnes: { flexDirection: 'row', gap: 14, marginTop: 24 },
    carte: { flex: 1, borderRadius: 20, padding: 18, gap: 7 },
    carteGratuit: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.lineStrong,
      // Le Pro commence sous son contour d'or (le trait) : le Gratuit
      // descend d'autant, et les deux pouces s'alignent — relevé du patron.
      paddingTop: 18 + TRAIT,
    },
    pouce: { width: 56, height: 56, alignSelf: 'center', marginBottom: 2 },
    prixBarre: {
      color: c.inkFaint,
      fontSize: 14,
      fontWeight: '600',
      textDecorationLine: 'line-through',
      marginBottom: 5,
    },
    remiseNote: {
      color: '#C8861F',
      fontSize: 12.5,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 8,
    },
    // La colonne Pro : le contour rogne sa carte, le badge flotte dessus.
    colonnePro: { flex: 1 },
    pleine: { flex: 1 },
    carteDedans: { flex: 1, padding: 18, gap: 7 },
    // La typo d'or épouse la largeur de son mot : sans ça, elle prendrait
    // toute la colonne et le mot partirait au centre.
    aGauche: { alignSelf: 'flex-start' },
    prixRangee: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      marginBottom: 4,
    },
    // Cale « / mois » sur la ligne de pied du prix, à un cheveu près.
    parMoisCale: { marginBottom: 3 },
    // La place du badge sur la carte ; sa peau (blanc, or animé) est à lui.
    badge: { position: 'absolute', top: -10, right: 12 },
    carteTitre: { fontSize: 14, fontWeight: '700', color: c.inkSoft },
    cartePrix: { fontSize: 26, fontWeight: '800', color: c.ink, marginBottom: 4 },
    ligne: { color: c.ink, fontSize: 13.5, lineHeight: 19 },
    ctaCadre: { marginTop: 24, height: 54 },
    ctaDedans: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    enfonce: { transform: [{ scale: 0.97 }] },
    sansEngagement: {
      color: c.inkFaint,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 8,
    },
    restaurer: {
      color: c.blue,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 14,
    },
    promo: { flexDirection: 'row', gap: 10, marginTop: 26 },
    champ: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      color: c.ink,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    btnCode: {
      height: 48,
      borderRadius: 12,
      paddingHorizontal: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnCodeTexte: { color: c.ink, fontSize: 15, fontWeight: '700' },
  });
