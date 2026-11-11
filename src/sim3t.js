
// ================= OTHER BOATS USING THE LOCK =================
// Yachts, motor cruisers and the odd fishing boat lock out and in on the marina's timetable, as the RIB does. A few
// minutes before each half of the cycle some leave their berths and come up the marina's fairway, or come in from the
// estuary along the channel, and wait clear of the gates. On green-white-green they go in one at a time, earliest first,
// and make fast along the floating pontoons from the far end; they ride the level and leave on the other side's green,
// nearest the gates first. At sea they head off down channel or up towards the Avon; inside, they go down the fairway and
// in between the pontoon arms to their berths. They give way to the RIB: one in their way stops them, and after a while
// they ask her to make room. About half the lockings have none. Places are worked in the lock frame (s along the lock
// towards the sea, c across it) and turned into metres east and north for the paths.
const TR = { boats: [], pool: [], book: new Map(), planT: -99, chatT: -99, blockT: -99, seq: 0 };
const TR_NAMES = ['Kestrel', 'Blue Heron', 'Halcyon', 'Morning Tide', 'Curlew', 'Jubilee', 'Wren', 'Moonshadow', 'Bryher', 'Avalon', 'Dunlin', 'Sea Pie', 'Merlin', 'Puffin', 'Tamarisk', 'Skylark', 'Saltire', 'Osprey'];
const TR_SPEC = {
  yacht: { L: 10, B: 3.4, kind: 'yacht', fb: 0.95, vSea: 3.1 },
  cruiser: { L: 10.5, B: 3.6, kind: 'motor cruiser', fb: 1.3, vSea: 6.5 },
  fisher: { L: 6.6, B: 2.5, kind: 'fishing boat', fb: 0.9, vSea: 4.5 },
};
// waiting spots: in the marina by the entrance, heading for the lock (clear of the way out of it); outside in the channel
// along the pier's face, heading in. Boats leave the lock along the channel's far side from the wall (c -40) and come in
// along the wall (c -54). Berths: the water between pontoon arms that boats come out of and go into.
const TR_WAIT = { O: [[20, -55.5]], I: [[222, -55], [238, -55]] };   // in the marina one at a time; outside, a queue of two
const TR_BERTH = [[-108.5, -27], [-154, -29], [-66.5, -27], [-108.5, -11], [-154, -13], [-198.5, -27]];
// out and in by tracks a little apart, each keeping to her own side of the way
const TR_SEA = { west: [[300, 760], [-150, 1080], [-1500, 1460]], east: [[430, 770], [900, 1130], [1700, 1500], [2500, 2000]] };
const TR_SEA_IN = { west: [[-1500, 1410], [-175, 1035], [265, 735]], east: [[2530, 1955], [1710, 1450], [885, 1085], [405, 745]] };
const TR_EDGE = [LOCK.cNW + LOCK.pw, LOCK.cSE - LOCK.pw];   // the floating pontoons' outer edges

// ---------- paths: corners rounded, then a point every metre ----------
function trPath(pts) {
  let P = pts.map(p => p.xy ? p.xy : lkP(p[0], p[1]));
  for (let it = 0; it < 3; it++) {   // Chaikin's corner cutting, ends kept
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); }
    Q.push(P[P.length - 1]); P = Q;
  }
  const X = [P[0][0]], Y = [P[0][1]]; let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], l = Math.hypot(bx - ax, by - ay); if (l < 1e-6) continue;
    let t = 1 - carry; while (t <= l) { X.push(ax + (bx - ax) * t / l); Y.push(ay + (by - ay) * t / l); t += 1; }
    carry = l - (t - 1);
  }
  const e = P[P.length - 1]; if (Math.hypot(e[0] - X[X.length - 1], e[1] - Y[Y.length - 1]) > 0.05) { X.push(e[0]); Y.push(e[1]); }
  return { X, Y, len: X.length - 1 };
}
// a place on a path d metres along, with its heading (radians from north)
function trAt(P, d) {
  d = clamp(d, 0, P.len); const i = Math.min(P.len - 1, Math.floor(d)), f = d - i;
  const dx = P.X[i + 1] - P.X[i], dy = P.Y[i + 1] - P.Y[i];
  return [P.X[i] + dx * f, P.Y[i] + dy * f, Math.atan2(dx, dy)];
}
// how fast a boat may go here: dead slow in the marina, the lock and its approach, five knots in the channel, her own
// passage speed outside
function trVmax(b, x, y) {
  if (waterBody(x, y) !== 'sea') return 1.15;
  const s = lkS(x, y), c = lkC(x, y);
  if (s < APPROACH.s1 + 30 && c > -60 && c < -25) return 1.35;
  if (s < 640 && c > -75 && c < -20) return 2.6;
  return TR_SPEC[b.type].vSea;
}
function trTime(b, P) { let t = 0; for (let i = 0; i < P.len; i += 4) t += Math.min(4, P.len - i) / trVmax(b, P.X[i], P.Y[i]); return t * 1.1 + 20; }
const trSeaOut = (b) => TR_SEA[b.sea].map(xy => ({ xy }));
const trSeaIn = (b) => TR_SEA_IN[b.sea].map(xy => ({ xy }));
// from her berth to her waiting spot in the marina, and from the lock down to her berth
function trPathToMarinaWait(b) {
  const [bs, bc] = TR_BERTH[b.berth], W = TR_WAIT.O[0];
  return trPath([[bs, bc], [bs, -40], [bs + 7, -49.5], [bs + 18, -50.8], [-12, -50.6], [4, -50.4], [12, -52.4], W]);
}
function trPathToBerth(b, from) {
  for (let i = 0; i < TR_BERTH.length; i++) { const k = (b.berth + i) % TR_BERTH.length; if (!TR.boats.some(o => o !== b && o.active && o.berth === k && (o.state === 'berth' || o.state === 'leave' || o.state === 'toWait'))) { b.berth = k; break; } }
  const [bs, bc] = TR_BERTH[b.berth];
  return trPath(from.concat([[50, -45.4], [38, -46], [28, -46.8], [16, -47.6], [4, -48.8], [-12, -50.4], [bs + 16, -50.8], [bs + 6, -48], [bs, -40], [bs, bc + 1]]));
}
// from out in the estuary to her waiting spot in the channel, and from the lock out to sea
function trPathToSeaWait(b, k) {
  const W = TR_WAIT.I[k];
  return trPath(trSeaIn(b).concat([[640, -50], [560, -54], [340, -54], [W[0] + 16, -54.5], W]));
}
function trPathToSea(b, from) { return trPath(from.concat([[LOCK.sOut + 5, -41], [176, -40], [215, -40], [340, -40], [500, -41], [600, -42], [650, -42]], trSeaOut(b))); }

