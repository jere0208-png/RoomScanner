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
 */
import React from 'react';
import { ActionSheet } from './Sheet';
import { useAlerte } from '../ui/alerte';

export function AlerteHote() {
  const courante = useAlerte((s) => s.courante);
  const fermer = useAlerte((s) => s.fermer);
  return (
    <ActionSheet
      data={
        courante
          ? {
              title: courante.titre,
              subtitle: courante.message,
              /*
                UNE ALERTE SANS SORTIE N'EN EST PAS UNE. Sans action donnée,
                elle porte « Continuer » : la croix de la coquille referme
                déjà, mais un bouton se voit, et c'est lui qu'on cherche.
              */
              actions: (courante.actions ?? [{ label: 'Continuer' }]).map(
                (a) => ({
                  label: a.label,
                  danger: a.danger,
                  onPress: () => a.onPress?.(),
                }),
              ),
            }
          : null
      }
      onClose={fermer}
    />
  );
}
