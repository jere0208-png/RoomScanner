/**
 * LA RANGÉE DE CALQUES, AU PIED DU PLAN — ET SANS DÉFILEMENT.
 *
 * Relevé du chantier : « évite la possibilité d'un slide, répartis proprement
 * les boutons, et s'il y en a trop pour la ligne du bas, fais-les monter en
 * colonne à droite ».
 *
 * Un rail qui défile ment sur son contenu : rien ne dit qu'il reste deux
 * calques hors champ, et on croit les avoir tous vus. En 3D il y en a jusqu'à
 * neuf — les derniers n'existaient pour ainsi dire pas.
 *
 * Ce composant compte donc ce que la largeur permet, donne à chacun de ceux-là
 * une part ÉGALE de la ligne, et empile le reste à droite, au-dessus de la
 * colonne des actions. Tout se voit d'un coup d'œil, sans un seul geste.
 */
import React, { useEffect } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import {
  MARGE_RANGEE,
  PILL_CELL_H,
  PILL_CELL_W,
  PILL_GAP,
  PILL_PITCH,
  PILL_SIZE,
  PillSlot,
  repartirOutils,
} from './ToolPill';

/** La largeur d'une cellule d'outil : le peigne vise son milieu. */
const CELLULE = PILL_CELL_W;

/*
  LE PEIGNE SE POSE AU RAS DES PASTILLES — relevé du patron : « descends le
  Afficher et ses lignes, les traits doivent presque toucher les boutons ».

  Il flottait vingt points trop haut, et cet espace vide entre l'annotation
  et ce qu'elle annote se lisait comme deux blocs sans rapport. Sa place se
  CALCULE désormais : la hauteur d'une cellule d'outil (la pastille et son
  mot), plus deux points — ce qu'il faut pour ne pas toucher, et rien de
  plus. Un nombre écrit à la main aurait dérivé au premier changement de
  pastille.
*/
const PEIGNE_H = 10;
const PEIGNE_BAS = PILL_CELL_H + 2;
/*
  UNE ANNOTATION, PAS UN CADRE.

  Le trait et le mot se lisent EN RETRAIT — relevé du patron : « donne une
  opacité au texte et aux lignes ». Ce peigne explique la rangée ; il ne
  doit pas se disputer le regard avec elle, ni avec le plan qui est le sujet
  de l'écran.
*/
const TRAIT_PEIGNE = '#B6BECB';
const PEIGNE_OPACITE = 0.55;

