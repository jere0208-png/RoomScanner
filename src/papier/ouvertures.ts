/**
 * LES OUVERTURES — ce qui manque au mur, et ce qu'il y a dedans.
 *
 * Le lecteur ne cherche pas des portes : il cherche des TROUS. Sur un plan,
 * une menuiserie est d'abord une interruption de la maçonnerie — le dessin
 * s'ouvre, puis on referme la tranche par deux tableaux, et l'on pose dans
 * le vide de quoi dire ce que c'est :
 *
 *   — un VANTAIL et son arc de débattement : c'est une porte, et le bord
 *     d'où part le vantail est le côté des paumelles ;
 *   — un ou deux traits fins parallèles au mur : c'est une fenêtre, et ces
 *     traits sont le châssis ;
 *   — rien du tout : c'est une baie qu'on traverse.
 *
 * Cet ordre-là n'est pas un détail d'implémentation, c'est la façon dont on
 * lit un plan quand on est du métier : on voit d'abord que le mur s'arrête.
 *
 * CE QU'ON NE SAIT PAS, ON LE DIT. Un trou trop large pour une menuiserie et
 * trop étroit pour un couloir sort en `baie` : l'app le dessinera comme une
 * ouverture franche, ce qui est vrai, plutôt que d'inventer une porte à deux
 * vantaux dont personne n'a vu la trace.
 */
import { allume, type Masque } from './image';
import type { MurLu } from './murs';
import type { P } from './trace';
import type { Trait } from './traits';

export interface OuvertureLue {
  /** Le mur percé, par son rang dans la liste donnée. */
  mur: number;
  /** Cote du MILIEU de l'ouverture depuis l'extrémité `a` du mur (px). */
  at: number;
  /** Largeur du trou (px). */
  largeur: number;
  nature: 'porte' | 'fenetre' | 'baie';
  /** Bord d'où part le vantail, quand un vantail a été vu. */
  pivot?: 'a' | 'b';
}

export interface ReglageOuvertures {
  /** Largeur minimale d'un trou pour être une menuiserie, en épaisseurs de mur. */
  minEnEpaisseurs?: number;
  /** Largeur maximale, même mesure. */
  maxEnEpaisseurs?: number;
}

const long = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Les trous de chaque mur, et ce qu'ils contiennent.
 *
 * On travaille sur le masque ET sur les traits : le masque dit où la
 * maçonnerie s'arrête, les traits disent ce qui occupe le vide. Aucun des
 * deux ne suffit — le masque seul ne distingue pas un châssis d'un vantail,
 * et les traits seuls ne savent pas où est le trou.
 */
