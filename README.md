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

**Et le scan fini demande quoi intégrer.** Relevé du patron : « à la fin du
scan il doit demander si on veut intégrer les éléments électriques
détectés, et les meubles — on coche nos choix et on valide ». Le popup
(`ChoixScan`) paraît sur le résultat d'un scan frais, tout coché d'office :
« N meubles **détectés** », « Électricité **proposée** aux normes ». Les
mots sont pesés, parce que la vérité technique l'exige : RoomPlan détecte
les meubles, mais **pas l'appareillage mural** — une prise fait trois
centimètres, son modèle LiDAR voit des caissons. L'électricité cochée pose
donc l'implantation NF C 15-100 du moteur « Normes auto » (hors meubles,
hors menuiseries), rapport à l'appui ; les meubles décochés se retirent
d'un coup (`retirerMeubles`). Écrire « détectée » pour l'élec serait
mentir, et un plan qui ment est pire qu'un plan incomplet. Une vraie
détection visuelle (Vision/CoreML pendant la capture) reste possible un
jour — c'est un chantier NATIF, qui ne se règle pas sans Mac sous la main.

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

### Deux choses qui se cachaient

**Le bandeau d'attente ne marche plus sur les outils.** Relevé du chantier :
« le bouton qui dit de toucher un interrupteur après "Lier" est peu visible
et mal placé, sur des autres blocs, en bas ». Il avait fait les deux coins :
en haut à droite il passait derrière les pastilles de calques, en bas il
recouvrait la rangée d'outils — qui occupe toute cette bande. La bonne place
était le haut À GAUCHE, libre dans les deux cas, en s'arrêtant avant les
pastilles du coin droit. Et sa consigne, bridée à cent trente-huit points,
sortait tronquée (« Touchez l'interrupteur q… ») : une consigne coupée en
son milieu ne dit plus quoi toucher. Elle a maintenant deux lignes et toute
la largeur.

**La cote du mur tient dans son cadre.** « La longueur du mur, sa cote est
cachée en haut du bloc » : la ligne de cote se pose vingt-six points
au-dessus du plafond et la marge du dessin en valait *autant*, si bien que
le nombre écrit dessus débordait — « 2,72 m » sortait coupé dans le sens de
la hauteur. Une marge doit contenir ce qu'elle marge : le texte compte, pas
seulement le trait.

### L'établi tient dans une main

Relevé du patron, capture à l'appui : « repense un peu cette page pour plus
de simplicité et plus ergonomique et moderne, optimisé smartphone ». Trois
défauts s'y voyaient, et le même mal les explique — l'écran était rangé par
NATURE des éléments, pas par ce qu'on en fait.

**Le titre sortait tronqué deux fois** (« Face au… », « mur sud-est de
2,8… ») : trois boutons se partageaient l'en-tête avec lui, dont un
« Enregistrer » vert qui prenait le tiers de la largeur. Autrement dit,
l'écran ne disait plus devant quoi on se trouvait. Ne reste en haut que la
sortie qui ABANDONNE : le geste rare, petit, là où l'on ne va pas par
mégarde.

**Quatre boutons éteints occupaient le bas** dès l'ouverture — le défaut que
cet écran avait déjà corrigé une fois, et qui était revenu par la porte des
ajouts successifs. Un bouton qui ne commande rien ne s'affiche plus : sans
appareil tenu il n'y a que deux gestes possibles sur un mur (en poser un, le
photographier), et ils tiennent au large ; dès qu'on en tient un, ses quatre
gestes remplacent les deux autres. La photo descend d'ailleurs là : c'est
une ACTION, elle n'avait rien à faire dans l'en-tête à disputer sa place au
titre.

**Et l'action principale vivait en haut**, dans le coin le plus difficile à
atteindre d'un téléphone tenu d'une main. « Enregistrer » est maintenant en
bas, sur toute la largeur, dans le bleu de la maison — le vert n'était la
couleur de rien d'autre dans l'app, et il criait plus fort que le titre
qu'il écrasait.

Les deux sorties ne se ressemblent donc plus, et c'est voulu : elles étaient
voisines, donc de même gabarit ; elles sont maintenant séparées par ce
qu'elles font.

### L'élec se pose PENDANT le scan, au viseur

Relevé du chantier : « pendant un scan, permet d'ajouter manuellement des
PC, inter, point lumineux. Le scan crée aussi un plafond, où l'on peut
placer aussi les points lumineux plafond. Ça permettrait lors d'un devis de
quantifier les éléments et leur placement — on mémorise l'emplacement avec
un viseur au centre (un carré), dans lequel on peut placer des éléments élec
(bouton placé sur le côté proprement). »

C'est le bon moment pour le faire, et c'est même le seul : on est DEVANT le
mur, on voit la boîte existante, on sait où passera la nouvelle. Viser au
centre de l'écran vaut mieux que replacer de mémoire, une heure plus tard,
sur un plan — et le devis se chiffre en sortant du logement.

**Un carré au centre, des boutons sur le côté.** Le viseur est fait de
quatre coins, pas d'un cadre plein : on doit VOIR le mur qu'on vise. Les
boutons (PC, INT, LUM) tiennent une colonne contre le bord droit — hors du
chemin du pouce qui tient le téléphone, et loin de la miniature 3D que
RoomPlan pose au centre-bas. Un compteur dit ce qu'on a saisi, et une
flèche retire le dernier : on vise mal une fois sur dix.

**Et le repère reste planté sur le mur.** Relevé du chantier : « tu peux
afficher sur le mur du scan les ajouts ? Un bloc PC ou peu importe ce qu'on
ajoute, qui se place sur le mur qu'on vise et il reste pendant le scan ».
C'est ce qui manquait pour travailler en confiance : un compteur qui monte
dit qu'on a appuyé, pas qu'on a visé juste. Un carré posé sur le mur, lui,
se relit d'un coup d'œil — on voit ses trois prises alignées, ou celle qui a
glissé sur la fenêtre.

**Première tentative, et son échec — à garder en mémoire.** Une `ARSCNView`
transparente par-dessus la vue de scan, partageant sa session : elle a pris
le rendu à RoomPlan. Retour du chantier, sans appel : « on ne voit plus du
tout ce qu'on scanne » — écran noir, les repères flottant seuls dans le
vide. **Une session ARKit ne se rend qu'une fois**, et c'est RoomPlan qui la
rend ; lui seul sait dessiner ses guides.

On ne dessine donc plus en 3D : on PROJETTE. À chaque image, la caméra
elle-même ramène chaque point du monde vers l'écran
(`ARCamera.projectPoint`) et une étiquette se pose à cet endroit
(`RepereLayerView`). La vue ne fait que LIRE la session — rien ne lui est
disputé. Deux conséquences heureuses : les étiquettes gardent leur taille et
restent lisibles de loin (un carré de neuf centimètres, à quatre mètres, ne
fait plus rien), et le coût est nul — une poignée de projections par image,
pas un second rendu. Ce qui est DERRIÈRE la caméra se cache : `projectPoint`
rend un point d'écran même pour ce qu'on a dépassé, et l'étiquette revenait
alors se poser au milieu de l'image.

**Et l'on ne pose que sur un MUR.** Relevé du chantier : « les éléments
doivent pouvoir se mettre sur les murs uniquement ». Le rayon s'arrête sur
la première surface qu'ARKit connaît — le sol, une table, un plan estimé en
l'air : on en tirait des appareils posés dans le vide, que le plan jetait
ensuite sans rien dire. La pose exige donc un mur RELEVÉ, et le refus dit
quoi faire (« Visez un mur déjà relevé — balayez-le d'abord »). Seul
l'éclairage garde le droit d'être en hauteur : le plafond, RoomPlan n'en
modélise aucune surface.

**Le natif ne rend qu'un point.** Un rayon part du milieu de l'image
(`ARFrame.raycastQuery` en coordonnées normalisées, donc 0,5 / 0,5) et
s'arrête sur la première surface qu'ARKit connaît — le plan existant
d'abord, l'estimation ensuite. C'est tout ce qu'un raycast sait dire ; et
quand il ne rencontre rien, l'app le dit franchement (« Rien à viser ici —
approchez-vous du mur ») plutôt que de poser au jugé un appareil dont
personne ne saurait d'où il sort.

**Et l'ancre connaît SON MUR.** Premier essai sur le chantier : « ça a bien
pris en compte mais rien ne s'affiche sur le plan 2D ensuite ». La cause
était en amont de tout le métier : une ancre n'était qu'un point du monde
ARKit, or le modèle livré passe par `RoomBuilder` — et par
`StructureBuilder` dès qu'il y a plusieurs passages. Ces post-traitements
RECALENT la géométrie dans leur propre repère : les points, restés dans
l'ancien, tombaient à des mètres de tout mur et se faisaient jeter,
exactement comme la règle le prévoit — silencieusement.

Le natif nomme donc le mur visé au moment de la pose (`murLePlusProche`,
mesuré à la SURFACE et non à son centre : un mur de quatre mètres a son
centre à deux mètres de ses bords) et relève la cote DANS SON REPÈRE :
abscisse depuis le bord, hauteur au-dessus du pied. Un identifiant ne se
déplace pas — c'est la seule information qu'un recalage ne peut pas fausser.
Le point du monde reste en secours, pour le cas où la fusion aurait
redécoupé le mur.

**Et décocher les normes ne retire rien de ce travail.** « Je voulais avoir
que ce que j'ai ajouté, pas le reste » : le popup de fin de scan compte
désormais les appareils posés au viseur et le dit — la ligne devient
« Compléter aux normes », et son détail rappelle que ce qui a été visé est
déjà dans le plan. Sans quoi on décoche en croyant tout perdre.

**Tout le métier est en JS** (`ancrerElec`), et c'est là qu'il est testable.
Chaque point est rattaché au mur le plus proche — mesuré à l'AXE, comme le
modèle, et seulement si sa projection tombe DANS le segment, sinon un mur
lointain mais bien orienté attraperait un point posé au-delà de son bout.
Trente-cinq centimètres de portée : de quoi couvrir la demi-épaisseur du mur
et l'imprécision de la main, sans jamais attraper la cloison d'en face (le
plus étroit des couloirs fait quatre-vingts). La face retenue est celle qui
regarde la pièce, la hauteur est celle du point visé, bornée au mur.

Un point de plafond, lui, ne se juge pas à la hauteur seule : une applique
visée haut reste contre son mur. C'est la CONJONCTION d'une hauteur et d'un
éloignement des murs qui fait un plafond — ou la nature de l'appareil, un
détecteur de fumée n'allant nulle part ailleurs. Et ce qui ne tombe ni sur
un mur ni dans une pièce est **jeté** : on vise en marchant, la caméra passe
par des fenêtres et des couloirs, et un appareil posé au hasard salirait le
plan comme le métré.

### Le doigt qui fait défiler ne prend pas le relevé

Relevé du chantier : « les fichiers deviennent des bulles pour le
déplacement mais trop facilement, le temps de poser le doigt pour scroll il
se cible ». Le compte à rebours de l'appui long démarrait au contact et RIEN
ne l'arrêtait : la `ScrollView` finit bien par annuler le toucher de ses
enfants, mais trop tard — la bulle était déjà en l'air, et le relevé partait
alors qu'on voulait juste voir la suite de la liste.

Deux réponses, et il faut les deux. Le geste a **plus de temps pour se
déclarer** (700 ms au lieu de 500 : une demi-seconde est le délai d'un appui
long ordinaire, trop court sur une liste qui défile). Et surtout, **un doigt
qui bouge renonce à prendre** : huit points d'écart et le compte à rebours
s'arrête (`prendLeRelevé`) — moins, c'est le tremblement d'une main posée ;
plus, c'est une intention de défiler.

### Le logement se scanne pièce par pièce, et les passages se réunissent

« Fais tout ce que tu viens de dire. » Le chantier natif, donc — celui que
la réponse précédente rangeait dans les possibles.

**Deux réglages nous manquaient dans RoomPlan.** `RoomCaptureView`
post-traite avec les options par défaut ; en partant nous-mêmes des données
brutes (`CapturedRoomData`, gardées à la fin de chaque passage), on choisit
les nôtres. `RoomBuilder(options: [.beautifyObjects])` redresse les meubles
détectés — leurs cotes cessent d'être « à peu près ». Et surtout, dès qu'il
y a PLUSIEURS passages, **`StructureBuilder` (iOS 17) les aligne en une
structure unique**.

C'est la réponse au logement qu'on relève en plusieurs fois : on scanne le
séjour, on ferme une porte, on scanne la chambre — et le plan se complète
tout seul. « Scanner une pièce » vit dans le menu du scan, à côté de
« Ajouter une pièce » qui, lui, pose un rectangle aux cotes qu'on donne et
reste le dépannage.

Tout cela est asynchrone et faillible : si l'assemblage échoue, **on
retombe sur le résultat de la vue**, qui est déjà bon. Un dossier livré vaut
mieux qu'un dossier parfait qui n'arrive pas.

**Et le travail déjà fait survit.** Un second passage REMPLACE la géométrie :
sans précaution, l'électricien qui ajoute une chambre perdrait les vingt
prises posées la veille — il ne le pardonnerait qu'une fois. `finalizeMerge`
remplace donc les murs, les ouvertures et les meubles, mais garde
l'appareillage, le plafond et les photos, en reprojetant ce qui s'accroche à
un mur (`reprojectFixtures`, comme la redétection des pièces). Les noms de
pièces donnés à la main survivent aussi, et aucun essai n'est consommé :
c'est le MÊME plan qu'on complète.

**Le défaut que le banc a révélé, et qui valait le détour** : deux relevés
fusionnés voient la cloison mitoyenne DEUX FOIS — une fois depuis chaque
pièce, à l'épaisseur du mur près. Le graphe n'y survit pas : chaque arête
doublée fausse le parcours des faces, et le logement ressort en une seule
pièce, ou en aucune. Le diagnostic les signalait depuis longtemps (« deux
murs se superposent ») sans jamais les régler. `fusionnerMursDoubles` les
réunit maintenant : un seul mur, l'enveloppe des deux, l'identifiant du plus
long — celui qui porte le plus d'appareils. Trois gardes pour ne rien casser
d'autre : parallèles à dix-huit degrés près, à moins de trente centimètres
l'un de l'autre, et **se recouvrant** — deux murs bout à bout sont un mur
coupé, deux cloisons de couloir ne se confondent pas.

*Rappel de méthode : le Swift ne se compile pas sur cette machine. La chaîne
de livraison bâtit sur macOS et valide la compilation ; le comportement,
lui, se vérifie sur l'appareil.*

### Le relevé dit ce qu'il voit mal, pendant qu'on peut y retourner

Question du patron : « as-tu moyen de rendre le scan plus performant, plus
intelligent en détection ? » La réponse tient en trois étages, et un seul
nous appartient vraiment.

**Le moteur est celui d'Apple.** RoomPlan est une boîte noire : on ne
l'améliore pas, on l'utilise. Deux API restent inexploitées et méritent un
chantier natif à part — `RoomBuilder(options: [.beautifyObjects])` pour le
post-traitement, et surtout, sous iOS 17, `StructureBuilder`, qui FUSIONNE
plusieurs relevés en une structure unique : ce serait la vraie réponse au
logement scanné pièce par pièce, aujourd'hui recollé à la main.

**Le guidage, lui, nous appartient — et il dormait.** RoomPlan accorde une
confiance à chaque surface et nous la donne **deux fois par seconde** ;
l'app n'en gardait que le NOMBRE de murs, et jetait le reste. C'est
pourtant là que tout se joue : un mur douteux se repasse en dix secondes
tant qu'on est dans la pièce, et coûte une demi-heure de retouches une
fois rentré — trous à combler, linteaux à remonter, pièces qui ne se
referment pas. Tous les défauts remontés du chantier ces derniers jours
naissent là.

L'écran de scan affiche donc, en direct, « *3 murs mal vus · repassez
lentement dessus* ». Un COMPTE, pas une liste : on ne lit pas un inventaire
en balayant une pièce. Et rien du tout quand tout est franc — un voyant qui
s'allume toujours n'avertit plus de rien. « Moyen » compte autant que
« faible » : RoomPlan ne réserve pas sa confiance haute aux cas parfaits, et
repasser ne coûte rien tant qu'on est devant.

**Le post-traitement**, enfin, est le terrain qu'on laboure depuis le début
(soudure des coins, redressement, détection des pièces par la porte, trous
du relevé, linteaux rabotés, recoins techniques) : c'est lui qui rattrape ce
que le moteur ne sait pas faire.

### La baie rabotée par un volet à moitié descendu

Relevé du chantier, photo à l'appui : « le scan se cadre mal par rapport à
la taille réelle d'une porte avec un volet un peu descendu, pourtant on voit
bien le tour de la porte ». RoomPlan cadre ce qu'il VOIT : le tablier
pendant sous son coffre lui masque le haut de la baie, et il pose son
linteau **sous le tablier**. La porte-fenêtre sort à 1,80 m au lieu de
2,15 — et tout ce qui en découle est faux : la hauteur d'allège, le dessin
en élévation, la place qui reste pour un interrupteur.

L'app ne peut pas savoir de combien le volet était descendu. Mais elle sait
ce que tout bâtiment respecte : **dans un même logement, les linteaux sont
au même niveau**. Trois baies à 2,15 m et une à 1,80 m, ce n'est pas une
menuiserie particulière — c'est un volet qui pendait. `linteauxRabotes`
prend donc le linteau le plus haut comme référence (un volet ne peut que
rabaisser une baie, jamais la grandir) et signale celles qui tombent
nettement dessous. Le seuil est large — quinze centimètres — parce qu'un
châssis de salle de bains ou une imposte peuvent légitimement s'arrêter un
peu plus bas ; et une allège haute ne trompe pas la règle, puisqu'on compare
des LINTEAUX, pas des hauteurs de baie.

Le constat porte son geste, comme les autres : **un appui remonte le
linteau** au niveau commun, sans toucher à l'appui — une baie rabotée a
gardé son allège, seul son haut est faux.

### Le coffre de volet, que le scan ne verra jamais

Relevé du chantier, photo à l'appui : « le scan ne détecte pas les rebords
de coffrage de volet ». Et il ne les détectera pas : RoomPlan modélise des
murs, des menuiseries et des meubles — un caisson de volet est un accident
de la maçonnerie au-dessus de la baie, pas une surface qu'ARKit sait nommer.
Comme pour l'appareillage mural, la réponse honnête n'est pas de prétendre
le deviner, c'est de rendre le geste manuel le plus court possible.

Pour qui perce, c'est une contrainte de premier ordre : derrière la trappe
il y a la coulisse, le tablier enroulé et son tube. Une sortie de câble
percée là-dedans, c'est le tablier bloqué au premier usage — et le
percement se voit depuis la rue.

**Un bouton, et tout le reste suit.** La menuiserie sélectionnée porte
« Coffre » dans son bandeau : un appui le déclare à la hauteur courante d'un
tunnel (25 cm), un second le retire. Pas de liste à part — c'est une hauteur
portée par la baie qu'il coiffe (`coffre?: number`) : il la suit quand elle
bouge, s'en va quand on la ferme, et rien ne peut se désynchroniser.

Il se dessine alors **en élévation, à l'écran comme au PDF** : un bandeau
ambre hachuré au-dessus de la baie, coté, avec le nom de la menuiserie
remonté par-dessus lui. Et le contrôle en tire la conséquence qui compte :
**un appareil dont l'axe tombe dans son emprise passe en alerte**
(`dansLeCoffre`), avec la règle qui explique où le mettre — sous le
linteau, ou sur le trumeau ; le moteur, lui, s'alimente par une sortie de
câble placée à l'aplomb du coffre.

### Ce qui fait une pièce, c'est la porte — pas la surface

Relevé du chantier, sur un scan « Dégagement + WC » : « il y a un espace en
haut à gauche vide sur le plan, c'est les WC, pourtant c'est un espace clos
avec une porte, on doit le détecter dans sa surface. Chaque pièce doit avoir
son nom et sa surface. »

La cause tenait dans un nombre. La détection jetait toute face de moins de
**1,2 m²** — c'est-à-dire exactement la taille d'un WC (0,90 × 1,30 =
1,17 m²). Le seuil de surface était le mauvais critère : il ne distingue pas
un WC d'une gaine technique, il exclut simplement tout ce qui est petit.

Le bon critère est la **porte**. Une pièce, si exiguë soit-elle, s'ouvre ;
une gaine, jamais. `detectRooms` reçoit donc les menuiseries et garde toute
face qui porte une ouverture, quelle que soit sa taille — le seuil ne sert
plus qu'à écarter le bruit (0,5 m²). Une grande face sans ouverture reste
une pièce, en revanche : c'est le scan qui a raté sa porte, pas la pièce qui
n'existe pas (`AIRE_SANS_PORTE`, deux mètres carrés).

**Et le recoin technique se poche en noir.** Relevé du patron : « quand il y
a 4 murs qui encerclent un recoin vide (ici sous les WC, c'était une
épaisseur pour les gaines), il doit être rempli de noir pour ne pas
confondre avec une pièce ». Un vide blanc au milieu d'un plan se lit comme
une pièce qu'on aurait oublié de nommer — alors que c'est du plein, un
endroit où l'on ne pose rien et où l'on ne perce pas. `massifsTechniques`
rend ces faces closes que rien n'ouvre ; elles se pochent de l'encre des
murs, à l'écran **et** dans le PDF. Le parcours des faces a été extrait de
la détection pour cela (`facesFermees`) : on énumère d'un côté, on décide de
l'autre — et le recoin, écarté, n'existait pour personne.

**Deux portes ne s'ouvrent plus l'une dans l'autre.** Relevé : « les portes
s'entre-touchent alors qu'en réalité, ça ne se touche pas ». Le battant
pivotait toujours sur le PREMIER bout du dormant, un choix hérité de l'ordre
des points du scan : deux portes voisines tombant du même côté croisaient
leurs quarts de cercle, et le plan racontait un contact qui n'existe pas —
sur un plan d'électricien, c'est là qu'on décide où poser un interrupteur.
Le relevé ne dit pas de quel côté une porte s'ouvre ; autant choisir le sens
qui ne ment pas. `pivotsDesBattants` range les battants **dos à dos**, en
deux passes pour que le résultat ne dépende pas de l'ordre de lecture et
reste stable d'une image à l'autre.

**Enfin, la détection se relance sur un plan déjà fait.** Sans quoi tout ce
qui précède ne profiterait qu'aux scans à VENIR : les dossiers déjà relevés
garderaient leurs pièces manquantes pour toujours. `redetectRooms` existait
depuis longtemps, mais **aucun bouton n'y menait** — elle ne se déclenchait
qu'en passant par « Redresser », qui bouge la géométrie par-dessus le
marché. « Redétecter les pièces » vit maintenant dans le menu du scan, et
garde les noms donnés à la main.

### La porte que le scan n'a pas vue

Relevé du chantier, mot pour mot : « le scan n'a pas su capter une porte, je
me suis retrouvé avec deux murs séparés, et impossible de les joindre ou
d'en créer un facilement ». C'est le défaut de relevé le plus courant — une
porte ouverte que la caméra traverse, un miroir, un contre-jour — et il
coûte cher : un contour ouvert n'a ni surface, ni pièce, ni métré.

