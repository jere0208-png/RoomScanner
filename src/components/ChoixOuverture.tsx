/**
 * QUELLE MENUISERIE ON POSE — la question d'abord, le trou ensuite.
 *
 * Relevé de chantier : « j'ai essayé de créer une ouverture sur un mur, ça
 * devrait proposer directement si on veut une porte, une fenêtre, etc. avec
 * un beau pop-up imagé ».
 *
 * Le menu du mur posait une baie, toujours, aux proportions d'aucune
 * menuiserie — 60 % de la longueur du mur, 85 % de sa hauteur. Il fallait
 * ensuite ouvrir le bandeau, entrer dans « Réglages de la menuiserie »,
 * déclarer la nature, puis recoter la largeur et la hauteur : quatre gestes
 * pour une porte, et un plan couvert de trous entre-temps.
 *
 * TROIS VIGNETTES, PAS TROIS LIGNES DE TEXTE. Une porte, une fenêtre et une
 * baie se reconnaissent d'un coup d'œil quand elles sont DESSINÉES ; en
 * mots, il faut les lire, et « ouverture » ne veut plus rien dire à la
 * troisième ligne. Chaque vignette est une élévation — ce qu'on voit en se
 * plantant devant le mur — et porte sa cote de départ dessous : c'est elle
 * qui sera posée, et elle se corrige ensuite au bandeau.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { COTES_MENUISERIE } from '../store/scanStore';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

export type NatureOuverture = 'door' | 'window' | 'opening';

/** La cote de départ, dite comme un menuisier : 83 × 204. */
const cote = (n: NatureOuverture) => {
  const c = COTES_MENUISERIE[n];
  return `${Math.round(c.largeur * 100)} × ${Math.round(c.hauteur * 100)}`;
};

/**
 * LES TROIS ÉLÉVATIONS, en 60 × 64.
 *
 * Même main que le reste : le trait porte le dessin, l'aplat ne fait que
 * l'asseoir. Le sol est toujours à la même hauteur d'une vignette à
 * l'autre — c'est lui qui rend les trois comparables d'un regard, et c'est
 * lui qui dit qu'une fenêtre a une allège et qu'une porte n'en a pas.
 */
const SOL = 56;

function VignettePorte({ teinte, trait }: { teinte: string; trait: string }) {
  return (
    <Svg width={60} height={64} viewBox="0 0 60 64">
      <Line x1={2} y1={SOL} x2={58} y2={SOL} stroke={trait} strokeWidth={2} />
      {/* Le dormant, puis le vantail : une porte, c'est deux traits. */}
      <Rect
        x={14}
        y={8}
        width={32}
        height={48}
        rx={1.5}
        fill={teinte}
        fillOpacity={0.18}
        stroke={teinte}
        strokeWidth={2}
      />
      <Rect
        x={18}
        y={12}
        width={24}
        height={44}
        rx={1}
        fill="none"
        stroke={teinte}
        strokeWidth={1.2}
        opacity={0.7}
      />
      {/* La poignée : le seul détail qui distingue une porte d'un panneau. */}
      <Circle cx={22.5} cy={34} r={2.1} fill={teinte} />
    </Svg>
  );
}

function VignetteFenetre({ teinte, trait }: { teinte: string; trait: string }) {
  return (
    <Svg width={60} height={64} viewBox="0 0 60 64">
      <Line x1={2} y1={SOL} x2={58} y2={SOL} stroke={trait} strokeWidth={2} />
      {/* L'allège, hachurée d'un seul trait : c'est de la maçonnerie, et
          c'est là que passe la prise qu'on posera dessous. */}
      <Line
        x1={12}
        y1={SOL}
        x2={12}
        y2={38}
        stroke={trait}
        strokeWidth={1}
        opacity={0.5}
      />
      <Line
        x1={48}
        y1={SOL}
        x2={48}
        y2={38}
        stroke={trait}
        strokeWidth={1}
        opacity={0.5}
      />
      <Rect
        x={12}
        y={12}
        width={36}
        height={26}
        rx={1.5}
        fill={teinte}
        fillOpacity={0.18}
        stroke={teinte}
        strokeWidth={2}
      />
      {/* Les deux ouvrants, et l'appui qui déborde. */}
      <Line x1={30} y1={12} x2={30} y2={38} stroke={teinte} strokeWidth={1.6} />
      <Line x1={8} y1={39.5} x2={52} y2={39.5} stroke={teinte} strokeWidth={2} />
    </Svg>
  );
}

