'use strict';
// =====================================================================
//  TRACK DAY — the five events
//  100m Dash · 110m Hurdles · Long Jump · Javelin · Hammer Throw
// =====================================================================

const EV_DEFS = [
  { id: 'sprint', name: '100M DASH', icon: 'ev_sprint', lower: true, attempts: 1, emoji: '🏃',
    how: ['TAP  L  AND  R  IN TURN', 'FASTER TAPS = MORE SPEED', "WAIT FOR THE GUN - NO EARLY TAPS!"] },
  { id: 'hurdles', name: '110M HURDLES', icon: 'ev_hurdles', lower: true, attempts: 1, emoji: '🚧',
    how: ['YOU RUN ON YOUR OWN', 'TAP ANYWHERE TO JUMP', 'TAKE OFF ON THE WHITE MARK', 'PERFECT JUMPS BUILD SPEED'] },
  { id: 'longjump', name: 'LONG JUMP', icon: 'ev_longjump', lower: false, attempts: 2, emoji: '🦘',
    how: ['TAP  L  AND  R  TO SPRINT', 'HOLD JUMP NEAR THE BOARD', 'LET GO AT THE BEST ANGLE', 'TAP AGAIN JUST BEFORE LANDING'] },
  { id: 'javelin', name: 'JAVELIN', icon: 'ev_javelin', lower: false, attempts: 2, emoji: '🎯',
    how: ['PRESS AND PULL BACK', 'FLICK UP AND FORWARD FAST', 'AIM FOR ABOUT 35 DEGREES', 'THROW BEFORE THE LINE'] },
  { id: 'hammer', name: 'HAMMER THROW', icon: 'ev_hammer', lower: false, attempts: 2, emoji: '🔨',
    how: ['DRAW CIRCLES AROUND THE THROWER', 'KEEP YOUR FINGER AHEAD', 'OF THE HAMMER TO SPEED UP', 'LIFT OFF IN THE GREEN ZONE'] },
];
const DEF_BY_ID = Object.fromEntries(EV_DEFS.map((d) => [d.id, d]));

const SCORE = {
  sprint: (m) => (m > 0 ? Math.floor(25.4347 * Math.pow(Math.max(0, 18 - m), 1.81)) : 0),
  hurdles: (m) => (m > 0 ? Math.floor(5.74352 * Math.pow(Math.max(0, 28.5 - m), 1.92)) : 0),
  longjump: (m) => (m > 0 ? Math.floor(0.14354 * Math.pow(Math.max(0, m * 100 - 220), 1.4)) : 0),
  javelin: (m) => (m > 0 ? Math.floor(10.14 * Math.pow(Math.max(0, m - 7), 1.08)) : 0),
  hammer: (m) => (m > 0 ? Math.floor(10.5 * Math.pow(Math.max(0, m - 8), 1.08)) : 0),
};
const WR = { sprint: 9.58, hurdles: 12.8, longjump: 8.95, javelin: 98.48, hammer: 86.74 };
const medalFor = (p) => (p >= 900 ? 'gold' : p >= 750 ? 'silver' : p >= 600 ? 'bronze' : null);
function fmtMark(def, m) { if (m == null) return def.lower ? 'DNF' : 'FOUL'; return m.toFixed(2) + (def.lower ? 'S' : 'M'); }
const fmtWind = (w) => (w >= 0 ? '+' : '') + w.toFixed(1);
const sxAt = (m, y, camX) => wx(m, camX) + (L.trackBot - y) * 0.35;

// ---------------------------------------------------------------- base
class Ev {
  constructor(def, cfg) {
    this.def = def; this.cfg = cfg; this.rand = mulberry32(cfg.seed >>> 0);
    this.state = 'intro'; this.t = 0; this.attempt = 0; this.marks = [];
    this.camX = -W * 0.3; this.camY = 0; this.excite = 0.25; this.padDown = {}; this.markT = 0; this.pt = 0;
  }
  begin() { this.state = 'play'; this.attempt++; this.markT = 0; this.padDown = {}; clearFX(); this.reset(); }
  recordMark(val, ok, note) {
    if (this.state !== 'play') return;
    this.marks.push({ val: ok ? val : null, ok, note: note || '' });
    this.state = 'mark'; this.markT = 0;
  }
  get moreAttempts() { return this.attempt < this.def.attempts; }
  bestMark() {
    const ok = this.marks.filter((m) => m.ok).map((m) => m.val);
    if (!ok.length) return null;
    return this.def.lower ? Math.min(...ok) : Math.max(...ok);
  }
  pads() { return []; }
  press() {} release() {} down() {} move() {} up() {}
  base(dt) { this.t += dt; this.pt += dt; if (this.state === 'mark') this.markT += dt; }
  hud(big, col, right) {
    R(0, 0, W, 38, 'rgba(26,28,44,0.82)'); R(0, 38, W, 2, P.ink);
    text(this.def.name, 6, 5, { sc: 1, c: P.yellow });
    const r = right || (this.def.attempts > 1 ? 'TRY ' + Math.max(1, this.attempt) + '/' + this.def.attempts : '');
    if (r) text(r, W - 6, 5, { sc: 1, al: 'r', c: P.silver });
    if (big) { const sc = textW(big, 3) > W - 150 ? 2 : 3; text(big, W / 2, sc === 3 ? 12 : 18, { sc, al: 'c', c: col || P.white }); }
  }
  celebrate(pts, big, y = 118) {
    const medal = medalFor(pts);
    this.excite = medal ? 1 : 0.5;
    Snd.cheer(medal === 'gold' ? 1.2 : medal ? 0.8 : 0.4); Snd.crowd(medal ? 0.9 : 0.4);
    pop(big, W / 2, y, { sc: 5, c: P.white, life: 2.4, rainbow: medal === 'gold' });
    const pb = S.pbs[this.def.id];
    const isPB = pb == null || (this.def.lower ? this.mBest() < pb : this.mBest() > pb);
    const wr = this.def.lower ? this.mBest() < WR[this.def.id] : this.mBest() > WR[this.def.id];
    let label = medal === 'gold' ? 'GOLD!' : medal === 'silver' ? 'SILVER!' : medal === 'bronze' ? 'BRONZE' : pts > 400 ? 'NICE' : 'KEEP TRYING';
    if (wr) label = 'WORLD RECORD!!';
    pop(label, W / 2, y + 42, { sc: wr ? 2 : 3, c: medal === 'gold' ? P.yellow : medal === 'silver' ? P.silver : medal ? P.orange : P.white, life: 2.4, wave: medal === 'gold' ? 2 : 0, rainbow: wr });
    if (isPB && pb != null) { setTimeout(() => { pop('NEW PB!', W / 2, y + 70, { sc: 2, rainbow: true, life: 1.8, wave: 1 }); Snd.pb(); }, 450); }
    if (medal === 'gold' || wr) { confetti(wr ? 160 : 110); Snd.fanfare(); flash('#fff7d6', 0.5); }
    else if (medal) { confetti(40); }
  }
  mBest() { return this.lastVal; }
  // ---- race start sequence (sprint + hurdles)
  seqReset() {
    this.ph = 'marks'; this.pt = 0; this.setDelay = 0.9 + this.rand() * 1.6;
    pop('ON YOUR MARKS', W / 2, 86, { sc: 2, c: P.white, life: 1.5, rise: 4 });
    this.excite = 0.12; Snd.crowd(0.1);
  }
  seqUpdate() {
    if (this.ph === 'marks' && this.pt > 1.6) { this.ph = 'set'; this.pt = 0; Snd.beep(false); pop('SET', W / 2, 86, { sc: 3, c: P.yellow, life: 1.0, rise: 4 }); }
    else if (this.ph === 'set' && this.pt > this.setDelay) {
      this.ph = 'go'; this.pt = 0; Snd.gun(); flash('#fff', 0.45); shake(3, 0.15);
      pop('GO!', W / 2, 80, { sc: 6, c: P.lime, life: 0.9 }); this.excite = 0.6; Snd.crowd(0.45);
    } else if (this.ph === 'fs' && this.pt > 1.7) { this.reset(); }
    else if (this.ph === 'dq' && this.pt > 1.8) { this.lastVal = null; this.recordMark(null, false, 'DQ'); }
  }
  falseStart() {
    this.fs = (this.fs || 0) + 1; Snd.whistle(); flash(P.red, 0.35); shake(4);
    if (this.fs >= 2) { pop('DISQUALIFIED', W / 2, 110, { sc: 2, c: P.hot, life: 1.8 }); this.ph = 'dq'; }
    else { pop('FALSE START!', W / 2, 110, { sc: 2, c: P.orange, life: 1.6 }); pop('ONE MORE AND YOU ARE OUT', W / 2, 136, { sc: 1, c: P.white, life: 1.6 }); this.ph = 'fs'; }
    this.pt = 0;
  }
  // tap cadence -> taps per second
  rate() {
    const a = this.taps, now = this.time;
    if (a.length < 2) return a.length ? 1.5 : 0;
    const n = Math.min(a.length, 6), span = a[a.length - 1] - a[a.length - n];
    let f = (n - 1) / Math.max(span, 0.05);
    const gap = now - a[a.length - 1];
    if (gap > 1 / f) f = Math.min(f, 1 / gap);
    return f;
  }
  tapLR(pd) {
    if (!this.started) { this.started = true; this.react = this.time; this.taps = [this.time]; this.last = pd.id; Snd.step(1); this.kick(); return; }
    if (pd.id === this.last) { this.v *= 0.9; this.stumble = 0.22; Snd.oops(); pop('SAME FOOT!', W / 2, 96, { sc: 2, c: P.orange, life: 0.7 }); return; }
    this.taps.push(this.time); if (this.taps.length > 10) this.taps.shift();
    this.last = pd.id; Snd.step(0.8 + this.v / 11 * 0.7); this.kick();
  }
  kick() { burst(this.x * PPM - 3, L.ground - 1, 3, { cols: [P.tartan2, '#ea8f74'], sp: 50, dir: -Math.PI * 0.85, spread: 0.9, gr: 160, life: 0.3, s: 2 }); }
  speedLines() {
    if (this.v > 9 && Math.random() < (this.v - 8.5) * 0.5) part({ x: W + 4, y: 46 + Math.random() * (L.ground - 50), vx: -700 - Math.random() * 300, life: 0.35, c: 'rgba(255,255,255,0.55)', s: 26, hud: true, kind: 4 });
  }
  speedMeter(v, vmax, y = 44) {
    text('SPEED', 6, y, { sc: 1, c: P.white });
    const x0 = 40, w = 90, segs = 15, k = clamp(v / vmax, 0, 1);
    R(x0 - 1, y - 1, w + 2, 9, P.ink);
    for (let i = 0; i < segs; i++) {
      const on = i / segs < k, c = i < 8 ? P.lime : i < 12 ? P.yellow : P.hot;
      R(x0 + i * (w / segs), y, w / segs - 1, 7, on ? c : P.dark);
    }
    if (k > 0.9 && Math.floor(this.t * 12) % 2) text('MAX', x0 + w + 6, y, { sc: 1, c: P.yellow });
  }
}

