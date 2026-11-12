# Draws the icons on a 32x32 grid at 3x resolution (96x96) (items, hero skills, spells, orders) in one palette with a shared
# dark outline and top-left rim light, then packs them into src/iconData.ts (atlas data URL + name list).
# Usage: python3 scripts/gen-icons.py [--preview out.png]
import base64, io, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

S = 3            # pixels per logical cell
SZ = 32 * S      # icon size in the atlas (96)
def rgb(h): h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
K = rgb('1b1626')  # outline, taken from the Tiny Swords sprites
STEEL = [rgb(x) for x in ('5c6a80', '8fa0b3', 'c9d4e0', 'f0f6fc')]
GOLD = [rgb(x) for x in ('8c5c14', 'd69628', 'ffcf3a', 'fff0a0')]
WOOD = [rgb(x) for x in ('5c341e', '8c542e', 'b87a42', 'dbaa6e')]
LEATH = [rgb(x) for x in ('54302a', '82503a', 'b07050', 'd49a74')]
RED = [rgb(x) for x in ('6a1729', 'a02030', 'd6453d', 'ff826e')]
GREEN = [rgb(x) for x in ('365c2a', '5e9a30', '91c85a', 'c8eb96')]
BLUE = [rgb(x) for x in ('28468c', '3e86c8', '6ebeeb', 'c8eeff')]
PURP = [rgb(x) for x in ('462870', '7846aa', 'aa78dc', 'dcbefa')]
FIRE = [rgb(x) for x in ('be3c14', 'f0781e', 'ffb432', 'ffeb8c')]
BONE = [rgb(x) for x in ('96876a', 'cdc0a0', 'f0e6cd', 'fffaeb')]
TEAL = [rgb(x) for x in ('2c6e80', '448e9f', '5ab9bb', '8fe2b9')]
STONE = [rgb(x) for x in ('4a4658', '706c80', '9a96a8', 'c4c0d0')]
SKIN = [rgb(x) for x in ('a05a3c', 'd08a5a', 'efb98a', 'ffdcb4')]
WHITE = rgb('ffffff')
SHADE = rgb('2a2238')

