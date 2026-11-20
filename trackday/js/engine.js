'use strict';
// =====================================================================
//  TRACK DAY — engine: utils, save data, canvas, pixel drawing, FX,
//  stadium scenery and the athlete rig.
// =====================================================================

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 10, 20)) / 864e5) + 1;
}

// ---------------------------------------------------------------- palette
const P = {
  ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', hot: '#e43b44', orange: '#ef7d57', yellow: '#ffcd75',
  lime: '#a7f070', green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6',
  cyan: '#73eff7', white: '#f4f4f4', silver: '#94b0c2', slate: '#566c86', dark: '#333c57',
  gold: '#ffd23f', gold2: '#e0a31a', brown: '#9a6233', brown2: '#5e3a22', sand: '#f2d38c', sand2: '#d9b368',
  tartan: '#d0573f', tartan2: '#b84a35', tartan3: '#a33f2d', grass: '#45b35a', grass2: '#3aa04e', grass3: '#2f8a43',
  skin: '#f3b98a', skin2: '#c98a5e', purple: '#9b4fd1',
};
const RAINBOW = [P.hot, P.orange, P.yellow, P.lime, P.cyan, P.sky, P.purple];

// ---------------------------------------------------------------- save
const STAND_H = 124, AS = 1.3; // grandstand height, athlete scale
const SAVE_KEY = 'trackday.save.v1';
const S = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { s = {}; }
  return Object.assign({ collection: {}, days: {}, pbs: {}, sound: true, streak: 0, bestStreak: 0, lastDone: null }, s);
})();
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

// ---------------------------------------------------------------- canvas
const cv = document.getElementById('game');
const g = cv.getContext('2d', { alpha: false });
let W = 360, H = 640;
const L = {};
function layout() {
  L.lane = 24;                  // lane spacing (px)
  L.ground = H - 186;           // feet line of the front lane
  L.trackTop = L.ground - 2 * L.lane - 20;
  L.trackBot = L.ground + 12;
  L.barTop = L.trackTop - 18;   // advertising boards
  L.standTop = L.barTop - STAND_H;  // grandstand
  L.padTop = H - 138;
  L.padBot = H - 16;
}
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  H = Math.round(clamp(W * vh / vw, 560, 800));
  cv.width = W; cv.height = H;
  const sc = Math.min(vw / W, vh / H);
  const wrap = document.getElementById('wrap');
  wrap.style.width = Math.floor(W * sc) + 'px';
  wrap.style.height = Math.floor(H * sc) + 'px';
  wrap.style.setProperty('--u', sc + 'px');
  g.imageSmoothingEnabled = false;
  layout();
  Scene.dirty = true;
}

// ---------------------------------------------------------------- pixel primitives
function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function disc(cx, cy, r, c) {
  if (c) g.fillStyle = c;
  const X = Math.round(cx), Y = Math.round(cy);
  if (r < 0.9) { g.fillRect(X, Y, 1, 1); return; }
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const s = r * r - dy * dy; if (s < 0) continue;
    const hw = Math.round(Math.sqrt(s));
    g.fillRect(X - hw, Y + dy, hw * 2 + 1, 1);
  }
}
function line(x0, y0, x1, y1, r, c) {
  g.fillStyle = c;
  const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= n; i++) { const t = i / n; disc(x0 + dx * t, y0 + dy * t, r); }
}
function ellipse(cx, cy, rx, ry, c) {
  g.fillStyle = c;
  const Y = Math.round(cy), ri = Math.ceil(ry);
  for (let dy = -ri; dy <= ri; dy++) {
    const s = 1 - (dy * dy) / (ry * ry); if (s < 0) continue;
    const hw = Math.round(rx * Math.sqrt(s));
    g.fillRect(Math.round(cx) - hw, Y + dy, hw * 2 + 1, 1);
  }
}
function ring(cx, cy, r, c, th = 1) {
  g.fillStyle = c;
  const n = Math.max(12, Math.ceil(r * 6.4));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), th, th);
  }
}
// pixel window panel
function panel(x, y, w, h, body = P.navy, edge = P.white) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(x + 2, y, w - 4, h, P.ink); R(x, y + 2, w, h - 4, P.ink); R(x + 1, y + 1, w - 2, h - 2, P.ink);
  R(x + 2, y + 2, w - 4, h - 4, edge);
  R(x + 3, y + 3, w - 6, h - 6, body);
  R(x + 3, y + 3, w - 6, 2, 'rgba(255,255,255,0.18)');
}

