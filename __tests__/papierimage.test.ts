/**
 * LA PHOTO D'UN PLAN PAPIER, ET CE QU'ON EN TIRE AVANT TOUTE LECTURE.
 *
 * Premier étage de « Scanner un plan papier » : transformer une photo — une
 * feuille sur une table, éclairée de côté, prise un peu de travers — en un
 * masque d'encre exploitable. Rien n'est encore lu ici ; mais si cet étage
 * ment, tout ce qui suit ment.
 *
 * Ce banc défend trois choses.
 *
 *   — LE SEUIL EST LOCAL, ET IL LE FAUT. On photographie deux fois la même
 *     planche, une fois à plat et une fois avec une ombre franche, et l'on
 *     exige que la QUANTITÉ D'ENCRE retrouvée bouge à peine. Le même essai
 *     avec un seuil global — « plus sombre que 128 » — est mené juste à
 *     côté, et on vérifie qu'il ÉCHOUE : sans cela, personne ne saurait
 *     dire, dans six mois, pourquoi ce fichier calcule des moyennes locales.
 *   — LES TROUS COMPTENT. Un point lumineux est un cercle barré d'une croix
 *     : quatre trous. Un spot est un cercle avec un point : un trou. C'est
 *     l'invariant le plus solide de la reconnaissance de symboles, et il ne
 *     doit dépendre ni de la taille ni de l'angle.
 *   — LA PLANCHE D'ESSAI EST UN PLAN. Double trait aux murs, trous de
 *     menuiserie, symboles, cotes écrites. Si la planche cessait d'imiter
 *     un plan, tous les bancs qui suivent deviendraient des figurants.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  binariser,
  encre,
  grossir,
  ilots,
  masqueDeLIlot,
  trousDe,
  type ImageGrise,
  type Masque,
} from '../src/papier/image';
import { photographierPlanche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import { GABARITS } from '../src/papier/gabarits';
import { imageVide } from '../src/papier/image';
import { tracer, transformer } from '../src/papier/trace';

/**
 * Écrit une image en PGM, pour la regarder — jamais en CI.
 *
 * Un lecteur de plan se relit AVEC LES YEUX : c'est la seule façon de voir
 * qu'un trait a fondu ou qu'un symbole s'est empâté. On ne verse pas ces
 * images au dépôt (elles pèsent, et leur diff ne dit rien) ; on les écrit à
 * la demande, en posant `PLANCHE_PAPIER=<dossier>` avant le banc.
 */
function aRegarder(nom: string, img: ImageGrise | Masque) {
  const dossier = process.env.PLANCHE_PAPIER;
  if (!dossier) return;
  const gris =
    'px' in img ? img.px : Uint8Array.from(img.on, (v) => (v ? 0 : 255));
  const tete = Buffer.from(`P5\n${img.l} ${img.h}\n255\n`, 'ascii');
  writeFileSync(join(dossier, `${nom}.pgm`), Buffer.concat([tete, Buffer.from(gris)]));
}

describe('la planche d’essai', () => {
  it('imprime un plan de la bonne taille, ni vide ni noirci', () => {
    const photo = photographierPlanche(T1, { echelle: 100 });
    aRegarder('t1-propre', photo.image);
    /*
      Le T1 fait 4 m sur 3, la planche laisse UN MÈTRE de papier autour à
      cent pixels par mètre. Cette marge n'est pas décorative : une ligne de
      cote se pose à 45 cm du mur et son nombre 18 cm au-dessus d'elle, si
      bien qu'avec 60 cm de marge le texte « 400 » tombait hors de la feuille
      — l'OCR le rendait quand même (c'est une simulation) et le lecteur
      cherchait sa ligne de cote au-delà du bord de l'image.
    */
    expect(photo.image.l).toBe(600);
    expect(photo.image.h).toBe(500);
    const part = encre(binariser(photo.image));
    expect(part).toBeGreaterThan(0.005);
    expect(part).toBeLessThan(0.15);
  });

  it('rend les cotes écrites, à l’endroit où elles sont imprimées', () => {
    const photo = photographierPlanche(T1, { echelle: 100 });
    expect(photo.textes.map((t) => t.texte)).toEqual(
      expect.arrayContaining(['400', '300', 'SEJOUR']),
    );
    const quatreCents = photo.textes.find((t) => t.texte === '400')!;
    // La cote du bas est portée sous le mur du bas, donc dans le tiers haut
    // de l'image : le repère du papier descend, celui du plan aussi.
    expect(quatreCents.y).toBeLessThan(photo.image.h / 3);
    expect(quatreCents.l).toBeGreaterThan(20);
  });

  it('perce vraiment la maçonnerie là où il y a une menuiserie', () => {
    const photo = photographierPlanche(T1, { echelle: 100 });
    const m = binariser(photo.image);
    // Le mur du haut est à y = 1 m de marge → 100 px, avec 20 px
    // d'épaisseur. La fenêtre est centrée en x = 1 m + 1,3 m = 230 px et
    // large de 120 ; la maçonnerie pleine se lit à x = 130.
    const encrePres = (x: number) => {
      let n = 0;
      for (let y = 88; y < 113; y++) if (m.on[y * m.l + x] === 1) n++;
      return n;
    };
    // Sous la fenêtre : les deux bords du mur sont absents, seuls restent
    // les traits fins du châssis — donc moins d'encre qu'en pleine maçonnerie.
    expect(encrePres(230)).toBeLessThan(encrePres(130));
  });
});

