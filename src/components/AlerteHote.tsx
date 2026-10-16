/**
 * L'ALERTE MAISON, MONTÉE UNE FOIS POUR TOUTE L'APP.
 *
 * Elle prend la coquille des feuilles — même voile, même glissement du bas,
 * même croix — parce qu'un message d'erreur n'a aucune raison de ressembler
 * à autre chose que le reste. Voir `src/ui/alerte.ts` pour le pourquoi de
 * la porte d'entrée globale.
 *
 * ELLE VIT EN BAS DE `App`, avec les autres pièces qui peuvent s'ouvrir
 * par-dessus n'importe quel écran : le mur d'abonnement, l'essai épuisé, la
 * surprise Pro. Un écran qui la monterait lui-même la ferait disparaître en
 * même temps que lui — or c'est souvent EN QUITTANT qu'on apprend qu'un
 * enregistrement a échoué.
 *
 * ET UNE COPIE DANS CHAQUE FENÊTRE QUI PEUT EN LEVER UNE. iOS ne présente
 * pas l'alerte racine par-dessus une fenêtre déjà ouverte (le menu du
 * compte, la page Pro, une feuille) : la fenêtre monte donc
 * `<AlerteHote imbrique actif={visible} />`, qui prend la main tant qu'elle
 * est le plus haut. Voir la pile d'hôtes dans `src/ui/alerte.ts`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActionSheet } from './Sheet';
import { DELAI_RELAIS, useAlerte } from '../ui/alerte';

let prochainId = 1;

export function AlerteHote({
  imbrique = false,
  actif = true,
}: {
  /**
   * Hôte monté DANS une fenêtre (`Modal`) : il s'inscrit en haut de la pile
   * et l'emporte sur l'hôte racine tant qu'il y est.
   */
  imbrique?: boolean;
  /**
   * La fenêtre qui le porte est-elle ouverte ? Dès qu'elle se ferme, l'hôte
   * se retire de la pile, SANS attendre que la fenêtre native ait fini de
   * s'effacer : une alerte levée à ce moment-là ne doit pas s'ouvrir dans
   * une fenêtre qui s'en va.
   */
  actif?: boolean;
}) {
  const [id] = useState(() => prochainId++);
  const inscrire = useAlerte((s) => s.inscrire);
  const desinscrire = useAlerte((s) => s.desinscrire);
  useEffect(() => {
    if (!imbrique || !actif) return;
    inscrire(id);
    return () => desinscrire(id);
  }, [imbrique, actif, id, inscrire, desinscrire]);

  const enHaut = useAlerte((s) =>
    imbrique ? actif && s.hotes[s.hotes.length - 1] === id : s.hotes.length === 0,
  );
  const courante = useAlerte((s) => s.courante);
  /*
    LE RELAIS ATTEND QUE LES FENÊTRES SE SOIENT POSÉES — voir `DELAI_RELAIS`.
    On retient QUAND l'hôte est passé en haut ; une alerte qui arrive plus
    tôt que le délai attend le reste, une alerte plus tardive paraît tout de
    suite. Seule exception : l'hôte racine au lancement, en haut d'emblée,
    sans aucune fenêtre en mouvement. Aucune minuterie sans alerte à montrer.
  */
  const depuis = useRef(imbrique ? Date.now() : -Infinity);
  const premier = useRef(true);
  useEffect(() => {
    const auLancement = premier.current;
    premier.current = false;
    if (enHaut && !(auLancement && !imbrique)) depuis.current = Date.now();
  }, [enHaut, imbrique]);
  const attendue = enHaut && courante !== null;
  const [pret, setPret] = useState(false);
  useEffect(() => {
    if (!attendue) {
      setPret(false);
      return;
    }
    const reste = DELAI_RELAIS - (Date.now() - depuis.current);
    if (reste <= 0) {
      setPret(true);
      return;
    }
    const minuterie = setTimeout(() => setPret(true), reste);
    return () => clearTimeout(minuterie);
  }, [attendue]);

  const fermer = useAlerte((s) => s.fermer);
  /*
    L'ALERTE SE RETIRE AVANT QUE LA SUIVANTE N'ARRIVE. On ne passe à la
    suivante (`fermer`) qu'une fois la feuille descendue et le geste joué :
    sinon la feuille, jamais refermée, changeait de texte sous le doigt et
    gardait en suspens le geste de la première.
  */
  const [fermeture, setFermeture] = useState(false);
  const montree = enHaut && pret && !fermeture ? courante : null;
  return (
    <ActionSheet
      sansHoteAlerte
      data={
        montree
          ? {
              title: montree.titre,
              subtitle: montree.message,
              /*
                UNE ALERTE SANS SORTIE N'EN EST PAS UNE. Sans action donnée,
                elle porte « Continuer » : la croix de la coquille referme
                déjà, mais un bouton se voit, et c'est lui qu'on cherche.
              */
              actions: (montree.actions ?? [{ label: 'Continuer' }]).map(
                (a) => ({
                  label: a.label,
                  danger: a.danger,
                  onPress: () => a.onPress?.(),
                }),
              ),
            }
          : null
      }
      onClose={() => setFermeture(true)}
      onClosed={() => {
        if (!fermeture) return;
        setFermeture(false);
        fermer();
      }}
    />
  );
}