// ---------------------------------------------------------------- bitmap text (FONT from art.js)
function textW(s, sc = 1) { return String(s).length * 6 * sc - sc; }
function text(s, x, y, o = {}) {
  s = String(s).toUpperCase();
  const sc = o.sc || 1, ow = o.ow === undefined ? (sc >= 3 ? 2 : 1) : o.ow;
  const w = textW(s, sc);
  let x0 = o.al === 'c' ? x - w / 2 : o.al === 'r' ? x - w : x;
  x0 = Math.round(x0); y = Math.round(y);
  const t = o.t || 0;
  const passes = [];
  if (o.o !== null) {
    if (o.sh !== false && sc >= 2) passes.push([o.o || P.ink, ow, sc >= 3 ? 2 : 1]);
    passes.push([o.o || P.ink, ow, 0]);
  }
  passes.push([o.c || P.white, 0, 0]);
  for (let pi = 0; pi < passes.length; pi++) {
    const [col, e, dy] = passes[pi];
    for (let i = 0; i < s.length; i++) {
      const gl = FONT[s[i]]; if (!gl) continue;
      g.fillStyle = o.rainbow && pi === passes.length - 1 ? RAINBOW[(i + Math.floor(t * 12)) % RAINBOW.length] : col;
      const gx = x0 + i * 6 * sc;
      const gy = y + dy + (o.wave ? Math.round(Math.sin(t * 9 + i * 0.8) * o.wave) : 0);
      for (let k = 0; k < gl.length; k++) {
        const p = gl[k];
        g.fillRect(gx + p[0] * sc - e, gy + p[1] * sc - e, sc + e * 2, sc + e * 2);
      }
    }
  }
}

// ---------------------------------------------------------------- FX
const FX = { parts: [], pops: [], shakeA: 0, shakeT: 0, flashA: 0, flashC: '#fff', slow: 1, slowT: 0, sx: 0, sy: 0 };
function part(o) {
  const p = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, gr: 0, drag: 0, life: 1, c: '#fff', s: 2, hud: false, kind: 0, rot: 0, vr: 0, w: 2, h: 1 }, o);
  p.max = p.life; FX.parts.push(p); return p;
}
function burst(x, y, n, o = {}) {
  const cols = o.cols || [P.white];
  for (let i = 0; i < n; i++) {
    const a = o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread || TAU) : Math.random() * TAU;
    const sp = (o.sp || 80) * (0.25 + Math.random() * 0.75);
    part({
      x: x + (Math.random() - 0.5) * (o.jx || 0), y: y + (Math.random() - 0.5) * (o.jy || 0),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, gr: o.gr === undefined ? 200 : o.gr, drag: o.drag === undefined ? 1 : o.drag,
      life: (o.life || 0.6) * (0.5 + Math.random() * 0.7), c: cols[(Math.random() * cols.length) | 0],
      s: o.s || 2, hud: !!o.hud, kind: o.kind || 0,
    });
  }
}
function sparkle(x, y, n, hud, cols) { burst(x, y, n, { cols: cols || [P.white, P.yellow, P.cyan], sp: 120, gr: 40, life: 0.8, kind: 1, hud }); }
function ringFX(x, y, c, hud, sp = 160) { part({ x, y, kind: 3, c, life: 0.45, hud, s: sp }); }
function confetti(n = 90) {
  const cols = [P.hot, P.yellow, P.cyan, P.lime, P.white, P.orange, P.sky, P.purple];
  for (let i = 0; i < n; i++) {
    part({
      x: Math.random() * W, y: -10 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 50, vy: 30 + Math.random() * 70,
      gr: 25, drag: 0.6, life: 2.6 + Math.random() * 2, c: cols[i % cols.length], hud: true, kind: 2,
      w: 2 + ((Math.random() * 3) | 0), h: 2 + ((Math.random() * 2) | 0), rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
    });
  }
}
function pop(txt, x, y, o = {}) { FX.pops.push(Object.assign({ txt, x, y, t: 0, life: 1.3, c: P.yellow, sc: 3, hud: true, rise: 16, wave: 0 }, o)); }
function shake(a, t = 0.25) { FX.shakeA = Math.max(FX.shakeA, a); FX.shakeT = Math.max(FX.shakeT, t); }
function flash(c = '#fff', a = 0.6) { FX.flashC = c; FX.flashA = Math.max(FX.flashA, a); }
function slowmo(s, t) { FX.slow = s; FX.slowT = t; }
function clearFX() { FX.parts.length = 0; FX.pops.length = 0; FX.slowT = 0; FX.slow = 1; FX.flashA = 0; FX.shakeT = 0; }