// ---------- the chamber: what lies along each pontoon, the clear way between, a berth for a boat coming in ----------
function trOcc(except) {
  const occ = [[], []];
  for (const o of TR.boats) if (o !== except && o.slot) occ[o.slot.side].push([o.slot.s - o.L / 2, o.slot.s + o.L / 2, o.B + 0.35]);
  if (inChamber(RB.x, RB.y)) {   // the RIB, on whichever side she is nearer, out as far as she lies from its pontoon
    const s = lkS(RB.x, RB.y), c = lkC(RB.x, RB.y), side = c < LOCK.cMid ? 0 : 1;
    occ[side].push([s - 3.8, s + 3.8, Math.abs(c - TR_EDGE[side]) + 1.5]);
  }
  return occ;
}
function trGap(occ, s0, s1) {
  let lo = TR_EDGE[0], hi = TR_EDGE[1];
  for (const [a, b, w] of occ[0]) if (b > s0 && a < s1) lo = Math.max(lo, TR_EDGE[0] + w);
  for (const [a, b, w] of occ[1]) if (b > s0 && a < s1) hi = Math.min(hi, TR_EDGE[1] - w);
  return [lo, hi];
}
function trSlot(b) {
  const occ = trOcc(b), fwd = b.dir === 'O' ? 1 : -1, entry = fwd > 0 ? LOCK.sIn : LOCK.sOut, h = b.L / 2;
  let best = null;
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < 90; k++) {
      const s = fwd > 0 ? LOCK.ps1 - 0.6 - h - k * 0.6 : LOCK.ps0 + 0.6 + h + k * 0.6;
      if (s - h < LOCK.ps0 + 0.2 || s + h > LOCK.ps1 - 0.2) break;
      if (occ[side].some(([a, e]) => e + 0.8 > s - h && a - 0.8 < s + h)) continue;
      const [lo, hi] = trGap(occ, Math.min(entry, s - h), Math.max(entry, s + h));   // the way in to it, clear for her beam
      if (hi - lo < b.B + 0.8) continue;
      const depth = fwd * s;
      if (!best || depth > best.depth + 0.3) best = { side, s, c: side ? TR_EDGE[1] - 0.35 - b.B / 2 : TR_EDGE[0] + 0.35 + b.B / 2, depth, ct: (lo + hi) / 2 };
      break;
    }
  }
  return best;
}
const trInLockArea = (o) => { const s = lkS(o.x, o.y), c = lkC(o.x, o.y); return s > LOCK.sIn - 14 && s < LOCK.sOut + 14 && Math.abs(c - LOCK.cMid) < 12; };

