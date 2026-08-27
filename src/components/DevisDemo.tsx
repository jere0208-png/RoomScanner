/**
 * COMMENT ON COMPTE — l'explication, jouée plutôt qu'écrite.
 *
 * Relevé du patron, sur la deuxième page du devis : « on ne comprend pas bien
 * pour ce qui est compté… fais un tuto/animation en bounce et pops modernes :
 * un TGBT apparaît, un inter et un éclairage aussi, un tracé de tableau à
 * inter et tableau à l'éclairage, avec un métré de gaine qui augmente au fil
 * de l'animation. On liste au fur et à mesure sous forme de ticket avec les
 * images. L'utilisateur doit comprendre qu'on compte selon les métrés, le
 * matériel, etc. Ça doit être dynamique et moderne comme un jeu. »
 *
 * LA PAGE DISAIT CE QU'ELLE NE COMPTAIT PAS, et c'était l'erreur. Trois
 * tirets de texte — luminaires, main-d'œuvre, chutes — répondaient à une
 * question que personne ne se pose devant un devis qu'il n'a pas encore vu.
 * Ce qu'on veut savoir, c'est COMMENT le chiffre se fabrique : d'où sortent
 * les mètres, et pourquoi il y a une ligne par article.
 *
 * On le montre donc. Le tableau apparaît, l'interrupteur, le point lumineux ;
 * la gaine part du tableau et va vers chacun ; un compteur monte pendant
 * qu'elle avance ; et le ticket se remplit ligne par ligne, avec les mêmes
 * photos et les mêmes prix que le devis. En cinq secondes, on a compris le
 * principe — et on a vu que le luminaire, lui, n'apparaît jamais.
 *
 * LES PRIX SONT LES VRAIS, lus dans le catalogue à la gamme choisie. Un
 * exemple qui inventerait ses chiffres serait une publicité : celui-ci est
 * le devis, en plus petit.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect } from 'react-native-svg';
import { photoDe } from '../ui/produits';
import { fr } from '../screens/result/format';
import {
  TARIFS_COMMUNS,
  TARIFS_MECANISME,
  type GammeId,
} from '../geometry/prix';
import { radius, themedStyles, useTheme, type Palette } from '../theme';

const euros = (v: number) => `${fr(v, 2)} €`;

/**
 * L'ÉCHELLE DE LA SCÈNE — combien de points de dessin valent un mètre.
 *
 * La scène n'est pas un plan : c'est un schéma. Il lui faut quand même une
 * échelle, sinon le compteur de mètres ne veut rien dire — et c'est lui
 * qu'on regarde.
 */
const POINTS_PAR_METRE = 38;

/** Le cadre du schéma, en points de dessin. */
const CADRE = { w: 320, h: 176 };

const TABLEAU = { x: 44, y: 132 };
const INTER = { x: 172, y: 132 };
const LAMPE = { x: 258, y: 52 };

/** Le trajet d'une gaine : elle longe, elle ne coupe pas au plus court. */
const VERS_INTER = [TABLEAU, { x: INTER.x, y: TABLEAU.y }, INTER];
const VERS_LAMPE = [
  TABLEAU,
  { x: LAMPE.x, y: TABLEAU.y },
  { x: LAMPE.x, y: LAMPE.y },
];

