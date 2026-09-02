/**
 * LE CATALOGUE DE MOBILIER.
 *
 * Une recherche plutôt qu'un mode d'emploi : à trente entrées, on sait ce
 * qu'on cherche, et faire défiler la liste prend plus de temps que de le
 * taper. Le filtre ignore accents et casse — « evier » doit trouver
 * « Évier », sinon il vaudrait mieux ne pas en avoir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ET LA TUILE SE PREND EN MAIN — le glisser-poser, cinquième des dix
 * améliorations.
 *
 * Toucher une tuile posait le meuble au CENTRE d'une pièce qu'il fallait
 * d'abord désigner dans une liste. Trois décisions pour un geste qui n'en
 * demande qu'une, et un meuble jamais là où on le voulait. Maintenant on
 * MAINTIENT la tuile, le catalogue s'écarte, et on lâche le meuble à sa
 * place sur le plan.
 *
 * POURQUOI « MAINTENIR », ET PAS « TIRER TOUT DE SUITE ». Le catalogue
 * défile verticalement ; un glissement immédiat appartient donc à la LISTE,
 * et si la tuile s'en emparait on ne pourrait plus parcourir le catalogue.
 * C'est le geste d'iOS, et il n'y en a pas d'autre de possible : la tuile
 * prend le toucher dès l'appui, puis REND LA MAIN à la liste
 * (`onResponderTerminationRequest`) tant qu'elle n'est pas levée.
 *
 * L'APPUI BREF, LUI, NE CHANGE PAS. Le glisser-poser ajoute un geste, il
 * n'en retire aucun : qui touche une tuile pose toujours le meuble au
 * centre de la pièce, comme hier.
 */
import React from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { useTheme } from '../../theme';
import { CATALOGUE, type CatalogItem } from '../../geometry/catalogue';
import { furnKind, furnitureStrokes } from '../../geometry/furniture';
import { estUnTap } from '../../ui/geste';
import { haptic } from '../../ui/haptic';
import { fr } from './format';
import { getStyles } from './styles';

/** Recherche sans accent ni casse : « evier » doit trouver « Évier ». */
const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function matchItem(item: CatalogItem, quete: string): boolean {
  const q = sansAccent(quete.trim());
  if (!q) return true;
  return sansAccent(`${item.label} ${item.category}`).includes(q);
}

/**
 * CE QU'IL FAUT MAINTENIR POUR LEVER UNE TUILE (ms).
 *
 * Trois cent vingt millisecondes : celui d'iOS pour un glisser-poser. Plus
 * court, on lève des tuiles en voulant défiler ; plus long, le geste paraît
 * ne pas répondre et on recommence.
 */
export const ATTENTE_LEVEE = 320;

/** La silhouette du meuble, vue de dessus : on le reconnaît sans lire. */
export function FurnitureThumb({
  item,
  echelle = 1,
}: {
  item: CatalogItem;
  echelle?: number;
}) {
  const c = useTheme();
  const W = 74 * echelle;
  const H = 52 * echelle;
  // Emprise mise à l'échelle de la vignette, marges comprises.
  const k = Math.min((W - 14 * echelle) / item.w, (H - 14 * echelle) / item.d);
  const w = item.w * k;
  const d = item.d * k;
  return (
    <Svg width={W} height={H}>
      <SvgRect
        x={(W - w) / 2}
        y={(H - d) / 2}
        width={w}
        height={d}
        rx={3}
        fill={c.blueSoft}
        stroke={c.blue}
        strokeWidth={1.2 * echelle}
      />
      {furnitureStrokes(furnKind(item.category), w, d).map((ligne, li) => (
        <React.Fragment key={li}>
          {ligne.slice(1).map((pt, pi) => (
            <SvgLine
              key={pi}
              x1={W / 2 + ligne[pi].x}
              y1={H / 2 + ligne[pi].y}
              x2={W / 2 + pt.x}
              y2={H / 2 + pt.y}
              stroke={c.blue}
              strokeWidth={1.1 * echelle}
              strokeLinecap="round"
            />
          ))}
        </React.Fragment>
      ))}
    </Svg>
  );
}

/**
 * UNE TUILE QUI SE LAISSE PRENDRE.
 *
 * Elle s'empare du toucher dès l'appui — sans quoi le premier mouvement
 * partirait à la liste et on ne pourrait jamais lever un meuble — mais elle
 * la REND tant qu'elle n'est pas levée : le catalogue défile comme avant.
 */
