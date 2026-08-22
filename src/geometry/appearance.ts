/**
 * Apparence relevée pendant le scan : couleurs moyennes et grilles de
 * couleurs (« textures ») des murs, du sol et des meubles.
 *
 * Le natif ne renvoie que des couleurs `#RRGGBB` ; tout le rendu — plan 2D,
 * vue 3D, PDF — passe par les helpers d'ici pour rester cohérent.
 */
import type { FloorData, SurfaceTexture } from 'react-native-room-scan';
import type { Pt, WallSeg } from './floorplan';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Mélange linéaire de deux couleurs `#RRGGBB`. */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa
    .map((v, i) =>
      Math.round(v + (pb[i] - v) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Luminance perçue (0 = noir, 1 = blanc). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Encre lisible sur un fond donné. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.55 ? '#0B0D12' : '#F4F6FA';
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const valid = (c?: string): c is string => !!c && HEX.test(c);

const rgbDe = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const hexDe = (c: [number, number, number]) =>
  `#${c
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;

/**
 * LA GRILLE RELEVÉE EST BRUYANTE : on la lisse avant de s'en servir.
 *
 * Une case de mur, c'est une poignée de pixels lus au vol pendant que le
 * téléphone bouge. Un reflet, une ombre portée, un passage de main, et la
 * case sort d'une teinte franchement différente de ses voisines. Sur six
 * cases par quatre, ça se voit immédiatement : un damier de gris aléatoires
 * là où il n'y a qu'un mur peint.
 *
 * On corrige en deux temps, comme le ferait n'importe quel traitement
 * d'image : la MÉDIANE du voisinage remplace ce qui s'en écarte trop
 * (c'est le remède classique au bruit ponctuel, et il ne bave pas sur les
 * vraies frontières), puis un léger flou réunit ce qui reste. Un vrai mur
 * d'accent garde sa couleur : il occupe plusieurs cases, donc c'est LUI la
 * médiane.
 */
/*
  UNE CAMÉRA NE VOIT PAS UNE COULEUR, ELLE VOIT UNE COULEUR ÉCLAIRÉE.

  Deux relevés du patron sur la même capture : « mon mur blanc devient
  marron » et « il y a des lignes horizontales sur les murs en couleur ».
  Les deux ont la même origine, et ce n'est pas le relevé qui est en cause —
  il est fidèle. C'est ce qu'on en fait.
*/

/**
 * APLATIT L'ÉCLAIRAGE D'UN MUR, ET GARDE SA PEINTURE.
 *
 * Le haut d'un mur reçoit moins de lumière que le bas, ou l'inverse selon la
 * fenêtre : la grille relevée sort en DÉGRADÉ vertical. Et comme chaque
 * rangée s'écarte de la teinte moyenne dans le même sens que sa voisine, le
 * lissage anti-bruit la juge « partagée » et la CONSERVE — le mécanisme qui
 * devait nettoyer protégeait l'éclairage. D'où les lignes horizontales.
 *
 * ON DISTINGUE L'ÉCLAIRAGE DE LA PEINTURE PAR LA FORME DE L'ÉCART :
 *
 *   — l'éclairage est PROGRESSIF : chaque rangée un peu plus sombre que la
 *     précédente, dans le même sens, par petits pas comparables ;
 *   — la peinture est FRANCHE : un soubassement, un lambris, c'est UN saut
 *     net entre deux rangées, et rien avant ni après.
 *
 * Ce qui varie horizontalement n'est jamais touché : un pan d'accent, une
 * porte, une trace d'humidité vivent dans les colonnes, pas dans les
 * rangées.
 */
export function aplatirEclairage(tex: SurfaceTexture): SurfaceTexture {
  const { cols, rows, texels } = tex;
  if (rows < 3) return tex;
  /** La teinte moyenne de chaque rangée, ou `null` si la rangée est vide. */
  const parRangee: ([number, number, number] | null)[] = [];
  for (let r = 0; r < rows; r++) {
    const lot: [number, number, number][] = [];
    for (let c = 0; c < cols; c++) {
      const t = texels[r * cols + c];
      if (valid(t)) lot.push(rgbDe(t));
    }
    parRangee.push(
      lot.length === 0
        ? null
        : ([0, 1, 2].map(
            (k) => lot.reduce((s2, p) => s2 + p[k], 0) / lot.length,
          ) as [number, number, number]),
    );
  }
  if (parRangee.some((p) => !p)) return tex;
  /** L'écart de luminosité d'une rangée à la suivante. */
  const pas: number[] = [];
  for (let r = 1; r < rows; r++) {
    const a = parRangee[r - 1]!;
    const b = parRangee[r]!;
    pas.push((b[0] + b[1] + b[2]) / 3 - (a[0] + a[1] + a[2]) / 3);
  }
  const amplitude = Math.max(...pas.map(Math.abs));
  const total = Math.abs(pas.reduce((s2, v) => s2 + v, 0));
  /*
    UN SAUT FRANC SE RECONNAÎT À CE QU'IL DOMINE LES AUTRES.

    Sur un dégradé d'éclairage, tous les pas se ressemblent : le plus grand
    ne vaut guère plus que la moyenne. Sur un soubassement, un pas vaut à
    lui seul presque tout l'écart du mur, et les autres sont plats. On
    compare donc le plus grand pas à la somme : au-delà de 70 %, c'est une
    frontière, on ne touche à rien.
  */
  if (total <= 0.5) return tex;
  if (amplitude / total > 0.7 && amplitude > 12) return tex;
  /*
    ET L'ON N'APLATIT QUE CE QUI RESTE DISCRET.

    Un dégradé de cent unités entre le haut et le bas n'est plus un jeu de
    lumière : c'est une ombre portée massive, ou deux murs confondus. On
    préfère alors laisser voir le relevé plutôt que d'inventer un aplat.
  */
  if (total > 90) return tex;

  // La teinte du mur : la moyenne des rangées, débarrassée du gradient.
  const teinte = [0, 1, 2].map(
    (k) => parRangee.reduce((s2, p) => s2 + p![k], 0) / rows,
  ) as [number, number, number];
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const decal = [0, 1, 2].map((k) => teinte[k] - parRangee[r]![k]);
    for (let c = 0; c < cols; c++) {
      const t = texels[r * cols + c];
      if (!valid(t)) {
        out.push(t);
        continue;
      }
      const p = rgbDe(t);
      // On DÉPLACE la case du même écart que sa rangée : ce qui distinguait
      // une colonne de sa voisine reste intact, seul le gradient part.
      out.push(
        hexDe([0, 1, 2].map((k) => p[k] + decal[k]) as [number, number, number]),
      );
    }
  }
  return { ...tex, texels: out };
}

/**
 * LA BALANCE DES BLANCS DE LA PIÈCE.
 *
 * Un mur blanc sous une ampoule chaude renvoie du beige : le relevé est
 * fidèle, et le résultat est faux. Personne ne dira jamais « mon mur est
 * marron » de son mur blanc.
 *
 * LA SURFACE LA PLUS CLAIRE D'UN LOGEMENT EST BLANCHE — c'est vrai du
 * plafond et des murs dans l'immense majorité des cas, et c'est l'hypothèse
 * que fait tout appareil photo du monde. Si la plus claire des surfaces
 * relevées tire vers l'orange, ce n'est pas la peinture, c'est l'ampoule :
 * on annule sa dérive, et toutes les autres suivent du même gain.
 *
 * ON NE CORRIGE QUE CE QUI RESSEMBLE À UN BLANC DÉVIÉ. Un mur bleu franc
 * n'est pas un mur blanc mal éclairé : ramener sa teinte au neutre
 * effacerait ce que l'électricien a relevé, et repeindrait le salon du
 * client au passage.
 */
export function balancerLesBlancs(couleurs: string[]): string[] {
  const gain = gainDesBlancs(couleurs);
  if (!gain) return couleurs;
  return couleurs.map((c) => (valid(c) ? appliquerGain(c, gain) : c));
}

/** Applique un gain par canal à une couleur `#RRGGBB`. */
export function appliquerGain(
  hex: string,
  gain: [number, number, number],
): string {
  const p = rgbDe(hex);
  return hexDe([0, 1, 2].map((k) => p[k] * gain[k]) as [
    number,
    number,
    number,
  ]);
}

/**
 * ÉQUILIBRE TOUTE UNE SCÈNE D'UN SEUL GAIN.
 *
 * Murs, sol et meubles ont été vus sous la même ampoule : corriger chaque
 * surface pour elle-même reviendrait à blanchir tout le logement, meubles
 * compris — un canapé rouge deviendrait rose, et le relevé ne vaudrait plus
 * rien.
 *
 * Le gain se calcule sur les MURS seuls, parce que c'est d'eux qu'on sait
 * quelque chose : le blanc du bâtiment. Un meuble clair peut être crème,
 * beige ou chêne sans que ce soit un défaut d'éclairage. Puis il s'applique
 * à tout, y compris aux grilles, case par case.
 */
export function equilibrerLaScene<
  W extends { color?: string; texture?: SurfaceTexture },
  O extends { color?: string; texture?: SurfaceTexture },
>(scene: { walls: W[]; objects: O[] }): { walls: W[]; objects: O[] } {
  const reperes = scene.walls.flatMap((w) => [
    ...(w.color ? [w.color] : []),
    ...(w.texture?.texels ?? []),
  ]);
  const gain = gainDesBlancs(reperes);
  if (!gain) return scene;
  const corriger = <T extends { color?: string; texture?: SurfaceTexture }>(
    x: T,
  ): T => ({
    ...x,
    color: x.color && valid(x.color) ? appliquerGain(x.color, gain) : x.color,
    texture: x.texture
      ? {
          ...x.texture,
          texels: x.texture.texels.map((t) =>
            valid(t) ? appliquerGain(t, gain) : t,
          ),
        }
      : x.texture,
  });
  return {
    walls: scene.walls.map(corriger),
    objects: scene.objects.map(corriger),
  };
}

/**
 * LE GAIN QUI REMET LE BLANC D'APLOMB, ou `null` s'il n'y a rien à corriger.
 *
 * Séparé de son application parce qu'UNE SCÈNE SE CORRIGE D'UN SEUL GAIN :
 * murs, sol et meubles ont été vus sous la même ampoule. Corriger chaque
 * surface pour elle-même reviendrait à blanchir tout le logement, meubles
 * compris — un canapé rouge deviendrait rose.
 */
export function gainDesBlancs(
  couleurs: string[],
): [number, number, number] | null {
  const lot = couleurs.filter(valid);
  if (lot.length === 0) return null;
  let repere: [number, number, number] | null = null;
  let clarte = -1;
  for (const c of lot) {
    const p = rgbDe(c);
    const l = (p[0] + p[1] + p[2]) / 3;
    if (l > clarte) {
      clarte = l;
      repere = p;
    }
  }
  if (!repere) return null;
  const max = Math.max(...repere);
  const min = Math.min(...repere);
  /*
    TROIS GARDE-FOUS, ET CHACUN DIT UN CAS RÉEL.

    — Une surface sombre ne dit rien du blanc : sous 110, on ne conclut pas.
    — Un écart de plus d'un quart entre canaux, ce n'est plus une dérive
      d'éclairage : c'est une couleur, et elle reste.
    — Un écart minuscule ne vaut pas une correction : on ne remue pas tout
      le relevé pour trois unités.
  */
  if (clarte < 110) return null;
  if (max - min > max * 0.26) return null;
  if (max - min < 6) return null;

  return [0, 1, 2].map((k) => clarte / Math.max(1, repere![k])) as [
    number,
    number,
    number,
  ];
}

function lisser(tex: SurfaceTexture): SurfaceTexture {
  const { cols, rows, texels } = tex;
  const pixels = texels.map((t) => (valid(t) ? rgbDe(t) : null));
  const voisins = (col: number, row: number, rayon = 1) => {
    const out: [number, number, number][] = [];
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        const x = col + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const p = pixels[y * cols + x];
        if (p) out.push(p);
      }
    }
    return out;
  };
  const mediane = (liste: [number, number, number][]) =>
    [0, 1, 2].map((k) => {
      const v = liste.map((p) => p[k]).sort((x, y) => x - y);
      return v[Math.floor((v.length - 1) / 2)];
    }) as [number, number, number];

  /**
   * LA TEINTE DE LA SURFACE, ET LA PREUVE QU'ON S'EN ÉCARTE.
   *
   * Le lissage local ne suffisait pas, et le chantier l'a dit deux fois :
   * « on voit encore une formation de carrés de couleurs différentes ». La
   * médiane du voisinage rattrape la case aberrante ; elle ne rattrape pas
   * un mur où CHAQUE case est à quinze unités de sa voisine — ce qui est
   * l'ordinaire d'un relévé fait en marchant, où l'exposition de la caméra
   * bouge d'une seconde à l'autre. Le résultat reste un patchwork, et un
   * mur peint d'une seule couleur n'a pas à sortir en patchwork.
   *
   * On renverse donc la charge de la preuve. La surface a UNE teinte — la
   * médiane de tout ce qu'on en a vu — et chaque case doit la porter, SAUF
   * si elle s'en écarte franchement ET que ses voisines s'en écartent dans
   * le même sens. Un lambris, un pan d'accent, une trace d'humidité : ces
   * choses-là couvrent plusieurs cases, elles survivent. Le bruit
   * d'exposition, non : il change de signe d'une case à l'autre.
   */
  const tous = pixels.filter(Boolean) as [number, number, number][];
  const dominante = tous.length > 0 ? mediane(tous) : null;
  /** Au-delà : la case a peut-être quelque chose à dire. */
  const SEUIL = 30;

  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const p = pixels[row * cols + col];
      const autour = voisins(col, row);
      if (!p || autour.length === 0 || !dominante) {
        out.push(texels[row * cols + col]);
        continue;
      }
      const med = mediane(autour);
      // Franchement hors du lot : c'est du bruit, pas une couleur de mur.
      const ecartVoisins = Math.max(...[0, 1, 2].map((k) => Math.abs(p[k] - med[k])));
      const base = ecartVoisins > 46 ? med : p;
      // Puis un flou léger : deux tiers la case, un tiers son voisinage.
      const moyenne = [0, 1, 2].map(
        (k) => autour.reduce((t, q) => t + q[k], 0) / autour.length,
      ) as [number, number, number];
      const lisse2 = [0, 1, 2].map(
        (k) => base[k] * 0.67 + moyenne[k] * 0.33,
      ) as [number, number, number];

      // Ce qui sépare cette case de la teinte de la surface, et le CANAL
      // sur lequel ça se joue.
      let canal = 0;
      let ecart = 0;
      for (const k of [0, 1, 2]) {
        const d = Math.abs(lisse2[k] - dominante[k]);
        if (d > ecart) {
          ecart = d;
          canal = k;
        }
      }
      if (ecart <= SEUIL) {
        // Dans la famille : c'est la teinte de la surface, pas une autre.
        // On garde un souffle de la case (un dixième) pour que le mur ne
        // sorte pas plat comme un aplat de peinture numérique.
        out.push(
          hexDe([0, 1, 2].map((k) => dominante[k] * 0.9 + lisse2[k] * 0.1) as [
            number,
            number,
            number,
          ]),
        );
        continue;
      }
      // Écart franc : il faut qu'il soit PARTAGÉ. On regarde les quatre
      // voisines directes : au moins deux doivent s'écarter dans le même
      // sens, sur le même canal.
      const sens = Math.sign(lisse2[canal] - dominante[canal]);
      let accord = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as [number, number][]) {
        const x = col + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const q = pixels[y * cols + x];
        if (!q) continue;
        const d = q[canal] - dominante[canal];
        if (Math.sign(d) === sens && Math.abs(d) > SEUIL * 0.6) accord += 1;
      }
      if (accord >= 2) {
        /*
          UN VRAI PAN GARDE SA COULEUR, ENTIÈREMENT.

          Une première version le ramenait à mi-chemin de la teinte
          dominante « pour rester en famille ». Sur un mur peint en deux
          couleurs — la moitié verte, la moitié bleue — la médiane tombe
          d'un côté ou de l'autre, et l'autre moitié virait au gris-bleu :
          le pan d'accent perdait précisément ce qui en fait un pan
          d'accent. Ce que ses voisines confirment, on le garde tel quel.
        */
        out.push(hexDe(lisse2));
        continue;
      }
      // Seule de son avis : c'est un reflet, pas une couleur de mur.
      out.push(
        hexDe([0, 1, 2].map((k) => dominante[k] * 0.85 + lisse2[k] * 0.15) as [
          number,
          number,
          number,
        ]),
      );
    }
  }
  return { ...tex, texels: out };
}

