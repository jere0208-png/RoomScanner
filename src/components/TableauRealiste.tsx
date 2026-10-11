/**
 * LE TABLEAU FINI, DESSINÉ COMME UNE FICHE DE CONSTRUCTEUR.
 *
 * Relevé du patron, photo d'un coffret à l'appui : « un rendu visuel du
 * tableau fini réaliste […] avec les notes sous chaque disjoncteur selon ce
 * que l'on a mis (des icônes Solar de prises, lumières…), avec leur pièce si
 * possible ».
 *
 * Le coffret à ses cotes réelles (`dimensionsDuCoffret` : 17,5 mm par module,
 * 12,5 cm par rangée), dessiné en millimètres puis mis à l'échelle :
 *   — le bac et sa platine, les montants noirs, les barrettes de terre vertes
 *     en haut et en bas ;
 *   — un rail DIN par rangée, nu là où il n'y a rien ;
 *   — chaque organe à sa place et à sa largeur, dessiné d'après l'appareil
 *     réel de la gamme Resi9 XE (voir `AppareilsResi9`) ;
 *   — sous chaque organe, son étiquette : l'icône de ce qu'il commande, son
 *     repère, son calibre et sa pièce ;
 *   — les cotes du coffret, en flèches, comme sur la fiche du fabricant.
 */
import React from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import {
  dimensionsDuCoffret,
  implanter,
  type DepartExistant,
  type TableauExistant,
} from '../geometry/existant';
import { etiquettesDuTableau, type EtiquetteDuModule } from '../geometry/tableauFini';
import { SOLAIRES } from '../ui/solaires';
import { usageDuTableau } from './TableauVivant';
import { AppareilResi9, DefsResi9 } from './AppareilsResi9';

/** Un module DIN, en millimètres. */
const MOD = 17.5;
/** Le pas d'une rangée (rail, organes, étiquettes). */
const PAS = 125;
/** La place des cotes autour du coffret. */
const MARGE_G = 10;
const MARGE_H = 30;
const MARGE_D = 32;
const MARGE_B = 10;

const ENCRE = '#30363C';
const GRIS = '#8A9096';

/** La teinte d'une étiquette : celle de l'usage, ou celle de l'organe. */
export function teinteDeLEtiquette(d: DepartExistant): string {
  switch (d.organe) {
    case 'interrupteur':
    case 'agcp':
      return '#C8372D';
    case 'differentiel':
      return '#2F6BFF';
    case 'parafoudre':
      return '#2F9E44';
    case 'repartiteur':
      return '#5B6577';
    default:
      return usageDuTableau(d.usage)?.teinte ?? '#5B6577';
  }
}

