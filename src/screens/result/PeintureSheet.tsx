/**
 * LE NUANCIER D'UNE PIÈCE — douze teintes, et rien d'autre.
 *
 * Septième des dix améliorations. La maquette rendait deux choses : le blanc
 * cassé du dessin, ou la teinte relevée au scan. Entre les deux, rien — et
 * c'est justement là que se tient la question qu'un client pose toujours :
 * « et si on mettait du vert d'eau ? ».
 *
 * PAS DE SÉLECTEUR DE COULEUR. C'est la doctrine du mobilier, mot pour mot —
 * « ils ne servent pas à redécorer mais à imaginer la pièce seulement ». Un
 * choix libre produirait des maquettes fuchsia qu'on ne montre à personne.
 * Douze pots, ceux qu'on trouve chez le marchand.
 *
 * LE NUANCIER SE VOIT EN GRAND, en bas de l'écran. Une couleur ne se juge
 * pas sur une pastille de douze points : les carrés font soixante-douze de
 * côté, et le nom se lit dessous — « Vert sauge » dit plus qu'un carré vert
 * quand il s'agit d'en parler à quelqu'un au téléphone.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme';
import { PEINTURES, PEINTURE_DEFAUT, type Peinture } from '../../ui/peintures';
import { SOLS, SOL_DEFAUT } from '../../ui/habillage';

/** Une teinte foncée : la coche s'y pose en blanc. */
const sombre = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  if (!isFinite(v)) return false;
  const l = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
  return l < 140;
};
import { SOLAIRES } from '../../ui/solaires';
import { getStyles } from './styles';

export function PeintureSheet({
  visible,
  nomPiece,
  choisie,
  onChoisir,
  onClose,
  titre,
  aide,
  nuancier = PEINTURES,
  defaut = PEINTURE_DEFAUT,
  sol,
}: {
  visible: boolean;
  nomPiece: string;
  /*
    LE MÊME NUANCIER POUR TOUT L'HABILLAGE — relevé du patron, point 9 de la
    réflexion « grand public » : un mur d'accent, la couleur d'un meuble se
    choisissent comme la peinture d'une pièce. `defaut` est la clé qui veut
    dire « rien de choisi » ; la choisir rend `null`.
  */
  titre?: string;
  aide?: string;
  nuancier?: Peinture[];
  defaut?: string;
  /** Le sol de la pièce, sous ses murs. */
  sol?: { choisi: string | null; onChoisir: (cle: string | null) => void };
  /** La clé posée sur la pièce, ou `null` : elle est alors au blanc. */
  choisie: string | null;
  onChoisir: (cle: string | null) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  // Une pièce sans peinture EST au blanc cassé : la première case porte donc
  // la coche, plutôt que de laisser le nuancier sans réponse.
  const active = choisie ?? defaut;
  const solActif = sol ? sol.choisi ?? SOL_DEFAUT : null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>{titre ?? `Peindre ${nomPiece}`}</Text>
          <Text style={styles.catAide}>
            {aide ??
              (sol
                ? 'Les teintes habillent les murs et le sol de cette pièce en 3D. Elles ne changent rien au relevé.'
                : 'La teinte habille les murs de cette pièce en 3D. Elle ne change rien au relevé.')}
          </Text>
          <ScrollView style={styles.catScroll}>
            {sol ? <Text style={styles.catAide}>Les murs</Text> : null}
            <View style={styles.peintureGrille}>
              {nuancier.map((p) => {
                const prise = p.cle === active;
                return (
                  <Pressable
                    key={p.cle}
                    accessibilityRole="button"
                    accessibilityState={{ selected: prise }}
                    accessibilityLabel={p.nom}
                    style={styles.peintureCase}
                    onPress={() => onChoisir(p.cle === defaut ? null : p.cle)}>
                    <View
                      style={[
                        styles.peintureCarre,
                        { backgroundColor: p.hex },
                        prise && styles.peintureCarrePrise,
                      ]}>
                      {prise && (
                        <Svg width={22} height={22} viewBox="0 0 24 24">
                          <Path
                            d={SOLAIRES.coche}
                            fill="none"
                            /* La coche se pose SUR la teinte : sur un
                               anthracite, une coche sombre ne se voit pas. */
                            stroke={sombre(p.hex) ? '#FFFFFF' : c.ink}
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Svg>
                      )}
                    </View>
                    <Text style={styles.peintureNom} numberOfLines={1}>
                      {p.nom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {sol ? (
              <>
                <Text style={styles.catAide}>Le sol</Text>
                <View style={styles.peintureGrille}>
                  {SOLS.map((s) => {
                    const prise = s.cle === solActif;
                    return (
                      <Pressable
                        key={s.cle}
                        accessibilityRole="button"
                        accessibilityState={{ selected: prise }}
                        accessibilityLabel={`Sol : ${s.nom}`}
                        style={styles.peintureCase}
                        onPress={() => sol.onChoisir(s.cle === SOL_DEFAUT ? null : s.cle)}>
                        <View
                          style={[
                            styles.peintureCarre,
                            { backgroundColor: s.hex, overflow: 'hidden' },
                            prise && styles.peintureCarrePrise,
                          ]}>
                          {/* Le dessin des joints : des lattes, ou des carreaux. */}
                          <Svg width="100%" height="100%" viewBox="0 0 24 24" style={{ position: 'absolute' }}>
                            {s.motif === 'parquet'
                              ? [4, 10, 16, 22].map((y) => (
                                  <Path key={y} d={`M0 ${y} H24`} stroke="#00000022" strokeWidth={0.6} />
                                ))
                              : s.motif === 'carrelage'
                                ? [8, 16].flatMap((k) => [
                                    <Path key={`h${k}`} d={`M0 ${k} H24`} stroke="#FFFFFF88" strokeWidth={0.8} />,
                                    <Path key={`v${k}`} d={`M${k} 0 V24`} stroke="#FFFFFF88" strokeWidth={0.8} />,
                                  ])
                                : null}
                          </Svg>
                          {prise && (
                            <Svg width={22} height={22} viewBox="0 0 24 24">
                              <Path
                                d={SOLAIRES.coche}
                                fill="none"
                                stroke={sombre(s.hex) ? '#FFFFFF' : c.ink}
                                strokeWidth={2.2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </Svg>
                          )}
                        </View>
                        <Text style={styles.peintureNom} numberOfLines={1}>
                          {s.nom}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
