"""Soundtrack for reel.html, the organic reel: a quiet, laid-back half-time beat
(kick on 1, snare on 3, soft shaker) under gentle effects on the real taps, typing
and Hive Hunt finds. Meant to sit under a voiceover or be swapped for a trending sound.

Usage: python3 tools/ad/reel_audio.py out.wav
Event times mirror reel.html; change both together.
"""
import json
import os
import sys
import numpy as np
from synth import SR, put, env, square, sine, t_axis, noise, hz, lowpass, kick, snare, hat, blip, pop, write_wav

DUR = 22.0
N = int(SR * DUR)
music = np.zeros(N)
sfx = np.zeros(N)
S16 = 0.125
ROOTS = [45, 41, 48, 43]


def soft(x, k=0.25):
    return lowpass(x, k)


for s in range(int(DUR / S16)):
    at = s * S16
    if at >= 21.0:
        break
    bar, pos = int(s // 16) % 4, s % 16
    if pos in (0, 10):
        put(music, at, kick(), 0.6)
    if pos == 8:
        put(music, at, soft(snare(), 0.35), 0.35)
    if pos % 2 == 1:
        put(music, at, hat(), 0.05)  # shaker on the off 16ths
    if pos in (0, 6):
        d = S16 * (5 if pos == 0 else 9)
        put(music, at, sine(hz(ROOTS[bar] - 12), d) * env(int(SR * d), 0.01, r=0.1), 0.18)
put(music, 21.0, kick(), 0.6)
put(music, 21.0, sine(hz(33), 1.0) * env(SR, 0.01, d=0.4), 0.2)


def ding(note=84, gain=1.0):
    d = 0.5
    return (sine(hz(note), d) + 0.4 * sine(hz(note + 12), d)) * env(int(SR * d), 0.002, d=0.15) * gain


here = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(here, "gameplay-fresh", "manifest.json")))
# countdown
for i, at in enumerate((0.9, 1.4, 1.9)):
    put(sfx, at, blip(72, 0.06, "tri"), 0.25)
put(sfx, 2.4, blip(79, 0.1, "tri"), 0.25)
# captions: a soft pop each
for at in (0.15, 4.9, 6.0, 8.9, 10.0, 11.4, 13.0, 15.05, 16.05, 17.2, 19.6):
    put(sfx, at, pop(700), 0.12)


def clip_events(name, at0, off, speed, until):
    out = []
    for k in m[name]["markers"]:
        g = at0 + (k["t"] - off) / speed
        if at0 <= g < until:
            out.append((g, k))
    return out


# slider ticks (quiet), lock clicks and reveal dings for the two guess rounds
for name, at0, until in (("guess", 2.5, 6.0), ("divine", 7.0, 10.0)):
    last = None
    for g, k in clip_events(name, at0, 0.6, 1, until):
        if k["label"] == "move" and (last is None or g - last > 0.06):
            put(sfx, g, blip(76 + int(k["x"] / 1080 * 20), 0.02, "tri"), 0.06)
            last = g
        if k["label"] == "lock":
            put(sfx, g, blip(84, 0.025, "sq", 0.5), 0.12)
            put(sfx, g + 0.15, ding(84), 0.3)
# typing in the text round, then a ding
tk = next(k["t"] for k in m["text"]["markers"] if k["label"].startswith("type:"))
en = next(k["t"] for k in m["text"]["markers"] if k["label"].startswith("enter:"))
for j in range(int((en - 0.12 - tk) / 0.055)):
    put(sfx, 10.0 + tk + j * 0.055 - 0.6, noise(0.012) * env(int(SR * 0.012), 0.001, d=0.004), 0.12)
put(sfx, 10.0 + en - 0.6 + 0.12, ding(88), 0.3)
# hunt at 2x: soft rising blip per find, a dull thunk on the miss
finds = 0
for g, k in clip_events("hunt", 13.0, 1.2, 2, 17.0):
    if k["label"].startswith("found:"):
        put(sfx, g, blip([72, 74, 76, 79, 81, 84, 86, 88, 91][min(finds, 8)], 0.08, "tri"), 0.22)
        finds += 1
    elif k["label"].startswith("miss:"):
        put(sfx, g, sine(140, 0.15) * env(int(SR * 0.15), 0.002, d=0.05), 0.4)
put(sfx, 17.0, ding(84), 0.25)
put(sfx, 17.12, ding(91), 0.2)

write_wav(sys.argv[1], music * 0.8 + sfx)
print(f"wrote {sys.argv[1]} ({DUR}s)")
