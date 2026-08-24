/**
 * L'ÉCHELLE — combien de pixels valent un mètre.
 *
 * C'est la seule chose qu'un dessin ne dit pas de lui-même. Un plan est
 * proportionnel ; sans échelle, on n'a qu'une forme. Et un plan d'électricien
 * sans cotes justes ne sert à rien : c'est sur ces centimètres-là qu'on
 * commande la gaine, qu'on perce et qu'on chiffre.
 *
 * Quatre sources, dans cet ordre de confiance :
 *
 *   1. LES COTES ÉCRITES. Un nombre posé sur une ligne de cote, et la
 *      longueur de cette ligne : le rapport donne l'échelle. C'est la seule
 *      source EXACTE, parce qu'elle vient du plan lui-même. On en lit
 *      autant qu'on peut et l'on prend la médiane — une cote mal lue par
 *      l'OCR (un 8 pour un 3) ne doit pas emporter tout le relevé.
 *   2. L'ÉCHELLE DÉCLARÉE, quand quelqu'un a saisi « 1:50 » et que l'image
 *      vient d'un PDF dont on connaît la résolution.
 *   3. LES PORTES. Un plan sans une seule cote lisible reste lisible : une
 *      porte intérieure de logement fait 83 cm de passage dans presque tout
 *      le bâti français (73 pour les petites, 93 pour les accessibles). La
 *      médiane des portes détectées cale le plan à quelques pour cent près.
 *      Ce n'est pas exact, et l'app le DIT — le bandeau porte la mention et
 *      invite à confirmer une cote au doigt.
 *   4. LA MAIN. Deux points désignés et une distance saisie : c'est ce que
 *      fait tout le monde depuis toujours, et cela reste le dernier mot.
 *
 * ON NE DEVINE JAMAIS EN SILENCE. `Echelle.origine` accompagne le plan
 * jusqu'à l'écran : un relevé calé sur des portes n'a pas le même statut
 * qu'un relevé calé sur les cotes du bureau d'études.
 */
import { centreDuTexte, type TexteLu } from './entree';
import type { P } from './trace';
import { fusionnerTraits, type Trait } from './traits';

export interface Echelle {
  pxParMetre: number;
  origine: 'cotes' | 'declaree' | 'portes' | 'main';
  /** De 0 à 1 : ce qu'on est prêt à parier sur cette échelle. */
  confiance: number;
  /** Une phrase pour l'écran : d'où elle vient, et sur combien d'appuis. */
  detail: string;
}

/**
 * LIT UNE COTE ÉCRITE, en mètres.
 *
 * Les usages relevés sur de vrais plans français :
 *
 *   « 3.50 » « 3,50 » → mètres, deux décimales : la forme la plus courante ;
 *   « 350 » → centimètres, la forme des plans de menuiserie ;
 *   « 3500 » → millimètres, la forme des plans de bureau d'études ;
 *   « 1.60/2.48 » → largeur/hauteur d'une menuiserie : seule la première
 *       compte pour l'échelle du plan, la seconde est une hauteur ;
 *   « S : 12.73 m² » → une SURFACE, et surtout pas une longueur ;
 *   « 1:50 » → l'échelle déclarée, qui se traite ailleurs.
 *
 * Rendre `null` est un résultat, pas un échec : la plupart des textes d'un
 * plan ne sont pas des cotes.
 */
export function lireUneCote(texte: string): number | null {
  const t = texte.trim().replace(/,/g, '.');
  // Une surface, un pourcentage, une échelle, un niveau : pas une longueur.
  if (/m²|m2|%|:|²/i.test(t)) return null;
  if (/[a-zA-Z]{3,}/.test(t.replace(/m$/i, ''))) return null;
  const premier = t.split('/')[0];
  const m = premier.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const v = Number(m[0]);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (m[1]) {
    // Écrit avec des décimales : des mètres, sauf à dépasser la taille d'un
    // immeuble — auquel cas ce sont des centimètres écrits au dixième.
    return v > 60 ? v / 100 : v;
  }
  if (v >= 1000) return v / 1000;
  if (v >= 30) return v / 100;
  return v;
}

/** Projection d'un point sur la droite d'un trait. */
function projeter(t: Trait, p: P): { s: number; d: number } {
  const ang = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const dx = p.x - t.a.x;
  const dy = p.y - t.a.y;
  return { s: dx * ux + dy * uy, d: -dy * ux + dx * uy };
}

