/**
 * L'APPAREIL VU DE FACE, TEL QU'IL SERA POSÉ — plus un bloc de couleur
 * marqué de son sigle.
 *
 * Relevé du patron : « on ne doit plus voir un bloc noté mais une vraie prise
 * ajoutée, comme le rendu qu'on aura à la fin ». L'établi « Face au mur »
 * posait un carré ambre écrit « PC », un carré bleu écrit « I » : le code
 * couleur du plan d'électricien, transporté là où l'on regarde justement le
 * mur comme on le verra. On y dessine maintenant l'appareil lui-même — sa
 * plaque blanche au bord adouci, son ombre portée sur le mur, et dans chaque
 * fenêtre son mécanisme : le puits d'une prise, ses alvéoles et sa broche de
 * terre ; la bascule d'un interrupteur ; les flèches d'un volet ; le bouton
 * d'un variateur ; le port d'un RJ45 ; la fiche d'une prise TV. Le tableau
 * montre ses rangées derrière sa porte fumée, l'applique lave le mur de sa
 * lumière, le thermostat affiche sa consigne.
 *
 * LA MÊME FABRIQUE QUE LA MAQUETTE. Les cotes sont celles de `appareils3d` —
 * une plaque de 82 mm, une fenêtre de 51 par poste, 71 d'entraxe, un puits de
 * 39 : ce qu'on voit de face ici est ce que la 3D pose au mur.
 *
 * Tout se dessine en CENTIMÈTRES, dans le repère de l'appareil (`y` vers le
 * haut), et `k` dit combien de points vaut un mètre : l'établi agrandit un
 * appareil trop petit pour le doigt, d'un seul facteur, sans le déformer.
 */
