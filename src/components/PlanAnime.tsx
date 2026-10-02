/**
 * LE PLAN QUI SE DESSINE — les trois étapes de l'application, en image.
 *
 * Relevé du patron : « refais les étapes animées pour la première utilisation,
 * sans texte juste : un plan 2D sur la première page, plan équipé sur la page
 * 2 et plan 3D sur la page 3. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * C'EST LE MÊME LOGEMENT AUX TROIS PAGES, ET C'EST TOUT L'INTÉRÊT.
 *
 * Trois illustrations sans rapport diraient « voici trois fonctions ». Le même
 * plan qui se trace, puis s'équipe, puis se lève, dit « voici ce qui arrive à
 * VOTRE logement » — c'est un cheminement, pas un catalogue. La géométrie est
 * donc écrite une fois, et les trois pages en sont trois lectures.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX FAÇONS D'ANIMER, ET LE CHOIX SE JUSTIFIE PAGE PAR PAGE.
 *
 * LES DEUX PREMIÈRES se contentent d'OPACITÉS ÉTAGÉES : les murs paraissent
 * l'un après l'autre, puis les appareils. Une seule valeur animée, décalée par
 * élément, et tout part sur le fil natif — le dessin ne coûte rien.
 *
 * LA TROISIÈME NE PEUT PAS. Des murs qui MONTENT, c'est une géométrie qui
 * change à chaque image : aucun `transform` ne la produit, il faut recalculer
 * les quadrilatères. On pilote donc la levée depuis JavaScript, à trente
 * images par seconde, sur neuf dixièmes de seconde.
 *
 * ET C'EST ACCEPTABLE ICI, ALORS QUE ÇA NE L'ÉTAIT PAS POUR LA VITRINE DE
 * L'ACCUEIL : cette page-ci s'affiche UNE FOIS dans la vie de l'application,
 * seule à l'écran, et rien d'autre ne réclame le fil pendant ce temps. La
 * vitrine, elle, tournait en boucle derrière un écran vivant — d'où les images
 * cuites d'avance. Même geste, deux contextes, deux réponses.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import type { Palette } from '../theme';

const ALine = Animated.createAnimatedComponent(Line);
const AG = Animated.createAnimatedComponent(G);

export type EtapeDuPlan = 'plan' | 'meuble' | 'volume';

/**
 * LE LOGEMENT — un T2 qu'on pourrait relever demain.
 *
 * Six mètres sur quatre vingt : les proportions d'un vrai deux-pièces, et un
 * rapport qui tient dans une carte de téléphone sans qu'on ait à l'étirer.
 */
const L = 6;
const P = 4.2;
/** Le refend, qui fait de ce rectangle un DEUX-pièces. */
const REFEND = 3.6;
/** La hauteur sous plafond, pour la levée. */
const HAUT = 2.5;

interface Segment {
  a: { x: number; z: number };
  b: { x: number; z: number };
  /** Un refend n'a pas de dehors : il ne s'efface jamais. Voir l'écorché. */
  interieur?: boolean;
}

const MURS: Segment[] = [
  { a: { x: 0, z: 0 }, b: { x: L, z: 0 } },
  { a: { x: L, z: 0 }, b: { x: L, z: P } },
  { a: { x: L, z: P }, b: { x: 0, z: P } },
  { a: { x: 0, z: P }, b: { x: 0, z: 0 } },
  { a: { x: REFEND, z: 0 }, b: { x: REFEND, z: P }, interieur: true },
];

/** Ce qui perce les murs : deux fenêtres, deux portes. */
const BAIES: { seg: Segment; porte: boolean }[] = [
  { seg: { a: { x: 0.9, z: 0 }, b: { x: 2.4, z: 0 } }, porte: false },
  { seg: { a: { x: 4.3, z: 0 }, b: { x: 5.5, z: 0 } }, porte: false },
  { seg: { a: { x: 0, z: 1.4 }, b: { x: 0, z: 2.3 } }, porte: true },
  { seg: { a: { x: REFEND, z: 2.6 }, b: { x: REFEND, z: 3.5 } }, porte: true },
];

