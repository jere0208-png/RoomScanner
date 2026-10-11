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
  /**
   * L'API des comptes, dans le dossier `echoplan/` de bourseur.fr — vide =
   * tout en local. Relevé du patron (11/10/2026) : « tous les fichiers sont
   * désormais sur bourseur.fr/echoplan ». L'API, la connexion Google, les
   * messages et les tarifs se composent tous à partir d'ici : c'est la seule
   * adresse à changer si le dossier bouge encore.
   */
  url: 'https://bourseur.fr/echoplan',
  /** Le schéma de retour du flux Google, déclaré dans auth-google.php. */
  schemaRetour: 'echoplan',
  /**
   * LE CATALOGUE DES PRIX DU JOUR — relevé chaque matin, page produit par
   * page produit, par `tools/releve-prix.js` (voir
   * `.github/workflows/releve-prix.yml`), et publié en lecture seule sur la
   * branche `tarifs` du dépôt. Il ne dépend pas du serveur des comptes : un
   * hébergement en panne ne fige plus les prix.
   */
  tarifsDuJour: 'https://raw.githubusercontent.com/jere0208-png/RoomScanner/tarifs/tarifs.json',
};
