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

**Test avant correctif.** On écrit d'abord un banc qui ÉCHOUE sur le code
actuel, et on VÉRIFIE qu'il échoue (neutraliser le correctif, relancer). Un
banc qui décrit un comportement abandonné se RÉÉCRIT en racontant les versions
successives — jamais supprimé. Si le fichier de banc disparaît (composant
retiré), son histoire déménage dans le banc qui la garde vivante.

**Un banc ne nomme jamais un réglage par son chiffre.** On cherche par NATURE.
Cinq bancs cherchaient la zone de toucher d'un mur par « strokeWidth === 30 » :
tous cassés le jour où ce 30 est devenu proportionnel.

**Un banc peut passer (ou échouer) pour la mauvaise raison.** La liste
s'allonge, relis-la avant d'écrire :
- `PanResponder` ignore l'état de geste qu'on lui passe et le RECALCULE depuis
  `e.touchHistory` ; appelé sans événement crédible, il lance ;
- un banc de rendu 3D avait recopié la projection de la PLANCHE de référence,
  où l'inclinaison joue autrement — il mesurait une autre caméra ;
- un banc de toucher ne lisait que les transformations des GROUPES SVG : le
  jour où une forme a porté la sienne, les points et les formes étaient faux
  DE LA MÊME FAÇON, donc tout passait sans rien prouver ;
- le magasin Zustand SURVIT d'un banc à l'autre, **et son HISTORIQUE aussi** :
  `setState` ne touche pas le filet d'annulation, seul `reset()` l'efface. Une
  épreuve qui annule remontait dans le plan de l'épreuve précédente ;
- servir `onLayout` à « la première vue qui se mesure » sert la mauvaise vue
  dès qu'on en ajoute une : le dessin reste à zéro pixel et le banc mesure du
  vide ;
- une épreuve peut ne RIEN démontrer : comparer 4 fils à 3 en 2,5 mm² pour
  montrer un gain de diamètre — les deux tombent sur le même ICTA ;
- **une SONDE peut se tromper avant le code qu'elle mesure.** La sonde des
  cotes ignorait l'inclinaison des chiffres : une cote de mur vertical est
  écrite en biais, son emprise est haute et étroite. Elle comptait des
  collisions imaginaires et en manquait d'autres — le premier chiffre annoncé
  (28) était faux dans les deux sens ; le vrai départ était 40. **Toute mesure
  doit d'abord se mesurer elle-même**, et toute mesure doit avoir son contrôle
  en sens inverse : on prouve que l'instrument SAIT voir une faute avant de
  déclarer qu'il n'y en a plus.

**Avant de créer un banc, `ls __tests__`.** J'ai écrasé `menumur.test.tsx` en
croyant le créer.

