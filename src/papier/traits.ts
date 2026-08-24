/**
 * LES TRAITS D'UN PLAN — de l'encre à des segments.
 *
 * Tout ce qui compte sur un plan est un trait : la maçonnerie en porte deux
 * par mur, la menuiserie un ou deux dans son trou, la cotation trois par
 * cote. On cherche donc des segments, avec leurs deux bouts et leur
 * épaisseur — pas des contours, pas des courbes.
 *
 * POURQUOI LA TRANSFORMÉE DE HOUGH, ET PAS UN SUIVI DE PIXELS. Un suivi
 * s'arrête au premier croisement, et un plan n'est QUE des croisements : un
 * refend coupe un mur, une ligne de cote traverse une attache, un vantail
 * touche son mur. La transformée, elle, cherche la DROITE : elle voit le
 * trait entier même haché par dix croisements, par un pointillé, ou par le
 * grain d'une photo — et c'est exactement ce qu'on lui demande.
 *
 * ON VOTE AVEC TOUTE L'ENCRE, PAS AVEC LES CONTOURS. Un trait de trois
 * pixels d'épaisseur a deux contours : voter avec eux donnerait deux droites
 * parallèles à un pixel et demi l'une de l'autre, qu'il faudrait ensuite
 * réunir. Voter avec la masse donne un pic unique, centré sur l'axe — et,
 * cadeau, la hauteur du pic dit l'épaisseur.
 *
 * CHAQUE TRAIT TROUVÉ EST RETIRÉ DE L'URNE. Sans cela, le mur le plus long
 * du plan ressortirait vingt fois de suite sous vingt angles voisins. On
 * efface donc ses pixels, et on retire ses voix, avant de chercher le
 * suivant : c'est ce qui fait qu'un plan de cinq cents traits se lit en un
 * seul passage.
 */
import type { Masque } from './image';
import type { P } from './trace';

export interface Trait {
  a: P;
  b: P;
  /** Épaisseur mesurée perpendiculairement (px). */
  ep: number;
  /** Longueur (px) — écrite une fois pour toutes, on la relit souvent. */
  len: number;
}

export interface ReglageTraits {
  /** Pas d'exploration des angles (degrés). */
  pasAngle?: number;
  /** Longueur minimale d'un trait retenu (px). */
  longueurMin?: number;
  /** Trou toléré dans un trait (px) : un croisement, un pointillé. */
  trouMax?: number;
  /** Épaisseur maximale d'un trait (px). Au-delà, c'est un aplat. */
  largeurMax?: number;
  /** Garde-fou : on ne rendra jamais plus de tant de traits. */
  maxTraits?: number;
}

const long = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * L'ANGLE DU PLAN — de combien la feuille a été photographiée de travers.
 *
 * Un plan est fait d'angles droits, et c'est la seule chose dont on soit sûr
 * avant de l'avoir lu. On cherche donc l'orientation qui rend les
 * projections les plus PIQUÉES : quand l'axe d'analyse tombe sur celui des
 * murs, toute l'encre d'un mur se projette au même endroit et l'histogramme
 * fait un pic ; de travers, elle s'étale. On somme les carrés — la mesure
 * classique de concentration — et le meilleur angle gagne.
 *
 * On explore de −45° à +45° et on regarde les DEUX axes à la fois : un plan
 * tourné de 3° et le même tourné de 93° sont le même plan, et l'orthogonalité
 * est justement ce qui permet de ne pas avoir à choisir.
 */
export function anglePrincipal(m: Masque, pas = 0.25): number {
  // EN DEUX TEMPS. Balayer 90° au quart de degré, c'est trois cent soixante
  // projections de toute l'encre — quatre secondes sur une planche moyenne,
  // pour un réglage qu'on relance à chaque photo. On dégrossit au degré,
  // puis on affine sur deux degrés autour : même résultat, dix fois moins
  // cher, et la mesure reste au quart de degré près.
  const gros = balayer(m, -45, 45, 1);
  const fin = balayer(m, (gros * 180) / Math.PI - 1, (gros * 180) / Math.PI + 1, pas);
  return fin;
}