function TuileMeuble({
  item,
  onPick,
  onLever,
  onSuivre,
  onFin,
}: {
  item: CatalogItem;
  onPick: (item: CatalogItem) => void;
  onLever: (item: CatalogItem, page: { x: number; y: number }) => void;
  onSuivre: (item: CatalogItem, page: { x: number; y: number }) => void;
  onFin: (item: CatalogItem, page: { x: number; y: number } | null) => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const leve = React.useRef(false);
  const renonce = React.useRef(false);
  const minuteur = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const depart = React.useRef({ x: 0, y: 0 });
  const [enMain, setEnMain] = React.useState(false);
  // La tuile s'enfonce sous le doigt puis se soulève quand elle est prise :
  // c'est le seul retour qui dit « je l'ai » avant que la main ne bouge.
  const prise = React.useRef(new Animated.Value(0)).current;

  const eteindre = React.useCallback(() => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    leve.current = false;
    renonce.current = false;
    setEnMain(false);
    Animated.timing(prise, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [prise]);

  /*
    LES POSITIONS VIENNENT DE `nativeEvent`, PAS DE `gestureState`.

    Le geste se joue à l'ÉCHELLE DE LA PAGE : le meuble part d'une fenêtre
    et atterrit sur le plan qui est dessous. `gestureState` ne connaît que
    des déplacements ; `pageX/pageY` donnent le point, qui est la seule
    chose dont l'atterrissage ait besoin.
  */
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => !leve.current,
        onPanResponderGrant: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          depart.current = { x: pageX, y: pageY };
          leve.current = false;
          renonce.current = false;
          Animated.timing(prise, {
            toValue: 0.5,
            duration: ATTENTE_LEVEE,
            useNativeDriver: true,
          }).start();
          minuteur.current = setTimeout(() => {
            if (renonce.current) return;
            leve.current = true;
            setEnMain(true);
            haptic('leger');
            Animated.spring(prise, {
              toValue: 1,
              friction: 6,
              tension: 120,
              useNativeDriver: true,
            }).start();
            onLever(item, depart.current);
          }, ATTENTE_LEVEE);
        },
        onPanResponderMove: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          if (leve.current) {
            onSuivre(item, { x: pageX, y: pageY });
            return;
          }
          // Avant la levée, un vrai glissement appartient à la liste : on
          // renonce, et la tuile rendra la main à la première demande.
          if (
            !estUnTap(pageX - depart.current.x, pageY - depart.current.y)
          ) {
            renonce.current = true;
            if (minuteur.current) clearTimeout(minuteur.current);
            minuteur.current = null;
            Animated.timing(prise, {
              toValue: 0,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderRelease: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          const etaitLeve = leve.current;
          eteindre();
          if (etaitLeve) {
            onFin(item, { x: pageX, y: pageY });
            return;
          }
          if (
            !renonce.current &&
            estUnTap(pageX - depart.current.x, pageY - depart.current.y)
          ) {
            onPick(item);
          }
        },
        onPanResponderTerminate: () => {
          const etaitLeve = leve.current;
          eteindre();
          if (etaitLeve) onFin(item, null);
        },
      }),
    // Les rappels sont stables à la vie de la fenêtre : un PanResponder
    // reconstruit en cours de geste perd le toucher qu'il tenait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.key],
  );

  React.useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  return (
    <Animated.View
      accessibilityRole="button"
      accessibilityLabel={`${item.label}, ${fr(item.w, 2)} sur ${fr(
        item.d,
        2,
      )} mètres`}
      accessibilityHint="Toucher pour poser au centre d'une pièce, maintenir pour glisser sur le plan"
      style={[
        styles.catCard,
        enMain && styles.catCardEnMain,
        {
          transform: [
            {
              scale: prise.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 0.94, 1.1],
              }),
            },
          ],
        },
      ]}
      {...pan.panHandlers}>
      <FurnitureThumb item={item} />
      <Text style={styles.catName} numberOfLines={1}>
        {item.label}
      </Text>
      <Text style={styles.catDims}>
        {`${fr(item.w, 2)} × ${fr(item.d, 2)} m`}
      </Text>
    </Animated.View>
  );
}