/** Une chaîne qui tient dans `large` millimètres à cette taille de police. */
function tenir(s: string, taille: number, large: number): string {
  const max = Math.max(2, Math.floor(large / (taille * 0.56)));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** L'étiquette sous un organe : icône, repère, calibre, pièce. */
function Etiquette({ e, d, x, y, w }: { e: EtiquetteDuModule; d: DepartExistant; x: number; y: number; w: number }) {
  const cx = x + w / 2;
  const teinte = teinteDeLEtiquette(d);
  const cote = 7.5;
  return (
    <G>
      <Rect x={x} y={y} width={w} height={27} rx={1} fill="#FFFFFF" stroke="#D7DCE1" strokeWidth={0.4} />
      <G transform={`translate(${cx - cote / 2} ${y + 1.6}) scale(${cote / 24})`}>
        <Path d={SOLAIRES[e.icone]} fill={teinte} fillRule="evenodd" />
      </G>
      <SvgText x={cx} y={y + 13.4} fontSize={3.3} fill={ENCRE} textAnchor="middle" fontWeight="700">
        {e.repere}
      </SvgText>
      {e.calibre ? (
        <SvgText x={cx} y={y + 17.8} fontSize={2.9} fill={GRIS} textAnchor="middle">
          {e.calibre}
        </SvgText>
      ) : null}
      {e.piece ? (
        <SvgText x={cx} y={y + 23} fontSize={2.8} fill={teinte} textAnchor="middle" fontWeight="600">
          {tenir(e.piece, 2.8, w - 1.5)}
        </SvgText>
      ) : null}
    </G>
  );
}

export function TableauRealiste({
  tableau,
  echelle = 1.6,
}: {
  tableau: TableauExistant;
  /** Points par millimètre. */
  echelle?: number;
}) {
  const impl = implanter(tableau);
  const etiquettes = etiquettesDuTableau(tableau);
  const dims = dimensionsDuCoffret({ rangees: impl.rangees, parRangee: impl.parRangee });
  const W = Math.round(dims.largeur * 1000);
  const H = Math.round(dims.hauteur * 1000);
  const Wt = W + MARGE_G + MARGE_D;
  const Ht = H + MARGE_H + MARGE_B;
  const ox = MARGE_G;
  const oy = MARGE_H;
  /** La marge entre le bord du bac et le premier module du rail. */
  const cote = (W - impl.parRangee * MOD) / 2;
  const haut = (H - impl.rangees * PAS) / 2;
  const fleche = (x1: number, y1: number, x2: number, y2: number) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const pointe = (px: number, py: number, s: number) =>
      `M${px} ${py} L${px - s * 4 * Math.cos(a) + 1.8 * Math.sin(a)} ${py - s * 4 * Math.sin(a) - 1.8 * Math.cos(a)} L${
        px - s * 4 * Math.cos(a) - 1.8 * Math.sin(a)
      } ${py - s * 4 * Math.sin(a) + 1.8 * Math.cos(a)} Z`;
    return (
      <G>
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7A828C" strokeWidth={0.6} />
        <Path d={`${pointe(x2, y2, 1)} ${pointe(x1, y1, -1)}`} fill="#7A828C" />
      </G>
    );
  };
  return (
    <Svg width={Wt * echelle} height={Ht * echelle} viewBox={`0 0 ${Wt} ${Ht}`}>
      <DefsResi9 />
      {/* Les cotes du coffret. */}
      {fleche(ox, oy - 12, ox + W, oy - 12)}
      <SvgText x={ox + W / 2} y={oy - 16} fontSize={7} fill={ENCRE} textAnchor="middle" fontWeight="600">
        {`L : ${W} mm`}
      </SvgText>
      {fleche(ox + W + 14, oy, ox + W + 14, oy + H)}
      <SvgText
        x={ox + W + 24}
        y={oy + H / 2}
        fontSize={7}
        fill={ENCRE}
        textAnchor="middle"
        fontWeight="600"
        transform={`rotate(90 ${ox + W + 24} ${oy + H / 2})`}>
        {`H : ${H} mm`}
      </SvgText>

      {/* Le bac, sa platine, ses montants. */}
      <Rect x={ox} y={oy} width={W} height={H} rx={9} fill="#E9E2D6" stroke="#CBC2B4" strokeWidth={0.8} />
      <Rect x={ox + 12} y={oy + 12} width={W - 24} height={H - 24} rx={3} fill="#F3EEE6" stroke="#DDD5C9" strokeWidth={0.5} />
      {[ox + 17, ox + W - 25].map((mx) => (
        <G key={mx}>
          <Rect x={mx} y={oy + 30} width={8} height={H - 60} rx={1.5} fill="#1C1D20" />
          {Array.from({ length: impl.rangees }, (_, r) => (
            <Rect key={r} x={mx - 1} y={oy + haut + r * PAS + 44} width={10} height={6} rx={1} fill="#2E3034" />
          ))}
        </G>
      ))}
      {/* Les barrettes de terre, en haut et en bas. */}
      <Rect x={ox + 16} y={oy + 18} width={W - 32} height={3} fill="#A9AEB3" />
      <Rect x={ox + W * 0.38} y={oy + 15} width={W * 0.52} height={7} rx={1} fill="#2F8F4E" />
      {Array.from({ length: Math.floor((W * 0.52) / 4) }, (_, i) => (
        <Circle key={`th${i}`} cx={ox + W * 0.38 + 2 + i * 4} cy={oy + 18.5} r={1} fill="#1D5E33" />
      ))}
      <Rect x={ox + 16} y={oy + H - 21} width={W - 32} height={3} fill="#A9AEB3" />
      <Rect x={ox + 22} y={oy + H - 22} width={W * 0.5} height={7} rx={1} fill="#2F8F4E" />
      {Array.from({ length: Math.floor((W * 0.5) / 4) }, (_, i) => (
        <Circle key={`tb${i}`} cx={ox + 24 + i * 4} cy={oy + H - 18.5} r={1} fill="#1D5E33" />
      ))}

      {/* Les rangées : le rail, nu là où rien n'est clipsé. */}
      {Array.from({ length: impl.rangees }, (_, r) => {
        const yb = oy + haut + r * PAS;
        return (
          <G key={`rail${r}`}>
            <Rect x={ox + 27} y={yb + 30.5} width={W - 54} height={35} fill="#A3A9AF" />
            <Rect x={ox + 27} y={yb + 30.5} width={W - 54} height={2} fill="#C7CCD1" />
            <Rect x={ox + 27} y={yb + 63.5} width={W - 54} height={2} fill="#7D838A" />
            {Array.from({ length: Math.floor((W - 54) / 22) }, (_, i) => (
              <Rect key={i} x={ox + 34 + i * 22} y={yb + 46} width={8} height={4} rx={1} fill="#7D838A" />
            ))}
          </G>
        );
      })}

      {/* Les organes, et l'étiquette de chacun. */}
      {impl.modules.map((m) => {
        const x = ox + cote + m.debut * MOD;
        const w = m.largeur * MOD - 0.6;
        const yb = oy + haut + m.rangee * PAS;
        const e = etiquettes.get(m.depart.id);
        return (
          <G key={m.depart.id}>
            <AppareilResi9 d={m.depart} x={x} y={yb + 8} w={w} />
            {e ? <Etiquette e={e} d={m.depart} x={x} y={yb + 92} w={w} /> : null}
          </G>
        );
      })}
    </Svg>
  );
}
