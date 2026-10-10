/**
 * LA POSE AU SCAN, EN 3D — ce qu'on peut poser, et ce que le natif doit savoir.
 *
 * Relevé du patron : « revois complètement l'interface du scan pour le
 * placement des produits électriques, intègre directement les éléments en
 * 3D, et revois aussi les icônes pour du réaliste ».
 *
 * Le scan proposait trois boutons — « Prise », « Inter », « Lumière » — au
 * symbole de plan, et plantait une étiquette « PC » sur le mur visé. Il
 * propose maintenant un RAIL de produits, chacun en PHOTO (les mêmes que le
 * catalogue et le devis), et le produit choisi flotte en 3D au viseur, à la
 * cote où il se posera ; un appui le pose, et il reste au mur, en vrai.
 *
 * Ce module fabrique ce que le natif reçoit une fois au début du scan :
 *   — le MODÈLE de chaque produit, par la fabrique de la maquette
 *     (`appareils3d`) : une prise du scan est la prise du plan ;
 *   — les RÈGLES de hauteur (`viseur.ts`) : paliers, cotes uniques, portée
 *     de l'aimant — le fantôme se pose là où l'ancrage du plan posera ;
 *   — ce qui va au PLAFOND, et ce qui n'y va que là.
 */
import { FIXTURES, ENTRAXE, PLAQUE, postsOf, type FixtureKind } from './electrical';
import type { CeilingKind } from './ceiling';
import {
  groupesDesAppareils,
  seMetSousPlaque,
  type GenreDAppareil,
  type PoseDAppareil,
} from './appareils3d';
import { maillageDesMeubles } from './modeles3d';
import { PORTEE_PALIER, natureAuMur, paliersDe } from './viseur';
import type { ConfigurationDePose } from 'react-native-room-scan';

/** Un produit du rail : ce qu'on pose, le mot qui le dit, la photo qui le montre. */
export interface ProduitDuScan {
  kind: FixtureKind | CeilingKind;
  /** Le mot du rail, court. */
  mot: string;
  /** Où il va. */
  ou: 'mur' | 'plafond';
  /** Le code de sa photo (voir `ui/produits`). */
  photo: string;
}

/*
  LES PRODUITS DU RAIL, dans l'ordre où on les pose dans une pièce : les
  prises, les commandes, la communication, la lumière, puis le plafond.
  Onze, pas tout le catalogue : un tableau ou une boîte de dérivation ne se
  posent pas en visant un mur pendant qu'on scanne — ils se règlent à
  l'établi, au centimètre.
*/
export const PRODUITS_DU_SCAN: ProduitDuScan[] = [
  { kind: 'prise', mot: 'Prise', ou: 'mur', photo: 'meca-prise' },
  { kind: 'prise2', mot: 'Prise double', ou: 'mur', photo: 'meca-prise2' },
  { kind: 'inter', mot: 'Interrupteur', ou: 'mur', photo: 'meca-inter' },
  { kind: 'va', mot: 'Va-et-vient', ou: 'mur', photo: 'meca-va' },
  { kind: 'volet', mot: 'Volet roulant', ou: 'mur', photo: 'meca-volet' },
  { kind: 'rj45', mot: 'RJ45', ou: 'mur', photo: 'meca-rj45' },
  { kind: 'tv', mot: 'Prise TV', ou: 'mur', photo: 'meca-tv' },
  { kind: 'applique', mot: 'Applique', ou: 'mur', photo: 'meca-applique' },
  { kind: 'dcl', mot: 'Point lumineux', ou: 'plafond', photo: 'plafond-dcl' },
  { kind: 'spot', mot: 'Spot', ou: 'plafond', photo: 'plafond-spot' },
  { kind: 'daaf', mot: 'Détecteur de fumée', ou: 'plafond', photo: 'plafond-daaf' },
];

export const produitDuScan = (kind: string): ProduitDuScan | undefined =>
  PRODUITS_DU_SCAN.find((p) => p.kind === kind);

/**
 * LE PRODUIT POSÉ À L'ORIGINE, dans son repère (voir `appareils3d`) : au mur,
 * `x` vers la droite, `y` vers le haut, `z` sortant du mur ; au plafond,
 * pendu sous l'origine. C'est ce repère que le natif pose au mur visé.
 */
export function poseALOrigine(p: ProduitDuScan): PoseDAppareil {
  const base = { id: `scan-${p.kind}`, x: 0, y: 0, z: 0, nx: 0, nz: 1 };
  // « applique » existe aux deux catalogues : c'est le RAIL qui dit où elle va.
  if (p.ou === 'plafond') {
    return { ...base, genre: 'plafond', plafond: p.kind as CeilingKind };
  }
  const k = p.kind as FixtureKind;
  const spec = FIXTURES[k];
  if (!seMetSousPlaque(k)) {
    return { ...base, genre: k as GenreDAppareil, largeur: spec.w, hauteur: spec.h };
  }
  const postes = postsOf(k);
  const debut = -((postes.length - 1) * ENTRAXE) / 2;
  return {
    ...base,
    genre: 'plaque',
    largeur: (postes.length - 1) * ENTRAXE + PLAQUE,
    hauteur: PLAQUE,
    postes: postes.map((poste, i) => ({ kind: poste, dx: debut + i * ENTRAXE, dy: 0 })),
  };
}

/** Le modèle d'un produit, au format que le natif lit (celui des meubles). */
export function modeleDuScan(p: ProduitDuScan): number[] {
  return maillageDesMeubles([], groupesDesAppareils([poseALOrigine(p)]));
}

/** Les modèles et les règles de la pose, pour le natif (`RoomScan.configurerPose`). */
export function configurationDeLaPose(): ConfigurationDePose {
  const modeles: Record<string, number[]> = {};
  const paliers: Record<string, number[]> = {};
  const std: Record<string, number> = {};
  for (const p of PRODUITS_DU_SCAN) {
    modeles[p.kind] = modeleDuScan(p);
    if (p.ou !== 'mur' && p.kind !== 'dcl') continue;
    // Ce que devient au mur un produit qui peut aussi aller au plafond.
    const k = natureAuMur(p.kind);
    const pal = paliersDe(k);
    if (pal) paliers[k] = pal;
    else if (FIXTURES[k]) std[k] = FIXTURES[k].std;
  }
  const plafond = PRODUITS_DU_SCAN.filter((p) => p.ou === 'plafond').map((p) => p.kind as string);
  return {
    modeles,
    paliers,
    std,
    portee: PORTEE_PALIER,
    plafond,
    // Un point lumineux visé sur un mur y devient une applique ; le reste
    // du plafond n'y va pas.
    plafondSeul: plafond.filter((k) => natureAuMur(k) === k),
    auMur: { dcl: natureAuMur('dcl') as string },
  };
}
