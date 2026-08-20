# RoomScanner

Application mobile de scan d'appartement 3D : détection de murs/objets en temps
réel, mesures, modèle 3D exporté et plan 2D éditable.

- **iOS** : Apple **RoomPlan** (LiDAR) via un module natif Swift — murs, portes,
  fenêtres et objets paramétriques, export `.usdz`, visionneuse QuickLook.
  On scanne le logement d'une traite : **les pièces sont détectées ensuite**,
  dans le graphe des murs, puis nommées d'après le mobilier.
- **Android** : **ARCore** via un module natif Kotlin — détection de plans
  verticaux/horizontaux, export `.obj`. Résultat plus grossier qu'iOS
  (Android n'a pas d'équivalent de RoomPlan).
- **UI** : React Native 0.86. La vue AR native se rend elle-même à 60 FPS ;
  seuls des événements JSON throttlés traversent le bridge.

## Architecture

```
modules/react-native-room-scan/   Module natif autolinké (package local)
├── ios/        Swift : RoomScanManager (session RoomPlan), RoomColorSampler
│               (relevé des couleurs), module bridge, émetteur d'événements,
│               vue RoomCaptureView, QuickLook
├── android/    Kotlin : ScanEngine (plans→murs), ColorSampler, ARSceneView,
│               module bridge
└── src/        API JS typée (RoomScan, RoomScanView, scanEvents)

src/
├── store/scanStore.ts       État global (zustand). SOURCE DE VÉRITÉ = la liste
│                            de murs paramétrique, pas le maillage exporté.
├── geometry/floorplan.ts    3D→2D : segments au sol, soudure des coins,
│                            onglets des jonctions, découpe en pièces,
│                            surfaces, snap angulaire, projection m↔px
├── geometry/scene3d.ts      Scène 3D commune à la vue de l'app et au PDF
├── geometry/appearance.ts   Couleurs relevées au scan + semis du sol
├── native/useRoomScan.ts    Abonnement aux événements natifs + commandes
├── components/FloorplanEditor.tsx  Plan 2D SVG : coins déplaçables, cotes
├── screens/                 Home / Scan (HUD sur vue AR) / Résultat (plan éditable)
└── screens/result/          Ce que l'écran des résultats POSE PAR-DESSUS le
                             plan : ses sept feuilles modales, ses deux
                             rangées d'outils, et ses styles
```

### L'écran des résultats se lit en morceaux

C'est le fichier le plus risqué du dépôt : le plan, ses bandeaux, ses sept
fenêtres et huit cents lignes de styles y tenaient ensemble, et une retouche
de mise en page obligeait à traverser tout le reste pour arriver à la clé à
changer — deux fois, des styles y ont été cassés sans que personne le voie.

Ce qui se POSE PAR-DESSUS le plan vit désormais à côté, dans
`src/screens/result/` : le choix du format d'export, l'ajout d'une pièce, le
nom d'une pièce, la photo de repérage, le catalogue de mobilier, celui de
l'appareillage, le renommage du scan — et les deux rangées d'outils, celle du
plan et celle de la vue 3D. Les styles, eux, sont dans leur propre module :
`themedStyles` mémoïse par palette, donc tout le monde reçoit LE MÊME objet,
sans un style recalculé.

Les rangées d'outils LISENT LE MAGASIN plutôt que de se faire passer les
calques : `showFurniture`, `showSurfaces`, `solidWalls` y sont déjà, et les
faire transiter par l'écran n'ajoutait que douze propriétés à recopier.

**Le déplacement s'est prouvé, il ne s'est pas relu.** L'arbre rendu a été
vidé dans six états — lecture, export ouvert, édition, catalogue de mobilier,
établi électrique, vue 3D — avant et après : 1,77 Mo, identiques à l'octet
près. Et `bandeaux.test.tsx`, qui ne regardait que les bandeaux du bas, couvre
maintenant les sept feuilles et les deux rangées.

### Les pièces se détectent toutes seules

**Rien à découper à la main pendant le scan.** On parcourt le logement d'une
traite, et les pièces sont trouvées après coup, dans la géométrie.

