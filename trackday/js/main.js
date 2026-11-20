'use strict';
// =====================================================================
//  TRACK DAY — main loop, input, daily meet flow and menus
// =====================================================================

const UI = document.getElementById('ui');
const G = { mode: 'menu', ev: null, meet: null, t: 0, finishing: false, att: { x: 0, leg: 0, x2: -3, leg2: 1 }, timer: null };

// ---------------------------------------------------------------- daily conditions (same for everyone)
const RIVAL_NAMES = ['ZIPPY', 'KOJO', 'MIRA', 'TEX', 'NOVA', 'DASH', 'PIP', 'RIO', 'JUNO', 'ACE', 'BEA', 'OTTO', 'SUKI', 'VIK', 'LUMI', 'REX', 'ODA', 'KIT'];
function dailyCfg(key) {
  const r = mulberry32(hash32('trackday:' + key));
  const theme = pick(r, ['day', 'day', 'sunset', 'night']);
  const wind = () => Math.round((r() * 4 - 1.6) * 10) / 10;
  const winds = { sprint: wind(), hurdles: wind(), longjump: wind(), javelin: wind(), hammer: 0 };
  const n1 = pick(r, RIVAL_NAMES); let n2 = pick(r, RIVAL_NAMES); while (n2 === n1) n2 = pick(r, RIVAL_NAMES);
  const k1 = Math.floor(r() * 3), k2 = (k1 + 1 + Math.floor(r() * 2)) % 3;
  const rivals = [
    { name: n1, kit: k1, sprint: 10.35 + r() * 0.5, hurdles: 13.55 + r() * 0.7 },
    { name: n2, kit: k2, sprint: 10.95 + r() * 0.6, hurdles: 14.45 + r() * 0.8 },
  ];
  return { key, day: dayNumber(key), theme, winds, rivals, seed: hash32('seed:' + key) };
}
function evCfg(D, i, practice) {
  const d = EV_DEFS[i];
  return { seed: (D.seed + i * 7919) >>> 0, wind: D.winds[d.id] || 0, rivals: D.rivals, theme: D.theme, practice: !!practice, index: i };
}
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return todayKey(d); };
const curStreak = () => (S.lastDone === todayKey() || S.lastDone === yesterdayKey() ? S.streak : 0);
const ownedCount = () => ARTIFACTS.filter((a) => S.collection[a.id]).length;

// ---------------------------------------------------------------- flow
function startEvent(i, practice) {
  const key = todayKey();
  const D = practice ? dailyCfg('practice:' + Math.random()) : dailyCfg(key);
  G.meet = { mode: practice ? 'practice' : 'daily', key, idx: i, D };
  const ev = makeEvent(EV_DEFS[i], evCfg(D, i, practice));
  ev.reset(); clearFX();
  G.ev = ev; G.mode = 'event'; G.finishing = false;
  setTheme(D.theme);
  hideUI();
  Snd.crowd(0.15);
}
function startMeet() {
  const key = todayKey();
  S.days[key] = S.days[key] || { events: [], done: false };
  const idx = S.days[key].events.length;
  if (idx >= 5) { finalScreen(); return; }
  startEvent(idx, false);
}

function finishEvent() {
  const ev = G.ev, d = ev.def, mark = ev.bestMark();
  const pts = mark == null ? 0 : SCORE[d.id](mark), medal = medalFor(pts);
  const wr = mark != null && (d.lower ? mark < WR[d.id] : mark > WR[d.id]);
  let pb = false;
  if (mark != null) {
    const old = S.pbs[d.id];
    if (old == null || (d.lower ? mark < old : mark > old)) { pb = old != null; S.pbs[d.id] = mark; }
  }
  const r = { def: d, mark, pts, medal, pb, wr, idx: G.meet.idx, practice: G.meet.mode === 'practice', art: null };
  if (!r.practice) {
    const rec = S.days[G.meet.key] = S.days[G.meet.key] || { events: [], done: false };
    if (rec.events.length === G.meet.idx) {
      const art = rollArtifact(d.id, pts, wr);
      if (art) { S.collection[art.id] = (S.collection[art.id] || 0) + 1; r.art = art; r.artCount = S.collection[art.id]; }
      rec.events.push({ id: d.id, mark, pts, medal, art: art ? art.id : null });
      if (rec.events.length === 5) finalizeMeet(rec);
    }
  }
  save();
  Snd.crowd(medal ? 0.45 : 0.2, 1);
  resultScreen(r);
}
function finalizeMeet(rec) {
  const key = G.meet.key;
  rec.done = true;
  rec.total = rec.events.reduce((s, e) => s + e.pts, 0);
  const ma = meetArtifact(rec.total, rec.events.map((e) => e.medal));
  if (ma) { S.collection[ma.id] = (S.collection[ma.id] || 0) + 1; rec.meetArt = ma.id; rec.meetArtSeen = false; }
  S.streak = S.lastDone === yesterdayKey() ? S.streak + 1 : S.lastDone === key ? S.streak : 1;
  S.lastDone = key; S.bestStreak = Math.max(S.bestStreak || 0, S.streak);
}

