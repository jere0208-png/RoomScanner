/**
 * LE BOUTON À CONTOUR TOURNANT.
 *
 * Un aplat bleu à coins arrondis, c'est le bouton de 2015 : il dit « ceci se
 * touche » et rien d'autre. Ce qu'on veut ici, c'est qu'il ATTIRE — l'accueil
 * n'a qu'un geste à proposer, autant qu'il se voie.
 *
 * Trois choses le distinguent d'un rectangle peint :
 *
 * - **la translucidité** : le fond laisse voir ce qui passe dessous, si bien
 *   que le bouton appartient à l'écran au lieu d'être collé dessus ;
 * - **le contour qui court** : un segment lumineux fait le tour du bord, sans
 *   fin. C'est un mouvement lent — deux secondes et demie par tour — qui se
 *   remarque sans agiter ;
 * - **l'enfoncement** : à l'appui, le bouton recule légèrement. Un bouton qui
 *   ne bouge pas sous le doigt laisse douter qu'il a pris.
 *
 * Le segment est un tracé SVG dont le tireté se décale (`strokeDashoffset`).
 * Cette propriété n'a pas d'équivalent natif : elle s'anime donc sur le fil
 * JS, ce qui est acceptable ici — un seul contour, sur un écran qui ne fait
 * rien d'autre. Dès qu'un plan se dessine à côté, on ne s'offre pas ça.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { radius, useTheme, type Palette } from '../theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * COMBIEN DE TOURS AVANT DE RENDRE LA MAIN.
 *
 * Trois : le temps qu'on met à lire l'écran. Voir la boucle plus bas — c'est
 * la seule animation de l'application qui vivait sur le fil JS sans jamais
 * s'arrêter, et elle tournait sur l'écran le plus longtemps affiché.
 */
export const TOURS = 3;

