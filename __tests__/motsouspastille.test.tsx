/**
 * LE MOT SOUS UNE PASTILLE EST UN MOT.
 *
 * Le bandeau d'une menuiserie a recu tous ses gestes en pastilles — releve du
 * patron : « le "…" est mal place, peu comprehensible sans lire le texte ».
 * Chacune porte son mot dessous, et trois d'entre eux etaient des PHRASES :
 * « Position sur le mur », « Sens d'ouverture », « Coffre de volet ».
 *
 * Or la cellule qui porte une pastille n'a pas de largeur : elle prend celle
 * de son contenu le plus large. Un mot de dix-neuf caracteres sous un disque
 * de trente-quatre points, et c'est la CELLULE qui fait cent dix points —
 * la rangee deborde, et l'on retrouve le defaut que le patron avait signale
 * en son temps sur le bandeau du mur : « peu de place pour les
 * informations, un bouton sort du bloc ».
 *
 * LA REGLE EST DONC SIMPLE, et elle se verifie : ce qui s'ecrit sous une
 * pastille est UN mot. « Position », « Sens », « Coffre ». L'etiquette
 * parlee, elle, garde sa phrase entiere — c'est elle que lit la synthese
 * vocale, et elle a tout le temps de la dire.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { light } from '../src/theme';
import { getStyles } from '../src/screens/result/styles';
import { StripBar } from '../src/components/StripBar';
import { ToolPill } from '../src/components/ToolPill';
import { SOLAIRES } from '../src/ui/solaires';

const styles = getStyles(light) as unknown as Record<string, object>;

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (n: React.ReactElement) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(n);
  });
  arbre = t;
  return t;
};

const bandeau = (actions: React.ComponentProps<typeof StripBar>['actions']) => (
  <StripBar
    styles={styles}
    icone={SOLAIRES.ouvertures}
    strong="0,83 × 2,04 m"
    note="porte"
    actions={actions}
  />
);

/** Les mots ecrits sous les pastilles. */
const motsEcrits = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .filter((m) => m !== '0,83 × 2,04 m' && m !== 'porte');

describe('le mot sous une pastille', () => {
  it('n’est jamais une phrase', () => {
    const t = monter(
      bandeau([
        {
          label: 'Position sur le mur',
          mot: 'Position',
          icone: SOLAIRES.ruler,
          sansMot: true,
          ghost: true,
          onPress: () => {},
        },
      ]),
    );
    expect(motsEcrits(t)).toEqual(['Position']);
  });

  it('mais l’etiquette parlee garde sa phrase', () => {
    // C'est elle que lit la synthese vocale, et elle a le temps.
    const t = monter(
      bandeau([
        {
          label: 'Position sur le mur',
          mot: 'Position',
          icone: SOLAIRES.ruler,
          sansMot: true,
          ghost: true,
          onPress: () => {},
        },
      ]),
    );
    const dits = t.root
      .findAll((n) => typeof n.props?.accessibilityLabel === 'string')
      .map((n) => n.props.accessibilityLabel as string);
    expect(dits).toContain('Position sur le mur');
  });

  /*
    LE CONTROLE EN SENS INVERSE : sans mot court donne, c'est l'etiquette qui
    s'ecrit — et la plupart des gestes n'ont qu'un mot de toute facon.
  */
  it('et quand il n’y a rien a raccourcir, l’etiquette suffit', () => {
    const t = monter(
      bandeau([
        {
          label: 'Largeur',
          icone: SOLAIRES.longueur,
          sansMot: true,
          ghost: true,
          onPress: () => {},
        },
      ]),
    );
    expect(motsEcrits(t)).toEqual(['Largeur']);
  });
});

/*
  ET CE QUI EST ALLUME SE DIT.

  Un calque actif se voit — la pastille passe au bleu plein — et ne
  s'entendait pas : la synthese vocale annoncait « Meubles, bouton » qu'il
  soit allume ou eteint. Quatre autres endroits de l'application le disaient
  deja ; la rangee des calques, qui est a l'ecran en permanence, l'avait
  oublie.
*/
describe('un calque allumé', () => {
  const pastille = (active: boolean) =>
    monter(
      <ToolPill
        icon="furniture"
        label="Meubles"
        active={active}
        onPress={() => {}}
      />,
    );

  const etatDe = (t: TestRenderer.ReactTestRenderer) =>
    t.root
      .findAll((n) => n.props?.accessibilityLabel === 'Meubles')
      .map((n) => n.props.accessibilityState)
      .find(Boolean);

  it('le dit à la synthèse vocale', () => {
    expect(etatDe(pastille(true))).toEqual({ selected: true });
  });

  it('et un calque éteint le dit aussi', () => {
    // Le contrôle en sens inverse : un état qui vaudrait TOUJOURS vrai ne
    // dirait rien du tout.
    expect(etatDe(pastille(false))).toEqual({ selected: false });
  });
});
