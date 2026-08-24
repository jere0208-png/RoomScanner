/**
 * LE RETOUR AU GLISSEMENT — le geste de Safari, partout où vit la flèche.
 *
 * Relevé du patron : « un glissement de gauche vers la droite doit faire
 * revenir en arrière, comme sur les apps modernes ». Le seuil est FRANC —
 * soixante points, plus horizontal que vertical : un doigt qui hésite ou qui
 * défile ne déclenche rien.
 *
 * IL A LONGTEMPS NE MARCHÉ QU'EN HAUT DE L'ÉCRAN, et c'est une leçon sur les
 * vues absolues. La bande était posée `top: 0, bottom: 0` — mais ces zéros
 * se comptent dans le PARENT, et son parent était la barre du titre :
 * cinquante points de haut sur un écran qui en fait sept cents. Le geste ne
 * répondait donc que dans le bandeau supérieur, c'est-à-dire nulle part où
 * l'on commence un glissement. Le défaut ne se voit pas en lisant le
 * composant : il faut regarder QUI le contient.
 *
 * DEUX FAÇONS DE S'EN SERVIR, ET IL FAUT SAVOIR POURQUOI :
 *
 *   — EN ENVELOPPE (`<RetourGlisse …>{contenu}</RetourGlisse>`), pour un
 *     écran dont le contenu se touche : le plan, l'aperçu. Le geste est
 *     alors CAPTURÉ en cours de route, comme le fait le système : on ne
 *     vole jamais l'appui — taps, poignées et pincements gardent la main —
 *     mais un glissement franc parti du bord gauche reprend le dessus, même
 *     si le plan avait commencé à suivre le doigt.
 *   — EN BANDE (`<RetourGlisse />` seule), pour un écran sans canevas : une
 *     bande invisible de vingt-quatre points le long du bord, qui ne
 *     recouvre rien d'important.
 *
 * L'enveloppe est la bonne façon dès qu'il y a quelque chose à toucher : une
 * bande posée par-dessus un plan mangerait les vingt-quatre premiers points
 * de dessin, et rien ne le dirait à l'utilisateur — il croirait le plan
 * inerte de ce côté-là.
 */
import React, { useMemo, useRef } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Le glissement vaut-il retour ? Franc, et plus horizontal que vertical. */
export function estUnRetour(dx: number, dy: number): boolean {
  return dx > 60 && Math.abs(dy) < Math.abs(dx);
}

/**
 * LARGEUR DU BORD SENSIBLE, en points.
 *
 * Vingt-quatre : la mesure du système, et celle d'un pouce qui part du
 * cadre. En dessous, le geste rate une fois sur trois ; au-dessus, on
 * commence à mordre sur ce qu'on voulait toucher.
 */
export const BORD = 24;

/**
 * OÙ LE DOIGT S'EST POSÉ — et pourquoi on ne le demande pas au geste.
 *
 * `gestureState.x0` vaut ZÉRO tant que le système n'a pas accordé le
 * toucher : il n'est renseigné qu'au `grant`. Or c'est justement AVANT le
 * grant qu'on décide de capturer — la garde « parti du bord gauche » ne
 * gardait donc rien, et un glissement horizontal n'importe où sur l'écran
 * aurait fini par sortir du plan. Le banc l'a montré ; à la lecture, la
 * ligne paraissait juste.
 *
 * L'ARCHIVE, elle, sait toujours : `touchBank` garde pour chaque doigt le
 * point où il s'est posé, dès le premier événement.
 */
export function departDuDoigt(e: GestureResponderEvent): number | null {
  /*
    `touchHistory` ne figure pas dans le type de l'événement, et il est
    pourtant toujours là : c'est le système de responders lui-même qui
    l'accroche, et `PanResponder` ne travaille qu'avec lui. On le lit donc
    par un chemin déclaré à la main, plutôt que de renoncer à la seule
    information fiable de tout ce fichier.
  */
  const bank = (e as unknown as {
    touchHistory?: {
      touchBank?: ({ touchActive?: boolean; startPageX?: number } | null)[];
    };
  })?.touchHistory?.touchBank;
  if (!bank) return null;
  const doigt = bank.find((t) => t?.touchActive);
  return typeof doigt?.startPageX === 'number' ? doigt.startPageX : null;
}

