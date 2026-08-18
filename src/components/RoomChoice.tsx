/**
 * LE CHOIX D'UNE PIÈCE À AJOUTER — des vignettes, pas une liste de pilules.
 *
 * Première version : huit pastilles grises posées deux par deux, qui se
 * touchaient, toutes de la même forme, avec le nom et les cotes empilés
 * dedans. Rien n'y distinguait un WC d'un séjour, et le bouton « Annuler »
 * ressemblait à une neuvième pièce. Le relevé du chantier était juste :
 * « les blocs se touchent, ça manque d'identité et de visuel ».
 *
 * Une pièce, ça a une FORME. Chaque choix porte donc son plan en miniature,
 * à ses vraies proportions — un WC de 1,40 × 1,00 est un timbre-poste, un
 * séjour de 5 × 4 remplit sa vignette — avec le seuil de sa porte dessiné
 * sur le mur du bas. On reconnaît ce qu'on va poser avant d'avoir lu.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

export interface RoomModel {
  nom: string;
  largeur: number;
  profondeur: number;
}

const fr = (v: number) => v.toFixed(2).replace('.', ',');

/**
 * Le plan de la pièce, en miniature, à ses proportions.
 *
 * La plus grande des pièces proposées remplit la vignette ; les autres se
 * dessinent à la même échelle. C'est ce rapport de taille qui fait qu'on
 * voit la différence entre un dégagement et un séjour sans lire un chiffre.
 */
function MiniPlan({
  largeur,
  profondeur,
  echelle,
  c,
}: {
  largeur: number;
  profondeur: number;
  /** Points par mètre, commune à toutes les vignettes. */
  echelle: number;
  c: Palette;
}) {
  const W = 92;
  const H = 58;
  const w = Math.max(10, largeur * echelle);
  const h = Math.max(10, profondeur * echelle);
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  // Le seuil : une coupure dans le mur du bas, large de 80 cm au plus.
  const porte = Math.min(w * 0.45, 0.8 * echelle);
  return (
    <Svg width={W} height={H}>
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill={c.blueSoft}
        stroke={c.blue}
        strokeWidth={2}
      />
      {/* Le seuil, en blanc par-dessus le mur : la pièce a une entrée. */}
      <Line
        x1={x + w / 2 - porte / 2}
        y1={y + h}
        x2={x + w / 2 + porte / 2}
        y2={y + h}
        stroke={c.surface}
        strokeWidth={3}
      />
    </Svg>
  );
}

export function RoomChoice({
  modeles,
  onChoose,
  onCustom,
}: {
  modeles: RoomModel[];
  onChoose: (m: RoomModel) => void;
  /** « Sur mesure » : on saisit soi-même la largeur et la profondeur. */
  onCustom: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Une seule échelle pour toutes : c'est ce qui rend les tailles
  // comparables d'une vignette à l'autre.
  const plusGrand = Math.max(
    ...modeles.map((m) => Math.max(m.largeur, m.profondeur)),
    1,
  );
  const echelle = 46 / plusGrand;
  return (
    <View style={styles.grille}>
      {modeles.map((m) => (
        <TouchableOpacity
          key={m.nom}
          style={styles.carte}
          activeOpacity={0.85}
          accessibilityLabel={m.nom}
          onPress={() => onChoose(m)}>
          <MiniPlan
            largeur={m.largeur}
            profondeur={m.profondeur}
            echelle={echelle}
            c={c}
          />
          <Text style={styles.nom} numberOfLines={1}>
            {m.nom}
          </Text>
          <Text style={styles.cotes} numberOfLines={1}>
            {`${fr(m.largeur)} × ${fr(m.profondeur)} m`}
          </Text>
        </TouchableOpacity>
      ))}
      {/*
        SUR MESURE — parce qu'aucun catalogue ne couvre un chantier.
        Elle ferme la grille, dessinée en tirets : on voit qu'elle n'a pas
        encore de forme, c'est à l'électricien de la donner.
      */}
      <TouchableOpacity
        style={[styles.carte, styles.carteLibre]}
        activeOpacity={0.85}
        accessibilityLabel="Sur mesure"
        onPress={onCustom}>
        <Svg width={92} height={58}>
          <Rect
            x={16}
            y={9}
            width={60}
            height={40}
            rx={2}
            fill="none"
            stroke={c.inkFaint}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        </Svg>
        <Text style={styles.nom} numberOfLines={1}>
          Sur mesure
        </Text>
        <Text style={styles.cotes} numberOfLines={1}>
          À vos cotes
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => ({
  grille: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    // L'écart entre deux cartes, dans les deux sens : c'est lui qui manquait.
    gap: 10,
    paddingVertical: 4,
  },
  carte: {
    width: '31%' as const,
    minWidth: 104,
    flexGrow: 1,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.line,
  },
  carteLibre: { backgroundColor: c.surface },
  nom: { color: c.ink, fontSize: 13.5, fontWeight: '800' as const, marginTop: 6 },
  cotes: { color: c.inkFaint, fontSize: 11.5, fontWeight: '600' as const },
}));
