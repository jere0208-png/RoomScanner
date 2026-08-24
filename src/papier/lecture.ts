/**
 * LIRE UN PLAN PAPIER, D'UN BOUT À L'AUTRE.
 *
 * Ce fichier n'invente rien : il enchaîne les étages précédents et rend ce
 * que l'app sait déjà consommer — un `ScanResult`, exactement celui que
 * RoomPlan produirait. C'est la décision de conception qui tient tout le
 * reste : un plan papier n'ouvre PAS un deuxième chemin dans l'application.
 * Les murs y passent par `finalize`, les pièces se détectent comme après un
 * scan, l'électricité s'ancre par `ancrerElec` — le même code qui pose ce
 * qu'on a visé au viseur pendant un relevé LiDAR. Tout ce qui suit la
 * lecture est donc, par construction, déjà éprouvé.
 *
 * L'ORDRE DES ÉTAGES N'EST PAS NÉGOCIABLE :
 *
 *   1. réduire — une photo de douze mégapixels ne se lit pas plus vite, et
 *      la transformée de Hough coûte le carré de la taille ;
 *   2. binariser au seuil local ;
 *   3. effacer ce que l'OCR a lu, sinon chaque lettre devient dix traits ;
 *   4. chercher les traits, puis les murs, puis les trous des menuiseries ;
 *   5. caler l'échelle sur les cotes écrites, sinon sur les portes ;
 *   6. ébarber la maçonnerie et reconnaître les symboles ;
 *   7. redresser, mettre à l'échelle, et rendre un relevé.
 *
 * CE QU'ON NE SAIT PAS, ON L'ÉCRIT. `avertissements` porte en clair ce qui
 * manque : pas d'échelle sûre, aucun mur trouvé, symboles non reconnus. Ces
 * phrases-là remontent à l'écran ; un plan lu n'est pas un plan relevé, et
 * l'électricien doit savoir sur quoi il travaille.
 */
import type { ObjectData, ScanResult, SurfaceData } from 'react-native-room-scan';
import { catalogItem, catalogTransform } from '../geometry/catalogue';
import type { Pt } from '../geometry/floorplan';
import { binariser, effacerBoites, type ImageGrise, type Masque } from './image';
import {
  choisirEchelle,
  echelleDeclaree,
  echelleParCotes,
  echelleParPortes,
  type Echelle,
} from './echelle';
import type { PhotoDePlan, TexteLu } from './entree';
import {
  calerSurLeMasque,
  filtrerDEquerre,
  mursDesTraits,
  souderLesCoins,
  type MurLu,
} from './murs';
import { ouverturesDesMurs, type OuvertureLue } from './ouvertures';
import { effacerMurs, symbolesDuMasque, type SymboleLu } from './symboles';
import { anglePrincipal, fusionnerTraits, segmentsDe, type Trait } from './traits';
import type { P } from './trace';

export interface ReglageLecture {
  /** Échelle imprimée sur le plan : 50 pour 1:50. */
  echelleDeclaree?: number;
  /** Finesse de l'image (points par pouce), si elle vient d'un PDF. */
  dpi?: number;
  /** Hauteur sous plafond donnée aux murs (m) : un plan ne la dit pas. */
  hauteur?: number;
  /** Largeur de travail : au-delà, l'image est réduite. */
  largeurMax?: number;
  /** Échelle imposée par l'utilisateur, qui l'emporte sur tout. */
  echelle?: Echelle | null;
}

export interface PlanLu {
  echelle: Echelle | null;
  /** Le relevé, dans la forme que l'app sait déjà finaliser. */
  resultat: ScanResult;
  /** Les noms de pièces lus sur le plan, en mètres du repère du relevé. */
  etiquettes: { at: Pt; texte: string }[];
  /** Les symboles qu'on n'a pas su nommer, à qualifier à la main. */
  reperes: { at: Pt; taille: number }[];
  /** Ce qui manque ou ce dont on doute, en clair. */
  avertissements: string[];
  /** L'état intermédiaire, pour l'aperçu et pour les bancs (en pixels). */
  vu: {
    masque: Masque;
    traits: Trait[];
    murs: MurLu[];
    ouvertures: OuvertureLue[];
    symboles: SymboleLu[];
    /** Facteur de réduction appliqué à l'image d'origine. */
    reduction: number;
  };
}

