/**
 * LES NOTIFICATIONS — la boîte de réception de l'application.
 *
 * Relevé du patron : « un bouton de notifications où l'on pourra suivre les
 * avancées des mises à jour ; un vrai système comme les autres apps qui ont
 * celui-ci — une sorte de mail intra app. Cohérence de modernité,
 * possibilité de suppression de la notif, pastille avec nombre de notifs non
 * lues ».
 *
 * La forme est celle qu'on connaît par cœur, parce que c'est celle de Mail
 * et des applications bancaires : une liste rangée par jour, le point bleu
 * de ce qu'on n'a pas lu, le titre en gras tant qu'il est neuf, un glissé
 * vers la gauche pour supprimer — et « Annuler » juste après, parce qu'un
 * glissé se fait aussi par erreur. Un appui ouvre le message en entier, avec
 * son bouton s'il en porte un.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Linking,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { Bouton } from '../components/Bouton';
import { dark, ombreBouton, radius, themedStyles, useTheme, type Palette } from '../theme';
import { useScanStore } from '../store/scanStore';
import { useAccountStore } from '../store/accountStore';
import { messagesVisibles, useNotifications } from '../store/notifications';
import type { GenreMessage, Message } from '../net/messages';
import { SOLAIRES } from '../ui/solaires';
import { haptic } from '../ui/haptic';

/** La cloche — dessinée ici, le jeu commun n'en a pas. */
export const CLOCHE =
  'M12 2.25a6.25 6.25 0 0 0-6.25 6.25v3.04c0 .63-.17 1.25-.5 1.79l-1.06 1.76A1.75 1.75 0 0 0 5.69 17.75h12.62a1.75 1.75 0 0 0 1.5-2.66l-1.06-1.76c-.33-.54-.5-1.16-.5-1.79V8.5A6.25 6.25 0 0 0 12 2.25Z M9 19.25a3 3 0 0 0 6 0Z';

/** Ce que dit chaque genre : son mot, son pictogramme, ses deux teintes. */
export function apparenceDuGenre(g: GenreMessage, c: Palette) {
  switch (g) {
    case 'nouveaute':
      return { mot: 'Nouveauté', icone: SOLAIRES.baguette, encre: c.blue, fond: c.blueSoft };
    case 'astuce':
      return c === dark
        ? { mot: 'Astuce', icone: SOLAIRES.etoile, encre: '#EFB45A', fond: '#3A2F1A' }
        : { mot: 'Astuce', icone: SOLAIRES.etoile, encre: '#B7791F', fond: '#FFF4DE' };
    case 'offre':
      return c === dark
        ? { mot: 'Offre', icone: SOLAIRES.etoile, encre: '#E2C17A', fond: '#3A311C' }
        : { mot: 'Offre', icone: SOLAIRES.etoile, encre: '#9A6B12', fond: '#F8EBCB' };
    default:
      return { mot: 'Information', icone: SOLAIRES.note, encre: c.inkSoft, fond: c.surfaceSunken };
  }
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2 h », « hier », « 3 j », puis la date — l'heure courte de la liste. */
export function heureCourte(date: number, maintenant = Date.now()): string {
  const min = Math.max(0, Math.floor((maintenant - date) / 60000));
  if (min < 1) return 'maintenant';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 7) return `${j} j`;
  const d = new Date(date);
  return `${d.getDate()} ${MOIS[d.getMonth()].slice(0, 4).replace(/\.$/, '')}.`;
}

