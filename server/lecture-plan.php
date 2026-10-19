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
 * DES LECTURES CIBLÉES, EN MÊME TEMPS — relevé du patron, plan d'électricien
 * à l'appui : « il a scanné cela, rien à voir, manque beaucoup de murs ». Une
 * seule demande pour tout lire (murs, ouvertures, cotes, pièces, symboles,
 * liens) rendait, sur un plan chargé, une lecture résumée : 19 murs, aucune
 * cloison, aucun symbole sur une feuille qui en porte cent. Les MURS ET
 * OUVERTURES, les PIÈCES ET COTES et l'ÉLECTRICITÉ se lisent maintenant
 * chacun par sa demande, avec sa consigne, en parallèle (voir
 * `preparerLesLectures`) : chacune a toute son attention, et l'attente reste
 * celle d'une seule.
 *
 * LA FEUILLE ET SES LOUPES — relevé du patron : « ne repère pas les cloisons,
 * pas de porte ». Le lecteur reçoit la feuille entière et des loupes
 * quadrillées en millièmes (voir `vuesDuPlan`).
 *
 * LA RÉPONSE EST TOUJOURS UN JSON VALIDE : Claude répond par les outils
 * `murs_lus`, `pieces_lues` et `electricite_lue`, dont les schémas sont
 * écrits ici, et `lectureAssemblee` en refait la lecture qu'attend l'app.
 * Pas de texte libre à interpréter.
 *
 * Configuration (config-echoplan.php) :
 *   ANTHROPIC_CLE     la clé d'API (console.anthropic.com) — jamais dans l'app ;
 *   ANTHROPIC_MODELE       facultatif, l'électricité : 'claude-sonnet-5-5' par défaut ;
 *   ANTHROPIC_MODELE_PLAN  facultatif, le bâti : MODELE_DU_BATI par défaut.
 */
require_once __DIR__ . '/garde-fous.php';

/**
 * Ce qui vaut pour toutes les lectures : les images, le repère, le plan à lire.
 * `@VUES@` devient la description des vues envoyées (voir `vuesDuPlan`).
 */
const CONSIGNE_COMMUNE = <<<'TXT'
LES IMAGES. @VUES@

REPÈRE. Toutes les positions sont en MILLIÈMES DE LA FEUILLE ENTIÈRE : x de 0 (bord gauche) à 1000 (bord droit), y de 0 (bord haut) à 1000 (bord bas), en nombres entiers. Une épaisseur se donne en millièmes de la LARGEUR de la feuille.

UN SEUL PLAN. La feuille peut montrer plusieurs dessins (un autre niveau, une coupe, une façade, un plan de situation, un détail) : lis UNIQUEMENT le plan principal, le plus grand et le plus complet, et ignore tout le reste, même s'il porte des cotes. Ignore aussi le cartouche, la légende (sauf pour comprendre les symboles), le cadre, la rose des vents, les échelles graphiques, le ruban adhésif et ce qui entoure la feuille.

SOIS EXHAUSTIF. Un plan de maison porte couramment 40 à 120 pans de murs et cloisons, 15 à 40 ouvertures, et un plan d'électricien 50 à 200 symboles. Relève-les TOUS, un par un, sans résumer ni t'arrêter en route. N'invente rien que tu ne vois pas : mais ce que tu vois, tu le relèves.
TXT;

/** Les vues, quand il y a des loupes quadrillées. */
const VUES_LOUPES = <<<'TXT'
La première image est la feuille ENTIÈRE ; les suivantes sont des LOUPES sur des parties de la même feuille, qui se recouvrent un peu (leur légende dit quelle partie). Sur une loupe, les traits fins — cloisons, arcs de portes, vitrages, chiffres — sont deux à trois fois plus nets : c'est sur elles que tu relèves et que tu situes, la feuille entière sert à comprendre l'ensemble.
Chaque image porte un QUADRILLAGE VIOLET léger, gradué dans la marge du haut et de gauche en millièmes de la FEUILLE ENTIÈRE. Il ne fait pas partie du plan. Pour situer un point, lis ses coordonnées sur les graduations de l'image où il est le plus net, en interpolant entre deux lignes : sur une loupe, les nombres violets te donnent directement la position dans la feuille. Un objet vu sur deux loupes (dans leur recouvrement) ne se relève qu'UNE fois.
TXT;

