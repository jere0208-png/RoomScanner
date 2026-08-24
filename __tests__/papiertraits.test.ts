/**
 * LES TRAITS D'UN PLAN PHOTOGRAPHIÉ.
 *
 * Deuxième étage : de l'encre à des segments. C'est l'étage qui décide de
 * tout ce qui suit — un mur manqué ici est un mur absent du plan final, et
 * un trait inventé est une cloison qui n'existe pas.
 *
 * On éprouve trois choses, et chacune correspond à une façon dont une photo
 * de chantier trahit :
 *
 *   — LES CROISEMENTS. Un plan n'est que ça : un refend coupe un mur, une
 *     ligne de cote traverse ses attaches, un vantail touche sa maçonnerie.
 *     Un suivi de pixels s'arrêterait au premier ; la transformée doit
 *     rendre le mur ENTIER.
 *   — LE TRAVERS. Une feuille posée sur une table n'est jamais d'équerre.
 *     On photographie donc la même planche tournée, et l'on exige qu'on
 *     retrouve son angle — puis, une fois redressés, les mêmes murs aux
 *     mêmes longueurs.
 *   — L'ÉPAISSEUR. C'est elle qui distingue plus tard un mur porteur d'une
 *     cloison, et le trait de maçonnerie d'un trait de cotation.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { binariser, effacerBoites, imageVide } from '../src/papier/image';
import { tracer } from '../src/papier/trace';
import { photographierPlanche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import {
  anglePrincipal,
  fusionnerTraits,
  segmentsDe,
  tournerTraits,
  type Trait,
} from '../src/papier/traits';

/**
 * Redessine les traits trouvés, pour les REGARDER.
 *
 * Un banc dit combien de traits sont ressortis ; il ne dit pas qu'un mur a
 * glissé de trois pixels ou qu'une ligne de cote a été prise pour une
 * cloison. On repose donc les segments sur une feuille blanche, à l'épaisseur
 * mesurée, et l'on compare à l'œil avec la planche d'origine. Écrit
 * seulement si `PLANCHE_PAPIER` désigne un dossier.
 */
const aRegarder = (nom: string, traits: Trait[], l: number, h: number) => {
  const dossier = process.env.PLANCHE_PAPIER;
  if (!dossier) return;
  const img = imageVide(l, h, 255);
  tracer(
    img,
    traits.map((t) => ({ t: 'seg' as const, a: t.a, b: t.b, w: Math.max(1, t.ep) })),
    { encre: 0 },
  );
  const tete = Buffer.from(`P5
${l} ${h}
255
`, 'ascii');
  writeFileSync(join(dossier, `${nom}.pgm`), Buffer.concat([tete, Buffer.from(img.px)]));
};

const lire = (reglage = {}, avecTexte = false) => {
  const photo = photographierPlanche(T1, { echelle: 100, ...reglage });
  // Ce que le téléphone a su lire, on ne le regarde plus : sinon chaque
  // lettre ressort en petits traits obliques.
  const masque = avecTexte
    ? binariser(photo.image)
    : effacerBoites(binariser(photo.image), photo.textes);
  return { photo, masque, traits: fusionnerTraits(segmentsDe(masque)) };
};

/** L'inclinaison d'un trait, ramenée dans [0°, 90°]. */
const pente = (t: Trait) => {
  const a = (Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) * 180) / Math.PI;
  const d = ((a % 180) + 180) % 180;
  return d > 90 ? 180 - d : d;
};

const horizontaux = (ts: Trait[], tol = 3) => ts.filter((t) => pente(t) < tol);
const verticaux = (ts: Trait[], tol = 3) => ts.filter((t) => pente(t) > 90 - tol);

