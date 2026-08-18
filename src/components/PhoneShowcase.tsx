/**
 * LA VITRINE DE L'ACCUEIL — un téléphone qui tourne, un logement dedans.
 *
 * L'accueil expliquait l'application en trois lignes : « Scannez, ajustez,
 * explorez ». Trois pictogrammes et neuf mots pour dire ce qu'une seule image
 * montre mieux — le résultat. On ne vend pas un scanner de pièces avec un
 * mode d'emploi ; on le vend avec le plan qui en sort.
 *
 * Le logement dessiné ici passe par LE MÊME CHEMIN que la vue 3D de l'app :
 * `buildScene` bâtit la scène, `sceneFraming` la cadre, le tri du peintre
 * l'ordonne, `shadeFill` la peint. Ce n'est pas une illustration, c'est une
 * sortie de l'application — si le rendu change, la vitrine change avec lui,
 * et elle ne peut pas promettre ce que l'app ne fait pas.
 *
 * TROIS MOUVEMENTS, ET UN SEUL RESSORT.
 *
 * Le téléphone s'incline (`rotateY`, `rotateZ`) pendant que la scène tourne
 * sur elle-même : les deux suivent la même horloge, si bien que le volume
 * paraît solidaire du boîtier plutôt que collé dessus. La rotation de la
 * maquette est plus rapide que celle du téléphone — c'est ce décalage qui
 * donne la profondeur, comme un objet qu'on tourne dans la main.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Polygon, Polyline } from 'react-native-svg';
import {
  buildScene,
  cutawayOpacity,
  faceDepth,
  isHiddenFace,
  sceneFraming,
  shadeFill,
  type ScenePalette,
} from '../geometry/scene3d';
import type { WallSeg } from '../geometry/floorplan';
import type { ObjectData } from 'react-native-room-scan';
import { useTheme, type Palette } from '../theme';

/** L'écran du téléphone, en points. */
const ECRAN = { w: 132, h: 268 };
/** Le boîtier, marges comprises. */
const BOITIER = { w: ECRAN.w + 14, h: ECRAN.h + 14 };

const mur = (
  id: string,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): WallSeg => ({
  id,
  type: 'wall',
  a: { x: ax, z: az },
  b: { x: bx, z: bz },
  height: 2.5,
  yCenter: 1.25,
  roomId: 'r1',
});

const meuble = (
  id: string,
  category: string,
  cx: number,
  cz: number,
  w: number,
  d: number,
  h: number,
  yaw = 0,
): ObjectData => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    id,
    category,
    width: w,
    depth: d,
    height: h,
    transform: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, cx, h / 2, cz, 1],
  };
};

/**
 * UN T2 MEUBLÉ, et pas l'appartement de référence des planches.
 *
 * Celui-ci est dessiné pour la vitrine : deux pièces franches, un séjour
 * ouvert, de quoi reconnaître un logement en un coup d'œil à trois
 * centimètres de haut. L'appartement de référence, lui, sert à comparer des
 * rendus au pixel — il est plein de cas tordus, et c'est très bien pour un
 * banc d'essai, illisible sur une vignette.
 */
const MURS: WallSeg[] = [
  mur('n', 0, 0, 6.2, 0),
  mur('e', 6.2, 0, 6.2, 4.4),
  mur('s', 6.2, 4.4, 0, 4.4),
  mur('o', 0, 4.4, 0, 0),
  // La cloison de la chambre, avec son passage.
  mur('refend', 3.9, 0, 3.9, 2.6),
];
const OUVERTURES: WallSeg[] = [
  { ...mur('baie', 1.2, 0, 3.1, 0), type: 'window', height: 1.5, yCenter: 1.3 },
  { ...mur('porte', 5.1, 4.4, 4.2, 4.4), type: 'door', height: 2.05, yCenter: 1.02 },
];
const MEUBLES: ObjectData[] = [
  meuble('canape', 'sofa', 1.9, 3.3, 2.1, 0.9, 0.8),
  meuble('table', 'table', 1.9, 1.6, 1.2, 0.8, 0.75),
  meuble('tv', 'television', 0.35, 2.4, 0.1, 1.2, 0.6),
  meuble('biblio', 'storage', 3.55, 1.5, 0.4, 1.6, 1.9),
  meuble('lit', 'bed', 5.1, 1.1, 1.4, 1.9, 0.5),
  meuble('chevet', 'storage', 5.95, 0.35, 0.4, 0.4, 0.5),
  meuble('armoire', 'storage', 4.3, 0.6, 0.6, 1.2, 2),
];
const PIECES = [
  { id: 'r1', wallIds: ['n', 'e', 's', 'o', 'refend'] },
];

