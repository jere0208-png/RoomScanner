# Le banc d'essai de la lecture de plans

Relevé du patron : « la lecture doit être bonne sur n'importe quel plan
d'architecte ; cherche continuellement à performer sur cette fonction, en la
testant avec des agents ». Ce dossier mesure la lecture de bout en bout.

**Les plans.**
- `gen.py <dossier> <graine> [style|-] [dense 0|1] [photo 0|1]` dessine un plan
  dont on connaît tout : dix styles (architecte, contour, hachuré, gris,
  croquis, notaire, photo, électricien, constructeur, anglo-saxon), grandes
  maisons, photos de biais. Il écrit `plan.png`, `verite.json` et
  `textes.json` (l'OCR, suivi par la déformation de la photo).
- `dce_verite.py <pdf> <page> <dossier>` prend un vrai plan PDF : la vérité,
  ce sont les surfaces écrites dans les pièces. Les plans des clients ne
  s'archivent pas ici.

**Les lectures.**
- `invite_v1.php <dossier> <version>` prépare exactement ce que le serveur
  envoie (`preparerLesLectures` de server/lecture-plan.php) : la feuille, les
  loupes quadrillées, les consignes, les schémas des outils.
- Un agent joue le lecteur avec `prompt_v1.txt` (à l'œil seulement), et écrit
  `<version>_murs.json` et `<version>_pieces.json`.
- `invite_v0*.php` et `prompt_v0.txt` : l'ancienne lecture, pour comparer.

**La note.** `BANC_DIR=<dossier du banc> ./noter.sh` assemble les réponses
(`lectureAssemblee`), reconstruit (`reconstruirePlan`) et note chaque lecture
avec `banc.test.ts` : murs, cloisons, ouvertures, pièces, emprise, sur 100.
Sur un vrai plan : la part des pièces dont la surface écrite est retrouvée à
8 % près. `voir.py` dessine le plan reconstruit.

**Essai écarté.** `recalage.php` (recaler les murs lus sur les traits de
l'image) : +9 à +15 sur les lectures nettes, mais négatif à la définition
réelle de l'API et sur les photos. Gardé ici pour un prochain tour.

**Mesures du premier tour** (lecteur Sonnet, sauf mention ; à la définition
que l'API regarde, ~1,15 Mpx par image) :
- 3 pages du DCE du patron, part des pièces justes : ancienne lecture 42,
  nouvelle 45, nouvelle avec Opus 55 ;
- 8 plans difficiles : 74,9 → 75,1 ; plans simples : ~99 dans les deux cas.
