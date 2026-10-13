/**
 * LA PORTE OUVERTE PENDANT LE SCAN EST UNE PORTE.
 *
 * Relevé du patron : « j'ai scanné ma chambre, il a détecté l'ouverture de
 * porte, mais sur le plan aucune porte n'est placée » ; « ma porte a été
 * détectée comme baie, alors que taille standard de porte ». Un vantail
 * ouvert, plaqué contre le mur, RoomPlan ne le voit pas : il rend une
 * ouverture. Celle qui a les cotes d'une porte en est une.
 */
import { PORTE_HAUTEUR, PORTE_LARGEUR, portesVuesOuvertes, type WallSeg } from '../src/geometry/floorplan';

const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  // Le sol du relevé à −0,40 : l'origine d'ARKit est à hauteur de main.
  yCenter: 1.25 - 0.4,
});
const MURS = [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('o', 0, 3, 0, 0)];

const ouverture = (largeur: number, hauteur: number, bas = 0): WallSeg => ({
  id: 'o',
  type: 'opening',
  a: { x: 1, z: 3 },
  b: { x: 1 + largeur, z: 3 },
  height: hauteur,
  yCenter: -0.4 + bas + hauteur / 2,
});

describe('une ouverture aux cotes d’une porte', () => {
  it('83 × 204 au ras du sol : une porte, vue ouverte', () => {
    const [o] = portesVuesOuvertes([ouverture(0.83, 2.04)], MURS);
    expect(o.type).toBe('door');
    expect(o.open).toBe(true);
  });

  it('les bornes de la porte standard tiennent : de 60 cm à 1,05 m, de 1,85 m à 2,35 m', () => {
    for (const l of [PORTE_LARGEUR.min, 0.73, 0.93, PORTE_LARGEUR.max]) {
      for (const h of [PORTE_HAUTEUR.min, 2.15, PORTE_HAUTEUR.max]) {
        expect(portesVuesOuvertes([ouverture(l, h)], MURS)[0].type).toBe('door');
      }
    }
  });
});

describe('ce qui n’en est pas une reste une ouverture', () => {
  it('un passage de 1,40 m entre séjour et cuisine', () => {
    expect(portesVuesOuvertes([ouverture(1.4, 2.1)], MURS)[0].type).toBe('opening');
  });

  it('un passe-plat de 80 cm, à un mètre du sol', () => {
    expect(portesVuesOuvertes([ouverture(0.8, 1.0, 1)], MURS)[0].type).toBe('opening');
  });

  it('une niche de 90 cm qui ne monte qu’à 1,50 m', () => {
    expect(portesVuesOuvertes([ouverture(0.9, 1.5)], MURS)[0].type).toBe('opening');
  });

  it('rien à revoir : la liste revient telle quelle', () => {
    const l = [ouverture(1.4, 2.1)];
    expect(portesVuesOuvertes(l, MURS)).toBe(l);
  });
});
