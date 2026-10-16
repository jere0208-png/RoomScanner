/**
 * LA LISTE D'ACHATS, ÉPURÉE — et la faïence des pièces d'eau.
 *
 * Diagnostic du patron (vidéo) : « la page de la liste trop remplie de
 * texte, peu agréable visuellement, à revoir, et texte sur bouton mal
 * centré ». Revue du designer : le choix des pièces, qui détermine tout,
 * était tout en bas ; les couleurs des cartes ne suivaient pas le thème
 * sombre. Revue du retraité bricoleur : la faïence ne se comptait qu'en
 * crédence de cuisine, et la peinture d'une salle de bains montait jusqu'au
 * plafond. Dans « Décorer », la tuile Ambiance disait « Personnalisé / e ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet, Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { RoomPart, WallSeg } from '../src/geometry/floorplan';
import {
  HYPOTHESES,
  achats,
  avecFaienceMurale,
  cleHorsTravaux,
  estPieceDEau,
  piecesRetenues,
  travauxDesPieces,
} from '../src/geometry/travaux';
import { TravauxSheet } from '../src/components/TravauxSheet';
import { useReglagesTravaux } from '../src/store/reglagesTravaux';
import { useScanStore } from '../src/store/scanStore';
import { dark, light } from '../src/theme';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

let n = 0;
const seg = (type: WallSeg['type'], ax: number, az: number, bx: number, bz: number, height: number, bas = 0): WallSeg => ({
  id: `s${n++}`,
  type,
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height,
  yCenter: bas + height / 2,
});
const piece = (id: string, x0: number, z0: number, x1: number, z1: number): RoomPart => {
  const walls = [
    seg('wall', x0, z0, x1, z0, 2.5),
    seg('wall', x1, z0, x1, z1, 2.5),
    seg('wall', x1, z1, x0, z1, 2.5),
    seg('wall', x0, z1, x0, z0, 2.5),
  ];
  const pts = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  return {
    roomId: id,
    walls,
    surface: { pts, area: (x1 - x0) * (z1 - z0), exact: true },
    centroid: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
    labelAt: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 },
  };
};

/*
  Une salle de bains de 2 × 2,5 m sous 2,50 m : 9 m de tour, 22,5 m² de
  murs bruts. Une porte de 0,80 × 2,04 au sol, une fenêtre de 0,60 × 0,60
  à 1,40 m d'allège. Et une chambre voisine, qui n'est pas une pièce d'eau.
*/
const SDB = piece('Salle de bains', 0, 0, 2, 2.5);
const CHAMBRE = piece('Chambre', 2, 0, 6, 3);
const BAIES = [seg('door', 0.5, 2.5, 1.3, 2.5, 2.04), seg('window', 0.7, 0, 1.3, 0, 0.6, 1.4)];
const nom = (id: string) => id;
const PIECES = travauxDesPieces([SDB, CHAMBRE], BAIES, nom);

const texteDe = (x: TestRenderer.ReactTestInstance): string =>
  x.children.map((e) => (typeof e === 'string' ? e : texteDe(e))).join('');
const tousLesTextes = (t: TestRenderer.ReactTestRenderer) => t.root.findAllByType(Text).map(texteDe).join(' | ');
const bouton = (t: TestRenderer.ReactTestRenderer, label: string) => {
  const b = t.root.findAll((x) => x.props?.accessibilityLabel === label && typeof x.props?.onPress === 'function', { deep: false })[0];
  expect([label, !!b]).toEqual([label, true]);
  return b;
};

let arbre: TestRenderer.ReactTestRenderer | null = null;
afterEach(() => {
  act(() => arbre?.unmount());
  arbre = null;
  act(() => {
    useReglagesTravaux.setState({ horsTravaux: [], faienceMurale: {}, avecPrix: false });
    useScanStore.setState({ themePref: 'system' });
  });
});
const monter = (pieces = PIECES) => {
  act(() => {
    useReglagesTravaux.setState({ charge: true });
    arbre = TestRenderer.create(<TravauxSheet visible onClose={() => {}} pieces={pieces} />);
  });
  return arbre!;
};

