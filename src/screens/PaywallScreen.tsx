/**
 * LA PAGE D'ABONNEMENT — une offre, son prix, ce qu'elle apporte.
 *
 * Elle a longtemps été un COMPARATIF : deux colonnes côte à côte, Gratuit
 * contre Pro, chacune avec son pouce d'argile. Le comparatif se défend
 * quand on hésite entre deux formules ; ici il n'y en a qu'une à vendre, et
 * la colonne « Gratuit » prenait la moitié de l'écran pour rappeler ce que
 * l'utilisateur a DÉJÀ — en tête de page, à l'endroit où l'on décide.
 *
 * Le patron a donné un design à suivre, et la page le suit : une barre
 * sobre, un titre qui nomme l'offre, le choix de la facturation, une carte
 * de prix qui énumère ce qu'on achète, et UN bouton, épinglé en bas, qui ne
 * quitte jamais l'écran.
 *
 * Ce qui ne bouge pas, parce que ça ne peut pas : le champ de code promo
 * (offres du patron — CARIDI12 déverrouille, FIRST20 remise) et
 * « Restaurer l'achat », qu'Apple exige dès qu'on vend un abonnement.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BackChevron } from '../components/BackChevron';
import { BadgePro } from '../components/BadgePro';
import { ContourOr, TexteOr } from '../components/ContourOr';
import { SOLAIRES } from '../ui/solaires';
import {
  MOIS_OFFERTS,
  PRIX_PRO,
  PRIX_PRO_AN,
  prixRemise,
  useAccountStore,
  type Offre,
} from '../store/accountStore';
import { radius, shadowCard, useTheme, type Palette } from '../theme';

/**
 * CE QU'ON ACHÈTE, ÉNUMÉRÉ.
 *
 * Un prix sans liste ne dit pas ce qu'on paie, et la moitié de ce que
 * l'application sait faire ne se devine pas depuis l'accueil : le tableau
 * existant, le DXF pour l'architecte, le télémètre au Bluetooth. Chaque
 * ligne nomme une chose qui se FAIT, jamais une qualité.
 */
