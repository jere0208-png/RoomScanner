/**
 * TRACER UNE PIÈCE DU DOIGT, SUR L'ACCUEIL.
 *
 * Relevé du patron : « il y a trop d'espace inutilisé », puis, sur la
 * proposition : « essaye le tracé, mais affiche "Pas de scan ? Tracez avec
 * votre doigt." en titre bien placé. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GESTE, ET PAS UN CONTENU.
 *
 * Le vide de l'accueil appelait quelque chose, et la réponse facile était d'y
 * mettre les derniers plans. Relevé du patron : « il faut penser aux nouveaux
 * qui n'ont pas de plan. » Une idée qui ne marche qu'au bout de trois relevés
 * n'est pas une idée.
 *
 * Ce geste-ci est le MÊME au premier lancement et au centième : rien à avoir,
 * rien à accumuler. Et ce n'est pas un objet de plus posé sur l'écran — on
 * vient justement d'en retirer un, la maquette d'iPhone. C'est le papier
 * quadrillé qui retrouve sa fonction : une feuille à carreaux sert à tracer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ÉCHELLE EST CELLE DU PAPIER : un carreau vaut vingt-cinq centimètres.
 *
 * C'est le seul choix qui rende le quadrillage HONNÊTE : il était décoratif,
 * il devient une règle graduée.
 *
 * ET IL BORNE LE GESTE, ce qui est assumé. Sur un téléphone, la feuille fait
 * trois mètres et demi de large : on y trace une chambre, pas un séjour de
 * six. Ce tracé sert à DÉMARRER, pas à coter — la cote exacte se tape une
 * seconde plus tard, dans l'éditeur, là où c'est le métier de le faire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IL FAUT DEUX GESTES, ET C'EST VOULU : on trace, PUIS on ouvre.
 *
 * Ouvrir directement au relâcher serait plus vif, et l'accueil est un écran
 * qu'on touche pour autre chose : se retrouver dans l'éditeur pour avoir
 * effleuré le fond serait le pire défaut que ce geste puisse avoir. Le
 * rectangle reste donc affiché avec ses cotes, et un bouton le confirme. Un
 * tracé raté se refait par-dessus.
 */