export function GlowButton({
  label,
  onPress,
  disabled,
  /** Le bouton principal porte la couleur ; le second reste sobre. */
  variant = 'primary',
  right,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  /** Ce qui se pose à droite du libellé — un compteur, par exemple. */
  right?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const [taille, setTaille] = React.useState({ w: 0, h: 0 });
  const course = useRef(new Animated.Value(0)).current;
  const appui = useRef(new Animated.Value(0)).current;

  /*
    LE CONTOUR NE COURT QUE SUR LE BOUTON PRINCIPAL.

    Deux boutons qui s'animent en même temps, c'est deux choses qui bougent
    pour un seul geste à faire : l'œil ne sait plus lequel est l'important.
    « Mes scans » garde son liseré, sobre, et laisse le mouvement à celui
    qu'on vient toucher.
  */
  const anime = variant === 'primary';
  useEffect(() => {
    if (disabled || !anime) return;
    const boucle = Animated.loop(
      Animated.timing(course, {
        toValue: 1,
        duration: variant === 'primary' ? 2500 : 3800,
        easing: Easing.linear,
        // `strokeDashoffset` n'existe pas côté natif : l'animation vit sur
        // le fil JS, et la boucle s'arrête avec le composant.
        useNativeDriver: false,
      }),
      /*
        IL FAIT SES TOURS, PUIS IL REND LA MAIN.

        Relevé du chantier : « l'application fait chauffer le téléphone et
        perdre la batterie rapidement ». Ce liseré en était la cause la plus
        chère et la moins visible : l'animation vit sur le FIL JS — soixante
        réveils de JavaScript par seconde, POUR TOUJOURS, sur l'écran que
        l'application montre le plus longtemps. Un téléphone posé sur la
        table, personne devant, continuait de calculer un trait qui tourne.

        Trois tours suffisent à dire que le bouton est vivant : c'est le
        temps qu'on met à lire l'écran. Ensuite le trait s'immobilise et le
        processeur peut dormir. Chaque retour sur l'écran remonte le
        composant, donc relance les trois tours : l'effet est intact, la
        dépense ne l'est plus.
      */
      { iterations: TOURS },
    );
    boucle.start();
    return () => boucle.stop();
  }, [course, disabled, anime, variant]);

  const H = taille.h || 56;
  const W = taille.w || 240;
  const R = Math.min(H / 2, radius.lg);
  // Le tour du rectangle arrondi : deux longueurs, deux largeurs, moins ce
  // que les quatre quarts de cercle raccourcissent, plus leur arc.
  const tour = 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
  // Le segment lumineux couvre le quart du tour : assez long pour se voir
  // passer, assez court pour qu'on sache où il va.
  const segment = tour * 0.26;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() =>
        Animated.timing(appui, {
          toValue: 1,
          duration: 90,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.timing(appui, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }).start()
      }
      onPress={onPress}
      onLayout={(e) =>
        setTaille({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }>
      <Animated.View
        style={[
          styles.corps,
          variant === 'primary' ? styles.primaire : styles.fantome,
          disabled && styles.eteint,
          {
            transform: [
              {
                scale: appui.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.972],
                }),
              },
            ],
          },
        ]}>
        {/*
          LE MOT SE CENTRE SEUL, CE QUI L'ACCOMPAGNE SE POSE À CÔTÉ.

          Le libellé et sa pastille vivaient côte à côte : c'est donc le
          COUPLE qui se centrait dans le bouton, et le mot se retrouvait
          poussé à gauche du milieu — d'autant plus loin que le nombre est
          long. Un bouton dont le texte se déplace selon le nombre de scans
          qu'on possède ne se lit plus comme un bouton.

          L'accompagnement est donc posé DANS le cadre du mot, en absolu à
          son bord droit : il déborde sans prendre de place.
        */}
        <View>
          <Text
            style={[
              styles.texte,
              variant === 'primary' ? styles.texteClair : styles.texteSombre,
            ]}>
            {label}
          </Text>
          {/*
            LE CADRE OCCUPE TOUTE LA HAUTEUR DU MOT, ET CENTRE CE QU'IL PORTE.

            Premier jet : la pastille était posée à « 50 % de haut, moins la
            moitié de sa hauteur ». Deux approximations qui s'ajoutent — le
            pourcentage se prend sur la boîte du texte, dont la hauteur
            dépend de l'interligne de la police du téléphone, et la
            demi-hauteur était écrite en dur. Elle tombait sous la ligne.

            Un cadre haut comme le mot, qui centre son contenu, ne dépend
            d'aucun chiffre : c'est la seule façon que ça tienne d'un
            appareil à l'autre.
          */}
          {right ? <View style={styles.suite}>{right}</View> : null}
        </View>
        {/* Le contour : posé PAR-DESSUS le fond, mais transparent au doigt —
            il ne doit pas voler l'appui qu'il invite à donner. */}
        {taille.w > 0 && !disabled && anime && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={W} height={H}>
              <Defs>
                <LinearGradient id="fil" x1="0" y1="0" x2="1" y2="1">
                  <Stop
                    offset="0"
                    stopColor={variant === 'primary' ? '#FFFFFF' : c.blue}
                    stopOpacity="0"
                  />
                  <Stop
                    offset="0.5"
                    stopColor={variant === 'primary' ? '#FFFFFF' : c.blue}
                    stopOpacity="0.95"
                  />
                  <Stop
                    offset="1"
                    stopColor={variant === 'primary' ? '#FFFFFF' : c.blue}
                    stopOpacity="0"
                  />
                </LinearGradient>
              </Defs>
              {/* Le liseré permanent : discret, il tient le bord quand le
                  segment est de l'autre côté. */}
              <Rect
                x={1}
                y={1}
                width={W - 2}
                height={H - 2}
                rx={R}
                fill="none"
                stroke={variant === 'primary' ? '#FFFFFF' : c.lineStrong}
                strokeOpacity={variant === 'primary' ? 0.35 : 1}
                strokeWidth={1.2}
              />
              <AnimatedRect
                x={1}
                y={1}
                width={W - 2}
                height={H - 2}
                rx={R}
                fill="none"
                stroke="url(#fil)"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeDasharray={`${segment} ${tour - segment}`}
                strokeDashoffset={course.interpolate({
                  inputRange: [0, 1],
                  // Le tour complet, dans le sens de lecture.
                  outputRange: [tour, 0],
                })}
              />
            </Svg>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const getStyles = (() => {
  const cache = new Map<Palette, ReturnType<typeof creer>>();
  const creer = (c: Palette) =>
    StyleSheet.create({
    /** Ce qui accompagne le mot : accroché à son bord droit, centré sur lui. */
    suite: {
      position: 'absolute',
      left: '100%',
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
      corps: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: 56,
        paddingHorizontal: 26,
        borderRadius: radius.lg,
        overflow: 'hidden',
      },
      /**
       * TRANSLUCIDE, PAS OPAQUE.
       *
       * Le bleu laisse passer le fond : le bouton se pose sur l'écran au
       * lieu d'y être collé. C'est ce que fait le système partout depuis que
       * les matériaux ont remplacé les aplats.
       */
      primaire: {
        backgroundColor: c.blue,
        // Une ombre teintée de la couleur du bouton : elle le soulève sans
        // le cerner d'un trait.
        shadowColor: c.blue,
        shadowOpacity: 0.4,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
      fantome: {
        backgroundColor: c.surface,
        opacity: 0.92,
        // Le liseré vient du STYLE et non du tracé animé : sans contour qui
        // court, il ne restait plus rien pour dessiner le bord.
        borderWidth: 1,
        borderColor: c.lineStrong,
      },
      eteint: { opacity: 0.45 },
      texte: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },
      texteClair: { color: '#FFFFFF' },
      texteSombre: { color: c.ink },
    });
  return (c: Palette) => {
    let s = cache.get(c);
    if (!s) {
      s = creer(c);
      cache.set(c, s);
    }
    return s;
  };
})();
