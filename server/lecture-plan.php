<?php
/**
 * ECHOPLAN — LA LECTURE D'UN PLAN PAPIER, PAR CLAUDE.
 *
 * Relevé du patron : « on ouvre une page photo qui demande de scanner un plan
 * papier ; si la vision détecte le plan, elle le scanne et crée à partir de
 * lui un plan 2D. Les symboles, les cotes, tout doit être lu parfaitement. »
 *
 * Ce fichier ne fait qu'une chose : envoyer la photo redressée à Claude
 * (vision), avec la consigne de lecture et le schéma de la réponse, et rendre
 * ce qu'il a lu. La MESURE — l'échelle, l'équerre, les cotes qui placent les
 * murs au millimètre, la conversion des symboles — se fait dans l'app (voir
 * `src/geometry/lecturePlan.ts`) : le serveur ne garde rien, ni l'image ni la
 * lecture.
 *
 * DEUX LECTURES CIBLÉES, EN MÊME TEMPS — relevé du patron, plan d'électricien
 * à l'appui : « il a scanné cela, rien à voir, manque beaucoup de murs ». Une
 * seule demande pour tout lire (murs, ouvertures, cotes, pièces, symboles,
 * liens) rendait, sur un plan chargé, une lecture résumée : 19 murs, aucune
 * cloison, aucun symbole sur une feuille qui en porte cent. Le BÂTI et
 * l'ÉLECTRICITÉ se lisent maintenant chacun par sa demande, avec sa consigne,
 * en parallèle : chacune a toute son attention, et l'attente reste celle
 * d'une seule.
 *
 * LA RÉPONSE EST TOUJOURS UN JSON VALIDE : Claude répond par les outils
 * `plan_lu` et `electricite_lue`, dont les schémas sont écrits ici. Pas de
 * texte libre à interpréter.
 *
 * Configuration (config-echoplan.php) :
 *   ANTHROPIC_CLE     la clé d'API (console.anthropic.com) — jamais dans l'app ;
 *   ANTHROPIC_MODELE  facultatif, 'claude-sonnet-5-5' par défaut.
 */

/** Ce qui vaut pour les deux lectures : le repère, et le plan à lire. */
const CONSIGNE_COMMUNE = <<<'TXT'
REPÈRE. Toutes les positions sont en MILLIÈMES de l'image : x de 0 (bord gauche) à 1000 (bord droit), y de 0 (bord haut) à 1000 (bord bas), en nombres entiers. Une épaisseur se donne en millièmes de la LARGEUR de l'image.

UN SEUL PLAN. La photo peut montrer plusieurs plans (une autre feuille en partie visible, un autre niveau, une coupe, une façade) : lis UNIQUEMENT le plan principal, le plus grand et le plus complet, et ignore tout le reste, même s'il porte des cotes. Ignore aussi le cartouche, la légende (sauf pour comprendre les symboles), le cadre, la rose des vents, les échelles graphiques, le ruban adhésif et le mur derrière la feuille.

SOIS EXHAUSTIF. Un plan de maison porte couramment 40 à 120 pans de murs et cloisons, et un plan d'électricien 50 à 200 symboles. Relève-les TOUS, un par un, sans résumer ni t'arrêter en route. N'invente rien que tu ne vois pas : mais ce que tu vois, tu le relèves.
TXT;

/** La lecture du bâti : pièces, murs, ouvertures, cotes. */
const CONSIGNE_STRUCTURE = <<<'TXT'
Tu lis des plans de logement photographiés ou scannés (plans d'architecte, de constructeur, de notaire, croquis cotés, plans d'électricien), pour en reconstruire fidèlement le BÂTI en plan 2D. Tu réponds UNIQUEMENT par l'outil `plan_lu`. Les symboles électriques ne te concernent pas : une autre lecture s'en charge.

@COMMUNE@

PROCÈDE DANS CET ORDRE.

1. CADRE. `cadre` : le rectangle qui contient le plan principal, [x1, y1, x2, y2].

