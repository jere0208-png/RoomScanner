/**
 * LE SERVEUR DES COMPTES — vide, l'app vit en local comme avant.
 *
 * Renseignez `url` (le dossier où vivent api.php et auth-google.php sur
 * l'hébergement OVH) et tout s'allume d'un coup : le verrou « un compte
 * par téléphone » se juge aussi en base, le code promo se vérifie en base,
 * et « Continuer avec Google » ouvre le vrai flux OAuth via le serveur.
 *
 * L'app reste OFFLINE-FIRST : un serveur injoignable ne bloque jamais un
 * chantier — le trousseau local garde le dernier état connu.
 */
export const SERVEUR = {
  /** ex. 'https://votre-domaine.fr/echoplan' — vide = tout en local. */
  url: '',
  /** Le schéma de retour du flux Google, déclaré dans auth-google.php. */
  schemaRetour: 'echoplan',
};
