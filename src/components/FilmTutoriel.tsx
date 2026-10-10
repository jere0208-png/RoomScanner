/**
 * LE FILM « COMMENT ÇA MARCHE » — cinq chapitres en motion design.
 *
 * Relevé du patron : « les tutos de comment ça marche sont mal faits. Fais un
 * tutoriel réaliste, sous forme de vidéo en motion design, fluide et rapide,
 * avec une coupure entre chaque étape et un bouton « Suivant » qui apparaît,
 * qui débloque la suite de la vidéo, étape 2, 3… Pas de design fait
 * rapidement pour la présentation des plans. »
 *
 * CE QUI EN FAIT UN FILM, ET PAS UNE SUITE DE CARTES :
 *   — chaque chapitre JOUE, sur une horloge (quatre à cinq secondes) : le scan
 *     trace ses arêtes sur la pièce, le plan se dessine au passage d'un
 *     faisceau, les meubles tombent à leur place, le logement se lève, le
 *     dossier sort ;
 *   — une barre de progression par chapitre, comme les « stories » ;
 *   — à la fin d'un chapitre, l'image se fige et « Suivant » APPARAÎT ; on
 *     ne passe pas avant (un appui sur l'image, lui, va droit à la fin) ;
 *   — entre deux chapitres, une COUPURE franche : un battement de fond, puis
 *     le chapitre suivant.
 *
 * CE QUI LE REND RÉALISTE : les images sont des RENDUS de l'appartement
 * d'exemple — ses murs, son parquet, ses meubles à leurs cotes —, les arêtes
 * du scan sont projetées par la caméra même du rendu, et le plan est tracé
 * avec la géométrie de l'app (épaisseurs de murs, surfaces, symboles des
 * meubles). Tout bouge sur le fil natif : opacités et transformations.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { G, Path, Polygon, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';
import { ARETES_DU_SCAN, CHAPITRES } from '../data/film';
import { appartementExemple, NOM_EXEMPLE } from '../data/exemple';
import { roomParts, toFootprint, type WallSeg } from '../geometry/floorplan';
import { cheminDuPoche, pocheDesMurs, type Poche } from '../geometry/poche';
import { furnKind, furnitureStrokes } from '../geometry/furniture';
import { LogoEcho } from './LogoMark';

const IMAGE_PIECE = require('../assets/film/piece.jpg');
const IMAGE_MAISON = require('../assets/film/maison.jpg');
const IMAGE_MAISON_VIDE = require('../assets/film/maison-vide.jpg');
/** Les proportions des rendus : l'écran d'un iPhone, et le plan 3D. */
const RATIO_PIECE = 780 / 1688;
const RATIO_MAISON = 1160 / 1060;

// ------------------------------------------------------------ l'horloge

type Horloge = Animated.Value;

