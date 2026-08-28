/**
 * LES COURONNES DE FIL PRENNENT LA COULEUR DE LEUR CONDUCTEUR.
 *
 * Relevé du patron : « la couleur des fils en image doit changer sur le devis,
 * on a que du bleu partout là ».
 *
 * POURQUOI TOUT ÉTAIT BLEU. Le bordereau distingue les conducteurs par leur
 * RÔLE — `fil-1.5-phase`, `fil-1.5-neutre`, `fil-1.5-terre` — parce qu'on
 * achète une couronne par couleur. La vignette, elle, retombait sur la SECTION
 * (`fil-1.5`) et servait la même photo à tout le monde : une bobine bleue, pour
 * la phase comme pour la terre. Le ticket alignait quatre lignes qui ne
 * différaient que par leur libellé, là où la couleur est justement ce qu'on
 * regarde en rayon.
 *
 * ET LE REPLI SUR LA SECTION ÉTAIT UN CORRECTIF, PAS UNE FAUTE. Le jour où le
 * fil s'est mis à sortir couleur par couleur, toutes les vignettes de fil
 * avaient disparu du ticket d'un coup : elles étaient rangées à `fil-1.5`, et
 * plus personne ne demandait ce code-là. On avait rendu une image à ces
 * lignes ; il restait à lui donner la bonne.
 *
 * ON NE VA PAS CHERCHER QUATRE PHOTOS. Les couleurs de conducteur sont
 * NORMÉES — rouge, bleu, vert/jaune, orange, violet — et l'application les
 * connaît déjà : c'est `WIRE_COLORS`, la table que lisent le schéma unifilaire
 * et le tracé des fils. La couronne se DESSINE dans cette teinte-là. Une
 * cinquième table de couleurs de fil, c'est un plan qui dit rouge devant un
 * ticket qui montre bleu.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { VignetteProduit } from '../src/components/VignetteProduit';
import { WIRE_COLORS, roleDuFil, type WireRole } from '../src/geometry/schema';
import { photoDe } from '../src/ui/produits';

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const monter = (code: string, libelle = 'Conducteur') => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<VignetteProduit code={code} libelle={libelle} />);
  });
  arbre = t;
  return t;
};

/** Les teintes posées par la vignette, traits et remplissages confondus. */
const teintes = (t: TestRenderer.ReactTestRenderer) => {
  const out: string[] = [];
  for (const n of [...t.root.findAllByType(Circle), ...t.root.findAllByType(Path)]) {
    for (const cle of ['stroke', 'fill'] as const) {
      const v = n.props[cle];
      if (typeof v === 'string' && v !== 'none') out.push(v);
    }
  }
  return out;
};

describe('le code d’une ligne de fil dit son rôle', () => {
  it('phase, neutre, terre, navette, retour', () => {
    const attendus: [string, WireRole][] = [
      ['fil-1.5-phase', 'phase'],
      ['fil-2.5-neutre', 'neutre'],
      ['fil-6-terre', 'terre'],
      ['fil-1.5-navette', 'navette'],
      ['fil-1.5-retour', 'retour'],
    ];
    for (const [code, role] of attendus) {
      expect(`${code} → ${roleDuFil(code)}`).toBe(`${code} → ${role}`);
    }
  });

  it('mais une couronne du magasin n’en a pas', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE. Le magasin vend des couronnes sans rôle —
      « fil-4 », « fil-16 » : on achète du fil, on décide de sa couleur au
      moment de tirer. Une lecture trop gourmande leur inventerait un rôle et
      les repeindrait au hasard de leur section.
    */
    expect(roleDuFil('fil-4')).toBeNull();
    expect(roleDuFil('fil-16')).toBeNull();
  });

  it('et un article qui n’est pas un fil non plus', () => {
    expect(roleDuFil('icta-20')).toBeNull();
    expect(roleDuFil('meca-prise')).toBeNull();
  });
});

describe('la vignette d’un conducteur porte sa couleur', () => {
  it('la phase est rouge, et c’est le rouge de la norme', () => {
    expect(teintes(monter('fil-1.5-phase'))).toContain(WIRE_COLORS.phase.color);
  });

  it('chaque rôle a la sienne, et deux rôles n’ont jamais la même', () => {
    /*
      LE CŒUR DU RELEVÉ : « on a que du bleu partout ». Cinq lignes de fil sur
      un ticket, cinq teintes différentes — sans quoi la vignette n'apprend
      rien que le libellé ne dise déjà.
    */
    const vues = new Map<WireRole, string[]>();
    for (const role of Object.keys(WIRE_COLORS) as WireRole[]) {
      const t = monter(`fil-2.5-${role}`);
      vues.set(role, teintes(t));
      act(() => arbre?.unmount());
      arbre = null;
    }
    for (const [role, lues] of vues) {
      expect(`${role} : ${lues.includes(WIRE_COLORS[role].color)}`).toBe(
        `${role} : true`,
      );
      // Et pas celle d'un autre : une teinte posée sur toutes les couronnes
      // ferait passer l'épreuve du dessus sans rien changer à l'écran.
      for (const [autre, teinte] of Object.entries(WIRE_COLORS)) {
        if (autre === role) continue;
        expect(`${role} ≠ ${autre} : ${lues.includes(teinte.color)}`).toBe(
          `${role} ≠ ${autre} : false`,
        );
      }
    }
  });

  it('et elle est DESSINÉE, pas photographiée', () => {
    /*
      Une photo de bobine ne peut pas changer de couleur, et l'on n'ira pas en
      chercher cinq par section : les couleurs de conducteur sont normées, donc
      elles se dessinent.
    */
    const t = monter('fil-1.5-terre');
    expect(t.root.findAllByType(Image)).toHaveLength(0);
    expect(teintes(t).length).toBeGreaterThan(0);
  });
});

describe('ce qui n’est pas un conducteur ne change pas', () => {
  it('une couronne du magasin garde sa photo', () => {
    /*
      LE CONTRÔLE EN SENS INVERSE de tout ce banc : si la couronne dessinée
      remplaçait TOUTE image de fil, on aurait perdu les photos du magasin —
      et personne ne s'en apercevrait avant de regarder l'écran.
    */
    expect(photoDe('fil-2.5')).not.toBeNull();
    expect(monter('fil-2.5', 'Fil 2,5 mm²').root.findAllByType(Image).length).toBe(
      1,
    );
  });

  it('et une gaine aussi', () => {
    expect(monter('icta-20', 'Gaine ICTA').root.findAllByType(Image).length).toBe(
      1,
    );
  });
});
