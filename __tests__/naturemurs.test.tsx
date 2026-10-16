/**
 * LA NATURE DES MURS — relevé du patron, dossier d'architecte à l'appui :
 * « fais en sorte qu'on ait la possibilité de marquer la nature des murs,
 * comme les murs intérieurs en placo. Ces murs changeront de visuel sur le
 * plan, comme sur celui fourni ».
 *
 * Le plan fourni (Romeo Architectes, rénovation d'une villa) : maçonnerie en
 * noir plein, cloison en plaque de plâtre en gris cerné d'un filet, doublage
 * isolant en boucles. Plus les deux états d'un plan de rénovation : à
 * démolir en jaune, à créer en rouge.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { View } from 'react-native';
import { Polygon } from 'react-native-svg';
import TestRenderer, { act } from 'react-test-renderer';
import { FloorplanEditor } from '../src/components/FloorplanEditor';
import { useScanStore } from '../src/store/scanStore';
import { appartementExemple } from '../src/data/exemple';
import {
  jonctionsDetaillees,
  mergeColinear,
  wallQuadsOf,
  type WallSeg,
} from '../src/geometry/floorplan';
import {
  NATURES_MUR,
  dessinDesNatures,
  naturesPresentes,
  renduNature,
  seDistingue,
} from '../src/geometry/natureMurs';
import { buildScanPdf } from '../src/export/pdf';
import { buildDxf } from '../src/export/dxf';

const mur = (id: string, ax: number, az: number, bx: number, bz: number, extra: Partial<WallSeg> = {}): WallSeg => ({
  id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId: 'r1', ...extra,
});

describe('le modèle', () => {
  it('cinq natures, dans l’ordre du menu ; le porteur garde le noir du poché', () => {
    expect(NATURES_MUR.map((n) => n.cle)).toEqual(['porteur', 'cloison', 'doublage', 'demolir', 'creer']);
    expect(seDistingue(mur('a', 0, 0, 1, 0, { nature: 'porteur' }))).toBe(false);
    expect(seDistingue(mur('a', 0, 0, 1, 0, { nature: 'cloison' }))).toBe(true);
    expect(seDistingue(mur('a', 0, 0, 1, 0))).toBe(false);
  });

  it('la cloison est le gris du plan d’architecte (#CCCCCC à l’encre près)', () => {
    const r = renduNature('cloison', '#000000', '#FFFFFF');
    expect(r.fond.toUpperCase()).toBe('#C7C7C7');
    expect(r.contour).toBe('#000000');
    expect(renduNature('doublage', '#000000', '#FFFFFF').boucles).toBe(true);
    expect(renduNature('demolir', '#000000', '#FFFFFF').tirets).toBe(true);
  });

  it('une cloison prolongée d’un porteur reste deux murs', () => {
    const murs = mergeColinear([
      mur('p', 0, 0, 2, 0, { nature: 'porteur' }),
      mur('c', 2, 0, 4, 0, { nature: 'cloison' }),
    ]);
    expect(murs).toHaveLength(2);
    // Deux cloisons alignées, elles, se recollent comme avant.
    expect(mergeColinear([mur('c1', 0, 0, 2, 0, { nature: 'cloison' }), mur('c2', 2, 0, 4, 0, { nature: 'cloison' })])).toHaveLength(1);
  });

  it('la légende ne cite que les natures présentes', () => {
    expect(naturesPresentes([mur('a', 0, 0, 1, 0, { nature: 'cloison' }), mur('b', 1, 0, 1, 1)])).toEqual(['cloison']);
  });
});

describe('le dessin par-dessus le poché', () => {
  // Une façade porteuse, et une cloison qui tombe dessus en T.
  const MURS: WallSeg[] = [
    mur('f1', 0, 0, 2, 0),
    mur('f2', 2, 0, 4, 0),
    mur('c', 2, 0, 2, 3, { nature: 'cloison', epaisseur: 0.07 }),
  ];
  const dessin = dessinDesNatures(MURS, wallQuadsOf(MURS), jonctionsDetaillees(MURS))!;

  it('la cloison bute d’équerre : son bout est prolongé jusqu’au nœud, sans pointe', () => {
    const [corps] = dessin.corps;
    const zs = corps.contour.map((p) => +p.z.toFixed(6));
    // Ses deux coins côté façade sont sur l'axe de la façade (z = 0).
    expect(zs.filter((z) => z === 0)).toHaveLength(2);
    // Et elle garde sa largeur de 7 cm.
    const xs = corps.contour.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.07, 6);
  });

  it('la maçonnerie du nœud se repeint par-dessus : elle reprend la main', () => {
    expect(dessin.maconnerie.length).toBeGreaterThanOrEqual(2);
  });

  it('le filet suit les deux faces, et ferme seulement le bout dans le vide', () => {
    // Le bout en (2, 3) finit dans le vide : trois filets.
    expect(dessin.corps[0].filets).toHaveLength(3);
  });

  it('un plan sans nature n’a rien à peindre', () => {
    const nus = MURS.map((w) => ({ ...w, nature: undefined }));
    expect(dessinDesNatures(nus, wallQuadsOf(nus), jonctionsDetaillees(nus))).toBeNull();
  });
});

describe('le magasin', () => {
  beforeEach(() => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.setState({ walls: [mur('m', 0, 0, 3, 0)], openings: [], rooms: [] } as never);
    });
  });

  it('marque, retire, et s’annule', () => {
    useScanStore.getState().setNatureMur('m', 'cloison');
    expect(useScanStore.getState().walls[0].nature).toBe('cloison');
    useScanStore.getState().setNatureMur('m', null);
    // Retirée, elle ne s'écrit plus : le mur redevient comme relevé.
    expect('nature' in useScanStore.getState().walls[0]).toBe(false);
    useScanStore.getState().undo();
    expect(useScanStore.getState().walls[0].nature).toBe('cloison');
  });

  it('ne marque qu’un mur, jamais une baie', () => {
    act(() => {
      useScanStore.setState({ walls: [{ ...mur('m', 0, 0, 3, 0), type: 'door' }] } as never);
    });
    useScanStore.getState().setNatureMur('m', 'cloison');
    expect(useScanStore.getState().walls[0].nature).toBeUndefined();
  });
});

describe('les rendus', () => {
  it('l’exemple montre ses cloisons en placo sur le plan', () => {
    act(() => {
      useScanStore.getState().reset();
      useScanStore.getState().ouvrirExemple();
    });
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<FloorplanEditor editable={false} showMeasures selectedWallId={null} onSelectWall={() => {}} />);
    });
    act(() => {
      const zone = t.root.findAllByType(View).find((n) => typeof n.props.onLayout === 'function')!;
      zone.props.onLayout({ nativeEvent: { layout: { width: 390, height: 600 } } });
    });
    const cloisons = t.root.findAllByType(Polygon).filter((n) => n.props.testID === 'nature-cloison');
    expect(cloisons.length).toBeGreaterThanOrEqual(3);
    act(() => t.unmount());
  });

  const latin1 = (b: Uint8Array) => {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  };
  const pdfDe = (walls: WallSeg[]) => {
    const ex = appartementExemple();
    return latin1(
      buildScanPdf(
        { name: 'Exemple', walls, openings: ex.openings, objects: [], rooms: ex.rooms, roomNames: {}, fixtures: [] } as never,
        false,
        { metre: false, surfaces: true } as never,
      ),
    ).split('(FEUILLE)')[0];
  };

  it('le PDF légende les murs, et découpe leur nature au poché', () => {
    const plan = pdfDe(appartementExemple().walls as WallSeg[]);
    expect(plan).toContain('(MURS)');
    expect(plan).toMatch(/\(Cloison en plaque de pl.tre\)/);
    expect(plan).toContain('W* n');
  });

  it('sans nature marquée, ni légende des murs ni découpe', () => {
    const nus = (appartementExemple().walls as WallSeg[]).map((w) => {
      const c = { ...w };
      delete c.nature;
      return c;
    });
    const plan = pdfDe(nus);
    expect(plan).not.toContain('(MURS)');
    expect(plan).not.toContain('W* n');
  });

  it('le DXF range chaque cloison sur son calque', () => {
    const ex = appartementExemple();
    const dxf = buildDxf({ walls: ex.walls as WallSeg[], openings: ex.openings as WallSeg[], rooms: ex.rooms, fixtures: [] } as never);
    expect(dxf).toContain('ECHOPLAN-CLOISONS');
    expect(dxf.split('ECHOPLAN-CLOISONS').length - 1).toBeGreaterThan(3);
  });
});
