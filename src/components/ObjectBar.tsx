/**
 * LE BANDEAU D'UN MEUBLE — sa largeur, sa profondeur, et trois gestes.
 *
 * Les deux cotes se tapaient dans des champs posés au bas de l'écran, exactement
 * là où le clavier vient se mettre : on tapait à l'aveugle, sans voir ni le
 * champ, ni le meuble, ni la validation. Ce sont maintenant deux pastilles
 * qu'on touche — la feuille de saisie, elle, monte AVEC le clavier.
 *
 * C'est le même remède qu'au plafond, pour la même raison ; il n'y a aucune
 * raison qu'un meuble se règle autrement qu'un point lumineux.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { frCategory } from '../geometry/furniture';
import type { PromptData } from './Sheet';
import type { Palette } from '../theme';

import type { ObjectData } from 'react-native-room-scan';

const fr2 = (v: number) => v.toFixed(2).replace('.', ',');

/**
 * TENIR LA FLÈCHE, C'EST CONTINUER — de plus en plus vite.
 *
 * Un pas par appui : décaler un meuble de vingt centimètres demandait vingt
 * appuis. On tient donc la flèche, et le meuble avance tout seul.
 *
 * La cadence part LENTEMENT et accélère : au premier dixième de seconde on
 * vise encore le centimètre — c'est le geste de précision, celui pour lequel
 * les flèches existent — puis, quand il devient clair qu'on veut traverser
 * la pièce, elle monte jusqu'à dix pas par seconde. Sans cette montée, il
 * faut choisir entre un réglage fin impossible et une traversée interminable.
 *
 * Le délai avant la première répétition (`ATTENTE`) est ce qui distingue un
 * appui d'un maintien : sans lui, un simple tapotement partirait en course.
 */
const ATTENTE = 420;
const CADENCE_LENTE = 260;
/** Dix pas par seconde : la pleine vitesse. */
const CADENCE_VIVE = 100;
/** Temps de montée en régime, une fois la répétition lancée. */
const MONTEE = 1400;

function useRepetition(action: () => void) {
  const horloge = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vivant = useRef(action);
  vivant.current = action;
  const arreter = useCallback(() => {
    if (horloge.current) clearTimeout(horloge.current);
    horloge.current = null;
  }, []);
  // Un doigt qui quitte l'écran pendant que la fiche se ferme laisserait
  // l'horloge tourner sur un meuble qui n'est plus là.
  useEffect(() => arreter, [arreter]);
  const demarrer = useCallback(() => {
    arreter();
    vivant.current();
    const debut = Date.now();
    const prochain = (attente: number) => {
      horloge.current = setTimeout(() => {
        vivant.current();
        const passe = Date.now() - debut - ATTENTE;
        const t = Math.max(0, Math.min(1, passe / MONTEE));
        prochain(CADENCE_LENTE + (CADENCE_VIVE - CADENCE_LENTE) * t);
      }, attente);
    };
    prochain(ATTENTE);
  }, [arreter]);
  return { demarrer, arreter };
}

/** Une flèche qui répète tant qu'on la tient. */
function Fleche({
  nom,
  d,
  couleur,
  style,
  onPas,
}: {
  nom: string;
  d: string;
  couleur: string;
  style: object;
  onPas: () => void;
}) {
  const { demarrer, arreter } = useRepetition(onPas);
  return (
    <TouchableOpacity
      style={style}
      accessibilityLabel={nom}
      // Le pas part à l'APPUI, pas au relâchement : sans quoi le premier
      // centimètre attendrait que le doigt se lève.
      onPressIn={demarrer}
      onPressOut={arreter}>
      <Svg width={17} height={17} viewBox="0 0 24 24">
        <Path
          d={d}
          stroke={couleur}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </TouchableOpacity>
  );
}