// ---------- the models: a small pool, made when first needed ----------
function trModel(type) {
  const sp = TR_SPEC[type], L = sp.L, B = sp.B, fb = sp.fb, rnd = Math.random;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); scene.add(root); root.visible = false;
  const parts = new Map(), put = (g, col) => { if (!parts.has(col)) parts.set(col, []); parts.get(col).push(g); };
  const plan = (w, l) => { const s = new THREE.Shape(); s.moveTo(0, -l / 2); s.quadraticCurveTo(w * 0.5, -l * 0.22, w * 0.5, l * 0.1); s.lineTo(w * 0.44, l / 2); s.lineTo(-w * 0.44, l / 2); s.lineTo(-w * 0.5, l * 0.1); s.quadraticCurveTo(-w * 0.5, -l * 0.22, 0, -l / 2); return s; };
  const slab = (w, l, h, y0, col) => { const g = new THREE.ExtrudeGeometry(plan(w, l), { depth: h, bevelEnabled: false, curveSegments: 8 }); g.rotateX(Math.PI / 2); g.translate(0, y0 + h, 0); put(g, col); };
  const box = (w, h, d, x, y, z, col, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); put(g, col); };
  const cyl = (r0, r1, h, x, y, z, col, rx = 0) => { const g = new THREE.CylinderGeometry(r0, r1, h, 8); if (rx) g.rotateX(rx); g.translate(x, y, z); put(g, col); };
  const person = (x, y, z, jacket) => {
    box(0.15, 0.82, 0.18, x - 0.12, y + 0.41, z, 0x23303f); box(0.15, 0.82, 0.18, x + 0.12, y + 0.41, z, 0x23303f);
    box(0.42, 0.56, 0.27, x, y + 1.1, z, jacket); const h = new THREE.SphereGeometry(0.12, 10, 8); h.translate(x, y + 1.52, z); put(h, 0xd9b08c);
  };
  const lines = [], line = (a, b) => lines.push(...a, ...b);
  const hullCol = type === 'fisher' ? (rnd() < 0.5 ? 0x2c4f7c : 0xf2f3f1) : [0xf2f3f1, 0xf6f6f2, 0xeceeec, 0x1d2a44][Math.floor(rnd() * (type === 'yacht' ? 4 : 3))];
  const jacket = [0xc8312b, 0xe8b01c, 0x1f3f6b, 0xe0571d, 0x2f6b4a][Math.floor(rnd() * 5)];
  slab(B, L, fb + 0.35, -0.35, hullCol);
  slab(B + 0.03, L + 0.03, 0.14, -0.04, hullCol === 0x1d2a44 ? 0xf2f3f1 : 0x1d2a44);   // the boot top
  slab(B + 0.04, L + 0.04, 0.07, fb - 0.12, type === 'yacht' ? 0x8a6a45 : 0x5b6670);   // toe rail, rubbing strake
  slab(B * 0.93, L * 0.95, 0.03, fb, 0xd8d6cf);   // the deck
  let lights;
  if (type === 'yacht') {
    box(B * 0.56, 0.55, L * 0.36, 0, fb + 0.28, -L * 0.04, 0xf1f1ec); box(B * 0.57, 0.14, L * 0.26, 0, fb + 0.36, -L * 0.04, 0x2a3238);
    box(B * 0.55, 0.42, 0.9, 0, fb + 0.65, L * 0.16, 0x2f4a6b);   // the sprayhood
    box(B * 0.62, 0.03, L * 0.24, 0, fb + 0.02, L * 0.31, 0x8a7a62);   // the cockpit
    cyl(0.065, 0.08, L * 1.3, 0, fb + L * 0.65, -L * 0.1, 0xc4c9cd);
    box(0.1, 0.12, L * 0.4, 0, fb + 1.9, L * 0.1, 0xc4c9cd); box(0.26, 0.36, L * 0.36, 0, fb + 2.1, L * 0.1, 0x2f4a6b);   // the boom, its sail cover
    const top = [0, fb + L * 1.3, -L * 0.1]; line(top, [0, fb + 0.1, -L * 0.48]); line(top, [0, fb + 0.1, L * 0.49]);
    for (const s of [-1, 1]) { line([s * B * 0.44, fb + 0.6, -L * 0.36], [s * B * 0.46, fb + 0.6, L * 0.46]); line([s * B * 0.44, fb + 0.33, -L * 0.36], [s * B * 0.46, fb + 0.33, L * 0.46]); }
    person(0, fb - 0.4, L * 0.38, jacket);
    lights = { side: [0, fb + 0.25, -L * 0.47], stern: [0, fb + 0.35, L * 0.5], mast: [0, fb + L * 0.55, -L * 0.1 - 0.12] };
  } else if (type === 'cruiser') {
    box(B * 0.82, 1.15, L * 0.48, 0, fb + 0.58, -L * 0.02, 0xf4f4f2); box(B * 0.83, 0.42, L * 0.44, 0, fb + 0.74, -L * 0.03, 0x20262c);
    box(B * 0.8, 0.62, 0.1, 0, fb + 0.95, -L * 0.27, 0x20262c, -0.65);   // the windscreen
    box(B * 0.72, 0.42, L * 0.3, 0, fb + 1.36, L * 0.02, 0xf4f4f2); box(B * 0.7, 0.3, 0.06, 0, fb + 1.7, -L * 0.12, 0x20262c, -0.5);   // the flybridge, its screen
    box(B * 0.62, 0.08, 0.12, 0, fb + 2.5, L * 0.15, 0xf4f4f2); box(0.12, 0.9, 0.12, -B * 0.3, fb + 2.05, L * 0.15, 0xf4f4f2); box(0.12, 0.9, 0.12, B * 0.3, fb + 2.05, L * 0.15, 0xf4f4f2);   // the arch
    for (const s of [-1, 1]) line([s * B * 0.45, fb + 0.75, -L * 0.42], [s * B * 0.47, fb + 0.75, -L * 0.1]);
    person(0, fb + 1.57, -L * 0.02, jacket);
    lights = { side: [0, fb + 0.95, -L * 0.24], stern: [0, fb + 0.25, L * 0.5], mast: [0, fb + 2.62, L * 0.15] };
  } else {
    box(B * 0.66, 1.45, L * 0.3, 0, fb + 0.72, -L * 0.08, 0xf2f3f1); box(B * 0.67, 0.38, L * 0.26, 0, fb + 1.1, -L * 0.08, 0x20262c);
    box(0.42, 0.95, 0.5, 0, fb - 0.05, L / 2 + 0.22, 0x3a3f44);   // the outboard
    for (const s of [-1, 1]) line([s * B * 0.42, fb + 0.1, L * 0.42], [s * B * 0.9, fb + 2.1, L * 0.7]);   // rods
    person(B * 0.15, fb - 0.3, L * 0.22, jacket);
    lights = { side: [0, fb + 1.5, -L * 0.2], stern: [0, fb + 0.4, L * 0.48], mast: [0, fb + 1.75, -L * 0.08] };
  }
  for (const [col, list] of parts) { const m = new THREE.Mesh(mergeGeos(list), M(col)); m.castShadow = true; m.receiveShadow = true; body.add(m); }
  if (lines.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)); body.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8b9195 }))); }
  // fenders, hung over the side she lies to a pontoon on (the group is turned to that side)
  const fenders = new THREE.Group(); body.add(fenders); fenders.visible = false;
  const fg = new THREE.CylinderGeometry(0.13, 0.13, 0.62, 10), fm = M(0xf3f3f0);
  for (const z of [-0.3, 0, 0.3]) { const f = new THREE.Mesh(fg, fm); f.position.set(B / 2 + 0.12, fb - 0.32, z * L); fenders.add(f); }
  // her mooring lines when she is made fast in the lock, in the world
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const ropes = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xd8d0b8 })); ropes.frustumCulled = false; ropes.visible = false; scene.add(ropes);
  const m = { type, root, body, fenders, ropes, active: false, x: 0, y: 0, psi: 0 };
  // lights: sidelights at the bow, a stern light, a steaming light on the mast or arch
  navLight(body, ...lights.side.map((v, i) => i === 0 ? 0.12 : v), 0xffffff, 'side', m, 0.016); navLight(body, -0.12, lights.side[1], lights.side[2], 0xffffff, 'side', m, 0.016);
  navLight(body, ...lights.stern, 0xffffff, 'stern', m, 0.016); navLight(body, ...lights.mast, 0xffffff, 'mast', m, 0.016);
  TR.pool.push(m); return m;
}
function trGetModel(type) {
  const free = TR.pool.find(m => !m.active && m.type === type);
  if (free) return free;
  return TR.pool.filter(m => m.type === type).length < 3 ? trModel(type) : null;
}

