/**
 * UNE COTE TAPÉE SE LIT COMME ON LA DIT, ET SE REFUSE À VOIX HAUTE.
 *
 * Tournée d'utilisateurs n°4 :
 * - « Bernard » tape « 3m40 » : la pièce fait 3,00 m ; « 2m15 » : sa porte
 *   monte à 20 cm ; une corniche à « 2,5 » (cm) pose un ruban fermé de
 *   7,60 m au milieu de sa cuisine ; « Centrer » sort le ruban de la pièce.
 * - « Inès » tape « 410 » dans « Cotes » : un séjour de 311 m² ; « 19 » (une
 *   virgule oubliée) dans « Sur mesure » : une salle de bains de 38 m².
 * - « Hugo » : « 12abc », « 3..6 », « 3,6,0 » passent sans un mot.
 * - « Bernard », « Mehdi », « Yasmine » : le ruban « sous les meubles hauts »
 *   prenait tout le mur le plus proche du doigt, et son retrait ne se
 *   retouchait pas.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { Text, TextInput } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  BORNES_PIECE,
  BORNES_HAUTEUR,
  fauteDeMetres,
  lireCentimetres,
  lireMetres,
  verifierMetres,
} from '../src/ui/saisieCote';
import { PromptSheet, type PromptData } from '../src/components/Sheet';
import { AddRoomSheet } from '../src/screens/result/AddRoomSheet';
import { lireCm } from '../src/components/MurNeufSheet';
import { CeilingBar } from '../src/components/CeilingBar';
import { metresSaisis } from '../src/components/ObjectBar';
import { light } from '../src/theme';
import { getStyles } from '../src/screens/result/styles';
import {
  longueurDuRuban,
  rubanPeripherique,
  rubanSousLesMeubles,
} from '../src/geometry/ruban';
import { roomParts, type WallSeg } from '../src/geometry/floorplan';
import { useScanStore } from '../src/store/scanStore';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const st = () => useScanStore.getState();
const textes = (t: TestRenderer.ReactTestRenderer) =>
  t.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).join(''))
    .join(' | ');
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) =>
  t.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityLabel === label)[0];

describe('la lecture commune', () => {
  it('lit les cotes du chantier, en mètres', () => {
    expect(lireMetres('3,40')).toBeCloseTo(3.4, 9);
    expect(lireMetres('3.40')).toBeCloseTo(3.4, 9);
    expect(lireMetres('3m40')).toBeCloseTo(3.4, 9);
    expect(lireMetres('3 m 40')).toBeCloseTo(3.4, 9);
    expect(lireMetres('340 cm')).toBeCloseTo(3.4, 9);
    expect(lireMetres('3,40 m')).toBeCloseTo(3.4, 9);
  });

  it('refuse ce qu’elle ne comprend pas', () => {
    for (const t of ['12abc', '3..6', '3,6,0', '4,,10', '4 10', 'abc', '', '-3']) {
      expect(lireMetres(t)).toBeNull();
    }
    // Zéro n'est une cote que là où on le demande (une allège au sol).
    expect(lireMetres('0')).toBeNull();
    expect(lireMetres('0', { zero: true })).toBe(0);
  });

  it('lit les centimètres, et « 2m15 » comme une porte de 2,15 m', () => {
    expect(lireCentimetres('2m15')).toBeCloseTo(2.15, 9);
    expect(lireCentimetres('1m20')).toBeCloseTo(1.2, 9);
    expect(lireCentimetres('90')).toBeCloseTo(0.9, 9);
    expect(lireCentimetres('0,90')).toBeCloseTo(0.9, 9);
    expect(lireCentimetres('83,5')).toBeCloseTo(0.835, 9);
    // Le champ de la feuille des cotes de menuiserie lit pareil.
    expect(lireCm('2m15')).toBeCloseTo(2.15, 9);
    // Pour un retrait de ruban, « 2,5 », ce sont des centimètres.
    expect(lireCentimetres('2,5', { seuilMetres: 1 })).toBeCloseTo(0.025, 9);
    expect(lireCentimetres('0,5', { seuilMetres: 1 })).toBeCloseTo(0.5, 9);
  });

  it('un meuble se cote aussi en « 1m60 »', () => {
    expect(metresSaisis('1m60')).toBeCloseTo(1.6, 9);
    expect(metresSaisis('160')).toBeCloseTo(1.6, 9);
  });
});

describe('la faute d’une cote de pièce', () => {
  it('reconnaît les centimètres et les virgules oubliées', () => {
    expect(fauteDeMetres('410', 'Largeur', BORNES_PIECE)?.proposition).toBe('4,10');
    expect(fauteDeMetres('41', 'Largeur', BORNES_PIECE)?.proposition).toBe('4,10');
    expect(fauteDeMetres('3600', 'Largeur', BORNES_PIECE)?.proposition).toBe('3,60');
    expect(fauteDeMetres('600', 'Largeur', BORNES_PIECE)?.message).toMatch(/Vouliez-vous dire 6,00 m/);
  });

  it('fait confirmer une cote hors du commun, sans la refuser', () => {
    const f = fauteDeMetres('19', 'Profondeur', BORNES_PIECE)!;
    expect(f.douteuse).toBe(true);
    expect(f.proposition).toBe('1,90');
    expect(f.message).toMatch(/Validez encore pour garder 19,00 m/);
  });

  it('laisse passer une cote juste', () => {
    expect(fauteDeMetres('3,40', 'Largeur', BORNES_PIECE)).toBeNull();
    expect(fauteDeMetres('3m40', 'Largeur', BORNES_PIECE)).toBeNull();
  });

  /* Revue « Hugo » : des saisies absurdes, des messages justes. */
  it('« 0 » est trop peu, pas illisible ; « 999 » de hauteur ne propose pas un plafond à 1 m', () => {
    expect(fauteDeMetres('0', 'Largeur', BORNES_PIECE)?.message).toBe('Largeur : 0,00 m, c\'est trop peu pour une pièce.');
    const h = fauteDeMetres('999', 'Hauteur', BORNES_HAUTEUR)!;
    expect(h.proposition).toBeUndefined();
    expect(h.message).toBe('Hauteur : 999,00 m, c\'est trop pour une hauteur sous plafond.');
    // 250 tapé en centimètres, lui, se reconnaît.
    expect(fauteDeMetres('250', 'Hauteur', BORNES_HAUTEUR)?.proposition).toBe('2,50');
    const bas = fauteDeMetres('0,5', 'Hauteur', BORNES_HAUTEUR)!;
    expect(bas.douteuse).toBe(true);
    expect(bas.message).toMatch(/0,50 m, c'est inhabituel pour une hauteur sous plafond/);
    expect(fauteDeMetres('2,50', 'Hauteur', BORNES_HAUTEUR)).toBeNull();
  });

  it('dit ce qui ne se lit pas', () => {
    expect(fauteDeMetres('12abc', 'Largeur', BORNES_PIECE)?.message).toMatch(/ne se lit pas/);
  });
});