**Le manque se voit.** `trousDuRelevé` cherche les BOUTS LIBRES qui se font
face : une extrémité que rien ne touche, en regard d'une autre, assez proche
pour qu'un mur les relie. Trois gardes, chacune pour un cas réel : les bouts
déjà soudés n'en sont pas (c'est le travail de `weldCorners`) ; au-delà de
deux mètres ce n'est plus une menuiserie manquée mais une pièce que le scan
n'a pas vue, et l'on ne devine pas un mur de cette taille ; enfin les deux
murs doivent SE SUIVRE, sinon deux murs perpendiculaires aux bouts voisins
formeraient un coin, et les relier tirerait une diagonale en travers de la
pièce. En édition, chaque trou porte un tireté rouge et une pastille.

**Et il se comble d'un appui.** La pastille dit la largeur du manque — on
sait ce qu'on va poser avant d'appuyer —, tend le mur d'un bout à l'autre,
et **y pose la porte** si l'écart en a la taille (de 60 cm à 1,30 m). C'est
le cas neuf fois sur dix : ce n'est pas de la maçonnerie qui manque, c'est
la menuiserie que la caméra a traversée. Et si l'on s'est trompé, « Fermer »
la referme d'un appui — le geste existe depuis la vague précédente, la
boucle est complète. Un seul pas d'historique : une annulation défait le mur
ET la porte.

**La pastille est à l'ÉCHELLE du plan.** Elle faisait trente-quatre points,
quel que soit le zoom — relevé du patron, capture à l'appui : « le + d'une
ouverture sans porte est trop gros en dézoom ; il doit grandir au zoom avec
les proportions ». Sur la vue d'ensemble d'un logement, celle qu'on regarde
le plus, un bouton de trente-quatre points couvre une pièce entière. Elle
vaut donc **vingt-cinq centimètres de plan** (la largeur d'un bloc de
maçonnerie), avec deux bornes aux extrêmes : jamais moins de quatorze points
— en dessous on ne la vise plus du doigt —, jamais plus de trente-quatre, sa
taille d'avant, au-delà de laquelle c'est elle qu'on regarde au lieu du mur
qu'elle referme. Et ce qu'on TOUCHE ne rétrécit pas avec elle : le débord
reprend exactement ce que la pastille a rendu, la cible garde ses
trente-quatre points. Ce qu'on vise est petit, ce qu'on touche reste large —
la leçon du bouton de thème, appliquée là où elle sert encore.

**Le geste de créer un mur existe enfin.** Seconde moitié de la phrase du
patron : « ou d'en créer un facilement ». Et pour cause — le magasin savait
poser un mur entre deux points (`addWallBetween`) depuis des mois, mais
**aucun bouton de l'app n'y menait** : du code mort d'un côté, un manque
criant de l'autre. « Ajouter un mur » vit maintenant dans le menu du scan,
pose un mètre au centre du plan, et bascule en édition — on le tire ensuite
par ses coins, et l'aimant le soude à ses voisins comme n'importe quel mur.

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

**La poignée parle au magasin dans SA langue.** Relevé du patron : « en
glissant le côté droit, c'est son côté gauche qui change ». Le dessin
retourne certains meubles d'un demi-tour (`faceIntoRoom` : les tiroirs ne
s'ouvrent pas dans le plâtre), mais le magasin raisonne sur le transform
BRUT — la poignée posée sur le bord « + » du dessin désignait alors le
bord « − » du magasin, et seul un meuble retourné trahissait le bug.
`coteVersLeMagasin` échange le signe quand les deux lacets se tournent le
dos, et le banc fixe la table de traduction.

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

### Le tour de l'application — ce que le balayage a corrigé

Relevé du patron : « fais le tour de l'application et vois s'il y a des
manques, des erreurs ou des incohérences ». Trois balayages croisés
(textes/interface, cohérence du magasin, écran contre PDF), et une
fournée de correctifs, chacun né d'un banc rouge (`menage.test.ts` et
extensions) :

**Le magasin ne garde plus de références mortes.** Un interrupteur part
avec son mur ou sa pièce ; ses liens (`commands` des appliques et des
points du plafond) partent avec lui — la règle vit dans `sansLiensMorts`,
traversée par TOUS les chemins de suppression. Le plafond d'une pièce
détruite s'en va (il restait dessiné au-dessus du vide, et compté au
métré) ; la fusion de deux pièces remmène les points de la seconde ; la
renumérotation (`redetectRooms`) rattache chaque point à la pièce qui
contient son ancrage — sans quoi « Poser le DCL » doublait un plafond
déjà équipé. « Abandonner les modifications » restaure TOUT (plafond,
photos, nord, client) : il laissait les spots ajoutés et promettait, avec
`dirty: false`, d'écrire ce mélange dans la bibliothèque. L'annulation de
la suppression d'un appareil groupé rend l'ensemble ENTIER (l'histoire se
photographie avant le dégroupage). Les photos d'un mur supprimé partent
avec lui, fichier compris s'il ne sert à aucune sauvegarde. Et l'arrivage
du scan meurt aussi avec `deleteSave`.

**Le popup de fin de scan pose l'élec sur le plan RÉEL.** « Décocher les
meubles puis cocher l'électricité » posait les socles en évitant des
meubles qui venaient d'être supprimés : `poserNormes` lit le magasin, pas
la fermeture du rendu.

**Le PDF dit la même chose que l'écran.** Le filet d'une prise commandée
passe SOUS les symboles (comme les liens du plafond, comme à l'écran), et
s'ancre LÀ OÙ EST le symbole (0,2 + rang × 0,24) — à 0,16 fixe, il
s'arrêtait vingt-huit centimètres avant un appareil échelonné.

**Les mots se sont accordés.** La note de la double prise disait
l'inverse du comptage (`socketsOf` : un socle double compte pour UN
socle) ; le rapport « Normes auto » annonce ce qui a été posé, pas ce qui
manquait, et accorde ses pluriels ; « 0/1 socles » a perdu son s ; le
menu radial du mur dit « Mesures » comme le bandeau (même geste, même
mot) ; la bibliothèque dit « scan » partout ; les apostrophes droites
restantes sont passées en typographiques. Côté accessibilité : le retour
de l'aperçu PDF porte enfin son nom, les lignes du choix de fin de scan
sont de vraies cases (rôle, état, titre complet), et chaque appareil du
plan 2D dit son nom au lecteur d'écran.

### Le dossier imprimé dit ce que l'écran montre

Le tour avait laissé trois écarts entre l'écran et le papier — et c'est le
papier qu'on emmène sur le chantier. Ils sont comblés.

**Un ensemble se dessine une fois, avec tous ses postes.** Le plan du PDF
dessinait un symbole PAR APPAREIL : une double prise sortait en deux
symboles distants de 71 mm — deux pixels à l'échelle d'un logement — qui se
recouvraient. Il regroupe maintenant par plaque comme l'écran (`postsOf`,
`postsSymbol`), pose le symbole composé au MILIEU, et l'échelonnement des
appareils superposés compte les plaques, plus les postes. Le sigle est
cumulé, mais le plan garde sa sobriété : seuls les postes qui se
distinguent portent un mot (« RJ », « 20 A »), joints par un « + ».

**Le repère de circuit s'imprime sur le plan.** Il vivait dans `schemas`,
donc n'existait qu'avec la feuille de schéma cochée : celui qui tire les
gaines devait deviner de quel départ dépend chaque prise, alors que l'app
le sait. Il voyage désormais à part (`marks`) — la feuille de schéma
commande les PAGES, pas ce que le plan sait dire — et s'écrit sous chaque
plaque, à la teinte de son circuit, comme à l'écran.

**L'élévation montre les meubles, et l'autre face.** C'était le plus grave :
la feuille imprimée montrait un mur LIBRE là où se dresse une bibliothèque.
On emporte le dossier, on perce, on découvre le caisson. Les silhouettes de
`wallFurniture` s'y dessinent maintenant, nommées et cotées, contre le mur
en bleu plein (douze centimètres ou moins) et en creux plus loin — posées
SOUS les lignes de repère, sans quoi leur aplat coupait « tableau 135 » et
« commande 110 ». Les appareils de l'AUTRE face y reviennent en clair (on
ne perce pas dos à dos), avec la légende qui l'explique — et pas de légende
quand il n'y a rien à expliquer. Enfin la plaque commune d'un ensemble
porte son cadre : deux mécanismes sous une plaque, ce n'est ni la même
fourniture ni la même boîte que deux appareils voisins.

**Trois défauts de lisibilité n'ont été vus qu'à l'œil**, sur le document
rendu en image (`tools/pdf-vers-svg.mjs`), et pas un banc ne les voyait :
le disque blanc, taillé pour un poste, laissait déborder les symboles d'un
ensemble de trois ; le sigle se posait sur le dernier symbole ; le repère
de circuit tombait sur les pieds du dessin. Le rayon suit maintenant
l'empan réel de la plaque, et le sigle comme le repère se placent par
rapport à lui.

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
  permettait de le calmer. `ThemeGlyph` a d'abord dessiné le soleil et la
  lune à la main ; depuis la refonte Solar, ils viennent du MÊME jeu que
  toutes les icônes (fiches SVGRepo 526045 et 526341, désignées par le
  patron), en **27 points** dans une pastille ramenée à 40 — « réduis le
  bloc blanc, sans réduire les icônes ». Et la pastille se rend EN DERNIER
  dans l'arbre de l'accueil : rendue avant le bloc héros, celui-ci
  s'étendait par-dessus et avalait le toucher partout où il la chevauchait
  — relevé du patron : « le clic ne fait rien, sauf en bas à droite ».
  C'est l'ordre des frères qui fait l'empilement.
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
logement de référence.

**Et le menu ne se pose jamais SUR le mur qu'on vient de choisir.** Relevé
du patron, capture à l'appui : la barre se couchait en travers du trait
sélectionné — le seul de l'écran qu'on regarde à ce moment-là, celui qu'on
s'apprête à mesurer, à percer ou à effacer. Deux causes. L'écart partait du
CENTRE de la barre : cinquante-quatre points pour une barre haute de
quarante-six, son bord arrivait donc à cinq points du mur ; il se compte
maintenant depuis son BORD (demi-barre plus vingt-deux). Et le rappel dans
le cadre ramenait la barre sur le mur dès qu'elle débordait de l'écran :
on essaie donc les deux flancs, on garde celui qui — UNE FOIS BORNÉ —
laisse le mur libre, et si aucun ne convient (un mur en plein bord), la
barre glisse LE LONG du mur jusqu'à le dégager. Sortir du cadre n'est
jamais une option ; cacher le mur ne l'est plus.

**La colonne d'actions a sa zone réservée.** Deuxième trait rouge du
patron : le bandeau du mur (« 0,65 m · Mesures · Laser · Détacher »)
passait SOUS « Enregistrer / Annuler / Édition », son dernier bouton
tranché par une pastille bleue. La réserve valait soixante-deux points
écrits en dur — un pari sur la largeur d'une colonne qui grandit avec ses
mots, et « Enregistrer » est plus long qu'« Édition ». On mesure donc ce
qu'elle occupe vraiment (le même `onLayout` qui donnait déjà sa hauteur),
et tout ce qui vit à sa gauche s'arrête là, plus un blanc franc : deux
blocs qui se frôlent se lisent comme un seul. Le menu lui-même s'est allégé — « trop imposant et
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

**Le jeu est désormais « Solar Bold »** (collection SVGRepo, © Solar Icons,
CC BY 4.0) — refonte du patron : toutes les icônes des menus des écrans de
scan (rangée d'outils, feuilles d'export, menu du mur, crayon du bandeau)
viennent du même jeu, une correspondance par icône. Il est GÉNÉRÉ par
`tools/gen-solaires.mjs` (API Iconify, même jeu) et vendu en dur dans
`src/ui/solaires.ts` : rien ne se télécharge à l'exécution, une icône
introuvable casse la génération — pas le téléphone —, et on change une
icône en changeant son candidat dans l'outil, jamais un tracé à la main.
Le rendu est une SILHOUETTE (`fill`, `fillRule="evenodd"`), jamais un
trait : le Bold de Solar est un jeu de pleins, et un plein porte plus loin
qu'un contour — la planche s'est regardée avant livraison. Les
correspondances parlent métier : la prise `socket` pour « Appareil », la
mire `target` pour « Repères », l'équerre `ruler-angular` pour l'aplomb.

L'histoire du jeu maison reste écrite : il avait été redessiné — vingt
icônes d'outils, huit de feuilles — selon trois règles, que Solar respecte
d'office.

**L'en-tête des résultats aussi.** Le partage et le « … » restaient des
tracés lucide au trait : le partage FLOTTAIT au-dessus du centre de sa
pastille (relevé du patron, capture à l'appui) — l'optique d'un dessin au
trait ne se corrige pas à la marge. Les deux passent aux silhouettes
Solar (`share`, `menu-dots`), centrées par construction. Et un banc
BALAYEUR est né de cette capture : tout style qui dessine un rond à
taille fixe doit déclarer son centrage (`alignItems` ET `justifyContent`)
— il lit le code, comme l'épreuve des boutons muets, et un rond décentré
ajouté demain le fera tomber.

**Les cibles du bandeau sont de VRAIES zones, pas des débords.** Le
`hitSlop` ne porte que dans les limites du parent — le bouton de thème est
resté capricieux après deux correctifs, avant de partir dans la page profil
où un réglage a sa place. La leçon lui a survécu : le bloc profil porte son
cadre invisible (quatorze points de rembourrage DANS le bouton), et
l'avatar, le nom et tout autour répondent au doigt.

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

La page Pro porte un champ **code promo** :
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

**Le compte se quitte et se supprime** depuis le menu « ⋯ » de la page
profil — la suppression est une exigence App Store (5.1.1). Elle efface
l'identité du trousseau mais **garde le compteur de plans** : supprimer puis
recréer un compte ne rend pas le palier gratuit. Et c'est la carte
d'abonnement de cette même page qui offre la seule porte VOLONTAIRE vers
l'offre : sans elle, on ne pouvait payer qu'en butant sur la barrière.

### La page profil, et le thème qui a quitté l'accueil

Le compte tenait dans une **carte modale** ouverte depuis l'accueil : un
avatar, un nom, trois boutons. C'était le seul endroit où l'utilisateur
existait, alors cette carte ramassait tout — et ce qui n'y tenait pas
débordait sur l'écran d'arrivée. Le **bouton de thème** en est la preuve :
seul réglage de l'application à vivre sur l'accueil, il y a occupé trois
positions, deux tailles et une zone de clic reprise à chaque relevé du
patron. Un réglage à portée du pouce qui vise « Commencer le scan » se
déclenche en visant autre chose.

Le patron a donné un **design à suivre**, et la page profil le suit : une
barre sobre (retour, titre, « ⋯ »), l'identité en tête — grand avatar,
cerclé d'or en Pro —, puis des sections titrées. L'**abonnement** en carte,
qui dit l'ÉTAT et pas l'envie : elle vend en gratuit, elle rassure en Pro
(proposer d'acheter ce qu'on a déjà est la faute qui fait douter d'un
paiement passé). L'**apparence** en trois ronds côte à côte : trois choix
exclusifs se comparent d'un coup d'œil, là où une liste les fait lire un
par un. Puis les **rangées à chevron** — mes scans, restaurer l'achat,
confidentialité.

**L'avatar est bleu, et son contour le serre.** Relevé du patron : « refais
l'avatar en bleu et le contour autour de l'icône, sans marge blanche ». La
silhouette se lisait GRISE dans un disque gris — rien ne la distinguait du
reste de la page, alors que c'est l'utilisateur qu'elle représente. Or la
silhouette Solar est un cercle PLEIN dont le buste est découpé : peinte en
bleu, elle EST l'avatar, et le disque de fond derrière elle — celui qui
faisait la marge claire — n'a plus de raison d'être. En Pro, le contour
vif descend au ras : quatre-vingt-huit pour une icône de quatre-vingt-quatre,
soit l'épaisseur du trait de chaque côté. C'est le réglage déjà obtenu sur
l'accueil, où l'anneau avait dû se rapprocher pour la même raison.

**L'échéance de l'abonnement s'écrit en toutes lettres.** Relevé du
patron : « sur le profil on doit voir la date d'expiration de
l'abonnement ». C'est la question qu'on vient poser à cette page après
avoir payé, et « actif » n'y répond pas. La date vient de **l'App Store**
(`proExpiry`, StoreKit) — le seul à savoir, puisque c'est lui qui encaisse
et lui seul qui voit une résiliation faite depuis les Réglages d'iOS. Le
mot dit aussi ce qui va SE PASSER : un abonnement en cours porte
« Renouvellement le … », un abonnement résilié « Actif jusqu'au … ».
Confondre les deux, c'est soit faire attendre un prélèvement qui ne viendra
pas, soit laisser quelqu'un perdre ses relevés illimités sans prévenir. Le
Pro par CODE n'a pas d'échéance (il est donné une fois) et n'écrit rien ; et
si l'App Store est muet, **rien ne s'affiche** — une date inventée sur un
abonnement est pire que pas de date. Effet de bord utile : une échéance
trouvée vaut abonnement DÉTENU, ce qui rend son Pro à qui change de
téléphone sans penser à « Restaurer l'achat ». La date est écrite avec une
table de douze mois maison, jamais `Intl` : la variante d'Hermès embarquée
rend « November » sur certains builds, et c'est la date d'un prélèvement.

**L'apparence a gagné un troisième choix : Système**, et c'est désormais le
défaut. Le thème se bornait à clair ou sombre, choisis à la main ; un
électricien passe sa journée dehors et sa soirée dans un tableau — c'est le
téléphone qui sait quand basculer. « Clair » et « Sombre » restent des
choix DÉLIBÉRÉS et l'emportent : qui a forcé le sombre pour un tableau mal
éclairé ne veut pas voir son écran repasser en blanc parce que le soleil
s'est levé.

**Deux portes de plus dans la barre.** « Confidentialité des données »
ouvrait une `Alert` de quatre lignes ; c'est maintenant une **vraie page**
(`ConfidentialiteScreen`) — relevé du patron —, et c'est aussi celle
qu'Apple attend d'une application qui porte des comptes et un abonnement.
Sept sections disent ce qui est VRAI de l'architecture, et rien de plus :
les relevés vivent sur le téléphone, les photos ne quittent jamais la
photothèque, seul le TEXTE monte sous le compte, le paiement passe par
Apple, aucun traceur, et ce qu'on peut exiger. Chaque paragraphe correspond
à un mécanisme qu'on peut aller lire dans le code — une politique qui
promet ce que le logiciel ne fait pas est un mensonge écrit noir sur blanc.

Et une **bulle de tchat** ouvre le mot au service client (`SupportSheet`) :
sujet, message, et une **photo en pièce jointe** — sur un chantier, un
défaut se raconte en une image, c'était l'essentiel de la demande. Deux
décisions tiennent ce chemin. **C'est l'utilisateur qui envoie** : on
remplit le composeur d'iOS et c'est son doigt qui appuie sur « Envoyer »,
donc rien ne part dans son dos et son adresse reste la sienne — c'est elle
qui nous permet de RÉPONDRE. Et **le composeur peut ne pas exister** :
beaucoup d'iPhone n'ont aucun compte dans l'app Mail parce que tout se passe
dans Gmail. Ce n'est pas une panne : on bascule sur un `mailto:`, qui ne
sait pas porter de fichier, et l'app prévient que la photo n'est pas partie
plutôt que de le laisser croire. Le contexte (version, formule, nombre de
relevés) part en pied de message, où l'utilisateur le voit avant d'envoyer —
un « ça ne marche pas » sans version coûte trois allers-retours avant de
commencer à chercher. La pièce jointe se choisit par `PHPickerViewController`,
qui ne demande **aucune autorisation** : le choix se fait dans une fenêtre du
système et l'app ne reçoit que l'image désignée. Adresse : **echoplansupport@gmail.com**.

Il ne reste au menu « ⋯ » que les deux gestes qu'on ne pose pas par
mégarde : se déconnecter, supprimer son compte. La confirmation de
suppression garde l'**Alert système** — pour un geste destructif, la
feuille austère du système est un avertissement en soi.

### La page d'abonnement, refondue

Elle était un **comparatif** : deux colonnes, Gratuit contre Pro, chacune
son pouce d'argile. Un comparatif se défend entre deux formules à choisir ;
il n'y en a qu'une à vendre, et la colonne Gratuit prenait la moitié de
l'écran pour rappeler ce que l'utilisateur a DÉJÀ, juste à l'endroit où il
décide. Le design donné par le patron n'en a pas.

La page se lit maintenant de haut en bas : le **titre** nomme l'offre
(« Passer en » à l'encre, « EchoPlan Pro » à la typo vive), le **choix de
la facturation** en deux onglets, une **carte de prix** cerclée d'or qui
énumère ce qu'on achète — six lignes, chacune une chose qui se FAIT —, et
un **bouton épinglé en pied de page**. Il vivait au fil du texte : qui
faisait défiler pour lire ce qu'il achetait devait remonter pour l'acheter.

**L'annuel est nouveau, et il demande un produit.** Un second onglet n'a de
sens qu'avec un second prix : **49 € l'an, soit deux mois offerts** — la
remise classique, assez lisible pour être annoncée sans calcul, et l'onglet
l'écrit (4,90 × 12 contre 49 ne se compare pas de tête). ⚠️ **Chantier
Apple : le produit `echoplan.pro.annuel` doit être créé dans App Store
Connect** à côté du mensuel ; tant qu'il n'y est pas, l'achat annuel échoue
en le DISANT, comme le mensuel avant lui. Et « Restaurer l'achat »
interroge désormais **les deux produits** : qui a pris l'annuel et change de
téléphone ne détient pas le mensuel, ne demander que celui-là lui
répondrait « aucun achat trouvé » alors qu'il a payé l'année.


#### Ce que la première capture a corrigé

Le patron a essayé la page sur son iPhone, et trois choses sont revenues.

**« Tout doit être visible sans scroll. »** Une page qui vend et qu'il faut
faire défiler cache la moitié de ce qu'elle vend — on décide sur ce qu'on
voit. Les six atouts sont réécrits pour tenir chacun sur UNE ligne (c'est
le passage à deux lignes qui faisait déborder), le titre et la carte se
resserrent, et le **code promo est parti dans une feuille** appelée par
« J'ai un code » : un champ et son bouton, quarante points de hauteur, pour
un geste qu'on ne fait qu'une fois dans une vie d'abonné — et c'est le PRIX
qui sortait de l'écran pour lui faire place. La restauration d'achat
l'accompagne, sur la même ligne de liens.

**« Un bloc blanc rond en haut à droite sans raison. »** C'était le vide qui
recentre le titre : il avait pris la peau du bouton de retour, ombre
comprise. Un bouton qui ne fait rien est un bouton qu'on essaie.

**« Mieux calibré sur le titre, un léger design sur les onglets, de
l'identité. »** Le titre est désormais **centré** comme sur la maquette
donnée — aligné à gauche, le bloc penchait —, l'onglet actif se détache
d'un cheveu de bleu et d'une ombre courte teintée de la marque (une
pastille blanche sur du gris clair se distingue à peine), et l'onglet
annuel porte lui-même les « 2 mois offerts » : c'est au moment de CHOISIR
qu'on veut le savoir, après il est trop tard. L'identité, enfin, ne vient
pas d'un dégradé décoratif : c'est le **ruban de l'accueil** — les ondes
qui disent d'où vient le nom EchoPlan — posé derrière le titre à
vingt-deux pour cent d'opacité. Un fond, pas un spectacle.

### La surprise de bienvenue

Un popup « Surprise ! » — le cadeau 3D en argile, la typo vive du badge —
offre **−20 % sur la première souscription** (code FIRST20). Il se lève à
deux moments : à la **première inscription** de l'appareil (le trousseau
n'avait encore porté aucun compte, et un drapeau local retient le déjà-vu —
une reconnexion ne rejoue rien), et quand **l'essai épuisé bloque un
nouveau scan** — l'offre à la place de la porte fermée qui n'ouvrait que la
page Pro.

**Toute la carte est le bouton, et le code s'applique tout seul.** Personne
ne recopie un code depuis un popup fermé : le clic ferme la surprise,
applique la remise et ouvre la page Pro avec le champ déjà rempli — le
champ le MONTRE, parce qu'un prix qui baisse sans explication visible
ressemble à une erreur. « Plus tard » referme sans insister.

**Un seul chiffre, en héros.** Le premier jet disait trois prix dans une
phrase coupée et un code dans le bouton — relevé du patron, capture à
l'appui : « trop de chiffres, les phrases sont cassées, l'ensemble ne
donne pas envie de lire ». Le popup dit UNE chose : « −20 % » en grand,
dans le bleu vivant de la maison ; le bouton dit « J'en profite », et c'est tout. Le
banc COMPTE les nombres : un seul groupe de chiffres dans tout le popup.
Même cure sur la zone d'abonnement : le bouton se lit comme une phrase
(« S'abonner pour 3,92 € par mois » — zéro tiret) et la note de remise est
une pastille sans code ni chiffre (« ✓ Remise de bienvenue appliquée ») —
le prix barré de la carte dit déjà tout.

**Une remise n'est pas un déverrouillage.** FIRST20 baisse le prix (3,92 €
au lieu de 4,90 €, l'ancien prix reste barré à côté — une remise sans
référence n'est qu'un prix comme un autre) et la page Pro reste ouverte ;
CARIDI12, lui, continue d'ouvrir à 100 %. La table `codes_promo` porte déjà
les pourcentages (`pour_cent`) : FIRST20 y est semé à 20. Et la remise
survit au redémarrage — un −20 % accepté puis perdu au relancement serait
vécu comme une promesse reprise.

**Les pouces d'argile disent le verdict d'un coup d'œil.** Sur le
comparatif, la carte Gratuit baisse le pouce, la carte Pro le lève — même
famille 3D que le cadeau. La page s'est modernisée au passage : plus d'air
entre les colonnes, rayon des cartes à vingt points, filet d'un cheveu sur
la carte Gratuit. Les deux cartes partagent le GABARIT : le Gratuit
descend son contenu d'un trait (celui du contour vif du Pro) pour que les
pouces s'alignent, et les rayons sont les mêmes. En thème nuit, la carte
Pro et le bouton d'achat prennent la surface du thème — deux dalles
blanches sur fond sombre éblouissaient — et le contour vif reste : c'est
lui, la signature.

**Refuser l'offre ouvre la dernière chance : un avis contre un essai.**
Quand l'essai est épuisé (jamais à la première inscription — l'utilisateur
a encore son relevé) et qu'on repousse la surprise, un popup aux cinq
étoiles d'or propose de laisser un avis App Store contre UN relevé
supplémentaire. Le bonus s'encaisse SUR L'HONNEUR — aucune API ne dit si
l'avis a été posté —, une seule fois, et il survit au redémarrage.
ATTENTION REVUE APPLE : récompenser un avis est contraire aux règles de
l'App Store (avis incités) ; le patron est prévenu, à revoir avant la
soumission. L'URL d'avis porte un identifiant GABARIT tant que la fiche
App Store Connect n'existe pas.

