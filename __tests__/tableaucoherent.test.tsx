/**
 * UN SEUL TABLEAU, PARTOUT.
 *
 * Relevé du patron : « sur le plan d'exemple, au clic sur le tableau, on voit
 * un tableau déjà bien établi sur le modèle 3D, mais si on clique sur
 * "Constituer le tableau", la page pour l'édition du tableau n'affiche pas
 * les disjoncteurs que l'on a pourtant sur la 3D. Revois ça pour qu'ils
 * correspondent en toute circonstance. »
 *
 * Trois dessins ne se parlaient pas : la 3D posait, faute de relevé, un
 * tableau DÉCORATIF (treize, dix, quatorze et huit disjoncteurs) ; le rendu
 * réaliste montrait celui que le plan appelle ; la feuille d'édition
 * s'ouvrait vide. Ils lisent maintenant le même TABLEAU DE RÉFÉRENCE :
 * celui qu'on a constitué s'il existe, sinon celui que le plan appelle. Et
 * ouvrir la feuille sur un tableau jamais constitué la remplit de celui-là.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { appartementExemple } from '../src/data/exemple';
import { railDuReleve, type TableauExistant } from '../src/geometry/existant';
import { circuitsDuLogement, tableauDeReference } from '../src/geometry/tableauFini';
import { useTableauDeReference } from '../src/store/tableauDeReference';
import { useScanStore } from '../src/store/scanStore';
import { ExistantSheet } from '../src/screens/result/ExistantSheet';

const ex = appartementExemple();
const poserLExemple = () =>
  act(() => {
    useScanStore.getState().reset();
    useScanStore.setState({
      walls: ex.walls,
      openings: ex.openings,
      objects: ex.objects,
      rooms: ex.rooms,
      fixtures: ex.fixtures,
      ceiling: ex.ceiling,
      existant: null,
    } as never);
  });

/** Ce que l'organe est, sans son identifiant : de quoi comparer deux tableaux. */
const signature = (t: TableauExistant | null) =>
  (t?.departs ?? []).map((d) => [d.organe, d.calibre, d.usage ?? '', d.piece ?? '', d.rangee ?? -1].join('|'));

/** Le tableau de référence, lu par un composant comme le lisent la 3D et le mur. */
function lire(): { tableau: TableauExistant | null; projete: boolean } {
  let vu!: { tableau: TableauExistant | null; projete: boolean };
  const Sonde = () => {
    vu = useTableauDeReference();
    return <Text>sonde</Text>;
  };
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<Sonde />);
  });
  act(() => t.unmount());
  return vu;
}

describe('le tableau de référence', () => {
  it('sur le plan d’exemple, rien de constitué : celui que le plan appelle, avec ses disjoncteurs', () => {
    poserLExemple();
    const { tableau, projete } = lire();
    expect(projete).toBe(true);
    expect(tableau!.departs.filter((d) => d.organe === 'disjoncteur').length).toBeGreaterThan(3);
    // Le même que celui qu'on calcule à la main sur tout le logement.
    const circuits = circuitsDuLogement(ex.walls, ex.rooms, ex.fixtures, ex.ceiling);
    expect(signature(tableau)).toEqual(signature(tableauDeReference(null, circuits)));
  });

  it('un tableau constitué, même vide, passe devant le plan', () => {
    const vide: TableauExistant = { departs: [] };
    expect(tableauDeReference(vide, circuitsDuLogement(ex.walls, ex.rooms, ex.fixtures, ex.ceiling))).toBe(vide);
  });
});

describe('la feuille d’édition montre ce que montre la 3D', () => {
  it('« Constituer le tableau » la remplit du tableau qu’on voyait', () => {
    poserLExemple();
    const avant = lire();
    act(() => useScanStore.getState().constituerLeTableau(avant.tableau!));
    const existant = useScanStore.getState().existant;
    expect(signature(existant)).toEqual(signature(avant.tableau));
    // Chaque organe a désormais son identifiant à lui.
    expect(existant!.departs.every((d) => d.id.startsWith('dep-'))).toBe(true);
    // Et la référence est maintenant le tableau constitué : rien ne bouge à l'œil.
    const apres = lire();
    expect(apres.projete).toBe(false);
    expect(signature(apres.tableau)).toEqual(signature(avant.tableau));
  });

  it('un tableau déjà constitué n’est jamais écrasé', () => {
    poserLExemple();
    act(() => {
      useScanStore.getState().ajouterDepart({ organe: 'fusible', calibre: 10 });
    });
    const avant = signature(useScanStore.getState().existant);
    const vu = lire().tableau!;
    act(() => useScanStore.getState().constituerLeTableau(vu));
    expect(signature(useScanStore.getState().existant)).toEqual(avant);
  });

  it('« Vider le tableau » repart de zéro — et la 3D le montre vide, pas décoré', () => {
    poserLExemple();
    const vu = lire().tableau!;
    act(() => useScanStore.getState().constituerLeTableau(vu));
    act(() => useScanStore.getState().viderLeTableau());
    const { tableau, projete } = lire();
    expect(projete).toBe(false);
    expect(tableau!.departs).toHaveLength(0);
    const rail = railDuReleve(tableau)!;
    expect(rail).not.toBeNull();
    expect(rail.modules).toHaveLength(0);
  });
});

describe('le bouton « Vider le tableau »', () => {
  it('se confirme d’un second geste, et « Garder » le désarme', () => {
    const vider = jest.fn();
    const tableau: TableauExistant = {
      departs: [
        { id: 'a', organe: 'differentiel', calibre: 40, sensibilite: 30, typeDiff: 'AC' },
        { id: 'b', organe: 'disjoncteur', calibre: 16 },
      ],
    };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <ExistantSheet
          visible
          existant={tableau}
          onClose={() => {}}
          onAjouter={() => 'x'}
          onModifier={() => {}}
          onRetirer={() => {}}
          onDecrire={() => {}}
          onVider={vider}
        />,
      );
    });
    const bouton = (label: string) =>
      t.root.findAll((n) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
    act(() => bouton('Vider le tableau').props.onPress());
    expect(vider).not.toHaveBeenCalled();
    act(() => bouton('Garder le tableau').props.onPress());
    expect(bouton('Vider le tableau')).toBeDefined();
    act(() => bouton('Vider le tableau').props.onPress());
    act(() => bouton('Confirmer : retirer tous les organes').props.onPress());
    expect(vider).toHaveBeenCalledTimes(1);
    act(() => t.unmount());
  });
});

describe('tous les dessins lisent la même référence', () => {
  it('la 3D, le mur et la visite ; l’écran du plan aussi', () => {
    const lireSrc = (f: string) => readFileSync(join(__dirname, '..', 'src', ...f.split('/')), 'utf8');
    for (const f of ['components/Iso3DView.tsx', 'components/WallElevation.tsx', 'components/Exploration.tsx']) {
      const src = lireSrc(f);
      expect({ [f]: /useTableauDeReference\(\)/.test(src) }).toEqual({ [f]: true });
      expect({ [f]: /railDuReleve\(existant\)/.test(src) }).toEqual({ [f]: false });
    }
    const ecran = lireSrc('screens/ResultScreen.tsx');
    expect(ecran).toMatch(/useTableauDeReference\(\)/);
    expect(ecran).toMatch(/constituerLeTableau\(/);
  });
});