function updateFX(dt, gdt) {
  if (FX.slowT > 0) { FX.slowT -= dt; if (FX.slowT <= 0) FX.slow = 1; }
  FX.flashA = Math.max(0, FX.flashA - dt * 2.5);
  if (FX.shakeT > 0) {
    FX.shakeT -= dt;
    const a = FX.shakeA * clamp(FX.shakeT / 0.25, 0, 1);
    FX.sx = Math.round((Math.random() - 0.5) * 2 * a); FX.sy = Math.round((Math.random() - 0.5) * 2 * a);
    if (FX.shakeT <= 0) { FX.shakeA = 0; FX.sx = FX.sy = 0; }
  }
  const ps = FX.parts;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i], d = p.hud ? dt : gdt;
    p.life -= d;
    if (p.life <= 0) { ps.splice(i, 1); continue; }
    p.vy += p.gr * d; const k = Math.exp(-p.drag * d); p.vx *= k; p.vy *= k;
    p.x += p.vx * d; p.y += p.vy * d; p.rot += p.vr * d;
  }
  for (let i = FX.pops.length - 1; i >= 0; i--) { const q = FX.pops[i]; q.t += dt; if (q.t > q.life) FX.pops.splice(i, 1); }
}
function drawParts(camX, camY, hud) {
  const ps = FX.parts;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]; if (p.hud !== hud) continue;
    const x = hud ? p.x : p.x - camX, y = hud ? p.y : p.y + camY;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const k = p.life / p.max;
    if (p.kind === 0) { const s = Math.max(1, Math.round(p.s * (0.4 + 0.6 * k))); R(x - s / 2, y - s / 2, s, s, p.c); }
    else if (p.kind === 1) {
      const s = k > 0.5 ? 2 : 1; g.fillStyle = p.c;
      g.fillRect(Math.round(x) - s, Math.round(y), s * 2 + 1, 1); g.fillRect(Math.round(x), Math.round(y) - s, 1, s * 2 + 1);
    } else if (p.kind === 2) {
      const w = Math.max(1, Math.round(Math.abs(Math.cos(p.rot)) * p.w + 0.5)); R(x, y, w, p.h, p.c);
    } else if (p.kind === 3) {
      const r = (1 - k) * p.s * 0.45 + 2; ring(x, y, r, p.c, k > 0.5 ? 2 : 1);
    } else if (p.kind === 4) { R(x, y, Math.round(p.s * k + 2), 1, p.c); }
  }
}
function drawPops(camX, camY) {
  for (const q of FX.pops) {
    const k = q.t / q.life;
    if (k > 0.78 && Math.floor(q.t * 24) % 2) continue;
    const sc = q.sc + (q.t < 0.06 ? 2 : q.t < 0.13 ? 1 : 0);
    const x = q.hud ? q.x : q.x - camX, y = (q.hud ? q.y : q.y + camY) - q.rise * Math.min(1, k * 3) - (sc - q.sc) * 3;
    text(q.txt, x, y, { sc, c: q.c, al: 'c', rainbow: q.rainbow, t: q.t, wave: q.wave });
  }
}
function drawScreenFX() {
  if (FX.flashA > 0.01) { g.globalAlpha = FX.flashA; R(0, 0, W, H, FX.flashC); g.globalAlpha = 1; }
}

// ---------------------------------------------------------------- scenery (side view)
const THEMES = {
  day: { name: 'SUNNY', sky: ['#3b7fdc', '#41a6f6', '#6cc4fa', '#a6e3fb'], cloud: '#f4f4f4', cloud2: '#c4e2f2', sun: '#fff3b0', stand: '#29366f', stand2: '#3b5dc9', roof: '#333c57', seat: ['#3b5dc9', '#4a6fe0'], night: false },
  sunset: { name: 'SUNSET', sky: ['#4a2160', '#93356a', '#e0664f', '#ffc073'], cloud: '#ffcd75', cloud2: '#ef7d57', sun: '#ffe9a8', stand: '#2a1f3d', stand2: '#5d275d', roof: '#1a1c2c', seat: ['#5d275d', '#733072'], night: false },
  night: { name: 'NIGHT', sky: ['#0b0c18', '#141628', '#1f2747', '#2c3a63'], cloud: '#333c57', cloud2: '#29366f', sun: null, stand: '#151726', stand2: '#29366f', roof: '#0b0c18', seat: ['#29366f', '#333c57'], night: true },
};
const CROWD_SHIRTS = [P.hot, P.yellow, P.white, P.cyan, P.lime, P.orange, P.sky, P.purple, '#ff8fb1', P.green];
const CROWD_SKIN = ['#f3b98a', '#c98a5e', '#8d5a3b', '#f6d2b0', '#6b4129'];
const BOARDS = [['TRACK DAY', P.hot, P.white], ['GO GO GO', P.yellow, P.ink], ['DAILY MEET', P.blue, P.white], ['SPEED', P.lime, P.ink], ['JUMP HIGH', P.orange, P.ink], ['THROW FAR', P.cyan, P.ink]];

