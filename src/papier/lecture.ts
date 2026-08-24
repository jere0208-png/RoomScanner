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
import {
  binariser,
  effacerBoites,
  encre,
  median3,
  type ImageGrise,
  type Masque,
} from './image';
import { recadrer, zoneDessinee } from './cadrer';
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
  ecarterLeCadre,
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
    /** Zone retenue dans l'image réduite, quand un recadrage a eu lieu. */
    zone: { x: number; y: number; l: number; h: number } | null;
  };
}

/** Hauteurs conventionnelles : un plan de dessus ne les donne jamais. */
const H_MUR = 2.5;
const H_PORTE = 2.04;
const H_FENETRE = 1.15;
const ALLEGE = 0.95;

/**
 * RÉDUIT L'IMAGE — en gardant les traits fins, pas en les moyennant.
 *
 * Une moyenne de bloc est le réflexe, et c'est un piège pour un DESSIN AU
 * TRAIT. Un plan d'architecte trace ses cloisons sur un pixel : moyenné avec
 * ses trois voisins blancs, ce pixel devient un gris pâle que le seuil ne
 * retient plus. On l'a payé comptant — un plan qui se lisait la veille est
 * ressorti avec quatre murs sur vingt-trois le jour où l'image a commencé à
 * être réduite de moitié.
 *
 * On prend donc, dans chaque bloc, la moyenne des `f` valeurs LES PLUS
 * SOMBRES (deux sur quatre pour une réduction de moitié). Le trait survit,
 * puisqu'il est ce qu'il y a de plus sombre ; et l'on ne prend pas le seul
 * minimum, qui garderait chaque grain de capteur comme s'il était de
 * l'encre.
 */
export function reduire(img: ImageGrise, facteur: number): ImageGrise {
  const f = Math.max(1, Math.round(facteur));
  if (f === 1) return img;
  const l = Math.floor(img.l / f);
  const h = Math.floor(img.h / f);
  const px = new Uint8Array(l * h);
  const bloc: number[] = new Array(f * f);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let n = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          bloc[n++] = img.px[(y * f + dy) * img.l + x * f + dx];
        }
      }
      const rang = bloc.slice(0, n).sort((a, b) => a - b);
      let s = 0;
      for (let i = 0; i < f; i++) s += rang[i];
      px[y * l + x] = Math.round(s / f);
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
  /*
    MILLE DEUX CENTS PIXELS DE LARGE POUR TRAVAILLER.

    La recherche de droites coûte le carré de la taille, et l'on avait
    descendu à neuf cents pour gagner des secondes. Un plan d'architecte de
    mille cinq cents pixels s'est alors trouvé réduit de MOITIÉ — et ses
    cloisons, tracées sur un pixel, ont perdu les trois quarts de leur
    encre : quatre murs relevés sur vingt-trois. La vitesse ne vaut rien si
    le relevé est faux. À mille deux cents, un plan de bureau d'études
    courant passe sans être réduit du tout.
  */
  const largeurMax = reglage.largeurMax ?? 1200;
  const reduction = Math.max(1, Math.round(photo.image.l / largeurMax));
  const image = reduire(photo.image, reduction);
  const textes = reduireTextes(photo.textes ?? [], reduction);

  /*
    2. LE MASQUE — filtré, seuillé, puis RECADRÉ SUR LE DESSIN.

    Le filtre médian passe d'abord : il tue les franges d'une dalle
    photographiée et le grain d'un capteur sans manger les traits fins, là
    où une moyenne les étalerait.

    Le recadrage vient ensuite, et il a été ajouté après le premier essai
    sur le terrain : le plan y était SUR UN ÉCRAN, et la photo portait le
    bureau, les onglets du navigateur et la barre des tâches. Le lecteur
    cherchait des murs dans une fenêtre de navigateur.
  */
  /*
    ON NE DÉBRUITE QUE SI L'IMAGE EST BRUITÉE — et c'est le masque qui le
    dit, pas un réglage.

    Le filtre médian efface les traits d'UN pixel : sur une fenêtre de trois
    par trois, un trait fin est minoritaire, et la valeur du milieu est celle
    du papier. Appliqué d'office, il a fait disparaître la moitié des murs
    d'un plan d'architecte pâle tracé au trait fin — celui-là même qui
    marchait la veille.

    Or un plan couvre deux à huit pour cent de sa feuille d'encre. Au-delà
    de douze, ce n'est plus du dessin : c'est du grain, des franges de
    moiré, ou une photo. C'est là, et seulement là, qu'on repasse au médian.
  */
  const premier = binariser(image);
  const bruitee = encre(premier) > 0.12;
  const lisse = bruitee ? median3(image) : image;
  const brutEntier = bruitee ? binariser(lisse) : premier;
  const zone = zoneDessinee(brutEntier);
  const brut = zone ? recadrer(brutEntier, zone) : brutEntier;
  const decalees = zone
    ? textes.map((t) => ({ ...t, x: t.x - zone.x, y: t.y - zone.y }))
    : textes;
  const masque = effacerBoites(brut, decalees);

  // 4. Les traits, les murs, les trous. L'angle de la feuille se mesure
  // AVANT les murs : c'est lui qui dit ce qui est d'équerre avec le plan.
  const traits = fusionnerTraits(segmentsDe(masque));
  const angle = anglePrincipal(masque);
  const murs = souderLesCoins(
    ecarterLeCadre(
      calerSurLeMasque(filtrerDEquerre(mursDesTraits(traits), angle), masque),
      masque.l,
      masque.h,
      /*
        On se donne plus de marge QUAND ON A RECADRÉ : le recadrage garde
        lui-même six pour cent de marge autour du dessin, donc rien de vrai
        ne traîne à quatre pour cent du bord — alors que le montant de
        fenêtre qu'on vient de couper, lui, y est encore. Sans recadrage, on
        reste prudent : la photo peut être cadrée au plus juste sur le plan.
      */
      { bord: zone ? 0.04 : 0.015 },
    ),
  );
  const ouvertures = ouverturesDesMurs(murs, masque, traits);
  if (bruitee) {
    /*
      LE CONSEIL QUI VAUT MIEUX QUE TOUS LES FILTRES.

      Une image aussi chargée, c'est presque toujours la PHOTO D'UN ÉCRAN :
      photographier une dalle revient à échantillonner une grille avec une
      autre, et les franges qui en sortent sont, pour le lecteur, de l'encre
      comme une autre. On sait les atténuer ; on ne sait pas les faire
      disparaître. Or celui qui photographie son écran a le fichier sous la
      main — une capture, le PDF, l'image d'origine — et ce fichier-là se lit
      sans une seule frange.
    */
    avertissements.push(
      'Image très bruitée (photo d’écran ?) : une capture d’écran ou le ' +
        'fichier d’origine donneraient un relevé bien plus juste.',
    );
  }
  if (murs.length === 0) {
    avertissements.push(
      'Aucun mur reconnu : la photo est peut-être trop floue, ou ce n’est pas un plan.',
    );
  }

  // 5. L'échelle.
  const echelle =
    reglage.echelle ??
    choisirEchelle(
      echelleParCotes(decalees, traits),
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
  const cx = brut.l / 2;
  const cy = brut.h / 2;
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

  const etiquettes = decalees
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
    vu: { masque, traits, murs, ouvertures, symboles, reduction, zone },
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
