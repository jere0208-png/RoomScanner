/**
 * Nos fenêtres à nous.
 *
 * `Alert.alert` et `Alert.prompt` sont ceux d'iOS : police système, boutons
 * bleus empilés, coins de 2019. Au milieu d'une app qui a sa typographie,
 * ses rayons et son bleu, ils font tache — et sur Android, `Alert.prompt`
 * n'existe même pas.
 *
 * Deux composants suffisent à couvrir tout ce que l'app demandait :
 *
 * - `ActionSheet` : un titre, une phrase, des choix. Chaque choix porte son
 *   icône, parce qu'une liste de mots se lit plus lentement.
 * - `PromptSheet` : une valeur à saisir, avec son unité.
 *
 * Tous deux sont des **feuilles du bas**. Ce n'est pas une mode : c'est le
 * seul endroit de l'écran que le clavier ne peut pas recouvrir, puisque la
 * feuille monte avec lui. Une boîte centrée avec un champ de saisie finit
 * toujours par se faire manger la moitié.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  useWindowDimensions,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { CloseCross } from './CloseCross';
import { AlerteHote } from './AlerteHote';
import { SOLAIRES } from '../ui/solaires';
import { haptic } from '../ui/haptic';
import type { FauteDeCote } from '../ui/saisieCote';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/**
 * LES ICÔNES DES CHOIX — les silhouettes Solar de l'app, dans leur tuile.
 *
 * Relevé du patron : « refonte des icônes du menu "…" : trop simples, SVG IA
 * facilement détectable ; garde une cohérence avec les icônes qu'on a déjà
 * ailleurs ». C'étaient dix-neuf dessins au trait, tracés à la main ici,
 * pendant que les pastilles d'outils, l'accueil, les bandeaux parlaient en
 * silhouettes du jeu Solar Bold. Chaque choix prend maintenant la sienne,
 * tirée du MÊME jeu (`ui/solaires`, régénéré par `tools/gen-solaires.mjs`) :
 * la corbeille du menu est celle du bandeau, la règle celle de l'outil, la
 * baguette celle des astuces. Posée dans une tuile teintée, comme les
 * réglages d'iOS : on trouve le choix à l'œil avant de lire son mot.
 */
/*
  PAS D'ANNOTATION `Record<string, …>` ICI — c'est elle qui a fait tomber
  l'app sur le chantier. Elle élargissait `keyof typeof ICONS` à `string` :
  le champ `icon` des choix, pourtant typé sur ces clés, acceptait alors
  N'IMPORTE QUELLE chaîne — et `ICONS['metre']`, qui n'a jamais existé,
  rendait `undefined`. `satisfies` vérifie la forme SANS élargir : la
  prochaine clé inventée ne compile pas.
*/
const ICONS = {
  renommer: SOLAIRES.renommer,
  supprimer: SOLAIRES.supprimer,
  fusionner: SOLAIRES.fusionner,
  scinder: SOLAIRES.scinder,
  hauteur: SOLAIRES.hauteur,
  regle: SOLAIRES.ruler,
  sortir: SOLAIRES.sortir,
  sauver: SOLAIRES.save,
  piece: SOLAIRES.room,
  scanner: SOLAIRES.scanner,
  redetecter: SOLAIRES.baguette,
  etage: SOLAIRES.etage,
  soussol: SOLAIRES.soussol,
  charniere: SOLAIRES.charniere,
  menuiserie: SOLAIRES.ouvertures,
  coffre: SOLAIRES.coffre,
  murer: SOLAIRES.murer,
  rouleau: SOLAIRES.rouleau,
  tableau: SOLAIRES.tableau,
  diagnostic: SOLAIRES.sirene,
  /*
    UNE ICÔNE PAR ENTRÉE DU MENU DU PLAN — revue de lisibilité : la liste
    d'achats portait le rouleau de « Décorer », « Dessiner un étage » la
    flèche de « Scanner un étage ». Chacune a maintenant la sienne.
  */
  panier: SOLAIRES.panier,
  crayon: SOLAIRES.crayon,
  crayonCadre: SOLAIRES.renommer,
  etiquette: SOLAIRES.etiquette,
  prise: SOLAIRES.prise,
  dupliquer: SOLAIRES.dupliquer,
  revenir: SOLAIRES.undo,
  nouveau: SOLAIRES.plus,
  // L'export, nommé dans le menu du plan : le dessin de l'icône d'en-tête.
  partage: SOLAIRES.partage,
} satisfies { [cle: string]: string };

