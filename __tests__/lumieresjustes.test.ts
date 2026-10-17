/**
 * LA LUMIÈRE PART DE L'AMPOULE, ET NE DÉLAVE PAS LES MEUBLES.
 *
 * Relevé du patron : « les meubles dans le nouvel appartement témoin
 * deviennent blancs lorsque la lumière est allumée. Le point lumineux des DCL
 * est mal placé, il doit émettre à partir de l'ampoule et pas de son
 * support ».
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESCENTE_DE_LA_LUMIERE } from '../src/geometry/appareils3d';
import { ECLAT_LAMPE } from '../src/ui/maquette';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('le halo se pose à l’ampoule', () => {
  it('une DCL rayonne de son ampoule, à soixante centimètres sous la rosace', () => {
    expect(DESCENTE_DE_LA_LUMIERE.dcl).toBeCloseTo(0.59, 2);
    // Un spot et un plafonnier rayonnent au ras du plafond ; un ventilateur sous son moteur.
    expect(DESCENTE_DE_LA_LUMIERE.spot).toBeLessThan(0.1);
    expect(DESCENTE_DE_LA_LUMIERE.ventilateur).toBeGreaterThan(0.3);
  });

  it('la maquette projette le halo à cette hauteur, plus au support', () => {
    const vue = lire('src/components/Iso3DView.tsx');
    expect(vue).toContain('y: haut - (DESCENTE_DE_LA_LUMIERE[cl.kind] ?? 0.08)');
    expect(vue).not.toContain('y: haut - 0.08, z: cl.at.z');
  });

  it('le natif place la lumière de la DCL au même endroit', () => {
    const natif = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');
    // La lumière de la pièce se pose au centre de l'ampoule (voir `descente`).
    expect(natif).toContain('case 3: return 0.59');
    expect(natif).toContain('e.y += p.y - Self.descente(genre)');
  });
});

describe('les meubles gardent leur couleur', () => {
  it('le halo est une lueur, pas un voile : il ne couvre plus les meubles de blanc', () => {
    expect(ECLAT_LAMPE.nuit.nappe[1]).toBeLessThanOrEqual(0.35);
    expect(ECLAT_LAMPE.jour.nappe[1]).toBeLessThanOrEqual(0.25);
  });

  /*
    ALLUMER N'ÉTEINT PAS LE JOUR — relevé du patron, plus tard : « sur la
    visite, allumer une pièce rend les murs plus sombres, ce devrait être
    l'inverse ». La lampe AJOUTE sa lumière ; le jour ne dépend plus d'elle.
  */
  it('allumer ajoute de la lumière : le jour ne baisse plus quand une lampe s’allume', () => {
    const natif = lire('modules/react-native-room-scan/ios/RoomScanVisite.swift');
    expect(natif).not.toContain('nuitAllumee');
    expect(natif).not.toContain('if allume { nuit = true }');
    expect(natif).not.toContain('noeudDuContre?.light = nil');
  });
});
