/**
 * LE BANDEAU D'UN APPAREIL DE PLAFOND — où il se tient, au centimètre.
 *
 * Il donne les deux distances qui le placent : au mur de gauche, au mur du
 * haut, d'équerre avec la trame du logement. Ce sont EXACTEMENT les cotes
 * que le plan dessine en pointillés bleus — il a déjà menti une fois, en
 * comptant depuis le coin de l'emprise de la pièce, et deux quantités
 * différentes s'affichaient côte à côte.
 *
 * On touche une pastille, la feuille de saisie monte avec le clavier : le
 * bandeau est en bas de l'écran, et le clavier le recouvre en entier.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { castToWall, type Pt, type WallSeg } from '../geometry/floorplan';
import { CEILINGS, type CeilingFixture } from '../geometry/ceiling';
import { IconeBandeau } from './StripBar';
import { haptic } from '../ui/haptic';
import { SOLAIRES } from '../ui/solaires';
import { DEBORD_DOIGT } from '../ui/bandeau';
import type { PromptData } from './Sheet';
import type { Palette } from '../theme';

export function CeilingBar({
  fixture,
  walls,
  trame,
  centre,
  styles,
  palette,
  onMove,
  onPrompt,
  onLink,
  onRemove,
  onDone,
}: {
  fixture: CeilingFixture;
  /** Les murs de SA pièce : on se cote sur eux, pas sur ceux d'à côté. */
  walls: WallSeg[];
  /**
   * LE MILIEU DE SA PIÈCE — celui où l'écran écrit déjà son nom.
   *
   * C'est le PÔLE INTÉRIEUR du contour, pas le barycentre : dans une pièce
   * en L, le barycentre tombe dans le vide, hors des murs. Absent quand la
   * pièce n'a pas de contour fermé — et le bouton disparaît avec lui : un
   * bouton qui ne fait rien est pire qu'un bouton absent.
   */
  centre?: Pt | null;
  /** L'orientation du logement : les cotes partent d'équerre avec elle. */
  trame: number;
  /** Les styles de l'écran : le bandeau partage ceux des autres barres. */
  styles: Record<string, object>;
  palette: Palette;
  onMove: (at: Pt) => void;
  onPrompt: (p: PromptData) => void;
  /** Absent quand l'appareil ne se commande pas — un détecteur de fumée. */
  onLink?: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
          const cos = Math.cos(trame);
          const sin = Math.sin(trame);
          /** Les quatre directions d'équerre, comme sur le plan. */
          const AXES = {
            gauche: { x: -cos, z: -sin },
            droite: { x: cos, z: sin },
            haut: { x: sin, z: -cos },
            bas: { x: -sin, z: cos },
          } as const;
          const ecart = (k: keyof typeof AXES) =>
            castToWall(fixture.at, AXES[k], walls);
          const cm = (v: number | null) =>
            v === null ? '—' : String(Math.round(v * 100));

          /**
           * Déplace l'appareil pour obtenir CETTE distance à CE mur.
           *
           * LE SIGNE : c'est lui qui faussait tout. `AXES[k]` pointe VERS le
           * mur — c'est le sens de la visée qui mesure l'écart. Avancer d'un
           * mètre dans ce sens RÉDUIT donc la cote d'un mètre : la correction
           * se compte à l'envers de la mesure.
           *
           * Elle se comptait dans le même sens. Demander plus éloignait du
           * mur opposé : on tapait 300 pour un appareil à 31, il partait de
           * 2,69 m du mauvais côté, sortait de la pièce, et le contour le
           * rabattait sur son bord — d'où deux cotes aberrantes, et
           * l'impression que la saisie ne s'enregistrait pas, puisque la
           * valeur relue n'était jamais celle qu'on avait tapée. Relevé du
           * patron : « tout est faussé, et ça n'enregistre pas les mesures
           * qu'on donne ».
           */
          const poser = (k: keyof typeof AXES, valeurCm: string) => {
            const v = parseFloat(valeurCm.replace(',', '.'));
            const actuel = ecart(k);
            if (!isFinite(v) || v < 0 || actuel === null) return;
            const d = actuel - v / 100;
            onMove({
              x: fixture.at.x + AXES[k].x * d,
              z: fixture.at.z + AXES[k].z * d,
            });
            haptic('succes');
          };

          const champ = (
            k: keyof typeof AXES,
            titre: string,
            fleche: 'gauche' | 'haut',
          ) => (
            <TouchableOpacity
              style={styles.clChamp}
              accessibilityLabel={titre}
              hitSlop={DEBORD_DOIGT}
              onPress={() => {
                const actuel = ecart(k);
                if (actuel === null) return;
                onPrompt({
                  title: titre,
                  subtitle:
                    'Distance entre l’appareil et le nu du mur, en ' +
                    'centimètres. C’est la cote que porte le plan.',
                  value: String(Math.round(actuel * 100)),
                  unit: 'cm',
                  numeric: true,
                  okLabel: 'Placer',
                  onSubmit: (t) => poser(k, t),
                });
              }}>
              {/* LE SIGNE DE L'AXE : la même double flèche que « Longueur »
                  et « Largeur » sous une ligne de spots. Elle était tracée
                  au trait ici, en plein là-bas, pour dire exactement la
                  même chose. */}
              <Svg width={17} height={17} viewBox="0 0 24 24">
                <Path
                  d={fleche === 'gauche' ? SOLAIRES.longueur : SOLAIRES.largeur}
                  fill={palette.inkSoft}
                  fillRule="evenodd"
                />
              </Svg>
              <Text style={styles.clValeur}>{cm(ecart(k))}</Text>
            </TouchableOpacity>
          );

          return (
            <View style={styles.bandeau}>
              {/*
                EN HAUT CE QU'ON LIT ET CE QU'ON RÈGLE, EN BAS LES GESTES.

                Les deux cotes et les trois boutons tenaient sur une seule
                ligne : à quatre pastilles, la dernière sortait du cadre.
                C'est la forme commune à tous les bandeaux du bas depuis le
                relevé du patron — « fais en 2 parties, avec le texte
                au-dessus et les boutons en dessous ».

                Le NOM de l'appareil s'ajoute au passage : la barre montrait
                deux nombres et deux flèches, sans jamais dire ce qu'on
                était en train de placer.
              */}
              <View style={styles.bandeauEntete}>
                <IconeBandeau icone={SOLAIRES.plafond} styles={styles} />
                <View style={styles.bandeauTexte}>
                  <Text style={styles.bandeauTitre} numberOfLines={1}>
                    {CEILINGS[fixture.kind].label}
                  </Text>
                  <View style={styles.editRow}>
                    {champ('gauche', 'Distance au mur de gauche', 'gauche')}
                    {champ('haut', 'Distance au mur du haut', 'haut')}
                    <Text style={styles.unit}>cm</Text>
                  </View>
              </View>
              </View>
              <View style={styles.bandeauActions}>
                  {/*
                    CENTRER — relevé du patron : « pour les points de plafond
                    ajoute un bouton Centrer qui se centrera dans la pièce où
                    il se trouve automatiquement ».

                    C'est le placement de neuf points lumineux sur dix : un
                    DCL se pose au milieu, et on ne le discute pas. Il
                    fallait pourtant y arriver au doigt, ou par deux cotes
                    calculées de tête — alors que l'app sait exactement où
                    est ce milieu, puisqu'elle y écrit le nom de la pièce.
                  */}
                  {centre && (
                    <View style={styles.bandeauCellule}>
                      <TouchableOpacity
                        hitSlop={DEBORD_DOIGT}
                        style={styles.iconBtn}
                        accessibilityLabel="Centrer dans la pièce"
                        onPress={() => {
                          onMove(centre);
                          haptic('succes');
                        }}>
                        {/* LA CIBLE DU JEU COMMUN. Elle était tracée à la
                            main — deux axes et un cercle — au milieu de
                            voisines qui venaient toutes du jeu Solar : une
                            silhouette écrite à part dérive au premier
                            changement, et personne ne le voit avant
                            l'écran. */}
                        <Svg width={17} height={17} viewBox="0 0 24 24">
                          <Path
                            d={SOLAIRES.centrer}
                            fill={palette.blue}
                            fillRule="evenodd"
                          />
                        </Svg>
                      </TouchableOpacity>
                      <Text style={styles.bandeauMot}>Centrer</Text>
                    </View>
                  )}
                  {/* RELIER, à portée de pouce.
                      La liaison vivait au fond d'un menu qu'il fallait
                      ouvrir en touchant l'appareil une seconde fois — et
                      cette seconde fois n'arrivait jamais jusqu'au dessin,
                      la poignée de glissement l'avalant. Trois appuis pour
                      un geste qu'on répète à chaque point lumineux. */}
                  {onLink && (
                    <View style={styles.bandeauCellule}>
                    <TouchableOpacity
                      hitSlop={DEBORD_DOIGT}
                      style={styles.iconBtn}
                      accessibilityLabel="Relier à une commande"
                      onPress={onLink}>
                      {/* Le maillon du jeu commun — relevé du patron :
                          `link-square`. Il était tracé à la main, au trait,
                          pendant que ses voisins venaient du jeu. */}
                      <Svg width={17} height={17} viewBox="0 0 24 24">
                        <Path
                          d={SOLAIRES.lienCarre}
                          fill={palette.blue}
                          fillRule="evenodd"
                        />
                      </Svg>
                    </TouchableOpacity>
                      {/* Le mot sous la pastille : voir `bandeauMot`. Une
                          icône seule ne se comprend qu'en l'essayant. */}
                      <Text style={styles.bandeauMot}>Relier</Text>
                    </View>
                  )}
                  {/* Deux boutons en pictogramme, et rien pour les nommer :
                      VoiceOver annonçait « bouton », deux fois, à côté de
                      la corbeille et de la validation. Toutes les autres
                      barres de l'app portent leur étiquette ; celles-ci
                      l'avaient perdue en chemin. */}
                  <View style={styles.bandeauCellule}>
                    <TouchableOpacity
                      hitSlop={DEBORD_DOIGT}
                      style={styles.iconBtn}
                      accessibilityLabel="Retirer"
                      onPress={onRemove}>
                      {/* La poubelle du jeu commun — relevé du patron :
                          `trash-bin-trash`, « partout où il y a la
                          poubelle ». */}
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
                  <View style={styles.bandeauCellule}>
                    <TouchableOpacity
                      hitSlop={DEBORD_DOIGT}
                      style={styles.iconBtnOk}
                      accessibilityLabel="Terminer"
                      onPress={onDone}>
                      {/* Le V de validation du jeu commun — relevé du
                          patron : `unread`, « c'est un V de valider ». */}
                      <Svg width={17} height={17} viewBox="0 0 24 24">
                        <Path d={SOLAIRES.valider} fill="#FFFFFF" fillRule="evenodd" />
                      </Svg>
                    </TouchableOpacity>
                    <Text style={styles.bandeauMot}>Terminer</Text>
                  </View>
              </View>
            </View>
          );
}