// ---------------------------------------------------------------- loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  tick(dt); requestAnimationFrame(frame);
}
function tick(dt) {
  G.t += dt;
  const gdt = dt * (FX.slowT > 0 ? FX.slow : 1);
  if (G.mode === 'event' && G.ev) {
    const ev = G.ev;
    ev.update(gdt, dt);
    if (ev.state === 'mark' && !ev.moreAttempts && ev.markT > 1.2 && !G.finishing) { G.finishing = true; finishEvent(); }
  } else {
    const a = G.att; a.x += dt * 5.2; a.leg += dt * (5.2 * 1.25 + 3); a.x2 += dt * 5.0; a.leg2 += dt * (5.0 * 1.25 + 3);
  }
  updateFX(dt, gdt);
  render();
}
function render() {
  g.save(); g.translate(FX.sx, FX.sy);
  if (G.mode === 'event' && G.ev) {
    const ev = G.ev;
    ev.draw();
    if (!ev.noDeck) {
      controlDeck();
      const pads = ev.pads();
      for (const pd of pads) drawPad(pd, ev.padDown[pd.id] !== undefined, G.t);
      if (ev.drawDeck) ev.drawDeck(G.t);
    }
  } else drawAttract();
  drawParts(0, 0, true);
  drawPops(0, 0);
  g.restore();
  if (G.mode === 'event' && G.ev) {
    if (G.ev.state === 'intro') drawIntro(G.ev);
    else if (G.ev.state === 'mark' && G.ev.moreAttempts) drawMarkBanner(G.ev);
  }
  drawScreenFX();
}
function drawAttract() {
  const a = G.att, camX = a.x * PPM - W * 0.45;
  drawSideBG(camX, 0, 0.35, G.t);
  for (let m = Math.floor(a.x / 10) * 10 - 20; m < a.x + 30; m += 10) laneLine(m, camX, 0, 'rgba(255,255,255,0.3)', 1, L.ground + 2, L.trackBot);
  const p2 = runPose(a.leg2, 0.75), p1 = runPose(a.leg, 0.8);
  const y2 = L.ground - L.lane;
  shadow(sxAt(a.x2, y2, camX), y2, 8);
  drawAthlete(sxAt(a.x2, y2, camX) - 2, y2 - (19 + runBob(a.leg2, 0.75)) * AS, p2, RIVAL_KITS[0]);
  shadow(sxAt(a.x, L.ground, camX), L.ground, 8);
  drawAthlete(sxAt(a.x, L.ground, camX) - 2, L.ground - (19 + runBob(a.leg, 0.8)) * AS, p1, KIT_PLAYER, { face: 'happy' });
}