// ---------- the timetable: who books onto which locking ----------
// the starts of the cycle's halves between two times, when the lock is working
function trPhases(ms0, ms1) {
  const out = []; let prev = cycleWant(Math.floor(ms0 / 60000) * 60000 - 60000);
  for (let t = Math.floor(ms0 / 60000) * 60000; t <= ms1; t += 60000) {
    const w = cycleWant(t);
    if (w !== prev && lockWindow(t).open && tideCD(t) > LOCK.floor + 2.4) out.push({ t, side: w });
    prev = w;
  }
  return out;
}
function trPlan() {
  for (const P of trPhases(S.ms - 20 * 60000, S.ms + 16 * 60000)) {
    if (TR.book.has(P.t)) continue;
    const r = mulberry((P.t / 60000) | 0), u = r(), n = TR.force ?? (u < 0.5 ? 0 : u < 0.85 ? 1 : 2), dir = P.side === 'in' ? 'O' : 'I', specs = [], sea = r() < 0.55 ? 'west' : 'east';
    for (let i = 0; i < n; i++) {
      const v = r(), type = v < 0.45 ? 'yacht' : v < 0.85 ? 'cruiser' : 'fisher';
      specs.push({ type, k: 0.9 + 0.22 * r(), nameI: Math.floor(r() * TR_NAMES.length), sea, berth: (Math.floor(r() * TR_BERTH.length) + i) % TR_BERTH.length, arrive: P.t + (2 + i * 0.9) * 60000, dir, spawned: false });
    }
    TR.book.set(P.t, specs);
  }
  for (const specs of TR.book.values()) for (const sp of specs) if (!sp.spawned) trSpawn(sp);
  for (const t of TR.book.keys()) if (t < S.ms - 3 * 3600e3) TR.book.delete(t);
}
const _trFr = new THREE.Frustum(), _trM = new THREE.Matrix4(), _trV = new THREE.Vector3();
const trSeen = (x, y, z, r = 8) => { _trV.set(x, z, -y); return _trFr.intersectsSphere(new THREE.Sphere(_trV, r)) && _trV.distanceTo(camera.position) < 260; };
function trSpawn(sp) {
  if (S.ms > sp.arrive + 10 * 60000) { sp.spawned = true; return; }   // too late: she has given it up
  // her place to wait: in the marina only when no one else is there or bound for it (she waits at her berth till then);
  // outside, the front of the queue if it is free and no one is behind it, else the back
  const held = (i) => TR.boats.some(o => o.dir === sp.dir && (o.state === 'toWait' || o.state === 'wait') && o.k === i);
  const k = sp.dir === 'O' ? (held(0) || trFairwayBusy('O') ? undefined : 0) : !held(0) && !held(1) ? 0 : !held(1) ? 1 : undefined;
  if (k === undefined) { sp.deferred = true; return; }   // try again shortly; she will start from her berth, or far out
  const b = { id: ++TR.seq, type: sp.type, dir: sp.dir, sea: sp.sea, berth: sp.berth, L: TR_SPEC[sp.type].L * sp.k, B: TR_SPEC[sp.type].B * sp.k, scale: sp.k, k, v: 0, d: 0, slot: null, waitT: 0, blockT: 0, ribT: 0, blockBy: null };
  const path = b.dir === 'O' ? trPathToMarinaWait(b) : trPathToSeaWait(b, k), time = trTime(b, path), spawnT = sp.arrive - time * 1000;
  if (S.ms < spawnT) return;
  // out of a berth in the marina: not in front of someone watching, if it can wait
  const [sx, sy] = trAt(path, 0);
  if (b.dir === 'O' && S.ms < sp.arrive - 30000 && trSeen(sx, sy, LKS.M)) { sp.deferred = true; return; }
  let type = sp.type, m = trGetModel(type);
  if (!m) for (const t of ['yacht', 'cruiser', 'fisher']) if ((m = trGetModel(t))) { type = t; break; }
  sp.spawned = true; if (!m) return;
  if (type !== b.type) { b.type = type; b.L = TR_SPEC[type].L * sp.k; b.B = TR_SPEC[type].B * sp.k; }
  b.m = m;
  const used = new Set(TR.boats.map(o => o.name)); let ni = sp.nameI; for (let i = 0; i < TR_NAMES.length && used.has(TR_NAMES[ni]); i++) ni = (ni + 1) % TR_NAMES.length;
  Object.assign(b, { m, name: TR_NAMES[ni], kind: TR_SPEC[type].kind, path, state: 'toWait', active: true });
  // where she has got to (when the game starts with her already on her way), back along her way till she is clear of
  // every other boat
  b.d = sp.deferred ? 0 : Math.min(path.len * 0.95, path.len * clamp((S.ms - spawnT) / (sp.arrive - spawnT), 0, 1));
  const clear = () => { const [x, y] = trAt(path, b.d); return !TR.boats.some(o => o.active && Math.hypot(o.x - x, o.y - y) < (o.L + b.L) / 2 + 4); };
  while (b.d > 0 && !clear()) b.d = Math.max(0, b.d - 10);
  if (!clear()) { sp.spawned = false; sp.deferred = true; return; }   // (the model goes back to the pool unused)
  [b.x, b.y, b.psi] = trAt(path, b.d); b.v = b.d > 0 ? trVmax(b, b.x, b.y) * 0.8 : 0;
  m.active = true; m.root.visible = true; m.root.scale.setScalar(sp.k); m.fenders.visible = false; m.ropes.visible = false;
  TR.boats.push(b);
}
function trDespawn(b) { b.active = false; b.m.active = false; b.m.root.visible = false; b.m.ropes.visible = false; b.slot = null; }
function trReset() { for (const b of TR.boats) trDespawn(b); TR.boats.length = 0; TR.book.clear(); TR.planT = -99; }

