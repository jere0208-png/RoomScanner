import json, sys
from PIL import Image, ImageDraw
d, v = sys.argv[1], sys.argv[2]
im = Image.open(f'{d}/plan.png').convert('RGB'); W, H = im.size
dr = ImageDraw.Draw(im)
for f, col, w in ((f'lecture_{v}.json', (255, 0, 0), 5), (f'lecture_{v}r.json', (0, 190, 0), 3)):
    l = json.load(open(f'{d}/{f}'))
    for m in l['murs']:
        dr.line([(m[0] / 1000 * W, m[1] / 1000 * H), (m[2] / 1000 * W, m[3] / 1000 * H)], fill=col, width=w)
    for o in l.get('ouvertures', []):
        dr.line([(o['a'][0] / 1000 * W, o['a'][1] / 1000 * H), (o['b'][0] / 1000 * W, o['b'][1] / 1000 * H)], fill=(0, 0, 255) if col[1] else (255, 150, 0), width=w + 4)
im.thumbnail((2000, 2000)); im.save(f'{d}/recal_{v}.png')
