
// ================= UI =================
let lastMsg = { t: 0, text: '' };
function log(text, kind) { if (kind === 'warn') console.debug('[warn]', text); }
function msg(text) { const now = performance.now(); if (text === lastMsg.text && now - lastMsg.t < 2500) return; lastMsg.t = now; lastMsg.text = text; toast(text); }
function toast(text, kind, ms = 4200) {
  const el = document.createElement('div'); el.className = 'toast' + (kind ? ' ' + kind : ''); el.textContent = text; $('toasts').prepend(el);
  while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
  setTimeout(() => el.remove(), ms); return el;
}
// ---------- VHF channel 80: Portishead Quays Marina ----------
function radio(who, text) {
  const li = document.createElement('li'); li.className = who === 'me' ? 'me' : ''; li.textContent = (who === 'me' ? 'You: ' : 'Marina: ') + text;
  const ul = $('vhfLog'); ul.appendChild(li); while (ul.children.length > 6) ul.firstChild.remove(); ul.scrollTop = ul.scrollHeight;
  toast((who === 'me' ? '📻 ' : '📻 Portishead Quays Marina: ') + text, 'radio', 7000);
  if (AU.beep) AU.beep(who === 'me' ? 1400 : 900, 0.06);
}
function speak(text) {
  if (!AU.on || !window.speechSynthesis) return;
  try { const u = new SpeechSynthesisUtterance(text.replace(/VHF/g, 'V H F')); u.lang = 'en-GB'; u.rate = 1.05; u.pitch = 0.95; u.volume = 0.8; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { }
}
// the marina calling: prio 2 to all stations, 1 to you
function say(text, prio = 1) { if (!S) return; radio('marina', text); speak(text); void prio; }
const T5 = (ms) => ukHHMM(ms);
function callMarina() {
  if (!S || !S.running) return;
  initAudio();
  const R = RB, w = waterBody(R.x, R.y), ms = S.ms, N = nextLockTimes(ms), W = N.W, inCh = inChamber(R.x, R.y);
  const intent = inCh ? 'lock' : w === 'marina' ? 'out' : 'in';
  radio('me', `Portishead Quays Marina, RIB Patrol. ${intent === 'out' ? 'Request a lock-out' : intent === 'in' ? 'Outside, request a lock-in' : 'In the chamber, standing by'}, over.`);
  if (R.drill.id === 'lock' && intent !== 'lock') R.drill.called = intent;
  const hw = `High water ${T5(W.hw.ms)}, ${W.hw.h.toFixed(1)} metres`;
  let rep;
  if (LKS.mode === 'ff') rep = 'RIB Patrol, we are free-flowing: both gates are open. Proceed with caution on green-white-green.';
  else if (intent === 'lock') rep = LKS.mode === 'level' ? 'RIB Patrol, stay made fast, we are levelling you now. Out on green-white-green.' : 'RIB Patrol, stay made fast please. The gates will open shortly; out on green-white-green.';
  else if (!W.open && ms < W.from) rep = `RIB Patrol, the lock is shut until ${T5(W.from)}. First lock-out ${T5(Math.ceil(W.from / 1800000) * 1800000)}, first lock-in a quarter of an hour after. ${hw}.`;
  else if (!N.out.length && !N.inn.length) rep = `RIB Patrol, that was the last lock on this tide. ${hw}.`;
  else if (intent === 'out') {
    const nowOpen = LKS.sigIn === 'go';
    rep = nowOpen ? 'RIB Patrol, lock-out now: come straight in on green-white-green and make fast either side. Lines and fenders both sides.' : `RIB Patrol, next lock-out ${T5(N.out[0])}. Make your way to the lock and wait clear of the gates; in on green-white-green. Lines and fenders both sides.`;
  } else {
    const nowOpen = LKS.sigOut === 'go';
    rep = nowOpen ? 'RIB Patrol, lock-in now: come in on green-white-green and make fast either side.' : `RIB Patrol, next lock-in ${T5(N.inn[0])}. Hold off clear of the entrance along the pier; in on green-white-green. Lines and fenders both sides.`;
  }
  setTimeout(() => say(rep + ' Over.'), 2200);
}
// ---------- the chart ----------
// A chart in the chart app's colours drawn once from the seabed grid (2 m a pixel), with the marina, pier, pontoons, marks
// and the boat drawn over it as vectors at whatever scale.
const PAL = { land: '#ecd99c', town: '#dcc78a', dry: '#8fbf96', b05: '#78b2e6', b510: '#a2c8ef', deep: '#d6ecec', ink: '#1d2327', label: '#55503a' };
const GARMIN_PAL = PAL;
const CHART = (() => {
  const R = 2, W = Math.round((DOM.x1 - DOM.x0) / R), H = Math.round((DOM.y1 - DOM.y0) / R);
  const c = document.createElement('canvas'); c.width = W; c.height = H; return { c, R, W, H, ready: false };
})();
function buildChart() {
  const { c, R, W, H } = CHART, g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const col = (z) => z >= 13.2 ? [236, 217, 156] : z >= 0 ? [143, 191, 150] : z >= -5 ? [120, 178, 230] : z >= -10 ? [162, 200, 239] : [214, 236, 236];
  for (let j = 0; j < H; j++) {
    const y = DOM.y1 - (j + 0.5) * R;
    for (let i = 0; i < W; i++) {
      const x = DOM.x0 + (i + 0.5) * R, z = inBox(FINE, x, y, -2) ? gridAt(FINE, x, y) : gridAt(GRID, x, y), k = (j * W + i) * 4, cc = col(z);
      d[k] = cc[0]; d[k + 1] = cc[1]; d[k + 2] = cc[2]; d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const P = (x, y) => [(x - DOM.x0) / R, (DOM.y1 - y) / R], poly = (pts, fill, stroke, lw = 1) => { g.beginPath(); pts.forEach(([x, y], i) => { const [u, v] = P(x, y); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  // the town's buildings, faintly
  { const q = b64bytes(PD.bld), dv = new DataView(q.buffer); let o = 0; g.fillStyle = 'rgba(176,150,90,.55)';
    while (o < q.length) { const n = dv.getUint16(o + 2, true); o += 4; g.beginPath(); for (let i = 0; i < n; i++) { const [u, v] = P(dv.getInt16(o, true) / 2, dv.getInt16(o + 2, true) / 2); i ? g.lineTo(u, v) : g.moveTo(u, v); o += 4; } g.fill(); } }
  // depth contours at 0, 5 and 10 m
  g.lineWidth = 0.8;
  for (const [lv, cs] of [[0, 'rgba(60,90,120,.55)'], [-5, 'rgba(60,90,120,.35)'], [-10, 'rgba(60,90,120,.3)']]) {
    g.strokeStyle = cs; g.beginPath();
    for (let j = 0; j < GRID.ny - 1; j++) for (let i = 0; i < GRID.nx - 1; i++) {
      const z0 = GRID.z[j * GRID.nx + i], z1 = GRID.z[j * GRID.nx + i + 1], z2 = GRID.z[(j + 1) * GRID.nx + i];
      const x = GRID.x0 + (i + 0.5) * GRID.step, y = GRID.y0 + (j + 0.5) * GRID.step;
      if ((z0 - lv) * (z1 - lv) < 0) { const [u, v] = P(x + GRID.step / 2, y); g.moveTo(u, v - 2.5); g.lineTo(u, v + 2.5); }
      if ((z0 - lv) * (z2 - lv) < 0) { const [u, v] = P(x, y + GRID.step / 2); g.moveTo(u - 2.5, v); g.lineTo(u + 2.5, v); }
    }
    g.stroke();
  }
  poly(DOCK, '#a2c8ef', '#5a6a70', 1.2); poly(PIER, PAL.land, '#5a6a70', 1);
  CHART.ready = true;
}
function drawChart(g, W, H, v) {
  if (!CHART.ready) buildChart();
  const s = Math.min(W, H) / v.span, u = v.u || 1;   // pixels a metre
  const P = (x, y) => [W / 2 + (x - v.cx) * s, H / 2 - (y - v.cy) * s];
  g.save(); g.fillStyle = PAL.deep; g.fillRect(0, 0, W, H);
  // the base chart
  const sx = (v.cx - v.span * W / Math.min(W, H) / 2 - DOM.x0) / CHART.R, sy = (DOM.y1 - (v.cy + v.span * H / Math.min(W, H) / 2)) / CHART.R;
  g.imageSmoothingEnabled = s * CHART.R < 3;
  g.fillStyle = '#d9dcd6'; g.fillRect(0, 0, W, H);   // beyond the charted area
  { const k = s * CHART.R, sw = W / k, sh = H / k, x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(CHART.W, sx + sw), y1 = Math.min(CHART.H, sy + sh);
    if (x1 > x0 && y1 > y0) g.drawImage(CHART.c, x0, y0, x1 - x0, y1 - y0, (x0 - sx) * k, (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k); }
  const poly = (pts, fill, stroke, lw = 1) => { g.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = P(x, y); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  if (v.span < 1400) {
    poly(DOCK, null, '#4d5a60', 1.2 * u);
    for (const p of PONT) poly(p.P, '#6f7477', null);
    if (v.span < 500) { g.fillStyle = 'rgba(255,255,255,.85)'; for (const b of BOATS) { const [a, c] = P(b.x, b.y); g.save(); g.translate(a, c); g.rotate(b.psi); g.fillRect(-b.B / 2 * s, -b.L / 2 * s, b.B * s, b.L * s); g.restore(); } }
    // the lock: its gates and signals
    for (const [sgi, st] of [[LOCK.sIn, LKS.gIn], [LOCK.sOut, LKS.gOut]]) { const a = lkP(sgi, LOCK.cNW), b = lkP(sgi, LOCK.cSE); g.strokeStyle = st > 0.98 ? 'rgba(40,40,40,.25)' : '#222'; g.lineWidth = 2.2 * u; g.beginPath(); g.moveTo(...P(...a)); g.lineTo(...P(...b)); g.stroke(); }
    for (const [sgn, s0, c0] of [[LKS.sigOut, LOCK.sOut + 6, LOCK.cSE + 3], [LKS.sigIn, LOCK.sIn - 6, LOCK.cNW - 3]]) { const [a, b] = P(...lkP(s0, c0)); g.fillStyle = sgn === 'go' ? '#3dff6a' : '#ff3b30'; g.beginPath(); g.arc(a, b, 4 * u, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke(); }
    // the hammerhead for the drill
    const D = RB.drill;
    if (D.id === 'alongside' && D.h) { const [a, b] = P(...D.h.berth); g.strokeStyle = '#1aa860'; g.lineWidth = 3 * u; g.beginPath(); g.arc(a, b, 9 * u, 0, 7); g.stroke(); }
  }
  // the dredged channel from the lock along the sea wall: a pecked outline and its depth, as charts show dredged areas
  if (v.span < 3200) {
    g.save(); g.setLineDash([6 * u, 4 * u]); g.strokeStyle = 'rgba(29,35,39,.75)'; g.lineWidth = 1.2 * u;
    for (const off of [0, CHANNEL.w]) { g.beginPath(); for (let sc = CHANNEL.s0 - 6; sc <= CHANNEL.s1; sc += 6) { const [a, b] = P(...lkP(sc, channelLo(sc) + off)); sc === CHANNEL.s0 - 6 ? g.moveTo(a, b) : g.lineTo(a, b); } g.stroke(); }
    g.setLineDash([]);
    if (v.span < 1600) { const [a, b] = P(...lkP(380, channelLo(380) + CHANNEL.w / 2)); g.translate(a, b); g.rotate(-52 * DEG); g.fillStyle = PAL.ink; g.font = `600 ${Math.round(10 * u)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.fillText('Dredged channel, dries 2.0', 0, 3 * u); }
    g.restore();
  }
  // marks and lights
  for (const m of PD.marks) {
    const [a, b] = P(...m.p); if (a < -20 || b < -20 || a > W + 20 || b > H + 20) continue;
    g.fillStyle = m.k === 'stbd' ? '#2f9d52' : m.k === 'port' ? '#d23a33' : '#e8c21a'; g.strokeStyle = '#111'; g.lineWidth = 1;
    g.beginPath(); if (m.k === 'stbd') { g.moveTo(a, b - 7 * u); g.lineTo(a + 5 * u, b + 4 * u); g.lineTo(a - 5 * u, b + 4 * u); } else g.rect(a - 4 * u, b - 5 * u, 8 * u, 9 * u); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = PAL.ink; g.font = `600 ${Math.round(11 * u)}px "Barlow Condensed", sans-serif`; g.textAlign = 'left'; g.fillText(m.n, a + 7 * u, b + 3 * u);
  }
  for (const l of PD.lights) { const [a, b] = P(...l.p); g.fillStyle = '#b32bb3'; g.beginPath(); g.arc(a, b, 3.5 * u, 0, 7); g.fill(); }
  if (v.names !== false) {
    g.fillStyle = PAL.label; g.font = `italic 600 ${Math.round(12 * u)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center';
    for (const n of PD.names) { const [a, b] = P(...n.p); if (a > 0 && b > 0 && a < W && b < H) g.fillText(n.n, a, b); }
    if (v.span < 2600) { const [a, b] = P(-200, -230); g.save(); g.translate(a, b); g.rotate(-52 * DEG); g.fillText('Portishead Marina', 0, 0); g.restore(); }
  }
  // track
  if (v.track) { for (let i = 1; i < v.track.length; i++) { const p0 = v.track[i - 1], p1 = v.track[i]; g.strokeStyle = p1[2] < 3 ? '#5fc9da' : p1[2] < 8 ? '#9fdc6a' : p1[2] < 20 ? '#f2c230' : '#ff5a4f'; g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(...P(p0[0], p0[1])); g.lineTo(...P(p1[0], p1[1])); g.stroke(); } }
  // the casualty and the boat
  if (RB.cas) { const [a, b] = P(RB.cas.x, RB.cas.y); g.fillStyle = '#f06a1c'; g.beginPath(); g.arc(a, b, 5 * u, 0, 7); g.fill(); }
  { const [a, b] = P(RB.x, RB.y), L = Math.max(10 * u, 5 * s); g.save(); g.translate(a, b); g.rotate(RB.psi); g.fillStyle = '#e8402f'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -L); g.lineTo(L * 0.5, L * 0.6); g.lineTo(-L * 0.5, L * 0.6); g.closePath(); g.fill(); g.stroke(); g.restore(); }
  // scale bar
  { const nice = [10, 20, 50, 100, 200, 500, 1000, 2000], m = nice.find(n => n * s > W * 0.18) || 2000, x0 = 10 * u, y0 = H - 10 * u; g.strokeStyle = PAL.ink; g.lineWidth = 2 * u; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + m * s, y0); g.stroke(); g.fillStyle = PAL.ink; g.font = `600 ${Math.round(11 * u)}px "IBM Plex Mono", monospace`; g.textAlign = 'left'; g.fillText(m >= 1000 ? m / 1000 + ' km' : m + ' m', x0, y0 - 4 * u); }
  g.restore();
}
let mapZoom = 'harbour';
function drawMap() {
  if (!S) return;
  const c = $('map'), g = c.getContext('2d');
  drawChart(g, c.width, c.height, { cx: RB.x, cy: RB.y, span: mapZoom === 'harbour' ? 320 : 2600, u: 1.9, names: mapZoom !== 'harbour' });
  if (MAPX.open) drawMapX();
}
const MAPX = { open: false, c: $('mapXC'), cx: 0, cy: 0, span: 1200, follow: true, u: 1, ptrs: new Map(), trk: null };
function mapXSize() { const c = MAPX.c, r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3); c.width = Math.max(50, Math.round(r.width * dpr)); c.height = Math.max(50, Math.round(r.height * dpr)); MAPX.u = dpr * 0.8; }
function drawMapX() { if (MAPX.follow) { MAPX.cx = RB.x; MAPX.cy = RB.y; } drawChart(MAPX.c.getContext('2d'), MAPX.c.width, MAPX.c.height, { cx: MAPX.cx, cy: MAPX.cy, span: MAPX.span, u: MAPX.u, track: MAPX.trk }); }
function mapXOpen(on) { MAPX.open = on; $('mapX').hidden = !on; if (on) { MAPX.follow = true; setC($('mxCentre'), 'on', true); mapXSize(); drawMapX(); } else { MAPX.trk = null; setC($('mxTrack'), 'on', false); } }
function mapXZoom(f, px, py) {
  const c = MAPX.c, m = MAPX.span / Math.min(c.width, c.height), ns = clamp(MAPX.span * f, 60, 12000), nm = ns / Math.min(c.width, c.height);
  if (px !== undefined && !MAPX.follow) { MAPX.cx += (px - c.width / 2) * (m - nm); MAPX.cy -= (py - c.height / 2) * (m - nm); }
  MAPX.span = ns; drawMapX();
}
$('map').addEventListener('click', () => mapXOpen(true));
$('mxClose').onclick = () => mapXOpen(false);
$('mxCentre').onclick = () => { MAPX.follow = true; setC($('mxCentre'), 'on', true); drawMapX(); };
$('mxIn').onclick = () => mapXZoom(1 / 1.6); $('mxOut').onclick = () => mapXZoom(1.6);
$('mxTrack').onclick = () => { MAPX.trk = MAPX.trk ? null : (TRK.last && TRK.last.pts); setC($('mxTrack'), 'on', !!MAPX.trk); drawMapX(); };
window.addEventListener('resize', () => { if (MAPX.open) { mapXSize(); drawMapX(); } });
MAPX.c.addEventListener('wheel', (ev) => { ev.preventDefault(); const r = MAPX.c.getBoundingClientRect(), k = MAPX.c.width / r.width; mapXZoom(Math.exp(ev.deltaY * 0.0015), (ev.clientX - r.left) * k, (ev.clientY - r.top) * k); }, { passive: false });
MAPX.c.addEventListener('pointerdown', (ev) => { try { MAPX.c.setPointerCapture(ev.pointerId); } catch (e) { } MAPX.ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); MAPX.c.classList.add('drag'); });
MAPX.c.addEventListener('pointermove', (ev) => {
  const Pm = MAPX.ptrs; if (!Pm.has(ev.pointerId)) return;
  const r = MAPX.c.getBoundingClientRect(), k = MAPX.c.width / r.width, m = MAPX.span / Math.min(MAPX.c.width, MAPX.c.height) * k;
  if (Pm.size === 1) {
    const p = Pm.get(ev.pointerId), dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    if (MAPX.follow && Math.hypot(dx, dy) < 3) return;
    if (MAPX.follow) { MAPX.follow = false; setC($('mxCentre'), 'on', false); }
    MAPX.cx -= dx * m; MAPX.cy += dy * m;
  } else if (Pm.size === 2) {
    const [a, b] = [...Pm.entries()], o = a[0] === ev.pointerId ? b[1] : a[1], p = Pm.get(ev.pointerId);
    const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(ev.clientX - o.x, ev.clientY - o.y);
    if (d0 > 10 && d1 > 10) mapXZoom(d0 / d1, ((ev.clientX + o.x) / 2 - r.left) * k, ((ev.clientY + o.y) / 2 - r.top) * k);
  }
  Pm.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); drawMapX();
});
for (const evn of ['pointerup', 'pointercancel', 'lostpointercapture']) MAPX.c.addEventListener(evn, (ev) => { MAPX.ptrs.delete(ev.pointerId); if (!MAPX.ptrs.size) MAPX.c.classList.remove('drag'); });
$('bMapZoom').onclick = () => { mapZoom = mapZoom === 'harbour' ? 'approaches' : 'harbour'; setT($('bMapZoom'), mapZoom === 'harbour' ? 'Approaches' : 'Harbour'); drawMap(); };
// ---------- your track, recorded twice a second, shown on the expanded chart after a drill ----------
const TRK = { pts: [], acc: 0, last: null };
function trkRec(dt, x, y, sog) { TRK.acc += dt; if (TRK.acc < 0.5) return; TRK.acc = 0; TRK.pts.push([x, y, sog]); if (TRK.pts.length > 6000) TRK.pts.shift(); }
function trkSnap(name) { TRK.last = { name, pts: TRK.pts.slice() }; $('mxTrack').hidden = false; }
$('repClose').onclick = () => { $('report').hidden = true; };
$('repTrack').onclick = () => { $('report').hidden = true; mapXOpen(true); MAPX.trk = TRK.last && TRK.last.pts; setC($('mxTrack'), 'on', true); MAPX.follow = false; MAPX.span = 900; drawMapX(); };

// ---------- place names over the land and water ----------
const LABELS = [];
function buildLabels() {
  const list = PD.names.concat([{ n: 'Portishead Marina', p: [-200, -250] }, { n: 'Portishead Pier', p: [205, 372] }]);
  for (const n of list) {
    const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '600 44px "Barlow Condensed", sans-serif'; const w = Math.ceil(g.measureText(n.n).width) + 24;
    c.width = w; c.height = 60; g.font = '600 44px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = 'rgba(10,18,22,.7)'; g.strokeText(n.n, w / 2, 30); g.fillStyle = '#f1f4f2'; g.fillText(n.n, w / 2, 30);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false }));
    const z = Math.max(heightAt(n.p[0], n.p[1]), 14) + 25; s.position.set(n.p[0], z, -n.p[1]); s.scale.set(0.05 * w / 60, 0.05, 1); s.renderOrder = 4; scene.add(s); LABELS.push(s);
  }
}
let namesOn = true;
function fadeLabels() {
  for (const s of LABELS) { const d = camera.position.distanceTo(s.position); s.visible = namesOn && d < 6000; s.material.opacity = namesOn ? clamp(1 - (d - 3500) / 2500, 0, 1) * clamp((d - 60) / 140, 0, 1) : 0; }
}

// ================= INPUT =================
const CONTROL_KEYS = new Set(['KeyR', 'KeyF', 'KeyX', 'KeyK', 'KeyL', 'KeyO', 'KeyG', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyH', 'KeyP', 'KeyC']);
window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Escape') { if (MAPX.open) mapXOpen(false); if (!$('help').hidden) $('help').hidden = true; if (!$('toolsMore').hidden) toolsMore(false); return; }
  if (!S || !$('menu').hidden) return;
  if (CONTROL_KEYS.has(ev.code)) ev.preventDefault();
  keys.add(ev.code);
  if (ev.repeat) return;
  initAudio();
  if (ev.code === 'Space') RB.lever = 0;
  if (ev.code === 'KeyX') ribEngine();
  if (ev.code === 'KeyK') ribKill();
  if (ev.code === 'KeyL') ribLines();
  if (ev.code === 'KeyO') ribMOB();
  if (ev.code === 'KeyC') RB.wheel = 0;
  if (ev.code === 'KeyG') ribSetDrill(DRILLS[(DRILLS.indexOf(RB.drill.id) + 1) % DRILLS.length]);
  if (ev.code === 'KeyV') cycleCam();
  if (ev.code === 'KeyT') cycleWarp();
  if (ev.code === 'KeyM') toggleSound();
  if (ev.code === 'KeyP') callMarina();
});
window.addEventListener('keyup', (ev) => keys.delete(ev.code));
window.addEventListener('blur', () => keys.clear());
// touch: the lever and the wheel, each following its own finger
function bindPad(el, move, end) {
  let id = null;
  el.addEventListener('pointerdown', (ev) => { if (id !== null) return; id = ev.pointerId; el.setPointerCapture(id); move(ev); ev.preventDefault(); initAudio(); });
  el.addEventListener('pointermove', (ev) => { if (ev.pointerId === id) move(ev); });
  const fin = (ev) => { if (ev.pointerId !== id) return; id = null; end(); };
  el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin); el.addEventListener('lostpointercapture', fin);
}
const KNOB = 29, levTravel = () => $('tLev').clientHeight / 2 - 40;
{
  let grab = null, was = null;
  bindPad($('tLev'), (ev) => {
    if (!grab) grab = { y: ev.clientY, s: sOfLev(RB.lever) };
    let s = clamp(grab.s + (grab.y - ev.clientY) / levTravel(), -1, 1);
    if (grab.s !== 0 && Math.sign(s) !== Math.sign(grab.s)) { grab = { y: ev.clientY, s: 0 }; s = 0; }   // it stops in neutral; drag on to go through
    const v = levOfS(s), at = v === 0 ? 'n' : Math.abs(v) === LEV_IDLE ? 'idle' : '';
    if (at && was !== null && at !== was) try { navigator.vibrate && navigator.vibrate(12); } catch (e) { }
    was = at; RB.lever = v; TOUCH.joy = true;
  }, () => { grab = null; was = null; TOUCH.joy = false; });
}
bindPad($('tSteer'), (ev) => { const r = $('tSteer').getBoundingClientRect(), Rr = r.width / 2 - KNOB - 4; RB.wheel = clamp((ev.clientX - r.left - r.width / 2) / Rr, -1, 1); TOUCH.steer = true; TOUCH.springRW = false; }, () => { TOUCH.steer = false; TOUCH.springRW = true; });
$('tStop').onclick = () => { RB.lever = 0; };
$('tHorn').addEventListener('pointerdown', () => { hornBtn = true; });
window.addEventListener('pointerup', () => { hornBtn = false; });
for (const [id, d] of [['tTrU', 1], ['tTrD', -1], ['rTrimUp', 1], ['rTrimDn', -1]]) {
  $(id).addEventListener('pointerdown', () => { TOUCH.trim = d; });
  for (const evn of ['pointerup', 'pointercancel', 'pointerleave']) $(id).addEventListener(evn, () => { TOUCH.trim = 0; });
}
$('tWarp').onclick = () => cycleWarp(); $('tCam').onclick = cycleCam;
function setTouch(on) { TOUCH.on = on; document.body.classList.toggle('touchon', on); setT($('bTouch'), on ? 'Touch controls: on' : 'Touch controls: off'); setC($('bTouch'), 'on', on); }
$('bTouch').onclick = () => setTouch(!TOUCH.on);
function updateTouch() {
  const show = TOUCH.on && S && S.running && $('menu').hidden; $('touch').hidden = !show; if (!show) return;
  const ST = $('tSteer'), R2 = ST.clientWidth / 2 - KNOB - 4;
  $('tSteerK').style.transform = `translate(${(RB.wheel * R2).toFixed(1)}px, 0)`;
  $('tLevK').style.transform = `translate(0, ${(-sOfLev(RB.lever) * levTravel()).toFixed(1)}px)`;
}
$('bMenu').onclick = () => { const o = $('hudL').classList.toggle('open'); $('bMenu').setAttribute('aria-expanded', String(o)); setT($('bMenu'), o ? 'Close' : 'Menu'); };
$('rEng').onclick = () => { initAudio(); ribEngine(); }; $('rKill').onclick = ribKill; $('rLines').onclick = ribLines; $('rMOB').onclick = ribMOB;
$('rDrill').onclick = () => ribSetDrill(DRILLS[(DRILLS.indexOf(RB.drill.id) + 1) % DRILLS.length]);
document.querySelector('#ribHud .rg').addEventListener('click', () => { if (PHONE.matches) ribFold(!document.body.classList.contains('ribfold')); });
$('bVhf').onclick = callMarina; $('bVhf2').onclick = callMarina;
const WARPS = [1, 2, 5, 10, 20];
function cycleWarp() { S.warp = WARPS[(WARPS.indexOf(S.warp) + 1) % WARPS.length]; setT($('bWarp'), `Time ×${S.warp}`); setT($('tWarp'), `×${S.warp}`); setC($('tWarp'), 'on', S.warp > 1); toast(S.warp > 1 ? `Time ×${S.warp}` : 'Time ×1: real time'); }
$('bWarp').onclick = cycleWarp;
$('bCam').onclick = cycleCam;
function toggleSound() { AU.on = !AU.on; setT($('bSound'), AU.on ? 'Sound on' : 'Sound off'); if (!AU.on && window.speechSynthesis) speechSynthesis.cancel(); }
$('bSound').onclick = () => { initAudio(); toggleSound(); };
function toolsMore(open) { $('toolsMore').hidden = !open; $('bMore').setAttribute('aria-expanded', String(open)); setT($('bMore'), open ? 'Settings ▴' : 'Settings ▾'); }
$('bMore').onclick = () => toolsMore($('toolsMore').hidden);
$('bHelp').onclick = () => { toolsMore(false); $('help').hidden = false; };
$('bHelp2').onclick = () => { $('help').hidden = false; };
$('helpClose').onclick = () => { $('help').hidden = true; };
$('bNew').onclick = () => location.reload();
$('bNames').onclick = () => { namesOn = !namesOn; setT($('bNames'), 'Place names: ' + (namesOn ? 'on' : 'off')); };
let gfxHigh = true;
$('bGfx').onclick = () => { gfxHigh = !gfxHigh; sun.castShadow = gfxHigh; if (TOWN.trees) TOWN.trees.forEach(m => { m.visible = gfxHigh; }); renderer.setPixelRatio(gfxHigh ? basePR() : 1); resize(); setT($('bGfx'), 'Detail: ' + (gfxHigh ? 'high' : 'low')); };
const FPS = { on: false, n: 0, acc: 0, max: 0 };
$('bFps').onclick = () => { FPS.on = !FPS.on; $('fpsBox').hidden = !FPS.on; setT($('bFps'), 'Frame rate: ' + (FPS.on ? 'on' : 'off')); };
function fpsTick(raw) { if (!FPS.on) return; FPS.n++; FPS.acc += raw; FPS.max = Math.max(FPS.max, raw); if (FPS.acc > 1) { setT($('fpsBox'), `${(FPS.n / FPS.acc).toFixed(0)} fps · slowest ${(FPS.max * 1000).toFixed(0)} ms`); FPS.n = 0; FPS.acc = 0; FPS.max = 0; } }
// jump the clock to a minute before the next lock event, running the lock on so its gates and levels are right
$('bSkip').onclick = () => {
  if (!S) return; toolsMore(false);
  const N = nextLockTimes(S.ms), next = Math.min(N.out[0] || Infinity, N.inn[0] || Infinity, N.W.open ? Infinity : N.W.from);
  const target = (isFinite(next) ? next : N.W.from) - 60000;
  if (target <= S.ms + 1000) return msg('The next lock is about now');
  fastForward(target);
  msg(`Clock moved on to ${ukHHMM(S.ms)}`);
};
function fastForward(target) {
  while (S.ms < target) { const d = Math.min(5, (target - S.ms) / 1000); S.t += d; S.ms = S.ms0 + S.t * 1000; S.tide = tideCD(S.ms); updateLock(d); }
  if (RB.fast && RB.pose) { RB.x = RB.pose.x; RB.y = RB.pose.y; RB.psi = RB.pose.psi; RB.u = RB.v = RB.r = 0; }
  S.ext = tideExtremes(S.ms - 7 * 3600e3, S.ms + 40 * 3600e3);
}
// pointer: orbit the chase camera, look about at the helm; pinch or scroll to zoom
let drag = null; const ptrs = new Map(); let pinch = null;
const pinchDist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
function zoomBy(f) {
  if (cam.mode === 'chase') { if (f < 1) { if (cam.dist > 6) cam.dist = Math.max(6, cam.dist * f); else cam.fov = Math.max(24, cam.fov * f); } else if (cam.fov < 55) cam.fov = Math.min(55, cam.fov * f); else cam.dist = Math.min(900, cam.dist * f); }
  else if (cam.mode === 'top') cam.topH = clamp(cam.topH * f, 30, 3000);
  else WH.fov = clamp(WH.fov * f, 28, 92);
}
canvas.addEventListener('pointerdown', (ev) => { try { canvas.setPointerCapture(ev.pointerId); } catch (e) { } ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); if (ptrs.size === 2) { drag = null; pinch = pinchDist(); return; } drag = { x: ev.clientX, y: ev.clientY }; initAudio(); });
canvas.addEventListener('pointermove', (ev) => {
  if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch && ptrs.size >= 2) { const d = pinchDist(); if (d > 10) zoomBy(pinch / d); pinch = d; return; }
  if (!drag) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag = { x: ev.clientX, y: ev.clientY };
  if (cam.mode === 'chase') { cam.az -= dx * 0.005; cam.el = clamp(cam.el + dy * 0.004, 0.03, 1.45); }
  else if (cam.mode === 'helm') { const k = WH.fov / 66; WH.yaw = clamp(WH.yaw - dx * 0.004 * k, -2.9, 2.9); WH.pitch = clamp(WH.pitch - dy * 0.003 * k, -1.2, 0.6); }
});
const endPointer = (ev) => { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; drag = null; };
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('dblclick', () => { cam.az = 0; cam.fov = 55; WH.yaw = 0; WH.pitch = -0.35; WH.fov = 72; });
canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomBy(1 + clamp(ev.deltaY, -200, 200) * 0.001); }, { passive: false });
// ---------- game controller (as in the Loch Ranza game): R2 ahead, L2 astern, left stick the wheel, ✕ engine, ○ lines ----------
const GP = { idx: null, on: false, prev: [], cruise: null, trig: false, steer: false, slamN: 0, contactT: -99, told: false };
window.addEventListener('gamepadconnected', (e) => { GP.idx = e.gamepad.index; GP.on = true; if (!GP.told) { GP.told = true; toast('Controller connected: R2 ahead, L2 astern, left stick steers, ✕ engine, ○ lines, △ view, L3 calls the marina', 'good'); } });
window.addEventListener('gamepaddisconnected', (e) => { if (GP.idx === e.gamepad.index) { GP.idx = null; GP.on = false; } });
function gpPad() { const ps = navigator.getGamepads ? navigator.getGamepads() : []; if (GP.idx !== null && ps[GP.idx]) return ps[GP.idx]; for (const q of ps) if (q) { GP.idx = q.index; return q; } return null; }
function gpRumble(p, ms, strong, weak) { try { if (p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { } }
function gpPoll(dt) {
  const p = gpPad(); if (!p) return;
  const bt = p.buttons, v = (i) => (bt[i] ? (bt[i].value || (bt[i].pressed ? 1 : 0)) : 0), down = (i) => v(i) > 0.5;
  const now = bt.map((x, i) => v(i) > 0.5), edge = (i) => now[i] && !GP.prev[i], done = () => { GP.prev = now; };
  if (!$('menu').hidden) { if (edge(0) || edge(9)) $('bGo').click(); return done(); }
  if (!S || !S.running) return done();
  const R = RB, r2 = v(7), l2 = v(6), trig = r2 > 0.05 || l2 > 0.05;
  if (edge(12) || edge(13)) GP.cruise = clamp(Math.round(((GP.cruise === null ? sOfLev(R.lever) : GP.cruise) + (edge(12) ? 0.1 : -0.1)) * 10) / 10, -1, 1);
  if (trig) { GP.cruise = null; GP.trig = true; R.lever = levOfS(clamp(r2 - l2, -1, 1)); }
  else { if (GP.trig) { GP.trig = false; R.lever = 0; } if (GP.cruise !== null) R.lever = levOfS(GP.cruise); }
  const sx = p.axes[0] || 0, dz = 0.12;
  if (Math.abs(sx) > dz) { const w = Math.sign(sx) * Math.pow((Math.abs(sx) - dz) / (1 - dz), 1.4); R.wheel = approach(R.wheel, w, 2.4 * dt); TOUCH.springRW = false; GP.steer = true; }
  else if (GP.steer) { GP.steer = false; TOUCH.springRW = true; }
  if (down(5)) R.trim = clamp(R.trim + 3 * dt, -4, 16);
  if (down(4)) R.trim = clamp(R.trim - 3 * dt, -4, 16);
  S.horn = S.horn || down(2);
  if (edge(0)) { initAudio(); ribEngine(); } if (edge(1)) ribLines(); if (edge(3)) cycleCam(); if (edge(8)) ribKill(); if (edge(9)) $('bMenu').click();
  if (edge(14)) ribMOB(); if (edge(15)) cycleWarp(); if (edge(10)) callMarina();
  const rx = p.axes[2] || 0, ry = p.axes[3] || 0, lx = Math.abs(rx) > 0.15 ? rx : 0, ly = Math.abs(ry) > 0.15 ? ry : 0;
  if (lx || ly) { if (cam.mode === 'helm') { WH.yaw -= lx * 1.6 * dt; WH.pitch = clamp(WH.pitch - ly * 1.0 * dt, -1.2, 0.8); } else { cam.az -= lx * 1.8 * dt; cam.el = clamp(cam.el + ly * 1.2 * dt, 0.03, 1.45); } }
  if (edge(11)) { cam.az = 0; WH.yaw = 0; WH.pitch = -0.35; }
  if (R.slamN !== GP.slamN) { GP.slamN = R.slamN; gpRumble(p, 160, clamp(R.slamV / 4, 0.25, 1), 0.4); }
  if (R.contactT !== GP.contactT) { GP.contactT = R.contactT; gpRumble(p, 90, 0.15, 0.6); }
  done();
}

// ================= GAME =================
function pickStart(kind) {
  const now = Date.now();
  if (kind === 'live') return now;
  const E = tideExtremes(now, now + 30 * 86400e3), day = (e, a, b) => { const h = ukHour(e.ms); return h >= a && h <= b; };
  let e;
  if (kind === 'window') e = E.find(e => e.hw && e.h >= 11.0 && e.h < 11.95 && day(e, 10.5, 17)) || E.find(e => e.hw && e.h >= 11 && day(e, 9, 18));
  else if (kind === 'neap') e = E.find(e => e.hw && e.h <= 10.2 && day(e, 10.5, 17)) || E.find(e => e.hw && e.h <= 10.6);
  else if (kind === 'free') e = E.find(e => e.hw && e.h >= 12.3 && day(e, 7, 20)) || E.find(e => e.hw && e.h >= 12.0);
  else if (kind === 'low') e = E.find(e => !e.hw && day(e, 10.5, 16));
  if (!e) return now;
  const off = { window: -2.5, neap: -3.0, free: -1.25, low: 0 }[kind] * 3600e3;
  return e.ms + off;
}
function updateEnv(dt) {
  const Wx = S.wx; S.tide = tideCD(S.ms);
  const g = 1 + Wx.gust * (fbm(S.t * 0.06, 3.3) - 0.5) * 2.4, from = Wx.from + (fbm(S.t * 0.01, 9.1) - 0.5) * 24;
  const spd = Math.max(0, Wx.wind * g) * KN, to = (from + 180) * DEG;
  S.wind = { x: Math.sin(to) * spd, y: Math.cos(to) * spd, spd, from };
  if (S.ms > S.ext[S.ext.length - 1].ms - 6 * 3600e3) S.ext = tideExtremes(S.ms - 7 * 3600e3, S.ms + 40 * 3600e3);
  void dt;
}
function newGame() {
  const val = (n) => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
  const tideK = val('tide') || 'window', light = val('light') || 'day', wxK = val('wx') || 'calm';
  savePrefs({ tide: tideK, light, wx: wxK });
  const ms0 = pickStart(tideK);
  S = { ms0, t: 0, ms: ms0, tide: tideCD(ms0), wx: WEATHER[wxK], wxKey: wxK, warp: 1, running: true, chop: null, horn: false, wind: { x: 0, y: 0, spd: 0, from: 220 }, ext: tideExtremes(ms0 - 7 * 3600e3, ms0 + 40 * 3600e3) };
  updateEnv(0);
  // the lock as it would be: run it on from an hour and a half before so its gates and levels are where they would be
  LKS.M = 13.3; LKS.L = 13.3; LKS.gIn = 1; LKS.gOut = 0; LKS.ff = false; LKS.ffDone = -1; LKS.ext = null; LKS.mode = 'inOpen';
  { const keep = S.ms0; S.ms0 = keep - 90 * 60000; S.t = 0; S.ms = S.ms0; const quiet = say; window.__quiet = true; void quiet; while (S.ms < keep) { S.t += 5; S.ms = S.ms0 + S.t * 1000; S.tide = tideCD(S.ms); updateLock(5); } S.ms0 = keep; S.t = 0; S.ms = keep; S.tide = tideCD(keep); window.__quiet = false; }
  setLight(light);
  scene.fog.far = S.wx.vis; for (const m of [waterNearMat, waterFarMat, basinWaterMat]) m.uniforms.uFogFar.value = S.wx.vis;
  // her berth: the slot by the marina office where the user's pin is, bow to the walkway, lying 0.3 m off the finger
  const st = (() => { const [a, b] = PD.start.finger, L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = uy, ny = -ux, sd = PD.start.side, off = 0.5 + 0.3 + RIBC.B / 2;
    return { x: a[0] + ux * 3.75 + nx * sd * off, y: a[1] + uy * 3.75 + ny * sd * off, psi: Math.atan2(-ux, -uy) }; })();
  S.chop = null; Object.assign(RB, { hz: 0, hw: 0, th: 0, q: 0, hzv: 0, thv: 0, eta: [null, null], airT: [0, 0], air: 0, gz: 1, gPeak: 1, flyT: 0, slamV: 0 });
  Object.assign(RB, { x: st.x, y: st.y, psi: st.psi, u: 0, v: 0, r: 0, rpm: 0, lever: 0, wheel: 0, trim: 0, eng: 'off', kill: true, vent: 0, fast: true, fastAt: 'berth', pose: { x: st.x, y: st.y, psi: st.psi }, gear: 0, contactMax: 0, cas: null, lv: LKS.M });
  RB._boxes = []; RB._cur = { x: 0, y: 0 }; RB._sea = 0.03; RB._shel = 0.7;
  { const A = ribAlongside(); RB.fastPts = fastPoints(A ? A.side : 1); }
  RIB.root.visible = true;
  ribSetDrill('free');
  cam.az = 2.6; cam.el = 0.3; cam.dist = 14; setCam('chase');
  $('ribHud').hidden = false;
  const W = lockWindow(ms0);
  toast(`Highfield Patrol 660. ${ukDay(ms0)} ${ukHHMM(ms0)}. Tide ${S.tide.toFixed(1)} m and ${tideCD(ms0 + 300000) > S.tide ? 'rising' : 'falling'}; high water ${ukHHMM(W.hw.ms)}, ${W.hw.h.toFixed(1)} m. Engine off, kill cord on: ${TOUCH.on ? 'Start eng, then Let go lines; Call marina for the lock' : 'X to start, L to let go, P to call the marina'}.`, 'good', 9000);
}
window.__quiet = false;
const sayLoud = say;
say = function (text, prio) { if (window.__quiet) return; sayLoud(text, prio); };   // eslint-disable-line no-func-assign
$('bGo').onclick = () => { $('menu').hidden = true; initAudio(); newGame(); };
// the start screen remembers the last choices
for (const [n, v] of Object.entries({ tide: PREFS.tide, light: PREFS.light, wx: PREFS.wx })) { if (!v) continue; const el = document.querySelector(`input[name=${n}][value=${v}]`); if (el) el.checked = true; }

// ================= CAMERA & RENDER =================
function resize() {
  const r = $('view').getBoundingClientRect();
  renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  camera.aspect = Math.max(1, r.width) / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('view'));
let last = performance.now(), uiAcc = 0, mapAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, rdt = clamp(raw, 0, 0.05); last = now;
  fpsTick(raw); gpPoll(rdt); fadeLabels();
  if (!S) { idleCam(now); renderer.render(scene, camera); return; }
  if (S.running) {
    ribHandleKeys(rdt);
    const sdt = rdt * S.warp; S.t += sdt; S.ms = S.ms0 + S.t * 1000;
    updateEnv(sdt); updateLock(sdt);
    ribUpdate(sdt); updateRibVisuals(sdt); updateWake();
  }
  updateTouch(); updateCamera(); updateMarina(); updateMarks(); if (S.running) updateFlowFoam(Math.min(rdt * S.warp, 0.25));
  const sx = Math.round(camera.position.x / WATER_CELL) * WATER_CELL, sz = Math.round(camera.position.z / WATER_CELL) * WATER_CELL;
  waterNear.position.set(sx, S.tide, sz); waterFar.position.set(sx, S.tide, sz); waterOrigin(sx, sz, S.t); updateWaterFlow(sx, sz);
  for (const m of [waterNearMat, waterFarMat, basinWaterMat]) { m.uniforms.uTime.value = S.t; m.uniforms.uTide.value = S.tide; m.uniforms.uRip.value = 0.035 + 0.008 * S.wind.spd; }
  waterNearMat.uniforms.uAmp.value = S.wx.wave; basinWaterMat.uniforms.uRip.value = 0.02 + 0.004 * S.wind.spd;
  sun.target.position.set(RB.x, RB.lv, -RB.y); sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 300);
  scene.userData.sky.position.copy(camera.position); scene.userData.sky.material.uniforms.uOff.value.set(S.t * 0.0006, S.t * 0.0002);
  renderView();
  uiAcc += rdt; mapAcc += rdt;
  if (uiAcc > 0.1) { uiAcc = 0; updateRibUI(); updateAudio(); }
  if (mapAcc > 0.2) { mapAcc = 0; drawMap(); }
}
// before a game: drift slowly round the marina
function idleCam(now) {
  const t = now / 1000, a = t * 0.04, cx = -120, cy = -120;
  camera.position.set(cx + Math.sin(a) * 420, 120, -(cy + Math.cos(a) * 420)); camera.lookAt(cx, 14, -cy);
  if (camera.near !== 2) { camera.near = 2; camera.fov = 55; camera.updateProjectionMatrix(); }
}

// ================= BOOT =================
buildSolid();
buildTerrain(); buildTown(); buildTrees(); buildMarina(); buildMarks(); buildRib(); buildLabels();
RIB.root.visible = false;
setLight('day'); setTouch(TOUCH.on); resize();
// a world before a game starts: the marina at its level, the tide as it is now
LKS.M = 13.3; LKS.L = 13.3;
{ const n = Date.now(); S = null; MAR.water.position.y = 13.3; MAR.pont.position.y = 13.3; MAR.boats.position.y = 13.3; MAR.lockWater.position.y = 13.3; waterNear.position.y = waterFar.position.y = tideCD(n); for (const m of [waterNearMat, waterFarMat]) m.uniforms.uTide.value = tideCD(n); }
window.PTH = { get S() { return S; }, RIBC, ribPhys, streamBase, currentAt, updateLock, newGame, pickStart, RB, LKS, heightAt, waterBody, levelAt, tideCD, tideExtremes, lockWindow, nextLockTimes, callMarina, ribLines, ribEngine, ribSetDrill, solidAt, inChamber, lkP, LOCK, PD, cam, setCam, fastForward, camera, scene, renderer };
requestAnimationFrame(frame);
})();