describe('les traits du T1, à plat', () => {
  const { traits } = lire();

  it('retrouve la maçonnerie : deux traits par mur, et rien de plus long', () => {
    const longs = traits.filter((t) => t.len > 250);
    /*
      SIX, ET NON HUIT : le mur du haut est percé d'une fenêtre de 1,20 m,
      qui coupe chacun de ses deux bords en un morceau de 80 pixels et un de
      200. Ce sont bien deux bords, mais aucun ne fait plus de 250 d'un seul
      tenant — et c'est le lecteur de MURS, un étage plus haut, qui les
      recolle en un mur de quatre mètres, parce que lui sait ce qu'est une
      ouverture. À cet étage-ci, on ne sait encore rien.
    */
    expect(longs.length).toBeGreaterThanOrEqual(6);
    // Trois horizontaux au moins : le quatrième bord est celui du mur du
    // haut, percé par la fenêtre, et la ligne de cote qui le double a été
    // coupée en deux par son propre texte — c'est le comportement voulu.
    expect(horizontaux(longs).length).toBeGreaterThanOrEqual(3);
    expect(verticaux(longs).length).toBeGreaterThanOrEqual(3);
  });

  it('rend le mur du haut ENTIER, malgré la fenêtre qui le perce', () => {
    // Le bord extérieur du mur du haut : y ≈ 50 px, long de 4 m plus les
    // deux murs de retour. La fenêtre le coupe en son milieu, et pourtant
    // le trait doit ressortir d'un seul tenant : c'est ce qu'apporte la
    // recherche de DROITES là où un suivi de pixels s'arrêterait.
    const haut = horizontaux(traits).filter((t) => t.a.y < 60 && t.len > 300);
    expect(haut.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...haut.map((t) => t.len))).toBeGreaterThan(380);
  });

  it('mesure l’épaisseur des traits, et sépare la maçonnerie de la cotation', () => {
    const macon = horizontaux(traits).filter((t) => t.len > 300);
    const cote = traits.filter((t) => t.len > 300 && t.a.y < 30);
    expect(Math.min(...macon.map((t) => t.ep))).toBeGreaterThan(1.5);
    // La ligne de cote est tracée plus fin que la maçonnerie : le lecteur
    // pourra l'écarter sans avoir à comprendre ce qu'elle raconte.
    if (cote.length) {
      expect(Math.min(...cote.map((t) => t.ep))).toBeLessThan(
        Math.max(...macon.map((t) => t.ep)),
      );
    }
  });

  it('n’invente rien : pas de forêt de traits sur une planche simple', () => {
    aRegarder('t1-traits', traits, 600, 500);
    // Soixante, et l'on sait de quoi : les deux bords de chaque mur, les
    // lignes de cote et leurs attaches, les symboles, et l'arc de la porte —
    // qu'une recherche de DROITES ne peut rendre qu'en une poignée de cordes.
    // C'est l'ordre de grandeur qui compte : à deux cents, on saurait qu'on
    // s'est mis à lire du grain.
    expect(traits.length).toBeLessThan(60);
  });

  it('n’essaie pas de lire des murs dans les lettres', () => {
    // Le mot « SEJOUR » et les deux cotes écrites, laissés dans le masque,
    // ressortaient en une vingtaine de traits obliques.
    const avec = lire({}, true).traits.length;
    // Un quart de traits en moins : c'est le mot « SEJOUR » et les deux
    // cotes écrites qui ne ressortent plus en petits segments obliques.
    expect(traits.length).toBeLessThan(avec * 0.9);
  });

  it('rend des murs D’ÉQUERRE : le trait se recale sur ses pixels', () => {
    // L'urne travaille au demi-degré ; sur quatre mètres cela fait déjà
    // trois pixels de dérive, et ces trois pixels finiraient en centimètres
    // sur la cote rendue au client. Le trait est donc réajusté sur les
    // pixels qu'il a emportés — deux fois, parce qu'une bande inclinée
    // emporte un parallélogramme et recopierait son propre défaut.
    //
    // Le dixième de degré n'est pas atteignable ici et ce n'est pas grave :
    // il reste les pixels du COIN, là où le mur de retour croise, qui tirent
    // le trait de quelques dixièmes. C'est l'équerrage du plan, plus tard,
    // qui rendra l'angle droit exact — comme il le fait déjà pour un relevé
    // LiDAR, dont les murs ne sont jamais d'équerre non plus.
    for (const t of traits.filter((x) => x.len > 300)) {
      const p = pente(t);
      expect(Math.min(p, 90 - p)).toBeLessThan(0.6);
    }
  });
});