**Avant de chercher les pièces, il faut couper les murs.** RoomPlan livre
l'enveloppe d'un seul tenant, et la cloison qui sépare deux pièces vient
s'appuyer au milieu d'un mur sans le couper. Tant que ce point de contact
n'est pas un nœud du graphe, aucun cycle ne passe par la cloison et
l'appartement entier ressort comme une pièce unique. `splitAtJunctions()`
coupe donc chaque mur là où un autre vient buter contre son flanc (à plus de
20 cm des bouts, sinon c'est un coin). C'est la condition sans laquelle toute
la détection est inutile en vrai.

Un appartement scanné d'un seul tenant est ensuite **un graphe de murs** :
les pièces en sont les faces. `detectRooms()` les énumère par le parcours classique des
faces d'un graphe planaire — à chaque nœud, on repart par l'arête qui suit
immédiatement celle par laquelle on est arrivé. Le parcours ferme chaque pièce
tout seul, et la face extérieure (le tour du logement) sort avec l'orientation
inverse : c'est à ça qu'on la reconnaît et qu'on la jette. Les murs qui ne
ferment rien (bout pendant, cloison isolée) ne créent pas de pièce, et les
boucles de moins de 1,2 m² sont du bruit de scan.

Conséquence sur le modèle de données : **un refend borde deux pièces**. C'est
donc la pièce qui liste ses murs (`RoomEntry.wallIds`), et non le mur qui
désigne sa pièce. `roomParts()` recalcule le contour à partir de cette liste,
ce qui reste juste quand on déplace un coin à l'édition. Faute de liste
(scans d'avant la détection), on retombe sur un regroupement par `roomId`.

**Le nom vient du mobilier.** `deduceRoomKind()` fait voter les meubles
trouvés dans la pièce : un lit ou un réfrigérateur tranchent à eux seuls
(poids 3), un four et un lave-vaisselle se cumulent, une table ou un évier ne
font que pencher la balance — un évier se trouve aussi bien dans une cuisine
que dans une salle de bains. En dessous de 2,5 points, on n'invente rien : la
pièce prend son rang, « Pièce 1 », « Pièce 2 ». Les homonymes sont numérotés
(« Chambre », « Chambre 2 »).

**Le cartouche se pose au large.** `interiorPole()` cherche le point de la
pièce qui maximise la distance au mur le plus proche — pas le barycentre, qui
tombe dans le mur dès que la pièce est en L. Le nom et la surface sont en
outre dessinés PAR-DESSUS le reste : ce sont des annotations, un mur ne doit
pas les trancher. Ce même point sert aussi à décider de quel côté d'un mur
se trouve « l'intérieur » quand on recale un meuble.

### Retoucher ce que la détection a trouvé

La détection est bonne, pas infaillible : une porte grande ouverte réunit deux
pièces, un placard en invente une. Quatre gestes la rattrapent, tous depuis la
barre qui s'ouvre en touchant le sol d'une pièce en mode édition.

- **Nommer** ouvre une liste (Séjour, Cuisine, Chambre, Couloir…) plutôt qu'un
  clavier ; les homonymes se numérotent tout seuls. « Autre… » reste possible.
- **Hauteur** fixe la hauteur sous plafond de la pièce — RoomPlan la donne mais
  se trompe sous une poutre, et c'est elle qui commande tout le métré mural.
- **Fusionner** réunit deux pièces : les murs communs cessent de border, le
  contour se referme sur l'enveloppe des deux. La cloison reste dessinée.
- **Scinder** pose une cloison en travers, perpendiculaire au grand axe. Ses
  deux bouts s'arrêtent EXACTEMENT sur le contour (rayon lancé depuis le point
  au large) : sans ça rien ne se soude, aucun nœud n'apparaît et la
  redétection ne verrait pas la coupure. On la déplace ensuite au doigt.

L'outil « pièces » de la barre du plan relance la détection sur le graphe
courant, en **gardant les noms donnés à la main** : chaque nouvelle pièce
hérite du nom de l'ancienne dont le point de cartouche tombe dedans.

### Ajouter une pièce, la fusionner, la détacher

Trois gestes qui n'en font qu'un, et dont deux ne marchaient pas.

**Une pièce ajoutée touche le logement.** Sans mur choisi, elle se posait à
droite de l'emprise avec un jeu d'un demi-mètre : une boîte flottant dans le
vide, reliée à rien. Le plan montrait deux logements, la détection n'y voyait
aucune cloison commune — et « fusionner » n'avait plus rien à réunir, d'où
l'impression qu'elle *ne faisait que renommer*. À défaut de choix, on prend
donc le mur **extérieur le plus long** : c'est là qu'on agrandit un logement
dans la vraie vie, et c'est celui qui a le plus de chances d'avoir de la place
derrière lui. Les refends sont écartés — leur accoler une pièce la poserait
dans l'une des deux qu'ils séparent.

**On ne fusionne que des voisines.** La fusion réunit deux listes de murs en
retirant ceux qu'elles ont en commun ; entre deux pièces qui n'en partagent
aucun, elle produit une pièce faite de **deux contours disjoints** — plus de
surface calculable, plus de métré, et à l'écran rien qu'un nom qui disparaît.
C'est très exactement le défaut relevé. Le magasin refuse maintenant, et
l'écran ne propose plus que les pièces mitoyennes : offrir un geste qui ne
peut pas aboutir use la confiance plus vite qu'un geste absent.

**Déplacer une pièce mitoyenne la détache.** Le déplacement refusait tout net
dès qu'un mur était partagé ; depuis que l'ajout accole toujours, cela
revenait à ne plus pouvoir déplacer aucune pièce ajoutée. Et laisser passer le
geste tel quel serait pire — le mur mitoyen appartient aussi à la voisine, le
tirer déchirerait son contour. La cloison se **dédouble** donc : la pièce
emporte sa copie, la voisine garde la sienne et ne bouge pas d'un millimètre.
C'est l'exact inverse de la soudure qui les recollera quand on la repoussera,
et c'est ce qui se passe quand on décolle deux boîtes qui se touchaient.

### Un mur présenté, c'est lui seul

La visite se place face à un mur et annonce ce qui s'y trouve : « Mur nord ·
Chambre, 5 appareils ». Les trois autres murs restaient dans le champ — celui
de gauche et celui de droite fuient vers l'œil et prennent la moitié de
l'image. On désignait un mur devant quatre murs.

Les autres sortent donc du champ le temps du carton, avec leurs menuiseries
et l'appareillage qui y est plaqué. Le sol, le mobilier et le plafond
restent : ils disent dans quelle pièce on se tient, et un pan de maçonnerie
seul dans le vide ne se comprend plus.

**Chaque face porte le mur dont elle vient** (`Face3D.wallId`), posé par
`buildScene` au moment où le mur se bâtit — la boucle qui marquait déjà sa
pièce et son côté. C'est nécessaire : un mur soudé à ses voisins n'a pas de
frontière franche dans l'espace, et le retrouver à la géométrie image par
image coûterait le prix d'une reconstruction.

Le filtre (`visibleAvecLeMur`) s'applique **à la peinture**, pas aux entrées
de `buildScene` — à la différence de `focusRoomId`, qui écarte les murs avant
de bâtir. Deux raisons : les onglets des coins d'un mur se calculent sur tout
le graphe, donc retirer les voisins déformerait la maçonnerie qu'on garde ; et
le cadrage doit rester celui du logement entier, sinon le modèle saute à
chaque mur présenté.

### Pousser un mur, le faire tourner

Un mur ne se retouchait que par ses **coins**, un par un. Décaler une cloison
de dix centimètres demandait donc de viser deux fois le même déplacement au
doigt — ce qui ne donne jamais deux fois le même : le mur arrivait de travers,
et on recommençait.

Ce sont pourtant les deux gestes du métier. On **pousse** une cloison — elle
reste parallèle à elle-même — et on la **pivote** — elle garde sa longueur.
Ils ont désormais leurs poignées, sur le modèle exact de celles du mobilier,
pour qu'il n'y ait rien à réapprendre : la prise est le mur lui-même, élargie
à trente points, et un rond bleu au bout le fait tourner.

Quatre décisions, toutes vérifiées au banc :

- **Les voisins restent accrochés.** Dans un logement, pousser une cloison
  ÉTIRE les deux murs qui la tiennent ; les laisser en place ouvrirait le
  contour, et la pièce cesserait d'avoir une surface. Tout point du plan qui
  coïncidait avec un bout du mur le suit — la même règle que pour un coin tiré
  à la main.
- **Le mur pivote autour de son MILIEU.** Autour d'un bout, l'autre extrémité
  part au loin et le geste devient impossible à viser ; autour du milieu, ce
  qu'on voit tourner est ce qu'on tient.
- **Les aimants rattrapent la main sans la contredire.** Une cloison poussée à
  trois centimètres de l'aplomb d'une autre est une cloison qu'on voulait
  aligner ; au-delà de douze, c'est un choix, et le reprendre serait
  insupportable. La rotation, elle, s'accroche tous les quinze degrés à trois
  près : un mur se pose d'équerre ou en biais à quarante-cinq, rarement à
  trente-sept.
- **L'angle s'écrit pendant qu'on tourne.** Sans lui, on tourne à l'aveugle —
  et c'est justement à l'aplomb qu'on veut revenir neuf fois sur dix.

**La rotation a été refaite après une vidéo du chantier** — « ça part dans
tous les sens ». Le premier jet lisait `locationX`/`locationY` de l'événement
pour situer le doigt : or ces coordonnées sont relatives À LA VUE TOUCHÉE — la
poignée, trente-quatre points de côté — et non au plan. L'angle calculé autour
du milieu du mur n'avait donc aucun sens et sautait à chaque image ; le mur
balayait le plan, et la pièce passait de 0,8 à 6,7 m² en trois dixièmes de
seconde. Ce qui est fiable, c'est la COURSE du doigt (`dx`/`dy`), dans les
mêmes unités que le plan : le doigt est à « départ + course », et l'angle se
calcule proprement. Trois garde-fous s'y ajoutent, parce qu'un pouce sur un
écran de six pouces n'est pas une souris : la poignée se pose
**perpendiculairement au milieu** du mur (dans le prolongement du bout, sur un
mur qui traverse l'écran, elle finissait dans un coin, parfois hors cadre), le
pas est borné à **vingt degrés** par le magasin — le seul endroit qui protège
de tout appelant, y compris d'un geste qu'on réécrira —, et la rotation
cumulée d'un geste s'arrête à **quatre-vingt-dix degrés** : un mur retourné de
plus est le même mur.

La prise du mur ne répond qu'au MOUVEMENT, jamais à l'appui : sans ce seuil de
six points, un simple appui pour désélectionner déplacerait le mur d'un cheveu.
Et ce qui est percé dedans — portes, fenêtres — voyage avec lui, sans quoi la
baie resterait en l'air.

### Un meuble se tire par ses bords

Régler un meuble à la cote, c'était taper une largeur : il fallait faire le
calcul dans sa tête pour qu'il aille JUSQU'AU mur. Sur un chantier, on ne
calcule pas — on tire le mètre jusqu'à la maçonnerie.

Sélectionner un meuble et demander ses cotes fait donc sortir **quatre
poignées, une par bord**. On en prend une et on tire : le bord suit le doigt,
le bord opposé ne bouge pas. Le geste ne compte que pour sa part utile — le
déplacement du doigt est projeté sur la normale du bord —, si bien qu'un
mouvement de travers ne fait pas partir le meuble en biais.

**L'aimant finit le geste, dans les deux sens.** À sept centimètres du nu d'un
mur qu'il longe, le bord s'y pose (`snapSideToWalls`) — et il s'aligne tout
autant sur le **bout d'un mur qui se termine** : le retour d'une cloison, le
jambage d'une porte, l'about d'un refend. Le plan de cet about est parallèle
au bord qu'on tire, c'est donc une ligne d'accroche comme un nu, et le meuble
arrive à fleur du passage. Il faut que l'about soit EN REGARD du bord, sans
quoi une cloison lointaine mais bien orientée tirerait le meuble à travers le
logement. Relevé du chantier : « on est contre une fin de mur et pourtant pas
d'alignement avec notre fin de meuble ». Viser l'affleurement à trois millimètres
près avec un doigt qui en couvre quinze n'est pas un geste humain, et « le
meuble touche le mur » n'est pas un détail de dessin : c'est ce qui décide
qu'une prise est accessible ou condamnée. Trois conditions pour accrocher — le
mur parallèle au bord à douze degrés près, le bord en face de lui et non dans
son prolongement, l'écart dans la portée —, faute de quoi la cloison d'en face
attirerait le meuble à travers la pièce. La main le sent, l'œil étant caché
par le doigt.

**Le geste est ancré à l'appui, et la maçonnerie l'arrête.** Deux fautes
filmées sur le chantier, un meuble contre un mur qu'on étire : il passait de
0,73 m à 0,44, sautait à 1,53 puis 1,93, traversait la cloison et finissait
ailleurs dans la pièce.

La première faute : rien n'arrêtait le geste. Le redimensionnement ne
consultait aucun mur. Le bord bute désormais au **nu**, jugé sur trois rayons
— le milieu du bord fixe et ses deux bouts : un seul rayon manque le mur qu'un
coin touche déjà, dans un logement dont les angles ne sont jamais droits.

La seconde explique les sauts : chaque image envoyait un pas **relatif**, donc
repartait d'une taille déjà corrigée par l'aimant ou par la butée — et la
correction se rajoutait à la suivante. Trois centimètres d'accroche devenaient
un mètre en trente images. La poignée retient donc le meuble tel qu'il était à
l'appui et envoie la distance **totale** parcourue depuis : à doigt égal,
résultat égal, quelle que soit la cadence des images. C'est l'invariant que le
banc vérifie, en rejouant le même geste en 5 images puis en 120.

Les poignées se posent **juste à l'extérieur** du contour. Posées dessus,
leurs quarante points de zone touchable se rejoignaient au milieu d'un meuble
de soixante centimètres : il devenait impossible de le déplacer, chaque appui
tombant sur une poignée.

**Les commandes suivent le meuble.** Pivoter, coter, retirer : trois pastilles
en rangée, centrées au-dessus de son contour, à quelques points de lui. Elles
étaient bornées au cadre du plan — dès que le meuble approchait d'un bord,
elles s'en détachaient et restaient plantées au milieu de l'écran, la croix
rouge posée sur un AUTRE meuble. Elles s'effacent maintenant avec lui quand il
sort du champ, et se reculent d'un cran quand les poignées sont là, pour ne
pas se superposer à celle du bord haut.

**Tenir une flèche, c'est continuer.** Un pas par appui, c'était vingt appuis
pour décaler un meuble de vingt centimètres. Le maintien répète donc, en
accélérant : la première demi-seconde reste lente — c'est encore le geste de
précision, celui pour lequel ces flèches existent — puis la cadence monte
jusqu'à **dix pas par seconde**, pas au-delà : plus vite, le meuble file et
l'on ne voit plus où il va. Le pas part à l'appui et non au relâchement, et
l'horloge meurt avec le bandeau — un doigt qui quitte l'écran pendant que la
fiche se ferme laisserait la répétition tourner sur un meuble absent.

**Et la flèche du bandeau prime sur l'aimant.** Le plaquage automatique
referme tout jour de moins de cinq centimètres : il reprenait chaque pas d'un
centimètre à peine posé, et l'on croyait le bouton mort — c'est justement
contre un mur qu'on se sert des flèches. `setObjectCenter` reçoit donc un
`aimant` : vrai au doigt, qui vise à peu près ; faux à la flèche, qui vise
juste.

### Ce que l'app recalculait pour rien

Trois chaînes de calcul tournaient à chaque rendu, sans rien produire de
neuf. Elles ne se voient pas — c'est du travail invisible qui mange des
images — et un banc les compte désormais (`fluiditecalculs.test.tsx`) : on ne
mesure pas des images par seconde depuis un banc d'essai, on mesure ce qui
les coûte.

**La liste des relevés redécoupait chaque plan à chaque frappe.** Chaque
ligne redessine le plan du scan en vignette et énumère ses pièces sous son
nom : deux appels à `roomParts()` par ligne et par rendu, soit soixante
découpages de logement à trente relevés — à chaque lettre tapée dans la
recherche. Or un scan enregistré est **immuable** : le retoucher en produit un
autre objet. Sa référence est donc une clé de cache exacte, et une `WeakMap`
laisse partir l'entrée avec le scan qu'on supprime.

**L'écran du plan redécoupait le logement à chaque geste** — et c'était le
moindre mal : `parts` sert de DÉPENDANCE à d'autres mémoïsations. Une
référence neuve à chaque image, ce sont des `useMemo` qui ne mémoïsent plus
rien.

**Et derrière, une chaîne de trois.** `roomInputsOf` → `wallToRooms` →
`fixturePlacement`, chacun nourrissant le suivant, et le dernier nourrissant
le cheminement des gaines. Le plus lourd des trois est `fixturePlacement`,
qui passe par `interiorSide` — lequel redécoupe le logement **pour chaque
appareil**. On recalculait donc tous les cheminements de câble du logement
pendant qu'un doigt déplaçait un meuble.

### Le plan ne réveillait plus tout l'écran

Relevé du chantier : « au mouvement, le modèle 3D bug moins que le 2D ». La
cause n'était pas le dessin — mesuré, le plan 2D en mouvement dessine
**quatre fois moins** de nœuds que la vue 3D (374 contre 1 387).

Elle était dans la **remontée d'état**. Le plan annonce sa position à l'écran
qui le porte, pour que la 3D reprenne le même cadrage quand on bascule ; cette
annonce partait à chaque image du geste, donc `ResultScreen` tout entier se
rendait soixante fois par seconde — bandeaux, rangée d'outils et sept feuilles
comprises. Le plan, lui, n'y était pour rien. Or le parent n'a besoin de cette
position **qu'au moment de basculer**, c'est-à-dire une fois le doigt levé :
elle attend donc la fin du geste.

### Un calque pour l'appareillage

Il était le seul élément du plan qu'on ne pouvait pas éteindre. Sur un
logement équipé, ses symboles couvrent la maçonnerie qu'on est venu regarder,
et il n'y avait aucun moyen de voir le plan nu sans supprimer quelque chose.
La pastille « Appareils » rejoint donc les calques — allumée au départ, c'est
le sujet de l'app, et **locale à l'écran** : elle repart allumée à chaque
ouverture, parce que l'éteindre est un geste ponctuel, « pour voir dessous »,
pas un réglage qu'on garde et qu'on oublie. Elle ne s'appelle pas « Élec » :
c'est déjà le nom de la commande qui ouvre l'établi depuis un mur, et deux
boutons du même écran ne peuvent pas porter le même mot pour deux gestes
différents.

### Le chevron de retour était un caractère

Dans l'en-tête d'un scan, le bouton de retour côtoie le partage et le « … ».
Ces deux-là sont des icônes vectorielles, centrées dans leur rond par
construction ; le chevron, lui, s'écrivait « ‹ » et se posait sur une ligne de
base. Il tombait trop bas, on l'avait remonté de trois points à la main — un
réglage qui ne vaut que pour une police et une taille. C'est la même leçon que
la croix de fermeture, et `BackChevron` la applique aux quatre écrans qui
portaient ce caractère.

Au passage, le banc d'accessibilité a rattrapé la conséquence : le caractère
servait de NOM au bouton pour un lecteur d'écran. Devenu tracé, il ne dit plus
rien — le nom s'écrit.

### Trois caractères qui n'étaient pas des icônes

C'est la même leçon, payée trois fois — après la croix de fermeture, qui
l'avait déjà écrite.

- **Le chevron de retour** (« ‹ ») se posait sur une ligne de base, à côté de
  deux icônes vectorielles centrées par construction. Il tombait trop bas, on
  l'avait remonté de trois points à la main : un réglage qui ne vaut que pour
  une police et une taille.
- **Le soleil du bouton de thème** (« ☀ ») : iOS le rend en EMOJI COULEUR.
  Un soleil jaune et ombré, au milieu d'une interface dont tous les autres
  pictogrammes sont des traits gris — et un emoji ignore `color`, donc rien ne
  permettait de le calmer. `ThemeGlyph` dessine le soleil et la lune — en
  **27 points** dans leur pastille de 46 : à 21, le glyphe était un
  pictogramme timide à côté des autres (relevé du patron).
- **La trouée des ouvrants** n'est pas un caractère, mais elle relevait du
  même à-peu-près : dessinée trois centimètres plus large que le mur DE CHAQUE
  CÔTÉ — seize pour un mur de dix —, elle laissait un liseré clair tout autour
  de chaque porte et de chaque fenêtre. Sur le plan, cela se lit comme un fond
  blanc collé à la menuiserie. Elle garde un cheveu de débord, sans lequel
  l'anticrénelage laisse un trait de poché en travers de la baie ; le banc du
  plan mesure maintenant son épaisseur contre celle du mur.

### Un détail du thème sombre

Les feuilles qui tombent dans un dossier prenaient la teinte de surface du
thème : en mode sombre, des feuilles **noires** tombaient dans un dossier bleu
foncé, et l'on ne voyait plus rien tomber. Une feuille est blanche, quel que
soit le thème.

### Garde-fou visuel

Les tests vérifient des nombres ; aucun n'a vu le jour où le pointillé des
passages s'est mis à contaminer tout le modèle. `assets/rendu-reference/`
contient donc **quatre SVG versionnés** — quatre angles de l'appartement de
référence (`src/export/snapshotFixture.ts` : deux pièces, un refend, une porte
fermée, une porte ouverte, une baie, une fenêtre, trois meubles dont une télé
plaquée au mur). Le rendu passe par exactement le même chemin que la vue de
l'app : `buildScene`, `sceneFraming`, masquage des faces arrière, tri du
peintre, `shadeFill`.

Le job `checks` de la CI les recompare à chaque poussée : **toute modification
qui change l'image fait échouer le build avant même la compilation iOS**, et
le diff apparaît dans la pull request. Quand le changement est voulu :
`npm run snapshots`, puis on relit le diff avant de valider.

**Les feuilles du PDF se regardent aussi** — Ghostscript absent, c'est
`node tools/pdf-vers-svg.mjs <fichier.pdf> <dossier>` qui rend chaque page en
SVG (puis `magick page.svg page.png`). Le script interprète le petit jeu
d'opérateurs de la classe `Draw`, transparence de l'écorché comprise. C'est en
REGARDANT ces feuilles qu'ont été trouvés le chiffre de conducteurs recouvert
par sa pastille de repère, les cotes de perspective tranchées par la
maçonnerie, et le canapé invisible derrière un mur que l'écran, lui, efface.

### Sélectionner un mur

Toucher un mur en mode édition **estompe tout le reste du plan** et redessine
ce mur par-dessus le voile. Ses commandes — cotes, ajouter une ouverture,
électricité, supprimer — viennent se poser **à côté de lui**, décalées vers
l'intérieur de la pièce et bornées au cadre : jamais hors de l'écran.

**Le menu est une pilule, et la poignée de rotation prend l'autre flanc.**
Relevé du patron, capture à l'appui : le rond bleu de rotation se posait SUR
la barre des quatre gestes. Les deux se plaçaient perpendiculairement au
milieu du mur — le menu du côté de la pièce, la poignée d'un côté FIXE : dès
que ces côtés coïncidaient, quatorze points les séparaient. Le côté de la
pièce appartient au menu — c'est là qu'on lit ; la poignée, qui est un
geste, prend TOUJOURS l'autre flanc, bornée au cadre. Et parce que la barre
est large, son écart au mur se calcule sur son encombrement RÉEL projeté
sur la direction du décalage — le long d'un mur vertical, un écart fixe
laissait une demi-barre de l'autre côté, précisément sur la poignée — et
contre la position vraiment occupée par celle-ci, que la borne du cadre a
pu rappeler vers le mur. Le banc le prouve mur par mur, sur tout le
logement de référence. Le menu lui-même s'est allégé — « trop imposant et
vieillot » : colonnes resserrées d'un quart, rayon de pilule, filet d'un
cheveu comme les cartes de l'app, ombre adoucie.

Ce qu'il mesure tient en **une ligne au pied du plan** : « 3,93 m · 2,50 m
sous plafond », et UN bouton — « Mesures », précédé d'un crayon. Il s'est
appelé « Coter », du jargon de dessinateur — relevé du patron : « tout le
monde ne comprend pas facilement » — et un second bouton « Hauteur »
doublait la rangée pour une retouche rare : la hauteur reste réglable par
la pièce (barre du sol) et par le retour d'un mur percé. Le crayon est un
tracé dans la main du jeu d'icônes, pas un caractère — un « ✏️ » serait un
emoji couleur qui ignore la teinte du bouton, la leçon du soleil du thème.
Le champ de saisie posé à demeure coûtait une barre entière — étiquette,
saisie, unité, bouton d'application — pour un geste qu'on fait rarement, et
il mangeait le dessin qu'on est justement en train de regarder. La question
se pose maintenant à l'écran, le temps d'y répondre. Au passage, plus de
clavier qui remonte par-dessus la barre : c'est ce défaut-là qui l'avait
déjà fait déménager une fois.

**Un mur percé se touche par morceaux.** Sur le chantier, un mur avec une
baie n'est pas un objet : ce sont deux *retours* de maçonnerie et un vide
entre eux, et c'est le retour qu'on mesure, qu'on perce, sur lequel on décide
où passe la prise. Un appui bref sur un retour ne prend donc que lui — il se
colore, sa longueur s'inscrit à côté, et une note au coin du plan rappelle la
suite : **appui long (0,9 s) pour prendre le mur entier**, ouvertures
comprises, avec son voile et ses commandes. Un mur plein n'a pas de retour :
le toucher continue de le sélectionner d'un coup, sinon on aurait compliqué
le geste courant sans rien apporter. La note ne s'affiche que quand un retour
est tenu ; rien de sélectionné, rien à l'écran.

**Un retour a maintenant son bandeau**, le même que le mur : sa longueur à
lui, la hauteur du pan qui le porte, et de quoi la régler. Elle n'était
écrite nulle part, alors que c'est elle qui dit la place qu'on a pour poser
un interrupteur sur ces trente centimètres. Il n'offre pas « Mesures » :
coter un retour reviendrait à coter le mur entier, ce que la commande
« Cotes » du menu fait déjà sans mentir sur sa cible.

### La hauteur, mur par mur

La hauteur ne se réglait que **par pièce** — tous ses murs d'un coup. C'est le
bon geste quand RoomPlan s'est trompé de plafond, et le mauvais partout
ailleurs : un logement réel a des retombées de poutre, des sous-pentes, un
muret de cuisine à 1,10 m. Or c'est cette hauteur-là qui commande le métré du
mur, sa surface à peindre et la place disponible pour l'appareillage.

`setWallHeight()` règle donc **un mur seul**. Trois précautions, toutes
vérifiées au banc :

- **Le sol ne bouge pas** : c'est le plafond qui monte ou descend. Le mur est
  décrit par son centre (`yCenter`) et sa hauteur ; recalculer naïvement
  `yCenter = height / 2` enfoncerait dans le sol tout mur dont l'assise n'est
  pas à zéro.
- **La borne basse n'est pas celle d'une pièce.** Le réglage par pièce refuse
  tout ce qui est sous le mètre — une pièce de 80 cm de haut n'existe pas. Un
  MUR de 80 cm, si. On garde le plafond à 6 m et on descend le plancher à
  30 cm, en dessous de quoi ce n'est plus un mur mais une plinthe.
- **Ce qui est accroché au mur descend avec lui.** Abaisser un mur sans rien
  d'autre laisse une prise flottant DANS le plafond et une porte qui dépasse
  du toit — invisible sur le plan 2D, on ne s'en aperçoit qu'en élévation ou
  au métré, c'est-à-dire trop tard. L'appareillage que le plafond rattrape
  redescend sous lui ; une baie trop haute rabat son linteau, et si son allège
  elle-même passait au-dessus, elle redescend jusqu'au sol.

### Le métré s'ouvre dans un tableur

La liste du matériel existait déjà — dans le PDF. C'est le bon format pour
REMETTRE un dossier, et le pire pour le CHIFFRER : un devis se prépare dans un
tableur, où l'on colle ses prix dans une colonne à côté des quantités.
Recopier soixante lignes à la main depuis un PDF, personne ne le fait ; on
refait le métré, et on se trompe.

« Métré CSV », dans le menu d'export, sort les mêmes chiffres en colonnes :
métré par pièce (surface, périmètre, hauteur, **surface murale**, que le PDF
ne porte pas faute de place), appareillage par pièce, circuits avec leur
section, leur disjoncteur et leur métré de câble, différentiels, matériel de
tableau, et les constats de conformité — ce qui manque se chiffre aussi.

**Trois pièges du CSV français**, et ils y sont tous les trois : le séparateur
est le **point-virgule** (Excel en français ouvre autrement le fichier en une
seule colonne), les décimales sont des **virgules** (sinon le tableur y voit
du texte et refuse d'additionner), et le fichier commence par une **marque
d'ordre des octets** (sans elle, « Séjour » s'écrit « SÃ©jour »). Un nom de
pièce contenant un point-virgule est échappé : une seule cellule non protégée
décale toute la grille à partir de là, sans que rien ne le signale.

### C'est petit d'abord, et plus on agrandit, plus on lit

La même règle, appliquée aux deux endroits où elle manquait.

**Sur le plan 2D**, on écrivait le SIGLE de loin — « PC », « I », « RJ » —
pour remplacer une pastille de quatre pixels qui ne disait rien. C'était juste
sur un appareil isolé. Sur un mur qui en porte trois, relevé du chantier à
l'appui, les mots se chevauchent et donnent « PC2TAB » : une bouillie que ni
l'œil ni le zoom ne démêlent. Un symbole, lui, occupe une place fixe et se
reconnaît à sa forme — c'est donc lui qui tient le plan à toute échelle, et la
dénomination n'apparaît qu'au-delà de 60 % du détail.

Le geste, lui, garde son allègement : **pendant qu'on déplace le plan, un
point suffit**. On ne lit pas, on vise ; le symbole complet — un fond, une
tige, trois tracés — coûte à chaque image de ce mouvement. Il revient entier
dès que le doigt se lève.

**Sur les vues 3D**, la désignation s'écrivait SUR l'appareil, à taille fixe,
dès qu'on distinguait le logement : sur une vue d'ensemble, « DOUBLE PC »
barrait le meuble qu'il désigne et couvrait ses voisins. Elle n'apparaît
maintenant qu'au-delà de 110 pixels par mètre, grandit avec le zoom, et se
pose **au-dessus** du repère — ce qu'on nomme reste visible.

### Le dossier retrouve ses murs nus

Réduire les élévations aux murs équipés lui avait fait perdre ce qu'un
électricien vient parfois y chercher : le mur **vu de face avec ses retours
cotés**, même sans un seul appareil dessus — c'est le dessin sur lequel on
décide où percer avant d'avoir rien posé. Les deux usages sont justes : « Tous
les murs » est donc une case, offerte seulement quand les élévations le sont
(une case qui règle une feuille absente ne règle rien), et chaque feuille
rappelle le numéro que le mur porte sur le plan.

### Trois places qui ne dépendent plus de rien

- **« Enregistrer » est en tête de sa colonne**, le retour en arrière juste
  dessous, « Édition » en dernier. La pile a été ancrée EN HAUT du plan le
  temps d'une version, pour qu'elle ne descende plus quand le trop-plein de
  calques s'empile au-dessus : mauvaise réponse à une bonne question — la
  colonne de droite appartient au pouce, et la déraciner du bas éloignait tout
  le reste avec elle. Elle est revenue en bas ; c'est l'ORDRE qui compte.
- **Le bouton « Mes scans » centre son mot.** Le libellé et la pastille du
  compte vivaient côte à côte : c'est donc le COUPLE qui se centrait, et le mot
  se retrouvait poussé à gauche du milieu — d'autant plus loin que le nombre
  est long. Un bouton dont le texte se déplace selon le nombre de scans qu'on
  possède ne se lit plus comme un bouton. La pastille est posée dans le cadre
  du mot, dans un cadre haut comme lui qui la centre. Un premier jet la posait
  à « 50 % de haut, moins la moitié de sa hauteur » : deux approximations qui
  s'ajoutent — le pourcentage se prend sur la boîte du texte, dont la hauteur
  dépend de l'interligne de la police du téléphone, et la demi-hauteur était
  écrite en dur. La pastille tombait sous la ligne.
- **L'écran de lancement montre l'icône, en grand, au centre.** Il a d'abord
  porté la moitié du logo, puis le logo entier (icône et mot) au tiers haut —
  mais le lancement est le moment où l'on vient d'APPUYER sur cette icône :
  la retrouver seule, au centre, fait une continuité, et le mot vit sur
  l'accueil. L'image est cuite par `gen-icons` du même rendu que l'icône —
  même glyphe, même liseré, découpe squircle comprise, puisqu'une
  UIImageView n'arrondit rien — aux trois densités, et un banc
  (`lancement.test.ts`) tient le storyboard : l'icône, seule, carrée,
  centrée. iOS met cet écran en cache : après un changement, supprimer
  l'app et réinstaller.
- **Le logo du cartouche PDF passe de 38 à 50 points.** Au creux d'un cartouche
  qui en fait 66, il passait pour une vignette de pied de page — c'est pourtant
  la seule marque du document, celle qu'on voit quand le dossier traîne plié en
  deux sur un établi.

### Les icônes disent ce qu'elles font

Le jeu entier a été redessiné — vingt icônes d'outils, huit de feuilles —
selon trois règles.

**Un symbole dit sa fonction.** « Repères » était un `+`. « Appareil » aussi :
deux boutons sans rapport, le même dessin, et aucun des deux ne disait ce
qu'il faisait. Une icône qu'il faut légender n'est pas une icône, c'est une
puce. « Repères » est maintenant une **mire de calage** — le cercle et sa
croix qui déborde, ce qu'on peint sur un mur avant de mesurer ; « Appareil »
une **prise 2P+T**, que n'importe quel électricien reconnaît à ses deux
alvéoles et sa broche de terre. Une « pièce » n'est plus un carré à encoches
mais un contour avec **sa porte et son arc de débattement** : c'est ainsi que
tout le métier la dessine.

**Gras.** Les traits filaires disparaissent sur une pastille de 18 points, vue
à bout de bras, sur un chantier, avec les mains sales. Le jeu passe à 2,4
d'épaisseur, et ce qui peut être rempli l'est — une silhouette porte plus loin
qu'un contour.

**Même main.** Bouts ronds, angles ronds, même marge au bord de la boîte. Un
jeu d'icônes se reconnaît à sa main, pas à ses sujets ; les deux jeux — celui
des pastilles et celui des feuilles — partagent désormais la leur, et le
double-décimètre y est le même dessin.

Elles restent des **tracés vectoriels**, pas des images : c'est ce qui leur
permet de prendre la couleur du thème, de rester nettes à toute densité et de
ne rien peser dans le paquet. Une icône bitmap perdrait les trois — et
rouvrirait le défaut que la croix, le chevron et le soleil viennent de
refermer.

### Le bord de l'icône

Une icône claire n'a pas de contour : elle se termine là où le système la
découpe, et sur un fond d'écran clair elle se dilue. Le liseré est donc peint
DANS l'image — iOS refuse la transparence sur une icône d'application — le
long de la découpe du système, une **superellipse d'ordre 5**, la forme du
squircle. La distance au bord est divisée par la pente du champ, sans quoi le
trait s'épaissit dans les coins ; et il déborde légèrement au-delà, ce qui
dépasse étant rogné : il ne peut ainsi rester aucun filet de fond entre le
liseré et le bord si notre forme et celle du système diffèrent d'un cheveu.

**Trois teintes, pas deux.** Un premier essai l'avait posé en gris clair, par
crainte d'alourdir : sur du blanc, un gris clair ne se voit pas. Le liseré de
Gemini, pris comme repère, n'est pas d'une seule couleur — il passe du clair
en haut au sombre en bas, comme l'arête d'un objet éclairé par le dessus.
C'est ce qui le rend universel : sur un fond d'écran noir, le haut clair
détache l'icône ; sur un fond blanc, le bas sombre. Un liseré d'une seule
teinte doit choisir son fond.

### La visite tourne autour, elle n'entre plus dedans

La présentation s'est d'abord tenue DANS la pièce, à hauteur d'homme, tournant
la tête d'un mur à l'autre — c'était la demande du chantier, et l'essai sur
l'appareil l'a défaite : un mur de 2,50 m vu à deux mètres remplit l'écran, on
ne voit ni ses bouts ni la pièce autour, et le client ne sait plus ce qu'on
lui montre.

Le logement tourne donc devant l'objectif et **s'arrête face à chaque mur, en
vue large**, les autres murs sortant du champ le temps du carton. Le zoom
avance pendant l'arrêt : ce mouvement-là suffit à donner la vie qu'un plan
fixe n'a pas. L'azimut est **cumulé sur toute la visite** et ne revient jamais
en arrière — remis à plat au début de chaque pièce, il faisait pivoter le
logement d'un demi-tour sec entre le séjour et la cuisine.

**Les cotes paraissent en fondu, toutes ensemble.** Elles se déroulaient comme
un mètre qu'on tire, filet après filet : pendant qu'un trait s'allonge, son
nombre n'est pas encore là, et l'œil suit le mouvement au lieu de lire. Un mur
équipé porte huit cotes ; huit petits mouvements successifs, c'est du bruit.

### Le tableau se dessine

L'app savait répartir l'appareillage en circuits et proposer la protection de
chacun ; elle en donnait la **liste**. Or un tableau ne se monte pas avec une
liste : rangée par rangée, module par module, et ce qu'on cherche sur le
chantier c'est « qu'est-ce qui va où ». Le dossier d'exécution en était à
moitié vide.

Le PDF du matériel porte donc le **coffret dessiné** : une rangée par
interrupteur différentiel, lui-même en tête sur ses deux modules, suivi des
disjoncteurs qu'il protège, à leur calibre. Treize modules par rangée — la
largeur d'un coffret courant : ce qui déborde passe à la rangée suivante
plutôt que d'être dessiné hors du boîtier. Les **emplacements libres restent
tracés** : la norme demande 20 % de réserve, et un tableau plein à ras bord
est un tableau qu'on ne fera pas évoluer ; on la voit, donc on la compte.

Les modules sont **numérotés**, et la légende dessous donne le circuit, sa
section et son calibre — un libellé ne tient pas dans quatorze points de
large, un numéro si, et c'est justement ce qu'on écrit sur l'étiquette du
tableau. Les courants faibles n'y figurent pas : ils ne sont pas protégés par
un disjoncteur et rejoignent le coffret de communication, qui est un autre
boîtier.

### Le compte, le palier gratuit et le Pro

L'app s'ouvre sur une porte d'entrée : Apple (natif), Google (le bouton dit
qu'il reste à câbler — OAuth —, il ne simule pas), ou e-mail local — prénom
et adresse, **zéro mot de passe** : sans serveur, un mot de passe ne
protégerait rien et en ferait perdre un.

**Les comptes sont illimités ; l'ESSAI appartient au téléphone.** La
première règle refusait un second compte par appareil — elle a bloqué le
patron lui-même en voulant essayer Google après l'e-mail. Ce qui doit être
défendu n'est pas l'identité, c'est le relevé offert : un marqueur dans le
trousseau (`RoomScanAccount.swift`, Keychain — il survit à la
désinstallation) et la colonne `plans` de la table `appareils` en base
retiennent ce que le TÉLÉPHONE a consommé, tous comptes confondus. Un
compte neuf sur un téléphone à sec est accueilli, puis le popup « Vous avez
déjà utilisé votre essai gratuit » (`EssaiEpuise.tsx`) annonce la couleur
et tend la page Pro — jamais une porte fermée.

**Gratuit : un relevé. Pro (4,90 €/mois) : illimité.** Le quota se consomme
à l'ENREGISTREMENT du scan, pas à son lancement — un essai jeté ne brûle pas
l'unique plan gratuit — et supprimer un relevé ne rend pas le quota, sinon
le palier serait infini par corbeille. La barrière se présente AVANT le
scan : scanner vingt minutes pour découvrir qu'on ne peut pas enregistrer
serait le pire moment pour l'apprendre. Le premier plan gratuit est COMPLET
(plan coté, 3D, dossier PDF) : brider la qualité ferait fuir avant d'avoir
convaincu.

La page Pro compare les deux paliers, et porte un champ **code promo** :
les codes du patron (CARIDI12) déverrouillent localement, à 100 %. **Le Pro
s'écrit AUSSI dans le trousseau, mais il appartient à SON COMPTE** — sans
le trousseau, le code promo s'évaporait à la réinstallation ; sans le
rattachement au compte, un compte neuf entrait « Pro directement » en
héritant de celui d'un autre (relevé du chantier). Le Pro du trousseau ne
se relit que pour le compte qui l'a acquis, il est purgé quand un autre
compte s'installe, et la base reste l'autorité qui le rend à chacun. L'abonnement réel passe par
StoreKit 2 (`purchasePro`), et « **Restaurer l'achat** » (exigé par l'App
Store) redemande à `Transaction.currentEntitlements` sur un nouvel appareil.
Le produit `echoplan.pro.mensuel` doit exister dans **App Store Connect** —
tant qu'il n'y est pas, le bouton l'explique au lieu d'échouer en silence.
Deux prérequis App Store restent côté configuration : l'entitlement « Sign
in with Apple » sur le profil de signature, et le produit d'abonnement.

**Le compte se quitte et se supprime** depuis la rangée « Mon compte » de
l'accueil — la suppression est une exigence App Store (5.1.1). Elle efface
l'identité du trousseau mais **garde le compteur de plans** : supprimer puis
recréer un compte ne rend pas le palier gratuit. C'est aussi cette rangée
qui offre la seule porte VOLONTAIRE vers la page Pro : sans elle, on ne
pouvait payer qu'en butant sur la barrière.

### Le badge Pro respire

L'ancien badge était un bloc noir à texte jaune : un aplat, posé sur la
seule carte qu'on vend. Le nouveau est **blanc**, et une bande d'ors glisse
derrière lui, visible à deux endroits seulement : le **contour** du badge et
les **lettres** « PRO ».

**Une seule bande pour les deux.** Le badge est un sandwich : la bande
dégradée glisse au fond, et un couvercle blanc se pose dessus — en retrait
du bord, ce qui laisse le contour, et TROUÉ au masque en forme de « PRO »,
ce qui laisse les lettres. Contour et lettres ne peuvent pas diverger : ils
regardent la même bande, par construction, et le banc tient cette unicité
(une seule définition de dégradé).

**Le dégradé est long, donc discret.** La bande fait quatre badges de large
pour une seule vague de teintes : à tout instant, ce qu'on en voit est
presque uni — on sent le mouvement, on ne compte pas les couleurs. Une
seule famille d'ors, du doré au bronze, et le dernier arrêt rejoint le
premier : la boucle n'a pas de couture. C'est la leçon du ruban appliquée
une fois de plus : la bande est dessinée UNE FOIS sur deux périodes, et
c'est la VUE qui glisse, au pilote natif — le banc tient la transformation
animée, la famille monotone (rouge > vert > bleu sur chaque arrêt) et la
couture.

**La carte et le bouton prennent la peau ENTIÈRE du badge.** D'abord son
contour d'or ; puis, sur relevé du patron, son couvercle BLANC et sa typo
qui respire : « Pro », le prix et « S'abonner — 4,90 € / mois » sont des
trouées au masque sur la même bande d'ors qui glisse — la recette exacte
des lettres du badge, étendue aux mots qui vendent. Les lignes de
bénéfices, elles, restent à l'encre : on les LIT, on ne les admire pas, et
de l'or en petit corps maigre ne se lirait plus. La recette vit dans UN
composant (`ContourOr` : la famille d'ors, l'épaisseur du trait, le rythme
de la vague, et `TexteOr` pour les mots) que le badge emprunte : des
dégradés réglés à la main auraient divergé à la première retouche, et le
banc tient l'unicité arrêt par arrêt. Trois différences mécaniques avec le
badge : la bande ne se dessine qu'une fois la taille du bloc connue — une
carte a la hauteur de son contenu, un mot celle de sa police —, un vrai
`Text` invisible réserve la place du mot et le garde lisible aux lecteurs
d'écran, et le badge flotte AU-DESSUS du bord de la carte, donc HORS de
son rognage, sinon sa moitié haute serait coupée.

### Un relevé interrompu ne se perd plus

Un scan tenait entièrement en mémoire tant qu'on n'avait pas touché
« Enregistrer ». Une app tuée par le système — un appel, une photo, un
téléphone à court de mémoire — et la visite était à refaire. C'est le seul
défaut de cette application qui coûtait un déplacement.

Le relevé s'écrit donc tout seul **toutes les trente secondes** (clé
`roomscanner.brouillon.v1`), dès qu'il porte au moins un mur et tant qu'il
n'est pas enregistré. Trente secondes, c'est ce qu'on accepte de refaire —
quelques pas dans un couloir — et c'est assez rare pour ne pas peser sur la
cadence du scan. L'écriture est comparée **hors horodatage** : un plan qui n'a
pas bougé ne se réécrit pas.

