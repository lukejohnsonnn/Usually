"""Draws the home-screen ruby silhouette: the ruby bee's body shape (sparkles
removed) in dark plum with a thin red rim, baked into PNGs so it looks the
same in every browser (no CSS filters). Run from the repo root."""
from PIL import Image, ImageFilter

FILL, EDGE = (52, 16, 30, 255), (196, 34, 82, 255)
src = Image.open("public/img/bee-ruby.png").convert("RGBA")
W, H = src.size
a = src.getchannel("A").point(lambda v: 255 if v > 100 else 0)
px = a.load()

# keep only the biggest connected shape: the bee, not its sparkles
seen, best = set(), []
for y in range(H):
    for x in range(W):
        if px[x, y] and (x, y) not in seen:
            comp, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop(); comp.append((cx, cy))
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < W and 0 <= ny < H and px[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(comp) > len(best): best = comp
body = Image.new("L", (W, H), 0)
bp = body.load()
for x, y in best: bp[x, y] = 255

rim = max(2, W // 64)
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
out.paste(Image.new("RGBA", (W, H), EDGE), (0, 0), body)
out.paste(Image.new("RGBA", (W, H), FILL), (0, 0), body.filter(ImageFilter.MinFilter(2 * rim + 1)))
out.save("public/img/bee-ruby-shadow.png")
for size in (96, 144):
    out.resize((size, size), Image.LANCZOS).save(f"public/img/bee-ruby-shadow-{size}.png")
print((W, H), "body px", len(best), "rim", rim)