const mediane = (v: number[]) => {
  const t = v.slice().sort((a, b) => a - b);
  return t.length ? t[Math.floor(t.length / 2)] : 0;
};

/**
 * L'ÉCHELLE TIRÉE DES COTES ÉCRITES.
 *
 * Le point délicat n'est pas de lire le nombre, c'est de savoir CE QU'IL
 * COTE. Une chaîne de cotation porte dix nombres sur une seule et même
 * ligne : prendre la longueur de la ligne entière pour chacun donnerait dix
 * échelles fausses, toutes du même côté — et la médiane ne sauverait rien.
 *
 * Sur un plan, ce qui borne une cote, ce sont ses MARQUES : les petits
 * traits obliques ou les attaches perpendiculaires qui coupent la ligne. On
 * les projette sur la ligne, on encadre le texte par les deux plus proches,
 * et c'est cette portion-là qui vaut le nombre écrit. Sans marque trouvée,
 * on retombe sur la ligne entière — ce qui reste juste pour une cote seule.
 */
export function echelleParCotes(
  textes: TexteLu[],
  traits: Trait[],
): Echelle | null {
  /*
    ON RECOUD LES LIGNES DE COTE AVANT DE LES MESURER.

    Le nombre est posé SUR sa ligne, et l'on efface du masque tout ce que
    l'OCR a lu : la ligne de cote se retrouve donc coupée en deux morceaux de
    part et d'autre du nombre — et le nombre, tombant dans l'intervalle, ne
    se rattachait à aucun des deux. Trois mètres cotés ressortaient en cent
    trente-neuf pixels, ou en rien du tout. On recoud donc les morceaux
    colinéaires, largement, mais pour ce calcul-là seulement : les murs, eux,
    n'ont pas à franchir un tel écart.
  */
  const lignes = fusionnerTraits(traits, { tolEcart: 2, ecartMax: 60 });
  const appuis: number[] = [];
  for (const texte of textes) {
    const metres = lireUneCote(texte.texte);
    if (!metres || metres < 0.2 || metres > 60) continue;
    const c = centreDuTexte(texte);
    // Le texte d'une cote se pose SUR sa ligne, ou juste au-dessus : on ne
    // cherche pas plus loin que deux hauteurs de texte.
    const portee = Math.max(texte.h * 2.2, 12);
    /*
      LA LIGNE DE COTE EST LE PLUS LONG TRAIT DU SECTEUR, PAS LE PLUS PROCHE.

      On prenait le trait le plus proche du nombre : c'était l'arrêt oblique
      posé juste à côté de lui, trente-cinq pixels de long, et la cote de
      quatre mètres se trouvait rapportée à trente-cinq pixels. Une ligne de
      cote domine son secteur par sa LONGUEUR ; les arrêts, les attaches et
      les renvois qui l'entourent sont tous courts.
    */
    let ligne: Trait | null = null;
    for (const t of lignes) {
      if (t.len < texte.l * 0.8) continue;
      const p = projeter(t, c);
      if (p.s < -2 || p.s > t.len + 2) continue;
      if (Math.abs(p.d) > portee) continue;
      if (!ligne || t.len > ligne.len) ligne = t;
    }
    if (!ligne) continue;

    // Les marques qui coupent la ligne : des traits courts dont un point
    // tombe sur elle, et qui ne lui sont pas parallèles.
    const angL = Math.atan2(ligne.b.y - ligne.a.y, ligne.b.x - ligne.a.x);
    const marques: number[] = [0, ligne.len];
    for (const t of traits) {
      if (t === ligne || t.len > ligne.len * 0.5) continue;
      const angT = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
      let da = Math.abs(angT - angL) % Math.PI;
      if (da > Math.PI / 2) da = Math.PI - da;
      if (da < 0.3) continue;
      /*
        UNE MARQUE CROISE LA LIGNE, elle ne passe pas à côté.

        On acceptait tout trait court dont un bout tombait à moins de six
        dixièmes de sa longueur de la ligne : un symbole posé à dix pixels
        d'elle devenait une marque de cotation, et la portion mesurée pour
        « 400 » tombait à deux cent cinquante pixels — soit une échelle
        fausse de moitié, donc un logement de deux mètres cinquante de large.
        Le bon test est le croisement : les deux bouts du trait tombent de
        part et d'autre de la ligne, ou l'un d'eux est posé dessus.
      */
      const pa = projeter(ligne, t.a);
      const pb = projeter(ligne, t.b);
      const croise = pa.d * pb.d <= 0 || Math.min(Math.abs(pa.d), Math.abs(pb.d)) <= 3;
      if (!croise) continue;
      const s = (pa.s + pb.s) / 2;
      if (s >= -2 && s <= ligne.len + 2) marques.push(s);
    }
    marques.sort((a, b) => a - b);
    const st = projeter(ligne, c).s;
    let avant = 0;
    for (const s of marques) if (s <= st - 1) avant = Math.max(avant, s);
    const apres = marques.find((s) => s > st + 1) ?? ligne.len;
    const portion = apres - avant;
    if (portion < 8) continue;
    appuis.push(portion / metres);
  }

  if (appuis.length === 0) return null;
  const med = mediane(appuis);
  // On ne garde que ce qui s'accorde à un dixième près : une cote mal lue
  // par l'OCR, ou rattachée à la mauvaise ligne, doit sortir du vote.
  const bons = appuis.filter((v) => Math.abs(v - med) <= med * 0.1);
  const valeur = mediane(bons.length ? bons : appuis);
  const accord = bons.length / appuis.length;
  return {
    pxParMetre: valeur,
    origine: 'cotes',
    confiance: Math.min(0.99, 0.6 + 0.1 * bons.length) * accord,
    detail:
      bons.length > 1
        ? `${bons.length} cotes du plan concordent`
        : 'une seule cote lisible sur le plan',
  };
}

