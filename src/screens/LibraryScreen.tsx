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
import Svg, { Path } from 'react-native-svg';
import {
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { roomParts, totalArea } from '../geometry/floorplan';
import { useScanStore, type SavedScan } from '../store/scanStore';

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

/** Appui long au bout duquel un scan se décolle de la liste. */
const HOLD_MS = 1000;


interface RowProps {
  item: SavedScan;
  dedans?: boolean;
  pris: boolean;
  arme: boolean;
  fige: boolean;
  shift: Animated.Value;
  styles: ReturnType<typeof getStyles>;
  onOpen: () => void;
  onTrash: () => void;
  onOut: () => void;
  onHold: () => void;
  onRelease: (deposer: boolean) => void;
}

/**
 * Une ligne de scan.
 *
 * Composant à part entière, et pas une fonction interne au rendu : défini
 * dedans, React en voyait un type neuf à chaque changement d'état et
 * démontait la ligne — le doigt perdait en plein geste celle qu'il tenait.
 */
function ScanRow({
  item,
  dedans,
  pris,
  arme,
  fige,
  shift,
  styles,
  onOpen,
  onTrash,
  onOut,
  onHold,
  onRelease,
}: RowProps) {
  return (
    <Animated.View
      style={[
        styles.row,
        dedans && styles.rowNested,
        pris && styles.rowDragging,
        pris && { transform: [{ translateY: shift }, { scale: 1.03 }] },
      ]}
      onTouchStart={onHold}
      onTouchEnd={() => onRelease(true)}
      onTouchCancel={() => onRelease(false)}>
      <TouchableOpacity
        style={styles.rowTexts}
        activeOpacity={0.75}
        disabled={fige}
        onPress={onOpen}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowSub}>{formatDate(item.updatedAt)}</Text>
        <Text style={styles.rowDetails}>{detailsOf(item)}</Text>
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
  const styles = getStyles(useTheme());

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

  const [open, setOpen] = useState<Record<string, boolean>>({});
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
  const racine = byFolder.get('') ?? [];

  // ------------------------------------------------------- glisser-déposer
  //
  // Le doigt tient le scan une seconde, il se décolle, et la liste cesse de
  // défiler tant qu'on le tient : sans ça, le geste de déplacement et celui
  // de défilement se disputent le même mouvement vertical.
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
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zones = useRef<{ id: string; top: number; bottom: number }[]>([]);
  const folderRefs = useRef(new Map<string, View | null>());

  const mesurer = () => {
    zones.current = [];
    folderRefs.current.forEach((node, id) => {
      node?.measureInWindow((_x, y, _w, h) => {
        zones.current.push({ id, top: y, bottom: y + h });
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
        const y = e.nativeEvent.pageY;
        const zone = zones.current.find((z) => y >= z.top && y <= z.bottom);
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

  /** Le doigt se pose : au bout d'une seconde, le scan se décolle. */
  const beginHold = (id: string) => {
    stopHold();
    holdTimer.current = setTimeout(() => {
      mesurer();
      dragRef.current = id;
      setDragId(id);
    }, HOLD_MS);
  };

  /** Le doigt se lève : on dépose, ou on renonce. */
  const releaseRow = (deposer: boolean) => {
    stopHold();
    if (dragRef.current) endDrag(deposer);
  };

  const promptFolderName = (id: string, actuel: string) =>
    Alert.prompt(
      'Nom du dossier',
      'Il n’est utilisé que pour ranger : rien n’est déplacé sur le disque.',
      (t) => renameFolder(id, t ?? ''),
      'plain-text',
      actuel,
    );

  return (
    <View style={styles.container} {...pan.panHandlers}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mes scans</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{saves.length}</Text>
        </View>
      </View>

      {dragId !== null && (
        <View style={styles.dragHint}>
          <Text style={styles.dragHintText}>
            {over
              ? 'Relâchez pour ranger dans ce dossier'
              : 'Amenez le scan sur un dossier'}
          </Text>
        </View>
      )}

      {saves.length === 0 && folders.length === 0 ? (
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
          {/* Les dossiers d'abord : c'est le rangement, il vient en tête. */}
          {folders.map((f) => {
            const dedans = byFolder.get(f.id) ?? [];
            const ouvert = !!open[f.id];
            return (
              <View key={f.id}>
                <View
                  ref={(node) => {
                    folderRefs.current.set(f.id, node);
                  }}
                  collapsable={false}
                  style={[
                    styles.folder,
                    over === f.id && styles.folderOver,
                  ]}>
                  <TouchableOpacity
                    style={styles.folderMain}
                    activeOpacity={0.75}
                    onPress={() => setOpen((o) => ({ ...o, [f.id]: !ouvert }))}>
                    <Text style={styles.folderChevron}>{ouvert ? '⌄' : '›'}</Text>
                    <View style={styles.rowTexts}>
                      <Text style={styles.folderName} numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text style={styles.folderSub}>
                        {dedans.length === 0
                          ? 'vide — amenez-y un scan'
                          : `${dedans.length} scan${dedans.length > 1 ? 's' : ''}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.folderAction}
                    onPress={() => promptFolderName(f.id, f.name)}>
                    <Text style={styles.folderActionText}>✎</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.folderAction}
                    onPress={() =>
                      Alert.alert(
                        'Supprimer ce dossier ?',
                        'Les scans qu’il contient reviennent à la racine, ' +
                          'rien n’est perdu.',
                        [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: 'Supprimer',
                            style: 'destructive',
                            onPress: () => removeFolder(f.id),
                          },
                        ],
                      )
                    }>
                    <Text style={styles.folderActionText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {ouvert &&
                  dedans.map((s) => (
                    <ScanRow
                      key={s.id}
                      item={s}
                      dedans
                      pris={dragId === s.id}
                      arme={armedId === s.id}
                      fige={dragId !== null}
                      shift={shift}
                      styles={styles}
                      onOpen={() => openSave(s.id)}
                      onTrash={() => onTrash(s.id)}
                      onOut={() => moveToFolder(s.id, null)}
                      onHold={() => beginHold(s.id)}
                      onRelease={releaseRow}
                    />
                  ))}
              </View>
            );
          })}

          {racine.map((s) => (
            <ScanRow
              key={s.id}
              item={s}
              pris={dragId === s.id}
              arme={armedId === s.id}
              fige={dragId !== null}
              shift={shift}
              styles={styles}
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
          tombe naturellement. Dans l'en-tête, il était à l'opposé de la
          main et se confondait avec le compteur. */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => {
          const id = addFolder();
          setOpen((o) => ({ ...o, [id]: true }));
        }}>
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
  title: { color: c.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
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
  dragHint: {
    position: 'absolute',
    top: 104,
    left: 18,
    right: 18,
    zIndex: 20,
    backgroundColor: c.blueSoft,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  dragHintText: { color: c.blue, fontSize: 13, fontWeight: '700' },
  list: { paddingBottom: 104 },
  folder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadowCard,
  },
  // Survol : le dossier s'allume, on sait où le scan va tomber.
  folderOver: { borderColor: c.blue, backgroundColor: c.blueSoft },
  folderMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  folderChevron: {
    color: c.inkFaint,
    fontSize: 18,
    fontWeight: '800',
    width: 20,
  },
  folderName: { color: c.ink, fontSize: 16, fontWeight: '800' },
  folderSub: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  folderAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  folderActionText: { color: c.inkSoft, fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md + 2,
    padding: 15,
    marginBottom: 10,
    ...shadowCard,
  },
  rowNested: { marginLeft: 22 },
  // Le scan pris en main : soulevé, teinté, il ne fait plus partie de la liste.
  rowDragging: {
    ...glow(c.blue),
    borderWidth: 1.5,
    borderColor: c.blue,
    zIndex: 10,
    elevation: 10,
  },
  rowTexts: { flex: 1, marginRight: 10 },
  rowName: { color: c.ink, fontSize: 16, fontWeight: '700' },
  rowSub: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  rowDetails: { color: c.inkSoft, fontSize: 13, marginTop: 5, fontWeight: '600' },
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
