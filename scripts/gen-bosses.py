# Draws the boss sprite sheets (pixel art in the style of Tiny Swords) into assets/ts/Boss_*.png.
# Each sheet: 272x272 frames, 6 columns; rows = idle, run, attack. Art is drawn on a 136x136 grid and scaled x2
# with nearest neighbour, so every "pixel" is a chunky 2x2 block like in the rest of the game.
# Usage: python scripts/gen-bosses.py [name ...]   (then python scripts/gen-art.py to pack into src/artData.ts)
import math, os, sys
from PIL import Image, ImageDraw, ImageChops, ImageFilter

W = 136  # canvas; figures are designed on a 96x96 area placed at (OX, OY) so swinging weapons have room
OX, OY = 20, 12
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'ts')
NAVY = (27, 22, 38, 255)


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c, o, k):
    return tuple(int(c[i] + (o[i] - c[i]) * k) for i in range(3)) + (255,)


def light(c): return mix(c, (255, 245, 220), 0.32)
def dark(c): return mix(c, (20, 10, 30), 0.38)


class Cv:
    """A 96x96 drawing: parts are painted back to front, each with a light top-left rim, a dark bottom-right rim and an outline."""

    def __init__(self):
        self.img = Image.new('RGBA', (W, W), (0, 0, 0, 0))

    def _fill(self, mask, color):
        self.img.paste(Image.new('RGBA', (W, W), color), (0, 0), mask)

    def part(self, fn, base, outline=NAVY, rim=2):
        base = hexc(base) if isinstance(base, str) else base
        m = Image.new('L', (W, W), 0)
        fn(ImageDraw.Draw(m))
        m = m.point(lambda v: 255 if v > 127 else 0)
        if outline:
            self._fill(ImageChops.subtract(m.filter(ImageFilter.MaxFilter(3)), m), outline)
        self._fill(m, dark(base))
        inner = ImageChops.multiply(m, ImageChops.offset(m, -rim, -rim))
        self._fill(inner, base)
        hl = ImageChops.subtract(m, ImageChops.offset(m, rim, rim))
        self._fill(ImageChops.multiply(hl, m), light(base))

    def flat(self, fn, color):
        """Unshaded shape (glows, eyes, effects), no outline."""
        color = hexc(color) if isinstance(color, str) else color
        m = Image.new('L', (W, W), 0)
        fn(ImageDraw.Draw(m))
        self._fill(m.point(lambda v: 255 if v > 127 else 0), color)

    def finish(self, outline=NAVY):
        a = self.img.getchannel('A')
        edge = ImageChops.subtract(a.filter(ImageFilter.MaxFilter(3)), a)
        self.img.paste(Image.new('RGBA', (W, W), outline), (0, 0), edge)
        return self.img


# ---- shape helpers (return functions for Cv.part / Cv.flat) ----
def poly(pts): return lambda d: d.polygon([(round(x) + OX, round(y) + OY) for x, y in pts], fill=255)
def ell(x0, y0, x1, y1): return lambda d: d.ellipse([round(x0) + OX, round(y0) + OY, round(x1) + OX, round(y1) + OY], fill=255)
def rect(x0, y0, x1, y1): return lambda d: d.rectangle([round(x0) + OX, round(y0) + OY, round(x1) + OX, round(y1) + OY], fill=255)
def many(*fns):
    def f(d):
        for g in fns: g(d)
    return f