// ---------------------------------------------------------------- intro card (canvas)
function introRect() { const pw = 316, ph = 292; return { x: (W - pw) / 2, y: Math.max(54, (H - ph) / 2 - 40), w: pw, h: ph }; }
function drawIntro(ev) {
  g.globalAlpha = 0.6; R(0, 0, W, H, P.ink); g.globalAlpha = 1;
  const r = introRect(), d = ev.def, t = G.t;
  panel(r.x, r.y, r.w, r.h, P.navy);
  const tag = ev.cfg.practice ? 'PRACTICE' : 'EVENT ' + (ev.cfg.index + 1) + ' OF 5';
  text(tag, W / 2, r.y + 10, { sc: 1, al: 'c', c: P.cyan });
  drawIcon(d.icon, W / 2 - 18, r.y + 22, 2);
  text(d.name, W / 2, r.y + 62, { sc: 3, al: 'c', c: P.yellow });
  const info = [];
  if (d.attempts > 1) info.push(d.attempts + ' TRIES - BEST COUNTS'); else info.push('ONE RUN');
  if (ev.cfg.wind && d.id !== 'hammer') info.push('WIND ' + fmtWind(ev.cfg.wind));
  text(info.join('   '), W / 2, r.y + 88, { sc: 1, al: 'c', c: P.silver });
  // demo
  R(r.x + 14, r.y + 102, r.w - 28, 86, P.ink);
  drawDemo(d.id, W / 2, r.y + 145, t, r);
  d.how.forEach((s, i) => text(s, W / 2, r.y + 200 + i * 13, { sc: 1, al: 'c' }));
  if (Math.floor(t * 2.5) % 2 === 0) text('TAP TO START', W / 2, r.y + r.h - 22, { sc: 2, al: 'c', c: P.lime });
  // menu button
  const mb = menuBtn();
  panel(mb.x, mb.y, mb.w, mb.h, P.dark, P.slate);
  text('< MENU', mb.x + mb.w / 2, mb.y + 7, { sc: 1, al: 'c', c: P.white });
  if (S.pbs[d.id] != null) text('PB ' + fmtMark(d, S.pbs[d.id]), W - mb.x, mb.y + 7, { sc: 1, al: 'r', c: P.yellow });
}
function menuBtn() { const r = introRect(); return { x: r.x, y: r.y + r.h + 10, w: 70, h: 22 }; }
function drawDemo(id, cx, cy, t, r) {
  const finger = (x, y, press) => { g.globalAlpha = 0.9; disc(x, y, press ? 5 : 6, P.white); disc(x, y, press ? 3 : 4, P.cyan); g.globalAlpha = 1; if (press) ring(x, y, 9, P.white); };
  const miniPad = (x, y, w, h, label, on, col) => { panel(x, y + (on ? 2 : 0), w, h - (on ? 2 : 0), on ? P.navy : col || P.blue, P.white); text(label, x + w / 2, y + h / 2 - 3, { sc: 1, al: 'c' }); };
  if (id === 'sprint' || id === 'longjump') {
    const ph = (t * 4) % 2 < 1;
    let jump = false;
    if (id === 'longjump') { const c = t % 3.2; jump = c > 2.0; }
    const y = cy - 4;
    miniPad(cx - 90, y, 50, 30, 'L', !jump && ph);
    miniPad(cx + 40, y, 50, 30, 'R', !jump && !ph);
    if (id === 'longjump') {
      miniPad(cx - 30, y, 60, 30, 'JUMP', jump, P.green);
      if (jump) {
        const a = (t % 3.2 - 2.0) / 1.2 * 45; text(Math.round(a) + ' DEG', cx, cy - 34, { sc: 1, al: 'c', c: a > 18 && a < 28 ? P.lime : P.yellow });
        finger(cx, y + 18, true);
      } else finger(ph ? cx - 65 : cx + 65, y + 18, Math.floor(t * 8) % 2 === 0);
    } else finger(ph ? cx - 65 : cx + 65, y + 18, Math.floor(t * 8) % 2 === 0);
    if (id === 'sprint') text('L R L R L R', cx, cy - 34, { sc: 1, al: 'c', c: P.yellow });
  } else if (id === 'hurdles') {
    // little runner dot approaching a hurdle
    const c = (t % 2) / 2, x = cx - 100 + c * 200, hxp = cx + 10;
    const hop = x > hxp - 40 && x < hxp + 30 ? Math.sin(((x - (hxp - 40)) / 70) * Math.PI) * 18 : 0;
    R(cx - 120, cy + 22, 240, 2, P.tartan);
    R(hxp, cy + 6, 2, 16, P.white); R(hxp - 4, cy + 4, 10, 3, P.white);
    R(hxp - 40, cy + 24, 2, 3, P.white);
    disc(x, cy + 14 - hop, 5, KIT_PLAYER.top);
    const pressing = x > hxp - 46 && x < hxp - 34;
    finger(cx + 90, cy - 8, pressing);
    text(pressing ? 'TAP!' : '', cx + 90, cy - 30, { sc: 1, al: 'c', c: P.lime });
  } else if (id === 'javelin') {
    const c = (t % 1.8) / 1.8;
    let x, y, press = true;
    if (c < 0.45) { x = cx + 40 - (c / 0.45) * 70; y = cy + 10 + (c / 0.45) * 10; }
    else if (c < 0.65) { const k = (c - 0.45) / 0.2; x = cx - 30 + k * 120; y = cy + 20 - k * 70; }
    else { x = cx + 90; y = cy - 50; press = false; }
    for (let i = 0; i < 14; i++) { const q = i / 14; R(cx - 30 + q * 120, cy + 20 - q * 70, 2, 2, 'rgba(115,239,247,0.35)'); }
    if (c > 0.6) text('FLICK!', cx + 60, cy - 36, { sc: 1, al: 'c', c: P.lime });
    if (y > cy - 50) finger(x, y, press);
  } else if (id === 'hammer') {
    disc(cx, cy, 6, KIT_PLAYER.top);
    const a = t * 5, b = a - 0.9;
    ring(cx, cy, 30, 'rgba(255,255,255,0.3)');
    line(cx, cy, cx + Math.cos(b) * 22, cy + Math.sin(b) * 22, 0.5, P.silver); disc(cx + Math.cos(b) * 22, cy + Math.sin(b) * 22, 3, P.dark);
    finger(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32, true);
    // zone
    for (let k = -0.5; k <= 0.5; k += 0.1) disc(cx + Math.cos(Math.PI + k) * 22, cy + Math.sin(Math.PI + k) * 22, 1, P.lime);
  }
}
function drawMarkBanner(ev) {
  const y = 64, last = ev.marks[ev.marks.length - 1];
  panel(30, y, W - 60, 74, P.navy);
  text('TRY ' + ev.attempt + ': ' + (last.ok ? fmtMark(ev.def, last.val) : last.note || 'FOUL'), W / 2, y + 12, { sc: 2, al: 'c', c: last.ok ? P.yellow : P.hot });
  const best = ev.bestMark();
  text('BEST: ' + (best == null ? '-' : fmtMark(ev.def, best)), W / 2, y + 34, { sc: 1, al: 'c', c: P.silver });
  if (ev.markT > 1.0 && Math.floor(G.t * 2.5) % 2 === 0) text('TAP FOR TRY ' + (ev.attempt + 1), W / 2, y + 52, { sc: 1, al: 'c', c: P.lime });
}