// ---------------------------------------------------------------- shared race (sprint / hurdles)
class Race extends Ev {
  constructor(def, cfg) { super(def, cfg); this.fs = 0; this.dist = def.id === 'sprint' ? 100 : 110; }
  makeRivals() {
    return this.cfg.rivals.map((r, i) => {
      const T = this.def.id === 'sprint' ? r.sprint : r.hurdles, tau = 1.25, Tp = T - 0.16;
      const vm = this.dist / (Tp - tau * (1 - Math.exp(-Tp / tau)));
      return { name: r.name, kit: RIVAL_KITS[r.kit % RIVAL_KITS.length], T, vm, tau, x: 0, v: 0, leg: i * 1.7 };
    });
  }
  rivalsUpdate(dt) {
    for (const r of this.rv) {
      const tt = this.time - 0.16;
      if (tt <= 0) { r.x = 0; r.v = 0; continue; }
      if (tt < r.T - 0.16) { r.x = r.vm * (tt - r.tau * (1 - Math.exp(-tt / r.tau))); r.v = r.vm * (1 - Math.exp(-tt / r.tau)); }
      else { r.v = Math.max(0, r.v - 5 * dt); r.x += r.v * dt; }
      r.leg += dt * (r.v * 1.25 + (r.v > 0.3 ? 3 : 0));
    }
  }
  startPose(started, since) {
    if (this.ph === 'marks') return { p: POSE.marks, hh: 9 };
    if (!started) { const w = this.ph === 'set' ? clamp(this.pt / 0.3, 0, 1) : this.ph === 'go' ? 1 : 0; return { p: lerpPose(POSE.marks, POSE.set, w), hh: lerp(9, 14, w) }; }
    return null;
  }
  drawRacer(xm, lane, pose, hh, kit, face, camX, camY) {
    const fy = L.ground - lane * L.lane;
    const sx = sxAt(xm, fy, camX) - 2;
    shadow(sx + 2, fy + camY, 8);
    return drawAthlete(sx, fy - hh * AS + camY, pose, kit, { face });
  }
  rivalPose(r, hurdleAt) {
    const sp = this.startPose(this.time > 0.16, 0);
    if (sp) return sp;
    const k = clamp(r.v / 9.5, 0.25, 1.1);
    if (r.v < 0.8 && r.x > this.dist) return { p: POSE.stand, hh: 20 };
    let p = runPose(r.leg, k), hh = 19 + runBob(r.leg, k);
    const since = this.time - 0.16;
    if (since < 0.4) { const w = clamp(since / 0.4, 0, 1); p = lerpPose(POSE.set, p, w); hh = lerp(14, hh, w); }
    if (hurdleAt) { const a = hurdleAt(r.x); if (a > 0) { p = lerpPose(p, POSE.hurdle, Math.min(1, a * 1.8)); hh += a * 8; } }
    return { p, hh };
  }
  drawFinishPost(camX, camY, timeShown) {
    const x = sxAt(this.dist, L.trackTop, camX);
    if (x < -60 || x > W + 60) return;
    R(x - 1, L.trackTop - 50 + camY, 3, 50, P.silver); R(x + 1, L.trackTop - 50 + camY, 1, 50, P.slate);
    panel(x - 28, L.trackTop - 72 + camY, 58, 22, P.ink, P.slate);
    text(timeShown, x + 1, L.trackTop - 65 + camY, { sc: 1, al: 'c', c: P.lime, o: null });
  }
  drawMinimap(y) {
    const x0 = 150, x1 = W - 12;
    R(x0, y + 3, x1 - x0, 2, P.slate);
    R(x1 - 1, y, 2, 8, P.white);
    for (let i = this.rv.length - 1; i >= 0; i--) { const r = this.rv[i]; const px = x0 + clamp(r.x / this.dist, 0, 1) * (x1 - x0); R(px - 1, y + 1, 3, 6, r.kit.top); }
    const px = x0 + clamp(this.x / this.dist, 0, 1) * (x1 - x0);
    R(px - 2, y, 5, 8, P.ink); R(px - 1, y + 1, 3, 6, KIT_PLAYER.top);
  }
}

// ---------------------------------------------------------------- 100m
class Sprint extends Race {
  pads() {
    const w = Math.floor((W - 36) / 2), h = L.padBot - L.padTop;
    const want = this.started ? (this.last === 'L' ? 'R' : 'L') : null;
    return [
      { id: 'L', x: 12, y: L.padTop, w, h, label: 'L', sub: 'LEFT FOOT', hint: want === 'L' && this.ph === 'go' },
      { id: 'R', x: 24 + w, y: L.padTop, w, h, label: 'R', sub: 'RIGHT FOOT', hint: want === 'R' && this.ph === 'go' },
    ];
  }
  reset() {
    this.x = 0; this.v = 0; this.time = 0; this.taps = []; this.last = null; this.started = false; this.react = null;
    this.leg = 0; this.fin = null; this.stumble = 0; this.rv = this.makeRivals(); this.camX = -W * 0.3; this.place = 0; this.topHit = false;
    this.seqReset();
  }
  press(pd) {
    if (this.state !== 'play') return;
    if (this.ph === 'marks' || this.ph === 'set') { this.falseStart(); return; }
    if (this.ph !== 'go') return;
    const first = !this.started;
    this.tapLR(pd);
    if (first) pop('REACTION ' + this.react.toFixed(3), W / 2, 62, { sc: 1, c: this.react < 0.2 ? P.lime : P.white, life: 1.2, rise: 6 });
  }
  update(dt) {
    this.base(dt);
    if (this.state === 'intro') return;
    if (this.state === 'play') this.seqUpdate();
    if (this.ph === 'go' || this.ph === 'fin') {
      this.time += dt; this.rivalsUpdate(dt);
      let vt = 0;
      if (this.started && this.ph === 'go') vt = 12.2 * (1 - Math.exp(-this.rate() / 6.0)) * (1 + this.cfg.wind * 0.012);
      let acc = clamp((vt - this.v) * 1.1, -3.5, 6.5);
      if (this.ph === 'fin') acc = -4;
      this.v = Math.max(0, this.v + acc * dt);
      this.x += this.v * dt;
      this.leg += dt * (this.v * 1.25 + (this.v > 0.3 ? 3 : 0));
      if (this.stumble > 0) this.stumble -= dt;
      if (this.v > 10.4 && !this.topHit) { this.topHit = true; pop('TOP SPEED!', W / 2, 92, { sc: 2, rainbow: true, life: 1 }); Snd.good(); }
      this.speedLines();
      if (this.ph === 'go' && this.x >= this.dist) {
        this.fin = this.time - (this.x - this.dist) / Math.max(0.1, this.v);
        this.ph = 'fin'; this.pt = 0; this.onFinish();
      }
      if (this.ph === 'fin' && this.pt > 2.7) this.recordMark(this.fin, true);
      if (this.ph === 'go' && this.time > 40) { this.lastVal = null; this.recordMark(null, false, 'DNF'); }
    }
    this.excite = damp(this.excite, this.ph === 'go' ? 0.45 + clamp(this.v / 22, 0, 0.5) : this.excite, 2, dt);
    const tgt = this.x * PPM - W * 0.32;
    this.camX = this.ph === 'go' || this.ph === 'fin' ? damp(this.camX, tgt, 12, dt) : tgt;
  }
  onFinish() {
    this.lastVal = this.fin;
    this.place = 1 + this.rv.filter((r) => r.T < this.fin).length;
    slowmo(0.3, 0.9); flash('#fff', 0.5); shake(4, 0.3); Snd.finish();
    burst(this.dist * PPM, L.ground - 20, 40, { cols: [P.white, P.yellow, P.hot, P.cyan], sp: 220, gr: 120, life: 1 });
    sparkle(this.dist * PPM, L.ground - 30, 24, false);
    this.celebrate(SCORE.sprint(this.fin), this.fin.toFixed(2));
    pop(['1ST PLACE', '2ND PLACE', '3RD PLACE'][this.place - 1], W / 2, 70, { sc: 2, c: this.place === 1 ? P.yellow : P.silver, life: 2.4, rise: 4 });
  }
  draw() {
    const cx = this.camX, cy = 0;
    drawSideBG(cx, cy, this.excite, this.t);
    laneLine(0, cx, cy, P.white, 2); checkerLine(this.dist, cx, cy);
    for (let m = 10; m < this.dist; m += 10) {
      laneLine(m, cx, cy, 'rgba(255,255,255,0.3)', 1, L.ground + 2, L.trackBot);
      const sx = wx(m, cx); if (sx > -20 && sx < W + 20) text(String(m), sx, L.trackBot + 3, { sc: 1, al: 'c' });
    }
    const shown = this.ph === 'fin' || this.state === 'mark' ? (this.fin || this.time) : this.ph === 'go' ? this.time : 0;
    this.drawFinishPost(cx, cy, shown.toFixed(2));
    for (let i = this.rv.length - 1; i >= 0; i--) {
      const r = this.rv[i], rp = this.rivalPose(r);
      this.drawRacer(r.x, i + 1, rp.p, rp.hh, r.kit, null, cx, cy);
    }
    let pp = this.startPose(this.started), face = null;
    if (!pp) {
      const k = clamp(this.v / 9.5, 0.25, 1.1);
      if (this.ph === 'fin' && this.v < 1.4) { pp = { p: this.place === 1 ? POSE.victory : POSE.stand, hh: 20 }; face = 'happy'; }
      else {
        let p = runPose(this.leg, k), hh = 19 + runBob(this.leg, k);
        const w = clamp((this.time - this.react) / 0.4, 0, 1);
        p = lerpPose(POSE.set, p, w); hh = lerp(14, hh, w);
        if (this.stumble > 0) { p.lean += 0.35; face = 'ouch'; }
        pp = { p, hh };
      }
    }
    this.drawRacer(this.x, 0, pp.p, pp.hh, KIT_PLAYER, face, cx, cy);
    drawParts(cx, cy, false);
    this.hud(shown.toFixed(2), this.ph === 'fin' ? P.yellow : P.white, 'WIND ' + fmtWind(this.cfg.wind));
    R(0, 40, W, 14, 'rgba(26,28,44,0.6)');
    this.speedMeter(this.v, 11.2, 43);
    this.drawMinimap(43);
  }
}