const Scene = { dirty: true, theme: 'day', sky: null, stands: [], boards: null, track: null, grass: null, clouds: [] };
function off(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function setTheme(name) { if (Scene.theme !== name) { Scene.theme = name; Scene.dirty = true; } }

function buildScene() {
  const T = THEMES[Scene.theme];
  const rr = mulberry32(1234);
  // --- sky (full height so javelin flights can climb)
  const skyH = H;
  const [sc, sx] = off(W, skyH);
  const bands = T.sky, bh = Math.ceil(L.standTop / bands.length) + 6;
  for (let i = 0; i < bands.length; i++) { sx.fillStyle = bands[i]; sx.fillRect(0, i * bh, W, skyH); }
  for (let i = 1; i < bands.length; i++) { // dithered seams
    const y = i * bh;
    sx.fillStyle = bands[i - 1];
    for (let yy = 0; yy < 4; yy++) for (let x = (yy % 2); x < W; x += 2) if (yy < 2 || x % 4 === 0) sx.fillRect(x, y + yy, 1, 1);
  }
  if (T.night) { for (let i = 0; i < 90; i++) { sx.fillStyle = rr() < 0.2 ? P.yellow : P.white; sx.fillRect((rr() * W) | 0, (rr() * L.standTop * 0.9) | 0, 1, 1); } }
  if (T.sun) {
    const cx = 270, cy = Math.max(40, L.standTop - 50); sx.fillStyle = T.sun;
    for (let dy = -16; dy <= 16; dy++) { const hw = Math.round(Math.sqrt(256 - dy * dy)); sx.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1); }
  }
  Scene.sky = sc;
  // --- clouds
  Scene.clouds = [];
  for (let i = 0; i < 6; i++) Scene.clouds.push({ x: rr() * 900, y: 20 + rr() * Math.max(30, L.standTop - 90), w: 24 + rr() * 30, sp: 2 + rr() * 4 });
  // --- grandstand: two frames (sitting / jumping crowd)
  const SW = 256, SH = STAND_H;
  Scene.stands = [0, 1].map((frame) => {
    const [c, x] = off(SW, SH);
    const r = mulberry32(99);
    x.fillStyle = T.roof; x.fillRect(0, 0, SW, 10);
    x.fillStyle = T.stand2; x.fillRect(0, 10, SW, 2);
    x.fillStyle = T.stand; x.fillRect(0, 12, SW, SH - 12);
    for (let px = 8; px < SW; px += 64) { x.fillStyle = T.roof; x.fillRect(px, 10, 2, 8); }
    for (let row = 0; row < 20; row++) {
      const y = 18 + row * 6;
      if (y > SH - 12) break;
      x.fillStyle = T.seat[row % 2]; x.fillRect(0, y + 4, SW, 2);
      for (let col = 0; col < SW / 4; col++) {
        const cx = col * 4 + (row % 2) * 2;
        if (cx % 64 > 56) continue; // aisle
        const skin = CROWD_SKIN[(r() * CROWD_SKIN.length) | 0], shirt = CROWD_SHIRTS[(r() * CROWD_SHIRTS.length) | 0];
        const there = r() < 0.9, jumper = r() < 0.7;
        if (!there) continue;
        const up = frame && jumper ? 2 : 0;
        x.fillStyle = shirt; x.fillRect(cx, y + 2 - up, 3, 3);
        x.fillStyle = skin; x.fillRect(cx + 1, y - up, 2, 2);
        if (frame && jumper) { x.fillStyle = skin; x.fillRect(cx - 1, y - 2 - up, 1, 2); x.fillRect(cx + 3, y - 2 - up, 1, 2); }
      }
    }
    for (let px = 57; px < SW; px += 64) { x.fillStyle = T.seat[0]; x.fillRect(px, 14, 7, SH - 24); x.fillStyle = 'rgba(255,255,255,0.15)'; for (let y = 16; y < SH - 12; y += 3) x.fillRect(px, y, 7, 1); }
    x.fillStyle = T.stand2; x.fillRect(0, SH - 10, SW, 10);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, SH - 10, SW, 1);
    if (T.night) { x.fillStyle = 'rgba(255,240,180,0.08)'; x.fillRect(0, 12, SW, SH - 22); }
    return c;
  });
  // --- advertising boards
  {
    const BW = 64 * BOARDS.length, [c, x] = off(BW, 18);
    const old = g; // draw text using the main helper by temporarily retargeting
    BOARDS.forEach(([label, bg, fg], i) => {
      x.fillStyle = P.ink; x.fillRect(i * 64, 0, 64, 18);
      x.fillStyle = bg; x.fillRect(i * 64 + 1, 1, 62, 16);
      x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(i * 64 + 1, 1, 62, 2);
      const w = label.length * 6 - 1; let gx = i * 64 + 32 - Math.floor(w / 2);
      x.fillStyle = fg;
      for (const ch of label) { const gl = FONT[ch]; if (gl) for (const p of gl) x.fillRect(gx + p[0], 6 + p[1], 1, 1); gx += 6; }
    });
    void old;
    Scene.boards = c;
  }
  // --- track tile
  {
    const TW = 128, TH = L.trackBot - L.trackTop, [c, x] = off(TW, TH);
    const r = mulberry32(7);
    const lb = [L.ground - 2 * L.lane - 12, L.ground - L.lane - 12, L.ground - 12, L.ground + 11].map((y) => y - L.trackTop);
    x.fillStyle = P.tartan; x.fillRect(0, 0, TW, TH);
    x.fillStyle = P.tartan3; x.fillRect(0, 0, TW, lb[0]);
    x.fillStyle = P.tartan2; x.fillRect(0, lb[0], TW, lb[1] - lb[0]);
    for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? P.tartan2 : '#dc6a52'; x.fillRect((r() * TW) | 0, (r() * TH) | 0, 1, 1); }
    x.fillStyle = P.silver; x.fillRect(0, 0, TW, 1); x.fillStyle = P.white; x.fillRect(0, 1, TW, 1);
    x.fillStyle = 'rgba(244,244,244,0.85)';
    for (const ly of lb) x.fillRect(0, ly, TW, 1);
    Scene.track = c;
  }
  // --- infield grass tile
  {
    const [c, x] = off(64, 64);
    x.fillStyle = P.grass; x.fillRect(0, 0, 64, 64);
    x.fillStyle = P.grass2; x.fillRect(32, 0, 32, 64);
    const r = mulberry32(3);
    for (let i = 0; i < 60; i++) { x.fillStyle = r() < 0.5 ? P.grass3 : '#57c46a'; x.fillRect((r() * 64) | 0, (r() * 64) | 0, 1, 2); }
    Scene.grass = c;
  }
  Scene.dirty = false;
}