/**
 * L'ÉCHELLE DÉCLARÉE : « 1:50 » sur une image dont on connaît la finesse.
 *
 * Un pouce vaut 2,54 cm ; à 1/50, un pouce de papier vaut 1,27 m de mur.
 * C'est exact quand le PDF est à l'échelle — ce qui n'est PAS le cas d'un
 * plan imprimé « ajusté à la page », d'où la confiance en retrait.
 */
export function echelleDeclaree(dpi?: number, ratio?: number): Echelle | null {
  if (!dpi || !ratio || dpi <= 0 || ratio <= 0) return null;
  const pxParMetre = (dpi / 0.0254) / ratio;
  return {
    pxParMetre,
    origine: 'declaree',
    confiance: 0.75,
    detail: `échelle 1:${Math.round(ratio)} à ${Math.round(dpi)} points par pouce`,
  };
}

/**
 * L'ÉCHELLE TIRÉE DES PORTES — le dernier recours automatique.
 *
 * Une porte intérieure de logement français fait 83 cm de passage : c'est le
 * bloc-porte standard, celui qu'on trouve dans neuf logements sur dix. On
 * prend la médiane des portes lues, on la déclare valant 83 cm, et l'on
 * annonce clairement d'où vient l'échelle. Sur un plan sans une seule cote
 * écrite — il y en a beaucoup — c'est la différence entre un plan à cinq
 * pour cent près et pas de plan du tout.
 */
export const PASSAGE_PORTE = 0.83;

export function echelleParPortes(largeurs: number[]): Echelle | null {
  const bonnes = largeurs.filter((l) => l > 0);
  if (!bonnes.length) return null;
  const med = mediane(bonnes);
  return {
    pxParMetre: med / PASSAGE_PORTE,
    origine: 'portes',
    confiance: 0.45,
    detail: `calée sur ${bonnes.length} porte${bonnes.length > 1 ? 's' : ''} à 83 cm`,
  };
}

/** L'échelle saisie à la main : deux points désignés, une distance donnée. */
export function echelleALaMain(pixels: number, metres: number): Echelle | null {
  if (!(pixels > 0) || !(metres > 0)) return null;
  return {
    pxParMetre: pixels / metres,
    origine: 'main',
    confiance: 1,
    detail: `${metres.toFixed(2)} m mesurés à la main`,
  };
}

/**
 * Choisit l'échelle à retenir.
 *
 * La main l'emporte toujours : c'est quelqu'un qui a regardé. Viennent
 * ensuite les cotes du plan, l'échelle déclarée, puis les portes.
 */
export function choisirEchelle(...candidates: (Echelle | null)[]): Echelle | null {
  const ordre: Echelle['origine'][] = ['main', 'cotes', 'declaree', 'portes'];
  const vues = candidates.filter((e): e is Echelle => !!e && e.pxParMetre > 0);
  for (const o of ordre) {
    const trouve = vues.filter((e) => e.origine === o);
    if (trouve.length) {
      return trouve.sort((a, b) => b.confiance - a.confiance)[0];
    }
  }
  return null;
}
