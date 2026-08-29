/**
 * SONDE DE RENDU — écrit les trois étapes en SVG pour qu'on les REGARDE.
 *
 * Ce fichier n'est pas un banc : c'est l'outil qui permet de voir le dessin
 * avant de le livrer. Il ne s'exécute qu'avec `VOIR_PLAN=1`, et il a déjà
 * gagné sa place — c'est lui qui a montré que le volume était une BOÎTE
 * FERMÉE, où l'on ne voyait ni le sol, ni le refend, ni les pièces.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE SAIT PAS FAIRE, ET IL FAUT LE SAVOIR AVANT DE LE CROIRE.
 *
 * LES DÉGRADÉS NE PASSENT PAS. `react-native-svg` remplace un
 * `stroke="url(#trame)"` par une référence interne que cette sonde ne sait
 * pas relire : le trait ressort sans couleur, donc invisible. Un quadrillage
 * regardé ici paraît ABSENT alors qu'il est là. Ce qui se juge par cette
 * fenêtre, ce sont les aplats, les traits pleins et la géométrie.
 *
 * LE TEXTE NON PLUS : il vit dans un nœud enfant, et l'on n'écrit ici que
 * l'enveloppe. Les cotes et les sigles manquent donc à l'image.
 *
 * Trois choses lui ont déjà échappé de cette façon, et chacune a coûté un
 * aller-retour : mieux vaut les lire avant de conclure qu'un dessin est
 * cassé.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { PlanAnime, type EtapeDuPlan } from '../src/components/PlanAnime';
import { Quadrillage } from '../src/components/Quadrillage';
import { dark, light } from '../src/theme';

beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

const W = 300;
const H = 420;

/** Les attributs qu'on recopie tels quels dans le SVG. */
const ATTRS = [
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'd', 'points',
  'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'opacity',
  'fillOpacity', 'strokeOpacity', 'fontSize', 'fontWeight', 'textAnchor',
  // Les dégradés : sans eux, un \ ne renvoie à rien et le
  // trait est INVISIBLE — la sonde jugerait un quadrillage absent.
  'name', 'offset', 'stopColor', 'stopOpacity',
];
const NOMS: Record<string, string> = {
  RNSVGLine: 'line',
  RNSVGPath: 'path',
  RNSVGCircle: 'circle',
  RNSVGPolygon: 'polygon',
  RNSVGText: 'text',
  RNSVGGroup: 'g',
  RNSVGDefs: 'defs',
  RNSVGLinearGradient: 'linearGradient',
  RNSVGStop: 'stop',
};

