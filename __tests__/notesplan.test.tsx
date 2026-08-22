/**
 * LES NOTES SE LISENT SUR LE PLAN.
 *
 * Une note qu'on ne voit pas est une note qu'on n'a pas prise. Le releve
 * papier posait la remarque LA OU ELLE PORTE — au droit de la colonne, sur
 * la cloison a percer — et c'est ce point qui lui donne son sens : « gaine a
 * reprendre » ne veut rien dire au milieu du salon.
 *
 * Trois regles, et cette epreuve les tient :
 *
 *   — le texte se lit A TAILLE CONSTANTE. Une note ecrite dans le repere du
 *     plan devient illisible au dezoom et geante au zoom ; c'est deja la
 *     regle des cotes, elle vaut pour les mots ;
 *   — elle se touche, pour la corriger ou la retirer — sinon une faute de
 *     frappe est definitive ;
 *   — elle ne montre QUE l'etage sur lequel on est. Une remarque sur la
 *     colonne du rez n'a rien a faire par-dessus le plan du premier.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import Svg from 'react-native-svg';
import { NotesLayer } from '../src/components/NotesLayer';
import { light } from '../src/theme';

const mapping = {
  scale: 40,
  toPx: (p: { x: number; z: number }) => ({ x: p.x * 40, y: p.z * 40 }),
};

const notes = [
  { id: 'n1', text: 'Colonne montante', at: { x: 1, z: 1 } },
  { id: 'n2', text: 'Attente TV', at: { x: 3, z: 2 }, niveau: 1 },
];

const monter = (props: Record<string, unknown> = {}) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(
      <Svg>
        <NotesLayer
          notes={notes}
          mapping={mapping}
          niveau={0}
          selectedId={null}
          c={light}
          {...props}
        />
      </Svg>,
    );
  });
  return t;
};

/** Les textes reellement peints. */
const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll((n) => typeof n.props?.children === 'string')
    .map((n) => n.props.children as string);

describe('la couche des notes', () => {
  it('n’affiche que celles de l’etage courant', () => {
    expect(mots(monter())).toContain('Colonne montante');
    expect(mots(monter())).not.toContain('Attente TV');
    expect(mots(monter({ niveau: 1 }))).toContain('Attente TV');
  });

  it('ecrit A TAILLE CONSTANTE, quel que soit le zoom', () => {
    const taille = (echelle: number) => {
      const t = monter({
        mapping: { ...mapping, scale: echelle },
      });
      const txt = t.root.findAll((n) => typeof n.props?.fontSize === 'number')[0];
      return txt.props.fontSize as number;
    };
    // Le plan double d'echelle : le mot garde sa taille de lecture.
    expect(taille(80)).toBe(taille(20));
  });

  it('se touche pour la reprendre', () => {
    const vus: string[] = [];
    const t = monter({ onSelect: (id: string) => vus.push(id) });
    const cible = t.root.findAll(
      (n) => n.props?.accessibilityLabel === 'Note : Colonne montante',
    )[0];
    expect(cible).toBeDefined();
    act(() => cible.props.onPress());
    expect(vus).toEqual(['n1']);
  });

  it('se pose LA OU on l’a ecrite', () => {
    /*
      C'EST LA PUNAISE QUI MARQUE LE POINT, pas le cartouche.

      Le banc visait d'abord le texte, et le trouvait seize pixels plus
      loin : le cartouche s'ecarte volontairement du point vise, sans quoi
      il couvre exactement ce que la note designe — la colonne, le
      percement. Ce qui doit tomber au millimetre, c'est la punaise ; le
      mot, lui, se pose a cote et pointe vers elle.
    */
    const t = monter();
    const punaise = t.root.findAll((n) => typeof n.props?.d === 'string')[0];
    // 1 m x 40 px/m : la punaise suit son point, pas le coin de l'ecran.
    expect(punaise.props.d.startsWith('M40 40')).toBe(true);
  });
});
