/**
 * LE MENU « AFFICHER » — tout ce que le plan et la maquette savent montrer.
 *
 * Relevé du patron : « rajoute un bouton “…” en bas à droite ; ce bouton
 * ouvrira un menu où beaucoup d'autres options s'affichent ; on y trouvera
 * dans un menu “Afficher” Volumes d'eau, Points cardinaux, Sol, la Nuit, Murs,
 * etc. Repense tous ces boutons et affiche hors du “…” les plus utiles, comme
 * les meubles, les cotes, les surfaces, et ajoute d'autres idées de choses à
 * afficher ».
 *
 * La rangée ne garde que ce qu'on allume tous les jours ; ce menu tient
 * TOUT, rangé par sections, chaque calque avec son interrupteur et une ligne
 * qui dit ce qu'il montre — « Volumes » devient « Volumes de salle d'eau »,
 * et l'on ne se demande plus si c'est le volume de la pièce. Un calque qui
 * n'a rien à montrer reste dans la liste, grisé, et dit pourquoi.
 *
 * ON CHOISIT, PUIS ON VALIDE. Relevé du patron : « le OK et la croix sont au
 * même endroit ; mets un bouton de validation, et si on clique hors du bloc,
 * ça doit quitter sans valider ». Les interrupteurs remplissent un BROUILLON ;
 * « Valider » l'applique d'un coup et referme. La croix, le voile et le geste
 * retour referment sans rien toucher — et le brouillon est oublié : rouvert,
 * le menu dit l'état réel.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { SOLAIRES } from '../ui/solaires';
import { haptic } from '../ui/haptic';
import { themedStyles, useTheme, type Palette } from '../theme';

export interface LigneDeCalque {
  cle: string;
  icone: keyof typeof SOLAIRES;
  libelle: string;
  /** Ce que le calque montre, en une ligne. */
  aide: string;
  actif: boolean;
  /** Rien à montrer : la phrase qui le dit, et l'interrupteur se grise. */
  vide?: string | null;
  onBascule: () => void;
}

export interface SectionDeCalques {
  titre: string;
  lignes: LigneDeCalque[];
}

/** Un choix exclusif (la pièce isolée en 3D, par exemple). */
export interface ChoixDeVue {
  titre: string;
  aide?: string;
  options: { cle: string; libelle: string }[];
  actuel: string;
  onChoix: (cle: string) => void;
}

