# python3 voir.py <dossier> <version> : dessine le plan reconstruit (murs, baies, pièces et aires)
import json, sys
from PIL import Image, ImageDraw, ImageFont
d, v = sys.argv[1], sys.argv[2]
p = json.load(open(f'{d}/lecture_{v}.plan.json'))
xs = [c for w in p['walls'] for c in (w[0], w[2])]; zs = [c for w in p['walls'] for c in (w[1], w[3])]
k = 1400 / max(max(xs) - min(xs), max(zs) - min(zs)); m = 40
P = lambda x, z: (m + (x - min(xs)) * k, m + (z - min(zs)) * k)
im = Image.new('RGB', (int((max(xs) - min(xs)) * k + 2 * m), int((max(zs) - min(zs)) * k + 2 * m)), 'white')
dr = ImageDraw.Draw(im)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
cols = [(255,230,230),(230,255,230),(230,230,255),(255,255,210),(240,220,255),(210,250,250)]
for i, r in enumerate(p['rooms']):
    dr.polygon([P(*q) for q in r['pts']], fill=cols[i % 6])
for w in p['walls']:
    dr.line([P(w[0], w[1]), P(w[2], w[3])], fill='black', width=max(2, int(w[4] * k)))
for o in p['openings']:
    dr.line([P(o[0], o[1]), P(o[2], o[3])], fill={'door': 'red', 'window': 'blue', 'opening': 'orange'}.get(o[4], 'green'), width=6)
for r in p['rooms']:
    cx = sum(q[0] for q in r['pts']) / len(r['pts']); cz = sum(q[1] for q in r['pts']) / len(r['pts'])
    dr.text(P(cx, cz), f"{r['nom']}\n{r['aire']:.2f}", fill='black', font=f, anchor='mm')
im.save(f'{d}/vu_{v}.png')