/** Hauteurs conventionnelles : un plan de dessus ne les donne jamais. */
const H_MUR = 2.5;
const H_PORTE = 2.04;
const H_FENETRE = 1.15;
const ALLEGE = 0.95;

/**
 * Réduit l'image d'un facteur ENTIER, par moyenne de blocs.
 *
 * Entier, parce qu'une moyenne de bloc est exacte et rapide là où un
 * rééchantillonnage quelconque flouterait les traits fins — et ce sont
 * justement les traits fins qui portent les menuiseries.
 */
export function reduire(img: ImageGrise, facteur: number): ImageGrise {
  const f = Math.max(1, Math.round(facteur));
  if (f === 1) return img;
  const l = Math.floor(img.l / f);
  const h = Math.floor(img.h / f);
  const px = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let s = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) s += img.px[(y * f + dy) * img.l + x * f + dx];
      }
      px[y * l + x] = Math.round(s / (f * f));
    }
  }
  return { l, h, px };
}

const reduireTextes = (textes: TexteLu[], f: number): TexteLu[] =>
  f === 1
    ? textes
    : textes.map((t) => ({ ...t, x: t.x / f, y: t.y / f, l: t.l / f, h: t.h / f }));

/** Le point d'un mur à la cote `s`, en pixels. */
function surLeMur(m: MurLu, s: number): P {
  const len = m.len || 1;
  return {
    x: m.a.x + ((m.b.x - m.a.x) * s) / len,
    y: m.a.y + ((m.b.y - m.a.y) * s) / len,
  };
}

/** La matrice de pose d'une surface, à la façon de RoomPlan. */
function poseSurface(a: Pt, b: Pt, yCenter: number): number[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const n = Math.hypot(dx, dz) || 1;
  const ux = dx / n;
  const uz = dz / n;
  return [
    ux, 0, uz, 0,
    0, 1, 0, 0,
    -uz, 0, ux, 0,
    (a.x + b.x) / 2, yCenter, (a.z + b.z) / 2, 1,
  ];
}

