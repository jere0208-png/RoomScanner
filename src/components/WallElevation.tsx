/**
 * Face au mur — l'établi de l'électricien.
 *
 * Un plan vu de dessus ne dit rien d'une hauteur, et une vue 3D en
 * perspective ne se cote pas : pour poser une prise, il faut se mettre
 * DEVANT le mur, bien à plat. C'est tout ce que fait cet écran — un seul
 * mur, vu de face, à l'échelle, avec ses portes et ses fenêtres, et les
 * trois cotes qui comptent : depuis la gauche, depuis la droite, depuis le
 * sol.
 *
 * On déplace l'appareil au doigt et les cotes suivent ; on tape une valeur
 * et l'appareil suit. Le doigt est imprécis, donc le geste s'arrête sur les
 * repères qui comptent — hauteur usuelle du type d'appareil, alignement avec
 * un appareil déjà posé, milieu du mur — et le repère s'affiche pendant
 * qu'on y est accroché.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Polygon,
  Stop,
  LinearGradient,
  Defs,
  Text as SvgText,
} from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import {
  roomOf,
  roomParts,
  segLength,
  wallQuadsOf,
  wallRuns,
} from '../geometry/floorplan';
import {
  BOITE_D,
  ENTRAXE,
  PLAQUE,
  PLATE_SIDES,
  overlaps,
  plateSlot,
  socketsOf,
  type PlateSide,
  FIXTURES as SPECS,
  boxOffsets,
  masonryAxes,
  masonryRuns,
  postsOf,
  seCommande,
  type FixtureKind,
} from '../geometry/electrical';
import {
  checkElectrical,
  fixturePlacement,
  heightRuleAt,
  wallFurniture,
  worktopsOnWall,
  requirementFor,
  roomInputsOf,
  usageConnu,
  roomUse,
  wallToRooms,
} from '../geometry/nfc15100';
import { assignOpenings } from '../geometry/scene3d';
import { empriseDuCoffre } from '../geometry/floorplan';
import {
  FIXTURES,
  faceX,
  faceXofT,
  fromFaceX,
  interiorSide,
  wallFace,
  type Fixture,
} from '../geometry/electrical';
import { RoomScan } from 'react-native-room-scan';
import { useScanStore } from '../store/scanStore';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { CloseCross } from './CloseCross';
import { wallLabel } from '../geometry/naming';
import { frCategory } from '../geometry/furniture';
import { Check, Sofa } from 'lucide-react-native';

const PAD_X = 30;
/**
 * La marge du haut doit contenir la COTE ET SON NOMBRE.
 *
 * Relevé du chantier : « la longueur du mur, sa cote est cachée en haut du
 * bloc ». La ligne de cote se pose à `COTE_H` au-dessus du plafond et la
 * marge en valait autant : le nombre écrit dessus débordait du cadre, et
 * « 2,72 m » sortait coupé dans le sens de la hauteur. Une marge doit
 * contenir ce qu'elle marge — le texte compte, pas seulement le trait.
 */
export const PAD_TOP = 42;
/** Fuite du relief : l'épaisseur du mur, en pixels d'écran. */
const FUITE = 9;
/** Hauteur de la ligne de cote au-dessus du plafond. */
export const COTE_H = 26;
/**
 * Les hauteurs de référence d'une installation, en mètres.
 *
 * Ce ne sont pas des décorations : ce sont les quatre lignes sur lesquelles
 * tout se pose. Les voir en filigrane fait repérer d'un coup l'appareil qui
 * n'est aligné avec rien.
 */
const HAUTEURS_REF = [
  { y: 0.25, nom: 'plinthe 25', court: 'pli 25', chiffre: '25' },
  { y: 1.1, nom: 'commande 110', court: 'com 110', chiffre: '110' },
  { y: 1.35, nom: 'tableau 135', court: 'tab 135', chiffre: '135' },
  { y: 2.1, nom: 'applique 210', court: 'app 210', chiffre: '210' },
];

/**
 * LE LIBELLÉ D'UNE HAUTEUR SE MET DANS LA MARGE, PAS SUR LE MUR.
 *
 * Défaut relevé et laissé ouvert longtemps : « les libellés de hauteur se
 * serrent contre le bord droit du mur ». Ils étaient écrits DANS le champ,
 * calés sur le bord droit — « commande 110 » fait une cinquantaine de points
 * à huit de corps, soit près d'un mètre de mur recouvert, à quatre hauteurs,
 * et toutes du même côté : celui où la place manque toujours.
 *
 * Ils passent donc dehors, dans la marge que le cadre garde déjà. Elle vaut
 * trente points au plus serré, et le mot entier en demande cinquante : on
 * l'abrège plutôt que de le laisser mordre. Trois lettres suffisent à un
 * électricien pour distinguer une plinthe d'une commande — et si même cela
 * ne tient pas, il reste le CHIFFRE, qui est ce qu'on vient lire.
 */
export function libelleDeHauteur(
  r: { nom: string; court: string; chiffre: string },
  place: number,
  corps: number,
): string {
  // Une lettre de ce corps-là mesure un peu plus de la moitié de sa hauteur.
  const large = (mot: string) => mot.length * corps * 0.55;
  if (large(r.nom) + 6 <= place) return r.nom;
  if (large(r.court) + 6 <= place) return r.court;
  return r.chiffre;
}
const PAD_BOTTOM = 34;
/** Tolérance d'accrochage, en mètres. */
const SNAP = 0.03;

const cm = (m: number) => Math.round(m * 100);

import type { ActionData } from './Sheet';

interface Props {
  wallId: string;
  /**
   * L'abscisse du RETOUR choisi sur le plan, sur la face, en mètres.
   *
   * On choisit un tableau de porte sur le plan, on demande « Élec », et
   * le mur entier s'ouvre : plus rien ne dit lequel des trois morceaux de
   * maçonnerie on visait. Le retour qui contient ce point se dessine
   * donc en bleu, cote comprise.
   */
  focusX?: number | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Ouvre le catalogue pour poser un appareil de plus sur ce mur. */
  onAddRequest: () => void;
  /**
   * Rend l'appareil tenu au parent pour nouer son lien SUR LE PLAN : on
   * ferme l'établi, puis on touche l'interrupteur qui le commande — le
   * même geste que pour une ligne de spots.
   */
  onLinkRequest?: (fixtureId: string) => void;
  onClose: () => void;
  /**
   * COMMENT POSER UNE QUESTION — l'écran qui nous porte sait le faire.
   *
   * L'établi n'a pas de feuille à lui : il vit DANS l'écran des résultats,
   * qui en a une (voir `ActionSheet`). Il lui passe donc sa façon d'ouvrir
   * une question, plutôt que de tomber sur l'alerte du système.
   */
  onDemander?: (data: ActionData) => void;
}

