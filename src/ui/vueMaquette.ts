/**
 * RECENTRER, VUE DE DESSUS, PERSPECTIVE — la pastille de la maquette.
 *
 * Manque proposé par l'agent testeur PLAN 3D : une fois la maquette tournée,
 * zoomée et poussée hors du cadre, rien ne la ramenait — il fallait repasser
 * par le plan 2D. Le plan a sa pastille « Recadrer » ; la maquette a la
 * sienne, qui fait trois choses selon l'état de la vue, un appui à la fois :
 *   — la vue est déplacée ou zoomée : elle revient ENTIÈRE et centrée
 *     (l'inclinaison et l'orientation qu'on avait choisies sont gardées) ;
 *   — elle est cadrée, en perspective : elle passe en VUE DE DESSUS, comme
 *     un plan (la même inclinaison que la bascule 2D → 3D) ;
 *   — elle est cadrée, vue de dessus : elle se relève en PERSPECTIVE.
 *
 * Le cadrage « entier » est celui de la maquette elle-même (zoom 1, aucun
 * décalage) : elle se cale déjà sur le logement du niveau affiché, quelle
 * que soit sa forme (voir `Iso3DView`).
 */
import { DEFAULT_VIEW3D, type View3DParams } from '../components/Iso3DView';

/** À plat : la maquette est alors exactement le plan (voir la bascule 2D/3D). */
export const TILT_DESSUS = 1;
/** En deçà, la vue se lit comme un plan : c'est une vue de dessus. */
const SEUIL_DESSUS = 10;

export type GesteDeVue = 'recentrer' | 'dessus' | 'perspective';

/** La vue est-elle entière et centrée ? Un pixel et deux centièmes de zoom près. */
export function estCadree(v: View3DParams): boolean {
  return Math.abs(v.zoom - 1) < 0.02 && Math.abs(v.ox) < 1 && Math.abs(v.oy) < 1;
}

export function estVueDeDessus(v: View3DParams): boolean {
  return v.tilt < SEUIL_DESSUS;
}

/** Ce que fera le prochain appui. */
export function gesteDeVue(v: View3DParams): GesteDeVue {
  if (!estCadree(v)) return 'recentrer';
  return estVueDeDessus(v) ? 'perspective' : 'dessus';
}

/** La vue après l'appui. */
export function vueApres(v: View3DParams): View3DParams {
  const geste = gesteDeVue(v);
  const cadree = { ...v, zoom: 1, ox: 0, oy: 0 };
  if (geste === 'recentrer') return cadree;
  return { ...cadree, tilt: geste === 'dessus' ? TILT_DESSUS : DEFAULT_VIEW3D.tilt };
}

/** Le mot de la pastille : ce qu'elle va faire. */
export function libelleDuGeste(g: GesteDeVue): { court: string; aide: string } {
  switch (g) {
    case 'recentrer':
      return { court: 'Recentrer', aide: 'Remettre tout le logement à l’écran' };
    case 'dessus':
      return { court: 'Vue de dessus', aide: 'Voir la maquette d’en haut, comme un plan' };
    default:
      return { court: 'Perspective', aide: 'Relever la maquette en volume' };
  }
}

/**
 * La vue entre deux états, pour un instant `t` de 0 à 1 (déjà adouci).
 * L'orientation prend le plus court chemin : de 350° à 10°, vingt degrés.
 */
export function vueEntre(a: View3DParams, b: View3DParams, t: number): View3DParams {
  let dTheta = (b.theta - a.theta) % 360;
  if (dTheta > 180) dTheta -= 360;
  if (dTheta < -180) dTheta += 360;
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    theta: a.theta + dTheta * t,
    tilt: m(a.tilt, b.tilt),
    zoom: m(a.zoom, b.zoom),
    ox: m(a.ox, b.ox),
    oy: m(a.oy, b.oy),
  };
}
