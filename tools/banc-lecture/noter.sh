#!/bin/bash
# Assemble les lectures v* et note tout le banc ; affiche un tableau.
# Le dossier des plans (synth/, dur/, reel/), et le dossier des outils.
B=${BANC_DIR:?BANC_DIR : le dossier du banc}
T=$(cd "$(dirname "$0")" && pwd)
for d in $B/synth/* $B/dur/* $B/reel/*; do
  for f in $d/v*_murs.json; do
    [ -f "$f" ] || continue
    v=$(basename $f _murs.json)
    php $T/assembler.php $d $v 2>/dev/null
  done
done
# Le recalage sur l'image, après l'assemblage : lecture_vX.json -> lecture_vXr.json
for f in $B/synth/*/lecture_v*.json $B/dur/*/lecture_v*.json $B/reel/*/lecture_v*.json; do
  case "$f" in *r.json|*.plan.json) continue;; esac
  d=$(dirname $f); v=$(basename $f .json); v=${v#lecture_}
  php $T/recaler.php $d $v 2>/dev/null
done
cd "$T/../.."
for s in synth dur reel; do BANC=$B/$s npx jest tools/banc-lecture/banc --modulePathIgnorePatterns='<rootDir>/.claude' >/dev/null 2>&1; done
python3 - <<'PY'
import json,glob,os
import os
B=os.environ['BANC_DIR']
vers=set(); rows={}
for f in sorted(glob.glob(B+'/*/*/notes.json')):
    d=f.split('/')[-2]; n=json.load(open(f))
    rows[d]={k.replace('lecture_','').replace('.json',''):v for k,v in n.items()}
    vers|=set(rows[d])
vers=sorted(v for v in vers if v!='parfaite')
print('plan'.ljust(14)+''.join(v.rjust(7) for v in vers))
moy={v:[] for v in vers}
for d,r in rows.items():
    cells=[]
    for v in vers:
        n=r.get(v)
        if not n: cells.append('-'.rjust(7)); continue
        m=n.get('murs',{}); b=n.get('baies',{}); p=n.get('pieces',{})
        s=f"{n['note']:5.1f}"
        cells.append(s.rjust(7)); moy[v].append((d,n['note']))
    print(d.ljust(14)+''.join(cells))
# Moyennes sur les plans communs à toutes les versions
import itertools
for a,b in [('v0','v0r'),('v1','v1r'),('v0','v1'),('v0r','v1r'),('v0e','v1e'),('v0e','v1er'),('v1e','v1er')]:
    if a in moy and b in moy:
        da=dict(moy[a]); db=dict(moy[b]); c=[d for d in da if d in db]
        if c: print(f'{a} -> {b} sur {len(c)} plans : {sum(da[d] for d in c)/len(c):.1f} -> {sum(db[d] for d in c)/len(c):.1f}')
PY
