/**
 * LE PLAN VIERGE, EN PAGE ENTIÈRE.
 *
 * Relevé du patron : « dans “dessiner un plan”, on a un petit pop-up alors
 * que la page entière est dispo. Fais une belle page moderne avec les choix,
 * sans avoir besoin de scroller. Utilise cette image (une maison de verre)
 * en tant qu'icône pour l'écran “Plan vierge, ajouter une pièce”. »
 *
 * La page montre d'emblée ce que la feuille cachait derrière un bouton : les
 * gabarits de pièce, à leurs proportions (`RoomChoice`), et « Sur mesure ».
 *
 * SANS ILLUSTRATION — elle dépassait sous la barre d'état et poussait
 * « Sur mesure » hors de l'écran (relevé du patron : « l'icône dépasse,
 * retire-la »). Les gabarits, trois par rangée, tiennent sur un écran.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RoomChoice, type RoomModel } from '../../components/RoomChoice';
import { themedStyles, useTheme, type Palette } from '../../theme';
import { MODELES_DE_PIECE } from './AddRoomSheet';

export function PlanViergePage({
  onChoose,
  onSurMesure,
  onTracer,
}: {
  onChoose: (m: RoomModel) => void;
  onSurMesure: () => void;
  /**
   * TRACER SES MURS, COIN APRÈS COIN — relevé du patron : « il est difficile
   * de structurer une pièce à partir de rien, en ajoutant des murs ». Une
   * pièce qui n'est pas un rectangle (un L, un pan coupé, une mansarde) se
   * trace ; c'est donc le premier geste offert.
   */
  onTracer?: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  return (
    <View style={s.page} testID="plan-vierge-page">
      <Text style={s.titre} accessibilityRole="header">
        Plan vierge
      </Text>
      <Text style={s.phrase}>
        Tracez les murs coin après coin, ou choisissez une première pièce : vous ajusterez ses cotes au doigt, ou
        tapez-les avec « Sur mesure ».
      </Text>
      {onTracer && (
        <TouchableOpacity
          style={s.tracer}
          accessibilityRole="button"
          accessibilityLabel="Tracer les murs au doigt"
          onPress={onTracer}>
          <Text style={s.tracerTitre}>Tracer les murs au doigt</Text>
          <Text style={s.tracerAide}>Coin après coin, avec l’équerre et les cotes. Touchez le premier coin pour fermer.</Text>
        </TouchableOpacity>
      )}
      <View style={s.grille}>
        <RoomChoice
          modeles={MODELES_DE_PIECE}
          onChoose={(m) => onChoose({ ...m, profondeur: Math.min(m.largeur, m.profondeur) })}
          onCustom={onSurMesure}
          compact
        />
      </View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    page: { flex: 1, alignSelf: 'stretch', paddingHorizontal: 20, paddingTop: 4, justifyContent: 'center' },
    titre: {
      color: c.ink,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '800',
      letterSpacing: -0.7,
      textAlign: 'center',
      marginTop: 6,
    },
    phrase: {
      color: c.inkSoft,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 14,
      paddingHorizontal: 6,
    },
    grille: { alignSelf: 'stretch' },
    tracer: {
      alignSelf: 'stretch',
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: c.blue,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 14,
      justifyContent: 'center',
    },
    tracerTitre: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
    tracerAide: { color: '#FFFFFF', opacity: 0.88, fontSize: 13, textAlign: 'center', marginTop: 2 },
  }),
);