La minuterie **se réarme** à chaque démarrage de scan plutôt que de vérifier
« s'il n'y en a pas déjà une » : une horloge retenue par une référence morte
laissait le relevé sans filet, et rien ne l'aurait dit.

Au démarrage suivant, l'accueil **propose** le relevé — il ne le rouvre pas.
L'utilisateur a pu quitter volontairement un essai raté, et se le voir
réimposer serait pire que de l'avoir perdu. La carte dit ce qu'il contient et
quand il date (« 4 murs · Visite du 12, il y a 12 min ») : c'est à ça qu'on
reconnaît le sien. Repris, il redevient le scan courant, **jamais enregistré**
— le bouton de sauvegarde s'offre aussitôt. Jeté, il ne revient pas. Et un
nouveau scan l'efface : le garder ferait proposer au démarrage suivant un
relevé qu'on vient soi-même de mettre à la corbeille.

### L'accueil montre, il n'explique plus

Il récitait un mode d'emploi : « Scannez, ajustez, explorez », trois
pictogrammes et neuf mots pour dire ce qu'une seule image montre mieux — le
résultat. On ne vend pas un scanner de pièces avec une notice, on le vend avec
le plan qui en sort.

À la place, **un téléphone posé, et le plan qui se lève dans son écran** : un
plan 2D coté, murs pochés en noir et appareils électriques repérés, qui se
redresse pour devenir un logement meublé en volume. Les cotes s'effacent en
montant — on ne cote pas une perspective —, les appareils restent, parce que
c'est ce qu'on vient chercher ici. C'est le geste de l'app, la bascule 2D/3D,
joué tout seul.

**Les images sont cuites au build, pas calculées sur le téléphone.** La
première version rendait la scène vingt-cinq fois par seconde sur l'appareil.
`npm run showcase` produit désormais les quarante-quatre images
(`src/export/showcaseFrames.ts` → SVG → PNG palettisés, 440 ko) et l'app ne
fait que les feuilleter : rien à recalculer, donc rien qui puisse ramer,
chauffer, ni diverger d'un appareil à l'autre. Le boîtier ne bouge plus non
plus — c'est le contenu qui raconte.

Le revers d'une image cuite, c'est qu'elle ne se corrige pas toute seule : un
banc compte les images embarquées et les compare au scénario, faute de quoi un
changement de géométrie laisserait l'accueil jouer l'ancienne animation sans
que rien ne le dise.

**Ce n'est pas une illustration** pour autant : les images sortent de
`buildScene`, `sceneFraming`, du tri du peintre, de `shadeFill` et de
l'écorché de `cutawayOpacity` — le chemin de la vue 3D. Deux réglages leur
sont propres, parce qu'une maquette de trois centimètres n'est pas un plan
grandeur nature : les pans sont d'un seul tenant (`coarse`), et le poché des
murs est noir à plat puis s'éclaircit en montant — c'est la convention du
dessin d'architecte, et un gris clair sur blanc n'existe pas à cette taille.

**Les deux boutons ont un contour qui court.** Un segment lumineux fait le
tour du bord, sans fin, en deux secondes et demie — un tracé SVG dont le
tireté se décale. La propriété n'a pas d'équivalent natif : elle s'anime donc
sur le fil JS, ce qui se paie ici et nulle part ailleurs, sur un écran qui ne
dessine rien d'autre. Le fond est translucide, l'ombre prend la couleur du
bouton, et l'appui l'enfonce de trois pour cent : un bouton qui ne bouge pas
sous le doigt laisse douter qu'il a pris.

### La vitrine montre un logement, pas une maquette

Trois défauts de l'animation d'accueil, tous vus en REGARDANT les images
cuites côte à côte.

**L'appartement ne tenait pas debout.** Le refend s'arrêtait au milieu du
logement — la chambre n'était donc pas une pièce —, l'armoire flottait à
cinquante centimètres de son mur, et la seule porte était celle de l'entrée.
On montrait, dans une vitrine dont c'est tout le propos, un plan que personne
n'a jamais relevé. Le refend traverse maintenant et porte sa porte, chaque
pièce a sa fenêtre, et chaque meuble est CONTRE quelque chose — sauf la table
basse, au milieu du salon, qui est à sa place. Un banc le vérifie meuble par
meuble : c'est le genre de règle qu'on respecte en écrivant le plan et qu'on
casse à la première retouche.

**Le mobilier apparaissait d'un coup.** Il sortait du sol à pleine opacité :
d'une image à l'autre, un logement vide devenait un logement meublé. L'œil ne
relie pas ces deux images — il voit une coupure, et une coupure au milieu
d'un mouvement se lit comme un défaut d'affichage, pas comme une intention.
Il monte maintenant en **fondu rapide**, dès les premiers degrés
d'inclinaison et jusqu'au tiers de la levée : le logement se remplit pendant
que ses murs montent. Le banc mesure l'opacité image par image et refuse
qu'elle saute.

**Les cotes sont parties.** Elles donnaient la taille d'un logement inventé —
ce qui n'apprend rien — et elles étaient le seul élément de l'image qui
devait s'effacer en cours de route : un fondu à régler, un écart à la
maçonnerie à régler, deux corrections déjà. La vitrine montre un plan qui se
lève ; les cotes, c'est dans l'app.

### La levée respire, et la caméra ne s'arrête plus

Trois retouches du même geste, toutes bornées au banc — à cadence de
feuilletage inchangée (quinze images par seconde).

**Le pas le plus grand est ce qui se voit.** À quinze images par seconde, la
douceur ne vient pas de la cadence — elle est fixée — mais du pas entre deux
images : l'ancien lissage quadratique culminait à cinq degrés et demi
d'inclinaison d'un coup, et la levée se lisait par paliers. Le lissage est
passé au sinus (vitesse de pointe π/2 contre 1,5) et la levée s'est allongée
de cinq images : le pic tombe sous 0,11 d'avancement par image, et c'est le
banc qui le mesure, pas une promesse. Le cycle passe de 44 à 52 images —
80 ko dans l'IPA.

**Un palier figé est un diaporama.** La visite guidée l'avait déjà appris :
c'est le zoom qui avance PENDANT l'arrêt qui donne la vie. Sur le palier du
volume, la caméra dérive donc en azimut (−14° à −21°) et se rapproche d'un
souffle (+4 %) — assez pour que l'image respire, trop peu pour qu'on le
remarque. Le retour ramène tout d'un seul geste, de là où la dérive s'est
posée jusqu'au plan de départ : le cycle se referme sans à-coup, bouclage
vérifié image par image. Comme `t` seul ne sait pas dire cette dérive, le
cycle passe sa caméra en clair à chaque image (`camera(i)`).

**Le mobilier arrive en vague, du nord au sud.** Le fondu global faisait
apparaître le logement d'un bloc : correct, mais mécanique. Chaque meuble a
maintenant sa fenêtre d'apparition, calée sur sa position — la chambre en
haut se meuble d'abord, le séjour en bas la rattrape, et chaque meuble sort
du sol en fondu sur sa propre fenêtre. Les fenêtres se chevauchent
largement : on voit un logement qui se remplit, pas des meubles qui
surgissent. Et la fenêtre dépendant de `t`, la vague se rejoue à l'envers
pendant le retour, d'elle-même. Le banc tient l'ordre (la chambre devance la
télé), la montée sans redescente, et l'étagement observable sur l'image —
au moins trois niveaux d'opacité distincts à mi-levée, là où un fondu global
n'en donne qu'un.

### Le ruban de lumière, derrière la maquette

L'accueil porte une onde qui traverse l'écran de bord à bord, à mi-hauteur du
téléphone. La référence est un shader GLSL — un trait blanc qui ondule sur
fond noir, bordé d'une frange chromatique. Il n'y a pas de WebGL ici, et il
n'en faut pas : ce que l'œil retient de cette image, c'est **une courbe, sa
lueur et sa frange**. Trois choses qui se dessinent au trait.

**C'est la VUE qui glisse, pas l'attribut du dessin.** Premier jet : la course
était posée sur le `x` d'un groupe SVG. Le ruban n'a pas bougé d'un pixel — et
c'est logique : le pilote natif ne connaît que les propriétés d'une vue, il
ignore les attributs d'un dessin vectoriel. L'animation partait, personne ne
l'écoutait, et l'accueil montrait un trait courbé immobile. Le banc tient
désormais la seule chose qui garantit le mouvement : une transformation, sur
une vue, avec une valeur animée dedans.

**La courbe est dessinée une fois, et c'est la vue qui la porte qui glisse.** La
recalculer à chaque image — soixante fois par seconde, sur un chemin de
plusieurs centaines de points — coûterait à l'accueil ce que l'animation du
plan a justement gagné en étant cuite au build. Le ruban est tracé sur deux
longueurs d'onde, et une seule transformation, confiée au pilote natif, le
fait défiler ; le motif se répète exactement d'une période à l'autre, donc la
boucle ne se voit pas.

**La frange est serrée.** Sur l'original elle s'étale sur plusieurs pixels, ce
qui donne un arc-en-ciel ; à la taille d'un téléphone, cela devient une
bavure. Un point et demi de part et d'autre suffit à dire « lumière
décomposée ».

**Et les tangentes suivent la pente.** Premier jet : les points de contrôle
étaient posés à l'horizontale, à un tiers de pas de chaque point. Une Bézier
ainsi bridée arrive à plat sur chaque sommet ET sur chaque flanc — la
sinusoïde ondule entre ses propres points, et le ruban prend une allure de
chenille. La pente d'un sinus est son cosinus ; chaque contrôle s'écarte donc
le long de sa tangente. On a vu les bosses **sur le rendu** avant de les voir
dans le code.