export function ouverturesDesMurs(
  murs: MurLu[],
  masque: Masque,
  traits: Trait[],
  reglage: ReglageOuvertures = {},
): OuvertureLue[] {
  const epMax = Math.max(1, ...murs.map((m) => m.ep));
  const mini = (reglage.minEnEpaisseurs ?? 1.5) * epMax;
  const maxi = (reglage.maxEnEpaisseurs ?? 7) * epMax;
  const out: OuvertureLue[] = [];

  murs.forEach((m, rangMur) => {
    const ux = (m.b.x - m.a.x) / (m.len || 1);
    const uy = (m.b.y - m.a.y) / (m.len || 1);
    const demi = m.ep / 2;
    const surLAxe = (s: number, d: number): P => ({
      x: m.a.x + ux * s - uy * d,
      y: m.a.y + uy * s + ux * d,
    });
    const bord = (s: number, sens: 1 | -1) => {
      for (let k = -3; k <= 3; k++) {
        const p = surLAxe(s, sens * demi + k);
        if (allume(masque, Math.round(p.x), Math.round(p.y))) return true;
      }
      return false;
    };
    const macon = (s: number) => bord(s, 1) && bord(s, -1);

    // Les trous, d'un bout à l'autre du mur.
    let debut: number | null = null;
    const trous: { d: number; f: number }[] = [];
    for (let s = 0; s <= m.len; s++) {
      if (!macon(s)) {
        if (debut === null) debut = s;
      } else if (debut !== null) {
        trous.push({ d: debut, f: s - 1 });
        debut = null;
      }
    }
    if (debut !== null) trous.push({ d: debut, f: m.len });

    for (const trou of trous) {
      const largeur = trou.f - trou.d;
      if (largeur < mini || largeur > maxi) continue;
      const at = (trou.d + trou.f) / 2;

      /*
        LE VANTAIL SE RECONNAÎT À SA LONGUEUR ET À SON PIED.

        Un vantail de plan est un trait droit qui part d'un bord du trou et
        mesure la largeur du trou — c'est la convention du dessin, et elle
        est étonnamment fidèle d'un bureau d'études à l'autre. On cherche
        donc un trait dont UN BOUT touche l'un des deux tableaux, et dont la
        longueur vaut celle du trou à trente pour cent près. L'arc de
        débattement, lui, ne se cherche pas : une transformée de droites le
        rend en une poignée de cordes, et compter des cordes serait moins
        sûr que de mesurer un vantail.
      */
      const pieds: ('a' | 'b')[] = [];
      const tableaux: [P, P] = [surLAxe(trou.d, 0), surLAxe(trou.f, 0)];
      const angleMur = Math.atan2(uy, ux);
      for (const t of traits) {
        if (Math.abs(t.len - largeur) > largeur * 0.3) continue;
        /*
          UN VANTAIL N'EST JAMAIS PARALLÈLE À SON MUR.

          Le châssis d'une fenêtre a exactement la longueur du trou et ses
          bouts touchent les deux tableaux : sans cette règle, il passait
          pour un vantail et TOUTES les fenêtres du plan ressortaient en
          portes. Le dessin ouvre la porte à quatre-vingt-dix degrés ; même
          dessinée à quarante-cinq, elle reste franchement en travers.
        */
        const angleTrait = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
        let da = Math.abs(angleTrait - angleMur) % Math.PI;
        if (da > Math.PI / 2) da = Math.PI - da;
        if (da < 0.5) continue;
        for (const bout of [t.a, t.b]) {
          const d0 = long(bout, tableaux[0]);
          const d1 = long(bout, tableaux[1]);
          const pres = Math.max(6, m.ep);
          if (d0 < pres) pieds.push('a');
          else if (d1 < pres) pieds.push('b');
        }
      }

      if (pieds.length) {
        out.push({ mur: rangMur, at, largeur, nature: 'porte', pivot: pieds[0] });
        continue;
      }

      /*
        LE CHÂSSIS D'UNE FENÊTRE COURT DANS LE TABLEAU.

        Un ou deux traits fins, parallèles au mur, à l'intérieur du trou et
        entre les deux nus. On ne demande pas qu'ils fassent toute la
        largeur : sur un plan réduit, ils sont souvent tracés un peu courts.
      */
      const chassis = traits.some((t) => {
        const ta = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
        const tm = Math.atan2(uy, ux);
        let da = Math.abs(ta - tm) % Math.PI;
        if (da > Math.PI / 2) da = Math.PI - da;
        if (da > 0.12) return false;
        if (t.len < largeur * 0.5 || t.len > largeur * 1.4) return false;
        const mi = { x: (t.a.x + t.b.x) / 2, y: (t.a.y + t.b.y) / 2 };
        // Le milieu du trait doit tomber dans le trou, dans l'épaisseur.
        const s = (mi.x - m.a.x) * ux + (mi.y - m.a.y) * uy;
        const d = -(mi.x - m.a.x) * uy + (mi.y - m.a.y) * ux;
        return s > trou.d - 2 && s < trou.f + 2 && Math.abs(d) <= demi + 1;
      });

      out.push({
        mur: rangMur,
        at,
        largeur,
        nature: chassis ? 'fenetre' : 'baie',
      });
    }
  });

  return out;
}
