import React, { useEffect, useRef, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { MenuCompte } from '../components/MenuCompte';
import { ThemeGlyph } from '../components/ThemeGlyph';
import { ContourOr, TexteOr } from '../components/ContourOr';
import { SOLAIRES } from '../ui/solaires';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { RoomScan } from 'react-native-room-scan';
import {
  dark,
  glow,
  radius,
  shadowCard,
  themedStyles,
  useTheme,
  type Palette,
} from '../theme';
import { GlowButton } from '../components/GlowButton';
import { LogoMark } from '../components/LogoMark';
import { LightRibbon, RIBBON_H } from '../components/LightRibbon';
import { PhoneShowcase } from '../components/PhoneShowcase';
import { useScanStore } from '../store/scanStore';
import { useAccountStore } from '../store/accountStore';
import { useRoomScan } from '../native/useRoomScan';


/**
 * « il y a un quart d'heure » plutôt qu'une date.
 *
 * Ce qu'on veut savoir d'un relevé interrompu, ce n'est pas le jour : c'est
 * s'il s'agit de celui qu'on vient de perdre, ou d'un vieux fond de tiroir.
 */
function quand(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

export function HomeScreen() {
  const supported = useScanStore((s) => s.supported);
  const setSupported = useScanStore((s) => s.setSupported);
  const error = useScanStore((s) => s.error);
  const saves = useScanStore((s) => s.saves);
  const brouillon = useScanStore((s) => s.brouillon);
  const reprendreBrouillon = useScanStore((s) => s.reprendreBrouillon);
  const oublierBrouillon = useScanStore((s) => s.oublierBrouillon);
  const setScreen = useScanStore((s) => s.setScreen);
  const themePref = useScanStore((s) => s.themePref);
  const setThemePref = useScanStore((s) => s.setThemePref);
  const { start } = useRoomScan();
  const peutCreerPlan = useAccountStore((s) => s.peutCreerPlan);
  const ouvrirSurprise = useAccountStore((s) => s.ouvrirSurprise);
  const compte = useAccountStore((s) => s.compte);
  const pro = useAccountStore((s) => s.pro);
  /** Le menu du compte : une carte à nous, ouverte par le bloc profil. */
  const [menuCompte, setMenuCompte] = useState(false);
  const c = useTheme();
  /** Le fond est-il sombre ? C'est lui qui choisit le logotype. */
  const sombre = c === dark;
  const styles = getStyles(c);

  useEffect(() => {
    RoomScan.isSupported().then(setSupported);
  }, [setSupported]);

  // Arrivée : le logo projette des ondes qui traversent TOUTE la page.
  const { width: winW, height: winH } = useWindowDimensions();
  const waveScale = (Math.max(winW, winH) * 2.4) / 76;
  const wave = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(wave, {
        toValue: 1,
        duration: 750,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(reveal, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [wave, reveal]);

  // Fondu en cascade : chaque bloc apparaît juste après le précédent.
  const fadeIn = (i: number) => {
    const range = [i * 0.1, Math.min(i * 0.1 + 0.45, 1)];
    return {
      opacity: reveal.interpolate({
        inputRange: range,
        outputRange: [0, 1],
        extrapolate: 'clamp' as const,
      }),
      transform: [
        {
          translateY: reveal.interpolate({
            inputRange: range,
            outputRange: [10, 0],
            extrapolate: 'clamp' as const,
          }),
        },
      ],
    };
  };

  return (
    <View style={styles.container}>
      {/* `box-none` : le bloc pleine largeur laisse passer le doigt là où
          lui-même n'a rien à toucher — plus jamais un fantôme au-dessus
          des boutons du bandeau. */}
      <View style={styles.hero} pointerEvents="box-none">
        <View style={styles.logoWrap}>
          {[0, 0.15].map((delay, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.waveRing,
                {
                  opacity: wave.interpolate({
                    inputRange: [delay, Math.min(delay + 0.2, 1), 1],
                    outputRange: [0, 0.5, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: wave.interpolate({
                        inputRange: [delay, 1],
                        outputRange: [0.6, waveScale],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />
          ))}
          <LogoMark />
        </View>
        <Animated.View style={fadeIn(0)}>
          {/* La typo de la marque, détourée, plutôt que deux `Text` empilés :
              le « O » d'ECHO porte les ondes du logo, ce qu'aucune police
              système ne sait faire. Teintée par le thème pour rester
              lisible en sombre. */}
          <Image
            /*
              DEUX FICHIERS, ET PAS UNE TEINTE.

              Le logotype portait un `tintColor` : l'image était noire, le
              thème la repeignait. Le nouveau dessin a des ONDES en dégradé —
              c'est son identité — et une teinte les écrase toutes en un
              aplat. On embarque donc les deux versions, et l'on prend celle
              qui va avec le fond.
            */
            source={
              sombre
                ? require('../assets/echoplan-dark.png')
                : require('../assets/echoplan.png')
            }
            style={styles.wordmark}
            resizeMode="contain"
            accessibilityLabel="EchoPlan"
          />
        </Animated.View>
        <Animated.View style={fadeIn(1)}>
          <Text style={styles.subtitle}>
            Votre appartement en 3D et en plan coté,{'\n'}en quelques minutes.
          </Text>
        </Animated.View>
      </View>

      {/*
        LA VITRINE, À LA PLACE DU MODE D'EMPLOI.

        « Scannez, ajustez, explorez » : trois pictogrammes et neuf mots pour
        dire ce qu'une seule image montre mieux — le résultat. On ne vend pas
        un scanner de pièces avec une notice, on le vend avec le plan qui en
        sort. Et ce plan-là n'est pas une illustration : il passe par le même
        chemin que la vue 3D de l'application.
      */}
      <Animated.View style={[styles.vitrine, fadeIn(2)]}>
        {/*
          LE RUBAN PASSE DERRIÈRE LA MAQUETTE.

          Il traverse l'écran de bord à bord, à mi-hauteur du téléphone, et
          ne reçoit jamais le doigt : c'est un fond, pas un objet. Posé en
          absolu, il ne pousse rien — la maquette garde sa place au centre —
          et son ondulation lente donne au bloc la profondeur qu'un aplat
          n'a pas.
        */}
        <View style={styles.ruban} pointerEvents="none">
          <LightRibbon width={winW} palette={c} sombre={themePref === 'dark'} />
        </View>
        <PhoneShowcase />
      </Animated.View>

      {supported === false && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Cet appareil n'est pas compatible : le scan nécessite un iPhone Pro
            (capteur LiDAR) sous iOS 16, ou un Android compatible ARCore.
          </Text>
        </View>
      )}
      {error && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{error}</Text>
        </View>
      )}

      {/*
        LE RELEVÉ INTERROMPU — proposé, jamais imposé.

        L'app tuée en plein scan — un appel, une photo, un téléphone à court
        de mémoire — emportait la visite entière. Le relevé s'écrit désormais
        tout seul, toutes les trente secondes ; il attend ici.

        On ne le rouvre PAS d'office : l'utilisateur a pu quitter
        volontairement un essai raté, et se le voir réimposer au démarrage
        serait pire que de l'avoir perdu. D'où deux gestes, et le second —
        jeter — sans confirmation : ce qu'on jette est un brouillon, l'original
        est dans la bibliothèque s'il a été enregistré.
      */}
      {brouillon && (
        <Animated.View style={[styles.draftCard, fadeIn(3)]}>
          <View style={styles.draftTexts}>
            <Text style={styles.draftTitle}>Relevé interrompu</Text>
            <Text style={styles.draftText}>
              {`${brouillon.walls.length} mur${
                brouillon.walls.length > 1 ? 's' : ''
              } relevés${
                brouillon.name ? ` · ${brouillon.name}` : ''
              }, ${quand(brouillon.at)}.`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.draftPrimary}
            accessibilityLabel="Reprendre le relevé"
            onPress={reprendreBrouillon}>
            <Text style={styles.draftPrimaryText}>Reprendre</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.draftGhost}
            accessibilityLabel="Jeter le relevé interrompu"
            onPress={oublierBrouillon}>
            <Text style={styles.draftGhostText}>Jeter</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View style={[styles.ctaWrap, fadeIn(3)]}>
        <GlowButton
          label={supported === null ? 'Vérification…' : 'Commencer le scan'}
          accessibilityLabel="Commencer le scan"
          disabled={supported !== true}
          // Le palier gratuit s'arrête AVANT le scan, pas après : scanner
          // vingt minutes pour découvrir qu'on ne peut pas enregistrer
          // serait le pire moment pour l'apprendre.
          onPress={() => {
            if (!peutCreerPlan()) {
              // L'offre à la place de la porte : le popup « Surprise ! »
              // et son −20 % — c'est lui qui tend la page Pro, code déjà
              // rempli.
              ouvrirSurprise();
              return;
            }
            start();
          }}
        />
      </Animated.View>

      {saves.length > 0 && (
        <Animated.View style={[styles.secondWrap, fadeIn(4)]}>
          <GlowButton
            label="Mes scans"
            variant="ghost"
            onPress={() => setScreen('library')}
            right={
              <View
                accessibilityLabel="Nombre de scans"
                style={styles.libraryBadge}>
                <Text style={styles.libraryBadgeText}>{saves.length}</Text>
              </View>
            }
          />
        </Animated.View>
      )}

      <Animated.Text style={[styles.hint, fadeIn(5)]}>
        Allumez les lumières et dégagez le centre de la pièce pour un meilleur
        résultat.
      </Animated.Text>

      {/*
        LE PROFIL EST UN BLOC, EN HAUT À GAUCHE — croquis Paint du patron.

        La mention du compte vivait en pied d'écran, minuscule ; elle est
        maintenant un petit bloc qui ne gêne pas : l'avatar et le prénom,
        gris en gratuit, parés d'or en Pro. C'est toujours la seule porte
        VOLONTAIRE vers la page Pro : le clic garde tout le geste de
        l'ancienne rangée.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mon compte"
        style={styles.profilBloc}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        // Le menu est une carte EchoPlan (MenuCompte), plus la feuille
        // grise du système — relevé du patron : « trop basique ».
        onPress={() => setMenuCompte(true)}>
        {/*
          L'AVATAR ET LE PRÉNOM, RIEN D'AUTRE — relevé du patron : la
          barre est partie, le grade écrit aussi. En gratuit, tout se lit
          GRIS ; en Pro, le prénom passe à la typo d'or et l'avatar se
          cercle du contour qui respire — le grade se VOIT, il ne s'écrit
          plus. Les enfants restent transparents au doigt : c'est TOUT le
          bloc qui ouvre le menu.
        */}
        {pro ? (
          <View pointerEvents="none">
            <ContourOr rayon={16} fond={c.bg} style={styles.avatarOrZone}>
              <View style={styles.avatarOrDedans}>
                <Svg width={26} height={26} viewBox="0 0 24 24">
                  <Path d={SOLAIRES.avatar} fill={c.inkSoft} fillRule="evenodd" />
                </Svg>
              </View>
            </ContourOr>
          </View>
        ) : (
          <Svg width={30} height={30} viewBox="0 0 24 24" pointerEvents="none">
            <Path d={SOLAIRES.avatar} fill={c.inkSoft} fillRule="evenodd" />
          </Svg>
        )}
        <View style={styles.profilColonne} pointerEvents="none">
          {pro ? (
            <TexteOr
              texte={compte?.prenom || compte?.email || 'Compte'}
              taille={14.5}
              graisse="600"
              fond={c.bg}
            />
          ) : (
            <Text style={styles.profilNom} numberOfLines={1}>
              {compte?.prenom || compte?.email || 'Compte'}
            </Text>
          )}
        </View>
      </Pressable>

      {/*
        LE BOUTON DE THÈME SE REND EN DERNIER — relevé du patron : « le
        clic ne fait rien, sauf en bas à droite ». Le bloc héros, rendu
        après lui, s'étendait par-dessus et avalait le toucher partout où
        il le chevauchait : c'est l'ORDRE des frères qui fait l'empilement,
        ce qui flotte au bandeau vient donc après tout le reste.
      */}
      {/*
        LA CIBLE EST UNE VRAIE ZONE, pas un débord. Le `hitSlop` ne porte
        que dans les limites du parent, et le clic restait capricieux —
        relevé du patron, deux fois. Le bouton est donc un carré INVISIBLE
        de 64 points, la pastille blanche de 40 dessinée en son centre :
        ce qu'on vise est petit, ce qu'on touche est large, et plus rien
        n'en dépend.
      */}
      <TouchableOpacity
        style={styles.themeZone}
        accessibilityLabel={
          themePref === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'
        }
        onPress={() => setThemePref(themePref === 'dark' ? 'light' : 'dark')}>
        <View style={styles.themePastille} pointerEvents="none">
          <ThemeGlyph
            quoi={themePref === 'dark' ? 'soleil' : 'lune'}
            size={27}
            color={c.inkSoft}
          />
        </View>
      </TouchableOpacity>

      <MenuCompte visible={menuCompte} fermer={() => setMenuCompte(false)} />
    </View>
  );
}

const getStyles = themedStyles((c: Palette) => StyleSheet.create({
  /**
   * La carte du relevé interrompu : ambre, pas rouge.
   *
   * Rien n'est cassé — il y a quelque chose à reprendre. Le rouge dirait
   * qu'on a fait une faute, et ferait chercher laquelle.
   */
  draftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSunken,
    borderWidth: 1,
    borderColor: c.amber,
  },
  draftTexts: { flex: 1 },
  draftTitle: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
  draftText: { color: c.inkSoft, fontSize: 12, marginTop: 2, lineHeight: 16 },
  draftPrimary: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  draftPrimaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  draftGhost: { paddingHorizontal: 4, paddingVertical: 9 },
  draftGhostText: { color: c.inkFaint, fontWeight: '700', fontSize: 13 },
  container: {
    flex: 1,
    backgroundColor: c.bg,
    paddingHorizontal: 24,
    // 72 et non 84 : la rangée du compte a pris sa part en bas, le haut
    // rend la sienne pour que la maquette respire entre les deux.
    paddingTop: 72,
    paddingBottom: 40,
  },
  // zIndex/elevation : l'onde d'arrivée pulse AU-DESSUS des cartes suivantes.
  hero: { alignItems: 'center', zIndex: 20, elevation: 20 },
  /*
    LA ZONE (64, invisible) PORTE LA PASTILLE (40, blanche). Le centre
    s'axe sur la ligne du profil : 53 + 32 = 85, comme 50 + 35.
  */
  // Zone remontée et encore élargie (72) — relevé du patron : le point
  // qui répondait était AU-DESSUS du dessin.
  themeZone: {
    position: 'absolute',
    top: 47,
    right: 6,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  themePastille: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    ...shadowCard,
    shadowOpacity: 0.08,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Le logotype tient sur DEUX lignes — « echo » au-dessus de « plan » —,
   * d'où ces proportions : 160 × 102 et non plus une bande.
   */
  wordmark: {
    width: 160,
    height: 102,
    marginTop: 14,
  },
  subtitle: {
    color: c.inkSoft,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  logoWrap: { alignItems: 'center', justifyContent: 'center' },
  waveRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: c.blue,
  
    // Un anneau vide n'a rien a centrer, mais la regle du banc de
    // centrage vaut pour tous les ronds : uniforme, donc simple.
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * La vitrine prend la place laissée par les étapes : elle respire, et
   * c'est elle qu'on regarde en attendant de toucher le bouton.
   */
  vitrine: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  /* Centré en hauteur sur la maquette, débordant des deux côtés : le ruban
     doit sortir du cadre, sinon il paraît posé dans une boîte. */
  ruban: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -RIBBON_H / 2,
    alignItems: 'center',
    zIndex: -1,
  },
  /** Appareil incompatible, ou erreur du scan : un bandeau, pas une alerte. */
  warning: {
    backgroundColor: '#FDECEC',
    borderRadius: radius.md,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  warningText: { color: '#A33A3E', fontSize: 13, lineHeight: 18 },
  ctaWrap: { marginTop: 'auto', paddingHorizontal: 22 },
  secondWrap: { paddingHorizontal: 22, marginTop: 10 },
  cta: {
    backgroundColor: c.blue,
    borderRadius: radius.pill,
    paddingVertical: 18,
    alignItems: 'center',
    ...glow(c.blue),
    shadowOpacity: 0.36,
  },
  ctaDisabled: { backgroundColor: c.lineStrong, shadowOpacity: 0 },
  ctaText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  libraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    borderRadius: radius.pill,
    paddingVertical: 15,
    marginTop: 10,
    ...shadowCard,
    shadowOpacity: 0.05,
  },
  libraryText: { color: c.ink, fontSize: 15.5, fontWeight: '600' },
  libraryBadge: {
    backgroundColor: c.blueSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginLeft: 9,
  },
  libraryBadgeText: { color: c.blue, fontSize: 13, fontWeight: '800' },
  hint: {
    color: c.inkFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 17,
  },
  // Le bloc profil : en haut à gauche, le miroir du bouton de thème — la
  // même bande, chacun son coin.
  // Le bandeau du haut est AXÉ, et le profil porte son CADRE INVISIBLE —
  // relevé du patron : « un clic même autour doit fonctionner ». Le
  // rembourrage est DANS le bouton : c'est de la vraie surface de toucher,
  // pas un débord que le parent pourrait rogner.
  // Remonté d'un cran — relevé du patron : « le clic doit être fait un
  // peu au-dessus pour que ça fonctionne » — et le cadre invisible
  // s'élargit encore : quatorze points de vraie surface tout autour.
  /*
    MÊME SOMMET, MÊME HAUTEUR QUE LA ZONE DU THÈME — relevé du patron :
    les deux blocs vivaient dans des boîtes différentes et leurs centres
    dérivaient à chaque retouche. Alignés par construction : plus rien à
    calculer, donc plus rien à dériver. Le rembourrage horizontal reste le
    cadre invisible du clic.
  */
  profilBloc: {
    position: 'absolute',
    top: 47,
    left: 8,
    height: 72,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    maxWidth: '50%',
    zIndex: 2,
  },
  profilColonne: { flexShrink: 1 },
  // Moins gras — relevé du patron : le prénom n'est pas un titre.
  profilNom: { color: c.inkSoft, fontSize: 14.5, fontWeight: '600', maxWidth: 130 },
  // L'anneau d'or AU RAS de l'icône : 32 pour un avatar de 26 — plus de
  // disque clair entre eux, le couvercle est la couleur du fond.
  avatarOrZone: { width: 32, height: 32 },
  avatarOrDedans: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
}));