function tiled(img, ox, y, w) {
  const iw = img.width; let x = -(((ox % iw) + iw) % iw);
  for (; x < w; x += iw) g.drawImage(img, Math.round(x), Math.round(y));
}

// excite: 0..1 crowd energy, t time
function drawSideBG(camX, camY, excite, t) {
  if (Scene.dirty) buildScene();
  const T = THEMES[Scene.theme];
  // sky (shifted slightly with height)
  const skyY = Math.round(camY * 0.12);
  R(0, 0, W, skyY + 2, T.sky[0]);
  g.drawImage(Scene.sky, 0, skyY);
  // clouds
  for (const c of Scene.clouds) {
    const x = ((c.x - camX * 0.06 - t * c.sp) % 900 + 900) % 900 - 120, y = c.y + camY * 0.15;
    ellipse(x, y, c.w * 0.5, 5, T.cloud2); ellipse(x - 4, y - 3, c.w * 0.35, 5, T.cloud); ellipse(x + c.w * 0.25, y - 1, c.w * 0.25, 4, T.cloud);
  }
  // floodlights
  if (T.night) {
    for (let i = 0; i < 3; i++) {
      const x = ((i * 220 - camX * 0.3) % 660 + 660) % 660 - 60, y = L.standTop - 46 + camY * 0.5;
      R(x + 10, y + 10, 3, 40, P.dark); R(x, y, 24, 12, P.ink);
      for (let k = 0; k < 4; k++) { R(x + 2 + k * 5, y + 2, 4, 3, '#fff7d6'); R(x + 2 + k * 5, y + 6, 4, 3, '#fff7d6'); }
      g.globalAlpha = 0.07; ellipse(x + 12, y + 6, 40, 22, '#fff7d6'); g.globalAlpha = 1;
    }
  }
  // stands
  const fr = excite > 0.55 ? (Math.floor(t * (6 + excite * 6)) % 2) : (excite > 0.3 && Math.floor(t * 2) % 7 === 0 ? 1 : 0);
  tiled(Scene.stands[fr], camX * 0.35, L.standTop + camY * 0.5, W);
  // fill gap between stands and boards when camera climbs
  if (camY > 0) R(0, L.standTop + STAND_H + camY * 0.5, W, camY * 0.5 + 2, THEMES[Scene.theme].stand2);
  // boards
  tiled(Scene.boards, camX * 0.9, L.barTop + camY, W);
  // track
  tiled(Scene.track, camX, L.trackTop + camY, W);
  // infield grass
  const gy = L.trackBot + camY;
  if (gy < H) { for (let y = gy; y < H; y += 64) tiled(Scene.grass, camX, y, W); R(0, gy, W, 2, P.grass3); }
}

