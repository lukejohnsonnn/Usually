"""Soundtrack for bees.html: the same bass-and-drums beat as audio.py (120 BPM,
bars from 0.5s) plus cartoon effects for the bees and effects synced to the
recorded gameplay taps in tools/ad/gameplay/manifest.json.

Usage: python3 tools/ad/bees_audio.py out.wav
Event times mirror bees.html; change both together.
"""
import json
import os
import sys
import numpy as np
from synth import (SR, put, env, square, sine, t_axis, noise, hz, lowpass, kick, snare, hat, thud, whoosh, blip,
                   arp, sparkle, cymbal, buzz, boing, pop, bloop, deflate, thunder, bleh, glass, squeak, write_wav)

DUR = 24.0
N = int(SR * DUR)
music = np.zeros(N)
sfx = np.zeros(N)

BPM = 120
BEAT = 60 / BPM
S16 = BEAT / 4
GRID0 = 0.5
BREAK = (7.5, 8.5)      # riser before the "Which bee are you?" drop
DROP = 8.5
SLAM = 10.5             # bees hit the glass
GAP = (10.5, 11.0)      # the beat stops dead for a beat after the slam
END = 21.5
END_HIT = 23.5
CHORDS = [(60, 64, 67), (55, 59, 62), (57, 60, 64), (53, 57, 60)]