def rotpts(pts, cx, cy, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def blade(x, y, deg, length, width, tip=True):
    """A blade/handle shape starting at (x, y) pointing along deg (0 = right, -90 = up)."""
    pts = [(x, y - width / 2), (x + length - (width if tip else 0), y - width / 2)]
    if tip: pts.append((x + length, y))
    pts += [(x + length - (width if tip else 0), y + width / 2), (x, y + width / 2)]
    return poly(rotpts(pts, x, y, deg))


def crescent(cx, cy, r0, r1, a0, a1):
    def f(d):
        x, y = cx + OX, cy + OY
        d.pieslice([x - r1, y - r1, x + r1, y + r1], a0, a1, fill=255)
        d.ellipse([x - r0, y - r0, x + r0, y + r0], fill=0)
    return f


def ease(p): return p * p * (3 - 2 * p)


def pose(row, t):
    """Shared pose numbers: row 0 idle, 1 run, 2 attack; t in 0..1."""
    s = math.sin(2 * math.pi * t)
    if row == 0:
        return dict(bob=round(1.3 * s), swing=0, lean=0, p=None, sway=round(2 * math.sin(2 * math.pi * t + 1)), flick=t)
    if row == 1:
        return dict(bob=round(2 * abs(s)) - 1, swing=s, lean=2, p=None, sway=round(3 * math.sin(2 * math.pi * t + 1)), flick=t * 2)
    return dict(bob=0, swing=0, lean=0, p=t, sway=round(2 * math.sin(2 * math.pi * t)), flick=t * 2)


def legs(c, P, skin, boot, x0=33, x1=52, w=11, top=66, foot=88, thick=None):
    for k, x in enumerate((x0, x1)):
        sw = P['swing'] * (1 if k == 0 else -1)
        dx = round(4 * sw); lift = max(0, round(3 * sw))
        c.part(rect(x + dx, top - P['bob'], x + dx + w, foot - lift - 5), skin)
        c.part(many(rect(x + dx - 1, foot - lift - 8, x + dx + w + 1, foot - lift)), boot)


# ======================================================== bosses ========================================================
def overlord(row, t):
    P = pose(row, t); b = P['bob']; c = Cv(); p = P['p']
    steel, trim, crim = '#4a4560', '#c9a23a', '#8c1a2e'
    sw = P['sway']
    # cape
    c.part(poly([(28, 42 - b), (68, 42 - b), (74 + sw, 84), (24 + sw, 86)]), crim)
    legs(c, P, '#3a3350', '#2a2438')
    # torso
    c.part(poly([(30, 40 - b), (66, 40 - b), (62, 69 - b), (34, 69 - b)]), steel)
    c.part(rect(44, 42 - b, 52, 68 - b), crim)
    c.part(rect(33, 64 - b, 63, 69 - b), trim)
    c.flat(rect(46, 52 - b, 50, 56 - b), '#ff4a2a')  # chest rune
    # left (away) arm
    ax = round(-2 * P['swing']) if row == 1 else 0
    c.part(rect(22 + ax, 44 - b, 30 + ax, 62 - b), steel)
    c.part(ell(20 + ax, 60 - b, 32 + ax, 70 - b), '#2f2a40')
    # head + horns + crown
    c.part(poly([(38, 25 - b), (26, 20 - b), (22, 8 - b), (30, 14 - b), (40, 20 - b)]), '#e8dcc0')
    c.part(poly([(58, 25 - b), (70, 20 - b), (74, 8 - b), (66, 14 - b), (56, 20 - b)]), '#e8dcc0')
    c.part(ell(36, 20 - b, 60, 44 - b), '#37324a')
    c.part(rect(39, 31 - b, 57, 36 - b), '#120d18', outline=None)
    c.flat(many(rect(41, 32 - b, 44, 34 - b), rect(52, 32 - b, 55, 34 - b)), '#ff5a2a')
    c.part(rect(40, 22 - b, 56, 24 - b), trim, outline=None)
    for i, x in enumerate((38, 43, 48, 53, 58)):
        h = 9 + round(4 * math.sin(2 * math.pi * P['flick'] + i * 1.7)) + (3 if i == 2 else 0)
        c.flat(poly([(x - 2, 21 - b), (x + 1, 21 - b - h), (x + 4, 21 - b)]), '#ff7a20' if i % 2 else '#ffcf3a')
    # pauldrons with spikes
    for sx, d in ((29, -1), (67, 1)):
        c.part(poly([(sx + d * 9, 38 - b), (sx + d * 16, 28 - b), (sx + d * 3, 34 - b)]), '#9a96b0')
        c.part(ell(sx - 9, 36 - b, sx + 9, 52 - b), crim)
    # sword arm + greatsword
    if p is None:
        beta = -78 + (6 * math.sin(2 * math.pi * t) if row == 0 else -14 * P['swing'])
    else:
        beta = -100 + 190 * ease(min(1, p / 0.8)) if p < 0.8 else 90 - 12 * (p - 0.8) / 0.2
    hx, hy = 70 + 8 * math.cos(math.radians(beta)) * 0.6, 56 - b + 6 * math.sin(math.radians(beta)) * 0.8
    c.part(rect(66, 44 - b, 74, 55 - b), steel)
    c.part(blade(hx, hy, beta, 44, 7), '#c3c8d8')
    c.flat(blade(hx + 3, hy, beta, 32, 2, tip=False), '#ff4a2a')
    c.part(many(*[blade(hx - 2 * math.cos(math.radians(beta)), hy - 2 * math.sin(math.radians(beta)), beta + 90, 6, 5, tip=False)]), trim)
    c.part(ell(hx - 4, hy - 4, hx + 4, hy + 4), '#2f2a40')
    if p is not None and 0.5 < p < 0.95:
        a1 = beta + 40; a0 = a1 - 70
        c.flat(crescent(66, 50 - b, 26, 42, a0, a1), (255, 238, 200, 255))
    return c.finish()


def forgemaster(row, t):
    P = pose(row, t); b = P['bob']; c = Cv(); p = P['p']
    skin, leather, iron = '#b0683a', '#6a4426', '#55525e'
    # furnace backpack + chimney
    c.part(rect(18, 34 - b, 36, 62 - b), '#4a3f3a')
    c.part(rect(22, 22 - b, 28, 36 - b), '#5a4f4a')
    c.flat(rect(21, 46 - b, 33, 52 - b), '#ff8a2a')
    for k in range(3):
        y = 20 - b - ((P['flick'] * 14 + k * 8) % 22)
        c.flat(rect(23 + k % 2 * 2, y, 25 + k % 2 * 2, y + 2), (150, 140, 135, 255) if k else (255, 190, 80, 255))
    legs(c, P, '#5a3a24', '#2f2420', w=12)
    # belly/torso with apron
    c.part(ell(28, 36 - b, 70, 72 - b), skin)
    c.part(poly([(34, 46 - b), (64, 46 - b), (62, 78 - b), (36, 78 - b)]), leather)
    c.part(rect(34, 46 - b, 64, 49 - b), '#c9a23a', outline=None)
    # head: bald, goggles, tusks
    c.part(ell(35, 14 - b, 63, 42 - b), skin)
    c.part(rect(35, 25 - b, 63, 32 - b), '#3a3a44', outline=None)
    c.flat(many(ell(38, 24 - b, 46, 33 - b), ell(52, 24 - b, 60, 33 - b)), '#ffcf3a')
    c.flat(many(rect(40, 27 - b, 43, 30 - b), rect(55, 27 - b, 58, 30 - b)), '#1b1626')
    c.part(many(poly([(41, 38 - b), (44, 38 - b), (42, 31 - b)]), poly([(54, 38 - b), (57, 38 - b), (56, 31 - b)])), '#efe6c8')
    # left arm (iron bracer) and big hammer arm
    c.part(rect(20, 44 - b, 30, 62 - b), skin); c.part(rect(20, 54 - b, 30, 62 - b), iron)
    if p is None:
        beta = -70 + (8 * math.sin(2 * math.pi * t) if row == 0 else -18 * P['swing'])
    else:
        beta = -110 + 200 * ease(min(1, p / 0.7)) if p < 0.7 else 90 - 10 * (p - 0.7) / 0.3
    hx, hy = 68 + 6 * math.cos(math.radians(beta)) * 0.7, 56 - b + 6 * math.sin(math.radians(beta))
    c.part(rect(62, 42 - b, 74, 58 - b), skin)
    c.part(blade(hx, hy, beta, 40, 5, tip=False), '#7a5a36')
    hhx, hhy = hx + 40 * math.cos(math.radians(beta)), hy + 40 * math.sin(math.radians(beta))
    c.part(poly(rotpts([(hhx - 8, hhy - 12), (hhx + 8, hhy - 12), (hhx + 8, hhy + 12), (hhx - 8, hhy + 12)], hhx, hhy, beta)), iron)
    c.flat(poly(rotpts([(hhx - 6, hhy - 10), (hhx + 6, hhy - 10), (hhx + 6, hhy - 5), (hhx - 6, hhy - 5)], hhx, hhy, beta)), '#ff8a2a')
    c.part(ell(hx - 4, hy - 4, hx + 4, hy + 4), skin)
    if p is not None and 0.55 < p < 0.95:
        c.flat(crescent(70, 52 - b, 24, 40, beta + 10, beta + 70), (255, 200, 120, 255))
    return c.finish()


def king(row, t):
    P = pose(row, t); b = P['bob']; c = Cv(); p = P['p']
    sw = P['sway']
    c.part(poly([(26, 40 - b), (70, 40 - b), (76 + sw, 84), (20 + sw, 86)]), '#a02030')  # royal cape
    legs(c, P, '#4f8a2a', '#3a2a1c', w=11)
    c.part(ell(26, 36 - b, 72, 76 - b), '#5e9a30')  # big belly
    c.part(poly([(34, 40 - b), (64, 40 - b), (62, 72 - b), (36, 72 - b)]), '#e8dcc0')  # fur trim
    c.part(rect(44, 42 - b, 52, 70 - b), '#a02030')
    c.part(ell(36, 16 - b, 62, 42 - b), '#6aa836')  # head
    c.flat(many(rect(41, 28 - b, 44, 31 - b), rect(52, 28 - b, 55, 31 - b)), '#ffcf3a')
    c.part(many(poly([(40, 40 - b), (44, 40 - b), (42, 33 - b)]), poly([(54, 40 - b), (58, 40 - b), (56, 33 - b)])), '#efe6c8')
    # crown
    pts = [(38, 18 - b)]
    for k in range(5):
        pts += [(38 + k * 5.5 + 1, 6 - b + (k % 2) * 4), (38 + k * 5.5 + 4, 18 - b)]
    c.part(poly([(38, 19 - b), (38, 8 - b), (43, 14 - b), (48, 5 - b), (53, 14 - b), (58, 8 - b), (58, 19 - b)]), '#ffcf3a')
    c.flat(many(rect(44, 15 - b, 46, 17 - b), rect(50, 15 - b, 52, 17 - b)), '#e0102a')
    c.part(rect(22, 44 - b, 30, 62 - b), '#5e9a30')
    if p is None:
        beta = -72 + (8 * math.sin(2 * math.pi * t) if row == 0 else -16 * P['swing'])
    else:
        beta = -105 + 195 * ease(min(1, p / 0.75)) if p < 0.75 else 90 - 8 * (p - 0.75) / 0.25
    hx, hy = 70 + 6 * math.cos(math.radians(beta)) * 0.7, 56 - b + 6 * math.sin(math.radians(beta))
    c.part(rect(64, 44 - b, 74, 58 - b), '#5e9a30')
    c.part(blade(hx, hy, beta, 30, 5, tip=False), '#8a5a2a')
    sx, sy = hx + 30 * math.cos(math.radians(beta)), hy + 30 * math.sin(math.radians(beta))
    c.part(ell(sx - 7, sy - 7, sx + 7, sy + 7), '#ffcf3a')
    c.flat(ell(sx - 2, sy - 2, sx + 2, sy + 2), '#e0102a')
    c.part(ell(hx - 4, hy - 4, hx + 4, hy + 4), '#5e9a30')
    if p is not None and 0.5 < p < 0.95:
        c.flat(crescent(70, 52 - b, 22, 36, beta + 5, beta + 65), (255, 235, 150, 255))
    return c.finish()


def ogre(row, t):
    P = pose(row, t); b = P['bob']; c = Cv(); p = P['p']
    skin = '#8a9a5a'
    legs(c, P, '#76864a', '#4a3a2a', x0=30, x1=54, w=14)
    c.part(ell(22, 32 - b, 76, 76 - b), skin)  # hulking torso
    c.part(poly([(30, 62 - b), (66, 62 - b), (70, 78 - b), (26, 78 - b)]), '#6a4a30')  # loincloth
    c.part(rect(26, 62 - b, 70, 66 - b), '#3a2a1c', outline=None)
    c.part(ell(34, 14 - b, 64, 42 - b), '#98a868')  # small head on big body
    c.flat(many(rect(40, 26 - b, 44, 29 - b), rect(52, 26 - b, 56, 29 - b)), '#ffe36e')
    c.part(rect(38, 34 - b, 60, 39 - b), '#5a6a38', outline=None)
    c.part(many(poly([(40, 39 - b), (44, 39 - b), (42, 30 - b)]), poly([(54, 39 - b), (58, 39 - b), (56, 30 - b)])), '#efe6c8')
    c.part(poly([(36, 20 - b), (26, 16 - b), (22, 4 - b), (30, 12 - b), (38, 16 - b)]), '#efe2c0')  # bone horns
    c.part(poly([(62, 20 - b), (72, 16 - b), (76, 4 - b), (68, 12 - b), (60, 16 - b)]), '#efe2c0')
    # fists swing like pendulums; right one holds a spiked club
    c.part(ell(14, 44 - b, 30, 70 - b), skin)
    if p is None:
        beta = -64 + (6 * math.sin(2 * math.pi * t) if row == 0 else -12 * P['swing'])
    else:
        beta = -115 + 205 * ease(min(1, p / 0.75)) if p < 0.75 else 90 - 8 * (p - 0.75) / 0.25
    hx, hy = 70 + 5 * math.cos(math.radians(beta)) * 0.6, 58 - b + 6 * math.sin(math.radians(beta))
    c.part(ell(64, 40 - b, 82, 66 - b), skin)
    c.part(poly(rotpts([(hx, hy - 4), (hx + 20, hy - 4), (hx + 38, hy - 10), (hx + 46, hy), (hx + 38, hy + 10), (hx + 20, hy + 4), (hx, hy + 4)], hx, hy, beta)), '#7a5a36')
    for k in range(3):
        sx, sy = hx + 30 + k * 6, hy
        c.flat(poly(rotpts([(sx, sy - 10), (sx + 3, sy - 15), (sx + 6, sy - 10)], hx, hy, beta)), '#d8d8e0')
    c.part(ell(hx - 5, hy - 5, hx + 5, hy + 5), skin)
    if p is not None and 0.55 < p < 0.95:
        c.flat(crescent(70, 54 - b, 26, 44, beta + 10, beta + 75), (230, 215, 170, 255))
    return c.finish()


def necro(row, t):
    P = pose(row, t); b = P['bob']; c = Cv(); p = P['p']
    fl = 2 * math.sin(2 * math.pi * t * (2 if row else 1))
    # floating robe (no legs), wavy hem
    hem = [(26, 84), (70, 84)]
    pts = [(34, 36 - b), (62, 36 - b), (72, 80), (26, 80)]
    pts += [(26 + k * 5, 84 + round(2 * math.sin(k + t * 6.28))) for k in range(0, 10)][::-1][:0]
    c.part(poly([(34, 36 - b), (62, 36 - b), (74, 82), (22, 82)]), '#3a2a5a')
    for k in range(6):
        x = 22 + k * 9
        c.part(poly([(x, 80), (x + 9, 80), (x + 4, 88 + round(2 * math.sin(k * 1.3 + t * 6.28)))]), '#3a2a5a', outline=NAVY)
    c.part(rect(44, 40 - b, 52, 80), '#6b4a9e')  # sash
    c.part(ell(30, 34 - b, 66, 52 - b), '#2a1f44')  # shoulders / mantle
    # hood and skull face
    c.part(poly([(32, 44 - b), (36, 14 - b), (48, 6 - b), (60, 14 - b), (64, 44 - b)]), '#241a3a')
    c.part(ell(38, 18 - b, 58, 40 - b), '#d8d0b8')
    c.flat(many(ell(41, 25 - b, 46, 31 - b), ell(50, 25 - b, 55, 31 - b)), '#7dff6a')
    c.flat(rect(46, 32 - b, 50, 35 - b), '#3a3a30')
    c.flat(many(rect(42, 36 - b, 54, 38 - b)), '#3a3a30')
    # staff arm
    c.part(rect(22, 46 - b, 30, 60 - b), '#2a1f44')
    if p is None:
        beta = -82 + (5 * math.sin(2 * math.pi * t) if row == 0 else -8 * P['swing'])
    else:
        beta = -98 + 40 * ease(min(1, p / 0.6)) if p < 0.6 else -58 + 10 * (p - 0.6) / 0.4
    hx, hy = 70, 54 - b
    c.part(rect(66, 44 - b, 74, 58 - b), '#2a1f44')
    c.part(blade(hx, hy + 14, beta, 56, 4, tip=False), '#5a4630')
    tx, ty = hx + 56 * math.cos(math.radians(beta)), hy + 14 + 56 * math.sin(math.radians(beta))
    c.part(ell(tx - 7, ty - 7, tx + 7, ty + 7), '#d8d0b8')
    c.flat(many(rect(tx - 4, ty - 2, tx - 2, ty + 1), rect(tx + 2, ty - 2, tx + 4, ty + 1)), '#7dff6a')
    for k in range(3):
        fy = ty - 8 - ((P['flick'] * 14 + k * 5) % 14)
        c.flat(poly([(tx - 3 + k * 3, fy + 4), (tx - 1 + k * 3, fy - 3), (tx + 1 + k * 3, fy + 4)]), '#7dff6a' if k % 2 else '#c8ffb0')
    if p is not None and 0.55 < p < 0.95:
        c.flat(ell(tx - 14, ty - 14, tx + 14, ty + 14), (125, 255, 106, 120))
    return c.finish()


def warlord(row, t):
    P = pose(row, t); b = P['bob']; c = Cv(); p = P['p']
    skin, armor = '#5e9a30', '#7a7a86'
    legs(c, P, '#4a6a28', '#3a3a3a', w=12)
    c.part(poly([(28, 38 - b), (68, 38 - b), (64, 70 - b), (32, 70 - b)]), armor)
    c.part(rect(32, 62 - b, 64, 68 - b), '#d4a01a')
    c.part(rect(40, 44 - b, 56, 60 - b), '#b01818', outline=None)
    c.flat(many(rect(46, 48 - b, 50, 56 - b), rect(43, 51 - b, 53, 53 - b)), '#f0e0b0')  # emblem
    c.part(ell(36, 18 - b, 60, 42 - b), skin)
    c.part(poly([(34, 28 - b), (40, 12 - b), (56, 12 - b), (62, 28 - b), (58, 30 - b), (38, 30 - b)]), '#c9a23a')  # helm
    wv = round(2 * math.sin(2 * math.pi * P['flick']))
    c.part(poly([(42, 14 - b), (54, 14 - b), (64 + wv, 8 - b), (70 + wv, 18 - b), (58, 20 - b)]), '#b01818')  # plume sweeping back
    c.flat(many(rect(41, 31 - b, 44, 34 - b), rect(52, 31 - b, 55, 34 - b)), '#ffcf3a')
    c.part(many(poly([(40, 41 - b), (44, 41 - b), (42, 34 - b)]), poly([(54, 41 - b), (58, 41 - b), (56, 34 - b)])), '#efe6c8')
    for sx, d in ((29, -1), (67, 1)):
        c.part(ell(sx - 8, 36 - b, sx + 8, 52 - b), '#c9a23a')
    c.part(rect(20, 46 - b, 28, 62 - b), skin)
    c.part(ell(8, 40 - b, 28, 72 - b), '#8a4a1a')  # round shield
    c.flat(ell(14, 52 - b, 22, 60 - b), '#d4a01a')
    if p is None:
        beta = -68 + (8 * math.sin(2 * math.pi * t) if row == 0 else -16 * P['swing'])
    else:
        beta = -105 + 195 * ease(min(1, p / 0.7)) if p < 0.7 else 90 - 8 * (p - 0.7) / 0.3
    hx, hy = 70 + 6 * math.cos(math.radians(beta)) * 0.6, 56 - b + 6 * math.sin(math.radians(beta))
    c.part(rect(64, 42 - b, 74, 58 - b), skin)
    c.part(blade(hx, hy, beta, 40, 4, tip=False), '#5a4630')
    ax, ay = hx + 32 * math.cos(math.radians(beta)), hy + 32 * math.sin(math.radians(beta))
    c.part(poly(rotpts([(ax - 4, ay - 16), (ax + 12, ay - 12), (ax + 18, ay), (ax + 12, ay + 12), (ax - 4, ay + 16)], ax, ay, beta)), '#c3c8d8')
    c.part(ell(hx - 4, hy - 4, hx + 4, hy + 4), skin)
    if p is not None and 0.5 < p < 0.95:
        c.flat(crescent(70, 52 - b, 26, 42, beta + 5, beta + 70), (255, 235, 170, 255))
    return c.finish()


BOSSES = {'king': king, 'ogre': ogre, 'necro': necro, 'warlord': warlord, 'forgemaster': forgemaster, 'overlord': overlord}
FRAMES = 6


def sheet(fn):
    FW = W * 2
    out = Image.new('RGBA', (FW * FRAMES, FW * 3), (0, 0, 0, 0))
    for row in range(3):
        for k in range(FRAMES):
            f = fn(row, k / FRAMES).resize((FW, FW), Image.NEAREST)
            out.alpha_composite(f, (FW * k, FW * row))
    return out


if __name__ == '__main__':
    names = sys.argv[1:] or list(BOSSES)
    for n in names:
        sheet(BOSSES[n]).save(os.path.join(OUT, 'Boss_%s.png' % n.capitalize()))
        print('wrote', n)
