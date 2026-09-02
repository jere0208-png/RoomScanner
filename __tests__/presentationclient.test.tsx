/**
 * LA PRÉSENTATION CLIENT, SORTIE DE SON TIROIR — sixième des dix.
 *
 * La visite guidée existait déjà, et bien : le logement tourne, la caméra
 * s'arrête sur chaque pièce puis se place face à chaque mur équipé, un
 * carton nomme les appareils. Ce qui manquait n'était pas la visite, c'était
 * TOUT CE QUI L'ENTOURE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 1. L'ÉCRAN S'ÉTEIGNAIT PENDANT LA VISITE.
 *
 * C'est LE défaut du mode présentation, et il ne se voit qu'en s'en
 * servant : on tend le téléphone au client, on retire la main de l'écran —
 * et iOS baisse la luminosité au bout de trente secondes, puis verrouille.
 * Une visite dure plus que ça. Le seul geste qui la sauve, c'est de
 * retoucher l'écran, c'est-à-dire d'interrompre exactement ce qu'on était
 * en train de montrer.
 *
 * 2. ELLE ÉTAIT ENTERRÉE SOUS « EXPORTER ».
 *
 * Trois appuis — Exporter, puis Présentation, puis attendre — pour le
 * moment le plus fort du produit. Elle se lance maintenant depuis la barre
 * de la 3D, là où l'on est déjà quand on veut montrer quelque chose.
 *
 * 3. ELLE IGNORAIT LA NUIT.
 *
 * Le mode nuit (première des dix) allume les luminaires pour de vrai. La
 * visite, elle, se jouait toujours en plein jour : l'installation qu'on
 * vient de concevoir ne se montrait jamais allumée.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { NativeModules, Platform } from 'react-native';
import {
  prendreLaVeille,
  veilleTenue,
  resetVeille,
} from '../src/ui/veille';

describe('l’écran ne s’éteint pas pendant qu’on montre', () => {
  const vrai = NativeModules.RoomScanEcran;
  let appels: boolean[] = [];

  beforeEach(() => {
    resetVeille();
    appels = [];
    Platform.OS = 'ios';
    (NativeModules as Record<string, unknown>).RoomScanEcran = {
      garderEveille: (oui: boolean) => appels.push(oui),
    };
  });
  afterEach(() => {
    (NativeModules as Record<string, unknown>).RoomScanEcran = vrai;
    resetVeille();
  });

  it('prendre la veille la retient, la rendre la relâche', () => {
    const rendre = prendreLaVeille();
    expect(veilleTenue()).toBe(1);
    expect(appels).toEqual([true]);
    rendre();
    expect(veilleTenue()).toBe(0);
    expect(appels).toEqual([true, false]);
  });

  it('deux preneurs, un seul relâchement : l’écran reste allumé', () => {
    /*
      Une visite lancée par-dessus un export en cours ne doit pas rendre la
      veille de l'autre. On COMPTE les preneurs, et le natif n'est prévenu
      qu'aux passages de zéro : c'est aussi ce qui évite de lui parler
      trente fois par seconde.
    */
    const a = prendreLaVeille();
    const b = prendreLaVeille();
    expect(appels).toEqual([true]);
    a();
    expect(veilleTenue()).toBe(1);
    expect(appels).toEqual([true]);
    b();
    expect(appels).toEqual([true, false]);
  });

  it('rendre deux fois la même veille ne la rend qu’une fois', () => {
    /*
      Un composant démonté après avoir déjà rendu sa veille — le cas ordinaire
      d'un `useEffect` qui se nettoie deux fois en développement. Sans cette
      garde, le compteur passe sous zéro et l'écran ne se rallume PLUS
      JAMAIS de la session : le téléphone se vide dans la poche.
    */
    const rendre = prendreLaVeille();
    rendre();
    rendre();
    expect(veilleTenue()).toBe(0);
    expect(appels).toEqual([true, false]);
  });

  it('sans module natif, elle ne lève pas — elle ne fait rien', () => {
    delete (NativeModules as Record<string, unknown>).RoomScanEcran;
    const rendre = prendreLaVeille();
    expect(() => rendre()).not.toThrow();
  });
});

describe('la visite tient l’écran allumé', () => {
  const React = require('react') as typeof import('react');
  const renderer =
    require('react-test-renderer') as typeof import('react-test-renderer');

  afterEach(() => resetVeille());

  it('elle prend la veille en s’ouvrant, la rend en se fermant', () => {
    const {
      ClientTour,
    } = require('../src/components/ClientTour') as typeof import('../src/components/ClientTour');
    let t!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      t = renderer.create(<ClientTour visible={false} onClose={() => {}} />);
    });
    expect(veilleTenue()).toBe(0);
    renderer.act(() => {
      t.update(<ClientTour visible onClose={() => {}} />);
    });
    expect(veilleTenue()).toBe(1);
    renderer.act(() => {
      t.update(<ClientTour visible={false} onClose={() => {}} />);
    });
    expect(veilleTenue()).toBe(0);
  });

  it('et un démontage en pleine visite la rend aussi', () => {
    /*
      On quitte l'écran du plan pendant la présentation — un appel entrant,
      un retour arrière. Sans ce nettoyage, la veille reste prise pour le
      restant de la session.
    */
    const {
      ClientTour,
    } = require('../src/components/ClientTour') as typeof import('../src/components/ClientTour');
    let t!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      t = renderer.create(<ClientTour visible onClose={() => {}} />);
    });
    expect(veilleTenue()).toBe(1);
    renderer.act(() => t.unmount());
    expect(veilleTenue()).toBe(0);
  });
});

describe('elle se lance d’un geste, et elle sait qu’il fait nuit', () => {
  const lire = (rel: string) => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(__dirname, '..', ...rel.split('/')), 'utf8');
  };

  it('une pastille de la barre 3D la lance : plus besoin d’aller à l’export', () => {
    const barre = lire('src/screens/result/ResultToolbar.tsx');
    expect(barre).toContain('onVisite');
    expect(barre).toMatch(/label="Visite"/);
    // Et l'écran la branche.
    expect(lire('src/screens/ResultScreen.tsx')).toContain('onVisite=');
  });

  it('la visite hérite de la nuit : l’installation se montre allumée', () => {
    expect(lire('src/components/ClientTour.tsx')).toContain('nuit');
    expect(lire('src/screens/ResultScreen.tsx')).toMatch(
      /<ClientTour[\s\S]{0,200}nuit=\{nuit\}/,
    );
  });
});
