/**
 * SCANNER UN ÉTAGE ET L'EMPILER SUR LE DOSSIER.
 *
 * Le geste du chantier : on scanne le rez-de-chaussée, on monte l'escalier,
 * on scanne l'étage — et c'est LE MÊME dossier. Jusqu'ici il fallait ouvrir
 * deux relevés, sortir deux PDF et faire deux devis pour une seule maison.
 *
 * Le mécanisme existait déjà à moitié : « compléter le relevé » repasse un
 * scan et fusionne avec l'existant. Un étage, c'est le contraire — il
 * s'ajoute SANS toucher à ce qui est en bas, parce que ce ne sont pas les
 * mêmes murs.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { NIVEAU_RDC, niveauDe } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

/** Une surface telle qu'iOS la livre : matrice colonne-major et longueur. */
const surface = (
  id: string,
  cx: number,
  cz: number,
  length: number,
  alongZ = false,
) => ({
  id,
  type: 'wall' as const,
  length,
  height: 2.5,
  transform: alongZ
    ? [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, cx, 1.25, cz, 1]
    : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, 1.25, cz, 1],
});

/** Les quatre murs d'une pièce de 4 × 3, coin haut-gauche en (d, d). */
const releve = (d = 0) => ({
  surfaces: [
    surface(`n${d}`, d + 2, d, 4),
    surface(`s${d}`, d + 2, d + 3, 4),
    surface(`w${d}`, d, d + 1.5, 3, true),
    surface(`e${d}`, d + 4, d + 1.5, 3, true),
  ],
  objects: [],
});

beforeEach(() => {
  useScanStore.setState({
    walls: [],
    rooms: [],
    openings: [],
    objects: [],
    fixtures: [],
    ceiling: [],
    photos: [],
    niveauCourant: NIVEAU_RDC,
    etageEnCours: null,
  });
});

describe('empiler un étage', () => {
  it('garde le rez-de-chaussée intact et pose l’étage au-dessus', () => {
    const st = () => useScanStore.getState();
    st().finalize(releve() as never);
    const enBas = st().walls.length;
    expect(enBas).toBeGreaterThan(0);
    expect(st().walls.every((w) => niveauDe(w) === 0)).toBe(true);

    // On monte : le scan suivant vise le premier étage.
    st().scannerUnEtage(1);
    expect(st().etageEnCours).toBe(1);
    st().finalizeEtage(releve(12) as never, 1);

    // Le rez-de-chaussée n'a pas bougé d'un mur.
    expect(st().walls.filter((w) => niveauDe(w) === 0)).toHaveLength(enBas);
    // L'étage existe, à son niveau.
    expect(st().walls.filter((w) => niveauDe(w) === 1).length).toBeGreaterThan(0);
    // Et l'on se retrouve à l'étage qu'on vient de scanner : c'est là qu'on
    // travaille, pas au rez-de-chaussée qu'on a quitté.
    expect(st().niveauCourant).toBe(1);
    expect(st().etageEnCours).toBeNull();
  });

  it('les pièces des deux niveaux ne se marchent pas dessus', () => {
    // Deux niveaux détectés séparément produisaient chacun « room-1 » : le
    // meuble du salon du bas se retrouvait rattaché à la chambre du haut,
    // et le métré comptait deux fois la même pièce.
    const st = () => useScanStore.getState();
    st().finalize(releve() as never);
    st().finalizeEtage(releve(12) as never, 1);
    const ids = st().rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Chaque pièce sait à quel étage elle est.
    expect(st().rooms.some((r) => niveauDe(r) === 1)).toBe(true);
    expect(st().rooms.some((r) => niveauDe(r) === 0)).toBe(true);
  });

  it('pose l’étage au-dessus du plan du dessous, pas à trente mètres', () => {
    /*
      ARKit repart de l'endroit où l'on a appuyé sur « Scanner » : le relevé
      de l'étage tombe n'importe où par rapport à celui du bas — souvent
      très loin, puisqu'on a marché jusqu'à l'escalier. Un plan qui s'ouvre
      sur deux logements distants de vingt mètres n'est pas exploitable.

      On pré-cale donc les emprises l'une sur l'autre. Ce n'est pas exact —
      seul l'électricien sait où tombe sa cage d'escalier — mais on part
      d'un empilement plausible plutôt que d'un plan illisible.
    */
    const st = () => useScanStore.getState();
    st().finalize(releve() as never);
    st().finalizeEtage(releve(12) as never, 1);
    const centre = (n: number) => {
      const ws = st().walls.filter((w) => niveauDe(w) === n);
      const xs = ws.flatMap((w) => [w.a.x, w.b.x]);
      const zs = ws.flatMap((w) => [w.a.z, w.b.z]);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
      };
    };
    const bas = centre(0);
    const haut = centre(1);
    expect(Math.abs(haut.x - bas.x)).toBeLessThan(0.01);
    expect(Math.abs(haut.z - bas.z)).toBeLessThan(0.01);
  });
});

describe('changer de niveau', () => {
  it('va au niveau demandé', () => {
    useScanStore.getState().allerAuNiveau(1);
    expect(useScanStore.getState().niveauCourant).toBe(1);
  });

  it('recale un étage sans toucher à celui du dessous', () => {
    const st = () => useScanStore.getState();
    st().finalize(releve() as never);
    st().finalizeEtage(releve(12) as never, 1);
    const avantBas = st().walls.filter((w) => niveauDe(w) === 0).map((w) => w.a.x);
    st().recalerNiveau(1, 0.4, -0.25);
    expect(st().walls.filter((w) => niveauDe(w) === 0).map((w) => w.a.x)).toEqual(
      avantBas,
    );
    expect(st().dirty).toBe(true);
  });
});

/**
 * LE RECALAGE AVANCE PAR PETITS PAS.
 *
 * Le geste envoie le deplacement DEPUIS LA DERNIERE IMAGE, jamais depuis le
 * debut du glissement : le magasin applique un decalage cumulatif, et lui
 * renvoyer chaque fois la course totale ferait filer l etage a une vitesse
 * carree — trois centimetres de doigt, un metre de plan.
 *
 * C est exactement le defaut qu on ne voit pas en banc unitaire et qui
 * rend un geste inutilisable sur le chantier.
 */
describe('recaler un etage au doigt', () => {
  it('cumule les pas d un glissement, sans les multiplier', () => {
    const st = () => useScanStore.getState();
    st().finalize(releve() as never);
    st().finalizeEtage(releve(12) as never, 1);
    const depart = st().walls.find((w) => niveauDe(w) === 1)!.a.x;
    // Dix images de deux centimetres : un glissement de vingt centimetres.
    for (let i = 0; i < 10; i++) st().recalerNiveau(1, 0.02, 0);
    const arrivee = st().walls.find((w) => niveauDe(w) === 1)!.a.x;
    expect(arrivee - depart).toBeCloseTo(0.2, 6);
  });

  it('ne bouge pas le niveau du dessous, meme apres dix pas', () => {
    const st = () => useScanStore.getState();
    st().finalize(releve() as never);
    st().finalizeEtage(releve(12) as never, 1);
    const bas = st().walls.filter((w) => niveauDe(w) === 0).map((w) => w.a.x);
    for (let i = 0; i < 10; i++) st().recalerNiveau(1, 0.05, -0.03);
    expect(st().walls.filter((w) => niveauDe(w) === 0).map((w) => w.a.x)).toEqual(
      bas,
    );
  });
});
