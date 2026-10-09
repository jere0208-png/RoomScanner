<?php
/**
 * ECHOPLAN — LA PAGE D'ENVOI DES NOTIFICATIONS.
 *
 * Relevé du patron : « un vrai système qui me permet d'envoyer ce que je
 * souhaite dans les notifications de l'app ». On ouvre cette page dans un
 * navigateur (https://bourseur.fr/echoplan-messages.php), on se connecte avec
 * le mot de passe de `messages-cle.php`, on écrit un titre et un texte, on
 * publie : le message s'ajoute à `messages.json`, que l'application lit à
 * chaque ouverture. On peut aussi retirer un message publié.
 *
 * Ce qui la protège :
 *   - le mot de passe, comparé en temps constant, et une pause après chaque
 *     échec ;
 *   - une session PHP, et un jeton anti-CSRF sur chaque formulaire ;
 *   - l'écriture du fichier sous verrou, par un fichier temporaire renommé :
 *     l'application ne lit jamais un JSON écrit à moitié ;
 *   - tout ce qui est affiché est échappé.
 */

declare(strict_types=1);

const FICHIER = __DIR__ . '/messages.json';
const GENRES = ['nouveaute' => 'Nouveauté', 'astuce' => 'Astuce', 'info' => 'Information', 'offre' => 'Offre'];
const ECRANS = ['' => '— Aucun écran —', 'pro' => 'Page Pro (abonnement)', 'exemple' => 'Appartement exemple', 'bibliotheque' => 'Mes plans', 'profil' => 'Profil'];

if (!is_file(__DIR__ . '/messages-cle.php')) {
  http_response_code(500);
  exit('Il manque messages-cle.php à côté de cette page (voir messages-cle.exemple.php).');
}
require __DIR__ . '/messages-cle.php';
if (!defined('MESSAGES_MDP') || MESSAGES_MDP === '' || MESSAGES_MDP === 'À_REMPLIR') {
  http_response_code(500);
  exit('Le mot de passe de messages-cle.php n’est pas rempli.');
}

session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Strict']);
session_start();
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