import React from 'react';
import {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { PoseDAppareil } from '../geometry/appareils3d';
import type { FixtureKind } from '../geometry/electrical';

/** Les teintes du dessin : celles de la maquette, éclairées par le haut. */
const C = {
  plaque: '#F6F5F1',
  plaqueBas: '#E4E2DC',
  filet: '#CFCDC6',
  meca: '#EEEDE8',
  fenetre: '#DAD8D1',
  alveole: '#1C1D20',
  chrome: '#C9CDD1',
  chromeSombre: '#9AA0A6',
  gris: '#8C9298',
  lumiere: '#FFE7B8',
  fume: '#3E474F',
  ecran: '#14171A',
  chiffres: '#BFE3FF',
  module: '#F7F7F5',
  etiquette: '#DCE3E8',
  test: '#4F7FB8',
} as const;

/** Les dégradés partagés — à poser UNE fois dans le `Svg` de l'établi. */
export function DefsAppareils() {
  return (
    <Defs>
      {/* La plaque : éclairée d'en haut, le bas rentre dans l'ombre. */}
      <LinearGradient id="app-plaque" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.55" stopColor={C.plaque} />
        <Stop offset="1" stopColor={C.plaqueBas} />
      </LinearGradient>
      {/* Une touche : le même jour, plus franc. */}
      <LinearGradient id="app-touche" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#E2E0DA" />
      </LinearGradient>
      {/* Le puits d'une prise : son bord haut fait de l'ombre au fond. */}
      <LinearGradient id="app-puits" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#C9C7C0" />
        <Stop offset="0.35" stopColor="#E6E4DE" />
        <Stop offset="1" stopColor="#F3F2EE" />
      </LinearGradient>
      <RadialGradient id="app-bouton" cx="0.38" cy="0.32" r="0.75">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="1" stopColor="#DCDAD3" />
      </RadialGradient>
      <LinearGradient id="app-chrome" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#F2F3F4" />
        <Stop offset="0.5" stopColor={C.chrome} />
        <Stop offset="1" stopColor={C.chromeSombre} />
      </LinearGradient>
      {/* La lumière d'une applique, qui part de ses lèvres, lave le mur et
          s'y éteint : vers le haut au-dessus d'elle, vers le bas dessous. */}
      <RadialGradient id="app-lueur-haut" cx="0.5" cy="1" r="0.75">
        <Stop offset="0" stopColor={C.lumiere} stopOpacity={0.9} />
        <Stop offset="1" stopColor={C.lumiere} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id="app-lueur-bas" cx="0.5" cy="0" r="0.75">
        <Stop offset="0" stopColor={C.lumiere} stopOpacity={0.9} />
        <Stop offset="1" stopColor={C.lumiere} stopOpacity={0} />
      </RadialGradient>
      {/* L'ombre portée d'une plaque sur le mur. */}
      <RadialGradient id="app-ombre" cx="0.5" cy="0.5" r="0.5">
        <Stop offset="0.6" stopColor="#000000" stopOpacity={0.16} />
        <Stop offset="1" stopColor="#000000" stopOpacity={0} />
      </RadialGradient>
    </Defs>
  );
}

// Les cotes, en centimètres — celles de `appareils3d`.
const R_PLAQUE = 0.9;
const FENETRE = 2.55;
const R_PUITS = 1.95;

/**
 * Un appareil — ou un ensemble sous une plaque —, centré en (cx, cy) points.
 * `k` : points par mètre.
 */
export function AppareilDeFace({
  pose,
  cx,
  cy,
  k,
}: {
  pose: PoseDAppareil;
  cx: number;
  cy: number;
  k: number;
}) {
  /** Des centimètres, en points. */
  const u = (cm: number) => (cm * k) / 100;
  /** Un point du repère de l'appareil (cm, `y` vers le haut), en points. */
  const X = (cm: number) => u(cm);
  const Y = (cm: number) => -u(cm);
  const cm = (m: number) => m * 100;
  let corps: React.ReactNode = null;

  switch (pose.genre) {
    case 'plaque': {
      const W = cm(pose.largeur ?? 0.082);
      const H = cm(pose.hauteur ?? 0.082);
      const postes = pose.postes ?? [];
      corps = (
        <G>
          <Plaque W={W} H={H} u={u} />
          {postes.map((q, i) => (
            <Mecanisme key={i} kind={q.kind} x={X(cm(q.dx))} y={Y(cm(q.dy))} u={u} />
          ))}
        </G>
      );
      break;
    }
    case 'applique':
      corps = <Applique u={u} />;
      break;
    case 'tableau':
      corps = <Tableau W={cm(pose.largeur ?? 0.55)} H={cm(pose.hauteur ?? 0.65)} u={u} />;
      break;
    case 'thermostat':
      corps = <Thermostat W={cm(pose.largeur ?? 0.09)} H={cm(pose.hauteur ?? 0.09)} u={u} />;
      break;
    case 'boite':
      corps = <Boite W={cm(pose.largeur ?? 0.1)} H={cm(pose.hauteur ?? 0.1)} u={u} />;
      break;
    default:
      corps = null;
  }
  return <G transform={`translate(${cx}, ${cy})`}>{corps}</G>;
}

type U = (cm: number) => number;

/** L'ombre portée d'un objet sur le mur : un halo doux, décalé vers le bas. */
function Ombre({ W, H, u, decalage = 0.35 }: { W: number; H: number; u: U; decalage?: number }) {
  return (
    <Rect
      x={-u(W / 2) - u(0.6)}
      y={-u(H / 2) - u(0.35) + u(decalage)}
      width={u(W) + u(1.2)}
      height={u(H) + u(1.2)}
      rx={u(1.4)}
      fill="url(#app-ombre)"
    />
  );
}

/** La plaque : son ombre, son corps éclairé d'en haut, son filet. */
function Plaque({ W, H, u }: { W: number; H: number; u: U }) {
  const r = Math.min(R_PLAQUE, W / 2, H / 2);
  return (
    <G>
      <Ombre W={W} H={H} u={u} />
      <Rect
        x={-u(W / 2)}
        y={-u(H / 2)}
        width={u(W)}
        height={u(H)}
        rx={u(r)}
        fill="url(#app-plaque)"
        stroke={C.filet}
        strokeWidth={Math.max(0.5, u(0.06))}
      />
    </G>
  );
}

/** La fenêtre d'un poste, et le nu de son mécanisme. */
function Fenetre({ x, y, u }: { x: number; y: number; u: U }) {
  const h = u(FENETRE);
  const retrait = u(0.14);
  return (
    <G>
      <Rect x={x - h} y={y - h} width={2 * h} height={2 * h} fill={C.fenetre} />
      <Rect
        x={x - h + retrait}
        y={y - h + retrait}
        width={2 * h - 2 * retrait}
        height={2 * h - 2 * retrait}
        fill={C.meca}
      />
    </G>
  );
}

/** Une touche : la bascule d'un interrupteur, une demi-touche de volet. */
function Touche({ x, y, w, h, u }: { x: number; y: number; w: number; h: number; u: U }) {
  return (
    <G>
      {/* Son ombre, dessous : la touche est en relief. */}
      <Rect x={x - w / 2} y={y - h / 2 + u(0.12)} width={w} height={h} rx={u(0.35)} fill="#000000" opacity={0.08} />
      <Rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={u(0.35)}
        fill="url(#app-touche)"
        stroke={C.filet}
        strokeWidth={Math.max(0.4, u(0.04))}
      />
    </G>
  );
}

function Mecanisme({ kind, x, y, u }: { kind: FixtureKind; x: number; y: number; u: U }) {
  const fen = <Fenetre x={x} y={y} u={u} />;
  const P = (dx: number, dy: number) => ({ x: x + u(dx), y: y - u(dy) });
  switch (kind) {
    case 'prise':
    case 'prise20':
    case 'prise32': {
      const trente2 = kind === 'prise32';
      const terre = P(0, 1.0);
      return (
        <G>
          {fen}
          <Circle cx={x} cy={y} r={u(R_PUITS)} fill="url(#app-puits)" stroke={C.filet} strokeWidth={Math.max(0.4, u(0.05))} />
          {(trente2
            ? [P(-1, -0.45), P(1, -0.45), P(0, 0.95)]
            : [P(-0.95, -0.15), P(0.95, -0.15)]
          ).map((q, i) => (
            <Circle key={i} cx={q.x} cy={q.y} r={u(trente2 ? 0.36 : 0.27)} fill={C.alveole} />
          ))}
          {!trente2 && (
            <>
              <Circle cx={terre.x} cy={terre.y + u(0.08)} r={u(0.26)} fill="#000000" opacity={0.18} />
              <Circle cx={terre.x} cy={terre.y} r={u(0.24)} fill="url(#app-chrome)" stroke={C.chromeSombre} strokeWidth={Math.max(0.3, u(0.03))} />
            </>
          )}
        </G>
      );
    }
    case 'inter':
    case 'va':
      return (
        <G>
          {fen}
          <Touche x={x} y={y} w={u(4.74)} h={u(4.74)} u={u} />
        </G>
      );
    case 'poussoir': {
      const v = P(0, 1.55);
      return (
        <G>
          {fen}
          <Touche x={x} y={y} w={u(4.74)} h={u(4.74)} u={u} />
          <Circle cx={v.x} cy={v.y} r={u(0.24)} fill="#FFB547" />
        </G>
      );
    }
    case 'volet': {
      const haut = P(0, 1.2);
      const bas = P(0, -1.2);
      const fl = (c: { x: number; y: number }, sens: 1 | -1) =>
        `M${c.x - u(0.5)} ${c.y + sens * u(0.32)} L${c.x + u(0.5)} ${c.y + sens * u(0.32)} L${c.x} ${c.y - sens * u(0.32)} Z`;
      return (
        <G>
          {fen}
          <Touche x={x} y={y - u(1.2)} w={u(4.74)} h={u(2.3)} u={u} />
          <Touche x={x} y={y + u(1.2)} w={u(4.74)} h={u(2.3)} u={u} />
          <Path d={fl(haut, 1)} fill={C.gris} />
          <Path d={fl(bas, -1)} fill={C.gris} />
        </G>
      );
    }
    case 'variateur': {
      const rep = P(0, 0.9);
      return (
        <G>
          {fen}
          <Circle cx={x} cy={y + u(0.18)} r={u(1.62)} fill="#000000" opacity={0.1} />
          <Circle cx={x} cy={y} r={u(1.6)} fill="url(#app-bouton)" stroke={C.filet} strokeWidth={Math.max(0.4, u(0.04))} />
          <Line x1={rep.x} y1={rep.y} x2={rep.x} y2={rep.y - u(0.65)} stroke={C.gris} strokeWidth={Math.max(0.8, u(0.16))} strokeLinecap="round" />
        </G>
      );
    }
    case 'rj45': {
      const o = P(-0.8, 0.8);
      const e = P(-1.3, -1.15);
      return (
        <G>
          {fen}
          <Rect x={o.x} y={o.y} width={u(1.6)} height={u(1.25)} rx={u(0.1)} fill={C.alveole} />
          <Rect x={o.x - u(0.15)} y={o.y - u(0.36)} width={u(1.9)} height={u(0.36)} rx={u(0.08)} fill="url(#app-touche)" stroke={C.filet} strokeWidth={Math.max(0.3, u(0.03))} />
          <Rect x={e.x} y={e.y} width={u(2.6)} height={u(0.6)} rx={u(0.1)} fill={C.etiquette} />
        </G>
      );
    }
    case 'tv':
      return (
        <G>
          {fen}
          <Circle cx={x} cy={y} r={u(1.15)} fill="url(#app-bouton)" stroke={C.filet} strokeWidth={Math.max(0.4, u(0.04))} />
          <Circle cx={x} cy={y} r={u(0.62)} fill="url(#app-chrome)" />
          <Circle cx={x} cy={y} r={u(0.47)} fill="#F4F4F2" />
          <Circle cx={x} cy={y} r={u(0.09)} fill={C.chromeSombre} />
        </G>
      );
    case 'sortieCable':
      return (
        <G>
          {fen}
          <Circle cx={x} cy={y} r={u(1.05)} fill="url(#app-bouton)" stroke={C.filet} strokeWidth={Math.max(0.4, u(0.04))} />
          <Line x1={x} y1={y} x2={x} y2={y + u(9)} stroke={C.filet} strokeWidth={u(0.86)} strokeLinecap="round" />
          <Line x1={x} y1={y} x2={x} y2={y + u(9)} stroke="#FBFBFA" strokeWidth={u(0.7)} strokeLinecap="round" />
          <Circle cx={x} cy={y} r={u(0.5)} fill="#FBFBFA" stroke={C.filet} strokeWidth={Math.max(0.3, u(0.03))} />
        </G>
      );
    default:
      return fen;
  }
}

/** L'applique : un coin blanc, et sa lumière qui lave le mur dessus et dessous. */
function Applique({ u }: { u: U }) {
  return (
    <G>
      <Rect x={-u(12)} y={-u(15.6)} width={u(24)} height={u(12)} fill="url(#app-lueur-haut)" />
      <Rect x={-u(12)} y={u(3.6)} width={u(24)} height={u(12)} fill="url(#app-lueur-bas)" />
      <Ombre W={12} H={7.2} u={u} decalage={0.6} />
      <Rect x={-u(6)} y={-u(3.6)} width={u(12)} height={u(7.2)} rx={u(0.4)} fill="url(#app-plaque)" stroke={C.filet} strokeWidth={Math.max(0.5, u(0.05))} />
      {/* Les deux lèvres allumées. */}
      <Rect x={-u(5.8)} y={-u(3.6)} width={u(11.6)} height={u(0.35)} fill={C.lumiere} />
      <Rect x={-u(5.8)} y={u(3.25)} width={u(11.6)} height={u(0.35)} fill={C.lumiere} />
    </G>
  );
}

/**
 * Le tableau : son coffret, quatre rangées derrière une porte fumée — un
 * différentiel en tête de rangée, ses disjoncteurs, des obturateurs.
 */
function Tableau({ W, H, u }: { W: number; H: number; u: U }) {
  const A = W / 2;
  const B = H / 2;
  const cadre = 3;
  const rangees = 4;
  const pas = (2 * (B - cadre)) / rangees;
  const fente = 2.2;
  const module = 1.75;
  const largeur = Math.min(2 * (A - cadre) - 4, 24 * module);
  const x0 = -largeur / 2;
  const nombres = [13, 10, 14, 8];
  const elements: React.ReactNode[] = [];
  for (let r = 0; r < rangees; r++) {
    const yc = B - cadre - pas * (r + 0.5);
    const ys = -u(yc);
    elements.push(
      <Rect key={`f${r}`} x={u(x0)} y={ys - u(fente)} width={u(largeur)} height={u(2 * fente)} fill={C.alveole} />,
      <Rect key={`e${r}`} x={u(x0)} y={ys - u(fente + 1.3)} width={u(largeur)} height={u(0.9)} fill={C.etiquette} />,
    );
    let x = x0;
    const poser = (n: number, test: boolean, cle: string) => {
      const x1 = x + n * module;
      const xm = (x + x1) / 2;
      elements.push(
        <Rect key={`m${cle}`} x={u(x + 0.06)} y={ys - u(fente - 0.05)} width={u(n * module - 0.12)} height={u(2 * fente - 0.1)} fill={C.module} />,
        <Rect key={`t${cle}`} x={u(xm - 0.32)} y={ys - u(1.25)} width={u(0.64)} height={u(1.55)} rx={u(0.1)} fill={C.alveole} />,
      );
      if (test) elements.push(<Rect key={`b${cle}`} x={u(x1 - 0.75)} y={ys + u(1.15)} width={u(0.45)} height={u(0.45)} fill={C.test} />);
      x = x1;
    };
    poser(2, true, `${r}d`);
    for (let d = 0; d < nombres[r]; d++) poser(1, false, `${r}-${d}`);
    if (x < -x0 - 0.1) {
      elements.push(
        <Rect key={`o${r}`} x={u(x + 0.06)} y={ys - u(fente - 0.05)} width={u(-x0 - x - 0.12)} height={u(2 * fente - 0.1)} fill={C.module} />,
      );
    }
  }
  return (
    <G>
      <Ombre W={W} H={H} u={u} decalage={0.8} />
      <Rect x={-u(A)} y={-u(B)} width={u(W)} height={u(H)} rx={u(0.8)} fill="url(#app-plaque)" stroke={C.filet} strokeWidth={Math.max(0.6, u(0.08))} />
      <Rect x={-u(A - cadre)} y={-u(B - cadre)} width={u(W - 2 * cadre)} height={u(H - 2 * cadre)} fill={C.plaque} />
      {elements}
      {/* La porte fumée, par-dessus. */}
      <Rect x={-u(A - cadre)} y={-u(B - cadre)} width={u(W - 2 * cadre)} height={u(H - 2 * cadre)} fill={C.fume} opacity={0.22} stroke={C.filet} strokeWidth={Math.max(0.5, u(0.06))} />
      <Rect x={u(A - cadre + 0.4)} y={-u(3)} width={u(0.7)} height={u(6)} rx={u(0.3)} fill={C.gris} />
    </G>
  );
}

/** Le thermostat : son boîtier, son écran et sa consigne, deux touches. */
function Thermostat({ W, H, u }: { W: number; H: number; u: U }) {
  const A = W / 2;
  const B = H / 2;
  return (
    <G>
      <Ombre W={W} H={H} u={u} />
      <Rect x={-u(A)} y={-u(B)} width={u(W)} height={u(H)} rx={u(1.1)} fill="url(#app-plaque)" stroke={C.filet} strokeWidth={Math.max(0.5, u(0.06))} />
      <Rect x={-u(A * 0.6)} y={-u(B * 0.66)} width={u(A * 1.2)} height={u(B * 0.58)} rx={u(0.3)} fill={C.ecran} />
      {u(1.4) >= 5 && (
        <SvgText x={0} y={-u(B * 0.66) + u(B * 0.58) * 0.72} fill={C.chiffres} fontSize={u(1.4)} fontWeight="600" textAnchor="middle">
          20,5°
        </SvgText>
      )}
      {[-A * 0.32, A * 0.32].map((dx, i) => (
        <Circle key={i} cx={u(dx)} cy={u(B * 0.42)} r={u(0.55)} fill="url(#app-bouton)" stroke={C.filet} strokeWidth={Math.max(0.4, u(0.04))} />
      ))}
    </G>
  );
}

/** La boîte de dérivation : son couvercle et ses quatre vis. */
function Boite({ W, H, u }: { W: number; H: number; u: U }) {
  const A = W / 2;
  const B = H / 2;
  const vis: { x: number; y: number }[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) vis.push({ x: u(sx * (A - 1.1)), y: u(sy * (B - 1.1)) });
  return (
    <G>
      <Ombre W={W} H={H} u={u} />
      <Rect x={-u(A)} y={-u(B)} width={u(W)} height={u(H)} rx={u(0.6)} fill="url(#app-plaque)" stroke={C.filet} strokeWidth={Math.max(0.5, u(0.06))} />
      {vis.map((v, i) => (
        <G key={i}>
          <Circle cx={v.x} cy={v.y} r={u(0.33)} fill="url(#app-chrome)" />
          <Line x1={v.x - u(0.22)} y1={v.y} x2={v.x + u(0.22)} y2={v.y} stroke={C.chromeSombre} strokeWidth={Math.max(0.3, u(0.06))} />
        </G>
      ))}
    </G>
  );
}

/**
 * L'EMPRISE DESSINÉE d'une pose, en centimètres — ce que le dessin couvre,
 * lumière d'applique exclue. Sert à agrandir ce qui serait trop petit pour
 * le doigt, et à poser la bague de sélection.
 */
export function empriseDeFace(pose: PoseDAppareil): { w: number; h: number } {
  switch (pose.genre) {
    case 'applique':
      return { w: 12, h: 7.2 };
    default:
      return { w: (pose.largeur ?? 0.082) * 100, h: (pose.hauteur ?? 0.082) * 100 };
  }
}