/** La palette de la maquette : elle suit le thème de l'app. */
/**
 * Une palette PLUS CONTRASTÉE que celle du plan grandeur nature.
 *
 * Sur trois centimètres de haut, un gris clair sur blanc n'existe pas : les
 * murs disparaissaient et il ne restait que les meubles, flottant dans du
 * vide. Le poché des murs se fonce donc, leurs arêtes aussi, et le sol prend
 * une teinte franche — la maquette doit se lire d'un coup d'œil, de loin,
 * sur un écran qu'on tient à bout de bras.
 */
function palettePour(c: Palette): ScenePalette {
  return {
    floor: c.blueSoft,
    floorStroke: c.line,
    wall: c.surface,
    wallStroke: c.inkFaint,
    wallTop: c.line,
    wallTopStroke: c.inkFaint,
    opening: c.inkFaint,
    door: c.amber,
    window: c.sky,
    passage: c.blue,
    object: c.blueSoft,
    objectTop: c.surface,
    objectStroke: c.blue,
  };
}

export function PhoneShowcase() {
  const c = useTheme();
  const styles = getStyles(c);

  /**
   * La scène se bâtit UNE FOIS. Seule la projection se refait à chaque
   * image : reconstruire les volumes trente fois par seconde sur un écran
   * d'accueil serait payer très cher un mouvement de trois degrés.
   *
   * `coarse` donne des pans d'un seul tenant — la découpe en bandes ne se
   * voit pas sur une maquette haute de trois centimètres, les saccades si.
   */
  const scene = useMemo(
    () =>
      buildScene(MURS, OUVERTURES, MEUBLES, {
        palette: palettePour(c),
        showSurfaces: true,
        rooms: PIECES,
        coarse: true,
      }),
    [c],
  );
  const cadre = useMemo(() => sceneFraming(scene.faces), [scene]);

  /** L'horloge unique : un tour complet en vingt-huit secondes. */
  const [tour, setTour] = useState(0);
  useEffect(() => {
    /*
      VINGT-CINQ IMAGES PAR SECONDE, PAS SOIXANTE.

      La maquette met vingt-huit secondes à faire un tour : à cette vitesse,
      l'œil ne distingue pas une image de plus, et chacune coûte cent
      cinquante polygones reprojetés. Un écran d'accueil n'a pas le droit de
      faire chauffer le téléphone avant même qu'on ait scanné quoi que ce
      soit.
    */
    const h = setInterval(() => setTour((t) => (t + 1) % 700), 40);
    return () => clearInterval(h);
  }, []);

  /** Le balancement du boîtier, sur le même cycle que la maquette. */
  const berce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(berce, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(berce, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [berce]);

  /* La maquette tourne sur elle-même, et s'incline doucement. */
  const theta = (tour / 700) * 360;
  const tilt = 52 + 6 * Math.sin((tour / 700) * Math.PI * 2);

  const dessin = useMemo(() => {
    const rad = (d: number) => (d * Math.PI) / 180;
    const ct = Math.cos(rad(theta));
    const st = Math.sin(rad(theta));
    const cp = Math.cos(rad(tilt));
    const sp = Math.sin(rad(tilt));
    // La maquette REMPLIT l'écran : cadrée à 42 %, elle flottait au milieu
    // d'un désert blanc, et l'on ne voyait plus ce qu'elle montrait.
    const scale = (Math.min(ECRAN.w, ECRAN.h) * 0.72) / cadre.radius3d;
    const project = (p: { x: number; y: number; z: number }) => {
      const x = p.x - cadre.center.x;
      const y = p.y - cadre.center.y;
      const z = p.z - cadre.center.z;
      const rx = x * ct - z * st;
      const rz = x * st + z * ct;
      return {
        sx: ECRAN.w / 2 + rx * scale,
        sy: ECRAN.h / 2 + (rz * cp - y * sp) * scale,
        depth: rz * sp + y * cp,
      };
    };
    const cam = { ct, st, cp, sp };
    return scene.faces
      .filter((f) => !isHiddenFace(f, cam))
      .map((f) => {
        const proj = f.pts.map(project);
        /*
          L'ÉCORCHÉ, comme dans la vue 3D de l'application.

          Sans lui, le mur qui se trouve ENTRE l'œil et la pièce se peint
          opaque comme les autres : la maquette devenait une cage de verre où
          l'on voyait quatre murs à la fois, et plus rien du logement. Le pan
          qui nous fait face s'efface donc en gardant son arête — on voit
          dedans, et l'on sait quand même où passe la cloison.
        */
        const voile =
          f.cutaway && f.normal ? cutawayOpacity(f.normal, cam) : 1;
        return {
          depth: faceDepth(f, project, cam),
          fill: shadeFill(f, ct, st),
          stroke: f.stroke,
          voile,
          points: proj.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' '),
          arete: proj.length === 2,
        };
      })
      .sort((a, b) => a.depth - b.depth);
  }, [scene, cadre, theta, tilt]);

  return (
    <Animated.View
      style={[
        styles.scene,
        {
          transform: [
            // La perspective donne au boîtier son épaisseur : sans elle, une
            // rotation sur Y n'est qu'un aplatissement.
            { perspective: 900 },
            {
              rotateY: berce.interpolate({
                inputRange: [0, 1],
                outputRange: ['-13deg', '13deg'],
              }),
            },
            {
              rotateZ: berce.interpolate({
                inputRange: [0, 1],
                outputRange: ['-3.5deg', '3.5deg'],
              }),
            },
            {
              translateY: berce.interpolate({
                inputRange: [0, 1],
                outputRange: [4, -4],
              }),
            },
          ],
        },
      ]}>
      {/* Le halo posé sous l'appareil : il le décolle du fond, comme une
          ombre portée le ferait sur une table. */}
      <View style={styles.halo} pointerEvents="none" />
      <View style={styles.boitier}>
        <View style={styles.ecran}>
          <Svg width={ECRAN.w} height={ECRAN.h}>
            {dessin.map((p, i) =>
              p.arete ? (
                <Polyline
                  key={i}
                  points={p.points}
                  fill="none"
                  stroke={p.stroke ?? 'none'}
                  strokeWidth={1}
                  opacity={0.3 + 0.7 * p.voile}
                />
              ) : (
                <Polygon
                  key={i}
                  points={p.points}
                  fill={p.fill ?? 'none'}
                  stroke={p.stroke ?? 'none'}
                  strokeWidth={0.9}
                  fillOpacity={p.voile}
                  strokeOpacity={0.3 + 0.7 * p.voile}
                />
              ),
            )}
          </Svg>
          {/* Le reflet de la dalle : une diagonale claire, très faible. Sans
              lui, l'écran est un trou dans le boîtier. */}
          <View style={styles.reflet} pointerEvents="none" />
        </View>
        {/* L'îlot dynamique : deux points suffisent à dire « iPhone ». */}
        <View style={styles.ilot} pointerEvents="none" />
      </View>
    </Animated.View>
  );
}