/** « 10 octobre 2026 » — la date longue du message ouvert. */
export function dateLongue(date: number): string {
  const d = new Date(date);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Le rayon d'un message : aujourd'hui, cette semaine, ou plus tôt. */
export function rayonDe(date: number, maintenant = Date.now()): 'Aujourd’hui' | 'Cette semaine' | 'Plus tôt' {
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  if (date >= minuit.getTime()) return 'Aujourd’hui';
  if (maintenant - date < 7 * 86400000) return 'Cette semaine';
  return 'Plus tôt';
}

/** Au-delà de ce glissé, lâcher supprime ; en deçà, on montre le bouton. */
const SEUIL_SUPPRIMER = 150;
const OUVERT = -92;

export function NotificationsScreen() {
  const c = useTheme();
  const s = getStyles(c);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const setScreen = useScanStore((st) => st.setScreen);
  const recus = useNotifications((n) => n.recus);
  const lus = useNotifications((n) => n.lus);
  const supprimes = useNotifications((n) => n.supprimes);
  const enCours = useNotifications((n) => n.enCours);
  const { rafraichir, marquerLu, toutLire, supprimer, restaurer } = useNotifications.getState();

  const [filtre, setFiltre] = useState<'toutes' | 'nonlues'>('toutes');
  const [ouvert, setOuvert] = useState<Message | null>(null);
  const [annulable, setAnnulable] = useState<string | null>(null);

  useEffect(() => {
    rafraichir().catch(() => {});
  }, [rafraichir]);

  const visibles = useMemo(() => messagesVisibles({ recus, supprimes }), [recus, supprimes]);
  const nonLus = visibles.filter((m) => !lus.includes(m.id)).length;
  const montres = filtre === 'nonlues' ? visibles.filter((m) => !lus.includes(m.id)) : visibles;
  const rayons = useMemo(() => {
    const out: { titre: string; messages: Message[] }[] = [];
    for (const m of montres) {
      const t = rayonDe(m.date);
      const r = out.find((x) => x.titre === t);
      if (r) r.messages.push(m);
      else out.push({ titre: t, messages: [m] });
    }
    return out;
  }, [montres]);

  /* Le bandeau « Annuler » : quatre secondes, puis il s'efface. */
  useEffect(() => {
    if (!annulable) return;
    const t = setTimeout(() => setAnnulable(null), 4000);
    return () => clearTimeout(t);
  }, [annulable]);

  const jeter = (id: string) => {
    supprimer(id);
    haptic('leger');
    setAnnulable(id);
  };

  /* Le message ouvert glisse depuis la droite, comme une page poussée. */
  const detail = useRef(new Animated.Value(0)).current;
  const ouvrir = (m: Message) => {
    marquerLu(m.id);
    setOuvert(m);
    detail.setValue(0);
    Animated.timing(detail, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const fermer = (apres?: () => void) => {
    Animated.timing(detail, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setOuvert(null);
      apres?.();
    });
  };

  const agir = (m: Message) => {
    const a = m.action;
    if (!a) return;
    if (a.url) {
      Linking.openURL(a.url).catch(() => {});
      return;
    }
    if (a.ecran === 'pro') useAccountStore.getState().ouvrirPaywall();
    else if (a.ecran === 'exemple') useScanStore.getState().ouvrirExemple();
    else if (a.ecran === 'bibliotheque') setScreen('library');
    else if (a.ecran === 'profil') setScreen('profil');
  };

  return (
    <RetourGlisse
      onRetour={() => (ouvert ? fermer() : setScreen('home'))}
      style={[s.fond, { paddingTop: insets.top }]}>
      <View style={s.barre}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={s.rond}
          hitSlop={10}
          onPress={() => setScreen('home')}>
          <BackChevron color={c.ink} />
        </Pressable>
        <Text style={s.titreBarre}>Notifications</Text>
        <View style={s.barreDroite}>
          {nonLus > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tout marquer comme lu"
              hitSlop={10}
              onPress={() => {
                toutLire();
                haptic('succes');
              }}>
              <Text style={s.toutLire}>Tout lire</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Toutes, ou seulement ce qu'on n'a pas lu. */}
      <View style={s.filtres}>
        {(
          [
            ['toutes', 'Toutes'],
            ['nonlues', nonLus > 0 ? `Non lues · ${nonLus}` : 'Non lues'],
          ] as const
        ).map(([cle, mot]) => {
          const actif = filtre === cle;
          return (
            <Pressable
              key={cle}
              accessibilityRole="button"
              accessibilityLabel={cle === 'toutes' ? 'Toutes les notifications' : 'Notifications non lues'}
              accessibilityState={{ selected: actif }}
              style={[s.filtre, actif && s.filtreActif]}
              onPress={() => setFiltre(cle)}>
              <Text style={[s.filtreMot, actif && s.filtreMotActif]}>{mot}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={[s.liste, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={enCours} onRefresh={() => rafraichir().catch(() => {})} tintColor={c.inkFaint} />
        }>
        {montres.length === 0 ? (
          <View style={s.vide} testID="notifications-vide">
            <View style={s.videRond}>
              <Svg width={34} height={34} viewBox="0 0 24 24">
                <Path d={CLOCHE} fill={c.inkFaint} fillRule="evenodd" />
              </Svg>
            </View>
            <Text style={s.videTitre}>{filtre === 'nonlues' ? 'Tout est lu' : 'Aucune notification'}</Text>
            <Text style={s.videTexte}>
              {filtre === 'nonlues'
                ? 'Vous êtes à jour. Les prochaines nouveautés arriveront ici.'
                : 'Les nouveautés et les annonces d’EchoPlan arriveront ici.'}
            </Text>
          </View>
        ) : (
          rayons.map((r) => (
            <View key={r.titre}>
              <Text style={s.rayon}>{r.titre}</Text>
              <View style={s.bloc}>
                {r.messages.map((m, i) => (
                  <LigneGlissante
                    key={m.id}
                    message={m}
                    lu={lus.includes(m.id)}
                    premier={i === 0}
                    c={c}
                    onOuvrir={() => ouvrir(m)}
                    onSupprimer={() => jeter(m.id)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* LE MESSAGE OUVERT — en entier, comme un mail. */}
      {ouvert && (
        <Animated.View
          style={[
            s.detail,
            { paddingTop: insets.top, transform: [{ translateX: detail.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] },
          ]}>
          <View style={s.barre}>
            <Pressable accessibilityRole="button" accessibilityLabel="Retour à la liste" style={s.rond} hitSlop={10} onPress={() => fermer()}>
              <BackChevron color={c.ink} />
            </Pressable>
            <View style={s.flex} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Supprimer la notification"
              style={s.rond}
              hitSlop={10}
              onPress={() => {
                const id = ouvert.id;
                fermer(() => jeter(id));
              }}>
              <Svg width={19} height={19} viewBox="0 0 24 24">
                <Path d={SOLAIRES.supprimer} fill={c.danger} fillRule="evenodd" />
              </Svg>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[s.detailCorps, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
            <Puce genre={ouvert.genre} c={c} />
            <Text style={s.detailTitre}>{ouvert.titre}</Text>
            <Text style={s.detailDate}>{dateLongue(ouvert.date)}</Text>
            {ouvert.texte.split(/\n{2,}/).map((p, i) => (
              <Text key={i} style={s.detailTexte}>
                {p}
              </Text>
            ))}
            {ouvert.action && (
              <Bouton
                label={ouvert.action.libelle}
                style={s.detailAction}
                onPress={() => {
                  const m = ouvert;
                  fermer(() => agir(m));
                }}
              />
            )}
          </ScrollView>
        </Animated.View>
      )}

      {/* « Annuler » : un glissé se fait aussi par erreur. */}
      {annulable && (
        <View style={[s.bandeau, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
          <View style={s.bandeauPilule}>
            <Text style={s.bandeauMot}>Notification supprimée</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Annuler la suppression"
              hitSlop={10}
              onPress={() => {
                restaurer(annulable);
                setAnnulable(null);
              }}>
              <Text style={s.bandeauAnnuler}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      )}
    </RetourGlisse>
  );
}

/** La puce du genre : son pictogramme et son mot, dans sa teinte. */
function Puce({ genre, c }: { genre: GenreMessage; c: Palette }) {
  const s = getStyles(c);
  const a = apparenceDuGenre(genre, c);
  return (
    <View style={[s.puce, { backgroundColor: a.fond }]}>
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Path d={a.icone} fill={a.encre} fillRule="evenodd" />
      </Svg>
      <Text style={[s.puceMot, { color: a.encre }]}>{a.mot}</Text>
    </View>
  );
}

/**
 * UNE LIGNE QU'ON GLISSE — vers la gauche, la corbeille apparaît ; assez
 * loin, et la notification part d'elle-même. Le geste ne se prend que s'il
 * est franchement horizontal : un doigt qui fait défiler la liste ne doit
 * jamais ouvrir une corbeille.
 */
function LigneGlissante({
  message,
  lu,
  premier,
  c,
  onOuvrir,
  onSupprimer,
}: {
  message: Message;
  lu: boolean;
  premier: boolean;
  c: Palette;
  onOuvrir: () => void;
  onSupprimer: () => void;
}) {
  const s = getStyles(c);
  const a = apparenceDuGenre(message.genre, c);
  const x = useRef(new Animated.Value(0)).current;
  const base = useRef(0);
  /* Le seuil franchi, une fois : la vibration dit « lâcher supprime ». */
  const auSeuil = useRef(false);
  const vers = (v: number, fin?: () => void) =>
    Animated.spring(x, { toValue: v, useNativeDriver: true, speed: 22, bounciness: 2 }).start(fin);
  const partir = () =>
    Animated.timing(x, { toValue: -600, duration: 200, useNativeDriver: true }).start(() => onSupprimer());

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        auSeuil.current = false;
        x.stopAnimation((v) => {
          base.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const v = Math.min(0, base.current + g.dx);
        x.setValue(v);
        const passe = v < -SEUIL_SUPPRIMER;
        if (passe !== auSeuil.current) {
          auSeuil.current = passe;
          if (passe) haptic('leger');
        }
      },
      onPanResponderRelease: (_e, g) => {
        const fin = base.current + g.dx;
        if (fin < -SEUIL_SUPPRIMER || g.vx < -1.2) partir();
        else if (fin < OUVERT / 2) vers(OUVERT);
        else vers(0);
      },
      onPanResponderTerminate: () => vers(0),
    }),
  ).current;

  return (
    <View style={[s.ligneCadre, !premier && s.filet]}>
      {/*
        DERRIÈRE LA LIGNE : LA CORBEILLE, COLLÉE AU BORD DROIT.

        Relevé du patron : « si on ne glisse pas totalement sur la gauche,
        mais qu'on s'arrête en cours, un bloc rouge sans texte s'affiche ».
        Le bouton existait, mais il était rangé À GAUCHE — sous la ligne —,
        poussé là par un étirement qui l'emportait sur l'alignement à droite.
        La rangée le pose maintenant à droite, et son contenu SUIT LE DOIGT,
        comme dans Mail : il reste centré dans la part rouge découverte, la
        corbeille dès les premiers points, le mot dès qu'il a la place ; au-
        delà du bouton, il accompagne le bord de la ligne qui s'en va.
      */}
      <View style={s.derriere}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Supprimer ${message.titre}`}
          style={s.corbeille}
          onPress={partir}>
          <Animated.View
            style={[
              s.corbeilleDedans,
              {
                transform: [
                  {
                    translateX: x.interpolate({
                      inputRange: [-600, OUVERT, 0],
                      // Centre de la part rouge : 46 + x/2 jusqu'au bouton ; au-delà,
                      // le bord de la ligne qui s'en va : x + 92.
                      outputRange: [-(600 + OUVERT), 0, -OUVERT / 2],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}>
            <Animated.View
              style={{
                opacity: x.interpolate({ inputRange: [-34, -14], outputRange: [1, 0], extrapolate: 'clamp' }),
              }}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d={SOLAIRES.supprimer} fill="#FFFFFF" fillRule="evenodd" />
              </Svg>
            </Animated.View>
            <Animated.Text
              style={[
                s.corbeilleMot,
                { opacity: x.interpolate({ inputRange: [-80, -62], outputRange: [1, 0], extrapolate: 'clamp' }) },
              ]}>
              Supprimer
            </Animated.Text>
          </Animated.View>
        </Pressable>
      </View>
      <Animated.View style={[s.devant, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${lu ? '' : 'Non lue, '}${message.titre}`}
          style={({ pressed }) => [s.ligne, pressed && s.lignePressee]}
          onPress={() => {
            // Une ligne entrouverte se referme d'abord : on ne lit pas par
            // accident en voulant fermer la corbeille.
            let ouverte = false;
            x.stopAnimation((v) => {
              ouverte = v < -4;
            });
            if (ouverte) vers(0);
            else onOuvrir();
          }}>
          <View style={[s.icone, { backgroundColor: a.fond }]}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path d={a.icone} fill={a.encre} fillRule="evenodd" />
            </Svg>
          </View>
          <View style={s.ligneTextes}>
            <View style={s.ligneHaut}>
              <Text style={[s.ligneTitre, lu && s.ligneTitreLu]} numberOfLines={1}>
                {message.titre}
              </Text>
              <Text style={s.ligneHeure}>{heureCourte(message.date)}</Text>
            </View>
            <Text style={s.ligneExtrait} numberOfLines={2}>
              {message.texte.replace(/\s+/g, ' ')}
            </Text>
          </View>
          {!lu && <View style={s.point} testID={`non-lu-${message.id}`} />}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg },
    flex: { flex: 1 },
    barre: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      marginTop: 8,
      marginBottom: 12,
    },
    rond: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...ombreBouton,
    },
    titreBarre: { color: c.ink, fontSize: 17, fontWeight: '700' },
    barreDroite: { minWidth: 40, alignItems: 'flex-end' },
    toutLire: { color: c.blue, fontSize: 15, fontWeight: '600' },
    filtres: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 6 },
    filtre: {
      paddingHorizontal: 14,
      minHeight: 34,
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.lineStrong,
    },
    filtreActif: { backgroundColor: c.ink, borderColor: c.ink },
    filtreMot: { color: c.inkSoft, fontSize: 14, fontWeight: '600' },
    filtreMotActif: { color: c.bg },
    liste: { paddingHorizontal: 20 },
    rayon: {
      color: c.inkFaint,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 18,
      marginBottom: 8,
      marginLeft: 4,
    },
    bloc: { backgroundColor: c.surface, borderRadius: 20, overflow: 'hidden', ...ombreBouton },
    ligneCadre: { position: 'relative' },
    filet: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    /* Une RANGÉE qui pousse à droite : l'étirement se fait alors en hauteur,
       et le bouton reste au bord droit, sur toute la hauteur de la ligne. */
    derriere: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: c.danger,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'stretch',
    },
    corbeille: { width: -OUVERT, alignItems: 'center', justifyContent: 'center' },
    corbeilleDedans: { alignItems: 'center', justifyContent: 'center', gap: 3 },
    corbeilleMot: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
    devant: { backgroundColor: c.surface },
    ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
    lignePressee: { backgroundColor: c.surfaceSunken },
    icone: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    ligneTextes: { flex: 1, minWidth: 0 },
    ligneHaut: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    ligneTitre: { flex: 1, color: c.ink, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2 },
    ligneTitreLu: { color: c.inkSoft, fontWeight: '600' },
    ligneHeure: { color: c.inkFaint, fontSize: 12.5 },
    ligneExtrait: { color: c.inkSoft, fontSize: 14, lineHeight: 19, marginTop: 3 },
    point: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: c.blue, marginTop: 6 },
    vide: { alignItems: 'center', paddingTop: 90, paddingHorizontal: 30 },
    videRond: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
      ...ombreBouton,
    },
    videTitre: { color: c.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    videTexte: { color: c.inkSoft, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 6 },
    detail: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.bg },
    detailCorps: { paddingHorizontal: 24, paddingTop: 8 },
    puce: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    puceMot: { fontSize: 12.5, fontWeight: '700' },
    detailTitre: { color: c.ink, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.6, marginTop: 14 },
    detailDate: { color: c.inkFaint, fontSize: 13.5, marginTop: 6, marginBottom: 14 },
    detailTexte: { color: c.ink, fontSize: 16, lineHeight: 24, marginBottom: 12 },
    detailAction: { marginTop: 14 },
    bandeau: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
    bandeauPilule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      backgroundColor: c === dark ? '#2A303B' : '#1C2028',
      borderRadius: radius.pill,
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    bandeauMot: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '500' },
    bandeauAnnuler: { color: '#7FA6FF', fontSize: 14.5, fontWeight: '700' },
  }),
);