const wx = (m, camX) => m * PPM - camX;  // world metres -> screen x
const PPM = 22;
// line across all lanes at world x (slanted for depth)
function laneLine(m, camX, camY, c, th = 2, from = L.trackTop + 1, to = L.trackBot) {
  const x0 = wx(m, camX);
  if (x0 < -40 || x0 > W + 40) return;
  g.fillStyle = c;
  for (let y = from; y < to; y++) g.fillRect(Math.round(x0 + (L.trackBot - y) * 0.35), y + camY, th, 1);
}
function checkerLine(m, camX, camY) {
  const x0 = wx(m, camX); if (x0 < -40 || x0 > W + 40) return;
  for (let y = L.trackTop + 1; y < L.trackBot; y++) {
    const xx = Math.round(x0 + (L.trackBot - y) * 0.35);
    const k = Math.floor(y / 3) % 2;
    R(xx, y + camY, 3, 1, k ? P.ink : P.white); R(xx + 3, y + camY, 3, 1, k ? P.white : P.ink);
  }
}

// ---------------------------------------------------------------- athlete rig
const KIT_PLAYER = { top: '#e43b44', top2: '#a52a33', shorts: '#29366f', shorts2: '#1f2850', shoe: '#ffcd75', shoe2: '#e0a31a', band: '#f4f4f4', skin: '#f3b98a', skin2: '#c98a5e', hair: '#4a2b1a', num: P.white };
const RIVAL_KITS = [
  { top: '#3b5dc9', top2: '#29366f', shorts: '#f4f4f4', shorts2: '#94b0c2', shoe: '#73eff7', shoe2: '#41a6f6', band: '#ffcd75', skin: '#8d5a3b', skin2: '#6b4129', hair: '#1a1c2c', num: P.white },
  { top: '#38b764', top2: '#257179', shorts: '#1a1c2c', shorts2: '#0d0e1a', shoe: '#f4f4f4', shoe2: '#94b0c2', band: '#ef7d57', skin: '#f6d2b0', skin2: '#d6a883', hair: '#e8b04a', num: P.white },
  { top: '#9b4fd1', top2: '#5d275d', shorts: '#ffcd75', shorts2: '#e0a31a', shoe: '#a7f070', shoe2: '#38b764', band: '#73eff7', skin: '#c98a5e', skin2: '#9a6233', hair: '#1a1c2c', num: P.white },
];
const POSE_KEYS = ['lean', 'hipF', 'kneeF', 'hipB', 'kneeB', 'shF', 'elF', 'shB', 'elB', 'head'];
function lerpPose(a, b, t) { const o = {}; for (const k of POSE_KEYS) o[k] = lerp(a[k] || 0, b[k] || 0, t); return o; }
const POSE = {
  stand: { lean: 0.02, hipF: 0.06, kneeF: 0.1, hipB: -0.06, kneeB: 0.1, shF: 0.15, elF: 0.3, shB: -0.1, elB: 0.3 },
  marks: { lean: 1.25, hipF: 1.3, kneeF: 2.3, hipB: 0.4, kneeB: 1.9, shF: 0, elF: 0, shB: 0.05, elB: 0 },
  set: { lean: 1.35, hipF: 1.0, kneeF: 1.8, hipB: 0.2, kneeB: 1.2, shF: 0, elF: 0, shB: 0.05, elB: 0 },
  hurdle: { lean: 0.55, hipF: 1.55, kneeF: 0.1, hipB: -0.9, kneeB: 1.7, shF: 1.7, elF: 0.15, shB: -0.6, elB: 1.2 },
  takeoff: { lean: 0.0, hipF: 1.4, kneeF: 1.5, hipB: -0.5, kneeB: 0.2, shF: 2.6, elF: 0.3, shB: 2.2, elB: 0.4 },
  sail: { lean: -0.25, hipF: 0.5, kneeF: 1.5, hipB: -0.2, kneeB: 1.6, shF: 2.9, elF: 0.2, shB: 2.7, elB: 0.2 },
  landing: { lean: 0.75, hipF: 1.45, kneeF: 0.15, hipB: 1.35, kneeB: 0.25, shF: 1.5, elF: 0.1, shB: 1.3, elB: 0.2 },
  sit: { lean: 0.35, hipF: 1.5, kneeF: 0.35, hipB: 1.45, kneeB: 0.5, shF: 1.2, elF: 0.2, shB: 2.6, elB: 0.2 },
  victory: { lean: -0.05, hipF: 0.1, kneeF: 0.1, hipB: -0.1, kneeB: 0.15, shF: 2.75, elF: 0.2, shB: 2.95, elB: 0.2 },
  fall: { lean: 1.3, hipF: 0.9, kneeF: 0.6, hipB: -0.4, kneeB: 1.2, shF: 1.8, elF: 0.2, shB: 1.6, elB: 0.2 },
};
function runPose(ph, k) {
  k = clamp(k, 0, 1.15);
  const s = Math.sin(ph), c = Math.cos(ph);
  return {
    lean: 0.06 + 0.24 * k, head: -0.1 * k,
    hipF: 0.12 + 0.9 * k * s, kneeF: 0.25 + 1.55 * k * Math.max(0, c) + 0.15 * k,
    hipB: 0.12 - 0.9 * k * s, kneeB: 0.25 + 1.55 * k * Math.max(0, -c) + 0.15 * k,
    shF: -0.1 - 1.15 * k * s, elF: 1.2 + 0.3 * k + 0.25 * s,
    shB: -0.1 + 1.15 * k * s, elB: 1.2 + 0.3 * k - 0.25 * s,
  };
}
const runBob = (ph, k) => -Math.abs(Math.sin(ph)) * 2 * clamp(k, 0, 1);