const getStyles = themedStylesLocal();

/** Les styles, mémoïsés par palette comme partout ailleurs dans l'app. */
function themedStylesLocal() {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
      scene: { alignItems: 'center', justifyContent: 'center' },
      halo: {
        position: 'absolute',
        width: BOITIER.w + 70,
        height: BOITIER.h + 40,
        borderRadius: 999,
        backgroundColor: c.blue,
        opacity: 0.1,
      },
      boitier: {
        width: BOITIER.w,
        height: BOITIER.h,
        borderRadius: 30,
        padding: 7,
        backgroundColor: c.ink,
        // Le bord de l'appareil attrape la lumière : un liseré plus clair
        // que le boîtier, comme le métal d'une tranche.
        borderWidth: 1.5,
        borderColor: c.inkSoft,
        shadowColor: c.ink,
        shadowOpacity: 0.35,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 14 },
        elevation: 10,
      },
      ecran: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: c.bg,
      },
      reflet: {
        position: 'absolute',
        top: -ECRAN.h * 0.3,
        left: -ECRAN.w * 0.2,
        width: ECRAN.w * 0.7,
        height: ECRAN.h * 1.4,
        backgroundColor: '#FFFFFF',
        opacity: 0.06,
        transform: [{ rotate: '18deg' }],
      },
      ilot: {
        position: 'absolute',
        top: 13,
        alignSelf: 'center',
        width: 42,
        height: 11,
        borderRadius: 6,
        backgroundColor: '#000000',
      },
    });
  return (c: Palette) => {
    let s = cache.get(c);
    if (!s) {
      s = creer(c);
      cache.set(c, s);
    }
    return s;
  };
}