// ---------- moving ----------
// something in her way along the path ahead: the RIB, or another boat. Two boats each in the other's way (meeting where
// two tracks join, or bow to bow): the one further behind gives way, by how far each lies ahead of the other along her
// own heading (the older boat if they are even)
function trBlocked(b) {
  const P = b.path, ahead = b.L / 2 + 2.5 + b.v * 3, rs = Math.sin(RB.psi), rc = Math.cos(RB.psi);
  const segD = (px, py, cx, cy, ux, uy, h) => { const t = clamp((px - cx) * ux + (py - cy) * uy, -h, h); return Math.hypot(px - cx - ux * t, py - cy - uy * t); };
  let rib = false, boat = null;
  for (let q = b.L * 0.3; q <= ahead + 0.01 && !rib && !boat; q += 1.2) {
    const [px, py] = trAt(P, b.d + q);
    if (RIB.root.visible && segD(px, py, RB.x, RB.y, rs, rc, 2.9) < b.B / 2 + 1.25 + 0.3) rib = true;
    for (const o of TR.boats) {
      if (o === b || !o.active) continue;
      if (segD(px, py, o.x, o.y, Math.sin(o.psi), Math.cos(o.psi), Math.max(0, o.L / 2 - o.B / 2)) >= (b.B + o.B) / 2 + 0.15) continue;
      if (o.blockBy === b) {
        const ab = (o.x - b.x) * Math.sin(b.psi) + (o.y - b.y) * Math.cos(b.psi), ao = (b.x - o.x) * Math.sin(o.psi) + (b.y - o.y) * Math.cos(o.psi);
        if (ab < ao - 0.5 || (Math.abs(ab - ao) <= 0.5 && b.id < o.id)) continue;   // she is the one further on: she goes
      }
      boat = o; break;
    }
  }
  b.blockBy = boat;
  return rib ? 'rib' : boat ? 'boat' : null;
}
function trMove(b, dt) {
  const rem = b.path.len - b.d, why = trBlocked(b);
  let vt = Math.min(trVmax(b, b.x, b.y), Math.sqrt(2 * 0.3 * Math.max(0, rem - 0.1)));
  if (why) { vt = 0; b.blockT += dt; if (why === 'rib') b.ribT += dt; } else { b.blockT = 0; b.ribT = 0; }
  if (why === 'rib' && b.ribT > 25) trAskRoom(b);
  b.v = approach(b.v, vt, (vt > b.v ? 0.25 : 0.7) * dt);
  b.d = Math.min(b.path.len, b.d + b.v * dt);
  if (!why && b.path.len - b.d < 0.25) { b.d = b.path.len; b.v = Math.min(b.v, 0.05); }   // there
  const [x, y, psi] = trAt(b.path, b.d), dpsi = Math.atan2(Math.sin(psi - b.psi), Math.cos(psi - b.psi));
  b.x = x; b.y = y; if (b.d < b.path.len - 0.5) b.psi += clamp(dpsi, -0.45 * dt, 0.45 * dt);
}
const trDone = (b) => b.d >= b.path.len - 0.05 && b.v < 0.06;
function trMayEnter(b) {
  if (b.k || !(b.dir === 'O' ? LKS.sigIn === 'go' : LKS.sigOut === 'go')) return false;   // from the front of the queue, on green
  for (const o of TR.boats) {
    if (o === b || !o.active) continue;
    if (o.state === 'enter') return false;   // one at a time
    // the last locking out first, clear of the entrance (the marina's narrow way in, or the walled approach)
    if (o.dir !== b.dir && (o.state === 'fast' || (o.state === 'leave' && (o.dir === 'I' ? lkS(o.x, o.y) > 12 : lkS(o.x, o.y) < 205)))) return false;
  }
  return true;
}
function trEnter(b) {
  const W = TR_WAIT[b.dir][b.k], ff = LKS.mode === 'ff', here = { xy: [b.x, b.y] };
  if (b.dir === 'O') {
    const lead = [[25, -53.5], [30, -50.5], [36, -48.5], [46, -46.2], [56, -45]];
    if (ff) { b.path = trPathToSea(b, [here, ...lead, [66, -42.5], [LOCK.sIn + 6, -42]]); b.d = 0; b.state = 'leave'; return true; }
    const sl = trSlot(b); if (!sl) return false;
    const pre = Math.max(LOCK.sIn + 4, sl.s - b.L * 0.9);
    b.path = trPath([here, ...lead, [66, sl.ct], [pre, sl.ct], [sl.s, sl.c]]); b.slot = sl;
  } else {
    const lead = [[W[0] - 12, -53.5], [200, -50], [185, -47.5], [170, -47], [LOCK.sOut + 3, -46.5]];
    if (ff) { if (trFairwayBusy('I')) return false; b.path = trPathToBerth(b, [here, ...lead, [LOCK.sOut - 6, -46], [LOCK.sIn - 3, -46]]); b.d = 0; b.state = 'leave'; return true; }
    const sl = trSlot(b); if (!sl) return false;
    const pre = Math.min(LOCK.sOut - 4, sl.s + b.L * 0.9);
    b.path = trPath([here, ...lead, [LOCK.sOut - 2, sl.ct], [pre, sl.ct], [sl.s, sl.c]]); b.slot = sl;
  }
  b.d = 0; b.state = 'enter'; return true;
}
// The marina's fairway is a boat's width where the moored boats crowd it, so it is used one way at a time: a boat leaves
// her berth for the lock only when none is on her way down from it, and one leaves the lock for her berth only when
// none is on her way up
const trFairwayBusy = (dir) => TR.boats.some(o => o.active && (dir === 'O' ? o.dir === 'I' && o.state === 'leave' : o.dir === 'O' && o.state === 'toWait'));
function trMayLeave(b) {
  if (b.dir === 'I' && trFairwayBusy('I')) return false;
  if (LKS.mode === 'ff') return true;
  if (!(b.dir === 'O' ? LKS.sigOut === 'go' : LKS.sigIn === 'go')) return false;
  const ex = (o) => o.dir === 'O' ? LOCK.sOut - o.slot.s : o.slot.s - LOCK.sIn;
  for (const o of TR.boats) {
    if (o === b || !o.active) continue;
    if (o.state === 'fast' && o.dir === b.dir && o.slot && ex(o) < ex(b) - 0.01) return false;   // nearest the gates first
    if (o.state === 'leave' && o.dir === b.dir && trInLockArea(o) && Math.hypot(o.x - b.x, o.y - b.y) < b.L + 8) return false;
  }
  return true;
}
function trLeave(b) {
  const sl = b.slot, occ = trOcc(b), fwd = b.dir === 'O' ? 1 : -1, exit = fwd > 0 ? LOCK.sOut : LOCK.sIn, h = b.L / 2;
  const [lo, hi] = trGap(occ, Math.min(exit, sl.s - h), Math.max(exit, sl.s + h));
  if (hi - lo < b.B + 0.5) return false;   // hemmed in: wait for room
  const ct = (lo + hi) / 2, here = { xy: [b.x, b.y] };
  if (b.dir === 'O') b.path = trPathToSea(b, [here, [Math.min(LOCK.sOut - 2, sl.s + b.L * 0.9), ct]]);
  else b.path = trPathToBerth(b, [here, [Math.max(LOCK.sIn + 2, sl.s - b.L * 0.9), ct], [LOCK.sIn - 3, -44.8]]);
  b.d = 0; b.v = 0; b.slot = null; b.state = 'leave'; return true;
}
function trAskRoom(b) {
  if (S.t - TR.blockT < 60) return; TR.blockT = S.t; b.ribT = 0;
  radio(b.name, `RIB ${inChamber(RB.x, RB.y) ? 'in the lock' : 'by the lock'}, ${b.kind} ${b.name}. Could you make room for us please? Over.`);
}
// on reaching her waiting spot, a call to the marina (now and then, so the radio is not all theirs)
function trArrivalCall(b) {
  const now = performance.now();   // now and then by the game's clock and the player's, and not with time sped up
  if (S.t - TR.chatT < 90 || now - (TR.chatW || -1e9) < 40000 || S.warp > 2) return; TR.chatT = S.t; TR.chatW = now;
  const open = b.dir === 'O' ? LKS.sigIn === 'go' : LKS.sigOut === 'go';
  radio(b.name, `Portishead Quays Marina, ${b.kind} ${b.name}, ${b.dir === 'O' ? 'by the lock for the lock-out' : 'off the pier for the lock-in'}, over.`);
  setTimeout(() => { if (S && b.active) radio('marina', `${b.name}, Portishead Quays. ${open ? 'Come in on green-white-green and make fast either side.' : 'Shortly: in on green-white-green, make fast either side.'} Over.`); }, 2600);
}
function trStep(b, dt) {
  switch (b.state) {
    case 'toWait': trMove(b, dt); if (trDone(b)) { b.state = 'wait'; b.waitT = S.t; if (!b.called) { b.called = true; trArrivalCall(b); } } break;
    case 'wait':
      b.v = 0;
      if (b.k && !TR.boats.some(o => o !== b && o.dir === b.dir && (o.state === 'toWait' || o.state === 'wait') && o.k === 0)) {   // the queue moves up
        const W = TR_WAIT.I[0]; b.k = 0; b.path = trPath([{ xy: [b.x, b.y] }, [W[0] + 8, W[1]], W]); b.d = 0; b.state = 'toWait';
      } else if (trMayEnter(b)) trEnter(b);
      break;
    case 'enter': trMove(b, dt); if (trDone(b)) { b.state = 'fast'; b.psi = b.dir === 'O' ? Math.atan2(LK_U[0], LK_U[1]) : Math.atan2(-LK_U[0], -LK_U[1]); } break;
    case 'fast': b.v = 0; if (trMayLeave(b)) trLeave(b); break;
    case 'leave': trMove(b, dt); if (trDone(b)) { b.state = b.dir === 'O' ? 'away' : 'berth'; b.endT = S.t; } break;
    case 'away': {   // on out to sea at her own speed, till she is far off
      const v = TR_SPEC[b.type].vSea; b.v = approach(b.v, v, 0.3 * dt); b.x += Math.sin(b.psi) * b.v * dt; b.y += Math.cos(b.psi) * b.v * dt;
      if (Math.hypot(b.x - camera.position.x, b.y + camera.position.z) > 1500) trDespawn(b); break;
    }
    case 'berth': b.v = 0; if (!trSeen(b.x, b.y, LKS.M) || S.t - b.endT > 300) trDespawn(b); break;
  }
}
// where she is drawn: on the water there, rising and falling with it, heeled a little by the sea, her bow up at speed
function trDraw(b, dt) {
  const m = b.m, t = S.t, w = waterBody(b.x, b.y), lv = w === 'lock' ? LKS.L : w === 'marina' ? LKS.M : S.tide, sp = Math.sin(b.psi), cp = Math.cos(b.psi);
  let heave = 0, pitch = 0, roll = 0;
  if (w === 'sea' && Math.hypot(b.x - camera.position.x, b.y + camera.position.z) < 900) {
    const hb = seaH(b.x + sp * b.L * 0.4, b.y + cp * b.L * 0.4, t), hs = seaH(b.x - sp * b.L * 0.4, b.y - cp * b.L * 0.4, t), hp = seaH(b.x - cp * b.B * 0.5, b.y + sp * b.B * 0.5, t), hq = seaH(b.x + cp * b.B * 0.5, b.y - sp * b.B * 0.5, t);
    heave = (hb + hs + hp + hq) / 4 * 0.85; pitch = Math.atan2(hb - hs, b.L * 0.8) * 0.7; roll = Math.atan2(hp - hq, b.B) * 0.6;
  }
  if (b.type === 'cruiser') pitch += 3.5 * DEG * smooth(3, 6.5, b.v);
  m.root.position.set(b.x, lv + heave - 0.05, -b.y); m.root.rotation.y = -b.psi; m.body.rotation.set(pitch, 0, roll);
  m.x = b.x; m.y = b.y; m.psi = b.psi;
  const inLock = b.state === 'enter' || b.state === 'fast' || (b.state === 'wait' && LKS.mode !== 'ff');
  m.fenders.visible = inLock;
  if (inLock) { const side = b.slot ? b.slot.side : b.dir === 'O' ? 0 : 1; m.fenders.scale.x = (side === 0 ? -1 : 1) * (b.dir === 'O' ? 1 : -1); }
  m.ropes.visible = b.state === 'fast' && !!b.slot;
  if (m.ropes.visible) {
    const sl = b.slot, k = b.scale, out = sl.side ? 1 : -1, gun = lv + TR_SPEC[b.type].fb * k, pont = LKS.L + 0.48, A = m.ropes.geometry.attributes.position;
    let i = 0;
    for (const f of [0.36, -0.36]) {
      const [gx, gy] = lkP(sl.s + f * b.L, sl.c + out * b.B * 0.42), [px, py] = lkP(sl.s + f * b.L * 1.25, TR_EDGE[sl.side] - out * 0.2);
      A.setXYZ(i++, gx, gun, -gy); A.setXYZ(i++, px, pont, -py);
    }
    A.needsUpdate = true;
  }
  // her wash
  if (b.v > 1 && w === 'sea' && Math.random() < b.v * 5 * dt) {
    const px = b.x - sp * b.L * 0.52 + (Math.random() - 0.5) * b.B * 0.6, py = b.y - cp * b.L * 0.52 + (Math.random() - 0.5) * b.B * 0.6;
    spawnFoam(px, py, -sp * 0.4 * b.v + (Math.random() - 0.5), -cp * 0.4 * b.v + (Math.random() - 0.5), 2 + Math.random() * 2, 0.4 + 0.08 * b.v);
  }
}
function trUpdate(dt) {
  if (!S) return;
  _trM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _trFr.setFromProjectionMatrix(_trM);
  if (S.t - TR.planT > 5 || S.t < TR.planT) { TR.planT = S.t; trPlan(); }
  for (const b of TR.boats) if (b.active) { trStep(b, dt); if (b.active) trDraw(b, dt); }
  if (TR.boats.some(b => !b.active)) TR.boats = TR.boats.filter(b => b.active);
}

