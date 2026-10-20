/**
 * LE CALQUE QUI TRACE LES MURS — relevé du patron : « ajouter un mur
 * exactement là où on le souhaite ». Voir `geometry/traceMurs.ts` pour le
 * cerveau ; ici, le doigt et ce que l'œil voit.
 *
 *   — Un APPUI pose un coin là où tombe le doigt (aimant compris).
 *   — Un doigt qui GLISSE lève un réticule au-dessus de lui : le point visé
 *     n'est plus caché sous le pouce, et l'on ajuste au centimètre avant de
 *     lâcher. Pendant ce temps, le mur se dessine depuis le dernier coin,
 *     avec sa longueur et son angle, et un mot dit à quoi l'on s'accroche.
 *
 * Il vit dans son propre composant : sa visée change à chaque image du
 * doigt, et rendre tout le plan à chaque image ferait ramer l'écran (voir
 * « maj-plan2d »). Seul ce calque se redessine.
 */
import React, { memo, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Circle, G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { Pt, WallSeg } from '../geometry/floorplan';
import { LEVEE_DU_RETICULE, PORTEE_AIMANT_PX, viser, type Visee } from '../geometry/traceMurs';

/** Le doigt doit avoir glissé d'autant pour que le réticule se lève (points). */
const SEUIL_DE_LEVEE = 10;

const MOT_DE_L_ACCROCHE: Record<string, string> = {
  premier: 'Fermer la pièce',
  coin: 'Sur le coin',
  mur: 'Sur le mur',
  aligne: 'Aligné',
  equerre: 'À l’équerre',
  biais: 'À 45°',
};

const enMetres = (v: number) => `${v.toFixed(2).replace('.', ',')} m`;

export interface CalqueTraceProps {
  largeur: number;
  hauteur: number;
  mapping: {
    scale: number;
    toPx: (p: Pt) => { x: number; y: number };
    toMeters: (px: { x: number; y: number }) => Pt;
  };
  walls: WallSeg[];
  coins: Pt[];
  aimant: boolean;
  /** L'orientation du logement (`planFrameAngle`). */
  cadre: number;
  /** Écran → cadre du plan (voir `pointDuCadre` de l'éditeur). */
  versCadre: (e: GestureResponderEvent) => { x: number; y: number };
  onCoin: (v: Visee) => void;
  /** La dernière visée, gardée par l'appelant pour la longueur tapée. */
  onVisee?: (v: Visee | null) => void;
  couleurs: { trait: string; accroche: string; texte: string; fond: string };
}

export const CalqueTrace = memo(function CalqueTrace({
  largeur,
  hauteur,
  mapping,
  walls,
  coins,
  aimant,
  cadre,
  versCadre,
  onCoin,
  onVisee,
  couleurs,
}: CalqueTraceProps) {
  const [doigt, setDoigt] = useState<{ x: number; y: number } | null>(null);
  const [visee, setVisee] = useState<Visee | null>(null);
  const depart = useRef<{ x: number; y: number } | null>(null);
  const leve = useRef(false);

  const viserDepuis = (px: { x: number; y: number }) => {
    const cible = leve.current ? { x: px.x, y: px.y - LEVEE_DU_RETICULE } : px;
    const v = viser(mapping.toMeters(cible), coins, walls, PORTEE_AIMANT_PX / mapping.scale, aimant, cadre);
    setDoigt(px);
    setVisee(v);
    return v;
  };

  const px = coins.map((p) => mapping.toPx(p));
  const dernier = px[px.length - 1];
  const vise = visee ? mapping.toPx(visee.p) : null;
  const reticule = vise ?? null;
  const mot = visee?.accroche ? MOT_DE_L_ACCROCHE[visee.accroche] : null;
  const etiquette =
    visee && visee.longueur !== null && visee.longueur > 0
      ? `${enMetres(visee.longueur)}${visee.angle !== null ? ` · ${Math.round(visee.angle)}°` : ''}`
      : null;
  const milieu = dernier && vise ? { x: (dernier.x + vise.x) / 2, y: (dernier.y + vise.y) / 2 } : null;

  return (
    <G>
      {/* Le tracé en cours : ses murs et ses coins. */}
      {px.length >= 2 && (
        <Polyline
          points={px.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={couleurs.trait}
          strokeWidth={4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {px.map((p, i) => (
        <Circle key={`coin-${i}`} cx={p.x} cy={p.y} r={i === 0 ? 6 : 4.5} fill={couleurs.trait} />
      ))}
      {/* Le premier coin s'offre pour refermer la pièce. */}
      {px.length >= 3 && (
        <Circle
          cx={px[0].x}
          cy={px[0].y}
          r={13}
          fill="none"
          stroke={couleurs.accroche}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
      {/* Le mur visé, en direct, avec sa longueur et son angle. */}
      {dernier && vise && (
        <Line
          x1={dernier.x}
          y1={dernier.y}
          x2={vise.x}
          y2={vise.y}
          stroke={couleurs.trait}
          strokeWidth={3}
          strokeDasharray="7 5"
          strokeLinecap="round"
        />
      )}
      {milieu && etiquette && (
        <G>
          <Rect
            x={milieu.x - etiquette.length * 3.6 - 6}
            y={milieu.y - 24}
            width={etiquette.length * 7.2 + 12}
            height={20}
            rx={10}
            fill={couleurs.fond}
            opacity={0.94}
          />
          <SvgText x={milieu.x} y={milieu.y - 10} fontSize={12.5} fontWeight="700" fill={couleurs.texte} textAnchor="middle">
            {etiquette}
          </SvgText>
        </G>
      )}
      {/* Le réticule, levé au-dessus du doigt qui glisse, et son fil. */}
      {doigt && reticule && leve.current && (
        <Line
          x1={doigt.x}
          y1={doigt.y}
          x2={reticule.x}
          y2={reticule.y + 15}
          stroke={couleurs.texte}
          strokeWidth={1}
          opacity={0.45}
        />
      )}
      {reticule && (
        <G>
          <Circle cx={reticule.x} cy={reticule.y} r={15} fill="none" stroke={mot ? couleurs.accroche : couleurs.texte} strokeWidth={2} />
          <Line x1={reticule.x - 7} y1={reticule.y} x2={reticule.x + 7} y2={reticule.y} stroke={couleurs.texte} strokeWidth={1.2} />
          <Line x1={reticule.x} y1={reticule.y - 7} x2={reticule.x} y2={reticule.y + 7} stroke={couleurs.texte} strokeWidth={1.2} />
          {mot && (
            <SvgText
              x={reticule.x}
              y={reticule.y - 22}
              fontSize={11.5}
              fontWeight="700"
              fill={couleurs.accroche}
              textAnchor="middle">
              {mot}
            </SvgText>
          )}
        </G>
      )}
      {/*
        LA CAPTURE, PAR-DESSUS TOUT : on pose un coin sans risquer
        d'attraper un mur ou un meuble en chemin (comme le calque de pose).
      */}
      <Rect
        x={0}
        y={0}
        width={largeur}
        height={hauteur}
        fill="transparent"
        accessibilityLabel="Tracer un mur"
        onPressIn={(e: GestureResponderEvent) => {
          const p = versCadre(e);
          depart.current = p;
          leve.current = false;
          viserDepuis(p);
        }}
        onResponderMove={(e: GestureResponderEvent) => {
          const p = versCadre(e);
          const d0 = depart.current;
          if (!leve.current && d0 && Math.hypot(p.x - d0.x, p.y - d0.y) > SEUIL_DE_LEVEE) leve.current = true;
          viserDepuis(p);
        }}
        onPressOut={(e: GestureResponderEvent) => {
          const v = visee ?? viserDepuis(versCadre(e));
          depart.current = null;
          leve.current = false;
          setDoigt(null);
          setVisee(null);
          onVisee?.(v);
          onCoin(v);
        }}
      />
    </G>
  );
});
