/**
 * CE QUI EST ALLUMÉ QUAND UN PLAN S'OUVRE.
 *
 * Relevé du patron, deux fois : « sur la vue 3D de base au scan, on coche
 * les boutons pour afficher les meubles et les murs seulement », puis, la
 * chose n'ayant pas tenu sur l'appareil : « sur le plan 3D, de base on doit
 * avoir actif les meubles et les murs ».
 *
 * Elle n'avait pas tenu pour une raison qu'aucun banc ne voyait : le calque
 * des meubles est GARDÉ D'UNE SESSION À L'AUTRE (`AsyncStorage`). Éteint une
 * fois, sur un plan quelconque, il restait éteint — sur le scan suivant, et
 * sur tous les suivants. Le réglage était juste, le défaut ne l'était plus.
 *
 * Un plan qui s'ouvre repose donc ses calques : meubles et murs pleins
 * allumés, surfaces teintées et couleurs relevées éteintes. Ce qu'on éteint
 * ensuite vaut pour la séance, pas pour la vie de l'application — un plan
 * s'ouvre sur ce qu'il montre, pas sur ce qu'on cachait la dernière fois.
 *
 * Les quatre portes se valent : le scan qui finit, le brouillon qu'on
 * reprend, le plan qu'on rouvre, la saisie au clavier. Une seule oubliée, et
 * le défaut revient par elle.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { useScanStore } from '../src/store/scanStore';

const st = () => useScanStore.getState();

/** L'état qu'on laisse derrière soi : tout à l'envers du défaut. */
const salir = () =>
  useScanStore.setState({
    showFurniture: false,
    showSurfaces: true,
    showTextures: true,
    solidWalls: false,
  });

const calques = () => ({
  meubles: st().showFurniture,
  murs: st().solidWalls,
  surfaces: st().showSurfaces,
  couleurs: st().showTextures,
});

const DE_BASE = {
  meubles: true,
  murs: true,
  surfaces: false,
  couleurs: false,
};

const RELEVE = {
  walls: [
    { id: 'n', a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, height: 2.5, thickness: 0.1 },
    { id: 'e', a: { x: 4, z: 0 }, b: { x: 4, z: 3 }, height: 2.5, thickness: 0.1 },
    { id: 's', a: { x: 4, z: 3 }, b: { x: 0, z: 3 }, height: 2.5, thickness: 0.1 },
    { id: 'o', a: { x: 0, z: 3 }, b: { x: 0, z: 0 }, height: 2.5, thickness: 0.1 },
  ],
  openings: [],
  objects: [],
};

describe('les calques à l’ouverture d’un plan', () => {
  it('se reposent quand un scan se termine', () => {
    salir();
    st().finalize(RELEVE as never);
    expect(calques()).toEqual(DE_BASE);
  });

  it('se reposent quand on repart d’un plan vierge', () => {
    salir();
    st().commencerAuClavier();
    expect(calques()).toEqual(DE_BASE);
  });

  it('et quand on rouvre un plan enregistré', () => {
    useScanStore.setState({
      saves: [
        {
          id: 'vieux',
          name: 'Ancien chantier',
          createdAt: 0,
          updatedAt: 0,
          modelPath: null,
          rooms: [{ id: 'r1', name: 'Séjour' }],
          walls: RELEVE.walls,
          openings: [],
          objects: [],
        },
      ] as never,
    });
    salir();
    st().openSave('vieux');
    expect(calques()).toEqual(DE_BASE);
  });
});