// ---------------------------------------------------------------- input
function toGame(e) { const r = cv.getBoundingClientRect(); return { id: e.pointerId, x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, t: performance.now() / 1000 }; }
function handleDown(p) {
  if (G.mode !== 'event' || !G.ev) return;
  const ev = G.ev;
  if (ev.state === 'intro') {
    const mb = menuBtn();
    if (p.x >= mb.x && p.x <= mb.x + mb.w && p.y >= mb.y - 4 && p.y <= mb.y + mb.h + 4) { Snd.click(); goTitle(); return; }
    Snd.click(); ev.begin(); return;
  }
  if (ev.state === 'mark') { if (ev.moreAttempts && ev.markT > 1.0) { Snd.click(); ev.begin(); } return; }
  if (ev.state !== 'play') return;
  if (!ev.noDeck) for (const pd of ev.pads()) if (inPad(pd, p)) { ev.padDown[pd.id] = p.id; ev.press(pd, p); break; }
  ev.down(p);
}
function handleMove(p) { if (G.mode === 'event' && G.ev && G.ev.state === 'play') G.ev.move(p); }
function handleUp(p) {
  if (G.mode !== 'event' || !G.ev) return;
  const ev = G.ev;
  for (const id in ev.padDown) if (ev.padDown[id] === p.id) { delete ev.padDown[id]; const pd = ev.pads().find((q) => q.id === id); if (pd) ev.release(pd, p); }
  ev.up(p);
}
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); Snd.init(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ } handleDown(toGame(e)); }, { passive: false });
cv.addEventListener('pointermove', (e) => { e.preventDefault(); const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; for (const ce of evs.length ? evs : [e]) handleMove(toGame(ce)); }, { passive: false });
cv.addEventListener('pointerup', (e) => { e.preventDefault(); handleUp(toGame(e)); }, { passive: false });
cv.addEventListener('pointercancel', (e) => handleUp(toGame(e)));
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (G.mode === 'event') e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// keyboard (desktop): arrows = L/R, space/up = jump
const KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', Space: 'J', ArrowUp: 'J', KeyW: 'J' };
const keyHeld = {};
document.addEventListener('keydown', (e) => {
  if (G.mode !== 'event' || !G.ev) return;
  const id = KEYMAP[e.code]; if (!id) return; e.preventDefault();
  if (keyHeld[e.code]) return; keyHeld[e.code] = true;
  Snd.init();
  const ev = G.ev;
  if (ev.state !== 'play') { handleDown({ id: 'kb', x: W / 2, y: H / 2, t: performance.now() / 1000 }); return; }
  const pd = ev.pads().find((q) => q.id === id) || (id === 'J' ? ev.pads()[0] : null);
  if (pd) { ev.padDown[pd.id] = 'kb' + e.code; ev.press(pd, {}); }
  if (id === 'J') ev.down({ id: 'kb' + e.code, x: W / 2, y: H / 2, t: performance.now() / 1000 });
});
document.addEventListener('keyup', (e) => {
  delete keyHeld[e.code];
  if (G.mode !== 'event' || !G.ev) return;
  const ev = G.ev, pid = 'kb' + e.code;
  for (const id in ev.padDown) if (ev.padDown[id] === pid) { delete ev.padDown[id]; const pd = ev.pads().find((q) => q.id === id); if (pd) ev.release(pd, {}); }
});