/*
  LA FEUILLE DE SAISIE GARDE UNE COTE FAUSSE — et propose la bonne à un
  appui. C'est le chemin de « Cotes », « Longueur du mur », « Hauteur »…
*/
describe('la feuille de saisie vérifie avant de fermer', () => {
  const Cadre = ({ data }: { data: PromptData }) => {
    const [vu, setVu] = React.useState<PromptData | null>(data);
    return <PromptSheet data={vu} onClose={() => setVu(null)} />;
  };
  const monter = (rendu: (v: string) => void) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <Cadre
          data={{
            title: 'Largeur',
            value: '5,20',
            unit: 'm',
            numeric: true,
            verifier: verifierMetres('Largeur', BORNES_PIECE),
            onSubmit: rendu,
          }}
        />,
      );
    });
    return t;
  };
  const valider = (t: TestRenderer.ReactTestRenderer, texte: string) => {
    const champ = t.root.findByType(TextInput);
    act(() => champ.props.onChangeText(texte));
    act(() => champ.props.onSubmitEditing());
    act(() => {
      jest.advanceTimersByTime(400);
    });
  };

  it('« 410 » ne pose rien, et « Utiliser 4,10 » pose 4,10', () => {
    const vus: string[] = [];
    const t = monter((v) => vus.push(v));
    valider(t, '410');
    expect(vus).toEqual([]);
    expect(textes(t)).toMatch(/Vouliez-vous dire 4,10 m/);
    act(() => bouton(t, 'Utiliser 4,10').props.onPress());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual(['4,10']);
    act(() => t.unmount());
  });

  it('une cote douteuse passe à la seconde validation', () => {
    const vus: string[] = [];
    const t = monter((v) => vus.push(v));
    valider(t, '19');
    expect(vus).toEqual([]);
    const champ = t.root.findByType(TextInput);
    act(() => champ.props.onSubmitEditing());
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(vus).toEqual(['19']);
    act(() => t.unmount());
  });

  it('une cote juste passe du premier coup', () => {
    const vus: string[] = [];
    const t = monter((v) => vus.push(v));
    valider(t, '3m40');
    expect(vus).toEqual(['3m40']);
    act(() => t.unmount());
  });
});

