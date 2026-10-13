/**
 * TOURNÉE N°5 — L'IMAGE PARTAGÉE ET L'EN-TÊTE D'UNE MAISON.
 *
 * - « Léon » : l'image d'une petite pièce la montrait au plafond d'échelle de
 *   l'écran, le plan sur la moitié de la largeur.
 * - « Nadia » : l'image ne disait pas de quel étage il s'agit, et l'en-tête
 *   donnait le sol de la maison, jamais son habitable.
 * - « Bérénice » : l'image disait le sol (garage compris), pas l'habitable.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ECHELLE_MAX_PLAN, makeMapping } from '../src/geometry/floorplan';

const source = (f: string) => readFileSync(join(__dirname, '..', 'src', ...f.split('/')), 'utf8');

describe('le plein cadre de l’image', () => {
  const chambre = { minX: 0, maxX: 3, minZ: 0, maxZ: 2.8 };

  it('l’écran garde son plafond d’échelle ; l’image s’en passe', () => {
    expect(makeMapping(chambre, 390, 600).scale).toBe(ECHELLE_MAX_PLAN);
    const image = makeMapping(chambre, 390, 600, 40, Infinity);
    // La chambre de 3 m tient la largeur, aux marges près.
    expect((3 * image.scale) / 390).toBeGreaterThan(0.75);
  });

  it('l’éditeur ne lève le plafond que pour l’image, et seulement sur un plan au repos', () => {
    const editeur = source('components/FloorplanEditor.tsx');
    expect(editeur).toContain('const plafondDEchelle = pleinCadre && auRepos ? Infinity : ECHELLE_MAX_PLAN;');
    expect(source('screens/ResultScreen.tsx')).toContain('pleinCadre={capturing}');
  });
});

describe('la légende de l’image', () => {
  const ecran = source('screens/ResultScreen.tsx');

  it('dit l’étage, dès qu’il y en a plusieurs', () => {
    expect(ecran).toContain("(legendeSurfaces.lignes.length > 1 || niveaux.length > 1)");
    expect(ecran).toMatch(/legendeImageTitre\]\} numberOfLines=\{1\}>\s*\{nomDuNiveau\(niveauCourant\)\}/);
  });

  it('porte l’habitable quand il diffère du sol', () => {
    expect(ecran).toContain('{`Habitable · ${legendeSurfaces.hab} m²`}');
  });
});

describe('l’en-tête d’une maison', () => {
  it('donne l’habitable de la maison à côté de son sol', () => {
    expect(source('screens/ResultScreen.tsx')).toContain("label: 'm² hab. maison'");
  });
});
