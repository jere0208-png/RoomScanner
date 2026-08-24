import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackChevron } from '../components/BackChevron';
import { RetourGlisse } from '../components/RetourGlisse';
import { garderLeTravail } from '../ui/gardeTravail';
import { AlerteSortie } from '../components/AlerteSortie';
import {
  Animated,
  Easing,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { bounds, roomParts, totalArea, WALL_T } from '../geometry/floorplan';
import {
  checkElectrical,
  fixturePlacement,
  roomInputsOf,
  roomsInAlert,
  wallToRooms,
} from '../geometry/nfc15100';
import { useScanStore, type SavedScan, type ScanFolder } from '../store/scanStore';
import {
  ActionSheet,
  PromptSheet,
  type ActionData,
  type PromptData,
} from '../components/Sheet';
import { MoreDots } from '../components/MoreDots';

/**
 * Le dessin de l'état vide.
 *
 * Un écran vide qui n'affiche que du texte se lit comme une panne. Le même
 * écran avec un croquis se lit comme une invitation — et celui-ci n'est pas
 * un décor : c'est un plan au trait, exactement ce que l'app produira, posé
 * dans les teintes du thème pour ne pas jurer en mode sombre.
 */
function EmptyPlanArt({ c }: { c: Palette }) {
  return (
    <Svg width={132} height={104} viewBox="0 0 132 104">
      {/* La feuille */}
      <Path
        d="M14 12 h104 a4 4 0 0 1 4 4 v72 a4 4 0 0 1 -4 4 H14 a4 4 0 0 1 -4 -4 V16 a4 4 0 0 1 4 -4 z"
        fill={c.surfaceSunken}
        stroke={c.line}
        strokeWidth={1.5}
      />
      {/* Deux pièces et leur cloison, la porte laissée ouverte */}
      <Path
        d="M26 28 h80 v48 H26 z M74 28 v20 M74 60 v16"
        fill="none"
        stroke={c.lineStrong}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      {/* La cote extérieure, tirets compris : la signature du document */}
      <Line x1={26} y1={86} x2={106} y2={86} stroke={c.inkFaint} strokeWidth={1.2} />
      <Line x1={26} y1={83} x2={26} y2={89} stroke={c.inkFaint} strokeWidth={1.2} />
      <Line x1={106} y1={83} x2={106} y2={89} stroke={c.inkFaint} strokeWidth={1.2} />
      {/* Un appareil posé sur un mur, en bleu : l'app, c'est ça */}
      <Path d="M46 24 v8" stroke={c.blue} strokeWidth={3} strokeLinecap="round" />
      <Path
        d="M46 20 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0"
        fill={c.blue}
        opacity={0.9}
      />
    </Svg>
  );
}

const two = (n: number) => String(n).padStart(2, '0');
function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} · ${two(
    d.getHours(),
  )}h${two(d.getMinutes())}`;
}

/**
 * LE DÉCOUPAGE D'UN RELEVÉ, CALCULÉ UNE FOIS.
 *
 * Chaque ligne de la liste redessine le plan en vignette et énumère ses
 * pièces sous son nom : deux appels à `roomParts()` — le découpage du
 * logement, contour de chaque pièce compris — PAR LIGNE ET PAR RENDU. À
 * trente relevés, cela faisait soixante découpages de plan à chaque lettre
 * tapée dans la recherche, à chaque appui, à chaque ouverture de menu.
 *
 * Or un scan enregistré est immuable : le retoucher en produit un autre
 * objet. Sa RÉFÉRENCE est donc une clé de cache exacte — pas une
 * approximation qu'il faudrait invalider à la main —, et une `WeakMap`
 * laisse partir l'entrée avec le scan qu'on supprime.
 */
const decoupages = new WeakMap<
  SavedScan,
  { parts: ReturnType<typeof roomParts>; details: string }
>();

function decoupageDe(item: SavedScan) {
  const vu = decoupages.get(item);
  if (vu) return vu;
  const parts = roomParts(item.walls, item.rooms);
  const calcule = { parts, details: ligneDetails(item, parts) };
  decoupages.set(item, calcule);
  return calcule;
}

/** Ce qu'un scan raconte en une ligne : pièces, murs, surface, objets. */
function ligneDetails(
  item: SavedScan,
  parts: ReturnType<typeof roomParts>,
): string {
  const total = totalArea(parts);
  return [
    ...(parts.length > 1 ? [`${parts.length} pièces`] : []),
    `${item.walls.length} murs`,
    ...(total
      ? [`${total.exact ? '' : '≈ '}${total.area.toFixed(1).replace('.', ',')} m²`]
      : []),
    ...(item.objects.length > 0 ? [`${item.objects.length} objets`] : []),
  ].join(' · ');
}

/**
 * Appui long au bout duquel un scan se décolle.
 *
 * Une seconde, c'était long : le doigt croit que rien ne se passe et repart.
 * Une demi-seconde suffit à distinguer l'appui long du simple appui.
 */
/**
 * LE TEMPS QU'ON LAISSE AU GESTE POUR SE DÉCLARER.
 *
 * Relevé du chantier : « les fichiers deviennent des bulles pour le
 * déplacement mais trop facilement, le temps de poser le doigt pour scroll
 * il se cible ». Une demi-seconde, c'est le délai d'un appui long
 * ordinaire ; sur une liste qui défile, c'est trop court — le doigt qui se
 * pose pour glisser n'a pas fini son mouvement que la bulle s'est levée.
 */
export const HOLD_MS = 700;

/** Au-delà, ce n'est plus une main posée : c'est un glissement. */
const BOUGE_MAX = 8;

/**
 * CE DOIGT PREND-IL ENCORE LE RELEVÉ ?
 *
 * Le compte à rebours démarrait au contact et RIEN ne l'arrêtait : la
 * `ScrollView` finit bien par annuler le toucher de ses enfants, mais trop
 * tard — la bulle était déjà en l'air. On surveille donc nous-mêmes : huit
 * points d'écart et l'on renonce. Moins, c'est le tremblement d'une main
 * posée ; plus, c'est une intention de faire défiler.
 */
export function prendLeRelevé(
  depart: { x: number; y: number },
  courant: { x: number; y: number },
): boolean {
  return Math.hypot(courant.x - depart.x, courant.y - depart.y) <= BOUGE_MAX;
}
/**
 * La clé de la zone « hors dossier » : l'en-tête, quand on est dedans.
 *
 * Pas la chaîne vide — c'est déjà, dans `byFolder`, la clé des scans qui ne
 * sont dans aucun dossier, et deux sens pour une même clé finissent toujours
 * par se croiser.
 */
const RACINE = '@racine';
const THUMB_W = 78;
const THUMB_H = 62;

/**
 * L'aperçu du plan, redessiné à la volée.
 *
 * Pas une capture d'écran : le plan est une liste de murs, on le retrace en
 * quelques traits dans 54 px. Rien à stocker, rien à invalider — un scan
 * retouché montre son nouveau contour à l'ouverture suivante de la liste.
 */
function PlanThumb({ scan, c }: { scan: SavedScan; c: Palette }) {
  const { parts } = decoupageDe(scan);
  // Les mêmes constats que sur le plan : une pièce en défaut sort en rouge
  // ici aussi, sinon la vignette raconterait autre chose que le plan.
  const alertes = (() => {
    try {
      const inputs = roomInputsOf(scan.rooms, parts);
      const fx = scan.fixtures ?? [];
      return roomsInAlert(
        checkElectrical(
          inputs,
          fx,
          wallToRooms(inputs),
          fixturePlacement(fx, scan.walls, inputs),
        ),
      );
    } catch {
      return new Set<string>();
    }
  })();
  const roomsOfWall = new Map<string, string[]>();
  for (const r of scan.rooms) {
    for (const id of r.wallIds ?? []) {
      roomsOfWall.set(id, [...(roomsOfWall.get(id) ?? []), r.id]);
    }
  }
  // Le plan ENTIER, vu de dessus, redressé sur sa trame : une vignette de
  // travers ne ressemble pas au plan qu'on va ouvrir.
  const b = bounds(scan.walls);
  const pad = 5;
  const w = Math.max(0.5, b.maxX - b.minX);
  const h = Math.max(0.5, b.maxZ - b.minZ);
  const k = Math.min((THUMB_W - pad * 2) / w, (THUMB_H - pad * 2) / h);
  const px = (x: number) =>
    pad + (x - b.minX) * k + (THUMB_W - pad * 2 - w * k) / 2;
  const py = (z: number) =>
    pad + (z - b.minZ) * k + (THUMB_H - pad * 2 - h * k) / 2;
  const epais = Math.max(1.6, WALL_T * k);
  return (
    <Svg width={THUMB_W} height={THUMB_H}>
      {parts.map((part) =>
        part.surface ? (
          <Polygon
            key={part.roomId}
            points={part.surface.pts.map((p) => `${px(p.x)},${py(p.z)}`).join(' ')}
            fill={c.surfaceSunken}
          />
        ) : null,
      )}
      {scan.walls.map((wall) => (
        <Line
          key={wall.id}
          x1={px(wall.a.x)}
          y1={py(wall.a.z)}
          x2={px(wall.b.x)}
          y2={py(wall.b.z)}
          stroke={
            (roomsOfWall.get(wall.id) ?? []).some((id) => alertes.has(id))
              ? '#8E1B1B'
              : c.ink
          }
          strokeWidth={epais}
          strokeLinecap="butt"
        />
      ))}
      {/* Les ouvertures percent le mur : c'est ce qui fait reconnaître un
          plan d'un coup d'œil. */}
      {scan.openings.map((o) => (
        <Line
          key={o.id}
          x1={px(o.a.x)}
          y1={py(o.a.z)}
          x2={px(o.b.x)}
          y2={py(o.b.z)}
          stroke={o.type === 'window' ? c.sky : c.blue}
          strokeWidth={epais}
          strokeLinecap="butt"
        />
      ))}
      {parts.map((part) => {
        const nom = scan.rooms.find((r) => r.id === part.roomId)?.name ?? '';
        if (!nom || !part.surface) return null;
        return (
          <SvgText
            key={`n${part.roomId}`}
            x={px(part.labelAt.x)}
            y={py(part.labelAt.z) + 2}
            fill={c.inkSoft}
            fontSize={6}
            fontWeight="700"
            textAnchor="middle">
            {nom.length > 9 ? `${nom.slice(0, 8)}…` : nom}
          </SvgText>
        );
      })}
    </Svg>
  );
}

/**
 * LES DEUX TEINTES D'UN DOSSIER, selon qu'on le vise ou non.
 *
 * La façade passait au ciel quand le doigt la survolait — un cyan clair. Sur
 * fond blanc, la cible de dépôt se DILUAIT au moment précis où elle doit
 * s'affirmer : on lâchait sans être sûr d'avoir visé juste. Le survol fonce
 * donc les deux plans, et c'est la taille qui crie « c'est ici ».
 *
 * Exportée parce qu'un banc la vérifie : la façade doit trancher sur le dos
 * dans les deux états, sinon le dossier redevient une tache bleue.
 */
const assombrir = (hex: string, k: number) => {
  const brut = hex.replace('#', '');
  const canaux = [0, 2, 4].map((i) => parseInt(brut.slice(i, i + 2), 16));
  return `#${canaux
    .map((v) =>
      Math.round(v * (1 - k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

export const teintesDossier = (vise: boolean, c: Palette) =>
  vise
    ? { back: assombrir(c.blueDark, 0.45), front: assombrir(c.blue, 0.32) }
    : { back: c.blueDark, front: c.blue };

/**
 * LA DURÉE DE LA CHUTE.
 *
 * 760 ms, c'était un clignement : on lâche le scan en regardant le doigt,
 * pas le dossier, et le mouvement était fini avant que l'œil arrive. Une
 * seconde et demie laisse le temps de le rattraper du coin de l'œil.
 */
export const CHUTE_MS = 1500;

/** Un groupe SVG qu'on peut animer : la façade pivote, la feuille tombe. */
const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * LE DOSSIER QUI AVALE LE SCAN.
 *
 * Un scan lâché sur un dossier disparaissait de la liste : c'est juste, et
 * ça ne se voit pas. On ne sait pas s'il est RANGÉ ou PERDU — et sur un
 * dossier de chantier, le doute revient à rouvrir pour vérifier.
 *
 * Le dossier joue donc le geste : une feuille tombe entre le dos et la
 * façade, la façade se relève pour la laisser passer, puis se referme et le
 * dossier tressaute. C'est le même dessin qu'avant, à la même taille — on ne
 * change pas une icône que l'utilisateur a appris à viser —, simplement il
 * est fait de trois plans au lieu de deux.
 *
 * L'animation ne se déclenche PAS au survol : au survol, on hésite encore.
 * Elle part au dépôt, une fois, et dit ce qui vient de se passer.
 */
export function FolderGlyph({
  back,
  front,
  /** La feuille : 0 = rien, 1 = un tour d'animation à jouer. */
  chute,
  page,
}: {
  back: string;
  front: string;
  chute?: Animated.Value;
  page?: string;
}) {
  const t = chute ?? new Animated.Value(0);
  return (
    <Svg width={72} height={58} viewBox="0 0 72 58">
      {/* Le dos du dossier : il ne bouge jamais. */}
      <Path
        d="M3 12 a7 7 0 0 1 7 -7 h15.5 a5 5 0 0 1 3.9 1.9 l4.2 5.3 h31.4 a7 7 0 0 1 7 7 v31.8 a7 7 0 0 1 -7 7 H10 a7 7 0 0 1 -7 -7 z"
        fill={back}
      />
      {/*
        UNE LIASSE, PAS UNE FEUILLE.

        Une seule page tombait, et l'œil n'en voyait rien : le geste se fait
        au doigt, en regardant le scan qu'on lâche, pas le dossier. Trois
        feuilles s'engouffrent donc l'une après l'autre, DÉCALÉES d'un
        cinquième de l'animation chacune — c'est le décalage qui fait la
        liasse ; trois pages qui tombent ensemble ne feraient qu'une page
        épaisse.

        Elles ne partent pas du même point non plus : quelques pixels
        d'écart en abscisse, comme des feuilles mal alignées qu'on jette
        dans une chemise.
      */}
      {[0, 1, 2].map((i) => {
        const retard = i * 0.19;
        // Le fondu de la dernière feuille doit tenir DANS l'animation :
        // au-delà de 1, elle s'évanouit d'un coup à la fin du geste.
        const fin = Math.min(0.86, 0.5 + retard);
        return (
          <AnimatedG
            key={i}
            opacity={t.interpolate({
              inputRange: [retard, retard + 0.06, fin, fin + 0.14],
              outputRange: [0, 1, 1, 0],
              extrapolate: 'clamp',
            })}
            // La descente se pilote par un NOMBRE, pas par une chaîne de
            // transformation : interpoler « translate(0 -26) scale(1) » vers
            // « translate(0 12) » exige le même nombre de composants de part
            // et d'autre, et la moindre distraction fait tomber le rendu
            // entier.
            /*
              LA COURSE VISIBLE EST ÉTROITE — d'où son étirement.

              Une feuille n'est vue qu'entre le haut du dossier et le bord
              de la façade : dix-sept points. Elle part donc de plus haut et
              s'enfonce plus bas que le strict nécessaire, pour traverser
              cette fenêtre lentement plutôt que de la franchir en deux
              images.
            */
            y={t.interpolate({
              inputRange: [retard, retard + 0.46, 1],
              outputRange: [-32, 16, 16],
              extrapolate: 'clamp',
            })}>
            <Rect
              x={20 + (i - 1) * 4}
              y={12}
              width={32}
              height={26}
              rx={4}
              fill={page ?? '#FFFFFF'}
              stroke="rgba(11,13,18,0.12)"
              strokeWidth={1}
            />
            {/* Deux traits : c'est un document, pas une carte blanche. */}
            <Path
              d={`M${26 + (i - 1) * 4} 21 h20 M${26 + (i - 1) * 4} 27 h14`}
              stroke="rgba(11,13,18,0.25)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </AnimatedG>
        );
      })}
      {/* La façade : elle bascule sur son bord bas pour laisser entrer la
          feuille, puis se referme. */}
      <AnimatedG
        originX={36}
        originY={56}
        rotation={t.interpolate({
          inputRange: [0, 0.18, 0.55, 0.8, 1],
          outputRange: [0, -13, -13, 3, 0],
          extrapolate: 'clamp',
        })}>
        <Path
          d="M3 22 h66 v26.9 a7 7 0 0 1 -7 7 H10 a7 7 0 0 1 -7 -7 z"
          fill={front}
        />
      </AnimatedG>
    </Svg>
  );
}

interface TileProps {
  folder: ScanFolder;
  count: number;
  over: boolean;
  /** Incrémenté à chaque scan rangé ICI : c'est le signal de l'animation. */
  recu: number;
  lift: Animated.Value;
  styles: ReturnType<typeof getStyles>;
  palette: Palette;
  onOpen: () => void;
  onMenu: () => void;
  bind: (node: View | null) => void;
}

/**
 * Une tuile de dossier.
 *
 * Elle grossit dès qu'un scan est décollé, et davantage encore quand le
 * doigt la survole : c'est le seul moyen de faire comprendre, sans une
 * ligne de texte, qu'on peut lâcher là.
 */
function FolderTile({
  folder,
  count,
  over,
  recu,
  lift,
  styles,
  palette,
  onOpen,
  onMenu,
  bind,
}: TileProps) {
  const scale = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, over ? 1.26 : 1.12],
  });
  /*
    LA CHUTE SE JOUE UNE FOIS, quand un scan atterrit ici.

    Elle part du signal `recu` plutôt que du survol : au survol on hésite
    encore, et une feuille qui tombe à chaque passage du doigt raconterait
    un rangement qui n'a pas eu lieu.
  */
  const chute = useRef(new Animated.Value(0)).current;
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    chute.setValue(0);
    Animated.timing(chute, {
      toValue: 1,
      duration: CHUTE_MS,
      easing: Easing.out(Easing.cubic),
      // Les attributs SVG ne passent pas par le fil natif.
      useNativeDriver: false,
    }).start();
  }, [recu, chute]);
  return (
    <Animated.View style={[styles.tile, { transform: [{ scale }] }]}>
      <View ref={bind} collapsable={false}>
        <TouchableOpacity
          activeOpacity={0.8}
          // Le dossier s'annonce AVEC SON COMPTE : un lecteur d'écran qui
          // énumère le contenu de la tuile dit « Chantier, 3 » sans qu'on
          // sache si trois est un nombre de scans ou un rang.
          accessibilityLabel={`Dossier ${folder.name}, ${count} scan${
            count > 1 ? 's' : ''
          }`}
          onPress={onOpen}
          // Un dossier ne se PREND pas, il reçoit : rien ne se dispute son
          // appui long, et trois points sur une tuile de 96 points
          // encombraient la cible qu'on vise justement avec un scan au bout
          // du doigt. Le « … » reste aux relevés, dont l'appui long est pris
          // par le rangement.
          onLongPress={onMenu}
          style={styles.tileTouch}>
          <View style={styles.tileGlyph}>
            <FolderGlyph
              back={teintesDossier(over, palette).back}
              front={teintesDossier(over, palette).front}
              chute={chute}
              /* Une feuille est BLANCHE, quel que soit le thème : la
                 teinte de surface suit le mode sombre, et l'animation y
                 faisait tomber des feuilles noires dans un dossier bleu —
                 on ne voyait plus rien tomber du tout. */
              page="#FFFFFF"
            />
            {count > 0 && (
              <View style={styles.tileBadge}>
                <Text style={styles.tileBadgeText}>{count}</Text>
              </View>
            )}
          </View>
          <Text style={styles.tileName} numberOfLines={2}>
            {folder.name}
          </Text>
        </TouchableOpacity>
      </View>

    </Animated.View>
  );
}