# ---------------------------------------------------------------- music ----
for s in range(-int(GRID0 / S16), int((DUR - GRID0) / S16)):
    at = GRID0 + s * S16
    if at >= END_HIT:
        break
    if GAP[0] <= at < GAP[1]:
        continue
    in_break = BREAK[0] <= at < BREAK[1]
    bar, pos = int(s // 16) % 4, s % 16
    intro = at < 2.5
    chord = CHORDS[bar]
    if not in_break:
        if pos in (0, 8) or (pos in (6, 14) and not intro and at >= DROP):
            put(music, at, kick(), 0.9)
        if pos in (4, 12) and not intro:
            put(music, at, snare(), 0.45)
    if not intro and (pos % 2 == 0 or (at >= DROP and pos in (7, 11, 15))):
        put(music, at, hat(pos % 4 == 2), (0.18 if pos % 2 == 0 else 0.1) if not in_break else 0.12)
    if in_break:
        continue
    if pos % 2 == 0:
        root = chord[0] - 24 + (12 if pos % 4 == 2 else 0)
        d = S16 * 1.8
        put(music, at, square(hz(root), d, 0.5) * env(int(SR * d), 0.002, r=0.02), 0.10)
    if at >= DROP:
        if pos % 4 == 0:
            d = S16 * 3.5
            put(music, at, sine(hz(chord[0] - 36), d) * env(int(SR * d), 0.003, r=0.05), 0.22)
        if pos in (4, 12):
            for off in (0, 0.011, 0.022):
                put(music, at + off, hat(True), 0.22)

d = BREAK[1] - BREAK[0]
t = t_axis(d)
rise = noise(d) * (t / d) ** 2
rise = rise - lowpass(rise, 0.05)
put(music, BREAK[0], rise, 0.35)
put(music, BREAK[0], square(hz(48) * 2 ** (2 * t / d), d, 0.5) * (t / d) * 0.4, 0.12)
d = 1.0
put(music, END_HIT, square(hz(36), d, 0.5) * env(int(SR * d), 0.002, d=0.3), 0.12)
put(music, END_HIT, sine(hz(24), d) * env(int(SR * d), 0.003, d=0.35), 0.3)
put(music, END_HIT, kick(), 1.0)

# ------------------------------------------------------------ cartoon ----
# 0–0.5 the golden bee loops in
put(sfx, 0.0, buzz(0.55, 140, 300), 0.35)
put(sfx, 0.25, whoosh(0.25), 0.2)
put(sfx, 0.5, thud(0.6), 0.6)
put(sfx, 0.5, boing(260), 0.3)
for at in (0.56, 1.5):
    put(sfx, at, pop(900 if at < 1 else 1100), 0.35)
# 2.5 title, then the hive pops in one per 8th
put(sfx, 2.3, whoosh(0.2), 0.3)
put(sfx, 2.5, thud(0.9), 0.7)
for i in range(6):
    put(sfx, 2.5 + i * 0.25, boing(200 * 2 ** (i / 6)), 0.25)
# 4.5–7.5 spotlights: a hit and a gag sound per bee
for i in range(6):
    at = 4.5 + i * 0.5
    put(sfx, at, thud(0.8), 0.6)
    put(sfx, at + 0.0625, pop(1000 + i * 60), 0.3)
put(sfx, 4.5, arp([84, 88, 91, 96]), 0.16)
put(sfx, 4.5, sparkle(0.45), 0.16)
put(sfx, 5.0, arp([79, 83, 86, 91]), 0.16)
put(sfx, 5.5, bloop(800, 200), 0.35)
put(sfx, 5.75, bloop(650, 160), 0.3)
put(sfx, 6.0, deflate(0.45), 0.2)
put(sfx, 6.5, thunder(0.5), 0.5)
put(sfx, 7.0, bleh(0.4), 0.14)
# 7.5–9.5 the swarm orbits (buzz rises through the break), the drop at 8.5
put(sfx, 7.5, buzz(2.0, 160, 340), 0.3)
put(sfx, 7.5, buzz(2.0, 210, 420, 33), 0.18)
put(sfx, 8.3, whoosh(0.2), 0.3)
put(sfx, 8.5, thud(1.2), 1.0)
put(sfx, 8.5, cymbal(1.2), 0.22)
# 9.5–10.5 charge: buzz screams up into the slam
d = 1.0
t = t_axis(d)
put(sfx, 9.5, buzz(d, 220, 700, 40) * (0.3 + 0.7 * (t / d) ** 2), 0.5)
put(sfx, 10.1, whoosh(0.4), 0.5)
# 10.5 SLAM: impact, glass, the bees squish, then squeak down the glass
put(sfx, SLAM, thud(1.6), 1.0)
put(sfx, SLAM, glass(1.0), 0.6)
put(sfx, SLAM, cymbal(1.6), 0.3)
for i in range(6):
    put(sfx, SLAM + 0.0625 * i, bloop(300 - i * 20, 90, 0.12), 0.2)
    put(sfx, SLAM + 0.5 + 0.0625 * i, squeak(0.3), 0.12)

# ------------------------------------------------------------ gameplay ----
CLIPS = [("round1", SLAM, 0.755), ("round2", 16.0, 1.124), ("results", 19.0, 0.322)]
ends = [16.0, 19.0, END]
here = os.path.dirname(os.path.abspath(__file__))
manifest = json.load(open(os.path.join(here, "gameplay", "manifest.json")))
for (name, at0, off), t_end in zip(CLIPS, ends):
    m = manifest[name]
    # slider ticks: one per 16th while the finger is moving the slider
    moves = [k for k in m["markers"] if k["label"] == "move"]
    last_x, used = None, set()
    for k in moves:
        g = at0 + k["t"] - off
        if not (at0 <= g < t_end):
            continue
        q = round((g - GRID0) / S16)
        if q in used or (last_x is not None and abs(k["x"] - last_x) < 6):
            continue
        used.add(q)
        last_x = k["x"]
        put(sfx, GRID0 + q * S16, blip(72 + int(k["x"] / 1080 * 24), 0.025, "sq", 0.125), 0.1)
for lock in (13.5, 17.0):
    put(sfx, lock, blip(84, 0.03, "sq", 0.5), 0.3)
    put(sfx, lock, thud(0.5), 0.45)
    for k in range(6):  # the comb fills
        put(sfx, lock + 0.125 + k * 0.0625, blip(64 + k * 4, 0.04, "sq", 0.25), 0.1)
    put(sfx, lock + 0.5, thud(1.0), 0.8)  # the bee lands
    put(sfx, lock + 0.5, arp([72, 76, 79, 84, 88]), 0.18)
    put(sfx, lock + 0.5, sparkle(0.7), 0.16)
    put(sfx, lock + 0.5, boing(300), 0.2)  # cameo pops up
    put(sfx, lock + 0.75, pop(1200), 0.3)
for at in (11.5, 16.0, 19.5):  # captions
    put(sfx, at, thud(0.5), 0.45)
    put(sfx, at, pop(800), 0.25)
put(sfx, 19.0, blip(84, 0.03, "sq", 0.5), 0.3)  # "See my score"
for k in range(8):
    put(sfx, 19.25 + k * S16, blip(79 + (k % 2) * 5, 0.025, "sq", 0.125), 0.06)

# ------------------------------------------------------------ end card ----
put(sfx, END - 0.25, whoosh(0.25), 0.4)
put(sfx, END, thud(1.3), 1.0)
put(sfx, END, cymbal(1.4), 0.26)
put(sfx, END, sparkle(0.8), 0.16)
put(sfx, END + 0.5, thud(0.6), 0.5)
for i in range(6):
    put(sfx, END + 0.75 + i * 0.125, boing(240 * 2 ** (i / 6), 0.25), 0.18)
put(sfx, 22.5, thud(0.8), 0.7)
put(sfx, 22.5, arp([72, 76, 79]), 0.15)
put(sfx, 23.0, blip(84, 0.08, "sq", 0.5), 0.12)

# ---------------------------------------------------------------- mix ----
duck = np.ones(N)
for at, depth in [(0.5, .4), (2.5, .4), (DROP, .45), (SLAM, .7), (END, .45)]:
    i, n = int(at * SR), int(0.4 * SR)
    seg = 1 - depth * np.exp(-np.arange(n) / SR / 0.15)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[: max(0, min(n, N - i))])
write_wav(sys.argv[1], music * duck * 0.9 + sfx)
print(f"wrote {sys.argv[1]} ({DUR}s)")
