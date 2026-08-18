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
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../theme';
import { WallElevation } from '../../components/WallElevation';
import {
  FIXTURES,
  FIXTURE_FAMILIES,
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
      <Pressable
        style={[
          styles.modalBackdrop,
          // L'établi électrique prend l'écran : on y place des appareils
          // au doigt, à cinq centimètres près. Le catalogue, lui, reste
          // une fenêtre — on y choisit, on n'y travaille pas.
          plein && styles.modalBackdropPlein,
        ]}
        onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.elecWrap, plein && styles.elecWrapPlein]}>
          <Pressable
            onPress={() => {}}
            style={plein ? styles.elecPlein : undefined}>
            {plein && wallId ? (
              <WallElevation
                wallId={wallId}
                focusX={focusX}
                selectedId={selectedId}
                onSelect={onSelect}
                onAddRequest={onAddRequest}
                onClose={onClose}
              />
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
                              onPress={() => onChoose(kind)}>
                              <View
                                style={[
                                  styles.elecDot,
                                  { backgroundColor: spec.color },
                                ]}>
                                <Text style={styles.elecDotText}>
                                  {spec.short}
                                </Text>
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
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
