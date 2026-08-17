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
  useWindowDimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { radius, shadowCard, themedStyles, useTheme, type Palette } from '../theme';

/** Tracés des icônes de choix, en 24×24. */
const ICONS: Record<string, string[]> = {
  renommer: [
    'M11 4 H6 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 v-5',
    'M18.3 2.7 l3 3 L11.2 15.8 l-4.1 1.1 1.1 -4.1 z',
  ],
  supprimer: ['M5 7 h14', 'M9.5 7 V4.5 h5 V7', 'M6.5 7 l1 13 h9 l1 -13'],
  fusionner: ['M4 8 h7 a4 4 0 0 1 4 4 h5', 'M4 16 h7', 'M16.5 8.5 L20 12 l-3.5 3.5'],
  scinder: ['M12 3 v18', 'M4 8 h4', 'M16 8 h4', 'M4 16 h4', 'M16 16 h4'],
  hauteur: ['M12 4 v16', 'M8.5 7.5 L12 4 l3.5 3.5', 'M8.5 16.5 L12 20 l3.5 -3.5'],
  regle: [
    'M3.5 9 h17 a1.5 1.5 0 0 1 1.5 1.5 v3 a1.5 1.5 0 0 1 -1.5 1.5 h-17 a1.5 1.5 0 0 1 -1.5 -1.5 v-3 a1.5 1.5 0 0 1 1.5 -1.5 z',
    'M7.5 9 v3',
    'M11.5 9 v3',
    'M15.5 9 v3',
  ],
  sortir: ['M14 4 h5 v16 h-5', 'M4 12 h10', 'M10.5 8.5 L14 12 l-3.5 3.5'],
  piece: ['M4 5 h16 v14 h-16 z', 'M4 12 h6 v7'],
};

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
  onSubmit: (value: string) => void;
}

/**
 * La feuille elle-même : voile, glissement du bas, appui à côté pour fermer.
 * Exportée : tout ce qui s'ouvre par-dessus le plan doit avoir cette
 * carrosserie, sinon chaque écran réinvente la sienne.
 */
export function SheetShell({
  visible,
  onClose,
  onClosed,
  children,
}: {
  visible: boolean;
  onClose: () => void;
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
  const styles = getStyles(useTheme());
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
  const { width: largeur } = useWindowDimensions();
  const carte = largeur > 620;
  const monte = useRef(new Animated.Value(0)).current;
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
    if (visible) setRendu(true);
    Animated.timing(monte, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendu(false);
    });
  }, [visible, monte]);
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Le voile s'allume et s'éteint avec la feuille. Posé en fond et
            transparent au doigt : c'est le `Pressable` du dessous qui ferme,
            sinon l'appui « à côté » ne fonctionnerait plus. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.veil, { opacity: monte }]}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}>
          <Animated.View
            style={{
              opacity: monte,
              transform: [
                {
                  translateY: monte.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            }}>
            <Pressable
              style={[styles.sheet, carte && styles.sheetCarte]}
              onPress={() => {}}>
              <View style={styles.grip} />
              {children}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
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
}: {
  data: ActionData | null;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  const vu = useDernier(data);
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
          {vu.actions.map((a) => (
            <Pressable
              key={a.label}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                attente.current = a.onPress;
                onClose();
              }}>
              {a.node}
              {a.icon && (
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  {ICONS[a.icon].map((d) => (
                    <Path
                      key={d}
                      d={d}
                      stroke={a.danger ? c.danger : c.ink}
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  ))}
                </Svg>
              )}
              <View style={styles.rowTexts}>
                <Text style={[styles.rowLabel, a.danger && styles.rowDanger]}>
                  {a.label}
                </Text>
                {a.hint ? <Text style={styles.rowHint}>{a.hint}</Text> : null}
              </View>
            </Pressable>
          ))}
        </>
      )}
    </SheetShell>
  );
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
  useEffect(() => {
    setTexte(data?.value ?? '');
  }, [data]);
  const attente = useRef<null | (() => void)>(null);
  const valider = () => {
    const v = texte;
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
              onChangeText={setTexte}
              autoFocus
              selectTextOnFocus
              keyboardType={vu.numeric ? 'decimal-pad' : 'default'}
              returnKeyType="done"
              onSubmitEditing={valider}
              placeholderTextColor={c.inkFaint}
            />
            {vu.unit ? <Text style={styles.unit}>{vu.unit}</Text> : null}
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={valider}>
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
    veil: { backgroundColor: 'rgba(11,13,18,0.42)' },
    avoider: { width: '100%' },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 34,
      ...shadowCard,
    },
    /** Tablette : une carte centrée, bornée à la largeur d'un téléphone. */
    sheetCarte: {
      width: 560,
      alignSelf: 'center',
      borderRadius: 26,
      marginBottom: 26,
      paddingBottom: 22,
    },
    grip: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.lineStrong,
      marginBottom: 12,
    },
    title: { color: c.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: {
      color: c.inkFaint,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 3,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: c.surfaceSunken,
      borderRadius: radius.md,
      paddingHorizontal: 15,
      // Une ligne sans description n'a pas besoin de treize points de
      // marge : à neuf appareils de plafond, on déroulait deux écrans
      // pour choisir un spot.
      paddingVertical: 11,
      marginTop: 7,
    },
    rowPressed: { opacity: 0.6 },
    rowTexts: { flex: 1 },
    rowLabel: { color: c.ink, fontSize: 15.5, fontWeight: '700' },
    rowDanger: { color: c.danger },
    rowHint: { color: c.inkFaint, fontSize: 12, marginTop: 1, lineHeight: 16 },
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
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    ghost: {
      flex: 1,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: c.surfaceSunken,
    },
    ghostText: { color: c.inkSoft, fontWeight: '700', fontSize: 15 },
    primary: {
      flex: 1.4,
      borderRadius: radius.pill,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: c.blue,
    },
    primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  }),
);