export function FurnitureSheet({
  visible,
  quete,
  onQuete,
  onClose,
  onPick,
  onGlisser,
  onLacher,
  poseValide = true,
}: {
  visible: boolean;
  quete: string;
  onQuete: (q: string) => void;
  onClose: () => void;
  onPick: (item: CatalogItem) => void;
  /** Le meuble est en main, à ce point de l'écran. */
  onGlisser?: (item: CatalogItem, page: { x: number; y: number }) => void;
  /** Le doigt s'est levé : ici, ou nulle part si le geste a été interrompu. */
  onLacher?: (item: CatalogItem, page: { x: number; y: number } | null) => void;
  /**
   * Le meuble en main tomberait-il quelque part ?
   *
   * L'écran seul le sait — il voit le plan ET le doigt. Le fantôme s'en
   * sert pour le DIRE AVANT le lâcher : un refus qui n'arrive qu'après coup
   * se vit comme une panne, et l'on recommence trois fois le même geste.
   */
  poseValide?: boolean;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  const [enMain, setEnMain] = React.useState<CatalogItem | null>(null);
  const [doigt, setDoigt] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  /*
    LE CATALOGUE S'EFFACE, IL NE SE FERME PAS.

    Fermer la fenêtre romprait le toucher en cours — et le meuble tomberait
    au premier centimètre. On la rend seulement TRANSPARENTE : le plan, qui
    est dessous, réapparaît, et le doigt continue de tenir sa tuile.
  */
  const voile = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.timing(voile, {
      toValue: enMain ? 0 : 1,
      duration: enMain ? 160 : 130,
      useNativeDriver: true,
    }).start();
  }, [enMain, voile]);

  // Une fenêtre qu'on rouvre ne garde pas un meuble en main de la fois d'avant.
  React.useEffect(() => {
    if (!visible) {
      setEnMain(null);
      setDoigt(null);
    }
  }, [visible]);

  const lever = (item: CatalogItem, page: { x: number; y: number }) => {
    /* Le clavier de la recherche couvre la moitié basse de l'écran : on ne
       tire pas un meuble sur un plan qu'il cache. */
    Keyboard.dismiss();
    setEnMain(item);
    setDoigt(page);
    onGlisser?.(item, page);
  };
  const suivre = (item: CatalogItem, page: { x: number; y: number }) => {
    setDoigt(page);
    onGlisser?.(item, page);
  };
  const finir = (
    item: CatalogItem,
    page: { x: number; y: number } | null,
  ) => {
    setEnMain(null);
    setDoigt(null);
    onLacher?.(item, page);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View style={[styles.catVoile, { opacity: voile }]}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Ajouter un meuble</Text>
            <Text style={styles.catAide}>
              Touchez pour poser au centre, maintenez pour glisser sur le plan.
            </Text>
            <TextInput
              style={styles.catSearch}
              value={quete}
              onChangeText={onQuete}
              placeholder="Rechercher un meuble…"
              placeholderTextColor={teinte.inkFaint}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <ScrollView
              style={styles.catScroll}
              keyboardShouldPersistTaps="handled">
              {CATALOGUE.map((famille) => {
                const trouves = famille.items.filter((i) => matchItem(i, quete));
                if (trouves.length === 0) return null;
                return (
                  <View key={famille.name}>
                    <Text style={styles.elecFamily}>{famille.name}</Text>
                    <View style={styles.catGrid}>
                      {trouves.map((item) => (
                        <TuileMeuble
                          key={item.key}
                          item={item}
                          onPick={onPick}
                          onLever={lever}
                          onSuivre={suivre}
                          onFin={finir}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
      {/*
        LE MEUBLE EN MAIN — sous le doigt, jamais dessous au sens propre : il
        est décalé vers le haut, sinon le pouce cache exactement ce qu'on
        cherche à placer.
      */}
      {enMain && doigt ? (
        <View style={styles.catFantomeCadre} pointerEvents="none">
          <View
            style={[
              styles.catFantome,
              !poseValide && styles.catFantomeRefus,
              { left: doigt.x - 55, top: doigt.y - 96 },
            ]}>
            <FurnitureThumb item={enMain} echelle={1.5} />
            <Text style={styles.catFantomeNom} numberOfLines={1}>
              {poseValide ? enMain.label : 'Pas ici'}
            </Text>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
