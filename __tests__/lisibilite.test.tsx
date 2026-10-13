/**
 * LE PLAN QUI PARLE DÈS L'OUVERTURE, ET PLUS DE PIÈGES.
 *
 * Correctifs de l'audit « dans la peau d'un utilisateur » :
 *   — le plan s'ouvrait muet : ni noms de pièces, ni m² (le calque Surfaces,
 *     éteint d'office, était commun à la 2D et à la 3D) ;
 *   — deux fenêtres à la fois en fin de scan (le bilan et le choix) ;
 *   — « Scanner un étage » échouait sans un mot sur un iPhone sans LiDAR ;
 *   — « Refaire un scan » et « Nouveau scan » menaient à l'accueil ;
 *   — « Jeter » un relevé interrompu ne demandait rien ;
 *   — « m périm. » additionnait toutes les cloisons ;
 *   — la fiche d'une pièce n'était accessible qu'en édition, et la surface
 *     habitable n'y paraissait que sous un rampant ;
 *   — « Ça passe ? » et « Caler » étaient cachés derrière « Cotes du meuble » ;
 *   — des textes qui disaient le contraire du code.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { perimetreDesPieces, roomParts, type WallSeg } from '../src/geometry/floorplan';
import { demarrerEtage } from '../src/native/useRoomScan';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useScanStore } from '../src/store/scanStore';
import { useAlerte } from '../src/ui/alerte';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('le plan 2D s’ouvre avec ses pièces nommées ; la 3D, sur les meubles et les murs', () => {
  it('deux calques : les surfaces du plan (allumées) et celles de la maquette (éteintes)', () => {
    const store = lire('src/store/scanStore.ts');
    const base = store.slice(store.indexOf('const CALQUES_DE_BASE'), store.indexOf('} as const;', store.indexOf('const CALQUES_DE_BASE')));
    expect(base).toContain('showSurfaces: true');
    expect(base).toContain('show3DSurfaces: false');
    expect(lire('src/components/Iso3DView.tsx')).toContain('useScanStore((s) => s.show3DSurfaces)');
    const barre = lire('src/screens/result/ResultToolbar.tsx');
    expect(barre).toContain('const show3DSurfaces = useScanStore((s) => s.show3DSurfaces);');
  });

  it('le dossier PDF n’éteint plus les surfaces : les pièces y sont nommées', () => {
    expect(lire('src/screens/ExportScreen.tsx')).not.toContain('setShowSurfaces(false)');
  });
});

describe('la fin du scan, une fenêtre à la fois', () => {
  it('le choix « ce que le plan intègre » attend que le bilan soit refermé', () => {
    expect(lire('src/screens/ResultScreen.tsx')).toContain('visible={!!arrivage && !capturing && !rienACocher && !bilan}');
  });
});

describe('les boutons font ce qu’ils disent', () => {
  it('« Scanner un étage » sans LiDAR : un refus dit, et rien de commencé', async () => {
    act(() => useScanStore.setState({ supported: false, etageEnCours: null } as never));
    await expect(demarrerEtage(1)).rejects.toThrow(/LiDAR/);
    expect(useScanStore.getState().etageEnCours ?? null).toBeNull();
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).not.toContain('demarrerEtage(Math.max(...niveaux) + 1).catch(() => {});');
  });

  it('« Refaire un scan » relance un scan ; « Nouveau scan » demande, puis scanne', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('lancerUnScan');
    expect(ecran).toContain('Commencer un nouveau scan ?');
    expect(lire('src/native/useRoomScan.ts')).toContain('export async function lancerUnScan(');
  });

  it('« Jeter » un relevé interrompu demande confirmation', () => {
    act(() =>
      useScanStore.setState({
        screen: 'home',
        brouillon: { at: Date.now() - 60_000, nom: 'Séjour', walls: [{ id: 'w' }], rooms: [] } as never,
        saves: [],
      }),
    );
    let t!: TestRenderer.ReactTestRenderer;
    act(() => {
      t = TestRenderer.create(<HomeScreen />);
    });
    const jeter = t.root.findAll((n) => n.props.accessibilityLabel === 'Jeter le relevé interrompu' && typeof n.props.onPress === 'function', { deep: false })[0];
    act(() => jeter.props.onPress());
    expect(useAlerte.getState().courante?.titre).toMatch(/Jeter le relevé interrompu/);
    // Rien n'est jeté avant la confirmation.
    expect(useScanStore.getState().brouillon).not.toBeNull();
    act(() => useAlerte.getState().courante?.actions?.find((a) => a.danger)?.onPress?.());
    act(() => t.unmount());
  });
});

describe('les chiffres de l’en-tête disent vrai', () => {
  const mur = (id: string, ax: number, az: number, bx: number, bz: number, roomId: string): WallSeg => ({
    id, type: 'wall', a: { x: ax, z: az }, b: { x: bx, z: bz }, height: 2.5, yCenter: 1.25, roomId,
  });
  it('« m périm. » : le tour des pièces, pas la somme de toutes les cloisons', () => {
    const murs = [
      mur('n', 0, 0, 4, 0, 'r1'), mur('e', 4, 0, 4, 3, 'r1'), mur('s', 4, 3, 0, 3, 'r1'), mur('o', 0, 3, 0, 0, 'r1'),
      // Une cloison libre au milieu : elle n'est le tour d'aucune pièce.
      mur('c', 2, 0.5, 2, 2.5, 'r1'),
    ];
    const parts = roomParts(murs.slice(0, 4), [{ id: 'r1' }]);
    expect(perimetreDesPieces(parts)).toBeCloseTo(14, 6);
    expect(lire('src/screens/ResultScreen.tsx')).toContain('perimetreDesPieces(parts)');
  });

  it('« m² hab. » porte « ≈ » quand la surface est approchée, ou l’habitable à vérifier', () => {
    expect(lire('src/screens/ResultScreen.tsx')).toMatch(
      /value: `\$\{\(surface && !surface\.exact\) \|\| habitable\.aVerifier > 0 \? '≈ ' : ''\}\$\{fr\(habitable\.total\)\}`/,
    );
  });
});

describe('la pièce et le meuble, sans passer par l’édition', () => {
  it('la fiche s’ouvre depuis le nom de la pièce ; la surface habitable y est toujours', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain("label: 'Fiche de la pièce'");
    expect(ecran).toContain('surfaceHabitable: habitableDeLaCible');
  });

  it('« ne passe pas » et « caler » se disent dès que le meuble est choisi', () => {
    const ecran = lire('src/screens/ResultScreen.tsx');
    expect(ecran).toContain('accessibilityLabel="Caler le meuble dans sa niche"');
    expect(ecran).toContain('verdictDePassage && !verdictDePassage.ok && !objDims');
  });
});

describe('les textes ne disent plus le contraire du code', () => {
  it('plus de palier gratuit, de relevé offert, ni de relevés illimités réservés au Pro', () => {
    expect(lire('src/components/MenuCompte.tsx')).not.toContain('palier gratuit');
    expect(lire('src/screens/ConfidentialiteScreen.tsx')).not.toContain('relevé offert');
    expect(lire('src/screens/ProfilScreen.tsx')).not.toMatch(/'[^']*relevés illimités'/);
    expect(lire('src/screens/PaywallScreen.tsx')).not.toContain('Les nouveautés en premier');
  });

  it('« Dessiner un plan » se fait aux cotes, pas au doigt', () => {
    const accueil = lire('src/screens/HomeScreen.tsx');
    expect(accueil).not.toContain('Au doigt, sans capteur');
    expect(accueil).not.toContain('dessinez votre plan au doigt');
  });

  it('l’aperçu ne parle plus de « client » au particulier ; la pose ne parle plus de prix public', () => {
    expect(lire('src/components/ApercuDuDossier.tsx')).not.toContain('chez votre client');
    expect(lire('src/components/PoseEstimee.tsx')).not.toContain('prix public TTC');
  });

  it('l’écran « essai épuisé », jamais montré et contraire au modèle, est parti', () => {
    expect(existsSync(join(__dirname, '..', 'src/components/EssaiEpuise.tsx'))).toBe(false);
    expect(lire('App.tsx')).not.toContain('EssaiEpuise');
    expect(lire('src/store/accountStore.ts')).not.toContain('PLANS_GRATUITS');
  });
});

describe('la bibliothèque ne perd pas un plan revenu du serveur', () => {
  it('un plan rangé dans un dossier qui n’existe plus revient à la racine', () => {
    expect(lire('src/screens/LibraryScreen.tsx')).toContain('dossiersConnus.has(');
  });
});