**Le profil est un bloc, en haut à gauche** — et il s'est ÉPURÉ en trois
retouches du patron : l'avatar Solar et le prénom, RIEN d'autre. La barre
en dégradé et le grade écrit ont vécu — « GRATUIT » n'a pas besoin de
s'écrire, il se voit : en gratuit tout se lit gris ; en Pro, le prénom
passe à la typo vive et l'avatar se cercle du contour qui respire — le
grade se VOIT. TOUT le bloc prend le clic (les vues SVG sont transparentes
au doigt, sinon elles l'avalent), le bandeau est AXÉ par les centres, et
les deux blocs ont été REMONTÉS d'un cran après un dernier relevé (« le
clic doit être fait un peu au-dessus ») avec des zones encore élargies —
72 points pour le thème, un cadre de quatorze pour le profil — et le bloc
héros passé en `box-none`, pour qu'aucune vue pleine largeur ne puisse
plus s'interposer.

**Le menu du compte est une carte à nous** — plus la feuille grise du
système, « trop basique ». Avatar Solar sur pastille bleue, le nom, l'état
du palier en une ligne, les gestes en boutons pleins (bleu pour le Pro,
filet pour la déconnexion, rouge nu pour la suppression), la **croix
dessinée** en haut à droite — la leçon des caractères — et le voile qui
referme, parce que c'est le geste que tout le monde essaie en premier. La
confirmation de suppression RESTE une Alert système : pour un geste
destructif, l'austérité du système est un avertissement en soi. En PRO, la
carte prend la parure — « plus dynamique et coloré premium » : l'avatar se
cercle du contour vif qui respire et le nom passe à la typo vive ; en
gratuit, elle reste sobre — la parure est ce qu'on achète.

### Six retouches d'un même relevé de chantier

- **Toucher le sol lâche le meuble tenu.** La surface captait l'appui et
  choisissait la pièce PAR-DESSUS le meuble encore tenu. Un geste, un
  effet : le premier appui au sol lâche le meuble, le suivant prend la
  pièce.
- **La pastille ambre de conformité a quitté le cartouche** : rien sur le
  nom de la pièce — les constats se lisent dans le dossier, où ils se
  chiffrent.
- **La boussole du calque « Nord »** : losange PLEIN (après plus grasse,
  puis plus grande) — dessin maison, le tracé lucide gardait son aiguille
  vide au milieu des silhouettes Solar.
- **Le cartouche esquive les spots et laisse voir.** Après l'ajout d'une
  ligne de spots, le nom se posait SUR un spot : les appareils du plafond
  rejoignent les meubles dans les obstacles du cartouche
  (`cartoucheHeurte`, benché), et son fond passe à 85 % — il a été
  translucide (traversé), puis opaque ; l'esquive rend la transparence
  gratuite.
