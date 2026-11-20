# Draws the four lower-tier bees (Warm, Lukewarm, Cold, Way Off) from the normal bee master.
# Usage: set SRC to the 1600px bee-normal.png master and OUT to a folder, then run with python3.
from PIL import Image, ImageDraw
import colorsys
SRC = "/tmp/claude-0/-home-user-Usually/31e5b725-48ba-5eb6-9ffe-2ea90071a665/scratchpad/keep/assets/bee-normal.png"
OUT = "/tmp/claude-0/beedraft"
U = 27  # one art pixel at the 1600px master
base = Image.open(SRC).convert("RGBA")
W, H = base.size
NAVY = base.getpixel((750, 700))[:3] if base.getpixel((750, 700))[3] > 200 else (27, 27, 70)
FACE = base.getpixel((800, 655))[:3]

def mouth(im, kind):
    d = ImageDraw.Draw(im)
    d.rectangle([728, 682, 872, 772], fill=FACE + (255,))            # wipe the smile (and tongue)
    R = lambda x0, y0, x1, y1, c=NAVY: d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c + (255,))
    if kind == "flat":
        R(746, 712, 854, 712 + U)
    elif kind == "frown":
        R(765, 700, 835, 700 + U); R(738, 700 + U, 765, 700 + 2 * U); R(835, 700 + U, 862, 700 + 2 * U)
    elif kind == "o":
        R(773, 690, 827, 690 + U); R(773, 690 + 3 * U, 827, 690 + 4 * U)
        R(746, 690 + U, 773, 690 + 3 * U); R(827, 690 + U, 854, 690 + 3 * U)
        R(773, 690 + U, 827, 690 + 3 * U, (150, 60, 90))
    return im

def recolor(im, fn):
    out = im.copy(); px = out.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 10: px[x, y] = fn(r, g, b) + (a,)
    return out

def hsv(r, g, b): return colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
def rgb(h, s, v): return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, max(0, min(1, s)), max(0, min(1, v))))
yellow = lambda h, s, v: 0.08 < h < 0.19 and s > 0.35 and v > 0.45
wing = lambda h, s, v: 0.48 < h < 0.62 and s < 0.45 and v > 0.6

def plus(d, cx, cy, c, arm=1, core=None):
    for k in range(-arm, arm + 1):
        d.rectangle([cx + k * U, cy, cx + k * U + U - 1, cy + U - 1], fill=c)
        d.rectangle([cx, cy + k * U, cx + U - 1, cy + k * U + U - 1], fill=c)
    if core: d.rectangle([cx, cy, cx + U - 1, cy + U - 1], fill=core)

def flake(d, cx, cy, c, core):
    plus(d, cx, cy, c, arm=2, core=core)
    for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        d.rectangle([cx + dx * U, cy + dy * U, cx + dx * U + U - 1, cy + dy * U + U - 1], fill=c)

SPOTS = [(250, 470), (1290, 400), (300, 1170), (1300, 1240)]   # symmetric-ish, like the golden bee's sparkles

# ---- WARM (Warm, 95 pts): sunny amber, rosy cheeks, warm sparkles
warm = recolor(base, lambda r, g, b: rgb(0.105, hsv(r,g,b)[1] * 1.08, hsv(r,g,b)[2]) if yellow(*hsv(r, g, b)) else (r, g, b))
d = ImageDraw.Draw(warm)
for x0 in (612, 935):
    d.rectangle([x0, 680, x0 + 2 * U - 1, 680 + U - 1], fill=(255, 120, 80, 255))
for i, (x, y) in enumerate(SPOTS):
    plus(d, x, y, (255, 150, 30, 255), arm=1 if i % 2 else 2, core=(255, 230, 140, 255))
warm.save(f"{OUT}/bee-warm.png")

# ---- LUKEWARM (70): a bit faded, flat mouth, a nervous sweat drop
luke = mouth(base.copy(), "flat")
luke = recolor(luke, lambda r, g, b: rgb(hsv(r,g,b)[0], hsv(r,g,b)[1] * 0.55, hsv(r,g,b)[2] * 0.96) if yellow(*hsv(r, g, b)) else (r, g, b))
d = ImageDraw.Draw(luke)
sx, sy = 1035, 430
for (dx, dy, c) in [(0, 0, (170, 225, 255)), (-1, 1, (120, 195, 245)), (0, 1, (170, 225, 255)), (-1, 2, (120, 195, 245)), (0, 2, (230, 248, 255)), (-1, 3, (90, 170, 230))]:
    d.rectangle([sx + dx * U, sy + dy * U, sx + dx * U + U - 1, sy + dy * U + U - 1], fill=c + (255,))
luke.save(f"{OUT}/bee-lukewarm.png")

# ---- COLD (40): frozen ice-blue, shivering "o", icicles under the wings, snowflakes
cold = mouth(base.copy(), "o")
def cold_fn(r, g, b):
    h, s, v = hsv(r, g, b)
    if yellow(h, s, v): return rgb(0.56, 0.30, min(1, v * 1.06))
    if wing(h, s, v): return rgb(0.54, s * 0.6, min(1, v * 1.08))
    return (r, g, b)
cold = recolor(cold, cold_fn)
d = ImageDraw.Draw(cold); a = cold.getchannel("A")
def bottom(x, ylo, yhi):
    for y in range(yhi, ylo, -1):
        if a.getpixel((x, y)) > 200: return y
def icicle(x, y, n):
    # tapered: 2 art pixels wide at the top, then 1, with a bright tip
    for k in range(n):
        w = 2 * U if k < n - 2 else U
        x0 = x if w == 2 * U else x + U // 2
        col = (235, 250, 255, 255) if k == 0 else (195, 232, 255, 255) if k < n - 1 else (255, 255, 255, 255)
        d.rectangle([x0, y + 1 + k * U, x0 + w - 1, y + (k + 1) * U], fill=col)
for x, n in [(318, 4), (420, 3), (1150, 3), (1250, 4)]:
    y = bottom(x + U, 550, 905)
    if y: icicle(x, y, n)
for x, n in [(660, 3), (885, 3)]:   # under the body, between the legs
    y = bottom(x + U, 1000, 1330)
    if y: icicle(x, y, n)
for (x, y) in SPOTS:
    flake(d, x, y, (215, 238, 255, 255), core=(130, 195, 255, 255))
cold.save(f"{OUT}/bee-cold.png")

# ---- WAY OFF (10): drained grey, frown, under a rain cloud
way = mouth(base.copy(), "frown")
way = recolor(way, lambda r, g, b: rgb(hsv(r,g,b)[0], hsv(r,g,b)[1] * 0.10, hsv(r,g,b)[2] * 0.80))
d = ImageDraw.Draw(way)
CU = 40  # the cloud is drawn a little chunkier than the bee's pixels
cx, cy = 800, 10
shape = ["   ####   ", "  ######  ", " ######## ", "##########", "##########"]
for j, row in enumerate(shape):
    for i, ch in enumerate(row):
        if ch == "#":
            col = (196, 204, 216) if j < 2 else (160, 168, 182) if j < 4 else (122, 130, 146)
            x = cx + (i - 5) * CU
            d.rectangle([x, cy + j * CU, x + CU - 1, cy + (j + 1) * CU - 1], fill=col + (255,))
for i, off in [(-4, 0), (-1, 1), (2, 0), (4, 1)]:
    x = cx + i * CU; y = cy + (5 + off) * CU + 10
    d.rectangle([x, y, x + U - 1, y + 2 * U - 1], fill=(110, 170, 255, 255))
way.save(f"{OUT}/bee-wayoff.png")
print("ok")