// ---------------------------------------------------------------- 110m hurdles
const HURDLE_H = 22;
class Hurdles extends Race {
  pads() { return [{ id: 'J', x: 12, y: L.padTop, w: W - 24, h: L.padBot - L.padTop, label: 'JUMP', sub: 'OR TAP ANYWHERE', color: P.green, dark: P.teal }]; }
  reset() {
    this.x = 0; this.v = 0; this.time = 0; this.started = false; this.react = null; this.leg = 0; this.fin = null; this.stumble = 0;
    this.rv = this.makeRivals(); this.camX = -W * 0.3; this.place = 0;
    this.hs = []; for (let i = 0; i < 10; i++) this.hs.push({ x: 13.72 + i * 9.14, ang: 0, av: 0, vx: 0, off: 0, st: 0 });
    this.hi = 0; this.air = false; this.airT = 0; this.airDur = 0; this.takeX = 0; this.combo = 0; this.perfects = 0; this.hits = 0; this.cool = 0;
    this.seqReset();
  }
  down() {
    if (this.state !== 'play') return;
    if (this.ph === 'marks' || this.ph === 'set') { this.falseStart(); return; }
    if (this.ph !== 'go') return;
    if (!this.started) { this.started = true; this.react = this.time; Snd.step(1); this.kick(); pop('REACTION ' + this.react.toFixed(3), W / 2, 62, { sc: 1, c: this.react < 0.2 ? P.lime : P.white, life: 1.2, rise: 6 }); return; }
    if (!this.air && this.cool <= 0 && this.x < this.dist) {
      this.air = true; this.airT = 0; this.airDur = 3.3 / Math.max(this.v, 4); this.takeX = this.x;
      Snd.jump(); this.kick();
    }
  }
  update(dt) {
    this.base(dt);
    if (this.state === 'intro') return;
    if (this.state === 'play') this.seqUpdate();
    if (this.ph === 'go' || this.ph === 'fin') {
      this.time += dt; this.rivalsUpdate(dt);
      let vt = 0;
      if (this.started && this.ph === 'go') vt = 7.75 * (1 + this.cfg.wind * 0.01) + Math.min(1.25, this.combo * 0.18);
      if (this.stumble > 0) { vt *= 0.55; this.stumble -= dt; }
      let acc = clamp((vt - this.v) * 1.3, -3, 6.5);
      if (this.ph === 'fin') acc = -4;
      this.v = Math.max(0, this.v + acc * dt);
      this.x += this.v * dt;
      if (!this.air) this.leg += dt * (this.v * 1.25 + (this.v > 0.3 ? 3 : 0));
      if (this.cool > 0) this.cool -= dt;
      if (this.air) { this.airT += dt; if (this.airT >= this.airDur) { this.air = false; this.cool = 0.08; Snd.step(0.9); this.kick(); } }
      while (this.hi < this.hs.length && this.x >= this.hs[this.hi].x) { this.judge(this.hs[this.hi]); this.hi++; }
      this.speedLines();
      if (this.ph === 'go' && this.x >= this.dist) { this.fin = this.time - (this.x - this.dist) / Math.max(0.1, this.v); this.ph = 'fin'; this.pt = 0; this.onFinish(); }
      if (this.ph === 'fin' && this.pt > 2.7) this.recordMark(this.fin, true);
      if (this.ph === 'go' && this.time > 45) { this.lastVal = null; this.recordMark(null, false, 'DNF'); }
    }
    for (const h of this.hs) {
      if (h.st === 1) { h.av += 38 * dt; h.ang += h.av * dt; if (h.ang >= 1.5) { h.ang = 1.5; h.av = -h.av * 0.3; if (Math.abs(h.av) < 1) { h.av = 0; h.st = 3; } } }
      else if (h.st === 2) { h.off += h.vx * dt; h.vx *= Math.exp(-2.2 * dt); h.ang += h.av * dt; h.av *= Math.exp(-1.2 * dt); if (h.vx < 0.3) { h.st = 3; h.ang = Math.PI / 2; } }
    }
    this.excite = damp(this.excite, this.ph === 'go' ? 0.45 + this.combo * 0.08 : this.excite, 2, dt);
    const tgt = this.x * PPM - W * 0.32;
    this.camX = this.ph === 'go' || this.ph === 'fin' ? damp(this.camX, tgt, 12, dt) : tgt;
  }
  judge(h) {
    const hx = h.x * PPM, hy = L.ground - HURDLE_H;
    if (this.air) {
      const d = h.x - this.takeX, err = Math.abs(d - 2.0);
      if (err <= 0.4) {
        this.combo++; this.perfects++; this.v += 0.35;
        pop(this.combo > 1 ? 'PERFECT X' + this.combo : 'PERFECT!', W / 2, 92, { sc: 2, rainbow: true, life: 0.9, rise: 10 });
        Snd.perfect(this.combo); sparkle(hx, hy, 14 + this.combo * 2, false); ringFX(hx, hy, P.yellow, false, 120); flash(P.lime, 0.1);
      } else if (err <= 0.85) {
        pop('GOOD', W / 2, 92, { sc: 2, c: P.lime, life: 0.7, rise: 8 }); Snd.good();
      } else {
        h.st = 1; h.av = 5; this.v *= 0.84; this.combo = 0; this.hits++;
        pop(d > 2 ? 'TOO EARLY' : 'TOO LATE', W / 2, 92, { sc: 2, c: P.orange, life: 0.8, rise: 8 }); Snd.thwack(); shake(2, 0.15);
        burst(hx, hy, 6, { cols: [P.white, P.silver], sp: 90, gr: 300, life: 0.5 });
      }
    } else {
      h.st = 2; h.vx = this.v * 0.9; h.av = 9; this.v *= 0.5; this.stumble = 0.45; this.combo = 0; this.hits++;
      pop('CRASH!', W / 2, 92, { sc: 3, c: P.hot, life: 0.9, rise: 8 }); Snd.crash(); shake(6, 0.3);
      burst(hx, hy, 14, { cols: [P.white, P.ink, P.silver], sp: 160, gr: 400, life: 0.7, s: 3 });
    }
  }
  onFinish() {
    this.lastVal = this.fin;
    this.place = 1 + this.rv.filter((r) => r.T < this.fin).length;
    slowmo(0.3, 0.9); flash('#fff', 0.5); shake(4, 0.3); Snd.finish();
    burst(this.dist * PPM, L.ground - 20, 40, { cols: [P.white, P.yellow, P.hot, P.cyan], sp: 220, gr: 120, life: 1 });
    this.celebrate(SCORE.hurdles(this.fin), this.fin.toFixed(2));
    const note = this.hits === 0 ? (this.perfects === 10 ? 'ALL 10 PERFECT!' : 'CLEAN RUN!') : this.hits + ' HURDLE' + (this.hits > 1 ? 'S' : '') + ' HIT';
    pop(note, W / 2, 70, { sc: 2, c: this.hits === 0 ? P.yellow : P.silver, life: 2.4, rise: 4, rainbow: this.perfects === 10 });
  }
  airAt(xm) { // rival hurdle arcs
    for (const h of this.hs) { const s = (xm - (h.x - 2.0)) / 3.3; if (s > 0 && s < 1) return Math.sin(Math.PI * s); }
    return 0;
  }
  drawHurdle(h, lane, camX, camY, part) {
    const fy = L.ground - lane * L.lane;
    const nearY = fy + 9, farY = fy - 11;
    const xm = h.x + (h.off || 0);
    const ca = Math.cos(h.ang || 0), sa = Math.sin(h.ang || 0);
    const rot = (bx, by, dx, dy) => [bx + dx * ca - dy * sa, by + dx * sa + dy * ca];
    const nb = [sxAt(xm, nearY, camX), nearY + camY], fb = [sxAt(xm, farY, camX), farY + camY];
    if (nb[0] < -40 || nb[0] > W + 40) return;
    const nt = rot(nb[0], nb[1], 0, -HURDLE_H), ft = rot(fb[0], fb[1], 0, -HURDLE_H);
    const nf = rot(nb[0], nb[1], -7, 0), ff = rot(fb[0], fb[1], -7, 0);
    if (part !== 'near') {
      line(fb[0], fb[1], ff[0], ff[1], 0.5, P.slate); line(fb[0], fb[1], ft[0], ft[1], 1, P.silver);
      // crossbar (striped)
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const ax = lerp(nt[0], ft[0], t0), ay = lerp(nt[1], ft[1], t0), bx = lerp(nt[0], ft[0], t1), by = lerp(nt[1], ft[1], t1);
        line(ax, ay, bx, by, 1.6, P.ink);
      }
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        line(lerp(nt[0], ft[0], t0), lerp(nt[1], ft[1], t0), lerp(nt[0], ft[0], t1), lerp(nt[1], ft[1], t1), 0.9, i % 2 ? P.ink : P.white);
      }
    }
    if (part !== 'far') { line(nb[0], nb[1], nf[0], nf[1], 0.5, P.slate); line(nb[0], nb[1], nt[0], nt[1], 1, P.white); }
  }
  draw() {
    const cx = this.camX, cy = 0;
    drawSideBG(cx, cy, this.excite, this.t);
    laneLine(0, cx, cy, P.white, 2); checkerLine(this.dist, cx, cy);
    for (let m = 10; m < this.dist; m += 10) { const sx = wx(m, cx); if (sx > -20 && sx < W + 20) text(String(m), sx, L.trackBot + 3, { sc: 1, al: 'c' }); }
    const shown = this.ph === 'fin' || this.state === 'mark' ? (this.fin || this.time) : this.ph === 'go' ? this.time : 0;
    this.drawFinishPost(cx, cy, shown.toFixed(2));
    for (let i = this.rv.length - 1; i >= 0; i--) {
      for (const h of this.hs) this.drawHurdle({ x: h.x }, i + 1, cx, cy, 'far');
      const r = this.rv[i], rp = this.rivalPose(r, (x) => this.airAt(x));
      this.drawRacer(r.x, i + 1, rp.p, rp.hh, r.kit, null, cx, cy);
      for (const h of this.hs) this.drawHurdle({ x: h.x }, i + 1, cx, cy, 'near');
    }
    // takeoff marks in own lane
    for (const h of this.hs) { const sx = sxAt(h.x - 2.0, L.ground + 3, cx); if (sx > -10 && sx < W + 10) R(sx, L.ground + 2 + cy, 2, 4, 'rgba(255,255,255,0.75)'); }
    for (const h of this.hs) this.drawHurdle(h, 0, cx, cy, 'far');
    let pp = this.startPose(this.started), face = null;
    if (!pp) {
      const k = clamp(this.v / 9.5, 0.25, 1.1);
      if (this.ph === 'fin' && this.v < 1.4) { pp = { p: this.place === 1 ? POSE.victory : POSE.stand, hh: 20 }; face = 'happy'; }
      else {
        let p = runPose(this.leg, k), hh = 19 + runBob(this.leg, k);
        const w = clamp((this.time - this.react) / 0.4, 0, 1);
        p = lerpPose(POSE.set, p, w); hh = lerp(14, hh, w);
        if (this.air) { const s = this.airT / this.airDur, a = Math.sin(Math.PI * s); p = lerpPose(p, POSE.hurdle, Math.min(1, a * 1.8)); hh += a * 9; }
        if (this.stumble > 0) { p = lerpPose(p, POSE.fall, 0.5); face = 'ouch'; }
        pp = { p, hh };
      }
    }
    this.drawRacer(this.x, 0, pp.p, pp.hh, KIT_PLAYER, face, cx, cy);
    for (const h of this.hs) this.drawHurdle(h, 0, cx, cy, 'near');
    drawParts(cx, cy, false);
    this.hud(shown.toFixed(2), this.ph === 'fin' ? P.yellow : P.white, 'WIND ' + fmtWind(this.cfg.wind));
    R(0, 40, W, 14, 'rgba(26,28,44,0.6)');
    if (this.combo > 0) text('COMBO X' + this.combo, 6, 44, { sc: 1, c: RAINBOW[Math.floor(this.t * 10) % RAINBOW.length] });
    else text('HURDLES ' + Math.min(this.hi, 10) + '/10', 6, 44, { sc: 1, c: P.white });
    this.drawMinimap(43);
  }
}

