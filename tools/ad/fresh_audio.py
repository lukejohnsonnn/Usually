"""Soundtrack for fresh.html: a bouncier variation on the ads' bass-and-drums beat
(120 BPM, bars from 0.5s, no melody) with effects on the stat slams, the real
gameplay taps and typing (from tools/ad/gameplay-fresh/manifest.json) and the
Hive Hunt finds.

Usage: python3 tools/ad/fresh_audio.py out.wav
Event times mirror fresh.html; change both together.
"""
import json
import os
import sys
import numpy as np
from synth import (SR, put, env, square, sine, t_axis, noise, hz, lowpass, kick, snare, hat, thud, whoosh, blip,
                   arp, sparkle, cymbal, boing, pop, glitch, write_wav)

# Times below are on the original timeline; SHIFT moves everything one second later
# (the hook's four stats now get 0.75s each), via the put() wrapper.
SHIFT = 1.0
DUR = 23.0
_put = put


def put(buf, at, sig, gain=1.0):
    _put(buf, at + SHIFT, sig, gain)


N = int(SR * DUR)
music = np.zeros(N)
sfx = np.zeros(N)
S16 = 0.125
GRID0 = 0.5
BREAK = (8.0, 8.5)   # a one-beat hold before the HIVE HUNT drop
DROP = 8.5
END = 18.5
END_HIT = 21.0
ROOTS = [45, 41, 48, 43]  # A F C G, one bar each
BASS = {0: 0, 3: 0, 6: 12, 8: 0, 10: 12, 11: 0, 14: 7}  # syncopated 16th pattern: step -> interval


def clap():
    out = np.zeros(int(SR * 0.2))
    for off in (0, 0.009, 0.019):
        h = hat(True)
        j = int(off * SR)
        out[j:j + len(h)] += h
    return out


for s in range(-int((GRID0 + SHIFT) / S16), int((DUR - GRID0) / S16)):
    at = GRID0 + s * S16
    if at >= END_HIT:
        break
    bar, pos = int(s // 16) % 4, s % 16
    hunt = DROP <= at < END        # the hunt: four-on-the-floor
    if BREAK[0] <= at < BREAK[1]:
        if pos % 2 == 0:
            put(music, at, snare(), 0.25 + 0.5 * (at - BREAK[0]))  # snare roll up into the drop
        continue
    if pos in (0, 8) or (hunt and pos in (4, 12)) or (not hunt and pos == 10):
        put(music, at, kick(), 0.9)
    if pos in (4, 12):
        put(music, at, clap(), 0.3)
        put(music, at, snare(), 0.25)
    if pos % 2 == 0:
        put(music, at, hat(pos % 4 == 2), 0.16)
    elif hunt:
        put(music, at, hat(), 0.07)
    if pos in BASS:
        note = ROOTS[bar] + BASS[pos]
        d = S16 * (1.6 if pos != 14 else 1.9)
        put(music, at, square(hz(note), d, 0.5) * env(int(SR * d), 0.002, r=0.02), 0.09)
        put(music, at, sine(hz(note - 12), d) * env(int(SR * d), 0.003, r=0.03), 0.2)

d = 1.0
put(music, END_HIT, square(hz(33), d, 0.5) * env(int(SR * d), 0.002, d=0.3), 0.12)
put(music, END_HIT, sine(hz(21), d) * env(int(SR * d), 0.003, d=0.35), 0.3)
put(music, END_HIT, kick(), 1.0)

# ---- hook: one stat per beat ----
for i, at in enumerate((-1.0, -0.25, 0.5, 1.25)):  # real time 0, 0.75, 1.5, 2.25
    put(sfx, at, thud(0.9), 0.75)
    put(sfx, at, blip(76 + i * 3, 0.06, "sq", 0.5), 0.12)
    put(sfx, at + 0.125, pop(800 + i * 80), 0.25)
put(sfx, 2.0, thud(0.7), 0.6)
put(sfx, 2.25, thud(1.1), 0.9)
put(sfx, 2.25, cymbal(0.8), 0.15)

# ---- gameplay ----
here = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(here, "gameplay-fresh", "manifest.json")))
put(sfx, 2.6, whoosh(0.3), 0.4)  # phone flies in
# slider ticks on 16ths while the finger moves (guess clip at 2.75, offset 0.40)
used, last_x = set(), None
for k in m["guess"]["markers"]:
    if k["label"] != "move":
        continue
    g = 2.75 + k["t"] - 0.40
    q = round((g - GRID0) / S16)
    if q in used or (last_x is not None and abs(k["x"] - last_x) < 6):
        continue
    used.add(q); last_x = k["x"]
    put(sfx, GRID0 + q * S16, blip(72 + int(k["x"] / 1080 * 24), 0.025, "sq", 0.125), 0.1)