export function WallElevation({
  wallId,
  focusX,
  selectedId,
  onSelect,
  onAddRequest,
  onLinkRequest,
  onClose,
  onDemander,
}: Props) {
  const walls = useScanStore((s) => s.walls);
  const openings = useScanStore((s) => s.openings);
  const rooms = useScanStore((s) => s.rooms);
  const fixtures = useScanStore((s) => s.fixtures);
  const moveFixture = useScanStore((s) => s.moveFixture);
  const addFixture = useScanStore((s) => s.addFixture);
  const flipFixture = useScanStore((s) => s.flipFixture);
  const removeFixture = useScanStore((s) => s.removeFixture);
  const placeAssembly = useScanStore((s) => s.placeAssembly);
  const splitFixture = useScanStore((s) => s.splitFixture);
  const pendingJoin = useScanStore((s) => s.pendingJoin);
  const objects = useScanStore((s) => s.objects);
  const addPhoto = useScanStore((s) => s.addPhoto);
  const photos = useScanStore((s) => s.photos);
  const north = useScanStore((s) => s.north);
  const clearPendingJoin = useScanStore((s) => s.clearPendingJoin);
  const c = useTheme();
  const styles = getStyles(c);

  const [layout, setLayout] = useState({ w: 0, h: 0 });
  /** La hauteur de l'écran : c'est elle qui borne le dessin. */
  const { height: hauteurEcran } = useWindowDimensions();
  /**
   * La hauteur que réclame CE mur, une fois la largeur connue.
   *
   * Bornée des deux côtés : un couloir de six mètres ne doit pas se
   * réduire à un trait, et un placard de quatre-vingts centimètres ne doit
   * pas manger l'écran entier.
   */
  const [hauteurCadre, setHauteurCadre] = useState<number | null>(null);
  /** L'horloge de l'appui maintenu, et celle qui efface le trait d'aide. */
  const tenir = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effaceGuide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Un écran qu'on quitte ne doit pas laisser une horloge derrière lui.
  useEffect(
    () => () => {
      if (tenir.current) clearTimeout(tenir.current);
      if (effaceGuide.current) clearTimeout(effaceGuide.current);
    },
    [],
  );
  const restoreFixtures = useScanStore((st) => st.restoreFixtures);
  /**
   * L'APPAREILLAGE TEL QU'ON A OUVERT LE MUR.
   *
   * Tout ce qu'on fait ici part dans le plan à l'instant même — c'est ce
   * qui permet de voir la cote bouger en glissant le doigt. La croix
   * n'avait donc rien à fermer : elle laissait tout en place, et rien ne
   * disait comment revenir en arrière après une pose à côté. On garde
   * l'état de départ : la croix le remet, le bouton d'enregistrement le
   * jette.
   */
  const depart = useRef<Fixture[] | null>(null);
  if (depart.current === null) depart.current = fixtures;
  const modifie = fixtures !== depart.current;
  const [guide, setGuide] = useState<{ x?: number; y?: number }>({});
  const [editing, setEditing] = useState<'g' | 'd' | 'h' | null>(null);
  /** Pas du réglage fin : le centimètre, ou les cinq centimètres. */
  const [pas, setPas] = useState(0.01);
  /** Deux appareils posés au même endroit : on propose de les réunir. */
  const [fusion, setFusion] = useState<{
    moved: string;
    base: string;
    /** Axe du PREMIER appareil au moment où l'ensemble s'est formé. */
    axe: number;
    cote: PlateSide;
    /** true = l'ensemble est centré sur cet axe ; false = le premier y reste. */
    centre: boolean;
  } | null>(null);
  const [draft, setDraft] = useState('');
  /**
   * La règle complète, repliée par défaut.
   *
   * On la lit une fois, quand on conteste le constat ; la relire à chaque
   * pose coûte le tiers de l'écran pour rien.
   */
  const [regleOuverte, setRegleOuverte] = useState(false);
  /** Les meubles du mur, en creux. Montrés d'emblée : c'est une surprise
   *  qu'on veut avoir AVANT de percer, pas après. */
  const [voirMeubles, setVoirMeubles] = useState(true);

  const wall = walls.find((w) => w.id === wallId) ?? null;
  const mine = useMemo(
    () => fixtures.filter((f) => f.wallId === wallId),
    [fixtures, wallId],
  );
  const selected = mine.find((f) => f.id === selectedId) ?? null;

  // La face qu'on regarde est celle de l'appareil sélectionné : le retourner
  // fait donc passer la vue de l'autre côté, ce qui est exactement le geste
  // attendu quand on met une prise dos à dos.
  const side = selected?.side ?? (wall ? interiorSide(wall, walls, rooms) : 1);
  const face = useMemo(
    () => (wall ? wallFace(wall, wallQuadsOf(walls).get(wall.id), side) : null),
    [wall, walls, side],
  );

  /**
   * LES RETOURS DE MAÇONNERIE DE CETTE FACE.
   *
   * Un mur percé n'est pas une surface : c'est un retour, un trou, un
   * retour. Et c'est précisément sur ces trente centimètres entre
   * l'angle et l'huisserie qu'on pose l'interrupteur d'entrée — donc
   * là qu'il faut une cote et un axe, comme le mur entier a sa longueur
   * et son milieu. Le store recalait déjà l'appareil sur la maçonnerie
   * (`snapToMasonry`), mais en silence : rien ne montrait ni la largeur
   * du retour, ni son milieu, et on posait à l'œil en croyant viser.
   */
  const retours = useMemo(() => {
    if (!wall || !face) return [];
    const runs = masonryRuns(wallRuns(wall, openings), segLength(wall), face);
    // Un seul plein = le mur entier : il a déjà sa cote et son milieu.
    return runs.length > 1 ? runs : [];
  }, [wall, face, openings]);

  /**
   * La hauteur du cadre suit les proportions du mur.
   *
   * On la calcule à partir de la largeur mesurée, une fois pour toutes :
   * la largeur d'une feuille ne dépend pas de sa hauteur, il n'y a donc
   * pas de boucle à craindre.
   */
  useEffect(() => {
    if (!face || layout.w <= 0 || !wall) return;
    const utile = Math.max(80, layout.w - 2 * PAD_X);
    const voulue = (utile * wall.height) / Math.max(0.5, face.len);
    /**
     * ET IL RESTE DANS L'ÉCRAN.
     *
     * Le dessin se calculait sur les seules proportions du mur, la feuille
     * s'étirait pour l'accueillir, et sur un petit téléphone les commandes
     * du bas — les cotes, « Ajouter », « Retirer » — sortaient par le bas.
     * On réserve donc la place des commandes (environ 390 points : bandeau
     * de conformité, pas de réglage, trois champs, cinq boutons) et le
     * dessin prend ce qui reste.
     */
    const reste = hauteurEcran - 390;
    setHauteurCadre(
      Math.round(
        Math.min(430, Math.max(170, reste), Math.max(190, voulue + PAD_TOP + PAD_BOTTOM)),
      ),
    );
  }, [face, wall, layout.w, hauteurEcran]);

  const holes = useMemo(() => {
    if (!wall || walls.length === 0) return [];
    const floorY = Math.min(...walls.map((w) => w.yCenter - w.height / 2));
    return assignOpenings(walls, openings, floorY).get(wall.id) ?? [];
  }, [wall, walls, openings]);

  // ------------------------------------------------- guide de conformité
  // Poser une prise sans savoir combien la pièce en exige, c'est compter
  // dans sa tête. L'app le fait : elle annonce l'objectif, montre où on en
  // est, et rappelle la règle en une ligne.
  const objectif = useMemo(() => {
    const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
    const w2r = wallToRooms(inputs);
    const mien = inputs.find((r) => (w2r.get(wallId) ?? []).includes(r.id));
    if (!mien) return null;
    const req = requirementFor(roomUse(mien.name, mien.kind), mien.area);
    if (req.socles === 0) return null;
    const pose = fixturePlacement(fixtures, walls, inputs);
    const socles = (f: (typeof fixtures)[number]) =>
      pose.get(f.id) === mien.id ? socketsOf(f.kind) : 0;
    const poses = fixtures.reduce((n, f) => n + socles(f), 0);
    // Cuisine : ce sont les socles du plan de travail qui manquent en
    // premier, et ceux-là se posent à 1,10 m, pas en plinthe.
    const hauts = fixtures.reduce(
      (n, f) => n + (f.height >= 0.9 ? socles(f) : 0),
      0,
    );
    return {
      nom: mien.name || 'Cette pièce',
      poses,
      exiges: req.socles,
      regle: req.regle,
      surPlan: req.surPlan > hauts,
      /*
        ET L'ON DIT QUAND ON NE SAIT PAS.

        `roomUse` rend « autre » faute de mieux, et « autre » n'exige qu'un
        socle : une pièce sans nom affichait donc « 2/1 socle », c'est-à-dire
        CONFORME, alors que la même pièce nommée « Chambre » en exige trois.
        Le relevé passait, le chantier non.
      */
      inconnu: !usageConnu(mien.name, mien.kind),
    };
  }, [rooms, walls, fixtures, wallId]);

  /**
   * Les autres constats de la pièce — ceux que le bandeau d'objectif et
   * l'avertissement de hauteur ne disent pas déjà. C'est ici qu'ils doivent
   * paraître : on a ouvert ce mur PARCE QU'il est en défaut, il serait
   * absurde de renvoyer ailleurs pour savoir lequel.
   */
  const constats = useMemo(() => {
    const inputs = roomInputsOf(rooms, roomParts(walls, rooms));
    const w2r = wallToRooms(inputs);
    const miens = w2r.get(wallId) ?? [];
    return checkElectrical(
      inputs,
      fixtures,
      w2r,
      fixturePlacement(fixtures, walls, inputs),
    ).filter(
      (i) =>
        i.severity === 'alerte' &&
        i.code !== 'socles' &&
        i.code !== 'hauteur' &&
        !!i.roomId &&
        miens.includes(i.roomId),
    );
  }, [rooms, walls, fixtures, wallId]);

  // ------------------------------------------------------------- échelle
  const H = wall?.height ?? 2.5;
  const scale =
    face && layout.w > 0 && layout.h > 0
      ? Math.min(
          (layout.w - 2 * PAD_X) / face.len,
          (layout.h - PAD_TOP - PAD_BOTTOM) / H,
        )
      : 0;
  const originX = face ? (layout.w - face.len * scale) / 2 : 0;
  const originY = layout.h - PAD_BOTTOM;
  const px = (x: number) => originX + x * scale;
  const py = (y: number) => originY - y * scale;

  // Le PanResponder se crée une fois : il lit l'état courant dans une boîte
  // mise à jour à chaque rendu, sinon il travaillerait sur des valeurs figées.
  const live = useRef({
    mine,
    face,
    scale,
    H,
    px,
    py,
    selectedId,
    retours,
    move: moveFixture,
    select: onSelect,
  });
  live.current = {
    mine,
    face,
    scale,
    H,
    px,
    py,
    selectedId,
    retours,
    move: moveFixture,
    select: onSelect,
  };
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);

  const snapTo = (v: number, targets: number[]) => {
    let best: number | null = null;
    let bd = SNAP;
    for (const t of targets) {
      const d = Math.abs(v - t);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const L = live.current;
        if (!L.face || L.scale <= 0) return;
        const tx = e.nativeEvent.locationX;
        const ty = e.nativeEvent.locationY;
        // L'appareil le plus proche du doigt, à portée de POUCE : 44 px,
        // la cible minimale d'iOS. À 34 on ratait une prise sur trois, et
        // on désélectionnait au lieu de saisir.
        let best: Fixture | null = null;
        let bd = 44;
        for (const f of L.mine) {
          const d = Math.hypot(
            L.px(faceX(L.face, f.along)) - tx,
            L.py(f.height) - ty,
          );
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        if (!best) {
          /**
           * L'APPUI À VIDE NE DÉSÉLECTIONNE PLUS.
           *
           * Il lâchait l'appareil tenu : le titre repassait à « Face au
           * mur », le bandeau de cotes disparaissait, et toute la fenêtre
           * se réorganisait sous les doigts. Or on touche le mur pour
           * viser, pas pour abandonner — et on rate la prise une fois sur
           * trois. On garde donc la sélection : elle change en touchant un
           * AUTRE appareil, et se termine en fermant la fenêtre.
           */
          drag.current = null;
          return;
        }
        drag.current = {
          id: best.id,
          x: faceX(L.face, best.along),
          y: best.height,
        };
        if (best.id !== L.selectedId) L.select(best.id);
      },
      onPanResponderMove: (_e, g) => {
        const L = live.current;
        const d = drag.current;
        if (!d || !L.face || L.scale <= 0) return;
        const spec = FIXTURES[L.mine.find((f) => f.id === d.id)?.kind ?? 'prise'];
        let x = d.x + g.dx / L.scale;
        let y = d.y - g.dy / L.scale;
        // Repères : hauteur usuelle du type posé, alignement avec les autres
        // appareils du mur, milieu du mur.
        const others = L.mine.filter((f) => f.id !== d.id);
        // L'axe de chaque retour assez large pour recevoir la plaque
        // entière : la règle est écrite une seule fois, dans la géométrie.
        const axes = masonryAxes(L.retours, spec.w);
        const sx = snapTo(x, [
          ...others.map((f) => faceX(L.face!, f.along)),
          ...axes,
          L.face.len / 2,
        ]);
        const sy = snapTo(y, [spec.std, ...others.map((f) => f.height)]);
        if (sx !== null) x = sx;
        if (sy !== null) y = sy;
        x = Math.round(x * 100) / 100;
        y = Math.round(y * 100) / 100;
        setGuide({ x: sx ?? undefined, y: sy ?? undefined });
        L.move(d.id, fromFaceX(L.face, x), y);
      },
      onPanResponderRelease: () => {
        const d = drag.current;
        drag.current = null;
        setGuide({});
        // Posé SUR un autre appareil : c'est le geste qui demande à les
        // réunir sous une même plaque. On ne décide pas à sa place — on
        // demande de quel côté.
        const L = live.current;
        if (!d || !L.face) return;
        const moi = L.mine.find((f) => f.id === d.id);
        if (!moi) return;
        const sous = L.mine.find(
          (f) =>
            f.id !== moi.id &&
            f.side === moi.side &&
            !f.group &&
            overlaps(
              { x: faceX(L.face!, moi.along), y: moi.height, kind: moi.kind },
              { x: faceX(L.face!, f.along), y: f.height, kind: f.kind },
            ),
        );
        if (sous) {
          const xb = faceX(L.face, sous.along);
          setFusion({
            moved: moi.id,
            base: sous.id,
            axe: xb,
            cote: faceX(L.face, moi.along) >= xb ? 'droite' : 'gauche',
            centre: false,
          });
        }
      },
      onPanResponderTerminate: () => {
        drag.current = null;
        setGuide({});
      },
    }),
  ).current;

  /**
   * L'appareil qu'on vient de poser est tombé sur un autre : le store les a
   * rangés côte à côte pour que rien ne se superpose, et nous propose ici de
   * choisir le côté — ou de recentrer l'ensemble sur l'axe du premier.
   */
  useEffect(() => {
    if (!pendingJoin || !face) return;
    const base = fixtures.find((f) => f.id === pendingJoin.base);
    const moved = fixtures.find((f) => f.id === pendingJoin.moved);
    clearPendingJoin();
    if (!base || !moved || base.wallId !== wall?.id) return;
    const xb = faceX(face, base.along);
    const xm = faceX(face, moved.along);
    setFusion({
      moved: moved.id,
      base: base.id,
      axe: xb,
      cote:
        Math.abs(xm - xb) > 1e-6
          ? xm > xb
            ? 'droite'
            : 'gauche'
          : moved.height > base.height
          ? 'haut'
          : 'bas',
      centre: false,
    });
  }, [pendingJoin, face, fixtures, wall, clearPendingJoin]);

  /**
   * LES MEUBLES QUI SE TIENNENT DEVANT CE MUR.
   *
   * On décide où percer sur un dessin qui montre une belle surface libre,
   * là où se dresse une bibliothèque : la prise se pose, le plan part au
   * chantier, et personne ne la revoit avant d'avoir à déplacer le meuble.
   * Ils s'affichent en creux, derrière l'appareillage — et se cachent,
   * parce qu'à quatre meubles le mur ne se voit plus.
   */
  const meublesDuMur = useMemo(
    () => (face ? wallFurniture(face, objects) : []),
    [face, objects],
  );

  /** Les plans de travail que ce mur longe : ils changent la règle. */
  const plansDeTravail = useMemo(() => {
    if (!face || !wall) return [];
    const piece = rooms.find((r) => r.id === roomOf(wall));
    return worktopsOnWall(
      face,
      objects,
      roomUse(piece?.name ?? '', piece?.kind) === 'cuisine',
    );
  }, [face, wall, rooms, objects]);

  if (!wall || !face) {
    return (
      <View style={styles.sheet}>
        <Text style={styles.title}>Ce mur n’existe plus</Text>
        <TouchableOpacity style={styles.ghost} onPress={onClose}>
          <Text style={styles.ghostText}>Fermer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const spec = selected ? FIXTURES[selected.kind] : null;
  const selX = selected ? faceX(face, selected.along) : 0;
  /**
   * Le retour QUI PORTE l'appareil tenu.
   *
   * « Mur de 3,36 m » ne renseigne pas qui pose sur un tableau de porte :
   * la seule longueur qui compte alors, c'est celle du morceau de
   * maçonnerie sous la main.
   */
  const monRetour = selected
    ? retours.find((r) => selX >= r.x0 - 1e-6 && selX <= r.x1 + 1e-6) ?? null
    : null;
  /**
   * LE RETOUR QU'ON REGARDE — celui que la photo va montrer.
   *
   * Relevé du patron : « un retour de mur doit aussi pouvoir avoir sa
   * photo, sans prendre tout le mur ». C'est le pan désigné sur le plan
   * (`focusX`), ou à défaut celui qui porte l'appareil tenu : dans les deux
   * cas, c'est le morceau de maçonnerie sous la main. Sans rien de tout
   * cela, la photo montre le mur entier, comme avant.
   */
  const retourVise =
    (focusX != null
      ? retours.find((r) => focusX >= r.x0 && focusX <= r.x1)
      : null) ??
    monRetour ??
    null;
  /*
    Les photos déjà punaisées sur ce mur : on peut en prendre plusieurs.
    Un simple filtre, pas un `useMemo` : nous sommes ici après le retour
    anticipé du mur introuvable, et un hook ne se place pas là.
  */
  const mesPhotos = photos.filter((p) => p.wallId === wallId);
  const roomName =
    rooms.find((r) => r.id === roomOf(wall))?.name ?? '';
  /**
   * DE QUEL MUR S'AGIT-IL ? Celui du nord, celui de l'est.
   *
   * « Pièce 1 · mur de 3,36 m » ne distingue pas deux murs de même
   * longueur, et un logement en a toujours deux. L'orientation, elle, se
   * vérifie sur place — c'est aussi ce que porte désormais le dossier
   * imprimé, et les deux doivent dire la même chose.
   */
  const cardinal = (() => {
    const centre = roomParts(walls, rooms).find(
      (p) => p.roomId === roomOf(wall),
    )?.labelAt;
    return centre ? wallLabel(wall, centre, north) : null;
  })();

  // La règle de hauteur de l'appareil qu'on tient : c'est ici, et nulle
  // part ailleurs, qu'elle sert.
  const hauteurKO = (() => {
    if (!selected || !face) return null;
    const r = heightRuleAt(
      selected.kind,
      faceX(face, selected.along),
      plansDeTravail,
    );
    if (!r) return null;
    if (r.min !== undefined && selected.height < r.min - 1e-6) {
      return { sens: 'trop bas', regle: r.regle };
    }
    if (r.max !== undefined && selected.height > r.max + 1e-6) {
      return { sens: 'trop haut', regle: r.regle };
    }
    return null;
  })();

  /**
   * Poser l'appareil qui manque, sans quitter le mur.
   *
   * Le constat est sous les yeux, la correction doit être à portée du même
   * pouce : renvoyer au catalogue pour choisir une prise dont l'app sait
   * déjà qu'elle manque serait un détour.
   */
  const poser = (kind: FixtureKind, height?: number) => {
    const id = addFixture(kind, wallId);
    if (!id) return;
    if (height !== undefined) {
      const pose = useScanStore.getState().fixtures.find((f) => f.id === id);
      if (pose) moveFixture(id, pose.along, height);
    }
    onSelect(id);
  };

  /**
   * Côtés où le second poste tient encore : à l'entraxe du premier, sans
   * sortir du mur ni tomber sur un troisième appareil. Un côté impossible
   * n'est pas proposé — plutôt que proposé puis refusé.
   */
  const cotesPossibles = (): PlateSide[] => {
    if (!fusion || !face || !wall) return [];
    const base = mine.find((f) => f.id === fusion.base);
    const moved = mine.find((f) => f.id === fusion.moved);
    if (!base || !moved) return [];
    const gabarit = FIXTURES[moved.kind];
    const axe = { x: fusion.axe, y: base.height };
    return PLATE_SIDES.map((s) => s.key).filter((cote) => {
      const p = plateSlot(axe, cote);
      if (p.x < gabarit.w / 2 || p.x > face.len - gabarit.w / 2) return false;
      if (p.y < gabarit.h / 2 || p.y > wall.height - gabarit.h / 2) return false;
      // Ni sur un troisième appareil déjà posé.
      return !mine.some(
        (f) =>
          f.id !== moved.id &&
          f.id !== base.id &&
          f.side === base.side &&
          !f.group &&
          overlaps(
            { x: p.x, y: p.y, kind: moved.kind },
            { x: faceX(face, f.along), y: f.height, kind: f.kind },
          ),
      );
    });
  };

  /**
   * Pose l'ensemble : côté choisi, et axe de référence.
   *
   * Deux façons de comprendre « à droite de la première » : la première ne
   * bouge pas et la seconde se pose à 71 mm — c'est ce que fait un
   * électricien qui ajoute une prise à une prise existante —, ou l'ensemble
   * se CENTRE sur l'axe de la première, chacune s'écartant de 35,5 mm. La
   * seconde façon garde l'axe du premier percement au milieu de la plaque,
   * ce qu'on veut quand la cote a été relevée sur un plan.
   */
  const appliquer = (cote: PlateSide, centre: boolean) => {
    if (!fusion || !face) return;
    const base = mine.find((f) => f.id === fusion.base);
    if (!base) return;
    const horiz = cote === 'gauche' || cote === 'droite';
    const sens = cote === 'gauche' || cote === 'bas' ? -1 : 1;
    const demi = centre ? ENTRAXE / 2 : 0;
    const axeY = base.height;
    const bx = horiz ? fusion.axe - sens * demi : fusion.axe;
    const by = horiz ? axeY : axeY - sens * demi;
    const mx = horiz ? bx + sens * ENTRAXE : bx;
    const my = horiz ? by : by + sens * ENTRAXE;
    placeAssembly(
      fusion.base,
      fusion.moved,
      { along: fromFaceX(face, bx), height: by },
      { along: fromFaceX(face, mx), height: my },
    );
    setFusion({ ...fusion, cote, centre });
  };

  /** Défait l'ensemble : le second s'écarte de 40 cm, seul. */
  const separer = () => {
    if (!fusion || !face) return;
    const x = Math.min(face.len - 0.05, fusion.axe + 0.4);
    splitFixture(fusion.moved, fromFaceX(face, x));
    setFusion(null);
  };

  /**
   * LES TRAITS D'ALIGNEMENT VALENT AUSSI POUR LES FLÈCHES.
   *
   * Ils n'apparaissaient qu'au doigt : le glissement s'accroche aux
   * repères et les montre. Au pavé, on avançait d'un centimètre à la
   * fois à travers ces mêmes repères sans que rien ne le dise — on
   * passait DEVANT l'alignement sans le voir, et on s'arrêtait un
   * centimètre plus loin.
   *
   * Ici, pas d'accrochage : la flèche est faite pour viser au centimètre
   * près, l'aimanter serait lui retirer sa raison d'être. On se contente
   * de DIRE quand la position tombe juste, à cinq millimètres près.
   */
  const montrerAlignement = (id: string, x: number, y: number) => {
    if (!face) return;
    const autres = mine.filter((f) => f.id !== id);
    const pres = (v: number, cibles: number[]) =>
      cibles.find((t) => Math.abs(v - t) < 0.005);
    setGuide({
      x: pres(x, [...autres.map((f) => faceX(face, f.along)), face.len / 2]),
      y: pres(y, autres.map((f) => f.height)),
    });
    // Le trait s'efface tout seul : il dit un instant, il ne s'installe pas.
    if (effaceGuide.current) clearTimeout(effaceGuide.current);
    effaceGuide.current = setTimeout(() => setGuide({}), 1200);
  };

  /**
   * UN PAS DE FLÈCHE, et le repère qui va avec.
   *
   * Un appui = un pas ; un appui MAINTENU = les pas s'enchaînent, de plus
   * en plus vite. Traverser un mur de trois mètres au centimètre demandait
   * trois cents appuis — personne ne le faisait, on repartait au doigt et
   * on perdait la précision qu'on était venu chercher.
   */
  const pasFleche = (dx: number, dy: number) => {
    if (!selected || !face) return;
    /**
     * La position se relit DANS LE MAGASIN, à chaque pas.
     *
     * L'appui maintenu enchaîne des pas depuis une horloge : sa fermeture
     * garde l'appareil tel qu'il était au premier pas. En repartant de
     * cette copie à chaque fois, les cent pas suivants recalculaient tous
     * la MÊME destination — le doigt restait appuyé et rien ne bougeait
     * plus.
     */
    const vif = useScanStore
      .getState()
      .fixtures.find((f) => f.id === selected.id);
    if (!vif) return;
    const x = faceX(face, vif.along) + dx * pas;
    const y = vif.height + dy * pas;
    moveFixture(vif.id, fromFaceX(face, x), y);
    montrerAlignement(vif.id, Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  };

  /**
   * L'appui maintenu : le premier pas part tout de suite, puis la cadence
   * s'accélère — 380 ms d'attente pour ne pas déclencher sur un appui
   * bref, et jusqu'à 40 ms pour parcourir un mur en deux secondes.
   */
  const lancerFleche = (dx: number, dy: number) => {
    pasFleche(dx, dy);
    let attente = 380;
    const suivant = () => {
      tenir.current = setTimeout(() => {
        pasFleche(dx, dy);
        attente = Math.max(40, attente * 0.72);
        suivant();
      }, attente);
    };
    suivant();
  };
  const arreterFleche = () => {
    if (tenir.current) clearTimeout(tenir.current);
    tenir.current = null;
  };
  /** Applique une cote tapée au clavier (en cm). */
  const applyDraft = () => {
    const v = parseFloat(draft.replace(',', '.'));
    if (selected && editing && isFinite(v)) {
      const m = v / 100;
      if (editing === 'g') moveFixture(selected.id, fromFaceX(face, m), selected.height);
      else if (editing === 'd')
        moveFixture(selected.id, fromFaceX(face, face.len - m), selected.height);
      else moveFixture(selected.id, selected.along, m);
    }
    setEditing(null);
  };

  const field = (key: 'g' | 'd' | 'h', label: string, value: number) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <TextInput
          style={styles.fieldInput}
          value={
            editing === key ? draft : selected ? String(cm(value)) : '—'
          }
          editable={!!selected}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          onFocus={() => {
            setEditing(key);
            setDraft(String(cm(value)));
          }}
          onChangeText={setDraft}
          onBlur={applyDraft}
          onSubmitEditing={applyDraft}
        />
        <Text style={styles.fieldUnit}>cm</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text style={styles.title} numberOfLines={1}>
            {spec ? spec.label : 'Face au mur'}
          </Text>
          {/*
            DEUX LIGNES, PAS QUATRE.

            La légende empilait la pièce, le mur, sa longueur, le retour et
            la règle de l'appareil : quatre lignes de gris sous un titre,
            qui poussaient les boutons et que la pastille des meubles
            venait recouvrir. On garde ce qui SITUE (la pièce, le mur, sa
            longueur) ; la règle de l'appareil, elle, est déjà dite par le
            bandeau de conformité, juste dessous, là où elle sert.
          */}
          <Text style={styles.subtitle} numberOfLines={2}>
            {roomName ? `${roomName} · ` : ''}
            {cardinal
              ? `${cardinal} de ${face.len.toFixed(2).replace('.', ',')} m`
              : `mur de ${face.len.toFixed(2).replace('.', ',')} m`}
            {monRetour ? ` · retour de ${cm(monRetour.x1 - monRetour.x0)} cm` : ''}
          </Text>
          {/*
            LA PASTILLE DES MEUBLES REVIENT DANS LE FLUX.

            Elle flottait par-dessus l'en-tête, à soixante-deux points du
            haut : sur un titre de deux lignes elle tombait pile sur la
            légende et en cachait la moitié. Posée sous la légende, elle
            ne peut plus rien recouvrir, et elle se lit comme ce qu'elle
            est : un calque à allumer.
          */}
          {meublesDuMur.length > 0 && (
            <TouchableOpacity
              style={[styles.calque, voirMeubles && styles.calqueOn]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Meubles devant ce mur"
              onPress={() => setVoirMeubles((v) => !v)}>
              <Sofa
                size={15}
                color={voirMeubles ? '#FFFFFF' : c.inkSoft}
                strokeWidth={2}
              />
              <Text
                style={[styles.calqueText, voirMeubles && styles.calqueTextOn]}>
                {`${meublesDuMur.length} meuble${
                  meublesDuMur.length > 1 ? 's' : ''
                }`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/*
          UNE SEULE SORTIE DANS L'EN-TÊTE — relevé du patron : « repense
          cette page pour plus de simplicité, optimisé smartphone ».

          Ils étaient trois à s'y partager la place avec le titre : la
          photo, un « Enregistrer » vert qui prenait le tiers de la
          largeur, et la croix. Résultat, le titre sortait tronqué DEUX
          fois — « Face au… », « mur sud-est de 2,8… » —, c'est-à-dire que
          l'écran ne disait plus devant quoi on se trouvait.

          Ne reste ici que la sortie qui ABANDONNE : le geste rare, petit,
          en haut. Ce qu'on fait souvent — poser, photographier, garder —
          descend sous le pouce.
        */}
        <TouchableOpacity
          style={styles.close}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Fermer sans garder"
          onPress={() => {
            if (!modifie) {
              onClose();
              return;
            }
            /*
              LA QUESTION SE POSE DANS NOTRE FEUILLE.

              Relevé du patron, capture à l'appui : « refonte de ce popup
              aussi dans notre style ». C'était une `Alert.alert` posée au
              milieu de l'établi — police système, deux boutons bleus côte à
              côte, coins de 2019 — sur un écran qui a sa typographie, ses
              rayons et son bleu.

              L'écran qui nous porte sait ouvrir nos feuilles ; il nous
              passe sa façon de le faire. Sans elle (un banc qui monte
              l'établi tout seul), on garde l'alerte : mieux vaut une
              question laide qu'un mur qu'on abandonne sans demander.
            */
            const abandonner = () => {
              if (depart.current) restoreFixtures(depart.current);
              depart.current = null;
              onClose();
            };
            if (onDemander) {
              onDemander({
                title: 'Abandonner les modifications ?',
                subtitle: 'Ce mur reviendra dans l’état où vous l’avez ouvert.',
                actions: [
                  {
                    label: 'Abandonner',
                    hint: 'Les appareils reprennent leur place d’origine.',
                    icon: 'supprimer',
                    danger: true,
                    onPress: abandonner,
                  },
                ],
              });
              return;
            }
            Alert.alert(
              'Abandonner les modifications ?',
              'Ce mur reviendra dans l’état où vous l’avez ouvert.',
              [
                { text: 'Continuer', style: 'cancel' },
                {
                  text: 'Abandonner',
                  style: 'destructive',
                  onPress: abandonner,
                },
              ],
            );
          }}>
          <CloseCross size={22} color={c.inkSoft} weight={3} />
        </TouchableOpacity>
      </View>
      <View
        style={[styles.canvas, hauteurCadre ? { height: hauteurCadre } : null]}
        onLayout={(e) =>
          setLayout({
            w: e.nativeEvent.layout.width,
            h: e.nativeEvent.layout.height,
          })
        }
        {...pan.panHandlers}>
        {scale > 0 && (
          <Svg width={layout.w} height={layout.h}>
            <Defs>
              {/* Un mur éclairé par le haut : la lumière vient du plafond,
                  comme dans une pièce. Rien de spectaculaire — juste de quoi
                  ne plus lire un rectangle gris. */}
              <LinearGradient id="mur" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.surface} />
                <Stop offset="1" stopColor={c.surfaceSunken} />
              </LinearGradient>
            </Defs>

            {/*
              LÉGER RELIEF : l'épaisseur du mur, vue de trois quarts.
              Deux bandeaux en fuite — un au plafond, un sur le côté — et le
              mur cesse d'être un rectangle posé sur du vide : on lit une
              maçonnerie, avec son épaisseur, et les appareils s'y posent
              dessus. La face, elle, reste exactement à l'échelle : c'est sur
              elle qu'on mesure.
            */}
            <Polygon
              points={[
                `${px(0)},${py(H)}`,
                `${px(0) + FUITE},${py(H) - FUITE}`,
                `${px(face.len) + FUITE},${py(H) - FUITE}`,
                `${px(face.len)},${py(H)}`,
              ].join(' ')}
              fill={c.surfaceSunken}
              stroke={c.line}
              strokeWidth={1}
            />
            <Polygon
              points={[
                `${px(face.len)},${py(H)}`,
                `${px(face.len) + FUITE},${py(H) - FUITE}`,
                `${px(face.len) + FUITE},${py(0) - FUITE}`,
                `${px(face.len)},${py(0)}`,
              ].join(' ')}
              fill={c.line}
              opacity={0.5}
              stroke={c.line}
              strokeWidth={1}
            />

            {/* Le mur, vu de face : un rectangle à l'échelle. */}
            <Rect
              x={px(0)}
              y={py(H)}
              width={face.len * scale}
              height={H * scale}
              fill="url(#mur)"
              stroke={c.lineStrong}
              strokeWidth={1.5}
              rx={2}
            />

            {/*
              LES HAUTEURS DE RÉFÉRENCE, en filigrane.
              Poser un appareil, c'est viser une de ces quatre lignes : 25 cm
              pour une prise de plinthe, 1,10 m pour une commande ou un plan
              de travail, 1,35 m pour le tableau, 2,10 m pour une applique.
              Les avoir sous les yeux évite de les chercher, et fait voir
              d'un coup ce qui n'est pas aligné avec le reste.
            */}
            {HAUTEURS_REF.filter((r) => r.y < H - 0.05).map((r) => (
              <G key={`ref${r.y}`}>
                <Line
                  x1={px(0)}
                  y1={py(r.y)}
                  x2={px(face.len)}
                  y2={py(r.y)}
                  stroke={c.blue}
                  strokeWidth={0.8}
                  strokeDasharray="2 6"
                  opacity={0.35}
                />
                <SvgText
                  x={px(face.len) + 5}
                  y={py(r.y) + 3}
                  fill={c.inkFaint}
                  fontSize={7.5}
                  fontWeight="700"
                  textAnchor="start">
                  {libelleDeHauteur(r, layout.w - px(face.len) - 5, 7.5)}
                </SvgText>
              </G>
            ))}

            {/* Sol : trait épais et hachures — le zéro des hauteurs. */}
            <Line
              x1={px(0) - 14}
              y1={py(0)}
              x2={px(face.len) + 14}
              y2={py(0)}
              stroke={c.ink}
              strokeWidth={2.5}
            />
            {Array.from({ length: Math.ceil(face.len * scale / 12) + 3 }).map(
              (_, i) => {
                const x = px(0) - 12 + i * 12;
                return (
                  <Line
                    key={`h${i}`}
                    x1={x}
                    y1={py(0) + 8}
                    x2={x + 7}
                    y2={py(0)}
                    stroke={c.lineStrong}
                    strokeWidth={1}
                  />
                );
              },
            )}
            {/* Plafond */}
            <Line
              x1={px(0)}
              y1={py(H)}
              x2={px(face.len)}
              y2={py(H)}
              stroke={c.inkFaint}
              strokeWidth={1}
              strokeDasharray="5 4"
            />

            {/*
              LES COTES DU MUR, dans l'espace laissé libre au-dessus.
              Le dessin est calé en bas — c'est le sol, il n'y a pas à
              discuter — et le haut de la zone restait vide. Un plan
              d'élévation y met justement ses cotes : la longueur au-dessus,
              la hauteur sous plafond sur le côté. On les lisait jusqu'ici
              dans une phrase, en petit, sous le titre.
            */}
            <G>
              <Line
                x1={px(0)}
                y1={py(H) - COTE_H}
                x2={px(face.len)}
                y2={py(H) - COTE_H}
                stroke={c.inkSoft}
                strokeWidth={1}
              />
              {[0, face.len].map((x) => (
                <Line
                  key={`t${x}`}
                  x1={px(x)}
                  y1={py(H) - COTE_H - 4}
                  x2={px(x)}
                  y2={py(H) - COTE_H + 4}
                  stroke={c.inkSoft}
                  strokeWidth={1.4}
                />
              ))}
              <Rect
                x={px(face.len / 2) - 30}
                y={py(H) - COTE_H - 9}
                width={60}
                height={18}
                rx={9}
                fill={c.bg}
              />
              <SvgText
                x={px(face.len / 2)}
                y={py(H) - COTE_H + 4}
                fill={c.ink}
                fontSize={12}
                fontWeight="800"
                textAnchor="middle">
                {`${face.len.toFixed(2).replace('.', ',')} m`}
              </SvgText>
              <SvgText
                x={px(0) - 8}
                y={py(H / 2)}
                fill={c.inkFaint}
                fontSize={10}
                fontWeight="700"
                textAnchor="middle"
                transform={`rotate(-90, ${px(0) - 8}, ${py(H / 2)})`}>
                {`H ${H.toFixed(2).replace('.', ',')} m`}
              </SvgText>
            </G>

            {/*
              LES MEUBLES, EN CREUX, sous tout le reste.

              Une silhouette hachurée et son nom : de quoi comprendre qu'un
              socle tombera derrière la bibliothèque, sans masquer le mur ni
              se confondre avec une baie. Le trait du haut donne la hauteur
              du meuble, la seule cote qui décide.

              LA SILHOUETTE PART DE SON DESSOUS, pas du sol. Tout était
              dessiné depuis le carrelage : un meuble haut de cuisine
              devenait une colonne pleine, et le plan de travail sur lequel
              on pose justement les prises disparaissait dessous. Ce qui est
              accroché en l'air — meuble haut, hotte, télé, chauffe-eau — se
              voit maintenant comme il est, et la place libre sous lui aussi.
            */}
            {voirMeubles &&
              meublesDuMur.map((m, i) => {
                const haut = Math.min(m.top, H);
                const bas = Math.min(m.base, haut);
                /*
                  CONTRE LE MUR, LE MEUBLE SE VOIT FRANCHEMENT — relevé du
                  patron : les silhouettes en creux (9 % d'opacité, tirets
                  pâles) ne se voyaient pas, et c'est le meuble COLLÉ qui
                  condamne la prise. À douze centimètres ou moins du nu,
                  il prend la convention du plan : bleu, trait plein. Le
                  lointain reste en creux.
                */
                const contre = m.ecart <= 0.12;
                return (
                  <G key={`mb${i}`}>
                    <Rect
                      x={px(m.from)}
                      y={py(haut)}
                      width={Math.max(2, (m.to - m.from) * scale)}
                      height={Math.max(1, (haut - bas) * scale)}
                      fill={contre ? c.blue : c.inkFaint}
                      fillOpacity={contre ? 0.1 : 0.09}
                      stroke={contre ? c.blue : c.inkFaint}
                      strokeWidth={contre ? 1.4 : 1}
                      strokeDasharray={contre ? undefined : '5 4'}
                    />
                    {(m.to - m.from) * scale > 46 && (
                      <SvgText
                        x={px((m.from + m.to) / 2)}
                        y={py(haut) + 12}
                        fill={c.inkFaint}
                        fontSize={8.5}
                        fontWeight="700"
                        textAnchor="middle">
                        {`${frCategory(m.category)} ${Math.round(m.top * 100)}`}
                      </SvgText>
                    )}
                  </G>
                );
              })}

            {/*
              LA HAUTEUR DE POSE SE COTE, comme celle d'un appareil.

              Un meuble accroché en l'air ne se décrit pas par sa seule
              hauteur hors tout : ce qu'un cuisiniste et un électricien se
              donnent, c'est la cote du DESSOUS — 1,40 m pour un meuble haut
              de cuisine. Elle se dessine dans la même écriture que les trois
              cotes de l'appareillage, sur l'axe du meuble, et seulement pour
              ce qui décolle vraiment du sol : écrire « 0 » sous chaque
              caisson noierait les seules cotes qu'on vient lire.
            */}
            {voirMeubles &&
              meublesDuMur
                .filter((m) => m.base > 0.02 && m.base < H)
                .map((m, i) => {
                  /*
                    LA COTE SE POSE AU BORD, PAS AU MILIEU.

                    Au centre du meuble, elle traverse tout ce qui est en
                    dessous — sous un meuble haut de cuisine, il y a
                    justement le meuble bas — et son étiquette se pose en
                    plein sur lui. Au bord, elle longe le montant : c'est là
                    qu'on cote une allège sur un plan, et le dessin reste
                    lisible. Bornée au cadre, sinon l'étiquette du meuble le
                    plus à gauche sort du dessin.
                  */
                  const xm = Math.max(px(0) + 22, px(m.from));
                  return (
                    <Dim
                      key={`mbc${i}`}
                      x1={xm}
                      y1={py(0)}
                      x2={xm}
                      y2={py(m.base)}
                      text={`${Math.round(m.base * 100)}`}
                      c={c}
                      vertical
                      push={{ x: 1, y: 0 }}
                    />
                  );
                })}

            {/* Portes et fenêtres : on ne perce pas un mur à leur place. */}
            {holes.map((hole, i) => {
              const xa = faceXofT(face, hole.t0);
              const xb = faceXofT(face, hole.t1);
              const x0 = Math.min(xa, xb);
              const w = Math.abs(xb - xa);
              return (
                <G key={`o${i}`}>
                  <Rect
                    x={px(x0)}
                    y={py(hole.y1)}
                    width={w * scale}
                    height={(hole.y1 - hole.y0) * scale}
                    fill={c.blueSoft}
                    stroke={c.blue}
                    strokeWidth={1.4}
                  />
                  {w * scale > 54 && (
                    <SvgText
                      x={px(x0 + w / 2)}
                      y={py(hole.y0) - 8}
                      fill={c.blue}
                      fontSize={10}
                      fontWeight="700"
                      textAnchor="middle">
                      {hole.seg.type === 'window'
                        ? 'Fenêtre'
                        : hole.seg.open
                        ? 'Passage'
                        : 'Porte'}
                    </SvgText>
                  )}
                  {/*
                    LE COFFRE DE VOLET, HACHURÉ — la zone où l'on ne perce
                    pas. Le scan ne le voit pas ; déclaré d'un geste, il se
                    dessine ici, coté, au-dessus de sa baie.
                  */}
                  {(() => {
                    const e = empriseDuCoffre(hole.seg, x0);
                    if (!e) return null;
                    const hh = (e.y1 - e.y0) * scale;
                    return (
                      <G>
                        <Rect
                          x={px(e.x0)}
                          y={py(e.y1)}
                          width={(e.x1 - e.x0) * scale}
                          height={hh}
                          fill={c.amber}
                          fillOpacity={0.14}
                          stroke={c.amber}
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                        />
                        {w * scale > 70 && hh > 11 && (
                          <SvgText
                            x={px(e.x0 + (e.x1 - e.x0) / 2)}
                            y={py(e.y0) - hh / 2 + 3.5}
                            fill={c.amber}
                            fontSize={9}
                            fontWeight="800"
                            textAnchor="middle">
                            {`COFFRE ${Math.round(hole.seg.coffre! * 100)}`}
                          </SvgText>
                        )}
                      </G>
                    );
                  })()}
                </G>
              );
            })}

            {/*
              LES RETOURS : leur cote, et leur axe.

              Le mur porte sa longueur au-dessus et son milieu en
              accroche ; un retour n'avait ni l'une ni l'autre. On les lui
              donne, dans la même écriture : la cote sous le plafond, en
              centimètres puisque c'est ainsi qu'on la relit au mètre, et
              l'axe en filigrane, sur lequel l'appareil s'accroche quand
              on passe dessus. La cote se dessine APRÈS les baies pour
              rester lisible par-dessus le bleu d'une porte-fenêtre.
            */}
            {retours.map((r, i) => {
              const larg = r.x1 - r.x0;
              const milieu = (r.x0 + r.x1) / 2;
              // Celui qu'on a désigné sur le plan, ou à défaut celui qui
              // porte l'appareil tenu : c'est le même besoin — savoir sur
              // quel morceau de mur on travaille.
              const vise =
                (focusX != null && focusX >= r.x0 && focusX <= r.x1) ||
                (!!monRetour && monRetour.x0 === r.x0 && monRetour.x1 === r.x1);
              const teinte = vise ? c.blue : c.inkFaint;
              const yc = py(H) + 15;
              // Un retour étroit ne peut pas porter son nombre entre ses
              // deux traits : on écrit alors la cote au-dessus, et on
              // garde les traits pour dire où elle s'applique.
              const large = larg * scale > 40;
              return (
                <G key={`ret${i}`}>
                  {larg >= 0.06 && (
                    <Line
                      x1={px(milieu)}
                      y1={py(H) - 2}
                      x2={px(milieu)}
                      y2={py(0) + 2}
                      stroke={c.blue}
                      strokeWidth={vise ? 1 : 0.8}
                      strokeDasharray="2 6"
                      opacity={vise ? 0.75 : 0.35}
                    />
                  )}
                  <Line
                    x1={px(r.x0) + 1}
                    y1={yc}
                    x2={px(r.x1) - 1}
                    y2={yc}
                    stroke={teinte}
                    strokeWidth={1}
                  />
                  {[r.x0, r.x1].map((x) => (
                    <Line
                      key={`t${i}-${x}`}
                      x1={px(x)}
                      y1={yc - 4}
                      x2={px(x)}
                      y2={yc + 4}
                      stroke={teinte}
                      strokeWidth={1.2}
                    />
                  ))}
                  <Rect
                    x={px(milieu) - 17}
                    y={(large ? yc : yc - 13) - 7}
                    width={34}
                    height={14}
                    rx={7}
                    fill={c.surface}
                  />
                  <SvgText
                    x={px(milieu)}
                    y={(large ? yc : yc - 13) + 4}
                    fill={vise ? c.blue : c.inkSoft}
                    fontSize={9}
                    fontWeight={vise ? '800' : '700'}
                    textAnchor="middle">
                    {`${cm(larg)}`}
                  </SvgText>
                </G>
              );
            })}

            {/* La plaque commune d'un ensemble : un cadre autour des postes
                réunis. C'est ce qu'on visse, et ça se voit sur le mur. */}
            {[...new Set(mine.filter((f) => f.group).map((f) => f.group))].map(
              (g) => {
                const lot = mine.filter((f) => f.group === g && f.side === side);
                if (lot.length < 2) return null;
                const xs = lot.map((f) => faceX(face, f.along));
                const ys = lot.map((f) => f.height);
                const larg = Math.max(...lot.map((f) => FIXTURES[f.kind].w));
                const haut = Math.max(...lot.map((f) => FIXTURES[f.kind].h));
                const x0 = Math.min(...xs) - larg / 2;
                const x1 = Math.max(...xs) + larg / 2;
                const y0 = Math.min(...ys) - haut / 2;
                const y1 = Math.max(...ys) + haut / 2;
                return (
                  <Rect
                    key={g}
                    x={px(x0) - 3}
                    y={py(y1) - 3}
                    width={(x1 - x0) * scale + 6}
                    height={(y1 - y0) * scale + 6}
                    rx={4}
                    fill="none"
                    stroke={c.inkFaint}
                    strokeWidth={1.4}
                  />
                );
              },
            )}

            {/* Repère d'accrochage, le temps du geste. */}
            {guide.x !== undefined && (
              <Line
                x1={px(guide.x)}
                y1={py(H) - 6}
                x2={px(guide.x)}
                y2={py(0) + 6}
                stroke={c.green}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            )}
            {guide.y !== undefined && (
              <Line
                x1={px(0) - 6}
                y1={py(guide.y)}
                x2={px(face.len) + 6}
                y2={py(guide.y)}
                stroke={c.green}
                strokeWidth={1.2}
                strokeDasharray="4 3"
              />
            )}

            {/* Appareils. Ceux de l'autre face restent visibles, en creux :
                savoir qu'une prise est déjà posée dos à dos évite de percer
                deux fois au même endroit. */}
            {mine.map((f) => {
              const s = FIXTURES[f.kind];
              const x = faceX(face, f.along);
              const w = Math.max(20, s.w * scale);
              const h = Math.max(20, s.h * scale);
              const on = f.id === selectedId;
              const ghost = f.side !== side;
              return (
                <G key={f.id} opacity={ghost ? 0.32 : 1}>
                  <Rect
                    x={px(x) - w / 2}
                    y={py(f.height) - h / 2}
                    width={w}
                    height={h}
                    rx={4}
                    fill={ghost ? 'none' : s.color}
                    stroke={on ? c.ink : ghost ? c.inkFaint : '#00000033'}
                    strokeWidth={on ? 2.4 : 1.2}
                    strokeDasharray={ghost ? '4 3' : '0'}
                  />
                  <SvgText
                    x={px(x)}
                    y={py(f.height) + 3.5}
                    fill={ghost ? c.inkFaint : '#FFFFFF'}
                    fontSize={Math.min(11, Math.max(8, w / 2.6))}
                    fontWeight="800"
                    textAnchor="middle">
                    {s.short}
                  </SvgText>
                  {on && (
                    <Circle
                      cx={px(x)}
                      cy={py(f.height)}
                      r={Math.max(w, h) / 2 + 7}
                      fill="none"
                      stroke={c.blue}
                      strokeWidth={1.6}
                    />
                  )}
                </G>
              );
            })}

            {/* Les trois cotes de l'appareil sélectionné. */}
            {selected && (
              <G>
                <Dim
                  x1={px(0)}
                  y1={py(selected.height)}
                  x2={px(selX)}
                  y2={py(selected.height)}
                  text={`${cm(selX)}`}
                  c={c}
                  push={{ x: -1, y: 0 }}
                />
                <Dim
                  x1={px(selX)}
                  y1={py(selected.height)}
                  x2={px(face.len)}
                  y2={py(selected.height)}
                  text={`${cm(face.len - selX)}`}
                  c={c}
                  push={{ x: 1, y: 0 }}
                />
                <Dim
                  x1={px(selX)}
                  y1={py(0)}
                  x2={px(selX)}
                  y2={py(selected.height)}
                  text={`${cm(selected.height)}`}
                  c={c}
                  vertical
                  push={{ x: 1, y: 0 }}
                />
              </G>
            )}
          </Svg>
        )}

        {/* L'alerte de hauteur se pose SUR le dessin, au-dessus de
            l'appareil qu'elle concerne — jamais dans le flux du panneau.
            En bandeau, elle poussait tout le reste vers le bas : le schéma
            changeait de taille selon qu'une prise était trop basse ou non,
            et le regard perdait le mur qu'il suivait. Ici, elle désigne ce
            dont elle parle, et rien ne bouge. */}
        {hauteurKO && selected && face && (
          (() => {
            // Ni cadre, ni fond : rien ne doit masquer l'appareil dont on
            // parle. Le mot suffit, en rouge, avec un liseré clair derrière
            // les lettres pour qu'il tienne sur n'importe quel fond. On le
            // pose AU-DESSUS de l'appareil, et en dessous quand il n'y a
            // plus de place — près du plafond, il sortait du cadre.
            const xc = px(faceX(face, selected.along));
            const yTete = py(selected.height + SPECS[selected.kind].h / 2);
            const dessus = yTete > 34;
            return (
              <TouchableOpacity
                style={[
                  styles.alerte,
                  {
                    left: Math.max(4, Math.min(layout.w - 204, xc - 100)),
                    top: dessus
                      ? yTete - 30
                      : py(selected.height - SPECS[selected.kind].h / 2) + 8,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() =>
                  moveFixture(selected.id, selected.along, SPECS[selected.kind].std)
                }>
                <Text style={styles.alerteTexte} numberOfLines={1}>
                  {`Trop ${hauteurKO.sens === 'trop bas' ? 'bas' : 'haut'}`}
                  <Text style={styles.alerteFixe}>
                    {`  ·  remettre à ${cm(SPECS[selected.kind].std)} cm`}
                  </Text>
                </Text>
              </TouchableOpacity>
            );
          })()
        )}
      </View>

{/* L'objectif de la pièce, en une ligne : son nom, où on en est, et le
          geste. Le pavé précédent portait un titre sur deux lignes et un gros
          bouton bleu qui le chevauchait — beaucoup de bruit pour dire
          « il en manque quatre ». */}
      {fusion &&
        (() => {
          const lot = mine.filter(
            (f) => f.id === fusion.base || f.id === fusion.moved,
          );
          const n = lot.reduce((t, f) => t + postsOf(f.kind).length, 0);
          const dispo = cotesPossibles();
          return (
            <View style={styles.ens}>
              <View style={styles.ensHead}>
                <View style={styles.ensPastille}>
                  <Text style={styles.ensPastilleText}>{n}</Text>
                </View>
                <View style={styles.ensTitres}>
                  <Text style={styles.ensTitre} numberOfLines={1}>
                    {`Ensemble ${n} postes`}
                  </Text>
                  <Text style={styles.ensSous} numberOfLines={1}>
                    {`entraxe ${Math.round(ENTRAXE * 1000)} mm · plaque ${Math.round(
                      ((n - 1) * ENTRAXE + PLAQUE) * 1000,
                    )} mm`}
                  </Text>
                </View>
                <TouchableOpacity style={styles.ensOk} onPress={() => setFusion(null)}>
                  <Text style={styles.ensOkText}>OK</Text>
                </TouchableOpacity>
              </View>

              {/*
                DEUX SÉLECTEURS ET UN BOUTON — à la taille du pouce.

                Tout tenait sur une seule ligne : quatre flèches de 30 × 26
                points, deux étiquettes de dix points et un « Séparer » sans
                fond, tassés bord à bord. Apple demande 44 points de côté
                pour une cible tactile, et ce n'est pas un caprice : en
                dessous, un doigt sur deux tombe à côté — ici, sur la
                flèche voisine, qui déplace la prise du mauvais côté.

                On reprend donc la grammaire d'iOS : un sélecteur segmenté
                par question (de quel côté ? quel axe ?), chacun sur toute
                la largeur, et l'action destructive isolée en bas, en
                rouge, comme partout ailleurs dans le système.
              */}
              <Text style={styles.ensLabel}>CÔTÉ DU SECOND POSTE</Text>
              <View style={styles.ensSeg}>
                {PLATE_SIDES.filter((sd) => dispo.includes(sd.key)).map((sd) => {
                  const actif = fusion.cote === sd.key;
                  return (
                    <TouchableOpacity
                      key={sd.key}
                      style={[styles.ensSegItem, actif && styles.ensSegItemOn]}
                      accessibilityLabel={sd.label}
                      onPress={() => appliquer(sd.key, fusion.centre)}>
                      <Svg width={18} height={18} viewBox="0 0 24 24">
                        <Path
                          d={sd.arrow}
                          stroke={actif ? '#FFFFFF' : c.ink}
                          strokeWidth={2.2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </Svg>
                      <Text
                        style={[
                          styles.ensSegText,
                          actif && styles.ensSegTextOn,
                        ]}>
                        {sd.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.ensLabel}>AXE DE RÉFÉRENCE</Text>
              <View style={styles.ensSeg}>
                {[
                  {
                    on: false,
                    label: 'Première fixe',
                    hint: 'la première ne bouge pas',
                  },
                  {
                    on: true,
                    label: 'Centré',
                    hint: 'la plaque se centre sur son axe',
                  },
                ].map((opt) => {
                  const actif = fusion.centre === opt.on;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.ensSegLarge, actif && styles.ensSegItemOn]}
                      onPress={() => appliquer(fusion.cote, opt.on)}>
                      <Text
                        style={[
                          styles.ensSegText,
                          actif && styles.ensSegTextOn,
                        ]}>
                        {opt.label}
                      </Text>
                      <Text
                        style={[
                          styles.ensSegHint,
                          actif && styles.ensSegHintOn,
                        ]}
                        numberOfLines={1}>
                        {opt.hint}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.ensSplit} onPress={separer}>
                <Text style={styles.ensSplitText}>Séparer les appareils</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

      {/*
        LA CONFORMITÉ TIENT EN UNE LIGNE.

        Elle en prenait six : un bandeau d'objectif avec sa règle en toutes
        lettres, puis un encadré rouge par constat — qui répétait LA MÊME
        phrase. Sur un téléphone, ça mangeait le tiers de l'écran, juste
        au-dessus des boutons, et on lisait deux fois « trois socles 16 A au
        minimum » sans jamais voir le mur.

        Ce qui compte se dit en une ligne : où on en est (2/3), ce qui
        manque, et le geste qui corrige. La règle complète reste à un appui
        — on la lit quand on la conteste, pas à chaque pose.
      */}
      {(objectif || constats.length > 0) && (
        <View style={styles.bilan}>
          <TouchableOpacity
            style={styles.bilanHead}
            activeOpacity={0.7}
            accessibilityLabel={regleOuverte ? 'Masquer la règle' : 'Voir la règle'}
            onPress={() => setRegleOuverte((v) => !v)}>
            {objectif && (
              <View style={styles.bilanJauge}>
                <View
                  style={[
                    styles.bilanFill,
                    objectif.poses >= objectif.exiges && styles.bilanFillOk,
                    {
                      width: `${Math.min(
                        100,
                        (objectif.poses / Math.max(1, objectif.exiges)) * 100,
                      )}%`,
                    },
                  ]}
                />
              </View>
            )}
            <View style={styles.bilanTextes}>
              <Text style={styles.bilanTitre} numberOfLines={1}>
                {!objectif
                  ? 'Conformité'
                  : objectif.inconnu
                    ? 'Pièce à nommer'
                    : `${objectif.nom} · ${objectif.poses}/${objectif.exiges} socle${
                        objectif.exiges > 1 ? 's' : ''
                      }`}
              </Text>
              {objectif?.inconnu && (
                <Text style={styles.bilanManque} numberOfLines={1}>
                  Ses exigences dépendent de son usage · minimum appliqué
                </Text>
              )}
              {constats.length > 0 && (
                <Text style={styles.bilanManque} numberOfLines={1}>
                  {constats.map((i2) => i2.message.split(' : ').pop()).join(' · ')}
                </Text>
              )}
            </View>
            {/* Le premier geste qui corrige, et lui seul : proposer trois
                boutons rouges à la fois, c'est n'en faire toucher aucun. */}
            {(() => {
              const fix = constats.find((i2) => i2.fix?.type === 'poser')?.fix as
                | { kind: FixtureKind; height?: number; label: string }
                | undefined;
              if (fix) {
                return (
                  <TouchableOpacity
                    style={styles.bilanFix}
                    hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
                    onPress={() => poser(fix.kind, fix.height)}>
                    <Text style={styles.bilanFixText} numberOfLines={1}>
                      {fix.label}
                    </Text>
                  </TouchableOpacity>
                );
              }
              if (objectif && objectif.poses < objectif.exiges) {
                return (
                  <TouchableOpacity
                    style={styles.bilanFix}
                    hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
                    onPress={() =>
                      poser('prise', objectif.surPlan ? 1.1 : undefined)
                    }>
                    <Text style={styles.bilanFixText}>Poser une prise</Text>
                  </TouchableOpacity>
                );
              }
              return null;
            })()}
          </TouchableOpacity>
          {regleOuverte && (
            <Text style={styles.bilanRegle}>
              {[objectif?.regle, ...constats.map((i2) => i2.regle)]
                .filter(Boolean)
                .filter((r, k, t) => t.indexOf(r) === k)
                .join('\n')}
            </Text>
          )}
        </View>
      )}

      {/* Un ensemble multiposte ne se pose pas au jugé : voici où percer,
          depuis le bord gauche du mur. C'est la seule chose que
          l'électricien ait à reporter sur son tracé. */}
      {selected && postsOf(selected.kind).length > 1 && face && (
        <View style={styles.percage}>
          <Text style={styles.percageTitle}>
            {`${postsOf(selected.kind).length} postes · entraxe ${Math.round(
              ENTRAXE * 1000,
            )} mm · boîte Ø ${Math.round(BOITE_D * 1000)}`}
          </Text>
          <Text style={styles.percageVals}>
            {boxOffsets(selected.kind)
              .map(
                (o) =>
                  `${Math.round(
                    (faceX(face, selected.along) -
                      FIXTURES[selected.kind].w / 2 +
                      o) *
                      100,
                  )}`,
              )
              .join('  ·  ')}
            <Text style={styles.percageUnit}>{'  cm du bord'}</Text>
          </Text>
        </View>
      )}

      {/* Le pavé de réglage fin : le doigt cache toujours l'appareil qu'il
          déplace, et un pouce ne vise pas au centimètre. Quatre flèches et
          un pas règlent la cote sans rien masquer — et déplacent l'ENSEMBLE
          quand l'appareil en fait partie. */}
      {selected && (
        <View style={styles.pave}>
          <TouchableOpacity
            style={styles.pavePas}
            onPress={() => setPas(pas === 0.01 ? 0.05 : 0.01)}>
            <Text style={styles.pavePasText}>{`${Math.round(pas * 100)} cm`}</Text>
          </TouchableOpacity>
          {/*
            LES QUATRE FLÈCHES VIENNENT DU JEU COMMUN — relevé du patron,
            liens à l'appui : `square-alt-arrow-left/down/right/up`.

            C'étaient quatre chevrons tracés à la main, au trait, dans une
            app qui ne dessine qu'en silhouette : posés sous une rangée de
            pleins, ils se lisaient comme des traits de construction plutôt
            que comme des boutons. Le carré plein leur donne le poids d'une
            touche — et c'en est une : on l'appuie dix fois de suite pour
            gagner dix centimètres.
          */}
          {(
            [
              ['gauche', -1, 0, SOLAIRES.flecheGauche],
              ['droite', 1, 0, SOLAIRES.flecheDroite],
              ['haut', 0, 1, SOLAIRES.flecheHaut],
              ['bas', 0, -1, SOLAIRES.flecheBas],
            ] as const
          ).map(([cle, dx, dy, fleche]) => (
            <TouchableOpacity
              key={cle}
              style={styles.paveBtn}
              accessibilityLabel={cle}
              // `onPressIn` et non `onPress` : le pas part au contact, et
              // l'enchaînement s'arrête quand le doigt se lève — y compris
              // s'il glisse hors du bouton (`onPressOut` couvre les deux).
              onPressIn={() => lancerFleche(dx, dy)}
              onPressOut={arreterFleche}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path d={fleche} fill={c.ink} fillRule="evenodd" />
              </Svg>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/*
        LES COTES NE S'AFFICHENT QUE S'IL Y A UN APPAREIL.

        Trois champs à « — » et cinq boutons éteints occupaient le bas de
        l'écran dès l'ouverture : de la place prise par des commandes qui
        ne commandaient rien. Sans sélection, il n'y a qu'une chose à
        faire sur un mur vide, et elle tient sur un bouton.
      */}
      {selected && (
        <View style={styles.fields}>
          {field('g', 'Gauche', selX)}
          {field('d', 'Droite', face.len - selX)}
          {field('h', 'Hauteur', selected.height)}
        </View>
      )}

      {/*
        LA RANGÉE NE MONTRE QUE CE QUI SERT — relevé du patron : « plus de
        simplicité, optimisé smartphone ».

        Quatre boutons ÉTEINTS occupaient le bas dès l'ouverture : de la
        place prise par des commandes qui ne commandaient rien, et un écran
        qui a l'air en panne. Sans appareil tenu, il n'y a que deux gestes
        possibles sur un mur — en poser un, le photographier — et ils
        tiennent au large. Dès qu'on en tient un, ses quatre gestes
        remplacent les deux autres.

        La photo descend ici : c'est une ACTION, elle n'avait rien à faire
        dans l'en-tête à disputer sa place au titre.
      */}
      <View style={styles.actions}>
        {(
          [
            {
              key: 'add',
              label: 'Ajouter',
              on: true,
              tint: c.blue,
              paths: ['M12 5 v14', 'M5 12 h14'],
              press: onAddRequest,
            },
            {
              key: 'photo',
              label:
                (retourVise ? 'Photo du retour' : 'Photo') +
                (mesPhotos.length > 0 ? ` (${mesPhotos.length})` : ''),
              on: !selected,
              tint: c.ink,
              /*
                L'APPAREIL PHOTO DU JEU COMMUN — relevé du patron, lien à
                l'appui : `camera`, « utilise cette icône là où il y a la
                photo en icône pour la photo de mur ».

                Il était dessiné à la main — boîtier, objectif, viseur, au
                trait — et c'est le bouton qui DÉCLENCHE la photo : le
                premier qu'on cherche du regard quand on veut garder une
                trace d'un mur. La punaise posée sur le plan porte déjà la
                même silhouette ; c'est le même objet, ce doit être le même
                dessin.
              */
              paths: [],
              plein: SOLAIRES.image,
              press: async () => {
                const prise = await RoomScan.takePhoto();
                if (prise) {
                  const cible = retourVise
                    ? (retourVise.x0 + retourVise.x1) / 2
                    : face.len / 2;
                  // L'identifiant du coffre voyage avec la punaise : c'est
                  // lui qui retrouvera l'image après une réinstallation.
                  addPhoto(
                    wallId,
                    fromFaceX(face, cible),
                    prise.path,
                    prise.asset,
                  );
                  haptic('succes');
                }
              },
            },
            {
              key: 'std',
              label: spec ? `${cm(spec.std)} cm` : 'Hauteur',
              on: !!selected,
              tint: c.ink,
              // Double flèche verticale : la hauteur normalisée.
              paths: ['M12 4 v16', 'M8.5 7.5 L12 4 l3.5 3.5', 'M8.5 16.5 L12 20 l3.5 -3.5'],
              press: () =>
                selected && spec && moveFixture(selected.id, selected.along, spec.std),
            },
            {
              key: 'flip',
              label: 'Autre face',
              on: !!selected,
              tint: c.ink,
              // Deux flèches opposées : on passe de l'autre côté du mur.
              paths: ['M4 9 h16', 'M16.5 5.5 L20 9 l-3.5 3.5', 'M20 15 H4', 'M7.5 11.5 L4 15 l3.5 3.5'],
              press: () => selected && flipFixture(selected.id),
            },
            {
              /**
               * LE COPIER A VÉCU, LE LIEN LE REMPLACE — relevé du patron :
               * « enlève le bouton copier, remplace-le par un bouton
               * lien... prise ou éclairage mural. Mais ça ne doit pas être
               * possible pour le courant faible. »
               *
               * Une prise commandée, une applique : ils s'allument par un
               * interrupteur, comme un point du plafond. On tient
               * l'appareil ici, on ferme l'établi, et l'on touche sa
               * commande sur le plan — le geste des lignes de spots.
               */
              key: 'lien',
              label: 'Lier',
              on: !!selected && seCommande(selected.kind) && !!onLinkRequest,
              tint: c.blue,
              // Deux maillons de chaîne, au trait comme ses voisins.
              paths: [
                'M9.5 14.5 l5 -5',
                'M11.5 7.5 l1.6 -1.6 a3.1 3.1 0 0 1 4.4 4.4 L15.9 11.9',
                'M12.5 16.5 l-1.6 1.6 a3.1 3.1 0 0 1 -4.4 -4.4 L8.1 12.1',
              ],
              press: () =>
                selected &&
                seCommande(selected.kind) &&
                onLinkRequest?.(selected.id),
            },
            {
              key: 'del',
              label: 'Retirer',
              on: !!selected,
              tint: c.danger,
              /* La poubelle du jeu commun — relevé du patron :
                 `trash-bin-trash`, « partout où il y a la poubelle ». Elle
                 était tracée à la main, au trait ; c'est la seule
                 silhouette de cette rangée, et c'est celle qui doit se
                 reconnaître sans lire. */
              paths: [],
              plein: SOLAIRES.supprimer,
              press: () => {
                if (!selected) return;
                removeFixture(selected.id);
                onSelect(null);
              },
            },
          ] as const
        )
          // Un bouton qui ne commande rien ne s'affiche pas : il prenait
          // la place, et donnait à l'écran l'air d'être en panne.
          .filter((b) => b.on)
          .map((b) => (
          <TouchableOpacity
            key={b.key}
            style={[styles.action, b.key === 'add' && styles.actionAdd]}
            // Le mot est dessous, en légende : c'est l'étiquette qui nomme
            // le bouton pour qui se fait lire l'écran.
            accessibilityLabel={b.label}
            onPress={b.press}>
            <Svg width={21} height={21} viewBox="0 0 24 24">
              {'plein' in b && b.plein ? (
                <Path d={b.plein} fill={b.tint} fillRule="evenodd" />
              ) : (
                b.paths.map((d) => (
                  <Path
                    key={d}
                    d={d}
                    stroke={b.key === 'add' ? '#FFFFFF' : b.tint}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))
              )}
            </Svg>
            <Text
              style={[
                styles.actionText,
                b.key === 'add' && styles.actionTextAdd,
              ]}
              numberOfLines={1}>
              {b.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/*
        GARDER ET REFERMER — l'action principale, en bas, sur toute la
        largeur.

        Elle vivait EN HAUT, en vert, coincée entre le titre et la croix :
        sur un téléphone tenu d'une main, c'est le coin le plus difficile à
        atteindre, et elle mangeait la place du titre. En bas et pleine
        largeur, on la vise sans regarder — et elle prend le bleu de la
        maison, le vert n'étant celui de rien d'autre dans l'app.
      */}
      <TouchableOpacity
        style={styles.valider}
        accessibilityLabel="Enregistrer et fermer"
        onPress={() => {
          depart.current = null;
          haptic('succes');
          onClose();
        }}>
        <Check size={19} color="#FFFFFF" strokeWidth={2.8} />
        <Text style={styles.validerText}>Enregistrer</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Ligne de cote : trait, embouts, valeur sur fond plein. */
function Dim({
  x1,
  y1,
  x2,
  y2,
  text,
  c,
  vertical,
  push,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  c: Palette;
  vertical?: boolean;
  /** Où s'échapper quand la cote est trop courte pour porter son texte. */
  push?: { x: number; y: number };
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const w = text.length * 6.5 + 12;
  // Une cote de 20 cm fait 15 px de long : son texte n'y tient pas. On ne la
  // supprime surtout pas — c'est LA cote que l'électricien vient lire — on
  // sort l'étiquette du côté où il y a de la place.
  const trop = len < w + 6;
  const echap = trop ? (w / 2 + 8) : 0;
  const mx = (x1 + x2) / 2 + (push?.x ?? 0) * echap;
  const my = (y1 + y2) / 2 + (push?.y ?? 0) * echap;
  if (len < 3) return null;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.blue} strokeWidth={1} />
      {[
        [x1, y1],
        [x2, y2],
      ].map(([x, y], i) => (
        <Line
          key={i}
          x1={vertical ? x - 4 : x}
          y1={vertical ? y : y - 4}
          x2={vertical ? x + 4 : x}
          y2={vertical ? y : y + 4}
          stroke={c.blue}
          strokeWidth={1}
        />
      ))}
      {trop && (
        <Line
          x1={(x1 + x2) / 2}
          y1={(y1 + y2) / 2}
          x2={mx}
          y2={my}
          stroke={c.blue}
          strokeWidth={0.8}
        />
      )}
      <Rect
        x={mx - w / 2}
        y={my - 8}
        width={w}
        height={16}
        rx={4}
        fill={c.surface}
        stroke={c.blue}
        strokeWidth={0.8}
      />
      <SvgText
        x={mx}
        y={my + 4}
        fill={c.blue}
        fontSize={10.5}
        fontWeight="800"
        textAnchor="middle">
        {text}
      </SvgText>
    </G>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    /**
     * LA FEUILLE FAIT LA TAILLE DE CE QU'ELLE PORTE.
     *
     * Elle prenait toute la hauteur (`flex: 1`) : sous les commandes,
     * cent cinquante à trois cents points de blanc, tous les jours, sur
     * chaque mur. Un établi se juge à ce qu'il porte, pas à la place
     * qu'il occupe — et le dessin, lui, a déjà sa hauteur propre, calculée
     * sur les proportions du mur.
     */
    sheet: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: 14,
      width: '100%',
      maxHeight: '100%',
      ...shadowCard,
    },
    header: { flexDirection: 'row', alignItems: 'flex-start' },
    headerTexts: { flex: 1, paddingRight: 10, minWidth: 0 },
    /** Les trois sorties alignées, à la même hauteur et au même gabarit. */
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { color: c.ink, fontSize: 17, fontWeight: '800' },
    subtitle: {
      color: c.inkFaint,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 2,
    },
    /** L'enregistrement : vert, écrit, et à 44 points sous le doigt. */
    /*
      L'ACTION PRINCIPALE : pleine largeur, en bas, dans le bleu maison.
      Le vert n'était la couleur de rien d'autre dans l'app, et il criait
      plus fort que le titre qu'il écrasait.
    */
    valider: {
      width: '100%',
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      // 50 points : on la vise sans regarder, le pouce à plat.
      height: 50,
      borderRadius: radius.md,
      backgroundColor: c.blue,
    },
    validerText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
    /**
     * LA CROIX EST UN BLOC, pas une pastille.
     *
     * Ronde et six points plus basse que le bouton vert, elle flottait à
     * côté de lui : deux sorties voisines qui ne se ressemblaient pas,
     * dont la plus destructrice était la plus petite. Même hauteur, même
     * rayon, même famille — le vert garde, le gris abandonne.
     */
    close: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Le mur occupe la moitié de l'écran, pas une vignette de 250 px.
    //
    // On place des appareils au doigt, à 5 cm près, sur un dessin qui
    // faisait 250 px de haut : le pouce couvrait le tiers du mur. La feuille
    // prend maintenant toute la hauteur disponible, et le dessin ce qui
    // reste une fois les commandes posées.
    /**
     * LE CADRE ÉPOUSE LA FORME DU MUR.
     *
     * Il prenait toute la hauteur disponible (`flex: 1`, 300 points au
     * minimum) : un mur de 2,70 m par 2,49 y flottait au milieu d'un grand
     * vide, en haut comme en bas, et la feuille paraîssait mal remplie
     * alors qu'elle était pleine — de rien. Sa hauteur se calcule
     * désormais à partir de la largeur disponible et des proportions du
     * mur : le dessin remplit son cadre, et la feuille se resserre.
     */
    canvas: {
      marginTop: 10,
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      overflow: 'hidden',
    },
    /**
     * L'interrupteur des meubles, posé SUR le dessin.
     *
     * Une ligne de plus dans une feuille déjà dense coûte plus cher qu'un
     * bouton posé là où se voit son effet. Il ne paraît que si ce mur a
     * des meubles devant lui — sinon il n'a rien à montrer.
     */
    calque: {
      alignSelf: 'flex-start',
      marginTop: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 30,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
    },
    calqueOn: { backgroundColor: c.inkSoft },
    calqueText: { color: c.inkSoft, fontSize: 11, fontWeight: '800' },
    calqueTextOn: { color: '#FFFFFF' },
    /** LE BANDEAU DE CONFORMITÉ : une ligne, une jauge, un geste. */
    bilan: {
      marginTop: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    bilanHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    /** La jauge est VERTICALE et fine : elle dit l'avancement sans ligne. */
    bilanJauge: {
      width: 4,
      height: 30,
      borderRadius: 2,
      backgroundColor: c.line,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    bilanFill: { width: 4, backgroundColor: c.danger, borderRadius: 2 },
    bilanFillOk: { backgroundColor: c.green },
    bilanTextes: { flex: 1, minWidth: 0 },
    bilanTitre: { color: c.ink, fontSize: 13, fontWeight: '800' },
    bilanManque: { color: c.danger, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
    bilanFix: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      // 40 points dessinés, 44 sous le doigt avec son débord : la règle
      // d'iOS, que le banc d'essai vérifie bouton par bouton.
      minHeight: 40,
      maxWidth: 150,
      justifyContent: 'center',
    },
    bilanFixText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    bilanRegle: {
      color: c.inkFaint,
      fontSize: 11.5,
      lineHeight: 16,
      marginTop: 8,
    },
    guide: {
      marginTop: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingLeft: 12,
      paddingRight: 8,
      paddingVertical: 8,
    },
    guideHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    guideTitle: { color: c.ink, fontSize: 12.5, fontWeight: '700', flex: 1 },
    guideState: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3 },
    guideFix: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    guideOk: { color: c.green },
    guideKo: { color: c.danger },
    guideBar: {
      height: 3,
      borderRadius: 2,
      backgroundColor: c.line,
      marginTop: 8,
      marginRight: 4,
      overflow: 'hidden',
    },
    guideFill: { height: 3, borderRadius: 2, backgroundColor: c.danger },
    guideFillOk: { backgroundColor: c.green },
    guideRule: {
      color: c.inkFaint,
      fontSize: 10,
      lineHeight: 13.5,
      marginTop: 6,
      marginRight: 4,
    },
    warn: {
      marginTop: 8,
      backgroundColor: c.surfaceSunken,
      borderLeftWidth: 3,
      borderLeftColor: c.danger,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    warnHead: { flexDirection: 'row', alignItems: 'center' },
    warnTitle: { color: c.danger, fontSize: 12.5, fontWeight: '800', flex: 1 },
    warnFix: {
      backgroundColor: c.danger,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    warnFixText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },
    warnRule: { color: c.inkSoft, fontSize: 10.5, lineHeight: 14.5, marginTop: 3 },
    // L'ensemble, en UNE ligne de commandes : le côté, l'axe, et de quoi
    // défaire. L'ancien pavé posait une question à laquelle l'appareil avait
    // déjà répondu — il était rangé avant même qu'on lise le titre.
    ens: {
      marginTop: 10,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    ensHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    ensPastille: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ensPastilleText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
    ensTitres: { flex: 1, minWidth: 0 },
    ensTitre: { color: c.ink, fontSize: 12.5, fontWeight: '800' },
    ensSous: { color: c.inkFaint, fontSize: 9.5, fontWeight: '700' },
    ensOk: {
      backgroundColor: c.blue,
      borderRadius: radius.pill,
      paddingHorizontal: 18,
      // 44 points de haut : la cible tactile minimale d'iOS, pas un
      // arrondi de mise en page.
      minHeight: 44,
      justifyContent: 'center',
    },
    ensOkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
    /** Le titre d'un sélecteur, comme les en-têtes de section d'iOS. */
    ensLabel: {
      color: c.inkFaint,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.6,
      marginTop: 12,
      marginBottom: 5,
    },
    /** Le rail d'un sélecteur segmenté : fond creux, pastilles dedans. */
    ensSeg: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: radius.sm,
      padding: 3,
      gap: 3,
    },
    ensSegItem: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.sm - 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    ensSegLarge: {
      flex: 1,
      minHeight: 46,
      borderRadius: radius.sm - 2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      gap: 1,
    },
    ensSegItemOn: { backgroundColor: c.blue },
    ensSegText: { color: c.ink, fontSize: 11.5, fontWeight: '800' },
    ensSegTextOn: { color: '#FFFFFF' },
    ensSegHint: { color: c.inkFaint, fontSize: 9, fontWeight: '700' },
    ensSegHintOn: { color: '#FFFFFFCC' },
    ensSplit: {
      marginTop: 10,
      minHeight: 44,
      borderRadius: radius.sm,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ensSplitText: { color: c.danger, fontSize: 13, fontWeight: '800' },
    fusion: {
      marginTop: 10,
      backgroundColor: c.blueSoft,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    fusionHead: { flexDirection: 'row', alignItems: 'center' },
    fusionTitle: { color: c.blue, fontSize: 13, fontWeight: '800', flex: 1 },
    fusionNon: { color: c.inkFaint, fontSize: 12.5, fontWeight: '700' },
    fusionRule: {
      color: c.inkSoft,
      fontSize: 10.5,
      lineHeight: 14,
      marginTop: 2,
    },
    fusionCotes: { flexDirection: 'row', gap: 8, marginTop: 9 },
    fusionCote: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: radius.sm,
      paddingVertical: 8,
    },
    fusionCoteText: {
      color: c.inkSoft,
      fontSize: 9.5,
      fontWeight: '700',
      marginTop: 2,
    },
    // Un texte, pas une bulle : un cadre posé sur le dessin cache
    // justement l'appareil dont il parle. Le liseré clair derrière les
    // lettres suffit à les détacher du fond.
    alerte: {
      position: 'absolute',
      width: 200,
      alignItems: 'center',
    },
    alerteTexte: {
      color: c.danger,
      fontSize: 12.5,
      fontWeight: '900',
      textAlign: 'center',
      textShadowColor: c.surface,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 4,
    },
    alerteFixe: {
      color: c.inkSoft,
      fontSize: 11.5,
      fontWeight: '800',
    },
    // Un pavé de flèches larges : 44 px, la cible minimale d'un pouce.
    pave: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
    },
    pavePas: {
      backgroundColor: c.blue,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    pavePasText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    paveBtn: {
      flex: 1,
      height: 44,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Une ACTION, pas un réglage : l'appareil photo prend le bleu de l'app.
    // En gris sur gris, à côté de la croix de fermeture, on ne le voyait
    // pas — et une photo de repérage non prise est une photo perdue.
    photo: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    percage: {
      marginTop: 8,
      backgroundColor: c.blueSoft,
      borderRadius: radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    percageTitle: {
      color: c.blue,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    percageVals: {
      color: c.ink,
      fontSize: 15,
      fontWeight: '800',
      marginTop: 2,
    },
    percageUnit: { color: c.inkFaint, fontSize: 10.5, fontWeight: '700' },
    fields: { flexDirection: 'row', gap: 8, marginTop: 12 },
    field: { flex: 1 },
    fieldLabel: {
      color: c.inkFaint,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 4,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.lineStrong,
      paddingHorizontal: 10,
    },
    fieldInput: {
      flex: 1,
      color: c.ink,
      fontSize: 16,
      fontWeight: '700',
      paddingVertical: 9,
    },
    fieldUnit: { color: c.inkFaint, fontSize: 12, fontWeight: '600' },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 12,
      paddingBottom: 4,
    },
    action: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.sm,
      paddingVertical: 9,
    },
    actionAdd: { backgroundColor: c.blue },
    actionText: {
      color: c.inkSoft,
      fontWeight: '700',
      fontSize: 9.5,
      marginTop: 3,
      opacity: 0.75,
    },
    actionTextAdd: { color: '#FFFFFF', opacity: 0.9 },
    actionOff: { opacity: 0.35 },
    ghost: {
      marginTop: 12,
      borderRadius: radius.sm,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: c.surfaceSunken,
    },
    ghostText: { color: c.inkSoft, fontWeight: '600', fontSize: 14.5 },
  }),
);
