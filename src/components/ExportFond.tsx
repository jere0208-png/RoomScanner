/**
 * LES IMAGES DE FOND DE L'EXPORT — ce qu'on obtient, dessiné avec SON plan.
 *
 * Relevé du patron : « revois le menu exporter pour afficher des options dans
 * un listing vertical 1 par 1, avec des images de fond pour une compréhension
 * visuelle ». Une icône de 44 points disait le format ; une carte large peut
 * MONTRER le résultat. Et le résultat le plus parlant, c'est le logement
 * qu'on vient de relever : la feuille PDF porte son plan coté, le DXF ses
 * calques sur l'écran noir d'un logiciel de dessin, le modèle 3D ses murs
 * levés, l'image sa vue filigranée. Sans plan (un relevé vide), un logement
 * d'exemple tient lieu — le dessin ne reste jamais blanc.
 *
 * Chaque image occupe la carte entière, poussée vers la droite ; un fondu
 * part de la gauche, à la teinte de la carte, pour que le titre se lise
 * toujours sur un fond calme.
 */
import React, { useMemo } from 'react';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { light, type Palette } from '../theme';
import { luminance } from '../geometry/appearance';
import type { ExportArtKind } from './ExportArt';

type P = { x: number; z: number };
export interface MurDuFond {
  a: P;
  b: P;
}

/** Un deux-pièces d'exemple, quand le relevé n'a pas encore de murs. */
export const PLAN_EXEMPLE: MurDuFond[] = [
  { a: { x: 0, z: 0 }, b: { x: 5.6, z: 0 } },
  { a: { x: 5.6, z: 0 }, b: { x: 5.6, z: 4.2 } },
  { a: { x: 5.6, z: 4.2 }, b: { x: 0, z: 4.2 } },
  { a: { x: 0, z: 4.2 }, b: { x: 0, z: 0 } },
  { a: { x: 2.6, z: 0 }, b: { x: 2.6, z: 2.9 } },
];

/** Le thème est-il sombre ? Son fond le dit. */
const themeSombre = (c: Palette) => luminance(c.bg) < 0.3;

/**
 * La teinte de la carte, propre à chaque format — la même famille que les
 * icônes. EN SOMBRE, DES TEINTES PROFONDES : le titre passe à l'encre claire
 * du thème, et une carte pastel le rendrait illisible.
 */
export const TEINTE_DU_FOND = (kind: ExportArtKind, c: Palette): string =>
  themeSombre(c)
    ? {
        pdf: c.blueSoft,
        obj: '#14302A',
        materiel: '#33261A',
        csv: '#14301E',
        dxf: '#0F1319',
        image: '#281F3D',
      }[kind]
    : {
        pdf: c.blueSoft,
        obj: '#E6F4EF',
        materiel: '#FCEFDF',
        csv: '#E5F5EB',
        dxf: '#1B2029',
        image: '#EFE8FA',
      }[kind];

/**
 * Le titre doit-il passer en blanc ? Seulement sur la carte du DXF en thème
 * clair — l'écran noir du logiciel de dessin. En sombre, l'encre du thème
 * est déjà claire.
 */
export const FOND_SOMBRE = (kind: ExportArtKind, c?: Palette) =>
  kind === 'dxf' && !(c && themeSombre(c));

/**
 * Le plan ramené dans une boîte : les murs, mis à l'échelle et centrés.
 * Rend des segments en coordonnées de la boîte.
 */