export interface SheetAction {
  label: string;
  hint?: string;
  icon?: keyof typeof ICONS;
  /**
   * Une icône toute faite, quand le jeu maison n'en a pas.
   *
   * Les huit dessins de ce fichier couvrent les gestes de l'app —
   * renommer, fusionner, supprimer. Ils ne couvriront jamais un
   * détecteur de fumée ni une bouche de VMC : plutôt que d'en dessiner
   * un de plus à chaque appareil, l'appelant passe le sien.
   */
  node?: React.ReactNode;
  danger?: boolean;
  /**
   * LE TITRE DE LA SECTION — un menu de douze entrées à plat ne se lit pas
   * (revue de lisibilité, menu du plan). Les entrées consécutives qui
   * portent le même titre forment un bloc, coiffé de ce titre. Sans titre,
   * rien ne change.
   */
  section?: string;
  onPress: () => void;
}

export interface ActionData {
  title: string;
  subtitle?: string;
  actions: SheetAction[];
}

export interface PromptData {
  title: string;
  subtitle?: string;
  value: string;
  /** Unité affichée à droite du champ (« m », « cm »…). */
  unit?: string;
  numeric?: boolean;
  okLabel?: string;
  /**
   * LA LONGUEUR PERMISE, DITE — revue « Hugo » : les noms se coupaient en
   * silence, en plein mot. Le champ s'arrête là, et un compteur paraît à
   * l'approche de la limite.
   */
  maxLength?: number;
  /**
   * LES COTES COURANTES, À TOUCHER PLUTÔT QU'À TAPER.
   *
   * Relevé du patron : « optimise des choses qui pourraient prendre plus en
   * facilité et moins de temps ». La moitié des cotes de cette application
   * ne sont pas des mesures, ce sont des valeurs de catalogue — 83 pour un
   * passage, 95 pour une allège, 2,50 pour un plafond. Les taper au clavier
   * numérique, d'une main, sur un chantier, c'est retaper ce que tout le
   * monde sait.
   *
   * `label` est ce qu'on lit sur la pastille, dans la langue du métier (une
   * menuiserie se commande en centimètres) ; `value` est ce qui entre dans
   * le champ, donc des mètres avec la virgule. Voir `src/ui/cotesCourantes`.
   *
   * Rien ici pour ce qui est une VRAIE mesure — la longueur d'un mur :
   * proposer des valeurs rondes serait suggérer une cote que personne n'a
   * relevée.
   */
  choix?: { label: string; value: string }[];
  /**
   * CE QUI NE VA PAS DANS LA VALEUR — revues « Bernard », « Inès », « Hugo ».
   * Une cote illisible ou absurde (« 3m40 » lu 3 m, « 410 » lu 410 m) se
   * posait sans un mot. Une faute garde la feuille ouverte, se dit sous le
   * champ, et propose la lecture probable à un appui. Une faute
   * `douteuse` (une cote hors du commun) passe à la seconde validation.
   */
  verifier?: (value: string) => FauteDeCote | null;
  onSubmit: (value: string) => void;
}

/**
 * La feuille elle-même : voile, glissement du bas, appui à côté pour fermer.
 * Exportée : tout ce qui s'ouvre par-dessus le plan doit avoir cette
 * carrosserie, sinon chaque écran réinvente la sienne.
 */
