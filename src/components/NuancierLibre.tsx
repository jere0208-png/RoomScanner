/**
 * LE NUANCIER LIBRE — un sélecteur de couleur RGB complet, réutilisable.
 *
 * Relevé du patron : « donne la possibilité de choisir beaucoup de couleurs
 * pour meubles, murs, sols, dans une palette de sélection RGB ». Les
 * nuanciers de Décorer restent, en raccourcis ; leur dernière pastille,
 * « Autre couleur… », ouvre celui-ci, posé sur la couleur du moment :
 *
 *   — un carré saturation × luminosité, et une barre de teinte ;
 *   — l'aperçu, avant / après ;
 *   — le code `#RRGGBB`, à lire ou à taper (une saisie invalide est refusée) ;
 *   — trois curseurs R, G, B ;
 *   — les couleurs récentes de ce téléphone.
 *
 * FLUIDE AU DOIGT. Le geste ne touche que l'état DE CE COMPOSANT, et au plus
 * une fois par image (`requestAnimationFrame`) : rien ne remonte au plan
 * pendant qu'on glisse. La couleur ne part qu'au LÂCHER (`onLacher`), ou au
 * bouton « Appliquer ». Pas de dépendance neuve : les dégradés sont ceux de
 * react-native-svg, le doigt passe par les responders de React Native.
 *
 * ACCESSIBLE. Chaque zone a son libellé et sa valeur dite ; le carré, la
 * barre et les curseurs se règlent aussi au balayage vertical de VoiceOver
 * (`adjustable`) ; aucune cible ne fait moins de 44 pt.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { haptic } from '../ui/haptic';
import { annoncer } from '../ui/annoncer';
import {
  bornerTeinte,
  estSombre,
  hexVersHsv,
  hsvVersHex,
  hsvVersRgb,
  lireHex,
  rgbVersHsv,
  type Hsv,
  type Rgb,
} from '../ui/couleurLibre';
import { useCouleursRecentes } from '../store/couleursRecentes';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

export {
  estHex,
  hexVersHsv,
  hexVersRgb,
  hsvVersHex,
  hsvVersRgb,
  lireHex,
  rgbVersHex,
  rgbVersHsv,
} from '../ui/couleurLibre';

/** La plus petite cible au doigt (pt) : la règle d'iOS. */
export const CIBLE_MIN = 44;
const POUCE = 28;
const HAUTEUR_BARRE = 26;
const TEINTES_BARRE = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

const borne01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * UN GLISSER AU DOIGT, sur les responders de React Native. La position suit
 * le doigt depuis le point d'appui (le déplacement à l'écran), si bien qu'un
 * pouce posé par-dessus ne fausse rien. Le défilement de la feuille ne
 * reprend pas le geste en cours (`onResponderTerminationRequest`).
 */
function useGlisse(
  surPoint: (x: number, y: number) => void,
  surLacher: () => void,
  onGeste?: (actif: boolean) => void,
) {
  const appui = useRef({ x0: 0, y0: 0, px0: 0, py0: 0 });
  const cb = useRef({ surPoint, surLacher, onGeste });
  cb.current = { surPoint, surLacher, onGeste };
  return useMemo(() => {
    const fin = () => {
      cb.current.onGeste?.(false);
      cb.current.surLacher();
    };
    return {
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onResponderTerminationRequest: () => false,
      onResponderGrant: (e: GestureResponderEvent) => {
        const n = e.nativeEvent;
        appui.current = {
          x0: n.locationX,
          y0: n.locationY,
          px0: n.pageX,
          py0: n.pageY,
        };
        cb.current.onGeste?.(true);
        cb.current.surPoint(n.locationX, n.locationY);
      },
      onResponderMove: (e: GestureResponderEvent) => {
        const n = e.nativeEvent;
        const a = appui.current;
        cb.current.surPoint(a.x0 + (n.pageX - a.px0), a.y0 + (n.pageY - a.py0));
      },
      onResponderRelease: fin,
      onResponderTerminate: fin,
    };
  }, []);
}

const ACTIONS_REGLAGE = [{ name: 'increment' as const }, { name: 'decrement' as const }];

