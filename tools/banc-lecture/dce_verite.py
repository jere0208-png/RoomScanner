import sys, re, json, os, subprocess, html
pdf, page, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
os.makedirs(out, exist_ok=True)
x = subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-bbox', pdf, '-'], capture_output=True, text=True).stdout
W = H = None
words = []
for line in x.splitlines():
    m = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', line)
    if m: W, H = float(m.group(1)), float(m.group(2))
    m = re.search(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)</word>', line)
    if m:
        a, b, c, d = map(float, m.groups()[:4])
        words.append({'t': html.unescape(m.group(5)), 'x': (a + c) / 2, 'y': (b + d) / 2, 'h': d - b})
textes = [{'t': w['t'], 'x': round(w['x'] / W * 1000), 'y': round(w['y'] / H * 1000)} for w in words]
json.dump(textes, open(os.path.join(out, 'textes.json'), 'w'), ensure_ascii=False)
# Pièces : un mot « 12,34 » suivi de « m2 » / « m² », et le nom juste au-dessus.
pieces = []
for i, w in enumerate(words):
    if re.fullmatch(r'\d+,\d+', w['t']) and i + 1 < len(words) and words[i + 1]['t'].lower().startswith('m'):
        # Le nom : les mots sur la ligne juste au-dessus, centrés pareil.
        nom = [v for v in words if abs(v['y'] - (w['y'] - w['h'] * 1.15)) < w['h'] * 0.5 and abs(v['x'] - w['x']) < 60
               and not re.fullmatch(r'\d+,\d+|\d{2,}', v['t'])]
        nom.sort(key=lambda v: v['x'])
        n = ' '.join(v['t'] for v in nom).strip()
        if n:
            pieces.append({'nom': n, 'surface': float(w['t'].replace(',', '.')), 'point': [round(w['x'] / W * 1000), round(w['y'] / H * 1000)]})
print(json.dumps(pieces, ensure_ascii=False))
pieces = [p for p in pieces if not p['nom'].startswith('RDC')]
json.dump({'image': {'largeur': round(W * 4), 'hauteur': round(H * 4)}, 'pieces': pieces, 'reel': True},
          open(os.path.join(out, 'verite.json'), 'w'), ensure_ascii=False, indent=1)
subprocess.run(['pdftoppm', '-f', str(page), '-l', str(page), '-scale-to', '4000', '-png', '-singlefile', pdf, os.path.join(out, 'plan')])
