/**
 * PERCER UN MUR, EN DEUX GESTES ET PAS EN CINQ.
 *
 * Releve de chantier : « j'ai essaye de creer une ouverture sur un mur, ca
 * devrait proposer directement si on veut une porte, une fenetre, etc. avec
 * un beau pop-up image ».
 *
 * Le bouton « Ouvrir » du menu du mur posait une BAIE, toujours. Pour
 * obtenir une porte il fallait ensuite selectionner l'ouverture, ouvrir son
 * bandeau, entrer dans « Reglages de la menuiserie », declarer la nature,
 * puis corriger la largeur et la hauteur : cinq gestes, et un plan couvert
 * de trous entre-temps.
 *
 * Ce banc suit le parcours ENTIER, depuis l'ecran : on touche « Ouvrir »,
 * la feuille de choix s'ouvre, on touche « Porte », et c'est une porte aux
 * cotes d'une porte qui se pose sur le mur vise.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Pressable } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChoixOuverture } from '../src/components/ChoixOuverture';
import { COTES_MENUISERIE, useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

/**
 * Les choix, cherches par leur ETIQUETTE PARLEE — celle que lit la
 * synthese vocale, et la seule chose qu'un banc ait le droit de connaitre
 * d'un dessin.
 */
const choix = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityRole === 'button' &&
        n.props.accessibilityLabel !== 'Fermer',
    )
    .map((n) => n.props as { accessibilityLabel: string; onPress: () => void })
    // Un meme bouton apparait plusieurs fois dans l'arbre d'essai (le
    // composant, puis son noeud d'affichage) : on garde un choix par
    // etiquette, dans l'ordre ou la feuille les propose.
    .filter(
      (p, i, tous) =>
        tous.findIndex((q) => q.accessibilityLabel === p.accessibilityLabel) === i,
    );

/*
  LA FEUILLE SE FERME VRAIMENT.

  Premiere ecriture de ce banc : `onClose={() => {}}`. La feuille restait
  donc a l'ecran, `onClosed` n'arrivait jamais, et le choix — qui attend
  expressement la descente — ne partait pas. Le banc « prouvait » qu'aucune
  menuiserie ne se posait, alors que rien n'avait ete joue. On monte donc la
  feuille comme l'ecran la monte : avec l'etat qui la referme.
*/
const Cadre = ({
  onChoisir,
}: {
  onChoisir: (n: 'door' | 'window' | 'opening') => void;
}) => {
  const [ouverte, setOuverte] = React.useState(true);
  return (
    <ChoixOuverture
      visible={ouverte}
      onClose={() => setOuverte(false)}
      onChoisir={onChoisir}
    />
  );
};

const monter = (onChoisir: (n: 'door' | 'window' | 'opening') => void) => {
  let t!: TestRenderer.ReactTestRenderer;
  act(() => {
    t = TestRenderer.create(<Cadre onChoisir={onChoisir} />);
  });
  return t;
};

describe('la feuille « qu’est-ce qu’on perce ? »', () => {
  it('offre les trois natures, chacune avec sa cote', () => {
    const t = monter(() => {});
    const mots = choix(t).map((c) => c.accessibilityLabel);
    expect(mots).toHaveLength(3);
    expect(mots.join(' | ')).toMatch(/Porte/);
    expect(mots.join(' | ')).toMatch(/Fenêtre/);
    expect(mots.join(' | ')).toMatch(/Baie libre/);
    // La cote de depart est DITE, pas seulement dessinee : elle sera posee
    // telle quelle, et c'est ce qu'on corrige ensuite au bandeau.
    expect(mots.find((m) => m.startsWith('Porte'))).toContain('83');
    expect(mots.find((m) => m.startsWith('Fenêtre'))).toContain('allège 95');
    act(() => t.unmount());
  });

  it.each([
    ['Porte', 'door'],
    ['Fenêtre', 'window'],
    ['Baie libre', 'opening'],
  ])('rend « %s » a l’ecran, une fois la feuille partie', (mot, nature) => {
    const vus: string[] = [];
    const t = monter((n) => vus.push(n));
    const c = choix(t).find((x) => x.accessibilityLabel.startsWith(mot))!;
    act(() => c.onPress());
    // Le choix voyage APRES la fermeture (iOS ne presente qu'une fenetre
    // modale a la fois) : on laisse la descente se jouer.
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual([nature]);
    act(() => t.unmount());
  });

  /*
    LE CONTROLE EN SENS INVERSE : sans lui, une feuille qui appellerait
    `onChoisir` toute seule — au montage, par exemple — passerait pour juste.
  */
  it('ne pose rien tant que personne n’a touche', () => {
    const vus: string[] = [];
    const t = monter((n) => vus.push(n));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual([]);
    act(() => t.unmount());
  });

  it('a bien un dessin par choix, et pas trois fois le meme', () => {
    // Une icone repetee n'informe pas : elle decore. Chaque vignette porte
    // donc son propre trace.
    const t = monter(() => {});
    const traces = t.root
      .findAllByType(Pressable)
      .filter((n) => typeof n.props.accessibilityLabel === 'string')
      .map((n) => JSON.stringify(n.props.children));
    expect(new Set(traces).size).toBe(traces.length);
    act(() => t.unmount());
  });
});

describe('les cotes posees', () => {
  it('sont celles du batiment courant, pas une fraction du mur', () => {
    // Le catalogue est la source unique : la feuille l'affiche, le store le
    // pose. Deux listes se seraient contredites au premier changement.
    expect(COTES_MENUISERIE.door.largeur).toBeCloseTo(0.83, 2);
    expect(COTES_MENUISERIE.window.allege).toBeCloseTo(0.95, 2);
    expect(COTES_MENUISERIE.opening.allege).toBeCloseTo(0, 3);
  });

  it('arrivent vraiment au plan quand la feuille rend son choix', () => {
    useScanStore.setState({
      walls: [
        {
          id: 'm1',
          type: 'wall',
          a: { x: 0, z: 0 },
          b: { x: 4, z: 0 },
          height: 2.5,
          yCenter: 1.25,
          roomId: 'r1',
        },
      ],
      openings: [],
    });
    const t = monter((n) => useScanStore.getState().addOpening('m1', n));
    const porte = choix(t).find((c) => c.accessibilityLabel.startsWith('Porte'))!;
    act(() => porte.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const o = useScanStore.getState().openings[0];
    expect(o.type).toBe('door');
    expect(Math.hypot(o.b.x - o.a.x, o.b.z - o.a.z)).toBeCloseTo(0.83, 2);
    act(() => t.unmount());
  });
});