// ---------------------------------------------------------------- long jump
class LongJump extends Ev {
  constructor(def, cfg) { super(def, cfg); this.board = 40; this.pitA = 41; this.pitB = 50.5; }
  pads() {
    const h = L.padBot - L.padTop, w = 100, jw = W - 24 - 2 * w - 16;
    const near = this.ph === 'run' && this.started && this.x > 28 && this.x < 40.5;
    return [
      { id: 'L', x: 12, y: L.padTop, w, h, label: 'L' },
      { id: 'J', x: 12 + w + 8, y: L.padTop, w: jw, h, label: 'JUMP', lsc: 2, sub: this.ph === 'angle' ? 'LET GO!' : this.ph === 'air' ? 'TAP=LAND' : 'HOLD', color: P.green, dark: P.teal, hint: near || this.ph === 'air' },
      { id: 'R', x: W - 12 - w, y: L.padTop, w, h, label: 'R' },
    ];
  }
  reset() {
    this.x = 0; this.v = 0; this.time = 0; this.taps = []; this.last = null; this.started = false; this.leg = 0; this.stumble = 0;
    this.ph = 'run'; this.pt = 0; this.angT = 0; this.ang = 0; this.y = 1; this.vx = 0; this.vy = 0; this.landTap = null; this.bonus = 0;
    this.foul = false; this.camX = -W * 0.25; this.excite = 0.3; this.mark = null; this.tx = null; this.apexDone = false; this.landX = null; this.slide = 0; this.shown = false; this.flag = null; this.noJump = false;
    Snd.crowd(0.2);
    pop('TAP L + R TO RUN', W / 2, 86, { sc: 2, c: P.white, life: 1.8, rise: 4 });
  }
  press(pd) {
    if (this.state !== 'play') return;
    if (this.ph === 'run') {
      if (pd.id === 'J') { if (this.started && this.x > 12) this.takeoff(); return; }
      this.tapLR(pd);
    } else if (this.ph === 'air' && this.landTap === null) this.landTapNow();
  }
  release(pd) { if (this.ph === 'angle' && pd.id === 'J') this.launch(); }
  takeoff() {
    this.tx = this.x; this.foul = this.x > this.board; this.ph = 'angle'; this.angT = 0;
    Snd.tick(1.5); flash('#fff', 0.15);
    const err = this.board - this.x;
    if (!this.foul && err < 0.12) pop('ON THE BOARD!', W / 2, 92, { sc: 2, rainbow: true, life: 1, rise: 6 });
  }
  launch() {
    const th = this.ang * DEG;
    const s = this.v * 1.08 * (1 - 1.0165 * th * th) * (1 + this.cfg.wind * 0.006);
    this.vx = s * Math.cos(th); this.vy = s * Math.sin(th); this.y = 1.0; this.ph = 'air'; this.pt = 0;
    Snd.bigJump(); shake(2, 0.12);
    burst(this.x * PPM, L.ground, 10, { cols: [P.white, P.silver], sp: 80, dir: -Math.PI * 0.75, spread: 1, gr: 200, life: 0.5 });
    if (this.ang >= 19 && this.ang <= 27) pop('GREAT ANGLE!', W / 2, 92, { sc: 2, c: P.lime, life: 0.9, rise: 6 });
    else if (this.ang < 10) pop('TOO FLAT', W / 2, 92, { sc: 2, c: P.orange, life: 0.9, rise: 6 });
    else if (this.ang > 36) pop('TOO STEEP', W / 2, 92, { sc: 2, c: P.orange, life: 0.9, rise: 6 });
  }
  landTapNow() {
    const b = this.vy, c = this.y - 0.5;
    const t = (b + Math.sqrt(Math.max(0, b * b + 4 * 4.905 * c))) / 9.81;
    this.landTap = t; this.bonus = 0.4 * clamp(1 - Math.abs(t - 0.22) / 0.22, 0, 1);
    Snd.swish(1.2);
  }
  land() {
    const reach = 0.22 + this.bonus;
    this.landX = this.x + reach; this.ph = 'land'; this.pt = 0; this.slide = this.vx * 0.25;
    Snd.sand(); shake(3 + this.vx * 0.3, 0.3);
    burst(this.landX * PPM, L.ground + 1, 46, { cols: [P.sand, P.sand2, '#fff0c0'], sp: 170, dir: -Math.PI / 2, spread: 2.4, gr: 450, life: 0.9, s: 2 });
    this.mark = this.foul ? null : this.landX - this.board;
    if (this.landTap === null) pop('TAP TO STICK THE LANDING', W / 2, 150, { sc: 1, c: P.white, life: 1.6, rise: 4 });
    else if (this.bonus > 0.3) pop('PERFECT LANDING!', W / 2, 150, { sc: 2, rainbow: true, life: 1.4, rise: 4 });
    else if (this.bonus > 0.15) pop('NICE LANDING', W / 2, 150, { sc: 2, c: P.lime, life: 1.2, rise: 4 });
    else pop(this.landTap > 0.22 ? 'LANDED TOO EARLY' : 'LANDED TOO LATE', W / 2, 150, { sc: 1, c: P.orange, life: 1.4, rise: 4 });
  }
  update(dt, rdt) {
    this.base(dt);
    if (this.state === 'intro') return;
    if (this.ph === 'run') {
      this.time += dt;
      let vt = 0;
      if (this.started) vt = 12.0 * (1 - Math.exp(-this.rate() / 6.5)) * (1 + this.cfg.wind * 0.01);
      const acc = clamp((vt - this.v) * 1.1, -3.5, 6.5);
      this.v = Math.max(0, this.v + acc * dt); this.x += this.v * dt;
      this.leg += dt * (this.v * 1.25 + (this.v > 0.3 ? 3 : 0));
      if (this.stumble > 0) this.stumble -= dt;
      this.speedLines();
      if (this.x > this.board + 0.8 && this.state === 'play') {
        this.foul = true; this.ph = 'land'; this.pt = 0; this.landX = this.x + 0.5; this.slide = this.v * 0.3; this.noJump = true;
        Snd.sand(); burst(this.landX * PPM, L.ground, 30, { cols: [P.sand, P.sand2], sp: 140, dir: -Math.PI / 2, spread: 2.4, gr: 450, life: 0.8 });
        pop('FORGOT TO JUMP!', W / 2, 110, { sc: 2, c: P.orange, life: 1.6 });
      }
    } else if (this.ph === 'angle') {
      this.angT += rdt;
      const u = this.angT / 0.8; this.ang = 45 * (1 - Math.abs((u % 2) - 1));
      if (this.angT > 2.4) this.launch();
    } else if (this.ph === 'air') {
      this.vy -= 9.81 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (!this.apexDone && this.vy < 0) {
        this.apexDone = true;
        const pred = this.x + this.vx * ((this.vy + Math.sqrt(this.vy * this.vy + 4 * 4.905 * (this.y - 0.5))) / 9.81) - this.board;
        if (pred > 6.7 && !this.foul) slowmo(0.45, 0.45);
      }
      if (this.y <= 0.5 && this.vy < 0) this.land();
    } else if (this.ph === 'land') {
      this.slide = Math.max(0, this.slide - 6 * dt);
      if (this.pt > 0.7 && !this.shown && this.state === 'play') {
        this.shown = true;
        if (this.foul) { pop(this.noJump ? 'NO JUMP' : 'FOUL!', W / 2, 118, { sc: 5, c: P.hot, life: 2 }); Snd.foul(); this.flag = 'red'; this.excite = 0.2; Snd.crowd(0.15); }
        else { this.flag = 'white'; this.lastVal = this.mark; this.celebrate(SCORE.longjump(this.mark), this.mark.toFixed(2) + 'M'); }
      }
      if (this.pt > 2.9 && this.state === 'play') { this.shown = false; this.recordMark(this.mark, !this.foul, this.foul ? 'FOUL' : ''); }
    }
    const tgt = (this.ph === 'land' ? Math.max(this.board, this.landX - 2) : this.x) * PPM - W * 0.35;
    this.camX = damp(this.camX, tgt, this.ph === 'run' ? 14 : 5, dt);
    this.excite = damp(this.excite, this.ph === 'air' ? 0.75 : this.ph === 'run' ? 0.35 + this.v / 30 : this.excite, 3, dt);
  }
  draw() {
    const cx = this.camX, cy = 0, fy = L.ground;
    drawSideBG(cx, cy, this.excite, this.t);
    // sand pit in front lane
    const y0 = fy - 11, y1 = fy + 10;
    for (let y = y0; y <= y1; y++) {
      const a = sxAt(this.pitA, y, cx), b = sxAt(this.pitB, y, cx);
      if (b < 0 || a > W) continue;
      R(a, y + cy, b - a, 1, (y === y0 || y === y1) ? P.brown : (y % 3 ? P.sand : '#f6dc9c'));
    }
    for (let y = y0; y <= y1; y++) { R(sxAt(this.pitA, y, cx) - 2, y + cy, 2, 1, P.brown); R(sxAt(this.pitB, y, cx), y + cy, 2, 1, P.brown); }
    // board
    for (let y = y0 + 1; y < y1; y++) { const a = sxAt(this.board - 0.2, y, cx); R(a, y + cy, 4, 1, P.white); R(a + 4, y + cy, 2, 1, P.hot); }
    // distance markers
    for (let m = 5; m <= 9; m++) {
      const sx = sxAt(this.board + m, L.trackBot, cx);
      if (sx > -20 && sx < W + 20) { R(sx, L.trackBot + cy, 1, 5, P.white); text(m + 'M', sx, L.trackBot + 6 + cy, { sc: 1, al: 'c' }); }
    }
    const pb = S.pbs.longjump;
    if (pb) this.flagMark(this.board + pb, 'PB', P.yellow, cx, cy);
    const prev = this.marks.find((m) => m.ok);
    if (prev) this.flagMark(this.board + prev.val, '1ST', P.cyan, cx, cy);
    if (this.landX && this.ph === 'land') { for (let k = -2; k <= 2; k++) R(sxAt(this.landX, fy + k, cx) - 2, fy + k + cy, 4, 1, P.sand2); }
    // athlete
    let p, hh = 19, face = null, xm = this.x;
    if (this.ph === 'run') {
      const k = clamp(this.v / 9.5, 0.2, 1.1);
      if (!this.started) { p = POSE.stand; hh = 20; }
      else { p = runPose(this.leg, k); hh = 19 + runBob(this.leg, k); if (this.stumble > 0) p.lean += 0.35; }
    } else if (this.ph === 'angle') {
      p = lerpPose(runPose(this.leg, 1), POSE.takeoff, clamp(this.angT / 0.15, 0, 1)); hh = 20 + this.ang * 0.12;
    } else if (this.ph === 'air') {
      hh = 19 + (this.y - 1.0) * PPM / AS;
      const toLand = this.landTap !== null;
      const tt = clamp(this.pt / 0.25, 0, 1);
      p = lerpPose(POSE.takeoff, POSE.sail, tt);
      if (toLand) p = lerpPose(p, POSE.landing, clamp((this.pt - 0) / 0.1, 0, 1));
      if (!toLand && this.vy < -2) p = lerpPose(p, POSE.landing, clamp((-this.vy - 2) / 4, 0, 0.5));
      face = 'happy';
    } else {
      xm = this.landX - 0.35 + (this.noJump ? 0 : 0);
      p = this.noJump ? POSE.fall : POSE.sit; hh = this.noJump ? 8 : 6; face = this.foul ? 'ouch' : 'happy';
      if (this.pt > 1.4 && !this.foul && this.mark > 6.0) { p = POSE.victory; hh = 14; }
    }
    const sx = sxAt(xm, fy, cx) - 2;
    shadow(sx + 2, fy + cy, this.ph === 'air' ? Math.max(4, 9 - (this.y - 0.5) * 3) : 9);
    drawAthlete(sx, fy - hh * AS + cy, p, KIT_PLAYER, { face });
    if (this.flag) this.officialFlag(cx, cy);
    drawParts(cx, cy, false);
    // angle gauge
    if (this.ph === 'angle') this.gauge(sx, fy - hh * AS + cy);
    let big = this.ph === 'run' ? (this.started ? (this.board - this.x).toFixed(1) + 'M TO BOARD' : 'GET READY') : this.ph === 'angle' ? Math.round(this.ang) + ' DEG' : '';
    if (this.ph === 'air') big = Math.max(0, this.x - this.board).toFixed(2) + 'M';
    if (this.ph === 'land') big = this.foul ? 'FOUL' : this.mark.toFixed(2) + 'M';
    this.hud(big, this.ph === 'land' && !this.foul ? P.yellow : P.white);
    R(0, 40, W, 14, 'rgba(26,28,44,0.6)');
    this.speedMeter(this.v, 11.2, 43);
    text('WIND ' + fmtWind(this.cfg.wind), W - 6, 44, { sc: 1, al: 'r', c: P.silver });
  }
  flagMark(xm, label, c, cx, cy) {
    const x = sxAt(xm, L.ground + 8, cx); if (x < -20 || x > W + 20) return;
    R(x, L.ground - 4 + cy, 1, 14, P.white); R(x + 1, L.ground - 4 + cy, 12, 7, c);
    text(label, x + 2, L.ground - 4 + cy, { sc: 1, c: P.ink, o: null });
  }
  officialFlag(cx, cy) {
    const x = sxAt(this.board, L.trackTop, cx) + 6, y = L.trackTop - 28 + cy;
    const k = clamp(this.pt / 0.3, 0, 1);
    R(x, y + 10 - k * 10, 2, 26, P.slate);
    const wave = Math.round(Math.sin(this.t * 10) * 1);
    R(x + 2, y + 10 - k * 10 + wave, 14, 9, this.flag === 'red' ? P.hot : P.white);
    R(x + 2, y + 10 - k * 10 + wave, 14, 1, P.ink);
  }
  gauge(hx, hy) {
    const cx = hx + 12, cy = hy + 14, r = 46;
    const pt = (a, rr) => [cx + Math.cos(a * DEG) * rr, cy - Math.sin(a * DEG) * rr];
    for (let a = 0; a <= 45; a += 0.5) { const [x, y] = pt(a, r); disc(x, y, 3, P.ink); }
    for (let a = 0; a <= 45; a += 0.5) { const [x, y] = pt(a, r); R(x - 1, y - 1, 3, 3, a >= 19 && a <= 27 ? P.lime : a > 36 || a < 10 ? P.hot : P.yellow); }
    for (const a of [0, 15, 30, 45]) { const [x, y] = pt(a, r + 9); text(String(a), x, y - 3, { sc: 1, al: 'c', c: P.white }); }
    const [nx, ny] = pt(this.ang, r + 5);
    line(cx, cy, nx, ny, 1.8, P.ink); line(cx, cy, nx, ny, 0.6, P.white);
    disc(nx, ny, 3, P.ink); disc(nx, ny, 2, P.white); disc(cx, cy, 2, P.white);
  }
}

