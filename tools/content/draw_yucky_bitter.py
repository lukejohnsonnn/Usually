# Draws the two bottom-tier bees, Yucky (spoiled honey) and Bitter (burnt honey), from the 1600px normal-bee master.
# Usage: python3 draw_yucky_bitter.py <folder holding keep/assets/bee-normal.png> [out folder]; then resize to 320/144/96 for public/img.
import sys, colorsys
from PIL import Image, ImageDraw
SP = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else f"{SP}/hive"
U = 27; NAVY = (27, 27, 70)
base = Image.open(f"{SP}/keep/assets/bee-normal.png").convert("RGBA"); W, H = base.size
def hsv(r, g, b): return colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
def rgb(h, s, v): return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, max(0, min(1, s)), max(0, min(1, v))))
yellow = lambda h, s, v: 0.08 < h < 0.19 and s > 0.35 and v > 0.45
wing = lambda h, s, v: 0.48 < h < 0.62 and s < 0.45 and v > 0.6
def recolor(im, body=None, wings=None):
    out = im.copy(); px = out.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a < 10: continue
            h, s, v = hsv(r, g, b)
            if body and yellow(h, s, v): px[x, y] = body(h, s, v) + (a,)
            elif wings and wing(h, s, v): px[x, y] = wings(h, s, v) + (a,)
    return out
def rows(d, x0, y0, pat, pal):
    for j, row in enumerate(pat):
        for i, ch in enumerate(row):
            if ch != ".": d.rectangle([x0 + i * U, y0 + j * U, x0 + (i + 1) * U - 1, y0 + (j + 1) * U - 1], fill=pal[ch] + (255,))
def face_wipe(im):
    d = ImageDraw.Draw(im); F = im.getpixel((800, 640))[:3]
    for x0 in (596, 857): d.rectangle([x0, 496, x0 + 146, 664], fill=F + (255,))   # both eyes, fully
    d.rectangle([728, 682, 872, 772], fill=F + (255,))                              # mouth
    return d, F

# ---- YUCKY (10): spoiled honey: sickly green, eyes squeezed shut "> <", tongue out, green goo and stink lines
yuk = recolor(base, body=lambda h, s, v: rgb(0.23, s * 0.62, v * 0.78), wings=lambda h, s, v: rgb(0.25, s * 0.5 + 0.05, v * 0.9))
d, F = face_wipe(yuk)
N = {"x": NAVY}
rows(d, 615, 512, ["x...", ".xx.", "...x", ".xx.", "x..."], N)          # >
rows(d, 876, 512, ["...x", ".xx.", "x...", ".xx.", "...x"], N)          # <
rows(d, 733, 690, ["xxxxx", "xpppx", "..pp."], {"x": NAVY, "p": (232, 92, 128)})   # open mouth, tongue out
rows(d, 787, 771, ["pp"], {"p": (205, 70, 105)})
GOO, GOO2 = (140, 190, 40), (95, 140, 25)
rows(d, 640, 362, ["gggggggggggg", "g.gg..gg.g.g", "g..g...g...g", "h..g...h...h", "...h........"], {"g": GOO, "h": GOO2})
for (x, y) in ((420, 250), (1130, 230)):
    rows(d, x, y, [".s", "s.", ".s", "s."], {"s": (150, 200, 80)})
yuk.save(f"{OUT}/bee-yucky.png")

# ---- BITTER (40): burnt honey: dark amber-brown, scrunched eyes under cross brows, grimace
bit = recolor(base, body=lambda h, s, v: rgb(0.075, min(1, s * 0.9), v * 0.66), wings=lambda h, s, v: rgb(0.08, 0.18, v * 0.85))
d, F = face_wipe(bit)
rows(d, 602, 512, ["xx...", "..xx.", "....x", ".....", "xxxxx"], N)      # brow slants in, eye squeezed to a line
rows(d, 863, 512, ["...xx", ".xx..", "x....", ".....", "xxxxx"], N)
rows(d, 733, 705, ["x.x.x", ".x.x."], N)                         # zig-zag grimace
DROP = (120, 60, 15)
rows(d, 1060, 420, [".d.", "ddd", "ddd", ".d."], {"d": DROP})   # a bead of burnt honey
bit.save(f"{OUT}/bee-bitter.png")
print("ok")