/**
 * LE MOBILIER — ce qu'on vient faire dans cette application, quand on n'est
 * pas électricien.
 *
 * Relevé du patron, à la refonte grand public : « c'est trop axé électricité
 * et pas très intuitif pour ceux qui n'y comprennent rien ». La deuxième page
 * posait des prises ; elle pose maintenant un lit, une armoire, un canapé —
 * ce que tout le monde reconnaît sans légende. Le mode Électricité se propose
 * à la fin de la présentation, à ceux qu'il concerne.
 *
 * Six meubles, deux pièces : assez pour qu'on lise une chambre et un séjour,
 * pas assez pour encombrer une carte de la taille d'une main. Les portes
 * restent dégagées — un plan meublé qui bouche ses passages se lit comme une
 * erreur.
 */
interface Meuble {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Les traits qui font reconnaître le meuble : oreillers, dossier, vantaux. */
  traits?: [number, number, number, number][];
}
const MEUBLES: Meuble[] = [
  // La chambre : un lit tête au mur, ses deux oreillers, un chevet, une armoire.
  {
    x0: 0.9, z0: 2.15, x1: 2.5, z1: 4.1,
    traits: [
      [1.0, 3.72, 1.62, 3.72],
      [1.78, 3.72, 2.4, 3.72],
      [0.9, 3.4, 2.5, 3.4],
    ],
  },
  { x0: 2.6, z0: 3.7, x1: 2.95, z1: 4.05 },
  { x0: 2.65, z0: 0.12, x1: 3.5, z1: 0.7, traits: [[3.075, 0.12, 3.075, 0.7]] },
  // Le séjour : un canapé contre le mur, sa table basse, le meuble télé.
  {
    x0: 5.3, z0: 1.05, x1: 5.9, z1: 3.15,
    traits: [
      [5.74, 1.05, 5.74, 3.15],
      [5.3, 1.27, 5.74, 1.27],
      [5.3, 2.93, 5.74, 2.93],
    ],
  },
  { x0: 4.45, z0: 1.75, x1: 5.0, z1: 2.45 },
  { x0: 3.7, z0: 1.25, x1: 3.95, z1: 2.4 },
];

/** Le cosinus et le sinus de trente degrés : l'axonométrie de l'architecte. */
const CO = Math.cos(Math.PI / 6);
const SI = Math.sin(Math.PI / 6);