describe('« Ajouter une pièce » sur mesure', () => {
  const monter = (onChoose: jest.Mock, visible = true) => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <AddRoomSheet visible={visible} accolee={false} planVide onClose={() => {}} onChoose={onChoose} />,
      );
    });
    return t;
  };

  it('lit « 3m40 », et propose 1,90 pour « 19 »', () => {
    const choisi = jest.fn();
    const t = monter(choisi);
    act(() => bouton(t, 'Sur mesure').props.onPress());
    const champs = t.root.findAllByType(TextInput);
    act(() => champs[0].props.onChangeText('3m40'));
    act(() => champs[1].props.onChangeText('19'));
    act(() => bouton(t, 'Ajouter la pièce').props.onPress());
    expect(choisi).not.toHaveBeenCalled();
    expect(textes(t)).toMatch(/Vouliez-vous dire 1,90 m/);
    act(() => bouton(t, 'Utiliser 1,90 m').props.onPress());
    expect(choisi).toHaveBeenCalledWith(3.4, 1.9, '');
    act(() => t.unmount());
  });

  it('repart à vide à chaque ouverture', () => {
    const choisi = jest.fn();
    const t = monter(choisi);
    act(() => bouton(t, 'Sur mesure').props.onPress());
    let champs = t.root.findAllByType(TextInput);
    act(() => champs[0].props.onChangeText('3,20'));
    act(() => champs[1].props.onChangeText('5,20'));
    act(() =>
      t.update(<AddRoomSheet visible={false} accolee={false} planVide onClose={() => {}} onChoose={choisi} />),
    );
    act(() => t.update(<AddRoomSheet visible accolee={false} planVide onClose={() => {}} onChoose={choisi} />));
    act(() => bouton(t, 'Sur mesure').props.onPress());
    champs = t.root.findAllByType(TextInput);
    expect(champs[0].props.value).toBe('');
    expect(champs[1].props.value).toBe('');
    act(() => t.unmount());
  });
});