// ---------- what the lock keeper asks of them ----------
// boats still to come in through this side's gates for the locking under way, or still to leave the chamber through them
function trPending(side) {
  for (const b of TR.boats) {
    if (!b.active) continue;
    const inward = side === 'in' ? 'O' : 'I';
    if (b.dir === inward && (b.state === 'toWait' || b.state === 'wait' || b.state === 'enter')) return true;
    if (b.dir !== inward && (b.state === 'fast' || (b.state === 'leave' && trInLockArea(b)))) return true;
  }
  return false;
}
const trInChamberCount = () => TR.boats.filter(b => b.active && b.state === 'fast').length;
// any of them in a gate's swing: the keeper will not close it on them
const trGateBusy = (hit) => TR.boats.some(b => b.active && hit(b.x, b.y, b.L / 2));
// the boats booked on the next locking her way, for the marina's answer on the radio
function trCompany(dir) {
  const L = TR.boats.filter(b => b.active && b.dir === dir && (b.state === 'toWait' || b.state === 'wait'));
  if (!L.length) return '';
  const say1 = (b) => `${b.name}, a ${b.kind}`;
  return L.length === 1 ? ` You'll share it with ${say1(L[0])}.` : ` You'll share it with ${say1(L[0])}, and ${say1(L[1])}.`;
}
