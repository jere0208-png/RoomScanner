# EchoPlan — reprise de contexte

## Le projet

Application iOS de relevé 3D et de plans pour électriciens et architectes.
React Native 0.86 + TypeScript, Zustand (`scanStore`, `accountStore`),
react-native-svg. Module natif Swift maison dans
`modules/react-native-room-scan/` : RoomPlan/ARKit, CoreBluetooth (télémètre),
StoreKit 2, CoreGraphics (canevas 3D natif).
Dossier de travail : `C:\Users\jere0\Desktop\Nouveau dossier\RoomScanner`.

Je suis électricien, francophone. Réponds-moi en français, sans jargon inutile.

## Méthode de travail — non négociable

**Livraison.** `bash tools/ship.sh "message sans accents"` lancé EN
ARRIÈRE-PLAN. Toujours `git fetch origin` avant. INTERDIT d'éditer un fichier
tant que « Commit et push » n'est pas passé. Vérifie avec `git log --oneline -1`
et `git status -sb`, et confirme la conclusion du build GitHub
(`gh run list -L 3 --json headSha,status,conclusion`) — un « completed » de la
tâche ne vaut pas « livré ».

**Deux fois cette session j'ai annoncé une livraison qui n'était pas passée.**
Les deux causes sont à connaître :
- `bash tools/ship.sh … | tail -20` **masque le code de sortie** : le harnais
  rapporte « exit 0 » sur un script qui s'est arrêté avant le commit. Rediriger
  vers un fichier, jamais tuber ;
- j'ai enchaîné sur le chantier suivant **sans attendre le commit** du
  précédent. Résultat : deux sujets dans un seul commit, sous un message qui
  n'en annonce qu'un. Tant qu'une livraison n'a pas son commit, on n'attaque
  pas la suite.

**Test avant correctif.** On écrit d'abord un banc qui ÉCHOUE sur le code
actuel, et on VÉRIFIE qu'il échoue (`git stash push` sur le fichier corrigé,
relancer, `git stash pop`). Un banc qui décrit un comportement abandonné se
RÉÉCRIT en racontant les versions successives — jamais supprimé. Si le fichier
de banc disparaît (composant retiré), son histoire déménage dans le banc qui la
garde vivante.

**Un banc ne nomme jamais un réglage par son chiffre.** On cherche par NATURE.
Cinq bancs cherchaient la zone de toucher d'un mur par « strokeWidth === 30 » :
tous cassés le jour où ce 30 est devenu proportionnel. **Le même défaut est
revenu cette session par la porte du dessin** : le halo d'une lampe avait un
rayon de 54 pixels, juste sur une maquette vue de près, absurde dézoomé.

**N'INVENTE PAS UN DÉFAUT QUI N'A PAS EXISTÉ.** Deux fois cette session, j'ai
écrit dans un commentaire ou un README qu'un bug était corrigé, alors que le
banc, passé sur le code d'AVANT, montrait qu'il n'y en avait jamais eu :
- « une Odace coûtait plus qu'une Céliane » — faux, j'avais comparé un prix
  NOUVEAU à un prix ANCIEN, deux états du même fichier ;
- « la bascule de groupe n'est pas un vrai va-et-vient » — faux, les épreuves
  sont passées du premier coup.
Un commentaire qui invente un défaut est un mensonge à retardement, au même
titre qu'un commentaire qui décrit une intention. **Le réflexe qui sauve : faire
tourner le banc neuf sur le code d'avant, toujours.**

**Un banc peut passer (ou échouer) pour la mauvaise raison.** La liste
s'allonge, relis-la avant d'écrire :
- `PanResponder` ignore l'état de geste qu'on lui passe et le RECALCULE depuis
  `e.touchHistory` ; appelé avec un `touchBank` vide, il lance sur
  `touchActive` — l'épreuve échoue à côté de son sujet. Il faut un doigt
  crédible (voir `allumerlalumiere`, fonction `taper`) ;
- un banc de rendu 3D avait recopié la projection de la PLANCHE de référence,
  où l'inclinaison joue autrement — il mesurait une autre caméra ;
- un banc de toucher ne lisait que les transformations des GROUPES SVG : le
  jour où une forme a porté la sienne, les points et les formes étaient faux
  DE LA MÊME FAÇON, donc tout passait sans rien prouver ;