class Cv:
    """Canvas in a 32x32 logical grid, rasterised at S x resolution (smooth curves and diagonals)."""
    def __init__(s): s.im = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im)
    def px(s, x, y, c): x, y = int(x), int(y); s.d.rectangle([x * S, y * S, x * S + S - 1, y * S + S - 1], fill=c)
    def solid(s, x, y): return s.im.getpixel((int(x) * S + S // 2, int(y) * S + S // 2))[3] > 0
    def rect(s, x0, y0, x1, y1, c): s.d.rectangle([x0 * S, y0 * S, (x1 + 1) * S - 1, (y1 + 1) * S - 1], fill=c)
    def ell(s, x0, y0, x1, y1, c): s.d.ellipse([x0 * S, y0 * S, (x1 + 1) * S - 1, (y1 + 1) * S - 1], fill=c)
    def circ(s, cx, cy, r, c): s.ell(cx - r, cy - r, cx + r, cy + r, c)
    def poly(s, pts, c): s.d.polygon([(round((x + .5) * S), round((y + .5) * S)) for x, y in pts], fill=c)
    def line(s, pts, c, w=1):
        q = [(round((x + .5) * S), round((y + .5) * S)) for x, y in pts]; s.d.line(q, fill=c, width=max(1, round(w * S)), joint='curve')
        r = w * S / 2
        for x, y in (q[0], q[-1]): s.d.ellipse([x - r, y - r, x + r, y + r], fill=c)
    def tl(s, p0, p1, w, c):
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; n = math.hypot(dx, dy) or 1; nx, ny = -dy / n * w / 2, dx / n * w / 2
        s.poly([(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)], c)

def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)

def finish(cv):
    """Rim light (top-left) and shade (bottom-right) on the silhouette edge, then a dark outline; all S px thick."""
    a = np.array(cv.im).astype(np.float32); solid = a[..., 3] > 0
    def shifted(dx, dy):
        o = np.zeros_like(solid); h, w = solid.shape
        o[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = solid[max(-dy, 0):h + min(-dy, 0), max(-dx, 0):w + min(-dx, 0)]; return o
    top = np.zeros_like(solid); bot = np.zeros_like(solid)
    for k in range(1, S + 1):
        top |= ~shifted(0, k) | ~shifted(k, 0); bot |= ~shifted(0, -k) | ~shifted(-k, 0)
    lit = solid & top & ~bot; dark = solid & bot & ~top
    for m, col, t in ((lit, WHITE, 0.32), (dark, SHADE, 0.34)):
        for i in range(3): a[..., i] = np.where(m, a[..., i] + (col[i] - a[..., i]) * t, a[..., i])
    grow = solid.copy()
    for _ in range(S):
        g = grow.copy(); g[1:] |= grow[:-1]; g[:-1] |= grow[1:]; g[:, 1:] |= grow[:, :-1]; g[:, :-1] |= grow[:, 1:]; grow = g
    edge = grow & ~solid
    for i in range(4): a[..., i] = np.where(edge, K[i], a[..., i])
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

# ---------- shared shapes ----------
def sword(cv, base, tip, w=3, blade=(STEEL[1], STEEL[2]), guard=GOLD[1], grip=WOOD[1], pommel=GOLD[2], glow=None):
    dx, dy = tip[0] - base[0], tip[1] - base[1]; n = math.hypot(dx, dy); ux, uy = dx / n, dy / n; nx, ny = -uy, ux
    P = lambda t, o=0: (base[0] + ux * t + nx * o, base[1] + uy * t + ny * o)
    if glow: cv.tl(P(8), P(n - 1), w + 4, glow)
    cv.tl(P(0), P(5), 2, grip); cv.circ(*P(-0.5), 1.5, pommel)
    cv.tl(P(5, -4.5), P(5, 4.5), 2, guard)
    cv.tl(P(6), P(n - 3), w, blade[0]); cv.poly([P(n - 3, -w / 2), P(n, 0), P(n - 3, w / 2)], blade[0])
    cv.tl(P(6, -w / 4), P(n - 2, -w / 4), max(1, w / 2), blade[1])
def axe(cv, base, top, head=STEEL, w=2, hx=1, size=8, edge=None):
    cv.tl(base, top, w, WOOD[1]); cv.tl(base, (base[0] + (top[0] - base[0]) * .25, base[1] + (top[1] - base[1]) * .25), w, WOOD[0])
    tx, ty = top; s = size
    cv.poly([(tx, ty - s * .55), (tx + hx * s, ty - s * .9), (tx + hx * s * 1.15, ty + s * .1), (tx + hx * s * .15, ty + s * .5), (tx, ty + s * .3)], head[1])
    cv.poly([(tx + hx * s * .35, ty - s * .5), (tx + hx * s * .95, ty - s * .65), (tx + hx * s * 1.05, ty - s * .1), (tx + hx * s * .4, ty - s * .1)], edge or head[2])
def heart(cv, cx, cy, r, cols):
    cv.circ(cx - r * .55, cy - r * .35, r * .62, cols[1]); cv.circ(cx + r * .55, cy - r * .35, r * .62, cols[1])
    cv.poly([(cx - r * 1.15, cy - r * .1), (cx + r * 1.15, cy - r * .1), (cx, cy + r * 1.15)], cols[1])
    cv.circ(cx - r * .55, cy - r * .5, r * .22, cols[3]); cv.poly([(cx + r * .2, cy + r * .6), (cx + r * .9, cy), (cx + r * .7, cy + r * .1)], cols[0])
def flame(cv, cx, by, h, w=None, cols=FIRE):
    w = w or h * .7
    cv.poly([(cx - w / 2, by), (cx - w * .55, by - h * .45), (cx - w * .15, by - h * .55), (cx - w * .25, by - h * .95), (cx + w * .1, by - h * .6), (cx + w * .25, by - h), (cx + w * .5, by - h * .45), (cx + w / 2, by)], cols[0])
    cv.circ(cx, by - h * .3, w * .38, cols[1]); cv.poly([(cx - w * .3, by - h * .15), (cx, by - h * .85), (cx + w * .3, by - h * .15)], cols[1])
    cv.circ(cx, by - h * .22, w * .22, cols[2]); cv.poly([(cx - w * .15, by - h * .15), (cx, by - h * .55), (cx + w * .15, by - h * .15)], cols[2])
def star(cv, cx, cy, r1, r2, n, c):
    pts = []
    for i in range(n * 2):
        a = -math.pi / 2 + i * math.pi / n; r = r1 if i % 2 == 0 else r2; pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    cv.poly(pts, c)
def bolt(cv, cx=16, cy=16, s=1.0, cols=(GOLD[1], GOLD[2], GOLD[3])):
    pts = [(cx + 3 * s, cy - 13 * s), (cx - 7 * s, cy + 1 * s), (cx - 1 * s, cy + 1 * s), (cx - 4 * s, cy + 13 * s), (cx + 8 * s, cy - 3 * s), (cx + 2 * s, cy - 3 * s)]
    cv.poly(pts, cols[0]); cv.poly([(cx + 2.5 * s, cy - 10 * s), (cx - 4 * s, cy), (cx + 1 * s, cy), (cx - 1 * s, cy + 8 * s), (cx + 5 * s, cy - 2 * s), (cx + 1 * s, cy - 2 * s)], cols[1])
def eye(cv, cx, cy, w, h, iris, pupil=K):
    cv.poly([(cx - w, cy), (cx - w * .5, cy - h), (cx + w * .5, cy - h), (cx + w, cy), (cx + w * .5, cy + h), (cx - w * .5, cy + h)], BONE[3])
    cv.ell(cx - h * .85, cy - h * .85, cx + h * .85, cy + h * .85, iris[1]); cv.ell(cx - h * .45, cy - h * .45, cx + h * .45, cy + h * .45, pupil); cv.px(cx - h * .3, cy - h * .35, WHITE)
def heater(cv, x0, y0, x1, y1, body, trim, mid=None):
    cx = (x0 + x1) / 2; cv.poly([(x0, y0), (x1, y0), (x1, (y0 + y1) * .5), (cx, y1), (x0, (y0 + y1) * .5)], trim)
    cv.poly([(x0 + 2, y0 + 2), (x1 - 2, y0 + 2), (x1 - 2, (y0 + y1) * .5 - 1), (cx, y1 - 3), (x0 + 2, (y0 + y1) * .5 - 1)], body)
    if mid: cv.poly([(cx, y0 + 2), (x1 - 2, y0 + 2), (x1 - 2, (y0 + y1) * .5 - 1), (cx, y1 - 3)], mid)
def arrow(cv, p0, p1, head=STEEL[2], shaft=WOOD[2], fl=RED[2]):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]; n = math.hypot(dx, dy); ux, uy = dx / n, dy / n; nx, ny = -uy, ux
    cv.line([p0, (p1[0] - ux * 3, p1[1] - uy * 3)], shaft, 1)
    cv.poly([p1, (p1[0] - ux * 4 + nx * 2, p1[1] - uy * 4 + ny * 2), (p1[0] - ux * 4 - nx * 2, p1[1] - uy * 4 - ny * 2)], head)
    for o in (-1.5, 1.5): cv.line([(p0[0] + nx * o, p0[1] + ny * o), (p0[0] + ux * 3 + nx * o * 1.6, p0[1] + uy * 3 + ny * o * 1.6)], fl, 1)
def skull(cv, cx, cy, s=1.0, cols=BONE, eyec=K):
    cv.ell(cx - 9 * s, cy - 10 * s, cx + 9 * s, cy + 4 * s, cols[2]); cv.rect(cx - 5 * s, cy + 1 * s, cx + 5 * s, cy + 9 * s, cols[2])
    cv.rect(cx - 5 * s, cy + 9 * s, cx + 5 * s, cy + 9 * s, cols[1])
    cv.ell(cx - 6 * s, cy - 4 * s, cx - 1.5 * s, cy + 1 * s, eyec); cv.ell(cx + 1.5 * s, cy - 4 * s, cx + 6 * s, cy + 1 * s, eyec)
    cv.poly([(cx, cy + 1 * s), (cx - 1.5 * s, cy + 4 * s), (cx + 1.5 * s, cy + 4 * s)], eyec)
    for i in (-3, 0, 3): cv.line([(cx + i * s, cy + 6 * s), (cx + i * s, cy + 9 * s)], cols[0], 1)
    cv.px(cx - 6 * s, cy - 8 * s, cols[3])
def drop(cv, cx, cy, r, cols):
    cv.poly([(cx, cy - r * 1.9), (cx - r * .95, cy - r * .2), (cx + r * .95, cy - r * .2)], cols[1]); cv.circ(cx, cy, r, cols[1])
    cv.circ(cx - r * .35, cy - r * .1, r * .3, cols[3]); cv.poly([(cx + r * .5, cy + r * .3), (cx + r * .9, cy - r * .1), (cx + r * .6, cy + r * .75)], cols[0])
def glove(cv, c, cuff, x=8, y=7, flip=False):
    cv.rect(x + 3, y + 10, x + 14, y + 18, c[1])           # palm
    for i, (fx, fh) in enumerate(((3, 9), (6.5, 11), (10, 10), (13.5, 8))): cv.rect(fx + x - 0.5, y + 10 - fh + 5, fx + x + 2, y + 11, c[1]); cv.line([(fx + x + 2, y + 10 - fh + 6), (fx + x + 2, y + 10)], c[0], 1)
    cv.poly([(x + 2, y + 13), (x - 3, y + 11), (x - 3, y + 15), (x + 3, y + 18)], c[1])
    cv.rect(x + 3, y + 17, x + 14, y + 22, cuff[1]); cv.rect(x + 3, y + 17, x + 14, y + 18, cuff[2]); cv.rect(x + 3, y + 22, x + 14, y + 22, cuff[0])

ICONS = {}
def icon(name):
    def deco(f): ICONS[name] = f; return f
    return deco

# ===================== ITEMS =====================
@icon('item_rusty_sword')
def _(c):
    sword(c, (6, 26), (25, 7), 3, (STEEL[0], STEEL[1]), WOOD[1], LEATH[1], WOOD[2])
    for p in ((14, 17), (17, 13), (20, 12), (12, 20), (22, 9)): c.px(*p, rgb('a85a2a'))
    for p in ((15, 17), (18, 13)): c.px(*p, rgb('cf7a3a'))
@icon('item_leather')
def _(c):
    c.poly([(9, 7), (14, 7), (16, 11), (18, 7), (23, 7), (27, 11), (24, 15), (23, 15), (23, 26), (9, 26), (9, 15), (8, 15), (5, 11)], LEATH[1])
    c.poly([(14, 7), (16, 11), (18, 7), (18, 26), (14, 26)], LEATH[0]); c.rect(15, 11, 17, 25, LEATH[2])
    c.rect(9, 20, 23, 21, LEATH[0]); c.rect(9, 19, 23, 19, LEATH[3])
    for y in range(12, 25, 3): c.px(16, y, GOLD[2])
    for x, y in ((11, 11), (21, 11), (11, 24), (21, 24)): c.px(x, y, LEATH[3])
@icon('item_gloves')
def _(c): glove(c, LEATH, WOOD, 9, 5)
@icon('item_whetstone')
def _(c):
    c.poly([(5, 20), (22, 11), (28, 17), (11, 26)], STONE[1]); c.poly([(5, 20), (22, 11), (22, 14), (5, 23)], STONE[2]); c.poly([(5, 23), (22, 14), (28, 20), (28, 17), (11, 26), (5, 23)], STONE[0])
    c.line([(10, 18), (21, 13)], STONE[3], 1); c.line([(12, 21), (22, 16)], STONE[0], 1)
    for p in ((7, 11), (4, 8), (10, 7)): c.px(*p, GOLD[2]); 
    c.px(8, 9, GOLD[3]); c.px(6, 13, FIRE[2])
@icon('item_spyglass')
def _(c):
    c.tl((6, 25), (13, 18), 6, GOLD[1]); c.tl((12, 19), (20, 11), 5, WOOD[1]); c.tl((19, 12), (26, 5), 7, GOLD[1])
    c.tl((6, 25), (13, 18), 2, GOLD[2]); c.tl((19, 12), (26, 5), 3, GOLD[2]); c.circ(26, 5, 2, BLUE[2]); c.px(25, 4, WHITE)
    c.tl((12, 19), (20, 11), 2, WOOD[2])
@icon('item_amulet')
def _(c):
    c.line([(9, 4), (11, 9), (14, 12)], STEEL[2], 1); c.line([(23, 4), (21, 9), (18, 12)], STEEL[2], 1); c.line([(9, 4), (16, 3), (23, 4)], STEEL[1], 1)
    c.circ(16, 19, 9, GOLD[1]); c.circ(16, 19, 6, RED[1]); c.circ(16, 19, 4, RED[2]); c.px(14, 17, RED[3]); c.px(15, 16, WHITE); c.circ(16, 11, 2, GOLD[2])
@icon('item_purse')
def _(c):
    c.circ(16, 19, 9, LEATH[1]); c.poly([(11, 11), (21, 11), (23, 14), (9, 14)], LEATH[1]); c.rect(10, 8, 22, 12, LEATH[2])
    c.rect(9, 12, 23, 13, GOLD[1]); c.line([(10, 8), (8, 5)], LEATH[2], 2); c.line([(22, 8), (24, 5)], LEATH[2], 2)
    c.circ(16, 20, 3, GOLD[2]); c.px(15, 19, GOLD[3]); c.px(16, 22, GOLD[0]); c.px(11, 17, LEATH[3])
@icon('item_buckler')
def _(c):
    c.circ(16, 16, 12, STEEL[1]); c.circ(16, 16, 10, WOOD[1]); c.circ(16, 16, 8, WOOD[2])
    for a in range(0, 360, 45): c.px(16 + math.cos(math.radians(a)) * 10, 16 + math.sin(math.radians(a)) * 10, STEEL[3])
    c.circ(16, 16, 4, STEEL[2]); c.circ(16, 16, 2, STEEL[3]); c.line([(9, 16), (23, 16)], WOOD[0], 1); c.line([(16, 9), (16, 23)], WOOD[0], 1); c.circ(16, 16, 3, STEEL[2]); c.px(15, 15, WHITE)
@icon('item_dagger')
def _(c): sword(c, (8, 25), (24, 8), 3, (STEEL[1], STEEL[3]), RED[1], LEATH[1], RED[2])
@icon('item_bandage')
def _(c):
    c.ell(7, 8, 25, 26, BONE[2]); c.ell(7, 6, 25, 22, BONE[3]); c.ell(11, 10, 21, 18, BONE[1]); c.ell(14, 12, 18, 16, BONE[0])
    c.line([(9, 14), (23, 14)], BONE[1], 1); c.line([(8, 18), (24, 18)], BONE[1], 1)
    c.poly([(21, 22), (28, 26), (26, 29), (19, 24)], BONE[3]); c.line([(22, 24), (26, 27)], BONE[1], 1)
    c.rect(15, 8, 17, 9, RED[2])
@icon('item_warhammer')
def _(c):
    c.tl((7, 26), (21, 12), 3, WOOD[1]); c.tl((7, 26), (11, 22), 3, WOOD[0])
    c.poly([(15, 6), (28, 6 + 6), (24, 17), (11, 10)], STEEL[1]); c.poly([(15, 6), (28, 12), (26, 13), (14, 7)], STEEL[3]); c.poly([(14, 8), (24, 16), (23, 17), (13, 10)], STEEL[2]); c.poly([(25, 13), (28, 12), (24, 17)], STEEL[0])
@icon('item_longbow')
def _(c):
    for t in range(0, 21):
        a = math.radians(-70 + t * 7); x = 8 + math.cos(a) * 13; y = 16 + math.sin(a) * 13; c.circ(x, y, 1.2, WOOD[1])
    c.line([(17, 4), (17, 28)], STEEL[3], 1); arrow(c, (9, 16), (27, 16))
    c.rect(7, 14, 9, 18, LEATH[1])
@icon('item_troll_hide')
def _(c):
    c.poly([(5, 10), (12, 6), (20, 7), (27, 11), (26, 20), (22, 26), (12, 27), (6, 21)], GREEN[1])
    c.poly([(5, 10), (12, 6), (20, 7), (27, 11), (24, 12), (12, 11), (6, 14)], GREEN[2])
    for x, y, r in ((11, 17, 2), (19, 15, 2), (16, 22, 2), (23, 21, 1)): c.circ(x, y, r, GREEN[0])
    c.line([(5, 14), (9, 16)], LEATH[2], 1); c.line([(26, 14), (22, 16)], LEATH[2], 1)
@icon('item_skull')
def _(c): skull(c, 16, 14, 1.0)
@icon('item_axe')
def _(c): axe(c, (6, 27), (17, 11), STEEL, 3, 1, 10)
@icon('item_chainmail')
def _(c):
    c.poly([(9, 6), (14, 6), (16, 9), (18, 6), (23, 6), (28, 11), (25, 16), (23, 15), (23, 27), (9, 27), (9, 15), (7, 16), (4, 11)], STEEL[1])
    for y in range(8, 27, 3):
        for x in range(8 + (y % 2) * 2, 25, 4):
            if c.solid(x, y): c.px(x, y, STEEL[3]); c.px(x + 1, y + 1, STEEL[0])
    c.poly([(14, 6), (16, 9), (18, 6), (16, 12)], STEEL[0])
@icon('item_quiver')
def _(c):
    c.poly([(11, 12), (20, 9), (25, 26), (15, 29)], LEATH[1]); c.poly([(11, 12), (14, 11), (19, 28), (15, 29)], LEATH[0]); c.line([(12, 15), (22, 12)], GOLD[1], 1); c.line([(14, 25), (24, 23)], GOLD[1], 1)
    for i, x in enumerate((13, 16, 19)):
        c.line([(x, 10 - i % 2), (x + 1, 3)], WOOD[2], 1); c.poly([(x - 1, 6), (x + 1, 2), (x + 3, 6)], (RED[2], BLUE[2], GREEN[2])[i])
@icon('item_fang')
def _(c):
    c.poly([(9, 6), (23, 6), (21, 13), (16, 28), (11, 13)], BONE[2]); c.poly([(9, 6), (23, 6), (22, 9), (10, 9)], BONE[1]); c.poly([(16, 14), (16, 28), (21, 13)], BONE[1]); c.line([(12, 10), (15, 22)], BONE[3], 1); c.px(16, 27, RED[2])
@icon('item_ember')
def _(c):
    c.poly([(5, 24), (8, 17), (14, 14), (22, 15), (27, 21), (25, 27), (8, 27)], rgb('3a2a2a')); c.poly([(5, 24), (8, 17), (14, 14), (12, 18)], rgb('5a4444'))
    c.line([(9, 24), (14, 20), (19, 24), (24, 21)], FIRE[1], 1); c.line([(12, 26), (16, 23), (21, 26)], FIRE[2], 1); c.px(14, 20, FIRE[3])
    flame(c, 16, 17, 14, 11)
@icon('item_banner')
def _(c):
    c.tl((8, 28), (8, 4), 2, WOOD[1]); c.circ(8, 4, 2, GOLD[2])
    c.poly([(10, 6), (26, 6), (22, 12), (26, 18), (10, 18)], RED[1]); c.poly([(10, 6), (26, 6), (24, 8), (10, 8)], RED[2]); c.poly([(10, 16), (24, 16), (26, 18), (10, 18)], RED[0])
    star(c, 17, 12, 4, 1.8, 5, GOLD[2])
@icon('item_frost_shard')
def _(c):
    c.poly([(16, 3), (22, 12), (20, 27), (12, 27), (10, 12)], BLUE[1]); c.poly([(16, 3), (22, 12), (16, 14)], BLUE[2]); c.poly([(16, 3), (10, 12), (16, 14)], BLUE[3]); c.poly([(16, 14), (22, 12), (20, 27), (16, 27)], BLUE[0])
    c.poly([(6, 14), (11, 18), (9, 27), (5, 27)], BLUE[2]); c.poly([(25, 16), (27, 22), (24, 27), (21, 24)], BLUE[2]); c.px(15, 8, WHITE); c.px(14, 10, WHITE)
@icon('item_headsman')
def _(c):
    c.tl((7, 28), (18, 6), 3, WOOD[0]); c.tl((8, 26), (11, 20), 3, K)
    c.poly([(15, 3), (27, 6), (28, 16), (21, 21), (19, 14), (16, 8)], STEEL[0]); c.poly([(16, 4), (26, 7), (26, 15), (21, 19), (20, 12)], STEEL[1]); c.poly([(18, 5), (26, 7), (26, 9), (19, 8)], STEEL[3])
    c.line([(23, 9), (26, 14)], RED[1], 1); c.px(25, 15, RED[2]); c.px(26, 16, RED[2])
@icon('item_dawn_blade')
def _(c):
    sword(c, (6, 26), (24, 8), 3, (GOLD[2], GOLD[3]), GOLD[1], WOOD[1], RED[2], glow=rgb('fff3b0'))
    for p in ((27, 4), (4, 14), (28, 12)): star(c, p[0], p[1], 2.5, 1, 4, GOLD[3])
@icon('item_citadel')
def _(c):
    c.rect(6, 12, 25, 27, STONE[1]); c.rect(6, 12, 9, 27, STONE[2]); c.rect(22, 12, 25, 27, STONE[0])
    for x in (4, 10, 16, 22): c.rect(x, 7, x + 4, 12, STONE[1]); c.rect(x, 7, x + 1, 12, STONE[2])
    c.rect(4, 12, 27, 13, STONE[0]); c.poly([(12, 27), (12, 20), (16, 16), (20, 20), (20, 27)], WOOD[0]); c.poly([(13, 27), (13, 21), (16, 18), (19, 21), (19, 27)], WOOD[1]); c.line([(16, 18), (16, 27)], WOOD[0], 1)
    c.rect(14, 4, 14, 7, WOOD[1]); c.poly([(15, 3), (22, 5), (15, 7)], RED[2])
@icon('item_storm_eye')
def _(c):
    c.ell(3, 4, 29, 14, PURP[0]); c.ell(5, 6, 22, 16, PURP[1]); c.ell(12, 8, 28, 17, PURP[1]); c.ell(8, 8, 18, 15, PURP[2])
    eye(c, 16, 21, 10, 5, BLUE); bolt(c, 20, 12, .45, (GOLD[1], GOLD[2], GOLD[3]))
@icon('item_phoenix')
def _(c):
    flame(c, 16, 28, 26, 22, RED if False else FIRE); heart(c, 16, 19, 6.5, RED)
    c.poly([(3, 8), (9, 13), (7, 18)], FIRE[1]); c.poly([(29, 8), (23, 13), (25, 18)], FIRE[1]); c.px(4, 10, FIRE[3]); c.px(28, 10, FIRE[3])
@icon('item_thunder')
def _(c): bolt(c, 16, 16, 1.1)
@icon('item_feather')
def _(c):
    c.poly([(7, 25), (5, 14), (13, 6), (26, 4), (24, 15), (16, 23)], BLUE[2]); c.poly([(5, 14), (13, 6), (26, 4), (14, 15)], BLUE[3]); c.poly([(7, 25), (14, 15), (24, 15), (16, 23)], BLUE[1])
    c.line([(6, 26), (25, 5)], BONE[3], 1); c.line([(8, 20), (5, 22)], BLUE[2], 1)
    for i in range(4): c.line([(10 + i * 3, 19 - i * 3), (13 + i * 3, 21 - i * 3)], BLUE[0], 1)
@icon('item_dragon_scale')
def _(c):
    c.poly([(16, 3), (27, 9), (27, 22), (16, 29), (5, 22), (5, 9)], TEAL[1]); c.poly([(16, 3), (27, 9), (16, 15)], TEAL[2]); c.poly([(16, 3), (5, 9), (16, 15)], TEAL[3]); c.poly([(16, 15), (27, 9), (27, 22), (16, 29)], TEAL[0])
    c.poly([(16, 9), (22, 13), (16, 20), (10, 13)], GREEN[1]); c.line([(16, 9), (16, 20)], TEAL[0], 1); c.px(13, 10, WHITE)
@icon('item_sun_bow')
def _(c):
    c.circ(20, 12, 8, GOLD[2]); c.circ(20, 12, 5, GOLD[3])
    for a in range(0, 360, 45): c.line([(20 + math.cos(math.radians(a)) * 9, 12 + math.sin(math.radians(a)) * 9), (20 + math.cos(math.radians(a)) * 12, 12 + math.sin(math.radians(a)) * 12)], GOLD[2], 1)
    for t in range(0, 21):
        a = math.radians(-70 + t * 7); x = 8 + math.cos(a) * 13; y = 17 + math.sin(a) * 13; c.circ(x, y, 1.3, GOLD[1])
    c.line([(17, 5), (17, 29)], STEEL[3], 1); arrow(c, (8, 17), (27, 17), GOLD[2], GOLD[3], RED[2])
@icon('item_reaper')
def _(c):
    c.tl((9, 29), (21, 5), 2, WOOD[1]); c.tl((9, 29), (12, 23), 2, WOOD[0])
    c.poly([(20, 4), (28, 9), (30, 16), (26, 19), (26, 13), (22, 10), (14, 7)], STEEL[1]); c.poly([(20, 4), (28, 9), (22, 8)], STEEL[3]); c.poly([(14, 7), (22, 10), (26, 13), (26, 19), (24, 12)], STEEL[0]); c.line([(22, 6), (27, 10)], WHITE, 1)
@icon('item_frost_crown')
def _(c):
    c.poly([(4, 24), (4, 10), (10, 16), (16, 6), (22, 16), (28, 10), (28, 24)], BLUE[1]); c.poly([(4, 10), (10, 16), (4, 18)], BLUE[2]); c.poly([(16, 6), (22, 16), (16, 18)], BLUE[2]); c.rect(4, 21, 28, 25, STEEL[2]); c.rect(4, 21, 28, 21, STEEL[3]); c.rect(4, 25, 28, 25, STEEL[0])
    c.circ(16, 17, 2, BLUE[3]); c.circ(9, 22, 1, RED[2]); c.circ(23, 22, 1, RED[2]); c.circ(16, 23, 1, GREEN[2]); c.px(16, 8, WHITE)
@icon('item_master_blade')
def _(c):
    sword(c, (5, 27), (26, 6), 4, (STEEL[1], STEEL[3]), GOLD[2], LEATH[1], BLUE[2]); c.circ(10, 22, 2, BLUE[2]); c.px(9, 21, WHITE)
@icon('item_guard_armor')
def _(c):
    c.poly([(8, 6), (13, 6), (16, 9), (19, 6), (24, 6), (28, 10), (25, 15), (23, 14), (23, 27), (9, 27), (9, 14), (7, 15), (4, 10)], STEEL[1]); c.poly([(8, 6), (13, 6), (16, 9), (16, 27), (9, 27), (9, 14), (7, 15), (4, 10)], STEEL[2])
    c.line([(16, 9), (16, 26)], BLUE[1], 2); c.rect(9, 18, 23, 19, GOLD[1]); c.circ(16, 13, 2, GOLD[2]); c.rect(8, 6, 13, 6, GOLD[2]); c.rect(19, 6, 24, 6, GOLD[2])
@icon('item_storm_gloves')
def _(c):
    glove(c, STEEL, BLUE, 9, 5); bolt(c, 23, 9, .55, (GOLD[1], GOLD[2], GOLD[3])); c.rect(12, 22, 23, 22, BLUE[2])
@icon('item_flame_eye')
def _(c):
    eye(c, 16, 15, 13, 8, FIRE); flame(c, 16, 9, 8, 7); flame(c, 6, 11, 6, 5); flame(c, 26, 11, 6, 5); c.circ(16, 15, 3, RED[2]); c.circ(16, 15, 1.5, K); c.px(15, 14, WHITE)
@icon('item_blood_axe')
def _(c):
    axe(c, (6, 27), (17, 11), RED, 3, 1, 10, RED[3]); drop(c, 25, 24, 2.4, RED); c.px(22, 17, RED[2]); c.px(23, 20, RED[2])
@icon('item_twin_fangs')
def _(c):
    c.poly([(5, 5), (14, 5), (13, 11), (9, 27), (6, 11)], BONE[2]); c.poly([(5, 5), (14, 5), (13, 8), (6, 8)], BONE[1]); c.line([(7, 10), (9, 22)], BONE[3], 1)
    c.poly([(18, 5), (27, 5), (26, 11), (22, 27), (19, 11)], BONE[2]); c.poly([(18, 5), (27, 5), (26, 8), (19, 8)], BONE[1]); c.line([(20, 10), (22, 22)], BONE[3], 1)
    drop(c, 9, 28, 1.4, GREEN); drop(c, 22, 28, 1.4, GREEN)
@icon('item_tower_shield')
def _(c):
    c.poly([(7, 3), (25, 3), (25, 21), (16, 29), (7, 21)], STEEL[1]); c.poly([(9, 5), (23, 5), (23, 20), (16, 26), (9, 20)], STEEL[2]); c.poly([(16, 5), (23, 5), (23, 20), (16, 26)], STEEL[1])
    c.rect(14, 7, 17, 23, GOLD[1]); c.rect(10, 12, 22, 15, GOLD[1]); c.rect(14, 7, 15, 23, GOLD[2]); c.rect(10, 12, 22, 12, GOLD[2]); c.circ(16, 13, 2, RED[2])
@icon('item_hawkeye')
def _(c):
    c.poly([(6, 22), (6, 10), (13, 4), (23, 5), (27, 12), (22, 13), (24, 16), (16, 18), (12, 28)], BONE[2]); c.poly([(6, 22), (6, 10), (13, 4), (16, 10), (12, 28)], WOOD[1]); c.poly([(13, 4), (23, 5), (16, 10)], WOOD[2])
    c.poly([(27, 12), (22, 13), (24, 16), (30, 15)], GOLD[2]); c.poly([(22, 13), (24, 16), (30, 15), (27, 13)], GOLD[1]); c.circ(19, 11, 3, GOLD[3]); c.circ(19, 11, 1.5, K); c.px(18, 10, WHITE); c.line([(14, 8), (22, 8)], K, 1)
@icon('item_troll_heart')
def _(c):
    heart(c, 16, 14, 10, GREEN); c.line([(10, 10), (14, 17), (18, 12), (22, 18)], GREEN[0], 1); c.line([(16, 24), (16, 28)], GREEN[1], 2); c.px(9, 8, WHITE)
@icon('item_bastion')
def _(c):
    c.rect(4, 14, 27, 28, STONE[1]); c.rect(4, 14, 27, 16, STONE[2]); c.rect(4, 26, 27, 28, STONE[0])
    for x in (4, 11, 18, 24): c.rect(x, 8, x + 3, 14, STONE[1]); c.rect(x, 8, x + 1, 14, STONE[2])
    for y in (19, 23): c.line([(5, y), (26, y)], STONE[0], 1)
    for x, y in ((10, 21), (17, 21), (24, 21), (7, 25), (14, 25), (21, 25)): c.line([(x, y - 2), (x, y)], STONE[0], 1)
    c.rect(14, 17, 17, 22, K); c.rect(15, 18, 16, 21, STEEL[0]); c.rect(22, 3, 22, 8, WOOD[1]); c.poly([(23, 3), (29, 5), (23, 7)], BLUE[1])

# ===================== HERO SKILLS =====================
@icon('skill_taunt')
def _(c):
    star(c, 16, 15, 14, 8, 8, RED[1]); star(c, 16, 15, 11, 6, 8, RED[2]); c.rect(14, 7, 17, 17, K); c.rect(15, 8, 16, 16, WHITE); c.rect(14, 20, 17, 23, K); c.rect(15, 21, 16, 22, WHITE)
@icon('skill_thorns')
def _(c):
    c.rect(11, 8, 20, 27, GREEN[1]); c.rect(11, 8, 14, 27, GREEN[2]); c.rect(18, 8, 20, 27, GREEN[0]); c.circ(15, 8, 4.5, GREEN[1]); c.rect(4, 14, 11, 17, GREEN[1]); c.rect(4, 8, 7, 17, GREEN[1]); c.rect(20, 17, 27, 20, GREEN[1]); c.rect(24, 11, 27, 20, GREEN[1])
    for x, y in ((9, 6), (22, 9), (8, 13), (26, 10), (4, 12), (27, 16), (14, 4), (17, 4), (12, 20), (19, 24)): c.px(x, y, BONE[3])
    for x, y in ((12, 13), (18, 14), (13, 24), (17, 19)): c.px(x, y, BONE[3])
@icon('skill_bulwark')
def _(c):
    for r, y in enumerate((5, 13, 21)):
        off = 0 if r % 2 == 0 else 5
        for x in range(4 - off, 30, 10):
            x0 = max(x, 4); x1 = min(x + 8, 28)
            if x1 - x0 > 1: c.rect(x0, y, x1, y + 6, STONE[1]); c.rect(x0, y, x1, y + 1, STONE[2]); c.rect(x0, y + 6, x1, y + 6, STONE[0])
    c.rect(4, 5, 4, 27, STONE[0]); c.rect(28, 5, 28, 27, STONE[0])
@icon('skill_volley')
def _(c):
    for x, y in ((8, 8), (16, 5), (24, 9)): arrow(c, (x - 3, y - 4), (x + 5, y + 14))
    arrow(c, (12, 12), (20, 28)); c.line([(4, 29), (28, 29)], WOOD[1], 1)
@icon('skill_pierce')
def _(c):
    c.poly([(16, 4), (26, 4), (26, 28), (16, 28)], STEEL[1]); c.poly([(16, 4), (26, 4), (26, 7), (16, 7)], STEEL[2]); c.rect(19, 10, 22, 22, K)
    arrow(c, (2, 16), (30, 16), STEEL[3], WOOD[2], RED[2]); c.px(26, 16, WHITE); c.line([(3, 11), (10, 11)], BLUE[3], 1); c.line([(3, 21), (10, 21)], BLUE[3], 1)
@icon('skill_crit')
def _(c):
    c.poly([(6, 12), (16, 5), (26, 12), (16, 19)], BONE[3]); c.poly([(6, 12), (16, 19), (16, 28), (6, 21)], BONE[1]); c.poly([(26, 12), (16, 19), (16, 28), (26, 21)], BONE[0])
    c.rect(15, 10, 18, 13, RED[2]); c.circ(10, 20, 1.2, RED[1]); c.circ(10, 24, 1.2, RED[1]) if False else None
    c.circ(10, 17, 1, RED[1]); c.circ(11, 23, 1, RED[1]); c.circ(22, 17, 1, K); c.circ(21, 23, 1, K); c.circ(22, 23, 1, K) if False else None
@icon('skill_multishot')
def _(c):
    for a, x in ((-0.45, 7), (0, 8), (0.45, 9)):
        p0 = (6 + (x - 8) * 0, 26 - (x - 7) * 0); dx = math.cos(a - 0.78) * 24; dy = math.sin(a - 0.78) * 24
        arrow(c, (5, 27), (5 + math.cos(a - 0.85) * 25, 27 + math.sin(a - 0.85) * 25))
@icon('skill_meteor')
def _(c):
    c.poly([(2, 4), (18, 12), (12, 18)], FIRE[0]); c.poly([(2, 10), (16, 16), (10, 22)], FIRE[1]); c.poly([(4, 6), (14, 13), (10, 17)], FIRE[2])
    c.circ(21, 20, 8, STONE[0]); c.circ(21, 20, 7, rgb('6a5048')); c.circ(19, 18, 3, rgb('8a7064')); c.circ(24, 23, 2, rgb('4a3a38')); c.px(17, 16, FIRE[3]); c.px(26, 14, FIRE[2]); c.px(28, 20, FIRE[1])
@icon('skill_ring')
def _(c):
    c.circ(16, 16, 12, FIRE[0]); c.circ(16, 16, 8, (0, 0, 0, 0)); c.ell(8, 8, 24, 24, (0, 0, 0, 0))
    c.circ(16, 16, 12, FIRE[1]); c.ell(9, 9, 23, 23, (0, 0, 0, 0)); c.ell(11, 11, 21, 21, (0, 0, 0, 0))
    for a in range(0, 360, 30): x = 16 + math.cos(math.radians(a)) * 11; y = 16 + math.sin(math.radians(a)) * 11; flame(c, x, y + 2, 5 if a % 60 == 0 else 4, 3, FIRE)
@icon('skill_ignite')
def _(c): flame(c, 16, 28, 25, 19)
@icon('skill_inferno')
def _(c):
    c.poly([(2, 28), (11, 12), (21, 12), (30, 28)], rgb('5a4444')); c.poly([(2, 28), (11, 12), (14, 12), (8, 28)], rgb('7a6060')); c.poly([(11, 12), (14, 8), (18, 8), (21, 12)], FIRE[0])
    flame(c, 16, 14, 14, 11); flame(c, 9, 12, 8, 6); flame(c, 24, 12, 9, 6); c.line([(13, 20), (15, 26)], FIRE[1], 1); c.line([(19, 20), (22, 27)], FIRE[1], 1)
@icon('skill_raise')
def _(c):
    c.rect(2, 26, 30, 29, rgb('4a3a30')); c.rect(2, 26, 30, 26, rgb('6a5444'))
    c.rect(14, 14, 18, 26, BONE[2]); c.rect(14, 14, 15, 26, BONE[3])
    for x, h in ((9, 9), (13, 6), (17, 5), (21, 7), (25, 11)): c.rect(x, 14 - h + 3, x + 2, 15, BONE[2]); c.rect(x, 14 - h + 3, x, 15, BONE[3])
    c.rect(9, 14, 25, 17, BONE[2]); c.rect(9, 14, 25, 14, BONE[3])
    for x, y in ((6, 8), (26, 6), (4, 18)): c.circ(x, y, 1.5, GREEN[2]); c.px(x, y - 1, GREEN[3])
@icon('skill_drain')
def _(c):
    c.poly([(8, 28), (6, 14), (10, 6), (16, 3), (22, 6), (26, 14), (24, 28), (20, 24), (16, 28), (12, 24)], PURP[2]); c.poly([(6, 14), (10, 6), (16, 3), (12, 12), (12, 24), (8, 28)], PURP[3])
    c.poly([(24, 28), (26, 14), (22, 6), (20, 24)], PURP[1]); c.ell(10, 11, 14, 17, K); c.ell(18, 11, 22, 17, K); c.ell(14, 19, 18, 24, K); c.px(11, 12, RED[2]); c.px(19, 12, RED[2])
    heart(c, 27, 5, 2.5, RED)
@icon('skill_necromancy')
def _(c):
    c.poly([(11, 3), (21, 3), (28, 12), (22, 29), (10, 29), (4, 12)], WOOD[1]); c.poly([(11, 3), (21, 3), (28, 12), (24, 12), (20, 6), (12, 6)], WOOD[2]); c.poly([(4, 12), (11, 3), (12, 6), (8, 12)], WOOD[2]); c.poly([(28, 12), (22, 29), (19, 29), (24, 12)], WOOD[0])
    c.rect(14, 9, 17, 24, PURP[2]); c.rect(10, 13, 21, 16, PURP[2]); c.rect(14, 9, 14, 24, PURP[3]); c.rect(10, 13, 21, 13, PURP[3]); c.circ(5, 6, 1.5, PURP[2]); c.circ(27, 8, 1.5, PURP[2])
@icon('skill_bonearmor')
def _(c):
    heater(c, 5, 3, 27, 29, BONE[1], BONE[3], BONE[0])
    for y in (9, 13, 17): c.line([(16, y), (9, y + 2)], BONE[3], 2); c.line([(16, y), (23, y + 2)], BONE[0], 2)
    c.rect(15, 6, 17, 21, BONE[2])
@icon('skill_lich')
def _(c):
    skull(c, 16, 17, .95, BONE, PURP[2]); c.circ(11, 14, 1, PURP[3]); c.circ(21, 14, 1, PURP[3])
    c.poly([(5, 12), (7, 3), (11, 8), (16, 1), (21, 8), (25, 3), (27, 12)], GOLD[1]); c.poly([(5, 12), (7, 3), (9, 6), (7, 12)], GOLD[2]); c.rect(5, 11, 27, 13, GOLD[1]); c.rect(5, 11, 27, 11, GOLD[2]); c.circ(16, 8, 1.5, PURP[2]); c.px(16, 8, PURP[3])
@icon('skill_plague')
def _(c):
    for a in range(0, 360, 45): x = 16 + math.cos(math.radians(a)) * 11; y = 16 + math.sin(math.radians(a)) * 11; c.tl((16 + math.cos(math.radians(a)) * 6, 16 + math.sin(math.radians(a)) * 6), (x, y), 2, GREEN[0]); c.circ(x, y, 2, GREEN[2])
    c.circ(16, 16, 9, GREEN[1]); c.circ(14, 14, 4, GREEN[2]); c.circ(13, 13, 1.5, GREEN[3]); c.circ(20, 20, 2, GREEN[0]); c.circ(21, 14, 1.5, GREEN[0]); c.circ(12, 21, 1.5, GREEN[0])
@icon('skill_quake')
def _(c):
    c.poly([(2, 18), (30, 18), (30, 28), (2, 28)], rgb('6a5444')); c.poly([(2, 18), (30, 18), (30, 21), (2, 21)], rgb('8a7060'))
    c.poly([(14, 18), (16, 8), (12, 3), (19, 12), (18, 18)], K); c.poly([(15, 18), (16, 11), (17, 18)], FIRE[1]); c.line([(16, 18), (14, 26)], K, 2); c.line([(17, 21), (22, 28)], K, 1)
    for x, y, r in ((6, 12, 3), (26, 10, 3), (9, 5, 2), (24, 3, 2), (28, 15, 2)): c.circ(x, y, r, rgb('7a6a60')); c.px(x - 1, y - 1, rgb('a09084'))
@icon('skill_retaliation')
def _(c):
    c.rect(15, 5, 17, 26, GOLD[1]); c.rect(15, 5, 15, 26, GOLD[2]); c.rect(9, 26, 23, 28, GOLD[1]); c.circ(16, 5, 2.5, GOLD[2]); c.rect(4, 8, 28, 9, GOLD[2]); c.rect(4, 9, 28, 9, GOLD[0])
    for x in (7, 25): c.line([(x, 9), (x - 4, 18)], GOLD[0], 1); c.line([(x, 9), (x + 4, 18)], GOLD[0], 1); c.ell(x - 5, 17, x + 5, 21, STEEL[1]); c.rect(x - 5, 19, x + 5, 19, STEEL[2])
@icon('skill_storm')
def _(c):
    c.ell(3, 3, 29, 12, STEEL[1]); c.ell(5, 3, 21, 11, STEEL[2]); c.ell(14, 5, 29, 13, STEEL[0])
    for y, x0, x1 in ((13, 7, 25), (17, 9, 23), (21, 11, 21), (25, 13, 19)): c.rect(x0, y, x1, y + 2, BLUE[1]); c.rect(x0, y, x0 + 3, y + 1, BLUE[3])
    bolt(c, 20, 20, .45, (GOLD[1], GOLD[2], GOLD[3]))
@icon('skill_deadeye')
def _(c):
    c.circ(16, 16, 13, RED[1]); c.circ(16, 16, 10, (0, 0, 0, 0)); c.ell(6, 6, 26, 26, (0, 0, 0, 0))
    c.rect(15, 1, 17, 8, RED[1]); c.rect(15, 24, 17, 31, RED[1]); c.rect(1, 15, 8, 17, RED[1]); c.rect(24, 15, 31, 17, RED[1])
    eye(c, 16, 16, 8, 5, RED); c.px(11, 4, RED[3]); c.px(4, 11, RED[3])
@icon('skill_rain')
def _(c):
    for x, y, s in ((22, 8, 1), (12, 14, 1.2), (22, 22, .8)):
        c.poly([(x - 14 * s, y - 14 * s), (x - 2 * s, y - 2 * s), (x - 4 * s, y - 5 * s)], GOLD[1]) if False else None
        c.tl((x - 11 * s, y - 11 * s), (x - 2 * s, y - 2 * s), 3 * s, BLUE[2]); c.tl((x - 8 * s, y - 8 * s), (x - 2 * s, y - 2 * s), 1.5, BLUE[3]); star(c, x, y, 5 * s, 2 * s, 5, GOLD[2]); c.px(x, y, GOLD[3])
@icon('skill_wildfire')
def _(c):
    flame(c, 9, 28, 17, 12); flame(c, 22, 28, 20, 13); flame(c, 16, 28, 26, 14); c.rect(3, 28, 29, 29, rgb('4a3a30'))
@icon('skill_might')
def _(c):
    c.poly([(5, 20), (5, 12), (10, 8), (18, 9), (24, 6), (28, 10), (27, 18), (22, 24), (16, 28), (9, 27)], SKIN[1]); c.poly([(5, 20), (5, 12), (10, 8), (18, 9), (12, 14), (9, 22)], SKIN[2]); c.poly([(22, 24), (16, 28), (9, 27), (14, 22)], SKIN[0])
    c.ell(14, 4, 26, 13, SKIN[1]); c.ell(14, 4, 21, 9, SKIN[2]); c.line([(15, 14), (20, 13)], SKIN[0], 1); c.rect(4, 20, 8, 27, RED[1]); c.rect(4, 20, 8, 21, RED[2])
@icon('skill_vigor')
def _(c): heart(c, 16, 14, 11, RED); c.line([(7, 25), (10, 27)], RED[0], 1) if False else None
@icon('skill_haste')
def _(c):
    c.poly([(8, 8), (17, 8), (17, 18), (27, 21), (27, 27), (8, 27)], LEATH[1]); c.poly([(8, 8), (11, 8), (11, 27), (8, 27)], LEATH[2]); c.rect(8, 24, 27, 27, LEATH[0]); c.rect(8, 8, 17, 11, LEATH[3])
    c.poly([(2, 12), (10, 14), (8, 17), (3, 20), (7, 17)], WHITE); c.poly([(3, 10), (9, 12), (4, 14)], BONE[3]); c.poly([(1, 17), (8, 17), (3, 21)], BONE[2]); c.line([(20, 5), (27, 5)], BLUE[3], 1); c.line([(24, 9), (30, 9)], BLUE[3], 1)
@icon('skill_guard')
def _(c): heater(c, 5, 3, 27, 29, BLUE[1], STEEL[2], BLUE[0]); c.rect(15, 8, 17, 20, GOLD[2]); c.rect(11, 12, 21, 14, GOLD[2])
@icon('skill_leech')
def _(c):
    drop(c, 16, 21, 8.5, RED)
    c.line([(24, 7), (28, 11), (26, 15), (22, 13)], rgb('4a1a2a'), 3); c.px(23, 6, RED[3]); c.px(24, 7, rgb('7a2a3a')); c.px(23, 8, RED[2])
@icon('skill_focus')
def _(c):
    c.rect(6, 3, 26, 6, GOLD[1]); c.rect(6, 26, 26, 29, GOLD[1]); c.rect(6, 3, 26, 3, GOLD[2]); c.rect(6, 26, 26, 26, GOLD[2]); c.rect(6, 29, 26, 29, GOLD[0])
    c.poly([(9, 6), (23, 6), (17, 15), (23, 26), (9, 26), (15, 15)], BLUE[3]); c.poly([(9, 6), (23, 6), (21, 8), (11, 8)], BLUE[2]); c.poly([(11, 24), (21, 24), (18, 20), (14, 20)], GOLD[3]); c.rect(15, 15, 17, 20, GOLD[2]); c.px(16, 12, GOLD[2])

@icon('skill_shieldBash')
def _(c):
    heater(c, 4, 6, 22, 28, STEEL[1], STEEL[2], STEEL[0]); c.rect(12, 11, 14, 22, GOLD[2]); c.rect(8, 15, 18, 17, GOLD[2])
    star(c, 25, 9, 6, 2.5, 8, GOLD[2]); star(c, 25, 9, 3.5, 1.5, 8, GOLD[3]); c.px(25, 9, WHITE)

# ===================== SPELLS =====================
@icon('spell_fire')
def _(c):
    c.poly([(1, 3), (18, 14), (12, 20)], FIRE[0]); c.poly([(1, 10), (15, 18), (9, 24)], FIRE[1]); c.poly([(5, 6), (15, 15), (11, 19)], FIRE[2])
    c.circ(21, 20, 9, STONE[0]); c.circ(21, 20, 8, rgb('6a5048')); c.circ(19, 18, 3.5, rgb('8a7064')); c.circ(25, 23, 2, rgb('4a3a38')); c.circ(24, 16, 1.5, FIRE[1]); c.px(17, 16, FIRE[3]); c.px(18, 15, FIRE[3])
    flame(c, 26, 12, 8, 6)
@icon('spell_frost')
def _(c):
    for a in (90, 30, -30):
        for s in (1, -1):
            pass
    cx = cy = 16
    for a in range(0, 360, 60):
        x = cx + math.cos(math.radians(a)) * 13; y = cy + math.sin(math.radians(a)) * 13; c.tl((cx, cy), (x, y), 3, BLUE[2]); c.tl((cx, cy), (x, y), 1, BLUE[3])
        mx = cx + math.cos(math.radians(a)) * 8; my = cy + math.sin(math.radians(a)) * 8
        for d in (-50, 50):
            c.line([(mx, my), (mx + math.cos(math.radians(a + d)) * 5, my + math.sin(math.radians(a + d)) * 5)], BLUE[2], 2)
    c.circ(16, 16, 3.5, BLUE[3]); c.circ(16, 16, 1.5, WHITE)
@icon('spell_turret')
def _(c):
    c.rect(8, 12, 23, 28, STONE[1]); c.rect(8, 12, 11, 28, STONE[2]); c.rect(20, 12, 23, 28, STONE[0])
    for x in (6, 12, 18): c.rect(x, 6, x + 4, 12, STONE[1]); c.rect(x, 6, x + 1, 12, STONE[2])
    c.rect(6, 12, 25, 13, STONE[0]); c.rect(14, 17, 17, 23, K); c.rect(15, 18, 16, 22, BLUE[0]); c.line([(9, 25), (22, 25)], STONE[0], 1)
    c.tl((16, 3), (16, 7), 2, WOOD[1]); arrow(c, (24, 7), (29, 2), STEEL[3], WOOD[2], RED[2])
@icon('spell_bless')
def _(c):
    c.circ(16, 16, 13, GOLD[3]); c.circ(16, 16, 11, (0, 0, 0, 0)); c.ell(5, 5, 27, 27, (0, 0, 0, 0)); c.circ(16, 16, 12, rgb('fff3b0')); c.ell(6, 6, 26, 26, (0, 0, 0, 0))
    star(c, 16, 16, 12, 4.5, 4, GOLD[2]); star(c, 16, 16, 8, 3, 4, GOLD[3]); c.circ(16, 16, 3, WHITE)
    for x, y in ((6, 6), (26, 6), (6, 26), (26, 26)): c.px(x, y, GOLD[3])

# ===================== ORDERS =====================
@icon('order_horn')
def _(c):
    c.poly([(3, 18), (6, 12), (15, 12), (25, 5), (28, 9), (22, 21), (14, 21), (6, 24)], GOLD[1]); c.poly([(15, 12), (25, 5), (27, 7), (16, 14)], GOLD[3]); c.poly([(6, 24), (14, 21), (22, 21), (20, 25), (8, 28)], GOLD[0])
    c.ell(22, 5, 29, 21, BONE[2]) if False else None
    c.poly([(23, 5), (29, 8), (23, 22), (21, 20)], BONE[2]); c.poly([(23, 5), (25, 6), (23, 18)], BONE[3]); c.rect(7, 15, 12, 17, RED[2])
@icon('order_tar')
def _(c):
    c.ell(5, 16, 27, 28, rgb('3a2a30')); c.ell(5, 12, 27, 22, rgb('5a4a50')); c.ell(7, 13, 25, 20, rgb('15101a')); c.ell(8, 14, 14, 17, rgb('4a3a46'))
    c.rect(5, 17, 27, 25, rgb('3a2a30')); c.rect(5, 17, 8, 26, rgb('5a4a50')); c.ell(5, 23, 27, 29, rgb('2a1a20'))
    flame(c, 10, 29, 8, 6); flame(c, 22, 29, 8, 6); c.line([(12, 21), (20, 21)], rgb('15101a'), 1); drop(c, 16, 9, 2.5, (rgb('15101a'), rgb('2a2030'), rgb('4a3a56'), rgb('7a6a86')))
@icon('order_militia')
def _(c):
    for t in range(0, 21):
        a = math.radians(-70 + t * 7); x = 7 + math.cos(a) * 12; y = 16 + math.sin(a) * 12; c.circ(x, y, 1.2, WOOD[1])
    c.line([(16, 5), (16, 27)], STEEL[3], 1); arrow(c, (7, 16), (28, 16)); c.rect(5, 14, 8, 18, LEATH[1])
    c.circ(23, 8, 0, WHITE); c.poly([(20, 24), (26, 24), (26, 29), (20, 29)], STONE[1]); c.rect(20, 24, 21, 29, STONE[2]) if False else None
@icon('order_bounty')
def _(c):
    for i, (x, y) in enumerate(((5, 22), (14, 24), (22, 22))):
        c.ell(x, y, x + 9, y + 5, GOLD[0]); c.rect(x, y - 3, x + 9, y + 2, GOLD[1]); c.ell(x, y - 5, x + 9, y, GOLD[2]); c.ell(x + 2, y - 4, x + 7, y - 1, GOLD[3]) if i == 1 else None
    for i, (x, y) in enumerate(((8, 14), (18, 16))):
        c.ell(x, y, x + 9, y + 5, GOLD[0]); c.rect(x, y - 3, x + 9, y + 2, GOLD[1]); c.ell(x, y - 5, x + 9, y, GOLD[2])
    c.ell(11, 6, 20, 11, GOLD[0]); c.rect(11, 3, 20, 8, GOLD[1]); c.ell(11, 1, 20, 6, GOLD[2]); c.ell(13, 2, 18, 5, GOLD[3]); c.px(15, 3, WHITE)


# ===================== STAGE 2 shared shapes =====================
def face(c, skin, cy=17, w=9, h=8, ears=True, tusks=False, eyes=GOLD[2], brow=True, teeth=True):
    if ears:
        c.poly([(16 - w + 2, cy - 3), (1, cy - 8), (16 - w + 1, cy + 3)], skin[1]); c.poly([(16 + w - 2, cy - 3), (30, cy - 8), (16 + w - 1, cy + 3)], skin[0])
        c.poly([(16 - w + 1, cy - 2), (4, cy - 6), (16 - w + 1, cy + 1)], skin[0])
    c.ell(16 - w, cy - h, 16 + w, cy + h, skin[1]); c.ell(16 - w + 1, cy - h + 1, 16 + 2, cy + 1, skin[2]); c.ell(16 - w + 3, cy - h + 3, 16 + w - 1, cy + h - 1, skin[1])
    c.poly([(16 + 2, cy + h - 1), (16 + w - 1, cy), (16 + w - 2, cy + h - 3)], skin[0])
    for sx in (-1, 1):
        ex = 16 + sx * 4
        c.ell(ex - 2, cy - 3, ex + 2, cy, eyes); c.rect(ex - .5 + sx * .3, cy - 2.5, ex + .5 + sx * .3, cy - .5, K)
        if brow: c.tl((ex - sx * 3.2, cy - 5.5), (ex + sx * 2.2, cy - 3.2), 1.5, K)
    c.poly([(15, cy), (17, cy), (18, cy + 3), (14, cy + 3)], skin[0])
    c.rect(11, cy + 4, 20, cy + 5.4, K)
    if teeth:
        for x in (12, 15, 18): c.rect(x, cy + 4, x + .8, cy + 4.6, BONE[3])
    if tusks:
        for sx in (-1, 1): c.poly([(16 + sx * 5.5, cy + 6), (16 + sx * 4, cy + 6), (16 + sx * 5, cy + 1.5)], BONE[3])
def helmet(c, cols, cy=17, w=9, crest=None):
    c.poly([(16 - w - .5, cy - 2), (16 - w + 1, cy - 8), (16, cy - 11), (16 + w - 1, cy - 8), (16 + w + .5, cy - 2)], cols[1]); c.poly([(16 - w - .5, cy - 2), (16 - w + 1, cy - 8), (16, cy - 11), (16, cy - 2)], cols[2])
    c.rect(16 - w - .5, cy - 3, 16 + w + .5, cy - 1.6, cols[0]); c.rect(15.3, cy - 10, 16.6, cy + 1, cols[0])
    if crest: c.poly([(12, cy - 10), (16, cy - 16), (22, cy - 13), (20, cy - 9)], crest[1]); c.poly([(12, cy - 10), (16, cy - 16), (17, cy - 11)], crest[2])
def crown(c, y=8, w=8, cols=GOLD, gem=RED):
    c.poly([(16 - w, y + 5), (16 - w, y - 3), (16 - w / 2, y + 1), (16, y - 5), (16 + w / 2, y + 1), (16 + w, y - 3), (16 + w, y + 5)], cols[1]); c.poly([(16 - w, y + 5), (16 - w, y - 3), (16 - w / 2, y + 1), (16 - w / 2, y + 5)], cols[2])
    c.rect(16 - w, y + 3, 16 + w, y + 5, cols[1]); c.rect(16 - w, y + 3, 16 + w, y + 3.5, cols[3]); c.circ(16, y + 1.5, 1.3, gem[2])
def hood(c, cols, cy=17):
    c.poly([(16, cy - 15), (27, cy - 4), (28, cy + 11), (4, cy + 11), (5, cy - 4)], cols[1]); c.poly([(16, cy - 15), (5, cy - 4), (4, cy + 11), (9, cy + 11), (9, cy - 2)], cols[2]); c.poly([(27, cy - 4), (28, cy + 11), (23, cy + 11), (23, cy - 2)], cols[0])
    c.ell(8.5, cy - 8, 23.5, cy + 9, K)
def coinstack(c, x, y, n=3, cols=GOLD, w=10):
    for i in range(n):
        yy = y - i * 3; c.ell(x, yy, x + w, yy + 4.5, cols[0]); c.rect(x, yy - 1.5, x + w, yy + 2, cols[1]); c.ell(x, yy - 4, x + w, yy + .5, cols[2])
    c.ell(x + 2, y - (n - 1) * 3 - 3, x + w - 2, y - (n - 1) * 3 - .5, cols[3])
def coin(c, cx, cy, r, cols=GOLD, mark=True):
    c.circ(cx, cy, r, cols[0]); c.circ(cx - .4, cy - .4, r - .8, cols[1]); c.circ(cx - .4, cy - .4, r - 2.2, cols[2])
    if mark: star(c, cx, cy, r * .62, r * .26, 5, cols[0])
    c.tl((cx - r * .55, cy - r * .15), (cx - r * .1, cy - r * .6), 1, cols[3])
def gem(c, cx, cy, s=1.0, cols=BLUE):
    c.poly([(cx - 7 * s, cy - 6 * s), (cx + 7 * s, cy - 6 * s), (cx + 11 * s, cy - 1 * s), (cx, cy + 10 * s), (cx - 11 * s, cy - 1 * s)], cols[1])
    c.poly([(cx - 7 * s, cy - 6 * s), (cx - 3 * s, cy - 1 * s), (cx - 11 * s, cy - 1 * s)], cols[2]); c.poly([(cx - 7 * s, cy - 6 * s), (cx + 7 * s, cy - 6 * s), (cx + 3 * s, cy - 1 * s), (cx - 3 * s, cy - 1 * s)], cols[3])
    c.poly([(cx + 7 * s, cy - 6 * s), (cx + 11 * s, cy - 1 * s), (cx + 3 * s, cy - 1 * s)], cols[2]); c.poly([(cx - 3 * s, cy - 1 * s), (cx + 3 * s, cy - 1 * s), (cx, cy + 10 * s)], cols[2]); c.poly([(cx + 3 * s, cy - 1 * s), (cx + 11 * s, cy - 1 * s), (cx, cy + 10 * s)], cols[0])
def chest(c, x0=4, y0=9, x1=27, y1=27, wood=WOOD, trim=GOLD, opened=False):
    if opened: c.poly([(x0, y0 + 6), (x0 + 2, y0 - 4), (x1 - 2, y0 - 4), (x1, y0 + 6)], wood[0]); c.rect(x0 + 3, y0 + 1, x1 - 3, y0 + 6, GOLD[2]); c.rect(x0 + 5, y0, x1 - 6, y0 + 2, GOLD[3])
    else: c.poly([(x0, y0 + 7), (x0, y0 + 3), (x0 + 3, y0), (x1 - 3, y0), (x1, y0 + 3), (x1, y0 + 7)], wood[2]); c.rect(x0, y0 + 5, x1, y0 + 7, wood[0])
    c.rect(x0, y0 + 7, x1, y1, wood[1]); c.rect(x0, y0 + 7, x1, y0 + 8.5, trim[1]); c.rect(x0, y1 - 1.5, x1, y1, trim[0])
    for x in (x0, x1 - 2): c.rect(x, y0 + (7 if opened else 1), x + 2, y1, trim[1])
    c.rect(14, y0 + 6, 17.5, y0 + 12, trim[2]); c.rect(15.3, y0 + 8.5, 16.2, y0 + 10.5, K)
def flag(c, cols, px0=7, emblem=None, tatter=False):
    c.tl((px0, 29), (px0, 3), 2, WOOD[1]); c.circ(px0, 3, 1.6, GOLD[2])
    pts = [(px0 + 1.5, 5), (27, 6), (27, 18), (px0 + 1.5, 19)] if not tatter else [(px0 + 1.5, 5), (27, 6), (24, 10), (27, 13), (23, 16), (26, 20), (19, 18), (15, 21), (px0 + 1.5, 19)]
    c.poly(pts, cols[1]); c.poly([(px0 + 1.5, 5), (27, 6), (25, 8.5), (px0 + 1.5, 8)], cols[2])
    if emblem: emblem(c)
def tower(c, x0=9, x1=22, y0=11, y1=29, cols=STONE, roof=None):
    c.rect(x0, y0, x1, y1, cols[1]); c.rect(x0, y0, x0 + 3, y1, cols[2]); c.rect(x1 - 3, y0, x1, y1, cols[0])
    for i in range(3): xx = x0 - 2 + i * ((x1 - x0 + 4 - 4) / 2); c.rect(xx, y0 - 6, xx + 4, y0, cols[1]); c.rect(xx, y0 - 6, xx + 1, y0, cols[2])
    c.rect(x0 - 2, y0, x1 + 2, y0 + 1.4, cols[0]); c.rect(14.5, y0 + 5, 17, y0 + 11, K)
def scroll(c, x0=6, y0=5, x1=25, y1=27):
    c.rect(x0 + 1, y0 + 2, x1 - 1, y1 - 2, BONE[2]); c.rect(x0 + 1, y0 + 2, x0 + 4, y1 - 2, BONE[3]); c.rect(x1 - 3, y0 + 2, x1 - 1, y1 - 2, BONE[1])
    for y in (y0, y1 - 3): c.rect(x0 - 1, y, x1 + 1, y + 3, BONE[1]); c.rect(x0 - 1, y, x1 + 1, y + 1, BONE[3]); c.circ(x0 - 1, y + 1.5, 1.5, BONE[0]); c.circ(x1 + 1, y + 1.5, 1.5, BONE[0])
def xswords(c, cx=16, cy=16, r=12, w=3):
    sword(c, (cx - r, cy + r), (cx + r, cy - r), w, (STEEL[1], STEEL[3]), GOLD[1], WOOD[1], GOLD[2]); sword(c, (cx + r, cy + r), (cx - r, cy - r), w, (STEEL[1], STEEL[3]), GOLD[1], WOOD[1], GOLD[2])
def anvil(c, y=14):
    c.poly([(3, y), (27, y), (27, y + 5), (20, y + 6), (19, y + 10), (24, y + 13), (24, y + 15), (7, y + 15), (7, y + 13), (12, y + 10), (11, y + 6), (7, y + 5)], STEEL[0]); c.poly([(3, y), (27, y), (27, y + 2), (4, y + 2)], STEEL[2]); c.rect(7, y + 13, 24, y + 15, rgb('3c4658'))
def hammer(c, base, top, head=STEEL, hs=5):
    c.tl(base, top, 2.4, WOOD[1]); dx, dy = top[0] - base[0], top[1] - base[1]; n = math.hypot(dx, dy); ux, uy = dx / n, dy / n; nx, ny = -uy, ux
    P = lambda t, o: (top[0] + ux * t + nx * o, top[1] + uy * t + ny * o)
    c.poly([P(-3, -hs * 1.4), P(3, -hs * 1.4), P(3, hs * 1.4), P(-3, hs * 1.4)], head[1]); c.poly([P(1, -hs * 1.4), P(3, -hs * 1.4), P(3, hs * 1.4), P(1, hs * 1.4)], head[2])
def pine(c, cx=16, by=29, h=24, cols=GREEN, snow=False):
    c.rect(cx - 1.5, by - 5, cx + 1.5, by, WOOD[0])
    for i, (yy, w) in enumerate(((by - 4, 10), (by - 10, 8), (by - 16, 6))):
        c.poly([(cx - w, yy), (cx, yy - 10), (cx + w, yy)], cols[1]); c.poly([(cx - w, yy), (cx, yy - 10), (cx - 1, yy)], cols[2]); c.poly([(cx + w, yy), (cx + 2, yy - 6), (cx + 3, yy)], cols[0])
        if snow: c.poly([(cx - w * .55, yy - 4.5), (cx, yy - 10), (cx + w * .55, yy - 4.5), (cx + w * .2, yy - 6), (cx - w * .2, yy - 4.5)], WHITE)
def bomb(c, cx=15, cy=19, r=9):
    c.circ(cx, cy, r, rgb('2e2a3a')); c.circ(cx - 1, cy - 1, r - 1.5, rgb('454056')); c.circ(cx + 1, cy + 1, r - 2.5, rgb('2e2a3a')); c.circ(cx - r * .4, cy - r * .4, r * .22, rgb('8a86a0'))
    c.rect(cx - 2, cy - r - 2.5, cx + 2, cy - r + 1, STEEL[0]); c.line([(cx, cy - r - 2), (cx + 3, cy - r - 5), (cx + 7, cy - r - 4)], WOOD[2], 1.2); star(c, cx + 8.5, cy - r - 4.5, 4, 1.6, 6, FIRE[2]); c.circ(cx + 8.5, cy - r - 4.5, 1.2, FIRE[3])
def book(c, cover=RED, x0=6, y0=4, x1=25, y1=28, mark=None):
    c.rect(x0, y0, x1, y1, cover[1]); c.rect(x0, y0, x0 + 3, y1, cover[0]); c.rect(x0 + 3, y1 - 3, x1, y1 - .5, BONE[3]); c.rect(x0 + 3, y1 - 1, x1, y1, cover[0]); c.rect(x0 + 4, y0, x1, y0 + 1.2, cover[2])
    for (x, y) in ((x0 + 5, y0 + 2), (x1 - 2, y0 + 2), (x0 + 5, y1 - 6), (x1 - 2, y1 - 6)): c.rect(x, y, x + 1, y + 1, GOLD[2])
    if mark: mark(c)
def wall(c, y0=10, cols=STONE, rows=3):
    for r in range(rows):
        y = y0 + r * 6; off = 0 if r % 2 == 0 else 5
        for x in range(3 - off, 30, 10):
            xa = max(x, 3); xb = min(x + 8.4, 28.4)
            if xb - xa > 1: c.rect(xa, y, xb, y + 4.6, cols[1]); c.rect(xa, y, xb, y + 1, cols[2]); c.rect(xa, y + 4, xb, y + 4.6, cols[0])
def magnifier(c, cx=13, cy=13, r=8):
    c.tl((cx + r * .6, cy + r * .6), (28, 28), 3.4, WOOD[1]); c.circ(cx, cy, r, GOLD[1]); c.circ(cx, cy, r - 2, BLUE[3]); c.tl((cx - 4, cy - 1), (cx - 1, cy - 4), 1.3, WHITE)
def bag(c, cols=LEATH, tie=GOLD, cx=16, cy=19, r=9.5):
    c.circ(cx, cy, r, cols[1]); c.ell(cx - r + 1, cy - r + 1, cx + 1, cy + 2, cols[2]); c.circ(cx + 1, cy + 1, r - 2, cols[1]); c.poly([(cx - 5, cy - r + 1), (cx + 5, cy - r + 1), (cx + 7, cy - r - 6), (cx + 2, cy - r - 4), (cx - 2, cy - r - 7), (cx - 7, cy - r - 5)], cols[2]); c.rect(cx - 5, cy - r - 1, cx + 5, cy - r + 1, tie[1])
def potion_ball(c, cols, cx=16, cy=15, r=10):
    c.poly([(8, 29), (11, 24), (21, 24), (24, 29)], GOLD[0]); c.rect(10, 23, 22, 25, GOLD[1]); c.circ(cx, cy, r, cols[0]); c.circ(cx - .6, cy - .6, r - 1.4, cols[1]); c.circ(cx - 2.5, cy - 2.5, r - 5, cols[2]); c.circ(cx - 4, cy - 4.5, 1.6, WHITE)

# ===================== ENEMIES =====================
OGRE = [rgb(x) for x in ('7a5a3a', 'b08a58', 'd6b47e', 'f0d8a8')]
ORC = [rgb(x) for x in ('2a4a2a', '47703a', '6c9a52', 'a0c880')]
HOB = [rgb(x) for x in ('8a3a1e', 'c46030', 'e88c50', 'ffc090')]
TROLL = [rgb(x) for x in ('2c5a66', '4a8894', '78b4b8', 'b0e0dc')]
WOLF = [rgb(x) for x in ('3a3a4a', '626478', '9092a6', 'c8cad8')]
DARK = [rgb(x) for x in ('1a1622', '2e2a3a', '4a4658', '6e6a80')]
@icon('enemy_grunt')
def _(c): face(c, GREEN); c.poly([(9, 10), (12, 5), (15, 9)], LEATH[1]) if False else None
@icon('enemy_runner')
def _(c):
    c.poly([(7, 13), (6, 2), (13, 8)], WOLF[1]); c.poly([(25, 13), (26, 2), (19, 8)], WOLF[0]); c.poly([(8, 11), (7.5, 5), (11.5, 9)], RED[3])
    c.poly([(6, 12), (11, 7), (21, 7), (26, 12), (25, 19), (20, 23), (19, 29), (13, 29), (12, 23), (7, 19)], WOLF[1]); c.poly([(6, 12), (11, 7), (16, 7), (14, 23), (12, 23), (7, 19)], WOLF[2]); c.poly([(13, 20), (19, 20), (19, 29), (13, 29)], WOLF[3])
    c.rect(14, 26.6, 18, 28.2, K); c.poly([(13.5, 23), (14.5, 26.5), (15.3, 23)], WHITE); c.poly([(17, 23), (17.8, 26.5), (18.8, 23)], WHITE)
    for sx in (-1, 1): c.poly([(16 + sx * 2.5, 16), (16 + sx * 7, 13), (16 + sx * 6, 17)], GOLD[2]); c.rect(16 + sx * 4.6 - .5, 14.4, 16 + sx * 4.6 + .5, 16.2, K)
    c.rect(14.5, 19.5, 17.5, 21.5, K)
@icon('enemy_spitter')
def _(c):
    hood(c, PURP, 15); c.ell(10, 9, 22, 23, GREEN[1]); c.ell(10, 9, 17, 17, GREEN[2])
    for sx in (-1, 1): c.circ(16 + sx * 3, 15, 1.5, PURP[3]); c.px(16 + sx * 3, 15, WHITE)
    c.rect(13.5, 19.5, 18.5, 20.5, K); c.circ(25, 25, 4.5, PURP[1]); c.circ(24.5, 24.5, 3, PURP[2]); c.circ(23.6, 23.5, 1, WHITE)
@icon('enemy_sapper')
def _(c): bomb(c, 14, 19, 9.5); c.poly([(9, 17), (13, 19), (9, 20)], RED[2]); c.poly([(19, 17), (15, 19), (19, 20)], RED[2]); c.rect(11, 23, 17, 24, RED[2])
@icon('enemy_brute')
def _(c): face(c, HOB, 17, 10, 9, tusks=True)
@icon('enemy_orc')
def _(c): face(c, ORC, 17, 10, 9, tusks=True, eyes=RED[3])
@icon('enemy_orc_brute')
def _(c):
    axe(c, (27, 30), (24, 6), STEEL, 2.4, -1, 7); face(c, ORC, 18, 9, 8.5, tusks=True, eyes=RED[3]); c.tl((8, 12), (13, 22), 1.6, RED[2]); c.tl((24, 12), (19, 22), 1.6, RED[2])
@icon('enemy_knight')
def _(c): face(c, GREEN, 18, 9, 8); helmet(c, STEEL, 18, 9)
@icon('enemy_champion')
def _(c):
    face(c, GREEN, 18, 9, 8); helmet(c, STEEL, 18, 9)
    for sx in (-1, 1): c.poly([(16 + sx * 8, 12), (16 + sx * 14, 3), (16 + sx * 10.5, 13.5)], BONE[2]); c.poly([(16 + sx * 8, 12), (16 + sx * 14, 3), (16 + sx * 9.5, 11)], BONE[3])
@icon('enemy_boss')
def _(c): face(c, GREEN, 19, 9, 8); crown(c, 8, 8.5)
@icon('enemy_ogre')
def _(c):
    face(c, OGRE, 17, 11.5, 10, ears=False, tusks=True, eyes=WHITE); c.circ(4.5, 16, 2.6, OGRE[1]); c.circ(27.5, 16, 2.6, OGRE[0]); c.poly([(13, 8), (16, 1), (19, 8)], BONE[2]); c.poly([(13, 8), (16, 1), (16, 8)], BONE[3])
@icon('enemy_necro')
def _(c):
    hood(c, DARK, 15); skull(c, 16, 15, .62, BONE, K)
    for sx in (-1, 1): c.circ(16 + sx * 2.4, 14, 1.1, GREEN[3])
    c.tl((27, 30), (27, 8), 1.6, WOOD[0]); c.circ(27, 6.5, 2.6, GREEN[2]); c.circ(26.4, 6, 1, WHITE)
@icon('enemy_warlord')
def _(c): face(c, GREEN, 19, 9, 8); helmet(c, GOLD, 19, 9, RED)
@icon('enemy_troll')
def _(c):
    face(c, TROLL, 16, 10.5, 10, tusks=True, eyes=GOLD[3]); c.ell(13, 15, 19, 21, TROLL[0]); c.ell(13, 15, 17.5, 19, TROLL[2])
    for x in (9, 13, 18, 22): c.poly([(x, 7), (x + 1.5, 2), (x + 3, 7)], GREEN[0])
@icon('enemy_besieger')
def _(c):
    c.tl((4, 27), (22, 27), 3, WOOD[0]); c.circ(7, 27, 3, WOOD[1]); c.circ(7, 27, 1, STEEL[2]); c.circ(20, 27, 3, WOOD[1]); c.circ(20, 27, 1, STEEL[2])
    c.poly([(9, 25), (13, 14), (16, 14), (17, 25)], WOOD[1]); c.tl((14.5, 15), (27, 5), 2.4, WOOD[2]); c.tl((14.5, 15), (6, 21), 2.4, WOOD[2]); c.circ(27.5, 5, 3.4, STONE[1]); c.circ(26.8, 4.3, 1.4, STONE[3]); c.rect(3, 20, 8, 23, STONE[0])
@icon('enemy_orc_shaman')
def _(c):
    face(c, ORC, 18, 9, 8.5, tusks=True, eyes=PURP[3]); c.poly([(9, 12), (16, 9), (23, 12), (22, 15), (16, 13), (10, 15)], BONE[2])
    for x, col in ((9, RED), (14.5, BLUE), (20, GOLD)): c.poly([(x, 11), (x + 1.5, 1), (x + 3.4, 11)], col[1]); c.tl((x + 1.6, 10), (x + 1.6, 3), .8, col[3])
@icon('enemy_firebug')
def _(c):
    face(c, GREEN, 19, 8, 7.5); c.tl((27, 30), (26, 15), 2.2, WOOD[1]); flame(c, 26, 16, 13, 9); c.poly([(9, 13), (16, 10), (23, 13), (23, 15), (9, 15)], RED[1])
@icon('enemy_forgemaster')
def _(c):
    face(c, HOB, 18, 9.5, 8.5, tusks=True, teeth=False); c.poly([(6.5, 13), (16, 10), (25.5, 13), (25, 19), (16, 17), (7, 19)], STEEL[1]); c.rect(9, 14.4, 14, 16, FIRE[2]); c.rect(18, 14.4, 23, 16, FIRE[2]); c.poly([(6.5, 13), (16, 10), (25.5, 13), (16, 12)], STEEL[3])
    hammer(c, (28, 30), (26, 7), STEEL, 3.6)
@icon('enemy_overlord')
def _(c):
    for sx in (-1, 1): c.poly([(16 + sx * 7, 13), (16 + sx * 15, 2), (16 + sx * 11, 15)], DARK[1]); c.poly([(16 + sx * 7, 13), (16 + sx * 15, 2), (16 + sx * 9, 10)], DARK[3])
    c.poly([(6, 14), (9, 7), (16, 4), (23, 7), (26, 14), (25, 24), (20, 30), (12, 30), (7, 24)], DARK[1]); c.poly([(6, 14), (9, 7), (16, 4), (16, 30), (12, 30), (7, 24)], DARK[2])
    c.poly([(9, 15), (15, 17), (14, 20), (10, 19)], RED[2]); c.poly([(23, 15), (17, 17), (18, 20), (22, 19)], RED[2]); c.px(12, 17, FIRE[3]); c.px(20, 17, FIRE[3])
    for x in (12.4, 14.8, 17.2, 19.6): c.rect(x, 23, x + .9, 29, K)
    crown(c, 3.5, 6, GOLD, PURP)

# ===================== CITADEL =====================
@icon('branch_heroes')
def _(c): xswords(c)
@icon('branch_castle')
def _(c):
    tower(c, 4, 11, 13, 29); tower(c, 20, 27, 13, 29); c.rect(9, 16, 22, 29, STONE[1]); c.rect(9, 16, 22, 17.4, STONE[2]); c.poly([(12.5, 29), (12.5, 23), (16, 20), (19.5, 23), (19.5, 29)], WOOD[0]); c.poly([(13.5, 29), (13.5, 23.5), (16, 21.4), (18.5, 23.5), (18.5, 29)], WOOD[1])
    c.rect(15.4, 5, 16.4, 16, WOOD[1]); c.poly([(16.6, 5), (24, 7.5), (16.6, 10)], RED[2])
@icon('branch_magic')
def _(c): star(c, 13, 17, 12, 3.6, 4, PURP[2]); star(c, 13, 17, 7, 2.2, 4, PURP[3]); c.circ(13, 17, 1.6, WHITE); star(c, 25, 7, 6, 1.8, 4, GOLD[2]); star(c, 25, 26, 4.4, 1.4, 4, BLUE[2])
@icon('branch_economy')
def _(c): bag(c, LEATH, GOLD, 15, 19, 10); coin(c, 15, 20, 4.6); coin(c, 26, 26, 3.6, GOLD, False)
@icon('node_rogalik')
def _(c):
    pts = []
    for i in range(0, 13): a = math.radians(200 + i * 11.7); pts.append((16 + math.cos(a) * 13, 21 + math.sin(a) * 13))
    for i in range(12, -1, -1): a = math.radians(200 + i * 11.7); rr = 13 - 8.5 * math.sin(math.pi * i / 12); pts.append((16 + math.cos(a) * rr, 21 + math.sin(a) * rr))
    c.poly(pts, GOLD[1])
    for i in (2, 4, 6, 8, 10): a = math.radians(200 + i * 11.7); rr = 13 - 8.5 * math.sin(math.pi * i / 12); c.tl((16 + math.cos(a) * 13, 21 + math.sin(a) * 13), (16 + math.cos(a + .25) * rr, 21 + math.sin(a + .25) * rr), 1.2, GOLD[0])
    for i in (3, 5, 7, 9): a = math.radians(200 + i * 11.7); c.circ(16 + math.cos(a) * 11.4, 21 + math.sin(a) * 11.4, .9, GOLD[3])
@icon('node_slot2')
def _(c): heater(c, 3, 6, 19, 26, RED[1], STEEL[2], RED[0]); heater(c, 13, 8, 29, 28, BLUE[1], STEEL[2], BLUE[0]); c.rect(20.4, 12, 21.6, 21, GOLD[2]); c.rect(17.5, 15, 24.5, 16.2, GOLD[2])
@icon('node_slot3')
def _(c): heater(c, 2, 5, 15, 21, RED[1], STEEL[2], RED[0]); heater(c, 17, 5, 30, 21, GREEN[1], STEEL[2], GREEN[0]); heater(c, 8, 10, 24, 30, BLUE[1], STEEL[2], BLUE[0]); c.rect(15.4, 14, 16.6, 24, GOLD[2]); c.rect(12.5, 17, 19.5, 18.2, GOLD[2])
@icon('node_pick_start')
def _(c):
    for i, (x, y, col) in enumerate(((3, 9, STONE), (20, 9, STONE))): c.rect(x, y, x + 9, y + 15, BONE[1]); c.rect(x + 1.5, y + 1.5, x + 7.5, y + 13.5, col[2])
    c.rect(9.5, 4, 22.5, 25, GOLD[2]); c.rect(11, 5.5, 21, 23.5, BONE[3]); star(c, 16, 14.5, 5, 2.1, 5, GOLD[1])
    c.poly([(16, 31), (11.5, 26.5), (20.5, 26.5)], GREEN[2])
@icon('node_unlock_summoner')
def _(c):
    hood(c, PURP, 15); skull(c, 16, 15, .62, BONE, K)
    for sx in (-1, 1): c.circ(16 + sx * 2.4, 14, 1.1, PURP[3])
@icon('node_drill')
def _(c): scroll(c); xswords(c, 16, 16, 7.5, 2)
@icon('node_hardy')
def _(c):
    c.poly([(5, 20), (5, 12), (10, 8), (18, 9), (24, 6), (28, 10), (27, 18), (22, 24), (16, 28), (9, 27)], SKIN[1]); c.poly([(5, 20), (5, 12), (10, 8), (18, 9), (12, 14), (9, 22)], SKIN[2]); c.poly([(22, 24), (16, 28), (9, 27), (14, 22)], SKIN[0])
    c.ell(14, 4, 26, 13, SKIN[1]); c.ell(14, 4, 21, 9, SKIN[2]); c.rect(4, 20, 8.6, 27, STEEL[1]); c.rect(4, 20, 8.6, 21.3, STEEL[3]); heart(c, 24.5, 24.5, 4, RED)
@icon('node_rally')
def _(c): flag(c, RED, 7, lambda c: star(c, 17.5, 12.5, 4.2, 1.8, 5, GOLD[2]))
@icon('node_mentor')
def _(c):
    c.poly([(16, 6), (30, 12), (16, 18), (2, 12)], DARK[1]); c.poly([(16, 6), (30, 12), (16, 9.5), (2, 12)], DARK[3]); c.poly([(8, 15.5), (16, 19), (24, 15.5), (24, 22), (16, 25.5), (8, 22)], DARK[2])
    c.tl((16, 12), (26, 14), 1, GOLD[2]); c.tl((26, 14), (26, 23), 1.2, GOLD[2]); c.poly([(24.4, 22), (27.6, 22), (28, 27), (24, 27)], GOLD[1])
@icon('node_walls')
def _(c): wall(c, 6, [rgb(x) for x in ('7a3626', 'b0553a', 'd67c58', 'f0a888')], 4)
@icon('node_towers')
def _(c): tower(c, 8, 21, 12, 29); c.rect(14.5, 2, 15.5, 6, WOOD[1]); c.poly([(15.8, 2), (22, 3.6), (15.8, 5.4)], BLUE[1]); arrow(c, (21, 14), (30, 5), STEEL[3], WOOD[2], RED[2])
@icon('node_mason')
def _(c):
    wall(c, 20, STONE, 2); hammer(c, (6, 20), (19, 7), STEEL, 4)
@icon('node_spikes')
def _(c):
    for i, x in enumerate((3, 9.5, 16, 22.5)):
        h = (6, 3, 5, 4)[i]; c.poly([(x, 29), (x, h + 6), (x + 3, h), (x + 6, h + 6), (x + 6, 29)], WOOD[1]); c.poly([(x, 29), (x, h + 6), (x + 3, h), (x + 2, 29)], WOOD[2]); c.poly([(x + 4.6, 29), (x + 4.6, h + 4), (x + 6, h + 6), (x + 6, 29)], WOOD[0])
    c.rect(2, 17, 30, 19.4, LEATH[0]); c.rect(2, 17, 30, 17.8, LEATH[2])
@icon('node_arcane')
def _(c):
    c.poly([(3, 12), (16, 15), (16, 28), (3, 25)], BONE[2]); c.poly([(29, 12), (16, 15), (16, 28), (29, 25)], BONE[1]); c.poly([(3, 25), (16, 28), (29, 25), (29, 27), (16, 30), (3, 27)], BLUE[0])
    for y in (17, 20, 23): c.tl((5.5, y - 1.6), (13.5, y), .8, STONE[1]); c.tl((18.5, y), (26.5, y - 1.6), .8, STONE[1])
    star(c, 16, 7, 6.5, 2, 4, BLUE[2]); star(c, 16, 7, 3.5, 1.2, 4, BLUE[3]); star(c, 6, 6, 2.6, .9, 4, GOLD[2]); star(c, 26, 5, 2.6, .9, 4, GOLD[2])
@icon('node_treasury')
def _(c): chest(c, opened=True); coin(c, 9, 7, 2.6, GOLD, False); coin(c, 22, 5, 2.6, GOLD, False)
@icon('node_taxes')
def _(c): scroll(c, 5, 3, 20, 24); c.rect(8, 9, 17, 10, STONE[1]); c.rect(8, 12.5, 17, 13.5, STONE[1]); c.rect(8, 16, 14, 17, STONE[1]); coin(c, 22, 22, 7.5)
@icon('node_forge')
def _(c): anvil(c, 15); hammer(c, (27, 12), (14, 5), STEEL, 3.4); star(c, 6, 11, 3, 1.1, 4, FIRE[2])
@icon('node_merchant')
def _(c):
    c.poly([(4, 11), (16, 4), (28, 11)], RED[1]); c.poly([(4, 11), (16, 4), (16, 11)], RED[2])
    for i in range(4): c.poly([(4 + i * 6, 11), (10 + i * 6, 11), (10 + i * 6, 14), (7 + i * 6, 16), (4 + i * 6, 14)], (BONE[3], RED[2])[i % 2])
    c.rect(5.4, 14, 7, 28, WOOD[0]); c.rect(25, 14, 26.6, 28, WOOD[0]); c.rect(4, 21, 28, 28, WOOD[1]); c.rect(4, 21, 28, 22.4, WOOD[2]); coin(c, 11, 18.4, 2.4, GOLD, False); gem(c, 20, 18, .3, BLUE)
@icon('node_interest')
def _(c):
    c.poly([(3, 12), (16, 3), (29, 12)], STONE[2]); c.poly([(3, 12), (16, 3), (16, 12)], STONE[3]); c.rect(3, 12, 29, 14, STONE[1]); c.rect(3, 26, 29, 29, STONE[1]); c.rect(3, 26, 29, 27, STONE[3])
    for x in (5.5, 12, 18.5, 25): c.rect(x - 1.5, 14, x + 1.5, 26, STONE[2]); c.rect(x + .5, 14, x + 1.5, 26, STONE[0])
    coin(c, 16, 8.4, 2.4, GOLD, False)
@icon('node_bargain')
def _(c):
    c.poly([(4, 13), (13, 4), (27, 6), (28, 19), (18, 29)], GOLD[1]); c.poly([(4, 13), (13, 4), (27, 6), (25, 8), (14, 7), (7, 14)], GOLD[3]); c.circ(23, 10, 2, K)
    c.tl((11, 21), (19, 12), 1.5, RED[1]); c.circ(11, 14, 1.8, RED[1]); c.circ(19.5, 20, 1.8, RED[1])
@icon('node_relic_hunter')
def _(c):
    c.poly([(12, 4), (20, 4), (19, 9), (24, 15), (23, 23), (19, 28), (13, 28), (9, 23), (8, 15), (13, 9)], HOB[1]); c.poly([(12, 4), (16, 4), (15, 9), (11, 15), (12, 23), (14, 28), (13, 28), (9, 23), (8, 15), (13, 9)], HOB[2])
    c.rect(11, 3, 21, 5, HOB[0]); c.rect(8.4, 15.4, 23.6, 17, DARK[1]); c.rect(9, 20.4, 23, 21.4, DARK[1]); c.line([(9, 13), (5, 9), (11, 7)], HOB[0], 1.6); c.line([(23, 13), (27, 9), (21, 7)], HOB[0], 1.6)
@icon('node_warcry')
def _(c):
    c.poly([(4, 13), (11, 13), (24, 5), (24, 27), (11, 19), (4, 19)], RED[1]); c.poly([(4, 13), (11, 13), (24, 5), (24, 9), (11, 15.5), (4, 15.5)], RED[2]); c.rect(23, 4, 26, 28, BONE[2]); c.rect(7, 19, 10.4, 26, WOOD[1])
    for a in (-35, 0, 35): c.tl((27.5 + abs(a) * -.02, 16 + a * .16), (31, 16 + a * .26), 1.3, GOLD[2])
@icon('node_medic')
def _(c): heater(c, 5, 3, 27, 29, BONE[3], STEEL[2], BONE[1]); c.rect(13.6, 8, 18.4, 21, RED[2]); c.rect(9.6, 12, 22.4, 16.8, RED[2])
@icon('node_veteran')
def _(c):
    c.poly([(8, 2), (14, 2), (18, 14), (13, 16)], BLUE[1]); c.poly([(24, 2), (18, 2), (14, 14), (19, 16)], RED[1]); c.circ(16, 21, 8.5, GOLD[1]); c.circ(15.6, 20.6, 6.6, GOLD[2]); star(c, 16, 21, 5, 2.1, 5, GOLD[0])
@icon('node_iron_gate')
def _(c):
    c.poly([(4, 29), (4, 13), (9, 6), (16, 3), (23, 6), (28, 13), (28, 29)], STONE[1]); c.poly([(4, 29), (4, 13), (9, 6), (16, 3), (16, 6), (10, 9), (7, 14), (7, 29)], STONE[2]); c.poly([(7.4, 29), (7.4, 14), (11, 9), (16, 7), (21, 9), (24.6, 14), (24.6, 29)], K)
    for x in (9.6, 13.2, 16.8, 20.4): c.rect(x, 9.5 if 12 < x < 20 else 12, x + 1.6, 29, STEEL[1]); c.rect(x, 12, x + .6, 29, STEEL[3])
    for y in (15, 20, 25): c.rect(7.4, y, 24.6, y + 1.5, STEEL[0])
@icon('node_archers')
def _(c):
    c.circ(15, 17, 12, BONE[3]); c.circ(15, 17, 9.6, RED[1]); c.circ(15, 17, 7, BONE[3]); c.circ(15, 17, 4.4, RED[1]); c.circ(15, 17, 1.8, GOLD[2]); arrow(c, (30, 2), (16, 16), STEEL[2], WOOD[2], BLUE[2])
@icon('node_sp_power')
def _(c): potion_ball(c, PURP); star(c, 20, 18, 3.4, 1.2, 4, PURP[3])
@icon('node_echo')
def _(c):
    prev = None
    for i in range(0, 60):
        a = i * .26; r = 1.2 + i * .2; p = (16 + math.cos(a) * r, 16 + math.sin(a) * r)
        if prev: c.line([prev, p], PURP[2] if i % 20 < 10 else BLUE[2], 2.3)
        prev = p
    c.circ(16, 16, 1.8, WHITE)
@icon('node_gemcutter')
def _(c): gem(c, 14, 15, 1.0, BLUE); hammer(c, (30, 30), (25, 22), STEEL, 2.4); star(c, 26, 6, 3.6, 1.2, 4, WHITE)

# ===================== RELICS =====================
@icon('relic_powder')
def _(c):
    c.poly([(8, 9), (24, 9), (26, 14), (26, 23), (24, 28), (8, 28), (6, 23), (6, 14)], WOOD[1]); c.poly([(8, 9), (13, 9), (11, 14), (11, 23), (13, 28), (8, 28), (6, 23), (6, 14)], WOOD[2])
    for x in (14, 18, 22): c.rect(x, 9, x + .6, 28, WOOD[0])
    c.rect(6.4, 12.4, 25.6, 14.4, STEEL[1]); c.rect(6.4, 22.6, 25.6, 24.6, STEEL[1]); c.ell(8, 7, 24, 11, WOOD[0]); c.line([(16, 9), (18, 5), (23, 4)], BONE[1], 1.3); star(c, 24.5, 3.6, 3.6, 1.4, 6, FIRE[2])
    c.poly([(13.5, 16.4), (18.5, 16.4), (16, 21)], RED[2])
@icon('relic_fire_towers')
def _(c): arrow(c, (4, 28), (22, 10), STEEL[3], WOOD[2], RED[2]); c.tl((6, 26), (20, 12), 2, WOOD[2]); flame(c, 22, 13, 13, 10)
@icon('relic_war_drum')
def _(c):
    c.ell(5, 20, 27, 29, WOOD[0]); c.rect(5, 12, 27, 24.5, RED[1]); c.rect(5, 12, 9, 24.5, RED[2]); c.ell(5, 7, 27, 16, BONE[1]); c.ell(6.5, 8, 25.5, 14.6, BONE[3])
    for x in (7, 12, 17, 22): c.tl((x, 15.6), (x + 2.6, 25), 1, GOLD[2]); c.tl((x + 5, 15.6), (x + 2.6, 25), 1, GOLD[2])
    c.tl((10, 10), (2, 2), 1.8, WOOD[2]); c.circ(10.5, 10.5, 1.8, BONE[2]); c.tl((21, 10), (29, 2), 1.8, WOOD[2]); c.circ(20.5, 10.5, 1.8, BONE[2])
@icon('relic_golden_tooth')
def _(c):
    c.poly([(7, 8), (11, 5), (16, 8), (21, 5), (25, 8), (25, 16), (22, 28), (19, 28), (17.4, 19), (14.6, 19), (13, 28), (10, 28), (7, 16)], GOLD[1]); c.poly([(7, 8), (11, 5), (16, 8), (12, 12), (11, 20), (11, 28), (10, 28), (7, 16)], GOLD[3]); c.poly([(25, 8), (25, 16), (22, 28), (21, 28), (22, 14)], GOLD[0])
    star(c, 26, 5, 3.6, 1.2, 4, WHITE)
@icon('relic_gem_lens')
def _(c): gem(c, 22, 22, .62, BLUE); magnifier(c, 12, 12, 8.5)
@icon('relic_iron_hinges')
def _(c):
    for i, (x, y) in enumerate(((4, 4), (11, 11), (18, 18))):
        c.d.rounded_rectangle([x * S, y * S, (x + 11) * S, (y + 11) * S], radius=4 * S, fill=STEEL[1] if i % 2 == 0 else STEEL[0]); c.d.rounded_rectangle([(x + 3) * S, (y + 3) * S, (x + 8) * S, (y + 8) * S], radius=2 * S, fill=(0, 0, 0, 0))
        c.tl((x + 2, y + 5), (x + 5, y + 2), 1, STEEL[3])
@icon('relic_vamp_banner')
def _(c):
    def bat(c):
        c.poly([(17.5, 10), (12, 8), (9.5, 12), (12.5, 12), (13.5, 14.4), (15.6, 13), (17.5, 15.6), (19.4, 13), (21.5, 14.4), (22.5, 12), (25.5, 12), (23, 8)], K); c.px(17, 10, RED[3]); c.px(18, 10, RED[3])
    flag(c, RED, 7, bat, True)
@icon('relic_sharp_bolts')
def _(c):
    for x0, y0 in ((4, 20), (9, 25), (2, 12)):
        c.tl((x0, y0 + 3), (x0 + 15, y0 - 12), 1.8, WOOD[2]); c.poly([(x0 + 13, y0 - 13.5), (x0 + 21, y0 - 18), (x0 + 16.5, y0 - 10)], STEEL[2]); c.poly([(x0 + 13, y0 - 13.5), (x0 + 21, y0 - 18), (x0 + 15, y0 - 12.4)], STEEL[3])
        c.poly([(x0 - 1, y0 + 1), (x0 + 3, y0 + 1), (x0, y0 + 5)], BLUE[1])
@icon('relic_blood_rite')
def _(c):
    c.poly([(6, 6), (26, 6), (24, 15), (18.5, 19), (18.5, 24), (23, 27), (23, 29), (9, 29), (9, 27), (13.5, 24), (13.5, 19), (8, 15)], GOLD[1]); c.poly([(6, 6), (11, 6), (12, 15), (14.6, 19), (14.6, 24), (11, 27), (9, 27), (13.5, 24), (13.5, 19), (8, 15)], GOLD[3])
    c.ell(7, 4, 25, 9, RED[1]); c.ell(9, 5, 20, 8, RED[2]); drop(c, 16, 1.6, 1.5, RED); c.circ(16, 13, 1.7, RED[2])
@icon('relic_old_tome')
def _(c): book(c, RED, mark=lambda c: (star(c, 15.5, 14, 5.4, 2.2, 5, GOLD[2]), c.rect(22.4, 11, 26.4, 16, GOLD[1])))
@icon('relic_lucky_coin')
def _(c):
    coin(c, 16, 16, 12.5, GOLD, False)
    for a in (45, 135, 225, 315): c.circ(16 + math.cos(math.radians(a)) * 3.5, 15.5 + math.sin(math.radians(a)) * 3.5, 3, GREEN[1]); c.circ(16 + math.cos(math.radians(a)) * 3.8 - .4, 15.2 + math.sin(math.radians(a)) * 3.8 - .4, 1.3, GREEN[2])
    c.tl((16.5, 17), (19.5, 23.5), 1.3, GREEN[0])
@icon('relic_spiked_wall')
def _(c):
    wall(c, 14, STONE, 3)
    for x in (4, 10, 16, 22): c.poly([(x, 14), (x + 3, 3), (x + 6, 14)], STEEL[1]); c.poly([(x, 14), (x + 3, 3), (x + 3, 14)], STEEL[3])

# ===================== EVENTS =====================
@icon('event_relic_chest')
def _(c): chest(c); star(c, 26, 5, 4, 1.4, 4, GOLD[3]); star(c, 6, 4, 2.8, 1, 4, GOLD[3])
@icon('event_blood_altar')
def _(c):
    c.rect(3, 25, 29, 29, STONE[0]); c.rect(7, 16, 25, 25, STONE[1]); c.rect(7, 16, 10, 25, STONE[2]); c.rect(4, 12, 28, 16.4, STONE[2]); c.rect(4, 12, 28, 13, STONE[3]); c.rect(4, 15.4, 28, 16.4, STONE[0])
    c.rect(9, 12, 23, 13.4, RED[1]); c.rect(11, 13.4, 12.6, 19, RED[1]); c.rect(19, 13.4, 20.6, 22, RED[1]); c.circ(20, 22.4, 1.2, RED[2]); drop(c, 16, 6.5, 3.2, RED)
    c.tl((13, 20), (19, 20), .9, STONE[0])
@icon('event_merchant')
def _(c):
    c.poly([(3, 20), (5, 9), (12, 5), (22, 5), (27, 9), (27, 20)], BONE[2]); c.poly([(3, 20), (5, 9), (12, 5), (14, 5), (9, 10), (8, 20)], BONE[3]); c.tl((14, 5.4), (13, 20), .9, BONE[1]); c.tl((21, 5.4), (21, 20), .9, BONE[1])
    c.rect(2, 19.6, 29, 24, WOOD[1]); c.rect(2, 19.6, 29, 20.8, WOOD[2])
    for x in (9, 23): c.circ(x, 26, 4.6, WOOD[0]); c.circ(x, 26, 3, WOOD[2]); c.circ(x, 26, 1.1, STEEL[2])
@icon('event_mercenary')
def _(c):
    face(c, SKIN, 18, 9, 8.5, ears=False, eyes=WHITE, teeth=False); helmet(c, STEEL, 18, 9); c.tl((6, 13), (26, 21), 3.4, BONE[3]); c.tl((6, 14.4), (26, 22.4), .9, BONE[1]); c.rect(18.6, 15.6, 21.4, 17, RED[2])
@icon('event_cursed')
def _(c): flag(c, DARK, 7, lambda c: skull(c, 17, 11.5, .45, BONE, K), True)
@icon('event_gem_vein')
def _(c):
    c.poly([(2, 29), (5, 17), (12, 11), (21, 12), (28, 19), (30, 29)], STONE[1]); c.poly([(2, 29), (5, 17), (12, 11), (15, 13), (9, 20), (8, 29)], STONE[2]); c.poly([(21, 12), (28, 19), (30, 29), (24, 29), (24, 20)], STONE[0])
    gem(c, 12, 22, .38, BLUE); gem(c, 20, 19, .32, PURP); gem(c, 21, 26, .26, TEAL)
    c.tl((16, 12), (27, 2), 1.8, WOOD[1]); c.poly([(20, 1), (27, 1.6), (30, 9), (26.6, 5), (23, 3.4)], STEEL[2])
@icon('event_smith')
def _(c): anvil(c, 15); hammer(c, (5, 12), (18, 5), STEEL, 3.4); star(c, 26, 10, 3.4, 1.2, 4, FIRE[2]); star(c, 22, 5, 2.2, .8, 4, FIRE[3])

# ===================== BIOMES =====================
@icon('biome_forest')
def _(c): pine(c, 9, 29, 18); pine(c, 23, 29, 18); pine(c, 16, 30, 24)
@icon('biome_snow')
def _(c):
    c.poly([(1, 29), (12, 6), (17, 15), (21, 10), (31, 29)], BLUE[1]); c.poly([(1, 29), (12, 6), (14, 16), (9, 29)], BLUE[2]); c.poly([(8, 14), (12, 6), (15.6, 12.4), (13, 12), (11.6, 15), (10, 12.6)], WHITE); c.poly([(18.6, 13.4), (21, 10), (24, 15.6), (21.6, 14.4), (20, 16)], WHITE)
    for x, y in ((4, 5), (25, 4), (28, 11)): star(c, x, y, 2.2, .8, 4, WHITE)
@icon('biome_swamp')
def _(c):
    c.ell(2, 21, 30, 30, TEAL[0]); c.ell(5, 22, 24, 27, rgb('3f7a5c')); c.tl((20, 26), (20, 8), 2.4, LEATH[0]); c.tl((20, 14), (26, 8), 1.6, LEATH[0]); c.tl((20, 17), (14, 11), 1.6, LEATH[0]); c.tl((14, 11), (13, 6), 1.2, LEATH[0])
    for x, h in ((6, 9), (9, 12)): c.tl((x, 25), (x, 25 - h), 1, GREEN[0]); c.rect(x - 1, 25 - h - 4, x + 1, 25 - h, WOOD[0])
    for y, x0, x1 in ((6, 2, 14), (11, 20, 30), (17, 1, 12)): c.d.rounded_rectangle([x0 * S, y * S, x1 * S, (y + 2.4) * S], radius=1.2 * S, fill=rgb('c8dcc8'))
@icon('biome_desert')
def _(c):
    c.circ(23, 9, 6, GOLD[2]); c.circ(23, 9, 4, GOLD[3]); c.poly([(1, 29), (8, 20), (16, 17), (22, 21), (31, 18), (31, 29)], rgb('d6a85a')); c.poly([(1, 29), (8, 20), (16, 17), (12, 23), (10, 29)], rgb('f0cc84')); c.poly([(22, 21), (31, 18), (31, 29), (20, 29)], rgb('b88840'))
    c.rect(9, 9, 12, 22, GREEN[1]); c.rect(9, 9, 10, 22, GREEN[2]); c.circ(10.5, 9, 1.5, GREEN[1]); c.rect(5, 13, 9, 15, GREEN[1]); c.rect(5, 10.5, 6.6, 15, GREEN[1]); c.rect(12, 15, 15.6, 17, GREEN[1]); c.rect(14, 12.4, 15.6, 17, GREEN[1])
@icon('biome_ash')
def _(c):
    c.poly([(1, 29), (11, 11), (21, 11), (31, 29)], DARK[2]); c.poly([(1, 29), (11, 11), (14, 11), (8, 29)], DARK[3]); c.poly([(11, 11), (13.6, 8), (18.4, 8), (21, 11)], FIRE[0]); flame(c, 16, 12, 10, 8)
    c.tl((13, 13), (11, 22), 1.4, FIRE[1]); c.tl((18.6, 13), (22, 25), 1.4, FIRE[1]); c.tl((16, 13), (16.6, 18), 1.2, FIRE[2])
    for x, y, r in ((7, 6, 2.4), (25, 4, 3), (27.6, 9, 1.8)): c.circ(x, y, r, STONE[1])

# ===================== UI GLYPHS =====================
@icon('ui_gem')
def _(c): gem(c, 16, 14, 1.15, BLUE)
@icon('ui_coin')
def _(c): coin(c, 16, 16, 12.5)
@icon('ui_lock')
def _(c):
    c.d.arc([9 * S, 3 * S, 23 * S, 21 * S], 180, 360, fill=STEEL[1], width=round(3.4 * S)); c.rect(9, 11, 12.3, 16, STEEL[1]); c.rect(19.7, 11, 23, 16, STEEL[1])
    c.rect(5, 14, 27, 29, GOLD[1]); c.rect(5, 14, 27, 15.6, GOLD[3]); c.rect(5, 27, 27, 29, GOLD[0]); c.circ(16, 20, 2.4, K); c.rect(15, 20, 17, 25, K)
@icon('ui_swords')
def _(c): xswords(c)
LSTONE = [rgb(x) for x in ('6e6a86', 'a8a4bc', 'd0ccdc', 'f0eef8')]
@icon('ui_castle')
def _(c):
    tower(c, 3, 11, 12, 29, LSTONE); tower(c, 20, 29, 12, 29, LSTONE); c.rect(9, 16, 23, 29, LSTONE[1]); c.rect(9, 16, 23, 17.6, LSTONE[2]); c.rect(9, 27.6, 23, 29, LSTONE[0])
    c.poly([(12.5, 29), (12.5, 23), (16, 19.6), (19.5, 23), (19.5, 29)], K); c.poly([(13.4, 29), (13.4, 23.4), (16, 21), (18.6, 23.4), (18.6, 29)], WOOD[1]); c.tl((16, 21.6), (16, 29), .9, WOOD[0])
    c.rect(15.4, 4, 16.4, 16, WOOD[1]); c.poly([(16.6, 4), (25, 6.6), (16.6, 9.4)], BLUE[2])
@icon('ui_trophy')
def _(c):
    for sx in (-1, 1): c.d.arc([(16 + sx * 8 - 5) * S, 6 * S, (16 + sx * 8 + 5) * S, 16 * S], 0, 360, fill=GOLD[0], width=round(1.8 * S))
    c.poly([(8, 4), (24, 4), (23, 13), (19, 18), (13, 18), (9, 13)], GOLD[1]); c.poly([(8, 4), (13, 4), (13, 13), (15, 18), (13, 18), (9, 13)], GOLD[3]); c.rect(14.4, 18, 17.6, 23, GOLD[0]); c.rect(10, 23, 22, 25.4, GOLD[1]); c.rect(8, 25.4, 24, 29, WOOD[1]); c.rect(8, 25.4, 24, 26.4, WOOD[2]); star(c, 16.6, 10, 3.6, 1.5, 5, GOLD[3])
@icon('ui_sound_on')
def _(c):
    c.poly([(3, 12), (9, 12), (17, 5), (17, 27), (9, 20), (3, 20)], STEEL[2]); c.poly([(3, 12), (9, 12), (17, 5), (17, 9), (10, 14.6), (3, 14.6)], STEEL[3])
    for r in (5, 9.5): c.d.arc([(18 - r) * S, (16 - r) * S, (18 + r) * S, (16 + r) * S], -50, 50, fill=BLUE[2], width=round(2 * S))
@icon('ui_sound_off')
def _(c):
    c.poly([(3, 12), (9, 12), (17, 5), (17, 27), (9, 20), (3, 20)], STEEL[1]); c.poly([(3, 12), (9, 12), (17, 5), (17, 9), (10, 14.6), (3, 14.6)], STEEL[2]); c.tl((20.5, 11.5), (29, 20.5), 2.4, RED[2]); c.tl((29, 11.5), (20.5, 20.5), 2.4, RED[2])
@icon('ui_check')
def _(c): c.d.rounded_rectangle([3 * S, 3 * S, 29 * S, 29 * S], radius=5 * S, fill=GREEN[1]); c.d.rounded_rectangle([4.4 * S, 4.4 * S, 27.6 * S, 16 * S], radius=4 * S, fill=GREEN[2]); c.line([(9, 16.5), (14, 21.5), (23.5, 10.5)], WHITE, 3.4)
@icon('ui_book')
def _(c):
    c.poly([(2, 8), (16, 11), (16, 27), (2, 24)], BONE[3]); c.poly([(30, 8), (16, 11), (16, 27), (30, 24)], BONE[2]); c.poly([(2, 24), (16, 27), (30, 24), (30, 26.4), (16, 29.6), (2, 26.4)], WOOD[1]); c.rect(15.5, 11, 16.5, 27.4, BONE[0])
    for y in (14, 17.4, 20.8): c.tl((4.6, y - 1.6), (13.4, y + .2), .9, STONE[1]); c.tl((18.6, y + .2), (27.4, y - 1.6), .9, STONE[1])
    c.poly([(21, 9.6), (24.4, 8.8), (24.4, 17), (22.7, 15.4), (21, 17.6)], RED[2])
@icon('ui_pin')
def _(c):
    c.tl((5, 27), (14, 18), 1.6, STEEL[2]); c.poly([(9, 14), (18, 23), (21, 20), (19.6, 17), (25, 11.6), (28, 12), (20, 4), (20.4, 7), (15, 12.4), (12, 11)], RED[1]); c.poly([(20, 4), (20.4, 7), (15, 12.4), (12, 11), (9, 14), (11, 16), (13.6, 13.4), (16, 14), (22.4, 7.6)], RED[3])
@icon('ui_cart')
def _(c):
    c.line([(2, 6), (7, 6), (11, 21), (26, 21)], STEEL[1], 2); c.poly([(8, 9), (29, 9), (26, 18.4), (10.4, 18.4)], GOLD[1]); c.poly([(8, 9), (29, 9), (28.4, 11), (8.6, 11)], GOLD[3])
    for x in (13.6, 18.6, 23.6): c.tl((x, 11), (x, 18), .9, GOLD[0])
    for x in (13, 24): c.circ(x, 26, 2.6, STEEL[0]); c.circ(x, 26, 1, STEEL[3])
@icon('ui_blood')
def _(c): drop(c, 16, 19, 9.5, RED)
@icon('ui_cards')
def _(c):
    for (x, a, col) in ((9, -14, BLUE), (16, 0, RED), (23, 14, GREEN)):
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a)); R = lambda px, py: (x + px * ca - py * sa, 17 + px * sa + py * ca)
        c.poly([R(-6, -11), R(6, -11), R(6, 11), R(-6, 11)], BONE[3]); c.poly([R(-4.4, -9.4), R(4.4, -9.4), R(4.4, 9.4), R(-4.4, 9.4)], col[1]); c.poly([R(-4.4, -9.4), R(4.4, -9.4), R(4.4, -6.4), R(-4.4, -6.4)], col[2])
    star(c, 16, 17, 3.6, 1.5, 5, GOLD[2])
