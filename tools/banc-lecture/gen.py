#!/usr/bin/env python3
"""
Générateur de plans d'essai à vérité connue, dans des styles variés.

  python3 gen.py <dossier> <graine> [style]

Écrit <dossier>/plan.png (la « feuille » telle que l'iPhone la donne après
redressement), <dossier>/verite.json (murs, ouvertures, pièces en mètres, et
la transformation mètres -> pixels), <dossier>/textes.json (l'OCR simulé :
[{t, x, y}] en millièmes de l'image).
"""
import json, math, os, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

FONTS = {
    'sans': '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    'sansb': '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'inter': '/usr/share/fonts/opentype/inter/Inter-Regular.otf',
    'interb': '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
    'mono': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    'obl': '/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf',
    'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
}
for k, v in list(FONTS.items()):
    if not os.path.exists(v):
        FONTS[k] = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

STYLES = ['archi', 'contour', 'hachure', 'gris', 'croquis', 'notaire', 'photo', 'electricien', 'constructeur', 'anglo']

NOMS_FR = {
    'sejour': ['Séjour', 'SÉJOUR', 'Salon / Séjour', 'Pièce de vie', 'SEJOUR'],
    'cuisine': ['Cuisine', 'CUISINE', 'Cuis.'],
    'chambre': ['Chambre', 'CHAMBRE', 'Ch.'],
    'sdb': ['Salle de bain', 'SDB', 'S.d.B', 'Salle d\'eau', 'SDE'],
    'wc': ['WC', 'W.C.'],
    'entree': ['Entrée', 'ENTRÉE', 'Hall'],
    'degagement': ['Dégagement', 'DGT', 'Couloir', 'Circulation'],
    'placard': ['Placard', 'Pl.', 'Rangement'],
    'cellier': ['Cellier', 'Buanderie', 'Cellier/Buand.'],
    'bureau': ['Bureau', 'BUREAU'],
}
NOMS_EN = {
    'sejour': ['LIVING ROOM', 'Living'], 'cuisine': ['KITCHEN'], 'chambre': ['BEDROOM'],
    'sdb': ['BATH'], 'wc': ['WC'], 'entree': ['HALL'], 'degagement': ['CORRIDOR'],
    'placard': ['CL.'], 'cellier': ['UTILITY'], 'bureau': ['STUDY'],
}


def r5(v):
    return round(v * 20) / 20


