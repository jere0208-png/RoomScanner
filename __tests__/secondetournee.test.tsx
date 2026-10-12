/**
 * DEUXIÈME TOURNÉE D'UTILISATEURS — ce qui restait après les pertes de travail.
 *
 *   — Inès (architecte, trois niveaux) : les meubles du DXF ne tournaient
 *     pas, l'OBJ sortait en miroir, « R+1 » devenait « R-1 » dans le nom du
 *     DXF, les accents tombaient des PDF (« 1er-tage »), l'OBJ ne disait pas
 *     son niveau ; la cave ne se recalait pas (seul le niveau le plus bas n'a
 *     rien en dessous) ; un scan de cave raté renvoyait à l'accueil, dossier
 *     refermé.
 *   — Chloé (premier appartement) : pas de « Dupliquer » dans le plan pour
 *     essayer une autre version, et la copie portait le même nom ; des
 *     nuanciers sans noms ; « Explorer » perdait son mot ; toucher la
 *     poignée de rotation d'un meuble ne faisait rien.
 *   — Lucas (repeindre) : un pot coûtait le même prix qu'il fasse 2,5 L ou
 *     10 L ; « Blanc cassé » devenait « Sans teinte choisie ».
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

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { RoomScan } from 'react-native-room-scan';
import { buildDxf, dxfFilename } from '../src/export/dxf';
import { buildObj, objFilename } from '../src/export/model3d';
import { pdfFilename } from '../src/export/pdf';
import { niveauDeReference, type WallSeg } from '../src/geometry/floorplan';
import { achats, type PieceTravaux } from '../src/geometry/travaux';
import { useScanStore } from '../src/store/scanStore';
import { useAccountStore } from '../src/store/accountStore';
import { useReglagesTravaux } from '../src/store/reglagesTravaux';
import { useAstuce } from '../src/ui/astuce';
import { nomDeTeinte } from '../src/ui/peintures';
import { DecorSheet } from '../src/components/DecorSheet';
import { demarrerEtage, useRoomScan } from '../src/native/useRoomScan';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const st = () => useScanStore.getState();
const mur = (id: string, ax: number, az: number, bx: number, bz: number): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25,
});

beforeEach(() => {
  mockMagasin.clear();
  useAccountStore.setState({ plansUtilises: 0, pro: true, bonusEssais: 0 });
  st().reset();
  useScanStore.setState({ saves: [], currentSaveId: null });
});

describe('les exports d’Inès', () => {
  it('le DXF tourne les meubles comme le plan', () => {
    // Un banc de 2 × 0,5 m tourné d'un quart de tour : il court en z.
    const c = Math.cos(Math.PI / 2);
    const s = Math.sin(Math.PI / 2);
    const banc = {
      id: 'b', category: 'storage', width: 2, depth: 0.5, height: 0.45,
      transform: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 3, 0.2, 3, 1],
    };
    const dxf = buildDxf({ walls: [mur('m', 0, 0, 6, 0)], openings: [], rooms: [], fixtures: [], objects: [banc] } as never);
    const lignes = dxf.split(/\r?\n/).map((l) => l.trim());
    const calque = lignes.findIndex((l, i) => l === 'ECHOPLAN-MEUBLES' && lignes[i - 1] === '8');
    expect(calque).toBeGreaterThan(0);
    // Les sommets de la polyligne du meuble, en millimètres.
    const xs: number[] = [];
    const ys: number[] = [];
    let sommet = false;
    for (let i = calque; i < lignes.length && lignes[i] !== 'SEQEND'; i++) {
      if (lignes[i] === 'VERTEX') sommet = true;
      if (!sommet) continue;
      if (lignes[i] === '10') xs.push(Number(lignes[i + 1]));
      if (lignes[i] === '20') ys.push(Number(lignes[i + 1]));
    }
    const large = Math.max(...xs) - Math.min(...xs);
    const haut = Math.max(...ys) - Math.min(...ys);
    // 0,5 m en x, 2 m en y : il est debout, pas couché.
    expect(Math.round(large)).toBe(500);
    expect(Math.round(haut)).toBe(2000);
  });

  it('les noms de fichiers gardent « R+1 » et les accents lisibles', () => {
    expect(dxfFilename('Maison Dupont R+1')).toBe('Maison-Dupont-R+1.dxf');
    expect(objFilename('Maison Dupont R+1')).toBe('Maison-Dupont-R+1.obj');
    expect(pdfFilename('Maison Dupont 1er étage')).toBe('Maison-Dupont-1er-etage.pdf');
    expect(pdfFilename('Rez-de-chaussée')).toBe('Rez-de-chaussee.pdf');
  });

  it('l’OBJ dit son niveau, comme le DXF', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toMatch(/objFilename\(\s*niveaux\.length > 1/);
  });

  it('l’OBJ n’est plus en miroir : le z du plan reste le z du fichier', () => {
    const obj = buildObj({
      walls: [mur('n', 0, 0, 4, 0), mur('e', 4, 0, 4, 3), mur('s', 4, 3, 0, 3), mur('w', 0, 3, 0, 0)],
      openings: [], objects: [], rooms: [{ id: 'r', name: 'Pièce', wallIds: ['n', 'e', 's', 'w'], floor: null }], fixtures: [],
    } as never);
    const zs = obj.split('\n').filter((l) => l.startsWith('v ')).map((l) => Number(l.split(' ')[3]));
    expect(Math.max(...zs)).toBeGreaterThan(2.5);
    expect(Math.min(...zs)).toBeGreaterThan(-0.5);
  });
});

describe('les niveaux d’Inès', () => {
  it('la cave se cale sur le rez-de-chaussée, l’étage sur celui du dessous', () => {
    expect(niveauDeReference([1, 0, -1], -1)).toBe(0);
    expect(niveauDeReference([1, 0, -1], 1)).toBe(0);
    expect(niveauDeReference([1, 0, -1], 0)).toBe(-1);
    expect(niveauDeReference([0], 0)).toBeNull();
    expect(niveauDeReference([2, 0], 2)).toBe(0);
  });

  it('« Recaler » s’offre à tous les niveaux dès qu’il y en a deux', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).not.toMatch(/niveauCourant !== Math\.min\(\.\.\.niveaux\)/);
    expect(ecran).toMatch(/niveauDeReference\(niveaux, niveauCourant\)/);
  });

  it('un scan de cave qui échoue ramène au plan, pas à l’accueil', async () => {
    st().commencerAuClavier();
    st().addRoomBox(5, 4, 'Séjour');
    const murs = st().walls.length;
    useScanStore.setState({ supported: true });
    await act(async () => {
      await demarrerEtage(-1);
    });
    (RoomScan.stop as jest.Mock).mockRejectedValueOnce(new Error('RoomPlan a échoué'));
    let crochet!: ReturnType<typeof useRoomScan>;
    const Sonde = () => {
      crochet = useRoomScan();
      return null;
    };
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<Sonde />);
    });
    await act(async () => {
      await crochet.stop();
    });
    act(() => crochet.cancel());
    expect(st().screen).toBe('result');
    expect(st().walls).toHaveLength(murs);
    act(() => t.unmount());
  });
});

describe('les versions de Chloé', () => {
  it('« Dupliquer » est dans le menu du plan', () => {
    expect(lire('src/screens/ResultScreen.tsx')).toMatch(/label: 'Dupliquer pour essayer une autre version'/);
  });

  it('la copie prend un nom à elle, et le dit', () => {
    st().commencerAuClavier();
    st().addRoomBox(4, 3, 'Séjour');
    st().renameCurrent('Version A');
    st().commitCurrent();
    const original = st().saves[0];
    st().saveAsCopy('Version A');
    expect(st().saves).toHaveLength(2);
    const copie = st().saves.find((s) => s.id === st().currentSaveId)!;
    expect(copie.name).not.toBe('Version A');
    expect(copie.name).toMatch(/Version A — version 2/);
    expect(st().saves.find((s) => s.id === original.id)!.name).toBe('Version A');
    expect(useAstuce.getState().courante?.texte).toMatch(/Vous êtes dans « Version A — version 2 »/);
  });
});

describe('Décorer, avec des noms', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.setState({
        screen: 'result',
        rooms: [{ id: 'r1', name: 'Séjour', floor: null, peinture: 'sauge' }] as never,
        objects: [],
      });
    });
  });

  it('chaque teinte porte son nom, et la section dit celle qui est prise', () => {
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<DecorSheet visible onClose={jest.fn()} pieceInitiale="r1" />);
    });
    const mots = t.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));
    expect(mots).toContain('Craie');
    expect(mots).toContain('Terracotta');
    expect(mots.some((m) => /Les murs.*Vert sauge/.test(m))).toBe(true);
    act(() => t.unmount());
  });
});

describe('la rangée et la poignée de Chloé', () => {
  it('« Explorer » garde toujours son mot', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).not.toMatch(/\{!rangeeSerree && <Text style=\{styles\.explorerPastilleTexte\}>/);
  });

  it('un toucher sur la poignée tourne le meuble d’un quart', () => {
    const editeur = lire('src/components/FloorplanEditor.tsx');
    const i = editeur.indexOf('accessibilityLabel="Pivoter le meuble"');
    const avant = editeur.slice(Math.max(0, i - 4000), i);
    expect(avant).toMatch(/onPanResponderRelease: \(_e, g\) => \{[\s\S]*rotateObject\(objectId, 1\)/);
  });
});

describe('les achats de Lucas', () => {
  it('le prix du pot suit sa contenance', () => {
    act(() => useReglagesTravaux.getState().reinitialiser());
    const avant = useReglagesTravaux.getState().prix.potMurs;
    act(() => useReglagesTravaux.getState().regler({ pot: 10 }));
    expect(useReglagesTravaux.getState().prix.potMurs).toBe(Math.round((avant * 10) / 2.5));
    act(() => useReglagesTravaux.getState().regler({ pot: 2.5 }));
    expect(useReglagesTravaux.getState().prix.potMurs).toBe(avant);
  });

  it('« Blanc cassé » se dit, et chaque teinte nomme ses pièces', () => {
    expect(nomDeTeinte('')).toBe('Blanc cassé');
    const piece = (roomId: string, nom: string, cle: string): PieceTravaux =>
      ({ roomId, nom, sol: 10, plafond: 10, perimetre: 13, hauteur: 2.5, murs: 30, plinthes: 12, teintes: [{ cle, surface: 30 }] }) as never;
    const a = achats([piece('r1', 'Séjour', ''), piece('r2', 'Chambre', 'sauge')]);
    const blanc = a.murs.parTeinte!.find((t) => t.cle === '')!;
    expect(blanc.pieces).toEqual(['Séjour']);
    expect(a.murs.parTeinte!.find((t) => t.cle === 'sauge')!.pieces).toEqual(['Chambre']);
  });
});