- le magasin Zustand SURVIT d'un banc à l'autre, **et son HISTORIQUE aussi** :
  `setState` ne touche pas le filet d'annulation, seul `reset()` l'efface ;
- servir `onLayout` à « la première vue qui se mesure » sert la mauvaise vue
  dès qu'on en ajoute une ;
- une épreuve peut ne RIEN démontrer : comparer 4 fils à 3 en 2,5 mm² pour
  montrer un gain de diamètre — les deux tombent sur le même ICTA ;
- **une épreuve peut vérifier l'OUTIL et non l'OUVRAGE** : `couronnefil`
  éprouvait `couronnes()` avec des longueurs écrites à la main, ce qui prouvait
  que la fonction sait compter par dix — pas que le bordereau l'appelle
  correctement. Il faut passer par `buyingList` ;
- **un jeu d'essai peut ne rien donner à mesurer** : sans `troncons`,
  `buyingList` rend un bordereau sans un mètre de fil, et le filtre ne trouve
  rien. L'épreuve échoue alors pour AUCUNE raison ;
- **une SONDE peut se tromper avant le code qu'elle mesure.** La sonde des
  cotes ignorait l'inclinaison des chiffres — le premier chiffre annoncé (28)
  était faux dans les deux sens ; le vrai départ était 40. **Toute mesure doit
  d'abord se mesurer elle-même**, et avoir son contrôle en sens inverse : on
  prouve que l'instrument SAIT voir une faute avant de déclarer qu'il n'y en a
  plus.

**Avant de créer un banc, `ls __tests__`.** J'ai écrasé `menumur.test.tsx` en
croyant le créer.

**Vérification à l'œil.** Tout dessin se regarde en image avant livraison :
PDF via `node tools/pdf-vers-svg.mjs fichier.pdf dossier/` puis `magick`. Pour
une icône ou une géométrie SVG, écrire un script de rendu dans le scratchpad et
regarder le PNG. Les planches de référence (`assets/rendu-reference/`) se
régénèrent par `npm run snapshots`. Pour l'UI React Native je ne peux pas voir
le rendu : je garantis la structure par bancs et je le dis.

**Une preuve à l'œil qui prouve quelque chose** : faire tourner le VRAI code (un
banc temporaire qui écrit ses résultats en JSON), puis dessiner CES nombres. Un
dessin qui recalcule la géométrie de son côté ne prouve rien. **Et une maquette
composée à la main ne prouve rien non plus** : j'ai montré deux fois au patron
un bouton « qui débordait » alors que c'était ma composition `magick` qui était
fausse — le composant, lui, tenait. Placer les éléments aux coordonnées
CALCULÉES sur les mesures déclarées par le composant, jamais au jugé.

**README = source de vérité.** Chaque livraison y ajoute le MOTIF en récit :
ce qui n'allait pas, pourquoi, ce qu'on a essayé et écarté, avec les chiffres.

**Commentaires.** Ils expliquent le POURQUOI et citent le relevé de chantier
qui a motivé le changement.

## Pièges de cet environnement

- **Les heredocs Git Bash mangent un niveau d'échappement** : écrire les
  scripts Python/JS avec l'outil Write dans le scratchpad, puis les exécuter.
- `python3` n'existe pas, seulement `python`. `/tmp` du bash ≠ `/tmp` de python.
- Pas de `useMemo` après un retour anticipé.
- Une valeur lue dans un `PanResponder.create` (via `useRef`) est FIGÉE au
  premier rendu : passer par une référence remise à jour à chaque rendu (voir
  `renduRef` dans `Iso3DView`).
- CRLF/LF font échouer les planches après un `git checkout` : `npm run snapshots`.
- **Un générateur qui réécrit tout après un repère mange le code écrit à la
  main.** Les outils ne réécrivent QUE le bloc entre deux repères.
- `findAllByType(Pressable)` ne trouve rien : chercher par prédicat. Et
  `findAll` SANS type attrape le composant ET son nœud natif : les listes
  sortent en double (vu en dumpant les volumes 3D).
- Dans un flux PDF, `escText` échappe les parenthèses (`\(`) : elles comptent
  DOUBLE dans une mesure de largeur. Éviter les parenthèses dans un libellé qui
  se taille sur sa place.
