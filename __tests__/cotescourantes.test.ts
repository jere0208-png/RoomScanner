/**
 * LES COTES QU'ON NE DEVRAIT PAS AVOIR A TAPER.
 *
 * Releve du patron, apres la feuille de choix des ouvertures : « optimise
 * des choses qui pourraient prendre plus en facilite et moins de temps,
 * comme cet ajout ».
 *
 * Le gisement qui restait, c'est le CLAVIER. Toutes les cotes de
 * l'application passent par une meme feuille de saisie : hauteur sous
 * plafond, hauteur d'un mur, largeur et hauteur d'une menuiserie, allege,
 * position sur le mur. A chaque fois, un champ vide-ish, un clavier
 * numerique, une virgule a placer — sur un chantier, d'une main, avec des
 * gants.
 *
 * Or la moitie de ces cotes ne sont pas des mesures : ce sont des VALEURS DE
 * CATALOGUE. Un passage de porte fait 63, 73, 83 ou 93. Une allege de
 * fenetre est a 95, ou a 110 au-dessus d'un plan de travail. Un plafond fait
 * 2,50, et 2,70 dans l'ancien. Les taper, c'est retaper ce que tout le
 * monde sait.
 *
 * LA VALEUR DE POSE EST TOUJOURS DANS LA LISTE. C'est ce que ce banc garde
 * le plus jalousement : `COTES_MENUISERIE` pose une porte de 83, et si 83 ne
 * figurait pas parmi les pastilles, l'application se contredirait a un
 * centimetre pres — celui qui pose une porte puis touche « Largeur » verrait
 * quatre propositions dont aucune n'est celle qu'il a sous les yeux.
 */
const mockMagasin = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockMagasin.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockMagasin.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockMagasin.delete(k);
  }),
}));

import {
  ALLEGES_COURANTES,
  HAUTEURS_SOUS_PLAFOND,
  hauteursCourantes,
  largeursCourantes,
  pastilles,
} from '../src/ui/cotesCourantes';
import { COTES_MENUISERIE } from '../src/store/scanStore';

const NATURES = ['door', 'window', 'opening'] as const;

describe('les cotes proposees', () => {
  it('contiennent toujours celle qui vient d’etre posee', () => {
    for (const n of NATURES) {
      expect(largeursCourantes(n)).toContain(COTES_MENUISERIE[n].largeur);
      expect(hauteursCourantes(n)).toContain(COTES_MENUISERIE[n].hauteur);
    }
    expect(ALLEGES_COURANTES).toContain(COTES_MENUISERIE.window.allege);
  });

  it('sont peu nombreuses : une rangee, pas un catalogue', () => {
    // Au-dela de quatre, on relit la liste au lieu de reconnaitre sa cote —
    // et la rangee deborde de l'ecran d'un telephone.
    for (const n of NATURES) {
      expect(largeursCourantes(n).length).toBeLessThanOrEqual(4);
      expect(hauteursCourantes(n).length).toBeLessThanOrEqual(4);
    }
    expect(ALLEGES_COURANTES.length).toBeLessThanOrEqual(4);
    expect(HAUTEURS_SOUS_PLAFOND.length).toBeLessThanOrEqual(4);
  });

  it('vont du plus petit au plus grand, et sans doublon', () => {
    const listes = [
      ...NATURES.map(largeursCourantes),
      ...NATURES.map(hauteursCourantes),
      ALLEGES_COURANTES,
      HAUTEURS_SOUS_PLAFOND,
    ];
    for (const l of listes) {
      expect([...l].sort((a, b) => a - b)).toEqual(l);
      expect(new Set(l).size).toBe(l.length);
    }
  });

  it('disent la nature : une porte n’a pas les largeurs d’une fenetre', () => {
    // Sans ca, une seule liste servirait pour tout, et l'on proposerait 63
    // pour une baie libre.
    expect(largeursCourantes('door')).not.toEqual(largeursCourantes('window'));
    expect(hauteursCourantes('door')).not.toEqual(hauteursCourantes('window'));
  });

  it('sont des cotes de batiment, pas des nombres ronds inventes', () => {
    // Les quatre passages du commerce, et rien d'autre.
    expect(largeursCourantes('door')).toEqual([0.63, 0.73, 0.83, 0.93]);
    // Une porte fait 204 ; 215 se rencontre dans le neuf.
    expect(hauteursCourantes('door')).toEqual([2.04, 2.15]);
    // Une allege : plain-pied, allege basse, courante, au-dessus d'un plan
    // de travail.
    expect(ALLEGES_COURANTES).toEqual([0, 0.45, 0.95, 1.1]);
  });
});

describe('les pastilles', () => {
  it('parlent en centimetres pour une menuiserie', () => {
    // « 83 », pas « 0,83 m » : c'est ainsi qu'on commande une porte, et
    // c'est trois caracteres au lieu de sept sur une pastille.
    const p = pastilles(largeursCourantes('door'), 'cm');
    expect(p.map((x) => x.label)).toEqual(['63', '73', '83', '93']);
    // La valeur, elle, reste celle du champ : des metres, avec la virgule.
    expect(p.map((x) => x.value)).toEqual(['0,63', '0,73', '0,83', '0,93']);
  });

  it('parlent en metres pour un plafond', () => {
    const p = pastilles(HAUTEURS_SOUS_PLAFOND, 'm');
    expect(p[0].label).toMatch(/^\d,\d\d$/);
    expect(p[0].label).toBe(p[0].value);
  });

  it('ecrivent zero comme une cote, pas comme un vide', () => {
    // Une porte-fenetre a une allege de zero : « 0 » doit se lire comme un
    // choix, pas comme un champ non rempli.
    expect(pastilles([0], 'cm')[0].label).toBe('0');
    expect(pastilles([0], 'cm')[0].value).toBe('0,00');
  });
});