class Plan:
    """Un logement rectiligne : une emprise découpée en pièces."""

    def __init__(self, rnd, dense=False):
        self.rnd = rnd
        self.dense = dense
        W = r5(rnd.uniform(11.0, 17.0) if dense else rnd.uniform(7.5, 14.0))
        D = r5(rnd.uniform(9.0, 14.0) if dense else rnd.uniform(6.5, 11.5))
        self.ep_ext = rnd.choice([0.20, 0.25, 0.30, 0.35])
        self.ep_cl = rnd.choice([0.07, 0.10, 0.10])
        self.ep_ref = rnd.choice([0.15, 0.18, 0.20])
        # Les axes extérieurs : rectangle de W x D (hors tout = W + ep_ext).
        cells = [[0.0, 0.0, W, D]]
        # Parfois un L : on retire un coin.
        self.notch = None
        if rnd.random() < 0.35:
            nw = r5(rnd.uniform(2.5, W * 0.45))
            nd = r5(rnd.uniform(2.0, D * 0.45))
            corner = rnd.choice(['ne', 'se', 'sw', 'nw'])
            self.notch = (corner, nw, nd)
        # Découpage récursif.
        cibles = rnd.randint(13, 20) if dense else rnd.randint(6, 11)
        splits = []  # (orient, pos, lo, hi, ep)
        rects = [(0.0, 0.0, W, D)]
        tries = 0
        while len(rects) < cibles and tries < 200:
            tries += 1
            rects.sort(key=lambda r: -(r[2] - r[0]) * (r[3] - r[1]))
            i = 0 if rnd.random() < 0.7 else rnd.randrange(len(rects))
            x0, z0, x1, z1 = rects[i]
            w, d = x1 - x0, z1 - z0
            vert = w > d if rnd.random() < 0.8 else w <= d
            span = w if vert else d
            mini = 1.0 if dense else 1.3
            if span < 2 * mini + 0.4:
                vert = not vert
                span = w if vert else d
                if span < 2 * mini + 0.4:
                    continue
            p = r5(rnd.uniform(mini, span - mini))
            if rnd.random() < 0.15:
                ep = self.ep_ref
            else:
                ep = self.ep_cl
            rects.pop(i)
            if vert:
                rects += [(x0, z0, x0 + p, z1), (x0 + p, z0, x1, z1)]
                splits.append(('v', x0 + p, z0, z1, ep))
            else:
                rects += [(x0, z0, x1, z0 + p), (x0, z0 + p, x1, z1)]
                splits.append(('h', z0 + p, x0, x1, ep))
        self.W, self.D = W, D
        self.rects = rects
        self.splits = splits
        self._carve_notch()
        self._walls()
        self._name_rooms()
        self._openings()

    def _carve_notch(self):
        if not self.notch:
            return
        corner, nw, nd = self.notch
        W, D = self.W, self.D
        nx0, nx1 = (W - nw, W) if corner in ('ne', 'se') else (0, nw)
        nz0, nz1 = (0, nd) if corner in ('ne', 'nw') else (D - nd, D)
        # Retire la partie des pièces dans l'encoche ; une pièce qui y tombe
        # entièrement disparaît, une qui chevauche est rognée si possible.
        out = []
        for (x0, z0, x1, z1) in self.rects:
            ix = min(x1, nx1) - max(x0, nx0)
            iz = min(z1, nz1) - max(z0, nz0)
            if ix <= 1e-6 or iz <= 1e-6:
                out.append((x0, z0, x1, z1))
                continue
            if ix >= x1 - x0 - 1e-6 and iz >= z1 - z0 - 1e-6:
                continue
            # Rogner sur un seul axe si l'encoche couvre tout l'autre.
            if ix >= x1 - x0 - 1e-6:
                if nz0 <= z0 + 1e-6:
                    z0 = nz1
                else:
                    z1 = nz0
            elif iz >= z1 - z0 - 1e-6:
                if nx0 <= x0 + 1e-6:
                    x0 = nx1
                else:
                    x1 = nx0
            else:
                # Chevauchement en coin : on abandonne l'encoche.
                self.notch = None
                return self._carve_notch_abort()
            if x1 - x0 > 1.0 and z1 - z0 > 1.0:
                out.append((x0, z0, x1, z1))
        self.rects = out
        self.notch_rect = (nx0, nz0, nx1, nz1)

    def _carve_notch_abort(self):
        self.notch = None

    def _walls(self):
        """Les murs : chaque côté de pièce, fusionné en axes, avec épaisseur."""
        W, D = self.W, self.D
        segs = []  # (orient, pos, lo, hi)
        for (x0, z0, x1, z1) in self.rects:
            segs += [('h', z0, x0, x1), ('h', z1, x0, x1), ('v', x0, z0, z1), ('v', x1, z0, z1)]
        # Union par (orient, pos).
        by = {}
        for o, p, lo, hi in segs:
            by.setdefault((o, round(p, 3)), []).append((lo, hi))
        walls = []
        for (o, p), iv in by.items():
            iv.sort()
            cur = list(iv[0])
            merged = []
            for lo, hi in iv[1:]:
                if lo <= cur[1] + 1e-6:
                    cur[1] = max(cur[1], hi)
                else:
                    merged.append(cur)
                    cur = [lo, hi]
            merged.append(cur)
            for lo, hi in merged:
                walls.append([o, p, lo, hi])
        # Épaisseur : extérieur si une seule pièce le borde sur sa longueur.
        def borde(o, p, lo, hi, side):
            m = (lo + hi) / 2
            for (x0, z0, x1, z1) in self.rects:
                if o == 'h':
                    zz = p - 0.01 if side < 0 else p + 0.01
                    if x0 - 1e-6 <= m <= x1 + 1e-6 and z0 <= zz <= z1:
                        return True
                else:
                    xx = p - 0.01 if side < 0 else p + 0.01
                    if z0 - 1e-6 <= m <= z1 + 1e-6 and x0 <= xx <= x1:
                        return True
            return False
        out = []
        for o, p, lo, hi in walls:
            # Découpe en morceaux homogènes (ext / int) aux limites des pièces.
            cuts = {lo, hi}
            for (x0, z0, x1, z1) in self.rects:
                for v in ((x0, x1) if o == 'h' else (z0, z1)):
                    if lo < v < hi:
                        cuts.add(v)
            cuts = sorted(cuts)
            pieces = []
            for a, b in zip(cuts, cuts[1:]):
                m = (a + b) / 2
                s1 = borde(o, p, m - 0.001, m + 0.001, -1)
                s2 = borde(o, p, m - 0.001, m + 0.001, 1)
                if not (s1 or s2):
                    continue
                ext = not (s1 and s2)
                ep = self.ep_ext if ext else None
                if ep is None:
                    ep = self.ep_cl
                    for so, sp, slo, shi, sep in self.splits:
                        if so == o and abs(sp - p) < 1e-6 and slo - 1e-6 <= m <= shi + 1e-6:
                            ep = sep
                pieces.append([a, b, ep, ext])
            # Refusion des morceaux contigus de même nature.
            for pc in pieces:
                if out and out[-1]['o'] == o and abs(out[-1]['p'] - p) < 1e-9 and abs(out[-1]['hi'] - pc[0]) < 1e-9 \
                        and out[-1]['ep'] == pc[2] and out[-1]['ext'] == pc[3]:
                    out[-1]['hi'] = pc[1]
                else:
                    out.append({'o': o, 'p': p, 'lo': pc[0], 'hi': pc[1], 'ep': pc[2], 'ext': pc[3]})
        self.walls = out

    def _name_rooms(self):
        rnd = self.rnd
        rooms = sorted(self.rects, key=lambda r: -(r[2] - r[0]) * (r[3] - r[1]))
        kinds = []
        n_ch = 0
        for i, r in enumerate(rooms):
            a = (r[2] - r[0]) * (r[3] - r[1])
            mn = min(r[2] - r[0], r[3] - r[1])
            if i == 0:
                k = 'sejour'
            elif a < 2.2 and mn < 1.4:
                k = rnd.choice(['placard', 'wc'])
            elif a < 4.0:
                k = rnd.choice(['wc', 'sdb', 'placard', 'cellier'])
            elif mn < 1.5:
                k = 'degagement'
            elif 'cuisine' not in kinds and rnd.random() < 0.6:
                k = 'cuisine'
            elif 'sdb' not in kinds and a < 7:
                k = 'sdb'
            elif 'entree' not in kinds and a < 8 and rnd.random() < 0.5:
                k = 'entree'
            else:
                k = 'chambre'
            kinds.append(k)
        self.rooms = []
        cnt = {}
        for r, k in zip(rooms, kinds):
            cnt[k] = cnt.get(k, 0) + 1
            self.rooms.append({'rect': r, 'kind': k, 'n': cnt[k]})

    def ep_at(self, o, p, m):
        for w in self.walls:
            if w['o'] == o and abs(w['p'] - p) < 1e-6 and w['lo'] - 1e-6 <= m <= w['hi'] + 1e-6:
                return w['ep']
        return None

    def inner(self, r):
        x0, z0, x1, z1 = r
        e = lambda o, p, m: (self.ep_at(o, p, m) or self.ep_cl) / 2
        return (x0 + e('v', x0, (z0 + z1) / 2), z0 + e('h', z0, (x0 + x1) / 2),
                x1 - e('v', x1, (z0 + z1) / 2), z1 - e('h', z1, (x0 + x1) / 2))

    def _openings(self):
        rnd = self.rnd
        ops = []
        # Portes entre pièces voisines : un arbre couvrant + quelques extras.
        n = len(self.rooms)
        adj = []
        for i in range(n):
            for j in range(i + 1, n):
                a, b = self.rooms[i]['rect'], self.rooms[j]['rect']
                for o in ('v', 'h'):
                    if o == 'v':
                        if abs(a[2] - b[0]) < 1e-6 or abs(b[2] - a[0]) < 1e-6:
                            p = a[2] if abs(a[2] - b[0]) < 1e-6 else a[0]
                            lo, hi = max(a[1], b[1]), min(a[3], b[3])
                        else:
                            continue
                    else:
                        if abs(a[3] - b[1]) < 1e-6 or abs(b[3] - a[1]) < 1e-6:
                            p = a[3] if abs(a[3] - b[1]) < 1e-6 else a[1]
                            lo, hi = max(a[0], b[0]), min(a[2], b[2])
                        else:
                            continue
                    if hi - lo > 1.15:
                        adj.append((i, j, o, p, lo, hi))
        rnd.shuffle(adj)
        # Le séjour (0) se relie en premier.
        parent = list(range(n))
        def f(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        used = []
        for e in adj:
            if f(e[0]) != f(e[1]):
                parent[f(e[0])] = f(e[1])
                used.append(e)
            elif rnd.random() < 0.12:
                used.append(e)
        for (i, j, o, p, lo, hi) in used:
            kinds = (self.rooms[i]['kind'], self.rooms[j]['kind'])
            if 'placard' in kinds and rnd.random() < 0.5:
                typ, wd = 'coulissante', min(r5(hi - lo - 0.3), rnd.choice([1.2, 1.4, 1.6]))
            elif rnd.random() < 0.12 and hi - lo > 1.6:
                typ, wd = 'passage', r5(rnd.uniform(0.9, min(2.4, hi - lo - 0.3)))
            else:
                typ, wd = 'porte', rnd.choice([0.73, 0.83, 0.83, 0.93])
            wd = min(wd, hi - lo - 0.25)
            if wd < 0.6:
                continue
            c = rnd.uniform(lo + 0.12 + wd / 2, hi - 0.12 - wd / 2)
            ops.append({'type': typ, 'o': o, 'p': p, 'c': c, 'w': wd,
                        'swing': rnd.choice([-1, 1]), 'hinge': rnd.choice([-1, 1])})
        # Fenêtres sur les murs extérieurs.
        entree_faite = False
        for w in self.walls:
            if not w['ext']:
                continue
            L = w['hi'] - w['lo']
            pos = w['lo'] + 0.5
            while pos < w['hi'] - 1.0:
                if rnd.random() < 0.45:
                    wd = rnd.choice([0.6, 0.8, 1.0, 1.2, 1.4, 1.8, 2.4])
                    if pos + wd + 0.3 > w['hi']:
                        break
                    if not entree_faite and rnd.random() < 0.25:
                        typ, wd = 'porte_entree', 0.93
                        entree_faite = True
                    else:
                        typ = 'porte_fenetre' if wd >= 1.8 and rnd.random() < 0.6 else 'fenetre'
                    # Ne pas couper une jonction de cloison.
                    c = pos + wd / 2
                    ok = True
                    for x in self.walls:
                        if x['o'] != w['o'] and x['lo'] - 0.01 <= w['p'] <= x['hi'] + 0.01 and abs(x['p'] - c) < wd / 2 + 0.2:
                            ok = False
                    if ok:
                        ops.append({'type': typ, 'o': w['o'], 'p': w['p'], 'c': c, 'w': wd,
                                    'swing': rnd.choice([-1, 1]), 'hinge': rnd.choice([-1, 1])})
                    pos += wd + rnd.uniform(0.6, 2.0)
                else:
                    pos += rnd.uniform(0.6, 1.5)
        self.openings = ops


# ------------------------------------------------------------------ le dessin

class Dessin:
    def __init__(self, plan, style, rnd):
        self.plan, self.style, self.rnd = plan, style, rnd
        self.ppm = rnd.uniform(110, 190) if style != 'croquis' else rnd.uniform(90, 140)
        if plan.dense:
            # Une grande maison sur une feuille : 2 200 à 3 000 pixels de long.
            self.ppm = rnd.uniform(2200, 3000) / (max(plan.W, plan.D) + 5)
        marge = 2.2
        extra_cart = 4.0 if style in ('archi', 'electricien', 'constructeur', 'gris', 'hachure') and rnd.random() < 0.7 else 0
        self.ox = marge * self.ppm
        self.oz = marge * self.ppm
        Wp = int((plan.W + 2 * marge + extra_cart) * self.ppm)
        Hp = int((plan.D + 2 * marge) * self.ppm)
        self.cartouche_x = (plan.W + 2 * marge) * self.ppm if extra_cart else None
        self.size = (Wp, Hp)
        self.textes = []
        paper = (255, 255, 255)
        if style == 'notaire':
            paper = (246, 240, 222)
        self.img = Image.new('RGB', self.size, paper)
        self.d = ImageDraw.Draw(self.img)
        self.ink = (20, 20, 20)
        self.cote_col = (40, 90, 200) if style in ('archi', 'electricien') else (30, 30, 30)
        if style == 'notaire':
            self.ink = (60, 50, 40)
            self.cote_col = (60, 50, 40)
        if style == 'anglo':
            self.cote_col = (20, 20, 20)
        fam = {'archi': 'sans', 'contour': 'inter', 'hachure': 'sans', 'gris': 'inter', 'croquis': 'obl',
               'notaire': 'serif', 'photo': 'sans', 'electricien': 'sans', 'constructeur': 'interb', 'anglo': 'mono'}[style]
        self.font_path = FONTS[fam]
        self.font_b = FONTS['sansb'] if fam in ('sans', 'serif', 'obl') else FONTS['interb']

    def P(self, x, z):
        return (self.ox + x * self.ppm, self.oz + z * self.ppm)

    def font(self, size_m, bold=False):
        return ImageFont.truetype(self.font_b if bold else self.font_path, max(9, int(size_m * self.ppm)))

    def text(self, xy, s, size_m=0.22, bold=False, col=None, anchor='mm', angle=0, record=True):
        f = self.font(size_m, bold)
        col = col or self.ink
        if angle == 0:
            self.d.text(xy, s, font=f, fill=col, anchor=anchor)
        else:
            bbox = self.d.textbbox((0, 0), s, font=f, anchor='lt')
            w, h = bbox[2] - bbox[0] + 4, bbox[3] - bbox[1] + 4
            tmp = Image.new('L', (w, h), 0)
            ImageDraw.Draw(tmp).text((2, 2), s, font=f, fill=255, anchor='lt')
            tmp = tmp.rotate(angle, expand=True)
            px = int(xy[0] - tmp.size[0] / 2)
            py = int(xy[1] - tmp.size[1] / 2)
            self.img.paste(Image.new('RGB', tmp.size, col), (px, py), tmp)
        if record:
            for k, mot in enumerate(s.split()):
                self.textes.append({'t': mot, 'x': xy[0], 'y': xy[1] + k * 0})

    # ---- les murs
    def wall_mask(self):
        p = self.plan
        m = Image.new('L', self.size, 0)
        md = ImageDraw.Draw(m)
        for w in p.walls:
            e = w['ep'] / 2
            # Les murs se prolongent d'une demi-épaisseur aux bouts (jonctions pleines).
            ext_lo = self._ext_at(w, w['lo'])
            ext_hi = self._ext_at(w, w['hi'])
            if w['o'] == 'h':
                a = self.P(w['lo'] - ext_lo, w['p'] - e)
                b = self.P(w['hi'] + ext_hi, w['p'] + e)
            else:
                a = self.P(w['p'] - e, w['lo'] - ext_lo)
                b = self.P(w['p'] + e, w['hi'] + ext_hi)
            md.rectangle([a, b], fill=255)
        # Les baies coupent le mur.
        for o in p.openings:
            e = (p.ep_at(o['o'], o['p'], o['c']) or p.ep_cl) / 2 + 0.01
            if o['o'] == 'h':
                a = self.P(o['c'] - o['w'] / 2, o['p'] - e)
                b = self.P(o['c'] + o['w'] / 2, o['p'] + e)
            else:
                a = self.P(o['p'] - e, o['c'] - o['w'] / 2)
                b = self.P(o['p'] + e, o['c'] + o['w'] / 2)
            md.rectangle([a, b], fill=0)
        return m

    def _ext_at(self, w, v):
        """Demi-épaisseur du mur perpendiculaire au bout v (0 si aucun)."""
        best = 0
        for x in self.plan.walls:
            if x['o'] == w['o']:
                continue
            if abs(x['p'] - v) < 1e-6 and x['lo'] - 1e-6 <= w['p'] <= x['hi'] + 1e-6:
                best = max(best, x['ep'] / 2)
        return best

    def draw_walls(self):
        st = self.style
        m = self.wall_mask()
        ext = Image.new('L', self.size, 0)
        ed = ImageDraw.Draw(ext)
        # Masque des murs porteurs / extérieurs (épaisseur > 0.12).
        for w in self.plan.walls:
            if w['ep'] > 0.12:
                e = w['ep'] / 2
                el, eh = self._ext_at(w, w['lo']), self._ext_at(w, w['hi'])
                if w['o'] == 'h':
                    ed.rectangle([self.P(w['lo'] - el, w['p'] - e), self.P(w['hi'] + eh, w['p'] + e)], fill=255)
                else:
                    ed.rectangle([self.P(w['p'] - e, w['lo'] - el), self.P(w['p'] + e, w['hi'] + eh)], fill=255)
        from PIL import ImageChops
        ext = ImageChops.multiply(ext, m)
        cl = ImageChops.subtract(m, ext)
        lw = max(1, int(self.ppm * 0.012))
        outline = ImageChops.subtract(m.filter(ImageFilter.MaxFilter(2 * lw + 1)), m)
        if st in ('archi', 'electricien'):
            self.img.paste(self.ink, mask=ext)
            self.img.paste((185, 185, 185), mask=cl)
            self.img.paste(self.ink, mask=outline)
        elif st in ('contour', 'constructeur', 'anglo'):
            self.img.paste(self.ink, mask=outline)
            if st == 'constructeur':
                self.img.paste((120, 120, 120), mask=ext.point(lambda v: v // 3))
        elif st == 'hachure':
            hat = Image.new('L', self.size, 0)
            hd = ImageDraw.Draw(hat)
            step = max(5, int(self.ppm * 0.06))
            for k in range(-self.size[1], self.size[0], step):
                hd.line([(k, 0), (k + self.size[1], self.size[1])], fill=255, width=max(1, lw // 2 + 1))
            self.img.paste(self.ink, mask=ImageChops.multiply(hat, m))
            self.img.paste(self.ink, mask=outline)
        elif st == 'gris':
            self.img.paste((110, 110, 110), mask=ext)
            self.img.paste((150, 150, 150), mask=cl)
        elif st == 'notaire':
            self.img.paste(self.ink, mask=outline)
            self.img.paste((90, 80, 70), mask=ext)
        elif st == 'photo':
            self.img.paste(self.ink, mask=ext)
            self.img.paste(self.ink, mask=outline)
        elif st == 'croquis':
            # Traits à main levée : chaque bord, tremblé.
            edges = outline
            self.img.paste(self.ink, mask=edges.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 255 if v > 60 else 0))
            self._wobble_overdraw()

    def _wobble_overdraw(self):
        rnd = self.rnd
        for w in self.plan.walls:
            e = w['ep'] / 2
            for s in (-1, 1):
                pts = []
                n = 12
                for k in range(n + 1):
                    t = w['lo'] + (w['hi'] - w['lo']) * k / n
                    j = rnd.gauss(0, 0.012)
                    if w['o'] == 'h':
                        pts.append(self.P(t, w['p'] + s * e + j))
                    else:
                        pts.append(self.P(w['p'] + s * e + j, t))
                self.d.line(pts, fill=self.ink, width=max(1, int(self.ppm * 0.01)))

    def draw_openings(self):
        p = self.plan
        lw = max(1, int(self.ppm * 0.008))
        for o in p.openings:
            ep = p.ep_at(o['o'], o['p'], o['c']) or p.ep_cl
            e = ep / 2
            h = o['o'] == 'h'
            def Q(t, n):  # t le long du mur, n en travers
                return self.P(t, o['p'] + n) if h else self.P(o['p'] + n, t)
            a, b = o['c'] - o['w'] / 2, o['c'] + o['w'] / 2
            if o['type'] in ('fenetre', 'porte_fenetre'):
                for n in (-e, -e / 3, e / 3, e):
                    self.d.line([Q(a, n), Q(b, n)], fill=self.ink, width=lw)
                self.d.line([Q(a, -e), Q(a, e)], fill=self.ink, width=lw)
                self.d.line([Q(b, -e), Q(b, e)], fill=self.ink, width=lw)
                if o['type'] == 'porte_fenetre' and self.style != 'anglo':
                    # Deux vantaux et leurs arcs.
                    s = o['swing']
                    r = o['w'] / 2
                    self._arc(Q, a, s * e, r, s, 1)
                    self._arc(Q, b, s * e, r, s, -1)
            elif o['type'] in ('porte', 'porte_entree'):
                s = o['swing']
                hg = o['hinge']
                piv = a if hg < 0 else b
                self._arc(Q, piv, s * e, o['w'], s, 1 if hg < 0 else -1)
                if self.style in ('archi', 'electricien', 'constructeur'):
                    self.d.line([Q(a, -e), Q(a, e)], fill=self.ink, width=lw)
                    self.d.line([Q(b, -e), Q(b, e)], fill=self.ink, width=lw)
            elif o['type'] == 'coulissante':
                self.d.line([Q(a, -e / 3), Q(o['c'] + 0.05, -e / 3)], fill=self.ink, width=lw * 2)
                self.d.line([Q(o['c'] - 0.05, e / 3), Q(b, e / 3)], fill=self.ink, width=lw * 2)
            elif o['type'] == 'passage':
                if self.style in ('archi', 'contour', 'constructeur'):
                    self._dashed(Q(a, -e), Q(b, -e), lw)
                    self._dashed(Q(a, e), Q(b, e), lw)

    def _arc(self, Q, piv, n0, r, s, dirn):
        """Un battant : la feuille perpendiculaire au mur, et le quart de cercle."""
        lw = max(1, int(self.ppm * 0.007))
        pts = []
        for k in range(0, 31):
            ang = math.pi / 2 * k / 30
            t = piv + dirn * r * math.cos(ang)
            n = n0 + s * r * math.sin(ang)
            pts.append(Q(t, n))
        thin = max(1, lw // 2) if self.style != 'croquis' else lw
        self.d.line(pts, fill=self.ink, width=thin)
        self.d.line([Q(piv, n0), Q(piv, n0 + s * r)], fill=self.ink, width=lw + 1)

    def _dashed(self, A, B, lw):
        L = math.dist(A, B)
        n = max(1, int(L / 12))
        for k in range(0, n, 2):
            t0, t1 = k / n, min(1, (k + 1) / n)
            self.d.line([(A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0),
                         (A[0] + (B[0] - A[0]) * t1, A[1] + (B[1] - A[1]) * t1)], fill=self.ink, width=lw)

    # ---- les pièces, les meubles
    def fmt_m(self, v, mode):
        if mode == 'cm':
            return str(int(round(v * 100)))
        if mode == 'm':
            return f'{v:.2f}'.replace('.', ',')
        if mode == 'mm':
            return str(int(round(v * 1000)))
        if mode == 'dot':
            return f'{v:.2f}'
        if mode == 'ft':
            inches = int(round(v / 0.0254))
            return f"{inches // 12}'-{inches % 12}\""
        return f'{v:.2f}'

    def draw_rooms(self):
        rnd = self.rnd
        p = self.plan
        noms = NOMS_EN if self.style == 'anglo' else NOMS_FR
        for r in p.rooms:
            x0, z0, x1, z1 = p.inner(r['rect'])
            area = (x1 - x0) * (z1 - z0)
            nom = rnd.choice(noms[r['kind']])
            if r['kind'] == 'chambre' and r['n'] >= 1 and self.style != 'anglo':
                nom = f'{nom} {r["n"]}' if rnd.random() < 0.8 else nom
            r['nom'] = nom
            r['inner'] = (x0, z0, x1, z1)
            r['area'] = area
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
            # Le nom pas toujours au centre exact.
            cx += rnd.uniform(-0.2, 0.2) * (x1 - x0)
            cz += rnd.uniform(-0.15, 0.15) * (z1 - z0)
            size = min(0.24, (x1 - x0) / max(4, len(nom)) * 1.4)
            self.text(self.P(cx, cz), nom, size, bold=self.style in ('archi', 'electricien', 'gris'))
            if self.style != 'croquis' or rnd.random() < 0.5:
                s = f'{area:.2f} m²'.replace('.', ',') if self.style != 'anglo' else f'{area / 0.0929:.0f} sq ft'
                if self.style == 'constructeur':
                    s = f'{area:.1f} m2'.replace('.', ',')
                self.text(self.P(cx, cz + size * 1.2), s, size * 0.8)
            self._furnish(r)

    def _furnish(self, r):
        rnd = self.rnd
        x0, z0, x1, z1 = r['inner']
        lw = max(1, int(self.ppm * 0.005))
        col = (90, 90, 90) if self.style != 'notaire' else (110, 100, 90)
        k = r['kind']
        def rect(a, b, c, d_, fill=None):
            self.d.rectangle([self.P(a, b), self.P(c, d_)], outline=col, width=lw, fill=fill)
        w, d = x1 - x0, z1 - z0
        if k == 'chambre' and w > 2.4 and d > 2.4:
            bx = x0 + w / 2 - 0.8
            rect(bx, z0 + 0.05, bx + 1.6, z0 + 2.05)
            rect(bx + 0.1, z0 + 0.12, bx + 0.75, z0 + 0.5)
            rect(bx + 0.85, z0 + 0.12, bx + 1.5, z0 + 0.5)
            if rnd.random() < 0.5:
                rect(x1 - 0.65, z1 - 1.6, x1 - 0.05, z1 - 0.1)  # armoire
        elif k == 'sejour' and w > 3 and d > 3:
            rect(x0 + 0.5, z0 + 0.6, x0 + 2.6, z0 + 1.5)  # canapé
            rect(x0 + 0.9, z0 + 1.9, x0 + 2.1, z0 + 2.5)
            cx, cz = x0 + w * 0.7, z0 + d * 0.6
            self.d.ellipse([self.P(cx - 0.6, cz - 0.6), self.P(cx + 0.6, cz + 0.6)], outline=col, width=lw)
            for a in range(0, 360, 60):
                ax, az = cx + 0.85 * math.cos(math.radians(a)), cz + 0.85 * math.sin(math.radians(a))
                rect(ax - 0.2, az - 0.2, ax + 0.2, az + 0.2)
        elif k == 'cuisine':
            if w > d:
                rect(x0 + 0.02, z0 + 0.02, x1 - 0.02, z0 + 0.62)
                for t in range(1, int(w / 0.6)):
                    self.d.line([self.P(x0 + t * 0.6, z0 + 0.02), self.P(x0 + t * 0.6, z0 + 0.62)], fill=col, width=lw)
            else:
                rect(x0 + 0.02, z0 + 0.02, x0 + 0.62, z1 - 0.02)
            self.d.ellipse([self.P(x0 + 0.3, z0 + 0.15), self.P(x0 + 0.55, z0 + 0.4)], outline=col, width=lw)
        elif k == 'sdb':
            if w >= 1.75:
                rect(x0 + 0.03, z0 + 0.03, x0 + 1.73, z0 + 0.73)
                self.d.ellipse([self.P(x0 + 0.2, z0 + 0.12), self.P(x0 + 1.55, z0 + 0.64)], outline=col, width=lw)
            rect(x1 - 0.6, z1 - 0.5, x1 - 0.05, z1 - 0.05)
            self.d.ellipse([self.P(x1 - 0.5, z1 - 0.42), self.P(x1 - 0.15, z1 - 0.13)], outline=col, width=lw)
        elif k == 'wc':
            cx = x0 + w / 2
            rect(cx - 0.2, z0 + 0.03, cx + 0.2, z0 + 0.2)
            self.d.ellipse([self.P(cx - 0.18, z0 + 0.2), self.P(cx + 0.18, z0 + 0.65)], outline=col, width=lw)
        elif k == 'placard':
            self.d.line([self.P(x0, z0), self.P(x1, z1)], fill=col, width=lw)
            self.d.line([self.P(x0, z1), self.P(x1, z0)], fill=col, width=lw)

    # ---- les cotes
    def cote(self, a, b, txt, off_dir, ref, col=None, size=0.17, out=None):
        """Ligne de cote de a à b (mètres), décalée ; rend la ligne réellement tracée."""
        col = col or self.cote_col
        lw = max(1, int(self.ppm * 0.004))
        A, B = self.P(*a), self.P(*b)
        self.d.line([A, B], fill=col, width=lw)
        horiz = abs(A[1] - B[1]) < 1
        tick = self.ppm * 0.07
        for Pp in (A, B):
            if self.style == 'anglo':
                self.d.ellipse([Pp[0] - 3, Pp[1] - 3, Pp[0] + 3, Pp[1] + 3], fill=col)
            else:
                self.d.line([(Pp[0] - tick, Pp[1] + tick), (Pp[0] + tick, Pp[1] - tick)], fill=col, width=lw + 1)
        mid = ((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)
        g = self.ppm * size * 0.75
        if horiz:
            self.text((mid[0], mid[1] - g), txt, size, col=col)
        else:
            self.text((mid[0] - g, mid[1]), txt, size, col=col, angle=90)
        if out is not None:
            out.append({'texte': txt, 'a': a, 'b': b, 'reference': ref})

    def draw_cotes(self):
        rnd = self.rnd
        p = self.plan
        mode = {'archi': 'm', 'contour': 'cm', 'hachure': 'm', 'gris': 'm', 'croquis': 'm', 'notaire': 'm',
                'photo': 'm', 'electricien': 'm', 'constructeur': 'cm', 'anglo': 'ft'}[self.style]
        if self.style == 'contour' and rnd.random() < 0.4:
            mode = 'mm'
        if self.style in ('photo', 'hachure') and rnd.random() < 0.3:
            mode = 'dot'
        self.cote_mode = mode
        self.cotes = []
        e = p.ep_ext
        # Hors tout en haut et à gauche.
        zt = -e / 2 - 1.3
        self.cote((-e / 2, zt), (p.W + e / 2, zt), self.fmt_m(p.W + e, mode), 'n', 'exterieur', out=self.cotes)
        xl = -e / 2 - 1.3
        self.cote((xl, -e / 2), (xl, p.D + e / 2), self.fmt_m(p.D + e, mode), 'w', 'exterieur', out=self.cotes)
        # Chaîne du haut : nus des murs verticaux qui touchent le mur du haut.
        if rnd.random() < 0.85:
            zs = -e / 2 - 0.7
            xs = sorted({w['p'] for w in p.walls if w['o'] == 'v' and w['lo'] < 0.01})
            faces = []
            for x in xs:
                ep = p.ep_at('v', x, 0.3) or p.ep_cl
                faces += [x - ep / 2, x + ep / 2]
            for a, b in zip(faces, faces[1:]):
                if b - a > 0.05:
                    self.cote((a, zs), (b, zs), self.fmt_m(b - a, mode), 'n', 'interieur' if b - a > 0.4 else 'inconnu',
                              out=self.cotes, size=0.14)
        if rnd.random() < 0.85:
            xs_ = -e / 2 - 0.7
            zz = sorted({w['p'] for w in p.walls if w['o'] == 'h' and w['lo'] < 0.01})
            faces = []
            for z in zz:
                ep = p.ep_at('h', z, 0.3) or p.ep_cl
                faces += [z - ep / 2, z + ep / 2]
            for a, b in zip(faces, faces[1:]):
                if b - a > 0.05:
                    self.cote((xs_, a), (xs_, b), self.fmt_m(b - a, mode), 'w', 'interieur' if b - a > 0.4 else 'inconnu',
                              out=self.cotes, size=0.14)
        # Cotes intérieures de pièces.
        for r in p.rooms:
            if rnd.random() < 0.55 and self.style != 'anglo':
                x0, z0, x1, z1 = r['inner']
                zc = z0 + (z1 - z0) * rnd.uniform(0.2, 0.35)
                self.cote((x0, zc), (x1, zc), self.fmt_m(x1 - x0, mode), 'n', 'interieur', out=self.cotes, size=0.14)
            if rnd.random() < 0.4 and self.style != 'anglo':
                x0, z0, x1, z1 = r['inner']
                xc = x0 + (x1 - x0) * rnd.uniform(0.65, 0.8)
                self.cote((xc, z0), (xc, z1), self.fmt_m(z1 - z0, mode), 'w', 'interieur', out=self.cotes, size=0.14)
        # Anglo : chaîne extérieure aussi en bas.
        if self.style == 'anglo':
            for r in p.rooms:
                x0, z0, x1, z1 = r['inner']
                self.text(self.P((x0 + x1) / 2, (z0 + z1) / 2 + 0.45),
                          f"{self.fmt_m(x1 - x0, 'ft')} x {self.fmt_m(z1 - z0, 'ft')}", 0.13)

    def draw_extras(self):
        rnd = self.rnd
        p = self.plan
        # Cartouche.
        if self.cartouche_x:
            x = self.cartouche_x
            y0 = self.size[1] * 0.55
            self.d.rectangle([x + 20, y0, self.size[0] - 30, self.size[1] - 40], outline=self.ink, width=2)
            f = self.ppm * 0.22
            lignes = ['PLAN DU REZ-DE-CHAUSSÉE', 'Maison individuelle', 'Échelle 1/50', 'Indice B', 'Date : 12/03/2026',
                      'Cabinet d\'architecture', 'Phase : DCE']
            for k, s in enumerate(lignes):
                self.text((x + 40, y0 + 30 + k * f * 1.6), s, 0.2, anchor='lm')
            # Petit plan de situation pour piéger.
            sx, sy = x + 40, self.size[1] * 0.1
            self.d.rectangle([sx, sy, sx + self.ppm * 2.5, sy + self.ppm * 1.8], outline=self.ink, width=3)
            self.d.line([(sx + self.ppm * 1.2, sy), (sx + self.ppm * 1.2, sy + self.ppm * 1.8)], fill=self.ink, width=2)
            self.text((sx + self.ppm * 1.25, sy + self.ppm * 2.1), 'Plan masse', 0.18)
        # Rose des vents.
        if rnd.random() < 0.5:
            cx, cy = self.size[0] - self.ppm * 1.0, self.ppm * 1.0
            self.d.polygon([(cx, cy - 40), (cx - 12, cy + 20), (cx, cy + 10), (cx + 12, cy + 20)], outline=self.ink, fill=self.ink)
            self.text((cx, cy - 55), 'N', 0.2)
        # Escalier dans une pièce ?
        if rnd.random() < 0.3:
            r = rnd.choice(p.rooms)
            x0, z0, x1, z1 = r['inner']
            if x1 - x0 > 2.0 and z1 - z0 > 1.5:
                for k in range(10):
                    xx = x0 + 0.1 + k * 0.26
                    if xx > x1 - 0.2:
                        break
                    self.d.line([self.P(xx, z1 - 1.0), self.P(xx, z1 - 0.1)], fill=self.ink, width=1)
                self.d.line([self.P(x0 + 0.1, z1 - 0.55), self.P(x0 + 2.2, z1 - 0.55)], fill=self.ink, width=1)

    def draw_symbols(self):
        """Plan d'électricien : prises, interrupteurs, DCL, en rouge."""
        rnd = self.rnd
        p = self.plan
        col = (210, 30, 30)
        self.symboles = []
        for r in p.rooms:
            x0, z0, x1, z1 = r['inner']
            for _ in range(rnd.randint(1, 4)):
                side = rnd.choice(['n', 's', 'e', 'w'])
                if side in 'ns':
                    x = rnd.uniform(x0 + 0.3, x1 - 0.3)
                    z = z0 + 0.15 if side == 'n' else z1 - 0.15
                else:
                    z = rnd.uniform(z0 + 0.3, z1 - 0.3)
                    x = x0 + 0.15 if side == 'w' else x1 - 0.15
                c = self.P(x, z)
                rr = self.ppm * 0.09
                self.d.arc([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], 0, 180, fill=col, width=2)
                self.d.line([(c[0] - rr, c[1]), (c[0] + rr, c[1])], fill=col, width=2)
            c = self.P((x0 + x1) / 2, (z0 + z1) / 2 - 0.5)
            rr = self.ppm * 0.1
            self.d.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], outline=col, width=2)
            self.d.line([(c[0] - rr * .7, c[1] - rr * .7), (c[0] + rr * .7, c[1] + rr * .7)], fill=col, width=2)
            self.d.line([(c[0] - rr * .7, c[1] + rr * .7), (c[0] + rr * .7, c[1] - rr * .7)], fill=col, width=2)

    def finish(self):
        self.angle = 0.0
        img = self.img
        rnd = self.rnd
        if self.style == 'photo':
            # Éclairage inégal, flou, bruit, légère rotation, JPEG.
            W, H = img.size
            grad = Image.linear_gradient('L').resize((W, H)).rotate(rnd.uniform(0, 360))
            grad = grad.point(lambda v: 200 + v * 55 // 255)
            img = Image.composite(img, Image.new('RGB', img.size, (0, 0, 0)), grad)
            img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.8, 1.6)))
            self.angle = rnd.uniform(-2.5, 2.5)
            img = img.rotate(self.angle, expand=False, fillcolor=(200, 200, 195), resample=Image.BICUBIC)
            self.rot = True
        elif self.style == 'notaire':
            img = img.filter(ImageFilter.GaussianBlur(0.7))
            self.angle = rnd.uniform(-1.2, 1.2)
            img = img.rotate(self.angle, expand=False, fillcolor=(246, 240, 222), resample=Image.BICUBIC)
        elif self.style == 'croquis':
            self.angle = rnd.uniform(-1.5, 1.5)
            img = img.rotate(self.angle, expand=False, fillcolor=(255, 255, 255), resample=Image.BICUBIC)
        self.img = img


def photographier(img, rnd):
    """Une feuille photographiée puis redressée : un reste de perspective,
    une lumière inégale, un peu de flou, du grain, une compression."""
    W, H = img.size
    e = 0.025
    dx = lambda: rnd.uniform(-e, e) * W
    dy = lambda: rnd.uniform(-e, e) * H
    quad = (dx(), dy(), dx(), H + dy(), W + dx(), H + dy(), W + dx(), dy())
    img = img.transform((W, H), Image.QUAD, quad, resample=Image.BICUBIC, fillcolor=(205, 200, 190))
    photographier.quad = quad
    grad = Image.linear_gradient('L').resize((W, H)).rotate(rnd.uniform(0, 360))
    grad = grad.point(lambda v: 185 + v * 70 // 255)
    img = Image.composite(img, Image.new('RGB', img.size, (40, 35, 30)), grad)
    img = img.filter(ImageFilter.GaussianBlur(rnd.uniform(0.7, 1.4)))
    import io
    b = io.BytesIO()
    img.save(b, 'JPEG', quality=rnd.randint(55, 75))
    return Image.open(io.BytesIO(b.getvalue())).convert('RGB')


def generer(dossier, graine, style=None, dense=False, photo=False):
    rnd = random.Random(graine)
    style = style or STYLES[graine % len(STYLES)]
    plan = Plan(rnd, dense)
    d = Dessin(plan, style, rnd)
    d.draw_walls()
    d.draw_openings()
    d.draw_rooms()
    d.draw_cotes()
    d.draw_extras()
    if style == 'electricien':
        d.draw_symbols()
    d.finish()
    if photo:
        d.img = photographier(d.img, rnd)
    os.makedirs(dossier, exist_ok=True)
    d.img.save(os.path.join(dossier, 'plan.png'))
    W, H = d.img.size
    verite = {
        'style': style,
        'graine': graine,
        'image': {'largeur': W, 'hauteur': H},
        'ppm': d.ppm,
        'origine_px': [d.ox, d.oz],
        'murs': [
            ({'a': [w['lo'], w['p']], 'b': [w['hi'], w['p']]} if w['o'] == 'h' else {'a': [w['p'], w['lo']], 'b': [w['p'], w['hi']]})
            | {'ep': w['ep'], 'exterieur': w['ext']}
            for w in plan.walls
        ],
        'ouvertures': [
            {'type': o['type'],
             'a': [o['c'] - o['w'] / 2, o['p']] if o['o'] == 'h' else [o['p'], o['c'] - o['w'] / 2],
             'b': [o['c'] + o['w'] / 2, o['p']] if o['o'] == 'h' else [o['p'], o['c'] + o['w'] / 2],
             'largeur': o['w']}
            for o in plan.openings
        ],
        'pieces': [{'nom': r['nom'], 'genre': r['kind'], 'interieur': r['inner'], 'surface': r['area']} for r in plan.rooms],
        'cotes_mode': d.cote_mode,
        'cotes': d.cotes,
    }
    # La lecture parfaite (sans rotation) : le plafond du banc.
    def mil(x, z):
        X, Y = d.P(x, z)
        return [round(X / W * 1000, 1), round(Y / H * 1000, 1)]
    parfaite = {
        'est_un_plan': True,
        'murs': [mil(*m['a']) + mil(*m['b']) + [round(m['ep'] * d.ppm / W * 1000, 2)] for m in verite['murs']],
        'ouvertures': [{'type': {'porte_entree': 'porte d\'entrée', 'porte_fenetre': 'porte-fenêtre',
                                  'coulissante': 'porte coulissante'}.get(o['type'], o['type']),
                        'a': mil(*o['a']), 'b': mil(*o['b'])} for o in verite['ouvertures']],
        'cotes': [{'texte': c['texte'], 'a': mil(*c['a']), 'b': mil(*c['b']), 'reference': c['reference']} for c in d.cotes],
        'pieces': [{'nom': r['nom'], 'point': mil((r['inner'][0] + r['inner'][2]) / 2, (r['inner'][1] + r['inner'][3]) / 2),
                    'surface': f"{r['area']:.2f} m²".replace('.', ','),
                    'contour': [mil(r['inner'][0], r['inner'][1]), mil(r['inner'][2], r['inner'][1]),
                                mil(r['inner'][2], r['inner'][3]), mil(r['inner'][0], r['inner'][3])]} for r in plan.rooms],
    }
    with open(os.path.join(dossier, 'lecture_parfaite.json'), 'w') as f:
        json.dump(parfaite, f, ensure_ascii=False)
    with open(os.path.join(dossier, 'verite.json'), 'w') as f:
        json.dump(verite, f, ensure_ascii=False, indent=1)
    # Les textes suivent la feuille : la rotation, puis la perspective.
    def suivre(x, y):
        a = math.radians(d.angle)
        cx, cy = W / 2, H / 2
        x, y = cx + (x - cx) * math.cos(a) + (y - cy) * math.sin(a), cy - (x - cx) * math.sin(a) + (y - cy) * math.cos(a)
        if photo:
            q = photographier.quad  # sortie (u, v) -> source : bilinéaire des coins
            src = lambda u, v: ((1 - u) * (1 - v) * q[0] + (1 - u) * v * q[2] + u * v * q[4] + u * (1 - v) * q[6],
                                (1 - u) * (1 - v) * q[1] + (1 - u) * v * q[3] + u * v * q[5] + u * (1 - v) * q[7])
            u, v = x / W, y / H
            for _ in range(20):
                sx, sy = src(u, v)
                u -= (sx - x) / W
                v -= (sy - y) / H
            x, y = u * W, v * H
        return x, y
    textes = []
    for t in d.textes:
        x, y = suivre(t['x'], t['y'])
        textes.append({'t': t['t'], 'x': round(x / W * 1000), 'y': round(y / H * 1000)})
    with open(os.path.join(dossier, 'textes.json'), 'w') as f:
        json.dump(textes, f, ensure_ascii=False)
    return verite


if __name__ == '__main__':
    dossier, graine = sys.argv[1], int(sys.argv[2])
    style = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != '-' else None
    dense = len(sys.argv) > 4 and sys.argv[4] == '1'
    photo = len(sys.argv) > 5 and sys.argv[5] == '1'
    v = generer(dossier, graine, style, dense, photo)
    print(v['style'], len(v['murs']), 'murs', len(v['ouvertures']), 'baies', len(v['pieces']), 'pièces', v['image'])