const ATOUTS: { icone: keyof typeof SOLAIRES; mot: string }[] = [
  { icone: 'rooms', mot: 'Relevés illimités, autant de pièces qu’il faut' },
  { icone: 'partage', mot: 'Tous les exports : PDF coté, DXF, métré CSV' },
  { icone: 'save', mot: 'Plans gardés sous votre compte, à l’abri du téléphone' },
  { icone: 'elec', mot: 'Contrôle NF C 15-100, circuits et liste de matériel' },
  { icone: 'metre', mot: 'Relevé du tableau existant et diagnostic' },
  { icone: 'etoile', mot: 'Les nouveautés en premier' },
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
    LE MENSUEL D'ABORD.

    C'est l'engagement le plus court : personne ne prend un an d'une app
    qu'il découvre, et proposer l'annuel en premier ferait lire le prix le
    plus gros avant tout le reste.
  */
  const [offre, setOffre] = useState<Offre>('mensuel');

  const annuel = offre === 'annuel';
  const prixPlein = annuel ? PRIX_PRO_AN : PRIX_PRO;
  const prix = remisePct > 0 ? prixRemise(remisePct, offre) : prixPlein;

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
      await acheterPro(offre);
    } catch (e) {
      Alert.alert('Achat impossible', (e as Error).message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={fermer}>
      <View style={[s.fond, { paddingTop: insets.top }]}>
        <View style={s.barre}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={s.rondBarre}
            hitSlop={10}
            onPress={fermer}>
            <BackChevron color={c.ink} />
          </Pressable>
          <Text style={s.titreBarre}>Abonnement</Text>
          {/* Le vide à droite garde le titre au centre : sans lui, il se
              décale de la largeur du bouton de retour. */}
          <View style={s.rondBarre} />
        </View>

        <ScrollView
          contentContainerStyle={s.contenu}
          showsVerticalScrollIndicator={false}>
          {/*
            LE TITRE NOMME L'OFFRE, ET LA MARQUE SE DÉTACHE.

            « Passer en » à l'encre, « EchoPlan Pro » à la typo d'or : c'est
            la signature du Pro dans toute l'application — le badge, la
            carte, le bouton — et elle fait ici ce qu'un aplat de couleur
            ferait ailleurs, dire d'un coup d'œil ce qu'on achète.
          */}
          <Text style={s.titre}>Passer en</Text>
          <TexteOr texte="EchoPlan Pro" taille={30} fond={c.bg} style={s.titreOr} />
          <Text style={s.sousTitre}>
            Relevez, contrôlez et exportez sans compter. Un seul abonnement,
            résiliable à tout moment.
          </Text>

          {/*
            LE CHOIX DE LA FACTURATION, EN DEUX ONGLETS.

            Les deux prix ne se comparent pas dans la tête : 4,90 par mois
            contre 49 l'an demande une multiplication. L'onglet annuel écrit
            donc ce qu'il fait gagner, en mois offerts — c'est la seule
            façon de le rendre lisible sans calculette.
          */}
          <View style={s.segment}>
            {(['mensuel', 'annuel'] as Offre[]).map((o) => {
              const actif = offre === o;
              return (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  accessibilityLabel={
                    o === 'mensuel' ? 'Facturation mensuelle' : 'Facturation annuelle'
                  }
                  accessibilityState={{ selected: actif }}
                  style={[s.onglet, actif && s.ongletActif]}
                  onPress={() => setOffre(o)}>
                  <Text style={[s.ongletMot, actif && s.ongletMotActif]}>
                    {o === 'mensuel' ? 'Mensuel' : 'Annuel'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* La carte qu'on vend porte le contour d'or : la peau du badge,
              celle du bouton, celle de la marque. Le badge flotte AU-DESSUS
              de son bord — il vit hors du rognage du contour, sinon sa
              moitié haute serait coupée. */}
          <View style={s.carteZone}>
          <ContourOr rayon={22} fond={c.surface} style={s.carte}>
            <View style={s.carteDedans}>
              <View style={s.prixRangee}>
                <TexteOr texte={prix} taille={34} fond={c.surface} />
                <Text style={s.parQuoi}>{annuel ? '/an' : '/mois'}</Text>
                {/* L'ancien prix reste visible, barré : une remise sans
                    référence n'est qu'un prix comme un autre. */}
                {remisePct > 0 && <Text style={s.prixBarre}>{prixPlein}</Text>}
              </View>
              <Text style={s.prixNote}>
                {annuel
                  ? `Soit ${MOIS_OFFERTS} mois offerts par rapport au mensuel.`
                  : 'Sans engagement : vous arrêtez quand vous voulez.'}
              </Text>

              <View style={s.separateur}>
                <View style={s.filet} />
                <Text style={s.separateurMot}>Ce que ça débloque</Text>
                <View style={s.filet} />
              </View>

              {ATOUTS.map((a) => (
                <View key={a.mot} testID="ligne-atout" style={s.atout}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path d={SOLAIRES[a.icone]} fill={c.blue} fillRule="evenodd" />
                  </Svg>
                  <Text style={s.atoutMot}>{a.mot}</Text>
                </View>
              ))}
            </View>
          </ContourOr>
            <BadgePro style={s.badge} />
          </View>

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
              accessibilityLabel="Code promo"
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

        {/*
          LE BOUTON NE QUITTE JAMAIS L'ÉCRAN.

          Il vivait au fil du texte, entre les cartes et le code promo :
          quiconque faisait défiler pour lire ce qu'il achetait devait
          remonter pour l'acheter. Épinglé en pied de page, il est là au
          moment où la décision se prend, quel que soit l'endroit où l'on
          en est de la lecture.
        */}
        <View style={[s.pied, { paddingBottom: insets.bottom + 14 }]}>
          {remisePct > 0 && (
            <Text style={s.remiseNote}>✓ Remise de bienvenue appliquée</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="S’abonner"
            style={({ pressed }) => [s.ctaCadre, pressed && s.enfonce]}
            onPress={acheter}>
            <ContourOr rayon={18} fond={c.surface} style={s.pleine}>
              <View style={s.ctaDedans}>
                {/* Une PHRASE, pas une formule — relevé du patron : « trop
                    de chiffres et de tirets ». Un seul nombre, zéro tiret. */}
                <TexteOr
                  texte={`S’abonner pour ${prix} par ${annuel ? 'an' : 'mois'}`}
                  taille={16.5}
                  fond={c.surface}
                />
              </View>
            </ContourOr>
          </Pressable>
        </View>
      </View>
    </Modal>
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
      marginBottom: 6,
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
    contenu: { paddingHorizontal: 22, paddingBottom: 18 },
    // Le titre est en deux morceaux : l'encre annonce, l'or nomme.
    titre: { color: c.ink, fontSize: 30, fontWeight: '800', marginTop: 10 },
    titreOr: { alignSelf: 'flex-start', marginTop: 2 },
    sousTitre: { color: c.inkSoft, fontSize: 14.5, lineHeight: 20, marginTop: 10 },
    // Le segment : une gouttière claire, la pastille blanche glisse dedans.
    segment: {
      flexDirection: 'row',
      alignSelf: 'center',
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.pill,
      padding: 4,
      marginTop: 20,
      marginBottom: 18,
    },
    onglet: {
      paddingHorizontal: 26,
      paddingVertical: 9,
      borderRadius: radius.pill,
    },
    ongletActif: {
      backgroundColor: c.surface,
      ...shadowCard,
      shadowOpacity: 0.09,
    },
    ongletMot: { color: c.inkSoft, fontSize: 14.5, fontWeight: '700' },
    ongletMotActif: { color: c.ink },
    carteZone: { alignSelf: 'stretch' },
    carte: { alignSelf: 'stretch' },
    // La place du badge sur la carte ; sa peau (blanc, or animé) est a lui.
    badge: { position: 'absolute', top: -11, right: 16 },
    carteDedans: { padding: 20, gap: 4 },
    prixRangee: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    // Cale « /mois » sur la ligne de pied du prix, à un cheveu près.
    parQuoi: { color: c.inkSoft, fontSize: 15, fontWeight: '700', marginBottom: 5 },
    prixBarre: {
      color: c.inkFaint,
      fontSize: 15,
      fontWeight: '600',
      textDecorationLine: 'line-through',
      marginBottom: 6,
    },
    prixNote: { color: c.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 2 },
    separateur: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginVertical: 14,
    },
    filet: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
    separateurMot: { color: c.inkFaint, fontSize: 12, fontWeight: '700' },
    atout: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
    atoutMot: { flex: 1, color: c.ink, fontSize: 13.5, lineHeight: 19 },
    restaurer: {
      color: c.blue,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 18,
    },
    promo: { flexDirection: 'row', gap: 10, marginTop: 16 },
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
    // Le pied se pose SUR le fond, pas dans le défilement : il porte donc
    // sa propre surface, sinon le texte qui glisse dessous se lirait au
    // travers.
    pied: {
      paddingHorizontal: 22,
      paddingTop: 12,
      backgroundColor: c.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
    },
    remiseNote: {
      color: '#C8861F',
      fontSize: 12.5,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
    },
    ctaCadre: { height: 56 },
    pleine: { flex: 1 },
    ctaDedans: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    enfonce: { transform: [{ scale: 0.97 }] },
  });