const enSvg = (n: unknown): string => {
  if (!n || typeof n !== 'object') return '';
  const o = n as {
    type?: string;
    props?: Record<string, unknown>;
    children?: unknown[];
  };
  const nom = NOMS[o.type ?? ''];
  const dedans = (o.children ?? []).map(enSvg).join('');
  if (!nom) return dedans;
  const p = o.props ?? {};
  const bouts: string[] = [];
  for (const a of ATTRS) {
    let v = p[a];
    // Une valeur animée se résout à zéro à la première image : pour REGARDER
    // le dessin, on la remonte à un.
    /*
      UN `fill` ABSENT N'EST PAS UN `fill` NEUTRE : le SVG le remplace par du
      NOIR. Un contour tracé `fill="none"` dans le composant arrive ici sans
      couleur lisible, et recopié tel quel il repeint tout son intérieur en
      noir — c'est ce qui faisait passer un sol bleu très pâle pour une dalle
      d'ardoise. La sonde mentait, pas le dessin.
    */
    if (a === 'fill' && (v === undefined || v === null)) v = 'none';
    if (v === undefined || v === null) continue;
    /*
      LES COULEURS SONT DES ENTIERS ARGB — le piège documenté de la maison.
      `react-native-svg` transforme `"#1F5BFF"` en un entier signé avant de
      le passer à la vue native : recopié tel quel, on obtient un SVG où tout
      est noir. On le remet en clair.
    */
    if (a === 'fill' || a === 'stroke') {
      /*
        UN GROUPE NE PORTE PAS DE COULEUR ICI. `RNSVGGroup` en pose une par
        défaut ; recopiée, elle est HÉRITÉE par tout enfant dont la couleur
        n'a pas pu se relire — et l'on obtient un dessin noir en croyant que
        c'est le composant qui l'est.
      */
      if (nom === 'g') continue;
      const brut =
        typeof v === 'number'
          ? v
          : v && typeof v === 'object' && typeof (v as { payload?: unknown }).payload === 'number'
          ? ((v as { payload: number }).payload)
          : null;
      // Pas de couleur lisible : c'est `none`, et il faut l'ÉCRIRE — sans
      // quoi le noir hérité revient par la fenêtre.
      v = brut === null ? 'none' : `#${(brut >>> 0).toString(16).padStart(8, '0').slice(2)}`;
    }
    // L'embout de trait est une énumération numérique : il ne se recopie pas.
    if (a === 'strokeLinecap' && typeof v === 'number') continue;
    // Une opacité résolue à zéro est une animation qui n'a pas commencé.
    if ((a === 'opacity' || a === 'fillOpacity' || a === 'strokeOpacity') && v === 0) {
      v = 1;
    }
    if (typeof v === 'object') continue;
    const cle = a === 'strokeWidth' ? 'stroke-width'
      : a === 'strokeLinecap' ? 'stroke-linecap'
      : a === 'fillOpacity' ? 'fill-opacity'
      : a === 'strokeOpacity' ? 'stroke-opacity'
      : a === 'fontSize' ? 'font-size'
      : a === 'fontWeight' ? 'font-weight'
      : a === 'textAnchor' ? 'text-anchor'
      : a === 'stopColor' ? 'stop-color'
      : a === 'stopOpacity' ? 'stop-opacity'
      : a === 'name' ? 'id'
      : a;
    bouts.push(`${cle}="${v}"`);
  }
  const contenu =
    nom === 'text'
      ? String(
          Array.isArray(p.children) ? p.children.join('') : p.children ?? '',
        )
      : dedans;
  return `<${nom} ${bouts.join(' ')}>${contenu}</${nom}>`;
};

it('écrit les images quand on le demande', () => {
  if (!process.env.VOIR_PLAN) {
    expect(true).toBe(true);
    return;
  }
  const dir = join(__dirname, '..', 'assets', 'apercu');
  mkdirSync(dir, { recursive: true });
  for (const theme of [light, dark]) {
    const nomTheme = theme === light ? 'clair' : 'sombre';
    for (const etape of ['plan', 'equipe', 'volume'] as EtapeDuPlan[]) {
      let t!: TestRenderer.ReactTestRenderer;
      act(() => {
        t = TestRenderer.create(
          <PlanAnime etape={etape} width={W} height={H} palette={theme} />,
        );
      });
      /*
        LA LEVÉE SE REGARDE UNE FOIS FINIE. Au premier rendu, les murs font
        zéro de haut : on ne verrait que le sol, et l'on croirait le dessin
        cassé alors qu'il n'a pas commencé.
      */
      act(() => {
        jest.advanceTimersByTime(1200);
      });
      const corps = enSvg(t.toJSON());
      writeFileSync(
        join(dir, `${nomTheme}-${etape}.svg`),
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
          `<rect width="${W}" height="${H}" fill="${theme.bg}"/>${corps}</svg>`,
      );
      act(() => t.unmount());
    }
    let q!: TestRenderer.ReactTestRenderer;
    act(() => {
      q = TestRenderer.create(
        <Quadrillage width={W} height={H} palette={theme} />,
      );
    });
    writeFileSync(
      join(dir, `${nomTheme}-quadrillage.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
        `<rect width="${W}" height="${H}" fill="${theme.bg}"/>${enSvg(q.toJSON())}</svg>`,
    );
    act(() => q.unmount());
  }
  expect(true).toBe(true);
});
