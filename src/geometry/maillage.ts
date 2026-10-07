/**
 * LE MAILLAGE LIDAR — ce que RoomPlan lisse, relevé tel quel.
 *
 * Relevé du patron : « lent pour vraiment comprendre la structure des parois,
 * ne forme pas les angles des retours de volets roulants ». RoomPlan rend des
 * murs plans, sans épaisseur, et tout relief de moins de vingt ou trente
 * centimètres disparaît — le coffre de volet, la niche, le retour court.
 * Sous lui, ARKit tient pourtant la vraie surface : un maillage de triangles
 * à un ou deux centimètres, classé (mur, sol, plafond, porte, fenêtre…).
 *
 * PREMIÈRE ÉTAPE : LE RELEVER. À la fin de chaque scan, le natif écrit ce
 * maillage dans un fichier compact (`maillage-<id>.bin`) et le Diagnostic
 * le décrit et le partage. C'est sur des maillages RÉELS, rejoués ici au
 * banc, que la détection des coffres, des retours et des épaisseurs se
 * bâtira — pas sur ce qu'on imagine d'une pièce.
 *
 * LE FORMAT, petit-boutiste, lu ici et écrit par `RoomScanMaillage.swift` :
 *
 *   "EPM1"
 *   u32 nombre d'ancres
 *   par ancre : u32 sommets, u32 faces, u8 classé (0/1),
 *               f32 × 3 × sommets (x, y, z dans le monde ARKit),
 *               u32 × 3 × faces, puis u8 × faces si classé.
 */

/** Les classes d'ARKit (`ARMeshClassification`), dans son ordre. */
export const CLASSES = [
  'aucune',
  'mur',
  'sol',
  'plafond',
  'table',
  'siège',
  'fenêtre',
  'porte',
] as const;

export interface AncreDeMaillage {
  /** x, y, z à la suite, dans le monde ARKit (y vers le haut). */
  sommets: Float32Array;
  /** Trois indices par face. */
  faces: Uint32Array;
  /** Une classe par face (index dans `CLASSES`), ou null. */
  classes: Uint8Array | null;
}

export interface Maillage {
  ancres: AncreDeMaillage[];
  sommets: number;
  faces: number;
  classe: boolean;
}

/** Ce que le natif dit du maillage qu'il vient d'écrire. */
export interface MaillageReleve {
  ancres: number;
  faces: number;
  sommets: number;
  classe: boolean;
  fichier?: string;
  octets?: number;
}

const MAGIE = 'EPM1';

export function lireMaillage(octets: Uint8Array): Maillage {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let p = 0;
  const magie = String.fromCharCode(octets[0], octets[1], octets[2], octets[3]);
  if (magie !== MAGIE) throw new Error(`Pas un maillage EchoPlan (${magie})`);
  p = 4;
  const u32 = () => {
    const v = vue.getUint32(p, true);
    p += 4;
    return v;
  };
  const n = u32();
  const ancres: AncreDeMaillage[] = [];
  let sommets = 0;
  let faces = 0;
  let classe = false;
  for (let k = 0; k < n; k++) {
    const ns = u32();
    const nf = u32();
    const cl = octets[p];
    p += 1;
    // Les tableaux typés exigent un alignement : on copie, c'est plus sûr
    // qu'un décalage qui tombe juste une fois sur quatre.
    const s = new Float32Array(ns * 3);
    for (let i = 0; i < ns * 3; i++) {
      s[i] = vue.getFloat32(p, true);
      p += 4;
    }
    const f = new Uint32Array(nf * 3);
    for (let i = 0; i < nf * 3; i++) {
      f[i] = vue.getUint32(p, true);
      p += 4;
    }
    let c: Uint8Array | null = null;
    if (cl) {
      c = octets.slice(p, p + nf);
      p += nf;
      classe = true;
    }
    ancres.push({ sommets: s, faces: f, classes: c });
    sommets += ns;
    faces += nf;
  }
  return { ancres, sommets, faces, classe };
}

/** L'écriture, pour les bancs : construire un maillage et le relire. */
export function ecrireMaillage(ancres: AncreDeMaillage[]): Uint8Array {
  let taille = 4 + 4;
  for (const a of ancres) {
    taille += 9 + a.sommets.length * 4 + a.faces.length * 4 + (a.classes ? a.faces.length / 3 : 0);
  }
  const out = new Uint8Array(taille);
  const vue = new DataView(out.buffer);
  let p = 0;
  for (const ch of MAGIE) out[p++] = ch.charCodeAt(0);
  vue.setUint32(p, ancres.length, true);
  p += 4;
  for (const a of ancres) {
    vue.setUint32(p, a.sommets.length / 3, true);
    p += 4;
    vue.setUint32(p, a.faces.length / 3, true);
    p += 4;
    out[p++] = a.classes ? 1 : 0;
    for (let i = 0; i < a.sommets.length; i++) {
      vue.setFloat32(p, a.sommets[i], true);
      p += 4;
    }
    for (let i = 0; i < a.faces.length; i++) {
      vue.setUint32(p, a.faces[i], true);
      p += 4;
    }
    if (a.classes) {
      out.set(a.classes, p);
      p += a.classes.length;
    }
  }
  return out;
}

/** « 38 ancres · 312 000 faces · classé · 7,2 Mo » — la ligne du Diagnostic. */
export function phraseMaillage(m: MaillageReleve): string {
  if (m.ancres === 0) return 'aucun maillage LiDAR reçu de la session';
  const faces = m.faces.toLocaleString('fr-FR').replace(/ | /g, ' ');
  const bouts = [
    `${m.ancres} ancre${m.ancres > 1 ? 's' : ''}`,
    `${faces} faces`,
    m.classe ? 'classé' : 'sans classification',
  ];
  if (typeof m.octets === 'number') {
    bouts.push(`${(m.octets / 1_000_000).toFixed(1).replace('.', ',')} Mo`);
  }
  return bouts.join(' · ');
}