// ---------------------------------------------------------------- javelin
class Javelin extends Ev {
  constructor(def, cfg) { super(def, cfg); this.line = 32; }
  reset() {
    this.x = 3; this.v = 0; this.ph = 'run'; this.pt = 0; this.grip = null; this.jav = null; this.foul = false; this.leg = 0;
    this.camX = -W * 0.3; this.camY = 0; this.mark = null; this.withdraw = 0; this.throwT = 0; this.wob = 0; this.shown = false; this.flag = null;
    Snd.crowd(0.2);
  }
  down(p) {
    if (this.state !== 'play' || this.ph !== 'run') return;
    this.grip = { id: p.id, s: [{ x: p.x, y: p.y, t: p.t }], x0: p.x, y0: p.y }; Snd.tick(0.8);
  }
  move(p) {
    if (!this.grip || p.id !== this.grip.id) return;
    const s = this.grip.s; s.push({ x: p.x, y: p.y, t: p.t });
    while (s.length > 2 && p.t - s[0].t > 0.3) s.shift();
  }
  up(p) {
    if (!this.grip || p.id !== this.grip.id) return;
    const gp = this.grip; this.grip = null;
    gp.s.push({ x: p.x, y: p.y, t: p.t });
    if (this.ph !== 'run' || this.state !== 'play') return;
    const s = gp.s, end = s[s.length - 1];
    let j = s.length - 1; while (j > 0 && end.t - s[j - 1].t < 0.09) j--;
    if (j === s.length - 1 && j > 0) j--;
    const st = s[j], dts = Math.max(0.012, end.t - st.t);
    const vx = (end.x - st.x) / dts, vy = (end.y - st.y) / dts;
    const sp = Math.hypot(vx, vy) / H, ang = Math.atan2(-vy, vx);
    if (vx > 0 && sp > 0.8 && ang > -0.35) this.throwIt(ang, sp);
    else { pop('FLICK UP + FORWARD!', W / 2, 96, { sc: 1, c: P.orange, life: 1 }); Snd.oops(); }
  }
  throwIt(ang, sp) {
    this.foul = this.x > this.line;
    const vr = 31 * (1 - Math.exp(-sp / 2.8));
    const a = clamp(ang, -0.1, 1.35);
    this.relV = vr; this.relA = a;
    this.jav = { x: this.x + 0.4, y: 2.0, vx: vr * Math.cos(a) + this.v * 0.35, vy: vr * Math.sin(a), ang: a, fly: true, t: 0 };
    this.ph = 'throw'; this.pt = 0; this.throwT = 0;
    Snd.whoosh(1.2); shake(2, 0.12);
    const pw = Math.round((vr / 31) * 100);
    pop('POWER ' + pw + '%', W / 2, 70, { sc: 2, c: pw >= 85 ? P.yellow : P.white, rainbow: pw >= 93, life: 1.2, rise: 4 });
    pop('ANGLE ' + Math.round(a / DEG), W / 2, 92, { sc: 1, c: Math.abs(a / DEG - 35) < 5 ? P.lime : P.silver, life: 1.2, rise: 4 });
  }
  update(dt) {
    this.base(dt);
    if (this.state === 'intro') return;
    if (this.ph === 'run') {
      this.v = Math.min(6.8, this.v + 3.2 * dt); this.x += this.v * dt;
      this.leg += dt * (this.v * 1.25 + 3);
      if (this.grip) { const s = this.grip.s[this.grip.s.length - 1]; this.withdraw = damp(this.withdraw, clamp((this.grip.x0 - s.x) / 60 + 0.5, 0.4, 1), 14, dt); }
      else this.withdraw = damp(this.withdraw, 0, 10, dt);
      if (this.x >= this.line + 0.3 && this.state === 'play') {
        this.ph = 'fouled'; this.pt = 0; this.foul = true; Snd.foul();
        pop('OVER THE LINE!', W / 2, 110, { sc: 2, c: P.hot, life: 1.8 }); this.flag = 'red';
      }
    } else if (this.ph === 'fouled') {
      this.v = Math.max(0, this.v - 12 * dt); this.x += this.v * dt;
      if (this.pt > 2 && this.state === 'play') this.recordMark(null, false, 'FOUL');
    } else {
      this.throwT += dt; this.v = Math.max(0, this.v - 14 * dt); this.x += this.v * dt;
    }
    const j = this.jav;
    if (j && j.fly) {
      const n = 4, h = dt / n;
      for (let i = 0; i < n; i++) {
        const rvx = j.vx - this.cfg.wind, sp = Math.hypot(rvx, j.vy), c = 0.0011;
        j.vx += -c * sp * rvx * h; j.vy += (-9.81 - c * sp * j.vy) * h;
        j.x += j.vx * h; j.y += j.vy * h;
        const target = Math.atan2(j.vy, j.vx); j.ang += wrapA(target - j.ang) * Math.min(1, h * 2.4);
        const tipY = j.y + Math.sin(j.ang) * 1.1;
        if (tipY <= 0 && j.t > 0.15) {
          j.fly = false; j.y -= tipY; j.ang = Math.min(j.ang, -0.25);
          this.landX = j.x + Math.cos(j.ang) * 1.1; this.mark = this.foul ? null : this.landX - this.line;
          this.ph = 'land'; this.pt = 0; this.wob = 1;
          Snd.thud(); shake(3, 0.25);
          burst(this.landX * PPM, L.ground - 4, 22, { cols: [P.brown, P.brown2, P.grass2], sp: 110, dir: -Math.PI / 2, spread: 2, gr: 400, life: 0.7 });
          break;
        }
      }
      j.t += dt;
      if (j.fly && j.x * PPM > this.camX + W + 100) { /* keep */ }
    }
    if (this.ph === 'land') {
      this.wob *= Math.exp(-3.5 * dt);
      if (this.pt > 0.6 && !this.shown && this.state === 'play') {
        this.shown = true;
        if (this.foul) { pop('FOUL!', W / 2, 118, { sc: 5, c: P.hot, life: 2 }); Snd.foul(); this.flag = 'red'; }
        else { this.flag = 'white'; this.lastVal = this.mark; this.celebrate(SCORE.javelin(this.mark), this.mark.toFixed(2) + 'M'); }
      }
      if (this.pt > 3.0 && this.state === 'play') this.recordMark(this.mark, !this.foul, this.foul ? 'FOUL' : '');
    }
    // camera
    let tx = this.x * PPM - W * 0.3, ty = 0;
    if (j) {
      tx = Math.max(tx, j.x * PPM - W * 0.5);
      ty = Math.max(0, j.y * PPM - (L.ground - 150));
    }
    this.camX = damp(this.camX, tx, j && j.fly ? 7 : 6, dt);
    this.camY = damp(this.camY, ty, 5, dt);
    this.excite = damp(this.excite, j && j.fly ? 0.7 : this.ph === 'run' ? 0.35 : this.excite, 3, dt);
  }
  javPts(x, y, ang, len = 1.1) { // world -> screen ends
    const cx = wx(x, this.camX), cy = L.ground - y * PPM + this.camY;
    const dx = Math.cos(ang) * len * PPM, dy = -Math.sin(ang) * len * PPM;
    return [cx - dx, cy - dy, cx + dx, cy + dy, cx, cy];
  }
  drawJav(x0, y0, x1, y1) {
    line(x0, y0, x1, y1, 1.2, P.ink);
    line(x0, y0, x1, y1, 0.5, P.silver);
    const gx = lerp(x0, x1, 0.45), gy = lerp(y0, y1, 0.45), hx = lerp(x0, x1, 0.58), hy = lerp(y0, y1, 0.58);
    line(gx, gy, hx, hy, 0.9, P.orange);
    line(lerp(x0, x1, 0.92), lerp(y0, y1, 0.92), x1, y1, 0.6, P.dark);
  }
  draw() {
    const cx = this.camX, cy = this.camY, fy = L.ground;
    drawSideBG(cx, cy, this.excite, this.t);
    // the field beyond the foul line
    const lx = sxAt(this.line, L.trackBot, cx);
    if (lx < W) {
      for (let y = L.trackTop + 1; y < L.trackBot; y++) {
        const a = sxAt(this.line, y, cx);
        R(Math.max(0, a), y + cy, W - Math.max(0, a), 1, (y >> 2) % 2 ? P.grass : P.grass2);
      }
      for (let y = L.trackTop + 1; y < L.trackBot; y++) R(sxAt(this.line, y, cx), y + cy, 3, 1, P.white);
    }
    for (let m = 10; m <= 100; m += 10) {
      laneLine(this.line + m, cx, cy, 'rgba(255,255,255,0.55)', 1);
      const sx = sxAt(this.line + m, L.trackBot, cx); if (sx > -20 && sx < W + 20) text(m + 'M', sx, L.trackBot + 3 + cy, { sc: 1, al: 'c' });
    }
    const pb = S.pbs.javelin;
    if (pb) { laneLine(this.line + pb, cx, cy, P.yellow, 2); const sx = sxAt(this.line + pb, L.trackTop, cx); if (sx > -20 && sx < W + 20) text('PB', sx, L.trackTop - 9 + cy, { sc: 1, al: 'c', c: P.yellow }); }
    { laneLine(this.line + WR.javelin, cx, cy, P.hot, 2); const sx = sxAt(this.line + WR.javelin, L.trackTop, cx); if (sx > -20 && sx < W + 20) text('WORLD RECORD', sx, L.trackTop - 9 + cy, { sc: 1, al: 'c', c: P.hot }); }
    const prev = this.marks.find((m) => m.ok);
    if (prev) { laneLine(this.line + prev.val, cx, cy, P.cyan, 1); }
    // athlete
    let p, hh = 19, face = null;
    const k = clamp(this.v / 7, 0.2, 0.9);
    p = runPose(this.leg, k); hh = 19 + runBob(this.leg, k);
    if (this.ph === 'run') {
      const carry = { shF: 3.54, elF: -1.1 }, back = { shF: -1.85 + TAU, elF: 0.05, lean: -0.25 };
      p.shF = lerp(carry.shF, back.shF, this.withdraw); p.elF = lerp(carry.elF, back.elF, this.withdraw);
      if (this.withdraw > 0.05) { p.lean = lerp(p.lean, back.lean, this.withdraw); p.shB = lerp(p.shB, 1.5, this.withdraw); p.elB = 0.3; }
    } else if (this.ph === 'throw' || this.ph === 'land' || this.ph === 'fouled') {
      const e = clamp(this.throwT / 0.2, 0, 1);
      if (this.ph === 'fouled') { p = lerpPose(p, POSE.fall, clamp(this.pt * 3, 0, 0.6)); face = 'ouch'; }
      else {
        p = lerpPose(p, POSE.stand, clamp(this.throwT / 0.8, 0, 1));
        p.shF = lerp(-1.85, -4.9, e); p.elF = 0.1; p.lean = lerp(-0.25, 0.5, e) * (1 - clamp((this.throwT - 0.5) / 0.6, 0, 1));
        p.shB = 1.2; hh = 19;
        if (this.ph === 'land' && this.pt > 1.2 && !this.foul && this.mark > 55) { p = POSE.victory; face = 'happy'; }
      }
    }
    const sx = sxAt(this.x, fy, cx) - 2;
    shadow(sx + 2, fy + cy, 9);
    const J = drawAthlete(sx, fy - hh * AS + cy, p, KIT_PLAYER, { face });
    if (this.ph === 'run' || this.ph === 'fouled') {
      const [hx, hy] = J.handF, a = this.ph === 'fouled' ? 0.3 : lerp(0.18, 0.28, this.withdraw);
      const len = 24, back = lerp(0.35, 0.15, this.withdraw);
      const x0 = hx - Math.cos(a) * len * 2 * back, y0 = hy + Math.sin(a) * len * 2 * back;
      this.drawJav(x0, y0, x0 + Math.cos(a) * len * 2, y0 - Math.sin(a) * len * 2);
    }
    if (this.jav) {
      const j = this.jav, wob = j.fly ? 0 : Math.sin(this.pt * 32) * this.wob * 0.18;
      const e = this.javPts(j.x, j.y, j.ang + wob);
      if (j.fly) { for (let i = 1; i <= 3; i++) { R(e[4] - j.vx * i * 0.9, e[5] + j.vy * i * 0.9, 2, 1, 'rgba(255,255,255,' + (0.5 - i * 0.12) + ')'); } }
      this.drawJav(e[0], e[1], e[2], e[3]);
      if (j.fly) shadow(e[4], fy + cy, 6);
    }
    if (this.flag) this.officialFlag(cx, cy);
    drawParts(cx, cy, false);
    let big = '';
    if (this.ph === 'run') big = (this.line - this.x).toFixed(1) + 'M TO LINE';
    if (this.jav) big = Math.max(0, (this.jav.fly ? this.jav.x : this.landX) - this.line).toFixed(2) + 'M';
    if (this.ph === 'land' && this.foul) big = 'FOUL';
    if (this.ph === 'fouled') big = 'FOUL';
    this.hud(big, this.ph === 'land' && !this.foul ? P.yellow : P.white);
    R(0, 40, W, 14, 'rgba(26,28,44,0.6)');
    text('WIND ' + fmtWind(this.cfg.wind) + (this.cfg.wind >= 0 ? ' TAIL' : ' HEAD'), 6, 44, { sc: 1, c: P.silver });
  }
  officialFlag(cx, cy) {
    const x = sxAt(this.line, L.trackTop, cx) + 4, y = L.trackTop - 30 + cy;
    R(x, y, 2, 30, P.slate);
    const wave = Math.round(Math.sin(this.t * 10));
    R(x + 2, y + wave, 14, 9, this.flag === 'red' ? P.hot : P.white); R(x + 2, y + wave, 14, 1, P.ink);
  }
  drawDeck(t) {
    const y = L.padTop + 8;
    const msgs = this.ph === 'run' ? (this.grip ? ['NOW FLICK UP AND FORWARD!'] : ['PRESS, PULL BACK, FLICK UP-RIGHT']) : ['GO GO GO!'];
    text(msgs[0], W / 2, y + 6, { sc: 1, al: 'c', c: P.yellow });
    // animated hint arrow
    const k = (t * 1.2) % 1, ax = 90 + k * 170, ay = y + 110 - k * 50;
    if (this.ph === 'run') {
      for (let i = 0; i < 12; i++) { const q = i / 12; R(90 + q * 170, y + 110 - q * 50, 2, 2, 'rgba(115,239,247,' + (0.2 + q * 0.5) + ')'); }
      disc(ax, ay, 5, P.white); disc(ax, ay, 3, P.cyan);
      text('POWER = SPEED OF FLICK', W / 2, y + 22, { sc: 1, al: 'c', c: P.silver });
      text('ANGLE = DIRECTION', W / 2, y + 34, { sc: 1, al: 'c', c: P.silver });
    }
  }
}

