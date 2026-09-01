/**
 * L'ÉLECTRICITÉ : le catalogue, puis le mur vu de face.
 *
 * Une seule fenêtre, qui CHANGE DE CONTENU. Deux fenêtres empilées se
 * marchent dessus sur iOS — la seconde ne se présente pas tant que la
 * première n'est pas retirée, et l'établi ne s'ouvrait jamais.
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { WallElevation } from '../../components/WallElevation';
import type { ActionData } from '../../components/Sheet';
import {
  FIXTURES,
  FIXTURE_FAMILIES,
  FIXTURE_SYMBOL,
  type FixtureKind,
} from '../../geometry/electrical';
import { getStyles } from './styles';
import { VignetteProduit } from '../../components/VignetteProduit';

/**
 * LES COMBOS MONTRENT LEURS DEUX VISAGES — relevé du patron : « "TV +
 * prise" affiche que la TV.. on doit voir les deux images avec un + au
 * centre. » Un poste combiné, c'est deux mécanismes sous une plaque : la
 * tuile montre les deux, séparés du signe qui les unit.
 */
const DUOS: Partial<Record<string, [string, string]>> = {
  tvPrise: ['meca-tv', 'meca-prise'],
  rjPrise: ['meca-rj45', 'meca-prise'],
  rjPrise2: ['meca-rj45', 'meca-prise'],
};

export function ElecSheet({
  visible,
  vue,
  wallId,
  focusX,
  selectedId,
  onSelect,
  onAddRequest,
  onLinkRequest,
  onChoose,
  onClose,
  onDemander,
}: {
  visible: boolean;
  /** Le catalogue, ou le mur vu de face : jamais les deux. */
  vue: 'catalogue' | 'mur';
  wallId: string | null;
  /** L'abscisse visée sur la face, quand un retour est choisi. */
  focusX: number | undefined;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddRequest: () => void;
  /** « Lier » depuis l'établi : l'appareil tenu attend sa commande. */
  onLinkRequest?: (fixtureId: string) => void;
  onChoose: (kind: FixtureKind) => void;
  onClose: () => void;
  /** La façon d'ouvrir NOS questions : l'établi n'a pas de feuille à lui. */
  onDemander?: (data: ActionData) => void;
}) {
  const styles = getStyles(useTheme());
  const plein = vue === 'mur';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View
        style={[
          styles.modalBackdrop,
          // L'établi électrique prend l'écran : on y place des appareils
          // au doigt, à cinq centimètres près. Le catalogue, lui, reste
          // une fenêtre — on y choisit, on n'y travaille pas.
          plein && styles.modalBackdropPlein,
        ]}>
        {/*
          LE VOILE EST UN FRÈRE, PAS UN PARENT — relevé du patron : « ça ne
          scrolle pas, il faut scroller sur un nom ». La carte vivait DANS
          un Pressable : sur les zones blanches, c'est lui qui prenait le
          geste, et le déroulé ne partait que depuis un libellé. Le voile
          est posé DERRIÈRE la carte : il ne reçoit que ce qui la manque.
        */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.elecWrap, plein && styles.elecWrapPlein]}
          pointerEvents="box-none">
          {plein && wallId ? (
            <View style={styles.elecPlein}>
              <WallElevation
                wallId={wallId}
                focusX={focusX}
                selectedId={selectedId}
                onSelect={onSelect}
                onAddRequest={onAddRequest}
                onLinkRequest={onLinkRequest}
                onClose={onClose}
                onDemander={onDemander}
              />
            </View>
          ) : (
            <View style={styles.modalCard}>
              {/*
                EN GRANDES TUILES — relevé du patron : « ça paraît petit,
                inadapté, pas ergonomique ». Les pilules serrées deviennent
                des cartes de la taille d'un pouce : le symbole normalisé
                en grand, le nom dessous. On choisit ce qu'on va lire sur
                le plan, et on le choisit sans viser.
              */}
              <Text style={styles.modalTitle}>Ajouter un appareil</Text>
              <Text style={styles.modalSubtitle}>
                Il se pose à 20 cm du coin bas gauche du mur, puis se
                déplace au doigt ou à la cote, face au mur.
              </Text>
              <ScrollView style={styles.elecScroll}>
                {FIXTURE_FAMILIES.map((family) => (
                  <View key={family.name}>
                    <Text style={styles.elecFamily}>{family.name}</Text>
                    <View style={styles.elecGrid}>
                      {family.kinds.map((kind) => {
                        const spec = FIXTURES[kind];
                        return (
                          <TouchableOpacity
                            key={kind}
                            style={styles.elecChip}
                            // Le symbole ne dit rien à un lecteur d'écran :
                            // la puce porte son nom en clair.
                            accessibilityLabel={spec.label}
                            onPress={() => onChoose(kind)}>
                            {/*
                              LA PHOTO DU DEVIS, PAS UN PICTOGRAMME —
                              relevé du patron : « refais les choix en
                              images réalistes, pas icônes. Comme le
                              devis. » La tuile montre le produit qu'on
                              achète ; le symbole normalisé — celui que le
                              plan dessinera — reste en insigne au coin :
                              on choisit ce qu'on pose ET l'on apprend ce
                              qu'on lira.
                            */}
                            <View style={styles.elecTuile}>
                              {DUOS[kind] ? (
                                <View style={styles.elecDuo}>
                                  <VignetteProduit
                                    code={DUOS[kind]![0]}
                                    libelle={spec.label}
                                    taille={30}
                                  />
                                  <Text style={styles.elecPlus}>+</Text>
                                  <VignetteProduit
                                    code={DUOS[kind]![1]}
                                    libelle={spec.label}
                                    taille={30}
                                  />
                                </View>
                              ) : (
                                <VignetteProduit
                                  code={`meca-${kind}`}
                                  libelle={spec.label}
                                  taille={52}
                                />
                              )}
                              <View style={styles.elecInsigne}>
                                <Svg width={16} height={16} viewBox="-13 -13 26 26">
                                  {FIXTURE_SYMBOL[kind].map((s, i) => (
                                    <Path
                                      key={i}
                                      d={s.d}
                                      stroke={spec.color}
                                      strokeWidth={2.6}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      fill={s.fill ? spec.color : 'none'}
                                    />
                                  ))}
                                </Svg>
                              </View>
                            </View>
                            <Text style={styles.elecChipText}>
                              {spec.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
