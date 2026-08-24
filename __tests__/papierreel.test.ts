/**
 * LES VRAIS PLANS — ceux qu'on trouve sur internet, pas ceux qu'on imprime.
 *
 * Relevé du patron : « tes tests se feront sur des plans architecturaux que
 * tu trouves sur internet (français) ». C'est la seule épreuve qui compte
 * vraiment : une planche fabriquée par le simulateur ne prouve jamais qu'on
 * lit un plan, seulement qu'on reconnaît sa propre imprimerie.
 *
 * Les images NE SONT PAS versées au dépôt : elles pèsent, et elles ne nous
 * appartiennent pas. On désigne un dossier de fichiers PGM au moment de
 * lancer le banc, et lui seul lit ce qu'il y trouve :
 *
 *     magick plan.jpg -colorspace Gray plan.pgm
 *     PLANS_REELS=<dossier> PLANCHE_PAPIER=<dossier> npx jest papierreel
 *
 * Sans ce dossier, le banc vérifie tout de même ce qu'il peut vérifier tout
 * seul : qu'il sait lire un PGM, et qu'un plan sans la moindre cote ni la
 * moindre porte ne rend pas une échelle inventée.
 *
 * CE QU'UN PLAN RÉEL A APPRIS AU LECTEUR, et qu'aucune planche n'aurait dit :
 * les murs y sont des APLATS noirs et non des doubles traits, les porteurs
 * sont HACHURÉS, les cotes s'écrivent « 10.83 » aussi bien que « 350 », et
 * les surfaces des cartouches (« S : 12.73 m² ») ont exactement l'allure
 * d'une cote — il a fallu apprendre à les refuser.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageVide, type ImageGrise } from '../src/papier/image';
import { tracer } from '../src/papier/trace';
import { lirePlanPapier } from '../src/papier/lecture';

/** Lit un PGM binaire (P5) — le format que `magick` produit par défaut. */
export function lirePGM(chemin: string): ImageGrise {
  const buf = readFileSync(chemin);
  let i = 0;
  const jeton = () => {
    while (i < buf.length && /\s/.test(String.fromCharCode(buf[i]))) i++;
    if (String.fromCharCode(buf[i]) === '#') {
      while (i < buf.length && buf[i] !== 10) i++;
      return jeton();
    }
    let out = '';
    while (i < buf.length && !/\s/.test(String.fromCharCode(buf[i]))) {
      out += String.fromCharCode(buf[i++]);
    }
    return out;
  };
  const magie = jeton();
  if (magie !== 'P5') throw new Error(`PGM attendu en binaire (P5), reçu ${magie}`);
  const l = Number(jeton());
  const h = Number(jeton());
  jeton(); // valeur maximale
  i++; // l'unique blanc qui précède les données
  return { l, h, px: new Uint8Array(buf.subarray(i, i + l * h)) };
}

/** Repose les murs lus sur l'image d'origine, pour les REGARDER. */
function aRegarder(nom: string, fond: ImageGrise, murs: { a: { x: number; y: number }; b: { x: number; y: number }; ep: number }[]) {
  const dossier = process.env.PLANCHE_PAPIER;
  if (!dossier) return;
  const img = imageVide(fond.l, fond.h, 255);
  // Le plan en gris pâle, les murs lus par-dessus en noir : ce qui manque
  // saute aux yeux, ce qui a été inventé aussi.
  for (let k = 0; k < img.px.length; k++) img.px[k] = 200 + Math.round(fond.px[k] * 0.22);
  tracer(
    img,
    murs.map((m) => ({ t: 'seg' as const, a: m.a, b: m.b, w: Math.max(2, m.ep) })),
    { encre: 0 },
  );
  const tete = Buffer.from(`P5\n${img.l} ${img.h}\n255\n`, 'ascii');
  writeFileSync(join(dossier, `${nom}.pgm`), Buffer.concat([tete, Buffer.from(img.px)]));
}

const dossier = process.env.PLANS_REELS;
const fichiers = dossier
  ? readdirSync(dossier).filter((f) => f.toLowerCase().endsWith('.pgm'))
  : [];

describe('le lecteur de PGM', () => {
  it('relit ce qu’il vient d’écrire', () => {
    const img = imageVide(7, 3, 128);
    img.px[0] = 0;
    img.px[20] = 255;
    const tmp = join(
      process.env.PLANCHE_PAPIER ?? process.env.TEMP ?? '.',
      'papierreel-essai.pgm',
    );
    writeFileSync(
      tmp,
      Buffer.concat([Buffer.from('P5\n7 3\n255\n', 'ascii'), Buffer.from(img.px)]),
    );
    const relu = lirePGM(tmp);
    expect(relu.l).toBe(7);
    expect(relu.h).toBe(3);
    expect(relu.px[0]).toBe(0);
    expect(relu.px[20]).toBe(255);
  });
});

describe('une image qui n’est pas un plan', () => {
  it('ne rend ni mur ni échelle, et le DIT', () => {
    // Une feuille blanche : aucun trait, donc aucun mur, donc aucune porte
    // sur quoi se caler. Le lecteur doit sortir les mains vides et l'écrire,
    // jamais rendre une échelle inventée sur laquelle on chiffrerait.
    const plan = lirePlanPapier({ image: imageVide(300, 200, 250), textes: [] });
    expect(plan.vu.murs).toHaveLength(0);
    expect(plan.echelle).toBeNull();
    expect(plan.avertissements.join(' ')).toMatch(/Aucun mur/);
    expect(plan.avertissements.join(' ')).toMatch(/Aucune cote/);
  });
});

(fichiers.length ? describe : describe.skip)('les plans trouvés sur internet', () => {
  for (const f of fichiers) {
    it(`${f} : des murs, une échelle plausible, un logement de taille humaine`, () => {
      const image = lirePGM(join(dossier as string, f));
      const plan = lirePlanPapier({ image, textes: [] });
      aRegarder(`reel-${f.replace(/\.pgm$/i, '')}`, image, plan.vu.murs);

      // On ne connaît pas la vérité de ces plans-là : on vérifie donc ce
      // qu'on PEUT vérifier sans elle — qu'il y a un logement, et qu'il a
      // des dimensions de logement.
      expect(plan.vu.murs.length).toBeGreaterThanOrEqual(6);
      const murs = (plan.resultat.surfaces ?? []).filter((s) => s.type === 'wall');
      expect(murs.length).toBeGreaterThanOrEqual(6);
      const xs = murs.flatMap((m) => [m.transform![12] - m.length / 2, m.transform![12] + m.length / 2]);
      const etendue = Math.max(...xs) - Math.min(...xs);
      expect(etendue).toBeGreaterThan(3);
      expect(etendue).toBeLessThan(60);
      // Et l'échelle, faute de cotes lues (l'OCR est natif, il n'existe pas
      // ici), doit venir des portes — et le dire.
      if (plan.echelle) {
        expect(plan.echelle.pxParMetre).toBeGreaterThan(5);
        expect(plan.avertissements.join(' ')).toMatch(/Échelle estimée|cote/);
      }
    });
  }
});