// ---------------------------------------------------------------- DOM screens
function showUI(html) { UI.innerHTML = html; UI.classList.add('on'); UI.scrollTop = 0; }
function hideUI() { UI.innerHTML = ''; UI.classList.remove('on'); if (G.timer) { clearInterval(G.timer); G.timer = null; } }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const medalHTML = (m) => (m ? `<i class="md ${m}"></i>` : '<i class="md none"></i>');
function niceDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase(); }

function goTitle() {
  G.mode = 'menu'; G.ev = null; clearFX();
  const key = todayKey(), D = dailyCfg(key); setTheme(D.theme);
  Snd.crowd(0.08, 1);
  const rec = S.days[key], idx = rec ? rec.events.length : 0, done = rec && rec.done;
  const rows = EV_DEFS.map((d, i) => {
    const e = rec && rec.events[i];
    const right = e ? `<span class="mk">${fmtMark(d, e.mark)}</span>${medalHTML(e.medal)}` : i === idx && !done ? '<b class="next">NEXT</b>' : '<span class="dim">-</span>';
    return `<div class="evrow ${e ? 'done' : ''}"><img src="${iconURL(d.icon, 3)}" alt=""><span class="nm">${d.name}</span><span class="rt">${right}</span></div>`;
  }).join('');
  const cond = THEMES[D.theme].name + (D.winds.sprint ? ' · WIND ' + fmtWind(D.winds.sprint) : '');
  const st = curStreak();
  showUI(`<div class="screen title">
    <div class="logo"><span class="l1">TRACK</span><span class="l2">DAY</span></div>
    <div class="tag">5 EVENTS · 1 TRY · EVERY DAY</div>
    <div class="box meet">
      <div class="mh"><span>MEET #${D.day}</span><span>${niceDate(key)}</span></div>
      <div class="cond">${cond}${st ? ` · <b>STREAK ${st}</b>` : ''}</div>
      ${rows}
      ${done ? `<div class="total">TOTAL <b>${(rec.total || 0).toLocaleString()}</b> PTS</div>` : ''}
    </div>
    ${done ? `<button class="btn big" data-act="final">TODAY'S RESULTS</button>`
    : `<button class="btn big go" data-act="start">${idx ? 'CONTINUE · EVENT ' + (idx + 1) + ' OF 5' : "START TODAY'S MEET"}</button>`}
    <div class="row">
      <button class="btn" data-act="trophy">TROPHY ROOM <small>${ownedCount()}/${ARTIFACTS.length}</small></button>
      <button class="btn" data-act="practice">PRACTICE</button>
    </div>
    <div class="row">
      <button class="btn slim" data-act="help">HOW TO PLAY</button>
      <button class="btn slim" data-act="sound">${S.sound ? 'SOUND: ON' : 'SOUND: OFF'}</button>
    </div>
  </div>`);
}

function countUp(el, to, dur, done) {
  const t0 = performance.now(); let lt = 0;
  const f = (now) => {
    const k = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
    el.textContent = v.toLocaleString();
    if (now - lt > 50 && k < 1) { Snd.count(); lt = now; }
    if (k < 1) requestAnimationFrame(f); else if (done) done();
  };
  if (to <= 0) { el.textContent = '0'; if (done) setTimeout(done, 150); return; }
  requestAnimationFrame(f);
}

function lootBox(art, count, onDone) {
  const wrap = document.createElement('div');
  wrap.className = 'loot';
  wrap.innerHTML = `<div class="lbl">YOU FOUND SOMETHING!</div><button class="gift" aria-label="Open"><img src="${iconURL('box', 5)}" alt=""><span>TAP TO OPEN</span></button>`;
  const btn = wrap.querySelector('.gift');
  btn.addEventListener('click', () => {
    if (btn.classList.contains('shake')) return;
    btn.classList.add('shake'); Snd.init();
    let n = 0; const iv = setInterval(() => { Snd.boxShake(); if (++n >= 6) clearInterval(iv); }, 110);
    setTimeout(() => {
      const rr = RARITY[art.rar];
      wrap.innerHTML = `<div class="reveal r-${art.rar}" style="--rc:${rr.c}">
        <div class="rays"></div>
        <img class="art" src="${iconURL(art.id, 6)}" alt="">
        <div class="rar">${rr.name}</div>
        <div class="aname">${esc(art.name)}</div>
        <div class="adesc">${esc(art.desc)}</div>
        <div class="cnt">${count === 1 ? 'NEW!' : 'x' + count + ' IN COLLECTION'}</div></div>`;
      Snd.reveal(art.rar);
      sparkle(W / 2, H * 0.5, 30 + rr.rank * 20, true, [rr.c, P.white, P.yellow]);
      if (rr.rank >= 2) { confetti(60 + rr.rank * 30); flash(rr.c, 0.35); }
      if (onDone) setTimeout(onDone, 500);
    }, 720);
  });
  return wrap;
}

function resultScreen(r) {
  const nextLabel = r.practice ? '' : r.idx < 4 ? 'NEXT EVENT &rsaquo;' : 'MEET RESULTS &rsaquo;';
  showUI(`<div class="screen result"><div class="card in">
    <div class="evh"><img src="${iconURL(r.def.icon, 3)}" alt=""><span>${r.def.name}</span>${r.practice ? '<em>PRACTICE</em>' : ''}</div>
    <div class="mark ${r.mark == null ? 'bad' : ''}">${fmtMark(r.def, r.mark)}</div>
    <div class="pts"><b id="pts">0</b> PTS</div>
    <div class="medalslot" id="medal"></div>
    <div class="badges" id="badges"></div>
    <div id="lootslot"></div>
    <div class="acts" id="acts">
      ${r.practice ? `<button class="btn big go" data-act="retry" data-i="${r.idx}">TRY AGAIN</button><button class="btn" data-act="practice">OTHER EVENT</button><button class="btn slim" data-act="title">MENU</button>`
    : `<button class="btn big go" data-act="${r.idx < 4 ? 'next' : 'final'}">${nextLabel}</button>`}
    </div>
  </div></div>`);
  const acts = UI.querySelector('#acts'); acts.style.visibility = 'hidden';
  countUp(UI.querySelector('#pts'), r.pts, 900, () => {
    const ms = UI.querySelector('#medal');
    if (!ms) return;
    if (r.medal) { ms.innerHTML = `<div class="medal ${r.medal}"><i></i><span>${r.medal.toUpperCase()}</span></div>`; r.medal === 'gold' ? Snd.fanfare() : Snd.coin(); }
    else ms.innerHTML = `<div class="nomedal">${r.mark == null ? 'NO MARK' : 'NO MEDAL - ' + (600 - r.pts) + ' PTS TO BRONZE'}</div>`;
    const b = [];
    if (r.wr) b.push('<span class="bd wr">WORLD RECORD!</span>');
    if (r.pb) b.push('<span class="bd pb">NEW PB!</span>');
    UI.querySelector('#badges').innerHTML = b.join('');
    if (r.art) {
      setTimeout(() => {
        const slot = UI.querySelector('#lootslot'); if (!slot) return;
        slot.appendChild(lootBox(r.art, r.artCount, () => { acts.style.visibility = 'visible'; }));
        Snd.coin();
      }, 450);
    } else {
      if (!r.practice && r.pts > 0 && r.pts < 560) UI.querySelector('#lootslot').innerHTML = '<div class="hint">SCORE 560+ FOR A CHANCE AT A TRACK ARTIFACT</div>';
      setTimeout(() => { acts.style.visibility = 'visible'; }, 300);
    }
  });
}

function shareText(key, rec) {
  const lines = [`TRACK DAY #${dayNumber(key)} 🏟️`, `${(rec.total || 0).toLocaleString()} pts`];
  const md = { gold: '🥇', silver: '🥈', bronze: '🥉' };
  rec.events.forEach((e) => { const d = DEF_BY_ID[e.id]; lines.push(`${d.emoji} ${fmtMark(d, e.mark).toLowerCase()} ${md[e.medal] || '▫️'}`); });
  const finds = rec.events.filter((e) => e.art).map((e) => ART_BY_ID[e.art]);
  if (rec.meetArt) finds.push(ART_BY_ID[rec.meetArt]);
  const best = finds.sort((a, b) => RARITY[b.rar].rank - RARITY[a.rar].rank)[0];
  if (best) lines.push(`✨ found: ${best.name} (${RARITY[best.rar].name.toLowerCase()})`);
  lines.push(location.origin + location.pathname);
  return lines.join('\n');
}