export function RangeeOutils({
  elements,
  largeur,
  reserve,
  bas,
  dessus,
  anim,
  styles,
  edition = false,
  onSuite,
}: {
  elements: React.ReactElement[];
  /** Largeur de la carte du plan. */
  largeur: number;
  /** Place tenue à droite par la colonne d'actions (0 s'il n'y en a pas). */
  reserve: number;
  /** Ligne de fond : au-dessus de l'indicateur d'accueil. */
  bas: number;
  /** Hauteur à franchir pour poser le trop-plein au-dessus des actions. */
  dessus: number;
  anim: Animated.Value;
  styles: Record<string, object>;
  /** En édition, chaque bouton fait autre chose : pas de titre commun. */
  edition?: boolean;
  /**
   * La hauteur de la pile de droite, mesurée et rendue à l'écran.
   *
   * Il en a besoin pour poser « Enregistrer » AU-DESSUS d'elle : la pile
   * grandit avec le nombre de calques en trop, et un nombre écrit à la main
   * dériverait au premier bouton ajouté.
   */
  onSuite?: (hauteur: number) => void;
}) {
  // Tant que la carte n'est pas mesurée, on suppose qu'ils tiennent tous :
  // une rangée complète qui se replie à la première image se verrait.
  const tiennent = largeur > 0 ? repartirOutils(elements.length, largeur, reserve) : elements.length;
  const rangee = elements.slice(0, tiennent);
  const colonne = elements.slice(tiennent);
  /*
    PAS DE PILE = UNE PILE DE ZÉRO, ET IL FAUT LE DIRE.

    La hauteur ne se rendait QUE par l'`onLayout` de la pile : sans pile,
    personne ne parlait, et l'écran gardait la dernière hauteur connue —
    celle de la vue d'avant. « Enregistrer », qui se pose au-dessus d'elle,
    flottait alors au milieu du dessin, à hauteur d'une pile qui n'existe
    plus.
  */
  useEffect(() => {
    if (colonne.length === 0) onSuite?.(0);
  }, [colonne.length, onSuite]);
  /*
    LE PEIGNE « AFFICHER » — croquis Paint du patron.

    Rien ne disait ce que ces boutons font. « Meubles », « Appareils »,
    « Surfaces », « Nord » : quatre mots qui NOMMENT une chose sans dire ce
    qu'on en fait — on peut aussi bien croire qu'on va en ajouter un. Ce
    sont des interrupteurs de calque, et le seul geste possible est de les
    allumer ou de les éteindre.

    Le peigne le dit d'un dessin : un mot, une barre, une descente par
    bouton. C'est ainsi qu'on annote un plan, et c'est ce que
    l'électricien lit tous les jours sur ses schémas.

    IL COMPTE SUR LA GRILLE DE LA RANGÉE, PAS SUR UNE VOISINE.

    Relevé du patron : « le Afficher doit se centrer selon les boutons — si
    cinq boutons et rien sur la colonne de droite, on axe aux cinq boutons ;
    s'il y a un bouton sur la colonne, on axe aux boutons de la ligne, sans
    compter le dernier à droite qui possède d'autres boutons au-dessus de
    lui ».

    Il partait du bord du peigne (4) et divisait `largeur − reserve − 4` ;
    la rangée, elle, part de zéro et répartit dans `largeur − reserve` avec
    DIX POINTS DE MARGE de chaque côté (`planTools`). Deux grilles voisines,
    d'accord au milieu et fausses aux bords : huit points d'écart sur la
    dernière descente, soit un cinquième de pastille — le trait ne tombait
    plus sur son bouton. Le peigne prend donc la grille de la rangée, et
    part du même bord qu'elle.
  */
  const bordDroit = reserve || 4;
  /** Le cadre de la rangée : c'est lui qui porte les parts égales. */
  const largeurRangee = Math.max(0, largeur - bordDroit);
  const part =
    rangee.length > 0
      ? Math.max(0, largeurRangee - 2 * MARGE_RANGEE) / rangee.length
      : 0;
  /** Le milieu de la pastille de rang `i` — le même calcul que la rangée. */
  const xPastille = (i: number) => MARGE_RANGEE + part * (i + 0.5);
  const peigne = !edition && rangee.length > 1 && part > 0;
  /*
    LE PEIGNE SE COUCHE SUR LA LIGNE ET SE DRESSE SUR LA PILE — troisième
    version, croquis rouge du patron à l'appui.

    Il s'est d'abord arrêté au dernier outil de la LIGNE : ce qui ne tient
    pas dans la ligne se range à droite, dans la même bande, et se
    retrouvait hors du peigne — annoté par rien, il se lisait comme autre
    chose qu'un calque. On a donc poussé la barre jusqu'à la pile, avec une
    descente de plus. Sur le plan 2D, cette descente est tombée sur
    « Édition » : la colonne de droite y MÉLANGE deux natures — le
    trop-plein de calques par-dessus, les commandes en dessous —, et rien
    dans la barre ne disait où s'arrêter.

    Relevé du patron : « la barre s'arrête au dernier calque de la ligne,
    puis monte en équerre vers les boutons de la colonne qui sont des
    calques ; elle ne doit couvrir ni Édition, ni Enregistrer : ceux-là ne
    montrent ni ne cachent rien ».

    La rangée sait lesquels sont des calques sans qu'on le lui dise : elle
    ne reçoit QUE des calques (les commandes vivent dans leur propre
    colonne, posée par l'écran), et sa pile de trop-plein est donc entière
    à annoter. Ce qu'elle ignorait, c'est OÙ cette pile se tient — et
    `dessus` le lui disait déjà : la hauteur à franchir pour la rejoindre.

    Le peigne y monte donc, et se dresse : une épine le long du bord gauche
    des cellules, une branche par pastille, de la même longueur qu'une
    descente. Même grammaire, tournée d'un quart de tour.
  */
  const largeurPeigne = colonne.length > 0 ? largeur - 4 : largeurRangee;
  /** La pile se tient à quatre points du bord : c'est son axe. */
  const xColonne = largeur - 4 - CELLULE / 2;
  /** L'épine longe le bord gauche des cellules de la pile. */
  const xEpine = xColonne - CELLULE / 2;
  /** La branche s'arrête au ras de la pastille, comme la descente. */
  const xBranche = xColonne - PILL_SIZE / 2 - 2;
  /*
    LA HAUTEUR D'UNE PASTILLE DE LA PILE, au-dessus du bas du peigne.

    Elle se CALCULE — `dessus` pour rejoindre le pied de la pile, un pas par
    rang, et le milieu de la pastille dans sa cellule (le mot est dessous).
    Le rang se compte depuis le bas : la pile se rend de haut en bas, mais
    elle est ancrée par le bas.
  */
  const hauteurPile = (i: number) =>
    dessus +
    PILL_PITCH * (colonne.length - 1 - i) +
    (PILL_CELL_H - PILL_SIZE / 2) -
    PEIGNE_BAS;
  const hauteurs = colonne.map((_, i) => hauteurPile(i));
  /*
    EN 3D, LA PILE COMMENCE SUR LA LIGNE (`dessus` vaut zéro) : sa pastille
    du bas est à hauteur des autres, et se dessert comme elles, par une
    descente. Il n'y a pas de bouton d'édition sous elle pour s'y méprendre.
  */
  const surLaLigne = hauteurs.some((h) => h <= PEIGNE_H - 1);
  const hautes = hauteurs.filter((h) => h > PEIGNE_H - 1);
  const hauteurSvg = Math.max(PEIGNE_H, ...hautes.map((h) => h + 2));
  const yBarre = hauteurSvg - (PEIGNE_H - 1);
  const yPied = hauteurSvg - 1;
  const xFin =
    colonne.length === 0
      ? xPastille(rangee.length - 1)
      : surLaLigne
      ? xColonne
      : xEpine;
  return (
    <>
      {peigne && (
        /*
          IL PART COMME LES PASTILLES — relevé du patron : « donne-lui la
          même animation que les boutons lors du clic sur Édition, il doit
          disparaître sans coupure nette ».

          Il s'éteignait d'un coup pendant que la rangée, elle, se retirait
          en fondu : deux temps pour un seul geste, et l'œil voit le
          raccord. Il boit donc à la MÊME source (`anim`), avec le rang
          zéro — celui des premières pastilles : l'annotation s'en va avec
          ce qu'elle annonce, pas après.
        */
        <Animated.View
          style={[
            styles.peigne,
            {
              bottom: bas + PEIGNE_BAS,
              // Le peigne part du même bord que la ligne ; il s'étend
              // seulement plus loin quand il doit rejoindre la pile.
              right: colonne.length > 0 ? 4 : bordDroit,
              opacity: Animated.multiply(anim, PEIGNE_OPACITE),
            },
          ]}
          pointerEvents="none">
          {/*
            LE MOT RESTE COLLÉ À SA BARRE.

            Il vivait AU-DESSUS du dessin, dans le flux : le jour où le
            dessin s'est mis à monter vers la pile, le mot est monté avec
            lui — une légende à mi-hauteur du plan, loin de ce qu'elle
            légende. Il se pose donc par le bas, deux points au-dessus de
            la barre, et se centre sur la LIGNE seule : c'est elle qu'il
            nomme, la pile n'en est que la suite.
          */}
          <Text
            style={[
              styles.peigneMot,
              // Le cadre de la RANGÉE, pas celui du peigne : le mot s'axe
              // sur les pastilles de la ligne, et la pile de droite — qui
              // porte d'autres boutons au-dessus d'elle — n'entre pas dans
              // le compte.
              { bottom: PEIGNE_H + 2, width: largeurRangee },
            ]}>
            Afficher
          </Text>
          <Svg width={largeurPeigne} height={hauteurSvg}>
            {/* La barre ne court que d'une descente à l'autre : débordante,
                elle ferait un cadre, et l'on annoterait la carte entière. */}
            <Line
              x1={xPastille(0)}
              y1={yBarre}
              x2={xFin}
              y2={yBarre}
              stroke={TRAIT_PEIGNE}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            {rangee.map((el, i) => (
              <Line
                key={el.key}
                x1={xPastille(i)}
                y1={yBarre}
                x2={xPastille(i)}
                y2={yPied}
                stroke={TRAIT_PEIGNE}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            ))}
            {/* La pastille de la pile qui se tient SUR la ligne : une
                descente, comme les autres. */}
            {surLaLigne && (
              <Line
                x1={xColonne}
                y1={yBarre}
                x2={xColonne}
                y2={yPied}
                stroke={TRAIT_PEIGNE}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            )}
            {/* L'ÉQUERRE : l'épine monte de la barre jusqu'au calque le
                plus haut de la pile, et rien au-delà — au-dessus d'elle,
                ce sont les commandes. */}
            {hautes.length > 0 && (
              <Line
                x1={xEpine}
                y1={yBarre}
                x2={xEpine}
                y2={hauteurSvg - Math.max(...hautes)}
                stroke={TRAIT_PEIGNE}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            )}
            {colonne.map((el, i) =>
              hauteurs[i] > PEIGNE_H - 1 ? (
                <Line
                  key={el.key}
                  x1={xEpine}
                  y1={hauteurSvg - hauteurs[i]}
                  x2={xBranche}
                  y2={hauteurSvg - hauteurs[i]}
                  stroke={TRAIT_PEIGNE}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              ) : null,
            )}
          </Svg>
        </Animated.View>
      )}
      <View
        style={[styles.planTools, { bottom: bas, right: reserve || 4 }]}
        pointerEvents="box-none">
        {rangee.map((el, i) => (
          // Chacun sa part de la ligne : les pastilles restent à égale
          // distance quel que soit leur nombre, et le mot dessous garde sa
          // place au centre de sa part.
          <View key={el.key} style={styles.toolPart} pointerEvents="box-none">
            <PillSlot index={i} anim={anim}>
              {el}
            </PillSlot>
          </View>
        ))}
      </View>
      {colonne.length > 0 && (
        <View
          style={[styles.planToolsSuite, { bottom: bas + dessus }]}
          onLayout={(e) => onSuite?.(e.nativeEvent.layout.height)}
          pointerEvents="box-none">
          {colonne.map((el, i) => (
            <PillSlot key={el.key} index={rangee.length + i} anim={anim}>
              {el}
            </PillSlot>
          ))}
        </View>
      )}
    </>
  );
}

/** L'écart entre deux pastilles, réexporté pour les écrans qui composent. */
export { PILL_GAP };
