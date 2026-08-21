/**
 * Système de design EchoPlan.
 * Blanc / gris / noir + un seul bleu saturé comme signature.
 * Deux palettes (claire et sombre), suivies automatiquement
 * selon le réglage d'apparence du téléphone.
 */
import { useColorScheme } from 'react-native';
import { useScanStore } from './store/scanStore';

export interface Palette {
  bg: string;
  surface: string;
  surfaceSunken: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  line: string;
  lineStrong: string;
  blue: string;
  blueDark: string;
  blueSoft: string;
  danger: string;
  green: string;
  amber: string;
  sky: string;
  scanInk: string;
  scanPill: string;
  scanPillSoft: string;
}

export const light: Palette = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceSunken: '#EFF1F5',
  ink: '#0B0D12',
  inkSoft: '#5A6472',
  inkFaint: '#98A1AE',
  line: '#E7EAF0',
  lineStrong: '#D6DBE3',
  blue: '#1F5BFF',
  blueDark: '#0E3FD8',
  blueSoft: '#EBF0FF',
  danger: '#E5484D',
  green: '#1DB954',
  amber: '#E8A13B',
  sky: '#3EB8E5',
  scanInk: '#F4F6FA',
  scanPill: 'rgba(12,14,20,0.72)',
  scanPillSoft: 'rgba(12,14,20,0.55)',
};

export const dark: Palette = {
  bg: '#0D1015',
  surface: '#151A21',
  surfaceSunken: '#1D2530',
  ink: '#F2F5F9',
  inkSoft: '#A6B0BD',
  inkFaint: '#67717F',
  line: '#242C37',
  lineStrong: '#35404E',
  blue: '#3D77FF',
  blueDark: '#2A5CE8',
  blueSoft: '#17264A',
  danger: '#F0575C',
  green: '#2BC963',
  amber: '#EFAF52',
  sky: '#54C4EE',
  scanInk: '#F4F6FA',
  scanPill: 'rgba(12,14,20,0.72)',
  scanPillSoft: 'rgba(12,14,20,0.55)',
};

/**
 * Palette du moment.
 *
 * `system` — le réglage par défaut — rend la main au téléphone : l'app
 * bascule quand iOS bascule, sans que personne y pense. « clair » et
 * « sombre » sont des choix DÉLIBÉRÉS, et ils l'emportent : un électricien
 * qui a forcé le sombre pour un tableau mal éclairé ne veut pas voir son
 * écran repasser en blanc parce que le soleil s'est levé.
 */
export function useTheme(): Palette {
  const pref = useScanStore((s) => s.themePref);
  const systeme = useColorScheme();
  if (pref === 'dark') return dark;
  if (pref === 'light') return light;
  return systeme === 'dark' ? dark : light;
}

/**
 * Fabrique de styles thémés : `const getStyles = themedStyles((c) => StyleSheet.create({...}))`
 * puis `const styles = getStyles(useTheme())`. Mémoïsé par palette (il n'y en a que deux).
 */
export function themedStyles<T>(factory: (c: Palette) => T): (c: Palette) => T {
  const cache = new Map<Palette, T>();
  return (c) => {
    let s = cache.get(c);
    if (!s) {
      s = factory(c);
      cache.set(c, s);
    }
    return s;
  };
}

/**
 * Rayons. Ils ont tous grandi d'un cran : un rayon serré sur une grande
 * surface est la signature d'une interface d'il y a dix ans, et l'écart
 * entre un champ (12) et une carte (22) est ce qui donne la hiérarchie.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 36,
};

/**
 * Deux ombres, pas une.
 *
 * `shadowCard` pose une surface sur le fond : large, très diffuse, presque
 * invisible — c'est elle qui remplace les liserés, qu'on empile trop vite
 * jusqu'à quadriller l'écran. `shadowLift` soulève ce qui appelle le doigt
 * (bouton principal, bouton flottant) : plus courte, plus dense, et teintée
 * de la couleur du bouton pour que la lumière ait l'air de venir de lui.
 */
export const shadowCard = {
  shadowColor: '#0B0D12',
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

export const shadowLift = {
  shadowColor: '#0B0D12',
  shadowOpacity: 0.14,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 6,
};

/** Ombre colorée d'un élément d'action : la teinte du bouton lui-même. */
export const glow = (color: string) => ({
  shadowColor: color,
  shadowOpacity: 0.32,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
});
