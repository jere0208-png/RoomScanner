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

Ajouter un mur (posé au centre du plan, à déplacer par ses poignées),
supprimer le mur sélectionné, et **annuler pas à pas**. L'historique
photographie le plan avant chaque retouche, en regroupant les appels
rapprochés d'un même geste : un glissement de coin, qui appelle son action
des dizaines de fois par seconde, ne compte que pour une annulation. La pile
est bornée à 40 entrées et repart à zéro dès qu'on change de scan.

### Export du modèle 3D

Le `.usdz` de RoomPlan ignore toutes les retouches — murs déplacés, pièces
fusionnées, cloisons ajoutées. L'export **OBJ** est donc construit depuis
`buildScene()`, comme la vue 3D et le PDF : ce qu'on voit est ce qu'on
exporte. Un seul fichier, lisible par Blender, SketchUp et Rhino, avec les
éléments groupés par nature. Les couleurs ne survivent pas (elles
demanderaient un `.mtl` séparé, or on ne partage qu'un fichier) ; les groupes
permettent de les remettre en matière d'un clic. « Modèle AR » ouvre toujours
le `.usdz` d'origine.

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

### Couleurs et textures

Pendant le scan, la session ARKit/ARCore est lue en parallèle (~3 Hz, lecture
seule) : chaque mur est projeté dans l'image caméra et une petite grille de
couleurs (6 × 4) y est moyennée, ainsi qu'une carte du sol par cases de 40 cm
et une couleur par meuble. Sur iOS, la carte de profondeur LiDAR sert à
écarter les points cachés. Le bouton **Couleurs** applique ces relevés à la
vue 3D, au plan et au PDF ; il n'apparaît que si le scan en a rapporté.

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
- `npx jest` : 125/125 tests verts (conversion matrice iOS→segment, extrémités
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
  hors-tout, surface murale nette, feuille de métré activable).
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
