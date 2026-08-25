/**
 * UNE LUMIERE VISEE SUR UN MUR EST UNE APPLIQUE.
 *
 * Releve du patron : « lors d'un scan, "lum" n'ajoute pas de lumiere sur le
 * mur, alors que l'element se place bien sur le scan, mais rien sur le
 * plan ».
 *
 * Les deux moities de la phrase sont vraies, et c'est ce qui rend le defaut
 * si difficile a voir : le natif enregistre bien la pose — on la voit dans
 * la vue de scan, le compteur avance, le retour haptique tombe — et c'est
 * l'ANCRAGE, cote JS, qui la jette en silence.
 *
 * POURQUOI. Le troisieme bouton du viseur pose un `dcl` : un point lumineux
 * de PLAFOND, avec sa croix normalisee. `ancrerElec` le range donc au
 * plafond, mais a deux conditions — que le point soit loin des murs, ou
 * franchement haut. Vise sur un mur a hauteur d'applique, il n'est ni l'un
 * ni l'autre. Le code passait alors a la branche des appareils MURAUX,
 * cherchait `FIXTURES['dcl']`, ne le trouvait pas — un dcl n'est pas un
 * appareil mural — et sortait sans rien poser.
 *
 * Ce qui manquait n'est pas un garde-fou, c'est une TRADUCTION. Sur un
 * chantier, un point lumineux au mur porte un nom : c'est une applique. Le
 * bouton dit « Lumiere », et c'est a l'application de savoir laquelle selon
 * l'endroit vise — au plafond un DCL, au mur une applique. L'electricien ne
 * choisit pas entre deux boutons ce que sa main a deja dit en visant.
 */
import { ancrerElec } from '../src/geometry/viseur';
import { FIXTURES } from '../src/geometry/electrical';
import type { WallSeg } from '../src/geometry/floorplan';

/** Une piece de 4 x 3, murs de 2,50 m. */
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const MURS: WallSeg[] = [
  mur('n', 0, 0, 4, 0),
  mur('e', 4, 0, 4, 3),
  mur('s', 4, 3, 0, 3),
  mur('o', 0, 3, 0, 0),
];

const PIECES = [
  {
    id: 'r1',
    outline: [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ],
  },
];

const numero = (p: string, n: number) => `${p}-${n}`;
const ancrer = (ancres: Parameters<typeof ancrerElec>[0]) =>
  ancrerElec(ancres, MURS, PIECES, numero);

describe('le bouton « Lumiere » du viseur', () => {
  it('pose une applique quand on a vise un mur', () => {
    // Vise sur le mur nord, a 1,90 m : la hauteur d'une applique.
    const { fixtures, ceiling } = ancrer([
      { kind: 'dcl', x: 2, y: 1.9, z: 0.05 },
    ]);
    expect(ceiling).toHaveLength(0);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].kind).toBe('applique');
    expect(fixtures[0].wallId).toBe('n');
  });

  it('la pose a la cote du metier, comme les autres appareils muraux', () => {
    const { fixtures } = ancrer([{ kind: 'dcl', x: 2, y: 1.72, z: 0.05 }]);
    // `applique` a une cote unique dans le catalogue : viser haut ou bas ne
    // change pas ce qu'on va poser.
    expect(fixtures[0].height).toBeCloseTo(FIXTURES.applique.std, 2);
  });

  it('et le dit, comme pour une prise de plinthe', () => {
    // Releve du patron, a l'epoque : « un message doit apparaitre sans
    // gener : "Prise plinthe placee a 25 cm" ». Une applique le merite
    // autant — c'est ce qui dit qu'on a compris le geste.
    const { mots } = ancrer([{ kind: 'dcl', x: 2, y: 1.9, z: 0.05 }]);
    expect(mots.join(' | ')).toMatch(/[Aa]pplique/);
  });

  it('marche aussi quand le natif a nomme le mur lui-meme', () => {
    // Le chemin le plus sur : le natif identifie le mur au moment de la
    // pose, et donne la cote relevee SUR LUI.
    const { fixtures, ceiling } = ancrer([
      { kind: 'dcl', wallId: 'e', along: 1.5, height: 1.9, x: 3.95, y: 1.9, z: 1.5 },
    ]);
    expect(ceiling).toHaveLength(0);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].kind).toBe('applique');
    expect(fixtures[0].wallId).toBe('e');
  });
});

/*
  LES CONTROLES EN SENS INVERSE.

  Sans eux, une traduction qui changerait TOUT `dcl` en applique passerait
  les epreuves du dessus — et le point lumineux du plafond, celui qu'on pose
  neuf fois sur dix, disparaitrait du plan.
*/
describe('mais une lumiere visee au plafond reste un point de plafond', () => {
  it('au milieu de la piece', () => {
    const { fixtures, ceiling } = ancrer([{ kind: 'dcl', x: 2, y: 2.45, z: 1.5 }]);
    expect(fixtures).toHaveLength(0);
    expect(ceiling).toHaveLength(1);
    expect(ceiling[0].kind).toBe('dcl');
  });

  it('et meme visee haut contre un mur : au ras du plafond, c’est le plafond', () => {
    // 2,30 m sur un mur de 2,50 : la main visait le plafond, pas la cloison.
    const { ceiling } = ancrer([{ kind: 'dcl', x: 2, y: 2.3, z: 0.05 }]);
    expect(ceiling).toHaveLength(1);
  });

  it('une prise visee sur un mur reste une prise', () => {
    const { fixtures } = ancrer([{ kind: 'prise', x: 2, y: 0.3, z: 0.05 }]);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].kind).toBe('prise');
  });
});