**Vérification à l'œil.** Tout dessin se regarde en image avant livraison :
PDF via `node tools/pdf-vers-svg.mjs fichier.pdf dossier/` puis `magick`. Pour
une icône ou une géométrie SVG, écrire un script de rendu dans le scratchpad et
regarder le PNG. Les planches de référence (`assets/rendu-reference/`) se
régénèrent par `npm run snapshots` et leur diff EST la preuve visuelle — quand
elles changent, comparer les éléments VISIBLES seulement (un script qui retire
les traits sans couleur et les étiquettes prouve que le dessin n'a pas bougé).
Pour l'UI React Native je ne peux pas voir le rendu : je garantis la structure
par bancs et je le dis. L'écorché 3D n'existe que dans l'app.

**Une preuve à l'œil qui prouve quelque chose** : faire tourner le VRAI code
(un banc temporaire qui écrit ses résultats en JSON), puis colorier ces
nombres. Un dessin qui recalcule la géométrie de son côté ne prouve rien.

**README = source de vérité.** Chaque livraison y ajoute le MOTIF en récit :
ce qui n'allait pas, pourquoi, ce qu'on a essayé et écarté, avec les chiffres.

**Commentaires.** Ils expliquent le POURQUOI et citent le relevé de chantier
qui a motivé le changement. **Un commentaire qui décrit une intention plutôt
que le code est un mensonge à retardement** — le mien a tenu vingt-quatre
heures avant qu'un banc ne le démente.

## Pièges de cet environnement

- **Les heredocs Git Bash mangent un niveau d'échappement** : écrire les
  scripts Python/JS avec l'outil Write dans le scratchpad, puis les exécuter.
  Un `python - <<'PY'` avec des apostrophes françaises échoue sans rien écrire,
  et la livraison part quand même : `ship.sh` s'exécute sur un README non
  modifié. C'est arrivé.
- `python3` n'existe pas, seulement `python`. `/tmp` du bash ≠ `/tmp` de python.
- Pas de `useMemo` après un retour anticipé.
- Une valeur lue dans un `PanResponder.create` (via `useRef`) est FIGÉE au
  premier rendu : passer par une référence. **Et une référence de geste doit se
  remettre à zéro au `grant`** — sinon le geste suivant hérite du précédent.
- CRLF/LF font échouer les planches après un `git checkout` : `npm run snapshots`.
- **Un générateur qui réécrit tout après un repère mange le code écrit à la
  main.** Les outils ne réécrivent QUE le bloc entre deux repères et refusent
  de travailler s'ils ne les trouvent pas.
- `findAllByType(Pressable)` ne trouve rien : chercher par prédicat. Et une
  flèche qui répète part sur `onPressIn`, pas `onPress` : un banc qui ne
  cherche que `onPress` la déclare absente.
- svgrepo.com est derrière un pare-feu : passer par l'API Iconify.
- Leroy Merlin et 123elec renvoient une page anti-robot. Pour chercher des
  images produit : DuckDuckGo `i.js` avec un `vqd` lu sur la page, puis `curl`.
- `magick` (ImageMagick 7) et `ffmpeg` sont là. `magick` rend mal les couleurs
  hexadécimales à 8 chiffres (`#RRGGBBAA`) — artefact du convertisseur, pas de
  l'app.
- Ne pas lancer `tsc`, `eslint` et `jest` en parallèle : la contention fait
  échouer des bancs de performance (`fluidite3d`, `viseur`) sans raison.

## Ce qu'on a appris à ne plus refaire

- **Une feuille modale ne défile pas.** `SheetShell` enveloppe son contenu dans
  deux `Pressable` ; un `Pressable` prend le geste DÈS LE POSÉ. **Pour une page
  qui défile : une PAGE entière, routée comme les autres écrans.**
- **Ce qu'on touche prime sur ce qui est à côté** : ni un halo invisible, ni un
  cartouche dessiné par-dessus n'ont le droit de voler l'appui d'un meuble.
  Recette : la cible TOLÉRANTE reste avec le dessin, la cible STRICTE passe
  au-dessus, et le plus petit passe devant.
- **Vérifier la boîte qu'on dessine, pas celle qu'on a demandée.**
- **Quand rien n'est libre, la valeur cède la place** : le trait de cote reste,
  le chiffre s'efface. Un chiffre sur un autre fait douter des deux.
- **Celui qui dessine annonce son encombrement, l'écran ne le devine plus.**
  Rencontré deux fois : le peigne « Afficher », puis le bandeau du meuble dont
  la réserve mentait de quatre-vingts points.
- **Une seule source pour la boîte qu'on réserve et celle qu'on dessine.** Deux
  calculs de la même chose divergent, et l'arbitre protège alors une place que
  le dessin n'occupe pas.
- **L'ordre de tracé bat l'opacité.** Une plaque opaque ne protège rien de ce
  qui se peint par-dessus.
- **L'ordre de placement est un choix de métier.** Le cartouche d'une pièce se
  pose AVANT les cotes : un nom se lit n'importe où dans sa pièce, une cote est
  attachée à ce qu'elle mesure. « Le cartouche évite les sigles, la cote évite
  les deux. »

## Sécurité

Ne jamais saisir à ma place un moyen de paiement, un RIB, un mot de passe ou un
code 2FA. Confirmer avant toute action irréversible ou sortante.

## Réglages à ne pas toucher sans me demander

Fond quadrillé du 2D · seuil de désenchevêtrement 5 cm · marge en regard 40 cm ·
recul de la rangée de commandes · rythme d'accueil 15 img/s · opacité et
amplitude du ruban · seuils de dénomination 60 % / 110 px/m · découpage des
faces aux jonctions · `DEBORD_PLAQUE` (2 px) · `POIDS_ECART` (500).
**Les 44 points du doigt** valent pour la CIBLE, jamais pour le dessin. Le
**scan de plan papier** a été construit puis RETIRÉ — ne pas le relancer sans
demande.

## État au dernier commit (`e57aa57`)

**2 298 bancs verts sur 222 suites**, `tsc` sans erreur, `eslint` sans erreur
(42 avertissements préexistants), arbre propre, build GitHub vert.

Repères posés, à connaître avant de toucher au plan :
- `MARGE_RANGEE` (10) · `PEIGNE_TOTAL` · `ECHELLE_MAX_PLAN` (140 pts/m) ;
- `MAQUETTE` (`src/ui/maquette.ts`) : la palette 3D chaude, partagée par
  l'écran ET les planches ;
- `surfaceVoile` : ce qui se pose sur le plan ne le troue pas ;
- la cible d'un mur suit son poché (`max(12, poché + 6)`) ;
- `filtrerAuNiveau` s'applique AUSSI dans `FloorplanEditor` et `Iso3DView` ;
- `src/ui/geste.ts` — `GLISSEMENT_MIN = 10` et `creerSeuil()` ;
- `RetourGlisse` s'emploie EN ENVELOPPE (`BORD = 24`, `CAPTURE_MIN = 8`,
  `SUITE_MIN = 50`) ; il ne capture qu'EN ROUTE ;