function finalScreen() {
  G.mode = 'menu'; G.ev = null;
  const key = todayKey(), rec = S.days[key];
  if (!rec || !rec.done) { goTitle(); return; }
  const rows = rec.events.map((e) => {
    const d = DEF_BY_ID[e.id];
    return `<div class="evrow done"><img src="${iconURL(d.icon, 3)}" alt=""><span class="nm">${d.name}</span><span class="rt"><span class="mk">${fmtMark(d, e.mark)}</span><span class="pp">${e.pts}</span>${medalHTML(e.medal)}</span></div>`;
  }).join('');
  const finds = rec.events.filter((e) => e.art).map((e) => ART_BY_ID[e.art]);
  const medals = rec.events.map((e) => e.medal);
  const golds = medals.filter((m) => m === 'gold').length;
  showUI(`<div class="screen final">
    <div class="hdr">MEET #${dayNumber(key)} COMPLETE</div>
    <div class="box">
      <div class="bigtotal"><b id="tot">0</b><span>POINTS</span></div>
      <div class="medalrow">${medals.map(medalHTML).join('')}</div>
      ${rows}
      ${finds.length ? `<div class="finds">FOUND TODAY: ${finds.map((a) => `<img title="${esc(a.name)}" src="${iconURL(a.id, 3)}" alt="">`).join('')}</div>` : ''}
    </div>
    <div id="meetloot"></div>
    <div class="acts" id="acts">
      <button class="btn big go" data-act="share">SHARE RESULTS</button>
      <div class="next">NEXT MEET IN <b id="cd">--:--:--</b></div>
      <div class="row"><button class="btn" data-act="trophy">TROPHY ROOM</button><button class="btn" data-act="practice">PRACTICE</button></div>
      <button class="btn slim" data-act="title">MENU</button>
    </div>
  </div>`);
  const acts = UI.querySelector('#acts');
  const tick = () => {
    const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
    const s = Math.max(0, Math.floor((mid - now) / 1000));
    const el = UI.querySelector('#cd'); if (!el) return;
    el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
    if (s === 0) goTitle();
  };
  tick(); G.timer = setInterval(tick, 1000);
  countUp(UI.querySelector('#tot'), rec.total || 0, 1400, () => {
    if (golds >= 3 || rec.total >= 4000) { confetti(120); Snd.fanfare(); } else Snd.coin();
    if (rec.meetArt && !rec.meetArtSeen) {
      acts.style.visibility = 'hidden';
      rec.meetArtSeen = true; save();
      const slot = UI.querySelector('#meetloot');
      const lb = lootBox(ART_BY_ID[rec.meetArt], S.collection[rec.meetArt], () => { acts.style.visibility = 'visible'; });
      lb.querySelector('.lbl').textContent = 'MEET BONUS!';
      slot.appendChild(lb);
    }
  });
}

