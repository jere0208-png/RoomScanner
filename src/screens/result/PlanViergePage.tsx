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
 * L'illustration prend la place qui reste : elle rétrécit sur un petit
 * écran plutôt que de faire défiler la page.
 */
import React from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoomChoice, type RoomModel } from '../../components/RoomChoice';
import { themedStyles, useTheme, type Palette } from '../../theme';
import { MODELES_DE_PIECE } from './AddRoomSheet';

const MAISON = require('../../../assets/illustrations/maison-verre.png');
/** Rapport largeur / hauteur de l'illustration détourée. */
const RAPPORT = 600 / 489;

/*
  CE QUE LE RESTE DE LA PAGE OCCUPE, en points : la barre du haut, le titre et
  sa phrase, la grille de neuf vignettes (trois rangées) et les marges. Ce
  qui reste revient à l'illustration, entre 84 et 210 points de haut.
*/
const HORS_ILLUSTRATION = 56 + 92 + 3 * 112 + 2 * 10 + 40;

export function hauteurDeLIllustration(hauteurEcran: number, marges: number): number {
  return Math.max(84, Math.min(210, hauteurEcran - marges - HORS_ILLUSTRATION));
}

export function PlanViergePage({
  onChoose,
  onSurMesure,
}: {
  onChoose: (m: RoomModel) => void;
  onSurMesure: () => void;
}) {
  const c = useTheme();
  const s = getStyles(c);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const h = hauteurDeLIllustration(height, insets.top + insets.bottom);
  return (
    <View style={s.page} testID="plan-vierge-page">
      <Image
        source={MAISON}
        style={{ height: h, width: h * RAPPORT, alignSelf: 'center' }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <Text style={s.titre} accessibilityRole="header">
        Plan vierge
      </Text>
      <Text style={s.phrase}>
        Choisissez une première pièce : vous ajusterez ses cotes au doigt, ou tapez-les avec « Sur mesure ».
      </Text>
      <View style={s.grille}>
        <RoomChoice
          modeles={MODELES_DE_PIECE}
          onChoose={(m) => onChoose({ ...m, profondeur: Math.min(m.largeur, m.profondeur) })}
          onCustom={onSurMesure}
        />
      </View>
    </View>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    page: { flex: 1, paddingHorizontal: 20, paddingTop: 4, justifyContent: 'center' },
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
  }),
);