/**
 * CE QU'IL FAUT PARCOURIR POUR QUE LE BORD PRENNE LA MAIN.
 *
 * HUIT POINTS — moins que le seuil de glissement de l'app (`GLISSEMENT_MIN`,
 * dix), et ce n'est pas une coquetterie : c'est la seule façon que le geste
 * marche sur le plan.
 *
 * Le système négocie ainsi : quand une vue veut capturer un toucher que
 * quelqu'un tient déjà, il DEMANDE au tenant de le rendre. Or le plan, les
 * poignées et les bandeaux répondent tous `onPanResponderTerminationRequest:
 * () => false` — et ils ont raison : un pan en cours ne doit pas se faire
 * voler. Si le bord attendait vingt-quatre points, le plan aurait pris la
 * main à dix, refusé de la rendre, et le retour n'aurait jamais fonctionné
 * là où on s'en sert le plus.
 *
 * On capture donc AVANT lui. Le prix est connu et assumé : un glissement du
 * plan commencé dans les vingt-quatre premiers points de l'écran part en
 * retour — c'est exactement ce que fait iOS, dont le bord appartient au
 * système.
 */
export const CAPTURE_MIN = 8;

/**
 * Le geste est-il un retour EN COURS, parti du bord ?
 *
 * Plus tôt que `estUnRetour` : on prend la main dès que le geste ne fait
 * plus de doute — parti du bord, franchement horizontal — pour que le
 * contenu cesse de suivre le doigt.
 */
export function partDuBord(
  x0: number,
  dx: number,
  dy: number,
  doigts = 1,
): boolean {
  return (
    doigts <= 1 && x0 <= BORD && dx > CAPTURE_MIN && Math.abs(dy) * 2 < dx
  );
}

/**
 * CE QU'IL RESTE À PARCOURIR APRÈS LA CAPTURE.
 *
 * Le compteur du geste REPART DE ZÉRO quand le système accorde le toucher :
 * au lâcher, `dx` ne mesure plus que ce qui s'est passé depuis la capture,
 * pas depuis le bord de l'écran. Exiger là les soixante points de
 * `estUnRetour` reviendrait à en demander soixante-huit au doigt, sans que
 * rien ne le dise. On en demande cinquante : le geste complet en vaut
 * cinquante-huit, franc et confortable — et il faut qu'il le soit, puisque
 * le bord prend la main dès huit points.
 */
export const SUITE_MIN = 50;

export function RetourGlisse({
  onRetour,
  children,
  style,
}: {
  onRetour: () => void;
  /** Le contenu de l'écran. Présent, le geste se capture au lieu de guetter. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  // La référence vive : le responder est créé une fois, le geste du jour
  // appelle toujours le retour du jour.
  const vif = useRef(onRetour);
  vif.current = onRetour;
  const enveloppe = children !== undefined;
  const pan = useMemo(
    () =>
      PanResponder.create(
        enveloppe
          ? {
              /*
                ON NE VOLE JAMAIS L'APPUI. Un tap sur un mur, une poignée
                qu'on saisit, un pincement : tout cela commence par un
                appui, et il ne nous regarde pas.
              */
              onStartShouldSetPanResponderCapture: () => false,
              // ... mais on reprend le geste en route, comme le système.
              onMoveShouldSetPanResponderCapture: (e, g) => {
                const x0 = departDuDoigt(e);
                return (
                  x0 !== null && partDuBord(x0, g.dx, g.dy, g.numberActiveTouches)
                );
              },
              onPanResponderTerminationRequest: () => false,
              onPanResponderRelease: (_e, g) => {
                // Trente points DEPUIS LA CAPTURE : voir `SUITE_MIN`.
                if (g.dx > SUITE_MIN && Math.abs(g.dy) < Math.abs(g.dx)) {
                  vif.current();
                }
              },
            }
          : {
              onStartShouldSetPanResponder: () => true,
              onMoveShouldSetPanResponder: (_e, g) =>
                g.dx > 8 && Math.abs(g.dy) < Math.abs(g.dx),
              onPanResponderTerminationRequest: () => false,
              onPanResponderRelease: (_e, g) => {
                if (estUnRetour(g.dx, g.dy)) vif.current();
              },
            },
      ),
    [enveloppe],
  );
  if (!enveloppe) return <View {...pan.panHandlers} style={styles.bord} />;
  return (
    <View {...pan.panHandlers} style={style}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bord: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: BORD,
    zIndex: 40,
  },
});
