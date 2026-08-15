# RoomScanner

Application mobile de scan d'appartement 3D : détection de murs/objets en temps
réel, mesures, modèle 3D exporté et plan 2D éditable.

- **iOS** : Apple **RoomPlan** (LiDAR) via un module natif Swift — murs, portes,
  fenêtres et objets paramétriques, export `.usdz`, visionneuse QuickLook.
  **Multi-pièces** (iOS 17+) : on enchaîne les pièces dans un même scan.
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

### Multi-pièces

Un scan peut contenir plusieurs pièces. **« Pièce suivante » clôt la pièce
courante sans couper la session ARKit** (`stop(pauseARSession: false)`) : le
repère monde survit, on marche jusqu'à la pièce suivante, on relance une
capture, et les pièces sortent déjà recalées les unes par rapport aux autres.
Aucun recollement géométrique n'est fait côté JS — c'est le suivi de la
caméra qui aligne, donc **il ne faut ni quitter l'app ni masquer l'objectif
entre deux pièces**.

Chaque pièce est post-traitée à part par `RoomBuilder` (iOS 17), hors de
`RoomCaptureView` : c'est ce qui permet de garder la vue en mode capture d'un
bout à l'autre (`captureView(shouldPresent:)` renvoie `false` en multi-pièces).
À la fin, `StructureBuilder` fusionne les données brutes pour le **seul**
`.usdz` exporté — la géométrie du plan, elle, vient des pièces individuelles.
Si l'assemblage échoue, le plan reste juste, seul le modèle 3D se réduit à la
première pièce.

Côté JS, la géométrie reste **à plat** : `walls`, `openings` et `objects` sont
des listes uniques où chaque élément porte un `roomId`, et `rooms[]` ne
contient que ce qui est propre à la pièce (nom, relevé du sol). Tout le rendu
passe par `roomParts()`, qui redécoupe le plan par pièce. Conséquence
importante : **la soudure des coins, les jonctions en T et les onglets sont
cloisonnés par pièce**. Deux cloisons mitoyennes distantes de 8 cm restent
deux murs distincts ; les confondre refermerait les deux contours l'un sur
l'autre et ferait disparaître les surfaces au sol.

RoomPlan classe les pièces (`livingRoom`, `kitchen`…) : le nom français est
posé d'office, avec numérotation des doublons (« Chambre », « Chambre 2 »).
En mode édition, toucher le sol d'une pièce la sélectionne — on la renomme ou
on la retire du plan.

Android et iOS 16 restent mono-pièce : leur résultat à plat est remis dans le
même moule (une pièce implicite `room-1`), et les scans enregistrés avant le
multi-pièces sont migrés au chargement.

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

## Vérifications faites sur cette machine (Windows)

- `npx tsc --noEmit` et `npx eslint src App.tsx` : aucun diagnostic.
- `npx jest` : 46/46 tests verts (conversion matrice iOS→segment, extrémités
  Android, soudure des coins et jonctions en T, onglets des murs, surface au
  sol, semis de points, lecture des textures, snap angulaire, projection
  mètres↔pixels, génération du PDF ; **multi-pièces** : découpe par pièce,
  non-fusion de deux pièces mitoyennes, surfaces cumulées, sols distincts,
  mise à plat d'un résultat de scan, migration des scans mono-pièce).
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
- Multi-pièces : le recalage repose entièrement sur la continuité du suivi
  ARKit. Un long trajet, un couloir sombre ou une porte franchie caméra
  baissée font dériver le repère : les pièces sortent alors décalées. Le plan
  2D reste éditable, mais il n'y a pas (encore) de recalage manuel d'une
  pièce entière.
- Multi-pièces : les couleurs relevées sont rattachées par identifiant de
  surface, avec repli sur la position (0,7 m et même orientation). Le sol de
  chaque pièce est découpé dans la carte monde à partir de l'emprise de ses
  murs, plus une case de 40 cm de marge.
- Multi-pièces : deux pièces mitoyennes gardent chacune son mur. C'est
  volontaire (c'est la réalité d'une cloison vue des deux côtés), mais la
  surface au sol cumulée exclut donc l'épaisseur de la cloison.
