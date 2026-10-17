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
import { DEBORD_COTE, DEBORD_DOIGT } from '../ui/bandeau';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SOLAIRES } from '../ui/solaires';
import { CarteDuMenu, IconeBandeau } from './StripBar';
import { frCategory } from '../geometry/furniture';
import { catalogItem } from '../geometry/catalogue';
import type { PromptData } from './Sheet';
import type { VerdictDePassage } from '../geometry/passage';
import type { Palette } from '../theme';

import type { ObjectData } from 'react-native-room-scan';
import { lireMetres } from '../ui/saisieCote';

const fr2 = (v: number) => v.toFixed(2).replace('.', ',');

/**
 * CE QUE LE BANDEAU PREND EN HAUTEUR, ET IL L'ANNONCE LUI-MÊME.
 *
 * Relevé du patron : « fais en sorte qu'il soit pas sur un autre élément ».
 * L'écran gardait un nombre écrit à la main — 132 points — pour savoir où NE
 * PAS poser le menu d'un mur. Le bandeau en faisait deux cent dix-sept : la
 * réserve mentait de quatre-vingts points, et tout ce qu'on plaçait « juste
 * au-dessus » atterrissait dessus.
 *
 * C'est la leçon du peigne « Afficher », qui a rencontré le même mur et l'a
 * réglée de la même façon : **celui qui dessine annonce son encombrement,
 * l'écran ne le devine plus**. Un nombre écrit ailleurs dérive au premier
 * changement de pastille ou de police.
 *
 * TROIS RANGÉES : le titre et ses deux gestes (une pastille et son mot
 * dessous), les quatre flèches, les quatre cotes. Plus les interlignes et les
 * marges de la carte. On MAJORE légèrement — une majoration coûte un peu de
 * plan réservé pour rien, une minoration coûte un bandeau posé sur un menu.
 */
const RANGEE_TITRE = 34 + 12;
/** Les flèches, plus les six points que le filet prend au-dessus d'elles. */
const RANGEE_FLECHES = 34 + 6;
const RANGEE_COTES = 34;
/** L'interligne de la carte (son `gap`). */
const INTERLIGNE = 7;
const MARGES_CARTE = 7 + 9;

/**
 * CE QU'IL PREND D'ORDINAIRE : trois rangées.
 *
 * C'est ce que le patron verra sur son téléphone — cent cinquante points au
 * lieu de deux cent dix-sept, un tiers de moins.
 */
export const HAUTEUR_BANDEAU_MEUBLE_COURANTE =
  RANGEE_TITRE + RANGEE_FLECHES + RANGEE_COTES + 2 * INTERLIGNE + MARGES_CARTE;

/**
 * ET CE QU'IL PEUT PRENDRE AU PIRE — c'est CE nombre que l'écran réserve.
 *
 * Les quatre cotes tiennent sur une rangée sur un iPhone courant ; sur un
 * petit modèle, elles passent à la ligne (`flexWrap`) — deux et deux, plutôt
 * qu'une pastille rognée, et c'est toujours la cote qu'on vient lire.
 *
 * ON DÉCLARE DONC LE PIRE, et pas l'ordinaire. C'est exactement le défaut
 * qu'on vient de corriger, pris à l'envers : une réserve trop courte laisse
 * poser un menu SUR le bandeau. Une réserve un peu large coûte quelques
 * points de plan gardés pour rien sur les grands écrans ; l'autre erreur
 * coûte deux éléments l'un sur l'autre. Elles ne se valent pas.
 */
export const HAUTEUR_BANDEAU_MEUBLE =
  HAUTEUR_BANDEAU_MEUBLE_COURANTE + RANGEE_COTES + INTERLIGNE;

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

