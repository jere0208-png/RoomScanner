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
import { DEBORD_DOIGT } from '../ui/bandeau';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { IconeBandeau } from './StripBar';
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
      {/* UNE SILHOUETTE, PAS UN TRAIT. Les quatre flèches étaient tracées
          à la main, au trait, dans une application qui ne dessine qu'en
          plein — c'est le même défaut que la rangée d'outils avait déjà
          corrigé : « posés sous une rangée de pleins, ils se lisaient comme
          des traits de construction plutôt que comme des boutons ». Le jeu
          commun a ces quatre flèches dans leur carré. */}
      <Svg width={17} height={17} viewBox="0 0 24 24">
        <Path d={d} fill={couleur} fillRule="evenodd" />
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
      hitSlop={DEBORD_DOIGT}
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
    <View style={styles.bandeau}>
      {/*
        EN HAUT CE QU'ON LIT ET CE QU'ON RÈGLE, EN BAS LES GESTES.

        Trois rangées se partageaient une carte sans en-tête : on réglait
        une largeur sans savoir de quel meuble. Le nom vient donc en tête,
        les cotes dessous, et les gestes — pivoter, retirer — descendent dans
        la rangée d'actions commune à tous les bandeaux du bas.
      */}
      <View style={styles.bandeauEntete}>
        <IconeBandeau icone={SOLAIRES.meubles} styles={styles} />
        <View style={styles.bandeauTexte}>
          <Text style={styles.bandeauTitre} numberOfLines={1}>
            {frCategory(object.category)}
          </Text>
        </View>
      </View>
      {onNudge && (
        <View style={styles.nudgeRow}>
          {fleche('Déplacer vers le haut', 0, -1, SOLAIRES.flecheHaut)}
          {fleche('Déplacer vers la gauche', -1, 0, SOLAIRES.flecheGauche)}
          {fleche('Déplacer vers la droite', 1, 0, SOLAIRES.flecheDroite)}
          {fleche('Déplacer vers le bas', 0, 1, SOLAIRES.flecheBas)}
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
      </View>
      <View style={styles.bandeauActions}>
          <View style={styles.bandeauCellule}>
          <TouchableOpacity
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Pivoter"
            onPress={onRotate}>
            {/* LA FLÈCHE D'UN QUART DE TOUR, du jeu commun. Elle était
                tracée à la main — un arc et sa pointe — et en encre, quand
                toutes ses voisines de bandeau sont bleues. */}
            <Svg width={17} height={17} viewBox="0 0 24 24">
              <Path d={SOLAIRES.pivoter} fill={palette.blue} fillRule="evenodd" />
            </Svg>
          </TouchableOpacity>
            {/* Le mot sous la pastille : voir `bandeauMot`. */}
            <Text style={styles.bandeauMot}>Pivoter</Text>
          </View>
          <View style={styles.bandeauCellule}>
          <TouchableOpacity
            style={styles.iconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            /*
              « RETIRER », pas « Annuler » — le mot dit ce que le geste fait.

              La croix rouge ne défait pas une saisie : elle enlève le meuble
              du plan. L'étiquette parlée disait « Annuler », le mot écrit
              dessous dit « Retirer » : deux noms pour un bouton, dont un
              faux. C'est le second qui est juste.
            */
            accessibilityLabel="Retirer le meuble"
            onPress={onCancel}>
            {/* LA POUBELLE, comme partout ailleurs — relevé du patron :
                « la poubelle partout où il y a la poubelle ». Une croix
                nue disait « annuler » ; ce bouton-là ENLÈVE le meuble du
                plan, et trois dessins servaient au même geste selon ce
                qu'on avait touché. */}
            <Svg width={17} height={17} viewBox="0 0 24 24">
              <Path
                d={SOLAIRES.supprimer}
                fill={palette.danger}
                fillRule="evenodd"
              />
            </Svg>
          </TouchableOpacity>
            <Text style={styles.bandeauMot}>Retirer</Text>
          </View>
          {/*
            PLUS DE BOUTON « VALIDER » — relevé du patron : « pas de bouton
            valider ».

            Il n'adoptait qu'un meuble déjà posé : ses cotes partaient au
            magasin dès qu'on les tapait, et sa position dès qu'on lâchait le
            doigt. Il ne restait qu'un rituel — une coche à cocher pour dire
            oui à ce qui était déjà fait — et un doute : tant qu'on ne l'avait
            pas touchée, on ne savait pas si le meuble comptait.

            La croix rouge reste, elle : c'est le geste qui RETIRE, et lui
            change quelque chose.
          */}
      </View>
    </View>
  );
}
