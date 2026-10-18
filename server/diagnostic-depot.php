<?php
/**
 * LE DÉPÔT D'UN DIAGNOSTIC — où atterrit une session enregistrée.
 *
 * Relevé du patron : « un mode diagnostique […] au clic sur un bouton, les 10
 * dernières secondes de mes faits et gestes te seront envoyés, y compris
 * l'enregistrement de mon écran […] pour les corriger ». L'app envoie ; ce
 * fichier RANGE, et il est séparé d'api.php pour deux raisons : api.php reste
 * lisible, et ces fonctions pures (chemin, résumé) se vérifient au banc
 * (`server/tests/diagnostic-depot-test.php`) sans base ni réseau.
 *
 * DEUX DESTINATIONS, DANS CET ORDRE.
 *   1. Un dépôt GitHub PRIVÉ (API REST Contents), si la config le donne : un
 *      dossier horodaté par rapport, un fichier par pièce. C'est là que le
 *      développeur lit ; le jeton à portée fine ne peut qu'écrire ce dépôt.
 *   2. À défaut (non configuré, ou GitHub en panne) : un dossier local
 *      `diagnostics/` à côté d'api.php, fermé par un .htaccess. Rien ne se
 *      perd, et l'app reçoit `range: 'serveur'` plutôt qu'une erreur.
 */

/**
 * LE DOSSIER D'UN RAPPORT — `rapports/AAAA-MM-JJ_HH-MM-SS`, à la seconde.
 *
 * Horodaté à la RÉCEPTION (serveur), pas à l'appui : deux diagnostics
 * envoyés dans la même seconde depuis deux appareils se rangeraient au même
 * endroit, mais c'est le même administrateur et le second complète le
 * premier — le cas ne se présente pas, et un suffixe en cacherait la cause.
 */
function diagCheminDossier(int $tsSecondes): string {
  return 'rapports/' . gmdate('Y-m-d_H-i-s', $tsSecondes);
}

/**
 * UN DOSSIER DE RAPPORT REÇU DE L'APP — pour y déposer les tranches de vidéo
 * suivantes. On n'accepte QUE la forme que `diagCheminDossier` fabrique :
 * aucune autre écriture n'est possible par ce chemin.
 */
function diagDossierValide(string $dossier): bool {
  return preg_match('#^rapports/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$#', $dossier) === 1;
}

/**
 * UN NOM DE FICHIER SÛR — ni barre, ni point-point, ni rien d'exotique.
 *
 * Le nom des pièces est écrit ici (message.md, journal.json, ecran.mp4) et ne
 * vient jamais de l'app ; cette fonction est la ceinture et les bretelles, au
 * cas où un appel futur passerait un nom reçu de l'extérieur.
 */
function diagNomSur(string $nom): string {
  $nom = preg_replace('/[^A-Za-z0-9._-]/', '_', $nom) ?? 'fichier';
  $nom = ltrim($nom, '.');
  return $nom === '' ? 'fichier' : $nom;
}

/**
 * LE RÉSUMÉ LISIBLE — message.md : le mot de l'administrateur d'abord, puis
 * de quoi situer le défaut d'un coup d'œil, avant d'ouvrir le journal.
 *
 * `$instant` est l'INSTANTANÉ que l'app joint (version, appareil, écran,
 * mode électricité, résumé du plan) ; on n'y suppose aucun champ — un
 * diagnostic reste lisible même tronqué.
 */
function diagResume(
  string $message,
  array $instant,
  bool $avecVideo,
  int $gestes,
  int $evenements,
  int $tsSecondes,
  /**
   * LA SESSION (bouton-interrupteur) : `duree` en secondes, `parties` le
   * nombre de tranches de vidéo d'une minute. Absente : un ancien envoi,
   * les dix dernières secondes.
   */
  array $session = []
): string {
  $lignes = [];
  $lignes[] = '# Diagnostic EchoPlan';
  $lignes[] = '';
  $mot = trim($message);
  $lignes[] = $mot !== '' ? $mot : '_(aucun message)_';
  $lignes[] = '';
  $lignes[] = '---';
  $lignes[] = '';
  $date = gmdate('Y-m-d H:i:s', $tsSecondes) . ' UTC';
  $lignes[] = '- **Reçu** : ' . $date;
  if (isset($instant['app'])) {
    $lignes[] = '- **App** : ' . diagTexteCourt((string) $instant['app']);
  }
  if (isset($instant['appareil'])) {
    $lignes[] = '- **Appareil** : ' . diagTexteCourt((string) $instant['appareil']);
  }
  if (isset($instant['systeme'])) {
    $lignes[] = '- **iOS** : ' . diagTexteCourt((string) $instant['systeme']);
  }
  if (isset($instant['ecran'])) {
    $lignes[] = '- **Écran** : ' . diagTexteCourt((string) $instant['ecran']);
  }
  if (array_key_exists('modeElec', $instant)) {
    $lignes[] = '- **Mode électricité** : ' . ($instant['modeElec'] ? 'oui' : 'non');
  }
  if (isset($instant['plan']) && is_array($instant['plan'])) {
    $p = $instant['plan'];
    $resume = [];
    foreach (['murs' => 'murs', 'pieces' => 'pièces', 'ouvertures' => 'ouvertures', 'meubles' => 'meubles', 'appareils' => 'appareils'] as $cle => $mot2) {
      if (isset($p[$cle])) {
        $resume[] = (int) $p[$cle] . ' ' . $mot2;
      }
    }
    if ($resume) {
      $lignes[] = '- **Plan** : ' . implode(', ', $resume);
    }
  }
  if (isset($session['duree'])) {
    $d = max(0, (int) $session['duree']);
    $lignes[] = '- **Session enregistrée** : ' . ($d >= 60 ? intdiv($d, 60) . ' min ' . ($d % 60) . ' s' : $d . ' s');
    $lignes[] = '- **Gestes** : ' . $gestes;
    $lignes[] = '- **Évènements app** : ' . $evenements;
    $parties = max(0, (int) ($session['parties'] ?? 0));
    if ($parties > 1) {
      $lignes[] = '- **Vidéo de l’écran** : ' . $parties . ' tranches d’une minute (ecran.mp4, puis ecran-2.mp4 à ecran-' . $parties . '.mp4)';
    } else {
      $lignes[] = '- **Vidéo de l’écran** : ' . ($avecVideo ? 'oui (ecran.mp4)' : 'non');
    }
  } else {
    $lignes[] = '- **Gestes (10 s)** : ' . $gestes;
    $lignes[] = '- **Évènements app (10 s)** : ' . $evenements;
    $lignes[] = '- **Vidéo de l’écran** : ' . ($avecVideo ? 'oui (ecran.mp4)' : 'non');
  }
  $lignes[] = '';
  return implode("\n", $lignes) . "\n";
}