def lock_and_reveal(lock, reveal):
    put(sfx, lock, blip(84, 0.03, "sq", 0.5), 0.3)
    put(sfx, lock, thud(0.5), 0.45)
    for k in range(4):
        put(sfx, lock + 0.125 + k * 0.0625, blip(64 + k * 5, 0.04, "sq", 0.25), 0.1)
    put(sfx, reveal, thud(1.0), 0.8)
    put(sfx, reveal, arp([72, 76, 79, 84, 88]), 0.18)
    put(sfx, reveal, sparkle(0.6), 0.15)
    put(sfx, reveal, boing(320), 0.18)
    put(sfx, reveal + 0.25, pop(1100), 0.25)


lock_and_reveal(5.0, 5.5)
put(sfx, 6.4, whoosh(0.2), 0.35)  # whip to the text round
# typing (text clip at 6.5, offset 0.66): keystrokes every 55 ms before Enter
tk = next(k["t"] for k in m["text"]["markers"] if k["label"].startswith("type:"))
en = next(k["t"] for k in m["text"]["markers"] if k["label"].startswith("enter:"))
for j in range(int((en - 0.12 - tk) / 0.055)):
    g = 6.5 + tk + j * 0.055 - 0.66
    if g >= 6.5:
        put(sfx, g, blip(90 + (j % 3), 0.012, "sq", 0.5), 0.05)
lock_and_reveal(7.5, 8.0)

# ---- HIVE HUNT drop ----
put(sfx, 8.25, whoosh(0.25), 0.4)
put(sfx, DROP, thud(1.5), 1.0)
put(sfx, DROP, cymbal(1.4), 0.28)
put(sfx, DROP, sparkle(0.9), 0.15)
put(sfx, 9.0, pop(900), 0.25)
put(sfx, 9.35, whoosh(0.3), 0.4)  # phone back in
# hunt at double speed (clip at 9.5, offset 1.2): finds snap to 16ths, a rising note per find
finds = 0
for k in m["hunt"]["markers"]:
    if not (k["label"].startswith("found:") or k["label"].startswith("miss:")):
        continue
    g = 9.5 + (k["t"] - 1.2) / 2
    if not (9.5 <= g < 14.5):
        continue
    g = GRID0 + round((g - GRID0) / S16) * S16
    if k["label"].startswith("found:"):
        scale = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]
        put(sfx, g, blip(scale[min(finds, 10)], 0.09, "sq", 0.25), 0.2)
        put(sfx, g, pop(1000 + finds * 60), 0.25)
        finds += 1
    else:
        t = t_axis(0.3)
        put(sfx, g, square(hz(38) * (1 - 0.1 * t / 0.3), 0.3, 0.5) * env(len(t), 0.003, d=0.1), 0.18)  # bzzt
        put(sfx, g, thud(0.5), 0.4)
put(sfx, 14.5, thud(1.0), 0.8)
put(sfx, 14.5, arp([72, 76, 79, 84, 88, 91]), 0.18)
put(sfx, 14.5, sparkle(0.7), 0.15)
put(sfx, 14.75, pop(900), 0.3)

# ---- every day: calendar flips on the 8ths, the secret bee ----
put(sfx, 16.5, thud(0.8), 0.6)
for j in range(7):
    put(sfx, 16.75 + j * 0.25, noise(0.03) * env(int(SR * 0.03), 0.001, d=0.01), 0.3)
    put(sfx, 16.75 + j * 0.25, blip(79 + j, 0.03, "tri"), 0.12)
put(sfx, 17.5, glitch(0.22), 0.45)
put(sfx, 17.5, pop(700), 0.25)

# ---- end card ----
put(sfx, END - 0.25, whoosh(0.25), 0.4)
put(sfx, END, thud(1.3), 1.0)
put(sfx, END, cymbal(1.4), 0.26)
put(sfx, END, sparkle(0.8), 0.16)
put(sfx, 19.0, thud(0.6), 0.5)
for i in range(7):
    put(sfx, 19.25 + i * 0.125, boing(240 * 2 ** (i / 7), 0.25) if i < 6 else glitch(0.12), 0.18 if i < 6 else 0.3)
put(sfx, 20.0, thud(0.8), 0.7)
put(sfx, 20.0, arp([72, 76, 79]), 0.15)
put(sfx, 20.5, blip(84, 0.08, "sq", 0.5), 0.12)

duck = np.ones(N)
for at, depth in [(-1.0, .35), (2.25, .4), (DROP, .5), (END, .45)]:
    i, n = int((at + SHIFT) * SR), int(0.4 * SR)
    seg = 1 - depth * np.exp(-np.arange(n) / SR / 0.15)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[: max(0, min(n, N - i))])
write_wav(sys.argv[1], music * duck * 0.9 + sfx)
print(f"wrote {sys.argv[1]} ({DUR}s)")