/** La vue, quand la photo part seule (serveur sans GD). */
const VUES_SEULE = <<<'TXT'
Une seule image : la feuille entière.
TXT;

/** La lecture des murs et des ouvertures. */
const CONSIGNE_MURS = <<<'TXT'
Tu lis des plans de logement photographiés ou scannés (plans d'architecte, de constructeur, de notaire, croquis cotés, plans d'électricien), pour en reconstruire fidèlement le BÂTI en plan 2D. Ta part : les MURS et les OUVERTURES. Tu réponds UNIQUEMENT par l'outil `murs_lus`. Les pièces, les cotes et l'électricité ne te concernent pas : d'autres lectures s'en chargent.

@COMMUNE@

CE QU'EST UN MUR — chaque dessinateur a sa manière :
— MUR DE FAÇADE ou PORTEUR : épais (15 à 50 cm), poché noir, gris foncé, hachuré, ou dessiné en double trait avec ou sans remplissage. Souvent doublé côté intérieur d'un isolant (motif ondulé, bulles, croisillons, bande claire) : l'isolant fait partie du mur.
— CLOISON : mince (5 à 10 cm) — deux traits parallèles très rapprochés, remplis de gris clair ou de blanc, ou un seul trait épais sur un plan simple. C'est ce que les lectures oublient le plus : cherche-les sur les loupes entre chaque paire de pièces voisines. Deux pièces qui se touchent sont TOUJOURS séparées par un mur ou une cloison (une baie libre est une ouverture DANS un mur, pas une absence de mur). Les placards, les gaines, la cage d'escalier, les WC sont fermés par des cloisons.
— CE QUI N'EST PAS UN MUR : les lignes de cote (fines, avec des petits traits obliques ou des flèches et un nombre) et leurs lignes d'attache, les meubles et appareils (rectangles et ronds fins dans les pièces ou contre les murs : lits, tables, canapés, plan de travail, baignoire, lavabo, WC), les marches, les hachures seules, les traits mixtes ou pointillés (poutres, retombées, faux plafonds, projections, limites), le cadre, le cartouche, le quadrillage violet.

COMMENT TRACER UN MUR : un segment par pan droit, sur son AXE (au milieu de son épaisseur), d'une jonction à l'autre. Un mur s'arrête sur l'AXE du mur qu'il rencontre (jonction en T ou en L), pas sur sa face ni avant. Un mur continu reste UN segment, même percé d'ouvertures ou rejoint par des cloisons. Chaque mur : [x1, y1, x2, y2, épaisseur], l'épaisseur mesurée sur une loupe.