export function lirePlanPapier(
  photo: PhotoDePlan,
  reglage: ReglageLecture = {},
): PlanLu {
  const avertissements: string[] = [];
  const hauteur = reglage.hauteur ?? H_MUR;

  // 1. Réduire : la recherche de droites coûte le carré de la taille.
  const largeurMax = reglage.largeurMax ?? 1100;
  const reduction = Math.max(1, Math.round(photo.image.l / largeurMax));
  const image = reduire(photo.image, reduction);
  const textes = reduireTextes(photo.textes ?? [], reduction);

  // 2 et 3. Le masque, débarrassé de ce qui a été lu.
  const brut = binariser(image);
  const masque = effacerBoites(brut, textes);

  // 4. Les traits, les murs, les trous. L'angle de la feuille se mesure
  // AVANT les murs : c'est lui qui dit ce qui est d'équerre avec le plan.
  const traits = fusionnerTraits(segmentsDe(masque));
  const angle = anglePrincipal(masque);
  const murs = souderLesCoins(
    calerSurLeMasque(filtrerDEquerre(mursDesTraits(traits), angle), masque),
  );
  const ouvertures = ouverturesDesMurs(murs, masque, traits);
  if (murs.length === 0) {
    avertissements.push(
      'Aucun mur reconnu : la photo est peut-être trop floue, ou ce n’est pas un plan.',
    );
  }

  // 5. L'échelle.
  const echelle =
    reglage.echelle ??
    choisirEchelle(
      echelleParCotes(textes, traits),
      echelleDeclaree(reglage.dpi, reglage.echelleDeclaree),
      echelleParPortes(
        ouvertures.filter((o) => o.nature === 'porte').map((o) => o.largeur),
      ),
    );
  if (!echelle) {
    avertissements.push(
      'Aucune cote lisible : mesurez une longueur connue pour donner l’échelle.',
    );
  } else if (echelle.origine === 'portes') {
    avertissements.push(
      `Échelle estimée (${echelle.detail}) : vérifiez une cote avant de chiffrer.`,
    );
  }

  // 6. Les symboles, une fois la maçonnerie ébarbée.
  const symboles = symbolesDuMasque(effacerMurs(masque, murs));
  const inconnus = symboles.filter((s) => !s.cle).length;
  if (inconnus > 0) {
    avertissements.push(
      `${inconnus} symbole${inconnus > 1 ? 's' : ''} non reconnu${
        inconnus > 1 ? 's' : ''
      } : posé${inconnus > 1 ? 's' : ''} comme repère à qualifier.`,
    );
  }

  /*
    7. LE REPÈRE DU RELEVÉ.

    On redresse la feuille et on met à l'échelle en une seule opération, sur
    les COORDONNÉES et jamais sur l'image : tourner un million de pixels
    coûterait cher et abîmerait les traits fins qu'on vient tout juste de
    mesurer. L'origine se pose au centre du dessin, comme un scan qui
    commence là où l'on se tient.
  */
  const co = Math.cos(-angle);
  const si = Math.sin(-angle);
  const cx = image.l / 2;
  const cy = image.h / 2;
  const pxm = echelle?.pxParMetre || 100;
  const versMonde = (p: P): Pt => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: (dx * co - dy * si) / pxm, z: (dx * si + dy * co) / pxm };
  };

  // Les surfaces : les murs d'abord, puis ce qui les perce.
  const surfaces: SurfaceData[] = [];
  murs.forEach((m, i) => {
    const a = versMonde(m.a);
    const b = versMonde(m.b);
    surfaces.push({
      id: `pap-mur-${i}`,
      type: 'wall',
      length: Math.hypot(b.x - a.x, b.z - a.z),
      height: hauteur,
      transform: poseSurface(a, b, hauteur / 2),
      confidence: 'medium',
    });
  });
  ouvertures.forEach((o, i) => {
    const m = murs[o.mur];
    if (!m) return;
    const a = versMonde(surLeMur(m, o.at - o.largeur / 2));
    const b = versMonde(surLeMur(m, o.at + o.largeur / 2));
    const type = o.nature === 'fenetre' ? 'window' : o.nature === 'porte' ? 'door' : 'opening';
    const h = o.nature === 'fenetre' ? H_FENETRE : o.nature === 'porte' ? H_PORTE : hauteur;
    const yc = o.nature === 'fenetre' ? ALLEGE + h / 2 : h / 2;
    surfaces.push({
      id: `pap-baie-${i}`,
      type,
      length: Math.hypot(b.x - a.x, b.z - a.z),
      height: h,
      transform: poseSurface(a, b, yc),
      category: o.nature === 'baie' ? 'opening' : undefined,
    });
  });

  /*
    LES SYMBOLES PASSENT PAR LE CHEMIN DU VISEUR.

    `ScanResult.elec` existe déjà : c'est par là qu'arrive ce qu'on a posé au
    viseur pendant un relevé, et `ancrerElec` sait le rattacher au bon mur, à
    la bonne face, à la bonne hauteur — en ramenant au passage les cotes aux
    paliers du métier. Un symbole lu sur un plan papier n'a aucune raison
    d'emprunter un autre chemin : on lui donne un point du monde et sa
    nature, et tout le reste de l'app le traite comme le sien.
  */
  const elec: NonNullable<ScanResult['elec']>[number][] = [];
  const objects: ObjectData[] = [];
  const reperes: { at: Pt; taille: number }[] = [];
  symboles.forEach((s, i) => {
    const at = versMonde(s.at);
    if (!s.gabarit) {
      reperes.push({ at, taille: s.taille / pxm });
      return;
    }
    const cible = s.gabarit.cible;
    if (cible.sorte === 'mural' || cible.sorte === 'plafond') {
      elec.push({
        kind: cible.kind,
        x: at.x,
        // La hauteur exacte n'a pas d'importance ici : `ancrerElec` ramène
        // chaque appareil au palier de son métier. Ce qui compte est de
        // distinguer ce qui vit au PLAFOND de ce qui vit sur un mur.
        y: cible.sorte === 'plafond' ? hauteur - 0.1 : 1,
        z: at.z,
      });
      return;
    }
    if (cible.sorte !== 'meuble') {
      reperes.push({ at, taille: s.taille / pxm });
      return;
    }
    const item = catalogItem(cible.item);
    if (item) {
      objects.push({
        id: `pap-meuble-${i}`,
        category: item.category,
        width: item.w,
        height: item.h,
        depth: item.d,
        transform: catalogTransform(item, at.x, at.z),
        confidence: 'low',
      });
    }
  });

  const etiquettes = textes
    .filter((t) => /[A-Za-zÀ-ÿ]{3,}/.test(t.texte))
    .map((t) => ({
      at: versMonde({ x: t.x + t.l / 2, y: t.y + t.h / 2 }),
      texte: t.texte,
    }));

  return {
    echelle,
    resultat: {
      modelPath: '',
      surfaces,
      objects,
      elec,
    },
    etiquettes,
    reperes,
    avertissements,
    vu: { masque, traits, murs, ouvertures, symboles, reduction },
  };
}