function balayer(m: Masque, deg0: number, deg1: number, pas: number): number {
  const pts: number[] = [];
  // Un pixel sur trois suffit à trouver un angle, et divise le coût d'autant.
  for (let i = 0; i < m.on.length; i += 3) if (m.on[i] === 1) pts.push(i);
  if (pts.length < 50) return 0;
  let meilleur = 0;
  let mieux = -1;
  const n = Math.ceil(Math.max(m.l, m.h) * 1.5) + 2;
  const hx = new Float64Array(n);
  const hy = new Float64Array(n);
  for (let deg = deg0; deg <= deg1 + 1e-9; deg += pas) {
    const a = (deg * Math.PI) / 180;
    const co = Math.cos(a);
    const si = Math.sin(a);
    hx.fill(0);
    hy.fill(0);
    for (const i of pts) {
      const x = i % m.l;
      const y = (i - x) / m.l;
      hx[Math.round(x * co + y * si + n / 2) | 0]++;
      hy[Math.round(-x * si + y * co + n / 2) | 0]++;
    }
    let piqure = 0;
    for (let k = 0; k < n; k++) piqure += hx[k] * hx[k] + hy[k] * hy[k];
    if (piqure > mieux) {
      mieux = piqure;
      meilleur = a;
    }
  }
  return meilleur;
}

/**
 * Les segments du masque.
 *
 * L'urne (θ, ρ) est classique ; ce qui l'est moins, c'est qu'on ne se
 * contente pas du pic : on RETOURNE SUR LA DROITE compter ce qu'il y a
 * vraiment. Un pic dit qu'une droite porte de l'encre, il ne dit ni où elle
 * commence, ni où elle s'arrête, ni si elle est faite de trois morceaux
 * séparés par des portes.
 */