function trophyScreen() {
  const groups = [['sprint', '100M DASH'], ['hurdles', '110M HURDLES'], ['longjump', 'LONG JUMP'], ['javelin', 'JAVELIN'], ['hammer', 'HAMMER THROW'], ['meet', 'MEET BONUSES']];
  const body = groups.map(([ev, name]) => {
    const items = ARTIFACTS.filter((a) => a.ev === ev).map((a) => {
      const n = S.collection[a.id] || 0, rr = RARITY[a.rar];
      return `<button class="cell ${n ? 'own' : 'lock'}" style="--rc:${rr.c}" data-act="art" data-id="${a.id}">
        <img src="${iconURL(a.id, 4, !n)}" alt=""><span class="cn">${n ? esc(a.name) : '???'}</span>${n > 1 ? `<i class="ct">x${n}</i>` : ''}</button>`;
    }).join('');
    return `<div class="grp"><div class="gh">${name}</div><div class="grid">${items}</div></div>`;
  }).join('');
  showUI(`<div class="screen trophy"><div class="hdr">TROPHY ROOM</div>
    <div class="sub">${ownedCount()} OF ${ARTIFACTS.length} FOUND · GREAT SCORES FIND RARER ARTIFACTS</div>
    ${body}
    <div id="artpop"></div>
    <button class="btn big" data-act="title">BACK</button></div>`);
}
function artPopup(id) {
  const a = ART_BY_ID[id], n = S.collection[id] || 0, rr = RARITY[a.rar];
  const ev = a.ev === 'meet' ? 'THE WHOLE MEET' : DEF_BY_ID[a.ev].name;
  UI.querySelector('#artpop').innerHTML = `<div class="modal" data-act="closepop"><div class="mbox" style="--rc:${rr.c}">
    <img src="${iconURL(a.id, 6, !n)}" alt=""><div class="rar">${rr.name}</div>
    <div class="aname">${n ? esc(a.name) : '???'}</div>
    <div class="adesc">${n ? esc(a.desc) : 'FOUND IN: ' + ev + (a.ev !== 'meet' ? '. SCORE HIGHER FOR RARER FINDS.' : '. ' + esc(a.desc))}</div>
    ${n ? `<div class="cnt">OWNED x${n}</div>` : ''}<div class="close">TAP TO CLOSE</div></div></div>`;
}
function practiceScreen() {
  showUI(`<div class="screen practice"><div class="hdr">PRACTICE</div>
    <div class="sub">FREE PLAY - NO ARTIFACTS, BUT PBS COUNT</div>
    <div class="box">${EV_DEFS.map((d, i) => `<button class="evbtn" data-act="retry" data-i="${i}"><img src="${iconURL(d.icon, 3)}" alt=""><span>${d.name}</span><small>${S.pbs[d.id] != null ? 'PB ' + fmtMark(d, S.pbs[d.id]) : ''}</small></button>`).join('')}</div>
    <button class="btn big" data-act="title">BACK</button></div>`);
}
function helpScreen() {
  showUI(`<div class="screen help"><div class="hdr">HOW TO PLAY</div>
    <div class="box txt">
      <p>Every day there's a new <b>5-event meet</b>, the same for everyone: same wind, same weather, same rivals. You get <b>one go</b> each day.</p>
      <p><b>100M DASH</b> · Tap L and R in turn, fast. Wait for the gun.</p>
      <p><b>110M HURDLES</b> · You run on your own. Tap to jump on the white mark. Perfect jumps chain into a speed combo.</p>
      <p><b>LONG JUMP</b> · Sprint with L/R. Hold JUMP before the board, let go at the best angle (about 20-25°), then tap again just before you land.</p>
      <p><b>JAVELIN</b> · Press, pull back, then flick up and forward. The flick's speed is the power, its direction is the angle. Throw before the line.</p>
      <p><b>HAMMER</b> · Draw circles around the thrower, keeping your finger ahead of the ball to speed it up. Lift off while the ball is in the green zone.</p>
      <p><b>POINTS</b> · Every mark becomes points (decathlon-style). 600 = bronze, 750 = silver, 900 = gold.</p>
      <p><b>ARTIFACTS</b> · Strong scores can unearth collectible track artifacts. The better the score, the rarer the find: common, rare, epic and legendary. Set a world record and a legendary is guaranteed.</p>
    </div>
    <button class="btn big" data-act="title">GOT IT</button></div>`);
}

