# Draws the 32x32 pixel-art icons (items, hero skills, spells, orders) in one palette with a shared
# dark outline and top-left rim light, then packs them into src/iconData.ts (atlas data URL + name list).
# Usage: python3 scripts/gen-icons.py [--preview out.png]
import base64, io, math, os, sys
from PIL import Image, ImageDraw

SZ = 32
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
    def __init__(s): s.im = Image.new('RGBA', (SZ, SZ), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im)
    def px(s, x, y, c):
        if 0 <= x < SZ and 0 <= y < SZ: s.im.putpixel((int(x), int(y)), c)
    def rect(s, x0, y0, x1, y1, c): s.d.rectangle([x0, y0, x1, y1], fill=c)
    def ell(s, x0, y0, x1, y1, c): s.d.ellipse([x0, y0, x1, y1], fill=c)
    def circ(s, cx, cy, r, c): s.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    def poly(s, pts, c): s.d.polygon([(round(x), round(y)) for x, y in pts], fill=c)
    def line(s, pts, c, w=1): s.d.line([(round(x), round(y)) for x, y in pts], fill=c, width=w)
    def tl(s, p0, p1, w, c):
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; n = math.hypot(dx, dy) or 1; nx, ny = -dy / n * w / 2, dx / n * w / 2
        s.poly([(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)], c)

def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)

def finish(cv):
    """Rim light (top-left) and shade (bottom-right) on the silhouette edge, then a 1px dark outline."""
    src = cv.im.copy(); b = src.load(); out = src.copy(); o = out.load()
    def solid(x, y): return 0 <= x < SZ and 0 <= y < SZ and b[x, y][3] > 0
    for y in range(SZ):
        for x in range(SZ):
            c = b[x, y]
            if c[3] == 0: continue
            top = not solid(x, y - 1) or not solid(x - 1, y); bot = not solid(x, y + 1) or not solid(x + 1, y)
            if top and not bot: o[x, y] = mix(c, WHITE, 0.32)
            elif bot and not top: o[x, y] = mix(c, SHADE, 0.34)
    for y in range(SZ):
        for x in range(SZ):
            if b[x, y][3] == 0 and (solid(x + 1, y) or solid(x - 1, y) or solid(x, y + 1) or solid(x, y - 1)): o[x, y] = K
    return out

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
            if c.im.getpixel((x, y))[3]: c.px(x, y, STEEL[3]); c.px(x + 1, y + 1, STEEL[0])
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
    c.circ(16, 16, 12, FIRE[0]); c.circ(16, 16, 8, (0, 0, 0, 0)); c.d.ellipse([8, 8, 24, 24], fill=(0, 0, 0, 0))
    c.circ(16, 16, 12, FIRE[1]); c.d.ellipse([9, 9, 23, 23], fill=(0, 0, 0, 0)); c.d.ellipse([11, 11, 21, 21], fill=(0, 0, 0, 0))
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
    c.circ(16, 16, 13, RED[1]); c.circ(16, 16, 10, (0, 0, 0, 0)); c.d.ellipse([6, 6, 26, 26], fill=(0, 0, 0, 0))
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
    c.circ(16, 16, 13, GOLD[3]); c.circ(16, 16, 11, (0, 0, 0, 0)); c.d.ellipse([5, 5, 27, 27], fill=(0, 0, 0, 0)); c.circ(16, 16, 12, rgb('fff3b0')); c.d.ellipse([6, 6, 26, 26], fill=(0, 0, 0, 0))
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
        bg = Image.new('RGBA', sheet.size, (92, 70, 52, 255)); bg.alpha_composite(sheet); bg.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(out); print('preview', out, len(names), 'icons'); sys.exit()
    buf = io.BytesIO(); sheet.save(buf, 'PNG', optimize=True); b64 = base64.b64encode(buf.getvalue()).decode()
    ts = "// Generated by scripts/gen-icons.py — do not edit by hand.\nexport const ICON_COLS = %d;\nexport const ICON_NAMES: string[] = %s;\nexport const ICON_ATLAS = 'data:image/png;base64,%s';\n" % (cols, repr(names).replace("'", '"'), b64)
    open(os.path.join(root, 'src', 'iconData.ts'), 'w', encoding='utf-8').write(ts); print(len(names), 'icons,', len(b64) // 1024, 'KB base64')
