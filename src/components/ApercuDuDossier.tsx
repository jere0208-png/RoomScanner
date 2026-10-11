/**
 * L'APERÇU DU DOSSIER — les vraies feuilles du PDF, avant de l'envoyer.
 *
 * Relevé du patron : « lors de l'export PDF, si l'utilisateur n'a pas
 * d'abonnement, donne-lui la possibilité de voir son PDF flouté, mais assez
 * pour voir que c'est son plan, avec de gros filigranes EchoPlan. C'est une
 * technique de confiance, et son PDF doit donner l'envie d'acheter pour
 * déflouter et télécharger. »
 *
 * — CE SONT LES FEUILLES DU DOCUMENT, pas une maquette : le PDF bâti pendant
 *   qu'on compose, rendu page par page par le natif (`apercuPdf`). Ce qu'on
 *   voit ici est ce qui partira.
 * — SANS ABONNEMENT, ELLES SONT FLOUTÉES ET FILIGRANÉES — gravé dans l'image :
 *   on reconnaît son logement, on ne lit pas une cote. Un bouton les
 *   défloute : c'est l'offre, au moment où elle a un sens.
 * — ABONNÉ, ELLES SONT NETTES, et le jour où l'abonnement arrive, elles se
 *   défloutent sous les yeux.
 * — SANS LE NATIF (banc d'essai, Android), le sommaire tient lieu d'aperçu :
 *   une carte par feuille, son numéro et son nom.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { FeuilleDuDossier } from '../export/pdf';
import { radius, shadowCard, useTheme, type Palette } from '../theme';
import { SOLAIRES } from '../ui/solaires';
import { haptic } from '../ui/haptic';

/** Les feuilles du dossier sont des A4 couchés. */
export const FORMAT_FEUILLE = 842 / 595;

const CADENAS =
  'M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z';

/** L'icône d'une feuille, selon ce qu'elle montre. */
const ICONE: Record<FeuilleDuDossier['genre'], string> = {
  garde: SOLAIRES.maison,
  plan: SOLAIRES.cotes2d,
  metre: SOLAIRES.metre,
  achats: SOLAIRES.panier,
  existant: SOLAIRES.elec,
  gaines: SOLAIRES.gaines,
  perspective: SOLAIRES.vues3d,
  elevation: SOLAIRES.elevations,
  unifilaire: SOLAIRES.schema,
  multifilaire: SOLAIRES.schema,
};

/** Le compte des feuilles, dit comme on le dirait : « 1 plan, 4 murs… ». */
export function resumeDuDossier(sommaire: FeuilleDuDossier[]): string {
  const n = (g: FeuilleDuDossier['genre']) => sommaire.filter((f) => f.genre === g).length;
  const bouts: string[] = [];
  const dire = (k: number, un: string, plusieurs: string) => {
    if (k > 0) bouts.push(`${k} ${k > 1 ? plusieurs : un}`);
  };
  dire(n('garde'), 'page de garde', 'pages de garde');
  dire(n('plan'), 'plan', 'plans');
  // Un métré sur deux feuilles reste UN métré.
  dire(Math.min(1, n('metre')), 'métré', 'métrés');
  dire(n('achats'), 'liste d’achats', 'listes d’achats');
  dire(n('perspective'), 'vue 3D', 'vues 3D');
  dire(n('elevation'), 'mur de face', 'murs de face');
  dire(n('gaines'), 'plan des gaines', 'plans des gaines');
  dire(n('unifilaire') + n('multifilaire'), 'schéma', 'schémas');
  dire(n('existant'), 'tableau existant', 'tableaux existants');
  return bouts.join(' · ');
}

