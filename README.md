# RoomScanner

Application mobile de scan d'appartement 3D : détection de murs/objets en temps
réel, mesures, modèle 3D exporté et plan 2D éditable.

- **iOS** : Apple **RoomPlan** (LiDAR) via un module natif Swift — murs, portes,
  fenêtres et objets paramétriques, export `.usdz`, visionneuse QuickLook.
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
│                            onglets des jonctions, surface de la pièce,
│                            snap angulaire, projection mètres↔pixels
├── geometry/scene3d.ts      Scène 3D commune à la vue de l'app et au PDF
├── geometry/appearance.ts   Couleurs relevées au scan + semis du sol
├── native/useRoomScan.ts    Abonnement aux événements natifs + commandes
├── components/FloorplanEditor.tsx  Plan 2D SVG : coins déplaçables, cotes
└── screens/                 Home / Scan (HUD sur vue AR) / Résultat (plan éditable)
```

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

- `npx tsc --noEmit` et `npx eslint .` : aucun diagnostic.
- `npx jest` : 29/29 tests verts (conversion matrice iOS→segment, extrémités
  Android, soudure des coins et jonctions en T, onglets des murs, surface au
  sol, semis de points, lecture des textures, snap angulaire, projection
  mètres↔pixels, génération du PDF).
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
- Multi-pièces : non géré en v1. Le modèle de données (liste de murs par scan)
  est prêt à être étendu en `Scene = Room[]` (RoomPlan `StructureBuilder`, iOS 17).