/**
 * Le lissage coûte quelques dizaines d'opérations ; le rendu, lui, échantillonne
 * des milliers de fois par image. On le fait donc UNE fois par texture, et on
 * s'en souvient — la grille ne change pas d'une image à l'autre.
 */
const lisses = new WeakMap<SurfaceTexture, SurfaceTexture>();
function lisse(tex: SurfaceTexture): SurfaceTexture {
  const connu = lisses.get(tex);
  if (connu) return connu;
  /*
    L'ÉCLAIRAGE PART D'ABORD, LE BRUIT ENSUITE.

    Dans l'autre ordre, le lissage voit un dégradé régulier — chaque rangée
    s'écartant de la teinte moyenne dans le même sens que sa voisine — et le
    juge « partagé », donc réel : il le PROTÈGE. C'est ce qui dessinait les
    lignes horizontales que le patron a photographiées. Le gradient retiré,
    il ne reste que ce qu'il sait traiter : les cases aberrantes.
  */
  const fait = lisser(aplatirEclairage(tex));
  lisses.set(tex, fait);
  return fait;
}

/**
 * Couleur d'un texel. `u` = 0 à l'extrémité A, 1 à l'extrémité B ;
 * `v` = 0 en haut de la surface, 1 en bas.
 *
 * L'échantillonnage est BILINÉAIRE : on mélange les quatre cases voisines
 * au prorata de la distance, au lieu de prendre la plus proche. Une grille
 * de six cases par quatre étalée sur trois mètres de mur donnait sinon des
 * carrés de cinquante centimètres, francs comme un carrelage — et c'est
 * exactement ce qu'on voyait : un damier, là où le mur est uni.
 */
