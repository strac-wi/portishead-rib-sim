
// ================= RIB: HIGHFIELD PATROL 660 WITH A HONDA BF150 =================
// The hull: Powerboat Magazine's test of the Patrol 660 (NZ; Suzuki 175, 15 x 21 propeller): 6.54 m, beam 2.49 m, 26°
// deadrise, and a table of speed against rpm from 1,000 (3.1 kn) to 5,950 (38.4 kn), on the plane just over 8 kn. Its
// resistance curve was worked back from that table through the propeller model, and is kept: it is the hull's.
// The engine is the user's: a Honda BF150 (2.4 litre four, 150 hp at 5,500 rpm, full throttle 5,000-6,000, 2.14:1
// gearbox; Honda's specification), with the 14.75 x 16 three-blade stainless propeller of Honda's own test of the BF150
// on a Highfield DL640 (6,350 rpm and 43.9 mph at full throttle on that lighter hull). The propeller model's torque is
// set so it is as efficient at full throttle as the test boat's (about 39%), which puts her full-throttle rpm in the
// upper half of Honda's band: 5,870 rpm and 34 kn with the leg trimmed well (a 17 in pitch held her at 5,525 and no
// faster). About 1,150 kg all up with two aboard and fuel: sellers' claims of about 38 kn will be lighter boats.
const RIBC = { m: 1150, L: 6.54, B: 2.49, xe: -3.15, gr: 2.14, D: 0.375, P: 0.406, kJ: 1.542, kq0: 0.105, rho: 1025, idle: 700, limit: 6300, Je: 0.24, Alu: 0.04, Al: 4.2, Af: 2.7,
  // hull in sway and yaw: linear lift of the V (N per m/s per m/s), where it acts (m forward of the pivot, at rest and on
  // the plane); cross-flow drag coefficient on the strips below, off the plane (the V slides, so the stern swings out
  // under the leg's push) and on it (the chines and strakes bite); linear yaw damping (at rest, and growing with speed);
  // and the share of the Munk moment
  yv0: 300, yv1: 400, xl0: 0.2, xl1: -0.2, cd: 0.22, cd1: 0.6, nr0: 1000, nr1: 400, munk: 0.5 };
// the lateral plane in strips, [x forward of the pivot, depth]: at rest she sits by the stern on her deep-V, the leg and
// the after ends of the tubes in the water and the forefoot barely wet, so most of the grip is aft; on the plane only the
// after third is wet
const HULL_ST = [[-3.2, 0.42], [-2.4, 0.4], [-1.6, 0.37], [-0.8, 0.33], [0, 0.28], [0.8, 0.2], [1.6, 0.1]];
const RIB_RW = [[0, 0], [1, 0.006], [1.59, 0.0336], [2.42, 0.0751], [3.24, 0.133], [4.37, 0.198], [5.4, 0.222], [6.5, 0.205], [7.87, 0.172], [9.98, 0.18], [12.35, 0.167], [14.51, 0.158], [16.41, 0.165], [18.16, 0.188], [19.75, 0.207], [22, 0.25]];
function ribRW(V) { V = Math.abs(V); for (let i = 1; i < RIB_RW.length; i++) if (V <= RIB_RW[i][0]) { const [a, ra] = RIB_RW[i - 1], [b, rb] = RIB_RW[i]; return ra + (rb - ra) * (V - a) / (b - a); } return 0.25 * (V / 22) ** 2; }
// 150 hp (112 kW) at 5,500 rpm; torque peaking about 205 Nm round 4,300
const ribTmax = (rpm) => 205 * Math.max(0.35, 1 - ((rpm - 4300) / 5200) ** 2);
// points round the hull for contacts and grounding: [x forward, y starboard, draft]; the last is the leg
const RIB_PTS = [[3.15, 0, 0.2], [2.4, 0.86, 0.26], [2.4, -0.86, 0.26], [1.0, 1.24, 0.32], [1.0, -1.24, 0.32], [-1.0, 1.24, 0.4], [-1.0, -1.24, 0.4], [-2.9, 1.15, 0.45], [-2.9, -1.15, 0.45], [-3.5, 0, 0.73]];
const LEG_X = -3.3;   // contact points aft of this are the leg
const RB = { x: 0, y: 0, psi: 0, u: 0, v: 0, r: 0, rpm: 0, lever: 0, wheel: 0, trim: 0, eng: 'off', crank: 0, kill: true, vent: 0, T: 0, gear: 0, plane: 0,
  fast: false, pose: null, detent: 0, pitch: 0, roll: 0, prop: 0, contactT: -99, groundT: -99, gearWarned: 0, foamAcc: 0, sprayAcc: 0,
  drill: { id: 'free', stage: 0 }, cas: null, lv: 13.3,
  hz: 0, hw: 0, th: 0, q: 0, eta: [null, null], airT: [0, 0], air: 0, gz: 1, gPeak: 1, slamT: -99, slamN: 0, slamV: 0, flyT: 0, warnT: -99, hzv: 0, thv: 0 };