export function ObjectBar({
  object,
  styles,
  palette,
  onPrompt,
  onResize,
  onHeight,
  onRotate,
  onCancel,
  onDone,
  onNudge,
}: {
  object: ObjectData;
  /** Les styles de l'écran : le bandeau partage ceux des autres barres. */
  styles: Record<string, object>;
  palette: Palette;
  onPrompt: (p: PromptData) => void;
  onResize: (width: number, depth: number) => void;
  /**
   * LA TROISIÈME COTE, et la hauteur à laquelle elle commence.
   *
   * Deux réglages plutôt qu'un : la hauteur du meuble, et celle de son
   * dessous au-dessus du sol. Omettre l'un le laisse tel quel — on ne
   * remonte pas un meuble haut de cuisine en le rendant plus grand.
   */
  onHeight?: (height?: number, base?: number) => void;
  onRotate: () => void;
  onCancel: () => void;
  onDone: () => void;
  /**
   * LE DÉPLACEMENT AU CENTIMÈTRE, À LA FLÈCHE.
   *
   * Le doigt déplace un meuble de trois centimètres quand on en voulait un :
   * il cache ce qu'il pousse, et un écran de téléphone ne rend pas le
   * millimètre. Quatre flèches font ce que le doigt ne sait pas faire — et
   * elles poussent DANS L'AXE DE L'ÉCRAN, pas dans celui du plan : c'est la
   * direction qu'on voit, pas celle du repère du scan.
   */
  onNudge?: (dx: number, dz: number) => void;
}) {
  /** Le dessous du meuble, au-dessus du sol. */
  const pose = object.transform[13] - object.height / 2;

  /** Une cote qu'on touche : elle ouvre la feuille, qui suit le clavier. */
  const champ = (
    titre: string,
    valeur: number,
    poser: (v: number) => void,
    unite?: string,
    sous?: string,
    /** Une hauteur de pose peut valoir zéro — une largeur, jamais. */
    depuisZero?: boolean,
  ) => (
    <TouchableOpacity
      style={styles.clChamp}
      accessibilityLabel={titre}
      onPress={() =>
        onPrompt({
          title: titre,
          subtitle:
            sous ?? `${frCategory(object.category)} — la cote se prend au sol.`,
          value: fr2(valeur),
          unit: 'm',
          numeric: true,
          okLabel: 'Appliquer',
          onSubmit: (t) => {
            const v = parseFloat(t.replace(',', '.'));
            if (v >= (depuisZero ? 0 : 0.05) && v < 12) poser(v);
          },
        })
      }>
      <Text style={styles.clValeur} numberOfLines={1}>
        {fr2(valeur)}
      </Text>
      {unite ? <Text style={styles.unit}>{unite}</Text> : null}
    </TouchableOpacity>
  );

  /** Une flèche : un centimètre par pas, dans l'axe de l'écran. */
  const fleche = (nom: string, dx: number, dy: number, d: string) => (
    <Fleche
      key={nom}
      nom={nom}
      d={d}
      couleur={palette.ink}
      style={styles.nudgeBtn}
      onPas={() => onNudge?.(dx, dy)}
    />
  );

  return (
    <View style={styles.editBar}>
      {onNudge && (
        <View style={styles.nudgeRow}>
          {fleche('Déplacer vers le haut', 0, -1, 'M12 19 V6 M6 12 L12 6 L18 12')}
          {fleche('Déplacer vers la gauche', -1, 0, 'M19 12 H6 M12 6 L6 12 L12 18')}
          {fleche('Déplacer vers la droite', 1, 0, 'M5 12 H18 M12 6 L18 12 L12 18')}
          {fleche('Déplacer vers le bas', 0, 1, 'M12 5 V18 M6 12 L12 18 L18 12')}
          {/* Ce que fait le geste, en trois mots : sans cette note, le
              maintien ne se découvre que par hasard. */}
          <Text style={styles.nudgeNote}>1 cm · maintenir</Text>
        </View>
      )}
      {/*
        LA TROISIÈME COTE SUR SA PROPRE LIGNE.

        Quatre pastilles et trois boutons ne tiennent pas dans la largeur
        d'un iPhone : la dernière se serait écrasée, et c'est toujours celle
        qu'on vient lire. La hauteur et la pose vont donc au-dessus, avec
        leur mot devant — « H », « Pose » — parce qu'un chiffre nu de plus
        dans une rangée de chiffres ne se rattache à rien.
      */}
      {onHeight && (
        <View style={styles.editRow}>
          <Text style={styles.nudgeNote}>H</Text>
          {champ(
            'Hauteur du meuble',
            object.height,
            (v) => onHeight(v, undefined),
            'm',
            `${frCategory(object.category)} — du dessous au dessus.`,
          )}
          <Text style={styles.nudgeNote}>Pose</Text>
          {champ(
            'Hauteur de pose',
            pose,
            (v) => onHeight(undefined, v),
            'm',
            'Hauteur du DESSOUS au-dessus du sol. Zéro pour un meuble posé par terre.',
            true,
          )}
        </View>
      )}
      <View style={styles.editRow}>
        {champ('Largeur', object.width, (v) => onResize(v, object.depth))}
        <Text style={styles.unit}>×</Text>
        {/* L'unité tient DANS la pastille : posée à côté, elle coûtait sa
            propre largeur plus deux marges, pour une lettre. */}
        {champ('Profondeur', object.depth, (v) => onResize(object.width, v), 'm')}
        <View style={styles.editIcons}>
          <TouchableOpacity
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Pivoter"
            onPress={onRotate}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d="M19.5 12 a7.5 7.5 0 1 1 -2.2 -5.3"
                stroke={palette.ink}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d="M19.8 3.8 v4.4 h-4.4"
                stroke={palette.ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Annuler"
            onPress={onCancel}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              {['M6.5 6.5 L17.5 17.5', 'M17.5 6.5 L6.5 17.5'].map((d) => (
                <Path
                  key={d}
                  d={d}
                  stroke={palette.danger}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtnOk}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Valider"
            onPress={onDone}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <Path
                d="M5 12.5 L10 17.5 L19 6.5"
                stroke="#FFFFFF"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
