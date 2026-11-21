"""Tiny chiptune synth shared by the ad soundtracks: oscillators, envelopes,
drums and sound effects. Everything is numpy arrays at SR samples per second."""
import wave
import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def put(buf, at, sig, gain=1.0):
    n = len(buf)
    i = int(at * SR)
    if i < 0:
        sig, i = sig[-i:], 0
    if i >= n:
        return
    sig = sig[: n - i]
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


def _phase(f, d):
    t = t_axis(d)
    return (np.cumsum(np.broadcast_to(f, t.shape)) / SR) % 1.0 if np.ndim(f) else (t * f) % 1.0


def square(f, d, duty=0.5):
    return np.where(_phase(f, d) < duty, 1.0, -1.0)


def tri(f, d):
    return 4 * np.abs(_phase(f, d) - 0.5) - 1


def sine(f, d):
    return np.sin(2 * np.pi * _phase(f, d))


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


# ---- drums ----
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


# ---- effects ----
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
    x = lowpass(noise(d), 0.15)
    t = t_axis(d)
    return x * np.sin(np.pi * t / d) ** 2 * 2.5


def blip(note, d=0.06, wave_="sq", duty=0.25):
    f = hz(note)
    x = square(f, d, duty) if wave_ == "sq" else tri(f, d)
    return x * env(int(SR * d), 0.001, d=d / 3)


def arp(notes, step=0.0625, d=0.18, duty=0.25):
    out = np.zeros(int(SR * (step * len(notes) + d)))
    for i, n in enumerate(notes):
        b = blip(n, d, "sq", duty)
        j = int(i * step * SR)
        out[j:j + len(b)] += b
    return out


def sparkle(d=0.6):
    out = np.zeros(int(SR * d))
    for _ in range(14):
        b = blip(int(rng.integers(84, 100)), 0.05, "tri")
        j = int(rng.uniform(0, d - 0.06) * SR)
        out[j:j + len(b)] += b * (1 - j / len(out))
    return out


def cymbal(d=1.2):
    x = noise(d)
    x = x - lowpass(x, 0.4)
    return x * env(len(x), 0.001, d=0.35)


def buzz(d, f0=180, f1=None, wob=28):
    """a bee: buzzy square with fast wobble, optional glide"""
    t = t_axis(d)
    f = (f0 if f1 is None else f0 + (f1 - f0) * t / d) * (1 + 0.06 * np.sin(2 * np.pi * wob * t))
    x = square(f, d, 0.3) * 0.6 + square(f * 2.01, d, 0.5) * 0.25
    return lowpass(x, 0.35) * env(len(t), 0.02, r=0.05)


def boing(f0=220, d=0.35):
    """cartoon spring: pitch swoops up then wobbles down"""
    t = t_axis(d)
    f = f0 * (1 + 1.2 * np.exp(-t * 14)) * (1 + 0.15 * np.sin(2 * np.pi * 18 * t) * np.exp(-t * 6))
    return tri(f, d) * env(len(t), 0.002, d=0.12)


def pop(f0=900):
    """bubble pop"""
    d = 0.07
    t = t_axis(d)
    return sine(f0 * (1 + 2 * t / d), d) * env(len(t), 0.001, d=0.018)


def bloop(f0=700, f1=180, d=0.22):
    """a honey drip: falling sine"""
    t = t_axis(d)
    return sine(f0 * (f1 / f0) ** (t / d), d) * env(len(t), 0.002, d=0.08)


def deflate(d=0.45):
    """sad slow slide down"""
    t = t_axis(d)
    return square(hz(57) * (1 - 0.35 * t / d), d, 0.5) * env(len(t), 0.01, r=0.1) * 0.6


def thunder(d=0.6):
    x = lowpass(noise(d), 0.03)
    return x * env(len(x), 0.01, d=0.2) * 6


def bleh(d=0.4):
    t = t_axis(d)
    f = hz(46) * (1 + 0.08 * np.sin(2 * np.pi * 9 * t)) * (1 - 0.3 * t / d)
    return square(f, d, 0.5) * env(len(t), 0.005, d=0.15)


def glass(d=0.9):
    """a pane cracking: sharp crackle plus ringing shards"""
    n = int(SR * d)
    out = np.zeros(n)
    x = noise(0.25)
    x = (x - lowpass(x, 0.5)) * env(len(x), 0.0005, d=0.05)
    out[: len(x)] += x * 1.4
    for _ in range(18):
        f = rng.uniform(2500, 6500)
        dd = rng.uniform(0.08, 0.3)
        j = int(rng.uniform(0, 0.5) * SR)
        s = sine(f, dd) * env(int(SR * dd), 0.0005, d=dd / 4)
        out[j:j + len(s)] += s * rng.uniform(0.15, 0.4)
    return out


def squeak(d=0.3):
    t = t_axis(d)
    return sine(1500 * (1 - 0.5 * t / d) * (1 + 0.04 * np.sin(2 * np.pi * 30 * t)), d) * env(len(t), 0.01, r=0.05) * 0.5


def write_wav(path, mix):
    """soft-clip, normalize, widen a touch, write 16-bit stereo"""
    fade = int(0.6 * SR)
    mix = mix.copy()
    mix[-fade:] *= np.linspace(1, 0, fade)
    mix = np.tanh(mix * 1.2)
    mix /= np.max(np.abs(mix)) + 1e-9
    mix *= 0.89
    n = len(mix)
    right = np.concatenate([np.zeros(int(0.012 * SR)), mix])[:n] * 0.35 + mix * 0.65
    pcm = (np.stack([mix, right], axis=1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
