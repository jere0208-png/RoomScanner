/** Le nombre tel qu'on l'écrit en France : une virgule, pas un point. */
export const fr = (n: number, d = 1) => n.toFixed(d).replace('.', ',');
