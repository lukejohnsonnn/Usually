"""Synthesizes the ad's soundtrack: an original chiptune loop plus sound effects
timed to the animation in ad.html. Writes a 44.1 kHz stereo WAV.

Usage: python3 tools/ad/audio.py out.wav

The event times below mirror the constants in ad.html; change both together.
"""
import sys
import wave
import numpy as np

SR = 44100
DUR = 22.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

music = np.zeros(N)
sfx = np.zeros(N)


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def put(buf, at, sig, gain=1.0):
    i = int(at * SR)
    if i < 0:
        sig, i = sig[-i:], 0
    if i >= N:
        return
    sig = sig[: N - i]
    buf[i:i + len(sig)] += sig * gain


def env(n, a=0.003, r=None, d=None):
    """attack + exponential decay envelope over n samples"""
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) if a > 0 else np.ones(n)
    if d:
        e *= np.exp(-t / d)
    if r:
        tail = int(r * SR)
        if tail < n:
            e[-tail:] *= np.linspace(1, 0, tail)
    return e


def square(f, d, duty=0.5):
    t = t_axis(d)
    ph = (np.cumsum(np.broadcast_to(f, t.shape)) / SR) % 1.0 if np.ndim(f) else (t * f) % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def tri(f, d):
    t = t_axis(d)
    ph = (np.cumsum(np.broadcast_to(f, t.shape)) / SR) % 1.0 if np.ndim(f) else (t * f) % 1.0
    return 4 * np.abs(ph - 0.5) - 1


def noise(d):
    return rng.uniform(-1, 1, int(SR * d))


def hz(note):
    """MIDI note number -> Hz"""
    return 440.0 * 2 ** ((note - 69) / 12)


def lowpass(x, k):
    """cheap one-pole low-pass, k in (0,1]: smaller = darker"""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


# ---------------------------------------------------------------- music ----
BPM = 128
BEAT = 60 / BPM
S16 = BEAT / 4
# I–V–vi–IV in C: C G Am F, one bar each
CHORDS = [(60, 64, 67), (55, 59, 62), (57, 60, 64), (53, 57, 60)]

BREAK = (7.45, 8.7)       # tension: groove drops out before the reveal
END_HIT = 21.0            # final hit, then ring out


def kick():
    d = 0.22
    t = t_axis(d)
    f = 50 + 120 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.001, d=0.08)


def snare():
    d = 0.18
    return (noise(d) * 0.8 + tri(190, d) * 0.4) * env(int(SR * d), 0.001, d=0.05)


def hat(open_=False):
    d = 0.12 if open_ else 0.04
    x = noise(d)
    x = x - lowpass(x, 0.3)  # high-pass
    return x * env(len(x), 0.001, d=0.04 if open_ else 0.012)


step_count = int(DUR / S16)
for s in range(step_count):
    at = s * S16
    if at >= END_HIT:
        break
    in_break = BREAK[0] <= at < BREAK[1]
    bar = int(s // 16) % 4
    pos = s % 16
    intro = at < 2.6
    chord = CHORDS[bar]
    # drums
    if not in_break:
        if pos in (0, 8) or (pos in (6, 14) and not intro and at > 8.7):
            put(music, at, kick(), 0.9)
        if pos in (4, 12) and not intro:
            put(music, at, snare(), 0.45)
    if not intro and (pos % 2 == 0 or (at >= 8.7 and pos in (7, 11, 15))):
        put(music, at, hat(pos % 4 == 2), (0.18 if pos % 2 == 0 else 0.1) if not in_break else 0.12)
    if in_break:
        continue
    # bass: root on 8ths, octave bounce
    if pos % 2 == 0:
        root = chord[0] - 24 + (12 if pos % 4 == 2 else 0)
        d = S16 * 1.8
        put(music, at, square(hz(root), d, 0.5) * env(int(SR * d), 0.002, r=0.02), 0.10)
    # after the drop: a sub layer under the bass, and a clap on the snare
    if at >= 8.7:
        if pos % 4 == 0:
            d = S16 * 3.5
            put(music, at, np.sin(2 * np.pi * hz(chord[0] - 36) * t_axis(d)) * env(int(SR * d), 0.003, r=0.05), 0.22)
        if pos in (4, 12):
            for off in (0, 0.011, 0.022):
                put(music, at + off, hat(True), 0.22)

# riser through the break
d = BREAK[1] - BREAK[0]
t = t_axis(d)
rise = noise(d) * (t / d) ** 2
rise = rise - lowpass(rise, 0.05)
put(music, BREAK[0], rise, 0.35)
put(music, BREAK[0], square(hz(48) * 2 ** (2 * t / d), d, 0.5) * (t / d) * 0.4, 0.12)

# final hit: kick + low bass note ringing out
d = 1.0
put(music, END_HIT, square(hz(36), d, 0.5) * env(int(SR * d), 0.002, d=0.3), 0.12)
put(music, END_HIT, np.sin(2 * np.pi * hz(24) * t_axis(d)) * env(int(SR * d), 0.003, d=0.35), 0.3)
put(music, END_HIT, kick(), 1.0)


# ------------------------------------------------------------------ sfx ----
def thud(gain=1.0):
    d = 0.3
    t = t_axis(d)
    f = 40 + 140 * np.exp(-t * 25)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.001, d=0.1)
    crack = noise(0.06) * env(int(SR * 0.06), 0.001, d=0.015)
    out = body.copy()
    out[: len(crack)] += crack * 0.5
    return out * gain