- svgrepo.com est derrière un pare-feu : passer par l'API Iconify.
- **Leroy Merlin et 123elec renvoient une page anti-robot (HTTP 403).
  Castorama et Amazon répondent au navigateur intégré** (`preview_start`,
  `javascript_tool`) — pas à `WebFetch` pour Amazon. Les extraits de recherche
  se trompent sur les prix : toujours ouvrir la fiche.
- `magick` (ImageMagick 7) et `ffmpeg` sont là. Pour composer :
  `magick fond.png calque.png -geometry +X+Y -composite sortie.png` — `-page`
  + `-layers flatten` décale le fond. `magick` ne rend pas les `data:` URI dans
  un SVG.
- Ne pas lancer `tsc`, `eslint` et `jest` en parallèle : la contention fait
  échouer des bancs de performance (`fluidite3d`, `viseur`).
- Le MCP **Mobbin est authentifié mais l'API exige un abonnement payant**
  (« paid plan required ») : inutilisable en l'état.

## Ce qu'on a appris à ne plus refaire

- **Une feuille modale ne défile pas.** `SheetShell` enveloppe son contenu dans
  deux `Pressable` ; un `Pressable` prend le geste DÈS LE POSÉ. **Pour une page
  qui défile : une PAGE entière, routée comme les autres écrans.**
- **Ce qu'on touche prime sur ce qui est à côté.** La cible TOLÉRANTE reste avec
  le dessin, la cible STRICTE passe au-dessus, et le plus petit passe devant.
- **Vérifier la boîte qu'on dessine, pas celle qu'on a demandée.**
- **Quand rien n'est libre, la valeur cède la place.**
- **Celui qui dessine annonce son encombrement, l'écran ne le devine plus.**
  Rencontré quatre fois : le peigne « Afficher », le bandeau du meuble, la
  fenêtre de découpe du PDF (`FENETRE_PLAN`), et la largeur de la légende.
- **Une seule source pour la boîte qu'on réserve et celle qu'on dessine.**
- **Une seule estimation de largeur de texte.** `fitText` mesurait à 0,52 em
  par signe et le calcul de largeur à 0,50 : deux centièmes, et « élévation »
  devenait « élévati ». La constante s'appelle `EM_TEXTE`.
- **L'ordre de tracé bat l'opacité.**
- **L'ordre de placement est un choix de métier** — « le cartouche évite les
  sigles, la cote évite les deux ». **L'ordre est celui des LIBERTÉS** : ce qui
  ne peut pas bouger s'inscrit d'abord, ce qui glisse s'écarte ensuite.
- **Un prix qu'on ne comprend pas ne se recopie pas**, et **on ne compare que
  des produits dont la RÉFÉRENCE est identique des deux côtés**.
- **Un recalage par famille est une béquille, jamais une réponse** : le
  disjoncteur 32 A était interpolé à 16,50 € et en vaut 23,90 — il n'y a pas de
  pente, il y a un seuil.

## Réglages à ne pas toucher sans me demander

Fond quadrillé du 2D · seuil de désenchevêtrement 5 cm · marge en regard 40 cm ·
recul de la rangée de commandes · rythme d'accueil 15 img/s · opacité et
amplitude du ruban · seuils de dénomination 60 % / 110 px/m · découpage des
faces aux jonctions · `DEBORD_PLAQUE` (2 px) · `POIDS_ECART` (500) ·
`PAS_SERIE` (0,60 m) · `RAYON_CIBLE` (22 px) · `PORTEE_LAMPE` (1,10 m) et
`HALO_PART` (0,30) · `EM_TEXTE` (0,52) · `RAYON_PLAFOND_MAX` /
`ECART_SIGLE_PLAFOND` · `COURONNE_DU_FIL`.
**Les 44 points du doigt** valent pour la CIBLE, jamais pour le dessin. Le
**scan de plan papier** a été construit puis RETIRÉ — ne pas le relancer.

## Repères posés, à connaître avant de toucher au plan

