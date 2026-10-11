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
 */
import React from 'react';
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
  return (
    <SheetShell visible={visible} onClose={onClose} defile={false}>
      <View style={s.tete}>
        <View style={{ flex: 1 }}>
          <Text style={s.titre}>{titre}</Text>
          {sousTitre ? <Text style={s.sousTitre}>{sousTitre}</Text> : null}
        </View>
        <TouchableOpacity accessibilityLabel="Fermer" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={onClose}>
          <Text style={s.fermer}>OK</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={s.corps} contentContainerStyle={s.corpsFond} showsVerticalScrollIndicator={false}>
        {vue && vue.options.length > 1 ? (
          <View style={s.section}>
            <Text style={s.sectionTitre}>{vue.titre}</Text>
            <View style={s.puces}>
              {vue.options.map((o) => {
                const pris = o.cle === vue.actuel;
                return (
                  <TouchableOpacity
                    key={o.cle}
                    accessibilityLabel={o.libelle}
                    accessibilityState={{ selected: pris }}
                    style={[s.puce, pris && { backgroundColor: c.blue, borderColor: c.blue }]}
                    onPress={() => {
                      haptic('leger');
                      vue.onChoix(o.cle);
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
                  const allume = l.actif && !eteint;
                  const basculer = () => {
                    if (eteint) {
                      haptic('butee');
                      return;
                    }
                    haptic('leger');
                    l.onBascule();
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
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    tete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingTop: 4 },
    titre: { color: c.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
    sousTitre: { color: c.inkSoft, fontSize: 13, marginTop: 2 },
    fermer: { color: c.blue, fontSize: 16, fontWeight: '800', paddingTop: 2 },
    corps: { maxHeight: 560 },
    corpsFond: { paddingHorizontal: 14, paddingBottom: 18, gap: 14, paddingTop: 12 },
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