describe('le seuil local', () => {
  const seuilGlobal = (img: ImageGrise, s = 128): Masque => ({
    l: img.l,
    h: img.h,
    on: Uint8Array.from(img.px, (v) => (v < s ? 1 : 0)),
  });

  it('retrouve la même encre à l’ombre qu’en pleine lumière', () => {
    const clair = photographierPlanche(T1, { echelle: 100 });
    const sombre = photographierPlanche(T1, { echelle: 100, ombre: 0.9 });
    aRegarder('t1-ombre', sombre.image);
    const a = encre(binariser(clair.image));
    const b = encre(binariser(sombre.image));
    expect(Math.abs(b - a) / a).toBeLessThan(0.2);
  });

  it('là où un seuil global part en morceaux — la raison d’être du fichier', () => {
    const sombre = photographierPlanche(T1, { echelle: 100, ombre: 0.9 });
    const a = encre(seuilGlobal(photographierPlanche(T1, { echelle: 100 }).image));
    const b = encre(seuilGlobal(sombre.image));
    // Le coin à l'ombre passe en entier pour de l'encre : le masque explose.
    expect(b).toBeGreaterThan(a * 3);
  });

  it('tient le grain du capteur sans se mettre à grésiller', () => {
    const propre = photographierPlanche(T1, { echelle: 100 });
    const grain = photographierPlanche(T1, { echelle: 100, bruit: 0.35, graine: 7 });
    aRegarder('t1-grain', binariser(grain.image));
    const a = encre(binariser(propre.image));
    const b = encre(binariser(grain.image));
    expect(b).toBeLessThan(a * 2);
  });
});

describe('les îlots et leurs trous', () => {
  /** Un gabarit seul sur sa feuille, à la taille et à l’angle demandés. */
  const seul = (cle: string, cote: number, angle = 0): Masque => {
    const img = imageVide(cote * 2, cote * 2, 250);
    const g = GABARITS.find((x) => x.cle === cle)!;
    tracer(
      img,
      transformer(g.formes, { x: cote, y: cote, echelle: cote * 0.7, angle }),
      { trait: Math.max(2, cote / 24), encre: 20 },
    );
    return binariser(img, { fenetre: cote });
  };

  it('compte quatre trous au point lumineux, un au socle, aucun à l’inter', () => {
    expect(trousDe(seul('dcl', 80))).toBe(4);
    expect(trousDe(seul('spot', 80))).toBe(1);
    // Le socle de prise est un DEMI-DISQUE fermé par son diamètre : un trou.
    // L'interrupteur, lui, n'est qu'un rond plein et deux traits : aucun.
    expect(trousDe(seul('prise', 80))).toBe(1);
    expect(trousDe(seul('inter', 80))).toBe(0);
  });

  it('les compte pareil deux fois plus grand et tourné de trente degrés', () => {
    expect(trousDe(seul('dcl', 160, Math.PI / 6))).toBe(4);
    expect(trousDe(seul('spot', 160, Math.PI / 6))).toBe(1);
  });

  it('sépare les symboles en autant d’îlots qu’il y en a sur la feuille', () => {
    const img = imageVide(600, 200, 250);
    ['prise', 'inter', 'dcl'].forEach((cle, i) => {
      const g = GABARITS.find((x) => x.cle === cle)!;
      tracer(img, transformer(g.formes, { x: 100 + i * 200, y: 100, echelle: 45 }), {
        trait: 3,
        encre: 20,
      });
    });
    const m = binariser(img, { fenetre: 150 });
    aRegarder('trois-symboles', m);
    // Le trait de l'interrupteur touche son rond : trois îlots, pas cinq.
    const gros = ilots(m, 40);
    expect(gros).toHaveLength(3);
    // Et chacun tient dans son coin de feuille.
    expect(gros.map((i) => Math.round((i.minX + i.maxX) / 2 / 200)).sort()).toEqual([
      0, 1, 2,
    ]);
  });

  it('recolle un trait haché sans grossir la forme pour de bon', () => {
    const img = imageVide(120, 40, 250);
    // Un trait pointillé, comme un trait de crayon mal appuyé.
    for (let i = 0; i < 6; i++) {
      tracer(img, [{ t: 'seg', a: { x: 10 + i * 18, y: 20 }, b: { x: 20 + i * 18, y: 20 } }], {
        trait: 4,
        encre: 20,
      });
    }
    const m = binariser(img, { fenetre: 60 });
    expect(ilots(m, 5).length).toBeGreaterThan(3);
    const recolle = grossir(m, 5);
    expect(ilots(recolle, 5)).toHaveLength(1);
    // Puis on rend ce qu'on a pris : la forme ne doit pas rester enflée.
    const rendu = grossir(recolle, -5);
    expect(encre(rendu)).toBeLessThan(encre(recolle) * 0.75);
  });

  it('découpe un îlot dans son propre cadre, sans rien perdre', () => {
    const m = seul('dcl', 80);
    const i = ilots(m, 20)[0];
    const petit = masqueDeLIlot(i, m, 2);
    expect(petit.l).toBe(i.maxX - i.minX + 5);
    let n = 0;
    for (const v of petit.on) n += v;
    expect(n).toBe(i.pixels.length);
    expect(trousDe(petit)).toBe(4);
  });
});
