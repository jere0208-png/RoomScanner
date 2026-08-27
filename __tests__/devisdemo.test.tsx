/**
 * COMMENT ON COMPTE — l'explication, jouée plutôt qu'écrite.
 *
 * Releve du patron, sur la deuxieme page du devis : « on ne comprend pas bien
 * pour ce qui est compte. Mets juste une mention "l'eclairage n'est pas compte
 * dans ce devis, il differe des gouts" ou quelque chose de mieux dit. Fais sur
 * cette deuxieme page un tuto/animation en bounce et pops modernes : un TGBT
 * apparait, un inter et un eclairage aussi, un trace de tableau a inter et
 * tableau a l'eclairage, avec un metre de gaine qui augmente au fil de
 * l'animation. On liste au fur et a mesure sous forme de ticket avec les
 * images qu'on a recuperees, le nom, le prix. L'utilisateur doit comprendre
 * qu'on compte selon les metres, le materiel, etc. Ca doit etre dynamique et
 * moderne comme un jeu. »
 *
 * LA PAGE DISAIT CE QU'ELLE NE COMPTAIT PAS, et c'etait l'erreur. Trois tirets
 * — luminaires, main-d'oeuvre, chutes — repondaient a une question que
 * personne ne se pose devant un devis qu'il n'a pas encore vu.
 *
 * CE QUE CE BANC PEUT TENIR, ET CE QU'IL NE PEUT PAS. Le rebond, le rythme,
 * le trait qui avance : ca se regarde sur un telephone, et je ne peux pas le
 * voir d'ici. Ce qui se verifie, c'est la MATIERE : que le ticket se remplisse
 * dans l'ordre annonce, que le compteur monte avec le trace, que les prix
 * soient CEUX DU CATALOGUE et non des chiffres d'exemple, et que le luminaire
 * n'y figure jamais.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Image, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { DevisDemo } from '../src/components/DevisDemo';
import { GAMMES, TARIFS_COMMUNS, TARIFS_MECANISME } from '../src/geometry/prix';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
});

const mots = (t: TestRenderer.ReactTestRenderer): string[] =>
  t.root
    .findAllByType(Text)
    .map((n) =>
      (Array.isArray(n.props.children) ? n.props.children : [n.props.children])
        .filter((x: unknown) => typeof x === 'string' || typeof x === 'number')
        .join(''),
    )
    .filter((s) => s.length > 0);

const jouer = (ms: number) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<DevisDemo gamme={GAMMES[0].id} />);
  });
  act(() => {
    jest.advanceTimersByTime(ms);
  });
  arbre = t;
  return t;
};

describe('la mention', () => {
  it('dit pourquoi l’éclairage n’est pas chiffré, en une phrase', () => {
    /*
      Releve du patron : « mets juste une mention — l'eclairage n'est pas
      compte dans ce devis, il differe des gouts ». La raison compte autant
      que le fait : sans elle, on lit un oubli.
    */
    const lus = mots(jouer(0)).join(' ');
    expect(lus).toContain('luminaires ne sont pas chiffrés');
    expect(lus).toContain('neuf cents euros');
    // Et le contraire, dit aussi : ce qui les alimente EST compté.
    expect(lus).toContain('est compté');
  });
});

describe('la démonstration se joue', () => {
  it('commence par le tableau, seul', () => {
    const lus = mots(jouer(10));
    expect(lus).toContain('Coffret de répartition');
    expect(lus).not.toContain('Interrupteur');
  });

  it('puis pose l’interrupteur, puis le point lumineux', () => {
    const lus = mots(jouer(3000));
    expect(lus).toContain('Interrupteur');
    expect(lus).toContain('Boîte de centre DCL');
  });

  it('et le compteur de gaine monte pendant que le tracé avance', () => {
    /*
      C'est le coeur de la demonstration : le prix de la gaine vient d'une
      LONGUEUR, pas d'un forfait par appareil. On le montre en faisant monter
      le compteur en meme temps que le trait.
    */
    const t = jouer(10);
    const debut = mots(t).find((m) => m.endsWith(' m'));
    act(() => {
      jest.advanceTimersByTime(2600);
    });
    const apres = mots(t).find((m) => m.endsWith(' m'));
    const val = (s?: string) => Number((s ?? '0').replace(' m', '').replace(',', '.'));
    expect(val(apres)).toBeGreaterThan(val(debut));
  });

  it('et le ticket finit par les quatre conducteurs d’un éclairage', () => {
    // Phase, neutre, terre, retour de lampe : c'est ce qui distingue un
    // circuit d'eclairage d'une simple alimentation.
    const lus = mots(jouer(6000)).join(' ');
    expect(lus).toContain('Conducteur H07V-U 1,5 mm²');
    expect(lus).toContain('phase, neutre, terre, retour de lampe');
  });

  it('mais JAMAIS de luminaire au ticket', () => {
    /*
      Le controle en sens inverse de la mention. Une demonstration qui
      chiffrerait la lampe dirait le contraire de la phrase posee juste
      au-dessus d'elle.
    */
    const lus = mots(jouer(6000)).join(' ');
    expect(lus).toContain('Boîte de centre DCL');
    expect(lus).not.toContain('Suspension');
    expect(lus).not.toContain('Luminaire —');
  });

  it('et chaque ligne porte sa photo', () => {
    // « sous forme de ticket avec les images qu'on a recuperees » : les memes
    // vignettes que le devis, pas des icones dessinees pour l'occasion.
    const t = jouer(6000);
    expect(t.root.findAllByType(Image).length).toBeGreaterThanOrEqual(4);
  });
});

describe('les prix sont ceux du catalogue', () => {
  it('et non des chiffres d’exemple', () => {
    /*
      Un exemple qui inventerait ses chiffres serait une publicite. Celui-ci
      est le devis, en plus petit : si le catalogue change, la demonstration
      change avec lui.
    */
    const lus = mots(jouer(10)).join(' ');
    const coffret = TARIFS_COMMUNS['coffret-1'].pu;
    expect(lus).toContain(`${coffret.toFixed(2).replace('.', ',')} €`);
  });

  it('et ils suivent la gamme choisie', () => {
    // Le controle en sens inverse : deux gammes, deux prix d'interrupteur.
    const prix = (g: (typeof GAMMES)[number]['id']) => {
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        t = TestRenderer.create(<DevisDemo gamme={g} />);
      });
      act(() => {
        jest.advanceTimersByTime(1200);
      });
      const lus = mots(t);
      act(() => t.unmount());
      return lus;
    };
    const attendu = (g: (typeof GAMMES)[number]['id']) =>
      `${TARIFS_MECANISME[g].inter!.pu.toFixed(2).replace('.', ',')} €`;
    expect(prix('celiane').join(' ')).toContain(attendu('celiane'));
    expect(prix('dooxie').join(' ')).toContain(attendu('dooxie'));
    expect(attendu('celiane')).not.toBe(attendu('dooxie'));
  });
});

describe('on peut la revoir', () => {
  it('et elle repart de zéro', () => {
    // Une demonstration qu'on ne peut pas revoir se regarde une fois, mal.
    const t = jouer(6000);
    expect(mots(t)).toContain('Conducteur H07V-U 1,5 mm²');
    const revoir = t.root
      .findAll(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          String(n.props?.accessibilityLabel ?? '').startsWith('Revoir'),
      )
      .pop()!;
    act(() => revoir.props.onPress());
    act(() => {
      jest.advanceTimersByTime(10);
    });
    const lus = mots(t);
    expect(lus).toContain('Coffret de répartition');
    expect(lus).not.toContain('Conducteur H07V-U 1,5 mm²');
  });
});
