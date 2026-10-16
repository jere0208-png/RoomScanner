<?php
/**
 * BANC DE LA PREUVE APPLE — `php server/tests/preuve-apple-test.php`.
 *
 * Apple ne prête pas sa clé : on fabrique ici une chaîne de certificats DE
 * TEST (racine, intermédiaire, feuille, avec les marques d'Apple) et on signe
 * de fausses transactions avec la feuille. La racine de test est donnée à
 * `verifierPreuveApple` par son empreinte ; en production, c'est celle
 * d'Apple Root CA - G3 qui s'applique. Sort en code 1 au premier échec.
 */
require __DIR__ . '/../preuve-apple.php';

$dossier = sys_get_temp_dir() . '/echoplan-preuve-' . bin2hex(random_bytes(4));
mkdir($dossier);
$conf = $dossier . '/openssl.cnf';
file_put_contents($conf, implode("\n", [
  '[ req ]',
  'distinguished_name = dn',
  '[ dn ]',
  '[ racine ]',
  'basicConstraints = critical, CA:true',
  'keyUsage = critical, keyCertSign, cRLSign',
  '[ inter ]',
  'basicConstraints = critical, CA:true, pathlen:0',
  'keyUsage = critical, keyCertSign, cRLSign',
  APPLE_OID_INTERMEDIAIRE . ' = ASN1:NULL',
  '[ feuille ]',
  'basicConstraints = critical, CA:false',
  'keyUsage = critical, digitalSignature',
  APPLE_OID_FEUILLE . ' = ASN1:NULL',
  '[ feuille_sans_marque ]',
  'basicConstraints = critical, CA:false',
  'keyUsage = critical, digitalSignature',
  '',
]));

function cle() {
  return openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
}
function certificat(string $nom, $cle, $ca, $cleCa, string $section, string $conf) {
  $opts = ['config' => $conf, 'digest_alg' => 'sha256', 'x509_extensions' => $section];
  $csr = openssl_csr_new(['commonName' => $nom], $cle, $opts);
  $c = openssl_csr_sign($csr, $ca, $cleCa, 3650, $opts, random_int(1, PHP_INT_MAX));
  if ($c === false) {
    fwrite(STDERR, "Certificat impossible : " . openssl_error_string() . "\n");
    exit(1);
  }
  return $c;
}
function x5c($c): string {
  openssl_x509_export($c, $pem);
  return preg_replace('/-----[^-]+-----|\s/', '', $pem);
}
function b64u(string $o): string {
  return rtrim(strtr(base64_encode($o), '+/', '-_'), '=');
}
/** DER SEQUENCE{r, s} → R||S brut, 32 octets chacun. */
function brute(string $der): string {
  $i = 2;
  $sortie = '';
  for ($k = 0; $k < 2; $k++) {
    $n = ord($der[$i + 1]);
    $v = ltrim(substr($der, $i + 2, $n), "\0");
    $sortie .= str_pad($v, 32, "\0", STR_PAD_LEFT);
    $i += 2 + $n;
  }
  return $sortie;
}
function jws(array $charge, array $chaine, $cleFeuille): string {
  $tete = b64u(json_encode(['alg' => 'ES256', 'x5c' => array_map('x5c', $chaine)]));
  $corps = b64u(json_encode($charge));
  openssl_sign($tete . '.' . $corps, $der, $cleFeuille, OPENSSL_ALGO_SHA256);
  return $tete . '.' . $corps . '.' . b64u(brute($der));
}

$cleR = cle();
$racine = certificat('Racine de test', $cleR, null, $cleR, 'racine', $conf);
$cleI = cle();
$inter = certificat('Intermediaire de test', $cleI, $racine, $cleR, 'inter', $conf);
$cleF = cle();
$feuille = certificat('Feuille de test', $cleF, $inter, $cleI, 'feuille', $conf);
$cleS = cle();
$sansMarque = certificat('Feuille sans marque', $cleS, $inter, $cleI, 'feuille_sans_marque', $conf);
// Une autre racine, inconnue : même forme, autre clé.
$cleX = cle();
$autre = certificat('Racine inconnue', $cleX, null, $cleX, 'racine', $conf);
$cleXI = cle();
$interX = certificat('Intermediaire inconnu', $cleXI, $autre, $cleX, 'inter', $conf);
$cleXF = cle();
$feuilleX = certificat('Feuille inconnue', $cleXF, $interX, $cleXI, 'feuille', $conf);