PROCÈDE DANS CET ORDRE.
1. CADRE : le rectangle qui contient le plan principal, [x1, y1, x2, y2].
2. LE CONTOUR EXTÉRIEUR, en entier : toutes les façades, retours et décrochements compris.
3. LES MURS PORTEURS intérieurs (refends).
4. LES CLOISONS, loupe par loupe : fais le tour de chaque pièce et vérifie que chacun de ses côtés est un mur que tu as relevé ; sinon, ajoute-le.
5. LES OUVERTURES, mur par mur, façades comprises :
   — porte : une interruption du mur avec un ARC fin (quart de cercle) et le trait du battant → « porte » (« porte d'entrée » sur la façade, « porte double » pour deux battants qui se font face) ;
   — porte coulissante : un ou deux traits parallèles au mur, décalés, sans arc → « porte coulissante » ;
   — fenêtre : une interruption du mur de façade traversée par 2 ou 3 traits fins parallèles au mur (vitrage, appui) → « fenêtre » ; avec des arcs ou jusqu'au sol (baie vitrée) → « porte-fenêtre » ;
   — passage : une interruption du mur sans arc ni vitrage, souvent soulignée d'un pointillé (le linteau) → « passage » ;
   — porte de garage → « porte de garage ».
   Chaque ouverture : `type`, `a` et `b` ses deux JAMBAGES (les deux bords de l'interruption) posés SUR L'AXE du mur, et `largeur` le texte de sa largeur s'il est écrit à côté (« 0,83 », « 90 », « 83 »). Chaque pièce a au moins une porte ou un passage : si tu n'en vois pas, cherche encore sur la loupe.

SI CE N'EST PAS UN PLAN, ou s'il est illisible (flou, coupé, trop loin) : `est_un_plan` faux et `raison` qui dit pourquoi en une phrase, à l'utilisateur.
TXT;

/** La lecture des pièces et des cotes. */
const CONSIGNE_PIECES = <<<'TXT'
Tu lis des plans de logement photographiés ou scannés (plans d'architecte, de constructeur, de notaire, croquis cotés, plans d'électricien), pour en reconstruire fidèlement le BÂTI en plan 2D. Ta part : les PIÈCES et les COTES. Tu réponds UNIQUEMENT par l'outil `pieces_lues`. Les murs, les ouvertures et l'électricité ne te concernent pas : d'autres lectures s'en chargent.

@COMMUNE@

1. PIÈCES. Chaque pièce ou espace clos À L'INTÉRIEUR du logement, nommé ou non : placards, dégagements, cage d'escalier, gaines compris ; PAS les espaces extérieurs (terrasse, balcon, jardin, piscine, parking). Pour chacune : `nom` tel qu'écrit (« SÉJOUR », « Ch. 1 », « SDB » ; « Placard », « Escalier » ou « Dégagement » si rien n'est écrit), `point` au centre du nom, `surface` le texte de sa surface s'il est écrit (« 12,5 m² »), et `contour` : les COINS INTÉRIEURS de la pièce, dans l'ordre du tour, au NU des murs (la face côté pièce, isolant compris dans le mur), lus sur une loupe. Une pièce rectangulaire a 4 coins, une pièce en L en a 6 ; suis chaque décrochement. Les contours de deux pièces voisines sont séparés par l'épaisseur de leur cloison.

2. COTES. Toutes les cotes écrites DU PLAN PRINCIPAL, une par une, y compris chacune des cotes d'une chaîne et les petites cotes d'épaisseur (« 10 », « 20 », « 30 »). Chaque cote : [x1, y1, x2, y2, texte, reference], où (x1, y1) et (x2, y2) sont les deux EXTRÉMITÉS DE LA LIGNE DE COTE — là où elle croise ses lignes d'attache (les petits traits obliques ou les flèches), pas la position du texte —, `texte` EXACTEMENT ce qui est écrit (« 3,20 », « 320 », « 3.20 m »), et `reference` : « interieur » (d'un nu intérieur à l'autre, d'une pièce), « exterieur » (hors tout du bâtiment), « axes » (d'axe en axe), « inconnu ». Les textes reconnus par l'iPhone te sont donnés avec la position de leur centre : sers-t'en pour lire les chiffres exactement.

3. HAUTEUR. La hauteur sous plafond si elle est écrite (« HSP 2,50 », « HSP : 2,27 »), en mètres.
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

/**
 * LES MURS ET LES OUVERTURES. Les murs en tableaux de nombres : une réponse
 * de cent murs tient en deux fois moins de texte — et un texte plus court se
 * rend plus vite, et sans s'arrêter en route.
 */
function outilMursLus(): array {
  $point = pointLu();
  return [
    'name' => 'murs_lus',
    'description' => 'Les murs et les ouvertures du plan principal, en millièmes de la feuille.',
    'input_schema' => [
      'type' => 'object',
      'properties' => [
        'est_un_plan' => ['type' => 'boolean'],
        'raison' => ['type' => 'string'],
        'cadre' => ['type' => 'array', 'items' => ['type' => 'number'], 'minItems' => 4, 'maxItems' => 4],
        'murs' => [
          'type' => 'array',
          'description' => '[x1, y1, x2, y2, épaisseur] : l’axe de chaque pan de mur.',
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
      ],
      'required' => ['est_un_plan', 'murs', 'ouvertures'],
    ],
  ];
}

/** LES PIÈCES ET LES COTES — les cotes en tableaux, pour la même raison. */
function outilPiecesLues(): array {
  $point = pointLu();
  return [
    'name' => 'pieces_lues',
    'description' => 'Les pièces (nom, surface, contour au nu) et les cotes du plan principal, en millièmes de la feuille.',
    'input_schema' => [
      'type' => 'object',
      'properties' => [
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
            'required' => ['nom', 'point', 'contour'],
          ],
        ],
        'cotes' => [
          'type' => 'array',
          'description' => '[x1, y1, x2, y2, texte, reference] : les extrémités de la ligne de cote, le texte écrit, et interieur | exterieur | axes | inconnu.',
          'items' => ['type' => 'array', 'items' => ['type' => ['number', 'string']], 'minItems' => 5, 'maxItems' => 6],
        ],
        'hauteur' => ['type' => 'number'],
      ],
      'required' => ['pieces', 'cotes'],
    ],
  ];
}

