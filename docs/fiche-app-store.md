# Fiche App Store — EchoPlan

Textes prêts à coller dans App Store Connect (langue : français). Les limites
d'Apple sont rappelées à côté de chaque champ ; chaque texte a été compté.

Le positionnement : **une application pour tout le monde** — scanner sa pièce,
lire ses cotes, la meubler, s'y promener — avec, pour qui en a besoin, un mode
Électricité complet. La fiche vend d'abord le grand public ; le métier arrive en
fin de description, comme dans l'application.

---

## Nom (30 caractères max)

```
EchoPlan : scan 3D de pièce
```
27 caractères.

## Sous-titre (30 caractères max)

```
Plan coté, meubles et visite
```
28 caractères.

## Mots-clés (100 caractères max, séparés par des virgules, sans espaces)

```
plan,maison,appartement,lidar,mesure,metre,surface,amenagement,deco,dxf,pdf,roomplan,electricien
```
96 caractères. Les mots du nom et du sous-titre (scan, 3D, pièce, coté,
meubles, visite) n'y sont pas répétés : Apple les indexe déjà.

## Texte promotionnel (170 caractères max — modifiable sans nouvelle version)

```
Nouveau : entrez dans votre pièce scannée et promenez-vous dedans, comme dans un jeu — murs et meubles compris. Votre premier logement est offert, en entier.
```
157 caractères.

## Description (4 000 caractères max)

```
Balayez une pièce avec votre iPhone : EchoPlan en tire le plan coté, la 3D et les meubles, en quelques minutes. Puis entrez dedans.

SCANNEZ
• Le LiDAR de l'iPhone relève les murs, les portes, les fenêtres et les meubles pendant que vous marchez.
• Plusieurs pièces, plusieurs étages : le logement se construit au fil des scans.
• Pas de LiDAR sous la main ? Dessinez le plan au doigt, en saisissant les cotes.

LISEZ VOS COTES
• Longueur de chaque mur, surface de chaque pièce, hauteur sous plafond.
• Corrigez une cote au doigt : le plan suit.
• Notes et photos posées à l'endroit exact du plan.

AMÉNAGEZ
• Les meubles détectés pendant le scan sont déjà à leur place.
• Ajoutez un lit, un canapé, une armoire, une table : déplacez-les, tournez-les, vérifiez que tout passe avant d'acheter.

ENTREZ DEDANS
• Une vue 3D du logement, à faire tourner du bout du doigt.
• Le mode Exploration vous place à hauteur d'œil : un pouce pour marcher, l'autre pour regarder autour. Les murs et les meubles vous arrêtent, les portes vous laissent passer — comme si vous y étiez.

PARTAGEZ
• Plan PDF coté avec vues 3D, à envoyer à un proche, un artisan, une agence.
• Plan DXF en calques pour l'architecte, modèle 3D OBJ pour Blender, métré CSV pour Excel, image de la vue.

ET SI VOUS ÊTES ÉLECTRICIEN
Un interrupteur, et EchoPlan devient votre outil de relevé : prises, interrupteurs et points lumineux posés sur le plan ou visés pendant le scan, contrôle NF C 15-100 pièce par pièce, circuits et gaines, tableau existant, liste du matériel et devis aux prix relevés en magasin. Le mode se coupe aussi simplement : il masque, il n'efface rien.

GRATUIT POUR COMMENCER
Votre premier logement est offert, en entier : scan, plan, 3D, exploration et exports. L'abonnement EchoPlan Pro ouvre les logements suivants, les étages, les copies. 4,90 € par mois ou 49 € par an, sans engagement.

Compatibilité : le scan nécessite un iPhone ou un iPad équipé du LiDAR (iPhone 12 Pro et modèles Pro suivants, iPad Pro 2020 et suivants). Le dessin au doigt fonctionne sur tous les appareils.
```

## Catégories

- Principale : **Productivité**
- Secondaire : **Graphisme et design**

## Captures d'écran — l'ordre et la légende