$empreinte = openssl_x509_fingerprint($racine, 'sha256');
$bundle = 'fr.echoplan.app';
$maintenant = 1_800_000_000_000;
$charge = [
  'transactionId' => '2000000000000002',
  'originalTransactionId' => '2000000000000001',
  'bundleId' => $bundle,
  'productId' => 'echoplan.pro.mensuel',
  'purchaseDate' => $maintenant - 86_400_000,
  'expiresDate' => $maintenant + 29 * 86_400_000,
  'signedDate' => $maintenant - 1000,
  'environment' => 'Production',
  'type' => 'Auto-Renewable Subscription',
];
$chaine = [$feuille, $inter, $racine];
$verifier = fn(string $j, ?string $b = null) => verifierPreuveApple($j, $maintenant, $empreinte, $b ?? $bundle);

$echecs = 0;
function attendre(string $nom, bool $vrai): void {
  global $echecs;
  echo ($vrai ? 'ok    ' : 'ÉCHEC ') . $nom . "\n";
  if (!$vrai) {
    $echecs++;
  }
}

$bon = jws($charge, $chaine, $cleF);
$r = $verifier($bon);
attendre('un JWS valide est accepté', is_array($r) && $r['produit'] === 'echoplan.pro.mensuel'
  && $r['expiration'] === $charge['expiresDate'] && $r['transaction'] === '2000000000000001');
attendre('l’annuel aussi', is_array($verifier(jws(['productId' => 'echoplan.pro.annuel'] + $charge, $chaine, $cleF))));

[$t, $c, $s] = explode('.', $bon);
$sig = preuveB64url($s);
$sig[10] = chr(ord($sig[10]) ^ 1);
attendre('une signature altérée est refusée', $verifier("$t.$c." . b64u($sig)) === null);
$autreCharge = b64u(json_encode(['expiresDate' => $maintenant + 999 * 86_400_000] + $charge));
attendre('une charge réécrite est refusée', $verifier("$t.$autreCharge.$s") === null);

attendre('un autre bundleId est refusé', $verifier(jws(['bundleId' => 'com.autre.app'] + $charge, $chaine, $cleF)) === null);
attendre('le bon JWS, attendu pour une autre app, est refusé', $verifier($bon, 'com.autre.app') === null);
attendre('sans APPLE_BUNDLE_ID configuré, rien ne passe', verifierPreuveApple($bon, $maintenant, $empreinte) === null);
attendre('un produit étranger est refusé', $verifier(jws(['productId' => 'autre.produit'] + $charge, $chaine, $cleF)) === null);
attendre('un abonnement expiré est refusé', $verifier(jws(['expiresDate' => $maintenant - 1] + $charge, $chaine, $cleF)) === null);
attendre('un abonnement remboursé est refusé', $verifier(jws(['revocationDate' => $maintenant - 5] + $charge, $chaine, $cleF)) === null);

attendre('une racine inconnue est refusée', $verifier(jws($charge, [$feuilleX, $interX, $autre], $cleXF)) === null);
attendre('la racine Apple par défaut refuse la racine de test', verifierPreuveApple($bon, $maintenant, null, $bundle) === null);
attendre('une chaîne recousue (intermédiaire étranger) est refusée', $verifier(jws($charge, [$feuilleX, $inter, $racine], $cleXF)) === null);
attendre('une feuille sans la marque d’Apple est refusée', $verifier(jws($charge, [$sansMarque, $inter, $racine], $cleS)) === null);
attendre('une chaîne incomplète est refusée', $verifier(jws($charge, [$feuille, $racine], $cleF)) === null);
attendre('signé par une autre clé que la feuille : refusé', $verifier(jws($charge, $chaine, $cleI)) === null);

$tete = json_decode(preuveB64url($t), true);
$tete['alg'] = 'none';
attendre('alg « none » est refusé', $verifier(b64u(json_encode($tete)) . ".$c.") === null);
attendre('un texte quelconque est refusé', $verifier('pas.un.jws') === null && $verifier('') === null);

array_map('unlink', glob($dossier . '/*'));
rmdir($dossier);
echo $echecs === 0 ? "\nTout passe.\n" : "\n$echecs échec(s).\n";
exit($echecs === 0 ? 0 : 1);