const RIB = {};
const LEV_IDLE = 0.14, S_N = 0.07, S_I = 0.27;
function levOfS(s) { const a = Math.abs(s); return Math.sign(s) * (a < S_N ? 0 : a < S_I ? LEV_IDLE : 0.16 + (a - S_I) / (1 - S_I) * 0.84); }
function sOfLev(v) { const a = Math.abs(v); return Math.sign(v) * (a <= 0.12 ? 0 : a < 0.16 ? (S_N + S_I) / 2 : S_I + (a - 0.16) / 0.84 * (1 - S_I)); }
const WEATHER = {
  flat:     { label: 'Flat calm', wind: 1.5, from: 220, gust: 0.1, wave: 0.02, vis: 16000 },
  calm:     { label: 'Calm', wind: 6, from: 220, gust: 0.15, wave: 0.06, vis: 14000 },
  moderate: { label: 'Moderate SW', wind: 16, from: 225, gust: 0.25, wave: 0.22, vis: 12000 },
  fresh:    { label: 'Fresh W', wind: 26, from: 255, gust: 0.35, wave: 0.42, vis: 9000 },
  custom:   { label: 'Your own', wind: 13.5, from: 225, gust: 0.24, wave: 0.17, vis: 12500 },
};
// Your own wind: a Beaufort force (its mean speed in knots, the middle of the force's band) from any of sixteen points.
// The rest follows from the speed on the lines the set weathers lie on: gustier, a bigger swell up the channel and
// thicker air the harder it blows. The chop, its lee and the white horses are worked out from the wind itself, as ever;
// the stream is the tide's.
const BEAUFORT = [['Calm', 0.5], ['Light air', 2], ['Light breeze', 5], ['Gentle breeze', 8.5], ['Moderate breeze', 13.5], ['Fresh breeze', 19], ['Strong breeze', 24.5], ['Near gale', 30.5], ['Gale', 37]];
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function customWeather(bft, pt) {
  const kn = BEAUFORT[bft][1];
  return Object.assign(WEATHER.custom, { label: `Force ${bft} ${POINTS[pt]}`, wind: kn, from: pt * 22.5, gust: 0.1 + 0.035 * bft, wave: clamp(0.02 * kn - 0.1, 0.02, 0.65), vis: clamp(16000 - 260 * kn, 6000, 16000) });
}
// Wind chop: fetch-limited (JONSWAP) height and period from the wind over the estuary's fetch (about 12 km from the west
// down the Bristol Channel's upper reach); six trains spread about the downwind direction. The hull feels each through a
// factor for her length (she bridges what is short against her).
function chopSea() {
  const U = Math.max(1, S.wx.wind * KN), F = 12000, g = 9.81, x = g * F / (U * U);
  const Hs = 0.0016 * Math.sqrt(x) * U * U / g, Tp = 0.286 * Math.cbrt(x) * U / g, L = g * Tp * Tp / (2 * Math.PI), to = (S.wind.from + 180) * DEG;
  const P = [[-40, 1.25, 0.6], [-18, 1.0, 1.0], [-4, 0.82, 0.9], [9, 1.12, 0.85], [24, 0.68, 0.65], [40, 0.55, 0.45]];
  const sw = Math.sqrt(P.reduce((t, q) => t + q[2] * q[2], 0) / 2), sig = 0.3 * Hs;
  const C = P.map(([deg, lf, wt], i) => { const l = L * lf, b = to + deg * DEG; return { k: 2 * Math.PI / l, w: Math.sqrt(g * 2 * Math.PI / l), a: sig * wt / sw, hull: l / (l + RIBC.L), dx: Math.sin(b), dy: Math.cos(b), ph: i * 1.7 }; });
  seaShelter(to);
  return Object.assign(C, { Hs, L, sig, to, resist: Hs * (L / (L + RIBC.L) + 0.7 * L / (0.7 * L + RIBC.L)) });
}
function chopH(x, y, t) { const C = S.chop || (S.chop = chopSea()); let h = 0; for (let i = 0; i < C.length; i++) { const c = C[i]; h += c.a * c.hull * Math.sin(c.k * (c.dx * x + c.dy * y) - c.w * t + c.ph); } return h; }
// the water's own movement at a point: the estuary's stream, or in the lock the run of water from the sluices while it levels
function waterVel(x, y) {
  const w = waterBody(x, y);
  if (w === 'lock') {
    const Q = LKS.Q; if (Math.abs(Q) < 0.2) return { x: 0, y: 0 };
    const depth = Math.max(1.5, LKS.L - LOCK.floor), v = Math.abs(Q) / (LOCK.w * depth), s = lkS(x, y);
    // jets off the sluices at the end the water comes in by (filling from the marina) or is drawn out towards (emptying)
    const end = Q > 0 ? smooth(LOCK.sIn + 25, LOCK.sIn + 2, s) : smooth(LOCK.sOut - 25, LOCK.sOut - 2, s);
    const sw = (fbm(S.t * 0.35 + x * 0.05, y * 0.05) - 0.5) * 2, sw2 = (fbm(y * 0.06 - 7, S.t * 0.3 + 3) - 0.5) * 2;
    const along = v * (1 + 2.5 * end) + 0.4 * v * sw, across = v * (1.2 + 2 * end) * sw2;
    return { x: LK_U[0] * along + LK_N[0] * across, y: LK_U[1] * along + LK_N[1] * across };
  }
  return currentAt(x, y);
}
// obstacles that move or that the raster does not hold: the gate leaves, and the moored boats near her
function ribBoxes() {
  const B = [];
  for (const gt of MAR.gates) {
    const o = gt.which === 'in' ? LKS.gIn : LKS.gOut;
    for (const lf of gt.leaves) {
      const a = lf.closed + lf.dir * o * 82 * DEG, ax = Math.cos(a), ay = Math.sin(a), [px, py] = [lf.g.position.x, -lf.g.position.z];
      B.push({ cx: px + ax * LOCK.gateR / 2, cy: py + ay * LOCK.gateR / 2, ax, ay, hu: LOCK.gateR / 2, hv: 0.4, name: gt.which === 'in' ? 'the marina-side gates' : 'the sea-side gates' });
    }
  }
  for (const b of BOATS) {
    if (Math.abs(b.x - RB.x) > 30 || Math.abs(b.y - RB.y) > 30) continue;
    B.push({ cx: b.x, cy: b.y, ax: Math.sin(b.psi), ay: Math.cos(b.psi), hu: b.L / 2, hv: b.B / 2, name: 'a moored boat', boat: true });
  }
  for (const b of TR.boats) {
    if (!b.active || Math.abs(b.x - RB.x) > 30 || Math.abs(b.y - RB.y) > 30) continue;
    B.push({ cx: b.x, cy: b.y, ax: Math.sin(b.psi), ay: Math.cos(b.psi), hu: b.L / 2 - 0.1, hv: b.B / 2, name: `the ${b.kind} ${b.name}`, boat: true });
  }
  return B;
}
// ---------- physics ----------
function ribPhys(dt) {
  const C = RIBC, R = RB, g = 9.81, W = C.m * g, sp = Math.sin(R.psi), cp = Math.cos(R.psi);
  const cur = R._cur, ur = R.u - (cur.x * sp + cur.y * cp), vr = R.v - (cur.x * cp - cur.y * sp), U = Math.hypot(ur, vr);
  const gear = R.eng !== 'run' ? 0 : R.lever > 0.12 ? 1 : R.lever < -0.12 ? -1 : 0;
  if (gear && !R.gear && R.rpm > 1400 && S.t - R.gearWarned > 4) { R.gearWarned = S.t; msg(`Clunk: shifted into gear at ${Math.round(R.rpm)} rpm. Let the revs drop first.`); }
  R.gear = gear;
  const tau = gear === 0 ? 0 : clamp((Math.abs(R.lever) - 0.16) / 0.84, 0, 1) ** 1.15;
  const delta = R.wheel * 32 * DEG;
  const ve = vr + R.r * C.xe, Va = (ur * Math.cos(delta) - ve * Math.sin(delta)) * 0.96;
  const np = R.rpm / 60 / C.gr, nD = Math.max(np * C.D, 0.05);
  let Kt = 0, Kq = 0;
  if (gear === 1) { const J = Va / nD * C.kJ; Kt = 0.55 - 0.1192 * J - 0.136 * J * J; Kq = C.kq0 * (1 - J / 1.95); }
  else if (gear === -1) { const J = -Va / nD * C.kJ; Kt = -0.6 * (0.55 - 0.1192 * J - 0.136 * J * J); Kq = C.kq0 * 0.8 * (1 - J / 1.95); }
  const ventT = gear ? clamp(smooth(7, 13, R.trim) * (1 - smooth(6, 12, U)) + smooth(0.35, 0.7, Math.abs(R.r) * U / g) * smooth(2, 9, R.trim) * smooth(9, 14, U), 0, 1) : 0;
  R.vent += (ventT - R.vent) * Math.min(1, dt * (ventT > R.vent ? 6 : 2));
  const n2D4 = C.rho * np * np * C.D ** 4, T = Kt * n2D4 * (1 - 0.65 * R.vent) * (1 - 0.92 * R.air), Qp = Math.max(0, Kq) * n2D4 * C.D * (1 - 0.7 * R.vent) * (1 - 0.88 * R.air);
  R.T = T;
  let Te = 0;
  if (R.eng === 'run') { Te = ribTmax(R.rpm) * tau + clamp((C.idle - R.rpm) * 1.5, 0, 48); if (R.rpm > C.limit) Te = 0; }
  else if (R.eng === 'crank') Te = R.rpm < 280 ? 40 : 0;
  const drag = (3 + 0.0026 * R.rpm) * (1 - tau * 0.85), w = R.rpm * Math.PI / 30;
  R.rpm = Math.max(0, (w + (Te - Qp / (C.gr * 0.95) - drag) / C.Je * dt) * 30 / Math.PI);
  const p = smooth(5, 8, Math.abs(ur)); R.plane = p;
  const trimF = 1 + (1 - p) * 0.018 * (R.trim + 2) + p * 0.0042 * (R.trim - 5) ** 2;
  const mx = C.m * 1.06, my = C.m * (1.4 - 0.25 * p), Iz = C.m * (C.L * C.L + C.B * C.B) / 12 * 1.45;
  let X = 0, Y = 0, N = 0;
  const tx = T * Math.cos(delta), ty = -T * Math.sin(delta);
  X += tx; Y += ty; N += C.xe * ty;
  const Ue2 = ur * ur + ve * ve, alpha = delta + Math.atan2(ve, Math.abs(ur) + 0.3) * Math.sign(ur || 1);
  const CLu = 1.1 * Math.tanh(3 * alpha / 1.1) * (1 - 0.45 * smooth(0.42, 0.8, Math.abs(alpha))), Ylu = -0.5 * C.rho * C.Alu * Ue2 * CLu * (ur >= 0 ? 1 : -0.8);
  Y += Ylu * Math.cos(delta); X -= Math.abs(Ylu * Math.sin(delta)) * 0.25; N += C.xe * Ylu;
  X -= W * ribRW(ur) * trimF * Math.sign(ur) * (ur < 0 ? 2.2 : 1);
  // the V-bottom as a low-aspect wing: lift against drift, a little forward of the pivot at rest and aft of it planing
  const Yl = -(C.yv0 + C.yv1 * p) * U * vr * (1 - 0.45 * clamp(R.airT[0] * 6, 0, 1));
  Y += Yl; N += (C.xl0 + (C.xl1 - C.xl0) * p) * Yl;
  // cross-flow drag strip by strip, each at its own sideways speed (v + x r): in a turn the stern sweeps out and is
  // pushed back, which is what stops a deep-V hull yawing once the drive comes off
  for (const [xs, ds] of HULL_ST) {
    const wet = 1 - p * smooth(-2.2, -0.6, xs) * 0.9, wS = 0.5 * C.rho * (C.cd + (C.cd1 - C.cd) * p) * ds * 0.8 * wet * (1 - 0.5 * p), vl = vr + xs * R.r, F = -wS * vl * Math.abs(vl);
    Y += F; N += xs * F;
  }
  N += -(C.nr0 + C.nr1 * U) * R.r - C.munk * (my - mx) * ur * vr;
  X -= 0.06 * C.m * Math.abs(R.r) * Math.abs(ur);
  // in a seaway: heave and pitch on springs and dampers at the forefoot and the transom, riding the swell and the chop
  {
    // the lee of the land, the lock's walls and the shallows quieten the water under her, as they do the water drawn
    const PT = [1.8, -2.3], kk = 22600 * (1 + 2 * p), cc = 2340 * (1 + p), Iy = C.m * 3.8, t = S.t, SK = R._sk, sea = SK.sh * Math.max(SK.ch, SK.sw);
    const shareB = Math.max(0.14, 0.45 - 0.25 * p - 0.01 * p * R.trim);
    let Fz = 0, My = 0, immS = 1;
    for (let i = 0; i < 2; i++) {
      const xb = PT[i]; let eta = 0;
      if (sea > 0.01) { for (const du of [-1.4, 0, 1.4]) for (const dv of [-0.9, 0.9]) { const a = xb + du, wx = R.x + a * sp + dv * cp, wy = R.y + a * cp - dv * sp; eta += waveH(wx, -wy, t) * SK.sw + chopH(wx, wy, t) * SK.ch; } eta *= SK.sh / 6; }
      const prev = R.eta[i] === null ? eta : R.eta[i]; R.eta[i] = eta;
      const rel = (eta - prev) / dt - (R.hw + xb * R.q), s0 = (i ? 1 - shareB : shareB) * C.m * g / kk, imm = s0 + eta - (R.hz + xb * R.th);
      if (imm > 0 && R.airT[i] > 0.2 && rel > 1.2) { R.slamV = Math.max(R.slamV, rel); R.slamN++; R.slamT = S.t; R.u -= Math.sign(R.u) * 0.07 * rel * p * Math.min(1, Math.abs(R.u) / 8); }
      R.airT[i] = imm > 0 ? 0 : R.airT[i] + dt;
      const F = (imm > 0 ? Math.max(0, kk * imm + cc * rel) : 0) - kk * s0;
      Fz += F; My += F * xb; if (i) immS = imm;
    }
    R.hw += Fz / C.m * dt; R.q += My / Iy * dt; R.hz += R.hw * dt; R.th += R.q * dt;
    R.air += ((immS < -0.03 ? 1 : 0) - R.air) * Math.min(1, dt * 25);
    R.gz += (1 + Fz / (C.m * g) - R.gz) * Math.min(1, dt * 18); R.gPeak = Math.max(R.gPeak - dt * 2, R.gz);
    R.flyT = R.airT[0] > 0 && R.airT[1] > 0 ? R.flyT + dt : 0;
    const Hs = (S.chop || (S.chop = chopSea())).resist * SK.ch * SK.sh;
    X -= Math.sign(ur) * W * 6 * (Hs / C.L) ** 2 * smooth(3, 15, Math.abs(ur));
  }
  const _X0 = X;
  // windage, centred forward of the pivot so the bow blows off
  const vxw = R.u * sp + R.v * cp, vyw = R.u * cp - R.v * sp, ax = S.wind.x * R._shel - vxw, ay = S.wind.y * R._shel - vyw, au = ax * sp + ay * cp, av = ax * cp - ay * sp;
  const Fwy = 0.5 * 1.225 * 1.1 * C.Al * av * Math.abs(av);
  X += 0.5 * 1.225 * 0.8 * C.Af * au * Math.abs(au); Y += Fwy; N += 0.55 * Fwy;
  const _X1 = X;
  // contacts: tubes against pontoons, quays, the lock walls and gates, the pier and moored boats; grounding and prop strikes
  let groundNow = false, contactNow = null, contactV = 0;
  for (const [xb, yb, dr] of RIB_PTS) {
    const wx = R.x + xb * sp + yb * cp, wy = R.y + xb * cp - yb * sp;
    const pu = R.u - R.r * yb, pv = R.v + R.r * xb, vx = pu * sp + pv * cp, vy = pu * cp - pv * sp;
    let fx = 0, fy = 0;
    // the tube against a pontoon, wall or boat: a soft spring, well damped (the tube and the fenders take it up), and a
    // little friction along the face
    const push = (nx, ny, pen, name, k = 5e4) => {
      const vn = vx * nx + vy * ny, vt = -vx * ny + vy * nx, Fn = Math.max(0, k * pen - (vn < 0 ? 1.4e4 : 5e3) * vn), Ft = clamp(-vt * 900, -0.3 * Fn, 0.3 * Fn);
      fx += nx * Fn - ny * Ft; fy += ny * Fn + nx * Ft;
      if (vn < -contactV) { contactV = -vn; contactNow = name; }
    };
    if (xb > LEG_X) {
      if (solidAt(wx, wy)) {
        const e = nearEdge(wx, wy);
        if (e && e.d < 3) {
          let nx = e.px - wx, ny = e.py - wy; const d = Math.hypot(nx, ny);
          if (d > 1e-3) { nx /= d; ny /= d; } else { const l = Math.hypot(e.ex, e.ey) || 1; nx = e.ey / l; ny = -e.ex / l; if (solidAt(wx + nx * 0.3, wy + ny * 0.3)) { nx = -nx; ny = -ny; } }
          const nm = edgeName(e.n, wx, wy); push(nx, ny, d + 0.04, nm, 6e4);
        }
      }
      for (const b of R._boxes) {
        const dx = wx - b.cx, dy = wy - b.cy, u = dx * b.ax + dy * b.ay, v = -dx * b.ay + dy * b.ax;
        const pu2 = b.hu + 0.05 - Math.abs(u), pv2 = b.hv + 0.05 - Math.abs(v);
        if (pu2 <= 0 || pv2 <= 0) continue;
        if (pu2 < pv2) push(b.ax * Math.sign(u), b.ay * Math.sign(u), pu2, b.name); else push(-b.ay * Math.sign(v), b.ax * Math.sign(v), pv2, b.name);
      }
      if (R.cas && !R.cas.out) {   // the casualty in the water: a soft knock, and running over them is scored below
        const dx = wx - R.cas.x, dy = wy - R.cas.y, d = Math.hypot(dx, dy);
        if (d < 0.45 && d > 1e-3) push(dx / d, dy / d, 0.45 - d, 'the casualty', 8e3);
      }
    }
    const h = heightAt(wx, wy), depth = R.lv - h, draft = xb < LEG_X ? dr - 0.025 * Math.max(0, R.trim) : dr;
    if (depth < draft && !solidAt(wx, wy)) {
      const pen = Math.min(draft - depth, 1.5), gx = heightAt(wx + 1, wy) - heightAt(wx - 1, wy), gy = heightAt(wx, wy + 1) - heightAt(wx, wy - 1), gl = Math.hypot(gx, gy) || 1;
      fx += -gx / gl * 2e4 * pen - 1500 * vx; fy += -gy / gl * 2e4 * pen - 1500 * vy;
      groundNow = true;
      if (xb < LEG_X && R.gear && R.rpm > 900 && S.t - R.groundT > 3) { R.groundT = S.t; ribPen('Prop strike: the leg hit the bottom', 120); }
      else if (xb >= LEG_X && S.t - R.groundT > 3 && Math.hypot(R.u, R.v) > 1) { R.groundT = S.t; ribPen(`Ran aground on the mud at ${(Math.hypot(R.u, R.v) / KN).toFixed(1)} kn`, Math.round(60 + Math.hypot(R.u, R.v) / KN * 25)); }
    }
    if (fx || fy) { const fu = fx * sp + fy * cp, fv = fx * cp - fy * sp; X += fu; Y += fv; N += xb * fv - yb * fu; }
  }
  if (contactNow && S.t - R.contactT > 1.2 && contactV > 0.12) {
    const kn = contactV / KN; R.contactMax = Math.max(R.contactMax || 0, kn);
    if (kn > 2.5) ribPen(`Hit ${contactNow} at ${kn.toFixed(1)} kn`, Math.round(40 + kn * 40)); else log(`Touched ${contactNow} at ${kn.toFixed(1)} kn`);
  }
  if (contactNow) R.contactT = S.t;
  R.grounded = groundNow; R._dbg = { hull: _X0, wind: _X1 - _X0, contacts: X - _X1, cn: contactNow, T: R.T };
  // made fast: bow, stern and spring lines hold her where she lay (in the lock she rides up and down with the water)
  if (R.fast && R.pose) {
    const Pz = R.pose, vxw2 = R.u * sp + R.v * cp, vyw2 = R.u * cp - R.v * sp;
    const fx = -3000 * (R.x - Pz.x) - 2600 * vxw2, fy = -3000 * (R.y - Pz.y) - 2600 * vyw2;
    X += fx * sp + fy * cp; Y += fx * cp - fy * sp;
    N += -9000 * Math.atan2(Math.sin(R.psi - Pz.psi), Math.cos(R.psi - Pz.psi)) - 2500 * R.r;
  }
  R.u += (X + my * R.v * R.r) / mx * dt;
  R.v += (Y - mx * R.u * R.r) / my * dt;
  R.r += N / Iz * dt;
  R.x += (R.u * sp + R.v * cp) * dt; R.y += (R.u * cp - R.v * sp) * dt; R.psi += R.r * dt;
  R.prop += (R.gear || 0) * R.rpm / C.gr / 60 * Math.PI * 2 * dt;
}
function edgeName(n, x, y) {
  const S_ = SOLID, e = S_.edges[n];
  { const s_ = lkS(x, y), c_ = lkC(x, y); if (s_ > LOCK.ps0 - 1 && s_ < LOCK.ps1 + 1 && (Math.abs(c_ - LOCK.cNW) < LOCK.pw + 0.6 || Math.abs(c_ - LOCK.cSE) < LOCK.pw + 0.6)) return 'the lock pontoon'; }
  if (inChamber(x, y) || (Math.abs(lkS(x, y) - (LOCK.sIn + LOCK.sOut) / 2) < 32 && Math.abs(lkC(x, y) - LOCK.cMid) < 9)) return 'the lock wall';
  if (inPier(x, y)) return 'the pier';
  if (inDock(x, y)) return 'a pontoon';
  const s = lkS(x, y); if (s > LOCK.sOut && s < APPROACH.s1 + 5) return 'the approach wall';
  void e; return inDock(x + 2, y) || inDock(x - 2, y) ? 'the quay wall' : 'the sea wall';
}
function ribPen(text, pts) { log(`${text} (−${pts})`, 'warn'); toast(text, 'warn'); (RB.drill.pen = RB.drill.pen || []).push({ text, pts }); }
// ---------- engine, lines, man overboard ----------
function ribEngine() {
  const R = RB;
  if (R.eng !== 'off') { R.eng = 'off'; log('Engine stopped'); return; }
  if (!R.kill) return msg('Clip the kill cord on first');
  if (Math.abs(R.lever) > 0.12) return msg('Put the lever in neutral to start');
  R.eng = 'crank'; R.crank = 1.1; log('Starting the engine');
}
function ribKill() {
  RB.kill = !RB.kill;
  if (!RB.kill && RB.eng !== 'off') { RB.eng = 'off'; msg('Kill cord pulled: engine stopped'); }
  else msg(RB.kill ? 'Kill cord clipped on' : 'Kill cord off');
}
// what she can make fast to here: the nearest solid edge abeam, within a step, parallel to her and with her stopped
function ribAlongside() {
  const R = RB, sp = Math.sin(R.psi), cp = Math.cos(R.psi); let best = null;
  for (const side of [1, -1]) for (const xb of [1.8, 0, -2.0]) {
    const px = R.x + xb * sp + side * RIBC.B / 2 * cp, py = R.y + xb * cp - side * RIBC.B / 2 * sp;
    const e = nearEdge(px, py); if (!e) continue;
    const l = Math.hypot(e.ex, e.ey) || 1, ang = Math.abs(Math.atan2(sp * e.ey / l - cp * e.ex / l, sp * e.ex / l + cp * e.ey / l)), par = Math.min(ang, Math.PI - ang) / DEG;
    if (!best || e.d < best.d) best = { d: e.d, par, side, x: e.px, y: e.py };
  }
  return best;
}
// where her bow and stern lines go ashore: to the nearest cleats on the lock's pontoons, otherwise to the nearest point of
// the pontoon, quay or wall a little ahead of the bow and astern of the stern; and how high that end sits now
function fastPoints(side) {
  const R = RB, sp = Math.sin(R.psi), cp = Math.cos(R.psi), out = [];
  for (const [xb, ahead] of [[2.3, 1.6], [-2.6, -1.6]]) {
    const bx = R.x + (xb + ahead) * sp + side * RIBC.B / 2 * cp, by = R.y + (xb + ahead) * cp - side * RIBC.B / 2 * sp;
    let px = bx, py = by;
    if (inChamber(R.x, R.y) && MAR.lockCleats) { let best = null; for (const c of MAR.lockCleats) { const d = Math.hypot(c.x - bx, c.y - by); if (!best || d < best.d) best = { d, c }; } if (best) { px = best.c.x; py = best.c.y; } }
    else { const e = nearEdge(bx, by); if (e) { px = e.px; py = e.py; } }
    const w = waterBody(R.x, R.y), onPont = w === 'lock' || (w === 'marina' && !(heightAt(px, py) > 14 && !inDock(px, py)));
    const top = w === 'lock' ? () => LKS.L + 0.48 : onPont ? () => LKS.M + 0.55 : () => QUAY + 0.1;
    out.push({ x: px, y: py, xb, side, top });
  }
  return out;
}
function ribLines() {
  const R = RB;
  if (R.fast) {
    R.fast = false; log('Lines let go');
    const D = R.drill; if (D.id === 'alongside' && D.stage === 0) { D.stage = 1; D.t0 = S.t; }
    if (D.id === 'lock' && D.stage === 0 && !D.called) { /* still at the berth */ }
    return;
  }
  const sog = Math.hypot(R.u, R.v) / KN, A = ribAlongside(), w = waterBody(R.x, R.y);
  if (!A || A.d > 2.5) return msg(w === 'sea' ? 'Nothing to make fast to here: come alongside a pontoon, the lock wall or a hammerhead' : 'Get her alongside first: closer than a step');
  if (A.d > 0.75) return msg('Get her alongside first: closer than a step');
  if (A.par > 20) return msg('Lie her parallel first');
  if (sog > 0.7) return msg('Stop her alongside first');
  R.fast = true; R.pose = { x: R.x, y: R.y, psi: R.psi };
  R.fastPts = fastPoints(A.side);
  // where: the lock, the start berth, a hammerhead, or any other pontoon
  let at = 'pontoon', hh = null;
  if (inChamber(R.x, R.y)) at = 'lock';
  else if (Math.hypot(R.x - PD.start.x, R.y - PD.start.y) < 3.5) at = 'berth';
  else for (const h of HAMMER) { const dx = R.x - h.berth[0], dy = R.y - h.berth[1]; if (Math.abs(dx * 0.618 + dy * 0.786) < h.L / 2 + 1 && Math.abs(dx * 0.786 - dy * 0.618) < 2.2) { at = 'hammer'; hh = h; } }
  R.fastAt = at; R.fastH = hh;
  log(at === 'lock' ? 'Line on the wall: made fast in the lock' : at === 'berth' ? 'Back in your berth: made fast' : at === 'hammer' ? `Alongside the ${hh.arm} hammerhead: made fast` : 'Made fast alongside', 'good');
  const D = R.drill;
  if (D.id === 'alongside' && D.stage >= 1 && at === 'hammer' && hh && hh.arm === D.arm) ribDrillDone();
  if (D.id === 'lock' && D.stage === 9 && at === 'berth') ribDrillDone();
}
function ribMOB() {
  const R = RB, sp = Math.sin(R.psi), cp = Math.cos(R.psi);
  if (waterBody(R.x, R.y) !== 'sea') return msg('Man overboard is practised out in the estuary: get out of the marina first');
  R.cas = { x: R.x - sp * 4, y: R.y - cp * 4, t: S.t, warned: false };
  RIB.cas.visible = true; R.drill = { id: 'mob', stage: 1, t0: S.t, pen: [] };
  toast('Man overboard! Turn back, keep them in sight and come alongside slowly', 'warn'); log('Man overboard!', 'warn');
}
// ---------- drills ----------
const DRILLS = ['free', 'alongside', 'lock', 'mob'];
const DRILL_NAME = { free: 'Free practice', alongside: 'Come alongside a hammerhead', lock: 'Lock out and back in', mob: 'Man overboard' };
const DRILL_SHORT = { free: 'free', alongside: 'hammerhead', lock: 'lock', mob: 'MOB' };
function ribSetDrill(id) {
  TRK.pts = []; TRK.acc = 0;
  const R = RB; R.drill = { id, stage: 0, t0: S.t, pen: [] }; R.contactMax = 0; R.cas = null; RIB.cas.visible = false;
  if (id === 'alongside') {
    const free = HAMMER.filter(h => !h.occ); const h = free[Math.floor(Math.random() * free.length)];
    R.drill.arm = h.arm; R.drill.h = h; R.drill.stage = R.fast ? 0 : 1;
    msg(`Come alongside the empty hammerhead at the end of ${h.arm} pontoon, outlined in green`);
  }
  if (id === 'mob') { R.drill.stage = 0; R.drill.due = null; }
  if (id === 'lock') { R.drill.stage = 0; R.drill.reds = 0; R.drill.loose = 0; }
  setT($('rDrill'), 'Drill: ' + DRILL_NAME[id]); log('Drill: ' + DRILL_NAME[id]);
}
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function ribDrillDone() {
  const R = RB, D = R.drill, rows = [], pen = (D.pen || []).reduce((a, p) => a + p.pts, 0);
  let pts = 600, title = '';
  if (D.id === 'alongside') {
    const t = S.t - D.t0; title = `Alongside ${D.arm} hammerhead`;
    rows.push(['Time from letting go', mmss(t), '']); rows.push(['Hardest touch', (R.contactMax || 0).toFixed(1) + ' kn', '']);
    if ((R.contactMax || 0) < 0.6) { rows.push(['Laid her alongside without a bump', '+150', 'pos']); pts += 150; }
  } else if (D.id === 'mob') {
    const t = S.t - D.t0; title = 'Casualty recovered';
    rows.push(['Time to recover', mmss(t), '']);
    const tp = Math.round(clamp((90 - t) * 3, -200, 200)); rows.push([tp >= 0 ? 'Quick recovery (under 1:30)' : 'Slow recovery (over 1:30)', (tp >= 0 ? '+' : '') + tp, tp >= 0 ? 'pos' : 'neg']); pts += tp;
  } else if (D.id === 'lock') {
    const t = S.t - D.t0; title = 'Locked out and back in';
    rows.push(['Time from the first call', mmss(t), '']); rows.push(['Hardest touch', (R.contactMax || 0).toFixed(1) + ' kn', '']);
    pts = 900; if ((R.contactMax || 0) < 0.6) { rows.push(['No bumps in the lock', '+150', 'pos']); pts += 150; }
  }
  (D.pen || []).forEach(p => rows.push([p.text, '−' + p.pts, 'neg']));
  const score = Math.max(0, pts - pen); rows.push(['Score', String(score), 'pos']);
  trkSnap(DRILL_NAME[D.id]);
  $('repEyebrow').textContent = DRILL_NAME[D.id]; $('repTitle').textContent = title;
  $('repTable').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td class="${r[2]}">${r[1]}</td></tr>`).join('');
  $('report').hidden = false; log(`${title}. Scored ${score}.`, 'good');
  R.drill = { id: 'free', stage: 0, pen: [] }; setT($('rDrill'), 'Drill: ' + DRILL_NAME.free);
}
// rules of the lock and the marina, for any drill: the lights, the lines while she levels, and the speed limit
const RULES = { wasIn: false, wasW: 'marina', fastT: 0, speedT: 0, looseT: 0, warnRed: -99 };
function ribRules(dt) {
  const R = RB, w = waterBody(R.x, R.y), s = lkS(R.x, R.y), inCh = inChamber(R.x, R.y), sog = Math.hypot(R.u, R.v) / KN, D = R.drill;
  // entering on red
  if (inCh && !RULES.wasIn) {
    const fromSea = s > LOCK.sOut - 6, sig = fromSea ? LKS.sigOut : LKS.sigIn; R.lockFrom = fromSea ? 'sea' : 'marina';
    if (sig !== 'go' && S.t - RULES.warnRed > 20) { RULES.warnRed = S.t; say(`Vessel in the lock, Portishead Quays Marina: you are entering on red. Stand off and wait for green-white-green.`, 1); ribPen('Entered the lock on red', 150); if (D.id === 'lock') D.reds++; }
  }
  RULES.wasIn = inCh;
  // loose while the chamber levels
  if (inCh && LKS.mode === 'level' && !R.fast) {
    RULES.looseT += dt;
    if (RULES.looseT > 12 && S.t - (RULES.looseWarn || -99) > 40) { RULES.looseWarn = S.t; say('RIB in the lock, get a line on the wall please, the water is moving.', 1); if (D.id === 'lock' && !D.loosePen) { D.loosePen = true; ribPen('Not made fast while the lock levelled', 100); } }
  } else RULES.looseT = 0;
  // the marina's speed limit (taken here as 3 kn, no wash) in the marina, the lock and the approach
  const slow = w !== 'sea' || (s > LOCK.sOut && s < APPROACH.s1 + 40 && Math.abs(lkC(R.x, R.y) - LOCK.cMid) < 25);
  if (slow && sog > 3.5) { RULES.speedT += dt; if (RULES.speedT > 3 && S.t - (RULES.speedWarn || -99) > 30) { RULES.speedWarn = S.t; msg('Dead slow in the marina and the lock: 3 kn, no wash'); if (D.id !== 'free') ribPen('Over 3 kn in the marina or lock', 60); } }
  else RULES.speedT = 0;
}
function ribDrillUpdate(dt) {
  const R = RB, D = R.drill, sp = Math.sin(R.psi), cp = Math.cos(R.psi), sog = Math.hypot(R.u, R.v) / KN;
  const w = waterBody(R.x, R.y), s = lkS(R.x, R.y);
  if (D.id === 'mob') {
    if (D.stage === 0) {
      const open = w === 'sea' && s > APPROACH.s1 + 60 && sog > 4;
      if (open) { if (D.due === null) D.due = S.t + 4 + Math.random() * 8; if (S.t > D.due) ribMOB(); } else D.due = null;
    }
    if (R.cas) {
      const c = R.cas, cur = currentAt(c.x, c.y); c.x += (cur.x + S.wind.x * 0.02) * dt; c.y += (cur.y + S.wind.y * 0.02) * dt;
      const dx = c.x - R.x, dy = c.y - R.y, bx = dx * sp + dy * cp, by = dx * cp - dy * sp, propD = Math.hypot(bx + 3.45, by);
      if (R.gear && propD < 3.5 && !c.warned && S.t - c.t > 1.5) { c.warned = true; ribPen('Prop turning close to the casualty', 200); }
      if (propD > 6) c.warned = false;
      if (Math.abs(by) < 1.2 && bx > -3.2 && bx < 3.2 && sog > 1.5 && !c.hit) { c.hit = true; ribPen('Ran over the casualty', 400); }
      if (bx > -1.7 && bx < 1.5 && Math.abs(by) > 1.1 && Math.abs(by) < 2.4 && sog < 0.8 && !R.gear) { R.cas = null; RIB.cas.visible = false; ribDrillDone(); }
      if (R.cas && S.tide - heightAt(c.x, c.y) < 0.3 && !c.mud) { c.mud = true; msg('The casualty has been carried onto the mud: get the boat as close as the depth allows'); }
    }
  } else if (D.id === 'lock') {
    const inCh = inChamber(R.x, R.y);
    if (D.stage === 0 && D.called === 'out') D.stage = 1;
    if (D.stage === 1 && inCh) D.stage = 2;
    if ((D.stage === 2 || D.stage === 7) && R.fast && R.fastAt === 'lock') D.stage++;
    if (D.stage === 3 && !R.fast && w === 'sea' && s > LOCK.sOut + 6) D.stage = 4;
    if (D.stage === 4) { const ph = PD.lights[1].p; if (Math.hypot(R.x - ph[0], R.y - ph[1]) > 40 && s > lkS(ph[0], ph[1]) - 10 && lkC(R.x, R.y) > lkC(ph[0], ph[1]) - 60) D.stage = 5; }
    if (D.stage === 5 && D.called === 'in') D.stage = 6;
    if (D.stage === 6 && inCh) D.stage = 7;
    if (D.stage === 9 && R.fast && R.fastAt === 'berth') { ribDrillDone(); return; }
    if (D.stage === 8 && !R.fast && w === 'marina' && s < LOCK.sIn - 6) D.stage = 9;
  }
}
function ribChecklist() {
  const R = RB, D = R.drill, sog = Math.hypot(R.u, R.v) / KN, run = R.eng === 'run';
  if (D.id === 'free') return ['Free practice', [['Kill cord on', R.kill], ['Engine running (X)', run], ['Lines let go (L)', !R.fast], ['P: call the marina for the next lock', false, 'note'], ['W/S lever, A/D wheel, R/F trim', false, 'note'], ['3 kn in the marina', false, 'note']]];
  if (D.id === 'alongside') return ['Come alongside', [['Let go (L)', D.stage > 0], [`Round to ${D.arm} hammerhead (green)`, false, 'note'], ['Slow and parallel, stop alongside', false, 'note'], ['Make fast (L)', false, 'note']]];
  if (D.id === 'mob') return ['Man overboard', R.cas ? [['Turn back towards the casualty', false, 'note'], ['Approach slowly, into the stream', sog < 4], ['Neutral before they are near the prop', !R.gear], ['Stop with them alongside the console', false, 'note']] : [['Out past the lock approach, above 4 kn', sog > 4 && waterBody(R.x, R.y) === 'sea'], ['Someone will go over the side...', false, 'note']]];
  const st = D.stage, L = [['Call the marina for a lock-out (P)', st > 0], ['In on green-white-green, marina side', st > 1], ['Make fast to the wall (L)', st > 2], ['Let go when the sea gates open, out on green', st > 3], ['Round the pier head', st > 4], ['Call for a lock-in (P)', st > 5], ['In on green-white-green, sea side', st > 6], ['Make fast to the wall (L)', st > 7], ['Into the marina on green', st > 8], ['Back alongside your berth, make fast', false]];
  const first = Math.max(0, Math.min(st - 2, L.length - 5));
  return ['Lock out and back in', L.slice(first, first + 5)];
}