export function sampleTexture(
  tex: SurfaceTexture | undefined,
  u: number,
  v: number,
): string | undefined {
  if (!tex || tex.cols < 1 || tex.rows < 1) return undefined;
  const t = lisse(tex);
  // Les couleurs valent au CENTRE des cases : entre deux centres on
  // interpole, au-delà des bords on prend la case du bord.
  const fx = clamp01(u) * t.cols - 0.5;
  const fy = clamp01(v) * t.rows - 0.5;
  const x0 = Math.max(0, Math.min(t.cols - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(t.rows - 1, Math.floor(fy)));
  const x1 = Math.max(0, Math.min(t.cols - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(t.rows - 1, y0 + 1));
  const ax = Math.max(0, Math.min(1, fx - x0));
  const ay = Math.max(0, Math.min(1, fy - y0));
  const coin = (cx: number, cy: number) => {
    const c = t.texels[cy * t.cols + cx];
    return valid(c) ? rgbDe(c) : null;
  };
  const c00 = coin(x0, y0);
  const c10 = coin(x1, y0);
  const c01 = coin(x0, y1);
  const c11 = coin(x1, y1);
  if (!c00 && !c10 && !c01 && !c11) return undefined;
  const p00 = c00 ?? c10 ?? c01 ?? c11!;
  const melange = [0, 1, 2].map((k) => {
    const h0 = (c00 ?? p00)[k] * (1 - ax) + (c10 ?? p00)[k] * ax;
    const h1 = (c01 ?? p00)[k] * (1 - ax) + (c11 ?? p00)[k] * ax;
    return h0 * (1 - ay) + h1 * ay;
  }) as [number, number, number];
  return hexDe(melange);
}

/** Couleur du sol au point (x, z) du monde, à défaut sa moyenne. */
export function floorColorAt(floor: FloorData | null | undefined, p: Pt): string | undefined {
  if (!floor) return undefined;
  const t = floor.texture;
  if (t && t.maxX > t.minX && t.maxZ > t.minZ) {
    const c = sampleTexture(
      t,
      (p.x - t.minX) / (t.maxX - t.minX),
      (p.z - t.minZ) / (t.maxZ - t.minZ),
    );
    if (c) return c;
  }
  return valid(floor.color) ? floor.color : undefined;
}

/** Vrai si le scan porte au moins une couleur exploitable (toutes pièces). */
export function hasCapturedColors(
  walls: WallSeg[],
  floors: (FloorData | null | undefined)[],
): boolean {
  return walls.some((w) => valid(w.color)) || floors.some((f) => valid(f?.color));
}

// ------------------------------------------------------- semis du sol

/** Test d'appartenance d'un point à un polygone (lancer de rayon). */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Pas du semis, en mètres : choisi pour que les points soient espacés
 * d'environ `targetPx` à l'écran, sur une échelle « ronde » (0,125 m, 0,25 m…).
 */
export function dotStep(scalePxPerM: number, targetPx = 15): number {
  let step = 0.25;
  if (scalePxPerM <= 0) return step;
  while (step * scalePxPerM < targetPx * 0.7) step *= 2;
  while (step * scalePxPerM > targetPx * 1.6) step /= 2;
  return Math.min(2, Math.max(0.0625, step));
}

/**
 * Semis régulier de points couvrant l'intérieur d'un polygone : c'est le
 * « fond du sol » qui distingue au premier coup d'œil la surface des murs.
 */
export function floorDots(poly: Pt[], step: number, max = 1800): Pt[] {
  if (poly.length < 3 || step <= 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  // Semis calé sur l'origine du monde : il ne glisse pas quand on édite le plan.
  const x0 = Math.ceil(minX / step) * step;
  const z0 = Math.ceil(minZ / step) * step;
  const out: Pt[] = [];
  for (let z = z0; z <= maxZ && out.length < max; z += step) {
    for (let x = x0; x <= maxX && out.length < max; x += step) {
      const p = { x, z };
      if (pointInPolygon(p, poly)) out.push(p);
    }
  }
  return out;
}

/**
 * LE SEMIS DU SOL, ARRÊTÉ AU NU DES MURS.
 *
 * Relevé du patron, capture 3D à l'appui : « la surface ne doit pas se voir
 * à travers les murs du modèle 3D ». Sur l'image, les points du sol
 * apparaissent DANS la bande du mur avant.
 *
 * Ce n'est pas un défaut de tri — le semis est peint en premier, tout au
 * fond. C'est que le mur de devant est estompé (l'écorché, qui existe pour
 * qu'on voie DANS la pièce sans la retourner) et qu'un mur à quinze pour
 * cent d'opacité laisse voir ce qui est dessous.
 *
 * Le remède est donc géométrique : le contour d'une pièce suit l'AXE de ses
 * murs, et le semis s'étendait sous la moitié de leur épaisseur. Arrêté au
 * nu intérieur, il n'y a plus rien à voir au travers — et le dessin gagne un
 * liseré net le long des murs, comme sur un plan d'architecte.
 *
 * Sans mur connu, on ne retranche rien : mieux vaut un semis entier qu'un
 * semis rogné au hasard.
 */
export function pointsDuSol(
  poly: Pt[],
  murs: { a: Pt; b: Pt; type?: string }[],
  step: number,
  max = 1800,
  marge = 0.075,
): Pt[] {
  const bruts = floorDots(poly, step, max);
  if (murs.length === 0) return bruts;
  const distance = (p: Pt, w: { a: Pt; b: Pt }) => {
    const dx = w.b.x - w.a.x;
    const dz = w.b.z - w.a.z;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-9) return Math.hypot(p.x - w.a.x, p.z - w.a.z);
    const t = Math.max(
      0,
      Math.min(1, ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / l2),
    );
    return Math.hypot(p.x - (w.a.x + dx * t), p.z - (w.a.z + dz * t));
  };
  return bruts.filter((p) =>
    murs.every((w) => (w.type ?? 'wall') !== 'wall' || distance(p, w) > marge),
  );
}
