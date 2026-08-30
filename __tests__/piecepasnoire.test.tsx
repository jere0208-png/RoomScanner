/**
 * UNE PIÈCE QU'ON VIENT DE TRACER N'EST PAS DE LA MAÇONNERIE.
 *
 * Relevé du patron : « j'ai fait un petit bloc sur l'accueil, j'ai un rendu
 * d'une pièce complètement noire ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX RÈGLES JUSTES QUI, ENSEMBLE, DONNENT UN RÉSULTAT FAUX.
 *
 * Le plan poche en noir les recoins techniques — relevé d'un chantier
 * précédent : « quand il y a 4 murs qui encerclent un recoin vide, il doit
 * être rempli de noir pour ne pas confondre avec une pièce ». On les
 * reconnaît à deux signes : c'est petit, et rien ne s'y ouvre.
 *
 * Or une pièce tracée au doigt sur l'accueil est petite, et sa porte n'est
 * pas encore posée. Elle portait donc les deux signes du vide de
 * construction, et l'éditeur s'ouvrait sur un rectangle d'encre.
 *
 * CE QUI TRANCHE, C'EST LA DÉCLARATION. La règle de départ tenait sur un
 * mot : « un recoin VIDE ». Un vide, c'est ce que personne n'a réclamé. Une
 * pièce posée par l'utilisateur a un identifiant et une liste de murs :
 * attendre sa porte pour cesser de la noircir revient à punir le début du
 * relevé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { light } from '../src/theme';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

/**
 * LE PLAN, TEL QU'IL S'OUVRE APRÈS UN TRACÉ SUR L'ACCUEIL.
 *
 * On passe par le magasin, et pas par des murs écrits à la main : c'est le
 * chemin exact du patron — « Ouvrir cette pièce » appelle ces deux gestes,
 * dans cet ordre.
 */
const ouvrirUnePieceTracee = (largeur: number, profondeur: number) => {
  act(() => {
    useScanStore.getState().reset();
    useScanStore.getState().commencerAuClavier();
    useScanStore
      .getState()
      .addRoomRect({ x: 0, z: 0 }, { x: largeur, z: profondeur });
  });
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <FloorplanEditor
        showMeasures
        editable
        selectedWallId={null}
        onSelectWall={() => {}}
      />,
    );
  });
  act(() => {
    const zone = t.root
      .findAllByType(View)
      .find((n) => typeof n.props.onLayout === 'function')!;
    zone.props.onLayout({
      nativeEvent: { layout: { width: 390, height: 600 } },
    });
  });
  arbre = t;
  return t;
};

/**
 * CE QUI EST COUVERT D'ENCRE AU MILIEU DE LA PIÈCE.
 *
 * ON NE COMPTE PAS LES POLYGONES NOIRS : la maçonnerie des murs en est
 * faite, et un plan sain en porte quatre. Ce qu'on vérifie, c'est que le
 * MILIEU de la pièce reste libre — c'est exactement ce que le patron a vu,
 * un intérieur peint en noir.
 *
 * Le cadrage centre le plan dans son cadre : le milieu de la pièce tombe
 * donc au milieu de la vue.
 */
const contient = (points: string, x: number, y: number) => {
  const p = points
    .trim()
    .split(/\s+/)
    .map((c) => c.split(',').map(Number));
  let dedans = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dedans = !dedans;
    }
  }
  return dedans;
};

const encreAuMilieu = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Polygon)
    .filter(
      (n) =>
        n.props.fill === light.ink &&
        contient(String(n.props.points), 390 / 2, 600 / 2),
    );

describe('le plan qui s’ouvre sur une pièce tracée', () => {
  it('ne la peint pas en noir, si petite soit-elle', () => {
    // Un mètre sur soixante-quinze : le « petit bloc » du relevé.
    expect(encreAuMilieu(ouvrirUnePieceTracee(1, 0.75))).toHaveLength(0);
  });

  it('ni une pièce de taille ordinaire, évidemment', () => {
    expect(encreAuMilieu(ouvrirUnePieceTracee(4, 3))).toHaveLength(0);
  });
});