export function cadrerLePlan(
  murs: MurDuFond[],
  boite: { x: number; y: number; w: number; h: number },
): { x1: number; y1: number; x2: number; y2: number }[] {
  const source = murs.length > 0 ? murs : PLAN_EXEMPLE;
  const xs = source.flatMap((m) => [m.a.x, m.b.x]);
  const zs = source.flatMap((m) => [m.a.z, m.b.z]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const lw = Math.max(Math.max(...xs) - x0, 0.5);
  const lh = Math.max(Math.max(...zs) - z0, 0.5);
  const k = Math.min(boite.w / lw, boite.h / lh);
  const ox = boite.x + (boite.w - lw * k) / 2;
  const oy = boite.y + (boite.h - lh * k) / 2;
  return source.map((m) => ({
    x1: ox + (m.a.x - x0) * k,
    y1: oy + (m.a.z - z0) * k,
    x2: ox + (m.b.x - x0) * k,
    y2: oy + (m.b.z - z0) * k,
  }));
}

export function ExportFond({
  kind,
  c,
  largeur,
  hauteur,
  murs,
}: {
  kind: ExportArtKind;
  c: Palette;
  largeur: number;
  hauteur: number;
  murs: MurDuFond[];
}) {
  const fond = TEINTE_DU_FOND(kind, c);
  // L'image vit dans la moitié droite, un peu plus : le texte a la gauche.
  const zone = { x: largeur * 0.4, y: 0, w: largeur * 0.6, h: hauteur };
  /*
    LES DESSINS GARDENT LA PALETTE CLAIRE, quel que soit le thème. Ils
    montrent une feuille, un tableur, une photo — du papier, qui reste blanc
    la nuit. À l'encre du thème sombre, le plan de la feuille PDF devenait
    clair sur blanc : invisible.
  */
  const dessin = useMemo(
    () => DESSINS[kind](light, zone, murs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, c, largeur, hauteur, murs],
  );
  const id = `fondu-${kind}`;
  return (
    <Svg width={largeur} height={hauteur} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={fond} stopOpacity={1} />
          <Stop offset="0.42" stopColor={fond} stopOpacity={1} />
          <Stop offset="0.62" stopColor={fond} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={largeur} height={hauteur} fill={fond} />
      {dessin}
      <Rect x={0} y={0} width={largeur} height={hauteur} fill={`url(#${id})`} />
    </Svg>
  );
}

type Zone = { x: number; y: number; w: number; h: number };
type Dessin = (c: Palette, z: Zone, murs: MurDuFond[]) => React.ReactNode;

const DESSINS: Record<ExportArtKind, Dessin> = {
  /* Une feuille posée de biais, son plan coté, son cartouche. */
  pdf: (c, z, murs) => {
    const fw = Math.min(z.w * 0.62, z.h * 1.05);
    const fh = fw * 1.15;
    const fx = z.x + z.w * 0.32;
    const fy = z.y + z.h * 0.16;
    const plan = cadrerLePlan(murs, { x: fx + fw * 0.12, y: fy + fh * 0.14, w: fw * 0.76, h: fh * 0.5 });
    return (
      <G rotation={-6} origin={`${fx + fw / 2}, ${fy + fh / 2}`}>
        <Rect x={fx + 7} y={fy + 9} width={fw} height={fh} rx={5} fill="#0B0D12" opacity={0.08} />
        <Rect x={fx} y={fy} width={fw} height={fh} rx={5} fill="#FFFFFF" />
        {plan.map((s, i) => (
          <Line key={i} {...s} stroke={c.ink} strokeWidth={2.4} strokeLinecap="round" />
        ))}
        <Line x1={fx + fw * 0.12} y1={fy + fh * 0.09} x2={fx + fw * 0.88} y2={fy + fh * 0.09} stroke={c.blue} strokeWidth={1.2} />
        <Rect x={fx + fw * 0.12} y={fy + fh * 0.74} width={fw * 0.42} height={4} rx={2} fill={c.line} />
        <Rect x={fx + fw * 0.12} y={fy + fh * 0.82} width={fw * 0.3} height={4} rx={2} fill={c.line} />
        <Rect x={fx + fw * 0.62} y={fy + fh * 0.72} width={fw * 0.26} height={fh * 0.16} rx={2} fill="none" stroke={c.lineStrong} strokeWidth={1} />
      </G>
    );
  },

  /* Les murs levés, en perspective cavalière : le plan devient volume. */
  obj: (c, z, murs) => {
    const plan = cadrerLePlan(murs, { x: z.x + z.w * 0.2, y: z.y + z.h * 0.42, w: z.w * 0.6, h: z.h * 0.5 });
    const levee = z.h * 0.24;
    // Écrasé en profondeur : y × 0,6, et décalé pour donner le volume.
    const iso = (x: number, y: number, haut: number) => ({
      x: x + (y - z.y) * 0.35,
      y: z.y + (y - z.y) * 0.6 + z.h * 0.3 - haut,
    });
    const pans = plan
      .map((s) => ({ s, prof: (s.y1 + s.y2) / 2 }))
      .sort((a, b) => a.prof - b.prof);
    return (
      <G>
        {pans.map(({ s }, i) => {
          const a0 = iso(s.x1, s.y1, 0);
          const b0 = iso(s.x2, s.y2, 0);
          const b1 = iso(s.x2, s.y2, levee);
          const a1 = iso(s.x1, s.y1, levee);
          return (
            <G key={i}>
              {/* Un mur qui court en largeur fait face ; celui qui fuit en
                  profondeur se peint plus sombre : c'est ce qui donne le
                  volume, sans calcul de lumière. */}
              <Path
                d={`M${a0.x} ${a0.y} L${b0.x} ${b0.y} L${b1.x} ${b1.y} L${a1.x} ${a1.y} Z`}
                fill={Math.abs(s.x2 - s.x1) >= Math.abs(s.y2 - s.y1) ? '#FFFFFF' : '#CFE7DE'}
                stroke="#2F7A63"
                strokeWidth={1.1}
                strokeLinejoin="round"
                opacity={0.96}
              />
              <Line x1={a1.x} y1={a1.y} x2={b1.x} y2={b1.y} stroke="#1F5E4B" strokeWidth={2.2} strokeLinecap="round" />
            </G>
          );
        })}
      </G>
    );
  },

  /* Le bordereau : des lignes d'articles, leur pastille, leur prix. */
  materiel: (c, z) => {
    const fw = Math.min(z.w * 0.66, 190);
    const fx = z.x + z.w * 0.26;
    const fy = z.y + z.h * 0.12;
    const rangs = [0, 1, 2, 3];
    const pas = (z.h * 0.76) / rangs.length;
    return (
      <G>
        <Rect x={fx} y={fy} width={fw} height={z.h * 0.88} rx={8} fill="#FFFFFF" />
        {rangs.map((r) => {
          const y = fy + 10 + r * pas;
          return (
            <G key={r}>
              <Circle cx={fx + 16} cy={y + 6} r={6} fill={r % 2 ? c.amber : c.blue} opacity={0.85} />
              <Rect x={fx + 30} y={y + 2} width={fw * 0.44} height={4.5} rx={2} fill={c.lineStrong} />
              <Rect x={fx + fw - 40} y={y + 2} width={28} height={4.5} rx={2} fill="#B3701C" opacity={0.7} />
            </G>
          );
        })}
      </G>
    );
  },

  /* Le tableur : une grille, son en-tête vert, des cases remplies. */
  csv: (c, z) => {
    const fx = z.x + z.w * 0.22;
    const fy = z.y + z.h * 0.14;
    const fw = z.w * 0.78;
    const fh = z.h * 0.86;
    const cols = 4;
    const rows = 5;
    const cw = fw / cols;
    const rh = fh / rows;
    const cases: React.ReactNode[] = [];
    for (let r = 1; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        if ((r + k) % 3 === 0) continue;
        cases.push(
          <Rect key={`${r}-${k}`} x={fx + k * cw + 6} y={fy + r * rh + rh / 2 - 2.2} width={cw * (k === 0 ? 0.7 : 0.45)} height={4.4} rx={2} fill={k === cols - 1 ? '#1E8E4E' : c.lineStrong} />,
        );
      }
    }
    return (
      <G>
        <Rect x={fx} y={fy} width={fw} height={fh} rx={6} fill="#FFFFFF" />
        <Rect x={fx} y={fy} width={fw} height={rh} rx={6} fill="#1E8E4E" opacity={0.9} />
        {Array.from({ length: cols - 1 }, (_, k) => (
          <Line key={`v${k}`} x1={fx + (k + 1) * cw} y1={fy} x2={fx + (k + 1) * cw} y2={fy + fh} stroke="#DCE5DF" strokeWidth={1} />
        ))}
        {Array.from({ length: rows - 1 }, (_, r) => (
          <Line key={`h${r}`} x1={fx} y1={fy + (r + 1) * rh} x2={fx + fw} y2={fy + (r + 1) * rh} stroke="#DCE5DF" strokeWidth={1} />
        ))}
        {cases}
      </G>
    );
  },

  /* L'écran d'un logiciel de dessin : fond noir, calques en couleurs. */
  dxf: (_c, z, murs) => {
    const plan = cadrerLePlan(murs, { x: z.x + z.w * 0.24, y: z.y + z.h * 0.16, w: z.w * 0.6, h: z.h * 0.68 });
    const calques = ['#52D1F0', '#F5D54A', '#FFFFFF'];
    const pas = 12;
    const grille: React.ReactNode[] = [];
    for (let x = z.x; x < z.x + z.w; x += pas) {
      grille.push(<Line key={`gx${x}`} x1={x} y1={z.y} x2={x} y2={z.y + z.h} stroke="#FFFFFF" strokeWidth={0.5} opacity={0.06} />);
    }
    for (let y = z.y; y < z.y + z.h; y += pas) {
      grille.push(<Line key={`gy${y}`} x1={z.x} y1={y} x2={z.x + z.w} y2={y} stroke="#FFFFFF" strokeWidth={0.5} opacity={0.06} />);
    }
    const cx = z.x + z.w * 0.8;
    const cy = z.y + z.h * 0.3;
    return (
      <G>
        {grille}
        {plan.map((s, i) => (
          <Line key={i} {...s} stroke={calques[i % calques.length]} strokeWidth={1.6} strokeLinecap="round" />
        ))}
        <Line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} stroke="#FFFFFF" strokeWidth={1} opacity={0.8} />
        <Line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} stroke="#FFFFFF" strokeWidth={1} opacity={0.8} />
        <Rect x={cx - 3} y={cy - 3} width={6} height={6} fill="none" stroke="#FFFFFF" strokeWidth={1} opacity={0.8} />
      </G>
    );
  },

  /* Une photo : le cadre blanc, la vue du plan, le filigrane. */
  image: (c, z, murs) => {
    const fw = Math.min(z.w * 0.6, z.h * 1.25);
    const fh = fw * 0.78;
    const fx = z.x + z.w * 0.34;
    const fy = z.y + (z.h - fh) / 2 + 4;
    const plan = cadrerLePlan(murs, { x: fx + 12, y: fy + 10, w: fw - 24, h: fh - 26 });
    return (
      <G rotation={5} origin={`${fx + fw / 2}, ${fy + fh / 2}`}>
        <Rect x={fx + 5} y={fy + 7} width={fw} height={fh} rx={6} fill="#0B0D12" opacity={0.08} />
        <Rect x={fx} y={fy} width={fw} height={fh} rx={6} fill="#FFFFFF" />
        <Rect x={fx + 6} y={fy + 6} width={fw - 12} height={fh - 12} rx={3} fill="#F4F1FB" />
        {plan.map((s, i) => (
          <Line key={i} {...s} stroke="#5B3FA8" strokeWidth={2} strokeLinecap="round" />
        ))}
        <Rect x={fx + fw - 44} y={fy + fh - 16} width={32} height={4} rx={2} fill={c.blue} opacity={0.55} />
      </G>
    );
  },
};
