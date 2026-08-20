/**
 * TOUT BLOC ROND CENTRE SON CONTENU.
 *
 * Relevé du patron, capture à l'appui : l'icône de partage flottait
 * au-dessus du centre de sa pastille. Un rond qui ne déclare pas son
 * centrage pose son contenu en haut à gauche — et ça ne se voit qu'à
 * l'écran, une pastille à la fois.
 *
 * Cette épreuve lit le CODE, comme celle des boutons muets : tout style
 * qui dessine un rond à taille fixe (largeur = hauteur, rayon en rapport)
 * doit déclarer `alignItems: 'center'` ET `justifyContent: 'center'`.
 * Un rond décentré ajouté demain la fera tomber.
 */
import * as fs from 'fs';
import * as path from 'path';

const RACINE = path.join(__dirname, '..', 'src');

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) out.push(...fichiers(p));
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Les blocs d'un fichier : chaque objet `cle: { ... }` de premier niveau
 * dans un StyleSheet, attrapé à l'accolade près.
 */
function rondsDecentres(src: string): string[] {
  const out: string[] = [];
  const re = /(\w+):\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const corps = m[2];
    const largeur = /(?:^|[^\w])width:\s*(\d+)/.exec(corps);
    const hauteur = /(?:^|[^\w])height:\s*(\d+)/.exec(corps);
    const rayon = /borderRadius:\s*(\d+)/.exec(corps);
    if (!largeur || !hauteur || !rayon) continue;
    const w = Number(largeur[1]);
    if (w !== Number(hauteur[1])) continue;
    // Un rond : le rayon vaut au moins le tiers du côté (pilule comprise).
    if (Number(rayon[1]) < w / 3) continue;
    // Les tout petits ronds sont des pastilles PLEINES (points, badges) :
    // rien à centrer dedans.
    if (w < 24) continue;
    const centre =
      corps.includes("alignItems: 'center'") &&
      corps.includes("justifyContent: 'center'");
    if (!centre) out.push(m[1]);
  }
  return out;
}

describe('les blocs ronds de l’app', () => {
  it('déclarent tous leur centrage', () => {
    const fautifs: string[] = [];
    for (const f of fichiers(RACINE)) {
      for (const cle of rondsDecentres(fs.readFileSync(f, 'utf8'))) {
        fautifs.push(`${path.basename(f)} → ${cle}`);
      }
    }
    expect(`ronds décentrés : ${fautifs.join(', ') || 'aucun'}`).toBe(
      'ronds décentrés : aucun',
    );
  });
});