### Ce qu'on tient est une bulle

Un scan décollé par appui long rétrécissait sur place et suivait le doigt en
hauteur : ni vraiment tenu, ni vraiment posé — on croyait manipuler la liste
plutôt qu'un objet. Ce qu'on tient est maintenant une **bulle** : une carte
avec la vignette du plan et son nom, posée en coordonnées d'écran, qui suit le
doigt dans les deux axes et passe par-dessus tout. La ligne d'origine reste où
elle est, effacée — le trou laissé par ce qu'on a pris.

**Et elle se repose toujours.** Relevé du chantier : « sa réduction est
permanente, même après avoir fermé le menu ». C'est le cycle tactile qui se
rompt : quand une fenêtre modale s'ouvre par-dessus, la vue du dessous ne
reçoit ni fin ni annulation de toucher, et le scan restait décollé pour
toujours, effacé au milieu de sa liste. L'ouverture d'une fenêtre repose donc
ce qui était en l'air.

### Le dossier avale le scan

Un scan lâché sur un dossier disparaissait de la liste. C'est juste, et ça ne
se voit pas : on ne sait pas s'il est RANGÉ ou PERDU, et le doute revient à
rouvrir le dossier pour vérifier.

Le dossier joue donc le geste — une feuille tombe entre le dos et la façade,
la façade se relève pour la laisser passer puis se referme. Le dessin est le
même qu'avant et **à la même taille** (72 × 58) : on ne change pas une icône
que la main a appris à viser ; il est simplement fait de trois plans au lieu
de deux.

L'animation part **au dépôt**, jamais au survol : au survol on hésite encore,
et une feuille qui tombe à chaque passage du doigt raconterait un rangement
qui n'a pas eu lieu.

**Une feuille, c'était un clignement.** Elle tombait en 760 ms et l'œil
n'avait rien vu : on lâche le scan en regardant SON DOIGT, pas le dossier, et
le mouvement était fini avant que le regard arrive. Ce sont donc trois
feuilles qui s'engouffrent, décalées d'un cinquième de l'animation chacune —
c'est le décalage qui fait la liasse, trois pages tombant ensemble ne
feraient qu'une page épaisse — sur une seconde et demie. Leur course est
étirée au-delà du nécessaire (de −32 à +16) parce que la fenêtre où une
feuille est VISIBLE, entre le haut du dossier et le bord de la façade, ne
fait que dix-sept points : sans cet étirement, elle la franchit en deux
images.

**Et le dossier visé fonce, il ne s'éclaircit plus.** Sa façade passait au
ciel — un cyan clair : sur fond blanc, la cible de dépôt se DILUAIT au moment
précis où elle doit s'affirmer. Les deux plans s'assombrissent maintenant
(45 % pour le dos, 32 % pour la façade), et c'est la taille qui crie « c'est
ici ». Les teintes se **dérivent de la palette** plutôt que d'être écrites en
dur : posé en dur, le dossier survolé virait au noir en mode sombre. Un banc
vérifie les deux thèmes — plus foncé qu'au repos, et la façade tranchant
toujours sur le dos, faute de quoi le dossier redevient une tache bleue. La descente se pilote par un nombre et non par une chaîne
de transformation — interpoler `translate(0 -26) scale(1)` vers
`translate(0 12)` exige le même nombre de composants de part et d'autre, et la
moindre distraction fait tomber le rendu entier.

### Un geste, une intention

Dans la bibliothèque, l'appui long faisait deux choses à la fois : à 420 ms
il ouvrait le menu du relevé, à 500 ms la bulle se levait derrière lui. On
se retrouvait avec un scan décollé sous une fenêtre qu'on n'avait pas
demandée — et la fenêtre modale, en s'ouvrant, ne rendait ni fin ni
annulation de toucher à la liste : le relevé restait effacé au milieu des
siens.

**L'appui long ne fait donc plus qu'une chose : lever la bulle**, celle qu'on
promène et qu'on lâche sur un dossier. Ce qu'on peut FAIRE d'un relevé —
renommer, dupliquer, sortir du dossier, supprimer — passe sous un « … »
visible en permanence au bord de la ligne. Un geste caché ne s'apprend pas ;
trois points se voient.

Le « … » remplace la croix, et ce n'est pas qu'un dessin. La croix armait la
suppression au premier appui et l'exécutait au second : deux appuis, mais
tous deux au même endroit, et cet endroit était sur le trajet du pouce qui
fait défiler la liste. La suppression vit maintenant au fond du menu, en
rouge — même nombre de gestes, aucun au bord d'une liste qui bouge.

Les tuiles de dossier, elles, **gardent leur appui long** et n'ont pas de
« … ». Elles ont commencé par en recevoir un, par souci de grammaire unique ;
c'était une erreur à l'usage. Un dossier ne se PREND pas, il reçoit : rien ne
se dispute son appui long, et trois points posés sur une tuile de 96 points
encombraient précisément la cible qu'on vise avec un scan au bout du doigt.
Le signe va là où le geste manquait, pas partout par symétrie.

Et le geste **répond partout**. Il ne se levait qu'à la racine, devant des
dossiers ; dans un dossier ouvert, l'appui long ne produisait rien, ce qui se
lit comme une panne de l'app et non comme une absence de destination. Dedans,
la destination existe : c'est la sortie. L'en-tête devient la zone de dépôt,
elle s'allume au survol, et le relevé lâché dessus revient à la racine.

### Les appareils s'écrivent

Vu de loin, un appareil se réduisait à une pastille de quatre pixels : on
savait qu'il y avait quelque chose, jamais quoi — sur un mur qui en porte
trois, on comptait des confettis. Le **sigle** tient dans la même place et dit
la nature : « PC », « I », « RJ », dans la couleur de sa famille, cerné d'un
liseré clair. Sans ce contour, un sigle ambre posé sur le poché d'un mur
disparaît dans le noir.

Les cinq couleurs de famille ont donc **descendu d'un cran**. Elles ne
servaient qu'à remplir des disques, où un jaune vif passe très bien ; depuis
qu'elles portent du texte sur fond blanc, il leur faut la luminosité d'une
encre. Même chose dans la vitrine et dans la vue 3D — c'est le même code
couleur partout.

### La typo de la marque

Le mot « EchoPlan » n'est plus composé : c'est **l'image de la marque**,
détourée du fond gris de l'original (`src/assets/echoplan.png`, plus ses
densités `@2x`/`@3x`). Aucune police système ne sait faire le « O » d'ECHO,
qui porte les ondes du logo. Le détourage se déduit de la luminance — fond
au-dessus de 190, typo en dessous de 70, rampe entre les deux pour garder
l'anticrénelage des courbes —, puis on recadre au plus juste avec une marge
de quelques pixels. Les pixels transparents restent NOIRS : sinon, un halo
clair borde les lettres dès qu'on redimensionne.

Un détourage par seuil ne garde pas que les lettres : il garde tout ce qui
était sombre, **y compris ce qui traînait au bord de l'original**. Deux
traits de trois pixels ont ainsi survécu dans les six fichiers livrés — un
contre le « e » d'echo, l'autre sous le « n » de plan. À la taille où le logo
s'affiche, ils passent pour de la poussière sur l'écran. Ils sont effacés, et
`logotype.test.ts` monte la garde : il décode les six PNG (décodeur minimal,
8 bits RGBA, une trentaine de lignes plutôt qu'une dépendance) et **compte
les taches d'encre** de chaque image. Les lettres et les ondes en font une
dizaine, toutes massives ; une saleté de détourage est par construction
minuscule devant la plus petite d'entre elles. Le banc refuse donc toute
composante connexe pesant moins d'un dixième de la plus grande — un critère
qui tient même si la typo est un jour redessinée, là où un nombre de taches
figé casserait au premier retouchage. Il vérifie aussi que @2x et @3x sont
bien l'image de base deux et trois fois : un rapport qui dérive d'une densité
à l'autre étire le logo sur la moitié des iPhone, et personne ne compare deux
téléphones côte à côte.

**L'écran de lancement porte le même logotype.** Il gardait l'ancien — ECHOPLAN
en capitales, le « O » en spirale — et son cadre était calé sur le rapport de
cette image-là : 240 × 53 points. Y poser le nouveau tel quel l'aurait réduit à
un timbre de 83 points de large, `scaleAspectFit` respectant le rapport. Le
cadre suit donc désormais celui du logotype (200 × 128). Au passage, le
« Powered by React Native » du gabarit a quitté cet écran : sur l'outil qu'on
ouvre les mains pleines de plâtre, la pile technique du développeur n'a rien à
faire.

L'image est **teintée par le thème** (`tintColor: c.ink`), donc elle suit le
mode sombre. Sur l'écran de lancement iOS, en revanche, le système dessine
avant que l'app puisse dire quel thème est choisi : le fond y est donc forcé
en clair (`LaunchScreen.storyboard`), faute de quoi un iPhone en mode sombre
afficherait du noir sur noir, c'est-à-dire rien.

### Langage visuel

Trois règles, appliquées partout plutôt que décidées écran par écran.

**L'ombre remplace le liseré.** Un trait de 1 px autour de chaque carte finit
par quadriller l'écran ; deux ombres suffisent à dire la même chose. Une très
diffuse (`shadowCard`) pose une surface sur le fond, une plus dense et
teintée de la couleur du bouton (`glow`) soulève ce qui appelle le doigt. Les
séparateurs de la barre de compteurs ont disparu avec : l'écart entre le
chiffre et son intitulé sépare déjà les colonnes.

**Les rayons ont grandi d'un cran** (12 / 16 / 22, et la pilule pour tout ce
qui se touche). Un rayon serré sur une grande surface est la signature d'une
interface d'il y a dix ans, et l'écart entre un champ et une carte est ce qui
donne la hiérarchie.

**Rien ne saute d'un état à l'autre.** L'interrupteur Plan 2D / Vue 3D fait
glisser son pouce sur un ressort au lieu de repeindre l'onglet actif, et les
pastilles d'outils entrent et sortent du bouton d'édition. Un changement
d'état sans trajet oblige l'œil à retrouver ce qui a bougé.

Les intitulés, eux, ont gagné en contraste : titres plus grands et resserrés
(`letterSpacing` négatif), légendes plus petites en capitales espacées. Un
titre serré se lit comme un titre ; espacé, comme une étiquette.

### Sortir d'une sélection

Toucher le vide désélectionne. La surface qui reçoit cet appui est posée tout
au fond du dessin : murs, meubles et cartouches gardent la priorité, et seul
ce qui n'appartient à rien tombe dessus. Elle est peinte en `transparent` et
non en `none` — une surface sans couleur n'est pas touchable en SVG. Le voile
d'estompage, lui, laisse passer les appuis (`pointerEvents="none"`) : sans
ça, il aurait avalé le geste qu'il est censé inviter à faire.

### Diagnostic du plan

L'app sait tout corriger — supprimer un mur, en ajouter un, redresser,
fusionner ou scinder une pièce. Elle ne disait pas OÙ regarder : à charge de
l'utilisateur de repérer lui-même le mur douteux dans un plan qui, de loin,
paraît propre.

`checkPlan()` rassemble ce qu'on peut affirmer sans se tromper. D'abord ce que
**RoomPlan signale lui-même** : chaque surface arrive avec une `confidence`,
que `toSegment` jetait jusqu'ici. Puis ce que la géométrie trahit : un contour
qui ne se referme pas, deux murs posés l'un sur l'autre (distingués de deux
murs bout à bout, qui sont un mur coupé), un éclat de moins de 25 cm, une
hauteur qui détonne de plus de 40 cm, une « pièce » de moins de 1,5 m².

Chaque constat porte **le geste qui le règle** et **désigne son élément** : un
appui l'amène sous les yeux, sélectionné, en mode édition. Les alertes — celles
qui rendent le plan faux — passent devant les simples vérifications. La
pastille ne s'affiche que s'il y a quelque chose à dire, et devient rouge s'il
y a une alerte.

### Conformité NF C 15-100

L'app compte, compare, et prévient. Elle **ne délivre aucune attestation** —
et trois familles d'exigences lui échappent complètement : les **volumes de
la salle d'eau** (0, 1, 2), qui se mesurent depuis la baignoire ou le
receveur ; les **points d'éclairage en plafond**, qui n'ont pas de support
dans le modèle ; la **puissance réellement raccordée**, qui décide de la
section. Le dernier mot reste à l'électricien : on lui épargne le comptage,
pas le métier.

Ce qui est vérifié, avec le chiffre de la norme :

| Pièce | Socles 16 A | Communication |
| --- | --- | --- |
| Séjour | 1 par tranche de 4 m², **5 au minimum** | 1 RJ45 |
| Chambre, bureau | **3** | 1 RJ45 |
| Cuisine ≥ 4 m² | **6**, dont **4** au-dessus du plan de travail | — |
| Cuisine < 4 m² | 3 | — |
| Salle d'eau | 1, hors volumes | — |
| Circulation > 4 m² | 1 | — |
| WC | aucun | — |

S'y ajoutent les **hauteurs de pose** : socle 16 A entre 5 cm et 1,30 m,
socle 32 A à 12 cm au minimum, organe de commande entre 0,90 m et 1,30 m,
tableau entre 0,90 m et 1,80 m. Un socle de cuisine est réputé « au-dessus du
plan de travail » à partir de 90 cm d'axe — c'est ainsi que les quatre du
plan se comptent tout seuls.

**Un point de vocabulaire, parce qu'il change le verdict.** La norme ne fixe
AUCUN maximum de socles par pièce. Ce qui est plafonné, c'est le nombre de
points par **circuit** : huit socles sur un 20 A. Poser dix prises dans une
cuisine n'est donc pas une faute — il faut un deuxième circuit, et l'app le
prévoit toute seule. Ce cas ressort en information, jamais en alerte : crier
au défaut là où la norme ne dit rien décrédibiliserait tous les autres
constats.

**Toucher un mur en défaut ouvre l'établi, et rien d'autre.** Il n'y a plus
de carte d'explication sur le plan : elle disait le défaut et proposait le
geste, mais laissait le dessin encombré et le geste à distance de son effet.
Le mur s'ouvre désormais **de face**, et c'est cette page qui porte tout —
l'objectif de la pièce (« Chambre — 2 socles sur 3 ») avec son bouton
« + Poser une prise », les constats restants avec leur règle et leur
raccourci, et sous l'appareil mal posé son « Remettre à 110 cm ». Le constat
est sous les yeux, la correction est à portée du même pouce, et le résultat
s'affiche à l'endroit même où on l'a demandé.

**Ce qui alerte se voit sans ouvrir un menu.** Les murs qui bordent une pièce
en défaut passent en **rouge foncé** — assez sombre pour rester un mur poché,
assez rouge pour qu'on ne le confonde pas ; la sélection, elle, reste bleue,
parce que c'est un état et non un défaut. Toucher le mur affiche la raison
(« Chambre : 2 socles sur 3 exigés — il en manque 1 ») et la règle en une
phrase. Rien n'est bloqué : on continue de poser, l'alerte suit.

Pendant la pose, la vue face au mur porte **l'objectif de la pièce** : un
titre (« Chambre — 2 socles sur 3 »), une barre qui se remplit et devient
verte, la règle en dessous. Et si l'appareil qu'on tient sort de sa plage de
hauteur, la règle correspondante s'affiche en rouge sous les cotes, là où on
est en train de la violer.

Les constats électriques rejoignent ceux de la géométrie dans **le même
diagnostic** : celui qui regarde son plan se moque de savoir si le défaut est
géométrique ou électrique.

### Liste du matériel

**Exporter → Liste du matériel.** Un PDF au cartouche EchoPlan qui sort du
même relevé que le plan — rien à ressaisir.

- **L'appareillage pièce par pièce**, compté par type.
- **Le tableau** : un circuit par ligne, avec ses points, sa section et son
  disjoncteur. Le découpage est automatique — un circuit dédié par socle
  32 A (cuisson, 6 mm²) et par socle 20 A (four, lave-linge…), les socles
  16 A par paquets de huit en 2,5 mm² sous 20 A avec **la cuisine à part**,
  l'éclairage par paquets de huit en 1,5 mm² sous 16 A, et les courants
  faibles hors tableau, au coffret de communication.
- **La protection différentielle** 30 mA, huit circuits au maximum par
  appareil, dont au moins un **type A** : les courants de défaut de la
  cuisson et du lave-linge peuvent comporter une composante continue qu'un
  type AC ne détecte pas.
- **Les fournitures de tableau** et un ordre de grandeur de câble.
- **Les constats de conformité**, chacun avec sa règle.

La dernière ligne du document rappelle ce qu'il est : une aide au chiffrage,
pas une attestation.

### Redresser le plan

Un scan LiDAR ne donne jamais un angle droit exact : on récolte des coins à
89,2° et des cotes comme 3,93 m. Le logement a pourtant été bâti d'équerre.
`straightenWalls()` le remet d'aplomb **sur sa propre trame** — pas sur les
axes de l'écran, qui n'ont aucun sens ici : l'origine du repère dépend de
l'endroit où le scan a commencé.

On ne redresse pas les murs un par un : cela ouvrirait les coins. **On aligne
les nœuds.** Après avoir trouvé la trame dominante (moyenne des directions
pondérée par les longueurs, de période 90° — un mur et son perpendiculaire
votent donc pour la même trame), tout mur assez proche de l'horizontale de
cette trame impose à ses deux extrémités la même ordonnée ; tout mur proche
de la verticale, la même abscisse. Chaque groupe de coordonnées liées prend
sa moyenne. Les coins restent soudés au point près, la boucle reste fermée,
la surface bouge de moins de 1 %, et un pan coupé franc — au-delà de 8° —
n'est pas touché.

### Magnétisme de l'édition

Tout ce qui s'aligne se règle sur `planFrameAngle()` — la trame du logement —
et **jamais sur les axes du repère ARKit**, qui dépendent de l'endroit où le
scan a commencé. Le magnétisme angulaire s'y référait pourtant : il ne se
déclenchait donc que sur un logement scanné par hasard face à un mur, et
ailleurs on pouvait tirer un coin sans jamais rien accrocher. Pire, le
redressement se défaisait au premier glissement.

S'y ajoute un magnétisme d'ALIGNEMENT : le coin déplacé se cale sur la ligne
d'un mur déjà en place, à moins de 12 cm, les deux axes étant traités
séparément — un coin peut donc s'aligner en abscisse sur un mur et en
ordonnée sur un autre. Sans lui, tirer un coin « à peu près » dans le
prolongement d'un voisin donne un plan qui paraît droit sans l'être.

### Retoucher les murs, et annuler

**Annuler pas à pas**, et rien d'autre. L'historique photographie le plan
avant chaque retouche, en regroupant les appels rapprochés d'un même geste :
un glissement de coin, qui appelle son action des dizaines de fois par
seconde, ne compte que pour une annulation. La pile est bornée à 40 entrées
et repart à zéro dès qu'on change de scan. La pastille n'apparaît que s'il y
a quelque chose à annuler, et c'est la première de la colonne — c'est le
geste qu'on cherche dans l'urgence.

Le retour à la dernière sauvegarde a été retiré : deux façons de revenir en
arrière, dont une qui jette tout d'un coup, c'est une de trop. On revient pas
à pas, ou pas du tout.

**Le tracé de mur a été retiré aussi**, après essai sur l'appareil. Trois
versions y sont passées — un mur posé au centre « au hasard », un tracé en
deux appuis sans aperçu, puis un vrai glisser-déposer avec accrochage aux
extrémités et longueur affichée. La dernière était juste au millimètre, et
elle restait pénible : sur un écran de téléphone, viser une extrémité de mur
au doigt, à la bonne échelle, sans la couvrir de son pouce, demande une
précision que le geste tactile n'a pas. Mieux vaut pas de fonction qu'une
fonction qui rate une fois sur trois. Ce qui reste : supprimer un mur,
déplacer ses coins, et scinder une pièce — trois gestes qui, eux, tombent
juste.