/**
 * LA LECTURE QUE L'APP ATTEND (voir `LectureBrute`, src/geometry/lecturePlan.ts),
 * refaite à partir des réponses des outils : les cotes en tableaux
 * redeviennent des objets, et ce qui est mal formé s'en va ici plutôt que
 * de troubler la reconstruction.
 */
function lectureAssemblee(array $murs, ?array $pieces, ?array $elec): array {
  $nombre = fn($v) => is_int($v) || is_float($v) || (is_string($v) && is_numeric($v));
  $pt = function ($p) use ($nombre) {
    return is_array($p) && count($p) >= 2 && $nombre($p[0]) && $nombre($p[1]) ? [(float) $p[0], (float) $p[1]] : null;
  };
  $lecture = [
    'est_un_plan' => !empty($murs['est_un_plan']),
    'murs' => [],
    'ouvertures' => [],
    'pieces' => [],
    'cotes' => [],
  ];
  if (isset($murs['raison']) && is_string($murs['raison'])) $lecture['raison'] = $murs['raison'];
  if (is_array($murs['cadre'] ?? null) && count($murs['cadre']) === 4) $lecture['cadre'] = array_map('floatval', $murs['cadre']);
  foreach (is_array($murs['murs'] ?? null) ? $murs['murs'] : [] as $m) {
    if (!is_array($m) || count($m) < 4) continue;
    $m = array_values($m);
    $ok = true;
    for ($i = 0; $i < min(5, count($m)); $i++) $ok = $ok && $nombre($m[$i]);
    if ($ok) $lecture['murs'][] = array_map('floatval', array_slice($m, 0, 5));
  }
  foreach (is_array($murs['ouvertures'] ?? null) ? $murs['ouvertures'] : [] as $o) {
    $a = $pt($o['a'] ?? null);
    $b = $pt($o['b'] ?? null);
    if (!is_array($o) || !$a || !$b) continue;
    $ouv = ['type' => (string) ($o['type'] ?? 'porte'), 'a' => $a, 'b' => $b];
    if (isset($o['largeur']) && (is_string($o['largeur']) || $nombre($o['largeur'])) && (string) $o['largeur'] !== '') $ouv['largeur'] = (string) $o['largeur'];
    $lecture['ouvertures'][] = $ouv;
  }
  if ($pieces) {
    foreach (is_array($pieces['pieces'] ?? null) ? $pieces['pieces'] : [] as $p) {
      $point = $pt($p['point'] ?? null);
      if (!is_array($p) || !$point || !is_string($p['nom'] ?? null)) continue;
      $piece = ['nom' => $p['nom'], 'point' => $point];
      if (isset($p['surface']) && is_string($p['surface']) && $p['surface'] !== '') $piece['surface'] = $p['surface'];
      $contour = array_values(array_filter(array_map($pt, is_array($p['contour'] ?? null) ? $p['contour'] : [])));
      if (count($contour) >= 3) $piece['contour'] = $contour;
      $lecture['pieces'][] = $piece;
    }
    $refs = ['interieur', 'exterieur', 'axes', 'inconnu'];
    foreach (is_array($pieces['cotes'] ?? null) ? $pieces['cotes'] : [] as $c) {
      if (!is_array($c) || count($c) < 5) continue;
      $c = array_values($c);
      if (!$nombre($c[0]) || !$nombre($c[1]) || !$nombre($c[2]) || !$nombre($c[3])) continue;
      $texte = trim((string) $c[4]);
      if ($texte === '') continue;
      $ref = strtolower(str_replace(['é', 'É'], 'e', (string) ($c[5] ?? 'inconnu')));
      $lecture['cotes'][] = [
        'texte' => $texte,
        'a' => [(float) $c[0], (float) $c[1]],
        'b' => [(float) $c[2], (float) $c[3]],
        'reference' => in_array($ref, $refs, true) ? $ref : 'inconnu',
      ];
    }
    if (isset($pieces['hauteur']) && $nombre($pieces['hauteur'])) $lecture['hauteur'] = (float) $pieces['hauteur'];
  }
  $lecture['symboles'] = is_array($elec['symboles'] ?? null) ? $elec['symboles'] : [];
  $lecture['liens'] = is_array($elec['liens'] ?? null) ? $elec['liens'] : [];
  return $lecture;
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
    CURLOPT_TIMEOUT => 160,
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
 * LES VUES DU PLAN — une vue d'ensemble et des LOUPES, quadrillées.
 *
 * Relevé du patron : « se trompe souvent, ne repère pas les cloisons, pas de
 * porte ». Une feuille A3 réduite à la définition que la vision regarde
 * (1 500 à 2 000 pixels), c'est une cloison de 7 cm sur 4 pixels et un arc
 * de porte d'un trait d'un pixel : ils disparaissent. La photo arrive donc
 * en pleine définition, et le lecteur reçoit, en plus de la vue d'ensemble,
 * la feuille découpée en loupes qui se recouvrent, chacune à la définition
 * qu'il regarde : chaque trait y a deux à trois fois plus de pixels.
 *
 * LE QUADRILLAGE — sur chaque vue, des lignes violettes légères et leurs
 * graduations, en MILLIÈMES DE LA FEUILLE ENTIÈRE. Une vision situe mal un
 * point au jugé, à quelques pour cent ; entre deux graduations lues, elle le
 * situe au millième. Et sur une loupe, elle lit directement la position
 * dans la feuille, sans calcul.
 *
 * Rend [['data' => base64, 'legende' => texte], …], la vue d'ensemble
 * d'abord — ou null sans GD (l'image part alors seule, comme avant).
 */