/**
 * LA HAUTEUR DU CLAVIER, MESURÉE — pas devinée par un composant.
 *
 * `KeyboardAvoidingView` tenait ce rôle, et il tombait à côté DANS UNE
 * FENÊTRE MODALE : il mesure par rapport à la fenêtre principale, pas à la
 * nôtre. Résultat, en touchant « CLIENT » dans l'écran d'export : le voile
 * s'allumait, le clavier montait, et la feuille restait POSÉE AU FOND,
 * entièrement cachée derrière lui. On tapait une lettre à l'aveugle, un
 * rendu de plus finissait par appliquer une marge partielle, et la feuille
 * réapparaissait — ses boutons coupés.
 *
 * iOS annonce le clavier AVANT qu'il monte (`keyboardWillChangeFrame`), et
 * il annonce sa position à l'écran. On en déduit la hauteur couverte, et la
 * feuille se pose juste au-dessus. Plus rien à mesurer, plus rien à
 * deviner — et ça vaut pour TOUTES les saisies de l'app, puisqu'elles
 * passent toutes par cette coquille.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const bouge = (e: {
      endCoordinates: { screenY: number; height: number };
    }) => {
      const ecran = Dimensions.get('window').height;
      const couvert =
        Platform.OS === 'ios'
          ? Math.max(0, ecran - e.endCoordinates.screenY)
          : e.endCoordinates.height;
      setInset(couvert);
    };
    const abonnements = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
        bouge,
      ),
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setInset(0),
      ),
    ];
    return () => abonnements.forEach((a) => a.remove());
  }, []);
  return inset;
}

/**
 * LE GESTE QUI REFERME : assez loin, ou assez vite.
 *
 * Au-delà de 30 % de la hauteur de la feuille, ou lâchée à plus de
 * 0,8 point par milliseconde vers le bas, elle part ; sinon elle revient.
 * Les mêmes seuils que les feuilles d'iOS, à l'œil : une pichenette suffit,
 * un doigt qui hésite ne ferme rien.
 */
export function glisserFerme(dy: number, vy: number, hauteur: number): boolean {
  if (dy <= 0) return false;
  return dy > Math.max(1, hauteur) * 0.3 || vy > 0.8;
}