function VignetteBaie({ teinte, trait }: { teinte: string; trait: string }) {
  return (
    <Svg width={60} height={64} viewBox="0 0 60 64">
      <Line x1={2} y1={SOL} x2={58} y2={SOL} stroke={trait} strokeWidth={2} />
      {/* Deux tableaux et un linteau : le vide au milieu EST le dessin. */}
      <Path
        d={`M 14 ${SOL} V 8 H 46 V ${SOL}`}
        fill="none"
        stroke={teinte}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path
        d={`M 14 ${SOL} V 8 H 46 V ${SOL}`}
        fill={teinte}
        fillOpacity={0.1}
        stroke="none"
      />
      {/* La flèche qui traverse : on passe là, il n'y a rien à ouvrir. */}
      <Line x1={20} y1={34} x2={40} y2={34} stroke={teinte} strokeWidth={1.6} />
      <Path
        d="M 36 30 L 40 34 L 36 38"
        fill="none"
        stroke={teinte}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChoixOuverture({
  visible,
  onClose,
  onChoisir,
}: {
  visible: boolean;
  onClose: () => void;
  onChoisir: (nature: NatureOuverture) => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  /*
    Le choix attend que la feuille soit PARTIE — même raison qu'ailleurs :
    iOS ne présente qu'une fenêtre modale à la fois, et poser l'ouverture
    peut en ouvrir une autre (le bandeau de la menuiserie).
  */
  const attente = React.useRef<null | (() => void)>(null);
  const choix: {
    nature: NatureOuverture;
    mot: string;
    hint: string;
    teinte: string;
    Vignette: (p: { teinte: string; trait: string }) => React.ReactElement;
  }[] = [
    {
      nature: 'door',
      mot: 'Porte',
      hint: cote('door'),
      teinte: c.amber,
      Vignette: VignettePorte,
    },
    {
      nature: 'window',
      mot: 'Fenêtre',
      hint: `${cote('window')} · bas à 95 du sol`,
      teinte: c.sky,
      Vignette: VignetteFenetre,
    },
    {
      nature: 'opening',
      mot: 'Baie libre',
      hint: cote('opening'),
      teinte: c.inkSoft,
      Vignette: VignetteBaie,
    },
  ];
  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        const suite = attente.current;
        attente.current = null;
        suite?.();
      }}>
      <View style={styles.entete}>
        <Text style={styles.title}>Qu’est-ce qu’on perce ?</Text>
        <Text style={styles.subtitle}>
          Posée au milieu du mur, aux cotes courantes — à recoter au bandeau.
        </Text>
      </View>
      <View style={styles.rangee}>
        {choix.map(({ nature, mot, hint, teinte, Vignette }) => (
          <Pressable
            key={nature}
            accessibilityRole="button"
            accessibilityLabel={`${mot}, ${hint}`}
            style={({ pressed }) => [styles.carte, pressed && styles.cartePressee]}
            onPress={() => {
              attente.current = () => onChoisir(nature);
              onClose();
            }}>
            <Vignette teinte={teinte} trait={c.inkFaint} />
            <Text style={styles.mot}>{mot}</Text>
            <Text style={styles.cote}>{hint}</Text>
          </Pressable>
        ))}
      </View>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    entete: { marginBottom: 14, paddingRight: 34 },
    title: { color: c.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: {
      color: c.inkFaint,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 3,
    },
    rangee: { flexDirection: 'row', gap: 10 },
    /* Trois cartes de même largeur : c'est l'égalité qui dit qu'il n'y a
       pas de choix par défaut. */
    carte: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
    },
    cartePressee: { backgroundColor: c.line },
    mot: { color: c.ink, fontSize: 14.5, fontWeight: '700', marginTop: 8 },
    cote: {
      color: c.inkFaint,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2,
      textAlign: 'center',
    },
  }),
);
