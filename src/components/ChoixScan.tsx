/**
 * LE CHOIX DE FIN DE SCAN — relevé du patron : « à la fin du scan il doit
 * demander si on veut intégrer les éléments électriques détectés, et les
 * meubles. On coche nos choix et on valide. Pop-up dans l'esprit de l'app,
 * moderne. »
 *
 * Les MOTS sont pesés, parce que la vérité technique l'exige : RoomPlan
 * DÉTECTE les meubles — une prise fait trois centimètres, son modèle LiDAR
 * ne la voit pas. L'électricité est donc PROPOSÉE : l'implantation
 * NF C 15-100 complète (socles, RJ45, commandes, points lumineux), posée
 * hors meubles et hors menuiseries par le même moteur que « Normes auto ».
 * Écrire « détectée » serait mentir, et un plan qui ment est pire qu'un
 * plan incomplet.
 *
 * Tout est coché d'office : intégrer est le cas nominal, décocher est le
 * geste rare — et le popup ne revient jamais : un choix de fin de scan se
 * fait une fois.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SheetShell } from './Sheet';
import { SOLAIRES } from '../ui/solaires';
import { radius, themedStyles, useTheme, type Palette } from '../theme';
import { haptic } from '../ui/haptic';

export interface ChoixDuScan {
  meubles: boolean;
  elec: boolean;
}

function Coche({ pleine, teinte }: { pleine: boolean; teinte: Palette }) {
  const habit = pleine
    ? { borderColor: teinte.blue, backgroundColor: teinte.blue }
    : { borderColor: teinte.lineStrong, backgroundColor: 'transparent' };
  return (
    <View style={[stylesCoche.rond, habit]}>
      {pleine && (
        <Svg width={13} height={13} viewBox="0 0 24 24">
          <Path
            d="M4.5 12.5 l5 5 L19.5 7"
            stroke="#FFFFFF"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}

const stylesCoche = StyleSheet.create({
  rond: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export function ChoixScan({
  visible,
  meubles,
  posesViseur = 0,
  onValider,
  onClose,
}: {
  visible: boolean;
  /** Meubles reconnus pendant le scan : 0 = la ligne ne paraît pas. */
  meubles: number;
  /**
   * Appareils posés au viseur PENDANT le relevé. Ils sont déjà dans le
   * plan : la ligne le dit, pour qu'on ne croie pas devoir cocher
   * l'électricité pour les garder.
   */
  posesViseur?: number;
  onValider: (choix: ChoixDuScan) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = getStyles(c);
  /*
    LES MEUBLES SONT COCHÉS, L'ÉLECTRICITÉ NE L'EST PLUS.

    Relevé du patron : « l'app n'est pas destinée de base qu'aux
    électriciens (...) comment faire comprendre à l'utilisateur que ce n'est
    pas que pour les élec mais aussi pour modéliser son appartement et
    placer des meubles pour se projeter ».

    Les deux cases arrivaient cochées, et c'est ici que l'application se
    présentait : TOUT relevé revenait couvert de socles, de RJ45, de
    commandes et de points lumineux — y compris celui de quelqu'un venu
    voir son salon en 3D. À la minute la plus décisive de l'app, la
    première où l'on voit son plan, elle annonçait un métier au lieu d'un
    logement.

    Les meubles, eux, restent cochés : ils ont été DÉTECTÉS pendant le
    relevé, ils sont ce qu'on est allé chercher, et les décocher revient à
    jeter du travail déjà fait. L'électricité est PROPOSÉE : elle ajoute au
    plan ce que personne n'a demandé, et une proposition se coche.

    Ce n'est pas un retrait du métier — la ligne reste là, en tête de liste,
    la norme écrite en toutes lettres, à UN appui. On la propose, on ne
    l'impose plus.
  */
  const [choix, setChoix] = useState<ChoixDuScan>({ meubles: true, elec: false });

  const bascule = (cle: keyof ChoixDuScan) => {
    haptic('leger');
    setChoix((v) => ({ ...v, [cle]: !v[cle] }));
  };

  const lignes: {
    cle: keyof ChoixDuScan;
    icone: string;
    titre: string;
    detail: string;
  }[] = [
    ...(meubles > 0
      ? [
          {
            cle: 'meubles' as const,
            icone: SOLAIRES.furniture,
            titre: `${meubles} meuble${meubles > 1 ? 's' : ''} détecté${
              meubles > 1 ? 's' : ''
            }`,
            detail:
              'Reconnus pendant le scan, à leur place et à leurs cotes.',
          },
        ]
      : []),
    {
      cle: 'elec' as const,
      icone: SOLAIRES.elec,
      /*
        CE QU'ON A POSÉ AU VISEUR EST DÉJÀ LÀ.

        Relevé du chantier : « je voulais avoir que ce que j'ai ajouté, pas
        le reste ». Décocher cette ligne ne retire donc RIEN de ce qui a été
        visé pendant le relevé — elle ne commande que le COMPLÉMENT aux
        normes. Le titre le dit, sinon on décoche en croyant tout perdre.
      */
      titre:
        posesViseur > 0
          ? 'Compléter aux normes'
          : 'Électricité proposée aux normes',
      detail:
        posesViseur > 0
          ? `Vos ${posesViseur} appareil${
              posesViseur > 1 ? 's' : ''
            } posé${posesViseur > 1 ? 's' : ''} au viseur sont déjà dans le ` +
            'plan. Cochez pour AJOUTER ce qui manque à la NF C 15-100.'
          : 'Socles, RJ45, commandes et points lumineux selon la NF C 15-100, ' +
            'posés hors meubles. Tout reste déplaçable.',
    },
  ];

  return (
    <SheetShell visible={visible} onClose={onClose}>
      <Text style={styles.titre}>Relevé terminé</Text>
      <Text style={styles.sous}>
        Cochez ce que le plan intègre — le reste ne se pose pas.
      </Text>
      {lignes.map((l) => (
        <TouchableOpacity
          key={l.cle}
          // Le lecteur d'écran entend le VRAI titre (nombre compris), sait
          // que c'est une case, et dans quel état elle est.
          accessibilityLabel={l.titre}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: choix[l.cle] }}
          style={[styles.ligne, choix[l.cle] && styles.ligneCochee]}
          activeOpacity={0.8}
          onPress={() => bascule(l.cle)}>
          <View style={styles.puce}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d={l.icone}
                fill={choix[l.cle] ? c.blue : c.inkFaint}
                fillRule="evenodd"
              />
            </Svg>
          </View>
          <View style={styles.textes}>
            <Text style={styles.ligneTitre}>{l.titre}</Text>
            <Text style={styles.ligneDetail}>{l.detail}</Text>
          </View>
          <Coche pleine={choix[l.cle]} teinte={c} />
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        accessibilityLabel="Intégrer"
        style={styles.valider}
        activeOpacity={0.85}
        onPress={() => {
          haptic('succes');
          onValider(choix);
        }}>
        <Text style={styles.validerTexte}>Intégrer</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}

const getStyles = themedStyles((c: Palette) =>
  StyleSheet.create({
    titre: {
      color: c.ink,
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sous: { color: c.inkFaint, fontSize: 12.5, lineHeight: 17, marginTop: 3 },
    ligne: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginTop: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    /* La ligne cochée se teinte : on voit son choix sans lire les ronds. */
    ligneCochee: { borderColor: c.blue, backgroundColor: c.blueSoft },
    puce: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.surfaceSunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textes: { flex: 1 },
    ligneTitre: { color: c.ink, fontSize: 14.5, fontWeight: '800' },
    ligneDetail: {
      color: c.inkFaint,
      fontSize: 11.5,
      lineHeight: 15,
      marginTop: 2,
    },
    valider: {
      marginTop: 14,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    validerTexte: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
  }),
);
