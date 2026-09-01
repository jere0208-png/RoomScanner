/**
 * CE QUI REND LE PLAN VIVANT — les poses se voient naître.
 *
 * Relevé du patron : « ajoute de courtes animations fluides lors d'ajouts
 * et autres interactions avec l'application un peu partout pour rendre
 * l'app vivante. Par exemple, on fait un lien d'interrupteur à lumière, on
 * voit des pointillés qui se génèrent de l'interrupteur à la lampe, puis
 * la lampe qui s'allume à la fin de l'animation. »
 *
 * UN MÉCANISME, PAS DES CAS PARTICULIERS. Trois pièces, que chaque calque
 * compose comme il veut :
 *
 *   — `useNaissances` sait ce qui vient d'APPARAÎTRE. La règle qui compte :
 *     une naissance, c'est ce qui arrive APRÈS le premier rendu — rouvrir
 *     un dossier de trente prises n'est pas trente naissances. Un accueil
 *     qui scintille de partout n'est plus vivant, il est agité ;
 *   — `OndeePose`, l'anneau qui s'élargit et s'éteint : le geste visuel du
 *     pouls des prises en 3D, repris pour saluer chaque pose. Six dixièmes
 *     de seconde, et le plan redevient calme ;
 *   — `LienQuiSeTisse`, la vitrine : la courbe se DÉROULE de l'interrupteur
 *     vers la lampe (l'astuce classique du trait qui se dessine — un seul
 *     tiret long comme la courbe, dont on anime le décalage), puis la lampe
 *     s'allume — un halo chaud qui monte et s'éteint.
 *
 * LA RÈGLE DE LA MAISON TIENT : on n'anime JAMAIS ce qui se mesure. Ces
 * calques vivent par-dessus la géométrie, un instant, puis se démontent —
 * pas une cote, pas un trait de plan ne change pendant qu'ils vivent. Et
 * tout roule au pilote JavaScript : les attributs SVG n'ont pas de voie
 * native, mais une poignée d'images sur six dixièmes de seconde ne se
 * dispute avec personne.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Circle, G, Polyline } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Ce que vit une naissance à l'écran, en millisecondes. */
export const VIE_ONDEE = 900;
/** Le tissage d'un lien : la courbe, puis l'allumage. */
export const VIE_TISSAGE = 1600;

/**
 * LES IDENTIFIANTS QUI VIENNENT DE NAÎTRE.
 *
 * On compare à ce qu'on a DÉJÀ VU : le premier rendu ensemence la mémoire
 * sans rien déclarer (ouvrir un dossier ne fait naître personne), puis tout
 * identifiant inconnu est une naissance — retenue le temps de son ondée,
 * et oubliée d'elle-même.
 */
export function useNaissances(ids: string[], vie = VIE_ONDEE): Set<string> {
  const vus = useRef<Set<string> | null>(null);
  const [nes, setNes] = useState<Set<string>>(() => new Set());
  const minuteries = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const m of minuteries.current) clearTimeout(m);
    },
    [],
  );
  if (vus.current === null) {
    // Premier rendu : tout ce qui est là était déjà là.
    vus.current = new Set(ids);
  }
  useEffect(() => {
    const neufs = ids.filter((id) => !vus.current!.has(id));
    if (neufs.length === 0) return;
    for (const id of neufs) vus.current!.add(id);
    setNes((avant) => new Set([...avant, ...neufs]));
    const m = setTimeout(() => {
      setNes((avant) => {
        const apres = new Set(avant);
        for (const id of neufs) apres.delete(id);
        return apres;
      });
    }, vie);
    (m as { unref?: () => void }).unref?.();
    minuteries.current.push(m);
  }, [ids, vie]);
  return nes;
}

/**
 * L'ONDÉE D'UNE POSE : un anneau qui s'élargit et s'éteint.
 *
 * `retard` échelonne une série — six spots posés d'un geste font six
 * anneaux en cascade, pas une seule détonation.
 */
export function OndeePose({
  cx,
  cy,
  color,
  rayon = 22,
  retard = 0,
  id,
}: {
  cx: number;
  cy: number;
  color: string;
  rayon?: number;
  retard?: number;
  id: string;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: VIE_ONDEE - 250 - Math.min(retard, 250),
      delay: retard,
      easing: Easing.out(Easing.quad),
      // Attributs SVG : pas de voie native — et pas besoin d'elle.
      useNativeDriver: false,
    }).start();
  }, [t, retard]);
  return (
    <AnimatedCircle
      testID={`ondee-${id}`}
      cx={cx}
      cy={cy}
      fill="none"
      stroke={color}
      strokeWidth={2}
      r={t.interpolate({ inputRange: [0, 1], outputRange: [4, rayon] })}
      opacity={t.interpolate({
        inputRange: [0, 0.15, 1],
        outputRange: [0, 0.6, 0],
      })}
    />
  );
}

/**
 * LE LIEN QUI SE TISSE — de l'interrupteur à la lampe, puis la lumière.
 *
 * La courbe reçue est celle, au point près, du lien définitif : le tissage
 * se déroule EXACTEMENT là où le pointillé restera. Un seul tiret long
 * comme le chemin, dont le décalage fond vers zéro : le trait se dessine.
 * Arrivé au bout, le halo de la lampe monte et s'éteint — elle s'allume.
 */
export function LienQuiSeTisse({
  points,
  bout,
  color,
  halo = '#F5B841',
}: {
  /** La polyligne du lien, en pixels : « x,y x,y … ». */
  points: string;
  /** Où s'allume la lampe, en pixels. */
  bout: { x: number; y: number };
  color: string;
  halo?: string;
}) {
  const longueur = useMemo(() => {
    const pts = points
      .trim()
      .split(/\s+/)
      .map((p) => p.split(',').map(Number));
    let l = 0;
    for (let i = 1; i < pts.length; i++) {
      l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return Math.max(1, l);
  }, [points]);
  const fil = useRef(new Animated.Value(0)).current;
  const lumiere = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.timing(fil, {
        toValue: 1,
        duration: 620,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(lumiere, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();
  }, [fil, lumiere]);
  return (
    <G pointerEvents="none">
      <AnimatedPolyline
        testID="lien-tisse"
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray={`${longueur} ${longueur}`}
        strokeDashoffset={fil.interpolate({
          inputRange: [0, 1],
          outputRange: [longueur, 0],
        })}
        opacity={lumiere.interpolate({
          inputRange: [0, 0.6, 1],
          outputRange: [1, 1, 0],
        })}
      />
      <AnimatedCircle
        cx={bout.x}
        cy={bout.y}
        fill={halo}
        r={lumiere.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 13, 20] })}
        opacity={lumiere.interpolate({
          inputRange: [0, 0.15, 0.5, 1],
          outputRange: [0, 0.85, 0.5, 0],
        })}
      />
    </G>
  );
}

/**
 * L'APPARITION D'UN GROUPE SVG : l'élément fond en place.
 *
 * Pour ce qui mérite plus qu'un anneau — un meuble, une pièce — le calque
 * enveloppe son dessin : opacité de zéro à un, trois dixièmes.
 */
export function ApparitionSvg({ children }: { children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [t]);
  return <AnimatedG opacity={t}>{children}</AnimatedG>;
}
