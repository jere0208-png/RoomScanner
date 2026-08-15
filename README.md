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
└── screens/                 Home / Scan (HUD sur vue AR) / Résultat (plan éditable)
```

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

### Sélectionner un mur

Toucher un mur en mode édition **estompe tout le reste du plan** et redessine
ce mur par-dessus le voile. Ses commandes — coter, ajouter une ouverture,
supprimer — viennent se poser **à côté de lui**, décalées vers l'intérieur de
la pièce et bornées au cadre : jamais sur le mur, jamais hors de l'écran. La
barre du bas, qui débordait dès que le clavier montait, a disparu ; seule la
saisie de la cote subsiste, en haut du plan.

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

**Le mur rouge propose la correction, il ne se contente pas de la
constater.** La carte porte le geste qui efface le défaut — « Poser la prise
manquante », « Poser une prise à 110 cm », « Remettre à 110 cm » — et
l'applique séance tenante, puis ouvre le mur de face pour qu'on voie le
résultat. Un défaut qu'on se contente d'afficher laisse chercher tout seul
quoi en faire.

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

**En 3D, un repère de taille fixe.** Le volume posé sur le mur fait 8 cm : à
l'échelle d'un logement entier, c'est deux pixels — l'appareil existait mais
ne se voyait pas. Le même symbole est donc posé par-dessus, à taille
constante quel que soit le zoom, et masqué dès que sa face tourne le dos à la
caméra. **En s'approchant** (au-delà de 90 px par mètre), il déplie ses deux
cotes : hauteur d'axe et distance au bord gauche de la face. C'est là qu'on
vient les lire, et nulle part ailleurs — les afficher en permanence noierait
le modèle.

**Limite** : tout s'accroche à un mur. Les points de plafond — DCL, spots,
détecteur de fumée — n'ont pas de support dans ce modèle et ne sont pas
proposés.

### Les fenêtres

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

En édition, dans l'ordre : **annuler** (seulement s'il y a quelque chose à
annuler), **+** pour l'appareillage, le diagnostic, l'équerre. En lecture :
cotes, meubles, surface au sol.

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

### Jonctions de murs

Un mur n'est pas un trait épais posé à côté des autres : `wallQuads()` traite
chaque nœud du plan, trie les murs qui s'y rejoignent par angle et coupe les
faces deux à deux (onglet). Les deux murs d'un angle partagent donc le même
point au sol, en 2D comme en 3D et dans le PDF. Une extrémité libre reçoit un
about droit ; posée sur le flanc d'un autre mur, elle est prolongée d'une
demi-épaisseur pour entrer dans son corps (jonction en T).

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

Les dossiers viennent **en tête** de « Mes scans » : c'est le rangement, il
précède ce qui est rangé. Un dossier s'ouvre d'un appui, se renomme par son
crayon, et sa suppression ne supprime rien — les scans qu'il contenait
reviennent à la racine.

**On y dépose un scan en le tenant une seconde**, puis en l'amenant sur le
dossier : la ligne se décolle, s'agrandit, et le dossier survolé s'allume.
Trois détails sans lesquels le geste rate :

- **la liste cesse de défiler** pendant qu'on tient le scan — déplacement et
  défilement sont le même mouvement du doigt, il faut trancher ;
- **les cadres des dossiers sont mesurés à l'écran à l'instant où le scan se
  décolle**, ni avant (la liste a pu défiler) ni après (il faut savoir
  survoler dès le premier pixel) ;
- **le bandeau d'aide flotte** au lieu de pousser la liste : apparaissant
  pile après la mesure, s'il décalait les rangées, le scan tomberait à côté.

La rangée est un composant à part entière et non une fonction définie dans le
rendu : définie dedans, React en voyait un type neuf à chaque changement
d'état et démontait la ligne — le doigt perdait en plein geste celle qu'il
tenait.

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
   l'artefact `RoomScanner-unsigned-ipa`.
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