// x,y = hip position (screen). Facing right. Returns useful joint positions.
function drawAthlete(x, y, p, k, o = {}) {
  const s = AS, TH = 10 * s, SH = 10 * s, TO = 13 * s, UA = 7 * s, FA = 7 * s, HR = Math.round(6 * s);
  const lean = p.lean || 0;
  const sx = x + Math.sin(lean) * TO, sy = y - Math.cos(lean) * TO;
  const ha = lean + (p.head || 0);
  const hx = sx + Math.sin(ha) * (HR + 1), hy = sy - Math.cos(ha) * (HR + 1);
  const leg = (a, kb) => {
    const kx = x + Math.sin(a) * TH, ky = y + Math.cos(a) * TH, b = a - kb;
    const ax = kx + Math.sin(b) * SH, ay = ky + Math.cos(b) * SH;
    return [kx, ky, ax, ay, ax + Math.cos(b) * 4 * s, ay - Math.sin(b) * 4 * s];
  };
  const arm = (a, eb) => {
    const ex = sx + Math.sin(a) * UA, ey = sy + Math.cos(a) * UA, b = a + eb;
    return [ex, ey, ex + Math.sin(b) * FA, ey + Math.cos(b) * FA];
  };
  const LF = leg(p.hipF, p.kneeF), LB = leg(p.hipB, p.kneeB), AF = arm(p.shF, p.elF), AB = arm(p.shB, p.elB);
  const ink = P.ink;
  // ---- outline pass (silhouette, 1px bigger)
  const oLeg = (Lg) => { line(x, y, Lg[0], Lg[1], 2.2 * s + 1, ink); line(Lg[0], Lg[1], Lg[2], Lg[3], 1.8 * s + 1, ink); line(Lg[2], Lg[3], Lg[4], Lg[5], 1.5 * s + 1, ink); };
  const oArm = (A) => { line(sx, sy, A[0], A[1], 1.5 * s + 1, ink); line(A[0], A[1], A[2], A[3], 1.4 * s + 1, ink); };
  oArm(AB); oLeg(LB); line(x, y, sx, sy, 3.8 * s + 1, ink); disc(hx, hy, HR + 1.2, ink); oLeg(LF); oArm(AF);
  // ---- fills
  const fLeg = (Lg, back) => {
    const sk = back ? k.skin2 : k.skin;
    line(x, y, Lg[0], Lg[1], 2.2 * s, sk); line(Lg[0], Lg[1], Lg[2], Lg[3], 1.8 * s, sk);
    line(x, y, x + (Lg[0] - x) * 0.45, y + (Lg[1] - y) * 0.45, 2.7 * s, back ? k.shorts2 : k.shorts);
    line(Lg[2], Lg[3], Lg[4], Lg[5], 1.5 * s, back ? k.shoe2 : k.shoe);
  };
  const fArm = (A, back) => { const sk = back ? k.skin2 : k.skin; line(sx, sy, A[0], A[1], 1.5 * s, back ? k.top2 : sk); line(A[0], A[1], A[2], A[3], 1.4 * s, sk); disc(A[2], A[3], 1.3 * s, sk); };
  fArm(AB, true); fLeg(LB, true);
  line(x, y, sx, sy, 3.8 * s, k.top);
  line(x, y, x + (sx - x) * 0.25, y + (sy - y) * 0.25, 3.9 * s, k.shorts);
  // bib number
  const bx = x + (sx - x) * 0.55 + Math.cos(lean) * 1.2, by = y + (sy - y) * 0.55 + Math.sin(lean) * 1.2;
  R(bx - 1, by - 2, 4, 4, k.num); R(bx, by - 1, 2, 2, k.top2);
  // head
  disc(hx, hy, HR, k.skin);
  g.fillStyle = k.hair;
  const HX = Math.round(hx), HY = Math.round(hy);
  for (let dy = -HR; dy <= -1; dy++) { const hw = Math.round(Math.sqrt(HR * HR - dy * dy)); g.fillRect(HX - hw, HY + dy, hw * 2 - 1, 1); }
  g.fillRect(HX - HR, HY, 4, 4);
  R(HX - HR, HY - 3, HR * 2 + 1, 2, k.band);
  // eye + mouth + ear
  R(HX + 2, HY - 1, 3, 3, P.white); R(HX + 4, HY - 1, 1, 3, P.ink);
  R(HX - 2, HY, 2, 2, k.skin2);
  if (o.face === 'happy') { R(HX + 2, HY + 4, 4, 1, P.ink); R(HX + 6, HY + 3, 1, 1, P.ink); R(HX + 1, HY + 3, 1, 1, P.ink); }
  else if (o.face === 'ouch') { R(HX + 3, HY + 3, 2, 3, P.ink); }
  else R(HX + 3, HY + 4, 3, 1, k.skin2);
  R(HX + HR - 1, HY + 1, 1, 1, '#f08f7a');
  fLeg(LF, false); fArm(AF, false);
  return { handF: [AF[2], AF[3]], handB: [AB[2], AB[3]], shoulder: [sx, sy], head: [hx, hy], footF: [LF[4], LF[5]], footB: [LB[4], LB[5]] };
}
function shadow(x, y, w = 9) { g.globalAlpha = 0.28; ellipse(x, y, w * AS, 2.5, P.ink); g.globalAlpha = 1; }