/*
  LA DÉFINITION QUE LE LECTEUR REGARDE : l'API réduit toute image à 1 568
  pixels de long et 1,15 mégapixel environ. Une feuille A3 entière y tient
  sur 1 275 pixels ; chaque vue part donc à cette définition, pas plus — le
  reste se perdrait —, et c'est le nombre de loupes qui apporte la finesse.
*/
const VUE_COTE = 1568;
const VUE_PIXELS = 1150000;
const QUADRILLAGE = [170, 0, 230];

function vuesDuPlan(string $octets): ?array {
  if (!function_exists('imagecreatefromstring')) return null;
  // Une image démesurée ne se déplie pas (revue « sécurité » : 1,7 Go pour un PNG de 775 Ko).
  if (imageTropGrande($octets) !== null) return null;
  @ini_set('memory_limit', '768M');
  $src = @imagecreatefromstring($octets);
  if (!$src) return null;
  $W = imagesx($src);
  $H = imagesy($src);
  $vues = [];
  // La vue d'ensemble : graduée tous les 50, lignes tous les 100.
  $vues[] = [
    'data' => vueQuadrillee($src, 0, 0, $W, $H, $W, $H, 100, 50),
    'legende' => 'Image 1 : la feuille entière (x 0–1000, y 0–1000).',
  ];
  // Les loupes : 2 × 2, ou 3 × 2 pour une feuille allongée, recouvrement 12 %.
  // Même d'une image modeste : la vision réduit ce qu'elle regarde, une
  // loupe lui montre les traits fins en grand.
  $long = max($W, $H);
  if ($long >= 1000) {
    $allonge = $long / max(1, min($W, $H)) > 1.25;
    $nx = $W >= $H ? ($allonge ? 3 : 2) : 2;
    $ny = $H > $W ? ($allonge ? 3 : 2) : 2;
    $rec = 0.12;
    $lx = 1 / ($nx - ($nx - 1) * $rec);
    $ly = 1 / ($ny - ($ny - 1) * $rec);
    $k = 2;
    for ($j = 0; $j < $ny; $j++) {
      for ($i = 0; $i < $nx; $i++) {
        $x0 = $i * $lx * (1 - $rec);
        $y0 = $j * $ly * (1 - $rec);
        $mx0 = (int) round($x0 * 1000);
        $my0 = (int) round($y0 * 1000);
        $mx1 = (int) round(min(1, $x0 + $lx) * 1000);
        $my1 = (int) round(min(1, $y0 + $ly) * 1000);
        $vues[] = [
          'data' => vueQuadrillee($src, $x0 * $W, $y0 * $H, ($mx1 - $mx0) / 1000 * $W, ($my1 - $my0) / 1000 * $H, $W, $H, 50, 10),
          'legende' => "Image {$k} : loupe sur x {$mx0}–{$mx1}, y {$my0}–{$my1}.",
        ];
        $k++;
      }
    }
  }
  imagedestroy($src);
  return $vues;
}

/**
 * Une vue : la part (sx, sy, sw, sh) de la feuille, à VUE_COTE pixels au
 * plus, quadrillée tous les `$pas` millièmes et graduée tous les `$grad`.
 */