export function PlanAnime({
  etape,
  width,
  height,
  palette,
}: {
  etape: EtapeDuPlan;
  width: number;
  height: number;
  palette: Palette;
}) {
  const c = palette;
  /*
    L'ENTRÉE — une seule valeur animée pour tout le dessin.

    Chaque élément lit la même valeur avec sa PROPRE fenêtre : le mur du nord
    entre entre 0 et 0,2, celui de l'est entre 0,1 et 0,3, et ainsi de suite.
    C'est ce qui donne un plan qui SE TRACE, au lieu d'un plan qui s'allume —
    et ça ne coûte qu'une animation, sur le fil natif.
  */
  const entree = useRef(new Animated.Value(0)).current;
  /** La levée des murs, pour la troisième page. Voir l'en-tête. */
  const [leve, setLeve] = useState(etape === 'volume' ? 0 : 1);

  useEffect(() => {
    entree.setValue(0);
    Animated.timing(entree, {
      toValue: 1,
      duration: 950,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (etape !== 'volume') return;
    setLeve(0);
    let ecoule = 0;
    const h = setInterval(() => {
      ecoule += 33;
      const t = Math.min(1, ecoule / 900);
      // Le même lissage que la vue 3D : la levée part et s'arrête en douceur.
      setLeve((1 - Math.cos(Math.PI * t)) / 2);
      if (t >= 1) clearInterval(h);
    }, 33);
    return () => clearInterval(h);
  }, [etape, entree]);

  /** Le décalage d'un élément dans l'entrée : sa fenêtre à lui. */
  const paraitre = (rang: number, combien: number) => {
    const debut = (rang / Math.max(1, combien)) * 0.65;
    return entree.interpolate({
      inputRange: [debut, Math.min(1, debut + 0.35)],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  };

  const volume = etape === 'volume';
  /*
    LE CADRAGE — deux projections, deux emprises.

    À plat, le logement occupe six mètres sur quatre vingt. En axonométrie, il
    se couche : sa largeur devient (L + P)·cos30 et sa hauteur
    (L + P)·sin30 plus le mur. Cadrer les deux pareil ferait sauter le dessin
    d'une page à l'autre — or c'est le MÊME logement, et il doit rester à la
    même place.
  */
  const marge = 22;
  const emprise = volume
    ? { w: (L + P) * CO, h: (L + P) * SI + HAUT }
    : { w: L, h: P };
  const k = Math.min(
    (width - marge * 2) / emprise.w,
    (height - marge * 2) / emprise.h,
  );
  const centre = { x: width / 2, y: height / 2 };

  /** Un point du plan, à l'écran. `y` est la hauteur, vers le haut. */
  const pt = (x: number, z: number, y = 0) => {
    if (!volume) {
      return {
        sx: centre.x + (x - L / 2) * k,
        sy: centre.y + (z - P / 2) * k,
      };
    }
    const ox = (x - L / 2) * k;
    const oz = (z - P / 2) * k;
    return {
      sx: centre.x + (ox - oz) * CO,
      // Le demi-mur remonte le dessin : sans ça, le volume pend sous la ligne.
      sy: centre.y + (ox + oz) * SI - y * k + (HAUT * k) / 4,
    };
  };

  const encre = c.ink;
  const bleu = c.blue;

  // ─────────────────────────────────────────────────────────── À PLAT
  if (!volume) {
    return (
      <View style={{ width, height }} pointerEvents="none">
        <Svg width={width} height={height}>
          {/* Le sol des deux pièces : ce qui fait lire « pièce » et non
              « quatre traits ». */}
          <AG opacity={paraitre(0, 8)}>
            <Polygon
              points={[
                pt(0, 0),
                pt(REFEND, 0),
                pt(REFEND, P),
                pt(0, P),
              ]
                .map((q) => `${q.sx},${q.sy}`)
                .join(' ')}
              fill={bleu}
              opacity={0.06}
            />
            <Polygon
              points={[pt(REFEND, 0), pt(L, 0), pt(L, P), pt(REFEND, P)]
                .map((q) => `${q.sx},${q.sy}`)
                .join(' ')}
              fill={bleu}
              opacity={0.06}
            />
          </AG>

          {/* LES MURS, L'UN APRÈS L'AUTRE. Le poché est un trait épais :
              c'est la convention du plan, et elle se lit sans légende. */}
          {MURS.map((m, i) => {
            const a = pt(m.a.x, m.a.z);
            const b = pt(m.b.x, m.b.z);
            return (
              <ALine
                key={`m${i}`}
                testID="mur-du-plan"
                x1={a.sx}
                y1={a.sy}
                x2={b.sx}
                y2={b.sy}
                stroke={encre}
                strokeWidth={7}
                strokeLinecap="butt"
                opacity={paraitre(i, 8)}
              />
            );
          })}

          {/* LES BAIES SE CREUSENT DANS LE POCHÉ : une porte est un vide, pas
              un trait de plus. On repasse donc le mur en fond, et l'on marque
              le seuil d'un filet. */}
          {BAIES.map((o, i) => {
            const a = pt(o.seg.a.x, o.seg.a.z);
            const b = pt(o.seg.b.x, o.seg.b.z);
            return (
              <AG key={`o${i}`} opacity={paraitre(5, 8)}>
                <Line
                  x1={a.sx}
                  y1={a.sy}
                  x2={b.sx}
                  y2={b.sy}
                  stroke={c.bg}
                  strokeWidth={7}
                  strokeLinecap="butt"
                />
                <Line
                  x1={a.sx}
                  y1={a.sy}
                  x2={b.sx}
                  y2={b.sy}
                  stroke={o.porte ? c.amber : c.sky}
                  strokeWidth={2.5}
                  strokeLinecap="butt"
                />
              </AG>
            );
          })}

          {/* LES COTES — deux suffisent : la longueur et la largeur. Un plan
              couvert de cotes dit « document technique » ; deux cotes disent
              « c'est mesuré », ce qui est le message. */}
          <AG opacity={paraitre(6, 8)}>
            {(() => {
              const g = pt(0, P);
              const d = pt(L, P);
              const y = g.sy + 18;
              return (
                <>
                  <Line x1={g.sx} y1={y} x2={d.sx} y2={y} stroke={c.inkFaint} strokeWidth={1} />
                  <Line x1={g.sx} y1={y - 4} x2={g.sx} y2={y + 4} stroke={c.inkFaint} strokeWidth={1} />
                  <Line x1={d.sx} y1={y - 4} x2={d.sx} y2={y + 4} stroke={c.inkFaint} strokeWidth={1} />
                  <SvgText
                    x={(g.sx + d.sx) / 2}
                    y={y + 15}
                    fontSize={11}
                    fontWeight="700"
                    fill={c.inkSoft}
                    textAnchor="middle">
                    {`${L.toFixed(2).replace('.', ',')} m`}
                  </SvgText>
                </>
              );
            })()}
          </AG>

          {/* ─────────── ET LES MEUBLES, SUR LA DEUXIÈME PAGE SEULEMENT. */}
          {etape === 'meuble' &&
            MEUBLES.map((m, i) => {
              const coins = [
                pt(m.x0, m.z0),
                pt(m.x1, m.z0),
                pt(m.x1, m.z1),
                pt(m.x0, m.z1),
              ];
              return (
                <AG key={`m${i}`} opacity={paraitre(i, MEUBLES.length + 1)}>
                  <Polygon
                    testID="meuble-pose"
                    points={coins.map((q) => `${q.sx},${q.sy}`).join(' ')}
                    fill={c.surface}
                    stroke={bleu}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                  />
                  {(m.traits ?? []).map(([ax, az, bx, bz], k) => {
                    const a = pt(ax, az);
                    const b = pt(bx, bz);
                    return (
                      <Line
                        key={k}
                        x1={a.sx}
                        y1={a.sy}
                        x2={b.sx}
                        y2={b.sy}
                        stroke={bleu}
                        strokeWidth={1}
                        opacity={0.6}
                      />
                    );
                  })}
                </AG>
              );
            })}
        </Svg>
      </View>
    );
  }

  // ────────────────────────────────────────────────────────── EN VOLUME
  /*
    LES MURS SE LÈVENT, ET LES PLUS LOINTAINS SE PEIGNENT D'ABORD.

    Sans ce tri, un mur du fond passe par-dessus un mur de devant et le volume
    se retourne — c'est le défaut classique d'une axonométrie dessinée à plat.
    La profondeur d'un mur, ici, c'est la somme de ses coordonnées : plus elle
    est grande, plus il est près de nous.
  */
  const h = HAUT * leve;
  /*
    L'ÉCORCHÉ — les murs qui nous font face s'effacent.

    Premier dessin : les cinq murs levés, et l'on obtenait une BOÎTE FERMÉE.
    Un volume clos ne dit rien d'un logement : on ne voit ni le sol, ni le
    refend, ni les pièces — c'est-à-dire rien de ce que l'application produit.

    C'est déjà la règle de la vue 3D de l'application, et elle s'écrit en une
    ligne : un mur dont la normale sortante regarde vers nous est un mur qu'on
    aurait dans le dos, et on le retire. En axonométrie, le regard vient d'en
    haut à droite — la direction (1, 1) du plan. Un refend, lui, n'a pas de
    dehors : il reste toujours.
  */
  const centrePlan = { x: L / 2, z: P / 2 };
  const visibles = MURS.filter((m) => {
    if (m.interieur) return true;
    const mx = (m.a.x + m.b.x) / 2;
    const mz = (m.a.z + m.b.z) / 2;
    // La normale sortante : du centre du logement vers le milieu du mur.
    return mx - centrePlan.x + (mz - centrePlan.z) <= 0;
  });
  const ordonnes = visibles
    .map((m) => ({ m, profondeur: (m.a.x + m.a.z + m.b.x + m.b.z) / 2 }))
    .sort((u, v) => u.profondeur - v.profondeur);

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Svg width={width} height={height}>
        {/* Le sol, en premier : tout se pose dessus. */}
        {/* Le sol des deux pièces, séparément : c'est le refend qui fait le
            deux-pièces, et il doit se lire au sol comme en élévation. */}
        <Polygon
          points={[pt(0, 0), pt(REFEND, 0), pt(REFEND, P), pt(0, P)]
            .map((q) => `${q.sx},${q.sy}`)
            .join(' ')}
          fill={bleu}
          opacity={0.1}
        />
        <Polygon
          points={[pt(REFEND, 0), pt(L, 0), pt(L, P), pt(REFEND, P)]
            .map((q) => `${q.sx},${q.sy}`)
            .join(' ')}
          fill={bleu}
          opacity={0.16}
        />
        <Polygon
          points={[pt(0, 0), pt(L, 0), pt(L, P), pt(0, P)]
            .map((q) => `${q.sx},${q.sy}`)
            .join(' ')}
          fill="none"
          stroke={bleu}
          strokeWidth={1}
          opacity={0.5}
        />
        {/*
          LES MEUBLES RESTENT AU SOL, et ils se peignent AVANT les murs.

          C'est le même logement, meublé à la page d'avant. Posés à plat sur le
          sol plutôt qu'en volume, ils n'ont pas à être départagés des murs :
          le refend qui se lève passe naturellement devant ceux de la chambre,
          qui est derrière lui, et derrière ceux du séjour, qui est devant.
        */}
        {MEUBLES.map((m, i) => (
          <Polygon
            key={`vm${i}`}
            points={[
              pt(m.x0, m.z0),
              pt(m.x1, m.z0),
              pt(m.x1, m.z1),
              pt(m.x0, m.z1),
            ]
              .map((q) => `${q.sx},${q.sy}`)
              .join(' ')}
            fill={c.surface}
            fillOpacity={0.9}
            stroke={bleu}
            strokeWidth={1}
            strokeOpacity={0.7}
          />
        ))}
        {ordonnes.map(({ m }, i) => {
          const a0 = pt(m.a.x, m.a.z);
          const b0 = pt(m.b.x, m.b.z);
          const a1 = pt(m.a.x, m.a.z, h);
          const b1 = pt(m.b.x, m.b.z, h);
          return (
            <G key={`v${i}`}>
              <Polygon
                testID="pan-de-mur"
                points={`${a0.sx},${a0.sy} ${b0.sx},${b0.sy} ${b1.sx},${b1.sy} ${a1.sx},${a1.sy}`}
                fill={encre}
                fillOpacity={0.07}
                stroke={encre}
                strokeWidth={1.2}
                strokeOpacity={0.45}
              />
              {/* L'arête du haut, plus franche : c'est elle qui donne la
                  hauteur, et c'est ce qu'on regarde monter. */}
              <Line
                x1={a1.sx}
                y1={a1.sy}
                x2={b1.sx}
                y2={b1.sy}
                stroke={encre}
                strokeWidth={2}
                opacity={0.85}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