UI.addEventListener('pointerdown', () => Snd.init());
UI.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act !== 'closepop' && act !== 'art') Snd.click();
  if (act === 'start') startMeet();
  else if (act === 'next') startMeet();
  else if (act === 'final') finalScreen();
  else if (act === 'title') goTitle();
  else if (act === 'trophy') trophyScreen();
  else if (act === 'help') helpScreen();
  else if (act === 'practice') practiceScreen();
  else if (act === 'retry') startEvent(+b.dataset.i, true);
  else if (act === 'sound') { S.sound = !S.sound; save(); if (!S.sound) Snd.crowd(0); goTitle(); }
  else if (act === 'art') { Snd.tick(); artPopup(b.dataset.id); }
  else if (act === 'closepop') UI.querySelector('#artpop').innerHTML = '';
  else if (act === 'share') {
    const txt = shareText(todayKey(), S.days[todayKey()]);
    const done = (m) => { b.textContent = m; setTimeout(() => { b.textContent = 'SHARE RESULTS'; }, 1800); };
    if (navigator.share) navigator.share({ text: txt }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => done('COPIED!'), () => done('COPY FAILED'));
  }
});

window.addEventListener('resize', resize);
resize();
goTitle();
requestAnimationFrame(frame);
// expose for testing
window.__TD = { G, S, startEvent, finishEvent, goTitle, EV_DEFS };