- `MARGE_RANGEE` (10) · `PEIGNE_TOTAL` · `ECHELLE_MAX_PLAN` (140 pts/m) ;
- `MAQUETTE` (`src/ui/maquette.ts`) : la palette 3D chaude ;
- `surfaceVoile` : ce qui se pose sur le plan ne le troue pas ;
- la cible d'un mur suit son poché (`max(12, poché + 6)`) ;
- `filtrerAuNiveau` s'applique AUSSI dans `FloorplanEditor` et `Iso3DView` ;
- `src/ui/geste.ts` — `GLISSEMENT_MIN = 10` et `creerSeuil()` ;
- `RetourGlisse` s'emploie EN ENVELOPPE (`BORD = 24`, `CAPTURE_MIN = 8`,
  `SUITE_MIN = 50`) ; il ne capture qu'EN ROUTE ;
- `gestureState.x0` vaut ZÉRO avant le `grant` : lire `departDuDoigt` ;
- `src/ui/mots.ts` : pluriels ET `pourChercher()` ;
- `src/geometry/cotes.ts` : `encombrement`, `plaqueDeCote`, `placerEtiquettes` ;
- `src/ui/etiquettesPlafond.ts` : la chaîne d'écarts, source unique ;
- `HAUTEUR_BANDEAU_MEUBLE` (191) et `..._COURANTE` (150) dans `ObjectBar` ;
- **`src/geometry/magasin.ts`** décrit (rayon, libellé, unité, offres),
  **`src/geometry/prix.ts`** chiffre. Jamais deux tables de prix ;
- **`src/net/tarifs.ts`** : catalogue distant, cache d'un jour, repli hors ligne.

## État au dernier commit (`925bee1`)

**2 463 bancs verts sur 237 suites**, `tsc` sans erreur, `eslint` sans erreur
(47 avertissements préexistants), arbre propre, build GitHub vert, IPA déposée.

## Ce qui a été livré dans la session précédente

- **`8adafbb`** — le PDF a eu le tour de l'écran : **47 chevauchements → 0** sur
  30 cadrages. Quatre familles écrivaient sans regarder personne ; l'ordre des
  libertés a été remis à l'endroit. `coteAPoser` corrige une boîte réservée qui
  n'était pas celle dessinée (décalage pris sur l'axe Y d'un texte incliné).
- **`663012a`** — les prix vont voir s'ils sont à jour au clic sur le devis :
  animation d'attente, trois issues (« actualisé » / « à jour » / « non
  vérifiés »), référence par ligne, catalogue distant `server/tarifs.json`.
- **`cc7bc6d`** — « Répéter » : six socles identiques ne sont plus six poses.
  Pas de 60 cm la première fois, puis l'écart réellement pris.
- **`2f9f60e`** — le **Magasin** (page entière), le caddie, les quantités
  ± dans le devis, 116 articles jusqu'aux vis, bouton Amazon conditionnel.
- **`495d2e6`** — le vrai logo Amazon (le mien, redessiné, ne ressemblait à
  rien) et un bandeau qui informe au lieu d'ordonner.
- **`08610ee` · `210eabb` · `6c66753` · `de0868b`** — le rayon électrique relevé
  en rayon chez Castorama, quatre passes : 12 articles manquants pour une
  rénovation (dont la **liaison équipotentielle**, obligatoire, absente), le
  peigne surestimé du double, le 32 A sous-estimé de moitié, la porte du coffret
  promise et non vendue, et **le fil 6 mm² qui n'existe pas en couronne de
  100 m** (`COURONNE_DU_FIL`).
- **`ed7f363`** — la légende explique enfin le plan (repère de mur, porte,
  fenêtre) et **cessait de tronquer ses propres libellés**.
