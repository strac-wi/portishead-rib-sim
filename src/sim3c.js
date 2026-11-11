
// ---------- per-frame ----------
const keys = new Set();
const TOUCH = { on: !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches), joy: false, steer: false, springRW: false, trim: 0 };
let hornBtn = false;
function ribHandleKeys(dt) {
  const R = RB, ax = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
  const lv = ax('KeyW', 'KeyS') + ax('ArrowUp', 'ArrowDown');
  if (lv) {
    if (R.detent !== lv) {
      const nl = clamp(R.lever + lv * 0.65 * dt, -1, 1), a = Math.abs(R.lever), b = Math.abs(nl);
      if ((R.lever > 0 && nl <= 0) || (R.lever < 0 && nl >= 0)) { R.lever = 0; R.detent = lv; }   // the lever stops in the neutral detent
      else if (a !== LEV_IDLE && (a - LEV_IDLE) * (b - LEV_IDLE) <= 0) { R.lever = Math.sign(nl) * LEV_IDLE; R.detent = lv; }   // and at tick-over
      else R.lever = nl;
    }
  } else R.detent = 0;
  const st = ax('KeyD', 'KeyA') + ax('ArrowRight', 'ArrowLeft');
  if (st) { R.wheel = clamp(R.wheel + st * 0.9 * dt, -1, 1); TOUCH.springRW = false; }
  else if (TOUCH.springRW && !TOUCH.steer) { R.wheel = approach(R.wheel, 0, 2.5 * dt); if (!R.wheel) TOUCH.springRW = false; }
  const tr = ax('KeyR', 'KeyF') + (TOUCH.trim || 0);
  if (tr) R.trim = clamp(R.trim + tr * 3 * dt, -4, 16);
  S.horn = keys.has('KeyH') || hornBtn;
}
function ribUpdate(sdt) {
  const R = RB;
  if (R.eng === 'crank') { R.crank -= sdt; if (R.crank <= 0) { R.eng = 'run'; log('Engine running'); } }
  R._boxes = ribBoxes(); R._cur = waterVel(R.x, R.y); R.lv = levelAt(R.x, R.y); R._sk = Object.assign(R._sk || {}, seaK(R.x, R.y));
  // the wind is lighter down in the marina between the buildings, and in the lock between its walls
  const w = waterBody(R.x, R.y); R._shel = w === 'sea' ? 1 : w === 'lock' ? 0.35 + 0.65 * smooth(LOCK.top - 3, LOCK.top + 1, LKS.L) : 0.7;
  const n = Math.max(1, Math.ceil(sdt * 240)), h = sdt / n;
  for (let i = 0; i < n; i++) { ribPhys(h); if (i % 24 === 23) { R._cur = waterVel(R.x, R.y); R.lv = levelAt(R.x, R.y); Object.assign(R._sk, seaK(R.x, R.y)); } }
  ribRules(sdt); ribDrillUpdate(sdt);
  if (S.t - R.warnT > 6) {
    if (R.gPeak > 2.6) { R.warnT = S.t; msg(`Slamming at ${R.gPeak.toFixed(1)} g: ease off, trim in, or take the waves at an angle`); }
    else if (R.flyT > 0.35) { R.warnT = S.t; msg('Airborne: off the throttle before she lands'); }
  }
  trkRec(sdt, R.x, R.y, Math.hypot(R.u, R.v) / KN);
}
function updateRibVisuals(dt) {
  const R = RB, sp = Math.sin(R.psi), cp = Math.cos(R.psi), V = Math.hypot(R.u, R.v), t = S.t, SK = R._sk, lv = R.lv;
  const at = (xb, yb) => { const x = R.x + xb * sp + yb * cp, y = R.y + xb * cp - yb * sp; return (waveH(x, -y, t) * SK.sw + chopH(x, y, t) * SK.ch) * SK.sh; };
  const hs = at(0, 1.05), hpp = at(0, -1.05), a = Math.min(1, dt * (V > 8 ? 5 : 3));
  const hump = Math.exp(-(((V - 5.0) / 2.0) ** 2)), p = R.plane;
  let pitch = DEG * (6.5 * hump + 2.2 * p + 0.3 * R.trim * p + 0.6 * clamp(R.T / 2500, -1, 1) * (1 - p));
  if (p > 0.8 && R.trim > 9) { pitch += DEG * (R.trim - 9) * 0.5 * Math.sin(t * 11); if (!R.porp || t - R.porp > 15) { R.porp = t; msg('Porpoising: trim in a little'); } }
  const lat = R.u * R.r, roll = Math.atan((hs - hpp) / 2.1) * (1 - 0.5 * p) - clamp(lat / 9.81 * (0.38 * p - 0.1 * (1 - p)), -0.32, 0.32);
  R.pitch += (pitch - R.pitch) * a; R.roll += (roll - R.roll) * a;
  // what you see of the seaway: the waves she meets are there in the water now, so the picture follows her heave and
  // pitch closely (a filter of about 4 Hz takes only the hardest edge off the buzz at speed)
  const fa = Math.min(1, dt * 26); R.hzv += (R.hz - R.hzv) * fa; R.thv += (R.th - R.thv) * fa;
  // in the lock while it levels the water boils a little under her
  const boil = waterBody(R.x, R.y) === 'lock' ? clamp(Math.abs(LKS.Q) / 30, 0, 1) * 0.06 * Math.sin(t * 2.3 + Math.sin(t * 0.7) * 3) : 0;
  RIB.root.position.set(R.x, lv + R.hzv + 0.08 * p - 0.1 + boil, -R.y); RIB.root.rotation.y = -R.psi;
  RIB.body.rotation.set(R.pitch + clamp(R.thv, -0.5, 0.5), 0, R.roll + boil * 0.8);
  RIB.steer.rotation.y = R.wheel * 32 * DEG;
  RIB.trim.rotation.x = -R.trim * DEG; RIB.prop.rotation.z = R.prop;
  RIB.wheel.rotation.z = -R.wheel * 2.6; RIB.lever.rotation.x = -R.lever * 0.8;
  RIB.helm.visible = cam.mode !== 'helm';
  // the prop's wash astern
  R.foamAcc += Math.abs(R.T) / 2500 * 60 * dt + (R.vent * 30 + (R.gear ? 3 : 0)) * dt;
  const vxw = R.u * sp + R.v * cp, vyw = R.u * cp - R.v * sp, rnd = Math.random; let k = 0;
  while (R.foamAcc >= 1 && k++ < 40) {
    R.foamAcc -= 1; const back = rnd() * dt, px = R.x - 3.6 * sp - vxw * back + (rnd() - 0.5) * 0.9, py = R.y - 3.6 * cp - vyw * back + (rnd() - 0.5) * 0.9;
    const d = Math.sign(R.T || 1), jx = -sp * d * (1 + Math.abs(R.T) / 800), jy = -cp * d * (1 + Math.abs(R.T) / 800);
    spawnFoam(px, py, jx + (rnd() - 0.5), jy + (rnd() - 0.5), 1.2 + rnd() * 1.8, 0.28 + rnd() * 0.32);
  }
  // Spray. On the plane the water leaves the chines as two low sheets, from where the hull meets the water (further aft the
  // higher she rides), thrown out and a little up and carried along with her; a slam throws a burst from the bows; flat
  // out there is a rooster tail astern of the leg.
  R.sprayAcc += smooth(4.5, 13, V) * (380 + 320 * p) * dt;
  let ns = 0;
  while (R.sprayAcc >= 1 && ns++ < 90) {
    R.sprayAcc -= 1; const s = rnd() < 0.5 ? -1 : 1, xb = lerp(1.7, 0.35, p) + (rnd() - 0.5) * 1.5, back = rnd() * dt;
    const px = R.x + xb * sp + s * 1.22 * cp - vxw * back, py = R.y + xb * cp - s * 1.22 * sp - vyw * back, out = 1.4 + 0.2 * V + rnd() * 1.4;
    spawnFoam(px, py, vxw * 0.6 + s * cp * out, vyw * 0.6 - s * sp * out, 1.2, 0.05 + rnd() * rnd() * 0.18, 0.12, 0.6 + 0.09 * V + rnd() * 1.0);
  }
  if (R.slamT > (RIB.slamSeen || 0)) {
    RIB.slamSeen = R.slamT; const n = Math.round(clamp(60 + 70 * R.slamV, 60, 260));
    for (let i = 0; i < n; i++) {
      const s = rnd() < 0.5 ? -1 : 1, xb = 0.9 + rnd() * 1.7, px = R.x + xb * sp + s * 1.15 * cp, py = R.y + xb * cp - s * 1.15 * sp, out = 2 + rnd() * 4;
      spawnFoam(px, py, vxw * 0.5 + s * cp * out + sp * rnd() * 2, vyw * 0.5 - s * sp * out + cp * rnd() * 2, 1.6, 0.06 + rnd() * rnd() * 0.26, 0.15, 1.5 + rnd() * 3);
    }
  }
  if (V > 9 && p > 0.6 && R.gear > 0) {
    R.tailAcc = (R.tailAcc || 0) + smooth(9, 17, V) * 120 * dt;
    while (R.tailAcc >= 1) { R.tailAcc -= 1; const px = R.x - 3.7 * sp + (rnd() - 0.5) * 0.5, py = R.y - 3.7 * cp + (rnd() - 0.5) * 0.5; spawnFoam(px, py, vxw * 0.3 + (rnd() - 0.5), vyw * 0.3 + (rnd() - 0.5), 1.2, 0.05 + rnd() * 0.13, 0.1, 1.2 + rnd() * 1.6); }
  }
  // the lock's sluices churn the chamber while it levels
  if (Math.abs(LKS.Q) > 3 && rnd() < dt * Math.abs(LKS.Q) * 0.4) {
    const end = LKS.Q > 0 ? LOCK.sIn + 2 : LOCK.sOut - 2, [fx, fy] = lkP(end + (LKS.Q > 0 ? 1 : -1) * rnd() * 8, LOCK.cMid + (rnd() - 0.5) * LOCK.w * 0.8);
    spawnFoam(fx, fy, (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 1.5, 2 + rnd() * 3, 0.5 + rnd() * 0.5);
  }
  updateFoam(dt); updateLines();
  // drill furniture: the green outline at the hammerhead
  const D = R.drill;
  RIB.ghost.visible = D.id === 'alongside' && D.h;
  if (RIB.ghost.visible) { const h = D.h; RIB.ghost.position.set(h.berth[0], LKS.M + 0.12, -h.berth[1]); RIB.ghost.rotation.y = -h.hdg * DEG; }
  if (R.cas) { RIB.cas.position.set(R.cas.x, levelAt(R.cas.x, R.cas.y) + seaH(R.cas.x, R.cas.y, t) - 0.05, -R.cas.y); RIB.cas.rotation.z = Math.sin(t * 1.3) * 0.2; }
}
// the Garmin at the helm: a data bar, the chart in its own colours, and a scrolling sonar of the depth under the boat
function ribMFD() {
  const D = RIB.mfd; if (!D || (D.t >= 0 && S.t - D.t < 0.25 && S.t >= D.t)) return; D.t = S.t;
  const g = D.g, R = RB, sp = Math.sin(R.psi), cp = Math.cos(R.psi), vx = R.u * sp + R.v * cp, vy = R.u * cp - R.v * sp, sog = Math.hypot(vx, vy) / KN;
  const depth = Math.max(0, R.lv - heightAt(R.x, R.y)), X0 = 16, Y0 = 12, FD = '"Barlow Condensed", "Arial Narrow", sans-serif', FM = '"IBM Plex Mono", monospace';
  g.fillStyle = '#0c0d0e'; g.fillRect(0, 0, 560, 346);
  g.fillStyle = '#8f969a'; g.font = `600 15px ${FD}`; g.textAlign = 'left'; g.fillText('GARMIN', 24, 340);
  g.fillStyle = '#05080a'; g.fillRect(X0, Y0, 528, 50);
  [['SOG', sog.toFixed(1), 'kn'], ['HDG', fmt3(R.psi / DEG), '°'], ['DEPTH', depthTxt(depth), 'm'], ['RPM', String(Math.round(R.rpm / 50) * 50), '']].forEach(([lab, val, unit], i) => {
    const x = X0 + 12 + i * 132;
    g.fillStyle = '#8ea2ad'; g.font = `600 13px ${FD}`; g.fillText(lab, x, Y0 + 16);
    g.fillStyle = '#ffffff'; g.font = `500 26px ${FM}`; g.fillText(val, x, Y0 + 44);
    g.fillStyle = '#c9d3d8'; g.font = `600 14px ${FD}`; g.fillText(unit, x + g.measureText(val).width + 4, Y0 + 44);
  });
  drawChart(D.cg, 340, 262, { cx: R.x, cy: R.y, span: clamp(160 + sog * 45, 160, 2600), u: 0.72, pal: GARMIN_PAL });
  g.drawImage(D.cc, X0, Y0 + 52);
  const sg = D.sg, SW = 184, SH = 262, range = depth < 7 ? 10 : depth < 15 ? 20 : 40, by = depth / range * SH;
  sg.drawImage(D.sc, -3, 0);
  sg.fillStyle = '#4a3f22'; sg.fillRect(SW - 3, 0, 3, SH);   // the Severn's silt shows on the sounder as murk
  sg.fillStyle = 'rgba(150,140,90,.5)'; sg.fillRect(SW - 3, 0, 3, by);
  for (const [d0, d1, c] of [[0, 3, '#fff36a'], [3, 9, '#ffb21e'], [9, 24, '#e2461c'], [24, 60, '#7a1a12']]) { sg.fillStyle = c; sg.fillRect(SW - 3, by + d0, 3, d1 - d0); }
  sg.fillStyle = '#3a0c08'; sg.fillRect(SW - 3, by + 60, 3, SH);
  g.drawImage(D.sc, X0 + 344, Y0 + 52);
  g.fillStyle = '#ffffff'; g.font = `500 22px ${FM}`; g.fillText(depthTxt(depth) + 'm', X0 + 350, Y0 + 78);
  g.font = `600 13px ${FD}`; g.textAlign = 'right'; g.fillText('0', X0 + 524, Y0 + 66); g.fillText(range + ' m', X0 + 524, Y0 + 310);
  g.fillStyle = '#0c0d0e'; g.fillRect(X0 + 340, Y0 + 52, 4, 262);
  D.tex.needsUpdate = true;
}
const depthTxt = (d) => d < 10 ? d.toFixed(1) : d.toFixed(0);
const PHONE = matchMedia('(max-width:700px)');
// short labels on the RIB panel: a phone either way up (on its side the panel sits between the lever and the buttons)
const SHORT = matchMedia('(max-width:700px), (max-height:560px) and (pointer: coarse)');
function ribFold(on) { document.body.classList.toggle('ribfold', on); setT($('rFold'), on ? 'Controls ▸' : 'Controls ▾'); }
function updateRibUI() {
  ribMFD();
  const R = RB, sp = Math.sin(R.psi), cp = Math.cos(R.psi), ms = S.ms;
  const vx = R.u * sp + R.v * cp, vy = R.u * cp - R.v * sp, sog = Math.hypot(vx, vy), cur = waterVel(R.x, R.y), stw = Math.hypot(vx - cur.x, vy - cur.y);
  setT($('nHdg'), fmt3(R.psi / DEG) + '°'); setT($('nSog'), (sog / KN).toFixed(1)); setT($('nCog'), sog > 0.15 ? fmt3(Math.atan2(vx, vy) / DEG) + '°' : '---');
  setT($('nStw'), (stw / KN).toFixed(1)); const rot = R.r / DEG * 60; setT($('nRot'), Math.abs(rot) < 0.5 ? '0' : Math.abs(rot).toFixed(0) + (rot > 0 ? ' S' : ' P'));
  setT($('nDep'), depthTxt(Math.max(0, R.lv - heightAt(R.x, R.y)))); setT($('nWind'), `${fmt3(S.wind.from)}° ${(S.wind.spd / KN).toFixed(0)}`);
  const cs = Math.hypot(cur.x, cur.y) / KN; setT($('nCur'), cs < 0.05 ? '–' : `${fmt3(Math.atan2(cur.x, cur.y) / DEG)}° ${cs.toFixed(1)}`);
  setT($('nRpm'), String(Math.round(R.rpm / 10) * 10)); setT($('nClock'), ukHHMM(ms));
  const rising = tideCD(ms + 300000) > S.tide;
  setT($('nTide'), S.tide.toFixed(1) + (rising ? ' ↑' : ' ↓')); setT($('mTide'), S.tide.toFixed(1) + (rising ? '↑' : '↓'));
  const nx = S.ext.find(e => e.ms > ms); if (nx) { setT($('nTideL'), nx.hw ? 'Next HW' : 'Next LW'); setT($('nTideT'), `${ukHHMM(nx.ms)} ${nx.h.toFixed(1)}`); }
  setT($('mHdg'), fmt3(R.psi / DEG) + '°'); setT($('mSog'), (sog / KN).toFixed(1));
  setT($('rGear'), R.eng !== 'run' ? '–' : R.gear > 0 ? 'F' : R.gear < 0 ? 'R' : 'N'); setC($('rGear'), 'on', R.gear !== 0);
  $('rLev').style.height = (Math.abs(R.lever) * 50).toFixed(0) + '%'; $('rLev').style.bottom = R.lever >= 0 ? '50%' : (50 - Math.abs(R.lever) * 50).toFixed(0) + '%';
  setT($('rTrim'), (R.trim >= 0 ? '+' : '') + R.trim.toFixed(0) + '°'); $('rTrimBar').style.width = ((R.trim + 4) / 20 * 100).toFixed(0) + '%';
  setT($('rEng'), R.eng === 'run' ? 'Running' : R.eng === 'crank' ? 'Cranking' : 'Start eng'); setC($('rEng'), 'on', R.eng === 'run'); setC($('rEng'), 'warn', R.eng === 'off');
  const ph = SHORT.matches;
  setT($('rKill'), (ph ? 'Kill: ' : 'Kill cord: ') + (R.kill ? 'on' : 'off')); setC($('rKill'), 'warn', !R.kill);
  setT($('rLines'), R.fast ? (ph ? 'Let go' : 'Let go lines') : 'Make fast'); setC($('rLines'), 'on', R.fast);
  setC($('rEng'), 'need', R.eng === 'off'); setC($('rKill'), 'need', !R.kill);
  setT($('rDrill'), 'Drill: ' + (ph ? DRILL_SHORT : DRILL_NAME)[R.drill.id]);
  setT($('rVent'), R.vent > 0.3 ? 'Prop ventilating' : R.grounded ? 'Aground' : '');
  const [title, items] = ribChecklist(), html = items.map(([t2, ok, note]) => `<li class="${ok ? 'ok' : note || ''}">${t2}</li>`).join('');
  const ul = $('ckList'); if (ul.dataset.h !== html) { ul.dataset.h = html; ul.innerHTML = html; } setT($('ckTitle'), title);
  const nxt = items.find(it => !it[1]); setT($('mNext'), nxt ? nxt[0] : title);
  lockUI();
}
const MODE_TXT = { inOpen: 'marina gates open', outOpen: 'sea gates open', gates: 'gates moving', level: 'levelling', ff: 'free-flow', idle: '' };
function lockUI() {
  const L = LKS, ms = S.ms, W = L.win, sig = (el, s) => { const I = $(el).children, c = s === 'go' ? ['g', 'w', 'g'] : ['r', 'r', 'r']; for (let i = 0; i < 3; i++) I[i].className = c[i]; };
  sig('sigIn', L.sigIn); sig('sigOut', L.sigOut);
  setT($('lkIn'), L.sigIn === 'go' ? 'Proceed' : L.gIn > 0.98 ? 'Open, red' : L.gIn > 0.02 ? 'Moving' : 'Closed');
  setT($('lkOut'), L.sigOut === 'go' ? 'Proceed' : L.gOut > 0.98 ? 'Open, red' : L.gOut > 0.02 ? 'Moving' : 'Closed');
  setT($('lkState'), !W ? '-' : L.mode === 'ff' ? 'free-flow' : W.open ? (L.mode === 'level' ? (L.Q > 0 ? 'filling' : 'emptying') : MODE_TXT[L.mode] || 'working') : 'shut');
  setT($('lvM'), L.M.toFixed(2)); setT($('lvL'), L.L.toFixed(2)); setT($('lvS'), S.tide.toFixed(2));
  if (W) {
    const N = nextLockTimes(ms);
    let t;
    if (L.mode === 'ff') t = `Free-flow until the tide turns (HW ${ukHHMM(W.hw.ms)} ${W.hw.h.toFixed(1)} m)`;
    else if (!W.open) t = `Shut. Opens ${ukHHMM(W.from)} (HW ${ukHHMM(W.hw.ms)}, ${W.hw.h.toFixed(1)} m) till ${ukHHMM(W.to)}`;
    else t = `Lock out ${N.out[0] ? ukHHMM(N.out[0]) : '—'} · lock in ${N.inn[0] ? ukHHMM(N.inn[0]) : '—'} · last ${ukHHMM(W.to)}`;
    setT($('lkNext'), t);
  }
}
// ---------- camera ----------
const cam = { mode: 'chase', az: 0.5, el: 0.28, dist: 19, topH: 160, fov: 55 };
const CAMS = ['chase', 'helm', 'top'];
const WH = { yaw: 0, pitch: -0.35, fov: 72 };
function setCam(m) { const was = cam.mode; cam.mode = m; if (m === 'helm' && was !== 'helm') { WH.yaw = 0; WH.pitch = -0.35; WH.fov = 72; } setT($('bCam'), 'View: ' + m); }
function cycleCam() { setCam(CAMS[(CAMS.indexOf(cam.mode) + 1) % CAMS.length]); }
function updateCamera() {
  const R = RB, lv = R.lv;
  if (cam.mode === 'chase') {
    const h = R.psi + cam.az, horiz = cam.dist * Math.cos(cam.el);
    camera.position.set(R.x - Math.sin(h) * horiz, lv + 1.2 + cam.dist * Math.sin(cam.el), -(R.y - Math.cos(h) * horiz));
    camera.up.set(0, 1, 0); camera.lookAt(R.x, lv + 1.2, -R.y);
  } else if (cam.mode === 'helm') {
    RIB.root.updateMatrixWorld(true);
    const cy = Math.cos(WH.pitch), eye = RIB.body.localToWorld(new V3(-0.26, 1.86, 0.4)), tgt = RIB.body.localToWorld(new V3(-0.26 - Math.sin(WH.yaw) * cy, 1.86 + Math.sin(WH.pitch), 0.4 - Math.cos(WH.yaw) * cy));
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(tgt); return;
  } else {
    camera.position.set(R.x, lv + cam.topH, -R.y + 0.01); camera.up.set(0, 0, -1); camera.lookAt(R.x, lv, -R.y);
  }
  const cx = camera.position.x, cz = camera.position.z, wy = levelAt(cx, -cz) + seaH(cx, -cz, S.t) + 0.6;
  if (camera.position.y < wy) camera.position.y = wy;
  // behind a wall (down in the lock, or tucked against a quay): rise above the coping and look down
  if (cam.mode === 'chase' && solidAt(cx, -cz) && camera.position.y < QUAY + 2) { camera.position.y = QUAY + 2.5 + cam.dist * 0.15; camera.lookAt(RB.x, lv + 1.2, -RB.y); }
  const gy = heightAt(cx, -cz) + 1.5; if (camera.position.y < gy && !solidAt(cx, -cz)) camera.position.y = gy;
}
function renderView() {
  updateNav();
  if (cam.mode === 'helm') {
    camera.fov = WH.fov; camera.near = 0.5; camera.updateProjectionMatrix(); camera.layers.set(0);
    RIB.root.visible = false; renderer.render(scene, camera); RIB.root.visible = true;
    const bg = scene.background; scene.background = null; renderer.autoClear = false; renderer.clearDepth(); renderer.shadowMap.autoUpdate = false;
    RIB_CLIP.constant = -(RB.lv + seaH(RB.x, RB.y, S.t) - 0.02);
    camera.near = 0.05; camera.updateProjectionMatrix(); camera.layers.set(2);
    renderer.render(scene, camera);
    RIB_CLIP.constant = 1e6; scene.background = bg; renderer.autoClear = true; renderer.shadowMap.autoUpdate = true; camera.layers.set(0);
    return;
  }
  const fov = cam.mode === 'chase' ? cam.fov : 55, cp = camera.position;
  const near = clamp((cp.y - Math.max(levelAt(cp.x, -cp.z), heightAt(cp.x, -cp.z))) * 0.45, 0.3, 8);
  if (Math.abs(camera.near - near) > 0.05 * near || camera.fov !== fov) { camera.near = near; camera.fov = fov; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
}
// ================= AUDIO =================
const AU = { ctx: null, on: true };
// One seamless loop of a four-cylinder four-stroke at 1000 rpm, replayed faster or slower with rpm (as in the Loch Ranza game)
function engineBuffer(ctx, seed, CYL = 4) {
  const sr = ctx.sampleRate, REF = 1000, cycle = 120 / REF, cycles = 25, n = Math.round(cycle * cycles * sr);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), r = mulberry(seed);
  const turn = [1.0, 0.68 + r() * 0.06], inTurn = [1.0, 0.74 + r() * 0.06, 0.87 + r() * 0.05];
  const W = 0.55 * cycle / CYL, pl = Math.round(0.02 * sr);
  for (let c = 0; c < cycles; c++) for (let k = 0; k < CYL; k++) {
    const t0 = Math.round(((c + k / CYL) * cycle + (r() - 0.5) * 0.0004) * sr), a = turn[k < CYL / 2 ? 0 : 1] * inTurn[k % 3] * (0.93 + r() * 0.14);
    for (let j = 0; j < pl; j++) { const t = j / sr, sn = t < W ? Math.sin(Math.PI * t / W) : 0; d[(t0 + j) % n] += a * (sn * sn + Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t / 0.01) * 0.85 + (r() * 2 - 1) * Math.exp(-t / 0.005) * 0.3); }
  }
  let m = 0, lp = 0; for (let i = 0; i < n; i++) m += d[i]; m /= n;
  for (let i = 0; i < n; i++) { const x = d[i] - m; lp += (x - lp) * 0.002; d[i] = x - lp; }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
  return buf;
}
function noiseBuf(ctx) { return AU.noiseBuf || (AU.noiseBuf = (() => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), x = b.getChannelData(0); for (let j = 0; j < x.length; j++) x[j] = Math.random() * 2 - 1; return b; })()); }
function initAudio() {
  if (AU.ctx) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); AU.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination); AU.master = master;
    // the sluices: a rushing roar while the chamber levels, louder close to the lock
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx); ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 700; const ng = ctx.createGain(); ng.gain.value = 0;
    ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(); AU.sluice = ng;
    // a radio's squelch tail for the VHF
    AU.beep = (f = 1200, d = 0.08) => { if (!AU.on) return; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.04; o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + d); };
  } catch (err) { AU.ctx = null; }
}
// the outboard's voice: a four-cylinder buffer replayed with rpm, louder and brighter with load; water and wind noise with speed
function ribAudio(t, m) {
  if (!AU.ob) {
    const ctx = AU.ctx, src = ctx.createBufferSource(); src.buffer = engineBuffer(ctx, 77, 4); src.loop = true; src.playbackRate.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7; const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(AU.master); src.start();
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(ctx); ns.loop = true; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 600; nf.Q.value = 0.6; const ng = ctx.createGain(); ng.gain.value = 0;
    ns.connect(nf); nf.connect(ng); ng.connect(AU.master); ns.start(0, 0.5);
    const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 900; hf.Q.value = 1.2; const hg = ctx.createGain(); hg.gain.value = 0; hf.connect(hg); hg.connect(AU.master);
    for (const f of [415, 498]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    AU.ob = { src, lp, g, ng, nf, hg };
  }
  const R = RB, O = AU.ob, on = R.rpm > 60 ? 1 : 0, rf = R.rpm / 6000, load = clamp(Math.abs(R.T) / 2500, 0, 1), V = Math.hypot(R.u, R.v);
  const dist = cam.mode === 'chase' ? cam.dist : cam.mode === 'top' ? cam.topH : 2, fade = 1 / (1 + Math.max(0, dist - 8) / 25);
  O.src.playbackRate.setTargetAtTime(Math.max(0.05, R.rpm / 1000), t, 0.05);
  O.lp.frequency.setTargetAtTime((500 + 2600 * rf + 900 * load) * (R.gear ? 1 - 0.35 * R.plane : 1), t, 0.1);
  O.g.gain.setTargetAtTime(m * on * fade * (0.08 + 0.12 * load + 0.1 * rf + (R.vent > 0.3 ? 0.05 : 0)), t, 0.08);
  O.nf.frequency.setTargetAtTime(400 + V * 40, t, 0.2);
  O.hg.gain.setTargetAtTime(S.horn ? m * 0.08 : 0, t, 0.02);
  if (R.slamN !== O.slamN) {
    O.slamN = R.slamN;
    if (R.slamV > 1.2 && m) {
      const ctx = AU.ctx, b = O.thud || (O.thud = (() => { const n = Math.floor(ctx.sampleRate * 0.35), q = ctx.createBuffer(1, n, ctx.sampleRate), d = q.getChannelData(0); for (let j = 0; j < n; j++) { const x = j / ctx.sampleRate; d[j] = (Math.random() * 2 - 1) * Math.exp(-x * 14) * 0.6 + Math.sin(2 * Math.PI * 55 * x) * Math.exp(-x * 9); } return q; })());
      const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = b; lp.type = 'lowpass'; lp.frequency.value = 420;
      g.gain.value = Math.min(0.9, 0.12 * R.slamV) * fade; src.connect(lp); lp.connect(g); g.connect(AU.master); src.start();
    }
    R.slamV = 0;
  }
  O.ng.gain.setTargetAtTime(m * fade * clamp(V / 18, 0, 1) ** 1.5 * (0.18 + 0.12 * S.wx.wave * 3), t, 0.2);
}
function updateAudio() {
  if (!AU.ctx) return;
  const t = AU.ctx.currentTime, m = AU.on ? 1 : 0;
  ribAudio(t, m);
  const [lx, ly] = lkP((LOCK.sIn + LOCK.sOut) / 2, LOCK.cMid), d = Math.hypot(camera.position.x - lx, -camera.position.z - ly);
  AU.sluice.gain.setTargetAtTime(m * clamp(Math.abs(LKS.Q) / 25, 0, 1) * 0.35 / (1 + d / 40), t, 0.3);
}