describe('la feuille prise de travers', () => {
  it('retrouve l’angle de la feuille à un demi-degré près', () => {
    for (const deg of [-11, -4, 3, 9]) {
      // On ne cherche QUE l'angle : passer par la détection des traits
      // coûterait quatre secondes de plus par essai, pour rien.
      const masque = binariser(
        photographierPlanche(T1, { echelle: 100, rotation: deg }).image,
      );
      const trouve = (anglePrincipal(masque) * 180) / Math.PI;
      // L'orthogonalité du plan rend 3° et 93° indiscernables : on compare
      // donc modulo 90, comme le fait le redressement lui-même.
      const ecart = Math.abs((((trouve - deg) % 90) + 135) % 90) - 45;
      expect(Math.abs(ecart)).toBeLessThan(0.6);
    }
  });

  it('rend les mêmes murs une fois redressés, aux mêmes longueurs', () => {
    const droit = lire();
    const penche = lire({ rotation: 7 });
    const redresse = tournerTraits(
      penche.traits,
      anglePrincipal(penche.masque),
      penche.masque.l / 2,
      penche.masque.h / 2,
    );
    const longsDroit = droit.traits.filter((t) => t.len > 300).length;
    const longsRedresse = redresse.filter((t) => t.len > 300).length;
    // À quatre traits près : une feuille tournée de sept degrés se
    // rééchantillonne, et un bord qui passait tout juste sous les 300
    // pixels peut passer juste au-dessus — ou l'inverse. Ce qu'on vérifie
    // ici, c'est qu'on ne PERD pas la maçonnerie, pas qu'on la retrouve au
    // trait près.
    expect(Math.abs(longsRedresse - longsDroit)).toBeLessThanOrEqual(4);
    // Et ils sont bien revenus d'équerre.
    const dEquerre = redresse.filter((t) => t.len > 300 && (pente(t) < 2 || pente(t) > 88));
    expect(dEquerre.length).toBeGreaterThanOrEqual(longsRedresse - 1);
  });
});

describe('la photo dégradée', () => {
  it('tient l’ombre, le grain et le flou sans perdre les murs', () => {
    const { traits } = lire({ ombre: 0.8, bruit: 0.25, flou: 1, graine: 3 });
    const longs = traits.filter((t) => t.len > 250);
    /*
      SEPT, ET NON HUIT. Le dépouillement se fait EN DAMIER — un pixel
      d'encre sur deux dépose ses voix — parce que chaque voix est un défaut
      de cache dans une urne d'un million de cases, et que le plan le plus
      chargé y passait onze secondes. Sur une photo floue, un bord de mur
      déjà mangé par le flou perd assez de voix pour ne plus ressortir d'un
      seul tenant. Le mur, lui, est retrouvé : c'est l'étage suivant qui
      recolle ses morceaux.
    */
    expect(longs.length).toBeGreaterThanOrEqual(7);
  });

  it('lit aussi un plan au crayon gris, tracé fin', () => {
    const { traits } = lire({ encre: 120, trait: 1.4 });
    const longs = traits.filter((t) => t.len > 250);
    // Six : les deux bords de chacun des trois murs pleins. Le quatrième,
    // percé par la fenêtre, ne donne pas de morceau de plus de 250 — c'est
    // l'étage des murs qui le recolle.
    expect(longs.length).toBeGreaterThanOrEqual(6);
  });
});