- **Le bandeau de la ligne de spots tient dans l'écran** : trois mots
  pleins débordaient sous la colonne d'ancrage — les flèches Solar disent
  l'axe, le maillon relie, la croix retire, et les mots vivent dans les
  étiquettes d'accessibilité. **La ligne se relie à une commande d'un
  geste**, comme un point seul : la liaison en attente accepte désormais
  toute une ligne (le même appui sur l'interrupteur clôt tout).
- **Sur l'établi du mur, le meuble COLLÉ se voit franchement** : les
  silhouettes en creux (9 %, tirets pâles) ne se voyaient pas, et c'est le
  meuble contre le mur qui condamne la prise. À douze centimètres ou moins
  du nu, il prend la convention du plan — bleu, trait plein ; le lointain
  reste en creux.

### Le nom d'un meuble ne raye jamais son meuble

Relevé du patron, capture à l'appui : « Rangement » débordait de l'armoire
et se faisait barrer par ses traits. La règle de la maison s'applique
désormais au mobilier (`nomDeMeuble`, benchée) : le nom s'écrit petit
DEDANS, sa taille suit le zoom (0,13 m d'écriture, bornée de 7 à 12
points), et il s'ABSENTE quand il ne tient pas dans l'emprise du meuble
projetée à l'écran, rotation comprise — c'est en zoomant qu'on lève le
doute, comme pour les dénominations d'appareils. Les planches de rendu ont
été régénérées : le diff montre la taille qui suit le cadrage, et le nom
qui débordait a disparu.

### Le bandeau de l'accueil, dernière passe

Le bloc profil et la pastille du thème partagent désormais **la même
boîte** (même sommet, même hauteur de 72 points) : alignés par
construction, plus rien à calculer, donc plus rien à dériver. L'anneau
d'or du Pro se pose **au ras de l'avatar gris** (couvercle couleur du
fond — plus de disque clair), et le prénom s'allège (graisse 600) : ce
n'est pas un titre.

**Et les deux ronds du bandeau sont jumeaux** — relevé du patron : « le
bouton thème à la même taille que le bouton profil, agrandi avant
légèrement ». La pastille blanche (40) dominait l'avatar (32) : l'avatar
prend quatre points (36, icône 29 ; 34 nu en gratuit), la pastille en rend
quatre (36). L'égalité est assertée au banc, pas espérée.

### Le catalogue d'appareillage se déroule, et montre les vrais symboles

Deux relevés du patron, une même fenêtre. **Le blanc défile** : la carte du
catalogue vivait DANS le Pressable du voile — sur les zones vides, c'est
lui qui prenait le geste, et le déroulé ne partait que depuis un libellé.
Le voile est désormais un FRÈRE posé derrière la carte : aucun ancêtre du
déroulé ne porte de geste, et le banc tient cette structure. **Et les
tuiles montrent le symbole normalisé** (NF EN 60617, celui que le plan
dessinera) à la place de la pastille de couleur à sigle : on choisit ce
qu'on va lire. Le symbole ne disant rien à un lecteur d'écran, chaque puce
porte son nom en clair — c'est l'épreuve des boutons muets qui l'a exigé.

### Le retour se glisse depuis le bord

Relevé du patron : « un glissement de gauche vers la droite doit faire
revenir en arrière, comme sur les apps modernes, ou même Safari ». Une
bande invisible de vingt points longe le bord gauche des quatre écrans qui
portent la flèche de retour (`RetourGlisse` — Mes scans, résultats, aperçu
du PDF, photo de repérage) et rend exactement le même retour qu'elle : la
bibliothèque referme d'abord le dossier ouvert, les résultats reviennent
d'où ils sont venus. La bande est étroite à dessein — elle ne vole le
toucher qu'au ras du bord, où aucun bouton ne vit — et le seuil est FRANC
(soixante points, plus horizontal que vertical, compté au banc) : un doigt
qui hésite ou qui défile ne déclenche rien.

### Le badge Pro respire

L'ancien badge était un bloc noir à texte jaune : un aplat, posé sur la
seule carte qu'on vend. Le nouveau est **blanc**, et une bande de bleus glisse
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
seule famille, et le dernier arrêt rejoint le premier : la boucle n'a pas
de couture. C'est la leçon du ruban appliquée une fois de plus : la bande
est dessinée UNE FOIS sur deux périodes, et c'est la VUE qui glisse, au
pilote natif — le banc tient la transformation animée, la famille monotone
et la couture.

**L'or est devenu un BLEU VIVANT.** Relevé du patron : « change le doré en
bleu vivant, animé doucement ; on ne doit pas voir clairement l'animation,
mais on doit voir que ça vit ». L'or était le seul endroit de
l'application à parler une autre langue que le bleu de la marque. Trois
teintes PROCHES le remplacent (`#2A62FF`, `#6D9BFF`, `#123FD1`) : un écart
franc donnerait un arc-en-ciel qui défile, celui-là laisse une bande
presque unie. Et la vague est passée de huit à **quatorze secondes** — huit,
c'était encore une animation qu'on regarde. Le composant a suivi le
changement de couleur (`ContourVif`, `TexteVif`, la famille `BLEUS`) : du
code qui s'appelle « or » et qui peint du bleu se relit une fois de trop.

**La carte et le bouton prennent la peau ENTIÈRE du badge.** D'abord son
contour ; puis, sur relevé du patron, son couvercle BLANC et sa typo
qui respire : le nom, le prix et « S'abonner » sont des
trouées au masque sur la même bande qui glisse — la recette exacte
des lettres du badge, étendue aux mots qui vendent. Les lignes de
bénéfices, elles, restent à l'encre : on les LIT, on ne les admire pas, et
une teinte animée en petit corps maigre ne se lirait plus. La recette vit
dans UN composant (`ContourVif` : la famille de bleus, l'épaisseur du
trait, le rythme de la vague, et `TexteVif` pour les mots) que le badge
emprunte : des
dégradés réglés à la main auraient divergé à la première retouche, et le
banc tient l'unicité arrêt par arrêt. Trois différences mécaniques avec le
badge : la bande ne se dessine qu'une fois la taille du bloc connue — une
carte a la hauteur de son contenu, un mot celle de sa police —, un vrai
`Text` invisible réserve la place du mot et le garde lisible aux lecteurs
d'écran, et le badge flotte AU-DESSUS du bord de la carte, donc HORS de
son rognage, sinon sa moitié haute serait coupée.

### Le geste ne redessine plus le plan

Relevé du patron : « plus les plans sont chargés en cotes et en meubles,
plus au déplacement il est lent ». Avant de toucher au code, on a MESURÉ sur
le logement de référence — et la mesure a désigné un coupable inattendu :

| | mesure |
|---|---|
| 2D au repos | 571 nœuds dessinés |
| 2D pendant le geste | 343 nœuds (l'allègement d'alors) |
| 3D | 486 faces · scène bâtie en 7 ms · **0,30 ms par image** pour trier et projeter |

**Le calcul n'était plus en cause.** Trois dixièmes de milliseconde par
image, c'est un pour cent du budget d'une image à soixante par seconde : le
tri du peintre avait déjà été réglé, les découpes étaient mémoïsées. Ce qui
coûtait, c'était le NOMBRE DE VUES repeintes — trois cent quarante, soixante
fois par seconde, parce que **chaque image du geste recalculait le cadrage
et rendait tout le dessin**.

**Or déplacer, tourner et agrandir un dessin DÉJÀ PEINT, c'est exactement ce
qu'une transformation native sait faire.** C'est la leçon du ruban, du badge
et de l'onde du bouton, appliquée cette fois au plan entier : le dessin est
calculé une fois, à la prise ; le geste ne touche plus que quatre valeurs
qui descendent au pilote natif sans réveiller React ; le vrai cadrage n'est
posé qu'au lâcher, en UN rendu. Le banc tient la propriété qui produit la
fluidité : pendant le geste, **les coordonnées du dessin ne bougent pas d'un
pixel** — et c'est vérifié à l'octet près, les planches de référence du plan
2D étant rigoureusement identiques après le changement.

**L'allègement pendant le geste a donc été retiré**, et c'est un progrès :
il n'existait que pour réduire ce qu'il fallait recalculer soixante fois par
seconde. Comme plus rien ne se recalcule, le garder coûterait deux rendus
complets — un à la prise, un au lâcher — pour économiser un travail qui
n'existe plus. Le dessin reste entier sous le doigt, ce qui est aussi plus
juste : les cotes suivent le plan au lieu de clignoter.

**Et la transformation doit mener AU PIXEL PRÈS au cadrage visé.** « Si je
zoome avec un pincement en le déplaçant, au lâcher il se recale et on voit
une apparition du plan quelques pixels à côté. » Quelques pixels, et une
raison exacte : le premier jet posait simplement la course des doigts en
translation, oubliant que le décalage DÉJÀ ACQUIS est peint dans le dessin —
il subit donc lui aussi l'agrandissement et la rotation de la couche.
L'écart valait `(1 − échelle) × décalage de départ` : nul tant qu'on n'avait
rien déplacé avant de zoomer (d'où un glissement simple parfaitement calé),
et de quelques pixels dès qu'on zoomait un plan déjà déplacé. La formule
est maintenant une fonction pure, `transformeDuGeste`, et le banc compare
les DEUX CHEMINS pour trois points : celui de la couche (dessin de la prise,
puis transformation) et celui de la vérité (dessin recalculé au cadrage
visé). Ils doivent tomber au même endroit, au millième de pixel — glissement
simple, pincement sur plan déplacé, pincement qui vrille sur plan déjà
tourné.

**La toile s'ouvre le temps du geste.** C'est le prix de ce calcul unique, et
le patron l'a vu tout de suite : « si le plan sort du cadre et qu'on le
ramène au centre, il est coupé — sa partie cachée reste cachée ». Ce qui
débordait de l'écran à la prise n'avait pas été peint ; le geste ne fait que
déplacer la toile, et la ramener faisait entrer du VIDE. La toile prend donc
une marge de huit dixièmes de sa plus grande dimension — plus qu'un doigt ne
parcourt d'un trait —, son cadrage (`viewBox`) est décalé d'autant pour que
les coordonnées ne bougent pas d'un pixel, et **tout cela seulement pendant
le geste** : rastériser en permanence trois fois la surface de l'écran pour
une seconde de glissement serait le contraire d'une optimisation. Le rendu
qui l'agrandit tombe à la prise du doigt, avant le premier mouvement — là où
personne ne le voit.

### Une pièce vide ne se découpe plus en bandes

Retour d'essai du patron : « la 3D n'est pas du tout fluide, même sans
meuble ». Mesure faite, le chiffre est édifiant : une pièce VIDE — quatre
murs, rien dedans — produisait **353 faces, dont 229 à repeindre à chaque
image** du geste.

D'où venaient-elles ? Du découpage des pans en bandes de soixante
centimètres. Il a une raison, et une seule : donner au tri du peintre la
finesse qu'un pan d'un seul tenant n'a pas, pour qu'un meuble posé devant
la moitié proche d'un long mur ne soit pas classé derrière tout le mur.
C'est le canapé du chantier, et c'est pour lui que le mode « grossier »
avait été retiré.

**Mais dans une pièce vide, il n'y a RIEN à départager** : on payait la
finesse d'un tri qui n'avait aucun litige à trancher. On regarde donc, mur
par mur, s'il a quelque chose devant lui — un meuble à moins de deux mètres
du segment, ou de l'appareillage qu'il porte lui-même. Sinon, le pan reste
d'un seul tenant.

| | avant | après |
|---|---|---|
| pièce vide | 353 faces (229 visibles) | **21 faces (13 visibles)** |
| logement de référence | 1110 faces (639 visibles) | 957 faces (550 visibles) |

La marge est large exprès : elle se compare au CENTRE de l'objet, dont on
ignore là l'encombrement exact et l'orientation. Une bande de trop ne coûte
qu'un peu de dessin ; une bande manquante fait disparaître un canapé.

**Et le rendu ne bouge pas d'un cheveu** : les cinq planches 3D de référence
ont été régénérées et relues À L'ŒIL, avant/après, sur l'angle de trois
quarts et sur le biais — celui où le tri est le plus fragile. Identiques.
C'est exactement ce pour quoi ces planches existent.

Trois bancs ont dû être réécrits, et le motif est le même pour les trois :
ils bâtissaient une pièce NUE et exigeaient des bandes. Ils reçoivent
désormais le meuble qu'ils supposaient — le litige rend la propriété qu'ils
tiennent vraie ET utile. Un quatrième isolait les faces d'une télé par un
décalage d'index entre deux scènes, l'une avec meuble et l'autre sans : la
coïncidence de structure sur laquelle il reposait est tombée avec ce
changement, il les isole maintenant par leur couleur.

### Le dessin 3D se regroupe en tracés

Deuxième retour d'essai : « le meublé est lourd, à peine quelques meubles et
une latence est largement visible ; pourtant sur MagicScan, un grand nombre
de meubles et aucun problème ». La comparaison est juste, et elle désigne la
vraie limite de notre rendu.

Ce qui coûte n'est pas le calcul — trier et projeter un logement meublé
prend **trois dixièmes de milliseconde**, un pour cent d'une image. C'est
que **chaque face est une VUE NATIVE** que React réconcilie et que le moteur
repeint : cinq cent cinquante d'entre elles à chaque image du geste. Le
détail des faces d'un logement meublé :

| | total | visibles |
|---|---|---|
| arêtes (2 points) | 602 | 354 |
| pans pleins | 316 | 176 |
| contours et sols | 39 | 20 |

On ne peut pas retirer de faces sans abîmer le tri — c'est lui qui empêche
un meuble de traverser une cloison. Mais on peut réduire le nombre de VUES :
dans l'ordre de peinture, les faces qui **se suivent** et partagent la même
peau (remplissage, trait, opacité) se dessinent d'un seul tracé, un `Path`
portant autant de contours fermés qu'il faut. L'ordre est respecté à la
lettre — on ne fusionne que des voisines, on ne réordonne rien —, donc le
dessin est rigoureusement le même : **550 faces, 309 balises**.

C'est la même idée que les bandes d'un mur, prise par l'autre bout : là on
découpe pour trier juste, ici on recolle ce que le tri a laissé côte à côte.

**Un facteur deux n'était pas un facteur dix**, et MagicPlan restait plus
fluide : ces applications dessinent leur 3D dans un canevas, là où nous
posions des vues. Le patron a tranché — « fais le canevas » —, et c'est ce
qui suit.

### Le canevas de la vue 3D

Une SEULE vue native dessine tout le modèle. Pas de dépendance nouvelle :
`RoomScanCanvas` est une `UIView` de trente lignes utiles, dans le module
que le projet possède déjà. Skia aurait tiré Reanimated et Worklets avec
lui, quinze mégaoctets et trois chantiers de compatibilité, pour un dessin
que CoreGraphics fait très bien.

**Ce qui a été gardé, c'est tout le difficile.** La scène, le tri du
peintre, l'écorché, l'appareillage, les rangs de pièces : rien n'a bougé.
Seule la dernière étape change — au lieu de poser trois cents balises, on
transmet le dessin à plat.

**Le format, et pourquoi celui-là.** Un tableau de nombres, un seul :

    [ rang du style, nombre de points, x, y, x, y, … ] × formes

et les styles à part, une chaîne chacun. Ce qui traverse le pont soixante
fois par seconde doit se lire sans être analysé : un tableau de nombres se
convertit d'un bloc, une chaîne se découpe caractère par caractère. Et les
styles se répètent — deux cents faces d'un mur partagent la même peau —,
d'où ce partage : les formes en nombres, les styles dits une seule fois.

**Le dessin suit l'ordre reçu, sans exception.** C'est le tri du peintre :
réordonner quoi que ce soit dans la vue native reviendrait à défaire, en
dernière ligne, tout ce que la géométrie a établi — et un meuble
retraverserait sa cloison.

**Et le rendu SVG reste, en repli.** Sur Android, ou sur un iPhone dont le
module natif n'a pas été rebâti, `RoomScanCanvas` est absent et les balises
reprennent la main telles quelles. Une application qui perdrait sa 3D parce
qu'une vue manque serait pire que lente. Le banc tient les deux moitiés :
avec le canevas, plus une seule balise de géométrie ; sans lui, le modèle se
dessine entier.

Les repères d'appareillage, les semis de sol et les étiquettes restent des
balises, posées PAR-DESSUS le canevas : ils sont peu nombreux, ils portent
du texte, et rien ne gagnerait à les décrire en nombres.

**La même optimisation a été essayée en 3D, puis ÉCARTÉE.** Le pincement y
passait au natif (le tri est identique à zoom 1 et à zoom 2,4, le banc le
prouve à la décimale) et les arêtes se taisaient pendant la rotation — cent
trente-huit des quatre cent quatre-vingt-six faces du logement de référence.
Verdict de l'essai sur le téléphone : « remets le 3D comme c'était avant, ça
semble moins fluide qu'avant ta recherche d'optimisation ». La vue 3D est
donc revenue à son état d'origine. Les deux propriétés mesurées restent au
banc (`fluidite3d.test.ts`), avec le motif de l'abandon : elles sont vraies
du modèle, mais **un gain se juge sur l'appareil, jamais sur le papier** — et
sur celui-ci, la 3D n'y gagnait rien.

Deux détails qui font tenir l'ensemble, et que le premier essai du patron a
tous les deux corrigés.

**La couche revient à plat AVEC le dessin, jamais avant.** « Au relâcher sur
une autre position, on voit son ancienne position rapidement avant celle
qu'on lâche. » La remise à plat était écrite dans le gestionnaire du lâcher,
à côté du nouveau cadrage — mais une valeur animée se pose SUR-LE-CHAMP,
hors du cycle de React, tandis que le dessin attend le rendu suivant pour se
recalculer. Entre les deux, il restait une image du plan à son ancienne
place, la couche déjà remise à zéro. Elle se fait donc à la MISE EN PAGE
(`useLayoutEffect` sur le cadrage) : après le commit, avant que l'écran ne
soit peint. Les deux ne peuvent plus se désynchroniser, quel que soit le
retard du rendu.

**Et la rotation 3D perdait la position au lâcher** — « on revient au point
de départ » — tant que la vue 3D portait cette mécanique : le cadrage retenu
pour le pincement n'était pas alimenté par la rotation. Le défaut est parti
avec l'optimisation qu'il accompagnait, mais son banc est resté
(`couronne.test.tsx`) : il tourne d'un doigt, lâche, et exige que l'angle
reste. Une vue 3D qui oublie ce qu'on vient de lui faire est une régression
qu'on ne laisse pas revenir deux fois.

Enfin la couche est marquée `collapsable={false}` : sans lui, Android la
fond dans son parent à l'optimisation et la transformation perd son
support.

### Ce que la rangée de calques dit d'elle-même

Quatre retours du chantier, sur la même zone d'écran.

**Le peigne « Afficher ».** Croquis Paint à l'appui : « lorsqu'on n'est pas
en édition, l'utilisateur doit comprendre que les boutons sont des
*Afficher* — texte Afficher + lignes vers les boutons ». Rien ne le disait :
« Meubles », « Appareils », « Surfaces », « Nord » nomment une CHOSE sans
dire ce qu'on en fait, et l'on peut aussi bien croire qu'on va en ajouter
un. Un mot, une barre, une descente par bouton — c'est ainsi qu'on annote un
plan, et c'est ce qu'un électricien lit tous les jours sur ses schémas. Le
peigne se dessine à partir des parts égales de la rangée, les mêmes que les
pastilles : chaque descente tombe au milieu de la sienne, quel qu'en soit le
nombre. **En édition, il disparaît** : les boutons y font des choses
différentes (poser un appareil, redresser, ouvrir le catalogue), et un titre
commun mentirait sur trois d'entre eux.

Trois réglages sont venus de l'essai suivant. **Sa place se CALCULE** — la
hauteur d'une cellule d'outil, plus deux points : « les traits doivent
presque toucher les boutons », et un nombre écrit à la main aurait dérivé au
premier changement de pastille. **Le trait et le mot se lisent en retrait**
(55 % d'opacité) : ce peigne explique la rangée, il ne doit se disputer le
regard ni avec elle ni avec le plan. Et **il part comme les pastilles** :
« il doit disparaître sans coupure nette ». Il s'éteignait d'un coup pendant
que la rangée se retirait en fondu — deux temps pour un seul geste, et l'œil
voit le raccord. Il boit donc à la même horloge qu'elles.

**« Meubles » et non « Ajouter ».** Le mot dit le SUJET, comme ses voisins
de la rangée ; ce qu'on en fait dépend du mode, et c'est le mode qui le dit.

**« Surfaces » commande le cartouche entier, nom compris.** La surface en
avait été DÉTACHÉE, et pour une bonne raison d'alors : le calque allume
aussi le semis coloré des sols, on obtenait donc soit la surface avec un
plan barbouillé, soit un plan propre sans surface. Le patron a tranché
autrement — « fais en sorte que Surfaces affiche et cache le nom des pièces
aussi » — et le calque redevient ce que son nom dit : tout ce qui parle de
la surface d'une pièce, son nom compris, puisque les deux vivent dans le
même cartouche et qu'on ne coupe pas un cartouche en deux. **En édition il
reste quoi qu'il arrive** : c'est par lui qu'on nomme une pièce, et un
réglage d'affichage ne retire pas un outil de travail.

**Et le bandeau du mur tient dans son bloc.** « Peu de place pour les
informations du mur, les boutons prennent toute la place, et un bouton sort
du bloc » — « Détacher » se lisait à moitié hors de la pilule, posé sur le
plan. C'est le défaut que le bandeau du MEUBLE a déjà connu, et le remède
est le même : ce n'est pas un problème de largeur mais de
**compressibilité**. Une rangée faite de blocs qui ne cèdent jamais dépasse
au premier mot de trop, et une vue qui déborde n'est pas rognée, elle SORT.
Les boutons portent donc `flexShrink` — et `minWidth: 0`, sans quoi le mot à
l'intérieur impose sa largeur et rien ne bouge —, leur libellé se tronque
sur une ligne, et **la cote ne cède jamais** : c'est elle qu'on vient lire.

### Ce qu'un parcours de découverte a révélé

L'application a été parcourue comme le ferait quelqu'un qui l'ouvre pour la
première fois : porte d'entrée, accueil sur un iPhone SANS LiDAR (le cas le
plus courant), plan dessiné à la main, contrôle des normes, export. Cinq
choses en sont sorties, et la première n'était pas celle qu'on cherchait.

**UN PLAN DESSINÉ NE S'ENREGISTRAIT PAS.** On choisit « Dessiner un plan »,
on pose un séjour de vingt mètres carrés, on touche « Enregistrer » : la
bibliothèque reste vide, et le bouton disparaît quand même. L'application
affirmait donc que le travail était sauvé alors qu'il n'existait nulle part
— on quitte l'écran, tout est perdu. La cause tient en une ligne :
« Enregistrer » recopie le plan courant DANS SON entrée de bibliothèque, et
un plan dessiné n'en avait jamais eu ; seul un scan terminé en créait une,
puisque lui s'auto-enregistre à la fin du relevé. C'est le défaut le plus
cher de cette application — **le seul qui coûte un déplacement** — et il
vivait dans le chemin ouvert aux appareils sans LiDAR, c'est-à-dire au plus
grand nombre.

**Et il emportait le palier gratuit avec lui.** Le quota se consomme
exactement là où une entrée se crée : un plan dessiné ne comptait donc pour
rien, on pouvait en faire cent. La règle est écrite depuis longtemps — « un
plan tracé à la main est un plan, et il compte comme tel » — elle n'était
appliquée nulle part. Une seule correction règle les deux, au même endroit.

**L'accueil mettait en avant l'impossible.** Sans LiDAR, l'écran affichait le
refus et gardait pourtant « Commencer le scan » en bouton principal, éteint,
avec un conseil de scan en pied de page : trois éléments sur quatre
parlaient d'une chose hors de portée. Le scan disparaît désormais,
« Dessiner un plan » prend sa place ET sa couleur, le conseil se tait — et
le refus reste, puisque c'est lui qui explique pourquoi.

**La croix a été remontée dans la coquille commune.** Elle avait été posée
sur la feuille de CHOIX ; le parcours a montré que le défaut restait entier
sur la plus longue de toutes, la feuille de contrôle des normes, qu'on ouvre
pour lire dix constats et dont on ne savait pas sortir. Toute feuille qui
s'ouvre dans cette application sait maintenant se refermer.

**Le cartouche du dossier ne disait pas qu'il s'éditait.** « CLIENT — Non
renseigné » se lit comme une constatation, pas comme un champ : on arrive à
l'export, on repart avec un dossier anonyme sans avoir compris qu'il
suffisait d'appuyer. Les deux cases portent le crayon, le même signe que sur
le bandeau des cotes.

**Et le contrôle ne crie plus avant qu'on ait commencé.** Poser une pièce —
le premier geste de l'app — faisait passer la pastille au rouge, onde qui
bat, « 3 points à corriger ». Les constats étaient justes, mais ils
reprochaient à quelqu'un de n'avoir pas encore fait ce qu'il venait
d'ouvrir l'application pour faire. Une pièce sans le moindre appareil n'est
pas une installation NON CONFORME : c'est une installation qui n'existe pas
encore. Le verdict attend donc le premier appareil posé ; jusque-là la
pastille invite, sans juger. Dès le premier socle, il reprend tous ses
droits.

### Ce qu'une seconde campagne de tests a révélé

La première portait sur le premier usage ; celle-ci vise les zones à risque
que le parcours n'avait pas touchées — logement multi-pièces, bibliothèque,
brouillon, exports, tableau existant, suppression de compte. La plupart ont
tenu. Trois choses sont tombées.

**Un plan se payait deux fois.** Effet de bord du correctif précédent : le
palier gratuit se consomme quand une entrée de bibliothèque naît, or on peut
supprimer cette entrée et garder le plan sous les yeux — c'est voulu, « on
ne retire pas la 3D des mains de qui la regarde ». Le ré-enregistrer créait
alors une SECONDE entrée et débitait une seconde fois : un relevé payé deux
fois. La règle du projet dit que supprimer ne REND pas le quota ; elle ne dit
pas qu'il peut se prendre deux fois pour le même travail. Une marque suit
donc le plan à l'écran, et ne se lève qu'en repartant d'un plan neuf.

**« Annuler » défaisait deux gestes d'un coup.** On pose deux prises l'une
après l'autre, on annule… et les deux disparaissent. La fusion des pas
d'historique a pourtant une bonne raison d'être : un mur qu'on fait glisser
envoie cinquante états par seconde, et sans elle il faudrait cinquante
annulations pour revenir en arrière d'un seul geste. Mais elle ne vaut que
pour les gestes CONTINUS — ceux qui suivent le doigt —, et ils se
reconnaissent à leur clé, qui désigne l'objet manipulé (`move:mur-3:a`). Un
geste discret porte une clé simple et ne se fusionne plus jamais : si rapide
soit-il, c'est un geste de plus, et « Annuler » lui doit un retour.

**Et l'on quittait un plan modifié sans un mot.** On ouvre un plan
enregistré, on ajoute une chambre, on touche la flèche — tout est perdu.
L'en-tête affichait « Modifications non enregistrées », mais personne ne
relit l'en-tête au moment de sortir : on regarde le bouton qu'on touche. Le
brouillon des trente secondes ne rattrape pas ce cas, puisqu'il ne se relit
qu'au REDÉMARRAGE de l'application. La sortie propose donc d'abord ce qu'on
veut neuf fois sur dix — enregistrer — et garde « Quitter sans
enregistrer », parce qu'on peut vouloir jeter un essai. Quand il n'y a rien
à perdre, elle ne demande rien : une confirmation inutile est une
confirmation qu'on apprend à balayer sans lire. **Le bord gauche est soumis
aux mêmes gardes** que la flèche — sinon le geste le plus facile serait le
seul à perdre le travail.

Ce qui a tenu, et qu'il vaut la peine d'écrire : les pièces accolées
partagent bien leur mur (sept murs pour deux pièces), le brouillon rend le
relevé entier (murs, pièces et appareillage), supprimer son compte laisse
les plans sur l'appareil, et le DXF sort ses calques séparés.

### Les coins où les chiffres n'ont plus de sens

Troisième campagne, cette fois en poussant l'application dans ses coins,
comme le ferait un doigt qui glisse sur le clavier. Rien ne plantait — et
c'était bien le problème : tout était accepté tel quel, et le plan devenait
illisible sans qu'on sache pourquoi.

**Une cote à quatre chiffres.** « 999 » au lieu de « 9,99 » — deux touches
d'écart — envoyait un mur à un kilomètre, et tout le plan devenait un point
à l'écran. Le minimum était borné depuis longtemps (soixante centimètres) ;
il manquait l'autre bout. **Soixante mètres** : trois fois la façade d'une
maison, bien au-delà du plus grand hangar qu'on relèvera avec un téléphone.

**Un nom de deux cents caractères.** Le cartouche d'une pièce fait quelques
centimètres sur le plan, la ligne d'un scan une largeur d'écran : ils se
tronquaient à l'affichage, mais on les traînait dans chaque export, chaque
sauvegarde et le courrier du support. On coupe désormais **à la saisie**,
quarante caractères pour une pièce, soixante pour un plan.

**Une pièce qui perd tous ses murs.** Elle restait dans la liste :
invisible sur le plan, mais bien présente au métré, au contrôle des normes
(« Séjour : 0 socle sur 5 exigés ») et dans le dossier PDF. Un fantôme qu'on
ne peut ni voir ni corriger, et qui reproche à l'électricien de ne pas
l'avoir équipé. Elle s'en va maintenant avec son dernier mur — et elle
seule : une pièce à qui il reste un pan est une pièce en cours de retouche,
pas une pièce morte.

Ce qui a tenu : quinze pièces posées en cinquante millisecondes, quarante
prises sur un même mur, un enregistrement en une milliseconde, un appareil
refusé sur un mur inexistant, et un mur ramené à zéro qui reprend ses
soixante centimètres. La robustesse était là ; il manquait les bornes.

### Ce qu'on dessine à l'étage reste à l'étage

Quatrième campagne : le dossier PDF, les niveaux empilés. Le PDF a tenu
partout — plan complet, plan d'une seule pièce, plan VIDE, nom accentué et
parenthésé : deux pages, aucune exception. Les étages, eux, ont livré un
défaut de fond.

On relève le rez-de-chaussée, on monte d'un niveau, on ajoute une chambre à
la main — parce qu'on n'a pas de LiDAR, ou parce qu'il est plus rapide de la
poser à ses cotes. **Elle arrivait au rez-de-chaussée**, superposée au
séjour : deux pièces au même endroit, un métré faux, une surface au sol qui
double sans raison.

L'étage est porté par chaque mur et chaque pièce (`niveau`), et seul le SCAN
d'un étage le posait. Tout ce qui se dessine à la main l'ignorait — or c'est
précisément le chemin de ceux qui n'ont pas de caméra, c'est-à-dire ceux
pour qui l'application a ouvert cette porte. Les trois créations manuelles
(pièce libre, pièce accolée, mur tracé seul) portent désormais le niveau
courant.

### Le contrôle dit sur quoi il porte

Cinquième campagne, sur la même piste : les chemins « à la main » et les
niveaux. Une partie de ce qu'on croyait défectueux ne l'était pas, et il
vaut la peine de l'écrire — **un appareil hérite du niveau de son mur, un
point de plafond de celui de sa pièce**. Ils ne portent pas de niveau
propre, et c'est la bonne conception : une seule source de vérité, jamais
deux à tenir d'accord. Vérifié en filtrant un dossier à deux niveaux : au
rez-de-chaussée zéro prise et zéro plafond de l'étage, à l'étage les siens.

Mais le contrôle des normes, lui, **ne regarde que le niveau affiché** — ce
qui est le bon choix : un constat qu'on ne peut pas voir est un constat
qu'on ne peut pas corriger. Le défaut était qu'il ne le DISAIT pas.
L'électricien au rez-de-chaussée lisait « Rien de bloquant », refermait la
feuille, et livrait un dossier dont l'étage comptait cinq manques. Un
verdict partiel qui se présente comme un verdict complet est pire que pas de
verdict : il donne une confiance qu'il ne peut pas tenir.

La feuille annonce donc son périmètre — « Ce contrôle porte sur le niveau
affiché — Rez-de-chaussée. Changez de niveau pour vérifier les autres. » —
et seulement quand le dossier a plus d'un niveau : sur une maison de
plain-pied, la précision serait du bruit.

### Dupliquer une pièce, appareillage compris

Un logement a trois chambres qui se ressemblent, deux WC, des combles
découpés en cellules identiques. On les relevait une par une, et surtout on
les ÉQUIPAIT une par une : cinq socles, un interrupteur, un point lumineux,
à chaque fois, aux mêmes cotes. L'application savait dupliquer un plan
entier ; pas une pièce.

**Le gain n'est pas la géométrie** — quatre murs se retracent vite. C'est
l'APPAREILLAGE : c'est lui qui prend le temps, et c'est lui que la copie
emporte, avec les ouvertures, le mobilier et les points de plafond. Une
chambre dupliquée est une chambre finie.

Quatre décisions qui font la copie juste. Elle se pose **à droite de
l'emprise, sur la même ligne** : deux pièces au même endroit, c'est un métré
qui double sans raison et deux cartouches illisibles l'un sur l'autre. Le
**nom se numérote** (« Chambre 2 », puis « Chambre 3 » — jamais deux fois le
même, sinon le dossier ne dit plus laquelle porte quoi). Les **liens vers
une commande ne suivent pas** : un interrupteur copié ne doit pas piloter le
point lumineux de l'originale. Et elle **naît au niveau où l'on travaille**,
comme tout ce qui se dessine à la main.

Les ouvertures, elles, ne portent pas de pièce : c'est la proximité qui les
rattache, la même règle que partout ailleurs dans ce code.

### « Refaire », l'autre moitié d'« Annuler »

L'application savait revenir en arrière, jamais repartir en avant. Sur un
chantier, on annule d'un geste de trop — le doigt appuie deux fois, ou l'on
se ravise — et le travail était perdu pour de bon : le seul chemin pour le
retrouver était de le refaire à la main. **C'est encore une perte de
travail, et la plus vicieuse : elle vient du bouton dont le rôle est
précisément de rattraper les erreurs.**

Ce qu'une annulation retire part donc dans une pile d'AVENIR, et « Refaire »
l'en ressort. Un geste NEUF la vide : on ne refait pas ce qui n'a plus de
sens dans un plan qui a changé de branche — c'est la règle de tous les
éditeurs, et l'inverse produirait des états impossibles. Le bouton reste
caché tant qu'il n'y a rien à refaire : une colonne de trois boutons dont un
ne sert jamais, c'est un bouton qu'on apprend à ignorer, et les deux autres
avec lui. Son icône est la MÊME flèche que l'annulation, retournée : deux
dessins différents pour deux gestes symétriques se liraient comme deux
fonctions sans rapport.

**Et le passé ne survit plus à un nouveau relevé.** L'historique est de
portée module : il traversait le « Nouveau scan » sans broncher, et une
annulation ramenait alors le plan précédent — sans son entrée de
bibliothèque, sans son nom, sorti de nulle part. Le filet s'était transformé
en piège. Il se vide désormais avec l'avenir, sans quoi « Refaire »
ressortirait des morceaux du relevé d'avant dans le plan qu'on vient
d'ouvrir.

### Trois gestes mènent dehors, UNE garde les couvre

Sixième et septième campagnes. La sixième n'a rien trouvé, et cela vaut
d'être écrit : le **diagnostic du tableau existant** voit les douze circuits
sous un même différentiel et les calibres aberrants (32 A sur des prises,
20 A sur de l'éclairage) — et la donnée dont il dépend est vraiment saisie,
puisque chaque disjoncteur se rattache au dernier différentiel enregistré,
c'est-à-dire dans l'ordre où l'on lit un tableau. Le **métré CSV** met entre
guillemets toute cellule contenant un point-virgule, un guillemet ou un saut
de ligne. Les **cheminements de gaines** encaissent le même point deux fois,
un contour dégénéré, et même un contour VIDE — qui rend une ligne droite au
lieu de lever une exception. Les modules de calcul sont solides : ils ont
été bâtis avec leurs bancs.

La septième, sur les enchaînements d'écrans, a trouvé. **Ouvrir un autre
plan depuis la bibliothèque jetait le travail en cours** : on rouvre un
relevé, on ajoute un WC, on revient prendre un autre dossier — et le WC n'a
jamais existé. C'est le défaut de la flèche de retour, corrigé peu avant,
qui revenait par un autre chemin : **une garde à un seul endroit ne suffit
pas quand deux gestes mènent dehors**. La bibliothèque pose donc la même
question, avec les mêmes issues et dans le même ordre — enregistrer, jeter,
rester — et ne demande rien quand il n'y a rien à perdre, ni quand on rouvre
le plan qu'on tient déjà.

**Et il y en avait un troisième, le pire.** « Nouveau scan », depuis le menu
du plan, jetait le travail comme les deux autres — mais lui efface AUSSI le
brouillon des trente secondes, celui qui rattrape d'ordinaire une
application tuée. Après lui, le travail ne se retrouvait nulle part.

Trois corrections auraient fait trois fois la même alerte à trois endroits :
trois occasions de diverger, et une quatrième sortie qui naîtrait demain
sans garde du tout. Elle vit donc dans UN endroit (`garderLeTravail`), et
son banc tient ce qui compte : **« Enregistrer » vient en premier** — sur un
chantier, on répond à une question sans la lire en entier —, le travail est
rangé AVANT de partir (partir d'abord, c'est enregistrer un plan qu'on a
déjà quitté), le geste destructeur est marqué comme tel, et « Rester » ne
fait rien : c'est l'issue de celui qui a touché par erreur.

Au passage, le geste PRINCIPAL de la bibliothèque n'était pas nommé : « … »
et « Nouveau dossier » portaient une étiquette d'accessibilité, mais pas
« ouvrir un relevé ». Un lecteur d'écran annonçait le contenu de la ligne
sans jamais dire ce qu'un appui ferait.

Ce qui a tenu, dans la même série : se déconnecter garde le plan ouvert et
les relevés sur l'appareil ; le quota épuisé n'empêche pas d'enrichir et de
ré-enregistrer le plan en cours — on ne prend pas en otage le travail
commencé.

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

L'accueil porte des ondes qui traversent l'écran de bord à bord, à mi-hauteur
du téléphone. La référence est un shader GLSL — **plusieurs ondes néon**,
bleue, verte, rouge, et le trait blanc, qui se croisent et se séparent sur
fond noir, chacune vivant sa vie. Il n'y a pas de WebGL ici, et il n'en faut
pas : ce que l'œil retient de cette image, ce sont des courbes, leurs lueurs
et leurs **croisements**. Tout se dessine au trait.

**Chaque ligne a SA courbe, SA vitesse, SA lueur.** Le premier portage n'avait
retenu qu'une onde : une courbe et sa frange collée (deux décalages de trois
points et demi), glissant d'un seul bloc — des lignes parallèles, qui ne se
croisent jamais. Relevé du patron, référence à l'appui : « chaque ligne bouge
et sont lumineuses ». Chaque ligne a donc sa **phase** et son **amplitude**
propres — c'est la différence de phase qui fait les croisements — et sa
**vitesse** propre, toutes distinctes : à vitesse égale, les croisements
resteraient plantés aux mêmes endroits et le dessin serait figé dans son
mouvement. Et les phases sont RESSERRÉES (moins de 1,4 rad d'éventail —
relevé du patron : « plus proches entre eux ») : trop ouvertes, chaque
ligne vivait dans son coin de la bande ; resserrées, elles voyagent en
faisceau et se frôlent, comme sur la référence. La lueur est une pile de trois passes par ligne — large et pâle,
serrée, puis le cœur : une lumière s'éteint en s'éloignant de sa source,
donc la plus large est la plus pâle. Le cœur (blanc la nuit, bleu de marque
le jour) est peint par-dessus : c'est lui qu'on suit des yeux ; les néons
gardent leurs couleurs sur les deux fonds — c'est la lumière décomposée.

**C'est la VUE qui glisse, pas l'attribut du dessin.** Premier jet : la course
était posée sur le `x` d'un groupe SVG. Le ruban n'a pas bougé d'un pixel — et
c'est logique : le pilote natif ne connaît que les propriétés d'une vue, il
ignore les attributs d'un dessin vectoriel. L'animation partait, personne ne
l'écoutait, et l'accueil montrait un trait courbé immobile. Le banc tient
désormais la seule chose qui garantit le mouvement : une transformation par
ligne, sur une vue, avec une valeur animée dedans.

**Chaque courbe est dessinée une fois, et c'est sa vue qui glisse.** La
recalculer à chaque image — soixante fois par seconde, sur un chemin de
plusieurs centaines de points — coûterait à l'accueil ce que l'animation du
plan a justement gagné en étant cuite au build. Chaque ligne est tracée sur
deux longueurs d'onde, et sa transformation, confiée au pilote natif, la fait
défiler ; le motif se répète exactement d'une période à l'autre, donc la
boucle ne se voit pas. Quatre transformations natives ne coûtent pas plus
cher qu'une — ce qui coûte, c'est un chemin recalculé à l'image, et personne
ne le fait.

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
qui rendent le plan faux — passent devant les simples vérifications.

**Le verdict tient dans un rond, contre le sélecteur 2D/3D.** Le contrôle
vivait en pastille pleine largeur dans la colonne du bas, et apparaissait ou
disparaissait avec les constats : un verdict qui bouge de place ne se
consulte pas, il se cherche. Relevé du patron : « en plus petit à côté du
switch 2D/3D, une légère onde rouge qui bump si l'appartement n'est pas aux
normes, un contour vert fixe si rien n'est à redire ». C'est exactement ça —
un rond de trente points, toujours au même endroit, dont la COULEUR parle
avant qu'on l'ouvre : une bague rouge s'en échappe toutes les quatre
secondes tant qu'une alerte reste, le contour passe au vert plein quand le
logement est bon (`ControlePastille`). Deuxième passe, sur l'appareil : la
bague s'arrête à **1,45 fois le bouton** — à 1,9 elle léchait le sélecteur
de vue, « fais moins propager l'onde ». Et « Normes auto », dans le menu
« … », porte désormais **le même bouclier** que la pastille : même sujet,
même dessin — le crayon du renommage n'avait rien à y faire.

**Et chaque constat qui sait se régler porte son bouton.** La fenêtre
listait ce qui manque et laissait poser à la main — or les constats
portaient déjà leur geste (`fix`), que personne ne consommait. Refonte,
relevé du patron : « correction auto au clic sur un élément manquant, on
guide l'utilisateur ». Chaque ligne montre le dessin de son sujet (prise,
règle, plafond…), et celles qui savent se corriger portent une baguette
bleue : un appui pose l'appareil à une **place libre de la bonne pièce** —
mêmes règles que « Normes auto » : hors meubles, hors menuiseries, loin des
angles (`corrigerConstat`) — ou remet l'appareil fautif à sa hauteur. Les
constats du plafond ont gagné leur geste au passage : le DCL manquant se
pose au centre de la pièce, le détecteur de fumée file dans la
**circulation** — jamais en cuisine, où la vapeur le ferait hurler. Une pose
à la fois, sous les yeux : la ligne s'efface d'elle-même au recalcul des
constats, et le décompte dit le travail accompli. Quand aucun mur n'offre de
place, l'app l'avoue au lieu de poser dans un angle.

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

**Et une ouverture se ferme** — relevé du patron : « donne la possibilité de
fermer une ouverture et la remettre en mur, en continuité de ses murs
adjacents ». Le bandeau porte un troisième geste, « Fermer », à côté des
deux cotes. Il n'y a aucune maçonnerie à inventer : les ouvertures sont des
TROUS découpés dans des murs pleins (`assignOpenings`) — retirer le trou
suffit, le mur redevient continu par construction, à l'écran comme dans le
dossier. Et le retour en arrière existe, si la porte devait rouvrir.

### L'établi lie, il ne copie plus

Relevé du patron : « enlève le bouton copier, et remplace-le par un bouton
lien... prise ou éclairage mural. Mais ça ne doit pas être possible pour le
courant faible. »

Le copier-coller de mur est parti tout entier — le bouton, le presse-papier
(`wallClip`), le magasin et son banc : du code qu'aucun geste n'atteint
plus est du code mort. À sa place, **« Lier »** : on tient une prise
commandée ou une applique dans l'établi, l'établi se ferme, et l'on touche
sur le plan **l'interrupteur qui la commande** — exactement le geste d'une
ligne de spots. Le lien se noue et se dénoue du même toucher
(`toggleFixtureCommand`), se dessine du même filet tireté que les liaisons
du plafond, sur le plan comme dans le PDF, et vit DANS le scan.

**La garde vit au magasin, pas seulement au bouton.** Ce qui SE COMMANDE
est une règle pure (`seCommande`) : les prises 16 A — la prise commandée du
séjour — et l'applique, rien d'autre. Une RJ45 n'a rien à allumer, un
lave-linge (20 A) ne se commande pas du couloir, les ensembles mixtes
portent du courant faible sous leur plaque, et une commande ne se commande
pas elle-même. Le bouton « Lier » s'éteint sur tout ça, et le magasin
refuse par-dessus : un lien impossible ne se noue par AUCUN chemin.

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

**En 3D, un repère qui suit le zoom.** Le volume posé sur le mur fait 8 cm :
à l'échelle d'un logement entier, c'est deux pixels — l'appareil existait
mais ne se voyait pas. Le même symbole est donc posé par-dessus, et masqué
dès que sa face tourne le dos à la caméra. Le sigle s'écrivait en 10 fixe —
relevé du patron : « même en dézoomé ils sont trop gros, il faut une
intelligence de zoom qui augmente la taille des noms avec ». Sa taille est
désormais une règle pure du zoom (`tailleDuSigle` : 0,085 point par pixel
par mètre, bornée de 5,5 à 10) : discret sur la vue d'ensemble, il grandit
en s'approchant — jusqu'à ce que la désignation longue prenne le relais. **En s'approchant** (au-delà de 90 px par mètre), il déplie ses deux
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

**Le formulaire du service client a appris la même leçon.** Il était une
carte CENTRÉE, et le patron l'a vu au premier message : « le bouton Envoyer
n'est plus visible à cause du clavier ». On tape son texte, le clavier prend
la moitié basse de l'écran, et le bouton passe dessous — sans rien pour
refermer le clavier. Il prend donc la coquille commune, comme toutes les
autres fenêtres : elle porte la montée, la descente, le voile qui referme
ET le décalage du clavier. Une boîte centrée avec un champ de saisie finit
toujours par se faire manger la moitié ; c'était écrit ici depuis
longtemps, il fallait encore l'appliquer.

**Mais une CROIX est revenue en haut**, et pour une raison que le voile ne
couvre pas — relevé du patron : « il manque la croix pour quitter la page ».
Le voile est l'échappatoire tant qu'il reste du voile : sur le menu du scan,
neuf entrées remplissaient l'écran, et il n'y avait plus de « à côté » où
viser. La croix vit dans l'en-tête, à droite du titre, et c'est un TRACÉ —
jamais un « ✕ » au clavier, la leçon des caractères.

#### La feuille resserrée

Relevé du patron, capture à l'appui : « fais une refonte de cette page pour
que ça prenne moins de place, ce n'est pas agréable visuellement ». Trois
choses gonflaient le menu du scan, et les trois sont tombées.

**Chaque choix était une CARTE**, séparée de la suivante par sept points de
vide : neuf entrées, c'est soixante-trois points perdus en gouttières et
dix-huit coins arrondis qui hachent la lecture. Les rangées se touchent
maintenant dans UN bloc, séparées par un filet d'un cheveu — le bloc porte la
forme, les rangées ne sont que ses lignes. On gagne un tiers de la hauteur
sans retirer une seule entrée.

**La même icône revenait CINQ FOIS.** « Pièce » servait pour ajouter une
pièce, en scanner une, redétecter, monter d'un étage, descendre au sous-sol
et relever un tableau. Une icône répétée n'informe pas : elle décore, et
elle oblige à lire les six lignes pour trouver la bonne. Chacune a désormais
la sienne — le téléphone qui vise pour un relevé, la loupe sur le plan pour
la redétection, deux dalles et une flèche qui monte pour l'étage, les mêmes
avec la flèche qui descend pour le sous-sol, le coffret et ses rangées de
modules pour le tableau.

**Les aides couraient sur trois lignes** et faisaient à elles seules la
hauteur d'une carte. Elles tiennent en UNE, et le texte a été raccourci pour
ça : ce qui ne tient pas en une ligne se dit dans l'écran qui suit, pas dans
le menu qui y mène.

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
lettres au bord du cadre ne désignent plus rien. L'APERÇU, lui, reste NU
(relevé du patron) : les cardinaux ne s'affichent que sur le plan 2D du
document — sur l'écran d'export, ils chargeraient la vignette qu'on est en
train de régler. La rose garde son honnêteté : sans cap relevé au scan,
rien ne se dessine — un nord inventé est pire que pas de nord du tout. Le
dossier d'essai se regarde : `UPDATE_BOUSSOLE=1 npx jest boussole` l'écrit
dans le dossier temporaire, puis `node tools/pdf-vers-svg.mjs` rend ses
feuilles.

**Deux cases franches : « Élévations » = TOUS les murs, « Cotes Élec » =
les murs équipés.** La case « Tous les murs » a vécu — relevé du patron :
deux cases qui se conditionnaient pour dire trois états, c'était une de
trop. L'absorption reste structurelle (`feuillesElevations`) : cocher les
deux n'imprime jamais une feuille en double, le dossier sort une seule
série, la plus large. Les tuiles d'options ont aussi maigri d'un cran —
« réduis plus les blocs que les icônes » : la tuile perd six points
(46 → 40), l'icône deux (26 → 24) — ce qu'on reconnaît, c'est le dessin. L'icône des élévations a changé au passage :
la galerie d'images ne disait rien d'une cote — deux flèches verticales
(`sort-vertical`, jeu Solar) disent une hauteur qu'on mesure. Et la
boussole du calque « Nord » du plan s'est engraissée (trait 2,6) puis
grandie (26 points) : à côté des silhouettes Solar, elle faisait
maigrelette.

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
emporte ses photos (leur fichier part s'il ne sert à aucune sauvegarde).

**Plusieurs par mur, et une par retour.** Relevé du patron : « la
possibilité de prendre plusieurs photos d'un mur, et un retour de mur doit
aussi pouvoir avoir sa photo, sans prendre tout le mur ». Le magasin en
gardait déjà plusieurs, mais elles se punaisaient TOUTES au même endroit —
au milieu du mur — et le dossier n'en imprimait qu'une, au motif que « deux
vignettes de la même cloison n'apprennent rien de plus ». C'est faux dès
qu'un mur est percé : le pan de gauche et le tableau de droite sont deux
chantiers, qu'on photographie séparément.

La photo vise donc **ce qu'on regarde** : le retour désigné sur le plan
(`focusX`), ou à défaut celui qui porte l'appareil tenu ; sans rien de tout
cela, le mur entier comme avant. Le bouton le dit (« Photo du retour ») et
compte celles déjà prises. Aucun champ n'a été ajouté au modèle : la photo
est punaisée à une COTE, et `retourALaCote` déduit le pan qui la porte —
rien à maintenir en cohérence, le rattachement se recalcule au moindre coup
de crayon sur les ouvertures.

Le dossier imprime **toutes** les vignettes d'un mur, jusqu'à trois de front
(au-delà ce sont des timbres ; la légende dit combien restent dans l'app),
à la même hauteur pour que la bande ne danse pas, et chacune nommée :
« Retour 1 », « Retour 2 », ou « Photo de repérage » sur un mur d'un seul
tenant. Au passage, **un mur photographié mérite sa feuille** même sans un
seul appareil posé : on ne sort pas l'appareil photo pour rien, et la
vignette qu'on est allé chercher sur le chantier n'arrivait nulle part.

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
  coller sur un plan les cotes d'un autre logement. Il se vidait à
  l'ouverture — jusqu'à ce que le copier de mur disparaisse tout entier
  (voir « L'établi lie, il ne copie plus ») : un lien vit DANS le scan,
  plus rien à vider.

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

### Ce qui faisait chauffer le téléphone

Relevé du chantier : « l'application fait chauffer le téléphone et perdre la
batterie rapidement ». Deux causes, toutes deux invisibles à la lecture du
code — elles ne se voient que sur le dos de la main.

**Une boucle qui ne s'arrêtait jamais, sur le fil JS.** Le liseré qui court
autour du bouton principal anime `strokeDashoffset`, un attribut SVG : il
n'existe pas côté natif, donc l'animation vit sur le fil JavaScript. Elle
tournait en boucle infinie, sur l'écran que l'application montre le plus
longtemps — soixante réveils de JavaScript par seconde, téléphone posé sur la
table, personne devant. Le liseré fait maintenant **trois tours** puis rend la
main (`TOURS`), et chaque retour sur l'écran les relance : l'effet est intact,
la dépense ne l'est plus. Les autres boucles de l'application (l'onde de la
pastille de contrôle, le ruban d'accueil, le badge Pro) vivent sur le fil
natif et respirent entre deux passages ; elles restent.

**Un mur qui passait devant le meuble qu'il porte.** Relevé du chantier :
« il y a des modèles 3D qui se font superposer par des murs lorsqu'on reste
appuyé pour tourner » — le meuble disparaît derrière un mur qui est pourtant
derrière lui, et revient dès qu'on lâche. Pendant un geste, la scène se
bâtissait en mode **grossier** : chaque mur d'un seul tenant au lieu d'être
découpé en bandes de 60 cm. Or c'est le découpage qui permet au tri du peintre
de départager un mur long d'un objet posé devant lui — d'un seul tenant, le
mur ne porte plus qu'**une** profondeur, celle de son centre, et il passe
devant ou derrière en bloc.

Le mode grossier est supprimé, et il coûtait plus qu'il ne rapportait : la
scène entière était **reconstruite au premier contact du doigt, puis une
seconde fois au lâcher** — deux fois le calcul le plus lourd de la vue, à
chaque geste. Ce qu'on croyait économiser en pans se payait en
reconstructions. Le geste reste allégé là où c'est sans conséquence : cotes,
étiquettes et surfaces se taisent tant que le doigt est posé.

**Deux rendus pour une image.** Le tactile d'un iPhone récent remonte jusqu'à
cent vingt fois par seconde. Chaque mouvement du doigt sur la vue 3D
reconstruisait la scène entière — plusieurs centaines de tracés — alors
qu'entre deux images affichées, tous les rendus intermédiaires sauf le dernier
finissent à la poubelle. `parImage()` ne garde que la **dernière** valeur
reçue et n'affiche qu'au battement suivant de l'écran : rien ne se perd, le
travail inutile disparaît. Le repère du geste, lui, est mis à jour sur-le-champ
— le doigt calcule la suite à partir de là, il ne peut pas attendre l'écran.

### Le mur ajouté à la main naît accroché

« Un mètre au centre du plan » : le mur neuf flottait au milieu du séjour, et
il fallait recoller **ses deux coins** au doigt. Relevé du chantier : « une
facilité pour le joindre à une extrémité de mur ».

Il part maintenant du **dernier bout libre du tracé**, droit dans la
continuité de son mur (`murNeufDepuisUnBout`) : un coin est déjà soudé, il ne
reste qu'à tirer l'autre — et le suivant repartira du bout de celui-ci,
jusqu'à refermer la pièce. Le centre ne sert plus que de recours : plan vide,
ou contour déjà fermé, les deux cas où il n'existe aucun bout libre.

Et le coin tiré **se soude pour de bon** (`soudureAuBout`). L'aide au doigt
alignait par AXE — le x d'un bout, le z d'un autre — sans jamais rien
joindre : le coin se posait à l'aplomb de deux extrémités sans en toucher
aucune, et le contour fuyait par un interstice invisible à l'écran. Pas de
contour fermé, pas de surface, pas de métré. Une extrémité à moins de
**25 cm** est une intention : on s'y pose exactement, et l'équerre ne repasse
pas derrière défaire la jonction qu'on vient de faire.

### La rotation d'un mur suit le doigt

Relevé du chantier : « la rotation ne suit pas bien le mouvement ». Le geste
envoyait des **pas** — un demi-degré, parfois moins, à chaque image — et le
magasin recollait **chacun** aux crans de quinze degrés, le pas suivant
repartant du cran atteint. Le mur restait donc scotché à l'équerre pendant que
le doigt s'en éloignait, puis rattrapait d'un coup ; et cent arrondis
successifs le faisaient dériver.

**On ne compte plus le chemin, on lit l'arrivée.** À la prise, le geste retient
l'angle du mur et celui du doigt ; ensuite le mur vaut son angle de départ plus
ce que le doigt a parcouru — un angle **absolu**, posé tel quel par
`setWallAngle`. Rien ne s'accumule, donc rien ne dérive, et une image perdue ne
laisse aucune trace.

L'accroche se décide alors **une seule fois**, sur cet angle voulu
(`angleAimante`) : à trois degrés d'un cran on colle — avec le petit choc au
doigt qui le dit — à quatre on est libre. Les crans sont l'équerre et ses
quinzièmes **plus les angles des murs déjà là** (`anglesRemarquables`) :
aligner une cloison sur celle d'en face est le geste le plus courant du plan.
L'angle du doigt est déplié (`deplier`), si bien que franchir le demi-tour ne
renvoie plus le mur d'un tour complet en arrière — et le plafond de 90° par
geste est tombé avec les pas : il bornait une dérive qui n'existe plus, et
arrêtait net un mur que le doigt continuait de tourner.

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

### Retours du chantier : l'accueil, le viseur, les retours de mur

**Le bouton de l'accueil ne s'animait plus.** C'était le prix de la passe
batterie : son liseré tournant reposait sur un décalage de pointillés, propriété
sans équivalent natif, donc animée sur le fil JS — soixante réveils de
JavaScript par seconde sur l'écran le plus longtemps affiché. On l'avait bornée
à trois tours, après quoi le bouton restait figé. Un **reflet qui balaie** l'a
remplacé : une translation, que le fil natif porte de bout en bout, qui tourne
sans fin sans rien coûter. Au passage, le bouton passe au **blanc cerné de
bleu, texte bleu** — l'aplat pesait sur la page — et tous les boutons de
l'accueil perdent un cran de hauteur.

**Puis le reflet a cédé la place à l'ONDE D'ÉCHO.** Relevé du patron : « refais
une meilleure animation du bouton Commencer le scan ». Le reflet ne coûtait
rien, mais c'était le miroitement de n'importe quelle carte bancaire — posé sur
un bouton BLANC, où il se voyait à peine. Or ce que ce bouton propose, c'est de
LIRE une pièce par écho, et le logo de l'accueil émet déjà ses ondes à
l'ouverture : le bouton émet donc les mêmes. Deux anneaux naissent à son bord —
même rayon, même épaisseur, même bleu que son contour, ce qui les fait lire
comme émis PAR lui et non posés autour — et se dilatent en s'effaçant sur trois
secondes et demie.

Trois points de construction. **Une seule valeur pour deux anneaux** : chacun
lit une tranche différente de la même montée (0 → 0,72 et 0,28 → 1), ce qui les
décale sans coûter une seconde boucle — la mécanique exacte des ondes du logo.
**Ils vivent HORS du corps**, dans une zone sœur qui ne rogne rien : le corps
arrondit ses coins par `overflow: hidden`, une onde née dedans y mourrait sans
jamais dépasser. Et **ils grandissent EN pâlissant** : un anneau qui s'ouvre
sans s'effacer finit en cadre posé autour du bouton. Échelle et opacité sont
portées par le pilote natif, donc l'onde bat sans fin sans réveiller le
JavaScript — la règle de cet écran n'a pas bougé.

**Le viseur du scan n'était pas là où l'on visait.** Le carré était dessiné à
46 % de la hauteur, quatre points au-dessus du centre, pour dégager la
miniature 3D ; mais le rayon qui pose l'appareil part du **centre exact** de
l'image. L'appareil se posait donc à côté du carré qu'on venait d'aligner. Deux
repères pour un seul geste, c'est un de trop : le carré est descendu là où le
rayon tire. Le bloc de pose, lui, perd un tiers de sa taille — il mangeait la
vue sur ce qu'on scanne.

**Le guide de pose est devenu un pas-à-pas.** Les trois scènes étaient empilées
dans une page qui défilait : trois animations tournaient ensemble, on lisait la
première et l'on fermait sans dérouler le reste. Une étape seule à l'écran se
regarde. Et **« Passer » est offert dès la première** : qui sait déjà s'en va,
personne n'est retenu dans une explication.

**Un retour de mur est maintenant indépendant.** Relevé du chantier : « si
j'essaye de prolonger ce retour, c'est le long mur qui est impacté ». Deux murs
qui partagent un point bougent ensemble — c'est ce qu'il faut pour le coin
d'une pièce, sans quoi le contour s'ouvre, la surface disparaît et le métré
avec elle. Pour un retour qu'on allonge, c'est l'inverse. **On ne devine pas
l'intention, on la dit** : « Détacher » dessoude le mur de ses voisins, sans le
déplacer d'un millimètre — les murs se tiennent par leurs coordonnées, et les
écarter aurait fait sauter le mur. Une marque suffit, que le déplacement de
coin lit. Et **raccrocher, c'est ressouder** : un bout ramené à moins de vingt
centimètres d'un autre s'y pose exactement et rend le mur solidaire.

### L'export DXF

L'application ne sortait que du PDF : un document qu'on **lit**, jamais un
dessin qu'on **reprend**. Un architecte, un économiste de la construction, un
cuisiniste, une menuiserie demandent un fichier qu'ils ouvrent dans AutoCAD,
ArchiCAD, SketchUp ou leur machine à commande numérique — et l'on ne pouvait
pas répondre. C'est le format d'échange du bâtiment depuis quarante ans ; ne
pas l'avoir fermait la porte des clients qui paient le mieux.

**On écrit du R12 (AC1009)**, le dialecte que *tout* lit — y compris les vieux
logiciels de menuiserie et les découpeuses. Les versions récentes apportent des
entités dont un plan de logement n'a aucun besoin, et referment la
compatibilité qu'on cherchait précisément à ouvrir. Même raison pour les
quatre entités seulement : `LINE`, `POLYLINE`, `CIRCLE`, `TEXT`. Un dessin fait
de primitives simples s'ouvre partout et se retouche sans surprise.

Quatre décisions, et chacune évite une erreur qu'on ne voit qu'en aval :

- **des calques préfixés** (`ECHOPLAN-MURS`, `-OUVERTURES`, `-MEUBLES`,
  `-ELEC`, `-PIECES`, `-COTES`). Un architecte éteint ce qui ne le concerne
  pas ; un plan où tout est mélangé ne se nettoie pas, et le préfixe évite
  d'écraser **ses** calques à lui quand il colle notre dessin dans son projet ;
- **des millimètres**, l'unité des plans d'exécution, annoncés par `$INSUNITS`
  pour que le logiciel d'accueil mette le dessin à l'échelle sans qu'on ait à
  l'expliquer dans un courriel ;
- **l'axe retourné**. Le relevé compte z vers le bas comme un écran, le DXF y
  vers le haut comme les mathématiques : sans retournement, le plan s'ouvre
  **en miroir** chez le destinataire — portes à gauche au lieu de la droite —,
  une erreur qui ne se voit qu'une fois le mobilier commandé ;
- **les accents translittérés**. Le R12 est de l'ASCII : un « é » y devient un
  caractère de contrôle et le fichier s'ouvre avec des noms de pièces
  illisibles, quand il s'ouvre. « Séjour » devient « Sejour », ce qu'un
  dessinateur lit sans y penser.

Les murs sortent **avec leur épaisseur** — le même contour que le PDF,
jonctions d'onglet comprises : un mur réduit à son axe obligerait le
destinataire à redonner l'épaisseur cloison par cloison. L'appareillage sort
en repères simples, sur son propre calque, plutôt qu'en symboles normalisés
qui ne se retoucheraient pas et que chaque logiciel dessine à sa façon.

Le banc qui compte relit le fichier **comme le fera AutoCAD** : un automate
qui suit les paires code/valeur, reconstruit les entités et mesure la
géométrie obtenue. Vérifier que le fichier *contient* les bonnes chaînes ne
prouverait rien — c'est le lecteur qui décide si le dessin s'ouvre ou si le
logiciel affiche « fichier corrompu ».

### L'échelle vraie

Le document sortait **« ~ 1:100 »**. Le tilde disait la vérité : le plan était
étiré jusqu'aux bords du cadre, et l'échelle *déduite* de la place occupée puis
arrondie pour l'affichage. Ce n'était l'échelle de rien. Un architecte, un
bureau d'études, un économiste de la construction posent leur kutch sur le
papier : à 1:98,3, toutes leurs cotes sont fausses et le document ne vaut plus
que comme illustration.

Le calcul est renversé. On choisit une **échelle normalisée** — 1:20, 1:25,
1:50, 1:75, 1:100, 1:125, 1:150, 1:200, celles qu'on trouve sur une règle de
dessinateur — la plus grande qui tienne dans le cadre, et l'on trace à celle-là
exactement. Le plan occupe un peu moins de place : c'est le prix, et c'est
ainsi que travaille tout le monde. Le cartouche affiche **« 1:75 »**, sans
tilde.

Deux bornes disent le métier : un plan minuscule ne se dessine pas à 1:5 — ce
n'est pas une échelle de logement, et le trait de mur ferait un centimètre de
large —, et un immeuble de quatre-vingt-dix mètres sort de la série, où l'on
continue alors par crans de cinquante. **Le zoom de l'aperçu choisit
l'échelle** au lieu de la casser : zoomer fait passer de 1:100 à 1:75, puis à
1:50, toujours sur un cran de la série.

La **règle graphique** du cartouche vient désormais du même calcul que
l'échelle — deux calculs séparés auraient fini par dire deux choses
différentes du même dessin — et sa série descend sous le mètre pour les plans
de détail, où une barre de cinq mètres ne tiendrait pas.

Le banc qui compte n'est pas celui du libellé, mais **la preuve par le
tracé** : on construit une pièce de dix mètres, on relit les coordonnées du
PDF produit et l'on vérifie que la distance dessinée correspond à ce que
l'échelle promet. C'est le seul test qui protège l'architecte au bout de la
chaîne.

### Ce qu'un audit a trouvé, et refermé

Un tour complet de l'application, mené sur pièces, a sorti quatre défauts du
même genre : **des fonctions écrites, testées, et qu'aucun geste n'atteignait**.

- **Le filigrane d'étage ne servait à rien.** Le plan du niveau inférieur
  s'affichait en transparence pour poser l'étage d'aplomb, et rien ne
  permettait de le bouger : `recalerNiveau` n'était appelé de nulle part. Le
  glissement déplace maintenant l'étage — le geste qu'on ferait spontanément —
  avec un bandeau qui annonce le mode et offre sa sortie au même endroit. Le
  déplacement part **par petits pas** : renvoyer chaque fois la course totale
  du doigt ferait filer l'étage à une vitesse carrée.
- **« Jeter les modifications » n'existait pas.** L'écran annonçait
  « Modifications non enregistrées » et n'offrait que de les enregistrer ;
  l'autre moitié du choix était dans le magasin, testée, sans bouton. Une
  demi-heure de retouches malheureuses ne se rattrapait qu'en annulant
  quarante fois.
- **Deux chemins morts supprimés** : `joinFixtures` (jamais appelé, même par
  un banc) et `rotateWall`, doublon relatif de `setWallAngle` depuis que la
  rotation se pose en absolu. Un magasin qui garde deux chemins pour la même
  chose finit par diverger : l'un corrigé, l'autre pas.
- **Le plan sans scanner**, ci-dessous — le plus lourd de conséquences.

### Le plan sans scanner

Un audit de l'application a trouvé la porte fermée à **trois publics à la
fois**, pour la même raison : sans LiDAR, l'accueil annonçait « appareil non
compatible » et s'arrêtait là.

- **Les appareils sans LiDAR** — iPhone non Pro, iPad d'entrée de gamme,
  Android — c'est-à-dire la moitié du marché artisan. Or les neuf dixièmes de
  la valeur de l'application — normes, circuits, métré, tableau existant,
  dossier PDF — ne demandent **aucun capteur**.
- **Les petites interventions** : pour ajouter deux prises dans une cuisine,
  on ne relève pas l'appartement. On trace la pièce à ses cotes, on pose, on
  chiffre — trois minutes, devant le client.
- **Les architectes**, qui esquissent au mètre avant d'avoir mis un pied sur
  le chantier.

Le magasin savait déjà bâtir un logement de proche en proche (`addRoomBox`,
qui accole une pièce à un mur existant en partageant la cloison) : **il n'y
manquait que la porte d'entrée**. Un bouton « Dessiner un plan » sur l'accueil,
toujours offert — même quand le scan l'est aussi, parce que c'est souvent le
chemin le plus court, pas un lot de consolation.

Deux défauts de cet écran, vus sur le téléphone et pas en banc, ont suivi —
relevé du chantier : « le bouton prend toute la page verticalement avec le
texte tout en haut et coupé par le bouton », et « pas de retour en arrière ».
Le premier est un piège classique : le bouton empruntait le style de la rangée
d'actions, dont le `flex: 1` prend la largeur restante **dans une rangée** et
toute la hauteur **dans une colonne**. Un style de rangée ne se réutilise pas
dans une pile. Le second était plus grave : un écran sans retour ne se quitte
qu'en tuant l'application. Les deux sont maintenant tenus par des bancs, dont
un qui inspecte le style appliqué au bouton.

Dans la foulée, **l'écran d'un plan vide a été refait**. Il ne disait qu'une
chose — « Aucun mur détecté, balayez plus lentement » — avec une seule sortie,
« Réessayer » : le message d'un scan raté, servi aussi à qui venait de choisir
le clavier et se retrouvait alors sans aucune issue. Les deux situations ont
désormais leur texte, et **la même action manquante** : poser une pièce. Elle
vaut même après un scan raté — une cuisine se trace en dix secondes quand la
caméra s'obstine.

### Le télémètre laser

RoomPlan se trompe de deux à trois centimètres sur une pièce : sans
conséquence pour un plan d'ambiance, **trop pour percer**. Le mètre laser donne
le millimètre — et il le donne devant le client, ce qui compte autant : un
outil de chantier qu'on sort et qui parle à l'application, ça se voit.

**Ce qu'on parle** : le profil BLE des **Leica DISTO**, télémètre du bâtiment
et le seul dont le service soit publiquement documenté — un service, une
caractéristique, quatre octets de flottant en mètres, notifiés à chaque appui
sur le bouton de l'outil. Bosch garde son protocole pour lui ; le code est
écrit pour qu'un second profil s'ajoute sans le refondre, c'est la seule chose
qu'on puisse honnêtement faire pour eux aujourd'hui. **Ce volet n'a pas encore
été essayé sur un appareil réel** : le protocole est implémenté d'après sa
documentation, et le premier DISTO branché dira le reste.

Deux endroits où il sert, et ce sont les deux vrais : la **longueur d'un mur**
(menu du mur → Laser) et la **hauteur sous plafond** (menu de la pièce →
Hauteur au laser) — télémètre posé au sol, visant le plafond, le geste le plus
simple du métier et celui dont dépendent les élévations, le volume et le métré
mural.

Trois décisions qui tiennent tout :

- **la radio ne vit que le temps de la feuille**. Chercher en permanence
  viderait la batterie pour un outil qu'on sort trois fois par mois, et ferait
  apparaître la demande d'autorisation Bluetooth au premier lancement de
  l'application, sans rapport avec ce qu'on faisait ;
- **on s'abonne, on n'interroge pas**. C'est l'appareil qui pousse sa mesure
  quand on appuie sur son bouton ; scruter la caractéristique en boucle aurait
  vidé les deux batteries pour le même résultat ;
- **on n'écrase jamais une cote sur un doute**. Le télémètre ne sait pas quel
  mur on vise : braqué sur la cloison d'en face, il envoie une cote
  parfaitement valable qui remplacerait un relevé juste. Quand l'écart au scan
  dépasse à la fois **un cinquième et quinze centimètres**, ce n'est plus une
  imprécision de LiDAR — c'est un autre mur : la feuille le dit et demande un
  second appui. En dessous, on applique sans rien demander, sinon l'outil
  devient inutilisable.

La cote s'inscrit **au centimètre** : le laser donne le millimètre, mais écrire
3,472 m sur une élévation promet une précision que la maçonnerie n'a pas.

### Les boutons de pose parlent français

Relevé du chantier : « les 3 boutons de placement d'éléments élec lors d'un
scan ne sont pas forcément compréhensibles de tous ». C'est juste. **PC, INT,
LUM** sont des abréviations de métier — et même à qui les connaît, trois ronds
posés sur l'écran ne disent pas qu'on POSE quelque chose sur le mur qu'on
filme.

Trois réponses, réunies dans **un seul bloc** plutôt que trois pastilles
éparses. Le **symbole du plan** — celui qu'on retrouvera sur le dossier
imprimé, donc la même langue d'un bout à l'autre ; un bouton qui montre autre
chose que ce qu'il produit fait apprendre deux langages pour un seul geste. Le
**mot en clair** dessous — « Prise », pas « PC » : l'application sert aussi à
montrer le travail au client. Et un **« ? »** qui rouvre l'explication.

Cette explication est une page qui **montre le geste au lieu de le raconter** :
trois scènes animées — le viseur qui cherche le mur, l'appareil qui s'y pose,
les repères qui restent en place pendant que la caméra continue. Elle s'ouvre
**une fois**, à la première caméra, sur l'écran encore vide, et jamais plus :
une explication qui revient à chaque scan devient un obstacle, et on finit par
la fermer sans la lire.

Détail technique qui a décidé de la forme : **les scènes sont des vues
animées, pas des SVG animés**. Animer un `<G>` de react-native-svg demande des
props que le typage refuse, et le mouvement retombe sur le fil JS — pendant que
RoomPlan mouline derrière. Décor fixe, vues animées par-dessus : tout part sur
le fil natif.

### Le relevé de l'existant

La moitié des chantiers d'un électricien est de la rénovation, et elle commence
toujours pareil : on ouvre le tableau, on regarde ce qu'il y a, on dit au client
ce qu'il faut reprendre. **Aucun concurrent généraliste ne sait faire ça** — ils
dessinent du neuf. Le relevé se faisait sur un carnet, puis se ressaisissait le
soir.

On note donc les départs tels qu'ils sont, et l'application dit ce qui cloche au
regard de la NF C 15-100. **Ce n'est pas un diagnostic réglementaire** : mesurer
une terre demande un appareil et la main de quelqu'un. Mais tout ce qui SE VOIT
dans un tableau ouvert — les différentiels, leur type, leur nombre, ce qu'ils
portent, les calibres, la place qui reste — l'application le voit aussi.

**Trois degrés, et ils comptent.** `danger` : ce qui expose quelqu'un
aujourd'hui — pas de 30 mA, des porte-fusibles en service. `ecart` :
l'installation tient mais n'est pas aux normes, et c'est ce qui se chiffre dans
le devis. `vigilance` : ce qu'il faut aller voir sur place. Tout mettre en
rouge, c'est n'alerter sur rien — un électricien qui voit douze lignes rouges
sur un tableau correct cesse de lire la liste. **Un tableau correct ne dit rien
de faux** : c'est le seul verdict qui vaut.

La saisie passe avant la beauté : on est debout devant un tableau ouvert, une
main sur le téléphone. Chaque départ se note **en deux appuis**, les calibres
qu'on rencontre vraiment (2, 10, 16, 20, 32 A) sont des boutons, et l'usage se
prend dans une liste — un mot tapé au doigt sur un chantier est un mot mal tapé.
**Le verdict vit en haut** et se refait à chaque module noté : on voit
l'installation se juger à mesure qu'on la décrit, au lieu d'attendre un bouton
« analyser » qu'on oublierait d'appuyer.

Deux règles qui viennent du métier : **le calibre se juge sur l'usage** — un
20 A sur de l'éclairage laisse fondre le 1,5 mm² sans jamais se déclencher, et
c'est l'écart le plus fréquent des tableaux qu'on ouvre. Et **la réserve ne se
juge que si l'on connaît le contenant** : sans les rangées relevées, treize
modules occupés peuvent aussi bien remplir un tableau de treize que d'en occuper
le tiers ; annoncer un manque de place serait un faux constat.

Le dossier PDF gagne une feuille **« Installation existante »**, placée juste
après le métré — c'est l'ordre de la visite : voici le logement, voici ce qu'il
y a dedans aujourd'hui, voici ce qu'on propose. Chaque remède y est écrit pour
devenir une ligne de devis. Elle ne sort **que** si un tableau a été relevé, et
seulement au rez-de-chaussée : un tableau ne se relève qu'une fois, il n'a pas à
se répéter sur le dossier de chaque étage.

### Les étages

Une maison, c'est un rez-de-chaussée **et** un étage. L'application ne
connaissait qu'un plan à plat : relever une maison, c'était ouvrir deux
dossiers, sortir deux PDF, faire deux devis — et rien ne disait que c'était le
même logement. Le concurrent qu'on regarde gère les niveaux depuis toujours ;
sans eux on perd les maisons individuelles, qui sont le gros du marché.

**Le niveau est porté par ce qui existe déjà** — le mur et la pièce. Tout le
reste en HÉRITE : l'appareillage tient à un mur, le meuble à une pièce, la
photo à un mur. Aucun élément ne peut donc se retrouver à un étage où son
support n'est pas, ce qu'une liste de niveaux tenue à part aurait permis au
premier bug. Et **l'absence vaut rez-de-chaussée** : tous les anciens scans
s'ouvrent là où ils ont toujours été, sans migration ni réécriture.

Le geste du chantier : on relève le bas, on monte l'escalier, on relève le
haut — et c'est le même dossier. Le scan d'un étage repart **à neuf**, jamais
en additif : ce sont d'autres murs, et `StructureBuilder` chercherait à les
recoller à ceux du bas, donnant un seul plan monstrueux au lieu de deux
niveaux.

Trois décisions qui viennent du terrain :

- **l'étage arrive pré-calé** sur celui du dessous. ARKit repart de l'endroit
  où l'on a appuyé sur « Scanner » : après l'escalier, le relevé du haut tombe
  à vingt mètres de celui du bas. On aligne les emprises pour partir d'un
  empilement plausible, puis le **filigrane** du niveau inférieur — un simple
  trait d'axe, sous tout le reste — sert de repère pour poser l'étage
  d'aplomb, cage d'escalier contre cage d'escalier ;
- **les identifiants de pièce portent le niveau** (`room-1-3`). Détectés
  séparément, les deux étages produisaient chacun un « room-1 » : le meuble du
  salon se rattachait à la chambre du dessus et le métré comptait deux fois la
  même pièce ;
- **le filtrage se fait à la source**, dans l'écran, une seule fois — plutôt
  qu'à chacun des cinquante endroits qui lisent ces listes, où l'oubli serait
  certain. L'export suit l'étage affiché et **le nom du fichier le dit**, pour
  qu'on ne se retrouve pas avec deux « Chantier Dupont.pdf ».

Un scan qui échoue **désarme l'étage** : sans quoi le scan suivant — celui
d'un autre logement — atterrirait au premier étage d'un dossier qui n'a rien
demandé.

### Les photos de mur vivent dans la photothèque

Relevé du chantier : « fais en sorte que les photos soient stockées dans
l'appareil de la personne pour les murs et soient lues même s'il réinstalle
l'application, tant qu'il est sur son compte ».

Les Documents de l'application **ne survivent pas** à une désinstallation : la
photo d'un mur, prise sur un chantier, partait avec l'app sans que personne ne
l'ait effacée. La photothèque, elle, appartient à l'utilisateur — une image qui
y entre survit à la réinstallation, part dans sa sauvegarde iCloud, se retrouve
dans ses Photos et se partage sans passer par nous.

Chaque prise de vue range donc l'image dans un album **EchoPlan** et le scan
retient **deux** choses : le chemin du fichier de cache, qu'on relit vite pour
l'écran et le PDF, et l'`asset` — l'identifiant durable de l'image. Le fichier
local est écrit **avant** qu'on parle à la photothèque : accès refusé ou
rangement en échec, le relevé garde sa photo. On ne perd jamais une image pour
une question de permission.

La remise en cache se déclenche au bon moment : **quand l'affichage échoue**.
C'est l'échec de chargement qui prouve que le fichier a disparu — plutôt que de
tout relire à chaque ouverture d'un scan pour un cas qui n'arrive qu'après une
réinstallation. Une seule tentative par photo : si l'utilisateur a effacé
l'image de ses Photos, elle n'existe plus nulle part, et on ne boucle pas.

**Ce volet ne suffit pas à lui seul**, et il faut le dire : une réinstallation
efface aussi les scans eux-mêmes, qui vivent dans le stockage de l'app. Une
photo restaurée n'a alors plus de plan où se punaiser — d'où la seconde
moitié, ci-dessous.

### Les plans suivent le compte

Un relevé de logement entier pèse quelques dizaines de kilo-octets : des murs,
des ouvertures, de l'appareillage et les **identifiants** des photos. C'est du
texte, il monte sans rien coûter — et **les images ne montent jamais** : elles
restent dans la photothèque de l'électricien, le plan ne porte que leurs
renvois. Une réinstallation redevient alors un non-événement : on se connecte,
les plans redescendent, les photos se relisent depuis le téléphone.

Trois actions côté serveur, et rien de plus : `deposer`, `catalogue`,
`reprendre` (`server/api.php`). Le catalogue **ne descend pas les contenus** —
un téléphone qui se reconnecte n'a pas à télécharger vingt relevés pour en
ouvrir un. Et la reprise ne redescend **que ce qui manque** : un plan déjà
présent ici a pu être retouché depuis, et l'écraser ferait perdre le travail
de la matinée. En cas de doute, c'est le téléphone qui a raison — c'est lui
qui était sur le chantier.

**À faire une fois côté hébergement :** rejouer `server/migration-plans.sql`
dans phpMyAdmin, puis renvoyer `server/api.php` par FTP.

#### Les deux déclencheurs

Les deux gestes existaient et étaient testés (`deposerAuCompte`,
`reprendreDuCompte`) — mais **personne ne les appelait**. Un filet qu'on ne
lance jamais ne rattrape rien : le patron pouvait réinstaller l'application et
retrouver une bibliothèque vide alors qu'il avait un compte. Ils sont
maintenant branchés aux deux seuls moments qui ont du sens.

**La montée, à l'enregistrement.** Le dépôt s'accroche au geste par lequel un
relevé devient un dossier : `commitCurrent` (le bouton « Enregistrer »), la
fin de scan qui range le relevé toute seule, la duplication, et le renommage —
un « Chantier Dupont » renommé ici mais resté « Sans titre » au coffre serait
introuvable après une réinstallation. Le dépôt part **deux secondes après le
dernier geste**, coalescé par plan : enregistrer, renommer et dupliquer se
suivent souvent à la seconde près, et le même texte partirait trois fois — trois
fois le forfait de données, sur un chantier où le réseau est déjà mauvais.
Rien n'est attendu : le plan est déjà écrit dans le téléphone quand on arrive
là, et un serveur injoignable ne se voit **nulle part**.

**La descente, une fois, au lendemain d'une réinstallation.**
`repriseAuBesoin` redescend ce que le compte garde, puis pose un marqueur
(`roomscanner.reprise.v1`). Ce marqueur vit dans le stockage de l'application,
donc il **part avec elle** : une vraie réinstallation le perd et la reprise se
refait ; un lancement ordinaire le garde et ne redemande jamais rien. Sans lui,
chaque matin reposerait les plans supprimés la veille — le contraire d'un
service.

Deux gardes tiennent cette reprise, et elles disent la même chose : **ne rien
faire dans le doute**. Sans compte connecté, on ne marque rien — le patron
ouvre souvent l'app avant de se connecter, et une reprise déclarée faite alors
qu'elle n'a rien repris serait une bibliothèque perdue pour de bon. Et tant que
la bibliothèque du téléphone n'est pas **relue** (`savesCharges`), on attend :
comparer le coffre à un `saves` vide parce qu'on n'a pas encore lu ferait
redescendre en double des plans déjà là. `App.tsx` attend donc les deux
lectures — compte et bibliothèque — plutôt que de parier sur leur ordre, ce qui
couvre du même geste l'app rouverte avec un compte en poche et la connexion qui
suit une réinstallation.

Le banc `synchro.test.tsx` tient les deux moments et surtout ce que la synchro
n'a pas le droit de faire : bloquer un enregistrement, monter deux fois le même
plan, écraser une bibliothèque locale qu'on n'a pas fini de lire.

### L'app rend la place qu'elle prend

Une installation a fini par échouer : `AFC_E_NO_SPACE_LEFT`, **le téléphone
était plein**. Ce n'était pas l'app qui refusait de se poser, c'était le
disque — mais en cherchant ce que l'app accumule, on a trouvé un vrai défaut.

Chaque relevé écrit un **modèle 3D `.usdz` de plusieurs mégaoctets** dans les
Documents de l'app. Supprimer un scan effaçait ses photos — jamais son
modèle. Vingt chantiers, et rien ne revenait qu'en désinstallant.

Le ménage se fait maintenant à deux moments : **à la suppression d'un scan**,
et **à chaque ouverture de la bibliothèque**. Le second est le vrai gain : le
premier ne rend rien à qui ne supprime jamais de scan, et ce sont justement
les modèles entassés par les versions d'avant qui remplissaient le téléphone.

Deux décisions valent d'être dites :

- **on envoie la liste de ce qu'il faut GARDER**, jamais celle à effacer. Les
  orphelins des anciennes versions n'ont plus de chemin connu de personne —
  les nommer un par un serait impossible. Le natif balaie les Documents et ne
  touche qu'aux `scan-….usdz` de la racine : rien que l'app n'ait écrit
  elle-même n'est en jeu. Le modèle du plan affiché est gardé même si sa
  sauvegarde s'en va — on ne retire pas la 3D des mains de qui la regarde ;
- **l'app le DIT**. Le natif rend les octets libérés, et la bibliothèque
  annonce « 134 Mo rendus » une fois, avec une croix. Un ménage muet laisse
  l'électricien devant le même téléphone plein, sans savoir que quelque
  chose a servi.

### Une pièce se repose à ses cotes

On pose un « Séjour 5,00 × 4,00 » depuis le catalogue, on sort le mètre, et
la réalité donne 5,18 × 4,05. Le bandeau affichait ces deux nombres — juste
à côté d'une hauteur sous plafond, elle, éditable d'un appui. Les corriger
demandait de déplacer QUATRE murs à la main, un par un, en veillant à ne pas
ouvrir les coins. Pour dix-huit centimètres.

Les cotes portent maintenant le crayon, comme la hauteur et le nom : deux
saisies, largeur puis profondeur, et la pièce se repose. **Le coin
haut-gauche ne bouge pas** — la pièce s'étend vers la droite et vers le bas,
donc ce qu'on regarde ne saute pas et les pièces voisines restent en place.
L'appareillage suit son mur à sa cote ; ce qu'un rétrécissement mettrait
dehors revient au bord, plutôt que de flotter hors du plan tout en comptant
encore dans le contrôle des normes. Le tout s'annule d'un seul geste.

**Le crayon n'apparaît que sur un rectangle d'aplomb.** « Largeur ×
profondeur » ne décrit entièrement que cette forme-là ; sur un contour en L,
les deux mêmes nombres admettent une infinité de dessins, et on n'en choisit
pas un à la place de l'électricien. Les autres pièces gardent leurs murs, à
déplacer un à un — c'est le prix d'une forme libre, et un bouton qui ne peut
pas aboutir est pire qu'un bouton absent.

### « La porte à quatre-vingt-dix du mur »

Le bandeau d'une ouverture donnait sa largeur, sa hauteur, son coffre de
volet et sa fermeture — jamais sa POSITION. Et `resizeOpening` travaille
autour du milieu : élargir une porte l'ouvre symétriquement, elle ne se
décale pas. Une porte posée à trente centimètres du bon endroit ne pouvait
donc que se supprimer et se reposer, en reperdant sa hauteur, son type et
son coffre.

« Position » demande la cote **du tableau, pas de l'axe** : personne ne
mesure jusqu'au milieu d'une porte, on pose le mètre contre le refend et on
lit jusqu'au bord de la menuiserie. La conversion se fait une fois, dans le
magasin.

Poussée au-delà du mur, l'ouverture s'arrête au coin plutôt que de sortir :
une menuiserie qui dépasse n'est plus une ouverture mais un trou dans le
vide — la 3D la découpe hors maçonnerie et le métré compte une pose
impossible. Le chiffre qu'on relit après coup dit alors la vérité, ce qu'un
refus muet ne ferait pas.

### Les gaines ont leur feuille

Releve du patron, plan exporte a l'appui : « sur un plan 2D rendu en export
pour une simple piece aux normes, on y voit plein de traits
incomprehensibles ; il faut faire un systeme intelligent ou rien ne se croise
et tout doit etre comprehensible. Gaines sur plan a part "Plan de gaines"
avec les diametres recommandes pour chaque tirage. Tout doit etre
professionnel ».

Le plan d'ensemble portait TOUT : maconnerie, appareillage, cotes de pose,
liens de commande ET cheminement des gaines. Sur une piece de douze metres
carres, cela fait six familles de traits qui se croisent — personne ne suit
un depart a l'oeil la-dedans, et le document perd sa raison d'etre.

Le cheminement part donc sur sa propre feuille, avec le tableau qui va avec :
un tirage par ligne, sa section, son NOMBRE DE FILS, et le diametre de
conduit qui en decoule. C'est ce qu'on emporte chez le grossiste. Les cotes
de pose s'y taisent — elles croisent les traces qu'on est venu suivre, et
elles se lisent sur le plan d'ensemble, qui existe pour ca.

Deux choses vues a l'oeil sur la feuille rendue en image, et corrigees :
le tableau, d'abord pose sous le dessin, se faisait couper par le cartouche
des qu'il passait deux lignes — la place libre d'une feuille de plan est EN
HAUT, le dessin etant centre dans sa boite. Et il ne descend jamais sur le
plan : mieux vaut un tableau tronque qu'un tableau ecrit en travers du
dessin.

### Le schema multifilaire disait trois fils a l'eclairage

Releve du patron : « le schema multifilaire dit n'importe quoi, interrupteur
et point lumineux il dit juste 3 fils a l'eclairage ».

Il a raison, et la cause est une FRONTIERE INTERNE de l'application : les
points lumineux de plafond — DCL, spots, VMC — ne vivent pas dans la liste de
l'appareillage MURAL, ils ont la leur, parce qu'ils se posent dans une piece
et non sur une face de mur. Le calcul des conducteurs ne regardait que les
murs, n'y trouvait aucune lampe, et concluait qu'il n'y avait rien a
commander : phase, neutre, terre, et rien d'autre.

Or le cablage d'un simple allumage est connu de tout electricien : du tableau
au point, phase, neutre et terre ; du point a l'interrupteur, la phase qui
part et le RETOUR DE LAMPE qui revient. Le retour est precisement le
conducteur qui distingue un circuit d'eclairage d'une simple alimentation —
l'oublier, c'est sous-compter le fil au metre et decrire un cablage qui
n'existe pas sur un document technique.

### Le diametre d'une gaine se calcule sur le nombre de fils

Suite du meme releve : « les diametres recommandes pour chaque tirage selon
nombre de fils aux normes ». L'application choisissait sur la SEULE section :
1,5 mm² donnait ICTA 16, quel que soit le compte. C'est vrai pour trois fils,
et faux des le quatrieme — un va-et-vient en tire six, et six ne passent pas
dans du 16.

La regle de la norme est celle du TIERS : la somme des sections exterieures
des conducteurs ne depasse pas le tiers de la section interieure du conduit.
C'est ce qui rend le tirage possible a la main — au-dela, le faisceau coince
dans les coudes et l'on tire au treuil ce qui devrait glisser.

Deux pieges valaient d'etre ecrits noir sur blanc : c'est l'ISOLANT qui
occupe le conduit, pas le cuivre (un 1,5 mm² mesure trois millimetres hors
tout) ; et le nombre qui NOMME une gaine est son diametre EXTERIEUR — un ICTA
16 ne laisse passer que dix millimetres et demi. Confondre les deux fait
croire qu'on tire six fils la ou trois passent a peine.

Le compte de fils s'imprime a cote du conduit : celui qui tire doit pouvoir
verifier avant de commander la couronne.

### La surface se voyait a travers les murs

Releve du patron, capture 3D a l'appui : « la surface ne doit pas se voir a
travers les murs du modele 3D ». Sur l'image, les points du sol apparaissent
DANS la bande du mur avant.

Ce n'est pas un defaut de tri — le semis est peint en premier, tout au fond.
C'est que le mur de devant est estompe (l'ecorche, qui existe pour qu'on voie
DANS la piece sans la retourner) et qu'un mur a quinze pour cent d'opacite
laisse voir ce qui est dessous.

Le remede est donc GEOMETRIQUE, pas dans l'ordre de peinture : le contour
d'une piece suit l'AXE de ses murs, et le semis s'etendait sous la moitie de
leur epaisseur. Arrete au nu interieur, il n'y a plus rien a voir au travers
— et le dessin gagne un lisere net le long des murs, comme sur un plan
d'architecte. Verifie en image, avant et apres : la premiere rangee de points
tombait dans l'epaisseur du mur, elle s'arrete maintenant devant.

Sans mur connu, on ne retranche rien : mieux vaut un semis entier qu'un semis
rogne au hasard.

### On tire la piece, on ne la subit plus

Releve du patron : « a la selection d'une piece a ajouter, elle se place
automatiquement et impossible de creer des murs pour faire la piece
facilement. Il faut repenser un systeme complet facile pour l'utilisateur ».

L'application posait la piece TOUTE SEULE : elle cherchait le mur exterieur
le plus long, s'accolait dessus, et prenait SA longueur. Le resultat est une
piece qu'on n'a pas choisie, a un endroit qu'on n'a pas vise, aux cotes qu'on
n'a pas demandees — une « chambre 3 x 3 » sortant en 5 x 3 parce que le mur
d'appui faisait cinq metres. Le catalogue de gabarits n'y changeait rien : il
donnait le choix des cotes, pas celui du resultat.

**Le geste retenu** (choix du patron entre trois propositions) : on pose un
doigt, on glisse, on lache. Les cotes s'ecrivent en direct le long du
rectangle qu'on tire — sans elles, on tire a l'aveugle et l'on corrige apres
coup, ce que le geste doit justement eviter.

Deux coins suffisent a decrire un rectangle, et un rectangle decrit presque
toutes les pieces d'un logement. Pour un L, on en tire deux et on les
fusionne : l'application sait deja le faire.

**La cloison reste partagee** (choix du patron) : un cote qui tombe sur un
mur existant ne le double pas, il le REPREND — une seule maconnerie entre
deux pieces, cotee une fois, equipee des deux cotes. Sans quoi le metre
compte double et « fusionner » n'a plus rien a reunir. On ne cherche pas une
egalite parfaite pour le reconnaitre : le doigt ne tombe jamais au
millimetre, alors un mur confondu a douze centimetres pres est le meme mur.

Un appui sans glissement ne cree rien : ce n'est pas une piece, c'est un
doigt pose.

**Le plan cede le geste pendant qu'on trace.** Le trace exige un GLISSEMENT,
et le plan prend la main des six pixels de mouvement : sans exception, on
promenerait le plan en croyant tirer un rectangle, et le geste neuf ne
marcherait tout simplement pas. Trouve avant l'essai, en relisant qui reclame
le doigt — le calque de pose d'un appareil de plafond, lui, se contente d'un
tap et ne rencontrait donc jamais ce conflit.

Et l'exception passe par une REFERENCE, pas par la valeur : le `PanResponder`
du plan est cree une seule fois, et ce qu'on lit dans sa fermeture y reste
fige a ce qu'il valait au premier rendu. Le mode trace y serait
eternellement « non » — un defaut invisible a la lecture, evident au doigt.

**Et les deux coins se collent aux murs qui sont la.** Sans aide, tomber sur
un mur existant releve de la chance : la reprise se joue a douze centimetres,
deux pixels sur un plan dezoome. L'aimant a donc la MEME portee que la
reprise — sinon il collerait la ou le magasin ne reconnait plus rien, et l'on
doublerait le mur juste a cote de l'ancien, ce qui est pire que pas d'aimant
du tout. Chaque axe s'aimante separement : l'abscisse sur les murs verticaux,
l'ordonnee sur les horizontaux. C'est ainsi qu'un logement se construit — les
pieces s'alignent sur ce qui existe, elles ne flottent pas a cote.

### Le bandeau du mur, troisieme forme — et les deux premieres disent pourquoi

Releve du patron, capture a l'appui : « la barre en bas mal faite pour
selection de mur ». Sur la photo : « 3,98 m . 2,49 m s... » puis un bouton
« Me. ». La cote se lit, le reste est hache.

**Premiere tentative** — faire ceder les boutons (`flexShrink`) : le mot se
tronque au lieu de pousser la rangee dehors. Le debordement part, la
lisibilite aussi : « M », « D. ».

**Deuxieme** — les actions secondaires en icones seules. Mieux, mais le geste
principal gardait son mot et sortait encore.

**Troisieme, celle-ci** : le bandeau porte ce qu'il AFFICHE, et il l'affiche
comme les autres. Les deux cotes du mur tiennent ensemble dans la ligne forte
— « 3,98 x 2,49 m », exactement comme une menuiserie affiche « 1,20 x 1,10 m »
— et la note dit ce que c'est, en un mot. Les trois actions deviennent des
pastilles : aucun mot, donc rien a tronquer.

Ce qui se perd : le mot « Mesures » sous le crayon. Ce qui se gagne : la
hauteur sous plafond, qui etait coupee et se lit maintenant en entier. Le
MENU du mur, lui, garde ses mots — il s'ouvre sur le plan et a toute la place
pour les ecrire.

### Le doigt commande, le mur refuse

Relevé du patron : « on doit pouvoir les placer n'importe où, même traverser
les murs, mais impossible à placer SUR un mur (meuble rouge au placement si
impossible), et une légère attraction contre les murs (sans les toucher), et
pas de bouton valider ».

**C'était l'inverse.** Le meuble était contraint à chaque image : rabattu hors
des murs, retourné pour entrer dans une niche, raboté pour tenir dans un
recoin. Trois aides, chacune défendable seule ; ensemble, un meuble qui
glisse tout seul sous le doigt sans qu'on comprenne pourquoi.

La règle du patron est plus simple et plus juste. Le meuble suit exactement
le doigt, **murs compris** — on traverse une cloison pour aller dans la pièce
d'à côté, c'est le geste de qui déménage une commode. Ce qui est refusé, c'est
de **lâcher** dans la maçonnerie : tant que le doigt y est, le meuble se
signale en rouge ; au lâcher, il revient à la dernière position qui tenait.
Sans ce retour, le refus ne serait qu'une couleur.

**L'aimant amène au nu, jamais au-delà.** Une commode lâchée à vingt
centimètres d'un mur n'a pas été posée là exprès — personne ne laisse
volontairement ce jeu derrière un meuble. Portée : vingt-cinq centimètres. Au
large, on ne touche à rien : un îlot de cuisine est au milieu de la pièce
parce que quelqu'un l'y a mis.

**Et le bouton « Valider » est parti.** Il n'adoptait qu'un meuble déjà posé :
ses cotes partaient au magasin dès qu'on les tapait, sa position dès qu'on
lâchait le doigt. Il ne restait qu'un rituel — une coche pour dire oui à ce
qui était déjà fait — et un doute : tant qu'on ne l'avait pas touchée, on ne
savait pas si le meuble comptait. La croix rouge reste, elle : c'est le geste
qui RETIRE, et lui change quelque chose.

Les flèches du bandeau, elles, gardent les anciennes aides : au centimètre
près, on ne vise pas au doigt, et le meuble a le droit de se ranger tout seul.

### Attraper un meuble ne doit pas demander de viser

Relevé du patron : « le clic sur un meuble est capricieux, il faut parfois
cliquer plusieurs fois et viser des endroits précis du meuble ».

La cible tactile était le **dessin lui-même** — l'aplat du meuble et les
traits de son symbole. Un aplat de quarante-cinq centimètres au cinquantième
fait neuf millimètres à l'écran, moins que la pulpe d'un doigt ; et les
traits du symbole, eux, ne répondent que sur le trait. Une chaise dézoomée
passait largement sous les quarante-quatre points qu'Apple donne pour cible
minimale.

Chaque meuble porte maintenant une cible **invisible et plus large** — huit
points de chaque côté, ce qui fait passer la chaise de neuf à vingt-cinq
millimètres. Elle est posée **en dernier**, donc au-dessus de tout ce que le
meuble dessine : plus rien ne peut lui voler l'appui. Et elle porte son nom,
ce qui la rend trouvable au lecteur d'écran comme au banc d'essai.

Huit points et pas plus : au-delà, elle mordrait sur le meuble d'à côté — un
salon meublé en compte une dizaine à quelques centimètres les uns des autres.

### Deux croix pour fermer une seule fenêtre

Relevé du patron : « la croix pour quitter la fenêtre de contact du service
client ». Il y en avait **deux, l'une sur l'autre** en haut à droite — celle
que la coquille des feuilles pose pour toutes, et une seconde écrite dans le
formulaire du support avant que la coquille n'en ait une.

Deux croix superposées, c'est une cible tactile qui se partage en deux et un
lecteur d'écran qui annonce « Fermer, Fermer ». Rien ne casse, et tout le
monde voit que quelque chose ne va pas.

C'est la coquille qui garde la sienne : elle vaut pour toutes les feuilles,
elle est posée en absolu — elle ne pousse aucune mise en page — et une
feuille qui refabrique la sienne est une occasion de diverger. Le titre garde
en revanche sa place réservée à droite : sans elle, un titre long passerait
sous la croix.

### Le mur qui passait sur une chaise : le banc mesurait à côté

Relevé du patron, capture à l'appui. Première mesure : **vingt-deux angles de
vue sur trente-six** montraient un mur peint par-dessus une chaise. Deux
remèdes ont été construits sur ce chiffre, et les deux cassaient ailleurs —
le meuble d'angle se déchirait, ou quatre épreuves du tri au pixel tombaient
avec. La refonte du moteur de rendu était prête à être lancée.

**Le banc mesurait la mauvaise chose.** Il comptait comme faute tout mur
peint après la chaise et couvrant son centre. Or vu sous certains angles, le
mur nord est RÉELLEMENT entre l'œil et une chaise posée devant lui : il doit
la cacher. Mesuré au point de conflit, le mur y était à +0,36 de profondeur
et la chaise à −0,61. Il était devant, tout simplement. Sur vingt-deux
« fautes », vingt-deux étaient des masquages légitimes.

Ce qui est une faute, c'est un mur peint après la chaise alors qu'au point de
recouvrement il est **plus loin de l'œil** qu'elle. Compté ainsi : **zéro**
sous les trente-six angles. Le tri du peintre ne se trompe pas.

**La limite connue**, elle, est chiffrée : `clampFootprint` sort de la
maçonnerie tout meuble qui y mord et le pose à sept centimètres du nu ; à
cette distance il reste **un** angle sur trente-six où le pan passe devant.
Ce n'est plus le classement qui est en cause mais la finesse du contact —
sept centimètres à l'échelle du logement, c'est moins que l'épaisseur d'un
trait. Le remède serait un tampon de profondeur par pixel, c'est-à-dire un
autre moteur.

Deux leçons, et la seconde vaut la première : on ne refond pas un moteur de
rendu sur un compteur qu'on n'a pas vérifié ; et un banc qui mesure à côté
donne une régression à chaque tentative de correction, en faisant croire que
le problème est ailleurs.

### « Mon mur blanc devient marron »

Deux relevés du patron sur la même capture : des couleurs fausses, et des
**lignes horizontales** sur les murs colorés. Les deux ont la même origine,
et ce n'est pas le relevé qui est en cause — il est fidèle. **Une caméra ne
voit pas une couleur, elle voit une couleur ÉCLAIRÉE.**

**Les lignes.** Le haut d'un mur reçoit moins de lumière que le bas, ou
l'inverse selon la fenêtre : la grille relevée sort en dégradé vertical. Or
le lissage anti-bruit ne supprime un écart que s'il est *isolé* — un écart
« partagé » par les cases voisines est jugé réel et **protégé**. Un dégradé
d'éclairage est justement partagé : le mécanisme qui devait nettoyer
préservait les bandes.

On distingue donc l'éclairage de la peinture par la **forme** de l'écart :
l'éclairage est progressif (chaque rangée un peu plus sombre que la
précédente, par pas comparables), la peinture est franche (un soubassement,
un lambris : UN saut net entre deux rangées, et rien avant ni après). Le
premier s'aplatit, le second reste. Ce qui varie horizontalement n'est jamais
touché — un pan d'accent, une porte, une trace d'humidité vivent dans les
colonnes.

**Les couleurs.** Un mur blanc sous une ampoule chaude renvoie du beige.
La surface la plus claire d'un logement est blanche — c'est vrai du plafond
et des murs dans l'immense majorité des cas, et c'est l'hypothèse que fait
tout appareil photo du monde. Si la plus claire tire vers l'orange, ce n'est
pas la peinture, c'est l'ampoule : on annule sa dérive.

**Trois garde-fous**, et chacun dit un cas réel : une surface sombre ne dit
rien du blanc (sous 110, on ne conclut pas) ; un écart de plus d'un quart
entre canaux n'est plus une dérive mais une couleur, et elle reste (un mur
bleu franc n'est pas un mur blanc mal éclairé) ; un écart minuscule ne vaut
pas qu'on remue tout le relevé.

**Un seul gain pour toute la scène.** Murs, sol et meubles ont été vus sous
la même ampoule : corriger chaque surface pour elle-même reviendrait à
blanchir tout le logement, meubles compris — un canapé rouge deviendrait
rose. Le gain se calcule sur les MURS seuls, parce que c'est d'eux qu'on sait
quelque chose (le blanc du bâtiment) ; un meuble clair peut être crème, beige
ou chêne sans que ce soit un défaut.

**Corrigé à l'arrivée du scan, pas au rendu** : la 3D, le plan 2D, le dossier
et l'export lisent les mêmes champs. Une fois d'aplomb, tout le monde voit la
même chose, et personne n'a à se souvenir d'appliquer un gain.

Vérifié en image, trois états côte à côte : relevé brut (quatre bandes, teinte
beige), éclairage aplati (plus de bande), blancs rebalancés (gris neutre).

### On pose à la cote du métier, pas à la hauteur du doigt

Relevé du patron : « lors d'un scan, j'aimerais qu'on pose de manière logique
les éléments et non EXACTEMENT là où on cible. Si l'utilisateur vise le bas
d'un mur, on place la prise directement à 25 cm ; si l'utilisateur vise le
milieu du mur, 110 cm (prise crédence par exemple). Pareil pour les lumières,
1 m 90. »

C'est la différence entre un relevé et un **plan d'exécution**. Personne ne
pose une prise à 23,7 cm : on pose à 25, et c'est ce qui se percera. Un
viseur tenu à bout de bras donne le centimètre près — autant dire un chiffre
faux, qu'il faudrait corriger un par un à la table.

**La cote visée choisit le palier, elle ne le remplace pas.** Viser le bas
d'un mur veut dire « plinthe » ; viser à mi-hauteur veut dire « au-dessus du
plan de travail ». C'est l'intention qu'on lit dans le geste. Les appareils à
cote unique — interrupteur à 1,10 m, applique à 1,90 m, tableau à 1,35 m — y
vont toujours : leur fiche porte déjà cette cote, la même que le catalogue et
le dossier imprimé.

**Et l'on ne devine que ce qui se devine.** Une prise visée à deux mètres
n'est ni une plinthe ni une crédence : c'est une attente de téléviseur, ou
une erreur de visée. Au-delà de quarante-cinq centimètres du palier le plus
proche, la cote relevée est conservée — mieux vaut un chiffre relevé qu'un
chiffre inventé.

### Un point de plafond se pose au centre

Suite du même relevé : « si on vise le plafond pour mettre un point lumineux,
on le centre à la largeur déjà calculée par le scan, et si c'est la même
pièce, l'ajout d'un point s'axe automatiquement au premier ».

Viser le plafond était déjà possible ; ce qui manquait, c'est le placement.
Un point de centre est **au centre** : personne ne pose un DCL à quarante
centimètres de l'axe parce que le téléphone tremblait. Le scan connaît le
contour, il sait où est le centre.

Deux points font une ligne, pas un nuage : le second se pose sur l'axe du
premier — même abscisse s'il est au-dessus, même ordonnée s'il est à côté. On
ne le **déplace pas le long** de cet axe : sa distance au premier est ce que
l'électricien a voulu, c'est son alignement qui tremblait. Au-delà de trente
centimètres dans les deux sens, ce n'est plus un tremblement mais un
placement voulu — en quinconce, ou dans un angle — et on n'y touche pas.

### Le message qui dit ce qui a été posé

« Un message doit apparaître sans gêner : "Prise plinthe placée à 25 cm" ».
Sans lui, l'électricien croit avoir raté sa visée.

Il fallait pour cela que **le natif rende la cote relevée** : elle n'existe
qu'au moment du raycast, et personne ne la connaît avant la finalisation du
scan. `poserAuViseur` rend donc un dictionnaire en cas de succès et `false`
en cas d'échec — les appelants qui ne veulent que le oui/non n'ont rien à
changer, un dictionnaire étant vrai là où `false` ne l'est pas.

Le message se pose dans le bandeau qui existait déjà, celui du compte, et
s'efface au bout de trois secondes : un message qui reste devient un bandeau
de plus, et c'est précisément ce qu'on demandait d'éviter. Au plafond, il
annonce ce qui va se passer — « il sera centré dans la pièce » — plutôt
qu'une cote qu'on n'a pas encore : promettre un chiffre faux serait pire que
se taire.

**L'effacement n'est pas couvert par un banc.** Deux façons de le vérifier
ont été essayées, attendre puis simuler les minuteurs, et les deux bloquent
le fichier — il monte une vue native, dont le cycle ne se laisse pas piloter.
Une suite qui ne finit pas coûte plus cher qu'une règle vérifiée à la
lecture.

### Trois relevés du chantier, en une fois

**Les noms des boutons coupés.** Capture à l'appui : sur le bandeau d'un mur
sélectionné, les libellés se tronquaient à une lettre — « M », « D. ». Sur un
iPhone, la cote, la hauteur sous plafond et trois mots pleins ne tiennent pas
dans la rangée une fois la colonne d'ancrage déduite. Un mot réduit à sa
première lettre ne dit rien ; une icône, si — c'est le remède déjà retenu
pour le bandeau des spots, sur le même relevé : « des icônes, pas des mots ».
Le geste principal garde son mot (un crayon seul ne dit pas ce qu'il édite),
les deux autres passent en silhouettes, leur mot vivant dans l'étiquette
d'accessibilité.

**La pastille des normes restait grise.** Elle attendait le premier appareil
posé, et c'est une bonne règle pour ce qui se compte en appareils : on ne
reproche pas cinq socles manquants à quelqu'un qui vient d'ouvrir
l'application. Mais elle taisait aussi les défauts de RELEVÉ — sept baies
cadrées sous leur tablier de volet, avec le geste tout prêt : « Remonter le
linteau ». Un défaut de relevé n'est pas un reproche prématuré : il est vrai
avant la pose, et il se corrige d'un appui. La pastille s'allume désormais
dès qu'un constat ne dépend pas de la pose.

**Le repère du geste se reprenait dans une vue périmée.** `snapshot` repartait
de la vue posée dans l'état — celle qui ne se met à jour qu'au lâcher. Or ce
repère se reprend aussi EN COURS DE GESTE, chaque fois que le nombre de
doigts change : deux doigts ne se lèvent jamais à la même image, et il y a
toujours un instant où il n'en reste qu'un. À cet instant, le zoom accumulé
sous les doigts était remplacé par la vue d'avant le geste. Il repart
maintenant de `vueVive`, la vérité pendant le geste.

**Ce dernier point n'est pas couvert par un banc**, et c'est dit ici pour que
personne ne s'y trompe. La simulation écrite pour le reproduire passait
AVANT comme APRÈS la correction : elle n'empruntait pas le chemin fautif, et
un banc qui ne distingue pas les deux versions ne prouve rien. Il a été
retiré plutôt que laissé comme faux témoin. La correction tient au
raisonnement — reprendre un repère dans un état périmé est faux en soi — et
la mesure image par image de la vidéo (30 im/s) n'a montré aucun pic isolé
après l'arrêt du doigt, ce qui ne l'exclut pas à 60 Hz.

### Ce que le rendu en image ne dit pas

Piège payé une fois, noté dans l'outil. Sur la page de conformité, la norme
se lisait « NFC15-100 » — mal écrite, et un électricien le voit
immédiatement. Le flux du PDF, lui, porte « NF C 15-100 » depuis toujours :
c'est `pdf-vers-svg.mjs` qui resserre les espaces en composant le texte.

On a failli corriger une faute qui n'existait pas. Donc : **ce rendu vaut
pour les positions, les tailles et les chevauchements** — c'est pour ça qu'il
existe, et il a trouvé un plan trop petit, des pastilles perçant un mur, une
note en travers d'un cartouche et un battant qui faisait le tour de la
pièce. Pour un libellé, on retourne au flux : `grep -a` dans le PDF dit la
vérité.

### L'application imprimait son propre échec

Relevé à l'œil sur la liste du matériel — le document qui part au
fournisseur, jamais inspecté jusqu'ici. Chaque pièce portait « **Autre
pièce** · 12,0 m² » à droite de son nom.

La règle existait pourtant : « l'usage déduit ne se rappelle que s'il apprend
quelque chose », pour éviter d'écrire « Cuisine … Cuisine · 20,0 m² ». Mais
elle ne couvrait qu'un cas — celui où l'usage RÉPÈTE le nom.

« Autre pièce » est le fourre-tout : le mot que l'application emploie quand
elle n'a pas su. L'imprimer, c'est écrire son propre échec à côté du nom du
client, sur le document qu'il lit avant les chiffres. Il se tait désormais,
comme se tait « Cuisine » sur une pièce appelée Cuisine — et la surface
reste, c'est elle qu'on vient lire.

### « 1 pts »

Relevé à l'œil sur la page du métré rendue en image. Un point lumineux, un
« s ». Ce n'est pas une coquille de code : c'est une faute sur un document
**remis au client**, à côté de son nom et de l'adresse du chantier — et il la
lit avant de lire les chiffres.

L'abréviation n'aidait pas non plus : « pts » se lit « points PostScript »
par tout le monde sauf un dessinateur. Le mot entier tient dans la colonne,
il ne se lit que d'une façon, et il s'accorde.

### L'élévation annonçait une échelle qu'elle ne tenait pas

Le plan d'ensemble a cessé depuis longtemps de se mettre à la feuille pour en
DÉDUIRE son échelle. L'élévation, elle, continuait : elle divisait la place
par la longueur du mur, puis arrondissait le résultat au cartouche. Elle
écrivait « 1:25 », **sans tilde**, pour un tracé à 1:25,4.

Et c'est la feuille où ça compte le plus. Le plan d'ensemble se lit sur une
table ; l'élévation se tient **devant le mur, la perceuse dans l'autre
main**, et c'est sur elle qu'on reporte une cote au kutch pour retrouver
l'axe d'une boîte. Un pour cent et demi sur deux mètres cinquante, ce sont
quatre centimètres — la moitié d'un entraxe.

Elle choisit maintenant, comme le plan, la plus grande échelle normalisée qui
tienne, et trace à celle-là exactement. Sa marge latérale est passée de
cinquante-deux points à quarante pour la même raison que celle du plan : un
mur courant de 3,86 m demande 438 points au vingt-cinquième et n'en avait que
431 — sept points, et le mur sortait deux fois plus petit. Le cran est
conservé, et il est vrai.

### Deux points de marge coûtaient un tiers du plan

Relevé du patron, dossier rendu en image à l'appui : « je trouve le plan trop
petit et illisible, trop de marge blanche non utilisée ». La mesure lui donne
raison et dit exactement où.

Un T3 de sept mètres demande **397 points** de large à l'échelle 1:50 ; la
boîte du dessin en offrait **395**. Il manquait deux points — sept dixièmes
de millimètre — et le cran était refusé : on retombait à 1:75, c'est-à-dire
un plan une fois et demie plus petit, au milieu de cinq centimètres de blanc.

**L'échelle normalisée n'y est pour rien et n'a pas bougé** : un architecte
pose son kutch sur le papier, et à 1:98,3 toutes ses cotes sont fausses.
C'était la marge — soixante-dix points de chaque côté, deux centimètres et
demi — là où les chaînes de cotes et leurs repères en demandent la moitié.
Cinquante suffisent, et un cran d'échelle se gagne. L'effet de seuil est
brutal : quelques points de marge en trop se voient à l'œil sur la feuille.

### Plus de pastille blanche sous les symboles

Relevé du patron sur la même image : « enlève le bloc blanc derrière les
icônes des éléments électriques ». Le disque protégeait le symbole des
hachures du mur — et il perçait le mur : une rangée de prises mangeait la
maçonnerie qu'on est venu lire. Le symbole se pose au nu du mur, du côté de
la pièce, où le fond est clair de toute façon. Son empan sert encore à poser
ce qui l'entoure : le sigle à sa droite, le repère de circuit dessous.

### Une note en travers de la surface

Trouvé à l'œil sur le même dossier : une note posée au milieu d'une pièce —
« colonne montante ici » — tombait exactement sur le cartouche « 12,0 m² ·
surface au sol ». Les deux réservent leur fond blanc, et le lecteur perdait
les DEUX informations d'un coup. Sur l'écran on déplace la note d'un appui ;
sur le papier, non.

**La punaise ne bouge pas, le mot si** : le point visé porte le sens — « gaine
à reprendre » ne veut rien dire trois mètres plus loin — mais l'étiquette
peut monter ou descendre sans rien perdre, et un filet la relie à sa punaise
quand elle s'est écartée. Une note posée réserve sa place à son tour, sinon
deux notes voisines se couvrent l'une l'autre.

### L'architecte recevait des trous dans des murs

Huitième parcours : le même plan par ses trois portes de sortie — le PDF au
client et au poseur, le DXF à l'architecte qui va le reposer dans son
logiciel, le CSV au fournisseur qui chiffre. Il a montré que **le DXF réduit
toute ouverture à un segment** : porte, fenêtre et baie libre, le même trait
sur le même calque.

Celui qui reçoit le fichier rouvrait donc le plan, ne voyait que des trous
dans des murs, et redessinait à la main les battants qu'on lui avait déjà
donnés sur le PDF. Deux dessins du même logement qui ne disent pas la même
chose — et c'est celui qu'on croit à jour qui se trompe. Le sens d'ouverture
est justement ce que l'électricien vient de régler : c'est lui qui décide de
la place de l'interrupteur.

Maintenant : **un calque par nature** — portes, fenêtres, passages libres —
parce que c'est ainsi qu'un architecte travaille, il éteint ce qui ne le
concerne pas. Et les portes partent avec leur dormant, leur vantail et leur
arc. Une baie libre reste un simple segment : elle n'a pas de vantail, et
lui en dessiner un serait inventer une menuiserie que personne n'a relevée.

### Un battant qui faisait le tour de la pièce

Et c'est en **regardant le DXF rendu en image** — pas en relisant le flux —
qu'un second défaut est apparu : sur la porte ouvrant vers l'extérieur,
l'arc partait dans le mauvais sens et décrivait presque un tour complet. Il
traversait le mur, ressortait de l'autre côté, et enfermait la pièce dans
une boucle.

La cause tient à une soustraction d'angles. Le dormant est à un cap, le
vantail ouvert à un autre, et l'on interpolait de l'un à l'autre en ligne
droite : quand les deux caps tombent de part et d'autre de la coupure à ±π,
l'écart calculé vaut trois cents degrés au lieu de soixante, et le tracé
prend le chemin long. Une porte ne s'ouvre pas au-delà du demi-tour :
l'écart se ramène désormais dans l'intervalle qui a un sens physique.

**Le calcul vivait recopié** dans le dossier imprimé et dans l'export CAO —
donc le PDF portait le même défaut, latent, en attente de la bonne
orientation. Il vit maintenant dans `arcDuBattant`, une fois, et les deux le
prennent. C'est exactement le genre de chose qu'aucune relecture du flux ne
montre, et c'est pour cela que les documents de ce projet se vérifient en
image.

### La vie d'un abonné, d'un bout à l'autre

Septième parcours : celui du domaine où une erreur coûte un client ou de
l'argent. Chaque règle avait déjà son banc ; celui-ci suit l'enchaînement,
parce que c'est lui qui décide de ce que l'abonné voit — il essaie, se
heurte au verrou, paie, et son téléphone tombe à l'eau.

**La dernière étape est celle qui fâche.** Un client qui a payé et qui doit
repayer ne revient pas. Sur un téléphone neuf, le bouton « Restaurer
l'achat » existe et personne ne le cherche : on rouvre l'app, on la voit
verrouillée, et l'on conclut qu'on a payé pour rien. Or l'App Store sait
déjà que l'abonnement est détenu — il suffit de lui demander, et c'est ce
que fait `rafraichirEcheance` : une échéance trouvée rend le Pro sans qu'on
touche à rien. C'est la seule chance qu'a l'application de ne pas perdre
quelqu'un qui a payé, et le parcours la garde désormais.

Rien de cassé sur ce chemin — le verrou tombe avant le travail et non après,
l'essai consommé suit le client et non l'appareil, le code du patron
déverrouille sans s'user, et l'échéance dit aussi **si l'abonnement se
reconduit** : « expire le 12 » et « se renouvelle le 12 » ne veulent pas dire
la même chose au moment de résilier.

### Le filet qui retenait la moitié de ce qui tombe

Trois parcours de plus — la bibliothèque, la rénovation, le relevé scanné —
et un défaut là où il coûte le plus cher : le brouillon des trente secondes.

Il **sauvait** les notes et le tableau existant ; `reprendreBrouillon`, lui,
les laissait sur le disque. On reprenait un relevé retrouvé après une
batterie à plat, on voyait revenir les murs, les meubles et l'appareillage —
et le relevé des départs manquait. Ce quart d'heure debout dans un couloir
devant une porte ouverte, c'est-à-dire précisément ce qui justifie le devis
de remise aux normes. Un filet qui retient la moitié de ce qui tombe est un
filet qui **ment** : on croit avoir tout retrouvé, et l'on repart amputé.

Les deux autres parcours n'ont rien trouvé, ce qui est un résultat en soi.
La **bibliothèque** tient : ranger, copier, renommer, et le ménage du
vendredi soir — supprimer un dossier rend ses plans à la racine plutôt que
de les emporter. La **rénovation** tient de bout en bout : ce qui est noté
devant le tableau arrive au diagnostic, le diagnostic au dossier, et le tout
survit à la réouverture.

Deux fausses pistes, notées ici parce qu'elles disent quelque chose du
projet. « Compléter le relevé » semblait perdre le premier passage : non —
`StructureBuilder` livre le logement **entier** recalé, pas seulement la
pièce neuve, et c'est le banc qui ne lui donnait que la moitié. Et la minute
à risque n'est pas après le scan (un relevé terminé s'auto-enregistre) mais
**avant le premier « Enregistrer » d'un plan dessiné**. Ce qui compte,
vérifié : une prise posée entre deux passages survit à la réunion, reprojetée
sur le nouveau jeu de murs.

### Une pièce du premier empruntait un mur au rez

Troisième parcours complet — un pavillon à deux niveaux, du plan vierge à la
réouverture — et il a trouvé le défaut le plus profond de la série.

`addRoomBox` accole toujours la nouvelle pièce à un mur existant : c'est ce
qui donne une cloison mitoyenne exacte plutôt que deux logements flottant
côte à côte. Mais il choisissait « le mur extérieur le plus long » parmi
**tous** les murs du plan, étages confondus. Une chambre posée depuis le
premier sortait donc avec trois murs à elle et un quatrième emprunté au
rez-de-chaussée.

Ce que ça cassait, en cascade : la feuille du premier montrait une pièce
**ouverte** — le filtre par étage retire le mur emprunté, le contour ne
ferme plus, et sans contour il n'y a ni surface, ni métré, ni contrôle des
normes. La feuille du rez montrait un mur bordant une pièce d'un autre
niveau. Et les deux étages partageaient une maçonnerie : corriger les cotes
de l'une déformait l'autre, un étage plus bas.

**Quand l'étage est vide**, il n'y a rien à quoi s'accoler, et la règle
d'origine — « à droite de ce qui existe, avec un jeu d'un demi-mètre » —
était la mauvaise réponse : un étage se superpose à celui qu'il couvre, et
poser la première pièce à côté oblige à la ramener à la main sur six mètres,
après l'avoir cherchée au dézoom. Elle part maintenant du coin de l'emprise
du niveau du dessous, et `recalerNiveau` ajuste ensuite.

Trois parcours de bout en bout gardent désormais ces chaînes : le plan
dessiné, l'équipement électrique (du premier socle au dossier imprimé), et
le pavillon à deux niveaux. Les autres épreuves vérifient chacune un geste ;
celles-ci vérifient qu'ils s'enchaînent — **une chaîne se rompt aux
jointures, jamais au milieu d'un maillon**.

### Ce qu'une ouverture EST — et le plan qui se déchirait

Ces deux défauts ont été trouvés de la même façon : en refaisant le parcours
complet d'un plan dessiné sans scanner, du plan vierge à la réouverture. Les
autres épreuves vérifient chacune un geste ; celle-ci vérifie qu'ils
s'enchaînent, et c'est la seule manière de trouver les jointures qui cèdent.

**Une ouverture posée à la main était toujours une BAIE.** Le bandeau donnait
sa largeur, sa hauteur, sa position, son coffre — jamais ce qu'elle est. Un
plan tracé sans scanner ne comportait donc ni porte ni fenêtre, rien que des
trous. Ce n'est pas une étiquette : la nature commande le dessin (le battant
d'une porte, qui dit de quel côté se pose l'interrupteur) et les cotes
(l'allège d'une fenêtre, qui décide d'une prise dessous). Les deux réglages
s'offraient à une ouverture qui n'y avait pas droit, sans que personne puisse
la lui donner. La déclarer ajuste les cotes : une porte part du sol, une
fenêtre posée au sol prend l'allège la plus courante — mais celle qui en
avait déjà une la garde, c'est un relevé et non une valeur de catalogue.

**Redimensionner une pièce déchirait le plan.** Une pièce accolée partage sa
cloison — une seule maçonnerie entre deux pièces. En corrigeant le séjour de
dix-huit centimètres, ce mur mitoyen partait avec lui et la voisine restait
sur place : le plan s'ouvrait par une fente. Deux pièces qui ne se touchent
plus sur le dessin, un périmètre qui ne ferme pas dans le métré, deux pans
qui ne se rejoignent pas en 3D.

La règle qui referme : **quand un coin bouge, ce qui y était accroché suit**.
Elle ne regarde ni les pièces ni les identifiants, juste les points — c'est
celle qu'applique déjà le déplacement d'un point de mur, et elle vaut ici
pour les quatre coins à la fois. Ce qui ne touchait rien ne bouge pas : on
recoud, on ne rassemble pas.

À connaître, au passage : une pièce accolée prend la **longueur du mur
d'appui**, pas celle du modèle. Une « chambre 3 × 3 » posée contre un séjour
de cinq mètres sort en 5 × 3 ; seule sa profondeur est celle qu'on a choisie.
C'est le prix d'une cloison qui coïncide exactement, et c'est maintenant
rattrapable — les cotes se corrigent.

### L'allège, et le bandeau qui déborde

L'allège — du sol au repos de la baie — était la seule cote de menuiserie
qu'on pouvait LIRE sans pouvoir la corriger. Le plan la cote déjà, sur
l'élévation du mur et sur le jambage gauche du dossier imprimé, parce que
c'est elle qui décide d'une prise sous fenêtre ou d'un convecteur ; mais
`resizeOpening` la tient expressément fixe (« l'allège ne bouge pas, c'est
le linteau qui suit »). Bon réflexe quand on retaille une baie, impasse
quand le scan l'a posée dix centimètres trop haut.

**On déplace, on ne rogne pas** : une fenêtre remontée de dix centimètres
reste une fenêtre de la même taille. Régler l'allège en mangeant la hauteur
donnerait deux gestes qui se défont l'un l'autre. Poussée au-delà, elle
s'arrête au linteau — comme la position s'arrête au coin, et pour la même
raison.

Ces ajouts portaient le bandeau de l'ouverture à **huit boutons en rangée**,
c'est-à-dire exactement le défaut relevé sur celui du mur : « peu de place
pour les informations, un bouton sort du bloc ». Il est donc réorganisé sur
la règle qui a servi ailleurs — **le bandeau porte ce qu'il affiche**. En
direct : les trois cotes de la menuiserie (largeur, hauteur, allège), celles
que la ligne du haut donne déjà. Dans le menu : ce qui tient à la POSE et
non à la menuiserie — où elle tombe sur le mur, de quel côté elle s'ouvre,
le coffre de volet, et la fermeture.

### De quel côté la porte s'ouvre

Le plan dessine le quart de cercle du battant, et il le DEVINE :
`pivotsDesBattants` range les portes dos à dos pour qu'aucune paire d'arcs
ne se croise, et le vantail s'ouvre vers l'intérieur de la pièce. Bonne
supposition, fausse une fois sur deux — une porte réelle pivote du côté que
le menuisier a choisi, pas du côté qui arrange le dessin.

**Pour un électricien ce n'est pas un détail de trait.** L'interrupteur se
pose du côté de la poignée, jamais du côté des paumelles : une porte
dessinée à l'envers envoie percer derrière le battant. La NF C 15-100 le dit
autrement — la commande doit être atteignable en entrant — mais c'est la
même paume sur le même mur.

Deux boutons, parce que ce sont deux questions indépendantes : « Pivot »
change le bord de charnière, « Sens » change la pièce vers laquelle le
vantail s'ouvre (placard, cellier, porte palière). Un bouton unique faisant
le tour des quatre combinaisons obligerait à appuyer trois fois pour revenir
à la bonne. Ils ne s'affichent que sur une porte : une fenêtre n'a pas de
vantail dessiné, et un bouton qui ne change rien à l'écran se lit comme un
geste raté.

**Le choix de la main tient** : `pivotsDesBattants` ne range plus une porte
que personne n'a réglée. Sans ça, la correction faite sur place durait
jusqu'au premier rendu suivant, et la porte se retournait toute seule. Écran
et dossier imprimé suivent le même réglage — vérifié à l'œil sur les trois
cas.

### Le mot écrit au crayon dans la marge

« Colonne montante ici », « attente TV à confirmer avec le client », « gaine
à reprendre ». Ces phrases sont sur tous les plans papier du métier, et
l'application n'avait aucun endroit pour elles : le nom de pièce nomme, le
nom du plan est unique, l'appareillage se compte au métré. Faute de place,
elles finissaient dans le nom du plan — « T3 Pasteur (vérifier colonne) » —
ou nulle part, c'est-à-dire dans la tête de celui qui a fait le relevé, qui
n'est pas toujours celui qui pose.

La pastille **Note**, en édition, attend le point du plan puis demande le
texte. **Une note tient à un POINT, pas à une pièce** : ce qu'on signale est
souvent justement ce qui n'a pas encore de pièce — une arrivée dans un
couloir, un percement dans une cloison qu'on n'a pas fini de tracer. Elle se
pose donc partout, là où un appareil de plafond, lui, exige un contour.

Sur le plan, la punaise marque le point et le cartouche s'écarte : posé
dessus, il couvrirait exactement ce qu'il désigne. Le texte s'écrit **à
taille constante** — c'est déjà la règle des cotes, elle vaut pour les mots.
La pastille n'en montre que le début ; le bandeau, qui a la place, la dit en
entier et c'est là qu'on la corrige ou la retire. Vider le champ retire la
note : une pastille vide ne se lit plus et ne se vise plus.

Une note se REPOSE : « Déplacer » attend le nouveau point, comme à la pose.
Pas un glisser — la pastille est petite, et un doigt posé dessus sur un plan
chargé attrape aussi bien le mur qui passe dessous.

**Elles s'impriment sur le plan du dossier**, en dernier, par-dessus murs et
meubles — une remarque à moitié cachée sous un canapé n'est pas une
remarque. Et elles suivent leur étage, triées par `filtrerAuNiveau` comme
les murs : le document, lui, imprime ce qu'on lui donne, et une seconde
règle de tri cachée dans le dessinateur serait une deuxième place où une
note pourrait disparaître.

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