export function useRepetition(action: () => void) {
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
      // Ce que le dessin rend à la carte, le débord le rend au doigt.
      hitSlop={DEBORD_DOIGT}
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

/**
 * Ce que la puce « Ça passe ? » écrit : l'alerte telle quelle, et le oui
 * avec sa coche et son compte — « ✓ Passe par les 2 portes ».
 */
export function texteDePassage(v: VerdictDePassage): string {
  if (!v.ok) return v.court;
  if (v.portes && v.portes > 0) {
    return v.portes === 1 ? '✓ Passe par la porte' : `✓ Passe par les ${v.portes} portes`;
  }
  return `✓ ${v.court}`;
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
  onPlacer,
  onDupliquer,
  passage,
  sol,
  onCaler,
  bloque,
  onPassage,
  teinte,
  onTeinte,
  onMeridienne,
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
  /**
   * LA MÉRIDIENNE D'UN CANAPÉ D'ANGLE, À GAUCHE OU À DROITE — revue
   * « Yasmine » : elle était toujours à droite.
   */
  onMeridienne?: { cote: 'gauche' | 'droite'; basculer: () => void };
  /**
   * PLACER AU CENTIMÈTRE — « le lit à quarante centimètres du mur ». Les
   * flèches avancent d'un centimètre, et il fallait en compter quarante.
   */
  onPlacer?: () => void;
  /** Un meuble de plus, le même : les chaises d'une table, deux chevets. */
  onDupliquer?: () => void;
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
  /**
   * « ÇA PASSE ? » — relevé du patron, point 6 de la réflexion « grand
   * public » : le meuble passe-t-il les portes jusqu'à sa pièce ? Le verdict
   * court se lit sur la barre ; l'appui donne l'explication (`onPassage`).
   */
  passage?: VerdictDePassage | null;
  /**
   * LE MEUBLE PEUT SE CALER DANS SA NICHE — relevé du patron : « mon frigo
   * ne veut pas se caler dans son coin, entre trois murs ». Une puce, là où
   * l'on prévient : elle n'apparaît que si le calage change quelque chose.
   */
  onCaler?: () => void;
  /**
   * LE NIVEAU DU SOL DU PLAN, dans le repère du scan (voir `solDesMurs`).
   * RoomPlan ne met pas le sol à zéro : sans lui, un frigo posé par terre se
   * lisait « posé à −0,85 m ».
   */
  sol?: number;
  /** Le meuble heurte le battant d'une porte : la phrase qui le dit. */
  bloque?: string | null;
  onPassage?: () => void;
  /**
   * LA COULEUR DU MEUBLE EN 3D — relevé du patron, point 9 de la réflexion
   * « grand public ». Une pastille à côté de son nom : sa teinte, ou des
   * hachures quand il est d'origine. L'appui ouvre le nuancier.
   */
  teinte?: string | null;
  onTeinte?: () => void;
}) {
  /** Le dessous du meuble, au-dessus du sol. */
  const pose = object.transform[13] - object.height / 2 - (sol ?? 0);

  /**
   * Une cote qu'on touche : elle ouvre la feuille, qui suit le clavier.
   *
   * LE MOT EST DANS LA PASTILLE, PAS À CÔTÉ — c'est ce qui fait tenir les
   * quatre cotes sur une seule rangée. « H » et « Pose » vivaient en `Text`
   * séparés : chacun coûtait sa largeur, deux interlignes et un point
   * d'alignement, pour une lettre. Dedans, ils ne coûtent que leur encre —
   * et le chiffre reste ce qu'on lit, gras et sombre, le mot en retrait.
   */
  const champ = (
    titre: string,
    valeur: number,
    poser: (v: number) => void,
    unite?: string,
    sous?: string,
    /** Une hauteur de pose peut valoir zéro — une largeur, jamais. */
    depuisZero?: boolean,
    /** Le mot qui rattache le chiffre, écrit DANS la pastille. */
    mot?: string,
  ) => (
    <TouchableOpacity
      hitSlop={DEBORD_COTE}
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
            const v = metresSaisis(t);
            if (v >= (depuisZero ? 0 : 0.05) && v < 12) poser(v);
          },
        })
      }>
      {mot ? <Text style={styles.clMot}>{mot}</Text> : null}
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

  /** Une pastille de geste : la poignée, et son mot en retrait dessous. */
  const geste = (
    label: string,
    mot: string,
    d: string,
    teinte: string,
    onPress: () => void,
  ) => (
    <View style={styles.bandeauCellule}>
      <TouchableOpacity
        style={styles.iconBtn}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityLabel={label}
        onPress={onPress}>
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path d={d} fill={teinte} fillRule="evenodd" />
        </Svg>
      </TouchableOpacity>
      {/* Le mot sous la pastille : voir `bandeauMot`. Il reste — un bouton
          muet se touche pour savoir, et c'est un relevé du patron. */}
      <Text style={styles.bandeauMot}>{mot}</Text>
    </View>
  );

  return (
    <CarteDuMenu style={styles.bandeau}>
      {/*
        TROIS RANGÉES, ET RIEN N'EST PARTI — relevé du patron : « réduis le
        bloc d'édition de meuble comme tu peux intelligemment, il prend trop
        de place. Fais en sorte qu'il soit pas sur un autre élément. »

        Il en faisait CINQ : le nom seul sur sa ligne, les flèches, « H » et
        « Pose », largeur × profondeur, puis « Pivoter » et « Retirer ». Deux
        cent dix-sept points sur un écran qui en fait huit cents — plus du
        quart de la page pour régler un meuble, posé par-dessus le plan qu'on
        est en train de regarder.

        DEUX FUSIONS, ET AUCUN RÉGLAGE PERDU :

          — les GESTES montent dans la ligne du titre, à droite. Cette ligne
            ne portait qu'un mot et gardait toute sa hauteur pour lui ;
          — les QUATRE COTES tiennent sur une rangée, chacune avec son mot À
            L'INTÉRIEUR de sa pastille. « H » et « Pose » posés à côté
            coûtaient chacun une largeur et deux marges pour une lettre.

        Ce qu'on peut faire n'a pas changé d'un bouton : réduire un bandeau
        en lui retirant des réglages, ce n'est pas le réduire, c'est
        l'amputer.
      */}
      <View style={styles.bandeauEntete}>
        <IconeBandeau icone={SOLAIRES.meubles} styles={styles} />
        <View style={styles.bandeauTexte}>
          <Text style={styles.bandeauTitre} numberOfLines={1}>
            {/* Son nom du catalogue — « Meuble TV », pas « Rangement » (revue « Théo »). */}
            {object.nom || (object.modele && catalogItem(object.modele)?.label) || frCategory(object.category)}
          </Text>
        </View>
        {onTeinte && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Couleur du meuble"
            hitSlop={10}
            style={[local.teinte, { backgroundColor: teinte ?? palette.surface, borderColor: palette.lineStrong }]}
            onPress={onTeinte}>
            {!teinte && (
              <Svg width={22} height={22} viewBox="0 0 22 22">
                <Path d="M2 20 L20 2 M-2 12 L12 -2 M8 24 L24 8" stroke={palette.inkFaint} strokeWidth={1.4} />
              </Svg>
            )}
          </TouchableOpacity>
        )}
        {/* Les deux gestes, poussés à droite : le nom prend la place qui
            reste, et les pastilles restent où l'œil les cherche. */}
        <View style={styles.bandeauGestes}>
          {onPlacer &&
            geste('Placer au centimètre', 'Placer', SOLAIRES.metre, palette.blue, onPlacer)}
          {onDupliquer &&
            geste('Dupliquer le meuble', 'Dupliquer', SOLAIRES.dupliquer, palette.blue, onDupliquer)}
          {geste('Pivoter', 'Pivoter', SOLAIRES.pivoter, palette.blue, onRotate)}
          {onMeridienne &&
            geste(
              onMeridienne.cote === 'droite' ? 'Méridienne à gauche' : 'Méridienne à droite',
              onMeridienne.cote === 'droite' ? 'À gauche' : 'À droite',
              onMeridienne.cote === 'droite' ? SOLAIRES.flecheGauche : SOLAIRES.flecheDroite,
              palette.blue,
              onMeridienne.basculer,
            )}
          {/*
            « RETIRER », pas « Annuler » — le mot dit ce que le geste fait.
            La croix rouge ne défait pas une saisie : elle enlève le meuble du
            plan. Et c'est la POUBELLE, comme partout ailleurs — relevé du
            patron : « la poubelle partout où il y a la poubelle ».
          */}
          {geste(
            'Retirer le meuble',
            'Retirer',
            SOLAIRES.supprimer,
            palette.danger,
            onCancel,
          )}
        </View>
      </View>
      {/*
        « ÇA PASSE » — relevé du patron : « l'info “passe par les portes” n'est
        pas importante ; elle l'est si un meuble ne passe PAS ». La revue des
        « découvreurs » avait rajouté un « ✓ Passe par les portes » vert ; le
        patron l'a retiré (« enlève le “rentre” lors de la sélection d'un
        meuble ») : seule l'alerte s'affiche.
      */}
      {((passage && !passage.ok) || bloque || onCaler) && (
        <View style={[local.verdicts, styles.bandeauFilet]}>
          {passage && !passage.ok && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Ça passe ?"
              accessibilityHint={texteDePassage(passage)}
              hitSlop={6}
              style={[local.puce, { backgroundColor: `${passage.ok ? palette.green : palette.amber}1F` }]}
              onPress={onPassage}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path d={SOLAIRES.ouvertures} fill={passage.ok ? palette.green : palette.amber} fillRule="evenodd" />
              </Svg>
              <Text style={[local.puceTexte, { color: palette.ink }]} numberOfLines={1}>
                {texteDePassage(passage)}
              </Text>
            </TouchableOpacity>
          )}
          {onCaler ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Caler dans sa niche"
              hitSlop={6}
              style={[local.puce, { backgroundColor: `${palette.blue}1F` }]}
              onPress={onCaler}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path d={SOLAIRES.centrer} fill={palette.blue} fillRule="evenodd" />
              </Svg>
              <Text style={[local.puceTexte, { color: palette.ink }]} numberOfLines={1}>
                Caler dans sa niche
              </Text>
            </TouchableOpacity>
          ) : null}
          {bloque ? (
            <Text style={[local.bloque, { color: palette.dangerTexte }]} numberOfLines={1}>
              {bloque}
            </Text>
          ) : null}
        </View>
      )}
      {onNudge && (
        /* Le filet passe ICI : au-dessus de ce qui règle, sous ce qui nomme.
           Voir `bandeauFilet`. */
        <View style={[styles.nudgeRow, styles.bandeauFilet]}>
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
        LES QUATRE COTES SUR UNE SEULE RANGÉE.

        Elles tenaient sur deux, parce que « quatre pastilles et trois boutons
        ne tiennent pas dans la largeur d'un iPhone » — et c'était vrai tant
        que les boutons partageaient la ligne. Ils sont montés ; la place
        s'est libérée. La rangée PASSE À LA LIGNE si l'écran est trop étroit
        (`flexWrap`) : sur un petit modèle, deux rangées de deux valent mieux
        qu'une pastille rognée, et c'est toujours la cote qu'on vient lire.
      */}
      <View style={styles.editRow}>
        {champ(
          'Largeur',
          object.width,
          (v) => onResize(v, object.depth),
          undefined,
          undefined,
          undefined,
          'L',
        )}
        {champ(
          'Profondeur',
          object.depth,
          (v) => onResize(object.width, v),
          undefined,
          undefined,
          undefined,
          'P',
        )}
        {onHeight && (
          <>
            {champ(
              'Hauteur du meuble',
              object.height,
              (v) => onHeight(v, undefined),
              undefined,
              `${frCategory(object.category)} — du dessous au dessus.`,
              undefined,
              'H',
            )}
            {champ(
              'Hauteur de pose',
              pose,
              (v) => onHeight(undefined, v),
              'm',
              'Hauteur du DESSOUS au-dessus du sol. Zéro pour un meuble posé par terre.',
              true,
              'Pose',
            )}
          </>
        )}
      </View>
    </CarteDuMenu>
  );

}

const local = StyleSheet.create({
  verdicts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
  puce: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    maxWidth: '100%',
  },
  puceTexte: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  bloque: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  teinte: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
});

/**
 * UNE COTE TAPÉE, EN MÈTRES — ou en centimètres, quand elle ne peut être
 * qu'en centimètres. Revue « Marie » : « 160 » pour son lit fermait la
 * feuille sans rien changer ; aucun meuble ne fait douze mètres, un nombre
 * de 12 à 1 200 est donc une cote en centimètres.
 */
export function metresSaisis(t: string): number {
  // « 1m60 », « 160 cm » : la lecture commune (revue « Bernard »).
  const v = lireMetres(t) ?? NaN;
  if (!Number.isFinite(v)) return NaN;
  return v >= 12 && v < 1200 ? v / 100 : v;
}