/**
 * LES MOTS QUI DÉSIGNENT UNE PIÈCE sur un plan français.
 *
 * L'OCR rend tout ce qu'il lit : des noms de pièces, mais aussi « VR MOT »,
 * « B-B' », « SA : 14.68 m² » et le nom du bureau d'études. On ne nomme donc
 * une pièce que si le texte contient un mot du métier — et l'on écarte au
 * passage les cartouches de surface, qui accompagnent justement le nom.
 */
const MOTS_DE_PIECE = [
  'chambre',
  'cuisine',
  'sejour',
  'séjour',
  'salon',
  'salle',
  'sdb',
  'bain',
  'douche',
  'wc',
  'toilette',
  'couloir',
  'degagement',
  'dégagement',
  'dgt',
  'entree',
  'entrée',
  'bureau',
  'cellier',
  'garage',
  'buanderie',
  'placard',
  'dressing',
  'palier',
  'terrasse',
  'balcon',
  'atelier',
  'grenier',
  'cave',
];

/** Le texte nomme-t-il une pièce ? */
export function estUnNomDePiece(texte: string): boolean {
  const t = texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/m²|m2|:\s*\d/.test(texte)) return false;
  return MOTS_DE_PIECE.some((m) =>
    t.includes(
      m
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, ''),
    ),
  );
}

/**
 * Rattache les noms lus aux pièces détectées.
 *
 * Une pièce n'a pas de contour dans le magasin : elle a des MURS. Son centre
 * est donc la moyenne des bouts de ses murs, et l'étiquette va à la pièce
 * dont le centre est le plus proche — à condition d'être à portée, faute de
 * quoi le nom d'un plan voisin viendrait se poser sur le nôtre.
 *
 * On ne renomme JAMAIS une pièce déjà nommée à la main : le nom écrit sur le
 * plan vaut mieux qu'un nom déduit du mobilier, mais moins bien que celui
 * que quelqu'un a tapé.
 */
export function nommerLesPieces(
  etiquettes: { at: Pt; texte: string }[],
  rooms: { id: string; name: string; wallIds?: string[] }[],
  walls: { id: string; a: Pt; b: Pt }[],
  portee = 6,
): { roomId: string; nom: string }[] {
  const centres = rooms.map((r) => {
    const murs = walls.filter((w) => (r.wallIds ?? []).includes(w.id));
    if (!murs.length) return null;
    const pts = murs.flatMap((w) => [w.a, w.b]);
    return {
      id: r.id,
      nom: r.name,
      x: pts.reduce((s2, p) => s2 + p.x, 0) / pts.length,
      z: pts.reduce((s2, p) => s2 + p.z, 0) / pts.length,
    };
  });
  const out: { roomId: string; nom: string }[] = [];
  const pris = new Set<string>();
  for (const e of etiquettes) {
    if (!estUnNomDePiece(e.texte)) continue;
    let mieux: { id: string; d: number } | null = null;
    for (const centre of centres) {
      if (!centre || pris.has(centre.id) || centre.nom) continue;
      const d = Math.hypot(centre.x - e.at.x, centre.z - e.at.z);
      if (d > portee) continue;
      if (!mieux || d < mieux.d) mieux = { id: centre.id, d };
    }
    if (!mieux) continue;
    pris.add(mieux.id);
    out.push({ roomId: mieux.id, nom: e.texte.trim() });
  }
  return out;
}