describe('la faïence murale des pièces d’eau', () => {
  it('se calcule, ouvertures déduites, à chaque hauteur — pour les seules pièces d’eau', () => {
    const [sdb, chambre] = PIECES;
    // 22,5 − porte 0,80 × 2,04 − fenêtre 0,36 = 20,508.
    expect(sdb.murs).toBeCloseTo(20.5, 6);
    expect(sdb.faienceSelon).toBeDefined();
    // 1,20 m : 10,8 − la porte sur 1,20 (0,96) ; la fenêtre est au-dessus.
    expect(sdb.faienceSelon!.h120).toBeCloseTo(9.8, 6);
    // 2 m : 18 − la porte sur 2 m (1,6) − la fenêtre entière (0,36).
    expect(sdb.faienceSelon!.h200).toBeCloseTo(16, 6);
    expect(sdb.faienceSelon!.toute).toBeCloseTo(20.5, 6);
    expect(chambre.faienceSelon).toBeUndefined();
    expect(estPieceDEau('Salle d’eau')).toBe(true);
    expect(estPieceDEau('WC')).toBe(true);
    expect(estPieceDEau('Pièce 3', 'bathroom')).toBe(true);
    expect(estPieceDEau('Séjour')).toBe(false);
  });

  it('aucune par défaut : on n’invente pas un carrelage', () => {
    const a = achats(piecesRetenues(PIECES, [], null, {}));
    expect(a.faience.surface).toBe(0);
    expect(useReglagesTravaux.getState().faienceMurale).toEqual({});
  });

  it('s’ajoute à la faïence et retire d’autant la peinture de la pièce', () => {
    const choix = { [cleHorsTravaux(null, 'Salle de bains')]: 'h200' as const };
    const avant = achats(PIECES, HYPOTHESES);
    const [sdb] = avecFaienceMurale(PIECES, choix, null);
    expect(sdb.murs).toBeCloseTo(4.5, 6);
    expect(sdb.faienceMurale).toEqual({ hauteur: 'h200', surface: 16 });
    const apres = achats(piecesRetenues(PIECES, [], null, choix), HYPOTHESES);
    expect(apres.murs.surface).toBeCloseTo(avant.murs.surface - 16, 6);
    expect(apres.murs.pots).toBeLessThan(avant.murs.pots);
    expect(apres.faience.murale).toBeCloseTo(16, 6);
    expect(apres.faience.avecChute).toBeCloseTo(17.6, 6);
    // Une teinte choisie perd sa part, elle aussi.
    const peintes = travauxDesPieces([SDB], BAIES, nom, () => ({ peinture: 'sauge' }));
    expect(avecFaienceMurale(peintes, choix, null)[0].teintes).toEqual([{ cle: 'sauge', surface: 4.5 }]);
    // Toute hauteur : plus rien à peindre.
    expect(avecFaienceMurale(PIECES, { [cleHorsTravaux(null, 'Salle de bains')]: 'toute' }, null)[0].murs).toBe(0);
  });

  it('se règle dans la feuille, par pièce, et la carte faïence apparaît', () => {
    const t = monter();
    const murs = () => texteDe(t.root.findAll((x) => x.props?.testID === 'carte-murs', { deep: false })[0]);
    expect(t.root.findAll((x) => x.props?.testID === 'carte-faience')).toHaveLength(0);
    // Pas de réglage pour la chambre.
    expect(t.root.findAll((x) => x.props?.accessibilityLabel === 'Faïence murale, Chambre : 2 m')).toHaveLength(0);
    // 20,5 + 35 m² de murs = 55,5 → 11,1 L → 5 pots.
    expect(murs()).toContain('5 pots de 2,5 L');
    act(() => bouton(t, 'Faïence murale, Salle de bains : 2 m').props.onPress());
    expect(useReglagesTravaux.getState().faienceMurale).toEqual({ [cleHorsTravaux(null, 'Salle de bains')]: 'h200' });
    // 4,5 + 35 = 39,5 m² → 7,9 L → 4 pots.
    expect(murs()).toContain('4 pots de 2,5 L');
    expect(texteDe(t.root.findAll((x) => x.props?.testID === 'carte-faience', { deep: false })[0])).toContain('17,6 m²');
    // « Aucune » la retire, et la clé s'efface.
    act(() => bouton(t, 'Faïence murale, Salle de bains : Aucune').props.onPress());
    expect(useReglagesTravaux.getState().faienceMurale).toEqual({});
  });

  it('le dossier PDF et le tableur la lisent aussi', () => {
    expect(lire('src/screens/ExportScreen.tsx').replace(/\s+/g, ' ')).toMatch(
      /piecesRetenues\( ?piecesDuDossier,.{0,120}reglages\.faienceMurale/,
    );
    expect(lire('src/screens/ResultScreen.tsx').replace(/\s+/g, ' ')).toMatch(
      /piecesRetenues\( ?piecesTravaux,.{0,120}reglages\.faienceMurale/,
    );
  });
});

describe('la feuille, épurée', () => {
  it('les pièces en haut, puis les quantités, puis l’envoi', () => {
    const t = monter();
    const ordre: string[] = [];
    const parcourir = (x: TestRenderer.ReactTestInstance) => {
      if (typeof x.type === 'string') {
        if (x.props.accessibilityRole === 'checkbox') ordre.push('piece');
        if (x.props.testID === 'carte-murs') ordre.push('quantites');
        if (x.props.accessibilityLabel === 'Envoyer ma liste') ordre.push('envoi');
      }
      for (const e of x.children) if (typeof e !== 'string') parcourir(e);
    };
    parcourir(t.root);
    const premier = (k: string) => ordre.indexOf(k);
    expect(premier('piece')).toBeGreaterThanOrEqual(0);
    expect(premier('piece')).toBeLessThan(premier('quantites'));
    expect(premier('quantites')).toBeLessThan(premier('envoi'));
    // Des puces compactes : plus de « Sol … · murs … · hauteur … » sous chaque pièce.
    expect(tousLesTextes(t)).not.toMatch(/hauteur 2,50 m/);
  });

  it('les explications sont repliées, puis visibles d’un appui', () => {
    const t = monter();
    expect(tousLesTextes(t)).not.toContain('Calculé pour 2 couches');
    expect(tousLesTextes(t)).not.toContain('portes déduites');
    const replie = bouton(t, 'Comment c’est calculé');
    expect(replie.props.accessibilityState).toEqual({ expanded: false });
    act(() => replie.props.onPress());
    const vu = tousLesTextes(t);
    expect(vu).toContain('Calculé pour 2 couches, 1 litre pour 10 m²');
    expect(vu).toContain('portes déduites');
    // Rien de perdu : la mesure de chaque pièce y est.
    expect(vu).toContain('Chambre — sol 12 m² · murs 35 m² · hauteur 2,50 m');
    expect(bouton(t, 'Comment c’est calculé').props.accessibilityState).toEqual({ expanded: true });
  });

  it('la teinte s’écrit en entier, ses pièces en dessous', () => {
    const decor: Record<string, { peinture: string }> = {
      'Salle de bains': { peinture: 'anthracite' },
      Chambre: { peinture: 'anthracite' },
    };
    const t = monter(travauxDesPieces([SDB, CHAMBRE], BAIES, nom, (id) => decor[id]));
    const bloc = t.root.findAll((x) => x.props?.testID === 'travaux-teintes', { deep: false })[0];
    const lignes = bloc.findAllByType(Text);
    const nomTeinte = lignes.find((x) => texteDe(x) === 'Anthracite')!;
    expect(nomTeinte).toBeDefined();
    // Jamais tronquée : ni limite de lignes, ni pièces collées derrière.
    expect(nomTeinte.props.numberOfLines).toBeUndefined();
    const pieces = lignes.find((x) => texteDe(x) === 'Salle de bains, Chambre')!;
    expect(pieces).toBeDefined();
    expect(pieces.props.numberOfLines).toBeUndefined();
    expect(texteDe(bloc)).not.toContain('Anthracite ·');
  });

  it('le carrelage se compte en cartons', () => {
    const t = monter();
    expect(texteDe(t.root.findAll((x) => x.props?.testID === 'carte-sol', { deep: false })[0])).toMatch(/\d+ cartons? de 2 m²/);
    expect(tousLesTextes(t)).not.toMatch(/paquets? de/);
  });

  it('« Estimer le prix » : le mot seul, centré, sans élément collé au bord', () => {
    const t = monter();
    expect(t.root.findAllByType(Switch)).toHaveLength(0);
    const prix = bouton(t, 'Estimer le prix');
    const regler = bouton(t, 'Régler le calcul');
    // Un seul texte dans chacun des deux boutons jumeaux, et le même gabarit.
    expect(prix.findAllByType(Text).map(texteDe)).toEqual(['Estimer le prix']);
    expect(regler.findAllByType(Text).map(texteDe)).toEqual(['Régler le calcul']);
    const style = (b: TestRenderer.ReactTestInstance) =>
      StyleSheet.flatten(typeof b.props.style === 'function' ? b.props.style({ pressed: false }) : b.props.style) as {
        justifyContent?: string;
        alignItems?: string;
        paddingLeft?: number;
        paddingRight?: number;
        flexDirection?: string;
      };
    expect(style(prix)).toMatchObject({ justifyContent: 'center', alignItems: 'center' });
    expect(style(prix).flexDirection ?? 'column').toBe('column');
    expect(style(prix).paddingRight).toBe(style(prix).paddingLeft);
    // L'état « prix affiché » se lit au remplissage, et le total paraît.
    act(() => prix.props.onPress());
    expect(bouton(t, 'Estimer le prix').props.accessibilityState).toEqual({ checked: true });
    expect(tousLesTextes(t)).toContain('Total estimé');
  });

  it('les couleurs des cartes viennent du thème, clair comme sombre', () => {
    const src = lire('src/components/TravauxSheet.tsx');
    for (const hex of ['#7A5AF0', '#B8742A', '#1E8E4E', '#2A8CA8']) expect(src).not.toContain(hex);
    const pastilles = (t: TestRenderer.ReactTestRenderer) =>
      ['plafonds', 'sol', 'plinthes'].map((k) => {
        const carte = t.root.findAll((x) => x.props?.testID === `carte-${k}`, { deep: false })[0];
        const v = carte.findAll((x) => typeof x.type === 'string' && StyleSheet.flatten(x.props.style)?.width === 8)[0];
        return StyleSheet.flatten(v.props.style).backgroundColor;
      });
    expect(pastilles(monter())).toEqual([light.sky, light.amber, light.green]);
    act(() => arbre!.unmount());
    act(() => useScanStore.setState({ themePref: 'dark' }));
    expect(pastilles(monter())).toEqual([dark.sky, dark.amber, dark.green]);
  });
});

describe('Décorer : la tuile Ambiance', () => {
  it('ne coupe plus son mot sur deux lignes (« Personnalisé / e »)', () => {
    const src = lire('src/components/DecorSheet.tsx');
    expect(src).not.toContain("'Personnalisée'");
    const m = src.match(/tuile\('ambiances', 'Ambiance', ambianceActuelle\?\.nom \?\? '([^']+)'/);
    expect(m).not.toBeNull();
    // Un mot court, d'un seul tenant : il tient sur la ligne de la tuile.
    expect(m![1]).toMatch(/^\S{1,8}$/);
  });
});