export function ApercuDuDossier({
  sommaire,
  images,
  enCours,
  net,
  onDeflouter,
}: {
  sommaire: FeuilleDuDossier[];
  /** Les feuilles rendues, dans l'ordre ; `null` tant qu'elles ne le sont pas. */
  images: string[] | null;
  /** Le dossier se rebâtit : les cartes respirent en attendant. */
  enCours: boolean;
  /** Abonné : les feuilles sont nettes, sans filigrane. */
  net: boolean;
  onDeflouter: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const total = sommaire.length;

  /* LE COMPTE BAT QUAND IL CHANGE : on voit ce qu'une option ajoute. */
  const pulse = useRef(new Animated.Value(1)).current;
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    pulse.setValue(0.86);
    Animated.timing(pulse, { toValue: 1, duration: 300, easing: Easing.out(Easing.back(2.4)), useNativeDriver: true }).start();
  }, [total, pulse]);

  /* L'attente respire : les cartes vides battent doucement. */
  const souffle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enCours) return;
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(souffle, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(souffle, { toValue: 0, duration: 650, useNativeDriver: true }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [enCours, souffle]);

  /* LE JOUR OÙ L'ABONNEMENT ARRIVE, LE DOSSIER SE DÉFLOUTE — et ça se sent. */
  const etaitNet = useRef(net);
  useEffect(() => {
    if (net && !etaitNet.current) haptic('succes');
    etaitNet.current = net;
  }, [net]);

  return (
    <View style={s.bloc} testID="apercu-du-dossier">
      <View style={s.tete}>
        <View style={s.teteTexte}>
          <Text style={s.titre}>Votre dossier</Text>
          <Text style={s.resume} numberOfLines={2}>
            {resumeDuDossier(sommaire)}
          </Text>
        </View>
        <Animated.View style={[s.compte, { transform: [{ scale: pulse }] }]}>
          <Text style={s.compteChiffre}>{total}</Text>
          <Text style={s.compteMot}>feuille{total > 1 ? 's' : ''}</Text>
        </Animated.View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rangee}>
        {sommaire.map((f, i) => {
          const im = images?.[i];
          return (
            <Pressable
              key={`${i}-${f.titre}`}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Feuille ${i + 1} : ${f.titre}${net ? '' : ', aperçu flouté'}`}
              onPress={() => {
                setOuverte(i);
                haptic('leger');
              }}
              style={s.carte}>
              <View style={s.feuille}>
                {im ? (
                  <PageImage base64={im} style={s.image} />
                ) : (
                  <Animated.View style={[s.attente, { opacity: souffle.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}>
                    <Svg width={30} height={30} viewBox="0 0 24 24">
                      <Path d={ICONE[f.genre]} fill={c.inkFaint} fillRule="evenodd" />
                    </Svg>
                  </Animated.View>
                )}
                {!net && (
                  <View style={s.verrou}>
                    <Svg width={10} height={10} viewBox="0 0 24 24">
                      <Path d={CADENAS} fill="#FFFFFF" />
                    </Svg>
                  </View>
                )}
              </View>
              <Text style={s.legende} numberOfLines={1}>
                {i + 1} · {f.titre}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!net && (
        <Pressable accessibilityRole="button" accessibilityLabel="Déflouter le dossier" onPress={onDeflouter} style={s.offre}>
          <Svg width={16} height={16} viewBox="0 0 24 24">
            <Path d={CADENAS} fill={c.blue} />
          </Svg>
          <Text style={s.offreTexte}>
            Aperçu flouté : votre plan est là, prêt. Passez Pro pour le déflouter et le télécharger.
          </Text>
        </Pressable>
      )}

      <Visionneuse
        sommaire={sommaire}
        images={images}
        depart={ouverte}
        net={net}
        onClose={() => setOuverte(null)}
        onDeflouter={() => {
          setOuverte(null);
          onDeflouter();
        }}
      />
    </View>
  );
}

/** Une feuille rendue : elle apparaît en fondu — celle qui se défloute aussi. */
function PageImage({ base64, style }: { base64: string; style: object }) {
  const fondu = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fondu.setValue(0.35);
    Animated.timing(fondu, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [base64, fondu]);
  return (
    <Animated.Image
      source={{ uri: `data:image/jpeg;base64,${base64}` }}
      resizeMode="contain"
      style={[style, { opacity: fondu }]}
    />
  );
}

/** Les feuilles en grand, l'une après l'autre, du doigt. */
function Visionneuse({
  sommaire,
  images,
  depart,
  net,
  onClose,
  onDeflouter,
}: {
  sommaire: FeuilleDuDossier[];
  images: string[] | null;
  depart: number | null;
  net: boolean;
  onClose: () => void;
  onDeflouter: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const { width, height } = useWindowDimensions();
  const [ici, setIci] = useState(0);
  const defile = useRef<ScrollView | null>(null);
  useEffect(() => {
    if (depart === null) return;
    setIci(depart);
    // La feuille touchée d'abord : on y est déjà en ouvrant.
    const t = setTimeout(() => defile.current?.scrollTo({ x: depart * width, animated: false }), 0);
    return () => clearTimeout(t);
  }, [depart, width]);
  const larg = width - 24;
  const haut = Math.min(larg / FORMAT_FEUILLE, height * 0.62);
  return (
    <Modal visible={depart !== null} animationType="fade" onRequestClose={onClose} transparent>
      <View style={s.voile}>
        <View style={s.voileTete}>
          <Text style={s.voileTitre} numberOfLines={1}>
            {ici + 1} / {sommaire.length} · {sommaire[ici]?.titre ?? ''}
          </Text>
          <TouchableOpacity accessibilityLabel="Fermer l’aperçu" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={onClose}>
            <Text style={s.voileCroix}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          ref={defile}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIci(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}>
          {sommaire.map((f, i) => (
            <View key={`${i}-${f.titre}`} style={[s.page, { width }]}>
              {images?.[i] ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${images[i]}` }}
                  resizeMode="contain"
                  style={{ width: larg, height: haut, borderRadius: 6 }}
                  accessibilityLabel={`Feuille ${i + 1} : ${f.titre}`}
                />
              ) : (
                <View style={[s.pageVide, { width: larg, height: haut }]}>
                  <Text style={s.pageVideTexte}>{f.titre}</Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        {!net && (
          <View style={s.voilePied}>
            <Text style={s.voileArgument}>
              C’est bien votre plan. Sans flou ni filigrane, il est prêt à partir.
            </Text>
            <TouchableOpacity accessibilityLabel="Déflouter et télécharger" style={s.voileBouton} onPress={onDeflouter}>
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path d={CADENAS} fill="#FFFFFF" />
              </Svg>
              <Text style={s.voileBoutonTexte}>Déflouter et télécharger</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const CARTE = 196;

const getStyles = (c: Palette) =>
  StyleSheet.create({
    bloc: { gap: 10 },
    tete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    teteTexte: { flex: 1 },
    titre: { color: c.ink, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },
    resume: { color: c.inkFaint, fontSize: 13, marginTop: 2, lineHeight: 18 },
    compte: {
      minWidth: 62,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.md,
      backgroundColor: c.blue,
      alignItems: 'center',
    },
    compteChiffre: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', lineHeight: 22 },
    compteMot: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '600' },
    rangee: { gap: 12, paddingVertical: 4, paddingRight: 8 },
    carte: { width: CARTE },
    feuille: {
      width: CARTE,
      height: CARTE / FORMAT_FEUILLE,
      borderRadius: 10,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.line,
      ...shadowCard,
      shadowOpacity: 0.08,
    },
    image: { width: '100%', height: '100%' },
    attente: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSunken },
    verrou: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    legende: { color: c.inkSoft, fontSize: 12.5, fontWeight: '600', marginTop: 6 },
    offre: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.blueSoft,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    offreTexte: { color: c.ink, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: '600' },
    voile: { flex: 1, backgroundColor: 'rgba(11,13,18,0.94)', paddingTop: 58, paddingBottom: 34 },
    voileTete: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginBottom: 14 },
    voileTitre: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1 },
    voileCroix: { color: '#FFFFFF', fontSize: 19, fontWeight: '700' },
    page: { alignItems: 'center', justifyContent: 'center' },
    pageVide: { backgroundColor: '#FFFFFF', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
    pageVideTexte: { color: '#5B6170', fontSize: 15, fontWeight: '600' },
    voilePied: { paddingHorizontal: 18, gap: 12 },
    voileArgument: { color: 'rgba(255,255,255,0.86)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
    voileBouton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingVertical: 15,
    },
    voileBoutonTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