export function segmentsDe(m: Masque, reglage: ReglageTraits = {}): Trait[] {
  const pas = reglage.pasAngle ?? 0.5;
  const lmin = reglage.longueurMin ?? Math.max(12, Math.min(m.l, m.h) * 0.04);
  const trouMax = reglage.trouMax ?? 6;
  const largeurMax = reglage.largeurMax ?? 14;
  const maxTraits = reglage.maxTraits ?? 400;

  const nA = Math.round(180 / pas);
  const diag = Math.ceil(Math.hypot(m.l, m.h)) + 2;
  const nR = diag * 2;
  const urne = new Int32Array(nA * nR);
  const cos = new Float64Array(nA);
  const sin = new Float64Array(nA);
  for (let t = 0; t < nA; t++) {
    const a = (t * pas * Math.PI) / 180;
    cos[t] = Math.cos(a);
    sin[t] = Math.sin(a);
  }

  const reste = m.on.slice();
  const points: number[] = [];
  for (let i = 0; i < reste.length; i++) if (reste[i] === 1) points.push(i);

  const voter = (i: number, sens: 1 | -1) => {
    const x = i % m.l;
    const y = (i - x) / m.l;
    for (let t = 0; t < nA; t++) {
      const r = Math.round(x * cos[t] + y * sin[t]) + diag;
      urne[t * nR + r] += sens;
    }
  };
  for (const i of points) voter(i, 1);

  const dedans = (x: number, y: number) => x >= 0 && y >= 0 && x < m.l && y < m.h;
  const vif = (x: number, y: number) => dedans(x, y) && reste[y * m.l + x] === 1;

  /*
    ON REPREND LE MAXIMUM À CHAQUE TOUR, ET C'EST VOULU.

    On a essayé de ranger les pics une bonne fois pour toutes, puis de les
    servir du plus fort au plus faible : deux secondes de gagnées sur vingt,
    et vingt traits inventés en plus sur une planche qui en compte
    soixante-dix. Un pic dont l'encre vient d'être emportée par un trait
    voisin doit être REPESÉ, pas servi sur sa vieille valeur — sinon on
    découpe des bouts de murs déjà lus. Le coût de la relecture de l'urne est
    le prix d'un plan propre.
  */
  const out: Trait[] = [];
  for (let tour = 0; tour < maxTraits; tour++) {
    let meilleur = 0;
    let iBest = -1;
    for (let k = 0; k < urne.length; k++) {
      if (urne[k] > meilleur) {
        meilleur = urne[k];
        iBest = k;
      }
    }
    if (iBest < 0 || meilleur < lmin) break;
    const t = Math.floor(iBest / nR);
    const r = (iBest % nR) - diag;
    const co = cos[t];
    const si = sin[t];
    // Un point de la droite, et sa direction.
    const px = co * r;
    const py = si * r;
    const ux = -si;
    const uy = co;

    // Ce que porte la droite, pas à pas : présent ou non, et sur quelle
    // épaisseur. On déborde du cadre : une droite oblique entre par un coin.
    const portee = Math.ceil(diag);
    const demi = Math.ceil(largeurMax / 2) + 1;
    const presence: number[] = new Array(portee * 2 + 1).fill(0);
    for (let s = -portee; s <= portee; s++) {
      const x0 = px + ux * s;
      const y0 = py + uy * s;
      if (!dedans(Math.round(x0), Math.round(y0))) continue;
      let large = 0;
      for (let d = -demi; d <= demi; d++) {
        const qx = Math.round(x0 + co * d);
        const qy = Math.round(y0 + si * d);
        if (vif(qx, qy)) large++;
      }
      presence[s + portee] = large;
    }

    // Découpage en morceaux : un trou de quelques pixels est un croisement,
    // pas une fin de trait.
    const morceaux: { d: number; f: number; ep: number }[] = [];
    let debut = -1;
    let vide = 0;
    let somme = 0;
    let n = 0;
    for (let k = 0; k <= presence.length; k++) {
      const on = k < presence.length && presence[k] > 0 && presence[k] <= largeurMax;
      if (on) {
        if (debut < 0) debut = k;
        vide = 0;
        somme += presence[k];
        n++;
      } else if (debut >= 0) {
        vide++;
        if (vide > trouMax || k === presence.length) {
          const f = k - vide;
          if (f - debut >= lmin) {
            morceaux.push({ d: debut - portee, f: f - portee, ep: n ? somme / n : 1 });
          }
          debut = -1;
          vide = 0;
          somme = 0;
          n = 0;
        }
      }
    }

    /*
      ON MESURE D'ABORD, ON EFFACE ENSUITE — et l'on s'y reprend à deux fois.

      L'urne travaille au demi-degré : sur un mur de quatre mètres, cela fait
      six pixels de dérive d'un bout à l'autre. Le premier réflexe — recaler
      le trait sur les pixels qu'il vient d'emporter — ne suffisait pas : une
      bande inclinée qui traverse un trait horizontal emporte un
      PARALLÉLOGRAMME, dont l'axe principal est incliné pareil, et le défaut
      se recopiait lui-même. On ramasse donc large, on recale, on ramasse de
      nouveau autour de l'axe recalé, et c'est seulement là qu'on efface.
      Les murs sortent alors d'équerre au dixième de degré, ce qui est ce qui
      décide, tout à l'heure, si la cote rendue est juste au centimètre.
    */
    let pris = false;
    for (const mo of morceaux) {
      pris = true;
      let ax = px + ux * mo.d;
      let ay = py + uy * mo.d;
      let bx = px + ux * mo.f;
      let by = py + uy * mo.f;
      let trait: Trait = { a: { x: ax, y: ay }, b: { x: bx, y: by }, ep: Math.max(1, mo.ep), len: 0 };
      trait.len = long(trait.a, trait.b);
      for (let essai = 0; essai < 2; essai++) {
        const dx = (bx - ax) / (trait.len || 1);
        const dy = (by - ay) / (trait.len || 1);
        const xs: number[] = [];
        const ys: number[] = [];
        const marge = Math.ceil(mo.ep / 2) + 2;
        for (let s = 0; s <= trait.len; s++) {
          for (let d = -marge; d <= marge; d++) {
            const qx = Math.round(ax + dx * s - dy * d);
            const qy = Math.round(ay + dy * s + dx * d);
            if (!vif(qx, qy)) continue;
            xs.push(qx);
            ys.push(qy);
          }
        }
        trait = affiner(xs, ys, { x: ax, y: ay }, { x: bx, y: by }, mo.ep);
        ax = trait.a.x;
        ay = trait.a.y;
        bx = trait.b.x;
        by = trait.b.y;
      }
      out.push(trait);
      // L'effacement suit l'axe recalé, au plus juste : ce qu'on emporte de
      // trop est du mur voisin qu'on ne saura plus lire.
      const dx = (bx - ax) / (trait.len || 1);
      const dy = (by - ay) / (trait.len || 1);
      const marge = Math.ceil(mo.ep / 2) + 1;
      for (let s = 0; s <= trait.len; s++) {
        for (let d = -marge; d <= marge; d++) {
          const qx = Math.round(ax + dx * s - dy * d);
          const qy = Math.round(ay + dy * s + dx * d);
          if (!vif(qx, qy)) continue;
          const j = qy * m.l + qx;
          reste[j] = 0;
          voter(j, -1);
        }
      }
    }
    if (!pris) {
      // La droite ne portait rien d'assez long : on la retire de l'urne pour
      // ne pas la retrouver au tour suivant, sans toucher aux pixels.
      urne[iBest] = 0;
    }
  }
  return out.sort((x, y) => y.len - x.len);
}

/**
 * LE TRAIT EXACT, TIRÉ DE SES PROPRES PIXELS.
 *
 * L'urne travaille au demi-degré et au pixel : sur un mur de quatre mètres,
 * un demi-degré fait déjà trois pixels de dérive à l'autre bout — et cette
 * dérive-là finit en centimètres sur la cote qu'on rendra au client. On
 * reprend donc les pixels effectivement emportés par le trait, on en tire
 * l'axe principal (le même calcul que l'inertie d'une section), et l'on
 * repose les deux bouts dessus. Le pic ne sert plus qu'à TROUVER le trait ;
 * ce sont les pixels qui le MESURENT.
 */