describe('le ruban LED', () => {
  // La cuisine de Bernard, au nu : 3,40 × 2,80.
  const cuisine = [
    { x: 0, z: 0 },
    { x: 3.4, z: 0 },
    { x: 3.4, z: 2.8 },
    { x: 0, z: 2.8 },
  ];

  it('une corniche qui mange la pièce ne se pose pas', () => {
    // 2,50 m dans 3,40 × 2,80 : retourné dans les deux sens, l'aire gardait son signe.
    expect(rubanPeripherique(cuisine, 2.5)).toBeNull();
    expect(rubanPeripherique(cuisine, 4.5)).toBeNull();
    expect(rubanPeripherique(cuisine, 1.5)).toBeNull();
    const juste = rubanPeripherique(cuisine, 0.1)!;
    expect(longueurDuRuban(juste, true)).toBeCloseTo(11.6, 9);
  });

  it('court sous les meubles hauts, de leur premier bord au dernier', () => {
    // Deux meubles hauts de 80 et un de 40 contre le mur du fond (z = 2,8), de x = 0,6 à 2,6.
    const meubles = [
      { cx: 1.0, cz: 2.625, width: 0.8, depth: 0.35, yaw: 0 },
      { cx: 1.8, cz: 2.625, width: 0.8, depth: 0.35, yaw: 0 },
      { cx: 2.4, cz: 2.625, width: 0.4, depth: 0.35, yaw: Math.PI },
    ];
    // Touché au milieu de la pièce : c'est quand même le mur des meubles.
    const t = rubanSousLesMeubles(cuisine, meubles, { x: 1.7, z: 1.4 })!;
    expect(t).toHaveLength(2);
    expect(longueurDuRuban(t)).toBeCloseTo(2.0, 6);
    const xs = t.map((p) => p.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0.6, 6);
    expect(xs[1]).toBeCloseTo(2.6, 6);
    // Sous leur face avant, 5 cm en retrait.
    expect(t[0].z).toBeCloseTo(2.8 - 0.3, 6);
  });

  it('sans meuble haut contre un mur, rien', () => {
    expect(rubanSousLesMeubles(cuisine, [], { x: 1, z: 1 })).toBeNull();
    // Un meuble au milieu de la pièce n'est adossé à rien.
    expect(rubanSousLesMeubles(cuisine, [{ cx: 1.7, cz: 1.4, width: 0.8, depth: 0.35, yaw: 0 }], { x: 1, z: 1 })).toBeNull();
  });

  it('un ruban fermé se retrace à un autre retrait, sous un seul « Annuler »', () => {
    st().commencerAuClavier();
    st().addRoomLibre(5, 4, 'Séjour', { auNu: true });
    const part = roomParts(st().walls, st().rooms)[0];
    const contour = part.surface!.nu ?? part.surface!.pts;
    const id = st().addRuban(st().rooms[0].id, rubanPeripherique(contour, 0.5)!, true, 0.5)!;
    expect(st().ceiling.find((c) => c.id === id)!.retrait).toBe(0.5);
    st().retracerRuban(id, rubanPeripherique(contour, 0.4)!, 0.4);
    const cl = st().ceiling.find((c) => c.id === id)!;
    expect(cl.retrait).toBe(0.4);
    expect(longueurDuRuban(cl.trace!, true)).toBeCloseTo(2 * (4.2 + 3.2), 6);
    st().undo();
    expect(st().ceiling.find((c) => c.id === id)!.retrait).toBe(0.5);
  });
});

describe('le bandeau d’un ruban', () => {
  const styles = getStyles(light) as unknown as Record<string, object>;
  const MURS = [
    { a: { x: 0, z: 0 }, b: { x: 5, z: 0 } },
    { a: { x: 5, z: 0 }, b: { x: 5, z: 4 } },
    { a: { x: 5, z: 4 }, b: { x: 0, z: 4 } },
    { a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
  ].map((m, i) => ({ id: `w${i}`, ...m, type: 'wall', height: 2.5, yCenter: 1.25 }) as unknown as WallSeg);
  const trace = rubanPeripherique(
    [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 4 },
      { x: 0, z: 4 },
    ],
    0.5,
  )!;

  it('n’a ni « Centrer » ni distances aux murs, mais son retrait', () => {
    const prompts: PromptData[] = [];
    const changes: number[] = [];
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(
        <CeilingBar
          fixture={{ id: 'l1', kind: 'led', roomId: 'r1', at: trace[0], trace, ferme: true, retrait: 0.5 }}
          walls={MURS}
          trame={0}
          centre={null}
          styles={styles}
          palette={light}
          onMove={() => {}}
          onPrompt={(p) => p && prompts.push(p)}
          onRetrait={{ actuel: 0.5, changer: (m) => changes.push(m) }}
          onRemove={() => {}}
          onDone={() => {}}
        />,
      );
    });
    expect(bouton(t, 'Centrer dans la pièce')).toBeUndefined();
    expect(bouton(t, 'Distance au mur de gauche')).toBeUndefined();
    expect(textes(t)).toContain('Retrait 50');
    act(() => bouton(t, 'Retrait du ruban').props.onPress());
    expect(prompts[0].title).toBe('Retrait du ruban');
    // « 2,5 », ce sont des centimètres ; « 40 », 40 cm.
    expect(prompts[0].verifier?.('2,5')).toBeNull();
    prompts[0].onSubmit('40');
    expect(changes[0]).toBeCloseTo(0.4, 9);
    act(() => t.unmount());
  });
});
