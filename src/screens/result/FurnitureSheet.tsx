/**
 * LE CATALOGUE DE MOBILIER.
 *
 * Une recherche plutôt qu'un mode d'emploi : à trente entrées, on sait ce
 * qu'on cherche, et faire défiler la liste prend plus de temps que de le
 * taper. Le filtre ignore accents et casse — « evier » doit trouver
 * « Évier », sinon il vaudrait mieux ne pas en avoir.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import { useTheme } from '../../theme';
import { CATALOGUE, type CatalogItem } from '../../geometry/catalogue';
import { furnKind, furnitureStrokes } from '../../geometry/furniture';
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

/** La silhouette du meuble, vue de dessus : on le reconnaît sans lire. */
export function FurnitureThumb({ item }: { item: CatalogItem }) {
  const c = useTheme();
  const W = 74;
  const H = 52;
  // Emprise mise à l'échelle de la vignette, marges comprises.
  const k = Math.min((W - 14) / item.w, (H - 14) / item.d);
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
        strokeWidth={1.2}
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
              strokeWidth={1.1}
              strokeLinecap="round"
            />
          ))}
        </React.Fragment>
      ))}
    </Svg>
  );
}

export function FurnitureSheet({
  visible,
  quete,
  onQuete,
  onClose,
  onPick,
}: {
  visible: boolean;
  quete: string;
  onQuete: (q: string) => void;
  onClose: () => void;
  onPick: (item: CatalogItem) => void;
}) {
  const teinte = useTheme();
  const styles = getStyles(teinte);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>Ajouter un meuble</Text>
          <TextInput
            style={styles.catSearch}
            value={quete}
            onChangeText={onQuete}
            placeholder="Rechercher un meuble…"
            placeholderTextColor={teinte.inkFaint}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <ScrollView style={styles.catScroll} keyboardShouldPersistTaps="handled">
            {CATALOGUE.map((famille) => {
              const trouves = famille.items.filter((i) => matchItem(i, quete));
              if (trouves.length === 0) return null;
              return (
                <View key={famille.name}>
                  <Text style={styles.elecFamily}>{famille.name}</Text>
                  <View style={styles.catGrid}>
                    {trouves.map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={styles.catCard}
                        activeOpacity={0.8}
                        onPress={() => onPick(item)}>
                        <FurnitureThumb item={item} />
                        <Text style={styles.catName} numberOfLines={1}>
                          {item.label}
                        </Text>
                        <Text style={styles.catDims}>
                          {/* La marque devant la cote : une référence du
                              commerce se reconnaît, une cote se vérifie. */}
                          {`${item.marque ? `${item.marque} · ` : ''}${fr(item.w, 2)} × ${fr(item.d, 2)} m`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