// ---------------------------------------------------------------- hammer (top-down)
const PPT = 20; // px per metre, top-down
class Hammer extends Ev {
  constructor(def, cfg) { super(def, cfg); this.R = 2.0; this.noDeck = true; }
  get cyS() { return H - 190; }
  reset() {
    this.ph = 'ready'; this.ang = Math.PI / 2; this.w = 0; this.finger = null; this.fAng = 0; this.fValid = false;
    this.ball = null; this.spins = 0; this.lastZone = false; this.trail = []; this.camY = 0; this.foul = false; this.mark = null;
    this.halfIdx = 0; this.shown = false; this.flag = null; this.cageHit = null; this.peakW = 0; this.divot = null;
    Snd.crowd(0.15);
  }
  center() { return { x: W / 2, y: this.cyS + this.camY }; }
  down(p) {
    if (this.state !== 'play' || !(this.ph === 'ready' || this.ph === 'spin')) return;
    this.finger = { id: p.id }; this.track(p);
    if (this.ph === 'ready') { this.ph = 'spin'; this.pt = 0; }
  }
  track(p) { const c = this.center(), dx = p.x - c.x, dy = p.y - c.y; if (Math.hypot(dx, dy) > 16) { this.fAng = Math.atan2(dy, dx); this.fValid = true; } }
  move(p) { if (this.finger && p.id === this.finger.id) this.track(p); }
  up(p) {
    if (!this.finger || p.id !== this.finger.id) return;
    this.finger = null; this.fValid = false;
    if (this.ph === 'spin' && Math.abs(this.w) > 4) this.release();
  }
  zoneCenter() { const s = Math.sign(this.w) || 1; return -Math.PI / 2 - s * Math.PI / 2; }
  release() {
    const s = Math.sign(this.w), dir = this.ang + s * Math.PI / 2;
    const err = wrapA(dir + Math.PI / 2), cdir = -Math.PI / 2 + err * 0.55, off = Math.abs(cdir + Math.PI / 2);
    const v = Math.abs(this.w) * this.R;
    this.relV = v; this.inSector = off <= 0.3047; this.toCage = off > 0.62;
    const el = 0.733, vh = v * Math.cos(el);
    this.ball = { x: Math.cos(this.ang) * this.R, y: Math.sin(this.ang) * this.R, vx: Math.cos(cdir) * vh, vy: Math.sin(cdir) * vh, z: 1.3, vz: v * Math.sin(el), landed: false, rest: false };
    this.ph = 'flight'; this.pt = 0;
    Snd.whoosh(1.4); shake(2, 0.12);
    const kmh = Math.round(v * 3.6);
    pop(kmh + ' KM/H', W / 2, 70, { sc: 2, c: kmh >= 95 ? P.yellow : P.white, rainbow: kmh >= 100, life: 1.3, rise: 4 });
    if (this.inSector && off < 0.08) pop('DEAD CENTRE!', W / 2, 92, { sc: 1, c: P.lime, life: 1.2, rise: 4 });
  }
  update(dt) {
    this.base(dt);
    if (this.state === 'intro') return;
    const c0 = this.center();
    if (this.ph === 'spin' || this.ph === 'ready') {
      if (this.finger && this.fValid) {
        const d = wrapA(this.fAng - this.ang);
        let tq = 10 * Math.sin(d);
        if (Math.sign(tq) === Math.sign(this.w)) tq *= Math.max(0, 1 - Math.abs(this.w) / 15.5);
        this.w += tq * dt;
      }
      this.w -= this.w * 0.05 * dt;
      if (!this.finger) this.w -= Math.sign(this.w) * Math.min(Math.abs(this.w), 1.5 * dt);
      this.ang += this.w * dt;
      this.spins += Math.abs(this.w) * dt / TAU;
      this.peakW = Math.max(this.peakW, Math.abs(this.w));
      const aw = Math.abs(this.w);
      const hi = Math.floor(this.ang / Math.PI);
      if (hi !== this.halfIdx) { this.halfIdx = hi; if (aw > 3) Snd.swish(0.5 + aw / 15); }
      if (aw > 5) {
        const inZ = Math.abs(wrapA(this.ang - this.zoneCenter())) < 0.55;
        if (inZ && !this.lastZone) Snd.zone(0.8 + aw / 15 * 0.6);
        this.lastZone = inZ;
      } else this.lastZone = false;
      const bx = c0.x + Math.cos(this.ang) * this.R * PPT, by = c0.y + Math.sin(this.ang) * this.R * PPT;
      this.trail.unshift([bx, by]); if (this.trail.length > 10) this.trail.pop();
      if (aw > 11 && Math.random() < 0.5) sparkle(bx, by, 1, true, [P.yellow, P.white, P.cyan]);
      this.excite = damp(this.excite, 0.2 + aw / 20, 2, dt);
      Snd.crowd(0.1 + aw / 40, 0.6);
    } else {
      // keep spinning down after release
      this.w *= Math.exp(-2.5 * dt); this.ang += this.w * dt;
      this.trail.length = 0;
    }
    const b = this.ball;
    if (b && !b.rest) {
      const n = 3, h = dt / n;
      for (let i = 0; i < n; i++) {
        b.x += b.vx * h; b.y += b.vy * h; b.vz -= 9.81 * h; b.z += b.vz * h;
        const r = Math.hypot(b.x, b.y);
        if (this.toCage && r > 3.4 && !b.landed) {
          b.landed = true; b.rest = true; this.cageHit = { x: b.x, y: b.y, t: 0 }; this.mark = null; this.foul = true;
          this.ph = 'land'; this.pt = 0; Snd.thwack(); Snd.crash(); shake(4, 0.25);
          pop('HIT THE CAGE!', W / 2, 110, { sc: 2, c: P.hot, life: 1.6 });
          break;
        }
        if (b.z <= 0) {
          b.z = 0;
          if (!b.landed) {
            b.landed = true; const dist = r - 1.0675;
            this.mark = this.inSector ? dist : null; this.foul = !this.inSector;
            this.divot = { x: b.x, y: b.y };
            this.ph = 'land'; this.pt = 0; Snd.thud(); shake(4, 0.3);
            const c = this.center();
            burst(c.x + b.x * PPT, c.y + b.y * PPT, 26, { cols: [P.brown, P.brown2, P.grass2, P.sand2], sp: 120, gr: 0, drag: 4, life: 0.8, hud: true });
            ringFX(c.x + b.x * PPT, c.y + b.y * PPT, P.white, true, 140);
          }
          b.vz = -b.vz * 0.22; b.vx *= 0.35; b.vy *= 0.35;
          if (Math.abs(b.vz) < 0.8) { b.vz = 0; b.vx *= Math.exp(-8 * h); b.vy *= Math.exp(-8 * h); if (Math.hypot(b.vx, b.vy) < 0.2) b.rest = true; }
        }
      }
      if (this.ph === 'flight') this.excite = damp(this.excite, 0.8, 3, dt);
    }
    if (this.cageHit) this.cageHit.t += dt;
    // camera follows the ball up the field
    let ty = 0;
    if (b) { const gy = this.cyS + b.y * PPT; ty = Math.max(0, H * 0.48 - gy); }
    this.camY = damp(this.camY, ty, b && !b.landed ? 6 : 4, dt);
    if (this.ph === 'land') {
      if (this.pt > 0.6 && !this.shown && this.state === 'play') {
        this.shown = true;
        if (this.foul) { if (!this.cageHit) pop('OUT OF SECTOR', W / 2, 118, { sc: 2, c: P.hot, life: 2 }); pop('FOUL', W / 2, 150, { sc: 5, c: P.hot, life: 2 }); Snd.foul(); this.flag = 'red'; }
        else { this.flag = 'white'; this.lastVal = this.mark; this.celebrate(SCORE.hammer(this.mark), this.mark.toFixed(2) + 'M'); }
      }
      if (this.pt > 3.0 && this.state === 'play') this.recordMark(this.mark, !this.foul, this.foul ? 'FOUL' : '');
    }
  }
  draw() {
    const c = this.center();
    // grass stripes, anchored to the world
    const band = 28;
    const off = ((c.y % (band * 2)) + band * 2) % (band * 2);
    for (let y = off - band * 2; y < H; y += band) {
      const idx = Math.floor((y - c.y) / band + 1000);
      R(0, y, W, band, idx % 2 ? P.grass : P.grass2);
    }
    // sector
    const sa = 0.3047, up = -Math.PI / 2;
    for (const s of [-1, 1]) {
      const a = up + s * sa, ex = c.x + Math.cos(a) * 112 * PPT, ey = c.y + Math.sin(a) * 112 * PPT;
      line(c.x, c.y, ex, ey, 0.5, P.white);
    }
    // distance arcs
    const pb = S.pbs.hammer, prev = this.marks.find((m) => m.ok);
    const arcs = [];
    for (let d = 10; d <= 100; d += 10) arcs.push([d, 'rgba(255,255,255,0.65)', String(d)]);
    if (pb) arcs.push([pb, P.yellow, 'PB']);
    if (prev) arcs.push([prev.val, P.cyan, '1ST']);
    arcs.push([WR.hammer, P.hot, 'WR']);
    for (const [d, col, lab] of arcs) {
      const rr = (d + 1.0675) * PPT;
      if (c.y - rr > H + 10 || c.y - rr * Math.cos(sa) < -10) continue;
      g.fillStyle = col;
      const steps = Math.ceil(rr * sa * 2 / 2);
      for (let i = 0; i <= steps; i++) {
        if (lab.length <= 3 && /\d/.test(lab) && i % 2) continue;
        const a = up - sa + (i / steps) * sa * 2;
        g.fillRect(Math.round(c.x + Math.cos(a) * rr), Math.round(c.y + Math.sin(a) * rr), 2, 1);
      }
      const lx = Math.min(rr * Math.sin(sa) + 4, W / 2 - 30) * (lab === 'PB' || lab === '1ST' ? -1 : 1);
      const ly = c.y - Math.sqrt(Math.max(0, rr * rr - lx * lx));
      text(lab, c.x + lx, ly - 9, { sc: 1, al: 'c', c: col.startsWith('rgba') ? P.white : col });
    }
    // divot + resting ball
    if (this.divot) ellipse(c.x + this.divot.x * PPT, c.y + this.divot.y * PPT, 4, 2, P.brown2);
    // cage
    const cr = 3.4 * PPT, ca0 = up + 0.62, ca1 = up - 0.62 + TAU;
    const posts = 12;
    let prevPt = null;
    for (let i = 0; i <= posts; i++) {
      const a = ca0 + (ca1 - ca0) * (i / posts);
      let px = c.x + Math.cos(a) * cr, py = c.y + Math.sin(a) * cr;
      if (this.cageHit) {
        const hx = c.x + this.cageHit.x * PPT, hy = c.y + this.cageHit.y * PPT, dd = Math.hypot(px - hx, py - hy);
        const bulge = Math.max(0, 1 - dd / 40) * 8 * Math.exp(-this.cageHit.t * 3) * Math.cos(this.cageHit.t * 18);
        px += Math.cos(a) * bulge; py += Math.sin(a) * bulge;
      }
      if (prevPt) { g.globalAlpha = 0.55; line(prevPt[0], prevPt[1], px, py, 0.5, P.ink); g.globalAlpha = 1; }
      prevPt = [px, py];
    }
    for (let i = 0; i <= posts; i++) { const a = ca0 + (ca1 - ca0) * (i / posts); disc(c.x + Math.cos(a) * cr, c.y + Math.sin(a) * cr, 1.6, P.dark); }
    // throwing circle
    disc(c.x, c.y, 1.0675 * PPT + 2, P.white); disc(c.x, c.y, 1.0675 * PPT, '#a9b3bc');
    for (let i = 0; i < 24; i++) R(c.x - 12 + ((i * 37) % 24), c.y - 10 + ((i * 53) % 20), 1, 1, '#98a1aa');
    // release zone
    const aw = Math.abs(this.w);
    if ((this.ph === 'spin') && aw > 2) {
      const zc = this.zoneCenter(), inZ = Math.abs(wrapA(this.ang - zc)) < 0.55;
      const rr = this.R * PPT;
      for (let a = -0.55; a <= 0.55; a += 0.04) {
        const x = c.x + Math.cos(zc + a) * rr, y = c.y + Math.sin(zc + a) * rr;
        disc(x, y, inZ ? 2.6 : 1.8, P.ink); disc(x, y, inZ ? 1.8 : 1.1, inZ ? P.lime : P.green);
      }
      if (inZ && aw > 6) text('NOW!', c.x + Math.cos(zc) * (rr + 22), c.y + Math.sin(zc) * (rr + 22) - 3, { sc: 1, al: 'c', c: P.lime });
    }
    // trail
    for (let i = this.trail.length - 1; i >= 1; i--) {
      const [tx, ty] = this.trail[i]; g.globalAlpha = 0.5 * (1 - i / this.trail.length) * clamp(aw / 8, 0, 1);
      disc(tx, ty, 3, aw > 11 ? P.yellow : P.white); g.globalAlpha = 1;
    }
    // thrower (top-down)
    const fa = this.ang, k = KIT_PLAYER;
    const px = Math.cos(fa + Math.PI / 2), py = Math.sin(fa + Math.PI / 2), fx = Math.cos(fa), fy = Math.sin(fa);
    const hx = c.x + fx * 13, hy = c.y + fy * 13;
    const sL = [c.x + px * 7, c.y + py * 7], sR = [c.x - px * 7, c.y - py * 7];
    ellipse(c.x + 3, c.y + 3, 10, 8, 'rgba(26,28,44,0.3)');
    line(sL[0], sL[1], hx, hy, 3.2, P.ink); line(sR[0], sR[1], hx, hy, 3.2, P.ink);
    disc(sL[0], sL[1], 5.2, P.ink); disc(sR[0], sR[1], 5.2, P.ink); disc(c.x, c.y, 8, P.ink);
    line(sL[0], sL[1], hx, hy, 2, k.skin); line(sR[0], sR[1], hx, hy, 2, k.skin);
    disc(sL[0], sL[1], 4, k.top); disc(sR[0], sR[1], 4, k.top); disc(c.x, c.y, 6.8, k.top);
    R(c.x - fx * 3 - 1, c.y - fy * 3 - 1, 3, 3, k.top2);
    disc(c.x - fx * 1.5, c.y - fy * 1.5, 5, k.hair); disc(c.x + fx * 1.5, c.y + fy * 1.5, 2.2, k.skin);
    { const bx = -fx * 1.5 - px * 5, by = -fy * 1.5 - py * 5, ex = -fx * 1.5 + px * 5, ey = -fy * 1.5 + py * 5; line(c.x + bx, c.y + by, c.x + ex, c.y + ey, 0.9, k.band); }
    disc(hx, hy, 1.6, P.white);
    // hammer
    if (!this.ball) {
      const bx = c.x + fx * this.R * PPT, by = c.y + fy * this.R * PPT;
      line(hx, hy, bx, by, 0.5, P.silver);
      ellipse(bx + 3, by + 3, 4, 3, 'rgba(26,28,44,0.35)');
      disc(bx, by, 5.6, P.ink); disc(bx, by, 4.5, aw > 11 ? '#6b7a99' : P.dark); R(bx - 2, by - 3, 2, 2, P.silver);
    } else {
      const b = this.ball, gx = c.x + b.x * PPT, gy = c.y + b.y * PPT, by = gy - b.z * PPT * 0.5, r = 4.5 + b.z * 0.08;
      ellipse(gx, gy, 3.5, 2, 'rgba(26,28,44,0.35)');
      if (!b.landed) { const len = 6; for (let i = 1; i <= 3; i++) R(gx - b.vx * 0.04 * i * len, by - b.vy * 0.04 * i * len, 2, 2, 'rgba(255,255,255,' + (0.45 - i * 0.12) + ')'); }
      // trailing wire
      const wa = Math.atan2(b.vy, b.vx) + Math.PI + Math.sin(this.t * 14) * 0.4;
      line(gx + Math.cos(wa) * 2, by + Math.sin(wa) * 2, gx + Math.cos(wa) * 14, by + Math.sin(wa) * 14, 0.5, P.silver);
      disc(gx, by, r + 1, P.ink); disc(gx, by, r, P.dark); R(gx - 2, by - 2, 2, 1, P.silver);
    }
    if (this.flag) {
      const fx2 = c.x + 34, fy2 = c.y - 40;
      R(fx2, fy2, 2, 22, P.slate); R(fx2 + 2, fy2 + Math.round(Math.sin(this.t * 10)), 14, 9, this.flag === 'red' ? P.hot : P.white);
    }
    drawParts(0, 0, false);
    // HUD
    let big = '';
    if (this.ph === 'ready') big = 'SPIN TO START';
    else if (this.ph === 'spin') big = Math.round(aw * this.R * 3.6) + ' KM/H';
    else if (this.ball && !this.ball.landed) big = Math.max(0, Math.hypot(this.ball.x, this.ball.y) - 1.07).toFixed(1) + 'M';
    else if (this.ph === 'land') big = this.foul ? 'FOUL' : this.mark.toFixed(2) + 'M';
    this.hud(big, this.ph === 'land' && !this.foul ? P.yellow : aw > 13 ? P.yellow : P.white);
    if (this.ph === 'spin' || this.ph === 'ready') {
      R(0, 40, W, 14, 'rgba(26,28,44,0.6)');
      this.speedMeter(aw, 14.5, 43);
      text('SPINS ' + Math.floor(this.spins), W - 6, 44, { sc: 1, al: 'r', c: P.silver });
      if (this.ph === 'ready' || this.spins < 1.2) {
        const a = this.t * 4, rr = 70;
        const dx = c.x + Math.cos(a) * rr, dy = c.y + Math.sin(a) * rr;
        g.globalAlpha = 0.85; disc(dx, dy, 6, P.white); disc(dx, dy, 4, P.cyan); g.globalAlpha = 1;
        text('CIRCLE YOUR FINGER AROUND ME', W / 2, H - 46, { sc: 1, al: 'c', c: P.white });
      } else if (aw > 4) text('LIFT FINGER WHEN THE BALL IS GREEN', W / 2, H - 46, { sc: 1, al: 'c', c: P.lime });
      else text('FASTER! STAY AHEAD OF THE BALL', W / 2, H - 46, { sc: 1, al: 'c', c: P.yellow });
    }
  }
}

function makeEvent(def, cfg) {
  const C = { sprint: Sprint, hurdles: Hurdles, longjump: LongJump, javelin: Javelin, hammer: Hammer }[def.id];
  return new C(def, cfg);
}
