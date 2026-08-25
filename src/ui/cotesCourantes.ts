/**
 * LES COTES QU'ON NE DEVRAIT PAS AVOIR À TAPER.
 *
 * Relevé du patron, après la feuille de choix des ouvertures : « optimise
 * des choses qui pourraient prendre plus en facilité et moins de temps,
 * comme cet ajout ».
 *
 * Toutes les cotes de l'application passent par la même feuille de saisie —
 * hauteur sous plafond, hauteur d'un mur, largeur et hauteur d'une
 * menuiserie, allège, position sur le mur. À chaque fois : un clavier
 * numérique, une virgule à placer, sur un chantier, d'une main.
 *
 * Or la moitié de ces cotes ne sont pas des mesures, ce sont des VALEURS DE
 * CATALOGUE. Un passage de porte fait 63, 73, 83 ou 93. Une allège est à 95,
 * ou à 110 au-dessus d'un plan de travail. Un plafond fait 2,50, et 2,70
 * dans l'ancien. Les taper, c'est retaper ce que tout le monde sait.
 *
 * Ce fichier ne décide de rien : il PROPOSE. Le champ reste, et c'est le
 * mètre qui tranche quand le bâtiment n'est pas du catalogue.
 *
 * QUATRE AU PLUS. Au-delà, on relit la liste au lieu de reconnaître sa cote,
 * et la rangée déborde de l'écran d'un téléphone.
 */
export type Nature = 'door' | 'window' | 'opening';

/**
 * Les largeurs de passage du commerce.
 *
 * Une porte : les quatre blocs-portes qu'on trouve en négoce — 63 pour un
 * WC, 73 pour une chambre, 83 pour un séjour ou une porte accessible, 93
 * pour une entrée. Une fenêtre se compte autrement : par vantail. Une baie
 * libre est un passage maçonné, elle n'a pas de dormant qui la contraigne.
 */
export function largeursCourantes(n: Nature): number[] {
  if (n === 'door') return [0.63, 0.73, 0.83, 0.93];
  if (n === 'window') return [0.6, 0.8, 1, 1.2];
  return [0.9, 1.2, 1.4, 1.8];
}

/**
 * Les hauteurs de menuiserie.
 *
 * Une porte fait 204 sous linteau ; 215 se rencontre dans le neuf. Une
 * fenêtre suit son allège : 60 pour une fenêtre de salle de bain, 95 et 115
 * pour les courantes, 135 quand elle descend bas. Une baie va du passage
 * (204, 210) au toute-hauteur (250).
 */
export function hauteursCourantes(n: Nature): number[] {
  if (n === 'door') return [2.04, 2.15];
  if (n === 'window') return [0.6, 0.95, 1.15, 1.35];
  return [2.04, 2.1, 2.5];
}

/**
 * Les allèges.
 *
 * Zéro pour une porte-fenêtre, 45 pour une allège basse (une baie de séjour
 * qu'on voit assis), 95 pour la courante, 110 au-dessus d'un plan de
 * travail de cuisine — et c'est cette dernière qui décide d'une prise
 * dessous ou à côté.
 */
export const ALLEGES_COURANTES = [0, 0.45, 0.95, 1.1];

/**
 * Les hauteurs sous plafond.
 *
 * 2,50 partout depuis les années soixante ; 2,70 et au-delà dans l'ancien ;
 * 2,30 sous une sous-pente ou dans un garage aménagé. La quatrième, 2,60,
 * est celle des logements des années 2000.
 */
export const HAUTEURS_SOUS_PLAFOND = [2.3, 2.5, 2.6, 2.7];

/**
 * Une cote, telle qu'elle se lit sur une pastille et telle qu'elle entre
 * dans le champ.
 *
 * Le LIBELLÉ parle la langue du métier : une menuiserie se commande en
 * centimètres — « 83 », pas « 0,83 m » —, un plafond se dit en mètres. La
 * VALEUR, elle, est toujours celle du champ : des mètres, avec la virgule,
 * puisque c'est la feuille de saisie qui la reçoit.
 */
export interface Pastille {
  label: string;
  value: string;
}

export function pastilles(valeurs: number[], unite: 'cm' | 'm'): Pastille[] {
  return valeurs.map((v) => ({
    label:
      unite === 'cm'
        ? String(Math.round(v * 100))
        : v.toFixed(2).replace('.', ','),
    value: v.toFixed(2).replace('.', ','),
  }));
}

/*
  LE CATALOGUE DE POSE EST DANS LES PROPOSITIONS — vérifié au banc.

  `COTES_MENUISERIE` pose une porte de 83 ; si 83 ne figurait pas parmi les
  pastilles, l'application se contredirait à un centimètre près. On ne
  recopie donc rien ici : le banc compare les deux listes, et c'est lui qui
  interdit de les laisser diverger.
*/