export function SheetShell({
  visible,
  onClose,
  onClosed,
  defile = true,
  sansHoteAlerte = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * Pas d'hôte d'alerte dans cette feuille : c'est celle de l'alerte
   * elle-même (`AlerteHote`), qui s'y monterait sans fin.
   */
  sansHoteAlerte?: boolean;
  /**
   * La feuille défile-t-elle d'elle-même quand la place manque ? Oui, sauf
   * pour celles qui portent déjà leur propre liste défilante (contrôle,
   * journal, travaux) : deux défilements l'un dans l'autre se disputent le
   * doigt.
   */
  defile?: boolean;
  /**
   * Appelé quand la feuille est VRAIMENT partie, fenêtre native comprise.
   *
   * iOS ne présente qu'une fenêtre modale à la fois : en ouvrir une
   * seconde pendant que la première se retire ne fait rien du tout — la
   * seconde n'apparaît jamais. Le symptôme est déroutant : on touche
   * « Largeur » dans un menu, le clavier monte (le champ a bien pris le
   * focus) et il n'y a aucun champ à l'écran. D'où ce signal : ce qui doit
   * s'ouvrir ensuite attend ici, et pas derrière un délai deviné.
   */
  onClosed?: () => void;
  children: React.ReactNode;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const clavier = useKeyboardInset();
  /**
   * SUR TABLETTE, UNE FEUILLE NE TRAVERSE PAS L'ÉCRAN.
   *
   * Étirée sur mille pixels, elle laisse son titre à gauche, son bouton à
   * droite, et un désert au milieu : l'œil fait l'aller-retour pour lire
   * trois mots. iOS la centre et la borne — c'est ce que fait toute
   * l'interface du système dès qu'un iPad dépasse la largeur d'un
   * téléphone. Au-delà, elle devient une carte posée, coins arrondis des
   * quatre côtés.
   */
  const { width: largeur, height: hauteurEcran } = useWindowDimensions();
  const carte = largeur > 620;
  /*
    LA FEUILLE NE MONTE JAMAIS SOUS L'HEURE — relevé du patron, capture à
    l'appui : « le clavier remonte tout le bloc ». La feuille se posait sur
    le clavier sans borne de hauteur : plus haute que la place qui restait,
    elle débordait par le haut, titre coupé sous la barre d'état. Sa hauteur
    est maintenant bornée à ce qui reste entre le haut de l'écran (zone sûre
    comprise) et le clavier ; ce qui ne tient pas défile, dans la feuille.
  */
  const marges = useSafeAreaInsets();
  const hauteurMax = Math.max(220, hauteurEcran - clavier - marges.top - 10);
  const monte = useRef(new Animated.Value(0)).current;
  /*
    LA POIGNÉE SE TIRE — relevé de la revue : « la barre en haut des
    feuilles ne fait rien ». Elle était un dessin ; toutes les feuilles
    d'iOS se referment en la tirant vers le bas, et c'est le premier geste
    qu'on tente. Le décalage du doigt s'ajoute au glissement d'entrée, sur
    la poignée seulement : le défilement de la feuille garde le sien.
  */
  const glisse = useRef(new Animated.Value(0)).current;
  const hauteurFeuille = useRef(0);
  const fermerRef = useRef(onClose);
  fermerRef.current = onClose;
  const tirer = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => glisse.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (glisserFerme(g.dy, g.vy, hauteurFeuille.current)) {
          fermerRef.current();
          return;
        }
        Animated.spring(glisse, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(glisse, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;
  /**
   * La feuille survit à sa fermeture, le temps de descendre.
   *
   * Le `Modal` était monté sur `visible` : à la fermeture il disparaissait
   * dans l'image même où l'animation démarrait, et les 140 ms de descente se
   * jouaient dans le vide. On voyait donc la feuille MONTER en douceur et
   * DISPARAÎTRE d'un coup — une asymétrie qu'on ne s'explique pas en la
   * regardant, mais qu'on sent.
   */
  const [rendu, setRendu] = useState(visible);
  useEffect(() => {
    if (visible) {
      setRendu(true);
      // Rouverte, elle repart d'en haut : le décalage du dernier geste ne
      // la suit pas.
      glisse.setValue(0);
    }
    Animated.timing(monte, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendu(false);
    });
  }, [visible, monte, glisse]);
  // Le démontage de la fenêtre native se fait au rendu suivant : on prévient
  // à ce moment-là, pas à la fin de l'animation.
  const partie = useRef(true);
  useEffect(() => {
    if (rendu) {
      partie.current = false;
      return;
    }
    if (partie.current) return;
    partie.current = true;
    onClosed?.();
  }, [rendu, onClosed]);
  return (
    <Modal visible={rendu} transparent animationType="none" onRequestClose={onClose}>
      {/*
        LE VOILE EST UN FRÈRE DE LA FEUILLE, PAS SON PARENT — relevé de la
        revue VoiceOver : la feuille vivait DANS le Pressable du voile. Or,
        sur iOS, un élément accessible cache tout ce qu'il contient : le
        lecteur d'écran ne voyait qu'un grand bouton sans nom, et rien de ce
        qu'il y avait dessus — choix, champs, alertes — n'était activable.
        Le voile est posé derrière, il ne reçoit que l'appui qui manque la
        feuille ; la feuille, elle, se déclare modale pour VoiceOver.
      */}
      <View style={styles.backdrop}>
        <Pressable
          testID="voile-feuille"
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          style={StyleSheet.absoluteFill}
          onPress={onClose}>
          {/* Le voile s'allume et s'éteint avec la feuille. */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.veil, { opacity: monte }]}
          />
        </Pressable>
        {/* La feuille se pose SUR le clavier, jamais dessous. */}
        <View
          pointerEvents="box-none"
          style={[styles.avoider, { paddingBottom: clavier }]}>
          <Animated.View
            style={{
              opacity: monte,
              transform: [
                {
                  translateY: Animated.add(
                    monte.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                    glisse,
                  ),
                },
              ],
            }}>
            <View
              testID="carte-feuille"
              accessibilityViewIsModal
              onLayout={(e) => {
                hauteurFeuille.current = e.nativeEvent.layout.height;
              }}
              style={[
                styles.sheet,
                carte && styles.sheetCarte,
                { maxHeight: hauteurMax },
                // Clavier ouvert, la barre d'accueil est dessous : sa marge
                // ne sert plus à rien, et elle coûte une ligne.
                clavier > 0 && styles.sheetSurClavier,
              ]}>
              <View testID="poignee-feuille" style={styles.poignee} {...tirer.panHandlers}>
                <View style={styles.grip} />
              </View>
              {/*
                LA CROIX VIT ICI, POUR TOUTES LES FEUILLES.

                Elle avait été posée sur la feuille de CHOIX seulement —
                relevé du patron : « il manque la croix pour quitter la
                page ». Le parcours d'essai a montré que le défaut restait
                entier ailleurs, et justement sur la plus longue de toutes :
                la feuille de contrôle des normes, qu'on ouvre pour lire dix
                constats et dont on ne savait pas sortir.

                Le voile reste l'échappatoire naturelle, mais il n'y a plus
                de voile à viser quand la feuille remplit l'écran. La croix
                est donc dans la coquille COMMUNE : toute feuille qui s'ouvre
                dans cette application sait désormais se refermer.
              */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fermer"
                style={styles.croixFeuille}
                hitSlop={10}
                onPress={onClose}>
                <CloseCross size={20} color={c.inkSoft} />
              </Pressable>
              {defile ? (
                <ScrollView
                  style={styles.defile}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="none"
                  showsVerticalScrollIndicator={false}>
                  {children}
                </ScrollView>
              ) : (
                children
              )}
            </View>
          </Animated.View>
        </View>
      </View>
      {/* Une alerte levée pendant que la feuille est ouverte s'affiche
          DANS sa fenêtre : voir la pile d'hôtes de `src/ui/alerte.ts`. */}
      {!sansHoteAlerte && <AlerteHote imbrique actif={visible} />}
    </Modal>
  );
}

/**
 * Garde le dernier contenu non vide pendant la descente.
 *
 * Nos feuilles s'écrivent `{data && …}` : à la fermeture, `data` retombe à
 * `null` et le contenu s'évanouissait AVANT la feuille, qui finissait sa
 * course vide. On rejoue donc le dernier contenu connu tant que la feuille
 * est encore à l'écran.
 */
function useDernier<T>(data: T | null): T | null {
  const dernier = useRef<T | null>(data);
  if (data) dernier.current = data;
  return data ?? dernier.current;
}

/** Un titre, une phrase, des choix — chacun avec son icône. */
export function ActionSheet({
  data,
  onClose,
  onClosed,
  sansHoteAlerte,
}: {
  data: ActionData | null;
  onClose: () => void;
  /** Appelé une fois la feuille partie ET le geste choisi joué. */
  onClosed?: () => void;
  /** Voir `SheetShell` : réservé à la feuille de l'alerte elle-même. */
  sansHoteAlerte?: boolean;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const vu = useDernier(data);
  /*
    UN SEUL CHOIX PAR OUVERTURE — relevé de la revue : pendant les 160 ms
    de descente, un second appui sur une autre ligne REMPLAÇAIT l'action
    choisie ; on touchait « Renommer », le doigt glissait sur « Supprimer »,
    et c'est la suppression qui partait. Le premier choix est le bon ; les
    suivants sont ignorés jusqu'à la prochaine ouverture.
  */
  const ouverte = !!data;
  const choisi = useRef(false);
  useEffect(() => {
    if (ouverte) choisi.current = false;
  }, [ouverte]);
  /**
   * L'action attend que la feuille soit PARTIE.
   *
   * Elle partait derrière un délai de 180 ms, calé à l'œil sur
   * l'animation de descente. C'était trop court dès que l'action ouvrait
   * une autre feuille : la fenêtre native de la première n'était pas
   * encore retirée, iOS refusait la seconde, et on se retrouvait avec un
   * clavier ouvert devant un écran sans champ.
   */
  const attente = useRef<null | (() => void)>(null);
  return (
    <SheetShell
      visible={!!data}
      onClose={onClose}
      sansHoteAlerte={sansHoteAlerte}
      onClosed={() => {
        const suite = attente.current;
        attente.current = null;
        suite?.();
        onClosed?.();
      }}>
      {vu && (
        <>
          {/*
            LE TITRE ET LA CROIX SUR LA MÊME LIGNE — relevé du patron : « il
            manque la croix pour quitter la page ». On ne refermait qu'en
            visant le voile, à côté d'une feuille qui remplit l'écran : sur
            un menu de neuf entrées, il n'y avait plus de « à côté ».
          */}
          <View style={styles.entete}>
            <View style={styles.enteteTextes}>
              <Text style={styles.title}>{vu.title}</Text>
              {vu.subtitle ? (
                <Text style={styles.subtitle}>{vu.subtitle}</Text>
              ) : null}
            </View>
            {/* Pas de croix ici : la coquille commune la porte pour
                toutes les feuilles. */}
          </View>
          {/*
            UN SEUL BLOC, DES FILETS ENTRE LES LIGNES.

            Chaque choix était une carte, séparée de la suivante par sept
            points de vide : neuf entrées, c'est soixante-trois points perdus
            en gouttières et dix-huit coins arrondis qui hachent la lecture.
            Le bloc porte la forme, les rangées ne sont que ses lignes — et
            l'on gagne un tiers de la hauteur sans rien retirer.
          */}
          {/* Les entrées se rangent en blocs : un par section, un seul sans. */}
          {enSections(vu.actions).map((groupe, g) => (
          <React.Fragment key={`${groupe.titre ?? ''}-${g}`}>
          {groupe.titre ? (
            <Text style={[styles.sectionTitre, g === 0 && styles.sectionTitrePremier]} accessibilityRole="header">
              {groupe.titre}
            </Text>
          ) : g > 0 ? (
            <View style={styles.sectionEcart} />
          ) : null}
          <View style={styles.bloc}>
          {groupe.actions.map((a, i) => (
            <Pressable
              key={a.label}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.rowFilet,
                pressed && styles.rowPressed,
              ]}
              onPress={() => {
                if (choisi.current) return;
                choisi.current = true;
                attente.current = a.onPress;
                onClose();
              }}>
              {a.node}
              {/* Une clé inconnue — donnée d'hier, faute de frappe — rend
                  le choix SANS pictogramme, jamais sans écran. */}
              {a.icon && ICONS[a.icon] && (
                <View style={[styles.tuile, a.danger && styles.tuileDanger]}>
                  <Svg width={19} height={19} viewBox="0 0 24 24">
                    <Path
                      d={ICONS[a.icon]}
                      fill={a.danger ? c.danger : c.blue}
                      fillRule="evenodd"
                    />
                  </Svg>
                </View>
              )}
              <View style={styles.rowTexts}>
                <Text style={[styles.rowLabel, a.danger && styles.rowDanger]}>
                  {a.label}
                </Text>
                {a.hint ? (
                  /*
                    UNE LIGNE, PAS UN MODE D'EMPLOI. Les aides couraient sur
                    trois lignes et faisaient à elles seules la hauteur d'une
                    carte. Ce qui ne tient pas en une ligne se dit dans
                    l'écran qui suit, pas dans le menu qui y mène.
                  */
                  <Text style={styles.rowHint} numberOfLines={1}>
                    {a.hint}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          </View>
          </React.Fragment>
          ))}
        </>
      )}
    </SheetShell>
  );
}

/** Les entrées consécutives d'une même section, ensemble. */
export function enSections(actions: SheetAction[]): { titre?: string; actions: SheetAction[] }[] {
  const out: { titre?: string; actions: SheetAction[] }[] = [];
  for (const a of actions) {
    const der = out[out.length - 1];
    if (der && der.titre === a.section) der.actions.push(a);
    else out.push({ titre: a.section, actions: [a] });
  }
  return out;
}

/** Une valeur à saisir. Le champ prend le focus, et le clavier le pousse. */
export function PromptSheet({
  data,
  onClose,
}: {
  data: PromptData | null;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const vu = useDernier(data);
  const [texte, setTexte] = useState('');
  const [faute, setFaute] = useState<FauteDeCote | null>(null);
  // La valeur dont on a déjà dit qu'elle sortait du commun : la revalider la garde.
  const douteDit = useRef<string | null>(null);
  useEffect(() => {
    setTexte(data?.value ?? '');
    setFaute(null);
    douteDit.current = null;
  }, [data]);
  const attente = useRef<null | (() => void)>(null);
  /*
    LA VALEUR PART AVEC LE GESTE, pas avec l'état.

    Une pastille remplit le champ ET valide. Passer par `setTexte` puis
    valider aurait lu l'ancien état — le rendu ne s'est pas encore rejoué —
    et posé la cote précédente. La valeur voyage donc en argument.
  */
  const valider = (v: string = texte) => {
    const f = data?.verifier?.(v) ?? null;
    if (f && !(f.douteuse && douteDit.current === v)) {
      setFaute(f);
      douteDit.current = f.douteuse ? v : null;
      haptic('alerte');
      return;
    }
    setFaute(null);
    const suite = data?.onSubmit;
    attente.current = suite ? () => suite(v) : null;
    onClose();
  };
  return (
    <SheetShell
      visible={!!data}
      onClose={onClose}
      onClosed={() => {
        const suite = attente.current;
        attente.current = null;
        suite?.();
      }}>
      {vu && (
        <>
          <Text style={styles.title}>{vu.title}</Text>
          {vu.subtitle ? (
            <Text style={styles.subtitle}>{vu.subtitle}</Text>
          ) : null}
          <View style={styles.champRow}>
            <TextInput
              style={styles.champ}
              value={texte}
              onChangeText={(t) => {
                setTexte(t);
                setFaute(null);
              }}
              autoFocus
              selectTextOnFocus
              keyboardType={vu.numeric ? 'decimal-pad' : 'default'}
              returnKeyType="done"
              onSubmitEditing={() => valider()}
              placeholderTextColor={c.inkFaint}
              {...(vu.maxLength ? { maxLength: vu.maxLength } : {})}
            />
            {vu.unit ? <Text style={styles.unit}>{vu.unit}</Text> : null}
            {vu.maxLength && texte.length >= vu.maxLength - 10 ? (
              <Text style={styles.unit} accessibilityLabel={`${texte.length} caractères sur ${vu.maxLength}`}>
                {`${texte.length}/${vu.maxLength}`}
              </Text>
            ) : null}
          </View>
          {faute ? (
            <View style={styles.faute}>
              <Text style={styles.fauteTexte} accessibilityRole="alert">
                {faute.message}
              </Text>
              {faute.proposition ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Utiliser ${faute.proposition}`}
                  style={({ pressed }) => [styles.pastille, styles.pastilleCourante, pressed && styles.pastillePressee]}
                  onPress={() => {
                    const v = faute.proposition!;
                    setTexte(v);
                    valider(v);
                  }}>
                  <Text style={[styles.pastilleTexte, styles.pastilleTexteCourant]}>
                    {`Utiliser ${faute.proposition}${vu.unit ? ` ${vu.unit}` : ''}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {/*
            UN APPUI SUFFIT : la pastille remplit le champ et valide. Un
            choix explicite n'a pas besoin d'être confirmé une seconde fois
            — le demander, c'est reprendre d'une main ce qu'on donne de
            l'autre.

            Celle qui porte la cote DÉJÀ POSÉE se distingue : sans elle, on
            ne sait pas laquelle des quatre on a sous les yeux.
          */}
          {vu.choix && vu.choix.length > 0 ? (
            <View style={styles.pastilles}>
              {vu.choix.map((ch) => {
                const courante = ch.value === texte;
                return (
                  <Pressable
                    key={ch.value}
                    accessibilityRole="button"
                    /* « Cote 83 » se lit ; « 83 » tout seul, non. Mais une
                       pastille qui nomme un GESTE — « Centrée » — se dit
                       telle quelle : « Cote centrée » ne veut rien dire. */
                    accessibilityLabel={
                      /^[0-9]/.test(ch.label) ? `Cote ${ch.label}` : ch.label
                    }
                    style={({ pressed }) => [
                      styles.pastille,
                      courante && styles.pastilleCourante,
                      pressed && styles.pastillePressee,
                    ]}
                    onPress={() => {
                      setTexte(ch.value);
                      valider(ch.value);
                    }}>
                    <Text
                      style={[
                        styles.pastilleTexte,
                        courante && styles.pastilleTexteCourant,
                      ]}>
                      {ch.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={() => valider()}>
              <Text style={styles.primaryText}>{vu.okLabel ?? 'Valider'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    faute: { marginTop: 8, gap: 8, alignItems: 'flex-start' },
    fauteTexte: { color: c.danger, fontSize: 14, lineHeight: 19 },
    veil: { backgroundColor: 'rgba(11,13,18,0.42)' },
    avoider: { width: '100%' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 18,
      paddingTop: 0,
      paddingBottom: 34,
      ...shadowCard,
    },
    /** Tablette : une carte centrée, bornée à la largeur d'un téléphone. */
    sheetSurClavier: { paddingBottom: 12 },
    defile: { flexGrow: 0, flexShrink: 1 },
    sheetCarte: {
      width: 560,
      alignSelf: 'center',
      borderRadius: 26,
      marginBottom: 26,
      paddingBottom: 22,
    },
    /* La zone qu'on tire : toute la largeur du haut de la feuille, pas
       les quatre points du trait — un doigt ne vise pas si fin. */
    poignee: {
      alignSelf: 'stretch',
      marginHorizontal: -18,
      paddingTop: 10,
      paddingBottom: 12,
    },
    grip: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.lineStrong,
    },
    /*
      LA CROIX DE LA COQUILLE : posée en absolu, au-dessus du contenu, elle
      ne pousse rien. Les feuilles ont toutes leur mise en page, et une
      croix qui prendrait sa place dans le flux les décalerait toutes.
    */
    croixFeuille: {
      position: 'absolute',
      top: 10,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 5,
    },
    title: { color: c.ink, fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
    subtitle: {
      color: c.inkFaint,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 3,
    },
    entete: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    enteteTextes: { flex: 1, minWidth: 0 },
    croix: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /* Le bloc porte la forme et le fond ; les rangées ne sont que ses
       lignes, séparées d'un cheveu. */
    bloc: {
      borderRadius: radius.md,
      backgroundColor: c.surfaceSunken,
      overflow: 'hidden',
    },
    sectionTitre: {
      color: c.inkSoft,
      fontSize: 12.5,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginTop: 18,
      marginBottom: 7,
      marginLeft: 4,
    },
    sectionTitrePremier: { marginTop: 2 },
    sectionEcart: { height: 14 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingHorizontal: 15,
      // Une ligne sans description n'a pas besoin de treize points de
      // marge : à neuf appareils de plafond, on déroulait deux écrans
      // pour choisir un spot.
      paddingVertical: 11,
    },
    rowFilet: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.line,
    },
    rowPressed: { backgroundColor: c.line },
    rowTexts: { flex: 1 },
    // La tuile de l'icône : la silhouette Solar, teintée, dans son carré doux.
    tuile: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tuileDanger: { backgroundColor: 'rgba(229, 72, 77, 0.12)' },
    rowLabel: { color: c.ink, fontSize: 15.5, fontWeight: '700' },
    rowDanger: { color: c.danger },
    rowHint: { color: c.inkFaint, fontSize: 12, marginTop: 1, lineHeight: 15 },
    champRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.lineStrong,
      paddingHorizontal: 16,
      marginTop: 14,
    },
    champ: {
      flex: 1,
      color: c.ink,
      fontSize: 19,
      fontWeight: '700',
      paddingVertical: 13,
    },
    unit: { color: c.inkFaint, fontSize: 14, fontWeight: '700' },
    /* Une rangée qui passe à la ligne : quatre cotes tiennent sur un
       téléphone, deux de plus sur une tablette, et rien ne déborde. */
    pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    pastille: {
      flexGrow: 1,
      flexBasis: 0,
      minWidth: 62,
      // Quarante-quatre points sous le doigt : la cible, pas le dessin.
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.lineStrong,
    },
    pastilleCourante: { borderColor: c.blue, backgroundColor: c.blueSoft },
    pastillePressee: { backgroundColor: c.line },
    pastilleTexte: { color: c.ink, fontSize: 15, fontWeight: '700' },
    pastilleTexteCourant: { color: c.blue },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    ghost: {
      flex: 1,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: c.blueSoft,
    },
    ghostText: { color: c.blue, fontWeight: '700', fontSize: 15 },
    primary: {
      flex: 1.4,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: c.blue,
    },
    primaryText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  }),
);
