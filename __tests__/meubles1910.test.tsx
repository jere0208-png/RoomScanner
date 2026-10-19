/**
 * LES MEUBLES, DANS LA PEAU DE CELLE QUI AMÉNAGE ET DU CUISINISTE — défauts
 * trouvés par l'agent testeur MEUBLES (19/10), devenus des garde-fous :
 *   — une cote saisie agrandissait le meuble des deux côtés : adossé, il
 *     entrait dans le mur ;
 *   — un meuble haut, une télévision, un tableau posés depuis le catalogue
 *     arrivaient au milieu de la pièce, en l'air ;
 *   — quatre quarts de tour ne ramenaient pas le meuble à sa place ;
 *   — la copie d'un meuble haut tombait sur le frigo voisin, puis était
 *     repoussée au milieu de la pièce ;
 *   — « chaises », « canapés », « cuisine », « salle de bain » ne
 *     trouvaient rien au catalogue ;
 *   — une armoire ou un meuble haut pouvaient traverser le plafond ;
 *   — et ce qui manquait : remplacer un meuble mal reconnu par le scan, à
 *     sa place.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { ObjectData } from 'react-native-room-scan';
import { useScanStore } from '../src/store/scanStore';
import { CATALOGUE, catalogItem, seFixeAuMur } from '../src/geometry/catalogue';
import { solDesMurs } from '../src/geometry/floorplan';
import { seGenent } from '../src/geometry/niche';
import { matchItem } from '../src/screens/result/FurnitureSheet';
import { ObjectBar } from '../src/components/ObjectBar';
import { getStyles } from '../src/screens/result/styles';
import { light } from '../src/theme';

const st = () => useScanStore.getState();
const meuble = (id: string) => st().objects.find((o) => o.id === id)!;
const item = (k: string) => catalogItem(k)!;
const yawDe = (o: ObjectData) => Math.atan2(o.transform[2], o.transform[0]);
/** Les bords du meuble dans le repère du plan. */
const bords = (o: ObjectData) => {
  const y = yawDe(o);
  const ex = Math.abs(Math.cos(y)) * (o.width / 2) + Math.abs(Math.sin(y)) * (o.depth / 2);
  const ez = Math.abs(Math.sin(y)) * (o.width / 2) + Math.abs(Math.cos(y)) * (o.depth / 2);
  return { x0: o.transform[12] - ex, x1: o.transform[12] + ex, z0: o.transform[14] - ez, z1: o.transform[14] + ez };
};
const dessous = (o: ObjectData) => o.transform[13] - o.height / 2 - solDesMurs(st().walls);

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  act(() => st().ouvrirExemple());
});

// L'appartement d'exemple : façade nord en z = 0, refend en x = 5, mur est en x = 8.
const BAS = 'exemple-meubleBas-278-30';
const LIT = 'exemple-lit140-701-180';

describe('une cote saisie agrandit le meuble vers la pièce, pas dans le mur', () => {
  it('le meuble bas adossé passe de 60 à 80 de profondeur sans entrer dans la façade', () => {
    expect(bords(meuble(BAS)).z0).toBeGreaterThanOrEqual(-0.005);
    st().resizeObject(BAS, 0.6, 0.8);
    const o = meuble(BAS);
    expect(o.depth).toBe(0.8);
    expect(bords(o).z0).toBeGreaterThanOrEqual(-0.005);
    expect(bords(o).z0).toBeLessThan(0.02);
  });

  it('le lit élargi ne traverse pas le mur est', () => {
    st().resizeObject(LIT, 1.66, 2.1);
    const o = meuble(LIT);
    expect(o.width).toBe(1.66);
    expect(o.depth).toBe(2.1);
    expect(bords(o).x1).toBeLessThanOrEqual(8.005);
  });
});

describe('ce qui se fixe au mur se pose contre le mur', () => {
  it('le meuble haut, posé au milieu de la cuisine, vient dos à la façade, à sa hauteur', () => {
    const id = st().addObject(item('meubleHaut'), 1.27, 1.0);
    const o = meuble(id);
    expect(bords(o).z0).toBeCloseTo(0, 2);
    expect(o.transform[12]).toBeCloseTo(1.27, 2);
    expect(dessous(o)).toBeCloseTo(1.4, 6);
    // Dos au mur : son axe de profondeur regarde la façade.
    expect(Math.abs(Math.cos(yawDe(o)) + 1)).toBeLessThan(1e-6);
  });

  it('la télévision posée près du refend s’y accroche, tournée vers le séjour', () => {
    const id = st().addObject(item('tv'), 4.4, 2.0);
    const o = meuble(id);
    // Le refend fait 14 cm : son nu, côté séjour, est en x = 4,93.
    expect(bords(o).x1).toBeCloseTo(4.93, 2);
    expect(Math.abs(Math.sin(yawDe(o)))).toBeCloseTo(1, 6);
  });

  it('ce qui se pose au sol reste où on le pose', () => {
    const id = st().addObject(item('commode'), 2.5, 2.4);
    expect(meuble(id).transform[14]).toBeCloseTo(2.4, 1);
    expect(seFixeAuMur('commode')).toBe(false);
    expect(seFixeAuMur('meubleHaut')).toBe(true);
  });
});