2. PIÈCES. Chaque pièce ou espace clos, nommé ou non (escalier, placard, dégagement, gaine compris). `nom` tel qu'écrit (« SÉJOUR », « Ch. 1 », « SDB », « Escalier » si rien n'est écrit), `point` au centre du nom, `surface` le texte de sa surface s'il est écrit (« 12,5 m² »), et `contour` : les COINS INTÉRIEURS de la pièce, dans l'ordre du tour, là où ses murs se rejoignent (le nu des murs, pas leur axe). Une pièce rectangulaire a 4 coins ; une pièce en L en a 6.

3. MURS. Un segment par pan de mur droit, tracé sur l'AXE du mur (au milieu de son épaisseur), d'une jonction à l'autre. Les murs épais (pochés noirs, hachurés) comme les CLOISONS FINES (simples traits doubles, gris ou noirs) : toutes. Chaque côté de chaque contour de pièce doit longer un mur. Un mur percé d'une porte ou d'une fenêtre reste UN segment continu : les ouvertures se donnent à part. Chaque mur : [x1, y1, x2, y2, épaisseur]. Ne prends PAS pour des murs : les lignes de cote, les hachures seules, les meubles, les appareils sanitaires, le mobilier de cuisine, les marches d'escalier, les tracés d'électricité (pointillés, courbes, zigzags de chauffage au sol), les lignes de construction, le cadre.