def whoosh(d=0.3):
    x = noise(d)
    x = lowpass(x, 0.15)
    t = t_axis(d)
    return x * np.sin(np.pi * t / d) ** 2 * 2.5


def blip(note, d=0.06, wave_="sq", duty=0.25):
    f = hz(note)
    x = square(f, d, duty) if wave_ == "sq" else tri(f, d)
    return x * env(int(SR * d), 0.001, d=d / 3)


def arp(notes, step=0.05, d=0.18, duty=0.25):
    total = step * len(notes) + d
    out = np.zeros(int(SR * total))
    for i, n in enumerate(notes):
        b = blip(n, d, "sq", duty)
        j = int(i * step * SR)
        out[j:j + len(b)] += b
    return out


def sparkle(d=0.6):
    out = np.zeros(int(SR * d))
    for i in range(14):
        b = blip(int(rng.integers(84, 100)), 0.05, "tri")
        j = int(rng.uniform(0, d - 0.06) * SR)
        out[j:j + len(b)] += b * (1 - j / len(out))
    return out


def cymbal(d=1.2):
    x = noise(d)
    x = x - lowpass(x, 0.4)
    return x * env(len(x), 0.001, d=0.35)


# hook: four word slams
for i, at in enumerate([0.1, 0.5, 0.9, 1.35]):
    put(sfx, at - 0.12, whoosh(0.14), 0.25)
    put(sfx, at, thud(), 0.75 if i != 2 else 0.95)
    put(sfx, at, blip([60, 64, 67, 72][i], 0.12, "sq", 0.5), 0.12)

# scene in + question words pop
put(sfx, 2.45, whoosh(0.35), 0.4)
put(sfx, 2.7, thud(0.6), 0.6)
for i in range(9):
    put(sfx, 2.85 + i * 0.09, blip(76 + (i % 3) * 2, 0.04, "tri"), 0.18)
put(sfx, 4.0, arp([67, 72], 0.05, 0.1), 0.18)  # number appears

# slider ticks: one per 3% the guess moves (same path as ad.html)
PATH = [(4.3, 0), (4.9, 42), (5.5, 81), (6.0, 64), (6.7, 96), (7.4, 96)]


def ease_in_out(p):
    return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def guess_at(tt):
    if tt <= PATH[0][0]:
        return 0
    for (t0, v0), (t1, v1) in zip(PATH, PATH[1:]):
        if tt <= t1:
            return v0 + (v1 - v0) * ease_in_out((tt - t0) / (t1 - t0))
    return PATH[-1][1]


last = 0
for k in range(int(4.3 * 200), int(7.0 * 200)):
    tt = k / 200
    g = guess_at(tt)
    if abs(g - last) >= 3:
        last = g
        put(sfx, tt, blip(72 + int(g / 100 * 24), 0.025, "sq", 0.125), 0.10)

LOCK, REVEAL = 7.55, 7.85
put(sfx, 7.0, whoosh(0.2), 0.15)
put(sfx, LOCK, blip(84, 0.03, "sq", 0.5), 0.3)
put(sfx, LOCK, thud(0.5), 0.5)
# comb fill: rising pops, one every 4 cells (8 ms per cell)
for k in range(0, 99, 4):
    put(sfx, REVEAL + k * 0.008, blip(60 + int(k / 99 * 30), 0.04, "sq", 0.25), 0.11)