function e(string $s): string {
  return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function jeton_csrf(): string {
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
  return $_SESSION['csrf'];
}

function lire_messages(): array {
  if (!is_file(FICHIER)) return [];
  $j = json_decode((string) file_get_contents(FICHIER), true);
  return is_array($j['messages'] ?? null) ? $j['messages'] : [];
}

function ecrire_messages(array $messages): bool {
  $verrou = fopen(FICHIER . '.verrou', 'c');
  if (!$verrou || !flock($verrou, LOCK_EX)) return false;
  $tmp = FICHIER . '.' . bin2hex(random_bytes(4)) . '.tmp';
  $ok = file_put_contents(
    $tmp,
    json_encode(['version' => 1, 'messages' => array_values($messages)], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
  ) !== false && rename($tmp, FICHIER);
  if (!$ok && is_file($tmp)) unlink($tmp);
  flock($verrou, LOCK_UN);
  fclose($verrou);
  return $ok;
}

function champ(string $nom, int $max): string {
  // Un champ envoyé en liste (`nom[]=`) n'est pas un texte : on l'ignore.
  $v = $_POST[$nom] ?? '';
  return is_string($v) ? mb_substr(trim($v), 0, $max) : '';
}

$info = '';
$erreur = '';

// ---- Connexion / déconnexion
if (($_POST['faire'] ?? '') === 'connexion') {
  if (hash_equals(MESSAGES_MDP, champ('mdp', 200))) {
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
  } else {
    sleep(2);
    $erreur = 'Mot de passe incorrect.';
  }
}
if (($_POST['faire'] ?? '') === 'deconnexion') {
  $_SESSION = [];
  session_destroy();
  header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
  exit;
}

$connecte = !empty($_SESSION['admin']);

// ---- Publier / retirer
if ($connecte && in_array($_POST['faire'] ?? '', ['publier', 'retirer'], true)) {
  if (!hash_equals(jeton_csrf(), champ('csrf', 64))) {
    $erreur = 'Formulaire expiré : rechargez la page.';
  } elseif ($_POST['faire'] === 'publier') {
    $titre = champ('titre', 120);
    $texte = champ('texte', 4000);
    $genre = array_key_exists(champ('genre', 20), GENRES) ? champ('genre', 20) : 'info';
    $libelle = champ('libelle', 40);
    $ecran = array_key_exists(champ('ecran', 20), ECRANS) ? champ('ecran', 20) : '';
    $url = champ('url', 300);
    if ($titre === '' || $texte === '') {
      $erreur = 'Il faut un titre et un texte.';
    } elseif ($url !== '' && !preg_match('#^https://\S+$#i', $url)) {
      $erreur = 'Le lien doit commencer par https://';
    } else {
      $message = [
        'id' => 'm-' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(3)),
        'date' => gmdate('c'),
        'titre' => $titre,
        'texte' => $texte,
        'genre' => $genre,
      ];
      if ($libelle !== '' && ($ecran !== '' || $url !== '')) {
        $message['action'] = ['libelle' => $libelle] + ($ecran !== '' ? ['ecran' => $ecran] : ['url' => $url]);
      }
      $tous = lire_messages();
      array_unshift($tous, $message);
      $tous = array_slice($tous, 0, 100);
      if (ecrire_messages($tous)) $info = 'Publié. Les utilisateurs le verront à la prochaine ouverture de l’app.';
      else $erreur = 'Écriture impossible : vérifiez les droits du dossier.';
    }
  } else {
    $id = champ('id', 80);
    $tous = array_values(array_filter(lire_messages(), fn($m) => ($m['id'] ?? '') !== $id));
    if (ecrire_messages($tous)) $info = 'Message retiré.';
    else $erreur = 'Écriture impossible : vérifiez les droits du dossier.';
  }
}

$csrf = $connecte ? jeton_csrf() : '';
$messages = $connecte ? lire_messages() : [];
?>
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>EchoPlan — Notifications</title>
<style>
  :root{--bg:#F6F7F9;--carte:#fff;--encre:#0B0D12;--doux:#5A6472;--pale:#98A1AE;--trait:#E7EAF0;--bleu:#1F5BFF;--rouge:#E5484D;--vert:#1DB954}
  @media (prefers-color-scheme:dark){:root{--bg:#0D1015;--carte:#151A21;--encre:#F2F5F9;--doux:#A6B0BD;--pale:#67717F;--trait:#242C37;--bleu:#3D77FF}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--encre);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
  main{max-width:640px;margin:0 auto;padding:28px 18px 60px}
  h1{font-size:28px;letter-spacing:-.6px;margin:0 0 4px}
  .sous{color:var(--doux);margin:0 0 22px}
  .carte{background:var(--carte);border-radius:18px;padding:18px;margin-bottom:16px;box-shadow:0 6px 18px rgba(16,24,40,.06)}
  label{display:block;font-weight:600;font-size:14px;margin:12px 0 6px}
  input,select,textarea{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--trait);border-radius:12px;padding:11px 12px}
  textarea{min-height:150px;resize:vertical}
  .ligne{display:flex;gap:10px}.ligne>div{flex:1}
  .aide{color:var(--pale);font-size:13px;margin-top:4px}
  button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:12px 20px;cursor:pointer}
  .principal{background:var(--bleu);color:#fff;margin-top:16px;width:100%}
  .discret{background:transparent;color:var(--doux);padding:8px 12px}
  .retirer{background:transparent;color:var(--rouge);padding:6px 10px}
  .info{color:var(--vert);font-weight:600}.erreur{color:var(--rouge);font-weight:600}
  .msg{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--trait)}
  .msg:first-child{border-top:0}
  .msg h3{margin:0;font-size:16px}.msg p{margin:4px 0 0;color:var(--doux);font-size:14px;white-space:pre-wrap}
  .meta{color:var(--pale);font-size:12.5px}
  .puce{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg);color:var(--doux)}
  .entete{display:flex;justify-content:space-between;align-items:center}
</style>
</head>
<body>
<main>
<?php if (!$connecte): ?>
  <h1>Notifications</h1>
  <p class="sous">Espace réservé à l’éditeur d’EchoPlan.</p>
  <form class="carte" method="post" autocomplete="off">
    <input type="hidden" name="faire" value="connexion">
    <label for="mdp">Mot de passe</label>
    <input id="mdp" name="mdp" type="password" required autofocus>
    <?php if ($erreur): ?><p class="erreur"><?= e($erreur) ?></p><?php endif; ?>
    <button class="principal" type="submit">Se connecter</button>
  </form>
<?php else: ?>
  <div class="entete">
    <h1>Notifications</h1>
    <form method="post"><input type="hidden" name="faire" value="deconnexion"><button class="discret" type="submit">Se déconnecter</button></form>
  </div>
  <p class="sous">Ce que vous publiez ici arrive dans la cloche de l’application, chez tous les utilisateurs.</p>
  <?php if ($info): ?><p class="info"><?= e($info) ?></p><?php endif; ?>
  <?php if ($erreur): ?><p class="erreur"><?= e($erreur) ?></p><?php endif; ?>

  <form class="carte" method="post">
    <input type="hidden" name="faire" value="publier">
    <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
    <label for="titre">Titre</label>
    <input id="titre" name="titre" maxlength="120" required placeholder="Nouveau : …">
    <label for="texte">Message</label>
    <textarea id="texte" name="texte" maxlength="4000" required placeholder="Ce que vous voulez dire. Une ligne vide sépare deux paragraphes."></textarea>
    <label for="genre">Genre</label>
    <select id="genre" name="genre">
      <?php foreach (GENRES as $cle => $nom): ?><option value="<?= e($cle) ?>"><?= e($nom) ?></option><?php endforeach; ?>
    </select>
    <label>Bouton (facultatif)</label>
    <div class="ligne">
      <div><input name="libelle" maxlength="40" placeholder="Libellé, ex. Découvrir"></div>
      <div><select name="ecran"><?php foreach (ECRANS as $cle => $nom): ?><option value="<?= e($cle) ?>"><?= e($nom) ?></option><?php endforeach; ?></select></div>
    </div>
    <input name="url" maxlength="300" placeholder="ou un lien https://…" style="margin-top:8px">
    <p class="aide">Le bouton ouvre un écran de l’app, ou une page web si aucun écran n’est choisi.</p>
    <button class="principal" type="submit">Publier</button>
  </form>

  <div class="carte">
    <h2 style="margin:0 0 8px;font-size:18px">Publiés (<?= count($messages) ?>)</h2>
    <?php if (!$messages): ?><p class="meta">Aucun message pour l’instant.</p><?php endif; ?>
    <?php foreach ($messages as $m): ?>
      <div class="msg">
        <div style="flex:1">
          <span class="puce"><?= e(GENRES[$m['genre'] ?? 'info'] ?? 'Information') ?></span>
          <span class="meta"><?= e(date('d/m/Y H:i', strtotime((string) ($m['date'] ?? 'now')) ?: time())) ?></span>
          <h3><?= e((string) ($m['titre'] ?? '')) ?></h3>
          <p><?= e((string) ($m['texte'] ?? '')) ?></p>
        </div>
        <form method="post" onsubmit="return confirm('Retirer ce message de l’application ?')">
          <input type="hidden" name="faire" value="retirer">
          <input type="hidden" name="csrf" value="<?= e($csrf) ?>">
          <input type="hidden" name="id" value="<?= e((string) ($m['id'] ?? '')) ?>">
          <button class="retirer" type="submit">Retirer</button>
        </form>
      </div>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
</main>
</body>
</html>