/** Une sortie de cubique : ça part vite et ça se pose. */
const SORTIE = (x: number) => 1 - Math.pow(1 - x, 3);
/** Un dépassement léger, comme un ressort qui se pose. */
const REBOND = (x: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/**
 * UNE FENÊTRE DE L'HORLOGE : de `de` à `a` entre les instants `t0` et `t1`.
 *
 * Le pilote natif n'interpole qu'en ligne droite : la courbe est donc
 * ÉCHANTILLONNÉE (neuf points), ce qui la fait tenir entière sur le fil
 * natif — soixante images par seconde, le JavaScript au repos.
 */
export function fenetre(t: Horloge, t0: number, t1: number, de = 0, a = 1, courbe = SORTIE) {
  const n = 8;
  const fin = Math.max(t1, t0 + 1e-3);
  const entree: number[] = [];
  const sortie: number[] = [];
  for (let k = 0; k <= n; k++) {
    const x = k / n;
    entree.push(t0 + (fin - t0) * x);
    sortie.push(de + (a - de) * courbe(x));
  }
  return t.interpolate({ inputRange: entree, outputRange: sortie, extrapolate: 'clamp' });
}

/** Paraître (et éventuellement disparaître) entre deux instants. */
const paraitre = (t: Horloge, t0: number, t1: number) => fenetre(t, t0, t1, 0, 1);

// ------------------------------------------------------------ le plan

interface PlanDuFilm {
  x0: number;
  z0: number;
  lx: number;
  lz: number;
  /** La maçonnerie d'un seul tenant, et ses baies (voir `pocheDesMurs`). */
  poche: Poche;
  pieces: { id: string; nom: string; aire: number; pts: { x: number; z: number }[]; label: { x: number; z: number }; humide: boolean }[];
  meubles: { id: string; modele: string; cx: number; cz: number; yaw: number; w: number; d: number; kind: ReturnType<typeof furnKind> }[];
  total: number;
}

let planMemo: PlanDuFilm | null = null;

/** Le plan de l'appartement d'exemple, tel que l'app le dessine. */
export function planDuFilm(): PlanDuFilm {
  if (planMemo) return planMemo;
  const ex = appartementExemple();
  const walls = ex.walls as WallSeg[];
  const poche = pocheDesMurs(walls, ex.openings as WallSeg[], ex.rooms as never);
  const tous = poche.contours.flat();
  const x0 = Math.min(...tous.map((p) => p.x));
  const z0 = Math.min(...tous.map((p) => p.z));
  const lx = Math.max(...tous.map((p) => p.x)) - x0;
  const lz = Math.max(...tous.map((p) => p.z)) - z0;
  const noms = new Map((ex.rooms as { id: string; name: string }[]).map((r) => [r.id, r.name]));
  const pieces = roomParts(walls, ex.rooms as never)
    .filter((p) => p.surface)
    .map((p) => {
      const nom = noms.get(p.roomId) ?? '';
      return {
        id: p.roomId,
        nom,
        aire: p.surface!.area,
        pts: p.surface!.pts,
        label: p.labelAt,
        // « Bureau » contient « eau » : on cherche le MOT.
        humide: /(^|[^a-zà-ÿ])(eau|bains?|wc|douche)([^a-zà-ÿ]|$)/i.test(nom),
      };
    });
  const meubles = (ex.objects as never as Parameters<typeof toFootprint>[0][]).map((o) => {
    const f = toFootprint(o);
    return { id: f.id, modele: f.modele ?? '', cx: f.cx, cz: f.cz, yaw: f.yaw, w: f.width, d: f.depth, kind: furnKind(f.category) };
  });
  planMemo = { x0, z0, lx, lz, poche, pieces, meubles, total: pieces.reduce((s, p) => s + p.aire, 0) };
  return planMemo;
}

/** Les mètres du plan vers les points de la carte. */
function cadrage(plan: PlanDuFilm, w: number, h: number, marge: number) {
  const s = Math.min((w - 2 * marge) / plan.lx, (h - 2 * marge) / plan.lz);
  const ox = (w - plan.lx * s) / 2;
  const oy = (h - plan.lz * s) / 2;
  return {
    s,
    px: (x: number) => ox + (x - plan.x0) * s,
    py: (z: number) => oy + (z - plan.z0) * s,
  };
}

const aireEnClair = (m2: number) => `${m2.toFixed(1).replace('.', ',')} m²`;

/** Le thème est-il clair ? Sa couleur de fond le dit. */
const estClair = (c: Palette) => {
  const v = parseInt(c.bg.slice(1, 3), 16);
  return Number.isFinite(v) ? v > 128 : true;
};

/** Le sol des pièces : parquet pour les pièces sèches, carrelage pour l'eau. */
function Sols({ plan, k, c }: { plan: PlanDuFilm; k: ReturnType<typeof cadrage>; c: Palette }) {
  return (
    <>
      {plan.pieces.map((p) => (
        <Polygon
          key={p.id}
          points={p.pts.map((q) => `${k.px(q.x)},${k.py(q.z)}`).join(' ')}
          fill={p.humide ? '#CFE0E8' : '#E8D7BE'}
          fillOpacity={estClair(c) ? 0.55 : 0.22}
        />
      ))}
    </>
  );
}

/**
 * LA MAÇONNERIE, D'UN SEUL TENANT — comme le plan de l'app (voir
 * `pocheDesMurs`) : façades épaisses, cloisons fines, jonctions fondues, et
 * des baies qui sont de vrais vides, leur menuiserie en traits fins.
 */
function Murs({ plan, k, c }: { plan: PlanDuFilm; k: ReturnType<typeof cadrage>; c: Palette }) {
  const ligne = (b: Poche['baies'][number], d: number) =>
    `M${k.px(b.a.x + b.n.x * d)} ${k.py(b.a.z + b.n.z * d)} L${k.px(b.b.x + b.n.x * d)} ${k.py(b.b.z + b.n.z * d)}`;
  return (
    <>
      <Path
        d={cheminDuPoche(plan.poche.contours, (p) => ({ x: k.px(p.x), y: k.py(p.z) }))}
        fill={c.ink}
        fillRule="evenodd"
      />
      {plan.poche.baies.map((b, i) => {
        if (b.type === 'window') {
          return (
            <G key={i}>
              <Path d={ligne(b, b.plus)} stroke={c.ink} strokeWidth={1} />
              <Path d={ligne(b, -b.moins)} stroke={c.ink} strokeWidth={1} />
              <Path d={ligne(b, 0.015)} stroke={c.sky} strokeWidth={1.1} />
              <Path d={ligne(b, -0.015)} stroke={c.sky} strokeWidth={1.1} />
            </G>
          );
        }
        if (b.type === 'door') {
          // Le vantail, ouvert à angle droit vers l'intérieur du logement, et son arc.
          const ax = k.px(b.a.x);
          const ay = k.py(b.a.z);
          const bx = k.px(b.b.x);
          const by = k.py(b.b.z);
          const L = Math.hypot(bx - ax, by - ay);
          const ux = (bx - ax) / L;
          const uy = (by - ay) / L;
          const cx = k.px(plan.x0 + plan.lx / 2) - (ax + bx) / 2;
          const cy = k.py(plan.z0 + plan.lz / 2) - (ay + by) / 2;
          const sens = -uy * cx + ux * cy >= 0 ? 1 : -1;
          const vx = ax - uy * sens * L;
          const vy = ay + ux * sens * L;
          return (
            <G key={i}>
              <Path d={`M${ax} ${ay} L${vx} ${vy}`} stroke={c.inkSoft} strokeWidth={1.4} />
              <Path
                d={`M${vx} ${vy} A${L} ${L} 0 0 ${sens > 0 ? 0 : 1} ${bx} ${by}`}
                stroke={c.inkFaint}
                strokeWidth={1}
                strokeDasharray="3 3"
                fill="none"
              />
            </G>
          );
        }
        // Un passage : son linteau, en tireté.
        return (
          <G key={i}>
            <Path d={ligne(b, b.plus)} stroke={c.inkFaint} strokeWidth={1} strokeDasharray="4 3" />
            <Path d={ligne(b, -b.moins)} stroke={c.inkFaint} strokeWidth={1} strokeDasharray="4 3" />
          </G>
        );
      })}
    </>
  );
}

/** Un meuble vu de dessus : son emprise, et le symbole que l'app lui donne. */
function MeubleDuPlan({ m, s, c }: { m: PlanDuFilm['meubles'][number]; s: number; c: Palette }) {
  const w = m.w * s;
  const d = m.d * s;
  return (
    <>
      <Rect x={-w / 2} y={-d / 2} width={w} height={d} rx={2.5} fill={c.blueSoft} stroke={c.lineStrong} strokeWidth={1} />
      {furnitureStrokes(m.kind, w, d).map((ligne, i) => (
        <Path
          key={i}
          d={ligne.map((p, j) => `${j ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}
          stroke={c.inkSoft}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </>
  );
}

/** Le plan entier, figé — fond des chapitres « meubles » et « partage ». */
function PlanFige({ w, h, marge, meubles, c }: { w: number; h: number; marge: number; meubles: boolean; c: Palette }) {
  const plan = planDuFilm();
  const k = cadrage(plan, w, h, marge);
  return (
    <Svg width={w} height={h}>
      <Sols plan={plan} k={k} c={c} />
      {meubles &&
        plan.meubles.map((m) => (
          <G key={m.id} transform={`translate(${k.px(m.cx)}, ${k.py(m.cz)}) rotate(${(m.yaw * 180) / Math.PI})`}>
            <MeubleDuPlan m={m} s={k.s} c={c} />
          </G>
        ))}
      <Murs plan={plan} k={k} c={c} />
    </Svg>
  );
}

// ------------------------------------------------------------ les scènes

interface Scene {
  t: Horloge;
  w: number;
  h: number;
  c: Palette;
}

/*
  CHAPITRE 1 — LE SCAN. Un iPhone, la pièce dans l'écran ; le téléphone
  balaie (l'image glisse et se resserre), et les arêtes se tracent sur les
  murs, les baies, puis autour des meubles — à leur place exacte, puisque le
  rendu et le tracé ont la même caméra.
*/
function SceneScan({ t, w, h, c }: Scene) {
  const styles = getStyles(c);
  const pw = Math.min(w * 0.6, (h * 0.96) / 2.07);
  const ph = pw * 2.07;
  const lunette = pw * 0.035;
  const sw = pw - 2 * lunette;
  const sh = ph - 2 * lunette;
  // L'image couvre l'écran : même proportion, à un cheveu près.
  const iw = Math.max(sw, sh * RATIO_PIECE);
  const ih = iw / RATIO_PIECE;
  const ordre = { sol: 0, angle: 1, plafond: 2, baie: 3, meuble: 4 };
  const fenetres = { sol: [0.1, 0.38], angle: [0.16, 0.4], plafond: [0.2, 0.44], baie: [0.36, 0.58], meuble: [0.52, 0.8] };
  const parSorte = new Map<string, number>();
  const nb = (s: string) => ARETES_DU_SCAN.filter((a) => a.sorte === s).length;
  return (
    <Animated.View
      style={{
        opacity: paraitre(t, 0, 0.08),
        transform: [{ translateY: fenetre(t, 0, 0.14, 26, 0) }, { scale: fenetre(t, 0, 0.14, 0.96, 1) }],
      }}>
      <View style={[styles.telephone, { width: pw, height: ph, borderRadius: pw * 0.16, padding: lunette }]}>
        <View style={[styles.ecranTel, { width: sw, height: sh, borderRadius: pw * 0.13 }]}>
          <Animated.View
            style={{
              width: iw,
              height: ih,
              transform: [
                { translateX: fenetre(t, 0, 1, -0.05 * sw, 0.02 * sw, (x) => x) },
                { scale: fenetre(t, 0, 1, 1.12, 1.02, (x) => x) },
              ],
            }}>
            <Image source={IMAGE_PIECE} style={{ width: iw, height: ih }} resizeMode="cover" />
            {ARETES_DU_SCAN.map((s, i) => {
              const ax = s.a[0] * iw;
              const ay = s.a[1] * ih;
              const L = Math.hypot(s.b[0] * iw - ax, s.b[1] * ih - ay);
              const ang = Math.atan2(s.b[1] * ih - ay, s.b[0] * iw - ax);
              const rangDansSorte = parSorte.get(s.sorte) ?? 0;
              parSorte.set(s.sorte, rangDansSorte + 1);
              const [f0, f1] = fenetres[s.sorte];
              const debut = f0 + ((f1 - f0 - 0.1) * rangDansSorte) / Math.max(1, nb(s.sorte));
              const meuble = s.sorte === 'meuble';
              return (
                <Animated.View
                  key={i}
                  testID={`arete-${ordre[s.sorte]}-${i}`}
                  style={[
                    styles.arete,
                    meuble && styles.areteMeuble,
                    {
                      left: ax,
                      top: ay - 1,
                      width: L,
                      transform: [{ rotate: `${ang}rad` }, { scaleX: fenetre(t, debut, debut + 0.1) }],
                    },
                  ]}
                />
              );
            })}
          </Animated.View>
          {/* L'îlot de la caméra, et la pastille qui guide le geste. */}
          <View style={[styles.ilot, { top: sh * 0.018, left: sw / 2 - sw * 0.16, width: sw * 0.32, height: sw * 0.09 }]} />
          <Animated.View style={[styles.consigne, { top: sh * 0.075, opacity: fenetre(t, 0.06, 0.14, 0, 1) }]}>
            <Animated.Text style={[styles.consigneTexte, { opacity: fenetre(t, 0.8, 0.86, 1, 0) }]}>
              Balayez lentement
            </Animated.Text>
            <Animated.View style={[styles.consigneFin, { opacity: fenetre(t, 0.86, 0.92, 0, 1) }]}>
              <Svg width={13} height={13} viewBox="0 0 24 24">
                <Path d="M5 12.5l4.2 4.2L19 7" stroke="#3DDC84" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.consigneTexte}>Pièce relevée</Text>
            </Animated.View>
          </Animated.View>
          <View style={[styles.declencheur, { bottom: sh * 0.04, left: sw / 2 - 23 }]}>
            <View style={styles.declencheurCoeur} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/*
  CHAPITRE 2 — LE PLAN SE DESSINE. Un faisceau balaie la feuille et laisse
  derrière lui les sols, les murs à leur épaisseur, les baies et les portes ;
  puis chaque pièce dit son nom et sa surface, et les cotes s'étirent.
*/
function ScenePlan({ t, w, h, c }: Scene) {
  const styles = getStyles(c);
  const plan = planDuFilm();
  const cw = w;
  const ch = Math.min(h, w * 0.92);
  const k = cadrage(plan, cw, ch, 34);
  const largeur = plan.lx * k.s;
  const balayage = fenetre(t, 0.08, 0.5, 0, 1, (x) => x * x * (3 - 2 * x));
  return (
    <Animated.View style={[styles.feuille, { width: cw, height: ch, opacity: paraitre(t, 0, 0.08), transform: [{ scale: fenetre(t, 0, 0.12, 0.96, 1) }] }]}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width={cw} height={ch}>
          <Sols plan={plan} k={k} c={c} />
          <Murs plan={plan} k={k} c={c} />
        </Svg>
      </View>
      {/* Le cache que le faisceau pousse : ce qu'il a passé est dessiné. */}
      <Animated.View
        style={[
          styles.cache,
          {
            left: k.px(plan.x0) - 4,
            width: largeur + 8,
            transform: [{ translateX: balayage.interpolate({ inputRange: [0, 1], outputRange: [0, largeur + 8] }) }],
          },
        ]}>
        <View style={styles.faisceau} />
      </Animated.View>
      {/* Chaque pièce dit son nom et sa surface. */}
      {plan.pieces.map((p, i) => {
        const t0 = 0.5 + i * 0.045;
        return (
          <Animated.View
            key={p.id}
            style={[
              styles.etiquette,
              {
                left: k.px(p.label.x) - 60,
                top: k.py(p.label.z) - 17,
                opacity: paraitre(t, t0, t0 + 0.08),
                transform: [{ scale: fenetre(t, t0, t0 + 0.14, 0.7, 1, REBOND) }],
              },
            ]}>
            <View style={styles.cartouche}>
              <Text style={styles.etiquetteNom} numberOfLines={1}>
                {p.nom}
              </Text>
              <Text style={styles.etiquetteAire}>{aireEnClair(p.aire)}</Text>
            </View>
          </Animated.View>
        );
      })}
      {/* Les cotes d'ensemble, qui s'étirent depuis leur milieu. */}
      <Animated.View
        style={[styles.cote, { left: k.px(plan.x0), top: k.py(plan.z0) - 18, width: largeur, transform: [{ scaleX: fenetre(t, 0.74, 0.88) }] }]}
      />
      <Animated.Text style={[styles.coteTexte, { left: k.px(plan.x0), top: k.py(plan.z0) - 34, width: largeur, opacity: paraitre(t, 0.82, 0.9) }]}>
        {`${plan.lx.toFixed(2).replace('.', ',')} m`}
      </Animated.Text>
      <Animated.View
        style={[
          styles.cote,
          {
            left: k.px(plan.x0) - 18 - (plan.lz * k.s) / 2,
            top: k.py(plan.z0) + (plan.lz * k.s) / 2,
            width: plan.lz * k.s,
            transform: [{ rotate: '90deg' }, { scaleX: fenetre(t, 0.78, 0.92) }],
          },
        ]}
      />
      <Animated.Text
        style={[
          styles.coteTexte,
          styles.coteVerticale,
          {
            left: k.px(plan.x0) - 34 - 40,
            top: k.py(plan.z0) + (plan.lz * k.s) / 2 - 8,
            opacity: paraitre(t, 0.86, 0.94),
            transform: [{ rotate: '-90deg' }],
          },
        ]}>
        {`${plan.lz.toFixed(2).replace('.', ',')} m`}
      </Animated.Text>
    </Animated.View>
  );
}

/*
  CHAPITRE 3 — L'AMÉNAGEMENT. Le catalogue monte ; un doigt prend le canapé
  et le pose dans le séjour, où il tombe à ses cotes ; puis le reste du
  mobilier se pose, pièce par pièce.
*/
function SceneMeubles({ t, w, h, c }: Scene) {
  const styles = getStyles(c);
  const plan = planDuFilm();
  const cw = w;
  const ch = Math.min(h, w * 0.92);
  const k = cadrage(plan, cw, ch, 34);
  const canape = plan.meubles.find((m) => m.modele.startsWith('canape')) ?? plan.meubles[0];
  // Le catalogue, en bas de la feuille : quatre tuiles.
  const tuiles = ['sofa', 'bed', 'table', 'storage'] as const;
  const tuile = 54;
  const yStrip = ch - tuile - 16;
  const xTuile0 = cw / 2 - (tuiles.length * (tuile + 10) - 10) / 2;
  const depart = { x: xTuile0 + tuile / 2, y: yStrip + tuile / 2 };
  const arrivee = { x: k.px(canape.cx), y: k.py(canape.cz) };
  const autres = plan.meubles.filter((m) => m.id !== canape.id);
  return (
    <View style={[styles.feuille, { width: cw, height: ch }]}>
      <PlanFige w={cw} h={ch} marge={34} meubles={false} c={c} />
      {[canape, ...autres].map((m, i) => {
        const t0 = i === 0 ? 0.47 : 0.56 + (i - 1) * (0.3 / autres.length);
        const R = (Math.hypot(m.w, m.d) * k.s) / 2 + 3;
        return (
          <Animated.View
            key={m.id}
            testID={`meuble-film-${m.id}`}
            style={{
              ...styles.libre,
              left: k.px(m.cx) - R,
              top: k.py(m.cz) - R,
              width: 2 * R,
              height: 2 * R,
              opacity: paraitre(t, t0, t0 + 0.05),
              transform: [{ scale: fenetre(t, t0, t0 + 0.12, 1.35, 1, REBOND) }],
            }}>
            <Svg width={2 * R} height={2 * R}>
              <G transform={`translate(${R}, ${R}) rotate(${(m.yaw * 180) / Math.PI})`}>
                <MeubleDuPlan m={m} s={k.s} c={c} />
              </G>
            </Svg>
          </Animated.View>
        );
      })}
      {/* Les murs repassent devant : un meuble ne mord jamais un mur. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={cw} height={ch}>
          <Murs plan={plan} k={k} c={c} />
        </Svg>
      </View>
      <Animated.View
        style={[
          styles.catalogue,
          {
            top: yStrip - 10,
            left: xTuile0 - 12,
            width: tuiles.length * (tuile + 10) + 14,
            transform: [{ translateY: fenetre(t, 0.04, 0.16, 90, 0) }, { translateY: fenetre(t, 0.86, 0.96, 0, 110) }],
          },
        ]}>
        {tuiles.map((kind) => (
          <View key={kind} style={[styles.tuile, { width: tuile, height: tuile }]}>
            <Svg width={34} height={30}>
              <G transform="translate(17, 15)">
                {furnitureStrokes(kind, 30, kind === 'bed' ? 26 : 22).map((ligne, i) => (
                  <Path key={i} d={ligne.map((p, j) => `${j ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} stroke={c.ink} strokeWidth={1.3} fill="none" />
                ))}
                <Rect x={-15} y={-11} width={30} height={22} rx={3} stroke={c.ink} strokeWidth={1.3} fill="none" />
              </G>
            </Svg>
          </View>
        ))}
      </Animated.View>
      {/* Le doigt : il appuie, il glisse, il lâche. */}
      <Animated.View
        style={[
          styles.doigt,
          {
            left: depart.x - 22,
            top: depart.y - 22,
            opacity: Animated.multiply(paraitre(t, 0.18, 0.24), fenetre(t, 0.48, 0.54, 1, 0)),
            transform: [
              { translateX: fenetre(t, 0.27, 0.46, 0, arrivee.x - depart.x, (x) => x * x * (3 - 2 * x)) },
              { translateY: fenetre(t, 0.27, 0.46, 0, arrivee.y - depart.y, (x) => x * x * (3 - 2 * x)) },
              { scale: fenetre(t, 0.22, 0.27, 1.2, 0.9) },
            ],
          },
        ]}
      />
    </View>
  );
}