interface RowProps {
  item: SavedScan;
  pris: boolean;
  fige: boolean;
  lift: Animated.Value;
  styles: ReturnType<typeof getStyles>;
  palette: Palette;
  onOpen: () => void;
  /** Le « … » : renommer, dupliquer, sortir du dossier, supprimer. */
  onMenu: () => void;
  onHold: (at: { x: number; y: number }) => void;
  /** Le doigt a bougé : au-delà d'un cheveu, il fait défiler. */
  onHoldMove: (at: { x: number; y: number }) => void;
  onRelease: (deposer: boolean) => void;
}

/**
 * Une ligne de scan.
 *
 * Composant à part entière, et pas une fonction interne au rendu : définie
 * dedans, React en voyait un type neuf à chaque changement d'état et
 * démontait la ligne — le doigt perdait en plein geste celle qu'il tenait.
 *
 * Décollée, elle RÉTRÉCIT et s'efface : elle devient le fantôme de ce qu'on
 * déplace, et laisse toute la place aux dossiers qui, eux, grossissent.
 */
function ScanRow({
  item,
  pris,
  fige,
  lift,
  styles,
  palette,
  onOpen,
  onMenu,
  onHold,
  onHoldMove,
  onRelease,
}: RowProps) {
  /*
    LA LIGNE NE SE DÉPLACE PLUS : ELLE LAISSE SA PLACE.

    Elle rétrécissait sur elle-même et suivait le doigt en hauteur — ni
    vraiment tenue, ni vraiment posée : on croyait manipuler la liste, pas un
    objet. Ce qu'on tient maintenant, c'est une BULLE qui flotte au-dessus de
    l'écran (voir plus bas) ; la ligne, elle, reste où elle est et s'efface,
    comme le trou laissé par ce qu'on a pris.
  */
  const anim = pris
    ? {
        opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.28] }),
      }
    : null;
  return (
    <Animated.View
      style={[styles.row, pris && styles.rowGhost, anim]}
      onTouchStart={(e) =>
        onHold({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
      }
      onTouchMove={(e) =>
        onHoldMove({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })
      }
      onTouchEnd={() => onRelease(true)}
      onTouchCancel={() => onRelease(false)}>
      {/*
        L'APPUI LONG NE FAIT PLUS QU'UNE CHOSE : LEVER LA BULLE.

        Il ouvrait aussi le menu, et les deux se disputaient le même doigt :
        la feuille montait à 420 ms, la bulle se levait à 500 ms derrière
        elle, et le scan restait décollé sous une fenêtre qu'on n'avait pas
        demandée. Un geste = une intention ; celle de l'appui long, c'est
        prendre le relevé pour le ranger. Ce qu'on peut FAIRE du relevé est
        sous le « … », visible en permanence — donc trouvable sans rien
        savoir d'avance.
      */}
      {/* Le geste PRINCIPAL de cette liste n'était pas nommé : « … » et
          « Nouveau dossier » l'étaient, mais pas ouvrir un relevé. Un
          lecteur d'écran annonçait le contenu de la ligne sans jamais dire
          ce qu'un appui ferait. */}
      <TouchableOpacity
        style={styles.rowMain}
        activeOpacity={0.75}
        disabled={fige}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${item.name}`}
        onPress={onOpen}>
        <View style={styles.thumb}>
          <PlanThumb scan={item} c={palette} />
        </View>
        <View style={styles.rowTexts}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          {/* Le client passe AVANT la date : c'est ce qu'on cherche. */}
          {item.client || item.address ? (
            <Text style={styles.rowClient} numberOfLines={1}>
              {[item.client, item.address].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <Text style={styles.rowSub}>{formatDate(item.updatedAt)}</Text>
          <Text style={styles.rowDetails}>{decoupageDe(item).details}</Text>
        </View>
      </TouchableOpacity>
      {!pris && (
        <TouchableOpacity
          style={styles.more}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          accessibilityLabel={`Options de ${item.name}`}
          onPress={onMenu}>
          <MoreDots size={20} color={palette.inkSoft} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export function LibraryScreen() {
  const saves = useScanStore((s) => s.saves);
  const folders = useScanStore((s) => s.folders);
  const setScreen = useScanStore((s) => s.setScreen);
  const openSave = useScanStore((s) => s.openSave);
  const dirty = useScanStore((s) => s.dirty);
  const currentSaveId = useScanStore((s) => s.currentSaveId);
  const commitCurrent = useScanStore((s) => s.commitCurrent);

  /*
    OUVRIR UN AUTRE PLAN NE JETTE PAS CELUI QU'ON TIENT.

    Trouvé en enchaînant les écrans comme on le fait sur un chantier : on
    rouvre un relevé, on ajoute un WC, on revient ici prendre un autre
    dossier — et le WC n'a jamais existé.

    C'est le défaut de la flèche de retour, corrigé ailleurs, qui revenait
    par ce chemin-ci : une garde à un seul endroit ne suffit pas quand deux
    gestes mènent dehors. La question est donc la même, avec les mêmes
    issues et dans le même ordre — enregistrer d'abord, jeter ensuite,
    rester enfin.

    Elle ne se pose pas quand il n'y a rien à perdre, ni quand on rouvre le
    plan qu'on tient déjà : une confirmation inutile est une confirmation
    qu'on apprend à balayer sans lire.
  */
  const ouvrirLeScan = (id: string) =>
    garderLeTravail({
      /*
        LA QUESTION SE POSE AU MILIEU, dans sa propre page.

        Elle vivait dans la feuille commune, qui monte du bas : c'est ce
        qu'on veut d'un menu, qu'on ouvre par curiosité et qu'on referme
        sans conséquence. Ici, l'appui suivant décide du sort du travail —
        relevé du patron : « le pop-up doit être centré et doit afficher une
        belle page ». Elle garde le MÊME contenu (`garderLeTravail` décide
        de tout), seul son écrin change.
      */
      demander: setAlerteSortie,
      // Rouvrir le plan qu'on tient déjà ne perd rien : on est dessus.
      dirty: dirty && id !== currentSaveId,
      message:
        'Le plan ouvert a été modifié. Ce que vous venez d’y faire sera ' +
        'perdu si vous en ouvrez un autre.',
      jeter: 'Ouvrir sans enregistrer',
      enregistrer: commitCurrent,
      partir: () => openSave(id),
    });

  const deleteSave = useScanStore((s) => s.deleteSave);
  const addFolder = useScanStore((s) => s.addFolder);
  const renameFolder = useScanStore((s) => s.renameFolder);
  const removeFolder = useScanStore((s) => s.removeFolder);
  const moveToFolder = useScanStore((s) => s.moveToFolder);
  const renameSave = useScanStore((s) => s.renameSave);
  const duplicateSave = useScanStore((s) => s.duplicateSave);
  const placeRendue = useScanStore((s) => s.placeRendue);
  const palette = useTheme();
  const styles = getStyles(palette);

  /*
    LA SUPPRESSION N'EST PLUS ARMÉE, ELLE EST RANGÉE.

    Une croix au bord de chaque ligne s'armait au premier appui et
    supprimait au second : deux appuis, mais tous deux au même endroit, et
    cet endroit était sur le trajet du pouce qui fait défiler. Elle vit
    maintenant au fond du « … », en rouge, là où on ne tombe pas dessus par
    accident — c'est le même nombre de gestes, et aucun ne se fait au bord
    d'une liste qui bouge.
  */

  /**
   * CHERCHER ET TRIER — à trente relevés, faire défiler ne suffit plus.
   *
   * On tape trois lettres du nom, du client ou de l'adresse ; la recherche
   * balaie les trois, parce que personne ne se souvient sous lequel il a
   * rangé son chantier. Et le tri par nom sert dès qu'on nomme ses
   * relevés — par date, un dossier repris hier remonte en tête et on ne
   * le retrouve plus où on l'avait laissé.
   */
  const [quete, setQuete] = useState('');
  const [tri, setTri] = useState<'date' | 'nom'>('date');

  // Dossier ouvert : on n'affiche plus que son contenu.
  const [inside, setInside] = useState<string | null>(null);
  const byFolder = useMemo(() => {
    const m = new Map<string, SavedScan[]>();
    for (const s of saves) {
      const key = s.folderId ?? '';
      const list = m.get(key) ?? [];
      list.push(s);
      m.set(key, list);
    }
    return m;
  }, [saves]);
  const dossierOuvert = folders.find((f) => f.id === inside) ?? null;
  const liste = useMemo(() => {
    const brute = dossierOuvert
      ? byFolder.get(dossierOuvert.id) ?? []
      : byFolder.get('') ?? [];
    const q = quete.trim().toLowerCase();
    // Une recherche cherche PARTOUT : dans un dossier ouvert comme à la
    // racine, elle porte sur toute la bibliothèque — sinon il faudrait
    // savoir d'avance où chercher, ce qui est précisément le problème.
    const base = q ? saves : brute;
    const filtre = q
      ? base.filter((x) =>
          [x.name, x.client ?? '', x.address ?? '']
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : base;
    return [...filtre].sort((a, b) =>
      tri === 'nom'
        ? a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        : b.updatedAt - a.updatedAt,
    );
  }, [byFolder, dossierOuvert, saves, quete, tri]);

  // ------------------------------------------------------- glisser-déposer
  //
  // Le doigt tient le scan une demi-seconde, il se décolle, et la liste
  // cesse de défiler tant qu'on le tient : sans ça, le geste de déplacement
  // et celui de défilement se disputent le même mouvement vertical.
  //
  // Les cadres des dossiers sont mesurés À L'ÉCRAN au moment où le scan se
  // décolle. Les mesurer plus tôt ne servirait à rien (la liste peut avoir
  // défilé), plus tard non plus (il faut savoir survoler dès le premier
  // pixel de mouvement).
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /** Combien de scans ont atterri dans chaque dossier depuis l'ouverture. */
  const [ranges, setRanges] = useState<Record<string, number>>({});
  const dragRef = useRef<string | null>(null);
  const overRef = useRef<string | null>(null);
  const shift = useRef(new Animated.Value(0)).current;
  /** Où flotte la bulle, en coordonnées d'écran. */
  const bulle = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  /** Le dernier point touché : c'est de là que la bulle se lève. */
  const doigt = useRef({ x: 0, y: 0 });
  const lift = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zones = useRef<
    { id: string; top: number; bottom: number; left: number; right: number }[]
  >([]);
  const tileRefs = useRef(new Map<string, View | null>());

  const mesurer = () => {
    zones.current = [];
    tileRefs.current.forEach((node, id) => {
      node?.measureInWindow((x, y, w, h) => {
        // Cible élargie de 12 px : viser une icône au doigt, ce n'est pas
        // viser un pixel.
        zones.current.push({
          id,
          top: y - 12,
          bottom: y + h + 12,
          left: x - 12,
          right: x + w + 12,
        });
      });
    });
  };

  const stopHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const endDrag = (deposer: boolean) => {
    const scan = dragRef.current;
    const cible = overRef.current;
    stopHold();
    dragRef.current = null;
    overRef.current = null;
    setDragId(null);
    setOver(null);
    shift.setValue(0);
    Animated.timing(lift, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
    if (deposer && scan && cible) {
      moveToFolder(scan, cible === RACINE ? null : cible);
      if (cible === RACINE) return;
      // Le dossier joue sa chute : c'est ce qui dit que le scan est RANGÉ,
      // et non perdu quelque part entre deux listes.
      setRanges((r) => ({ ...r, [cible]: (r[cible] ?? 0) + 1 }));
    }
  };

  const pan = useRef(
    PanResponder.create({
      // Tant que rien n'est décollé, la liste garde la main : c'est elle qui
      // doit défiler.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => dragRef.current !== null,
      onPanResponderMove: (e, g) => {
        if (!dragRef.current) return;
        shift.setValue(g.dy);
        const x = e.nativeEvent.pageX;
        const y = e.nativeEvent.pageY;
        doigt.current = { x, y };
        // La bulle suit le doigt en X ET EN Y : on la pose où l'on veut.
        bulle.setValue({ x, y });
        const zone = zones.current.find(
          (z) => y >= z.top && y <= z.bottom && x >= z.left && x <= z.right,
        );
        const id = zone?.id ?? null;
        if (id !== overRef.current) {
          overRef.current = id;
          setOver(id);
        }
      },
      onPanResponderRelease: () => endDrag(true),
      onPanResponderTerminate: () => endDrag(false),
    }),
  ).current;

  /** Le doigt se pose : au bout d'une demi-seconde, le scan se décolle. */
  const beginHold = (id: string, at?: { x: number; y: number }) => {
    stopHold();
    if (at) doigt.current = at;
    /*
      RIEN À VISER, PAS DE BULLE — mais « dedans » compte comme une cible.

      Le geste ne se levait qu'à la racine, devant des dossiers. Dans un
      dossier ouvert il ne produisait rien : un appui long qui ne répond pas
      se lit comme une panne de l'app, pas comme une absence de destination.
      Dedans, la destination existe — c'est la sortie, et elle est en haut.
    */
    if (!dossierOuvert && folders.length === 0) return;
    holdTimer.current = setTimeout(() => {
      mesurer();
      dragRef.current = id;
      setDragId(id);
      // Elle naît là où le doigt se trouve, pas au coin de l'écran.
      bulle.setValue({ ...doigt.current });
      Animated.spring(lift, {
        toValue: 1,
        damping: 15,
        stiffness: 220,
        mass: 0.7,
        useNativeDriver: true,
      }).start();
    }, HOLD_MS);
  };

  /** Le doigt se lève : on dépose, ou on renonce. */
  const releaseRow = (deposer: boolean) => {
    stopHold();
    if (dragRef.current) endDrag(deposer);
  };


  // Nos fenêtres, pas celles du système : même typographie, mêmes rayons,
  // même bleu — et une icône par choix, qui se lit plus vite qu'un mot.
  const [menu, setMenu] = useState<ActionData | null>(null);
  /**
   * L'ALERTE DE SORTIE — la seule fenêtre de l'app posée au MILIEU.
   *
   * Elle porte la même donnée qu'une feuille (`garderLeTravail` décide du
   * titre, de la phrase et de l'ordre des deux issues) ; c'est son écrin
   * qui diffère, parce que ce qui se décide là ne se balaie pas d'un revers
   * de pouce.
   */
  const [alerteSortie, setAlerteSortie] = useState<ActionData | null>(null);
  const [prompt, setPrompt] = useState<PromptData | null>(null);

  /*
    UNE FENÊTRE QUI S'OUVRE REPOSE CE QU'ON TENAIT.

    Relevé du chantier : « sa réduction est permanente, même après avoir
    fermé le menu ». C'est le cycle tactile qui se rompt — quand une fenêtre
    modale s'ouvre par-dessus, la vue du dessous ne reçoit ni fin ni
    annulation de toucher, et le scan restait décollé pour toujours, effacé
    au milieu de sa liste.

    Le menu et la saisie reposent donc ce qui était en l'air : c'est le seul
    endroit qui voit passer les deux.
  */
  useEffect(() => {
    if (!menu && !prompt) return;
    stopHold();
    if (dragRef.current) endDrag(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, prompt]);

  const folderMenu = (f: ScanFolder) =>
    setMenu({
      title: f.name,
      subtitle: `${(byFolder.get(f.id) ?? []).length} scan${
        (byFolder.get(f.id) ?? []).length > 1 ? 's' : ''
      } rangés ici.`,
      actions: [
        {
          label: 'Renommer',
          icon: 'renommer',
          onPress: () =>
            setPrompt({
              title: 'Nom du dossier',
              subtitle: 'Il ne sert qu’au rangement : aucun fichier n’est déplacé.',
              value: f.name,
              onSubmit: (t) => renameFolder(f.id, t),
            }),
        },
        {
          label: 'Supprimer le dossier',
          hint: 'Les scans qu’il contient reviennent à la racine.',
          icon: 'supprimer',
          danger: true,
          onPress: () => {
            removeFolder(f.id);
            if (inside === f.id) setInside(null);
          },
        },
      ],
    });

  /** Ce qu'on peut faire d'un relevé, sans l'ouvrir. */
  const scanMenu = (item: SavedScan) =>
    setMenu({
      title: item.name,
      subtitle: [item.client, item.address].filter(Boolean).join(' · ') ||
        undefined,
      actions: [
        {
          label: 'Renommer',
          icon: 'renommer',
          onPress: () =>
            setPrompt({
              title: 'Nom du scan',
              value: item.name,
              onSubmit: (t) => renameSave(item.id, t),
            }),
        },
        {
          label: 'Dupliquer',
          hint: 'Pour chiffrer deux variantes du même logement.',
          icon: 'scinder',
          onPress: () => duplicateSave(item.id),
        },
        // Sortir d'un dossier n'a de sens que dedans : ailleurs, la ligne
        // porterait un choix sans effet.
        ...(item.folderId
          ? [
              {
                label: 'Sortir du dossier',
                hint: 'Le scan revient à la racine de la bibliothèque.',
                icon: 'sortir' as const,
                onPress: () => moveToFolder(item.id, null),
              },
            ]
          : []),
        {
          label: 'Supprimer',
          icon: 'supprimer',
          danger: true,
          onPress: () => deleteSave(item.id),
        },
      ],
    });

  const vide = saves.length === 0 && folders.length === 0;

  return (
    /*
      LE BORD GAUCHE REFERME LE DOSSIER, comme la flèche — et sur toute la
      hauteur. En ENVELOPPE plutôt qu'en bande : la liste se touche, et une
      bande posée par-dessus mangerait les vingt-quatre premiers points de
      chaque vignette sans que rien ne l'explique.
    */
    <RetourGlisse
      onRetour={() => (dossierOuvert ? setInside(null) : setScreen('home'))}
      style={styles.container}>
    <View style={styles.container} {...pan.panHandlers}>
      <View
        style={[styles.headerRow, over === RACINE && styles.headerRowOver]}
        collapsable={false}
        ref={(node: View | null) => {
          // Elle n'est une cible que dans un dossier : à la racine, un scan
          // lâché sur le titre n'aurait nulle part où aller.
          if (dossierOuvert) tileRefs.current.set(RACINE, node);
          else tileRefs.current.delete(RACINE);
        }}>
        <TouchableOpacity
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          // Le chevron était un caractère, et c'est lui qui nommait le
          // bouton pour un lecteur d'écran. Devenu tracé, il ne dit plus
          // rien : le nom s'écrit.
          accessibilityLabel="Retour"
          onPress={() => (dossierOuvert ? setInside(null) : setScreen('home'))}>
          <BackChevron color={palette.ink} />
        </TouchableOpacity>
        {/*
          LE TITRE SUIT LE BOUTON DE RETOUR, LA PASTILLE LE SUIT.

          Il a été centré sur l'écran le temps d'une version, la pastille
          accrochée à son bord droit : une belle mécanique dont personne
          n'avait besoin ici. Sur cet écran-là, le titre est un TITRE DE
          LISTE — il commence à gauche, après le retour, comme le nom d'un
          dossier qu'on vient d'ouvrir. C'est le bouton de l'accueil qui
          demandait ce centrage, et lui seul.
        */}
        <Text style={styles.title} numberOfLines={1}>
          {dossierOuvert ? dossierOuvert.name : 'Mes scans'}
        </Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{liste.length}</Text>
        </View>
      </View>

      {/*
        LA PLACE RENDUE, DITE UNE FOIS.

        Chaque relevé écrit un modèle 3D de plusieurs mégaoctets, et aucune
        version d'avant n'en effaçait jamais un seul : le téléphone du
        chantier a fini par refuser une mise à jour, faute de place.
        L'app balaie maintenant les modèles orphelins à l'ouverture — et
        elle le DIT, sinon rien ne distingue le ménage de l'inaction.
      */}
      {placeRendue !== null && (
        <View style={styles.menageRow}>
          <Text style={styles.menageTexte} numberOfLines={2}>
            {`${Math.round(placeRendue / 1e6)} Mo rendus : anciens modèles 3D effacés`}
          </Text>
          <TouchableOpacity
            accessibilityLabel="Fermer"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => useScanStore.getState().oublierPlaceRendue()}>
            <Text style={styles.menageCroix}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {!vide && (
        <View style={styles.chercheRow}>
          <View style={styles.champ}>
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path
                d="M11 4 a7 7 0 1 0 0 14 a7 7 0 0 0 0 -14 M16.5 16.5 L21 21"
                stroke={palette.inkFaint}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
            <TextInput
              style={styles.champInput}
              value={quete}
              onChangeText={setQuete}
              placeholder="Nom, client, adresse…"
              placeholderTextColor={palette.inkFaint}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity
            style={styles.triBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={tri === 'date' ? 'Trier par nom' : 'Trier par date'}
            onPress={() => setTri(tri === 'date' ? 'nom' : 'date')}>
            <Text style={styles.triText}>{tri === 'date' ? 'Récents' : 'A → Z'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/*
        LA BULLE — ce qu'on tient vraiment.

        Elle flotte au-dessus de tout, suit le doigt en X et en Y, et ne
        reçoit aucun appui : c'est un reflet de ce qu'on transporte, pas une
        cible. Le scan d'origine, lui, reste à sa place, effacé — le trou
        laissé par ce qu'on a pris.
      */}
      {dragId !== null && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.bulle,
            {
              transform: [
                { translateX: Animated.subtract(bulle.x, 62) },
                { translateY: Animated.subtract(bulle.y, 78) },
                {
                  scale: lift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ],
              opacity: lift,
            },
          ]}>
          {(() => {
            const tenu = saves.find((x) => x.id === dragId);
            if (!tenu) return null;
            return (
              <>
                <View style={styles.bulleVignette}>
                  <PlanThumb scan={tenu} c={palette} />
                </View>
                <Text style={styles.bulleNom} numberOfLines={1}>
                  {tenu.name}
                </Text>
              </>
            );
          })()}
        </Animated.View>
      )}

      {dragId !== null && (
        <View style={styles.dragHint}>
          <Text style={styles.dragHintText}>
            {over
              ? dossierOuvert
                ? 'Relâchez pour le sortir du dossier'
                : 'Relâchez pour ranger ici'
              : dossierOuvert
              ? 'Remontez le scan sur le titre pour l’en sortir'
              : 'Amenez le scan sur un dossier'}
          </Text>
        </View>
      )}

      {vide ? (
        <View style={styles.empty}>
          <EmptyPlanArt c={palette} />
          <Text style={styles.emptyTitle}>Aucun scan enregistré</Text>
          <Text style={styles.emptyText}>
            Chaque scan terminé est sauvegardé automatiquement et apparaîtra ici.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setScreen('home')}>
            <Text style={styles.primaryText}>Commencer un scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          // Pendant qu'on tient un scan, la liste ne défile pas : les deux
          // gestes sont le même mouvement du doigt.
          scrollEnabled={dragId === null}>
          {/* Les dossiers d'abord, en grandes icônes : c'est le rangement,
              il précède ce qui est rangé, et une icône se vise bien mieux
              qu'une ligne quand on lui amène quelque chose. */}
          {!dossierOuvert && folders.length > 0 && (
            <View style={styles.grid}>
              {folders.map((f) => (
                <FolderTile
                  key={f.id}
                  folder={f}
                  count={(byFolder.get(f.id) ?? []).length}
                  over={over === f.id}
                  recu={ranges[f.id] ?? 0}
                  lift={lift}
                  styles={styles}
                  palette={palette}
                  onOpen={() => setInside(f.id)}
                  onMenu={() => folderMenu(f)}
                  bind={(node) => {
                    tileRefs.current.set(f.id, node);
                  }}
                />
              ))}
            </View>
          )}

          {liste.length === 0 && (
            <View style={styles.emptyFolderBox}>
              <EmptyPlanArt c={palette} />
              <Text style={styles.emptyFolder}>
                {dossierOuvert
                  ? 'Ce dossier est vide. Revenez en arrière et amenez-y un scan.'
                  : 'Tous vos scans sont rangés dans des dossiers.'}
              </Text>
            </View>
          )}

          {liste.map((s) => (
            <ScanRow
              key={s.id}
              item={s}
              pris={dragId === s.id}
              fige={dragId !== null}
              lift={lift}
              styles={styles}
              palette={palette}
              onOpen={() => ouvrirLeScan(s.id)}
              onMenu={() => scanMenu(s)}
              onHold={(at) => beginHold(s.id, at)}
              /*
                LE DOIGT QUI GLISSE FAIT DÉFILER, il ne prend pas le
                relevé : le compte à rebours s'arrête au premier vrai
                mouvement, sans attendre que la liste réclame le geste.
              */
              onHoldMove={(at) => {
                if (!dragRef.current && !prendLeRelevé(doigt.current, at)) {
                  stopHold();
                }
              }}
              onRelease={releaseRow}
            />
          ))}
        </ScrollView>
      )}

      {/* Créer un dossier : bouton flottant en bas à droite, là où le pouce
          tombe naturellement. */}
      <ActionSheet data={menu} onClose={() => setMenu(null)} />
      <AlerteSortie
        data={alerteSortie}
        onClose={() => setAlerteSortie(null)}
      />
      <PromptSheet data={prompt} onClose={() => setPrompt(null)} />

      {!dossierOuvert && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          accessibilityLabel="Nouveau dossier"
          onPress={() => addFolder()}>
          <Svg width={26} height={26} viewBox="0 0 24 24">
            {['M12 5 v14', 'M5 12 h14'].map((d) => (
              <Path
                key={d}
                d={d}
                stroke="#FFFFFF"
                strokeWidth={2.6}
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </Svg>
        </TouchableOpacity>
      )}
    </View>
    </RetourGlisse>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    paddingHorizontal: 18,
  },
  // Le titre respire, et la pastille de comptage d'un dossier a la place
  // de dépasser : posée à −2 du haut de son icône, elle passait sous le
  // bloc du titre et se faisait trancher.
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  menageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
  },
  menageTexte: { flex: 1, color: c.inkSoft, fontSize: 13 },
  menageCroix: { color: c.inkFaint, fontSize: 15, fontWeight: '700' },
  chercheRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  champ: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
  },
  champInput: { flex: 1, color: c.ink, fontSize: 15, paddingVertical: 0 },
  triBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    justifyContent: 'center',
  },
  triText: { color: c.blue, fontSize: 13.5, fontWeight: '800' },
  rowClient: { color: c.blue, fontSize: 12, fontWeight: '700', marginTop: 1 },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.07,
    shadowRadius: 8,
    marginRight: 12,
  },
  /* Cinquante-six points de part et d'autre : la largeur du bouton de
     retour et celle de la pastille, marges comprises. Le titre s'y centre,
     et se coupe plutôt que de passer dessous. */
  title: {
    color: c.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  // Cadre de hauteur fixe qui centre son chiffre : un Text à rembourrage
  // retombe plus bas que le titre, sa boîte incluant l'interligne.
  countPill: {
    minWidth: 26,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    marginLeft: 10,
    backgroundColor: c.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: c.blue, fontSize: 13.5, fontWeight: '800' },
  /**
   * LA BULLE — une carte qu'on tient au bout du doigt.
   *
   * Elle est posée en coordonnées d'ÉCRAN et non dans la liste : c'est ce
   * qui lui permet de passer par-dessus les dossiers, la barre de recherche
   * et tout le reste. Son ombre la décolle franchement — un objet qu'on
   * porte ne rase pas la table.
   */
  bulle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 124,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.blue,
    shadowColor: '#0B0D12',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    zIndex: 40,
  },
  bulleVignette: {
    width: 96,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bulleNom: {
    color: c.ink,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    maxWidth: 108,
  },
  dragHint: {
    position: 'absolute',
    top: 104,
    left: 18,
    right: 18,
    zIndex: 20,
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    ...glow(c.blue),
  },
  dragHintText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  list: { paddingTop: 6, paddingBottom: 104 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginBottom: 20 },
  tile: { width: '33.33%', alignItems: 'center', marginBottom: 18 },
  tileTouch: { alignItems: 'center', width: 96 },
  tileGlyph: { alignItems: 'center', justifyContent: 'center' },
  tileBadge: {
    position: 'absolute',
    top: -2,
    right: 4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  tileBadgeText: { color: c.ink, fontSize: 11.5, fontWeight: '800' },
  tileName: {
    color: c.ink,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  emptyFolderBox: { alignItems: 'center', paddingTop: 22, opacity: 0.85 },
  emptyFolder: {
    color: c.inkFaint,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md + 2,
    padding: 12,
    marginBottom: 10,
    ...shadowCard,
  },
  // Le scan décollé : plus petit, plus pâle, cerné de bleu. Un fantôme de
  // ce qu'on déplace — la place est aux dossiers, qui grossissent.
  rowGhost: {
    borderWidth: 1.5,
    borderColor: c.blue,
    zIndex: 10,
    elevation: 10,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  // L'aperçu du plan : un carré sobre, qui laisse le nom en tête d'affiche.
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radius.sm,
    backgroundColor: c.bg,
    marginRight: 12,
    overflow: 'hidden',
  },
  rowTexts: { flex: 1, marginRight: 10 },
  rowName: { color: c.ink, fontSize: 16, fontWeight: '700' },
  rowSub: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  rowDetails: { color: c.inkSoft, fontSize: 13, marginTop: 4, fontWeight: '600' },
  headerRowOver: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.md,
  },
  more: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 34,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...glow(c.blue),
    shadowOpacity: 0.4,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: c.ink, fontSize: 19, fontWeight: '800', marginTop: 14 },
  emptyText: {
    color: c.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 15,
    paddingHorizontal: 30,
    alignItems: 'center',
    ...glow(c.blue),
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
}));
