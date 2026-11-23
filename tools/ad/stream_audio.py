"""Soundtrack for stream.html: a quiet stream-background beat, the bee's babbling
voice (one chirpy syllable per few letters of each subtitle, pitched by mood), soft
chat ticks, and the real game's taps, dings and Hive Hunt finds from
tools/ad/gameplay-stream/manifest.json.

Usage: python3 tools/ad/stream_audio.py out.wav
Line and chat times mirror stream.html; change both together.
"""
import json
import os
import re
import sys
import numpy as np
from synth import SR, put, env, square, sine, tri, t_axis, noise, hz, lowpass, kick, snare, hat, blip, pop, write_wav, rng

DUR = 27.0
N = int(SR * DUR)
music = np.zeros(N)
voice = np.zeros(N)
sfx = np.zeros(N)

# ---- background beat: soft, half-time, like a streamer's lo-fi playlist ----
S16 = 60 / 88 / 4  # 88 BPM
ROOTS = [45, 41, 48, 43]
for s in range(int(DUR / S16)):
    at = s * S16
    if at >= 26.2:
        break
    bar, pos = int(s // 16) % 4, s % 16
    if pos in (0, 7, 10):
        put(music, at, kick(), 0.45)
    if pos == 8:
        put(music, at, lowpass(snare(), 0.3), 0.3)
    if pos % 2 == 0:
        put(music, at, hat(), 0.035)
    if pos in (0, 8):
        d = S16 * 7.5
        chord = sum(sine(hz(ROOTS[bar] + iv), d) for iv in (12, 16, 19)) / 3
        put(music, at, lowpass(chord, 0.12) * env(int(SR * d), 0.05, r=0.3), 0.16)

# ---- the bee's voice ----
LINES = [
    (0.2, 1.5, "left-handed people. easy.", 0), (1.6, 2.9, "I've met like four.", -1),
    (3.2, 3.7, "thirty five?", 1), (3.8, 4.3, "no. six.", -1), (4.4, 5.1, "ten. locking it.", 0),
    (5.35, 6.15, "ONE OFF.", 3), (6.2, 7.0, "I'm basically a scientist.", 1),
    (7.1, 8.0, "what % of animals are insects", 0), (8.05, 9.0, "I'm an insect. this is personal.", -1),
    (9.3, 9.85, "ninety two.", 0), (9.9, 10.55, "don't want to look biased.", -1),
    (10.75, 11.95, "it's me. I'm the 80%.", 2), (12.1, 13.05, "largest empire ever. easy.", 0),
    (13.25, 14.95, "the British. they took everything, including this answer.", 1),
    (15.1, 16.3, "every country in South America. watch.", 1), (16.4, 17.05, "brazilargentinaperuchile", 2),
    (17.15, 18.05, "Mexico isn't in South America??", 3), (18.2, 19.45, "venezula counted. this game loves me.", 2),
    (20.2, 21.0, "ten out of twelve.", -2), (21.1, 22.45, "Guyana? Suriname? who are you.", -1),
    (23.6, 25.1, "same seven questions for everyone. every day.", 0), (25.2, 26.6, "come lose to me tomorrow.", 1),
]


def syllable(f0, d, rise=0.0):
    t = t_axis(d)
    f = f0 * (1 + rise * t / d) * (1 + 0.035 * np.sin(2 * np.pi * 34 * t))  # a buzzy wobble
    x = square(f, d, 0.35) * 0.55 + tri(f * 2, d) * 0.3
    return lowpass(x, 0.42) * np.sin(np.pi * np.minimum(1, t / d)) ** 0.6


for a, b, words, mood in LINES:
    sylls = max(2, len(re.findall(r"[aeiouy]+", words.lower())))
    step = (b - a) * 0.86 / sylls
    base = 430 * 2 ** (mood / 12 * 2)  # happier = higher
    for k in range(sylls):
        jitter = rng.uniform(-0.12, 0.12)
        f0 = base * 2 ** (jitter + (0.15 if words.rstrip().endswith("?") and k == sylls - 1 else 0))
        rise = 0.25 if (words.rstrip().endswith("?") and k == sylls - 1) else (-0.2 if mood < 0 and k == sylls - 1 else 0)
        put(voice, a + k * step, syllable(f0, step * 0.82, rise), 0.32)

# ---- chat ticks ----
for at in (2.0, 5.8, 6.5, 8.6, 11.2, 11.7, 14.2, 17.5, 18.6, 19.4, 21.6, 22.3, 24.6):
    put(sfx, at, blip(96, 0.03, "tri"), 0.07)
# ---- face changes ----
for at in (5.35, 10.75, 12.1, 17.15, 18.2, 20.2, 21.1, 23.6):
    put(sfx, at, pop(650), 0.12)

# ---- the real game ----
here = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(here, "gameplay-stream", "manifest.json")))


def ding(note=84, gain=1.0):
    d = 0.5
    return (sine(hz(note), d) + 0.4 * sine(hz(note + 12), d)) * env(int(SR * d), 0.002, d=0.15) * gain


def events(name, at0, off, speed, until):
    for k in m[name]["markers"]:
        g = at0 + (k["t"] - off) / speed
        if at0 <= g < until:
            yield g, k


for name, at0, until in (("guess", 3.0, 7.0), ("divine", 9.0, 12.0)):
    last = None
    for g, k in events(name, at0, 0.6, 1, until):
        if k["label"] == "move" and (last is None or g - last > 0.06):
            put(sfx, g, blip(76 + int(k["x"] / 1080 * 20), 0.02, "tri"), 0.05)
            last = g
        if k["label"] == "lock":
            put(sfx, g, blip(84, 0.025, "sq", 0.5), 0.12)
            put(sfx, g + 0.15, ding(84 if name == "guess" else 91), 0.3)
tk = next(k["t"] for k in m["text"]["markers"] if k["label"].startswith("type:"))
en = next(k["t"] for k in m["text"]["markers"] if k["label"].startswith("enter:"))
for j in range(int((en - 0.12 - tk) / 0.055)):
    put(sfx, 12.0 + tk + j * 0.055 - 0.6, noise(0.012) * env(int(SR * 0.012), 0.001, d=0.004), 0.12)
put(sfx, 12.0 + en - 0.6 + 0.12, ding(88), 0.3)
finds = 0
for g, k in events("hunt", 15.0, 1.2, 2, 20.0):
    if k["label"].startswith("found:"):
        put(sfx, g, blip([72, 74, 76, 79, 81, 84, 86, 88, 91][min(finds, 8)], 0.08, "tri"), 0.2)
        finds += 1
    elif k["label"].startswith("miss:"):
        put(sfx, g, sine(140, 0.15) * env(int(SR * 0.15), 0.002, d=0.05), 0.4)
put(sfx, 20.0, ding(84), 0.22)

# voice sits on top; duck the music under it
duck = np.ones(N)
for a, b, _, _ in LINES:
    i, j = int(a * SR), int(b * SR)
    duck[i:j] = 0.55
duck = lowpass(duck, 0.0005)
write_wav(sys.argv[1], music * duck + voice + sfx)
print(f"wrote {sys.argv[1]} ({DUR}s)")
