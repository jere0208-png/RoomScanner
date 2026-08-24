/**
 * DES TRAITS AUX MURS — et les trois façons de dessiner un mur.
 *
 * Le lecteur a d'abord été écrit pour le seul DOUBLE TRAIT, celui du dessin
 * d'architecte. Le premier vrai plan français est venu le démentir : sur un
 * plan d'implantation électrique courant, les murs sont des APLATS noirs et
 * les cloisons des aplats gris, et il n'y a pas un double trait sur la
 * feuille. Un troisième plan, coté celui-là, mélangeait les deux et
 * HACHURAIT ses porteurs.
 *
 * Ce banc lit donc le même appartement imprimé de trois façons, et exige les
 * mêmes murs, aux mêmes cotes. C'est le seul moyen d'être sûr qu'on lit un
 * plan, et non qu'on reconnaît sa propre imprimerie.
 *
 * Il défend aussi une abstention : ON N'INVENTE PAS DE MUR à partir d'un
 * trait seul. Une ligne de cote, un vantail, un axe de symétrie sont des
 * traits seuls, et les prendre pour des cloisons remplissait le plan de
 * murs fantômes en travers des pièces.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { binariser, effacerBoites, imageVide } from '../src/papier/image';
import { tracer } from '../src/papier/trace';
import { photographierPlanche, type Planche } from '../src/papier/simulateur';
import { T1 } from '../src/papier/planches';
import { fusionnerTraits, segmentsDe } from '../src/papier/traits';
import {
  calerSurLeMasque,
  mursDesTraits,
  souderLesCoins,
  type MurLu,
} from '../src/papier/murs';

const enStyle = (style: 'double' | 'aplat' | 'hachure'): Planche => ({
  ...T1,
  murs: T1.murs.map((m) => ({ ...m, style })),
});

/** Redessine les murs lus, pour les REGARDER (voir `PLANCHE_PAPIER`). */
const aRegarder = (nom: string, murs: MurLu[], l: number, h: number) => {
  const dossier = process.env.PLANCHE_PAPIER;
  if (!dossier) return;
  const img = imageVide(l, h, 255);
  tracer(
    img,
    murs.map((m) => ({ t: 'seg' as const, a: m.a, b: m.b, w: Math.max(1, m.ep) })),
    { encre: 60 },
  );
  tracer(
    img,
    murs.map((m) => ({ t: 'seg' as const, a: m.a, b: m.b, w: 1 })),
    { encre: 0 },
  );
  const tete = Buffer.from(`P5
${l} ${h}
255
`, 'ascii');
  writeFileSync(join(dossier, `${nom}.pgm`), Buffer.concat([tete, Buffer.from(img.px)]));
};

const lireMurs = (style: 'double' | 'aplat' | 'hachure', reglage = {}) => {
  const photo = photographierPlanche(enStyle(style), { echelle: 100, ...reglage });
  const masque = effacerBoites(binariser(photo.image), photo.textes);
  const traits = fusionnerTraits(segmentsDe(masque));
  const murs = souderLesCoins(calerSurLeMasque(mursDesTraits(traits), masque));
  aRegarder(`murs-${style}`, murs, photo.image.l, photo.image.h);
  return murs;
};

/** Le mur le plus proche d'une longueur donnée, parmi ceux d'une direction. */
const versLa = (murs: MurLu[], horizontal: boolean) =>
  murs.filter((m) => {
    const dx = Math.abs(m.b.x - m.a.x);
    const dy = Math.abs(m.b.y - m.a.y);
    return horizontal ? dx > dy : dy > dx;
  });