@icon('ui_sparkle')
def _(c): star(c, 13, 17, 12, 3.6, 4, GOLD[2]); star(c, 13, 17, 7, 2.2, 4, GOLD[3]); c.circ(13, 17, 1.6, WHITE); star(c, 25, 7, 6, 1.8, 4, GOLD[2]); star(c, 25, 26, 4.4, 1.4, 4, GOLD[3])
@icon('ui_music')
def _(c):
    c.rect(11, 6, 13, 24, BLUE[1]); c.rect(24, 3, 26, 21, BLUE[1]); c.poly([(11, 6), (26, 3), (26, 8), (11, 11)], BLUE[1]); c.poly([(11, 6), (26, 3), (26, 4.6), (11, 7.6)], BLUE[3]); c.ell(4, 20, 13, 28, BLUE[1]); c.ell(5, 21, 10, 25, BLUE[3]); c.ell(17, 17, 26, 25, BLUE[1]); c.ell(18, 18, 23, 22, BLUE[3])
@icon('ui_search')
def _(c): magnifier(c, 13, 13, 9.5)
@icon('ui_heart')
def _(c): heart(c, 16, 14, 11, RED)
@icon('ui_shield')
def _(c): heater(c, 5, 3, 27, 29, BLUE[1], STEEL[2], BLUE[0])
@icon('ui_target')
def _(c): c.circ(16, 16, 13.5, BONE[3]); c.circ(16, 16, 11, RED[1]); c.circ(16, 16, 8, BONE[3]); c.circ(16, 16, 5, RED[1]); c.circ(16, 16, 2, GOLD[2])
@icon('ui_recycle')
def _(c):
    c.d.arc([5 * S, 5 * S, 27 * S, 27 * S], 200, 340, fill=GREEN[1], width=round(3.4 * S)); c.d.arc([5 * S, 5 * S, 27 * S, 27 * S], 20, 160, fill=GREEN[1], width=round(3.4 * S))
    c.poly([(22.4, 6), (30, 12.6), (21, 15.4)], GREEN[1]); c.poly([(9.6, 26), (2, 19.4), (11, 16.6)], GREEN[1])