/*
  CHAPITRE 4 — LA 3D. Le logement vide se pose, puis le mobilier y apparaît ;
  la caméra s'approche doucement. Enfin, une vignette : la même pièce, vue de
  dedans, à hauteur d'œil.
*/
function Scene3D({ t, w, h, c }: Scene) {
  const styles = getStyles(c);
  const cw = Math.min(w, h * RATIO_MAISON);
  const ch = cw / RATIO_MAISON;
  const vw = cw * 0.36;
  const vh = vw / RATIO_PIECE * 0.62;
  return (
    <View style={{ width: cw, height: ch }}>
      <Animated.View
        style={[
          styles.carteImage,
          { width: cw, height: ch, opacity: paraitre(t, 0, 0.1) },
        ]}>
        <Animated.View style={{ width: cw, height: ch, transform: [{ scale: fenetre(t, 0, 1, 1.0, 1.1, (x) => x) }, { translateY: fenetre(t, 0, 1, 12, -8, (x) => x) }] }}>
          <Image source={IMAGE_MAISON_VIDE} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fenetre(t, 0.24, 0.46) }]}>
            <Image source={IMAGE_MAISON} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </Animated.View>
        </Animated.View>
      </Animated.View>
      <Animated.View
        style={[
          styles.vignette,
          {
            width: vw,
            height: vh,
            opacity: paraitre(t, 0.6, 0.68),
            transform: [{ translateY: fenetre(t, 0.6, 0.74, 40, 0) }, { scale: fenetre(t, 0.6, 0.74, 0.9, 1, REBOND) }],
          },
        ]}>
        <Image source={IMAGE_PIECE} style={{ width: vw, height: vw / RATIO_PIECE, marginTop: -vw * 0.55 }} resizeMode="cover" />
        <View style={styles.vignetteBandeau}>
          <Text style={styles.vignetteTexte}>À hauteur d’œil</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/*
  CHAPITRE 5 — LE DOSSIER. La feuille sort, cartouche, plan meublé, 3D et
  surfaces ; puis les formats se posent autour d'elle, et c'est envoyé.
*/
function ScenePartage({ t, w, h, c }: Scene) {
  const styles = getStyles(c);
  const plan = planDuFilm();
  const fh = Math.min(h * 0.96, (w * 0.72) * 1.414);
  const fw = fh / 1.414;
  const formats = [
    { nom: 'PDF', teinte: '#E5484D', x: -fw * 0.62, y: -fh * 0.18 },
    { nom: 'DXF', teinte: c.blue, x: fw * 0.62, y: -fh * 0.02 },
    { nom: '3D', teinte: '#1DB954', x: -fw * 0.6, y: fh * 0.22 },
  ];
  return (
    <View style={[styles.centre, { width: w, height: h }]}>
      <Animated.View
        style={[
          styles.page,
          {
            width: fw,
            height: fh,
            opacity: paraitre(t, 0, 0.1),
            transform: [{ translateY: fenetre(t, 0, 0.22, 120, 0) }, { rotate: '-3deg' }, { scale: fenetre(t, 0, 0.22, 0.92, 1) }],
          },
        ]}>
        <View style={styles.pageTete}>
          <LogoEcho size={14} teinte={c.ink} />
          <Text style={styles.pageMarque}>EchoPlan</Text>
        </View>
        <Text style={styles.pageTitre} numberOfLines={1}>
          {NOM_EXEMPLE}
        </Text>
        <Text style={styles.pageSous}>{`${plan.pieces.length} pièces · ${aireEnClair(plan.total)}`}</Text>
        <View style={[styles.pagePlan, { height: fw * 0.62 }]}>
          <PlanFige w={fw - 24} h={fw * 0.62} marge={6} meubles c={c} />
        </View>
        <View style={styles.pageBas}>
          <Image source={IMAGE_MAISON} style={[styles.pageVignette, { width: fw * 0.38, height: (fw * 0.38) / RATIO_MAISON }]} />
          <View style={styles.pageListe}>
            {plan.pieces.map((p) => (
              <View key={p.id} style={styles.pageLigne}>
                <Text style={styles.pageLigneNom} numberOfLines={1}>
                  {p.nom}
                </Text>
                <Text style={styles.pageLigneAire}>{aireEnClair(p.aire)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Animated.View>
      {formats.map((f, i) => {
        const t0 = 0.36 + i * 0.08;
        return (
          <Animated.View
            key={f.nom}
            style={[
              styles.format,
              {
                transform: [
                  { translateX: f.x },
                  { translateY: f.y },
                  { scale: fenetre(t, t0, t0 + 0.14, 0.3, 1, REBOND) },
                ],
                opacity: paraitre(t, t0, t0 + 0.06),
              },
            ]}>
            <View style={[styles.formatPastille, { backgroundColor: f.teinte }]}>
              <Text style={styles.formatNom}>{f.nom}</Text>
            </View>
          </Animated.View>
        );
      })}
      <Animated.View
        style={[
          styles.envoye,
          { opacity: paraitre(t, 0.78, 0.86), transform: [{ translateY: fenetre(t, 0.78, 0.9, 18, 0) }] },
        ]}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M5 12.5l4.2 4.2L19 7" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={styles.envoyeTexte}>Dossier envoyé</Text>
      </Animated.View>
    </View>
  );
}

const SCENES: Record<(typeof CHAPITRES)[number]['cle'], (p: Scene) => React.ReactElement> = {
  scan: SceneScan,
  plan: ScenePlan,
  meubles: SceneMeubles,
  '3d': Scene3D,
  partage: ScenePartage,
};

// ------------------------------------------------------------ le lecteur

export function FilmTutoriel({
  onFini,
  onPasser,
  finTexte = 'C’est parti',
}: {
  onFini: () => void;
  onPasser: () => void;
  /** Ce que dit le bouton du dernier chapitre. */
  finTexte?: string;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const marges = useSafeAreaInsets();
  const [rang, setRang] = useState(0);
  const [fini, setFini] = useState(false);
  const [prise, setPrise] = useState(0);
  const [scene, setScene] = useState({ w: 0, h: 0 });
  const [reduit, setReduit] = useState(false);
  const horloge = useRef(new Animated.Value(0)).current;
  const coupure = useRef(new Animated.Value(0)).current;
  const bouton = useRef(new Animated.Value(0)).current;
  const enCours = useRef<Animated.CompositeAnimation | null>(null);
  const chapitre = CHAPITRES[rang];
  const dernier = rang === CHAPITRES.length - 1;

  useEffect(() => {
    // Qui a demandé moins de mouvement voit chaque chapitre déjà joué.
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((v) => {
        if (v) setReduit(true);
      })
      .catch(() => undefined);
  }, []);

  /** La fin d'un chapitre : l'image se fige, « Suivant » apparaît. */
  const conclure = useCallback(() => {
    setFini(true);
    Animated.spring(bouton, { toValue: 1, damping: 15, stiffness: 190, mass: 0.8, useNativeDriver: true }).start();
  }, [bouton]);

  useEffect(() => {
    setFini(false);
    bouton.setValue(0);
    horloge.setValue(0);
    if (reduit) {
      horloge.setValue(1);
      conclure();
      return;
    }
    const anim = Animated.timing(horloge, {
      toValue: 1,
      duration: chapitre.duree,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    enCours.current = anim;
    anim.start(({ finished }) => {
      if (finished) conclure();
    });
    return () => anim.stop();
  }, [rang, prise, reduit, chapitre.duree, horloge, bouton, conclure]);

  /** Un appui sur l'image : droit à la fin du chapitre. */
  const allerALaFin = () => {
    if (fini) return;
    enCours.current?.stop();
    horloge.setValue(1);
    conclure();
  };

  /** « Suivant » : la coupure, puis le chapitre d'après. */
  const suivant = () => {
    if (!fini) return;
    haptic('leger');
    if (dernier) {
      onFini();
      return;
    }
    Animated.timing(coupure, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setRang((r) => r + 1);
      Animated.timing(coupure, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    });
  };

  const Scene = SCENES[chapitre.cle];
  return (
    <View style={[styles.fond, { paddingTop: marges.top + 8, paddingBottom: Math.max(marges.bottom, 14) + 6 }]}>
      {/* La barre des chapitres, et la sortie. */}
      <View style={styles.barre}>
        <View style={styles.pistes} accessibilityLabel={`Étape ${rang + 1} sur ${CHAPITRES.length}`}>
          {CHAPITRES.map((ch, i) => (
            <View key={ch.cle} style={styles.piste} testID={`piste-${i}`}>
              <Animated.View
                style={[
                  styles.pisteVive,
                  {
                    transform: [{ scaleX: i < rang ? 1 : i > rang ? 0 : horloge }],
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Passer le film" hitSlop={12} onPress={onPasser}>
          <Text style={styles.passer}>Passer</Text>
        </Pressable>
      </View>

      {/* La scène : elle joue ; un appui l'amène à sa fin. */}
      <Pressable
        style={styles.scene}
        accessibilityRole="image"
        accessibilityLabel={`${chapitre.titre}. ${chapitre.phrase}`}
        onPress={allerALaFin}
        onLayout={(e) => setScene({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {scene.w > 0 && <Scene key={`${rang}-${prise}`} t={horloge} w={scene.w} h={scene.h} c={c} />}
        {/* La coupure : un battement de fond entre deux chapitres. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.coupure, { opacity: coupure }]} />
      </Pressable>

      {/* Le chapitre se dit en même temps qu'il se joue. */}
      <Animated.View
        key={`texte-${rang}`}
        style={[styles.textes, { opacity: paraitre(horloge, 0, 0.1), transform: [{ translateY: fenetre(horloge, 0, 0.14, 14, 0) }] }]}>
        <Text style={styles.numero}>{`${rang + 1} / ${CHAPITRES.length}`}</Text>
        <Text style={styles.titre} numberOfLines={2} adjustsFontSizeToFit>
          {chapitre.titre}
        </Text>
        <Text style={styles.phrase}>{chapitre.phrase}</Text>
      </Animated.View>

      {/* « Suivant » n'apparaît qu'à la fin du chapitre ; « Revoir » avec lui. */}
      <Animated.View
        pointerEvents={fini ? 'auto' : 'none'}
        style={[styles.actions, { opacity: bouton, transform: [{ translateY: bouton.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Revoir l’étape"
          hitSlop={8}
          style={({ pressed }) => [styles.revoir, pressed && styles.enfonce]}
          onPress={() => {
            haptic('leger');
            setPrise((p) => p + 1);
          }}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M4 12a8 8 0 1 0 2.4-5.7" stroke={c.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <Path d="M4 4v4.5h4.5" stroke={c.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dernier ? finTexte : 'Suivant'}
          accessibilityState={{ disabled: !fini }}
          style={({ pressed }) => [styles.suivant, pressed && styles.enfonce]}
          onPress={suivant}>
          <Text style={styles.suivantTexte}>{dernier ? finTexte : 'Suivant'}</Text>
          {!dernier && (
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M9 5l7 7-7 7" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    fond: { flex: 1, backgroundColor: c.bg, paddingHorizontal: 20 },
    barre: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 32 },
    pistes: { flex: 1, flexDirection: 'row', gap: 5 },
    piste: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' },
    pisteVive: { flex: 1, backgroundColor: c.ink, transformOrigin: 'left' },
    passer: { color: c.inkSoft, fontSize: 16, fontWeight: '600' },
    scene: { flex: 1, marginTop: 14, alignItems: 'center', justifyContent: 'center' },
    coupure: { backgroundColor: c.bg },
    textes: { alignItems: 'center', paddingTop: 18, paddingBottom: 14, paddingHorizontal: 6 },
    numero: { color: c.inkFaint, fontSize: 12.5, fontWeight: '700', letterSpacing: 1.2 },
    titre: {
      color: c.ink,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '800',
      letterSpacing: -0.8,
      textAlign: 'center',
      marginTop: 4,
    },
    phrase: { color: c.inkSoft, fontSize: 15.5, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 340 },
    actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    revoir: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowCard,
    },
    suivant: {
      flex: 1,
      minHeight: 56,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suivantTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    enfonce: { opacity: 0.85, transform: [{ scale: 0.985 }] },
    // Le téléphone : une lunette noire, un écran arrondi, une ombre franche.
    telephone: {
      backgroundColor: '#101114',
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
    ecranTel: { overflow: 'hidden', backgroundColor: '#000', alignItems: 'flex-start' },
    arete: {
      position: 'absolute',
      height: 2,
      borderRadius: 1,
      backgroundColor: '#FFFFFF',
      transformOrigin: 'left',
      shadowColor: '#FFFFFF',
      shadowOpacity: 0.9,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 0 },
    },
    areteMeuble: { backgroundColor: '#FFE3A8', shadowColor: '#FFC24D' },
    ilot: { position: 'absolute', borderRadius: 20, backgroundColor: '#000' },
    consigne: {
      position: 'absolute',
      alignSelf: 'center',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    consigneTexte: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
      backgroundColor: 'rgba(12,14,20,0.62)',
      overflow: 'hidden',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    consigneFin: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4 },
    declencheur: {
      position: 'absolute',
      width: 46,
      height: 46,
      borderRadius: 23,
      borderWidth: 3,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    declencheurCoeur: { width: 18, height: 18, borderRadius: 4, backgroundColor: '#FF453A' },
    // La feuille du plan : le papier blanc, une ombre douce.
    feuille: {
      backgroundColor: c.surface,
      borderRadius: 26,
      overflow: 'hidden',
      ...shadowCard,
    },
    cache: { position: 'absolute', top: 0, bottom: 0, backgroundColor: c.surface },
    faisceau: {
      position: 'absolute',
      left: -2,
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: c.blue,
      shadowColor: c.blue,
      shadowOpacity: 0.9,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    },
    etiquette: { position: 'absolute', width: 120, alignItems: 'center' },
    cartouche: {
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 9,
      backgroundColor: c.surfaceVoile,
    },
    etiquetteNom: { color: c.ink, fontSize: 12.5, fontWeight: '800' },
    etiquetteAire: { color: c.inkSoft, fontSize: 11.5, fontWeight: '600', marginTop: 1 },
    cote: { position: 'absolute', height: 1.5, backgroundColor: c.blue },
    coteTexte: { position: 'absolute', textAlign: 'center', color: c.blue, fontSize: 12, fontWeight: '800' },
    coteVerticale: { width: 80 },
    catalogue: {
      position: 'absolute',
      flexDirection: 'row',
      gap: 10,
      padding: 7,
      paddingHorizontal: 12,
      borderRadius: 20,
      backgroundColor: c.surface,
      ...shadowCard,
    },
    tuile: { borderRadius: 14, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
    doigt: {
      position: 'absolute',
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(31,91,255,0.22)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.95)',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    carteImage: { borderRadius: 26, overflow: 'hidden', backgroundColor: '#F4F2EE', ...shadowCard },
    libre: { position: 'absolute' },
    centre: { alignItems: 'center', justifyContent: 'center' },
    pagePlan: { marginTop: 6 },
    pageListe: { flex: 1, gap: 2 },
    vignette: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 3,
      borderColor: '#FFFFFF',
      backgroundColor: '#F4F2EE',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    vignetteBandeau: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingVertical: 5,
      backgroundColor: 'rgba(12,14,20,0.55)',
      alignItems: 'center',
    },
    vignetteTexte: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
    // La page du dossier : un A4 blanc, quoi qu'il arrive au thème.
    page: {
      backgroundColor: '#FFFFFF',
      borderRadius: 10,
      padding: 12,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    pageTete: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    pageMarque: { color: '#0B0D12', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
    pageTitre: { color: '#0B0D12', fontSize: 15, fontWeight: '800', marginTop: 6 },
    pageSous: { color: '#5A6472', fontSize: 10.5, fontWeight: '600', marginTop: 1 },
    pageBas: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' },
    pageVignette: { borderRadius: 6 },
    pageLigne: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
    pageLigneNom: { color: '#0B0D12', fontSize: 9.5, fontWeight: '600', flexShrink: 1 },
    pageLigneAire: { color: '#5A6472', fontSize: 9.5, fontWeight: '600' },
    format: { position: 'absolute' },
    formatPastille: {
      width: 58,
      height: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
    },
    formatNom: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
    envoye: {
      position: 'absolute',
      bottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: '#1DB954',
    },
    envoyeTexte: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  }),
);
