/**
 * UN MUR PEINT SORT DE LA COULEUR DE SA PEINTURE.
 *
 * Deux releves du patron sur la meme capture : « retravaille le rendu de
 * couleurs, qui rend des couleurs fausses — mon mur blanc devient marron »
 * et « regle le fait qu'il y ait des lignes horizontales sur les murs en
 * couleur ».
 *
 * LES DEUX ONT LA MEME ORIGINE : on peint ce que la CAMERA a vu, et une
 * camera ne voit pas une couleur, elle voit une couleur ECLAIREE.
 *
 *   — un mur blanc sous une ampoule chaude renvoie du beige ; le releve est
 *     fidele, et le resultat est faux. Personne ne dira jamais « mon mur est
 *     marron » de son mur blanc ;
 *   — le haut d'un mur recoit moins de lumiere que le bas, ou l'inverse
 *     selon la fenetre. La grille relevee sort donc en DEGRADE vertical, et
 *     comme chaque rangee s'ecarte de la teinte moyenne dans le meme sens
 *     que sa voisine, le lissage anti-bruit la juge « partagee » et la
 *     CONSERVE. D'ou les lignes horizontales : le mecanisme qui devait
 *     nettoyer le bruit protegeait l'eclairage.
 *
 * ON DISTINGUE DONC L'ECLAIRAGE DE LA PEINTURE : l'eclairage est PROGRESSIF
 * (chaque rangee un peu plus sombre que la precedente, dans le meme sens),
 * la peinture est FRANCHE (un soubassement, un lambris : un saut net entre
 * deux rangees, et rien avant ni apres). Le premier s'aplatit, le second
 * reste.
 */
import { aplatirEclairage, balancerLesBlancs } from '../src/geometry/appearance';

/** Une grille 2 colonnes x 4 rangees, du haut vers le bas. */
const grille = (rangees: string[][]) => ({
  cols: rangees[0].length,
  rows: rangees.length,
  texels: rangees.flat(),
});

describe('l’éclairage sur un mur', () => {
  it('aplatit un dégradé progressif : c’est de la lumière, pas de la peinture', () => {
    // Un blanc casse qui s'assombrit regulierement du haut vers le bas.
    const t = aplatirEclairage(
      grille([
        ['#E8E8E8', '#E8E8E8'],
        ['#DCDCDC', '#DCDCDC'],
        ['#D0D0D0', '#D0D0D0'],
        ['#C4C4C4', '#C4C4C4'],
      ]),
    );
    // Toutes les cases sortent identiques : le mur est d'une seule couleur.
    expect(new Set(t.texels).size).toBe(1);
  });

  it('mais garde un soubassement : ça, c’est de la peinture', () => {
    /*
      DEUX RANGEES CLAIRES, DEUX RANGEES FONCEES, ET UN SAUT NET AU MILIEU.

      C'est un lambris, une plinthe haute, un mur bicolore. Il n'y a rien de
      progressif la-dedans : l'ecart entre la deuxieme et la troisieme
      rangee vaut dix fois celui des autres. On n'y touche pas.
    */
    const t = aplatirEclairage(
      grille([
        ['#F2F2F2', '#F2F2F2'],
        ['#F0F0F0', '#F0F0F0'],
        ['#5A4632', '#5A4632'],
        ['#584430', '#584430'],
      ]),
    );
    expect(new Set(t.texels).size).toBeGreaterThan(1);
    // Et le bas reste franchement plus fonce que le haut.
    expect(t.texels[0]).not.toBe(t.texels[t.texels.length - 1]);
  });

  it('laisse tranquille ce qui varie horizontalement', () => {
    // Un pan d'accent sur la moitie droite : rien a voir avec l'eclairage.
    const t = aplatirEclairage(
      grille([
        ['#EFEFEF', '#2E5FA3'],
        ['#EFEFEF', '#2E5FA3'],
        ['#EFEFEF', '#2E5FA3'],
        ['#EFEFEF', '#2E5FA3'],
      ]),
    );
    expect(new Set(t.texels).size).toBe(2);
  });
});