// ---------------------------------------------------------------- on-screen pads
function drawPad(pd, down, t) {
  const y = pd.y + (down ? 3 : 0), h = pd.h - (down ? 3 : 0); const sc = pd.lsc || 3;
  const base = pd.color || P.blue, dark = pd.dark || P.navy;
  R(pd.x + 2, pd.y + 4, pd.w, pd.h, 'rgba(0,0,0,0.35)');
  panel(pd.x, y, pd.w, h, down ? dark : base, down ? P.silver : P.white);
  if (!down) R(pd.x + 4, y + h - 8, pd.w - 8, 3, dark);
  const glow = pd.hint ? (Math.sin(t * 10) > 0 ? P.yellow : P.white) : P.white;
  text(pd.label, pd.x + pd.w / 2, y + h / 2 - sc * 3.5 - (pd.sub ? 6 : 0), { sc, al: 'c', c: glow });
  if (pd.sub) text(pd.sub, pd.x + pd.w / 2, y + h / 2 + sc * 3.5 + 2, { sc: 1, al: 'c', c: P.cyan });
}
function inPad(pd, p) { return p.x >= pd.x && p.x <= pd.x + pd.w && p.y >= pd.y - 6 && p.y <= pd.y + pd.h + 6; }
function controlDeck() {
  R(0, L.padTop - 12, W, H - L.padTop + 12, P.ink);
  R(0, L.padTop - 12, W, 2, P.dark);
  R(0, L.padTop - 10, W, 1, 'rgba(255,255,255,0.08)');
}