### Export du modèle 3D

Le `.usdz` de RoomPlan ignore toutes les retouches — murs déplacés, pièces
fusionnées, cloisons ajoutées. L'export **OBJ** est donc construit depuis
`buildScene()`, comme la vue 3D et le PDF : ce qu'on voit est ce qu'on
exporte. Un seul fichier, lisible par Blender, SketchUp et Rhino, avec les
éléments groupés par nature. Les couleurs ne survivent pas (elles
demanderaient un `.mtl` séparé, or on ne partage qu'un fichier) ; les groupes
permettent de les remettre en matière d'un clic. « Modèle AR » ouvre toujours
le `.usdz` d'origine.

### Exporter

Un seul bouton **Exporter**, puis le choix du format : **plan PDF** (coté,
métré par pièce, vues 3D), **modèle 3D** (OBJ du plan retouché) ou **image**
(capture de la vue affichée, filigranée). Les pastilles « image » et
« modèle » ont quitté les barres d'outils des plans : elles y faisaient
double emploi et encombraient une barre déjà chargée.

### Partager : la feuille attend que l'écran soit libre

« Image », « Modèle 3D » et « Liste du matériel » ne faisaient **rien** au
clic — pas d'erreur, pas d'alerte, rien. iOS ne présente pas deux
contrôleurs à la fois, et une fenêtre en train de se fermer reste en place
quelques dixièmes de seconde : présenter la feuille de partage dessus est
purement ignoré. Le PDF, lui, marchait, parce qu'il passe par un changement
d'écran qui laisse le temps.

Un délai côté JS ne suffisait pas — la durée de fermeture n'est pas garantie.
Le natif attend donc que **plus rien ne soit en cours de fermeture**, par pas
de 100 ms et une seconde au maximum, avant de présenter. Et le JS déclenche
le partage sur `onDismiss`, quand la fenêtre est vraiment partie.

### Poser des meubles

RoomPlan ne reconnaît que ce qui était là au moment du scan — or un logement
vide se scanne très bien, et c'est même le cas courant avant travaux. Le
**catalogue** comble ce trou : le « + » qui paraît à côté du calque meubles
ouvre une trentaine d'entrées aux dimensions usuelles du commerce, rangées
par pièce — lits 90/140/160, meubles bas et hauts de cuisine, four, plaque,
réfrigérateur, lave-vaisselle, baignoire, douche, WC, bureau, armoire…

**Le meuble se heurte aux murs, il n'y est plus attiré.** L'aimant collait
le meuble au nu ET lui imposait l'angle du mur à chaque déplacement : dans
une chambre de 2,44 m, un lit de 1,90 est à portée d'aimant partout, il
restait donc collé, toute rotation était effacée au premier glissement, et le
meuble paraissait revenir tout seul à sa place. À la place, `pushOutOfWalls()`
ne fait que l'empêcher d'ENTRER dans un mur : on pousse, ça s'arrête pile
contre le nu, et on obtient le contact franc qu'un aimant ne donne jamais.

**Le meuble appartient à une pièce, et c'est elle qui l'arrête.** Il retient
son `roomId` dès la pose. Sans ça, c'était le point VISÉ qui décidait, à
chaque image, des murs censés l'arrêter — et pousser un lit contre un mur,
c'est justement viser au-delà du mur : plus aucun mur ne le retenait, il
traversait la cloison au moment précis où on cherchait à l'y plaquer. Pour la
même raison, un point visé hors de la pièce est d'abord **ramené sur le
contour** avant la poussée : un mur ne repousse que ce qui se trouve en face
de lui, et visé loin dans un angle, le meuble n'était en face d'aucun des
deux.

**Ce qui ne rentre pas ne se pose pas.** `fitsInRoom()` compare l'emprise du
meuble à celle de la pièce, dans les deux sens : un lit de 2 m ne s'ajoute
pas à un dégagement de 1,20 m, et on le dit avec les deux cotes en main
plutôt que de laisser l'utilisateur découvrir un meuble coincé dans un
angle. Et quand le scan compte plusieurs pièces, on **demande laquelle**
avant de poser, au lieu de parier sur la plus grande.

**Le « + » se signale tout seul.** Une pastille de plus dans une colonne de
pastilles ne se remarque pas : celle-ci, posée à GAUCHE du calque meubles,
laisse échapper deux anneaux bleus en boucle, contenus par son bord arrondi.
L'œil va vers ce qui bouge, et c'est le seul endroit de l'écran qui bouge
tout seul.

**On choisit une forme, pas un mot.** Chaque vignette dessine le symbole du
meuble vu de dessus, à l'échelle de sa propre emprise — exactement celui
qu'on retrouvera sur le plan. Le nom vient dessous, les cotes en plus petit
encore. Et une **recherche** plutôt qu'un mode d'emploi : à trente entrées on
sait ce qu'on cherche, sans accent ni casse — « evier » trouve « Évier ».

Un meuble posé porte une **catégorie RoomPlan** (`bed`, `refrigerator`,
`sink`…) et non un type maison : pour tout le reste de l'app — symbole 2D,
nom français, volume 3D, export — c'est un meuble comme un autre.

**Il est provisoire tant qu'on ne l'a pas validé.** Quitter sa fiche sans le
✓ le retire : on en essaie un pour voir, il ne doit pas rester planté au
milieu de la pièce.

**Toute son emprise se glisse**, et pas seulement un carré de 44 px en son
centre : sur un lit, poser le doigt à côté du centre déplaçait le PLAN. La
poignée épouse la boîte écran du meuble, coins tournés compris. Sa croix de
suppression et sa poignée de rotation flottent HORS de lui, à faible
opacité — posées dessus, elles se lisaient comme une partie du meuble et se
touchaient par accident.

**La rotation se tire.** Un demi-cercle fléché à un coin : on le tire, le
meuble suit l'angle du doigt, et la valeur s'affiche le temps du geste —
sans elle, on tourne à l'aveugle et on ne retrouve jamais l'aplomb. L'aimant
a deux forces, référées à la TRAME du logement et jamais aux axes de
l'écran : les quarts de tour tirent de loin (8°), parce que c'est là que
tombent presque tous les meubles ; les seizièmes de tour, de tout près (3°),
pour un meuble volontairement de biais.

**Les murs attirent.** Dès que le dos d'un meuble passe à moins de 30 cm d'un
mur, il s'y colle et s'aligne dessus, dos au nu, face à la pièce. Au-delà, il
reste exactement là où le doigt l'a laissé — l'aimant aide, il ne décide pas.

**Les cotes sont à la demande.** Une pastille de mesure suit le meuble, sous
sa croix de suppression : elle allume les dégagements et le bandeau des
dimensions. Ils occupaient l'écran en permanence pour un réglage qu'on ne
fait qu'une fois.

**L'aimant ne décide pas de l'orientation.** Il collait le meuble au mur ET
lui imposait son angle à chaque déplacement : dans une chambre de 2,44 m, un
lit de 1,90 est à moins de 30 cm d'un mur PARTOUT, il restait donc collé en
permanence et toute rotation à la main était effacée au premier glissement.
L'aimantation ne joue plus que si le meuble regarde déjà à peu près dans le
bon sens, à 30° près.

**Un geste qui commence sur le meuble appartient au meuble**, et il lui
reste. C'est le bug qui a résisté à trois corrections, et sa cause est dans
le système de responders de React Native : `PanResponder` accepte par défaut
de **rendre** le geste (`onPanResponderTerminationRequest`), et le plan le
redemande à chaque mouvement au-delà de six pixels. Les premiers pixels
déplaçaient donc bien le meuble, puis le plan reprenait tout — vu de l'écran,
« le meuble ne bouge pas, c'est le plan qui glisse ». Les trois poignées
(déplacement, rotation, coin de mur) refusent désormais de céder la main.

**Et un meuble se sélectionne en le touchant**, tout simplement. Il fallait
passer par la liste du bas, ce qui n'est venu à l'idée de personne : sans
sélection, pas de poignée, et le doigt ne déplaçait que le plan.

**Les dégagements se cotent tout seuls.** Un meuble sélectionné montre ce qui
le sépare des murs sur ses quatre côtés : la cote part du milieu de chaque
côté, perpendiculairement, et s'arrête au NU du mur — pas à son axe, parce
que c'est la cote qu'on relève sur place, mètre contre la plinthe. Les traits
longent le meuble et tournent avec lui, étant calculés dans le monde et non à
l'écran. Rien dans une direction, ou plus de 4 m : pas de cote, plutôt qu'une
cote qui ne veut rien dire.

### Un meuble a une troisième cote

Le relevé ne réglait qu'un meuble posé par terre : largeur, profondeur, et
c'est tout. Or la moitié de ce qui gêne un électricien est **accroché en
l'air** — meubles hauts de cuisine, hotte, télé, étagère, chauffe-eau. Deux
chiffres manquaient : la hauteur du meuble, et la hauteur de son **dessous**
au-dessus du sol.

Le second est le plus important des deux, et c'est celui qu'aucun champ ne
portait. Sans lui, l'élévation dessine tout depuis le carrelage : un meuble
haut de cuisine y devient une colonne pleine du sol au plafond, et le plan de
travail sur lequel on pose justement les prises disparaît dessous. On décidait
d'un percement devant un dessin qui mentait.

Les deux se règlent dans le bandeau du meuble, sur **leur propre ligne** — « H »
et « Pose ». Quatre pastilles et trois boutons ne tiennent pas dans la largeur
d'un iPhone : la dernière se serait écrasée, et c'est toujours celle qu'on
vient lire. Chacune porte son mot devant, parce qu'un chiffre nu de plus dans
une rangée de chiffres ne se rattache à rien.

Les deux réglages sont **indépendants** : rehausser un meuble haut ne décolle
pas son fond du plan de travail, et le monter de dix centimètres ne le rend
pas plus grand. Dans le modèle, la hauteur de pose n'a pas de champ à elle —
c'est `transform[13]`, l'altitude du centre du volume, qui la porte : le
dessous plus la moitié de la hauteur.

**En élévation, la silhouette part de son dessous** et la hauteur de pose se
cote dans la même écriture que les trois cotes de l'appareillage. Deux
précautions, vues sur le dessin et pas dans le code :

- La cote se pose **au bord** du meuble, pas au milieu. Au centre, elle
  traverse tout ce qui est en dessous — sous un meuble haut de cuisine, il y a
  justement le meuble bas — et son étiquette se pose en plein sur lui. Au
  bord, elle longe le montant, comme on cote une allège sur un plan.
- Elle ne s'écrit **que pour ce qui décolle vraiment du sol** (plus de 2 cm).
  Un « 0 » sous chaque caisson noierait les seules cotes qu'on vient lire.

### Menuiseries : les retailler

Une porte détectée à 78 cm alors qu'elle en fait 83, une fenêtre dont le
linteau est mal vu : ça se corrige sur le plan. Toucher une menuiserie en
mode édition la sélectionne — sa cible tactile fait 26 px, une menuiserie
n'en dessine que 3 — et le bandeau du bas donne ses deux cotes avec de quoi
les changer. La **largeur se retaille autour de son axe** (elle ne glisse
pas le long du mur), la **hauteur depuis son allège** : c'est le linteau qui
monte, une fenêtre ne descend pas vers le sol.

En 3D, ces mêmes cotes apparaissent **au zoom**, sur le linteau et sur le
tableau, comme toutes les cotes de détail : de loin elles s'empileraient sur
celles du mur qui les porte.

### Cotes : deux niveaux de détail

**En 3D aussi.** De loin, seules les grandes cotes : une vue criblée de
nombres ne se lit pas. En s'approchant (au-delà de 55 px par mètre), les
arêtes trop courtes pour être cotées jusque-là apparaissent en fondu, et la
hauteur sous plafond, jusqu'alors affichée une seule fois — elle est la même
partout —, se pose sur l'arête verticale de **chaque** mur. Sous 22 px
d'arête, rien : le texte serait plus long que ce qu'il cote, aucun zoom n'y
changerait rien.


Un plan d'architecte ne cote pas seulement « 3,93 m » : il écrit
« 1,50 · 0,90 · 1,60 » pour qu'un menuisier sache où tomber. `wallRuns()`
découpe donc chaque mur percé en tronçons — retour de mur, baie, retour de
mur — en ignorant les résidus de moins de 5 cm et les ouvertures d'un mur
voisin (test de parallélisme, sinon une porte perpendiculaire viendrait
couper le mauvais mur).

Tout afficher en même temps noierait le plan. Les deux niveaux **s'échangent
avec le zoom** : sous 55 px/m, seule la cote globale du mur ; au-delà de
95 px/m, seuls les tronçons ; entre les deux, les unes s'effacent pendant que
les autres apparaissent. Une cote plus courte que son propre texte n'est pas
tracée.

### Électricité : poser l'appareillage

Un plan vu de dessus ne dit rien d'une hauteur, et une vue 3D en perspective
ne se cote pas. Or un électricien ne travaille qu'avec ça : une distance
depuis un coin, une hauteur depuis le sol. D'où un troisième point de vue —
**face au mur, bien à plat**, un seul mur à la fois, à l'échelle, avec ses
portes et ses fenêtres.

Le « **+** » de la barre d'outils ouvre le catalogue : prises 16/20/32 A et
prise double, interrupteur, va-et-vient, bouton poussoir, variateur, RJ45,
TV, applique, tableau, thermostat, sortie de câble, boîte de dérivation.
Chaque type porte sa **hauteur usuelle**, rappelée sous son nom quand on le
sélectionne — un bouton la lui applique d'un appui. L'appareil, lui, arrive
toujours **à 20 cm du coin bas gauche** : un point de départ prévisible vaut
mieux qu'un placement malin qu'on ne comprend pas.

On le déplace ensuite au doigt, ou à la cote : trois champs en centimètres —
depuis la gauche, depuis la droite, depuis le sol — qui se répondent. Le
doigt étant imprécis, le geste **s'accroche** à la hauteur usuelle du type
posé, à l'alignement d'un appareil déjà en place et au milieu du mur ; le
repère vert s'affiche tant qu'on y est collé. Un appui sur le symbole d'un
appareil, sur le plan 2D, rouvre son mur de face.

**La face du mur est le vrai repère, et c'est ce qui fait toute la
géométrie.** Une cloison a deux faces, et de l'autre côté la gauche et la
droite s'échangent. `wallFace()` renvoie donc la face demandée avec son bord
gauche **tel qu'on le voit en se plaçant devant** — un test le vérifie en
projetant les deux bords exactement comme le fait la vue 3D, faute de quoi
une prise sur deux se poserait à l'autre bout du mur.

Deux conséquences, contre-intuitives mais justes :

- **Les deux faces d'un mur n'ont pas la même longueur.** L'onglet des coins
  raccourcit celle de l'intérieur d'une épaisseur de mur et rallonge celle de
  l'extérieur d'autant. C'est bien ce qu'on veut : la cote part du coin fini
  que l'électricien a sous les yeux, pas de l'axe théorique.
- **La position est stockée le long du SEGMENT de mur, jamais depuis le bord
  de la face.** Retourner un appareil sur l'autre face ne doit pas le faire
  sauter à l'autre bout ; et la face, elle, change de longueur dès qu'un mur
  voisin bouge. Un test vérifie qu'après retournement le point n'a traversé
  que l'épaisseur du mur, sans glisser le long de celui-ci.

En 3D, une prise est un **volume** posé à 1 mm devant le nu, avec ses
normales sortantes comme le reste du modèle : elle disparaît d'elle-même
quand on passe derrière son mur, et la coupe sur une pièce emporte les
appareils des autres. Sur le plan 2D, le symbole se pose **dans la pièce**,
relié au mur par un filet — la convention d'un plan d'électricien, et le seul
moyen de distinguer les deux faces d'une même cloison. Le PDF et l'OBJ les
reprennent, puisque tout passe par `buildScene()`.

Deux appareils dos à dos figurent d'ailleurs sur la planche de référence : le
cas où deux volumes distants de 14 cm doivent se masquer proprement est
exactement celui qui casse.

**Les symboles sont ceux d'un plan d'électricité**, pas des pastilles à
initiales : socle de prise en demi-cercle barré de son diamètre avec sa tige
vers le mur, interrupteur en point posé au mur avec sa manette, point lumineux
en cercle croisé, tableau en rectangle hachuré. Ils suivent les conventions
habituelles des schémas d'installation — celles de la série NF EN 60617, à
laquelle renvoient les plans NF C 15-100. Ce sont des tracés faits d'après ces
conventions, pas une reproduction certifiée. Deux socles identiques se
distinguent par la mention portée à côté (20 A, 32 A, RJ, TV), comme sur un
vrai plan. Chaque symbole est tourné pour regarder SA face : sa tige rejoint
le mur, ce qui reste vrai quand on fait pivoter le plan.

**Deux appareils au même point s'échelonnent.** Vu de dessus, une prise à
25 cm et un interrupteur à 1,10 m tombent EXACTEMENT l'un sur l'autre : on
n'en voyait qu'un, et le plan mentait. `stackRanks()` les range par seau de
12 cm et les décale le long de leur filet de rappel, du mur vers l'intérieur
de la pièce, dans l'ordre où ils ont été posés.

**Sur le plan dézoomé, un point de couleur.** Un symbole fait 22 px quel que
soit le zoom : de loin, trois prises sur le même pan se chevauchent en une
bouillie. En dessous de 60 px/m il ne reste donc qu'un point de la couleur de
l'appareil — on voit qu'il y a quelque chose, et combien — et le symbole ne
revient qu'au-delà de 100 px/m, quand il a la place de se lire. Entre les
deux, l'un s'efface pendant que l'autre paraît.

**Le plan exporté porte les mêmes symboles et sa légende** — uniquement les
types réellement posés : une légende qui liste tout un catalogue n'apprend
rien. Les symboles sont écrits UNE fois, en données de chemin SVG, et servent
l'écran comme le PDF ; celui-ci les relit avec un traceur minimal (`M m H V L
A a Z`), qui traite chaque arc comme un demi-cercle dont la corde est le
diamètre — c'est ainsi que tous nos symboles sont écrits, et ça évite la
paramétrisation générale des arcs SVG, source de bogues pour rien.

**En 3D, un repère de taille fixe.** Le volume posé sur le mur fait 8 cm : à
l'échelle d'un logement entier, c'est deux pixels — l'appareil existait mais
ne se voyait pas. Le même symbole est donc posé par-dessus, à taille
constante quel que soit le zoom, et masqué dès que sa face tourne le dos à la
caméra. **En s'approchant** (au-delà de 90 px par mètre), il déplie ses deux
cotes dans une pastille sombre à deux lignes — « SOL 135 cm », « BORD 38 cm ».
La première version montrait « ⇕135 ⇔38 » : les flèches sortaient en gros
glyphes de police système, et un nombre sans rien pour dire de quoi il s'agit
ne veut rien dire.

Deux détails appris sur l'appareil. Le repère est trié **au-dessus de toute
la géométrie**, comme les cartouches de pièce : trié à sa profondeur, un
repère bas — une prise à 20 cm — passait AVANT le pan de mur qui le porte,
et le mur le repeignait aussitôt ; on ne voyait plus que sa cote, qui
dépassait sous le mur. Et un appareil **déjà visible n'en reçoit pas** : le
tableau fait 55 cm, son pictogramme lui masquait la façade. Le repère ne sert
qu'à ce qui est trop petit pour se voir.

**Limite** : tout s'accroche à un mur. Les points de plafond — DCL, spots,
détecteur de fumée — n'ont pas de support dans ce modèle et ne sont pas
proposés.

### Les fenêtres

**Elles sont à nous.** `Alert.alert` et `Alert.prompt` sont ceux d'iOS :
police système, boutons bleus empilés, coins de 2019 — au milieu d'une app
qui a sa typographie, ses rayons et son bleu, ils faisaient tache. Et sur
Android, `Alert.prompt` n'existe même pas.

Deux composants couvrent tout : une **feuille de choix** (titre, phrase, et
des lignes portant chacune son icône, parce qu'une liste de mots se lit plus
lentement) et une **feuille de saisie** (une valeur, son unité, deux
boutons).

**Ce sont des feuilles du bas, et ce n'est pas une mode :** c'est le seul
endroit de l'écran que le clavier ne peut pas recouvrir, puisque la feuille
monte avec lui. Une boîte centrée avec un champ de saisie finit toujours par
se faire manger la moitié. On voit donc toujours ce qu'on tape.

Un détail appris à la dure : une action de feuille attend **180 ms** avant de
s'exécuter. iOS ne présente pas deux écrans à la fois, et une action qui en
ouvre un autre — renommer, qui appelle la saisie — tombait dans le vide.



Toutes se ferment **en touchant à côté** — le voile sombre est l'échappatoire
attendue sur mobile ; sans elle, on cherche le bouton « Fermer ». Le contenu
absorbe l'appui pour ne pas se refermer sous les doigts, et le bouton retour
d'Android ferme lui aussi (`onRequestClose`).

Du coup, **plus de bouton de sortie sous le dernier choix** dans les fenêtres
qui ne font que proposer une liste. Il faisait doublon avec le voile, et posé
sous une liste il se lisait comme un choix de plus — un bouton pâle et bas,
dont on ne savait pas s'il validait ou annulait. Les fenêtres qui portent une
vraie alternative (renommer / annuler) gardent la leur.

### La barre d'outils

**Deux barres, jamais mélangées.** Elle répondait à deux questions à la fois
— que montrer, et que modifier — et on cherchait la bonne pastille au milieu
des autres. Désormais le mode tranche : en **lecture** on ne fait que
regarder, la barre ne porte donc que ce qui s'affiche ou non (cotes, meubles,
surface au sol, couleurs relevées) ; en **édition** on travaille, les calques
cèdent la place aux outils (diagnostic, appareillage, annuler, ⋮) et les
réglages d'affichage restent tels qu'on les avait laissés. La vue 3D, qui ne
s'édite pas, ne porte que des calques.

**Le bouton d'édition est ancré en haut à droite**, et les outils descendent
**dans son axe**, contre le bord droit : la main qui vient de le toucher n'a
plus qu'à glisser vers le bas. Une rangée horizontale finissait par défiler,
donc par cacher la moitié des outils ; une colonne les montre tous.

**Annuler ne descend pas avec les outils** : c'est le geste qu'on cherche
dans l'urgence, il se tient **à gauche du bouton d'édition, sur sa ligne**,
et n'apparaît que s'il y a quelque chose à annuler. La colonne, elle, porte
en édition : **+** pour l'appareillage, le diagnostic, l'équerre ; et en
lecture : cotes, meubles, surface au sol.

**Les pastilles rentrent dans le bouton d'édition et en ressortent.** C'est
lui qui commande le changement : autant qu'on le voie. Chacune remonte vers
lui en rapetissant, d'autant plus haut qu'elle en est éloignée, et les rangs
se succèdent — puis le nouveau jeu en redescend dans l'ordre inverse, avec un
léger dépassement. L'état affiché par la barre RETARDE donc sur le mode : le
plan, lui, bascule tout de suite. Et l'animation se déclenche sur l'écart
entre les deux états, jamais sur l'appui — sinon le diagnostic et la pose
d'un appareil, qui passent aussi en édition sans toucher au bouton,
l'oublieraient.

La barre de la vue 3D n'a plus de bascule « vue de dessus » : le geste y
mène déjà — on incline la vue jusqu'à l'aplomb — et le plan 2D est là pour
ça. Un bouton qui refait ce que la main fait mieux ne gagne pas sa place.

### Chaque mur porte son numéro

Les feuilles d'élévation ne couvrent plus **que les murs équipés** : quatre
murs donnaient quatre feuilles, dont trois annonçaient « Aucun appareil ». On
feuillette du vide, et la seule feuille utile se perd au milieu — dans un
dossier qu'on ouvre les mains pleines de plâtre, c'est le pire défaut
possible.

Mais un dossier partiel a besoin d'un repère : « Élévation — Séjour, nord » ne
dit plus DE QUEL pan il s'agit quand rien, sur le plan, ne le désigne. Chaque
mur porte donc un **numéro dans une pastille** — un disque blanc cerclé
d'encre, posé dans l'épaisseur du poché — et la feuille d'élévation reprend ce
numéro dans son titre.

Trois décisions tiennent ce repère :

- **Tous les murs sont numérotés**, équipés ou non. Une numérotation qui
  sauterait les murs nus renverrait, depuis le plan, à des numéros absents du
  dossier — et personne ne saurait si le mur 5 manque parce qu'il ne porte
  rien ou parce que la feuille s'est perdue.
- **L'ordre est celui du dossier** : pièce par pièce, et dans l'ordre du
  relevé à l'intérieur de chacune. C'est celui dans lequel on fait le tour
  d'un logement.
- **La pastille se pose au milieu du plus long retour de maçonnerie**, pas au
  milieu du mur : au milieu, elle tombe en plein sur la porte dès que la baie
  est centrée, c'est-à-dire souvent.

### Le dossier se compose, il ne se cadre pas

Trois libertés de l'écran d'export ne produisaient que des documents ratés.

**Le plan 2D ne se déplace ni ne se zoome plus.** On pouvait le cadrer au
doigt avant l'export, et ce cadrage partait tel quel dans le PDF : un plan
coupé, décentré, à une échelle qui n'en est pas une. Un plan d'exécution se
lit droit, entier, avec toutes ses cotes — le cadrage est l'affaire du
document, qui sait la place dont il dispose, pas celle d'un doigt sur un
écran de six pouces. L'aperçu est donc `pointerEvents="none"` : le geste est
rendu au défilement, ce que la main essaie de faire neuf fois sur dix.

**Les points cardinaux sont de série — sur le plan 2D, et seulement là.**
Ils ont été une case « Nord », éteinte par défaut, qui valait pour tout
l'aperçu ; le patron a tranché : pas de bouton. Le dossier désigne ses murs
par leur cardinal (« Prise plinthe 1 · mur nord ») — le repère qui permet de
le vérifier sur place n'est pas un ornement qu'on coche, c'est une pièce du
document, et la rose s'imprime d'office sur la feuille du plan. Sur le plan
2D SEULEMENT : c'est la feuille qu'on oriente ; sur une perspective, quatre
lettres au bord du cadre ne désignent plus rien. L'aperçu promet la même
chose que le PDF — cardinaux sur son plan 2D, perspectives nues. La rose
garde son honnêteté : sans cap relevé au scan, rien ne se dessine — un nord
inventé est pire que pas de nord du tout. Le dossier d'essai se regarde :
`UPDATE_BOUSSOLE=1 npx jest boussole` l'écrit dans le dossier temporaire,
puis `node tools/pdf-vers-svg.mjs` rend ses feuilles.

**Une perspective par feuille, et autant qu'il en faut.** Deux vues se
partageaient une page, chacune dans une case de 290 points — le tiers d'un
A4 : sur un logement de quatre pièces, on n'y distinguait plus une porte
d'une fenêtre, et c'est justement ce qu'un client regarde en premier. Chaque
angle prend maintenant la page entière, le dossier n'en porte plus qu'un par
défaut, et l'on en ajoute jusqu'à quatre avant l'export. Les angles proposés
tournent autour du logement et alternent le regard debout et la vue
plongeante : ajouter deux fois le même trois-quarts ferait deux pages
identiques. Le titre les numérote — « Perspective 2 » désigne quelque chose,
« Vues 3D » répété quatre fois ne désigne rien.

### Trois défauts vus sur le papier

Trouvés en RENDANT le dossier hors ligne et en le regardant page par page —
aucun test ne les voyait, et aucune relecture ne les aurait montrés.

- **Une baie sans pièce disparaissait du mur vu de face.** Le rattachement
  des ouvertures écartait d'emblée tout mur dont la pièce différait de celle
  de l'ouverture : un départage déguisé en exclusion. Une fenêtre sans
  `roomId` — scan d'avant la détection des pièces, ouverture ajoutée à la
  main — ne trouvait alors AUCUN mur, disparaissait du modèle 3D et de la
  feuille d'élévation, pendant que le plan 2D continuait de la dessiner. La
  pièce reste ce qui tranche quand deux murs se superposent (une porte de
  palier ne doit pas percer la cloison du voisin), mais elle ne décide plus
  seule qu'il n'y a pas de mur du tout.
- **Le cartouche d'une pièce se faisait traverser.** « Au large » ne veut pas
  dire « seul » : la cote d'un refend tombe dans la pièce qu'il borde, et
  elle s'écrivait en travers de « Chambre · 12,0 m² ». Le cartouche pose
  maintenant son propre fond blanc — déplacer l'un ou l'autre n'aurait réglé
  qu'un cas, le prochain élément qui passe par là recommencerait.
- **La hauteur sous plafond a changé de côté.** Elle s'écrivait debout à
  gauche du mur, à mi-hauteur, là même où les cotes d'appareils posent leurs
  pastilles : un interrupteur à 1,10 m dans un mur de 2,50 m tombe à
  mi-hauteur, et l'on lisait « 110 » et « 2,50 m » l'un sur l'autre. Elle est
  passée à droite, où il n'y a rien.

### Le plan exporté

**Il se dessine sur la trame du logement, pas dans le repère du scan.** ARKit
oriente son monde selon l'endroit où le scan a commencé : un appartement
scanné de biais sortait de biais sur la feuille, ses cotes en écharpe et
leurs attaches filant vers les coins. Une rotation de la géométrie avant
projection remet les murs d'aplomb — c'est ce que fait n'importe quel
dessinateur avant de coter.

**Les menuiseries sont cotées**, à l'intérieur de la pièce : dehors, la cote
du mur occupe déjà la place.

**Rien ne peut fuir hors du cadre.** Le zoom du plan vient de l'aperçu
d'export : rien ne borne son échelle, et un plan agrandi sortait de sa zone
pour aller barrer le cartouche — c'est ce que montrait le PDF envoyé, dont
les murs eux-mêmes filaient au-delà du cadre. Une **fenêtre de découpe** PDF
contient désormais tout le dessin, quelle que soit l'échelle. C'est la seule
façon sûre : borner chaque tracé un par un, c'est en oublier un. Une cote d'appareil devenue folle — un
mur recoupé depuis la pose — enverrait son symbole à l'autre bout de la
feuille : la position est bornée à la face, et ce qui sortirait du cadre
n'est pas tracé. Un test relit le flux PDF, extrait tous les points de tracé
et vérifie qu'ils tiennent dans le cadre, sur un logement scanné DE BIAIS —
le cas qui déborde, s'il doit déborder.

### Métré

Le PDF porte une feuille de métré, une ligne par pièce : cotes hors-tout,
surface au sol, périmètre, hauteur, et **surface murale nette** (périmètre ×
hauteur, portes et fenêtres déduites) — le chiffre qu'attend un peintre. Les
cotes hors-tout viennent de `roomExtent()`, le plus petit rectangle contenant
la pièce, cherché en tournant avec chaque côté du contour : une pièce scannée
de biais est cotée dans SES axes, pas dans ceux de l'écran. Elles s'affichent
aussi sur le plan 2D quand la règle est active.

En mode édition, **le cartouche est le bouton de renommage** : on touche le
nom là où il s'affiche, sur le plan 2D. Le même cartouche — cadre, nom
au-dessus, surface en dessous — est reporté au centre de la pièce sur la vue
3D. Toucher le sol d'une pièce la sélectionne, ce qui permet aussi de la
retirer du plan ; ses murs partent avec elle, sauf ceux qu'une autre pièce
borde encore.

Les scans enregistrés avant tout ça sont migrés au chargement en une pièce
implicite `room-1`.

### Un mur d'une seule traite

RoomPlan livre volontiers un mur droit en deux ou trois morceaux. `mergeColinear()`
les recolle à la fin du scan : même pièce, extrémités déjà soudées, directions
alignées à 4° près, hauteurs comparables, et jamais au travers d'un nœud qui
porte un troisième mur (un vrai T). Le plan y gagne une cote au lieu de trois,
et le « coin » fantôme entre deux morceaux ne peut plus plier un mur droit.
La grille de couleurs est recomposée, pas étirée : une colonne tous les 50 cm,
échantillonnée dans le morceau qu'elle recouvre. La fusion a lieu dans
`finalize()` : **les scans déjà enregistrés gardent leurs murs d'origine**.

### Des volumes, pas des plans posés les uns sur les autres

C'est la règle qui rend le rendu 3D fiable, et elle a coûté deux itérations.

**Tout est un solide fermé, et une face qui tourne le dos à la caméra n'est
pas dessinée du tout.** Chaque face porte sa normale sortante (`Face3D.normal`)
et `isHiddenFace()` la jette avant même la projection. Sans ça, les deux faces
d'un mur — distantes de 14 cm — se disputaient l'affichage : découpées
séparément en bandes de 60 cm, depuis des extrémités opposées et de longueurs
différentes à cause des onglets, leurs bandes ne s'alignaient pas et le tri en
profondeur les entrelaçait. Résultat : des rayures verticales sur tous les
murs, visibles à l'arrêt et absentes pendant les gestes (où un pan = une seule
bande). Aucun réglage de biais ne pouvait corriger ça — il fallait supprimer
la question.

**Un meuble aussi est un volume.** Ses quatre flancs portaient des normales
tournées vers l'intérieur et n'étaient pas masqués : ils se disputaient
l'ordre d'affichage et clignotaient au fil de la rotation. Et une télé
plaquée contre un mur ressortait à cheval dessus, donc visible depuis la
pièce d'à côté — `clampFootprint()` la ramène désormais du côté de SA pièce
(et non du côté où RoomPlan a cru voir son centre), en acceptant un
déplacement jusqu'à la profondeur du meuble.

**Une baie ou une porte OUVERTE est un vide, pas un bloc.** RoomPlan classe
ses portes en `door(isOpen:)` : on transmet la catégorie brute et le JS en
tire `WallSeg.open`. Un passage ouvert n'est alors pas rempli — on trace le
pourtour du vide en **bleu pointillé** sur les deux faces du mur, et on
traverse. Le mur reste découpé autour (trumeaux, linteau), donc le tableau se
voit. Le mode cotes, qui noircit toutes les arêtes, épargne ce bleu : c'est
lui qui distingue un passage d'une menuiserie.

**Une porte fermée ou une fenêtre est un bloc, et le mur ne se construit pas
dessus.** `assignOpenings()` rattache chaque ouverture au mur qui la porte
(parallèle à 25° près, à moins de 60 cm, même pièce), puis `wallPanels()`
découpe le mur autour : trumeau à gauche, trumeau à droite, linteau au-dessus,
allège en dessous. Le bloc de menuiserie remplit le vide, en retrait de 22 %
dans l'épaisseur pour que le tableau du mur se voie autour. Avant, l'ouverture
était un plan sans épaisseur poussé de 12 cm devant le mur par un biais de
tri : selon l'angle elle passait devant, derrière, ou se faisait couper en
triangle. Plus aucun biais, plus aucun recouvrement, donc plus aucune couleur
qui en mange une autre.

### Rendu 3D : ni couture, ni trait fantôme

Huit règles, toutes apprises à la dure sur un tri « du peintre » :

1. **Les bandes ne doivent pas se voir.** Un pan est découpé tous les 60 cm
   pour que le tri en profondeur reste juste ; l'anticrénelage laissait une
   couture blanche entre deux bandes voisines et le mur semblait fait de
   morceaux. Chaque pan est donc bordé de SA PROPRE couleur (`stroke ?? fill`
   dans les deux rendus), ce qui referme la couture sans rien dessiner.
2. **Une arête se trie AVEC le pan qu'elle borde, pas pour elle-même.**
   L'arête basse d'un mur est à y = 0 alors que son pan a son centre à
   mi-hauteur ; comme la profondeur croît avec l'altitude, l'arête passait
   AVANT son propre pan, qui la repeignait aussitôt. Tout le silhouettage
   s'effaçait donc à l'arrêt et ne revenait que pendant un geste, où un pan
   non découpé porte un contour d'un seul tenant, centré comme lui. D'où le
   symptôme : « on ne voit les arêtes qu'en gardant le doigt appuyé ».
   `Face3D.depthAt` porte le point de tri ; les trois rendus l'honorent.
3. **Une arête isolée se dessine avec une LIGNE, pas un polygone.** Un
   « polygone » à deux points est dégénéré : ni react-native-svg ni le
   générateur PDF ne le tracent. Comme les contours d'un pan découpé sont
   justement des arêtes, tous disparaissaient — sauf pendant un geste, où le
   mode `coarse` rend le contour sous forme de quadrilatère. D'où le symptôme
   déroutant : on ne voyait les arêtes qu'en gardant le doigt appuyé. Les
   trois rendus traitent maintenant `pts.length === 2` à part.
4. **Les pans sont découpés en hauteur autant qu'en largeur.** Le tri du
   peintre compare des profondeurs MOYENNES : un pan pleine hauteur a une
   moyenne dominée par son altitude, pas par sa distance, et un meuble ou une
   porte pouvait donc s'afficher devant un mur pourtant plus proche. Des
   morceaux de taille comparable laissent la distance décider.
5. **Un contour ne peut pas être un grand polygone.** Posé sur tout le pan, il
   se triait à sa profondeur moyenne et traversait les meubles pourtant plus
   proches. Chaque arête du pourtour est un segment à part, trié à sa propre
   profondeur ; les coupures internes ne sont pas tracées.
6. **La lumière est décalée de 35° par rapport à la caméra.** Éclairé dans
   l'axe du regard, deux flancs symétriques par rapport à celui-ci reçoivent
   la même teinte : l'arête entre eux s'efface et le meuble paraît amputé
   d'une face. Le décalage rend ce cas rare — et le contour, lui, est
   toujours tracé, ce qui garantit l'arête même à teinte égale.
7. **Un `strokeDasharray` conditionnel doit TOUJOURS avoir une valeur.** Les
   polygones sont retriés en profondeur à chaque image, donc React réutilise
   le composant d'un pan pour un tout autre : passer `undefined` ne
   réinitialise pas la propriété native, et le pointillé des passages
   contaminait le modèle entier. On passe `'0'`, jamais `undefined`.
8. **Le cadrage vient de la boîte englobante, pas de la moyenne des sommets.**
   La moyenne dépend du découpage : le modèle sautait dès qu'on posait le
   doigt. `sceneFraming()` est partagé par la vue de l'app et le PDF.

Pendant un geste, la scène est reconstruite en mode `coarse` : pans d'un seul
tenant, cinq fois moins de polygones, **contours compris**. Les supprimer
faisait fondre le modèle en blanc sur blanc le temps du mouvement. Seuls le
semis du sol et les cotes disparaissent — dans la vue 3D comme sur le plan 2D.

### Une plaque, des mécanismes

Un ensemble multiposte, ce n'est pas plusieurs plaques : c'est **une** plaque
et **plusieurs mécanismes**. Le modèle 3D le dit maintenant avec les cotes du
commerce : plaque de 82 mm pour un poste, 153 pour deux, 224 pour trois ;
mécanismes de 45 mm en saillie de 8 mm, à 71 mm d'entraxe. Deux prises réunies
à la main donnent exactement le même volume qu'une prise double du catalogue —
`__tests__/appareillage3d.test.ts` compare les deux au millimètre.

Et **un appareil posé sur un autre ne s'empile plus** : `addFixture` cherche la
place libre la plus proche par pas d'entraxe, à droite d'abord, et réunit les
deux sous une même plaque. Quatre prises ajoutées de suite donnaient jusque-là
quatre plaques superposées, illisibles au plan comme en 3D. S'il n'y a plus de
place sous une plaque commune, on s'écarte franchement de 40 cm plutôt que de
superposer.

Attention à ne pas confondre deux mesures qui se ressemblent : « tombe sur un
autre » compare les PLAQUES (82 mm — deux appareils à 71 mm d'entraxe se
chevauchent donc, et c'est normal, ils en partagent une), « la place est
prise » compare les BOÎTES, une par poste. Le premier jet utilisait la même
fonction pour les deux et rangeait la seconde prise à 142 mm : un trou
d'entraxe sur deux restait vide.

**Le réglage de l'ensemble se fait ensuite, en une ligne.** L'appareil est
déjà rangé quand le bandeau s'affiche — on ne pose donc pas une question à
laquelle l'app a répondu : on propose de changer d'avis. Le côté (les seuls
possibles sont montrés), puis l'axe, qui a deux lectures légitimes :

- **1re fixe** — la première ne bouge pas, la seconde se pose à 71 mm. C'est
  le geste de l'électricien qui ajoute une prise à une prise existante.
- **Centré** — l'ensemble s'axe sur le premier percement, chacune s'écartant
  de 35,5 mm. C'est ce qu'on veut quand la cote vient d'un plan.

`placeAssembly` écrit les deux positions dans la MÊME retouche : sans ça,
l'annulation en défait la moitié. `__tests__/assemblage.test.ts` couvre la
pose, l'entraxe, les quatre côtés, le recentrage, la séparation, le
changement d'avis répété et le retour en arrière.

**En 3D, l'appareil porte son nom, pas son symbole.** Le pictogramme gravé se
réduisait à trois traits gris : à l'échelle d'un logement, une plaque fait dix
pixels. On écrit donc dessus, en toutes lettres — « PC », « DOUBLE PC »,
« RJ + PC » —, avec un liseré clair sous le texte pour qu'il tienne sur un
mécanisme ambre. Les symboles restent là où ils se lisent : le plan 2D et la
légende du PDF. Un ensemble monté à la main se nomme exactement comme
l'appareil multiposte équivalent du catalogue (`assemblyTag`), sinon le même
montage porterait deux noms selon la façon dont on l'a créé.

Les cotes, en 3D, se lisent comme sur un plan : un filet pointillé jusqu'au
retour de mur, un autre jusqu'au sol, le nombre posé dessus, et la
désignation (PC, RJ, VV…) au-dessus de l'appareil. L'étiquette noire d'avant
disait la même chose en trois fois plus de place, et deux appareils voisins la
superposaient.

### Un appareil se trie AVEC son mur

Le piège coûte cher parce qu'il ne ressemble pas à un bug de géométrie : les
volumes des prises étaient bien construits, à leurs cotes, devant le nu — et
pourtant l'écran n'en montrait aucun, seulement leurs cotes flottantes. La
cause est dans le TRI en profondeur. Un pan de mur se trie sur le centre de
sa tuile, donc à mi-hauteur — 1,25 m ; une prise se triait sur son propre
centre, à 25 cm du sol. Le terme d'altitude de la profondeur
(`rz · sp + y · cp`) mettait donc la prise près d'un mètre DERRIÈRE le mur
qui la porte, et le mur la repeignait aussitôt.

Le premier remède — même hauteur, plus un biais d'une demi-tuile — a guéri ça
et provoqué l'inverse : **un biais est une avance constante**, qui faisait
aussi passer l'appareil devant le mur vu de dos. On voyait les prises au
travers des cloisons.

Le bon repère n'a rien d'approximatif : chaque face se trie sur le centre de
**sa** tuile de mur, avancé d'un millimètre vers la pièce. Vu de face, ce
millimètre compte positivement et l'appareil passe juste après sa tuile ; vu
de dos, il compte négativement et le mur le recouvre. Trois précisions que le
cas général cache :

- une **façade large** (le tableau fait 55 cm) recouvre deux tuiles : elle
  reçoit `depthRefs`, la liste des tuiles recouvertes, et le rendu retient la
  plus proche de la caméra — exact à tout angle, là où un biais ne l'est
  jamais ;
- un **flanc** tient dans une seule tuile : c'est la sienne qu'on lui donne,
  pas celle du milieu de l'appareil ;
- le **dos** de la plaque est supprimé. Il est plaqué au nu du mur : on ne
  peut le voir qu'en se tenant dans la maçonnerie, et large comme il est, il
  traversait la cloison. Quatre faces de moins par appareil, au passage.

`__tests__/appareillage3d.test.ts` vérifie l'ORDRE de peinture pour les 22
types, sous six azimuts, aux deux hauteurs qui comptent (prise basse,
interrupteur) — et l'inverse : **vu de dos, le mur doit recouvrir
l'appareil**. Un volume peut exister et rester invisible ; un test qui se
contente de le trouver dans la scène ne prouve rien.

### Les meubles ont une silhouette

Une boîte grise ne dit pas si on regarde un lit ou un frigo. `furniture3d.ts`
découpe donc chaque meuble en quelques volumes — sommier, matelas, oreillers
et dosseret pour un lit ; assise, dossier et accoudoirs pour un canapé ;
plateau et quatre pieds pour une table ; cuve ouverte pour une baignoire.
Les cotes sont **normalisées** (0 à 1 sur chaque axe), donc valables à toute
taille, et le repère local est celui de l'emprise : `x` la largeur, `y` la
hauteur depuis le sol, `z` la profondeur, l'avant en `z = 0`.

Deux libertés assumées. La **tête de lit monte à 1,6 fois** la hauteur du
meuble : au catalogue, la hauteur d'un lit est celle du couchage — 55 cm — et
un dosseret de 55 cm ne se voit pas ; à 1,6 on retrouve les 90 cm d'un vrai
dosseret. Un **robinet** dépasse de même son plan de travail. Ce qu'on ne
sait pas nommer — un escalier, un objet non identifié — reste une boîte : mieux
vaut ça qu'une silhouette inventée.

La silhouette **reste montée pendant les gestes**. Voir le lit se changer en
caisse dès qu'on tourne la pièce, puis redevenir un lit au relâcher, est pire
que tout ; le mode allégé découpe moins finement les pans, mais il ne touche
plus au mobilier.

**Un meuble pose par terre.** Le catalogue plaçait le meuble en supposant le
sol à l'altitude zéro, or le sol d'un scan est là où ARKit l'a trouvé —
souvent un demi-mètre plus bas. Le lit flottait en l'air. Il se pose désormais
sur le sol réel, et le rendu rattrape en plus tout ce qui plane à moins de
45 cm sans raison : rien de cette liste ne se suspend, et une télé murale, elle,
est bien plus haut.

### L'écorché, et l'ombre au sol

Deux détails de rendu qui changent la lecture du modèle.

**L'écorché.** Un mur qui nous fait face cache exactement ce qu'on veut
regarder. Il s'efface donc à mesure qu'il nous fait face — plein vu de champ,
15 % vu de plein fouet, avec un lissage cubique pour qu'aucun degré de
rotation ne fasse sauter le dessin. Son arête reste, elle, à 25 % d'opacité
minimum : un mur effacé doit continuer à dire où il passe. Seule l'app le
fait ; les exports gardent les murs opaques, un plan qu'on imprime ne se lit
pas en transparence.

**L'ombre.** Un meuble sans ombre ne pose pas, il flotte — même quand sa
géométrie est juste au millimètre. C'est le contact avec le sol que l'œil
cherche. Deux nappes concentriques suffisent à le donner, la plus large à
peine teintée ; on ne calcule aucune lumière, on décalque l'emprise décalée
de 5 cm. Rien pour ce qui ne touche pas le sol : une ombre au pied d'une télé
murale désignerait un objet qui n'est pas là.

### Le plan de travail change la règle

« Axe à 1,30 m du sol au maximum, HORS PLAN DE TRAVAIL » — et c'est justement
au-dessus d'une crédence qu'on pose le plus de prises. Sans en tenir compte,
l'app signalait en défaut toute une cuisine, ce qui revient à ne rien
signaler : on n'écoute plus un garde-fou qui se trompe à chaque fois.

`worktopsOnWall()` reconnaît un plan de travail à trois signes : un meuble qui
en porte un (évier, plaque, lave-vaisselle, ou n'importe quel caisson bas SI
la pièce est une cuisine), assez près du mur (75 cm), dessus entre 80 cm et
1 m. Il ne couvre que la portion du mur qu'il longe réellement.
`heightRuleAt()` applique alors 8 cm au-dessus du plan comme minimum, 40 cm
comme maximum — et la correction proposée vise cette fourchette, sinon
« remettre à 25 cm » remettrait la prise derrière le meuble.

### Relever un mur, le reporter sur un autre

Dans un couloir, une chambre symétrique, une enfilade de bureaux, c'est trois
fois le même équipement à la même cote du coin. Le relevé (`copyWallFixtures`)
garde les cotes DEPUIS LE DÉBUT DE LA FACE — celles qu'on lit à l'écran — et
le report (`pasteWallFixtures`) ne pose que ce qui tient : un appareil à
4,50 m du coin ne se colle pas sur un mur de 3 m, un tableau de 55 cm ne
déborde pas. Les ensembles restent des ensembles, avec un identifiant NEUF :
deux murs, deux plaques.

### Cheminement des gaines, et métré

Le plan sait où sont les appareils et où est le tableau : il peut donc dire
par où passe la gaine et combien de mètres acheter. C'est la seule ligne du
devis qu'on ne pouvait pas déduire du relevé, et celle qu'un électricien
estime encore au pas dans le couloir.

Le modèle est volontairement simple, et il le dit : la gaine longe le contour
de la pièce à hauteur de plinthe (15 cm), tourne aux angles, remonte à
l'appareil. `ringPath()` compare les deux sens de contournement et garde le
plus court — jamais la diagonale à travers la pièce, jamais le tour complet
quand un quart suffit. La longueur ajoute la descente du tableau, la remontée
à l'appareil, 60 cm de mou d'about, et la traversée en ligne droite quand le
tableau est dans une autre pièce.

Le calque « gaines » ne s'offre que si un tableau est posé : sans lui, on ne
sait pas d'où part le câble, et une pastille qui n'allume rien est un piège.
Le devis distingue les deux cas — « mesurés sur le plan » ou « environ, 12 m
par point » : on ne signe pas un chiffrage sur un forfait qu'on aurait pris
pour un métré.

### La main sait avant l'œil

Trois moments méritent une secousse : la **butée** (le meuble touche le mur),
l'**accroche** (l'appareil s'est rangé à l'entraxe, l'angle est tombé pile sur
le quart de tour) et l'**avis** (une photo est prise, une pose sort de la
norme). Deux règles sans lesquelles l'utilisateur coupe l'haptique dans les
réglages du téléphone — et perd donc aussi ce qui était utile : jamais deux
secousses de même nature à moins de 120 ms, et un état MAINTENU n'en produit
qu'une (un glissement contre un mur en produirait soixante par seconde).

Le module natif se cherche à chaque appel, jamais au chargement : sur
appareil, l'ordre d'enregistrement des modules n'est pas garanti, et un
`undefined` capturé une fois pour toutes couperait l'haptique pour de bon.

### Photo de repérage

Un relevé se fait vite ; sa relecture, trois jours plus tard, achoppe toujours
sur « c'était quoi, ce mur ? ». Le bouton photo de l'écran de face punaise une
image SUR le mur, à sa cote : elle suit le plan, part avec la sauvegarde, et
se rouvre en grand d'un toucher sur sa punaise.

Côté natif, `UIImagePickerController` plutôt qu'une session AVCapture maison :
c'est l'appareil photo du système, avec sa mise au point et son autorisation
déjà accordée pour le scan. L'image est ramenée à 1600 px de côté avant
écriture — un plan n'a pas besoin de douze mégapixels, et la sauvegarde les
traînerait à chaque écriture. Le fichier vit dans les Documents de l'app : il
ne survit pas à une réinstallation, comme le `.usdz`, et un mur supprimé
laisse sa photo orpheline plutôt que de la détruire.

### Le document que lit un patron électricien

La liste du matériel porte désormais deux sections de plus, dans l'ordre où
on les lit sur un chantier :

**Tirage** — une ligne par circuit : nombre de départs, mètres de conducteur,
diamètre et longueur de gaine. Les diamètres suivent la règle de remplissage
de la NF C 15-100 (la section des conducteurs ne dépasse pas le tiers de
celle du conduit) : 1,5 mm² → ICTA 16, 2,5 → 20, 4-6 → 25, 10 → 32, et les
courants faibles en 25 — on n'y tire jamais une seule paire, et une gaine
trop juste se paie au tirage.

**À commander** — gaines par diamètre et conducteurs par section, en mètres
ET en couronnes de 100 m : le premier chiffre sert à vérifier, le second à
commander. Puis les boîtes d'encastrement, comptées PAR POSTE (une plaque
double, ce sont deux boîtes à 71 mm d'entraxe), les plaques par ensemble avec
leur largeur, et les mécanismes par type. Trois conducteurs par mètre de
parcours : c'est l'erreur classique du métré au doigt mouillé.

Le **plan des gaines** est un interrupteur de l'écran d'export : le tracé du
tirage se superpose au plan, en tireté fin. Décoché par défaut — un plan
d'architecte n'a pas à porter le tirage — et proposé seulement si un tableau
est posé. Écran et document tirent leurs longueurs de la MÊME fonction
(`planRoutes`), sinon l'un dirait une chose et l'autre une autre.

Au passage, un défaut de modèle corrigé : les **interrupteurs n'étaient
portés par aucun circuit**. La norme compte les points lumineux, pas les
commandes — mais une commande est bien câblée sur le circuit d'éclairage, et
l'ignorer revenait à ne jamais compter son câble ni dessiner sa gaine.

### Schémas unifilaire et multifilaire

Tout dossier électrique en porte deux, et l'app peut les déduire du relevé
puisqu'elle connaît déjà les circuits — ce sont EXACTEMENT ceux de la liste
du matériel, mis en forme. Un schéma qui contredirait la liste ne servirait
à rien.

**L'unifilaire** montre l'architecture : disjoncteur de branchement, peigne,
un différentiel par groupe, un départ par circuit avec son calibre, sa
section, sa gaine et le nombre de conducteurs marqué d'une barre oblique — la
convention qui dit en un signe ce que le multifilaire détaille.

**Le multifilaire** montre le câblage : un trait par conducteur, à sa
couleur. Les couleurs sont **normatives**, pas décoratives : bleu clair pour
le neutre et vert/jaune pour la terre sont RÉSERVÉS, et un schéma qui les
emploierait à tort serait faux avant d'être lu. Elles vivent donc dans une
seule table (`WIRE_COLORS`), et un test vérifie qu'aucun autre rôle ne les
reprend. Un circuit d'éclairage compte six fils (phase, neutre, terre, retour
de lampe, deux navettes), un circuit de prises trois, et les courants faibles
ne se colorient pas comme du 230 V.

Faute de pouvoir regarder le PDF depuis la machine de développement,
`__tests__/pdfschema.test.ts` le relit : repères présents, protections
rattachées, couleurs réellement écrites dans le flux, et **rien qui sorte de
la feuille**.

### Le repère de circuit, du plan au tableau

Chaque appareil porte son repère (C1, C2…) sur le plan 2D quand le calque
« gaines » est allumé, et ce sont les mêmes sur l'unifilaire et dans le
tableau de tirage. C'est ce qu'on donne à celui qui tire.

Deux corrections de fond au passage :

- **Deux pièces homonymes ne se confondent plus.** Le regroupement se faisait
  sur le NOM : dans un T4 avec deux « Chambre » non renommées, le tableau
  était faux. On dédoublonne sur l'identité et on numérote les homonymes à
  l'affichage.
- **Un appareil arrive à SA hauteur normalisée**, pas à 20 cm du sol. Tout
  arrivait à 20 : une prise y est chez elle, un interrupteur non, et un
  tableau électrique s'annonçait « trop bas » à la seconde où on le posait.
- **Le tableau est réclamé.** Sans lui, ni métré de câble, ni plan des
  gaines, ni tirage : le constat monte en alerte avec un bouton qui le pose.
  Deux tableaux, ou un tableau en salle d'eau, sont signalés aussi.

### Ce qui est accroché à un mur doit survivre au recousage

Le défaut le plus coûteux qu'on ait trouvé, et le plus silencieux.
« Redresser le plan », ajouter une cloison, déplacer un coin : tout passe par
`splitAtJunctions` + `mergeColinear`, et là les identifiants changent — un mur
coupé en deux ne garde le sien que sur le PREMIER morceau, un mur fusionné que
celui du plus long.

Les ouvertures étaient reprojetées depuis longtemps. L'appareillage, non. Une
prise posée dans la seconde moitié d'un mur de 6 m se retrouvait avec une cote
de 4,50 m sur un mur devenu long de 3 : dessinée dans le vide. Une prise d'un
mur fusionné disparaissait de l'écran, des comptages, des circuits et du
métré — sans alerte, et sans rien à annuler puisque rien ne semblait s'être
passé.

`reprojectFixtures()` reporte donc chaque appareil par sa POSITION sur le
nouveau jeu de murs, en conservant sa face par sa normale : un appareil ne
change pas de côté de cloison parce qu'on a redressé le plan. Les photos
suivent le même chemin (`reprojectAnchors`).
`__tests__/reprojection.test.ts` rejoue les deux cas, découpe et fusion, et
vérifie qu'aucune prise ne sort de son mur.

### Trois fuites, fermées

- **Les photos d'un scan supprimé** restaient dans les Documents pour
  toujours, sans que personne puisse les retrouver. Elles sont effacées avec
  le scan — sauf celles qu'un autre scan référence encore, et jamais rien
  hors du dossier `photos`.
- **L'appareil photo** s'ouvrait sur un écran noir si la caméra avait été
  refusée au scan : `takePhoto` demande maintenant l'autorisation, et renonce
  proprement si elle est refusée.
- **Le presse-papier de mur** survivait au changement de scan : on pouvait
  coller sur un plan les cotes d'un autre logement. Il se vide à l'ouverture.

Une règle en est sortie, qui vaut pour tout le store : **ne jamais importer
`react-native-room-scan` depuis le store**. Le module construit un
`NativeEventEmitter` au chargement ; l'import faisait tomber six suites de
tests d'un coup. Les fonctions natives se cherchent dans `NativeModules`, à
chaque appel (`src/ui/photos.ts`, `src/ui/haptic.ts`).

### Les volumes de la salle d'eau

Le seul contrôle de l'app où une erreur est DANGEREUSE et non gênante : une
prise à 40 cm d'une baignoire ne se remarque pas sur un plan, et elle tue.
`volumes.ts` situe chaque appareil dans le découpage de la norme — volume 0
(l'intérieur du receveur), volume 1 (son aplomb jusqu'à 2,25 m), volume 2
(60 cm autour, jusqu'à 2,25 m) — et `volumeVerdict()` dit ce qui y est admis :
aucun socle en 1 ni en 2 (sauf rasoir sur transformateur), pas de commande en
volume 1, luminaire TBTS ou IPX4 classe II. Chaque verdict porte SA règle : un
interdit sans motif ne sert à rien.

Deux choses que ce module ne fait pas, et qu'il vaut mieux savoir : il ignore
les parois fixes (qui rabattent les volumes) et les indices IP du matériel
choisi. Il situe un appareil dans un volume ; il ne délivre pas d'attestation.
**Et sans baignoire ni douche relevée, il se tait** — l'app ne peut rien
affirmer sur une pièce dont elle ne connaît pas les équipements, et rassurer à
tort serait pire que se taire. La liaison équipotentielle et le 30 mA, eux,
sont rappelés dans tous les cas.

### Un meuble contre un mur ne se voit pas de l'autre côté

Même piège que pour l'appareillage, et il ressort sur les objets plats : un
pan de mur se trie sur le centre de sa tuile, donc à mi-hauteur ; une télé
accrochée à 1,35 m se trie plus haut, et en vue plongeante le terme
d'altitude la faisait passer DEVANT le mur — on la voyait depuis la pièce
d'à côté.

Un meuble dont la saillie ne dépasse pas 50 cm du nu se trie donc AVEC son
mur, avancé de sa propre saillie : vu de sa pièce il passe juste après le
mur, vu de dos le mur le couvre. La demi-emprise se mesure
PERPENDICULAIREMENT au mur — prendre la plus grande dimension d'une télé de
1,20 m l'aurait exclue d'office. Au-delà de 50 cm, on ne fait rien : un lit
de 1,90 m trié avec le mur de sa tête passerait devant ce qui se trouve à son
pied.

Au passage, **la télé se fixe au mur** : plus de pied ni de socle. Presque
toutes le sont aujourd'hui, et un pied dessiné sous un écran accroché à
1,10 m ne décrit rien de réel.

### L'établi électrique, et le bloc qui se déplace d'un tenant

Deux défauts que l'usage au doigt révèle seul.

**La fenêtre était une vignette.** On y place des appareils à cinq
centimètres près sur un dessin de 250 px de haut : le pouce couvrait le tiers
du mur. Elle prend maintenant tout l'écran — c'est un établi, pas une
notification —, le dessin occupe ce qui reste une fois les commandes posées,
et la cible de saisie passe de 34 à **44 px**, le minimum d'iOS ; en dessous
on ratait une prise sur trois, et on désélectionnait au lieu de saisir.

**Le doigt cache ce qu'il déplace.** Un pavé de quatre flèches règle la cote
sans rien masquer, au centimètre ou par pas de cinq — c'est le geste qu'on
fait vraiment quand on veut « 5 cm plus à gauche ».

**Un ensemble se déplace D'UN BLOC.** Deux prises sous une même plaque, ce
n'est plus deux appareils : c'est une plaque de 153 mm avec deux mécanismes.
En déplacer un seul cassait l'entraxe — l'ensemble n'existait que tant qu'on
n'y touchait pas. Tout le lot suit donc le même vecteur, et c'est le BLOC
qu'on borne au mur, pas chaque poste : sans quoi le premier arrivé au bord
écrase les autres contre lui. Retirer un poste d'une paire défait la plaque
et rend l'appareil restant libre ; d'un trio, il reste un ensemble de deux.

### Les schémas se lisent SUR LE PLAN

Un unifilaire hors sol dit d'où part quoi ; il ne dit pas où ça passe. Sur le
chantier, la question est toujours la même — « ce départ, il va où ? » — et la
réponse se lit sur le plan de la pièce, pas sur un peigne abstrait. Le dossier
porte donc trois feuilles : l'unifilaire hors sol, puis les deux schémas posés
sur le plan.

- **Unifilaire sur plan** : un trait par circuit, du tableau à ses appareils,
  barré du nombre de conducteurs au départ — la convention de l'unifilaire.
  Chaque circuit a sa teinte, son repère (C1, C2…) posé au bout du tracé, et
  la légende en donne le calibre.
- **Multifilaire sur plan** : un trait par conducteur, décalé de ses voisins,
  à sa couleur normalisée. L'écartement suit l'échelle du plan pour rester
  lisible sans devenir un ruban.

Les deux passent par `planPage()` avec une SURCOUCHE : mêmes murs, mêmes
meubles, mêmes symboles que le plan d'ensemble, et le schéma par-dessus.
Tout est tracé dans la fenêtre de découpe du plan (`d.clip`), légende
comprise — **rien ne peut sortir du cadre**, quel que soit le zoom demandé.

Et l'aperçu d'export montre enfin ce que le document portera : cotes 2D,
cotes 3D et tracé des gaines suivent leurs interrupteurs. On décochait
« cotes sur le plan 2D » et rien ne changeait sous les yeux — il fallait
ouvrir le PDF pour vérifier son réglage.

### Jonctions de murs

Un mur n'est pas un trait épais posé à côté des autres : `wallQuads()` traite
chaque nœud du plan, trie les murs qui s'y rejoignent par angle et coupe les
faces deux à deux (onglet). Les deux murs d'un angle partagent donc le même
point au sol, en 2D comme en 3D et dans le PDF. Une extrémité libre reçoit un
about droit ; posée sur le flanc d'un autre mur, elle est prolongée d'une
demi-épaisseur pour entrer dans son corps (jonction en T).

### Un geste ne se refabrique pas en cours de route

La panne la plus coûteuse de tout le mobilier, et invisible à la lecture. Le
meuble bouge → le store le recrée → la prop `raw` est un objet neuf → le
`useMemo` qui fabriquait le `PanResponder` se ré-exécutait. Or l'état d'un
responder — le `dx` cumulé depuis l'appui — vit DANS l'instance : la nouvelle
n'a jamais reçu l'appui, son `dx` repart de zéro, et le meuble retourne à sa
position de départ. À l'usage : « impossible de le bouger », « il revient tout
seul ».

Règle, pour les deux poignées (déplacement et rotation) : le responder se crée
**une fois** (`[objectId]` en dépendance), et tout ce qui change à chaque
image — le meuble, le cadrage, l'angle de vue — passe par une **référence**
mise à jour au rendu. `__tests__/poignees.test.tsx` monte la poignée, la
re-rend vingt fois avec des positions différentes et vérifie que les
gestionnaires gardent la même identité.

### Le nord

ARKit démarre son monde là où le scan commence : son axe −Z regarde dans la
direction du téléphone au premier instant, et rien de plus. Deux scans du
même appartement n'ont donc aucune raison d'être orientés pareil.

Pendant le scan, `RoomScanCompass` relève donc à 2 Hz, **au même instant**,
le cap du téléphone (`CMDeviceMotion.heading` dans le repère
`.xMagneticNorthZVertical`, qui ne demande aucune autorisation — le nord
géographique, lui, exigerait la localisation) et la direction de visée de la
caméra dans le monde ARKit. Leur différence est le cap de l'axe −Z du monde :
une seule valeur, constante pour tout le scan.

Elle est moyennée **circulairement** — la moyenne arithmétique de 359° et 1°
donnerait 180°, soit plein sud pour deux relevés plein nord.

Le plan porte alors une **rose des vents** dans son coin haut-gauche, qui
tourne avec lui : le N montre le nord réel à toute rotation. Elle n'apparaît
que si le magnétomètre a donné quelque chose de sûr (au moins quatre relevés
concordants) — mieux vaut pas de rose qu'une fausse.

Deux réserves : le magnétomètre est perturbé par le métal, et un appartement
en est plein (huisseries, radiateurs, câblage) ; et c'est le nord
**magnétique**, qui s'écarte du géographique d'un degré ou deux sous nos
latitudes — sans conséquence pour orienter un plan.

### Couleurs et textures

Pendant le scan, la session ARKit/ARCore est lue en parallèle (~3 Hz, lecture
seule) : chaque mur est projeté dans l'image caméra et une petite grille de
couleurs (6 × 4) y est moyennée, ainsi qu'une carte du sol par cases de 40 cm
et une couleur par meuble. Sur iOS, la carte de profondeur LiDAR sert à
écarter les points cachés. Le bouton **Couleurs** applique ces relevés à la
vue 3D et au PDF ; il n'apparaît que si le scan en a rapporté.

**Le plan 2D, lui, reste neutre.** Le calque avait été branché dessus aussi,
et il n'y servait à rien : sous le poché noir des murs et le semis de points
du sol, une teinte relevée ne se lit pas. Le bouton a quitté la barre du
plan ; il ne reste que sur la vue 3D, où une surface se lit vraiment.

### Dossiers de la bibliothèque

Les dossiers viennent **en tête** de « Mes scans », en **grandes icônes** avec
leur nom dessous : c'est le rangement, il précède ce qui est rangé — et une
icône se vise bien mieux qu'une ligne quand on lui amène quelque chose. Un
appui ouvre le dossier, un appui long propose de le renommer ou de le
supprimer. Le supprimer ne supprime rien : les scans reviennent à la racine.

**On y dépose un scan en le tenant une demi-seconde**, puis en l'amenant sur
l'icône. Une seconde, c'était trop long — le doigt croit que rien ne se passe
et repart. Le geste se raconte tout seul : le scan **rétrécit et pâlit**,
fantôme de ce qu'on déplace, pendant que les dossiers **grossissent** pour
dire qu'on peut lâcher là ; celui qu'on survole grossit encore.

Quatre détails sans lesquels ça rate :

- **la liste cesse de défiler** pendant qu'on tient le scan — déplacement et
  défilement sont le même mouvement du doigt, il faut trancher ;
- **les cadres des icônes sont mesurés à l'écran à l'instant où le scan se
  décolle**, ni avant (la liste a pu défiler) ni après (il faut savoir
  survoler dès le premier pixel) — et élargis de 12 px, parce que viser une
  icône au doigt n'est pas viser un pixel ;
- **le bandeau d'aide flotte** au lieu de pousser la liste : apparaissant
  pile après la mesure, s'il décalait les rangées, le scan tomberait à côté ;
- **la rangée est un composant à part entière** et non une fonction définie
  dans le rendu : définie dedans, React en voyait un type neuf à chaque
  changement d'état et démontait la ligne — le doigt perdait en plein geste
  celle qu'il tenait.

Chaque scan montre **l'aperçu de son plan** à côté de son nom. Ce n'est pas
une capture d'écran : le plan est une liste de murs, on le retrace en
quelques traits dans 54 px. Rien à stocker, rien à invalider — un scan
retouché montre son nouveau contour à l'ouverture suivante de la liste.

## Prérequis pour tester sur iPhone

1. **Un iPhone avec LiDAR** : iPhone 12 Pro / 13 Pro / 14 Pro / 15 Pro / 16 Pro
   (ou iPad Pro 2020+). Sur un iPhone non-Pro, l'app se lance mais affiche
   « appareil non compatible » — RoomPlan exige le LiDAR.
2. **Un compte Apple Developer Program** (99 €/an) — indispensable pour
   installer une app hors App Store depuis Windows.
3. **Un compte Expo** (gratuit) pour compiler dans le cloud avec EAS Build,
   puisqu'il n'y a pas de Mac ici (Xcode n'existe pas sous Windows).

## Compiler et installer sur l'iPhone (depuis Windows, via EAS)

```bash
npm install -g eas-cli
eas login                      # compte Expo
eas init                       # lie le projet (répondre oui aux questions)
eas device:create              # enregistre l'iPhone : ouvrir le lien sur le
                               # téléphone et installer le profil
eas build -p ios --profile adhoc
```

À la première compilation, EAS demande les identifiants Apple Developer et crée
automatiquement certificats et profils de provisioning. À la fin (~15-25 min),
la page du build affiche un **QR code : le scanner avec l'iPhone installe
l'app** directement.

Pour distribuer plus proprement ensuite : `eas build -p ios --profile production`
puis `eas submit -p ios` → TestFlight.

### Alternative 100 % gratuite (sans Apple Developer payant)

Le workflow [.github/workflows/build-ios-unsigned.yml](.github/workflows/build-ios-unsigned.yml)
compile une version **non signée** sur les Mac gratuits de GitHub Actions :

1. Pousser le projet sur un dépôt GitHub → onglet **Actions** → télécharger
   l'artefact `RoomScanner-unsigned-ipa`. En ligne de commande, tout se fait
   d'un bloc : `bash tools/ship.sh "Message de commit"`.

   > **Ne jamais télécharger « le dernier run ».** GitHub met quelques
   > secondes à créer le run d'un push : `gh run list -L 1` lancé juste
   > après rend celui d'AVANT, déjà terminé. `gh run watch` rend alors la
   > main aussitôt, `gh run download` sans identifiant prend l'artefact le
   > plus récent, et on dépose le build du commit précédent en annonçant le
   > nouveau. Le symptôme est trompeur au possible : l'app paraît ignorer
   > les dernières corrections, alors que le code est juste. Le signe qui ne
   > trompe pas est la TAILLE de l'IPA, identique à l'octet près d'une
   > livraison à l'autre. `tools/ship.sh` retrouve le run par son commit et
   > attend qu'il existe.
2. Sur le PC, installer **Sideloadly** (ou **AltStore**) + les pilotes Apple
   (iTunes). iPhone branché en USB, glisser l'IPA, entrer son identifiant
   Apple (gratuit) → l'app s'installe.
3. Sur l'iPhone : Réglages → Général → VPN et gestion de l'appareil → faire
   confiance au profil développeur.

Limites du compte gratuit : l'app expire au bout de **7 jours** (re-signer
via le PC ; AltStore le fait tout seul en WiFi si AltServer tourne), 3 apps
maximum. Dépôt GitHub public = minutes macOS illimitées ; privé = ~8 builds
gratuits/mois (multiplicateur ×10 sur les 2000 minutes offertes).

### Alternative avec un Mac sous la main

```bash
cd ios && pod install
open RoomScanner.xcworkspace   # choisir l'iPhone comme cible et Run
```

Avec un Mac, un compte Apple **gratuit** suffit (signature locale 7 jours).

## Android

```bash
npx react-native run-android   # appareil ARCore branché en USB, mode développeur
```

ou `eas build -p android --profile adhoc` pour un APK cloud.

## Développement JS (sans recompiler le natif)

Après la première installation, `npx react-native start` + ouverture de l'app
suffit pour itérer sur le JS/TS. Une recompilation native (EAS ou Mac) n'est
nécessaire que si les fichiers Swift/Kotlin ou les dépendances natives changent.

## Chaîne de livraison

`npx tsc --noEmit && npx eslint src App.tsx __tests__ && npx jest` — puis
commit, push, et GitHub Actions. **Ne jamais écrire `npx jest | tail`** : le
code de sortie devient celui de `tail`, donc toujours zéro, et un test rouge
passe inaperçu jusqu'à la CI. C'est arrivé une fois.

## Vérifications faites sur cette machine (Windows)

- `npx tsc --noEmit` et `npx eslint src App.tsx` : aucun diagnostic.
- `npx jest` : 177/177 tests verts (conversion matrice iOS→segment, extrémités
  Android, soudure des coins et jonctions en T, onglets des murs, surface au
  sol, semis de points, lecture des textures, snap angulaire, projection
  mètres↔pixels, génération du PDF ; **multi-pièces** : découpe par pièce,
  non-fusion de deux pièces mitoyennes, surfaces cumulées, sols distincts,
  mise à plat d'un résultat de scan, migration des scans mono-pièce ;
  **rendu** : fusion des murs colinéaires — ordre, sens, T, pièces et
  hauteurs différentes —, recomposition de la grille de couleurs, contours
  découpés en arêtes, cadrage identique en mode geste ; **volumes** :
  normales sortantes unitaires, jamais deux faces opposées visibles à la
  fois, rattachement des ouvertures à leur mur, découpe du mur en trumeaux /
  linteau / allège, non-recouvrement des panneaux, porte rendue en bloc sans
  biais de tri ; **détection** : une pièce, deux pièces séparées par un
  refend partagé, trois pièces en enfilade, cloison qui ne ferme rien, plan
  ouvert, boucle-bruit écartée, pièces disjointes ; **nommage** : déduction
  par le mobilier, numérotation des homonymes et des indécidables ;
  **jonctions** : découpe du mur porteur, coin épargné, texture recoupée, T2
  et T3 démêlés depuis la topologie brute de RoomPlan ; **cartouche** : pôle
  d'inaccessibilité, pièce en L où le barycentre sort ; **meubles** : volume
  à faces masquées, recalage d'une télé encastrée ; **bout en bout** : un T2
  brut → deux pièces nommées, meubles répartis, contours exacts ;
  **retouches** : fusion de deux pièces, scission par cloison, noms gardés à
  la redétection, hauteur par pièce et refus des valeurs aberrantes, cotes
  hors-tout, surface murale nette, feuille de métré activable ;
  **électricité** : repère des deux faces d'un mur, longueurs différentes
  par l'onglet, gauche/droite vérifiées contre la projection réelle de la
  vue 3D, pose à 20/20, appareil large qui ne déborde pas, volume posé
  devant le nu sans y entrer, gabarit et hauteur, faces arrière masquées,
  appareil orphelin qui ne dessine rien, bornage des cotes au mur,
  retournement sans glissement, mur supprimé qui emporte son appareillage,
  annulation, scans d'avant l'électricité, symboles distincts par type et
  échelonnement des appareils superposés ; **NF C 15-100** : usage d'une
  pièce lu dans son nom, exigences par pièce et par surface, chambre
  sous-équipée, hauteurs de pose interdites, socles du plan de travail
  comptés à leur hauteur, socle 32 A hors cuisine, minimum de prises de
  communication, huit socles par circuit, cuisine séparée, circuits dédiés,
  différentiel de type A sur la cuisson, disjoncteurs déduits des circuits,
  PDF de la liste du matériel).
- **Non vérifié ici** : la compilation Swift/Kotlin (impossible sans Mac /
  SDK Android). Les points d'attente connus sont notés ci-dessous.

## Points d'attention connus

- Le post-traitement RoomPlan prend quelques secondes après « Terminer » —
  l'écran affiche un état « Traitement… » pendant ce temps.
- iOS 17+ : la pause garde la session ARKit chaude (`stop(pauseARSession:false)`),
  la reprise relocalise. Sur iOS 16 la pause arrête la session.
- Un scan LiDAR de plusieurs minutes fait chauffer le téléphone : c'est
  attendu, la pause existe pour ça.
- Android : la qualité dépend fortement de la texture des murs ; les murs
  blancs uniformes se détectent mal (limite d'ARCore, pas un bug).
- Les couleurs relevées sortent telles quelles de la caméra, exposition
  automatique comprise : elles sont fidèles les unes aux autres dans un même
  scan, mais deux scans d'une même pièce sous des lumières différentes ne
  donneront pas exactement les mêmes teintes.
- Android n'a pas de test d'occultation (pas d'équivalent simple de la carte
  de profondeur LiDAR) : un mur en partie masqué par un meuble récupère un
  peu de sa couleur. La moyenne sur toute la durée du scan lisse l'essentiel.
- Détection des pièces : elle ne voit que ce qui se referme. Une porte
  ouverte sans huisserie détectée, ou un mur manquant, fusionne deux pièces
  en une. À l'inverse, un placard fermé compte pour une pièce — on peut le
  retirer d'un geste depuis le plan.
- Détection des pièces : elle a lieu UNE fois, à la fin du scan. Déplacer un
  coin ensuite ne recrée ni ne supprime de pièce ; le contour, lui, suit.
- Nommage : il ne peut être meilleur que la détection d'objets de RoomPlan.
  Un bureau, une entrée ou un couloir n'ont pas de mobilier caractéristique
  et sortiront en « Pièce N ».
- Le relevé de couleurs du sol est une seule carte monde par scan, plafonnée
  à 64 × 64 cases de 40 cm (25,6 m de côté). Au-delà, seule la couleur
  moyenne subsiste. Chaque pièce n'y peint que les cases tombant dans son
  contour.
