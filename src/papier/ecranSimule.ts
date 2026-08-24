/**
 * LA PHOTO D'UN ÉCRAN, FABRIQUÉE — l'aide du banc `papiermoire`.
 *
 * Ce fichier ne contient aucun essai : il fabrique la photo. Il vit hors du
 * dossier des bancs parce que Jest prend pour une suite tout fichier posé
 * dans `__tests__`, et qu'une fonction de dessin n'en est pas une.
 */
import { imageVide, type ImageGrise } from './image';

/**
 * Incruste une image dans une photo d'écran : fond sombre, fenêtre plus
 * claire, quelques barres d'interface, et le moiré par-dessus tout.
 */
export function photographierUnEcran(
  plan: ImageGrise,
  { moire = 0.22, marge = 0.55, graine = 5 } = {},
): ImageGrise {
  const l = Math.round(plan.l * (1 + marge * 2));
  const h = Math.round(plan.h * (1 + marge * 2));
  const out = imageVide(l, h, 22); // le bureau, presque noir
  const x0 = Math.round((l - plan.l) / 2);
  const y0 = Math.round((h - plan.h) / 2);

  // La fenêtre du navigateur : un cadre clair un peu plus grand que le plan.
  const bx = Math.max(0, x0 - 30);
  const by = Math.max(0, y0 - 60);
  const bl = Math.min(l - bx, plan.l + 60);
  const bh = Math.min(h - by, plan.h + 110);
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bl; x++) out.px[y * l + x] = 238;
  }
  // Les onglets et la barre des tâches : des rectangles et des traits qui
  // ressemblent, de loin, à du dessin technique.
  for (let i = 0; i < 4; i++) {
    const ox = bx + 12 + i * 90;
    for (let y = by + 8; y < by + 34; y++) {
      for (let x = ox; x < ox + 78; x++) out.px[y * l + x] = 205;
    }
    for (let x = ox; x < ox + 78; x++) out.px[(by + 8) * l + x] = 90;
  }
  for (let x = 0; x < l; x++) {
    for (let y = h - 26; y < h; y++) out.px[y * l + x] = 60;
  }

  for (let y = 0; y < plan.h; y++) {
    for (let x = 0; x < plan.l; x++) {
      out.px[(y + y0) * l + x + x0] = plan.px[y * plan.l + x];
    }
  }

  // LES FRANGES. Deux grilles proches qui battent l'une contre l'autre :
  // c'est exactement ce que fait un capteur devant une dalle.
  let a = graine >>> 0;
  const dé = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const f =
        Math.sin((x * 2 * Math.PI) / 3.1 + (y * 2 * Math.PI) / 61) *
        Math.sin((y * 2 * Math.PI) / 2.9 + (x * 2 * Math.PI) / 57);
      const v = out.px[y * l + x] * (1 + moire * f) + (dé() - 0.5) * 10;
      out.px[y * l + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return out;
}

