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
 * Palette du moment : préférence de l'app (Auto / Clair / Sombre),
 * et en Auto, le réglage clair/sombre du téléphone.
 */
export function useTheme(): Palette {
  const pref = useScanStore((s) => s.themePref);
  const system = useColorScheme();
  const scheme = pref === 'auto' ? system : pref;
  return scheme === 'dark' ? dark : light;
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

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 36,
};

export const shadowCard = {
  shadowColor: '#0B0D12',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
