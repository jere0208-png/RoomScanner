/**
 * NOS ALERTES A NOUS.
 *
 * `Sheet.tsx` le disait depuis longtemps, et c'etait vrai partout ailleurs :
 * « `Alert.alert` et `Alert.prompt` sont ceux d'iOS : police systeme,
 * boutons bleus empiles, coins de 2019. Au milieu d'une app qui a sa
 * typographie, ses rayons et son bleu, ils font tache. »
 *
 * Les feuilles maison avaient remplace les saisies et les menus. Restaient
 * VINGT-CINQ fenetres systeme, disseminees : « Export impossible » cinq
 * fois, « Enregistrement impossible », « Achat impossible », « Connexion
 * impossible », et le « Abandonner ce releve ? » du scan — le seul dans un
 * parcours normal, les autres n'apparaissant qu'en cas d'echec. Une
 * application dont la moitie des messages d'erreur sont dessines par
 * quelqu'un d'autre n'a pas fini son travail.
 *
 * CE BANC TIENT LES DEUX BOUTS : que l'alerte maison fasse le travail — un
 * titre, un message, des gestes, une file d'attente — et que PLUS PERSONNE
 * n'appelle celle du systeme. Le second compte autant : il suffit d'un
 * `catch` ecrit vite pour rouvrir la porte, et rien ne le signalerait.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AlerteHote } from '../src/components/AlerteHote';
import { alerte, useAlerte } from '../src/ui/alerte';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
beforeEach(() => useAlerte.setState({ courante: null, file: [] }));
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = () => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<AlerteHote />);
  });
  arbre = t;
  return t;
};

const mots = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => String(n.props.children))
    .join(' | ');

const toucher = (t: TestRenderer.ReactTestRenderer, mot: string) => {
  const b = t.root
    .findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        n.findAllByType(Text).some((x) => String(x.props.children) === mot),
    )
    .pop();
  expect(b).toBeTruthy();
  act(() => b!.props.onPress());
  // La feuille rend son geste APRES sa descente : c'est la regle de la
  // maison, et la seule facon de ne pas changer l'ecran derriere elle.
  act(() => {
    jest.advanceTimersByTime(400);
  });
};

describe('l’alerte maison', () => {
  it('montre son titre et son message', () => {
    const t = monter();
    act(() => alerte('Export impossible', 'Le dossier est plein.'));
    expect(mots(t)).toContain('Export impossible');
    expect(mots(t)).toContain('Le dossier est plein.');
  });

  it('porte une sortie, meme quand personne n’en donne', () => {
    // Un message qu'on ne peut pas refermer n'existe pas.
    const t = monter();
    act(() => alerte('Capture impossible'));
    expect(mots(t)).toContain('Continuer');
  });

  it('rend ses gestes, et referme', () => {
    const t = monter();
    const fait: string[] = [];
    act(() =>
      alerte('Abandonner ce relevé ?', '4 murs déjà relevés.', [
        { label: 'Continuer le scan' },
        { label: 'Abandonner', danger: true, onPress: () => fait.push('parti') },
      ]),
    );
    toucher(t, 'Abandonner');
    expect(fait).toEqual(['parti']);
    expect(useAlerte.getState().courante).toBeNull();
  });

  /*
    LE CONTROLE EN SENS INVERSE : une alerte qui jouerait TOUS ses gestes a
    l'ouverture, ou le premier au hasard, passerait l'epreuve du dessus.
  */
  it('ne joue rien tant que personne ne touche', () => {
    const fait: string[] = [];
    monter();
    act(() =>
      alerte('Abandonner ce relevé ?', undefined, [
        { label: 'Continuer le scan', onPress: () => fait.push('reste') },
        { label: 'Abandonner', onPress: () => fait.push('parti') },
      ]),
    );
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(fait).toEqual([]);
  });

  it('en met une seule a l’ecran, et garde la suivante en attente', () => {
    // Deux alertes empilees, c'est une fenetre qui en cache une autre : la
    // seconde attend son tour. iOS le faisait deja.
    const t = monter();
    act(() => {
      alerte('Premier échec');
      alerte('Second échec');
    });
    expect(mots(t)).toContain('Premier échec');
    expect(mots(t)).not.toContain('Second échec');
    toucher(t, 'Continuer');
    expect(useAlerte.getState().courante?.titre).toBe('Second échec');
  });
});

/*
  PLUS PERSONNE N'APPELLE CELLE DU SYSTEME.

  C'est la moitie du travail qui se perd le plus vite : un `catch` ecrit
  vite, un `Alert.alert` de depannage, et l'application reprend deux
  langages. Le banc lit donc les sources — c'est le seul moyen de tenir une
  regle qui porte sur ce qu'on N'ECRIT PLUS.
*/
describe('l’alerte du systeme', () => {
  const sources = (() => {
    const out: string[] = [];
    const marcher = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) marcher(p);
        else if (/\.tsx?$/.test(e)) out.push(p);
      }
    };
    marcher(join(__dirname, '..', 'src'));
    return out;
  })();

  it('n’est plus appelee nulle part', () => {
    const fautifs = sources.filter((f) =>
      /Alert\.(alert|prompt)\(/.test(readFileSync(f, 'utf8')),
    );
    expect(fautifs.map((f) => f.split(/[\\/]/).pop())).toEqual([]);
  });

  it('n’est meme plus importee', () => {
    // Un import qui traine est un appel qui revient.
    const fautifs = sources.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /^import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/m.test(
        src,
      );
    });
    expect(fautifs.map((f) => f.split(/[\\/]/).pop())).toEqual([]);
  });
});
