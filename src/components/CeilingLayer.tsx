/**
 * Le calque PLAFOND du plan 2D.
 *
 * Trois choses qui vont ensemble et ne servent qu'à lui : les symboles des
 * appareils, les liens de commande qui les relient à leurs interrupteurs, et
 * les dégagements de celui qu'on est en train de régler.
 *
 * Il vivait dans le corps de `FloorplanEditor`, entre le calque des meubles
 * et celui des gaines. Sorti ici, il se lit d'un bloc — et le fichier qui
 * l'hébergeait perd deux cents lignes qu'il fallait traverser pour arriver
 * au reste.
 */
import React from 'react';
import { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { plaqueDeCote } from '../geometry/cotes';
import type { Palette } from '../theme';
import {
  faceX,
  facePoint,
  wallFace,
  type Fixture,
} from '../geometry/electrical';
import { castToWall, type Pt, type RoomPart, type WallSeg } from '../geometry/floorplan';

import {
  CEILINGS,
  CEILING_SYMBOL,
  linkAnchor,
  linkCurve,
  ceilingChain,
  type CeilingFixture,
} from '../geometry/ceiling';

interface Mapping {
  scale: number;
  toPx: (p: Pt) => { x: number; y: number };
}

export function CeilingLayer({
  ceiling,
  showCeiling,
  selectedCeilingId,
  selectedCeilingRow,
  showMeasures,
  onSelectCeiling,
  fixtures,
  walls,
  quads,
  partOf,
  mapping,
  frame,
  c,
}: {
  ceiling?: CeilingFixture[];
  showCeiling?: boolean;
  selectedCeilingId?: string | null;
  /**
   * La LIGNE tenue en main : tous ses spots se surlignent ensemble.
   *
   * Sans ça, prendre une ligne ne se voyait pas — le bandeau parlait de
   * quatre spots pendant que le dessin n'en montrait aucun de choisi.
   */
  selectedCeilingRow?: string | null;
  /**
   * LE BOUTON « COTES » VAUT AUSSI POUR LE PLAFOND.
   *
   * Il cotait les murs et l'appareillage, pas ce qu'on pose en l'air. Or
   * une ligne de spots s'implante exactement comme une rangée de prises :
   * du mur au premier, entre chacun, du dernier au mur. Sans ces écarts, on
   * relit six positions et on refait la soustraction à la main, sous le
   * plafond, le mètre à bout de bras.
   */
  showMeasures?: boolean;
  onSelectCeiling?: (id: string) => void;
  fixtures?: Fixture[];
  walls: WallSeg[];
  /** Les onglets des murs, calculés une fois par le plan. */
  quads: Map<string, { a1: Pt; b1: Pt; a2: Pt; b2: Pt } | undefined>;
  partOf: Map<string, RoomPart>;
  mapping: Mapping;
  /** Angle de la trame du logement : les cotes s'y alignent. */
  frame: number;
  c: Palette;
}) {
  return (
    <>
      {/*
        LE PLAFOND, et surtout LES LIENS DE COMMANDE.
        Un plan qui montre six interrupteurs et huit points lumineux
        sans dire lequel allume quoi n'est pas un plan de travail,
        c'est un inventaire. Le trait pointillé courbe — jamais droit,
        pour ne pas le confondre avec une cote ou une gaine — va de la
        commande au point qu'elle allume.
      */}
      {showCeiling &&
        (ceiling ?? []).map((cl) => {
          const spec = CEILINGS[cl.kind];
          const q = mapping.toPx(cl.at);
          const r = Math.max(9, Math.min(15, mapping.scale * 0.14));
          const choisi =
            cl.id === selectedCeilingId ||
            (!!selectedCeilingRow && cl.row === selectedCeilingRow);
          return (
            <G
              key={`cl-${cl.id}`}
              onPress={
                onSelectCeiling ? () => onSelectCeiling(cl.id) : undefined
              }>
              <Circle cx={q.x} cy={q.y} r={r + 6} fill="transparent" />
              {choisi && (
                <Circle
                  cx={q.x}
                  cy={q.y}
                  r={r + 5}
                  fill={c.blueSoft}
                  stroke={c.blue}
                  strokeWidth={1.6}
                />
              )}
              <G transform={`translate(${q.x}, ${q.y}) scale(${r / 9})`}>
                {CEILING_SYMBOL[cl.kind].map((seg, si) => (
                  <Path
                    key={si}
                    d={seg.d}
                    stroke={spec.color}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill={seg.fill ? spec.color : 'none'}
                  />
                ))}
              </G>
            </G>
          );
        })}
      {showCeiling &&
        (ceiling ?? []).flatMap((cl) =>
          (cl.commands ?? []).map((fid) => {
            const f = fixtures?.find((x) => x.id === fid);
            if (!f) return null;
            const w = walls.find((x) => x.id === f.wallId);
            if (!w) return null;
            const fa = wallFace(w, quads.get(w.id), f.side);
            const depart = facePoint(fa, faceX(fa, f.along), 0.16);
            const rayon = Math.max(0.1, CEILINGS[cl.kind].d * 0.7);
            const arrivee = linkAnchor(
              { x: depart.x, z: depart.z },
              cl.at,
              rayon,
            );
            const courbe = linkCurve(
              { x: depart.x, z: depart.z },
              arrivee,
            ).map((pt) => {
              const g = mapping.toPx(pt);
              return `${g.x},${g.y}`;
            });
            return (
              <Polyline
                key={`lien-${cl.id}-${fid}`}
                points={courbe.join(' ')}
                fill="none"
                stroke={c.inkSoft}
                strokeWidth={1.1}
                strokeDasharray="1.5 3.5"
                strokeLinecap="round"
              />
            );
          }),
        )}

      {/*
        LES ÉCARTS D'UNE LIGNE D'APPAREILS, sous le bouton « Cotes ».

        Une ligne de spots se pose au cordeau : ce qu'on lit pour
        l'implanter, ce sont les écarts, pas six paires de coordonnées. On
        les écrit en centimètres, le long de la ligne, avec les deux cotes
        de bout jusqu'aux murs — la chaîne complète, celle qu'on relève au
        mètre.
      */}
      {showCeiling &&
        showMeasures &&
        [...new Set((ceiling ?? []).map((x) => x.row).filter(Boolean))].map(
          (row) => {
            const lot = (ceiling ?? []).filter((cl) => cl.row === row);
            const murs = partOf.get(lot[0].roomId)?.walls ?? walls;
            const chaine = ceilingChain(lot, murs, frame);
            if (!chaine) return null;
            const jalons: (Pt | null)[] = [
              chaine.bouts[0],
              ...chaine.points,
              chaine.bouts[1],
            ];
            return (
              <G key={`chaine-${row}`}>
                {chaine.cotes.map((val, i) => {
                  const a = jalons[i];
                  const b = jalons[i + 1];
                  if (val === null || !a || !b) return null;
                  const A = mapping.toPx(a);
                  const B = mapping.toPx(b);
                  if (Math.hypot(B.x - A.x, B.y - A.y) < 18) return null;
                  let angle = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;
                  const mx = (A.x + B.x) / 2;
                  const my = (A.y + B.y) / 2;
                  /* Le texte AVANT la plaque : c'est lui qui la dimensionne. */
                  const texteEcart = `${Math.round(val * 100)}`;
                  return (
                    <G key={`c${i}`}>
                      <Line
                        x1={A.x}
                        y1={A.y}
                        x2={B.x}
                        y2={B.y}
                        stroke={c.inkFaint}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      {/*
                        LE NOMBRE SE LIT TOUJOURS À L'ENDROIT, sur une plaque
                        OPAQUE taillée à sa mesure.

                        Elle faisait 26 × 14 en dur, à neuf dixièmes
                        d'opacité : six points de blanc de trop de chaque
                        côté, et un tireté de gaine qui passait AU TRAVERS du
                        chiffre. Relevé du patron : « le bloc blanc arrière
                        pas si gros, il doit dépasser de 2px les chiffres sur
                        les côtés » et « les pointillés gênent la lecture de
                        la cote entre spots ».

                        Une plaque de cote est opaque en dessin technique —
                        c'est sa raison d'être : la cote INTERROMPT ce
                        qu'elle survole.
                      */}
                      <Rect
                        x={mx - plaqueDeCote(texteEcart, 9.5).w / 2}
                        y={my - plaqueDeCote(texteEcart, 9.5).h / 2}
                        width={plaqueDeCote(texteEcart, 9.5).w}
                        height={plaqueDeCote(texteEcart, 9.5).h}
                        rx={3}
                        fill={c.surface}
                        transform={`rotate(${angle}, ${mx}, ${my})`}
                      />
                      <SvgText
                        x={mx}
                        y={my + 3.5}
                        fill={c.inkSoft}
                        fontSize={9.5}
                        fontWeight="700"
                        textAnchor="middle"
                        transform={`rotate(${angle}, ${mx}, ${my})`}>
                        {texteEcart}
                      </SvgText>
                    </G>
                  );
                })}
              </G>
            );
          },
        )}

      {/*
        LES DÉGAGEMENTS DE L'APPAREIL DE PLAFOND CHOISI.
        Quatre cotes, vers les quatre murs qui l'entourent, en direct
        pendant qu'on le déplace. Sans elles, on déplace à vue et on
        lit le résultat après coup dans un champ — alors que la
        question qu'on se pose en glissant est exactement « à combien
        du mur ? ».
      */}
      {selectedCeilingId &&
        (() => {
          const cl = (ceiling ?? []).find(
            (x) => x.id === selectedCeilingId,
          );
          if (!cl) return null;
          const murs = partOf.get(cl.roomId)?.walls ?? walls;
          /**
           * D'ÉQUERRE AVEC LES MURS, pas avec le monde.
           *
           * Les quatre rayons partaient le long des axes x et z du repère
           * de scan. Or ARKit oriente ce repère selon l'endroit où le scan
           * a commencé : un logement relevé de biais donnait des cotes en
           * écharpe, qui traversaient la pièce et annonçaient trois mètres
           * dix jusqu'à un coin. On les lance donc sur la TRAME du
           * logement — les mêmes axes que ceux du plan redressé.
           */
          const cos = Math.cos(frame);
          const sin = Math.sin(frame);
          const sens = [
            { x: cos, z: sin },
            { x: -cos, z: -sin },
            { x: -sin, z: cos },
            { x: sin, z: -cos },
          ];
          return (
            <G>
              {sens.map((d, ci) => {
                const gap = castToWall(cl.at, d, murs);
                if (gap === null || gap < 0.02 || gap > 12) return null;
                const to = {
                  x: cl.at.x + d.x * gap,
                  z: cl.at.z + d.z * gap,
                };
                const A = mapping.toPx(cl.at);
                const B = mapping.toPx(to);
                if (Math.hypot(B.x - A.x, B.y - A.y) < 22) return null;
                let angle =
                  (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
                if (angle > 90) angle -= 180;
                if (angle < -90) angle += 180;
                const mx = (A.x + B.x) / 2;
                const my = (A.y + B.y) / 2;
                const texte =
                  gap < 1
                    ? `${Math.round(gap * 100)}`
                    : gap.toFixed(2).replace('.', ',');
                return (
                  <G key={`clcote-${ci}`}>
                    <Line
                      x1={A.x}
                      y1={A.y}
                      x2={B.x}
                      y2={B.y}
                      stroke={c.blue}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <Circle cx={B.x} cy={B.y} r={2} fill={c.blue} />
                    {/*
                      LA PLAQUE SUIT SON TEXTE — ET ELLE TOURNE AVEC LUI.

                      Deux défauts d'un coup. Elle prenait sept points de
                      blanc de chaque côté (« × 7,2 + 14 ») quand deux
                      suffisent, et elle était translucide, donc traversée
                      par les tiretés. Mais surtout : le TEXTE tournait avec
                      la cote et la plaque, elle, restait droite — sur une
                      cote en biais, le chiffre sortait de son fond par un
                      coin. Elles portent maintenant la même rotation.
                    */}
                    <Rect
                      x={mx - plaqueDeCote(texte, 10).w / 2}
                      y={my - plaqueDeCote(texte, 10).h / 2}
                      width={plaqueDeCote(texte, 10).w}
                      height={plaqueDeCote(texte, 10).h}
                      rx={3}
                      fill={c.surface}
                      transform={`rotate(${angle}, ${mx}, ${my})`}
                    />
                    <SvgText
                      x={mx}
                      y={my + 4}
                      fill={c.blue}
                      fontSize={10}
                      fontWeight="800"
                      textAnchor="middle"
                      transform={`rotate(${angle}, ${mx}, ${my})`}>
                      {texte}
                    </SvgText>
                  </G>
                );
              })}
            </G>
          );
        })()}
    </>
  );
}