@icon('ui_forge')
def _(c): anvil(c, 15); hammer(c, (27, 12), (14, 5), STEEL, 3.4)
@icon('ui_up')
def _(c): c.poly([(16, 2), (29, 16), (21.4, 16), (21.4, 29), (10.6, 29), (10.6, 16), (3, 16)], GREEN[1]); c.poly([(16, 2), (16, 6.4), (8.6, 14), (12.6, 16), (12.6, 29), (10.6, 29), (10.6, 16), (3, 16)], GREEN[3])
@icon('ui_bow')
def _(c):
    for t in range(0, 41):
        a = math.radians(-70 + t * 3.5); c.circ(7 + math.cos(a) * 12, 16 + math.sin(a) * 12, 1.2, WOOD[1])
    c.tl((11.2, 4.6), (11.2, 27.4), .9, STEEL[3]); arrow(c, (7, 16), (29, 16)); c.rect(17.6, 14, 20.4, 18, LEATH[1])
@icon('ui_globe')
def _(c):
    c.circ(16, 16, 13, BLUE[1]); c.circ(15, 15, 11, BLUE[2]); c.poly([(8, 8), (14, 6), (16, 11), (12, 15), (7, 14)], GREEN[1]); c.poly([(17, 15), (24, 13), (26, 19), (21, 25), (17, 21)], GREEN[1]); c.poly([(9, 20), (13, 19), (14, 24), (11, 26)], GREEN[1]); c.circ(10.4, 9.6, 1.4, GREEN[2])
