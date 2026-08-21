/**
 * LE BOUTON DE L'ACCUEIL.
 *
 * Un aplat bleu à coins arrondis, c'est le bouton de 2015 : il dit « ceci se
 * touche » et rien d'autre. Ce qu'on veut ici, c'est qu'il ATTIRE — l'accueil
 * n'a qu'un geste à proposer, autant qu'il se voie.
 *
 * Trois choses le distinguent d'un rectangle peint :
 *
 * - **le blanc cerné de bleu** : l'aplat pesait sur la page et écrasait ce
 *   qui l'entoure. Le contour dit la même chose — « c'est ici qu'on appuie »
 *   — en laissant la page respirer, et il va avec le logotype ;
 * - **l'onde d'écho** : deux anneaux naissent au bord du bouton et se
 *   dilatent en s'effaçant, comme le logo à l'ouverture. L'application
 *   s'appelle EchoPlan et lit une pièce par écho : c'est la marque qui
 *   bouge, pas un effet ;
 * - **l'enfoncement** : à l'appui, le bouton recule légèrement. Un bouton qui
 *   ne bouge pas sous le doigt laisse douter qu'il a pris.
 *
 * TOUT PART SUR LE FIL NATIF, et c'est la règle de cet écran. Le contour
 * tournant des débuts reposait sur un décalage de pointillés, propriété sans
 * équivalent natif : l'animation vivait sur le fil JS — soixante réveils de
 * JavaScript par seconde, sur l'écran le plus longtemps affiché de
 * l'application. On l'avait bornée à trois tours pour épargner la batterie,
 * après quoi le bouton restait figé, ce qui se voit tout de suite. Une
 * échelle et une opacité, elles, sont portées de bout en bout par le pilote
 * natif : l'onde peut battre sans fin sans rien coûter.
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
import { radius, useTheme, type Palette } from '../theme';

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
  const appui = useRef(new Animated.Value(0)).current;

  /*
    LE CONTOUR NE COURT QUE SUR LE BOUTON PRINCIPAL.

    Deux boutons qui s'animent en même temps, c'est deux choses qui bougent
    pour un seul geste à faire : l'œil ne sait plus lequel est l'important.
    « Mes scans » garde son liseré, sobre, et laisse le mouvement à celui
    qu'on vient toucher.
  */
  const anime = variant === 'primary';
  /*
    LE REFLET TOURNE SANS RÉVEILLER PERSONNE.

    Le bouton portait un liseré qui courait le long de son bord — un
    décalage de pointillés, propriété que le fil natif ne sait pas animer.
    L'animation vivait donc sur le FIL JS : soixante réveils de JavaScript
    par seconde, sur l'écran que l'application montre le plus longtemps.
    C'est ce qui faisait chauffer le téléphone, et on l'avait bornée à trois
    tours pour cette raison — après quoi le bouton restait figé, ce qui se
    voit tout de suite : « l'animation n'est plus animée ».

    Un REFLET qui balaie le bouton s'anime, lui, par une TRANSLATION : le
    fil natif la porte de bout en bout, et le JavaScript n'est réveillé ni
    pour la lancer ni pour la suivre. Elle peut donc tourner indéfiniment
    sans rien coûter, avec une pause entre deux passages pour rester
    discrète. Le liseré, lui, reste — mais immobile : c'est le bord du
    bouton, pas son animation.
  */
  /*
    UNE ONDE PLUTÔT QU'UN REFLET — relevé du patron : « refais une meilleure
    animation du bouton Commencer le scan ».

    Une bande claire traversait le bouton toutes les trois secondes. Elle ne
    coûtait rien (une translation, portée par le fil natif) mais c'était le
    miroitement de n'importe quelle carte bancaire, posé sur un bouton BLANC
    où il se voyait à peine. Ce que le bouton propose, lui, c'est de LIRE
    une pièce par écho — et le logo de l'accueil émet déjà ses ondes à
    l'ouverture. Le bouton émet donc les mêmes.

    UNE SEULE VALEUR pour deux anneaux : chacun lit une tranche différente
    de la même montée (0 → 0,72 pour le premier, 0,28 → 1 pour le second),
    ce qui les décale sans coûter une seconde boucle. C'est la mécanique du
    logo, à l'identique — et tout part sur le fil natif, donc le JavaScript
    n'est réveillé ni pour lancer l'onde ni pour la suivre.
  */
  const onde = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (disabled || !anime) return;
    const boucle = Animated.loop(
      Animated.timing(onde, {
        toValue: 1,
        // Trois secondes et demie : le temps qu'une onde parte, s'ouvre et
        // s'éteigne sans jamais donner l'impression de clignoter.
        duration: 3500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    boucle.start();
    return () => boucle.stop();
  }, [onde, disabled, anime]);

  /**
   * Un anneau, sur sa tranche de l'onde.
   *
   * Il grandit ET pâlit : un anneau qui s'ouvre sans s'effacer finit en
   * cadre posé autour du bouton. Le sommet d'opacité est AU DÉBUT de sa
   * course — une onde est la plus nette quand elle vient de partir.
   */
  const anneau = (depart: number) => {
    const fin = Math.min(depart + 0.72, 1);
    return {
      opacity: onde.interpolate({
        inputRange: [depart, depart + 0.06, fin],
        outputRange: [0, 0.42, 0],
        extrapolate: 'clamp' as const,
      }),
      transform: [
        {
          scale: onde.interpolate({
            inputRange: [depart, fin],
            outputRange: [1, 1.22],
            extrapolate: 'clamp' as const,
          }),
        },
      ],
    };
  };

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
      // Plus rien à mesurer : l'anneau se cale sur les quatre bords de la
      // zone. C'est le reflet qui avait besoin de savoir d'où partir.
      onPress={onPress}>
      {/*
        LA ZONE PORTE LES ANNEAUX, LE CORPS PORTE LE MOT.

        Le corps rogne ce qu'il contient (`overflow: hidden`, c'est lui qui
        arrondit ses coins) : une onde née dedans y mourrait sans jamais
        dépasser. Elle vit donc dans une zone SŒUR, qui ne rogne rien, et
        se dessine DERRIÈRE — c'est le bouton qu'on regarde, l'onde n'est
        que ce qu'il émet.
      */}
      <View style={styles.zone}>
        {/* Aucune mesure à attendre : l'anneau se cale sur les quatre bords
            de la zone, quelle que soit sa taille. Le reflet, lui, devait
            connaître la largeur pour savoir d'où partir. */}
        {!disabled && anime && (
          <>
            {[0, 0.28].map((depart) => (
              <Animated.View
                key={depart}
                pointerEvents="none"
                style={[styles.anneau, anneau(depart)]}
              />
            ))}
          </>
        )}
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
      </Animated.View>
      </View>
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
      /*
        UN CRAN PLUS PETIT — relevé du chantier.

        Cinquante-six points de haut sur un écran de six pouces, c'était un
        bouton de page d'accueil de site web. L'application en montre deux à
        trois d'affilée : ils prenaient le tiers de la page pour trois mots.
      */
      corps: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: 50,
        paddingHorizontal: 22,
        borderRadius: radius.lg,
        overflow: 'hidden',
      },
      /*
        LA ZONE : elle ne rogne RIEN, sans quoi l'onde ne dépasserait pas.
        Elle prend la taille du corps, et les anneaux s'y calquent.
      */
      zone: { position: 'relative' },
      /*
        L'ANNEAU : le contour du bouton, exactement — même rayon, même
        épaisseur, même bleu. C'est ce qui fait lire l'onde comme émise PAR
        le bouton, et non comme un cercle posé autour.
      */
      anneau: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: c.blue,
      },
      /**
       * BLANC À TEXTE BLEU — relevé du chantier.
       *
       * L'aplat bleu était le geste par défaut d'une application de 2015 :
       * il pèse sur la page et écrase tout ce qui l'entoure. Le blanc cerné
       * de bleu dit la même chose — « c'est ici qu'on appuie » — en laissant
       * la page respirer, et il va avec le logotype.
       *
       * L'ombre reste TEINTÉE de bleu : elle soulève le bouton du fond sans
       * le cerner d'un trait de plus.
       */
      primaire: {
        backgroundColor: c.surface,
        borderWidth: 1.5,
        borderColor: c.blue,
        shadowColor: c.blue,
        shadowOpacity: 0.22,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
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
      texte: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
      /* Le mot du bouton principal : bleu sur blanc, comme son contour. */
      texteClair: { color: c.blue },
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