export function CalquesSheet({
  visible,
  onClose,
  titre,
  sousTitre,
  sections,
  vue,
}: {
  visible: boolean;
  onClose: () => void;
  titre: string;
  sousTitre?: string;
  sections: SectionDeCalques[];
  vue?: ChoixDeVue | null;
}) {
  const c = useTheme();
  const s = getStyles(c);
  // Le brouillon : seulement ce qu'on a touché, par clé de calque.
  const [brouillon, setBrouillon] = useState<Record<string, boolean>>({});
  const [vueChoisie, setVueChoisie] = useState<string | null>(null);
  // Chaque ouverture repart de l'état réel.
  useEffect(() => {
    if (visible) {
      setBrouillon({});
      setVueChoisie(null);
    }
  }, [visible]);
  const lignes = sections.flatMap((sec) => sec.lignes);
  const allumee = (l: LigneDeCalque) => l.actif && !l.vide;
  const voulue = (l: LigneDeCalque) => (l.cle in brouillon ? brouillon[l.cle] : allumee(l));
  const vueActuelle = vueChoisie ?? vue?.actuel ?? null;
  const changements =
    lignes.filter((l) => !l.vide && voulue(l) !== allumee(l)).length +
    (vue && vueActuelle !== vue.actuel ? 1 : 0);
  const valider = () => {
    haptic('succes');
    for (const l of lignes) {
      if (!l.vide && voulue(l) !== allumee(l)) l.onBascule();
    }
    if (vue && vueActuelle !== null && vueActuelle !== vue.actuel) vue.onChoix(vueActuelle);
    onClose();
  };
  return (
    <SheetShell visible={visible} onClose={onClose} defile={false}>
      {/* L'en-tête laisse sa place à la croix de la coquille, en haut à
          droite : c'est elle qui referme sans valider. */}
      <View style={s.tete}>
        <Text style={s.titre}>{titre}</Text>
        {sousTitre ? <Text style={s.sousTitre}>{sousTitre}</Text> : null}
      </View>
      <ScrollView style={s.corps} contentContainerStyle={s.corpsFond} showsVerticalScrollIndicator={false}>
        {vue && vue.options.length > 1 ? (
          <View style={s.section}>
            <Text style={s.sectionTitre}>{vue.titre}</Text>
            <View style={s.puces}>
              {vue.options.map((o) => {
                const pris = o.cle === vueActuelle;
                return (
                  <TouchableOpacity
                    key={o.cle}
                    accessibilityLabel={o.libelle}
                    accessibilityState={{ selected: pris }}
                    style={[s.puce, pris && { backgroundColor: c.blue, borderColor: c.blue }]}
                    onPress={() => {
                      haptic('leger');
                      setVueChoisie(o.cle);
                    }}>
                    <Text style={[s.puceTexte, pris && { color: '#FFFFFF' }]} numberOfLines={1}>
                      {o.libelle}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {vue.aide ? <Text style={s.aideSection}>{vue.aide}</Text> : null}
          </View>
        ) : null}
        {sections
          .filter((sec) => sec.lignes.length > 0)
          .map((sec) => (
            <View key={sec.titre} style={s.section}>
              <Text style={s.sectionTitre}>{sec.titre}</Text>
              <View style={s.carte}>
                {sec.lignes.map((l, i) => {
                  const eteint = !!l.vide;
                  const allume = !eteint && voulue(l);
                  const basculer = () => {
                    if (eteint) {
                      haptic('butee');
                      return;
                    }
                    haptic('leger');
                    setBrouillon((b) => ({ ...b, [l.cle]: !voulue(l) }));
                  };
                  return (
                    <Pressable
                      key={l.cle}
                      accessibilityRole="switch"
                      accessibilityLabel={l.libelle}
                      accessibilityHint={l.vide ?? l.aide}
                      accessibilityState={{ checked: allume, disabled: eteint }}
                      onPress={basculer}
                      style={({ pressed }) => [s.ligne, i > 0 && s.filet, pressed && !eteint && s.appuye]}>
                      <View style={[s.tuile, allume && { backgroundColor: c.blue }, eteint && s.tuileEteinte]}>
                        <Svg width={19} height={19} viewBox="0 0 24 24">
                          <Path d={SOLAIRES[l.icone]} fill={allume ? '#FFFFFF' : eteint ? c.inkFaint : c.blue} fillRule="evenodd" />
                        </Svg>
                      </View>
                      <View style={s.textes}>
                        <Text style={[s.libelle, eteint && { color: c.inkFaint }]}>{l.libelle}</Text>
                        <Text style={[s.aide, eteint && { color: c.amber }]} numberOfLines={2}>
                          {l.vide ?? l.aide}
                        </Text>
                      </View>
                      <Switch
                        value={allume}
                        disabled={eteint}
                        onValueChange={basculer}
                        trackColor={{ true: c.blue, false: c.line }}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
      </ScrollView>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Valider"
        accessibilityHint={
          changements === 0
            ? 'Aucun changement : referme le menu'
            : `Applique ${changements} changement${changements > 1 ? 's' : ''}`
        }
        activeOpacity={0.85}
        style={s.valider}
        onPress={valider}>
        <Text style={s.validerTexte}>Valider</Text>
        {changements > 0 ? (
          <View style={s.compte}>
            <Text style={s.compteTexte}>{changements}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    // À droite, la place de la croix de la coquille (32 points, plus l'air).
    tete: { paddingLeft: 4, paddingRight: 44, paddingTop: 2 },
    titre: { color: c.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
    sousTitre: { color: c.inkSoft, fontSize: 13, marginTop: 2 },
    corps: { maxHeight: 520, flexGrow: 0, flexShrink: 1 },
    corpsFond: { paddingBottom: 14, gap: 14, paddingTop: 12 },
    valider: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
      minHeight: 50,
      borderRadius: 25,
      backgroundColor: c.blue,
    },
    validerTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    compte: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    compteTexte: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    section: { gap: 7 },
    sectionTitre: {
      color: c.inkSoft,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      paddingHorizontal: 4,
    },
    carte: { backgroundColor: c.surface, borderRadius: 18, overflow: 'hidden' },
    ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
    filet: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
    appuye: { backgroundColor: c.surfaceSunken },
    tuile: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.blueSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tuileEteinte: { backgroundColor: c.surfaceSunken },
    textes: { flex: 1 },
    libelle: { color: c.ink, fontSize: 15, fontWeight: '700' },
    aide: { color: c.inkFaint, fontSize: 12, lineHeight: 16, marginTop: 1 },
    aideSection: { color: c.inkFaint, fontSize: 12, paddingHorizontal: 4 },
    puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    puce: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.lineStrong,
      backgroundColor: c.surface,
      justifyContent: 'center',
    },
    puceTexte: { color: c.ink, fontSize: 14, fontWeight: '700' },
  }),
);