Six captures, dans cet ordre ; la légende en haut de chaque image, courte. Les
trois premières sont celles qui s'affichent dans les résultats de recherche :
elles doivent vendre le grand public, sans un sigle électrique.

1. **« Scannez votre pièce en marchant »** — l'écran de scan, RoomPlan en cours.
2. **« Le plan coté, tout de suite »** — le plan 2D d'un appartement meublé, cotes visibles.
3. **« Entrez dedans »** — l'exploration à la première personne, la manette et la mini-carte.
4. **« Aménagez avant d'acheter »** — la 3D vue de haut, meubles en place.
5. **« Partagez en PDF, DXF ou 3D »** — la feuille d'export.
6. **« Électricien ? Un mode rien que pour vous »** — le plan avec appareillage et la pastille du devis.

Tailles exigées par Apple : 6,9 pouces (1320 × 2868) au minimum ; Apple
réduit lui-même pour les écrans plus petits.

---

## À régler AVANT la soumission

Ces points ne sont pas des textes : ce sont des refus probables à la revue, ou
des trous de configuration. À cocher un par un.

- [x] **L'avis contre un relevé est retiré.** Le popup « laissez un avis,
      gagnez un relevé » récompensait un avis, ce que les règles de l'App
      Store interdisent. Il n'existe plus, ni son URL d'avis.
- [x] **Plus de code maison ni de remise appliquée par l'app.** « CARIDI12 »
      donnait le Pro sans passer par l'App Store (interdit, règle 3.1.1) et le
      « −20 % » s'affichait sans être facturé. Les prix sont lus à l'App Store,
      la remise est une offre de lancement Apple, « J'ai un code » ouvre la
      feuille d'Apple, et la page Pro porte les mentions de la règle 3.1.2.
- [ ] **Les deux abonnements** `echoplan.pro.mensuel` et `echoplan.pro.annuel`
      créés dans App Store Connect, dans **le même groupe d'abonnements**, avec
      leur prix (4,90 € / 49 €), et joints à la première version. L'app lit
      ces prix : changer un tarif dans App Store Connect suffit, sans nouvelle
      version.
- [ ] **L'offre de bienvenue** (facultatif) : une *offre de lancement* sur
      chacun, « paiement au fur et à mesure », par exemple 3,92 € le premier
      mois et 39,20 € la première année (−20 %). Le popup « Surprise ! » ne
      s'affiche que si elle existe ; sans elle, l'app mène droit à la page Pro.
- [ ] **Ton accès Pro à toi** : « CARIDI12 » n'existe plus. Crée un *code
      d'offre* dans App Store Connect (Abonnements → Codes d'offre), saisis-le
      via « J'ai un code » — c'est gratuit, et c'est la voie autorisée.
- [ ] **L'adresse de la politique de confidentialité** : App Store Connect exige
      une URL publique. Publier le texte de l'écran « Confidentialité des
      données » sur bourseur.fr, et renseigner l'adresse.
- [ ] **Les étiquettes de confidentialité** (« App Privacy ») : l'e-mail et le
      prénom du compte, l'identifiant Apple si l'on se connecte avec Apple —
      ET **les plans** (« Contenu utilisateur », lié à l'identité) : quand on
      est connecté, ils sont déposés sur le serveur pour suivre le compte d'un
      téléphone à l'autre. Les photos, elles, restent sur le téléphone.
- [ ] **La phrase d'usage de la caméra** (`NSCameraUsageDescription`) relue :
      Apple refuse les phrases vagues.
- [ ] **Un compte de démonstration** pour l'équipe de revue, et une note qui
      explique que le scan exige le LiDAR — sinon le relecteur, sur un appareil
      sans LiDAR, ne voit que « appareil non compatible » et peut refuser pour
      fonctionnalité absente. Mentionner le dessin au doigt, qui marche partout.
- [ ] **Les prix du devis** : téléverser `server/tarifs.json` sur bourseur.fr
      (le serveur sert encore l'ancien fichier de 32 articles).