@icon('ui_flag')
def _(c): flag(c, RED, 8)
@icon('ui_star')
def _(c): star(c, 16, 17, 14.5, 6, 5, GOLD[1]); star(c, 16, 17, 11, 4.6, 5, GOLD[2]); c.tl((11, 14), (14, 10.4), 1.3, GOLD[3])
@icon('ui_burst')
def _(c): star(c, 16, 16, 15, 7, 9, FIRE[0]); star(c, 16, 16, 11.5, 5, 9, FIRE[2]); star(c, 16, 16, 6.5, 3, 9, FIRE[3])
@icon('ui_bag')
def _(c):
    c.d.arc([10 * S, 2 * S, 22 * S, 14 * S], 180, 360, fill=LEATH[0], width=round(2.4 * S)); c.d.rounded_rectangle([5 * S, 9 * S, 27 * S, 29 * S], radius=4 * S, fill=LEATH[1]); c.d.rounded_rectangle([5 * S, 9 * S, 27 * S, 17 * S], radius=4 * S, fill=LEATH[2]); c.rect(5, 15, 27, 17, LEATH[2])
    c.rect(9, 19, 23, 25.6, LEATH[0]); c.rect(9, 19, 23, 20.2, LEATH[3]); c.rect(14.4, 14.4, 17.6, 18.4, GOLD[2])