describe.each(['double', 'aplat', 'hachure'] as const)('le T1 dessiné en %s', (style) => {
  const murs = lireMurs(style);

  it('retrouve les cinq murs de l’appartement, et pas vingt', () => {
    const vrais = murs.filter((m) => m.len > 80);
    expect(vrais.length).toBeGreaterThanOrEqual(4);
    expect(vrais.length).toBeLessThanOrEqual(7);
  });

  it('rend le pourtour aux bonnes cotes : quatre mètres sur trois', () => {
    const h = versLa(murs, true).map((m) => m.len);
    const v = versLa(murs, false).map((m) => m.len);
    // Les axes du pourtour : 400 px de long, 300 px de large, à l'épaisseur
    // d'un mur près selon la façon dont les coins se soudent. C'est LA cote
    // que le client lira sur le plan rendu : cinq pour cent d'écart, ce sont
    // vingt centimètres sur quatre mètres, et un métré faux.
    expect(Math.max(...h)).toBeGreaterThan(390);
    // L'aplat va jusqu'au bord EXTÉRIEUR du mur de retour : un demi-mur de
    // plus à chaque bout, que la soudure des coins ramène sur l'axe.
    expect(Math.max(...h)).toBeLessThan(425);
    expect(Math.max(...v)).toBeGreaterThan(290);
    expect(Math.max(...v)).toBeLessThan(325);
  });

  it('mesure l’épaisseur : vingt centimètres au pourtour, dix au refend', () => {
    const grands = murs.filter((m) => m.len > 250);
    // Le pourtour est deux fois plus épais que le refend, et c'est cette
    // différence-là que l'électricien lit avant de percer : un porteur ne se
    // traverse pas comme une cloison de doublage.
    const porteurs = grands.filter((m) => m.ep > 14 && m.ep < 27);
    const cloisons = grands.filter((m) => m.ep <= 14);
    expect(porteurs.length).toBeGreaterThanOrEqual(3);
    expect(cloisons.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...cloisons.map((m) => m.ep))).toBeLessThan(
      Math.min(...porteurs.map((m) => m.ep)) * 0.8,
    );
  });
});

describe('ce qu’on refuse de prendre pour un mur', () => {
  it('ne fait pas une cloison d’une ligne de cote', () => {
    const murs = lireMurs('double');
    // Les lignes de cote courent à 45 cm à l'extérieur du pourtour, soit
    // au-delà de x = 15 px et y = 15 px. Aucun mur ne doit y traîner.
    const dehors = murs.filter((m) => m.a.y < 40 && m.b.y < 40 && m.len > 100);
    expect(dehors).toHaveLength(0);
  });

  it('ne prend pas les hachures d’un porteur pour des cloisons en biais', () => {
    const murs = lireMurs('hachure');
    const biais = murs.filter((m) => {
      const a = (Math.atan2(m.b.y - m.a.y, m.b.x - m.a.x) * 180) / Math.PI;
      const d = ((a % 90) + 90) % 90;
      return Math.min(d, 90 - d) > 15;
    });
    expect(biais).toHaveLength(0);
  });
});

describe('les coins soudés', () => {
  it('referme le pourtour : chaque bout de mur en touche un autre', () => {
    const murs = lireMurs('aplat').filter((m) => m.len > 200);
    // Chaque bout doit toucher un AUTRE MUR — pas forcément par son bout :
    // un refend arrive au milieu du mur qu'il rejoint. C'est la condition
    // pour que la détection de pièces de l'app, qui ne voit que ce qui se
    // referme, trouve deux pièces et non une.
    const distanceAuMur = (p: { x: number; y: number }, m: MurLu) => {
      const vx = m.b.x - m.a.x;
      const vy = m.b.y - m.a.y;
      const l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - m.a.x) * vx + (p.y - m.a.y) * vy) / l2));
      return Math.hypot(p.x - (m.a.x + vx * t), p.y - (m.a.y + vy * t));
    };
    for (const m of murs) {
      for (const bout of [m.a, m.b]) {
        const proche = murs.some(
          (autre) => autre !== m && distanceAuMur(bout, autre) < Math.max(12, m.ep),
        );
        expect(proche).toBe(true);
      }
    }
  });
});
