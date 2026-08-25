/**
 * UNE COTE COURANTE SE TOUCHE, ELLE NE SE TAPE PAS.
 *
 * Releve du patron : « optimise des choses qui pourraient prendre plus en
 * facilite et moins de temps, comme cet ajout » — l'ajout etant la feuille
 * qui propose porte, fenetre ou baie au lieu de poser un trou.
 *
 * Le meme gisement existait dans la SAISIE. Toutes les cotes de
 * l'application passent par une seule feuille : hauteur sous plafond,
 * hauteur d'un mur, largeur et hauteur d'une menuiserie, allege, position
 * sur le mur. A chaque fois, un clavier numerique et une virgule a placer,
 * d'une main, sur un chantier. Or la moitie de ces cotes sont des valeurs de
 * catalogue que tout le monde connait : 83 pour un passage, 95 pour une
 * allege, 2,50 pour un plafond.
 *
 * La feuille porte donc une rangee de PASTILLES au-dessus de son champ. Un
 * appui suffit : la pastille remplit le champ ET valide, parce qu'un choix
 * explicite n'a pas besoin d'etre confirme une seconde fois. Le champ reste
 * a sa place pour tout le reste — c'est le metre qui tranche quand le
 * batiment n'est pas du catalogue.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PromptSheet, type PromptData } from '../src/components/Sheet';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/*
  LA FEUILLE SE FERME VRAIMENT.

  Elle rend son resultat APRES sa descente (iOS ne presente qu'une fenetre
  modale a la fois). Un banc qui la monterait avec un `onClose` vide
  « prouverait » que rien ne se valide, sans avoir rien joue — c'est le
  piege dans lequel le banc de la feuille de choix est deja tombe une fois.
*/
const Cadre = ({
  data,
  onFerme,
}: {
  data: PromptData;
  onFerme?: () => void;
}) => {
  const [vu, setVu] = React.useState<PromptData | null>(data);
  return (
    <PromptSheet
      data={vu}
      onClose={() => {
        setVu(null);
        onFerme?.();
      }}
    />
  );
};

const monter = (data: PromptData) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<Cadre data={data} />);
  });
  return t;
};

/** Les pastilles, cherchees par leur etiquette parlee. */
const pastillesDe = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityRole === 'button' &&
        /^Cote /.test(n.props.accessibilityLabel),
    )
    .map((n) => n.props as { accessibilityLabel: string; onPress: () => void })
    .filter(
      (p, i, tous) =>
        tous.findIndex((q) => q.accessibilityLabel === p.accessibilityLabel) === i,
    );

const CHOIX = [
  { label: '63', value: '0,63' },
  { label: '73', value: '0,73' },
  { label: '83', value: '0,83' },
  { label: '93', value: '0,93' },
];

const base = (rendu: (v: string) => void): PromptData => ({
  title: 'Largeur de la menuiserie',
  value: '0,83',
  unit: 'm',
  numeric: true,
  choix: CHOIX,
  onSubmit: rendu,
});

describe('les cotes courantes, dans la feuille de saisie', () => {
  it('s’affichent en rangee, une par cote proposee', () => {
    const t = monter(base(() => {}));
    expect(pastillesDe(t)).toHaveLength(CHOIX.length);
    // L'etiquette parlee porte l'unite : « 63 » tout seul ne veut rien dire
    // a la synthese vocale.
    expect(pastillesDe(t)[0].accessibilityLabel).toBe('Cote 63');
    act(() => t.unmount());
  });

  it('valident en UN appui, avec la valeur de la pastille', () => {
    const vus: string[] = [];
    const t = monter(base((v) => vus.push(v)));
    const p = pastillesDe(t).find((x) => x.accessibilityLabel === 'Cote 73')!;
    act(() => p.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual(['0,73']);
    act(() => t.unmount());
  });

  it('laissent le champ faire son travail pour tout le reste', () => {
    // Une cote qui n'est pas au catalogue se tape, et se valide comme avant.
    const vus: string[] = [];
    const t = monter(base((v) => vus.push(v)));
    const champ = t.root.findByType(TextInput);
    act(() => champ.props.onChangeText('0,78'));
    act(() => champ.props.onSubmitEditing());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual(['0,78']);
    act(() => t.unmount());
  });

  /*
    LES CONTROLES EN SENS INVERSE. Sans eux, une feuille qui validerait toute
    seule — ou qui poserait des pastilles partout — passerait pour juste.
  */
  it('ne valident rien tant que personne ne touche', () => {
    const vus: string[] = [];
    const t = monter(base((v) => vus.push(v)));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual([]);
    act(() => t.unmount());
  });

  it('n’apparaissent pas quand il n’y a rien a proposer', () => {
    // La longueur d'un mur est une MESURE : proposer des valeurs rondes
    // serait suggerer une cote que personne n'a relevee.
    const t = monter({
      title: 'Longueur du mur',
      value: '3,42',
      unit: 'm',
      numeric: true,
      onSubmit: () => {},
    });
    expect(pastillesDe(t)).toHaveLength(0);
    // Et le champ, lui, est toujours la.
    expect(t.root.findAllByType(TextInput)).toHaveLength(1);
    act(() => t.unmount());
  });

  it('disent un GESTE quand ce n’en est pas une, de cote', () => {
    // La position d'une menuiserie sur son mur se propose autrement : pas
    // « 1,35 », qui ne dit rien, mais « Centrée ». L'etiquette parlee suit —
    // « Cote centrée » ne veut rien dire.
    const t = monter({
      title: 'Position sur le mur',
      value: '0,90',
      unit: 'm',
      numeric: true,
      choix: [{ label: 'Centrée', value: '1,35' }],
      onSubmit: () => {},
    });
    const dits = t.root
      .findAll(
        (n) =>
          typeof n.props?.accessibilityLabel === 'string' &&
          n.props.accessibilityRole === 'button',
      )
      .map((n) => n.props.accessibilityLabel as string);
    expect(dits).toContain('Centrée');
    expect(dits.some((d) => d.startsWith('Cote Centr'))).toBe(false);
    act(() => t.unmount());
  });

  it('se distinguent du reste de la feuille', () => {
    // La cote DEJA POSEE se reconnait dans la rangee : sans ca, on ne sait
    // pas laquelle des quatre on a sous les yeux.
    const t = monter(base(() => {}));
    const mots = t.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(mots).toContain('83');
    act(() => t.unmount());
  });
});