@icon('ui_bricks')
def _(c): wall(c, 6, [rgb(x) for x in ('7a3626', 'b0553a', 'd67c58', 'f0a888')], 4)
@icon('ui_dice')
def _(c):
    c.poly([(5, 11), (16, 4), (27, 11), (16, 18)], BONE[3]); c.poly([(5, 11), (16, 18), (16, 30), (5, 23)], BONE[2]); c.poly([(27, 11), (16, 18), (16, 30), (27, 23)], BONE[1])
    for x, y in ((16, 11), (8.6, 17), (12.4, 24.4), (19.6, 19.6), (21.6, 23), (23.6, 16.4), (11.4, 9.6), (20.6, 12.4)): c.circ(x, y, 1.25, K)

ALIAS = {
    'node_sp_fire': 'spell_fire', 'node_sp_frost': 'spell_frost', 'node_sp_turret': 'spell_turret', 'node_sp_bless': 'spell_bless',
    'ui_skull': 'item_skull', 'ui_bolt': 'item_thunder', 'ui_blackflag': 'event_cursed',
}

def render_all():
    out = {}
    for name, f in ICONS.items():
        cv = Cv(); f(cv); out[name] = finish(cv)
    return out

def atlas(icons, cols=10):
    names = list(icons); rows = (len(names) + cols - 1) // cols; sheet = Image.new('RGBA', (cols * SZ, rows * SZ), (0, 0, 0, 0))
    for i, n in enumerate(names): sheet.paste(icons[n], ((i % cols) * SZ, (i // cols) * SZ))
    return names, sheet, cols

if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = render_all(); names, sheet, cols = atlas(icons)
    if '--preview' in sys.argv:
        out = sys.argv[sys.argv.index('--preview') + 1]
        bg = Image.new('RGBA', sheet.size, (92, 70, 52, 255)); bg.alpha_composite(sheet); bg.save(out); print('preview', out, len(names), 'icons'); sys.exit()
    buf = io.BytesIO(); sheet.save(buf, 'PNG', optimize=True); b64 = base64.b64encode(buf.getvalue()).decode()
    ts = "// Generated by scripts/gen-icons.py — do not edit by hand.\nexport const ICON_COLS = %d;\nexport const ICON_COUNT = %d;\nexport const ICON_INDEX: Record<string, number> = %s;\nexport const ICON_ATLAS = 'data:image/png;base64,%s';\n" % (cols, len(names), json.dumps({**{n: i for i, n in enumerate(names)}, **{a: names.index(t) for a, t in ALIAS.items()}}), b64)
    open(os.path.join(root, 'src', 'iconData.ts'), 'w', encoding='utf-8').write(ts); print(len(names), 'icons,', len(b64) // 1024, 'KB base64')
