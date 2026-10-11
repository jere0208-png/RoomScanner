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
 * LA RÉPONSE EST TOUJOURS UN JSON VALIDE : Claude est forcé de répondre par
 * l'outil `plan_lu`, dont le schéma est écrit ici. Pas de texte libre à
 * interpréter, pas de « voici le plan : ».
 *
 * Configuration (config-echoplan.php) :
 *   ANTHROPIC_CLE     la clé d'API (console.anthropic.com) — jamais dans l'app ;
 *   ANTHROPIC_MODELE  facultatif, 'claude-sonnet-5-5' par défaut.
 */

const CONSIGNE_LECTURE = <<<'TXT'
Tu lis des plans de logement photographiés ou scannés (plans d'architecte, de constructeur, de notaire, croquis cotés, schémas d'électricien), pour les reconstruire fidèlement en plan 2D. Tu réponds UNIQUEMENT par l'outil `plan_lu`.

REPÈRE. Toutes les positions sont en MILLIÈMES de l'image : x de 0 (bord gauche) à 1000 (bord droit), y de 0 (bord haut) à 1000 (bord bas), en nombres entiers. Une épaisseur se donne en millièmes de la LARGEUR de l'image.

S'IL Y A PLUSIEURS PLANS sur la feuille (plusieurs niveaux, une coupe, une façade), lis seulement le plan du niveau principal, le plus grand. Ignore le cartouche, la légende (sauf pour comprendre les symboles), le cadre, la rose des vents, les échelles graphiques.

MURS. Un segment par pan de mur droit, tracé sur l'AXE du mur (au milieu de son épaisseur), d'une extrémité à l'autre : il va d'un coin ou d'une jonction à l'autre. Un mur percé d'une porte ou d'une fenêtre reste UN segment continu : les ouvertures se donnent à part. Chaque mur : [x1, y1, x2, y2, épaisseur]. Donne aussi les cloisons fines. Ne prends pas pour des murs : les lignes de cote et leurs lignes d'attache, les hachures, les meubles et appareils sanitaires, le mobilier de cuisine, les traits d'escalier, les lignes de construction, le cadre.

OUVERTURES. Chaque porte, porte-fenêtre, fenêtre, baie libre, passage, porte coulissante, porte de garage : `type` en clair, `a` et `b` les deux jambages (tableaux) POSÉS SUR L'AXE du mur qui la porte, et `largeur` le texte de sa largeur s'il est écrit (« 0,83 », « 90 », « 83 »).