describe('tourner, puis tourner encore, ramène le meuble où il était', () => {
  for (const id of ['exemple-canape2-449-150', 'exemple-armoire2p-536-75', LIT]) {
    it(`${id.split('-')[1]} : quatre quarts de tour, la même place`, () => {
      const avant = { x: meuble(id).transform[12], z: meuble(id).transform[14] };
      for (let k = 0; k < 4; k++) st().rotateObject(id);
      const o = meuble(id);
      expect(o.transform[12]).toBeCloseTo(avant.x, 3);
      expect(o.transform[14]).toBeCloseTo(avant.z, 3);
    });
  }

  it('déplacé entre deux quarts de tour, il repart de sa nouvelle place', () => {
    const id = 'exemple-armoire2p-536-75';
    st().rotateObject(id);
    st().setObjectCenter(id, 6.5, 2.5);
    const ici = { x: meuble(id).transform[12], z: meuble(id).transform[14] };
    for (let k = 0; k < 3; k++) st().rotateObject(id);
    expect(Math.hypot(meuble(id).transform[12] - ici.x, meuble(id).transform[14] - ici.z)).toBeLessThan(0.5);
  });
});

describe('la copie se pose où la place est libre', () => {
  it('la copie d’un meuble haut évite le frigo et reste au mur', () => {
    const id = st().addObject(item('meubleHaut'), 1.27, 1.0);
    const copie = st().dupliquerMeuble(id)!;
    const c = meuble(copie);
    expect(st().objects.filter((o) => o.id !== copie).some((o) => seGenent(c, o))).toBe(false);
    expect(bords(c).z0).toBeCloseTo(0, 2);
    expect(dessous(c)).toBeCloseTo(1.4, 6);
  });
});

describe('le catalogue se cherche comme on parle', () => {
  const cherche = (q: string) => CATALOGUE.flatMap((f) => f.items.filter((i) => matchItem(i, q, f.name)).map((i) => i.label));
  it('au pluriel', () => {
    expect(cherche('chaises')).toContain('Chaise');
    expect(cherche('canapés')).toContain('Canapé 2 places');
    expect(cherche('meubles hauts')).toContain('Meuble haut');
    expect(cherche('tableaux')).toContain('Tableau');
  });
  it('par pièce', () => {
    expect(cherche('cuisine')).toEqual(expect.arrayContaining(['Meuble haut', 'Réfrigérateur', 'Évier']));
    expect(cherche('salle de bain')).toEqual(expect.arrayContaining(['Baignoire', 'Lavabo']));
    expect(cherche('salon')).toContain('Canapé 2 places');
  });
  it('sans rien trouver de travers', () => {
    expect(cherche('chaise')).not.toContain('Réfrigérateur');
    expect(cherche('')).toHaveLength(CATALOGUE.flatMap((f) => f.items).length);
  });
});

describe('rien ne traverse le plafond', () => {
  it('une armoire passée à 3,20 m s’arrête au plafond de la pièce (2,50 m)', () => {
    const id = 'exemple-armoire2p-536-75';
    st().setObjectHeight(id, 3.2);
    expect(meuble(id).height).toBeCloseTo(2.5, 6);
    expect(dessous(meuble(id))).toBeCloseTo(0, 6);
  });
  it('un meuble haut descendu à 2,20 m garde sa hauteur et remonte sous le plafond', () => {
    const id = st().addObject(item('meubleHaut'), 1.27, 1.0);
    st().setObjectHeight(id, undefined, 2.2);
    expect(meuble(id).height).toBeCloseTo(0.7, 6);
    expect(dessous(meuble(id)) + meuble(id).height).toBeCloseTo(2.5, 6);
  });
  it('sous le plafond, rien ne change', () => {
    const id = 'exemple-armoire2p-536-75';
    st().setObjectHeight(id, 2.2);
    expect(meuble(id).height).toBeCloseTo(2.2, 6);
  });
});

describe('remplacer un meuble, à sa place', () => {
  it('le « rangement » que le scan a vu devient un frigo : même place, même sens, ses cotes mesurées', () => {
    const releve: ObjectData = {
      id: 'scan-1',
      category: 'storage',
      width: 0.62,
      depth: 0.66,
      height: 1.9,
      roomId: 'exemple-piece-1',
      transform: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 4.2, solDesMurs(st().walls) + 0.95, 3.6, 1],
    };
    act(() => useScanStore.setState({ objects: [...st().objects, releve] }));
    st().remplacerMeuble('scan-1', item('frigo'));
    const o = meuble('scan-1');
    expect(o).toMatchObject({ category: 'refrigerator', modele: 'frigo', width: 0.62, depth: 0.66, height: 1.9 });
    expect(o.transform[12]).toBeCloseTo(4.2, 2);
    expect(o.transform[14]).toBeCloseTo(3.6, 2);
    expect(yawDe(o)).toBeCloseTo(Math.PI, 6);
    // Un seul « Annuler » rend le rangement.
    st().undo();
    expect(meuble('scan-1')).toMatchObject({ category: 'storage' });
    expect(meuble('scan-1').modele).toBeUndefined();
  });

  it('un meuble du catalogue prend les cotes du nouveau ; un meuble bas remplacé par un meuble haut monte', () => {
    st().remplacerMeuble(BAS, item('meubleHaut'));
    const o = meuble(BAS);
    expect(o).toMatchObject({ modele: 'meubleHaut', width: 0.8, depth: 0.35, height: 0.7 });
    expect(dessous(o)).toBeCloseTo(1.4, 6);
  });

  it('la barre du meuble propose « Remplacer »', () => {
    let appuye = 0;
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ObjectBar
          object={meuble(BAS)}
          styles={getStyles(light) as unknown as Record<string, object>}
          palette={light}
          onPrompt={() => {}}
          onResize={() => {}}
          onRotate={() => {}}
          onCancel={() => {}}
          onRemplacer={() => {
            appuye += 1;
          }}
        />,
      );
    });
    act(() => t.root.find((n) => n.props.accessibilityLabel === 'Remplacer le meuble' && typeof n.props.onPress === 'function').props.onPress());
    expect(appuye).toBe(1);
    act(() => t.unmount());
  });
});
