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

- [ ] **L'avis contre un relevé doit disparaître.** Le popup « laissez un avis,
      gagnez un relevé » récompense un avis : c'est explicitement interdit par
      les règles de l'App Store (avis incités) et c'est un motif de refus — voire
      de retrait du compte développeur en cas de récidive. À retirer avant
      d'envoyer la première version (je peux le faire : demandez-le).
- [ ] **L'identifiant de l'app dans l'URL d'avis** : elle porte encore un
      identifiant gabarit, à remplacer par celui qu'App Store Connect attribue
      à la création de la fiche.
- [ ] **Les deux abonnements** `echoplan.pro.mensuel` et `echoplan.pro.annuel`
      créés dans App Store Connect, avec leur prix (4,90 € / 49 €), et joints à
      la première version.
- [ ] **Les étiquettes de confidentialité** (« App Privacy ») : l'e-mail et le
      prénom du compte, l'identifiant Apple si l'on se connecte avec Apple.
      Les plans restent sur le téléphone.
- [ ] **La phrase d'usage de la caméra** (`NSCameraUsageDescription`) relue :
      Apple refuse les phrases vagues.
- [ ] **Un compte de démonstration** pour l'équipe de revue, et une note qui
      explique que le scan exige le LiDAR — sinon le relecteur, sur un appareil
      sans LiDAR, ne voit que « appareil non compatible » et peut refuser pour
      fonctionnalité absente. Mentionner le dessin au doigt, qui marche partout.
- [ ] **Les prix du devis** : téléverser `server/tarifs.json` sur bourseur.fr
      (le serveur sert encore l'ancien fichier de 32 articles).
