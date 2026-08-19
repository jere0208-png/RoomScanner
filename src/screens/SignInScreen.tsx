/**
 * LA PORTE D'ENTRÉE — un compte avant le premier scan.
 *
 * Trois chemins, du plus court au plus long : Apple (natif, un geste),
 * Google (à câbler — le bouton le dit au lieu de mentir), e-mail (local,
 * prénom + adresse, zéro mot de passe : l'app n'a pas de serveur, un mot de
 * passe ne protégerait rien et en ferait perdre un).
 *
 * LE REFUS D'UN DEUXIÈME COMPTE S'EXPLIQUE. Le trousseau retient le compte
 * créé sur ce téléphone ; en créer un autre remettrait le palier gratuit à
 * zéro. Le message dit pourquoi, plutôt qu'un « erreur » sec.
 */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoMark } from '../components/LogoMark';
import { useAccountStore } from '../store/accountStore';
import { useTheme, type Palette } from '../theme';

export function SignInScreen() {
  const c = useTheme();
  const s = themed(c);
  const insets = useSafeAreaInsets();
  const connecter = useAccountStore((st) => st.connecter);
  const connecterApple = useAccountStore((st) => st.connecterApple);
  const [parEmail, setParEmail] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');

  const refuse = (raison?: string) =>
    Alert.alert('Connexion impossible', raison ?? 'Réessayez.');

  const viaApple = async () => {
    const r = await connecterApple();
    if (!r.ok) refuse(r.raison);
  };

  const viaGoogle = () => {
    // Pas de SDK Google configuré : on le dit, on ne simule pas.
    Alert.alert(
      'Bientôt disponible',
      'La connexion Google demande une configuration OAuth. ' +
        'Utilisez Apple ou l’e-mail en attendant.',
    );
  };

  const viaEmail = async () => {
    const adresse = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      refuse('L’adresse e-mail ne ressemble pas à une adresse.');
      return;
    }
    const r = await connecter({
      id: `email:${adresse}`,
      prenom: prenom.trim() || undefined,
      email: adresse,
      methode: 'email',
    });
    if (!r.ok) refuse(r.raison);
  };

  return (
    <KeyboardAvoidingView
      style={[s.fond, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.haut}>
        <LogoMark size={92} />
        <Text style={s.titre}>EchoPlan</Text>
        <Text style={s.sousTitre}>
          Scannez un logement, repartez avec le plan coté, la 3D et le dossier
          électrique.
        </Text>
      </View>

      <View style={s.boutons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continuer avec Apple"
          style={({ pressed }) => [s.btn, s.btnApple, pressed && s.enfonce]}
          onPress={viaApple}>
          <Text style={s.btnAppleTexte}> Continuer avec Apple</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continuer avec Google"
          style={({ pressed }) => [s.btn, s.btnClair, pressed && s.enfonce]}
          onPress={viaGoogle}>
          <Text style={s.btnClairTexte}>Continuer avec Google</Text>
        </Pressable>

        {!parEmail ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continuer avec un e-mail"
            style={({ pressed }) => [s.btn, s.btnClair, pressed && s.enfonce]}
            onPress={() => setParEmail(true)}>
            <Text style={s.btnClairTexte}>Continuer avec un e-mail</Text>
          </Pressable>
        ) : (
          <View style={s.formulaire}>
            <TextInput
              style={s.champ}
              placeholder="Prénom"
              placeholderTextColor={c.inkFaint}
              value={prenom}
              onChangeText={setPrenom}
              autoCapitalize="words"
            />
            <TextInput
              style={s.champ}
              placeholder="adresse@exemple.fr"
              placeholderTextColor={c.inkFaint}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Créer mon compte"
              style={({ pressed }) => [s.btn, s.btnBleu, pressed && s.enfonce]}
              onPress={viaEmail}>
              <Text style={s.btnBleuTexte}>Créer mon compte</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Text style={s.mentions}>
        Un seul compte par téléphone. Le plan gratuit permet un relevé ; le
        Pro les rend illimités.
      </Text>
    </KeyboardAvoidingView>
  );
}

const themed = (c: Palette) =>
  StyleSheet.create({
    fond: {
      flex: 1,
      backgroundColor: c.bg,
      paddingHorizontal: 28,
      justifyContent: 'space-between',
    },
    haut: { alignItems: 'center', marginTop: 36 },
    titre: { color: c.ink, fontSize: 30, fontWeight: '800', marginTop: 18 },
    sousTitre: {
      color: c.inkSoft,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 10,
      maxWidth: 300,
    },
    boutons: { gap: 12 },
    btn: {
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    enfonce: { transform: [{ scale: 0.97 }] },
    btnApple: { backgroundColor: '#0B0D12' },
    btnAppleTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    btnClair: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    btnClairTexte: { color: c.ink, fontSize: 16, fontWeight: '600' },
    btnBleu: { backgroundColor: c.blue },
    btnBleuTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    formulaire: { gap: 10 },
    champ: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      color: c.ink,
      paddingHorizontal: 14,
      fontSize: 15,
    },
    mentions: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 17,
      textAlign: 'center',
    },
  });