describe('la balance des blancs de la pièce', () => {
  it('rend blanc un mur blanc vu sous une ampoule chaude', () => {
    /*
      LA SURFACE LA PLUS CLAIRE D'UN LOGEMENT EST BLANCHE.

      C'est vrai du plafond et des murs dans l'immense majorite des cas, et
      c'est l'hypothese que fait tout appareil photo du monde. Si la plus
      claire des surfaces relevees tire vers l'orange, ce n'est pas la
      peinture : c'est l'ampoule.
    */
    const corrige = balancerLesBlancs(['#E8D2B4', '#C9B69C', '#8A7A66']);
    // Le plus clair redevient neutre : ses trois canaux se rejoignent.
    const [r, v, b] = [1, 3, 5].map((i) => parseInt(corrige[0].slice(i, i + 2), 16));
    expect(Math.max(r, v, b) - Math.min(r, v, b)).toBeLessThan(12);
  });

  it('mais ne blanchit pas une pièce vraiment colorée', () => {
    /*
      ON NE CORRIGE QUE CE QUI RESSEMBLE A UN BLANC DEVIE.

      Un mur bleu franc n'est pas un mur blanc mal eclaire. Ramener sa
      teinte au neutre effacerait ce que l'electricien a releve — et
      repeindrait le salon du client au passage.
    */
    const corrige = balancerLesBlancs(['#2E5FA3', '#24508C', '#1B3F70']);
    expect(corrige[0]).toBe('#2E5FA3');
  });

  it('ne touche à rien quand il n’y a rien à corriger', () => {
    const gris = ['#EFEFEF', '#CCCCCC', '#999999'];
    expect(balancerLesBlancs(gris)).toEqual(gris);
  });
});

/**
 * UNE SCENE SE CORRIGE D'UN SEUL GAIN.
 *
 * Murs, sol et meubles ont ete vus sous la MEME ampoule : corriger chaque
 * surface pour elle-meme reviendrait a blanchir tout le logement, meubles
 * compris — un canape rouge deviendrait rose, et le releve ne vaudrait plus
 * rien. On calcule donc le gain sur l'ensemble et on l'applique a tout.
 */
import { equilibrerLaScene } from '../src/geometry/appearance';

describe('l’équilibrage d’une scène entière', () => {
  const scene = () => ({
    walls: [
      { id: 'm1', color: '#E8D2B4', texture: grille([
        ['#E8D2B4', '#E8D2B4'],
        ['#E2CCAE', '#E2CCAE'],
        ['#DCC6A8', '#DCC6A8'],
        ['#D6C0A2', '#D6C0A2'],
      ]) },
      { id: 'm2', color: '#C9B69C' },
    ],
    objects: [{ id: 'o1', color: '#8A3A34' }],
  });

  it('applique le MEME gain aux murs et aux meubles', () => {
    const av = scene();
    const ap = equilibrerLaScene(av);
    // Le mur le plus clair redevient neutre.
    const [r, v, b] = [1, 3, 5].map((i) =>
      parseInt(ap.walls[0].color!.slice(i, i + 2), 16),
    );
    expect(Math.max(r, v, b) - Math.min(r, v, b)).toBeLessThan(12);
    // Et le meuble a bouge dans le meme sens, sans devenir gris : il reste
    // franchement rouge.
    const [mr, mv] = [1, 3].map((i) =>
      parseInt(ap.objects[0].color!.slice(i, i + 2), 16),
    );
    expect(mr).toBeGreaterThan(mv + 30);
    expect(ap.objects[0].color).not.toBe(av.objects[0].color);
  });

  it('corrige aussi les grilles, case par case', () => {
    const ap = equilibrerLaScene(scene());
    const t = ap.walls[0].texture!;
    expect(t.texels[0]).not.toBe('#E8D2B4');
    // La grille garde sa forme : autant de cases, meme decoupage.
    expect(t.texels).toHaveLength(8);
    expect(t.rows).toBe(4);
  });

  it('ne touche a rien quand la piece est deja neutre', () => {
    const neutre = {
      walls: [{ id: 'm1', color: '#EFEFEF' }],
      objects: [{ id: 'o1', color: '#777777' }],
    };
    expect(equilibrerLaScene(neutre)).toEqual(neutre);
  });
});
