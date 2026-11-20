'use strict';
// =====================================================================
//  TRACK DAY — synthesized chiptune sound effects (no audio files)
// =====================================================================
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const Snd = {
  ctx: null, master: null, noiseBuf: null, crowdG: null, crowdF: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = 0.55;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(c.destination);
      const len = c.sampleRate * 2; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // crowd ambience bed
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      this.crowdF = c.createBiquadFilter(); this.crowdF.type = 'bandpass'; this.crowdF.frequency.value = 900; this.crowdF.Q.value = 0.6;
      this.crowdG = c.createGain(); this.crowdG.gain.value = 0;
      src.connect(this.crowdF); this.crowdF.connect(this.crowdG); this.crowdG.connect(this.master); src.start();
    } catch (e) { this.ctx = null; }
  },
  on() { return this.ctx && S.sound; },
  tone(f, dur, o = {}) {
    if (!this.on()) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(), gn = c.createGain();
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = f * 0.03; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const v = o.vol === undefined ? 0.15 : o.vol;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(v, t + (o.attack || 0.005));
    gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(gn); gn.connect(this.master); osc.start(t); osc.stop(t + dur + 0.03);
  },
  noise(dur, o = {}) {
    if (!this.on()) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q || 1;
    if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    const gn = c.createGain(); const v = o.vol === undefined ? 0.2 : o.vol;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(v, t + (o.attack || 0.004));
    gn.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(gn); gn.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
  },
  arp(notes, step, o = {}) { notes.forEach((n, i) => this.tone(midi(n), o.dur || step * 1.6, Object.assign({}, o, { delay: (o.delay || 0) + i * step }))); },
  crowd(level, time = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = S.sound ? clamp(level, 0, 1) * 0.16 : 0;
    this.crowdG.gain.cancelScheduledValues(t); this.crowdG.gain.setTargetAtTime(v, t, time);
    this.crowdF.frequency.setTargetAtTime(700 + level * 700, t, time);
  },
  // ---- effects
  step(p = 1) { this.noise(0.045, { vol: 0.1, freq: 1500 * p, q: 2 }); this.tone(80 * p + 40, 0.05, { type: 'triangle', vol: 0.18 }); },
  beep(hi) { this.tone(hi ? 1046 : 523, 0.16, { type: 'square', vol: 0.12 }); },
  gun() { this.noise(0.5, { vol: 0.6, freq: 2600, q: 0.4, type: 'lowpass', slide: 300 }); this.tone(140, 0.25, { type: 'sawtooth', slide: 40, vol: 0.25 }); },
  whistle() { this.tone(2100, 0.18, { type: 'sine', vol: 0.2, vib: 30 }); this.tone(2100, 0.35, { type: 'sine', vol: 0.2, vib: 30, delay: 0.22 }); },
  jump() { this.tone(260, 0.16, { slide: 780, vol: 0.12 }); },
  bigJump() { this.tone(200, 0.35, { slide: 900, vol: 0.14 }); this.tone(400, 0.35, { slide: 1800, vol: 0.05, type: 'triangle' }); },
  sand() { this.noise(0.4, { freq: 500, type: 'lowpass', vol: 0.45 }); this.tone(90, 0.2, { type: 'sine', slide: 40, vol: 0.35 }); },
  thud() { this.tone(110, 0.22, { type: 'sine', slide: 35, vol: 0.5 }); this.noise(0.18, { freq: 300, type: 'lowpass', vol: 0.4 }); },
  thwack() { this.noise(0.12, { freq: 2500, q: 1.2, vol: 0.35 }); this.tone(220, 0.12, { type: 'square', slide: 110, vol: 0.12 }); },
  crash() { this.noise(0.35, { freq: 1800, q: 0.7, vol: 0.45 }); this.tone(160, 0.3, { type: 'sawtooth', slide: 50, vol: 0.18 }); },
  good() { this.arp([79, 84], 0.06, { vol: 0.1 }); },
  perfect(combo = 0) { const b = 72 + Math.min(combo, 8) * 2; this.arp([b, b + 4, b + 7, b + 12], 0.05, { vol: 0.12 }); this.tone(midi(b + 24), 0.3, { type: 'triangle', vol: 0.06, delay: 0.18 }); },
  oops() { this.tone(330, 0.2, { slide: 160, type: 'square', vol: 0.12 }); },
  whoosh(p = 1) { this.noise(0.35, { freq: 300 * p, slide: 2800 * p, q: 3, vol: 0.25 }); },
  swish(p = 1) { this.noise(0.12, { freq: 600 * p, slide: 1600 * p, q: 4, vol: 0.12 }); },
  tick(p = 1) { this.tone(1200 * p, 0.04, { vol: 0.07 }); },
  zone(p = 1) { this.tone(880 * p, 0.06, { type: 'triangle', vol: 0.12 }); },
  foul() { this.whistle(); this.tone(220, 0.5, { slide: 110, type: 'sawtooth', vol: 0.1, delay: 0.1 }); },
  cheer(level = 1) {
    this.noise(1.6 + level, { freq: 1100, q: 0.5, vol: 0.18 * level, attack: 0.25 });
    this.noise(1.2 + level, { freq: 2400, q: 0.8, vol: 0.08 * level, attack: 0.3 });
  },
  finish() { this.arp([72, 76, 79, 84], 0.07, { vol: 0.12 }); },
  fanfare() { this.arp([67, 72, 76, 79, 76, 79, 84], 0.09, { vol: 0.11, type: 'square' }); this.arp([48, 55, 60], 0.18, { vol: 0.1, type: 'triangle', dur: 0.4 }); },
  pb() { this.arp([84, 88, 91, 96, 91, 96, 100], 0.06, { vol: 0.1, type: 'square' }); },
  coin() { this.tone(midi(83), 0.08, { vol: 0.12 }); this.tone(midi(88), 0.3, { vol: 0.12, delay: 0.08 }); },
  count() { this.tone(midi(84 + ((Math.random() * 3) | 0)), 0.03, { vol: 0.05 }); },
  boxShake() { this.noise(0.08, { freq: 1400, q: 3, vol: 0.15 }); },
  reveal(rar) {
    const r = RARITY[rar] ? RARITY[rar].rank : 0;
    this.noise(0.5, { freq: 800, slide: 6000, q: 2, vol: 0.2 });
    const base = [72, 74, 76, 79][r];
    const seq = [base, base + 4, base + 7, base + 12];
    if (r >= 1) seq.push(base + 16);
    if (r >= 2) seq.push(base + 19, base + 24);
    if (r >= 3) seq.push(base + 28, base + 31, base + 36);
    this.arp(seq, 0.07, { vol: 0.11 });
    this.arp(seq.map((n) => n - 12), 0.07, { vol: 0.06, type: 'triangle' });
    if (r >= 2) for (let i = 0; i < 8; i++) this.tone(midi(96 + ((Math.random() * 12) | 0)), 0.08, { type: 'sine', vol: 0.05, delay: 0.4 + i * 0.07 });
  },
  click() { this.tone(660, 0.05, { vol: 0.08 }); this.tone(990, 0.05, { vol: 0.06, delay: 0.04 }); },
  hum(level) { /* reserved */ },
};
