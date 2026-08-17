/**
 * Les vignettes du menu d'export.
 *
 * Quatre lignes de texte se lisent l'une après l'autre, à la même vitesse :
 * rien n'accroche l'œil, et on relit les quatre à chaque fois pour retrouver
 * celle qu'on veut. Ce ne sont pourtant pas quatre variantes d'une même
 * chose — un plan coté, un modèle pour Blender, un bordereau à chiffrer et
 * une capture d'écran n'ont rien à voir entre eux.
 *
 * Chaque choix reçoit donc SON dessin : pas un pictogramme générique, mais
 * une miniature de ce qu'on va obtenir — une feuille cotée, un volume en
 * isométrie, un bordereau à lignes, un cadre photo. On la reconnaît sans
 * lire, et le menu cesse d'être une liste.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Palette } from '../theme';

export type ExportArtKind =
  | 'pdf'
  | 'obj'
  | 'materiel'
  | 'image'
  | 'presentation';

const T = 44;

export function ExportArt({ kind, c }: { kind: ExportArtKind; c: Palette }) {
  return (
    <Svg width={T} height={T} viewBox="0 0 44 44">
      {/* La tuile : un fond teinté, propre à chaque format. */}
      <Rect x={0} y={0} width={44} height={44} rx={13} fill={TEINTE(kind, c)} />
      {DESSINS[kind](c)}
    </Svg>
  );
}

const TEINTE = (kind: ExportArtKind, c: Palette): string =>
  ({
    pdf: c.blueSoft ?? '#E7EEFF',
    obj: '#EAF6F2',
    materiel: '#FDF1E4',
    image: '#F2ECFB',
    presentation: '#E9F3FF',
  }[kind]);

const DESSINS: Record<ExportArtKind, (c: Palette) => React.ReactNode> = {
  /** Une feuille, un plan dedans, et sa ligne de cote : le document coté. */
  pdf: (c) => (
    <>
      <Rect
        x={12}
        y={9}
        width={20}
        height={26}
        rx={2.5}
        fill="#FFFFFF"
        stroke={c.blue}
        strokeWidth={1.6}
      />
      <Path
        d="M16 14 h12 v9 h-12 z M23 14 v4 M23 21 v2"
        fill="none"
        stroke={c.blue}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <Path
        d="M16 28 h12 M16 26.5 v3 M28 26.5 v3"
        fill="none"
        stroke={c.blue}
        strokeWidth={1.1}
        opacity={0.65}
      />
    </>
  ),

  /** Un volume en isométrie : le fichier qu'on ouvre dans Blender. */
  obj: () => (
    <>
      <Path
        d="M22 8 L34 15 v14 L22 36 L10 29 V15 z"
        fill="#FFFFFF"
        stroke="#1F8A6D"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M10 15 L22 22 L34 15 M22 22 v14"
        fill="none"
        stroke="#1F8A6D"
        strokeWidth={1.4}
        strokeLinejoin="round"
        opacity={0.75}
      />
    </>
  ),

  /** Un bordereau : la pince, et des lignes chiffrées à droite. */
  materiel: () => (
    <>
      <Rect
        x={12}
        y={10}
        width={20}
        height={25}
        rx={2.5}
        fill="#FFFFFF"
        stroke="#B3701C"
        strokeWidth={1.6}
      />
      <Rect x={18} y={7} width={8} height={5} rx={1.6} fill="#B3701C" />
      {[17, 22, 27].map((y) => (
        <Path
          key={y}
          d={`M16 ${y} h9 M28.5 ${y} h2.2`}
          stroke="#B3701C"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={y === 17 ? 1 : 0.55}
        />
      ))}
    </>
  ),

  /**
   * Un logement en volume et un bouton de lecture : ce qu'on MONTRE.
   *
   * Les quatre autres vignettes disent un FICHIER — une feuille, un
   * volume, un bordereau, une capture. Celle-ci dit un moment : le
   * logement tourne devant le client. D'où le triangle, qui ne se
   * confond avec rien d'autre dans ce menu.
   */
  presentation: () => (
    <>
      <Path
        d="M22 8 L34 15 L22 22 L10 15 Z"
        fill="#FFFFFF"
        stroke="#2F6FF0"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M10 15 v8 l12 7 v-8 Z"
        fill="#2F6FF0"
        opacity={0.16}
        stroke="#2F6FF0"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M34 15 v8 l-12 7"
        fill="none"
        stroke="#2F6FF0"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Circle cx={30} cy={30} r={7} fill="#2F6FF0" />
      <Path d="M28 26.6 L33 30 L28 33.4 Z" fill="#FFFFFF" />
    </>
  ),

  /** Un cadre, un horizon, un soleil : la capture telle qu'on la partage. */
  image: () => (
    <>
      <Rect
        x={9}
        y={12}
        width={26}
        height={20}
        rx={3}
        fill="#FFFFFF"
        stroke="#6B4FA0"
        strokeWidth={1.6}
      />
      <Circle cx={16} cy={19} r={2.3} fill="#6B4FA0" opacity={0.8} />
      <Path
        d="M12 29 l6.5 -7 l4.5 4.5 l3.5 -3 L32 29 z"
        fill="#6B4FA0"
        opacity={0.75}
      />
    </>
  ),
};
