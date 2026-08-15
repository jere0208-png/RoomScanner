import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Line, Path, Polygon } from 'react-native-svg';
import {
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { bounds, roomParts, totalArea } from '../geometry/floorplan';
import { useScanStore, type SavedScan, type ScanFolder } from '../store/scanStore';

const two = (n: number) => String(n).padStart(2, '0');
function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} · ${two(
    d.getHours(),
  )}h${two(d.getMinutes())}`;
}

/** Ce qu'un scan raconte en une ligne : pièces, murs, surface, objets. */
function detailsOf(item: SavedScan): string {
  const parts = roomParts(item.walls, item.rooms);
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
const HOLD_MS = 500;
const THUMB = 54;

/**
 * L'aperçu du plan, redessiné à la volée.
 *
 * Pas une capture d'écran : le plan est une liste de murs, on le retrace en
 * quelques traits dans 54 px. Rien à stocker, rien à invalider — un scan
 * retouché montre son nouveau contour à l'ouverture suivante de la liste.
 */
function PlanThumb({ scan, c }: { scan: SavedScan; c: Palette }) {
  const b = bounds(scan.walls);
  const pad = 5;
  const w = Math.max(0.5, b.maxX - b.minX);
  const h = Math.max(0.5, b.maxZ - b.minZ);
  const k = Math.min((THUMB - pad * 2) / w, (THUMB - pad * 2) / h);
  const px = (x: number) => pad + (x - b.minX) * k + (THUMB - pad * 2 - w * k) / 2;
  const py = (z: number) => pad + (z - b.minZ) * k + (THUMB - pad * 2 - h * k) / 2;
  const parts = roomParts(scan.walls, scan.rooms);
  return (
    <Svg width={THUMB} height={THUMB}>
      {parts.map((part) =>
        part.surface ? (
          <Polygon
            key={part.roomId}
            points={part.surface.pts.map((p) => `${px(p.x)},${py(p.z)}`).join(' ')}
            fill={c.blueSoft}
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
          stroke={c.ink}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

/** Le dossier, dessiné : rabat au fond, façade par-dessus. */
function FolderGlyph({ back, front }: { back: string; front: string }) {
  return (
    <Svg width={72} height={58} viewBox="0 0 72 58">
      <Path
        d="M3 12 a7 7 0 0 1 7 -7 h15.5 a5 5 0 0 1 3.9 1.9 l4.2 5.3 h31.4 a7 7 0 0 1 7 7 v31.8 a7 7 0 0 1 -7 7 H10 a7 7 0 0 1 -7 -7 z"
        fill={back}
      />
      <Path
        d="M3 22 h66 v26.9 a7 7 0 0 1 -7 7 H10 a7 7 0 0 1 -7 -7 z"
        fill={front}
      />
    </Svg>
  );
}

interface TileProps {
  folder: ScanFolder;
  count: number;
  over: boolean;
  lift: Animated.Value;
  styles: ReturnType<typeof getStyles>;
  palette: Palette;
  onOpen: () => void;
  onLong: () => void;
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
  lift,
  styles,
  palette,
  onOpen,
  onLong,
  bind,
}: TileProps) {
  const scale = lift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, over ? 1.26 : 1.12],
  });
  return (
    <Animated.View style={[styles.tile, { transform: [{ scale }] }]}>
      <View ref={bind} collapsable={false}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onOpen}
          onLongPress={onLong}
          style={styles.tileTouch}>
          <View style={styles.tileGlyph}>
            <FolderGlyph
              back={over ? palette.blue : palette.blueDark}
              front={over ? palette.sky : palette.blue}
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
  arme: boolean;
  fige: boolean;
  dedans?: boolean;
  shift: Animated.Value;
  lift: Animated.Value;
  styles: ReturnType<typeof getStyles>;
  palette: Palette;
  onOpen: () => void;
  onTrash: () => void;
  onOut: () => void;
  onHold: () => void;
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
  arme,
  fige,
  dedans,
  shift,
  lift,
  styles,
  palette,
  onOpen,
  onTrash,
  onOut,
  onHold,
  onRelease,
}: RowProps) {
  const anim = pris
    ? {
        opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
        transform: [
          { translateY: shift },
          {
            scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }),
          },
        ],
      }
    : null;
  return (
    <Animated.View
      style={[styles.row, pris && styles.rowGhost, anim]}
      onTouchStart={onHold}
      onTouchEnd={() => onRelease(true)}
      onTouchCancel={() => onRelease(false)}>
      <TouchableOpacity
        style={styles.rowMain}
        activeOpacity={0.75}
        disabled={fige}
        onPress={onOpen}>
        <View style={styles.thumb}>
          <PlanThumb scan={item} c={palette} />
        </View>
        <View style={styles.rowTexts}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowSub}>{formatDate(item.updatedAt)}</Text>
          <Text style={styles.rowDetails}>{detailsOf(item)}</Text>
        </View>
      </TouchableOpacity>
      {dedans && !pris && (
        <TouchableOpacity style={styles.outButton} onPress={onOut}>
          <Text style={styles.outText}>Sortir</Text>
        </TouchableOpacity>
      )}
      {!pris && (
        <TouchableOpacity
          style={[styles.trash, arme && styles.trashArmed]}
          onPress={onTrash}>
          <Text style={[styles.trashText, arme && styles.trashTextArmed]}>
            {arme ? 'Supprimer' : '✕'}
          </Text>
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
  const deleteSave = useScanStore((s) => s.deleteSave);
  const addFolder = useScanStore((s) => s.addFolder);
  const renameFolder = useScanStore((s) => s.renameFolder);
  const removeFolder = useScanStore((s) => s.removeFolder);
  const moveToFolder = useScanStore((s) => s.moveToFolder);
  const palette = useTheme();
  const styles = getStyles(palette);

  // Suppression en deux temps : premier appui = confirmation, second = suppression.
  const [armedId, setArmedId] = useState<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTrash = (id: string) => {
    if (armedId === id) {
      deleteSave(id);
      setArmedId(null);
      return;
    }
    setArmedId(id);
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    disarmTimer.current = setTimeout(() => setArmedId(null), 3000);
  };

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
  const liste = dossierOuvert
    ? byFolder.get(dossierOuvert.id) ?? []
    : byFolder.get('') ?? [];

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
  const dragRef = useRef<string | null>(null);
  const overRef = useRef<string | null>(null);
  const shift = useRef(new Animated.Value(0)).current;
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
    if (deposer && scan && cible) moveToFolder(scan, cible);
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
  const beginHold = (id: string) => {
    stopHold();
    // Rien à viser : pas de dossier, ou on est déjà dedans.
    if (dossierOuvert || folders.length === 0) return;
    holdTimer.current = setTimeout(() => {
      mesurer();
      dragRef.current = id;
      setDragId(id);
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

  const folderMenu = (f: ScanFolder) =>
    Alert.alert(f.name, 'Que voulez-vous en faire ?', [
      {
        text: 'Renommer',
        onPress: () =>
          Alert.prompt(
            'Nom du dossier',
            'Il ne sert qu’au rangement : aucun fichier n’est déplacé.',
            (t) => renameFolder(f.id, t ?? ''),
            'plain-text',
            f.name,
          ),
      },
      {
        text: 'Supprimer le dossier',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Supprimer ce dossier ?',
            'Les scans qu’il contient reviennent à la racine, rien n’est perdu.',
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: () => {
                  removeFolder(f.id);
                  if (inside === f.id) setInside(null);
                },
              },
            ],
          ),
      },
      { text: 'Annuler', style: 'cancel' },
    ]);

  const vide = saves.length === 0 && folders.length === 0;

  return (
    <View style={styles.container} {...pan.panHandlers}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (dossierOuvert ? setInside(null) : setScreen('home'))}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {dossierOuvert ? dossierOuvert.name : 'Mes scans'}
        </Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{liste.length}</Text>
        </View>
      </View>

      {dragId !== null && (
        <View style={styles.dragHint}>
          <Text style={styles.dragHintText}>
            {over ? 'Relâchez pour ranger ici' : 'Amenez le scan sur un dossier'}
          </Text>
        </View>
      )}

      {vide ? (
        <View style={styles.empty}>
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
                  lift={lift}
                  styles={styles}
                  palette={palette}
                  onOpen={() => setInside(f.id)}
                  onLong={() => folderMenu(f)}
                  bind={(node) => {
                    tileRefs.current.set(f.id, node);
                  }}
                />
              ))}
            </View>
          )}

          {liste.length === 0 && (
            <Text style={styles.emptyFolder}>
              {dossierOuvert
                ? 'Ce dossier est vide. Revenez en arrière et amenez-y un scan.'
                : 'Tous vos scans sont rangés dans des dossiers.'}
            </Text>
          )}

          {liste.map((s) => (
            <ScanRow
              key={s.id}
              item={s}
              dedans={!!dossierOuvert}
              pris={dragId === s.id}
              arme={armedId === s.id}
              fige={dragId !== null}
              shift={shift}
              lift={lift}
              styles={styles}
              palette={palette}
              onOpen={() => openSave(s.id)}
              onTrash={() => onTrash(s.id)}
              onOut={() => moveToFolder(s.id, null)}
              onHold={() => beginHold(s.id)}
              onRelease={releaseRow}
            />
          ))}
        </ScrollView>
      )}

      {/* Créer un dossier : bouton flottant en bas à droite, là où le pouce
          tombe naturellement. */}
      {!dossierOuvert && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
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
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingTop: 58,
    paddingHorizontal: 18,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
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
  backChevron: { color: c.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
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
  list: { paddingBottom: 104 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  tile: { width: '33.33%', alignItems: 'center', marginBottom: 16 },
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
  emptyFolder: {
    color: c.inkFaint,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
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
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm,
    backgroundColor: c.bg,
    marginRight: 12,
    overflow: 'hidden',
  },
  rowTexts: { flex: 1, marginRight: 10 },
  rowName: { color: c.ink, fontSize: 16, fontWeight: '700' },
  rowSub: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  rowDetails: { color: c.inkSoft, fontSize: 13, marginTop: 4, fontWeight: '600' },
  outButton: {
    backgroundColor: c.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  outText: { color: c.inkSoft, fontSize: 12, fontWeight: '700' },
  trash: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  trashArmed: { backgroundColor: c.danger },
  trashText: { color: c.inkSoft, fontSize: 13, fontWeight: '700' },
  trashTextArmed: { color: '#FFFFFF', fontSize: 12 },
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
  emptyTitle: { color: c.ink, fontSize: 19, fontWeight: '800' },
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
