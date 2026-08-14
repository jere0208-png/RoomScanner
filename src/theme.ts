/**
 * Système de design RoomScanner.
 * Blanc / gris / noir + un seul bleu saturé comme signature.
 */
export const colors = {
  // Fonds
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceSunken: '#EFF1F5',

  // Texte
  ink: '#0B0D12',
  inkSoft: '#5A6472',
  inkFaint: '#98A1AE',

  // Traits
  line: '#E7EAF0',
  lineStrong: '#D6DBE3',

  // Signature
  blue: '#1F5BFF',
  blueDark: '#0E3FD8',
  blueSoft: '#EBF0FF',

  // Sémantique (avec parcimonie)
  danger: '#E5484D',
  green: '#1DB954',
  amber: '#E8A13B', // portes
  sky: '#3EB8E5', // fenêtres

  // Écran de scan (sombre)
  scanInk: '#F4F6FA',
  scanPill: 'rgba(12,14,20,0.72)',
  scanPillSoft: 'rgba(12,14,20,0.55)',
};

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
