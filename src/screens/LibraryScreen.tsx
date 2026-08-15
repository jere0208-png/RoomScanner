import React, { useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
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

export function LibraryScreen() {
  const saves = useScanStore((s) => s.saves);
  const setScreen = useScanStore((s) => s.setScreen);
  const openSave = useScanStore((s) => s.openSave);
  const deleteSave = useScanStore((s) => s.deleteSave);
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

  const renderItem = ({ item }: { item: SavedScan }) => {
    // Surface = somme des pièces ; un contour non refermé ne compte pas.
    const parts = roomParts(item.walls, item.rooms);
    const total = totalArea(parts);
    const details = [
      ...(parts.length > 1 ? [`${parts.length} pièces`] : []),
      `${item.walls.length} murs`,
      ...(total
        ? [`${total.exact ? '' : '≈ '}${total.area.toFixed(1).replace('.', ',')} m²`]
        : []),
      ...(item.objects.length > 0 ? [`${item.objects.length} objets`] : []),
    ].join(' · ');

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => openSave(item.id)}>
        <View style={styles.rowTexts}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowSub}>{formatDate(item.updatedAt)}</Text>
          <Text style={styles.rowDetails}>{details}</Text>
        </View>
        <TouchableOpacity
          style={[styles.trash, armedId === item.id && styles.trashArmed]}
          onPress={() => onTrash(item.id)}>
          <Text
            style={[
              styles.trashText,
              armedId === item.id && styles.trashTextArmed,
            ]}>
            {armedId === item.id ? 'Supprimer' : '✕'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mes scans</Text>
        <Text style={styles.count}>{saves.length}</Text>
      </View>

      {saves.length === 0 ? (
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
        <FlatList
          data={saves}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
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
    borderWidth: 1,
    borderColor: c.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backChevron: { color: c.ink, fontSize: 24, fontWeight: '600', marginTop: -3 },
  title: { color: c.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  count: {
    color: c.blue,
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: c.blueSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginLeft: 10,
    overflow: 'hidden',
  },
  list: { paddingBottom: 30 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.md + 2,
    padding: 15,
    marginBottom: 10,
    ...shadowCard,
  },
  rowTexts: { flex: 1, marginRight: 10 },
  rowName: { color: c.ink, fontSize: 16, fontWeight: '700' },
  rowSub: { color: c.inkFaint, fontSize: 12, marginTop: 2 },
  rowDetails: { color: c.inkSoft, fontSize: 13, marginTop: 5, fontWeight: '600' },
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
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
}));