export function NuancierLibre({
  initiale,
  titre,
  onLacher,
  onAppliquer,
  onFermer,
  onGeste,
  enTete,
}: {
  /** La couleur du moment, `#RRGGBB` ; illisible, on part du blanc. */
  initiale: string;
  /** Ce qu'on colore : « Couleur des murs », « Canapé »… */
  titre: string;
  /** Au lâcher d'un geste, d'une saisie valide, d'une couleur récente : la couleur part au plan. */
  onLacher?: (hex: string) => void;
  /** Le bouton « Appliquer ». */
  onAppliquer: (hex: string) => void;
  onFermer: () => void;
  /** Un doigt pose ou lève : la feuille qui défile se fige le temps du geste. */
  onGeste?: (actif: boolean) => void;
  /** Un réglage de plus sous le titre (« Tout le logement »). */
  enTete?: React.ReactNode;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const depart = useRef(lireHex(initiale) ?? '#FFFFFF').current;
  const [hsv, setHsvEtat] = useState<Hsv>(() => hexVersHsv(depart));
  const courant = useRef(hsv);
  const image = useRef<number | null>(null);
  const hex = hsvVersHex(hsv);
  const rgb = hsvVersRgb(hsv);

  // L'état suit le doigt au plus une fois par image ; `courant` le suit toujours.
  const poser = (h: Hsv, tout = false) => {
    courant.current = h;
    if (tout) {
      if (image.current !== null) cancelAnimationFrame(image.current);
      image.current = null;
      setHsvEtat(h);
      return;
    }
    if (image.current !== null) return;
    image.current = requestAnimationFrame(() => {
      image.current = null;
      setHsvEtat(courant.current);
    });
  };
  useEffect(
    () => () => {
      if (image.current !== null) cancelAnimationFrame(image.current);
    },
    [],
  );
  /** Le geste est fini : l'état est à jour, la couleur part au plan. */
  const lacher = () => {
    poser(courant.current, true);
    onLacher?.(hsvVersHex(courant.current));
  };

  // Une couleur changée ailleurs (« Annuler ») : le sélecteur la reprend.
  useEffect(() => {
    const h = lireHex(initiale);
    if (h && h !== hsvVersHex(courant.current)) poser(hexVersHsv(h), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiale]);

  // ---------------------------------------------------------------- le carré
  const [largeur, setLargeur] = useState(0);
  const tailles = useRef({ w: 1, h: 1, barre: 1, piste: 1 });
  const hauteurCarre = Math.round(Math.min(200, Math.max(140, largeur * 0.55)));
  /** La piste d'un curseur R, G, B : la largeur, moins la lettre et la valeur. */
  const piste = Math.max(1, largeur - 64);
  tailles.current.w = Math.max(1, largeur);
  tailles.current.h = hauteurCarre;
  tailles.current.barre = Math.max(1, largeur);
  tailles.current.piste = piste;
  const carre = useGlisse(
    (x, y) =>
      poser({
        h: courant.current.h,
        s: borne01(x / tailles.current.w),
        v: borne01(1 - y / tailles.current.h),
      }),
    lacher,
    onGeste,
  );
  const barre = useGlisse(
    (x) =>
      poser({
        ...courant.current,
        h: bornerTeinte(borne01(x / tailles.current.barre) * 359.999),
      }),
    lacher,
    onGeste,
  );
  const surCurseur = (k: keyof Rgb) => (x: number) => {
    const actuel = arrondi(hsvVersRgb(courant.current));
    const v = Math.round(borne01(x / tailles.current.piste) * 255);
    const suivant = rgbVersHsv({ ...actuel, [k]: v });
    // Un gris n'a pas de teinte : on garde celle qu'on avait.
    poser(suivant.s === 0 ? { ...suivant, h: courant.current.h } : suivant);
  };
  const curseurs = {
    r: useGlisse(surCurseur('r'), lacher, onGeste),
    g: useGlisse(surCurseur('g'), lacher, onGeste),
    b: useGlisse(surCurseur('b'), lacher, onGeste),
  };

  /** Un cran au balayage de VoiceOver : la couleur part aussitôt. */
  const regler = (e: AccessibilityActionEvent, quoi: (h: Hsv, sens: number) => Hsv) => {
    const sens = e.nativeEvent.actionName === 'increment' ? 1 : e.nativeEvent.actionName === 'decrement' ? -1 : 0;
    if (!sens) return;
    poser(quoi(courant.current, sens), true);
    onLacher?.(hsvVersHex(courant.current));
  };

  // ---------------------------------------------------------------- l'hexa
  const [saisie, setSaisie] = useState(hex);
  const [edition, setEditionEtat] = useState(false);
  // Lue aussitôt : « valider » puis « fin d'édition » arrivent dans le même tour.
  const enEdition = useRef(false);
  const setEdition = (v: boolean) => {
    enEdition.current = v;
    setEditionEtat(v);
  };
  const [refus, setRefus] = useState<string | null>(null);
  // Le refus se DIT : `accessibilityLiveRegion` est muet sur iOS.
  useEffect(() => {
    annoncer(refus);
  }, [refus]);
  useEffect(() => {
    if (!edition) setSaisie(hex);
  }, [hex, edition]);
  const validerSaisie = () => {
    setEdition(false);
    const lu = lireHex(saisie);
    if (!lu) {
      setRefus('Code refusé : six chiffres hexadécimaux, par exemple #A1B2C3.');
      setSaisie(hsvVersHex(courant.current));
      haptic('alerte');
      return;
    }
    setRefus(null);
    setSaisie(lu);
    // Le même code, relu : rien ne change.
    if (lu === hsvVersHex(courant.current)) return;
    poser(hexVersHsv(lu), true);
    onLacher?.(lu);
  };

  // ---------------------------------------------------------------- récentes
  const recentes = useCouleursRecentes((r) => r.recentes);
  useEffect(() => {
    useCouleursRecentes.getState().charger();
  }, []);

  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const teintePure = hsvVersHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <View style={s.boite} testID="nuancier-libre">
      <View style={s.tete}>
        <Text style={s.titre} numberOfLines={1} accessibilityRole="header">
          {titre}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le sélecteur de couleur"
          hitSlop={4}
          style={({ pressed }) => [s.fermer, pressed && { opacity: 0.6 }]}
          onPress={onFermer}>
          <Text style={s.fermerTexte}>Fermer</Text>
        </Pressable>
      </View>
      {enTete}

      {/* LE CARRÉ : la saturation de gauche à droite, la luminosité de bas en haut. */}
      <View
        testID="nuancier-carre"
        style={[s.carre, { height: hauteurCarre }]}
        onLayout={(e: LayoutChangeEvent) => setLargeur(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Saturation et luminosité"
        accessibilityHint="Glissez le doigt ; balayez vers le haut ou le bas pour éclaircir ou foncer."
        accessibilityValue={{
          text: `saturation ${Math.round(hsv.s * 100)} %, luminosité ${Math.round(hsv.v * 100)} %`,
        }}
        accessibilityActions={ACTIONS_REGLAGE}
        onAccessibilityAction={(e) => regler(e, (h, sens) => ({ ...h, v: borne01(h.v + sens * 0.05) }))}
        {...carre}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {largeur > 0 ? (
            <Svg width={largeur} height={hauteurCarre}>
              <Defs>
                <LinearGradient id={`blanc${id}`} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id={`noir${id}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                  <Stop offset="1" stopColor="#000000" stopOpacity={1} />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={largeur} height={hauteurCarre} fill={teintePure} />
              <Rect x={0} y={0} width={largeur} height={hauteurCarre} fill={`url(#blanc${id})`} />
              <Rect x={0} y={0} width={largeur} height={hauteurCarre} fill={`url(#noir${id})`} />
            </Svg>
          ) : null}
          <View
            style={[
              s.pouce,
              {
                left: hsv.s * Math.max(0, largeur) - POUCE / 2,
                top: (1 - hsv.v) * hauteurCarre - POUCE / 2,
                backgroundColor: hex,
                borderColor: estSombre(hex) ? '#FFFFFF' : '#0B0D12',
              },
            ]}
          />
        </View>
      </View>

      {/* LA BARRE DE TEINTE — 44 pt de haut au doigt, 26 pt dessinés. */}
      <View
        testID="nuancier-teinte"
        style={s.barreZone}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Teinte"
        accessibilityValue={{
          min: 0,
          max: 360,
          now: Math.round(hsv.h),
          text: `${Math.round(hsv.h)} degrés`,
        }}
        accessibilityActions={ACTIONS_REGLAGE}
        onAccessibilityAction={(e) => regler(e, (h, sens) => ({ ...h, h: bornerTeinte(h.h + sens * 10) }))}
        {...barre}>
        <View pointerEvents="none" style={s.barre}>
          {largeur > 0 ? (
            <Svg width={largeur} height={HAUTEUR_BARRE}>
              <Defs>
                <LinearGradient id={`teinte${id}`} x1="0" y1="0" x2="1" y2="0">
                  {TEINTES_BARRE.map((t, i) => (
                    <Stop key={i} offset={String(i / (TEINTES_BARRE.length - 1))} stopColor={t} />
                  ))}
                </LinearGradient>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={largeur}
                height={HAUTEUR_BARRE}
                rx={HAUTEUR_BARRE / 2}
                fill={`url(#teinte${id})`}
              />
            </Svg>
          ) : null}
          <View
            style={[
              s.pouceBarre,
              {
                left: (hsv.h / 360) * Math.max(0, largeur) - POUCE / 2,
                backgroundColor: teintePure,
              },
            ]}
          />
        </View>
      </View>

      {/* L'APERÇU ET LE CODE */}
      <View style={s.ligne}>
        <View
          style={s.apercu}
          accessible
          accessibilityLabel={`Aperçu : avant ${depart}, après ${hex}`}
          testID="nuancier-apercu">
          <View style={[s.apercuMoitie, { backgroundColor: depart }]} />
          <View style={[s.apercuMoitie, { backgroundColor: hex }]} />
        </View>
        <View style={s.champ}>
          <TextInput
            testID="nuancier-hexa"
            accessibilityLabel="Code hexadécimal de la couleur"
            accessibilityHint="Six chiffres hexadécimaux, par exemple #A1B2C3"
            style={[s.hexa, refus && s.hexaRefus]}
            value={saisie}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            returnKeyType="done"
            onFocus={() => setEdition(true)}
            onChangeText={(t) => {
              setEdition(true);
              setRefus(null);
              setSaisie(t);
            }}
            onSubmitEditing={validerSaisie}
            onEndEditing={() => enEdition.current && validerSaisie()}
          />
        </View>
      </View>
      {refus ? (
        <Text style={s.refus} accessibilityLiveRegion="polite" testID="nuancier-refus">
          {refus}
        </Text>
      ) : null}

      {/* R, G, B */}
      {(['r', 'g', 'b'] as const).map((k) => {
        const nom = k === 'r' ? 'Rouge' : k === 'g' ? 'Vert' : 'Bleu';
        const r0 = arrondi(rgb);
        const debut = hsvVersHex(rgbVersHsv({ ...r0, [k]: 0 }));
        const fin = hsvVersHex(rgbVersHsv({ ...r0, [k]: 255 }));
        const valeur = r0[k];
        return (
          <View key={k} style={s.curseurLigne}>
            <Text style={s.curseurNom}>{k.toUpperCase()}</Text>
            <View
              testID={`nuancier-${k}`}
              style={s.curseurZone}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={nom}
              accessibilityValue={{ min: 0, max: 255, now: valeur }}
              accessibilityActions={ACTIONS_REGLAGE}
              onAccessibilityAction={(e) =>
                regler(e, (h, sens) => {
                  const a = arrondi(hsvVersRgb(h));
                  const n = rgbVersHsv({
                    ...a,
                    [k]: Math.min(255, Math.max(0, a[k] + sens * 5)),
                  });
                  return n.s === 0 ? { ...n, h: h.h } : n;
                })
              }
              {...curseurs[k]}>
              <View pointerEvents="none" style={s.curseurPiste}>
                {largeur > 0 ? (
                  <Svg width={piste} height={14}>
                    <Defs>
                      <LinearGradient id={`${k}${id}`} x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={debut} />
                        <Stop offset="1" stopColor={fin} />
                      </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={piste} height={14} rx={7} fill={`url(#${k}${id})`} />
                  </Svg>
                ) : null}
                <View style={[s.pouceCurseur, { left: (valeur / 255) * piste - 11 }]} />
              </View>
            </View>
            <Text style={s.curseurValeur}>{valeur}</Text>
          </View>
        );
      })}

      {/* LES RÉCENTES */}
      {recentes.length > 0 ? (
        <>
          <Text style={s.section}>Couleurs récentes</Text>
          <View style={s.recentes} testID="nuancier-recentes">
            {recentes.map((r) => (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityLabel={`Couleur récente ${r}`}
                accessibilityState={{ selected: r === hex }}
                style={({ pressed }) => [
                  s.recente,
                  { backgroundColor: r },
                  r === hex && { borderColor: c.blue, borderWidth: 3 },
                  pressed && { transform: [{ scale: 0.92 }] },
                ]}
                onPress={() => {
                  haptic('leger');
                  poser(hexVersHsv(r), true);
                  onLacher?.(r);
                }}
              />
            ))}
          </View>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Appliquer la couleur ${hex}`}
        style={({ pressed }) => [s.appliquer, pressed && { opacity: 0.8 }]}
        onPress={() => {
          haptic('succes');
          const h = hsvVersHex(courant.current);
          useCouleursRecentes.getState().retenir(h);
          onAppliquer(h);
        }}>
        <View style={[s.appliquerPastille, { backgroundColor: hex }]} />
        <Text style={s.appliquerTexte}>Appliquer</Text>
      </Pressable>
    </View>
  );
}

const arrondi = (c: Rgb): Rgb => ({
  r: Math.round(c.r),
  g: Math.round(c.g),
  b: Math.round(c.b),
});

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    boite: {
      marginTop: 12,
      padding: 12,
      borderRadius: radius.lg,
      backgroundColor: c.surfaceSunken,
      gap: 10,
    },
    tete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    titre: { flex: 1, color: c.ink, fontSize: 15, fontWeight: '800' },
    fermer: {
      minHeight: CIBLE_MIN,
      minWidth: CIBLE_MIN,
      paddingHorizontal: 12,
      borderRadius: CIBLE_MIN / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    fermerTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
    carre: {
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: '#FF0000',
    },
    pouce: {
      position: 'absolute',
      width: POUCE,
      height: POUCE,
      borderRadius: POUCE / 2,
      borderWidth: 3,
    },
    barreZone: { height: CIBLE_MIN, justifyContent: 'center' },
    barre: { height: HAUTEUR_BARRE, justifyContent: 'center' },
    pouceBarre: {
      position: 'absolute',
      width: POUCE,
      height: POUCE,
      borderRadius: POUCE / 2,
      borderWidth: 3,
      borderColor: '#FFFFFF',
      top: (HAUTEUR_BARRE - POUCE) / 2,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    ligne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    apercu: {
      flexDirection: 'row',
      width: 88,
      height: CIBLE_MIN,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    apercuMoitie: { flex: 1 },
    champ: { flex: 1 },
    hexa: {
      minHeight: CIBLE_MIN,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: c.surface,
      color: c.ink,
      fontSize: 16,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    hexaRefus: { borderColor: c.danger, borderWidth: 2 },
    refus: { color: c.dangerTexte, fontSize: 13, fontWeight: '600' },
    curseurLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    curseurNom: {
      width: 16,
      color: c.inkSoft,
      fontSize: 13,
      fontWeight: '800',
    },
    curseurZone: { flex: 1, height: CIBLE_MIN, justifyContent: 'center' },
    curseurPiste: { height: 14, justifyContent: 'center' },
    pouceCurseur: {
      position: 'absolute',
      width: 22,
      height: 22,
      borderRadius: 11,
      top: -4,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: c.lineStrong,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    curseurValeur: {
      width: 32,
      textAlign: 'right',
      color: c.ink,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    section: {
      color: c.inkSoft,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    recentes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    recente: {
      width: CIBLE_MIN,
      height: CIBLE_MIN,
      borderRadius: CIBLE_MIN / 2,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    appliquer: {
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: c.blue,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    appliquerPastille: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    appliquerTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  }),
);
