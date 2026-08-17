#!/usr/bin/env bash
#
# La chaîne de livraison, d'un bloc : vérifier, pousser, attendre LE build de
# CE commit, déposer l'IPA sur le Bureau.
#
# Elle existe à cause d'une livraison fantôme. La chaîne était tapée à la
# main et demandait « le dernier run » juste après le push :
#
#     gh run watch "$(gh run list -L 1 --json databaseId -q '.[0].databaseId')"
#
# Or GitHub met quelques secondes à créer le run d'un push. À cet instant, le
# dernier run est encore CELUI D'AVANT — déjà terminé. `run watch` rend la
# main aussitôt, `run download` (sans identifiant) prend l'artefact le plus
# récent, et on dépose sur le Bureau le build du commit précédent en
# annonçant le nouveau. Deux IPA de taille identique à l'octet près, et une
# demi-heure passée à chercher un défaut d'affichage qui n'existait pas.
#
# Ici, le run est retrouvé PAR SON COMMIT, et on attend qu'il apparaisse.
#
# Usage : bash tools/ship.sh "Message de commit"

set -euo pipefail

GH="/c/Program Files/GitHub CLI/gh.exe"
BUREAU="/c/Users/jere0/Desktop"
IPA="$BUREAU/RoomScanner-unsigned.ipa"
MESSAGE="${1:?Il faut un message de commit}"

cd "$(dirname "$0")/.."

echo "── Vérification"
npx tsc --noEmit
npx eslint src App.tsx __tests__
npx jest

echo "── Commit et push"
git add -A
git commit -q -m "$MESSAGE"$'\n\n'"Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -q origin main
SHA=$(git rev-parse HEAD)
echo "   $SHA"

echo "── Recherche du run de CE commit"
RUN=""
for _ in $(seq 1 30); do
  RUN=$("$GH" run list -L 20 --json databaseId,headSha \
        -q ".[] | select(.headSha==\"$SHA\") | .databaseId" | head -1)
  [ -n "$RUN" ] && break
  sleep 4
done
[ -n "$RUN" ] || { echo "Aucun run pour $SHA après deux minutes."; exit 1; }
echo "   run $RUN"

echo "── Build"
# `run watch` ne suffit pas : quand le run est DÉJÀ terminé au moment où on
# l'attache — un échec de compilation tombe en une minute — il rend la main
# avec un code zéro, quoi qu'il se soit passé. La chaîne annonçait alors une
# livraison réussie, sans IPA, et il fallait s'en apercevoir tout seul.
# On relit donc la CONCLUSION du run, et on montre ce qui a brûlé.
"$GH" run watch "$RUN" --exit-status > /dev/null || true
ETAT=$("$GH" run view "$RUN" --json conclusion -q .conclusion)
if [ "$ETAT" != "success" ]; then
  echo "ÉCHEC DU BUILD ($ETAT) — run $RUN"
  "$GH" run view "$RUN" --log-failed 2>/dev/null | tail -60 || true
  exit 1
fi

echo "── Dépôt"
# `gh` refuse d'écraser : sans ce ménage, le téléchargement échoue et l'IPA
# de la livraison précédente reste sur le Bureau, à passer pour la nouvelle.
rm -f "$IPA"
"$GH" run download "$RUN" -n RoomScanner-unsigned-ipa -D "$BUREAU"
# Et l'IPA doit être là, non vide : un téléchargement muet vaut un échec.
[ -s "$IPA" ] || { echo "Aucun IPA déposé pour $SHA."; exit 1; }
ls -l "$IPA"
echo "IPA DEPOSE — commit $SHA"
