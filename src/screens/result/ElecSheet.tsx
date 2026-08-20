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
import {
  FIXTURES,
  FIXTURE_FAMILIES,
  FIXTURE_SYMBOL,
  type FixtureKind,
} from '../../geometry/electrical';
import { getStyles } from './styles';

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
              />
            </View>
          ) : (
            <View style={styles.modalCard}>
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
                              LE VRAI SYMBOLE, PAS UNE PASTILLE À SIGLE —
                              relevé du patron : « des images plus
                              compréhensibles ». La tuile montre le
                              symbole normalisé que le plan dessinera :
                              on choisit ce qu'on va lire.
                            */}
                            <View style={styles.elecTuile}>
                              <Svg width={30} height={30} viewBox="-13 -13 26 26">
                                {FIXTURE_SYMBOL[kind].map((s, i) => (
                                  <Path
                                    key={i}
                                    d={s.d}
                                    stroke={spec.color}
                                    strokeWidth={1.8}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill={s.fill ? spec.color : 'none'}
                                  />
                                ))}
                              </Svg>
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
