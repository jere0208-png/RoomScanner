/**
 * DEUX GAINES NE SE DESSINENT JAMAIS L'UNE SUR L'AUTRE.
 *
 * Releve du patron, capture a l'appui : « plusieurs lignes se chevauchent, ca
 * doit etre impossible (courber une ligne si le cas) ».
 *
 * Tous les departs partent du MEME tableau et longent le MEME contour : leurs
 * premiers metres sont rigoureusement confondus. Traces tels quels, trois
 * departs font un seul tirete — on ne voit plus ni combien il y en a, ni ou
 * ils se separent, ce qui est justement ce qu'on lit sur un plan de chantier.
 *
 * On les ecarte comme un chemin de cables, et L'ECART SE REFERME SUR
 * L'APPAREIL : plein au depart, nul a l'arrivee. Sans ce retour a zero, on
 * aurait echange un chevauchement contre un mensonge — une gaine qui finit a
 * cote du symbole qu'elle alimente.
 */
import { ecarterLesGaines } from '../src/geometry/routing';
import type { Pt } from '../src/geometry/floorplan';

/** Deux départs qui partent du même point et longent le même mur. */
const DEPART: Pt = { x: 0, z: 0 };
const commun = (fin: Pt): Pt[] => [DEPART, { x: 3, z: 0 }, fin];

const A = { id: 'a', path: commun({ x: 3, z: 2 }) };
const B = { id: 'b', path: commun({ x: 3, z: 4 }) };
const C = { id: 'c', path: commun({ x: 3, z: 6 }) };

describe('trois départs qui partagent leur premier segment', () => {
  const ecartees = ecarterLesGaines([A, B, C]);

  it('ne se superposent plus au départ', () => {
    /*
      On regarde le MILIEU du segment commun : c'est la que les trois se
      confondaient. Ecartees, aucune ne doit passer sur une autre.
    */
    const milieux = ecartees.map((r) => ({
      x: (r.path[0].x + r.path[1].x) / 2,
      z: (r.path[0].z + r.path[1].z) / 2,
    }));
    const colles: string[] = [];
    for (let i = 0; i < milieux.length; i++) {
      for (let j = i + 1; j < milieux.length; j++) {
        const d = Math.hypot(
          milieux[i].x - milieux[j].x,
          milieux[i].z - milieux[j].z,
        );
        if (d < 0.02) colles.push(`${i}/${j}`);
      }
    }
    expect(`gaines confondues : ${colles.join(', ')}`).toBe(
      'gaines confondues : ',
    );
  });

  it('mais finissent EXACTEMENT sur leur appareil', () => {
    /*
      Le controle en sens inverse, et le plus important : l'ecart n'a le droit
      d'exister que la ou il n'y a rien a designer. Une gaine qui finirait a
      six centimetres de sa prise dirait le faux sur le document qui sert a
      percer.
    */
    for (const [i, r] of ecartees.entries()) {
      const fin = r.path[r.path.length - 1];
      const voulu = [A, B, C][i].path[2];
      expect(`${r.id} : ${fin.x},${fin.z}`).toBe(
        `${r.id} : ${voulu.x},${voulu.z}`,
      );
    }
  });

  it('et la première garde l’axe : on n’écarte que ce qui se marche dessus', () => {
    // Un depart seul n'a rien a fuir. Le decaler tous serait deplacer le
    // faisceau entier pour rien.
    expect(ecartees[0].path).toEqual(A.path);
  });

  it('et deux départs qui ne partent pas du même endroit gardent l’axe', () => {
    /*
      Le rang se prend sur le PREMIER SEGMENT. Deux gaines qui ne se croisent
      pas au depart ne se genent pas : les ecarter les eloignerait de leur
      trace reel sans rien gagner.
    */
    const ailleurs = { id: 'd', path: [{ x: 9, z: 9 }, { x: 9, z: 12 }] };
    const rendu = ecarterLesGaines([A, ailleurs]);
    expect(rendu[1].path).toEqual(ailleurs.path);
  });

  it('et l’écart se referme progressivement, il ne saute pas', () => {
    /*
      Plein au depart, nul a l'arrivee : c'est ce qui fait une courbe et non
      un coude. Un ecart constant puis annule au dernier point donnerait un
      crochet a l'approche de l'appareil.
    */
    const r = ecartees[2];
    const brut = C.path;
    const ecarts = r.path.map((p, i) =>
      Math.hypot(p.x - brut[i].x, p.z - brut[i].z),
    );
    for (let i = 1; i < ecarts.length; i++) {
      expect(ecarts[i]).toBeLessThanOrEqual(ecarts[i - 1] + 1e-9);
    }
    expect(ecarts[0]).toBeGreaterThan(0);
    expect(ecarts[ecarts.length - 1]).toBeCloseTo(0, 9);
  });
});

describe('le tracé lui-même', () => {
  it('garde son nombre de points : on écarte, on ne redécoupe pas', () => {
    // Le metre se lit sur ces points (voir `planRoutes`) : en ajouter un
    // changerait la longueur commandee pour une raison de dessin.
    for (const r of ecarterLesGaines([A, B, C])) {
      expect(r.path).toHaveLength(3);
    }
  });
});