function vueQuadrillee($src, float $sx, float $sy, float $sw, float $sh, int $W, int $H, int $pas, int $grad): string {
  // Une loupe peut agrandir un peu (une image modeste) ; la feuille, jamais.
  $k = min($pas < 100 ? 1.6 : 1, VUE_COTE / max($sw, $sh), sqrt(VUE_PIXELS / max(1, $sw * $sh)));
  $w = max(1, (int) round($sw * $k));
  $h = max(1, (int) round($sh * $k));
  // Une marge blanche en haut et à gauche porte les graduations, hors du dessin.
  $m = 26;
  $vue = imagecreatetruecolor($w + $m, $h + $m);
  imagefill($vue, 0, 0, imagecolorallocate($vue, 255, 255, 255));
  imagecopyresampled($vue, $src, $m, $m, (int) round($sx), (int) round($sy), $w, $h, (int) round($sw), (int) round($sh));
  imagealphablending($vue, true);
  [$r, $g, $b] = QUADRILLAGE;
  $ligne = imagecolorallocatealpha($vue, $r, $g, $b, 88);
  $fort = imagecolorallocatealpha($vue, $r, $g, $b, 40);
  $encre = imagecolorallocate($vue, $r, $g, $b);
  $mx0 = $sx / $W * 1000;
  $mx1 = ($sx + $sw) / $W * 1000;
  $my0 = $sy / $H * 1000;
  $my1 = ($sy + $sh) / $H * 1000;
  $X = fn(float $mx) => $m + ($mx - $mx0) / ($mx1 - $mx0) * $w;
  $Y = fn(float $my) => $m + ($my - $my0) / ($my1 - $my0) * $h;
  for ($v = (int) ceil($mx0 / $grad) * $grad; $v <= $mx1; $v += $grad) {
    $x = (int) round($X($v));
    if ($v % $pas === 0) imageline($vue, $x, $m, $x, $m + $h, $ligne);
    imageline($vue, $x, $m - ($v % $pas === 0 ? 10 : 5), $x, $m, $fort);
    if ($v % $pas === 0 || $grad >= 50) grandTexte($vue, (string) $v, $x, 1, $encre, 'centre');
  }
  for ($v = (int) ceil($my0 / $grad) * $grad; $v <= $my1; $v += $grad) {
    $y = (int) round($Y($v));
    if ($v % $pas === 0) imageline($vue, $m, $y, $m + $w, $y, $ligne);
    imageline($vue, $m - ($v % $pas === 0 ? 10 : 5), $y, $m, $y, $fort);
    if ($v % $pas === 0 || $grad >= 50) grandTexte($vue, (string) $v, 1, $y - 7, $encre, 'gauche');
  }
  ob_start();
  imagejpeg($vue, null, 84);
  imagedestroy($vue);
  return base64_encode((string) ob_get_clean());
}

/** Un texte de la police intégrée de GD, à taille lisible (une hauteur de 14 px). */
function grandTexte($img, string $t, int $x, int $y, int $couleur, string $cale): void {
  $f = 3;
  $lw = imagefontwidth($f) * strlen($t);
  $lh = imagefontheight($f);
  if ($cale === 'centre') $x -= (int) round($lw * 1.1 / 2);
  $petit = imagecreatetruecolor($lw, $lh);
  imagefill($petit, 0, 0, imagecolorallocate($petit, 255, 255, 255));
  [$r, $g, $b] = QUADRILLAGE;
  imagestring($petit, $f, 0, 0, $t, imagecolorallocate($petit, $r, $g, $b));
  imagecopyresampled($img, $petit, max(0, $x), max(0, $y), 0, 0, (int) round($lw * 1.1), (int) round($lh * 1.1), $lw, $lh);
  imagedestroy($petit);
  unset($couleur);
}

/**
 * LES TROIS LECTURES, PRÊTES À PARTIR — sans rien envoyer : le banc d'essai
 * (tools/banc-lecture) s'en sert pour éprouver exactement ce que le serveur
 * demande. `$octets` : l'image ; `$textes` : ce que l'iPhone a reconnu.
 *
 * LE BÂTI EN DEUX LECTURES — relevé du patron : « ne repère pas les
 * cloisons, pas de porte ». Une seule demande pour les murs, les ouvertures,
 * les pièces et les cotes rendait une réponse longue (8 000 à 12 000 mots
 * machine sur une maison) que le lecteur abrégeait : les cloisons et les
 * portes passaient les premières à la trappe. Les MURS ET OUVERTURES d'un
 * côté, les PIÈCES ET COTES de l'autre, et l'électricité à part : trois
 * lectures en parallèle, chacune courte et entière, et l'attente reste
 * celle d'une seule.
 */