4. OUVERTURES. Chaque porte (un arc de battant), porte-fenêtre, fenêtre (traits fins dans l'épaisseur du mur), baie libre, passage, porte coulissante, porte de garage : `type` en clair, `a` et `b` les deux jambages (tableaux) POSÉS SUR L'AXE du mur qui la porte, et `largeur` le texte de sa largeur s'il est écrit (« 0,83 », « 90 »).

5. COTES. Toutes les cotes écrites DU PLAN PRINCIPAL, une par une, y compris chacune des cotes d'une chaîne. `texte` : EXACTEMENT ce qui est écrit (« 3,20 », « 320 », « 3.20 m »). `metres` : ta lecture en mètres. `a` et `b` : les deux extrémités de la LIGNE DE COTE, là où elle touche ses lignes d'attache. `reference` : « interieur » (d'un nu intérieur à l'autre), « exterieur » (hors tout), « axes » (d'axe en axe), « inconnu ». Les textes reconnus par l'iPhone te sont donnés avec leur position : sers-t'en pour lire les chiffres exactement.

6. HAUTEUR. La hauteur sous plafond si elle est écrite (« HSP 2,50 », « HSP : 2,27 »), en mètres.

SI CE N'EST PAS UN PLAN, ou s'il est illisible (flou, coupé, trop loin) : `est_un_plan` faux et `raison` qui dit pourquoi en une phrase, à l'utilisateur.
TXT;

/** La lecture de l'électricité : chaque symbole, et ce qui le relie. */
const CONSIGNE_ELECTRICITE = <<<'TXT'
Tu lis les SYMBOLES ÉLECTRIQUES et de plafond d'un plan de logement photographié ou scanné. Tu réponds UNIQUEMENT par l'outil `electricite_lue`. Les murs et les pièces ne te concernent pas : une autre lecture s'en charge.

@COMMUNE@

SYMBOLES. Parcours le plan pièce par pièce, le long de chaque mur, puis le plafond, et relève CHAQUE symbole, un par un : prises de courant (simples, doubles, triples — souvent un demi-cercle barré, avec « 2 » ou « 3 » à côté pour le nombre de postes —, 20 A, 32 A, commandées), prises spécialisées (lave-linge LL, sèche-linge SL, lave-vaisselle LV, four FO, plaque PL, réfrigérateur FRI, micro-ondes MI, VMC…), interrupteurs (simple allumage, double allumage, va-et-vient, bouton poussoir, variateur, volet roulant, détecteur), prises RJ45 / téléphone / TV, points lumineux (DCL : un cercle barré d'une croix), appliques, spots, plafonniers, tableau électrique, sorties de câble, alimentation de climatisation, thermostats, boîtes de dérivation, détecteurs de fumée, détecteurs d'ouverture, bouches de VMC.
`libelle` : ce que le symbole représente, en mots précis (« prise de courant 16 A », « double prise », « interrupteur va-et-vient », « point lumineux DCL au plafond », « prise RJ45 », « prise spécialisée lave-linge »). Si la feuille a une légende, nomme chaque symbole comme elle le nomme. `code` : le sigle écrit à côté s'il y en a un (« PC », « S », « VV », « DCL », « 20A », « LL », « RJ45 »). `point` : le centre du symbole. `nombre` : le nombre de postes sous la même plaque (une double prise : 2). `plafond` : vrai pour ce qui est au plafond (point lumineux, spot, plafonnier, détecteur de fumée, VMC).

LIENS. Les traits (souvent courbes ou pointillés) qui relient un interrupteur à ce qu'il allume : [indice de l'interrupteur, indice de ce qu'il allume], indices dans ta liste `symboles`.
TXT;

/** Un point du plan, en millièmes. */
function pointLu(): array {
  return ['type' => 'array', 'items' => ['type' => 'number'], 'minItems' => 2, 'maxItems' => 2];
}

/** Le schéma du bâti : ce que `reconstruirePlan` attend. */
function outilPlanLu(): array {
  $point = pointLu();
  return [
    'name' => 'plan_lu',
    'description' => 'La lecture du bâti du plan photographié : pièces, murs, ouvertures, cotes.',
    'input_schema' => [
      'type' => 'object',
      'properties' => [
        'est_un_plan' => ['type' => 'boolean'],
        'raison' => ['type' => 'string'],
        'cadre' => ['type' => 'array', 'items' => ['type' => 'number'], 'minItems' => 4, 'maxItems' => 4],
        'pieces' => [
          'type' => 'array',
          'items' => [
            'type' => 'object',
            'properties' => [
              'nom' => ['type' => 'string'],
              'point' => $point,
              'surface' => ['type' => 'string'],
              'contour' => ['type' => 'array', 'items' => $point, 'minItems' => 3],
            ],
            'required' => ['nom', 'point'],
          ],
        ],
        'murs' => [
          'type' => 'array',
          'description' => '[x1, y1, x2, y2, épaisseur] : l’axe de chaque pan de mur, en millièmes.',
          'items' => ['type' => 'array', 'items' => ['type' => 'number'], 'minItems' => 4, 'maxItems' => 5],
        ],
        'ouvertures' => [
          'type' => 'array',
          'items' => [
            'type' => 'object',
            'properties' => [
              'type' => ['type' => 'string'],
              'a' => $point,
              'b' => $point,
              'largeur' => ['type' => 'string'],
            ],
            'required' => ['type', 'a', 'b'],
          ],
        ],
        'cotes' => [
          'type' => 'array',
          'items' => [
            'type' => 'object',
            'properties' => [
              'texte' => ['type' => 'string'],
              'metres' => ['type' => 'number'],
              'a' => $point,
              'b' => $point,
              'reference' => ['type' => 'string', 'enum' => ['interieur', 'exterieur', 'axes', 'inconnu']],
            ],
            'required' => ['texte', 'a', 'b'],
          ],
        ],
        'hauteur' => ['type' => 'number'],
      ],
      'required' => ['est_un_plan'],
    ],
  ];
}

/** Le schéma de l'électricité. */
function outilElectriciteLue(): array {
  $point = pointLu();
  return [
    'name' => 'electricite_lue',
    'description' => 'Les symboles électriques et de plafond du plan photographié, et leurs liens de commande.',
    'input_schema' => [
      'type' => 'object',
      'properties' => [
        'symboles' => [
          'type' => 'array',
          'items' => [
            'type' => 'object',
            'properties' => [
              'libelle' => ['type' => 'string'],
              'code' => ['type' => 'string'],
              'point' => $point,
              'nombre' => ['type' => 'integer'],
              'plafond' => ['type' => 'boolean'],
            ],
            'required' => ['libelle', 'point'],
          ],
        ],
        'liens' => [
          'type' => 'array',
          'items' => ['type' => 'array', 'items' => ['type' => 'integer'], 'minItems' => 2, 'maxItems' => 2],
        ],
      ],
      'required' => ['symboles'],
    ],
  ];
}

/**
 * POURQUOI L'API A DIT NON, EN CLAIR — relevé du patron : « la lecture n'a
 * pas abouti pour ce plan, il la refuse directement ». Toute réponse autre
 * que 200 donnait la même phrase, « a refusé la photo » : une clé refusée,
 * un compte sans crédit, un modèle inconnu et une image illisible se
 * ressemblaient. Chacune a maintenant sa phrase — celle qui dit quoi faire —
 * et le détail technique part dans le journal d'erreurs de PHP (le manager
 * OVH le montre ; il n'est pas public).
 */
function raisonDuRefus(int $code, $reponse, string $modele): string {
  $type = is_array($reponse) ? (string) ($reponse['error']['type'] ?? '') : '';
  $message = is_array($reponse) ? (string) ($reponse['error']['message'] ?? '') : '';
  error_log('EchoPlan lecture-plan : HTTP ' . $code . ' ' . $type . ' — ' . mb_substr($message, 0, 300));
  if (stripos($message, 'credit balance') !== false || stripos($message, 'billing') !== false) {
    return 'La lecture est suspendue : le compte Anthropic du serveur n’a plus de crédit (console.anthropic.com › Billing).';
  }
  if ($code === 401 || $type === 'authentication_error') {
    return 'La clé Anthropic du serveur est refusée : vérifiez ANTHROPIC_CLE dans config-echoplan.php (sans espace ni retour à la ligne).';
  }
  if ($code === 403 || $type === 'permission_error') {
    return 'La clé Anthropic du serveur n’a pas accès au modèle « ' . $modele . ' ».';
  }
  if ($code === 404 || $type === 'not_found_error') {
    return 'Le modèle de lecture « ' . $modele . ' » est inconnu : vérifiez ANTHROPIC_MODELE dans config-echoplan.php.';
  }
  if ($code === 413 || $type === 'request_too_large') {
    return 'La photo est trop lourde pour le lecteur : reprenez-la de plus près, ou importez-la en JPEG.';
  }
  if (stripos($message, 'image') !== false) {
    return 'Le lecteur n’a pas pu ouvrir la photo : reprenez-la, ou importez-la en JPEG.';
  }
  // Le texte de l'API, tel quel : il dit la cause (il ne contient ni la clé
  // ni la photo), et c'est lui qu'il faut lire pour corriger.
  return 'Le lecteur de plans a refusé la demande (code ' . $code . ($type !== '' ? ', ' . $type : '') . ')'
    . ($message !== '' ? ' : « ' . mb_substr($message, 0, 220) . ' »' : ' : réessayez dans un instant.');
}

/** Une poignée cURL vers l'API des messages, prête à partir. */
function poigneeDuLecteur(string $envoi) {
  $curl = curl_init('https://api.anthropic.com/v1/messages');
  curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      'content-type: application/json',
      'x-api-key: ' . trim(ANTHROPIC_CLE),
      'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS => $envoi,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 170,
  ]);
  return $curl;
}

/**
 * Plusieurs appels à l'API, EN MÊME TEMPS : [[code HTTP, corps brut ou false], …].
 * Deux lectures en parallèle durent ce que dure la plus longue.
 */
function appelerEnParallele(array $envois): array {
  $multi = curl_multi_init();
  $poignees = [];
  foreach ($envois as $cle => $envoi) {
    $poignees[$cle] = poigneeDuLecteur($envoi);
    curl_multi_add_handle($multi, $poignees[$cle]);
  }
  do {
    $etat = curl_multi_exec($multi, $actifs);
    if ($actifs) curl_multi_select($multi, 1.0);
  } while ($actifs && $etat === CURLM_OK);
  $sorties = [];
  foreach ($poignees as $cle => $curl) {
    $brut = curl_multi_getcontent($curl);
    $code = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $sorties[$cle] = [$code, ($brut === null || $brut === '') && $code === 0 ? false : $brut];
    curl_multi_remove_handle($multi, $curl);
    curl_close($curl);
  }
  curl_multi_close($multi);
  return $sorties;
}

/**
 * L'OUTIL IMPOSÉ, REFUSÉ PAR CERTAINS MODÈLES — relevé du patron : « code
 * 400, invalid_request_error ». Un modèle qui réfléchit de lui-même refuse
 * qu'on lui impose un outil (`tool_choice` de type « tool »). On redemande
 * alors en le laissant choisir : la consigne dit déjà quel outil rendre.
 */
function refusDeLOutilImpose(int $code, $reponse): bool {
  if ($code !== 400 || !is_array($reponse)) return false;
  $message = (string) ($reponse['error']['message'] ?? '');
  return stripos($message, 'tool_choice') !== false || stripos($message, 'thinking') !== false;
}

/** Ce que l'outil a rendu dans une réponse, ou null. */
function entreeDeLOutil($reponse, string $outil): ?array {
  foreach (is_array($reponse) ? ($reponse['content'] ?? []) : [] as $bloc) {
    if (($bloc['type'] ?? '') === 'tool_use' && ($bloc['name'] ?? '') === $outil && is_array($bloc['input'] ?? null)) {
      return $bloc['input'];
    }
  }
  return null;
}

/**
 * Lit le plan. `$image` : le JPEG en base64 ; `$textes` : ce que l'iPhone a
 * reconnu (Vision), [{t, x, y}] en millièmes. Rend ['ok' => true, 'lecture'
 * => …] ou ['ok' => false, 'raison' => …] — une raison qu'on peut montrer.
 */
function lirePlanPapier(string $image, string $media, array $textes): array {
  if (!defined('ANTHROPIC_CLE') || ANTHROPIC_CLE === '' || ANTHROPIC_CLE === 'À_REMPLIR') {
    return ['ok' => false, 'raison' => 'La lecture de plans n’est pas encore activée sur le serveur.'];
  }
  if (!in_array($media, ['image/jpeg', 'image/png'], true)) $media = 'image/jpeg';
  $octets = base64_decode($image, true);
  if ($octets === false || strlen($octets) < 2000) {
    return ['ok' => false, 'raison' => 'La photo n’est pas arrivée entière : recommencez.'];
  }
  if (strlen($octets) > 5 * 1024 * 1024) {
    return ['ok' => false, 'raison' => 'La photo est trop lourde : recommencez la prise.'];
  }
  // Les textes de l'iPhone, en lignes courtes : « 3,20 @ 412,118 ».
  $lignes = [];
  foreach (array_slice($textes, 0, 500) as $t) {
    if (!is_array($t) || !isset($t['t'], $t['x'], $t['y'])) continue;
    $mot = mb_substr(trim((string) $t['t']), 0, 60);
    if ($mot === '') continue;
    $lignes[] = $mot . ' @ ' . (int) $t['x'] . ',' . (int) $t['y'];
  }
  $textesLus = $lignes
    ? "\n\nTextes reconnus sur la photo par l’iPhone (texte @ x,y en millièmes, exacts) :\n" . implode("\n", $lignes)
    : '';
  $modele = defined('ANTHROPIC_MODELE') && ANTHROPIC_MODELE !== '' ? ANTHROPIC_MODELE : 'claude-sonnet-5-5';
  $lectures = [
    'bati' => [
      'outil' => outilPlanLu(),
      'consigne' => str_replace('@COMMUNE@', CONSIGNE_COMMUNE, CONSIGNE_STRUCTURE),
      'demande' => 'Lis le bâti de ce plan — toutes les pièces avec leur contour, tous les murs et cloisons, toutes les ouvertures, toutes les cotes — et rends-le par l’outil plan_lu.',
    ],
    'elec' => [
      'outil' => outilElectriciteLue(),
      'consigne' => str_replace('@COMMUNE@', CONSIGNE_COMMUNE, CONSIGNE_ELECTRICITE),
      'demande' => 'Relève tous les symboles électriques et de plafond de ce plan, un par un, et leurs liens, et rends-les par l’outil electricite_lue.',
    ],
  ];
  $corpsDe = function (array $l, bool $impose) use ($modele, $media, $image, $textesLus): array {
    return [
      'model' => $modele,
      'max_tokens' => 16000,
      'system' => $l['consigne'],
      'tools' => [$l['outil']],
      'tool_choice' => $impose ? ['type' => 'tool', 'name' => $l['outil']['name']] : ['type' => 'auto'],
      'messages' => [
        [
          'role' => 'user',
          'content' => [
            ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $media, 'data' => $image]],
            ['type' => 'text', 'text' => $l['demande'] . $textesLus],
          ],
        ],
      ],
    ];
  };
  $encoder = function (array $corps) {
    return json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
  };

  // Les deux lectures partent ensemble, l'outil imposé d'abord.
  $envois = [];
  foreach ($lectures as $cle => $l) {
    $e = $encoder($corpsDe($l, true));
    if ($e === false) {
      error_log('EchoPlan lecture-plan : json_encode — ' . json_last_error_msg());
      return ['ok' => false, 'raison' => 'La photo n’a pas pu être préparée pour la lecture : recommencez.'];
    }
    $envois[$cle] = $e;
  }
  $sorties = appelerEnParallele($envois);
  $reponses = [];
  foreach ($sorties as $cle => [$code, $brut]) {
    $reponses[$cle] = [$code, $brut, $brut === false ? null : json_decode((string) $brut, true)];
  }
  // Celles que l'outil imposé a fait refuser repartent, en laissant choisir.
  $aRefaire = [];
  foreach ($reponses as $cle => [$code, $brut, $r]) {
    if (refusDeLOutilImpose($code, $r)) $aRefaire[$cle] = (string) $encoder($corpsDe($lectures[$cle], false));
  }
  if ($aRefaire) {
    error_log('EchoPlan lecture-plan : outil imposé refusé, nouvel essai en « auto » (' . implode(', ', array_keys($aRefaire)) . ')');
    foreach (appelerEnParallele($aRefaire) as $cle => [$code, $brut]) {
      $reponses[$cle] = [$code, $brut, $brut === false ? null : json_decode((string) $brut, true)];
    }
  }

  // LE BÂTI EST INDISPENSABLE : sans lui, pas de plan.
  [$code, $brut, $reponse] = $reponses['bati'];
  if ($brut === false || $code === 0) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans ne répond pas : réessayez dans un instant.'];
  }
  if ($code === 429 || $code === 529) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans est très demandé : réessayez dans une minute.'];
  }
  if ($code !== 200 || !is_array($reponse)) {
    return ['ok' => false, 'raison' => raisonDuRefus($code, $reponse, $modele)];
  }
  if (($reponse['stop_reason'] ?? '') === 'max_tokens') {
    return ['ok' => false, 'raison' => 'Ce plan est trop chargé pour être lu d’un coup : photographiez-le en deux moitiés.'];
  }
  $lecture = entreeDeLOutil($reponse, 'plan_lu');
  if ($lecture === null) {
    return ['ok' => false, 'raison' => 'Le plan n’a pas pu être lu : réessayez.'];
  }

  // L'ÉLECTRICITÉ S'AJOUTE QUAND ELLE EST LUE : un plan sans ses symboles
  // vaut mieux qu'aucun plan.
  [$codeE, $brutE, $reponseE] = $reponses['elec'];
  $elec = $codeE === 200 ? entreeDeLOutil($reponseE, 'electricite_lue') : null;
  if ($elec !== null) {
    $lecture['symboles'] = is_array($elec['symboles'] ?? null) ? $elec['symboles'] : [];
    $lecture['liens'] = is_array($elec['liens'] ?? null) ? $elec['liens'] : [];
  } else {
    error_log('EchoPlan lecture-plan : électricité non lue (HTTP ' . $codeE . ')');
    $lecture['symboles'] = $lecture['symboles'] ?? [];
  }
  return ['ok' => true, 'lecture' => $lecture];
}
