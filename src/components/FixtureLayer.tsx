/**
 * Le calque de l'APPAREILLAGE ÉLECTRIQUE du plan 2D.
 *
 * Il porte tout ce qui se pose sur un mur : le symbole à la couleur de son
 * type, son sigle, son repère de circuit, et le filet qui le rattache à la
 * face qui le porte. Deux cents lignes qui n'ont rien à voir avec les murs
 * ni les meubles, et qu'il fallait traverser pour arriver aux cartouches de
 * pièce.
 *
 * Sorti tel quel : le garde-fou du plan 2D compare l'arbre rendu élément par
 * élément, et il est resté vert — l'extraction n'a pas bougé un point.
 */
import React from 'react';
import { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Palette } from '../theme';
import {
  FIXTURES,
  assemblyTag,
  faceX,
  facePoint,
  postsOf,
  postsSymbol,
  stackRanks,
  wallFace,
  type Fixture,
} from '../geometry/electrical';
import type { Pt, WallSeg } from '../geometry/floorplan';
import { markColor } from '../geometry/schema';

interface Mapping {
  scale: number;
  toPx: (p: Pt) => { x: number; y: number };
}

export function FixtureLayer({
  fixtures,
  circuitMarks,
  walls,
  quads,
  mapping,
  viewRot,
  elecLod,
  navigating,
  onSelectFixture,
  c,
}: {
  fixtures?: Fixture[];
  circuitMarks?: Map<string, string>;
  walls: WallSeg[];
  quads: Map<string, { a1: Pt; b1: Pt; a2: Pt; b2: Pt } | undefined>;
  mapping: Mapping;
  /** Rotation du plan à l'écran : le symbole regarde SA face. */
  viewRot: number;
  /** Niveau de détail, de 0 (un point) à 1 (le symbole entier). */
  elecLod: number;
  /**
   * LE PLAN GLISSE SOUS LE DOIGT : on allège.
   *
   * Un appareil dessiné en grand, c'est un filet, un disque, quatre tracés
   * de symbole et parfois une étiquette — sept nœuds. Vingt appareils
   * pendant un déplacement, c'est cent quarante nœuds à repeindre à chaque
   * image, pour un dessin qui file. On retombe donc sur ce que la vue fait
   * déjà de loin : un POINT de la couleur de l'appareil — on voit qu'il y
   * a quelque chose et combien — et le symbole revient au relâcher.
   */
  navigating?: boolean;
  onSelectFixture?: (id: string, wallId: string) => void;
  c: Palette;
}) {
  const view = { rot: viewRot };
  return (
    <>
      {/* L'appareillage se dessine APRÈS les menuiseries : la
          trouée d'une baie est un aplat opaque, et posée
          par-dessus elle effaçait les prises du mur — on croyait
          les avoir perdues en créant l'ouverture. Le symbole se pose
          DANS la pièce, juste devant la face qui porte l'appareil :
          c'est la convention d'un plan d'électricien, et le seul moyen
          de distinguer les deux faces d'une même cloison. */}
      {(() => {
        const placed = (fixtures ?? [])
          .map((f) => {
            const w = walls.find((x) => x.id === f.wallId);
            if (!w) return null;
            const face = wallFace(w, quads.get(w.id), f.side);
            return { f, face, x: faceX(face, f.along) };
          })
          .filter((p): p is NonNullable<typeof p> => !!p);
        /**
         * Un ENSEMBLE se dessine une fois, avec tous ses postes.
         *
         * Deux prises liées à la main forment une double prise : sur le
         * mur, c'est une plaque de 153 mm à deux mécanismes. Le plan,
         * lui, dessinait le symbole de chaque appareil à sa propre
         * place — deux socles distants de 71 mm, soit deux pixels à
         * l'échelle d'un logement. On n'en voyait qu'un, et rien ne
         * disait qu'ils étaient liés.
         */
        const lots = new Map<string, typeof placed>();
        for (const it of placed) {
          const cle = it.f.group
            ? `g:${it.f.group}:${it.f.wallId}:${it.f.side}`
            : `s:${it.f.id}`;
          const l = lots.get(cle);
          if (l) l.push(it);
          else lots.set(cle, [it]);
        }
        const unites = [...lots.values()].map((membres) => {
          const tri = [...membres].sort((a2, b2) => a2.x - b2.x);
          const xs = tri.map((m) => m.x);
          return {
            f: tri[0].f,
            face: tri[0].face,
            // Le symbole se pose au MILIEU de l'ensemble, comme sa
            // plaque : c'est ce qu'on voit sur le mur.
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            postes: tri.flatMap((m) => postsOf(m.f.kind)),
          };
        });
        const ranks = stackRanks(
          unites.map((p) => ({
            id: p.f.id,
            wallId: p.f.wallId,
            side: p.f.side,
            x: p.x,
          })),
        );
        /**
         * LA TAILLE DU SYMBOLE SUIT LE ZOOM.
         *
         * Elle était fixe : à l'échelle d'un logement, onze pixels de
         * pastille par appareil couvraient les murs qu'ils sont
         * censés décrire ; en zoomant sur un mur, la même pastille
         * devenait minuscule au milieu du dessin. Elle se cale
         * désormais sur l'échelle, entre deux bornes — assez petite
         * pour laisser voir le plan, assez grande pour se viser.
         */
        const rayon = Math.max(
          7,
          Math.min(13, 7 + (mapping.scale - 60) * 0.07),
        );
        const taillePolice = Math.max(6.5, Math.min(9, rayon * 0.72));

        /**
         * OÙ poser le sigle : la première place libre.
         *
         * Il était posé en haut à droite, toujours. Deux appareils
         * voisins — une double prise et une RJ45 à vingt centimètres —
         * écrivaient donc leurs sigles au même endroit, l'un sur
         * l'autre. On essaie les quatre coins, puis on renonce : un
         * sigle illisible vaut moins que pas de sigle du tout, le
         * symbole suffit à dire qu'il y a quelque chose.
         */
        const posesTag: { x: number; y: number; w: number; h: number }[] =
          [];
        const placeTag = (
          cx: number,
          cy: number,
          texte: string,
        ): { x: number; y: number } | null => {
          const w2 = texte.length * taillePolice * 0.58;
          const h2 = taillePolice;
          const coins: [number, number][] = [
            [rayon + 3, -rayon + 1],
            [-rayon - 3 - w2, -rayon + 1],
            [-w2 / 2, -rayon - h2 - 1],
            [-w2 / 2, rayon + h2 + 3],
          ];
          for (const [dx, dy] of coins) {
            const b = { x: cx + dx, y: cy + dy - h2, w: w2, h: h2 };
            const libre = posesTag.every(
              (o) =>
                b.x > o.x + o.w + 1 ||
                o.x > b.x + b.w + 1 ||
                b.y > o.y + o.h + 1 ||
                o.y > b.y + b.h + 1,
            );
            if (libre) {
              posesTag.push(b);
              return { x: b.x, y: cy + dy };
            }
          }
          return null;
        };

        return unites.map(({ f, face, x, postes }) => {
          const spec = FIXTURES[f.kind];
          const symbol = postsSymbol(postes, f.kind);
          const tag = assemblyTag(postes);
          // Échelonnement : le deuxième appareil du même point se pose
          // plus loin du mur, sur le même filet.
          const lod = navigating ? 0 : elecLod;
          const out = 0.14 + (ranks.get(f.id) ?? 0) * (0.1 + 0.14 * lod);
          const anchor = mapping.toPx(facePoint(face, x, 0.02));
          const p = mapping.toPx(facePoint(face, x, out));
          // Le symbole regarde SA face : sa tige rejoint le mur. Le
          // plan pouvant être tourné, l'angle se prend à l'écran.
          const dir =
            (Math.atan2(-face.nz, -face.nx) + view.rot) * (180 / Math.PI) - 90;
          return (
            <G
              key={f.id}
              onPress={
                onSelectFixture
                  ? () => onSelectFixture(f.id, f.wallId)
                  : undefined
              }>
              {/* Cible tactile élargie : le symbole fait 22 px, le
                  doigt en demande le double. */}
              <Circle
                cx={p.x}
                cy={p.y}
                r={Math.max(18, rayon + 8)}
                fill="transparent"
              />
              {/*
                PENDANT LE GESTE, UN POINT SUFFIT.

                Le plan glisse sous le doigt : on ne lit pas, on vise. Le
                symbole complet — un fond, une tige, trois tracés — coûte à
                chaque image de ce mouvement, et c'est exactement ce qui
                sépare un plan qui glisse d'un plan qui saute. Il revient
                entier dès que le doigt se lève.
              */}
              {navigating && (
                <Circle cx={p.x} cy={p.y} r={3.4} fill={spec.color} />
              )}
              {!navigating && (
              <>
              {/*
                LE SYMBOLE TIENT LE PLAN À TOUTE ÉCHELLE.

                Il n'apparaissait qu'au zoom, et de loin on écrivait le
                SIGLE à sa place. Sur un mur qui en porte trois, les mots se
                chevauchaient et donnaient « PC2TAB » — une bouillie que ni
                l'œil ni le zoom ne démêlent. Un symbole, lui, occupe une
                place fixe et se reconnaît à sa forme : c'est petit d'abord,
                et plus on agrandit, plus on lit.
              */}
              <G>
                  <Line
                    x1={anchor.x}
                    y1={anchor.y}
                    x2={p.x}
                    y2={p.y}
                    stroke={spec.color}
                    strokeWidth={1.2}
                  />
                  <Circle cx={p.x} cy={p.y} r={rayon} fill={c.surface} />
                  <G
                    transform={
                      `translate(${p.x}, ${p.y}) ` +
                      `rotate(${dir}) scale(${rayon / 11})`
                    }>
                    {symbol.map((seg, si) => (
                      <Path
                        key={si}
                        d={seg.d}
                        stroke={spec.color}
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill={seg.fill ? spec.color : 'none'}
                      />
                    ))}
                  </G>
                  {(() => {
                    // Le mot vient AVEC LE ZOOM : sous 60 % du détail, il
                    // n'y a pas la place de l'écrire sans recouvrir le
                    // voisin.
                    if (!tag || lod < 0.6) return null;
                    const pose = placeTag(p.x, p.y, tag);
                    if (!pose) return null;
                    return (
                      <SvgText
                        x={pose.x}
                        y={pose.y}
                        fill={spec.color}
                        fontSize={taillePolice}
                        fontWeight="800">
                        {tag}
                      </SvgText>
                    );
                  })()}
                  {/* Le repère de circuit : c'est LUI qu'on lit sur le
                      chantier pour savoir quoi tirer où. Posé sous
                      l'appareil pour ne pas se mêler à son sigle. */}
                  {circuitMarks?.get(f.id) && (
                    <SvgText
                      x={p.x}
                      y={p.y + 20}
                      // Même teinte que le tracé et que le schéma du
                      // PDF : un seul code couleur pour toute l'app.
                      fill={markColor(circuitMarks.get(f.id)!)}
                      fontSize={8}
                      fontWeight="900"
                      textAnchor="middle">
                      {circuitMarks.get(f.id)}
                    </SvgText>
                  )}
                </G>
              </>
              )}
            </G>
          );
        });
      })()}
    </>
  );
}