- **`17d551e`** — on appuie sur l'interrupteur, la lumière s'allume (halo SVG,
  une seule boucle d'animation) **+ l'écran de lancement** porte la marque
  composée centrée, en clair et en sombre.
- **`e4a53ee`** — les volumes de salle d'eau se voient sur la maquette 3D, et
  l'appareil interdit rougit sur place.
- **`925bee1`** — le halo d'une lampe se mesure en mètres, plus en pixels.

---

# CE QU'IL Y A À FAIRE

## Il faut une compilation EAS pour voir

L'**écran de lancement** (storyboard natif), les **icônes redessinées**, et la
pose au viseur qui renvoie la cote relevée. Tout le reste arrive par
rechargement JS.

## Ce qui n'est pas du code et n'attend que toi

- **`server/tarifs.json`** : le catalogue de prix, à remplir après un passage en
  magasin (voir `server/tarifs.exemple.json`). Sans lui, l'app garde ses prix
  embarqués **et le dit**.
- **Le tag partenaire Amazon** : une ligne dans `magasin.ts`
  (`PARTENAIRE_AMAZON`), et tous les liens la portent.
- **La marque Amazon** : le logotype est déposé ; l'usage nominatif d'un lien
  marchand est ordinaire, mais Amazon encadre l'emploi de ses logos et demande
  normalement de passer par son programme partenaire.

## Idées de fonctionnalités déjà proposées, non faites

Dans le genre « la maquette devient un banc d'essai » :

1. **Le disjoncteur qui coupe** — toucher un départ au tableau éteint tout ce
   qu'il alimente en 3D ; on voit d'un coup « tout le logement sur un seul
   départ ». Réutilise les cibles et les halos déjà posés ;
2. **La prise montre son circuit** — toucher une prise éclaire ses sœurs du même
   départ et son disjoncteur : le pontage devient visible ;
3. **La charge d'un départ** — puissance cumulée face au calibre.

## Questions en attente de ma réponse

- **Nommer une pièce demande d'allumer « Surfaces » d'abord** — est-ce que ça
  gêne à l'usage ?
- **Les deux verts de la roue des circuits** (`#2E8B57` / `#127A5E`) ne sont
  séparés que de 33 sur 255. Laissé tel quel.
- **Le rythme des animations** que je ne peux pas voir : page d'avertissement du
  devis, attente des prix, **scintillement des lampes**.
- **Le pontage à travers un angle** : deux socles de part et d'autre d'un coin
  sont voisins pour un électricien, pas pour le calcul (règle « même pan »).
- **La symétrie prises / spots** : la proximité suffit pour les socles, pas pour
  les spots. Asymétrie assumée, à trancher.
- Le calque du plafond reste allumé par défaut : à garder ou non.
- Appliquer la correction des couleurs aux plans DÉJÀ enregistrés ?
- Viseur : aimanter une prise visée loin de tout palier (garde-fou 45 cm) ?
- App Store Connect : créer `echoplan.pro.mensuel` et `echoplan.pro.annuel`,
  confirmer le tarif annuel (49 €/an).
- L'illustration « Image » de la feuille d'export : cadre ou appareil photo.
- Deux vignettes produit approximatives : prise 20 A et prise 32 A.
- **Le retour haptique au lâcher d'un meuble**, à juger à l'usage.
- **La sortie choisie quand deux côtés sont libres** autour d'un meuble.
- **`PAS_SERIE` (60 cm)** et **`PORTEE_LAMPE` (1,10 m)** : réglages neufs.

## Défauts connus, non corrigés, chiffrés

- **95 articles du catalogue sur 116 restent estimés** (37 relevés en rayon).
  Rayons non relevés : courants faibles, consommables, outillage — les postes
  les plus légers d'un devis.
- **Deux couples Amazon prouvés seulement** (différentiel Legrand 092840 :
  72,90 € contre 47,49 € ; colliers Diall : 9,99 € des deux côtés). Chaque
  produit demande de lire deux fiches et de rapprocher les références.
- **Mosaic n'est pas une gamme de grande surface** : ses prix resteront estimés
  tant qu'on relèvera chez Castorama.
- 3D pendant un geste : seuil de reclassement à 4°, 6 angles fautifs sur 180.
  `src/geometry/bsp.ts` est JUSTE et INEMPLOYÉ (banc `bspcout`).
- 3D : la maquette n'occupe qu'au plus 46 % de la hauteur du cadre.
- Plan : 18 arêtes sur 90 angles effacées par un pan pourtant derrière elles.
- Une cote d'appareil peut s'effacer sur le PDF quand aucune place n'est libre.
- `rabattreSousLePlafond` ne traite que les murs qu'on lui passe.
- **Sur un logement très chargé, le nom d'un meuble** (« Canapé ») cède plus
  souvent qu'avant sur le PDF : les mots de l'appareillage réservent maintenant
  leur place avant lui. Conforme à sa propre règle, mais c'est une perte.
- **`17d551e` porte deux sujets** (les lumières 3D et l'écran de lancement) sous
  un message qui n'en annonce qu'un — conséquence d'un enchaînement trop rapide.