import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { PAS_QUADRILLAGE } from './Quadrillage';
import { radius, themedStyles, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

/**
 * CE QUE VAUT UN CARREAU, en mètres.
 *
 * Vingt-cinq centimètres : la graduation d'un mètre de chantier, et le pas qui
 * rend une chambre traçable sur un écran de téléphone. À cinquante, on
 * gagnerait de la place et l'on perdrait toute finesse ; à dix, une pièce ne
 * tiendrait plus dans la feuille.
 */
export const METRES_PAR_CARREAU = 0.25;

/**
 * LA PLUS PETITE PIÈCE QU'ON ACCEPTE DE TRACER.
 *
 * Le magasin refuse déjà tout rectangle sous un demi-mètre (`addRoomRect`) :
 * on ne propose donc pas un geste dont on sait qu'il ne fera rien. Trois
 * carreaux de côté, c'est soixante-quinze centimètres — un placard.
 */
const MIN_CARREAUX = 3;

/** En deçà, le doigt n'a pas glissé : il s'est posé. */
const GLISSEMENT_MIN = 8;

const fr = (v: number) => v.toFixed(2).replace('.', ',');

interface Coin {
  x: number;
  y: number;
}

export function TraceUnePiece({
  width,
  height,
  palette,
  onTracee,
}: {
  width: number;
  height: number;
  palette: Palette;
  /** La pièce validée, en MÈTRES : largeur puis profondeur. */
  onTracee: (largeur: number, profondeur: number) => void;
}) {
  const c = palette;
  const styles = getStyles(c);
  const [coins, setCoins] = useState<{ a: Coin; b: Coin } | null>(null);
  const depart = useRef<Coin | null>(null);

  /*
    LA FEUILLE A DES BORDS, MÊME FONDUS.

    Un doigt qui sort du cadre continuerait de faire grandir la pièce hors de
    la zone — on dessinerait sous les boutons. On borne donc le point courant,
    et non le rectangle : borner le rectangle après coup ferait sauter le coin
    qu'on tient.
  */
  const dansLaFeuille = (p: Coin): Coin => ({
    x: Math.max(0, Math.min(width, p.x)),
    y: Math.max(0, Math.min(height, p.y)),
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        depart.current = {
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
        };
        setCoins(null);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const a = depart.current;
        if (!a) return;
        setCoins({
          a,
          b: dansLaFeuille({
            x: e.nativeEvent.locationX,
            y: e.nativeEvent.locationY,
          }),
        });
      },
      onPanResponderRelease: (e: GestureResponderEvent) => {
        const a = depart.current;
        depart.current = null;
        if (!a) return;
        const b = dansLaFeuille({
          x: e.nativeEvent.locationX,
          y: e.nativeEvent.locationY,
        });
        // Un doigt posé n'est pas une pièce : on efface plutôt que d'ouvrir.
        if (
          Math.abs(b.x - a.x) < GLISSEMENT_MIN &&
          Math.abs(b.y - a.y) < GLISSEMENT_MIN
        ) {
          setCoins(null);
          return;
        }
        setCoins({ a, b });
        haptic('leger');
      },
      onPanResponderTerminate: () => {
        depart.current = null;
      },
    }),
  ).current;

  /**
   * LE RECTANGLE, COLLÉ AU CARREAU.
   *
   * On est sur du papier millimétré : un rectangle qui s'arrête entre deux
   * traits n'a pas de sens, et « 1,03 m » sur un geste au doigt est une fausse
   * précision qu'on paierait plus tard en la croyant.
   */
  const trace = (() => {
    if (!coins) return null;
    const car = (v: number) => Math.round(v / PAS_QUADRILLAGE);
    const cx0 = Math.min(car(coins.a.x), car(coins.b.x));
    const cx1 = Math.max(car(coins.a.x), car(coins.b.x));
    const cy0 = Math.min(car(coins.a.y), car(coins.b.y));
    const cy1 = Math.max(car(coins.a.y), car(coins.b.y));
    const large = cx1 - cx0;
    const haut = cy1 - cy0;
    return {
      x: cx0 * PAS_QUADRILLAGE,
      y: cy0 * PAS_QUADRILLAGE,
      w: large * PAS_QUADRILLAGE,
      h: haut * PAS_QUADRILLAGE,
      largeur: large * METRES_PAR_CARREAU,
      profondeur: haut * METRES_PAR_CARREAU,
      assez: large >= MIN_CARREAUX && haut >= MIN_CARREAUX,
    };
  })();

  return (
    <View style={[styles.zone, { width, height }]}>
      {/*
        LE TITRE EST AU-DESSUS DE LA ZONE, ET PAS DEDANS.

        Relevé du patron : « en titre bien placé ». Posé à l'intérieur d'un
        cadre en pointillé, il se lirait comme l'étiquette d'un champ vide ;
        au-dessus, c'est une invitation — et c'est la première chose que lit
        quelqu'un qui n'a rien à reprendre.
      */}
      <Text style={styles.titre}>Pas de scan ? Tracez avec votre doigt.</Text>

      <View style={styles.feuille} {...pan.panHandlers}>
        <Svg width={width} height={height - ENTETE}>
          {!trace && (
            /* L'invitation : un cadre en pointillé, qui dit où l'on trace. */
            <Rect
              testID="cadre-invitation"
              x={width * 0.18}
              y={(height - ENTETE) * 0.16}
              width={width * 0.64}
              height={(height - ENTETE) * 0.62}
              rx={10}
              fill="none"
              stroke={c.inkFaint}
              strokeWidth={1.6}
              strokeDasharray="7 6"
              opacity={0.75}
            />
          )}
          {trace && (
            <>
              <Rect
                testID="piece-tracee"
                x={trace.x}
                y={trace.y}
                width={trace.w}
                height={trace.h}
                fill={c.blue}
                fillOpacity={0.09}
                stroke={c.blue}
                strokeWidth={2.4}
              />
              {/* LES COTES S'ÉCRIVENT PENDANT LE GESTE. C'est ce qui fait la
                  différence entre gribouiller et mesurer. */}
              <SvgText
                x={trace.x + trace.w / 2}
                y={trace.y + trace.h + 18}
                fontSize={12.5}
                fontWeight="bold"
                fill={c.inkSoft}
                textAnchor="middle">
                {`${fr(trace.largeur)} m`}
              </SvgText>
              <SvgText
                x={trace.x - 8}
                y={trace.y + trace.h / 2}
                fontSize={12.5}
                fontWeight="bold"
                fill={c.inkSoft}
                textAnchor="end">
                {`${fr(trace.profondeur)} m`}
              </SvgText>
              <Line
                x1={trace.x}
                y1={trace.y + trace.h + 6}
                x2={trace.x + trace.w}
                y2={trace.y + trace.h + 6}
                stroke={c.inkFaint}
                strokeWidth={1}
              />
            </>
          )}
        </Svg>
        {!trace && (
          <Text style={styles.echelle}>un carreau = 25 cm</Text>
        )}
      </View>

      {trace?.assez && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvrir cette pièce"
          style={styles.ouvrir}
          onPress={() => {
            haptic('succes');
            onTracee(trace.largeur, trace.profondeur);
          }}>
          <Text style={styles.ouvrirMot}>Ouvrir cette pièce</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Ce que le titre prend en haut de la zone. */
const ENTETE = 46;

/**
 * CE QUI SÉPARE LE BOUTON DU BAS DE LA FEUILLE.
 *
 * Sous la feuille commence l'appel principal de l'écran. Posé à zéro, le
 * bouton du tracé le touchait — relevé du patron.
 */
const MARGE_BAS = 14;

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    zone: { alignItems: 'center' },
    titre: {
      height: ENTETE,
      color: c.ink,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
      paddingTop: 6,
    },
    /* La surface qui reçoit le doigt : tout ce qui reste sous le titre. */
    feuille: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
    echelle: {
      position: 'absolute',
      bottom: 6,
      alignSelf: 'center',
      color: c.inkFaint,
      fontSize: 12,
    },
    /*
      LE BOUTON SE POSE SUR LA FEUILLE, à la place de l'échelle : il ne
      pousse rien, donc le tracé ne saute pas quand il apparaît.

      IL EST EN NOIR ET BLANC, ET IL SE DÉCOLLE DU BAS. Relevé du patron :
      « le bouton "ouvrir cette pièce" est trop proche du bouton commencer
      un scan. Fais un bouton plus sobre, blanc et noir. » En bleu, il
      portait la couleur de l'appel principal : deux boutons bleus l'un sur
      l'autre, et l'œil ne sait plus lequel est LE geste. À l'encre du plan,
      il se lit comme la suite du trait qu'on vient de faire.
    */
    ouvrir: {
      position: 'absolute',
      bottom: MARGE_BAS,
      alignSelf: 'center',
      backgroundColor: c.ink,
      borderRadius: radius.pill,
      paddingHorizontal: 20,
      minHeight: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* Le fond de l'écran : blanc sur noir en plein jour, noir sur blanc la
       nuit — c'est le même contraste, retourné avec le thème. */
    ouvrirMot: { color: c.bg, fontSize: 13.5, fontWeight: '800' },
  }),
);