- `gestureState.x0` vaut ZÉRO avant le `grant` : lire `departDuDoigt` ;
- `src/ui/mots.ts` : pluriels ET `pourChercher()` ;
- `src/ui/cotesCourantes.ts` · `COTES_MENUISERIE` (`scanStore`) ;
- `src/geometry/cotes.ts` : `encombrement` (0,55 em/signe), `plaqueDeCote`,
  `placerEtiquettes` — **toute estimation de largeur de texte passe par là** ;
- `src/ui/etiquettesPlafond.ts` : la chaîne d'écarts, source unique ;
- `HAUTEUR_BANDEAU_MEUBLE` (191, le PIRE cas) et
  `HAUTEUR_BANDEAU_MEUBLE_COURANTE` (150) dans `ObjectBar`.

## Ce qui a été livré dans la session précédente

**`74995fd` — l'app n'est pas réservée aux électriciens.** La fin de scan ne
coche plus l'électricité d'office (les meubles restent cochés : ils ont été
DÉTECTÉS, l'élec est PROPOSÉE) ; la rangée d'édition met « Meuble » avant
« Appareil » ; la page Pro vend « Meubles, 3D et cotes au centimètre » en
deuxième position. Rien n'est retiré du métier.

**`117261b` — le meuble se cogne au lieu de se faire aspirer.** L'aimant de
25 cm est parti ; `poserLibre` ne déplace plus rien et ne dit que « la place
tient-elle ». Au lâcher, `rangerMeuble` : le mur arrête, le contour recadre,
les voisins ne se traversent pas — et quand le plus court chemin est bouché, il
sort de l'autre côté. Le meuble se ré-étiquette sur la pièce où il atterrit.

**`e2dfc8f` — deux défauts que la collision avait apportés.** Un glissement
coûtait DEUX annulations, et la première rendait le meuble dans un mur. Un
simple appui effaçait 80 cm de réglage à la flèche (le point visé survivait au
geste). Plus une sonde permanente : 289 lâchers par orientation sur le plan de
référence, droit et de biais, 0 dans un mur, 0 hors pièce.

**`9891d20` — quatre sujets.** La flèche fait comme le doigt (les trois aides
`alignToFit`/`fitInNook`/`hugWall` sont RETIRÉES DU SERVICE, gardées dans
`floorplan.ts` comme relevé, plus aucun chemin ne les appelle) ; l'écran
d'attente porte les deux logos centrés ; les plaques de cotes se taillent sur
leur texte (2 px) et sont opaques, et les gaines passent SOUS le calque du
plafond ; le bandeau du meuble passe de 5 rangées à 3 (150 pts au lieu de 217)
et annonce sa hauteur.

**`06a85da` — le rouge et le cartouche.** La roue des circuits perd ses deux
teintes rouges, sans remplacement (10 au lieu de 12) : sur le plan, le rouge ne
dit plus que la phase. `WIRE_COLORS.phase` est intact — c'est la norme. Le
cartouche d'une pièce suit le calque « Surfaces » dans les deux modes.

**`e57aa57` — le placement des cotes, 40 collisions → 0.** Trois systèmes qui
ne se parlaient pas, réunis en un seul arbitre. Une cote GLISSE le long de son
mur (dix places) au lieu de disparaître ; le cartouche se pose d'abord et cède
ligne par ligne ; les écarts de plafond entrent dans la même balance. Banc
`cotessanschoc` : 16 cadrages, zéro chevauchement, et il échoue sur 12 des 16
avec l'ancien code.

---

# CE QU'IL Y A À FAIRE

## Questions en attente de ma réponse

- **Nommer une pièce demande maintenant d'allumer « Surfaces » d'abord** —
  conséquence directe du cartouche qui suit son calque. À l'usage, est-ce que
  ça gêne ? Si oui, ouvrir une autre porte pour le nommage.
- **Les deux verts de la roue des circuits** (`#2E8B57` et `#127A5E`) ne sont
  séparés que de 33 sur 255, quand toutes les voisines de rang sont au-delà de
  50. Ils sont à huit rangs l'un de l'autre. Laissé tel quel et écrit au README.
- **Le rythme de la page d'avertissement** du devis et des animations : je ne
  peux pas les voir d'ici.
- **Les prix** de `src/geometry/prix.ts` : à valider ou corriger, table par
  gamme. C'est le seul endroit où l'app avance sans preuve.
- **Le pontage à travers un angle** : deux socles de part et d'autre d'un coin
  sont voisins pour un électricien, pas pour le calcul (règle « même pan »).
- **La symétrie prises / spots** : la proximité suffit pour les socles, pas
  pour les spots (il faut lier à la main). Asymétrie assumée, à trancher.
- Le calque du plafond reste allumé par défaut : à garder ou non.
- Appliquer la correction des couleurs aux plans DÉJÀ enregistrés ?
- Viseur : aimanter une prise visée loin de tout palier (garde-fou 45 cm) ?
- App Store Connect : créer `echoplan.pro.mensuel` et `echoplan.pro.annuel`,
  confirmer le tarif annuel (49 €/an).
- L'illustration « Image » de la feuille d'export : cadre ou appareil photo.
- Duplication d'un appareil : six socles identiques, c'est six poses — **il
  n'existe aucun geste de duplication**.
- La légende du plan PDF n'explique ni les repères ronds des murs ni les
  menuiseries.
- Deux vignettes produit approximatives : prise 20 A (montre une prise étanche)
  et prise 32 A (boîtier blanc peu lisible).
- **Le retour haptique au lâcher d'un meuble** : la même vibration disait
  « l'aimant a collé », elle dit maintenant « je t'ai rangé ». À juger à
  l'usage.
- **La sortie choisie quand deux côtés sont libres** autour d'un meuble : je
  prends le plus proche du point visé ; l'alternative est « du côté d'où le
  doigt arrive ».

## Défauts connus, non corrigés, chiffrés

- 3D pendant un geste : seuil de reclassement à 4°, 6 angles fautifs sur 180.
  Mesuré : à 1° il n'y a plus rien à voir. `src/geometry/bsp.ts` est JUSTE et
  INEMPLOYÉ — il gagne vingt fois en calcul et perd 75 % en tracés, et c'est le
  nombre de VUES NATIVES qui fait ramer. Le banc `bspcout` garde le verdict.
- 3D : la maquette n'occupe qu'au plus 46 % de la hauteur du cadre.
- Plan : 18 arêtes sur 90 angles effacées par un pan pourtant derrière elles.
- Une cote d'appareil peut s'effacer sur le PDF quand aucune place n'est libre.
- `rabattreSousLePlafond` ne traite que les murs qu'on lui passe.
- **Le PDF n'a pas eu le même tour que l'écran** pour le placement des cotes :
  il a sa propre discipline (`etiquettes`, `ecarterDe`, `auLarge`), plus
  ancienne, et personne ne l'a mesurée comme on vient de mesurer l'écran.

## Important

Le module natif a changé (la pose au viseur renvoie la cote relevée) et les
icônes d'application ont été redessinées : il faut une **compilation EAS** pour
voir « Prise plinthe placée à 25 cm » et le nouveau liseré de l'icône. Tout le
reste arrive avec un rechargement JS.

**Le MCP Mobbin est installé ET authentifié** (`https://api.mobbin.com/mcp`,
niveau utilisateur, statut « Connected »). Il donne accès à de vraies captures
d'applications, que tu VOIS — pas seulement des liens : recherche d'écrans,
recherche de parcours en plusieurs étapes, recherche par application.

**Il ne s'utilise pas tout seul : je dois te le demander.** Il sert à arbitrer
les questions de présentation que je ne peux pas trancher — le rythme de la
page d'avertissement du devis, l'illustration « Image » de la feuille d'export,
le positionnement « pas que pour les élec ». C'est un point de comparaison, pas
un modèle à décalquer : notre plan coté n'a pas d'équivalent dans une
bibliothèque d'apps grand public.

**Il ne remplace pas mon incapacité à voir EchoPlan.** Mobbin montre les écrans
des AUTRES ; le rendu de notre app sur le téléphone du patron reste invisible
pour moi.