function affiner(xs: number[], ys: number[], a0: P, b0: P, ep: number): Trait {
  if (xs.length < 8) return { a: a0, b: b0, ep: Math.max(1, ep), len: long(a0, b0) };
  const n = xs.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  let smin = Infinity;
  let smax = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = (xs[i] - mx) * ux + (ys[i] - my) * uy;
    if (s < smin) smin = s;
    if (s > smax) smax = s;
  }
  const a = { x: mx + ux * smin, y: my + uy * smin };
  const b = { x: mx + ux * smax, y: my + uy * smax };
  return { a, b, ep: Math.max(1, ep), len: long(a, b) };
}

/** Deux traits parlent-ils de la même droite ? */
function memeDroite(a: Trait, b: Trait, tolAngle: number, tolEcart: number): boolean {
  const angA = Math.atan2(a.b.y - a.a.y, a.b.x - a.a.x);
  const angB = Math.atan2(b.b.y - b.a.y, b.b.x - b.a.x);
  let d = Math.abs(angA - angB) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  if (d > tolAngle) return false;
  // Distance du milieu de b à la droite de a.
  const ux = Math.cos(angA);
  const uy = Math.sin(angA);
  const mx = (b.a.x + b.b.x) / 2 - a.a.x;
  const my = (b.a.y + b.b.y) / 2 - a.a.y;
  return Math.abs(-uy * mx + ux * my) <= tolEcart;
}

/**
 * Réunit les traits qui se prolongent.
 *
 * Une porte coupe un mur en deux morceaux ; un croisement mal effacé en fait
 * trois. Ils portent la même droite et se touchent presque : c'est un seul
 * trait, et le rendre entier évite d'inventer deux murs là où il y en a un.
 * On ne réunit PAS deux morceaux séparés par un vrai trou de menuiserie —
 * `ecartMax` est petit devant la largeur d'une porte.
 */
export function fusionnerTraits(
  traits: Trait[],
  { tolAngle = 0.05, tolEcart = 3, ecartMax = 8 } = {},
): Trait[] {
  const restants = traits.slice();
  const out: Trait[] = [];
  while (restants.length) {
    let cour = restants.shift() as Trait;
    let encore = true;
    while (encore) {
      encore = false;
      for (let i = 0; i < restants.length; i++) {
        const autre = restants[i];
        if (!memeDroite(cour, autre, tolAngle, tolEcart)) continue;
        // Les quatre bouts, projetés sur la direction du courant.
        const ang = Math.atan2(cour.b.y - cour.a.y, cour.b.x - cour.a.x);
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const proj = (p: P) => (p.x - cour.a.x) * ux + (p.y - cour.a.y) * uy;
        const s = [proj(cour.a), proj(cour.b), proj(autre.a), proj(autre.b)].sort(
          (x, y) => x - y,
        );
        const trou =
          Math.max(proj(autre.a), proj(autre.b)) < Math.min(proj(cour.a), proj(cour.b))
            ? Math.min(proj(cour.a), proj(cour.b)) - Math.max(proj(autre.a), proj(autre.b))
            : Math.min(proj(autre.a), proj(autre.b)) - Math.max(proj(cour.a), proj(cour.b));
        if (trou > ecartMax) continue;
        const a = { x: cour.a.x + ux * s[0], y: cour.a.y + uy * s[0] };
        const b = { x: cour.a.x + ux * s[3], y: cour.a.y + uy * s[3] };
        cour = {
          a,
          b,
          ep: (cour.ep * cour.len + autre.ep * autre.len) / (cour.len + autre.len),
          len: long(a, b),
        };
        restants.splice(i, 1);
        encore = true;
        break;
      }
    }
    out.push(cour);
  }
  return out.sort((x, y) => y.len - x.len);
}

/**
 * Redresse des traits d'un angle donné, autour du centre de l'image.
 * On tourne les TRAITS, jamais l'image : une rotation de photo coûte un
 * million d'interpolations et abîme les traits fins qu'on vient de trouver.
 */
export function tournerTraits(traits: Trait[], angle: number, cx: number, cy: number): Trait[] {
  const co = Math.cos(-angle);
  const si = Math.sin(-angle);
  const R = (p: P): P => ({
    x: cx + (p.x - cx) * co - (p.y - cy) * si,
    y: cy + (p.x - cx) * si + (p.y - cy) * co,
  });
  return traits.map((t) => ({ ...t, a: R(t.a), b: R(t.b) }));
}
