(() => {
'use strict';
let S = null;   // the game's state, made by newGame
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180, KN = 0.514444;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const approach = (v, t, r) => v < t ? Math.min(t, v + r) : Math.max(t, v - r);
const wrap360 = (a) => ((a % 360) + 360) % 360;
const fmt3 = (a) => String(Math.round(wrap360(a)) % 360).padStart(3, '0');
const setT = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const setC = (el, c, on) => { if (el) el.classList.toggle(c, !!on); };
function hash(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), sx), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), sx), sy);
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 17, y * 2.1 - 9) * 0.3 + vnoise(x * 4.3 - 31, y * 4.3 + 5) * 0.15;
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PREFS = (() => { try { return JSON.parse(localStorage.getItem('portishead.prefs') || '{}') || {}; } catch (e) { return {}; } })();
function savePrefs(o) { Object.assign(PREFS, o); try { localStorage.setItem('portishead.prefs', JSON.stringify(PREFS)); } catch (e) { } }

// ================= GEOGRAPHY =================
// Metres east (x) and north (y) of 51.4910 N 2.7580 W, on a local flat grid. Heights are metres above chart datum (CD) at
// Portishead, the tide's own datum: the seabed is negative, drying ground positive up to about +12.5 m, land above. Every
// source was placed by its own latitude and longitude (tools/): the marina basin, lock, approach walls, pier and coast from
// OpenStreetMap; the pontoons from OpenStreetMap, the north-east cluster moved 5.5 m onto the user's satellite view (where
// OSM had drawn them off); the berths and the boats in them read from the satellite views; the seabed from the user's two
// chart-app screenshots (their colour bands, 426 soundings and drying heights read off them, fitted to the OSM coast); land
// heights from Copernicus DEM GLO-30 (ODN, + 6.5 m to CD). The grid is 10 m a cell, with a 2.5 m patch round the pier, the
// approach and the lock.
function b64bytes(s) { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function decGrid(G) { const q = b64bytes(G.z), z = new Float32Array(q.length); for (let i = 0; i < q.length; i++) z[i] = q[i] <= 160 ? q[i] / 4 - 25 : q[i] - 160 + 15; return { x0: G.x0, y0: G.y0, step: G.step, nx: G.nx, ny: G.ny, z, x1: G.x0 + G.nx * G.step, y1: G.y0 + G.ny * G.step }; }
const GRID = decGrid(PD.grid), FINE = decGrid(PD.fine);
const DOM = { x0: GRID.x0, y0: GRID.y0, x1: GRID.x1, y1: GRID.y1 };
function gridAt(G, x, y) {
  let fx = (x - G.x0) / G.step - 0.5, fy = (y - G.y0) / G.step - 0.5;
  fx = clamp(fx, 0, G.nx - 1.001); fy = clamp(fy, 0, G.ny - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, n = G.nx, z = G.z, k = j * n + i;
  return (z[k] * (1 - a) + z[k + 1] * a) * (1 - b) + (z[k + n] * (1 - a) + z[k + n + 1] * a) * b;
}
// point in polygon (crossings)
function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function bbox(P) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; }
const inBox = (B, x, y, m = 0) => x >= B.x0 - m && x <= B.x1 + m && y >= B.y0 - m && y <= B.y1 + m;
// the lock's own frame: s along its axis (north-east, 038°), c across it (to the south-east)
const LK_U = [0.618, 0.786], LK_N = [0.786, -0.618];
const lkS = (x, y) => x * LK_U[0] + y * LK_U[1], lkC = (x, y) => x * LK_N[0] + y * LK_N[1];
const lkP = (s, c) => [s * LK_U[0] + c * LK_N[0], s * LK_U[1] + c * LK_N[1]];
// The chamber: OSM's walls 11.8 m apart; the sector gates' recesses put the marina-side gate at s 68 and the sea-side one at
// s 122, so about 50 m between them. The floor and the sill are not published: an estimate, low enough to lock at the window's
// first tide. The marina is held at 12-14 m CD (13.3 typical) over a bed about 6 m down (Boatfolk).
const LOCK = { sIn: 68, sOut: 122, cNW: -50.5, cSE: -38.7, floor: 1.0, top: 15.6, gateR: 6.3, pw: 1.8, ps0: 71, ps1: 119 };   // pw: the floating pontoons' width, ps0-ps1 their ends
LOCK.cMid = (LOCK.cNW + LOCK.cSE) / 2; LOCK.w = LOCK.cSE - LOCK.cNW;
const MARINA_FLOOR = 7.3, QUAY = 15.6, PIER_TOP = 15.4;
// the walled approach from the sea-side gates, 20 m wide and some 50 m long; dredged a little (estimate)
const APPROACH = { s0: LOCK.sOut, s1: 176, cNW: -51.7, cSE: -31.4, floor: 2.0 };
// The dredged approach: from the end of the walled approach the channel runs out along the face of the sea wall and the
// pier to the pier head, about 30 m wide and dredged to 2 m above chart datum like the approach itself (estimate: the
// chart screenshots show the outer harbour drying 4 to 10 m, and the marina keeps the way out along the wall open). It
// is cut into the seabed grids here, so the depths, the water's colour, the sounder and the chart all show it.
const CHANNEL = { s0: 170, s1: 560, w: 30, floor: 2.0, bank: 0.2 };
// the face of the sea wall and the pier, in the lock frame: the approach wall to s 198, stepping out to the sea wall at
// c -63 by s 210, and the pier's face out to its head at s 500 (from the OpenStreetMap coastline and pier)
function channelLo(s) { return s < 198 ? APPROACH.cNW : s < 210 ? lerp(APPROACH.cNW, -63, (s - 198) / 12) : s < 341 ? -63 : lerp(-63, -64.5, Math.min(1, (s - 341) / 160)); }
function chanZ(s, c) {
  const lo = channelLo(s);
  return CHANNEL.floor + Math.max(0, c - (lo + CHANNEL.w)) * CHANNEL.bank + Math.max(0, CHANNEL.s0 - s) * 0.3 + Math.max(0, s - CHANNEL.s1) * 0.1;
}
function dredge(G) {
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.step, y = G.y0 + (j + 0.5) * G.step, k = j * G.nx + i, z = G.z[k];
    if (z >= 14.6) continue;   // land
    const s = lkS(x, y), c = lkC(x, y), lo = channelLo(s);
    if (s < CHANNEL.s0 - 30 || s > CHANNEL.s1 + 60 || c < lo - 4 || c > lo + CHANNEL.w + 40) continue;
    // the floor, rising up the bank on the open side and fading out past the pier head into water that is deep anyway
    const t = chanZ(s, c);
    if (t < z) G.z[k] = t;
  }
}
dredge(GRID); dredge(FINE);
// the sea wall from the approach's mouth to the pier's root: a straight face along the channel, as the coastline has it
function seaWallLand(s, c) { return s > APPROACH.s1 - 2 && s < 342 && c < channelLo(s) && c > channelLo(s) - 40; }
// the walled approach between the sea gates and its mouth
const inApproach = (s, c) => s >= LOCK.sOut && s <= APPROACH.s1 && c > APPROACH.cNW && c < APPROACH.cSE;
const DOCK = PD.basin, DOCK_B = bbox(DOCK);
const PIER = PD.pier, PIER_B = bbox(PIER);
function inDock(x, y) { return inBox(DOCK_B, x, y) && inPoly(DOCK, x, y); }
function inPier(x, y) { return inBox(PIER_B, x, y) && inPoly(PIER, x, y); }
function inChamber(x, y) { const s = lkS(x, y), c = lkC(x, y); return s >= LOCK.sIn && s <= LOCK.sOut && c >= LOCK.cNW && c <= LOCK.cSE; }
// which water a point is in: the marina (held level), the lock chamber, or the sea (the tide)
function waterBody(x, y) {
  if (inDock(x, y)) { const s = lkS(x, y); return s < LOCK.sIn ? 'marina' : s <= LOCK.sOut ? 'lock' : 'sea'; }
  return 'sea';
}
// The paved quays: 14 m round the basin, and the whole lock yard either side of the chamber and the approach, flat at
// quay level so the walls meet square edges. A 1 m raster, drawn once.
const QUAYM = (() => {
  const B = DOCK_B, R = 1, x0 = B.x0 - 30, y1 = B.y1 + 80, W = Math.ceil(B.x1 + 80 - x0), H = Math.ceil(y1 - (B.y0 - 30));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const P = (x, y) => [(x - x0) / R, (y1 - y) / R];
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = g.strokeStyle = '#fff'; g.lineJoin = 'miter'; g.lineWidth = 28;
  g.beginPath(); DOCK.forEach(([x, y], i) => { const [u, v] = P(x, y); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.stroke();
  g.beginPath(); [[LOCK.sIn - 30, -78], [205, -78], [205, -12], [LOCK.sIn - 30, -12]].forEach(([s_, c_], i) => { const [u, v] = P(...lkP(s_, c_)); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.fill();
  const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) m[k] = d[k * 4] > 127 ? 1 : 0;
  return { x0, y1, W, H, m };
})();
function quayAt(x, y) { const Q = QUAYM, i = Math.floor(x - Q.x0), j = Math.floor(Q.y1 - y); return i >= 0 && j >= 0 && i < Q.W && j < Q.H && Q.m[j * Q.W + i] === 1; }
function heightAt(x, y) {
  if (inBox(DOCK_B, x, y, 2) && inPoly(DOCK, x, y)) {
    const s = lkS(x, y);
    if (s < LOCK.sIn - 3) return MARINA_FLOOR;
    if (s <= LOCK.sOut + 2) return LOCK.floor;
    return APPROACH.floor;
  }
  { const s = lkS(x, y), c = lkC(x, y); if (inApproach(s, c)) return APPROACH.floor;
    if (s > LOCK.sOut && s < CHANNEL.s1 + 60) {
      if (seaWallLand(s, c)) return QUAY;
      const lo = channelLo(s);
      if (s > CHANNEL.s0 - 6 && c >= lo && c < lo + CHANNEL.w + 45 && !inPier(x, y)) { const g = inBox(FINE, x, y, -2) ? gridAt(FINE, x, y) : gridAt(GRID, x, y); if (g < 14.6) return Math.min(g, chanZ(s, c)); }
    } }
  if (inPier(x, y)) return PIER_TOP;
  if (inBox(FINE, x, y, -2)) { const z = gridAt(FINE, x, y); return z >= 13.5 && quayAt(x, y) ? QUAY : z; }
  if (x < DOM.x0 || x > DOM.x1 || y < DOM.y0) return x < DOM.x0 && y > 400 ? -12 : 30;
  if (y > DOM.y1) return -6;
  { const z = gridAt(GRID, x, y); return z >= 13.5 && quayAt(x, y) ? QUAY : z; }
}
// pontoons, the berth the RIB starts in, the hammerheads and the boats
const PONT = PD.pont.map(P => ({ P, B: bbox(P) }));
const HAMMER = PD.hammer;
const BOATS = PD.boats.map(([x, y, hdg, L, B, type]) => ({ x, y, psi: hdg * DEG, L, B, type }));
// solid edges for contacts in and round the marina: quay walls, lock and approach walls, the pier and the pontoons. Each is
// a segment with the side the water is on; a 0.25 m raster says which points are solid.
const SOLID = (() => {
  const X0 = -470, Y0 = -510, X1 = 290, Y1 = 470, R = 0.25, NX = Math.ceil((X1 - X0) / R), NY = Math.ceil((Y1 - Y0) / R);
  const m = new Uint8Array(NX * NY), cv = document.createElement('canvas'); cv.width = NX; cv.height = NY;
  // drawn as an image: white is solid (land, walls, the pier, the pontoons), black is water
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, NX, NY);
  const toPx = (x, y) => [(x - X0) / R, (Y1 - y) / R];
  const fillPoly = (P, col) => { g.fillStyle = col; g.beginPath(); P.forEach(([x, y], i) => { const [u, v] = toPx(x, y); i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.fill(); };
  return { X0, Y0, X1, Y1, R, NX, NY, m, cv, g, fillPoly, toPx, edges: [], cells: new Map() };
})();
function buildSolid() {
  const S_ = SOLID, g = S_.g;
  // everything is land to start with, the sea is cut out where the ground is below the quay, then the dock is cut out
  g.fillStyle = '#fff'; g.fillRect(0, 0, S_.NX, S_.NY);
  // sea: coarse grid cells that are below +14 (outside the dock)
  const img = g.getImageData(0, 0, S_.NX, S_.NY), d = img.data;
  for (let j = 0; j < S_.NY; j += 1) {
    const y = S_.Y1 - (j + 0.5) * S_.R;
    for (let i = 0; i < S_.NX; i += 1) {
      const x = S_.X0 + (i + 0.5) * S_.R;
      // the pontoons, pier and walls are drawn after; here only natural ground: below +14.6 counts as water
      let z;
      if (inPier(x, y)) z = PIER_TOP; else if (seaWallLand(lkS(x, y), lkC(x, y))) z = QUAY; else if (inBox(FINE, x, y, -2)) z = gridAt(FINE, x, y); else z = gridAt(GRID, x, y);
      if (z < 14.6) { const k = (j * S_.NX + i) * 4; d[k] = d[k + 1] = d[k + 2] = 0; }
    }
  }
  g.putImageData(img, 0, 0);
  // the walled approach: water between its walls out to where they end
  { const a = lkP(APPROACH.s0 - 2, APPROACH.cNW), b = lkP(APPROACH.s1 + 8, APPROACH.cNW), c = lkP(APPROACH.s1 + 8, APPROACH.cSE), e = lkP(APPROACH.s0 - 2, APPROACH.cSE); S_.fillPoly([a, b, c, e], '#000'); }
  S_.fillPoly(PIER, '#fff');
  S_.fillPoly(DOCK, '#000');
  // the lock walls, with the chamber between
  { const w = (c0, c1, s0, s1) => S_.fillPoly([lkP(s0, c0), lkP(s1, c0), lkP(s1, c1), lkP(s0, c1)], '#fff');
    w(LOCK.cNW - 12, LOCK.cNW, LOCK.sIn - 2, LOCK.sOut + 4); w(LOCK.cSE, LOCK.cSE + 12, LOCK.sIn - 2, LOCK.sOut + 4);
    // the floating pontoons along each wall: always at the water, so solid in plan whatever the level
    w(LOCK.cNW, LOCK.cNW + LOCK.pw, LOCK.ps0, LOCK.ps1); w(LOCK.cSE - LOCK.pw, LOCK.cSE, LOCK.ps0, LOCK.ps1); }
  for (const p of PONT) S_.fillPoly(p.P, '#fff');
  const im2 = g.getImageData(0, 0, S_.NX, S_.NY).data;
  for (let k = 0; k < S_.NX * S_.NY; k++) S_.m[k] = im2[k * 4] > 127 ? 1 : 0;
  // edges for the push-out direction: every polygon used, as segments in 4 m cells
  const add = (P, closed = true) => { for (let i = 0; i < P.length - (closed ? 0 : 1); i++) { const a = P[i], b = P[(i + 1) % P.length]; S_.edges.push([a[0], a[1], b[0], b[1]]); } };
  add(DOCK); add(PIER); for (const p of PONT) add(p.P);
  for (const [c0, c1] of [[LOCK.cNW, LOCK.cNW + LOCK.pw], [LOCK.cSE - LOCK.pw, LOCK.cSE]]) add([lkP(LOCK.ps0, c0), lkP(LOCK.ps1, c0), lkP(LOCK.ps1, c1), lkP(LOCK.ps0, c1)]);
  for (const [c0, c1] of [[LOCK.cNW, LOCK.cNW], [LOCK.cSE, LOCK.cSE]]) { const a = lkP(LOCK.sIn - 2, c0), b = lkP(LOCK.sOut + 4, c1); S_.edges.push([a[0], a[1], b[0], b[1]]); }
  for (const c of [APPROACH.cNW, APPROACH.cSE]) { const a = lkP(APPROACH.s0, c), b = lkP(APPROACH.s1, c); S_.edges.push([a[0], a[1], b[0], b[1]]); }
  add(PD.approachW, false);
  add([lkP(APPROACH.s1 - 2, APPROACH.cNW), lkP(198, APPROACH.cNW), lkP(210, -63), lkP(345, -63)], false);   // the sea wall
  S_.edges.forEach((e, n) => {
    const x0 = Math.floor(Math.min(e[0], e[2]) / 4), x1 = Math.floor(Math.max(e[0], e[2]) / 4), y0 = Math.floor(Math.min(e[1], e[3]) / 4), y1 = Math.floor(Math.max(e[1], e[3]) / 4);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = i * 100003 + j; if (!S_.cells.has(k)) S_.cells.set(k, []); S_.cells.get(k).push(n); }
  });
}
function solidAt(x, y) {
  const S_ = SOLID; if (x < S_.X0 || x >= S_.X1 || y <= S_.Y0 || y > S_.Y1) return false;
  return S_.m[Math.floor((S_.Y1 - y) / S_.R) * S_.NX + Math.floor((x - S_.X0) / S_.R)] === 1;
}
// nearest solid edge to a point: its distance and the unit normal pointing from the edge towards the point
function nearEdge(x, y) {
  const S_ = SOLID, ci = Math.floor(x / 4), cj = Math.floor(y / 4); let best = null;
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const L = S_.cells.get(i * 100003 + j); if (!L) continue;
    for (const n of L) {
      const e = S_.edges[n], ex = e[2] - e[0], ey = e[3] - e[1], l2 = ex * ex + ey * ey || 1, t = clamp(((x - e[0]) * ex + (y - e[1]) * ey) / l2, 0, 1);
      const px = e[0] + ex * t, py = e[1] + ey * t, d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { d, px, py, ex, ey, n };
    }
  }
  return best;
}
// Cut a polygon to the half-plane s < sMax (Sutherland-Hodgman), for the marina's own water
function clipS(P, sMax, keepBelow = true) {
  const out = [], inside = (p) => keepBelow ? lkS(p[0], p[1]) <= sMax : lkS(p[0], p[1]) >= sMax;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const sa = lkS(a[0], a[1]), sb = lkS(b[0], b[1]), t = (sMax - sa) / (sb - sa); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const MARINA_POLY = clipS(DOCK, LOCK.sIn);
// the chamber's and the approach's floors into the seabed grids, so the sea drawn through the chamber when the sea gates
// are open is shaded for its real depth (the grids carry whatever the chart had under the walls)
function bakeLock(G) {
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const x = G.x0 + (i + 0.5) * G.step, y = G.y0 + (j + 0.5) * G.step, s_ = lkS(x, y), c_ = lkC(x, y);
    if (s_ < LOCK.sIn - 6 || s_ > APPROACH.s1 + 2 || c_ < APPROACH.cNW - 3 || c_ > APPROACH.cSE + 3) continue;
    if (inApproach(s_, c_)) G.z[j * G.nx + i] = APPROACH.floor; else if (inDock(x, y)) G.z[j * G.nx + i] = LOCK.floor;
  }
}
bakeLock(GRID); bakeLock(FINE);

// ================= TIDE =================
// The Avonmouth gauge's harmonic constants (TICON-4: Hart-Davis, Dettmering and Seitz; CC BY 4.0, from 40 years of the
// BODC record), with nodal corrections and astronomical arguments as UTide computes them. Portishead's published times are
// Avonmouth's; fitted to Portishead Marina's 2026 table (November, 116 highs and lows) the best fit wanted no time shift,
// a scale of 0.9943 and mean level 6.985 m above chart datum: within 15 cm and 10 min of the table (December, held back
// as a check: 19 cm and 4 min).
const TIDE_ASTRO = [[270.434164, 13.1763965268, -0.0000850, 0.000000039], [279.696678, 0.9856473354, 0.00002267, 0], [334.329556, 0.1114040803, -0.0007739, -0.00000026], [-259.183275, 0.0529539222, -0.0001557, -0.000000050], [281.220844, 0.0000470684, 0.0000339, 0.000000070]];
function tidePredict(tab, ms) {
  const jd = ms / 86400000 + 719163, d = jd - 693595.5, D = d / 10000;
  const a = TIDE_ASTRO.map(c => ((c[0] + c[1] * d + c[2] * D * D + c[3] * D * D * D) / 360) % 1);
  const astro = [(jd % 1) + a[1] - a[0], a[0], a[1], a[2], a[3], a[4]];
  const F = [], U = [], V = []; let h = 0;
  tab.forEach((e, i) => {
    if (e.sh) { let f = 1, u = 0, v = 0; for (const [j, c] of e.sh) { f *= Math.pow(F[j], Math.abs(c)); u += U[j] * c; v += V[j] * c; } F[i] = f; U[i] = u; V[i] = v; }
    else {
      let re = 1, im = 0;
      for (const q of e.sat) { const uu = (q[0] * astro[3] + q[1] * astro[4] + q[2] * astro[5] + q[3]) % 1; re += q[4] * Math.cos(2 * Math.PI * uu); im += q[4] * Math.sin(2 * Math.PI * uu); }
      F[i] = Math.hypot(re, im); U[i] = Math.atan2(im, re) / (2 * Math.PI);
      let v = e.semi; for (let k = 0; k < 6; k++) v += e.d[k] * astro[k]; V[i] = v % 1;
    }
    if (e.A) h += F[i] * e.A * Math.cos(2 * Math.PI * (V[i] + U[i]) - e.g * Math.PI / 180);
  });
  return h;
}
const TD = PD.tide;
const tideCD = (ms) => TD.z0 + TD.k * tidePredict(TD.tab, ms - TD.shift * 60000);
// highs and lows over a span (ms), found on a 10-minute scan and refined
function tideExtremes(ms0, ms1) {
  const out = [], st = 600000; let p0 = tideCD(ms0 - st), p1 = tideCD(ms0);
  for (let t = ms0 + st; t <= ms1 + st; t += st) {
    const p2 = tideCD(t);
    if ((p1 - p0) * (p2 - p1) < 0) {
      const den = p0 - 2 * p1 + p2, off = den ? 0.5 * (p0 - p2) / den : 0, tc = t - st + off * st;
      out.push({ ms: tc, h: tideCD(tc), hw: p1 > p0 });
    }
    p0 = p1; p1 = p2;
  }
  return out;
}
// the clock: shown in British time (GMT or BST)
const UKF = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const UKD = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const ukHHMM = (ms) => UKF.format(new Date(ms));
const ukDay = (ms) => UKD.format(new Date(ms));
function ukHour(ms) { const p = UKF.formatToParts(new Date(ms)); return +p.find(x => x.type === 'hour').value + (+p.find(x => x.type === 'minute').value) / 60; }

// ================= STREAM =================
// The Severn's stream off Portishead runs up and down the estuary, east-north-east on the flood and west-south-west on the
// ebb, strongest in the deep water and weak in the shallows. Its strength here follows the rate of rise of the tide (fast,
// short flood; longer, weaker ebb), turning a little before high and low water as it does off the point (visitmyharbour:
// the stream turns west about two hours before HW off Portishead Point), scaled to about 4.6 kn in the deep water at the fastest flood of a big spring (about 4 kn on its ebb).
// Portishead Pool and the outer harbour are sheltered, and in the Pool it eddies west towards the pier head on the flood.
// Estimates, not a tidal-stream atlas.
const STREAM = { base: 0, t: -1e9, lead: 50 * 60000 };
function streamBase(ms) {
  if (Math.abs(ms - STREAM.t) < 5000) return STREAM.base;
  const a = tideCD(ms + STREAM.lead - 900000), b = tideCD(ms + STREAM.lead + 900000), rate = (b - a) / 0.5;   // metres an hour
  STREAM.t = ms; STREAM.base = clamp(rate * (4.6 * KN / 2.97), -4.2 * KN, 5.4 * KN);   // 2.97 m an hour: the fastest rise of a big spring here
  return STREAM.base;
}
const FLOOD = 68 * DEG;
function currentAt(x, y) {
  if (!S || waterBody(x, y) !== 'sea') return { x: 0, y: 0 };
  const s = lkS(x, y), c = lkC(x, y);
  if (s < APPROACH.s1 + 10 && c > APPROACH.cNW - 2 && c < APPROACH.cSE + 2) return { x: 0, y: 0 };
  const depth = S.tide - heightAt(x, y); if (depth <= 0.05) return { x: 0, y: 0 };
  const b = streamBase(S.ms), f = clamp(Math.sqrt(depth / 11), 0, 1.05) * clamp(depth / 1.5, 0, 1);
  let m = b * f, dir = FLOOD;
  // sheltered: the outer harbour between the pier and Portbury, and close in along the shore west of the pier
  const harbour = smooth(60, 160, x) * (1 - smooth(650, 800, x)) * (1 - smooth(470, 600, y)), shoreW = (1 - smooth(-200, 40, x)) * (1 - smooth(480, 620, y)) * smooth(-1300, -1100, x);
  m *= 1 - 0.8 * harbour - 0.4 * shoreW;
  // the Pool's eddy: during the flood it sets west towards the pier head
  const pool = smooth(-120, 60, x) * (1 - smooth(780, 950, x)) * smooth(380, 470, y) * (1 - smooth(820, 950, y));
  let vx = Math.sin(dir) * m, vy = Math.cos(dir) * m;
  if (b > 0 && pool > 0) { const e = 0.35 * b * f * pool, ed = 255 * DEG; vx = lerp(vx, Math.sin(ed) * e, pool); vy = lerp(vy, Math.cos(ed) * e, pool); }
  // a breath of wind drift on top
  vx += S.wind.x * 0.012 * smooth(0.5, 2, depth); vy += S.wind.y * 0.012 * smooth(0.5, 2, depth);
  return { x: vx, y: vy };
}

// ================= THE LOCK =================
// Portishead's sector-gate lock, run to the marina's pattern: in the window (3.5 h either side of HW at springs, 4 h at
// neaps) a lock-out on the hour and half hour, when the marina-side gates are open for boats leaving; the chamber is then let
// down to the sea and the sea-side gates open a quarter of an hour later for the lock-in (a forum report of the published
// times: lock-outs every 30 min, lock-ins 15 min after). Gates take a minute to swing; the chamber levels through the
// sluices as the square root of the head (estimate: about five minutes for nine metres). On a tide of 12 m or more the
// marina free-flows near HW: let down a little beforehand, both gates open once the tide reaches its level, and they stay
// open while it rises (never above 14 m), then shut (Boatfolk, "Free-flow: when and why").
const LKS = { hold: null, M: 13.3, L: 13.3, gIn: 1, gOut: 0, mode: 'idle', want: 'in', step: 'open', stepT: 0, Q: 0, ff: false, ffDone: -1, hw: null, win: 0, sigIn: 'red', sigOut: 'red', note: '', lastCall: -99, ffSeen: false };
const GATE_T = 60, A_CH = (LOCK.sOut - LOCK.sIn) * LOCK.w, SLUICE = 0.7 * 4.2;
function lockHW(ms) {
  // the high water whose window we are in or next come to
  const L = LKS;
  if (!L.ext || ms < L.ext.from || ms > L.ext.to) { const E = tideExtremes(ms - 15 * 3600e3, ms + 30 * 3600e3); L.ext = { from: ms - 2 * 3600e3, to: ms + 12 * 3600e3, list: E }; }
  const H = L.ext.list.filter(e => e.hw);
  let best = null; for (const e of H) { const w = winHalf(e.h); if (ms <= e.ms + w * 3600e3) { best = e; break; } }
  return best || H[H.length - 1];
}
const winHalf = (h) => lerp(4.0, 3.5, smooth(10.5, 12.8, h));   // hours either side of HW: 4 at neaps, 3.5 at springs
function lockWindow(ms) { const hw = lockHW(ms), w = winHalf(hw.h); return { hw, w, open: ms >= hw.ms - w * 3600e3 && ms <= hw.ms + w * 3600e3, from: hw.ms - w * 3600e3, to: hw.ms + w * 3600e3 }; }
// in the window, which side the cycle wants open at this minute: the marina side from :21 to :06 (lock-in boats out, lock-out
// boats in), the sea side from :06 to :21
function cycleWant(ms) { const m = ((ms / 60000) % 30 + 30) % 30; return m >= 6 && m < 21 ? 'out' : 'in'; }
function nextLockTimes(ms) {
  const W = lockWindow(ms), out = [], inn = [];
  let t0 = Math.max(ms, W.from); t0 = Math.ceil(t0 / 1800000) * 1800000;
  if (!W.open && ms > W.to) return { W, out, inn };
  for (let t = t0; t <= W.to && out.length < 3; t += 1800000) out.push(t);
  for (let t = Math.ceil((Math.max(ms, W.from) - 900000) / 1800000) * 1800000 + 900000; t <= W.to && inn.length < 3; t += 1800000) inn.push(t);
  return { W, out, inn };
}
function updateLock(dt) {
  const L = LKS, ms = S.ms, tide = S.tide, W = lockWindow(ms); L.win = W;
  // free-flow: a tide of 12 m or more; the marina is let down a little in the last hour and a half
  const ffTide = W.hw.h >= 12.0, toHW = (W.hw.ms - ms) / 60000;
  if (ffTide && toHW > 0 && toHW < 90 && !L.ff && L.ffDone !== W.hw.ms) L.M = approach(L.M, Math.max(12.0, Math.min(13.3, W.hw.h - 0.5)), dt * 0.9 / 600);
  else if (!L.ff && (L.ffDone === W.hw.ms || toHW < -60)) L.M = approach(L.M, 13.3, dt * 0.3 / 3600);   // pumped back up, slowly
  const rising = tideCD(ms + 300000) > tide;
  if (!L.ff && ffTide && L.ffDone !== W.hw.ms && rising && tide >= L.M - 0.04 && tide < 14 && Math.abs(L.L - L.M) < 0.05 && L.gOut === 0 && L.mode !== 'level') {
    L.ff = true; L.mode = 'ff'; say(`All stations, Portishead Quays Marina. We are free-flowing: both gates open, green-white-green both ways. Proceed with caution.`, 2);
  }
  if (L.ff) {
    L.gIn = approach(L.gIn, 1, dt / GATE_T); L.gOut = approach(L.gOut, 1, dt / GATE_T);
    if (L.gOut > 0.98) { L.M = Math.max(L.M, tide); L.L = L.M; }
    if (!rising || tide >= 14) { L.ff = false; L.ffDone = W.hw.ms; L.mode = 'close'; L.want = 'in'; L.step = 'closeOut'; L.stepT = 0; L.M = Math.max(L.M, Math.min(14, tide)); say('Free-flow is over: the sea gates are closing.', 2); }
    L.L = L.gOut > 0.98 ? L.M : L.L;
    L.Q = 0; setSignals(); return;
  }
  // what the lock wants now: outside the window, the marina side (sea gates shut); in it, the cycle's side, unless the
  // keeper has closed early behind the RIB and is working her through (held to the end of the other side's next turn)
  const working = W.open && tide > LOCK.floor + 2.4;
  let want = working ? cycleWant(ms) : 'in';
  if (L.hold) { if (!working || ms >= L.hold.until) L.hold = null; else want = L.hold.want; }
  // the state machine: close what is open (never on a boat in the gates' swing), level (once she has her lines on, when
  // the keeper is working her through), open the other
  L.Q = 0;
  if (want === 'in') {
    if (L.gOut > 0) { if (!gateBusy('out')) L.gOut = approach(L.gOut, 0, dt / GATE_T); L.mode = 'gates'; }
    else if (Math.abs(L.L - L.M) > 0.02) { if (waitLines(ms)) L.mode = 'lines'; else { levelTo(L.M, dt); L.mode = 'level'; } }
    else { L.L = L.M; L.gIn = approach(L.gIn, 1, dt / GATE_T); L.mode = L.gIn >= 1 ? 'inOpen' : 'gates'; }
  } else {
    if (L.gIn > 0) { if (!gateBusy('in')) L.gIn = approach(L.gIn, 0, dt / GATE_T); L.mode = 'gates'; }
    else if (Math.abs(L.L - tide) > 0.02) { if (waitLines(ms)) L.mode = 'lines'; else { levelTo(tide, dt); L.mode = 'level'; } }
    else { L.L = tide; L.gOut = approach(L.gOut, 1, dt / GATE_T); L.mode = L.gOut >= 1 ? 'outOpen' : 'gates'; }
  }
  if (L.gOut >= 1) L.L = tide;
  setSignals();
  if (working) lockEarly(ms);
}
// The keeper does not wait for the clock when every boat booked on the locking is in. With the gates open on the RIB's
// side, once she is wholly in the chamber (clear of both gates' swing, nearly stopped), having come in that way, and no
// other boat is still to come in through those gates or still to leave by them, the gates close behind her. The chamber
// is levelled once she has her lines on, and the far gates then stay open to the end of their next turn on the clock,
// so the timetable picks up again.
function ribInLock() {
  const R = RB; if (!S || !inChamber(R.x, R.y)) return false;
  const s = lkS(R.x, R.y); return s > LOCK.sIn + 4.2 && s < LOCK.sOut - 4.2 && Math.hypot(R.u, R.v) < 0.8;
}
function lockEarly(ms) {
  const L = LKS; if (L.hold || (L.mode !== 'inOpen' && L.mode !== 'outOpen') || window.__quiet) return;
  const side = L.mode === 'inOpen' ? 'in' : 'out';
  if (RB.lockFrom !== (side === 'in' ? 'marina' : 'sea') || !ribInLock() || trPending(side)) return;
  const next = side === 'in' ? 'out' : 'in'; let t = ms;
  while (cycleWant(t) !== next) t += 60000;
  while (cycleWant(t) === next) t += 60000;
  L.hold = { want: next, until: t, linesBy: ms + 5 * 60000 };
  const gates = side === 'in' ? 'marina' : 'sea', n = trInChamberCount();
  say(n ? `RIB Patrol, Portishead Quays. That's everyone in: closing the ${gates} gates. Make fast and we'll level you.` : `RIB Patrol, Portishead Quays. You're our only boat this time: closing the ${gates} gates behind you. Make fast to the pontoon and we'll level you.`, 2);
}
// working the RIB through: the water is not moved until she is made fast (or five minutes have gone)
function waitLines(ms) { const H = LKS.hold; return !!H && ms < H.linesBy && inChamber(RB.x, RB.y) && !RB.fast; }
// a boat in a gate's swing (the leaves open out of the chamber into their recesses, sweeping 6.3 m outside the gate line):
// the keeper will not close it on her, and asks the RIB to clear it
function gateBusy(which) {
  const s0 = which === 'in' ? LOCK.sIn : LOCK.sOut, out = which === 'in' ? -1 : 1;
  const hit = (x, y, h) => { const c = lkC(x, y); if (c < LOCK.cNW - 1.5 || c > LOCK.cSE + 1.5) return false; const rel = (lkS(x, y) - s0) * out; return rel > -h - 0.3 && rel < LOCK.gateR + 0.8 + h; };
  if (hit(RB.x, RB.y, 3.3)) {
    const L = LKS, t = S ? S.t : 0; if (!(t - (L.busyLast ?? -99) < 2)) L.busyAt = t; L.busyLast = t;
    if (t - L.busyAt > 15 && t - (L.busySaid ?? -99) > 60) { L.busySaid = t; say(`RIB Patrol, Portishead Quays. Clear the ${which === 'in' ? 'marina' : 'sea'} gates please, we're closing.`, 1); }
    return true;
  }
  return trGateBusy(hit);
}
function levelTo(target, dt) {
  const L = LKS, dh = target - L.L, q = SLUICE * Math.sqrt(2 * 9.81 * Math.abs(dh)) * Math.sign(dh);   // m³/s
  let step = q / A_CH * dt; if (Math.abs(step) > Math.abs(dh)) step = dh;
  L.L += step; L.Q = q;
}
// signals: green-white-green on a side when its gates are fully open and the cycle has boats moving that way; three reds
// otherwise. In free-flow both show green.
function setSignals() {
  const L = LKS;
  const open = L.win && L.win.open;
  L.sigIn = L.gIn >= 1 && ((L.mode === 'inOpen' && open) || L.mode === 'ff') ? 'go' : 'red';
  L.sigOut = L.gOut >= 1 && ((L.mode === 'outOpen' && open) || L.mode === 'ff') ? 'go' : 'red';
}
// the water level at a point, and how rough it is there (the marina and lock are sheltered)
function levelAt(x, y) { const w = waterBody(x, y); return w === 'marina' ? LKS.M : w === 'lock' ? LKS.L : S.tide; }