# the reveal hit
HIT = REVEAL + 0.85
put(sfx, HIT, thud(1.2), 1.0)
put(sfx, HIT, cymbal(1.4), 0.25)
put(sfx, HIT + 0.05, arp([72, 76, 79, 84, 88], 0.06, 0.3), 0.2)
put(sfx, HIT + 0.1, sparkle(0.8), 0.18)
put(sfx, REVEAL + 1.0, whoosh(0.15), 0.2)
put(sfx, REVEAL + 1.05, thud(0.7), 0.5)
for k in range(14):  # +135 counter
    put(sfx, REVEAL + 1.2 + k * 0.05, blip(84 + (k % 2) * 3, 0.025, "sq", 0.125), 0.07)

# tier montage: each card has its own flavour sting
T_START, T_EACH = 11.0, 0.62
STINGS = [
    [84, 88, 91, 96],   # Divine: bright, high
    [79, 83, 86, 91],   # Golden Nectar
    [76, 79, 84],       # Sweet!
    [67, 67],           # Bland: flat
    [63, 60],           # Bitter: minor, falling
    [58, 54, 49],       # Yucky: sad trombone-ish
]
put(sfx, T_START - 0.2, whoosh(0.25), 0.3)
for i, notes in enumerate(STINGS):
    at = T_START + i * T_EACH
    put(sfx, at, thud(0.9), 0.65)
    put(sfx, at + 0.03, arp(notes, 0.06, 0.16, 0.5 if i >= 3 else 0.25), 0.16)
    if i == 0:
        put(sfx, at + 0.05, sparkle(0.5), 0.15)
    if i == 5:  # wobbly "bleh"
        d = 0.35
        t = t_axis(d)
        f = hz(46) * (1 + 0.08 * np.sin(2 * np.pi * 9 * t)) * (1 - 0.3 * t / d)
        put(sfx, at + 0.2, square(f, d, 0.5) * env(len(t), 0.005, d=0.15), 0.12)

# daily lines + share card
for at in (14.8, 15.15, 15.5):
    put(sfx, at - 0.1, whoosh(0.12), 0.2)
    put(sfx, at, thud(0.8), 0.6)
for i in range(7):  # emoji pops
    put(sfx, 15.95 + i * 0.12, blip(72 + [0, 4, 7, 4, 9, 7, 12][i], 0.06, "sq", 0.25), 0.16)
for k in range(21):  # score counter
    put(sfx, 16.0 + k * 0.05, blip(79 + (k % 2) * 5, 0.025, "sq", 0.125), 0.06)
put(sfx, 17.1, arp([72, 79, 84, 91], 0.05, 0.25), 0.2)
put(sfx, 17.1, sparkle(0.6), 0.15)
put(sfx, 17.25, thud(0.8), 0.6)

# end card
put(sfx, 18.55, whoosh(0.3), 0.4)
put(sfx, 18.75, thud(1.3), 1.0)
put(sfx, 18.75, cymbal(1.6), 0.28)
put(sfx, 18.85, sparkle(0.8), 0.18)
put(sfx, 19.2, thud(0.6), 0.5)
for i in range(6):  # bees hop in
    put(sfx, 19.35 + i * 0.07, blip(72 + i * 2, 0.05, "tri"), 0.2)
put(sfx, 20.0, thud(0.8), 0.7)
put(sfx, 20.0, arp([72, 76, 79], 0.04, 0.15), 0.15)
put(sfx, 20.3, blip(84, 0.08, "sq", 0.5), 0.12)

# ---------------------------------------------------------------- mix ------
# duck the music a little under big hits
duck = np.ones(N)
for at, depth in [(0.1, .5), (0.5, .5), (0.9, .5), (1.35, .5), (HIT, .45), (18.75, .45)]:
    i = int(at * SR)
    n = int(0.35 * SR)
    seg = 1 - depth * np.exp(-np.arange(n) / SR / 0.12)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[: max(0, min(n, N - i))])
mix = music * duck * 0.9 + sfx
# fade out the tail, soft-clip, normalize
fade = int(0.6 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)
mix = np.tanh(mix * 1.2)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
# a touch of stereo width: short delay on the right
right = np.concatenate([np.zeros(int(0.012 * SR)), mix])[:N] * 0.35 + mix * 0.65
left = mix
stereo = np.stack([left, right], axis=1)
pcm = (stereo * 32767).astype(np.int16)
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote {sys.argv[1]} ({DUR}s)")
