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
};

export interface SheetAction {
  label: string;
  hint?: string;
  icon?: keyof typeof ICONS;
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
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const styles = getStyles(useTheme());
  const monte = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(monte, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 140,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, monte]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
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
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.grip} />
              {children}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
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
  return (
    <SheetShell visible={!!data} onClose={onClose}>
      {data && (
        <>
          <Text style={styles.title}>{data.title}</Text>
          {data.subtitle ? (
            <Text style={styles.subtitle}>{data.subtitle}</Text>
          ) : null}
          {data.actions.map((a) => (
            <Pressable
              key={a.label}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                onClose();
                // Laisse la feuille se refermer : iOS ne présente pas deux
                // écrans à la fois, et une action qui en ouvre un autre
                // tomberait dans le vide.
                setTimeout(a.onPress, 180);
              }}>
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
  const [texte, setTexte] = useState('');
  useEffect(() => {
    setTexte(data?.value ?? '');
  }, [data]);
  const valider = () => {
    const v = texte;
    onClose();
    setTimeout(() => data?.onSubmit(v), 150);
  };
  return (
    <SheetShell visible={!!data} onClose={onClose}>
      {data && (
        <>
          <Text style={styles.title}>{data.title}</Text>
          {data.subtitle ? (
            <Text style={styles.subtitle}>{data.subtitle}</Text>
          ) : null}
          <View style={styles.champRow}>
            <TextInput
              style={styles.champ}
              value={texte}
              onChangeText={setTexte}
              autoFocus
              selectTextOnFocus
              keyboardType={data.numeric ? 'decimal-pad' : 'default'}
              returnKeyType="done"
              onSubmitEditing={valider}
              placeholderTextColor={c.inkFaint}
            />
            {data.unit ? <Text style={styles.unit}>{data.unit}</Text> : null}
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={onClose}>
              <Text style={styles.ghostText}>Annuler</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={valider}>
              <Text style={styles.primaryText}>{data.okLabel ?? 'Valider'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(11,13,18,0.42)',
      justifyContent: 'flex-end',
    },
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
      paddingVertical: 13,
      marginTop: 8,
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