COTES. Toutes les cotes écrites, une par une, y compris chacune des cotes d'une chaîne. `texte` : EXACTEMENT ce qui est écrit (« 3,20 », « 320 », « 3.20 m », « 2,40 »). `metres` : ta lecture en mètres. `a` et `b` : les deux extrémités de la LIGNE DE COTE, là où elle touche ses lignes d'attache (ou ses flèches, ses traits obliques). `reference` : « interieur » si la cote va d'un nu intérieur à l'autre (cote d'une pièce, tracée dedans), « exterieur » si elle va d'un nu extérieur à l'autre (hors tout), « axes » si elle va d'axe en axe de mur, « inconnu » si tu ne sais pas. Les textes reconnus par l'iPhone te sont donnés avec leur position : sers-t'en pour lire les chiffres exactement, sans en inventer.

PIÈCES. Chaque nom de pièce tel qu'écrit (« SÉJOUR », « Ch. 1 », « SDB »), `point` au centre du nom, et `surface` le texte de sa surface s'il est écrit (« 12,5 m² »).

SYMBOLES ÉLECTRIQUES ET DE PLAFOND. Chaque symbole présent, un par un : prises de courant (simples, doubles, triples, 20 A, 32 A, commandées), interrupteurs (simple allumage, double allumage, va-et-vient, bouton poussoir, variateur, volet roulant), prises RJ45 / téléphone / TV, points lumineux (DCL), appliques, spots, plafonniers, tableau électrique, sorties de câble, thermostats, boîtes de dérivation, détecteurs de fumée, bouches de VMC. `libelle` : ce que le symbole représente, en mots précis (« prise de courant 16 A », « double prise », « interrupteur va-et-vient », « point lumineux DCL au plafond », « prise RJ45 et prise de courant »). Si la feuille a une légende, lis-la et nomme chaque symbole comme elle le nomme. `code` : le sigle écrit à côté s'il y en a un (« PC », « S », « VV », « DCL », « 20A »). `point` : le centre du symbole. `nombre` : le nombre de postes sous la même plaque (une double prise : 2). `plafond` : vrai pour ce qui est au plafond (point lumineux, spot, plafonnier, détecteur, VMC).

LIENS. Les traits (souvent courbes ou pointillés) qui relient un interrupteur à ce qu'il allume : [indice de l'interrupteur, indice de ce qu'il allume], indices dans ta liste `symboles`.

HAUTEUR. La hauteur sous plafond si elle est écrite (« HSP 2,50 »), en mètres.

SI CE N'EST PAS UN PLAN, ou s'il est illisible (flou, coupé, trop loin) : `est_un_plan` faux et `raison` qui dit pourquoi en une phrase, à l'utilisateur.

N'INVENTE RIEN : ce dont tu n'es pas sûr, tu l'omets. Mieux vaut un mur de moins qu'un mur faux.
TXT;

/** Le schéma de la réponse : ce que `reconstruirePlan` attend. */
function outilPlanLu(): array {
  $point = ['type' => 'array', 'items' => ['type' => 'number'], 'minItems' => 2, 'maxItems' => 2];
  return [
    'name' => 'plan_lu',
    'description' => 'La lecture complète du plan photographié.',
    'input_schema' => [
      'type' => 'object',
      'properties' => [
        'est_un_plan' => ['type' => 'boolean'],
        'raison' => ['type' => 'string'],
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
        'pieces' => [
          'type' => 'array',
          'items' => [
            'type' => 'object',
            'properties' => [
              'nom' => ['type' => 'string'],
              'point' => $point,
              'surface' => ['type' => 'string'],
            ],
            'required' => ['nom', 'point'],
          ],
        ],
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
        'hauteur' => ['type' => 'number'],
      ],
      'required' => ['est_un_plan'],
    ],
  ];
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
  $consigne = 'Lis ce plan et rends-le par l’outil plan_lu.';
  if ($lignes) {
    $consigne .= "\n\nTextes reconnus sur la photo par l’iPhone (texte @ x,y en millièmes, exacts) :\n" . implode("\n", $lignes);
  }
  $modele = defined('ANTHROPIC_MODELE') && ANTHROPIC_MODELE !== '' ? ANTHROPIC_MODELE : 'claude-sonnet-5-5';
  $corps = [
    'model' => $modele,
    'max_tokens' => 16000,
    'system' => CONSIGNE_LECTURE,
    'tools' => [outilPlanLu()],
    'tool_choice' => ['type' => 'tool', 'name' => 'plan_lu'],
    'messages' => [
      [
        'role' => 'user',
        'content' => [
          ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $media, 'data' => $image]],
          ['type' => 'text', 'text' => $consigne],
        ],
      ],
    ],
  ];
  $curl = curl_init('https://api.anthropic.com/v1/messages');
  curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
      'content-type: application/json',
      'x-api-key: ' . ANTHROPIC_CLE,
      'anthropic-version: 2023-06-01',
    ],
    CURLOPT_POSTFIELDS => json_encode($corps, JSON_UNESCAPED_UNICODE),
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 170,
  ]);
  $brut = curl_exec($curl);
  $code = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
  curl_close($curl);
  if ($brut === false || $code === 0) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans ne répond pas : réessayez dans un instant.'];
  }
  $reponse = json_decode((string) $brut, true);
  if ($code === 429 || $code === 529) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans est très demandé : réessayez dans une minute.'];
  }
  if ($code !== 200 || !is_array($reponse)) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans a refusé la photo : réessayez, ou importez-la autrement.'];
  }
  if (($reponse['stop_reason'] ?? '') === 'max_tokens') {
    return ['ok' => false, 'raison' => 'Ce plan est trop chargé pour être lu d’un coup : photographiez-le en deux moitiés.'];
  }
  foreach ($reponse['content'] ?? [] as $bloc) {
    if (($bloc['type'] ?? '') === 'tool_use' && ($bloc['name'] ?? '') === 'plan_lu' && is_array($bloc['input'] ?? null)) {
      return ['ok' => true, 'lecture' => $bloc['input']];
    }
  }
  return ['ok' => false, 'raison' => 'Le plan n’a pas pu être lu : réessayez.'];
}