const longueur = (pts: { x: number; y: number }[]) => {
  let t = 0;
  for (let i = 1; i < pts.length; i++) {
    t += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return t;
};

const trace = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x},${p.y}`).join(' ');

const PolylineAnimee = Animated.createAnimatedComponent(Polyline);
const GAnime = Animated.createAnimatedComponent(G);

/** Une ligne du ticket, telle que la démonstration la fabrique. */
interface LigneDemo {
  code: string;
  libelle: string;
  detail: string;
  prix: number;
  /** Une note qui explique, quand la ligne ne se suffit pas. */
  note?: string;
}

/**
 * LE MINUTAGE — ce qui apparaît, et quand.
 *
 * Cinq secondes en tout. Plus court, on ne suit pas ; plus long, on passe à
 * la suite avant la fin, et une démonstration qu'on n'a pas vue finir
 * n'apprend rien.
 */
const POSE = 620;
const TIRAGE = 900;

export function DevisDemo({ gamme }: { gamme: GammeId }) {
  const c = useTheme();
  const styles = getStyles(c);

  /** Les prix du catalogue, à la gamme choisie : pas des chiffres d'exemple. */
  const tarifs = useMemo(() => {
    const meca = TARIFS_MECANISME[gamme];
    return {
      coffret: TARIFS_COMMUNS['coffret-1']?.pu ?? 0,
      inter: meca.inter?.pu ?? 0,
      dcl: TARIFS_COMMUNS['boite-dcl']?.pu ?? 0,
      icta: TARIFS_COMMUNS['icta-16']?.pu ?? 0,
      fil: TARIFS_COMMUNS['fil-1.5']?.pu ?? 0,
    };
  }, [gamme]);

  const [pas, setPas] = useState(0);
  const [metres, setMetres] = useState(0);
  const [lignes, setLignes] = useState<LigneDemo[]>([]);

  /* Une valeur par élément : c'est ce qui donne le rebond, un par un. */
  const popTableau = useRef(new Animated.Value(0)).current;
  const popInter = useRef(new Animated.Value(0)).current;
  const popLampe = useRef(new Animated.Value(0)).current;
  const gaine1 = useRef(new Animated.Value(0)).current;
  const gaine2 = useRef(new Animated.Value(0)).current;
  const popFils = useRef(new Animated.Value(0)).current;

  const L1 = longueur(VERS_INTER);
  const L2 = longueur(VERS_LAMPE);
  const M1 = L1 / POINTS_PAR_METRE;
  const M2 = L2 / POINTS_PAR_METRE;

  const [tour, setTour] = useState(0);

  useEffect(() => {
    for (const v of [popTableau, popInter, popLampe, gaine1, gaine2, popFils]) {
      v.setValue(0);
    }
    setPas(0);
    setMetres(0);
    setLignes([]);

    /*
      LE REBOND, ET POURQUOI IL EST ÉLASTIQUE.

      Un élément qui grandit linéairement « arrive » ; un élément qui dépasse
      puis revient « se pose ». C'est la différence entre une image qui
      s'affiche et un objet qu'on installe — et c'est tout ce que le patron
      demande par « bounce et pops ».
    */
    const pop = (v: Animated.Value) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 480,
        easing: Easing.elastic(1.15),
        useNativeDriver: true,
      });

    /*
      LE COMPTEUR MONTE PENDANT QUE LA GAINE AVANCE.

      Il ne s'incrémente pas à l'arrivée : c'est le fait de le voir monter EN
      MÊME TEMPS que le trait avance qui explique d'où sortent les mètres. La
      valeur ne se pose dans l'état que lorsque le DÉCIMÈTRE change — sinon
      on redessinerait la page soixante fois par seconde pour afficher le
      même chiffre.
    */
    const tirer = (v: Animated.Value, base: number, ajout: number) => {
      let dernier = -1;
      const abonne = v.addListener(({ value }) => {
        const m = Math.round((base + ajout * value) * 10) / 10;
        if (m !== dernier) {
          dernier = m;
          setMetres(m);
        }
      });
      return {
        anim: Animated.timing(v, {
          toValue: 1,
          duration: TIRAGE,
          easing: Easing.inOut(Easing.quad),
          // `strokeDashoffset` se calcule dans le dessin : le fil natif ne
          // sait pas le faire à notre place.
          useNativeDriver: false,
        }),
        stop: () => v.removeListener(abonne),
      };
    };

    const t1 = tirer(gaine1, 0, M1);
    const t2 = tirer(gaine2, M1, M2);

    const etapes: { at: number; fait: () => void }[] = [
      {
        at: 0,
        fait: () => {
          setPas(1);
          setLignes([
            {
              code: 'coffret-1',
              libelle: 'Coffret de répartition',
              detail: '1 u',
              prix: tarifs.coffret,
              note: 'Le tableau : tout part de là.',
            },
          ]);
          pop(popTableau).start();
        },
      },
      {
        at: POSE,
        fait: () => {
          setPas(2);
          setLignes((l) => [
            ...l,
            {
              code: 'meca-inter',
              libelle: 'Interrupteur',
              detail: '1 u',
              prix: tarifs.inter,
              note: 'Chaque appareil posé sur le plan fait une ligne.',
            },
          ]);
          pop(popInter).start();
        },
      },
      { at: POSE * 2, fait: () => t1.anim.start() },
      {
        at: POSE * 2 + TIRAGE,
        fait: () => {
          setPas(3);
          setLignes((l) => [
            ...l,
            {
              code: 'icta-16',
              libelle: 'Conduit ICTA Ø16 mm',
              detail: `${fr(M1, 1)} m mesurés sur le plan`,
              prix: (tarifs.icta * M1) / 100,
              note: 'La gaine se compte au mètre, tracé par tracé.',
            },
          ]);
        },
      },
      {
        at: POSE * 2 + TIRAGE + 240,
        fait: () => {
          setPas(4);
          setLignes((l) => [
            ...l,
            {
              code: 'boite-dcl',
              libelle: 'Boîte de centre DCL',
              detail: '1 u',
              prix: tarifs.dcl,
              note: 'La boîte est comptée. La lampe, non.',
            },
          ]);
          pop(popLampe).start();
        },
      },
      { at: POSE * 3 + TIRAGE + 240, fait: () => t2.anim.start() },
      {
        at: POSE * 3 + TIRAGE * 2 + 240,
        fait: () => {
          setPas(5);
          setLignes((l) => [
            ...l.map((x) =>
              x.code === 'icta-16'
                ? {
                    ...x,
                    detail: `${fr(M1 + M2, 1)} m mesurés sur le plan`,
                    prix: (tarifs.icta * (M1 + M2)) / 100,
                  }
                : x,
            ),
            {
              code: 'fil-1.5-phase',
              libelle: 'Conducteur H07V-U 1,5 mm²',
              detail: 'phase, neutre, terre, retour de lampe',
              prix: (tarifs.fil * (M1 + M2) * 4) / 100,
              note: 'Une couronne par couleur : un éclairage en demande quatre.',
            },
          ]);
          pop(popFils).start();
        },
      },
    ];

    const minuteurs = etapes.map((e) => setTimeout(e.fait, e.at));
    return () => {
      minuteurs.forEach(clearTimeout);
      t1.stop();
      t2.stop();
    };
  }, [
    tour,
    tarifs,
    M1,
    M2,
    popTableau,
    popInter,
    popLampe,
    gaine1,
    gaine2,
    popFils,
  ]);

  /**
   * Le rebond d'un élément : il grandit en dépassant, puis se pose.
   *
   * On pilote `opacity` et `scale` DU GROUPE SVG, et non un `style` de vue :
   * un `G` de react-native-svg n'a pas de feuille de style, il a des
   * attributs. Le groupe étant déjà translaté en `x`/`y`, l'échelle se prend
   * sur le centre de l'élément — c'est ce qui fait qu'il grossit sur place
   * au lieu de glisser depuis le coin du dessin.
   */
  const rebond = (v: Animated.Value) => ({
    opacity: v.interpolate({
      inputRange: [0, 0.25, 1],
      outputRange: [0, 1, 1],
    }) as unknown as number,
    scale: v.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }) as unknown as number,
  });

  const total = lignes.reduce((t, l) => t + l.prix, 0);

  return (
    <View>
      {/*
        LA MENTION, EN UNE PHRASE ET EN TÊTE.

        Relevé du patron : « mets juste une mention — l'éclairage n'est pas
        compté dans ce devis, il diffère des goûts ». Trois tirets d'exclusion
        répondaient à une question que personne ne se pose ; celle-ci répond à
        la seule qui compte, et elle dit POURQUOI.
      */}
      <View style={styles.mention}>
        <Text style={styles.mentionTexte}>
          Les luminaires ne sont pas chiffrés : une suspension va de neuf à
          neuf cents euros, et ça ne se devine pas. Tout ce qui les alimente —
          la boîte, la gaine, le fil, l'interrupteur — est compté.
        </Text>
      </View>

      <View style={styles.scene}>
        <Svg width="100%" height={176} viewBox={`0 0 ${CADRE.w} ${CADRE.h}`}>
          {/* La pièce : un trait, juste de quoi poser la scène. */}
          <Rect
            x={10}
            y={10}
            width={CADRE.w - 20}
            height={CADRE.h - 20}
            rx={10}
            fill="none"
            stroke={c.line}
            strokeWidth={1.5}
            strokeDasharray="5 6"
          />

          {/* Les gaines, dessinées SOUS les appareils : c'est un cheminement. */}
          <PolylineAnimee
            points={trace(VERS_INTER)}
            fill="none"
            stroke={c.blue}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${L1}`}
            strokeDashoffset={gaine1.interpolate({
              inputRange: [0, 1],
              outputRange: [L1, 0],
            })}
          />
          <PolylineAnimee
            points={trace(VERS_LAMPE)}
            fill="none"
            stroke={c.blue}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${L2}`}
            strokeDashoffset={gaine2.interpolate({
              inputRange: [0, 1],
              outputRange: [L2, 0],
            })}
          />

          <GAnime x={TABLEAU.x} y={TABLEAU.y} {...rebond(popTableau)}>
            <Rect
              x={-17}
              y={-21}
              width={34}
              height={42}
              rx={5}
              fill={c.surface}
              stroke={c.ink}
              strokeWidth={2}
            />
            <Path
              d="M-9 -11 h18 M-9 -1 h18 M-9 9 h18"
              stroke={c.ink}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          </GAnime>

          <GAnime x={INTER.x} y={INTER.y} {...rebond(popInter)}>
            <Circle r={16} fill={c.surface} stroke={c.ink} strokeWidth={2} />
            <Path
              d="M-6 3 l5 -9 h3 l-2 5 h6 l-9 11 h-3 l3 -7 z"
              fill={c.ink}
            />
          </GAnime>

          <GAnime x={LAMPE.x} y={LAMPE.y} {...rebond(popLampe)}>
            <Circle r={16} fill={c.surface} stroke={c.ink} strokeWidth={2} />
            <Path
              d="M0 -13 v3 M-9 -9 l2 2 M9 -9 l-2 2 M-13 0 h3 M13 0 h-3"
              stroke={c.ink}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            <Circle r={6} fill={c.ink} />
          </GAnime>
        </Svg>

        {/*
          LE COMPTEUR, POSÉ SUR LA SCÈNE.

          Il monte pendant que le trait avance : c'est la seule façon de faire
          comprendre que le prix de la gaine vient d'une LONGUEUR, et non d'un
          forfait par appareil.
        */}
        <View style={styles.compteur}>
          <Text style={styles.compteurValeur}>{`${fr(metres, 1)} m`}</Text>
          <Text style={styles.compteurNom}>de gaine</Text>
        </View>
      </View>

      <View style={styles.ticket}>
        <Text style={styles.ticketTitre}>CE QUE ÇA MET AU TICKET</Text>
        {lignes.map((l) => (
          <View key={l.code} style={styles.ligne}>
            <View style={styles.vignette}>
              {photoDe(l.code) ? (
                <Image
                  source={photoDe(l.code)!}
                  style={styles.image}
                  resizeMode="contain"
                />
              ) : null}
            </View>
            <View style={styles.texts}>
              <Text style={styles.ligneNom}>{l.libelle}</Text>
              <Text style={styles.ligneDetail}>{l.detail}</Text>
              {!!l.note && <Text style={styles.ligneNote}>{l.note}</Text>}
            </View>
            <Text style={styles.lignePrix}>{euros(l.prix)}</Text>
          </View>
        ))}
        {pas >= 5 && (
          <View style={styles.fin}>
            <Text style={styles.finTexte}>
              {`Et ainsi de suite, appareil par appareil : ${euros(
                total,
              )} pour ce coin de pièce.`}
            </Text>
            <TouchableOpacity
              accessibilityLabel="Revoir la démonstration"
              accessibilityRole="button"
              activeOpacity={0.75}
              style={styles.rejouer}
              onPress={() => setTour((n) => n + 1)}>
              <Text style={styles.rejouerTexte}>Revoir</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    mention: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.blue,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginBottom: 14,
    },
    mentionTexte: { color: c.inkSoft, fontSize: 13, lineHeight: 18 },
    scene: {
      backgroundColor: c.surface,
      borderRadius: radius.md,
      overflow: 'hidden',
      paddingVertical: 4,
    },
    /* Le compteur : gros, en haut à gauche, là où l'œil revient entre deux
       tracés. */
    compteur: {
      position: 'absolute',
      left: 14,
      top: 12,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 5,
    },
    compteurValeur: {
      color: c.blue,
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    compteurNom: { color: c.inkFaint, fontSize: 12, fontWeight: '700' },
    ticket: { marginTop: 16 },
    ticketTitre: {
      color: c.inkFaint,
      fontSize: 11.5,
      fontWeight: '800',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 8,
    },
    vignette: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    image: { width: 34, height: 34 },
    texts: { flex: 1 },
    ligneNom: { color: c.ink, fontSize: 13.5, fontWeight: '700' },
    ligneDetail: { color: c.inkFaint, fontSize: 11.5, marginTop: 2 },
    ligneNote: { color: c.blue, fontSize: 11.5, lineHeight: 15.5, marginTop: 3 },
    lignePrix: { color: c.ink, fontSize: 13.5, fontWeight: '800' },
    fin: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: c.line,
      paddingTop: 12,
      marginTop: 6,
    },
    finTexte: { flex: 1, color: c.inkSoft, fontSize: 12.5, lineHeight: 17 },
    rejouer: {
      height: 34,
      paddingHorizontal: 15,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejouerTexte: { color: c.blue, fontSize: 12.5, fontWeight: '800' },
  }),
);