function preparerLesLectures(string $octets, string $media, array $textes): array {
  // Les textes de l'iPhone, en lignes courtes : « 3,20 @ 412,118 ».
  $lignes = [];
  foreach (array_slice($textes, 0, 600) as $t) {
    if (!is_array($t) || !isset($t['t'], $t['x'], $t['y'])) continue;
    $mot = mb_substr(trim((string) $t['t']), 0, 60);
    if ($mot === '') continue;
    $lignes[] = $mot . ' @ ' . (int) $t['x'] . ',' . (int) $t['y'];
  }
  $textesLus = $lignes
    ? "\n\nTextes reconnus sur la feuille par l’iPhone (texte @ x,y du centre du texte, en millièmes de la feuille, exacts) :\n" . implode("\n", $lignes)
    : '';
  // Les vues : la feuille et ses loupes ; sans GD, la photo seule.
  $vues = vuesDuPlan($octets);
  $images = [];
  if ($vues && count($vues) > 1) {
    foreach ($vues as $v) {
      $images[] = ['type' => 'text', 'text' => $v['legende']];
      $images[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => 'image/jpeg', 'data' => $v['data']]];
    }
    $commune = str_replace('@VUES@', VUES_LOUPES, CONSIGNE_COMMUNE);
  } else {
    $images[] = ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $media, 'data' => base64_encode($octets)]];
    $commune = str_replace('@VUES@', VUES_SEULE, CONSIGNE_COMMUNE);
  }
  $lectures = [
    'murs' => [
      'outil' => outilMursLus(),
      'consigne' => str_replace('@COMMUNE@', $commune, CONSIGNE_MURS),
      'demande' => 'Relève tous les murs et cloisons de ce plan, puis toutes ses ouvertures, et rends-les par l’outil murs_lus.',
    ],
    'pieces' => [
      'outil' => outilPiecesLues(),
      'consigne' => str_replace('@COMMUNE@', $commune, CONSIGNE_PIECES),
      'demande' => 'Relève toutes les pièces de ce plan avec leur contour, puis toutes ses cotes, et rends-les par l’outil pieces_lues.',
    ],
    'elec' => [
      'outil' => outilElectriciteLue(),
      'consigne' => str_replace('@COMMUNE@', $commune, CONSIGNE_ELECTRICITE),
      'demande' => 'Relève tous les symboles électriques et de plafond de ce plan, un par un, et leurs liens, et rends-les par l’outil electricite_lue.',
    ],
  ];
  foreach ($lectures as &$l) {
    $l['contenu'] = array_merge($images, [['type' => 'text', 'text' => $l['demande'] . $textesLus]]);
  }
  unset($l);
  return $lectures;
}

/**
 * LE MODÈLE DU BÂTI — le plus capable par défaut : situer cent murs au
 * millième et ne pas oublier une cloison, c'est là que les modèles se
 * départagent. ANTHROPIC_MODELE_PLAN le choisit. L'électricité garde
 * ANTHROPIC_MODELE (Sonnet par défaut).
 */