/** Un champ d'instantané, borné : un diagnostic n'est pas un roman. */
function diagTexteCourt(string $t, int $max = 200): string {
  $t = trim(preg_replace('/\s+/', ' ', $t) ?? '');
  return mb_strlen($t) > $max ? mb_substr($t, 0, $max) . '…' : $t;
}

/**
 * DÉPOSE UN RAPPORT — rend ['ok' => bool, 'range' => 'github'|'serveur'].
 *
 * `$fichiers` : [nom => contenu brut] (déjà en octets ; la vidéo est le mp4,
 * pas du base64). On tente GitHub si la config le donne, et le markdown y
 * mène la danse : s'il passe, le rapport existe. Sinon, le local, qui ne
 * dépend de personne.
 */
function diagDeposer(string $dossier, array $fichiers): array {
  if (
    defined('DIAG_GITHUB_DEPOT') && DIAG_GITHUB_DEPOT !== ''
    && defined('DIAG_GITHUB_JETON') && DIAG_GITHUB_JETON !== ''
  ) {
    $tout = true;
    foreach ($fichiers as $nom => $contenu) {
      $ok = diagPutGithub(
        DIAG_GITHUB_DEPOT,
        DIAG_GITHUB_JETON,
        $dossier . '/' . diagNomSur((string) $nom),
        $contenu,
      );
      $tout = $tout && $ok;
    }
    if ($tout) {
      return ['ok' => true, 'range' => 'github'];
    }
    // GitHub a flanché en cours de route : on ne laisse pas un rapport à
    // moitié là-haut sans copie — le local prend le relais, intégralement.
  }
  return diagDeposerLocal($dossier, $fichiers);
}

/** Un fichier dans le dépôt GitHub privé (API Contents, PUT). */
function diagPutGithub(string $depot, string $jeton, string $chemin, string $contenu): bool {
  $url = 'https://api.github.com/repos/' . $depot . '/contents/' . $chemin;
  $corps = json_encode([
    'message' => 'diagnostic ' . $chemin,
    'content' => base64_encode($contenu),
  ]);
  $curl = curl_init($url);
  curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'PUT',
    CURLOPT_POSTFIELDS => $corps,
    // Une minute de vidéo pèse ~7 Mo (9 en base64) : on lui laisse le temps.
    CURLOPT_TIMEOUT => 90,
    CURLOPT_HTTPHEADER => [
      'Authorization: Bearer ' . $jeton,
      'User-Agent: EchoPlan-Diagnostic',
      'Accept: application/vnd.github+json',
      'Content-Type: application/json',
    ],
  ]);
  curl_exec($curl);
  $code = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
  curl_close($curl);
  // 201 créé, 200 mis à jour (deux rapports à la même seconde) : tout le reste
  // est un échec (jeton, dépôt, quota) qui doit faire retomber sur le local.
  return $code === 201 || $code === 200;
}

/** À défaut de GitHub : le dossier local, fermé par un .htaccess. */
function diagDeposerLocal(string $dossier, array $fichiers): array {
  $racine = __DIR__ . '/diagnostics/' . $dossier;
  if (!is_dir($racine) && !mkdir($racine, 0700, true) && !is_dir($racine)) {
    return ['ok' => false, 'range' => 'serveur'];
  }
  $tout = true;
  foreach ($fichiers as $nom => $contenu) {
    $ok = file_put_contents($racine . '/' . diagNomSur((string) $nom), $contenu) !== false;
    $tout = $tout && $ok;
  }
  return ['ok' => $tout, 'range' => 'serveur'];
}