function modeleDeLecture(string $quoi): string {
  if ($quoi === 'elec') {
    return defined('ANTHROPIC_MODELE') && ANTHROPIC_MODELE !== '' ? ANTHROPIC_MODELE : 'claude-sonnet-5-5';
  }
  return defined('ANTHROPIC_MODELE_PLAN') && ANTHROPIC_MODELE_PLAN !== '' ? ANTHROPIC_MODELE_PLAN : MODELE_DU_BATI;
}
const MODELE_DU_BATI = 'claude-opus-5-5';

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
  if (strlen($octets) > 9 * 1024 * 1024) {
    return ['ok' => false, 'raison' => 'La photo est trop lourde : recommencez la prise.'];
  }
  // Mesurée avant d'être décodée : neuf mégaoctets compressés peuvent se
  // déplier en plusieurs gigaoctets (voir `imageTropGrande`).
  $tropGrande = imageTropGrande($octets);
  if ($tropGrande !== null) {
    return ['ok' => false, 'raison' => $tropGrande];
  }
  $lectures = preparerLesLectures($octets, $media, $textes);
  $corpsDe = function (string $cle, array $l, bool $impose): array {
    return [
      'model' => modeleDeLecture($cle),
      'max_tokens' => 16000,
      'system' => $l['consigne'],
      'tools' => [$l['outil']],
      'tool_choice' => $impose ? ['type' => 'tool', 'name' => $l['outil']['name']] : ['type' => 'auto'],
      'messages' => [['role' => 'user', 'content' => $l['contenu']]],
    ];
  };
  $encoder = function (array $corps) {
    return json_encode($corps, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
  };

  // Les trois lectures partent ensemble, l'outil imposé d'abord.
  $envois = [];
  foreach ($lectures as $cle => $l) {
    $e = $encoder($corpsDe($cle, $l, true));
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
    if (refusDeLOutilImpose($code, $r)) $aRefaire[$cle] = (string) $encoder($corpsDe($cle, $lectures[$cle], false));
  }
  if ($aRefaire) {
    error_log('EchoPlan lecture-plan : outil imposé refusé, nouvel essai en « auto » (' . implode(', ', array_keys($aRefaire)) . ')');
    foreach (appelerEnParallele($aRefaire) as $cle => [$code, $brut]) {
      $reponses[$cle] = [$code, $brut, $brut === false ? null : json_decode((string) $brut, true)];
    }
  }

  /*
    LE MODÈLE DU BÂTI REFUSÉ — une clé sans accès à Opus (code 403 ou 404) :
    le bâti se relit avec le modèle de l'électricité plutôt que d'échouer.
  */
  $modeleRefuse = function (array $rep): bool {
    [$c, , $r] = $rep;
    $type = is_array($r) ? (string) ($r['error']['type'] ?? '') : '';
    return $c === 403 || $c === 404 || $type === 'permission_error' || $type === 'not_found_error';
  };
  $replis = [];
  foreach (['murs', 'pieces'] as $cle) {
    if ($modeleRefuse($reponses[$cle]) && modeleDeLecture($cle) !== modeleDeLecture('elec')) {
      $corps = $corpsDe($cle, $lectures[$cle], true);
      $corps['model'] = modeleDeLecture('elec');
      $replis[$cle] = (string) $encoder($corps);
    }
  }
  if ($replis) {
    error_log('EchoPlan lecture-plan : ' . modeleDeLecture('murs') . ' refusé, bâti relu avec ' . modeleDeLecture('elec'));
    foreach (appelerEnParallele($replis) as $cle => [$code, $brut]) {
      $reponses[$cle] = [$code, $brut, $brut === false ? null : json_decode((string) $brut, true)];
    }
  }

  // LES MURS SONT INDISPENSABLES : sans eux, pas de plan.
  [$code, $brut, $reponse] = $reponses['murs'];
  if ($brut === false || $code === 0) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans ne répond pas : réessayez dans un instant.'];
  }
  if ($code === 429 || $code === 529) {
    return ['ok' => false, 'raison' => 'Le lecteur de plans est très demandé : réessayez dans une minute.'];
  }
  if ($code !== 200 || !is_array($reponse)) {
    return ['ok' => false, 'raison' => raisonDuRefus($code, $reponse, modeleDeLecture('murs'))];
  }
  if (($reponse['stop_reason'] ?? '') === 'max_tokens') {
    return ['ok' => false, 'raison' => 'Ce plan est trop chargé pour être lu d’un coup : photographiez-le en deux moitiés.'];
  }
  $murs = entreeDeLOutil($reponse, 'murs_lus');
  if ($murs === null) {
    return ['ok' => false, 'raison' => 'Le plan n’a pas pu être lu : réessayez.'];
  }

  // LES PIÈCES ET L'ÉLECTRICITÉ S'AJOUTENT QUAND ELLES SONT LUES : des murs
  // sans les noms des pièces valent mieux qu'aucun plan.
  $lue = function (string $cle, string $outil) use ($reponses): ?array {
    [$c, , $r] = $reponses[$cle];
    $entree = $c === 200 ? entreeDeLOutil($r, $outil) : null;
    if ($entree === null) error_log('EchoPlan lecture-plan : ' . $cle . ' non lu (HTTP ' . $c . ')');
    return $entree;
  };
  return ['ok' => true, 'lecture' => lectureAssemblee($murs, $lue('pieces', 'pieces_lues'), $lue('elec', 'electricite_lue'))];
}
