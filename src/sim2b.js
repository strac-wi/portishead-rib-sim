
// ---------- water ----------
// The Severn here is brown with silt: no seabed shows through, only a paler band where it shoals. The swell is short and
// small this far up; the wind's chop is the sea that matters. Shaded relative to a point near the camera (uOrg) so a
// reduced-precision GPU never works with kilometre-sized coordinates.
const WAVES = [{ dx: 0.8, dz: 0.6, l: 34, a: 0.35 }, { dx: -0.3, dz: 0.954, l: 21, a: 0.2 }, { dx: 0.954, dz: -0.3, l: 48, a: 0.25 }].map(w => Object.assign(w, { k: 2 * Math.PI / w.l, w: Math.sqrt(9.81 * 2 * Math.PI / w.l) }));
const SHADE_WAVES = WAVES.map(w => ({ dx: w.dx, dz: w.dz, l: w.l, a: w.a * 0.35 })).concat(
  [[11, 0.07, 38], [14, 0.09, -27], [17, 0.1, 55], [23, 0.12, -48], [29, 0.1, 14], [37, 0.13, -8], [9, 0.05, 71], [19, 0.08, -66]].map(([l, a, deg]) => {
    const b = Math.atan2(0.6, 0.8) + deg * Math.PI / 180; return { dx: Math.cos(b), dz: Math.sin(b), l, a };
  })).map((w, i) => Object.assign(w, { k: 2 * Math.PI / w.l, w: Math.sqrt(9.81 * 2 * Math.PI / w.l), ph: (i * 2.39996) % 6.283 }));
const WAVE_GRAD_GLSL = `uniform float uWPh[${SHADE_WAVES.length}];\nvec2 waveGrad(vec2 l, float fp){ vec2 g = vec2(0.0);\n` +
  SHADE_WAVES.map((w, i) => `g += ${(w.a * w.k).toFixed(4)}*cos(${w.k.toFixed(5)}*dot(l, vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})) + uWPh[${i}])*vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})*(1.0 - smoothstep(0.6, 1.6, ${w.k.toFixed(5)}*fp));`).join('\n') + '\nreturn g; }\n';
const TAU = Math.PI * 2, wrapA = (a, m = TAU) => ((a % m) + m) % m;
// The Severn's colour: grey-brown silt, deeper water a shade darker (the shallows paler where the mud is near)
const SEA_DEEP = 0x625b4a, SEA_SHALLOW = 0x837a64;
// by night the moon lays a broad pale sheen on the water (set with the light)
const WATER_SHEEN = { value: 0 }, FOAM_LUM = { value: 1 };
// the wind's chop as the water draws it: each train's direction (east, south), wavenumber and height; its phase at the
// water's origin and its frequency; the white horses' settings (the surface's standard deviation, the crest height in
// those that may break, how few of them do, the slope of a steep face); the pattern running with the waves that picks
// which crests break, and the lace of the foam they leave, lying on the water; their mean share far off
const WATER_CHOP = { d: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, p: { value: new Float32Array(6) }, w: { value: new Float32Array(6) }, wh: { value: new THREE.Vector4(1, 9, 1, 0) },
  q: { value: new THREE.Vector4() }, lq: { value: new THREE.Vector4() }, la: { value: new THREE.Vector4() }, m: { value: 0 }, wind: { value: new THREE.Vector2(0, 1) } };
const WATER_U = { uOrg: { value: new THREE.Vector2() }, uWPh: { value: new Float32Array(SHADE_WAVES.length) }, uRipA: { value: new THREE.Vector2() }, uRipC: { value: new THREE.Vector3() },
  uChopQ: { value: new THREE.Vector2() }, uChopR: { value: new THREE.Vector2() }, uCamL: { value: new THREE.Vector3() }, uGridL: { value: new THREE.Vector4() }, uFineL: { value: new THREE.Vector4() }, uMaskL: { value: new THREE.Vector4() }, uMaskS: { value: 1e5 }, uPh: { value: 0 },
  uSwP: { value: new Float32Array(3) }, uSeaML: { value: new THREE.Vector4() } };
// The stream as the water draws it: the same model as currentAt (the tide's rate of rise scaled by depth, the sheltered
// harbour and shore, the Pool's eddy on the flood), worked out per pixel from the seabed texture so the surface's silt,
// boils and scum lines slide past at the stream's own speed (two-phase flow-map advection). Obstacles in the stream (the
// buoys, the pier head) each get a trail of broken water, a pillow heaped against their upstream face and a V of waves.
const N_OBS = 8;
const WATER_FLOW = { uBase: { value: 0 }, uFlood: { value: new THREE.Vector2(Math.sin(68 * DEG), -Math.cos(68 * DEG)) }, uFPh: { value: new THREE.Vector2() },
  uObs: { value: Array.from({ length: N_OBS }, () => new THREE.Vector4()) }, uObsV: { value: Array.from({ length: N_OBS }, () => new THREE.Vector4()) }, uWindD: { value: new THREE.Vector2(0, 1) } };
const FLOW_CYCLE = 7;

// ---------- the sea's map ----------
// 20 m cells over the charts: red, how much of the open water's chop reaches the place; green, how much of the swell.
// Land is ground above the highest tides (12.6 m CD), the pier, and the marina and lock, which keep their own water.
// seaShelter fills it in for the wind of the day: close under a weather shore the wind has had no water to raise a sea
// on, and a mile off it has had all it needs (a fifth of the chop is left even there, the ripple any breeze puts on a
// pond); the swell bends round into the lee and is cut less. The walled approach to the lock lets in little of either.
// The shallows flatten both, from the seabed and the tide: nothing in a foot of water, no effect in three metres.
const SEA_GRID = (() => {
  const step = 20, x0 = DOM.x0, y0 = DOM.y0, nx = Math.round((DOM.x1 - x0) / step) + 1, ny = Math.round((DOM.y1 - y0) / step) + 1;
  const land = new Uint8Array(nx * ny), data = new Uint8Array(nx * ny * 4), SUB = [[0, 0], [-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, y = y0 + j * step;
    for (const [a, b] of SUB) { const px = x + a, py = y + b; if (inDock(px, py) || heightAt(px, py) > 12.6) { land[j * nx + i] = 1; break; } }
  }
  for (let k = 0; k < nx * ny; k++) { data[k * 4] = data[k * 4 + 1] = 255; data[k * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  return { step, x0, y0, nx, ny, W: DOM.x1 - x0, H: DOM.y1 - y0, land, data, tex };
})();
// For each cell, how far upwind the nearest land lies along the wind and 20 and 40 degrees either side of it (the chop's
// own spread, so the shadow of a point is soft); to: the way the wind blows, radians from north
function seaShelter(to) {
  const G = SEA_GRID, { nx, ny, step, land, data } = G, K = Math.ceil(1500 / step), raw = new Float32Array(nx * ny);
  const dirs = [[-40, 0.5], [-20, 0.9], [0, 1], [20, 0.9], [40, 0.5]].map(([d, w]) => { const a = to + d * DEG; return [-Math.sin(a), -Math.cos(a), w]; }), wsum = dirs.reduce((t, d) => t + d[2], 0);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (land[j * nx + i]) continue;
    let v = 0;
    for (const [ux, uy, w] of dirs) {
      let F = 1e9;
      for (let k = 1; k <= K; k++) { const a = Math.round(i + ux * k), b = Math.round(j + uy * k); if (a < 0 || b < 0 || a >= nx || b >= ny) break; if (land[b * nx + a]) { F = k * step; break; } }
      v += w * (0.2 + 0.8 * smooth(60, 1500, F));
    }
    raw[j * nx + i] = v / wsum;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {   // a light blur; the land's own cells take their neighbours' mean, so the shore is not a cliff in the map
    let t = 0, n = 0;
    for (let b = Math.max(0, j - 1); b <= Math.min(ny - 1, j + 1); b++) for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) { const r = raw[b * nx + a]; if (r > 0) { t += r; n++; } }
    const ch = n ? t / n : 0.2, k = (j * nx + i) * 4; data[k] = Math.round(255 * ch); data[k + 1] = Math.round(255 * (0.3 + 0.7 * ch));
  }
  G.tex.needsUpdate = true;
}
// the walled approach to the lock, and a little way out past its mouth
const approachF = (x, y) => { const c = lkC(x, y); return c < APPROACH.cNW - 3 || c > APPROACH.cSE + 3 ? 1 : lerp(0.15, 1, smooth(APPROACH.s1, APPROACH.s1 + 50, lkS(x, y))); };
// what the sea's map says of a place, read as the graphics chip reads it: the chop's share, the swell's, and the shoaling.
// Water in the marina or the lock is still.
const SEA_K = { ch: 0, sw: 0, sh: 0 };
function seaK(x, y) {
  const K = SEA_K;
  if (waterBody(x, y) !== 'sea') { K.ch = K.sw = K.sh = 0; return K; }
  const G = SEA_GRID, { nx, ny, data } = G, u = clamp((x - G.x0) / G.W * nx - 0.5, 0, nx - 1.001), v = clamp((y - G.y0) / G.H * ny - 0.5, 0, ny - 1.001);
  const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, k = (j * nx + i) * 4, k2 = k + nx * 4;
  const at = (c) => (data[k + c] * (1 - fx) + data[k + 4 + c] * fx) * (1 - fy) + (data[k2 + c] * (1 - fx) + data[k2 + 4 + c] * fx) * fy;
  const ap = approachF(x, y), bed = inBox(FINE, x, y, -2) ? gridAt(FINE, x, y) : gridAt(GRID, x, y);
  K.ch = at(0) / 255 * ap; K.sw = at(1) / 255 * ap; K.sh = smooth(0.3, 3.0, S.tide - bed);
  return K;
}
// the sea's surface above its level at a place, as the water draws it: the swell and every train of the wind's chop,
// each cut by the lee and the shallows. Buoys, the casualty, spray and the camera ride this.
function seaH(x, y, t) {
  const K = seaK(x, y); if (!K.sh) return 0;
  const C = S.chop || (S.chop = chopSea()); let h = 0;
  for (let i = 0; i < C.length; i++) { const c = C[i]; h += c.a * Math.sin(c.k * (c.dx * x + c.dy * y) - c.w * t + c.ph); }
  return (waveH(x, -y, t) * K.sw + h * K.ch) * K.sh;
}
function waterOrigin(ox, oz, t) {
  const U = WATER_U; U.uOrg.value.set(ox, oz);
  WAVES.forEach((w, i) => { U.uSwP.value[i] = wrapA(w.k * (w.dx * ox + w.dz * oz) - w.w * t); });
  SHADE_WAVES.forEach((w, i) => { U.uWPh.value[i] = wrapA(w.k * (w.dx * ox + w.dz * oz) - w.w * t + w.ph); });
  U.uRipA.value.set(wrapA(0.071 * oz + 0.3 * t), wrapA(0.063 * ox - 0.27 * t));
  U.uRipC.value.set(wrapA(0.83 * (0.8 * ox + 0.6 * oz) + 2.4 * t), wrapA(1.37 * (-0.53 * ox + 0.85 * oz) + 3.1 * t), wrapA(2.21 * (0.96 * ox - 0.28 * oz) + 4.1 * t));
  U.uChopQ.value.set(wrapA(0.55 * ox + 0.33 * t, 256), wrapA(0.55 * oz + 0.21 * t, 256)); U.uChopR.value.set(wrapA(1.6 * ox - 0.47 * t, 256), wrapA(1.6 * oz + 0.39 * t, 256));
  if (S && S.wind) {
    const C = S.chop || (S.chop = chopSea()), W = WATER_CHOP, kn = S.wx.wind, Us = kn * KN, tx = Math.sin(C.to), tz = -Math.cos(C.to), sig = Math.max(C.sig, 1e-3);
    C.forEach((c, i) => { W.d.value[i].set(c.dx, -c.dy, c.k, c.a); W.p.value[i] = wrapA(c.k * (c.dx * ox - c.dy * oz) - c.w * t + c.ph); W.w.value[i] = c.w; });
    // the share of the sea white far off: none below about 7 kn
    const cov = Math.min(0.2, 2 * 3.84e-6 * Math.pow(Us, 3.41)) * smooth(6, 9, kn);
    // a crest 1.3 standard deviations up may break; four in ten of those that might do in a fresh breeze, one in twelve in
    // a moderate one; the last figure turns a slope into a share of a steep wave's
    W.wh.value.set(sig, 1.3, lerp(0.75, 0.57, smooth(12, 27, kn)), 1 / (sig * C[1].k)); W.m.value = cov; W.wind.value.set(tx, tz);
    // each noise layer's offset at the water's origin, at the layer's own scale (the shader adds the scale times the
    // position from the origin, so the pattern stays put on the water wherever the origin goes): the breaking pattern
    // runs downwind with the waves' groups, the foam's lace drifts with the wind-blown surface, far slower
    const c0 = Math.sqrt(9.81 / C[1].k), fo = 0.03 * Us, off = (f, v) => [wrapA(f * (ox - tx * v * t), 256), wrapA(f * (oz - tz * v * t), 256)];
    // (a layer turned off the map's axes takes its offset turned the same way, or it would jump when the offset wraps)
    const offR = (f, a, b) => { const X = ox - tx * fo * t, Z = oz - tz * fo * t; return [wrapA(f * (a * X - b * Z), 256), wrapA(f * (b * X + a * Z), 256)]; };
    W.q.value.set(...off(0.09, 0.6 * c0), ...off(0.23, 0.6 * c0)); W.lq.value.set(...offR(1.3, 0.8, 0.6), ...offR(3.1, 0.28, -0.96)); W.la.value.set(...off(0.23, fo), ...offR(7.9, -0.71, 0.7));
  }
  U.uCamL.value.set(camera.position.x - ox, camera.position.y, camera.position.z - oz);
  U.uGridL.value.set(GRID.x0 - ox, -GRID.y1 - oz, GRID.x1 - GRID.x0, GRID.y1 - GRID.y0);
  U.uFineL.value.set(FINE.x0 - ox, -FINE.y1 - oz, FINE.x1 - FINE.x0, FINE.y1 - FINE.y0);
  U.uMaskL.value.set(MASK.x0 - ox, -MASK.y1 - oz, MASK.x1 - MASK.x0, MASK.y1 - MASK.y0);
  U.uSeaML.value.set(SEA_GRID.x0 - ox, SEA_GRID.y0 + oz, SEA_GRID.W, SEA_GRID.H);
  U.uPh.value = wrapA(2.3 * ox + 1.7 * oz + t);
}
function waveH(x, z, t) { let h = 0; for (const w of WAVES) h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t); return h * S.wx.wave; }
// the seabed and drying heights as textures for the shallows' tint and the line of the water's edge: one byte a cell,
// metres above CD from -25 to +20, north at the top
function heightTex(G) {
  const d = new Uint8Array(G.nx * G.ny * 4);
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { const z = G.z[j * G.nx + i], k = ((G.ny - 1 - j) * G.nx + i) * 4; d[k] = Math.round(clamp((z + 25) / 45, 0, 1) * 255); d[k + 3] = 255; }
  const t = new THREE.DataTexture(d, G.nx, G.ny, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
// where the sea must not be drawn: the marina basin and the lock, which have their own water at their own levels
const MASK = (() => {
  const B = DOCK_B, R = 1, W = Math.ceil((B.x1 - B.x0) / R) + 4, H = Math.ceil((B.y1 - B.y0) / R) + 4, x0 = B.x0 - 2, y1 = B.y1 + 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const P = clipS(DOCK, LOCK.sOut + 0.6); g.fillStyle = '#fff'; g.beginPath(); P.forEach(([x, y], i) => { const u = (x - x0) / R, v = (y1 - y) / R; i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.magFilter = t.minFilter = THREE.LinearFilter;
  return { tex: t, x0, y1, x1: x0 + W * R, y0: y1 - H * R };
})();
const GRID_TEX = heightTex(GRID), FINE_TEX = heightTex(FINE);
// The water's mesh is rings about its middle, which lies between the boat and the eye: each ring a twentieth wider than
// the last and cut into the same 224 pieces, so a cell is a third of a metre across at 10 m, a metre and a half at 50 m
// and forty at the edge, 800 m out, and looks much the same size on the screen wherever it is. The surface it is given is
// the swell and the wind's chop, each train faded out where the cells have grown too coarse to carry it (ten to a
// wavelength it is whole, four it is gone: the shading carries on from there), both cut in the lee and dying away in the
// shallows, so the waterline holds still rather than jumping up and down the mud. The wake, the foam and the spray use
// the same surface, so they lie on the water, and the RIB's physics rides it.
const WATER_HALF = 800, WATER_NTH = 224, WATER_G = 1.05, WATER_R0 = 0.4;
const VTF_GLSL = renderer.capabilities.maxVertexTextures >= 4 ? '#define VTF\n' : '';
const SEA_GLSL = `uniform vec2 uOrg; uniform float uAmp; uniform float uGeo; uniform float uSwP[3]; uniform vec4 uChopD[6]; uniform float uChopP[6]; uniform float uTide;
      uniform sampler2D uSeaM; uniform vec4 uSeaML; uniform sampler2D uGrid; uniform sampler2D uFine; uniform vec4 uGridL; uniform vec4 uFineL;
      // a train of wavenumber k heading d, where the cells are cs.x long outward (along rh) and cs.y across
      float seaFade(float k, vec2 d, vec2 rh, vec2 cs){ return 1.0 - smoothstep(0.10, 0.26, k * 0.15915 * (abs(dot(d, rh)) * cs.x + abs(d.x * rh.y - d.y * rh.x) * cs.y)); }
      float bedV(vec2 l){
        vec2 f = (l - uFineL.xy) / uFineL.zw;
        if (f.x > 0.002 && f.y > 0.002 && f.x < 0.998 && f.y < 0.998) return texture2D(uFine, f).r * 45.0 - 25.0;
        return texture2D(uGrid, clamp((l - uGridL.xy) / uGridL.zw, 0.001, 0.999)).r * 45.0 - 25.0;
      }
      // l: metres east and south of the water's middle; returns the height above the sea's level, and the swell's own share
      float seaY(vec2 l, out float sw){
        sw = 0.0; if (uGeo < 0.5) return 0.0;
        float r = length(l); vec2 rh = l / max(r, 0.01), cs = max(r, 8.0) * vec2(${(WATER_G - 1).toFixed(4)}, ${(2 * Math.PI / WATER_NTH).toFixed(5)});
` + WAVES.map((w, i) => `        sw += ${w.a.toFixed(3)} * sin(${w.k.toFixed(5)} * dot(l, vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})) + uSwP[${i}]) * seaFade(${w.k.toFixed(5)}, vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)}), rh, cs);`).join('\n') + `
        sw *= uAmp * (1.0 - smoothstep(350.0, 760.0, r));
        float ch = 0.0;
        #ifdef VTF
        for (int i = 0; i < 6; i++) { vec4 c = uChopD[i]; ch += c.w * sin(c.z * dot(c.xy, l) + uChopP[i]) * seaFade(c.z, c.xy, rh, cs); }
        vec4 sm = texture2D(uSeaM, vec2((l.x - uSeaML.x) / uSeaML.z, (-l.y - uSeaML.y) / uSeaML.w));
        vec2 W = l + uOrg; float s = W.x * ${LK_U[0].toFixed(5)} - W.y * ${LK_U[1].toFixed(5)}, c = W.x * ${LK_N[0].toFixed(5)} - W.y * ${LK_N[1].toFixed(5)};
        float ap = (c < ${(APPROACH.cNW - 3).toFixed(2)} || c > ${(APPROACH.cSE + 3).toFixed(2)}) ? 1.0 : mix(0.15, 1.0, smoothstep(${APPROACH.s1.toFixed(1)}, ${(APPROACH.s1 + 50).toFixed(1)}, s));
        float shoal = smoothstep(0.3, 3.0, uTide - bedV(l));
        sw *= sm.g * ap * shoal; ch *= sm.r * ap * shoal;
        #endif
        return sw + ch; }
`;
const SEA_AMP = { value: 0 }, SEA_TIDE = { value: 7 };
const SEA_U = { uOrg: WATER_U.uOrg, uAmp: SEA_AMP, uGeo: { value: 1 }, uSwP: WATER_U.uSwP, uChopD: WATER_CHOP.d, uChopP: WATER_CHOP.p, uTide: SEA_TIDE, uSeaM: { value: SEA_GRID.tex }, uSeaML: WATER_U.uSeaML,
  uGrid: { value: GRID_TEX }, uFine: { value: FINE_TEX }, uGridL: WATER_U.uGridL, uFineL: WATER_U.uFineL };
function waterMaterial(amp, basin) {
  return new THREE.ShaderMaterial({
    extensions: { derivatives: true },
    defines: basin ? { BASIN: '' } : {},
    uniforms: Object.assign({
      uTime: { value: 0 }, uAmp: amp ? SEA_AMP : { value: 0 }, uGeo: { value: amp ? 1 : 0 }, uTide: SEA_TIDE, uGrid: SEA_U.uGrid, uFine: SEA_U.uFine, uMask: { value: MASK.tex }, uSeaM: SEA_U.uSeaM, uSheen: WATER_SHEEN,
      uDeep: { value: basin ? new THREE.Color(0x2b3a2d) : new THREE.Color(SEA_DEEP) }, uShallow: { value: basin ? new THREE.Color(0x3c4a3a) : new THREE.Color(SEA_SHALLOW) }, uSkyTop: { value: SKY_TOP },
      uFog: { value: SKY }, uSun: { value: SUN_DIR }, uFogNear: { value: FOG_NEAR }, uFogFar: { value: FOG_FAR }, uRip: { value: 0.1 }, uSpec: { value: WATER_SPEC }, uNoise: { value: NOISE_TEX },
      uChopD: WATER_CHOP.d, uChopP: WATER_CHOP.p, uChopW: WATER_CHOP.w, uWh: WATER_CHOP.wh, uWhQ: WATER_CHOP.q, uWhL: WATER_CHOP.lq, uWhA: WATER_CHOP.la, uWhM: WATER_CHOP.m, uWind: WATER_CHOP.wind,
    }, WATER_U, WATER_FLOW),
    // the sea's mesh sits at the water's middle, so its own x and z are metres from uOrg; the marina's and the lock's
    // water are flat sheets placed in the world
    vertexShader: VTF_GLSL + SEA_GLSL + `varying vec3 vL; varying float vH;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0);
        #ifdef BASIN
        vH = 0.0; vL = vec3(wp.x - uOrg.x, wp.y, wp.z - uOrg.y);
        #else
        float sw; wp.y += seaY(position.xz, sw); vH = sw / max(uAmp, 0.01); vL = vec3(position.x, wp.y, position.z);
        #endif
        gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyTop; uniform vec3 uFog; uniform vec3 uSun;
      uniform float uFogNear; uniform float uFogFar; uniform float uTime; uniform float uAmp; uniform float uTide; uniform float uRip; uniform vec3 uSpec;
      uniform sampler2D uGrid; uniform sampler2D uFine; uniform sampler2D uMask; uniform vec4 uGridL; uniform vec4 uFineL; uniform vec4 uMaskL;
      uniform vec2 uRipA; uniform vec3 uRipC; uniform vec2 uChopQ; uniform vec2 uChopR; uniform vec3 uCamL; uniform float uPh; uniform float uMaskS;
      uniform vec4 uChopD[6]; uniform float uChopP[6]; uniform float uChopW[6]; uniform vec4 uWh; uniform vec4 uWhQ; uniform vec4 uWhL; uniform vec4 uWhA; uniform float uWhM; uniform vec2 uWind;
      uniform sampler2D uSeaM; uniform vec4 uSeaML; uniform float uSheen;
      uniform vec2 uOrg; uniform float uBase; uniform vec2 uFlood; uniform vec2 uFPh; uniform vec4 uObs[${N_OBS}]; uniform vec4 uObsV[${N_OBS}]; uniform vec2 uWindD;
      varying vec3 vL; varying float vH;
      ` + WAVE_GRAD_GLSL + NOISE_GLSL + `
      float wn(vec2 p){ return vnoise(p); }
      vec2 ripple(vec2 l, float fp){
        vec2 g = vec2(0.0); vec2 q = l + vec2(sin(l.y*0.071 + uRipA.x), cos(l.x*0.063 + uRipA.y))*6.0;
        g += vec2(0.80, 0.60)*cos(dot(vec2(0.80, 0.60), q)*0.83 + uRipC.x)*(1.0 - smoothstep(0.4, 1.2, 0.83*fp));
        g += vec2(-0.53, 0.85)*cos(dot(vec2(-0.53, 0.85), q)*1.37 + uRipC.y)*0.7*(1.0 - smoothstep(0.4, 1.2, 1.37*fp));
        g += vec2(0.96, -0.28)*cos(dot(vec2(0.96, -0.28), q)*2.21 + uRipC.z)*0.5*(1.0 - smoothstep(0.4, 1.2, 2.21*fp));
        return g;
      }
      vec2 chop(vec2 l, float fp){
        vec2 g = vec2(0.0); const float e = 0.2;
        vec2 q = l * 0.55 + uChopQ; float a = wn(q);
        g += vec2(wn(q + vec2(e, 0.0)) - a, wn(q + vec2(0.0, e)) - a) / e * 0.55 * (1.0 - smoothstep(0.5, 1.3, 0.55 * 3.0 * fp));
        vec2 r = l * 1.6 + uChopR; float b = wn(r);
        g += vec2(wn(r + vec2(e, 0.0)) - b, wn(r + vec2(0.0, e)) - b) / e * 0.35 * (1.0 - smoothstep(0.5, 1.3, 1.6 * 3.0 * fp));
        return g;
      }
      float bedAt(vec2 l){
        vec2 f = (l - uFineL.xy) / uFineL.zw;
        if (f.x > 0.002 && f.y > 0.002 && f.x < 0.998 && f.y < 0.998) return texture2D(uFine, f).r * 45.0 - 25.0;
        vec2 g = (l - uGridL.xy) / uGridL.zw;
        return texture2D(uGrid, clamp(g, 0.001, 0.999)).r * 45.0 - 25.0;
      }
      // the stream at a point (world x, z; z is south), metres a second in x, z
      vec2 flowAt(vec2 w, float depth){
        if (depth <= 0.05) return vec2(0.0);
        float x = w.x, y = -w.y;
        float f = clamp(sqrt(depth / 11.0), 0.0, 1.05) * clamp(depth / 1.5, 0.0, 1.0), m = uBase * f;
        float harbour = smoothstep(60.0, 160.0, x) * (1.0 - smoothstep(650.0, 800.0, x)) * (1.0 - smoothstep(470.0, 600.0, y));
        float shoreW = (1.0 - smoothstep(-200.0, 40.0, x)) * (1.0 - smoothstep(480.0, 620.0, y)) * smoothstep(-1300.0, -1100.0, x);
        m *= 1.0 - 0.8 * harbour - 0.4 * shoreW;
        vec2 v = uFlood * m;
        float pool = smoothstep(-120.0, 60.0, x) * (1.0 - smoothstep(780.0, 950.0, x)) * smoothstep(380.0, 470.0, y) * (1.0 - smoothstep(820.0, 950.0, y));
        if (uBase > 0.0 && pool > 0.0) v = mix(v, vec2(-0.9659, 0.2588) * (0.35 * uBase * f * pool), pool);   // the Pool's eddy sets 255°
        float s = x * 0.618 + y * 0.786, c = x * 0.786 - y * 0.618;
        if (s < 186.0 && c > -53.7 && c < -29.4) v = vec2(0.0);   // the walled approach to the lock
        return v;
      }
      float sq(float x){ return x * x; }
      vec2 nGrad(vec2 q){ float a = wn(q); return vec2(wn(q + vec2(0.25, 0.0)) - a, wn(q + vec2(0.0, 0.25)) - a) * 4.0; }
      void main(){
        vec2 l = vL.xz;
        #ifndef BASIN
        { vec2 m = (l - uMaskL.xy) / uMaskL.zw; if (m.x > 0.0 && m.y > 0.0 && m.x < 1.0 && m.y < 1.0 && texture2D(uMask, m).r > 0.5 && dot(vec2(l.x + uOrg.x, -(l.y + uOrg.y)), vec2(0.618, 0.786)) < uMaskS) discard; }
        #endif
        float dist = distance(uCamL, vL);
        vec2 fw2 = fwidth(l); float fp = max(fw2.x, fw2.y);
        vec2 sg = waveGrad(l, fp) * uAmp * (1.0 - smoothstep(350.0, 760.0, distance(l, uCamL.xz)));
        vec2 rg = ripple(l, fp) * uRip * 0.25;
        vec2 cg = chop(l, fp) * (0.04 + uRip * 1.3);
        // the sea's map: how much of the chop the land's lee and the lock's walls let through
        float shel = 0.0;
        #ifndef BASIN
        { vec4 sm = texture2D(uSeaM, vec2((l.x - uSeaML.x) / uSeaML.z, (-l.y - uSeaML.y) / uSeaML.w));
          vec2 W = l + uOrg; float s = W.x * ${LK_U[0].toFixed(5)} - W.y * ${LK_U[1].toFixed(5)}, c = W.x * ${LK_N[0].toFixed(5)} - W.y * ${LK_N[1].toFixed(5)};
          shel = sm.r * ((c < ${(APPROACH.cNW - 3).toFixed(2)} || c > ${(APPROACH.cSE + 3).toFixed(2)}) ? 1.0 : mix(0.15, 1.0, smoothstep(${APPROACH.s1.toFixed(1)}, ${(APPROACH.s1 + 50).toFixed(1)}, s))); }
        #endif
        // the wind's chop within 3 km: its height in standard deviations (for the white horses), its slope (for the
        // shading, each train's faded out before it is finer than the pixel) and its slope whole (for the breaking face)
        vec2 wg = vec2(0.0), wgf = vec2(0.0); float ce = 0.0; float cph[6];
        #ifndef BASIN
        if (dist < 3000.0) {
          for (int i = 0; i < 6; i++) {
            vec4 c = uChopD[i]; float ph = c.z * dot(c.xy, l) + uChopP[i]; cph[i] = ph;
            vec2 sl = c.w * c.z * cos(ph) * c.xy; ce += c.w * sin(ph); wgf += sl; wg += sl * (1.0 - smoothstep(0.6, 1.6, c.z * fp));
          }
          ce *= shel / uWh.x; cg += wg * shel * (1.0 - smoothstep(600.0, 3000.0, dist));
        }
        #endif
        float depth = 20.0;
        #ifndef BASIN
        depth = uTide - bedAt(l);
        #endif
        vec3 alb = mix(uShallow, uDeep, smoothstep(0.3, 4.0, depth));
        vec2 ag = vec2(0.0), og = vec2(0.0); float streak = 0.0, boil = 0.0, turb = 0.0, race = 0.0, obsFoam = 0.0, silt = 0.5;
        #ifndef BASIN
        if (dist < 2600.0) {
          vec2 W = l + uOrg, fl = flowAt(W, depth); float spd = length(fl);
          vec2 fd = spd > 0.01 ? fl / spd : uFlood, fq = vec2(-fd.y, fd.x);
          turb = smoothstep(0.15, 1.6, spd);
          // two copies of the pattern, carried along by the stream and swapped as each gets stretched
          const float FL = ${FLOW_CYCLE.toFixed(1)};
          vec2 p0 = W - fl * (uFPh.x * FL), p1 = W - fl * (uFPh.y * FL) + vec2(37.3, 11.9);
          float w0 = 1.0 - abs(2.0 * uFPh.x - 1.0), w1 = 1.0 - w0, near = 1.0 - smoothstep(250.0, 1200.0, dist);
          // silt: broad patches of paler and darker water
          silt = (wn(p0 * 0.019) * 0.6 + wn(p0 * 0.061) * 0.4) * w0 + (wn(p1 * 0.019) * 0.6 + wn(p1 * 0.061) * 0.4) * w1;
          // scum and foam drawn out into lines along the stream
          float s0 = wn(vec2(dot(p0, fd) * 0.03, dot(p0, fq) * 0.45)), s1 = wn(vec2(dot(p1, fd) * 0.03, dot(p1, fq) * 0.45));
          streak = (smoothstep(0.74, 0.9, s0) * w0 + smoothstep(0.74, 0.9, s1) * w1) * (0.2 + 0.8 * turb);
          // boils: domes of upwelling water, paler and glassy, coming up where the stream runs hard over the bottom
          boil = (smoothstep(0.68, 0.8, wn(p0 * 0.048 + 13.0)) * w0 + smoothstep(0.68, 0.8, wn(p1 * 0.048 + 13.0)) * w1) * turb;
          // small turbulent ripples riding on the stream
          if (near > 0.0) ag = (nGrad(p0 * 0.9) * w0 + nGrad(p1 * 0.9 + 5.0) * w1) * 0.09 * (0.25 + turb) * near * (1.0 - smoothstep(0.4, 1.4, 0.9 * 3.0 * fp));
          // rougher over the shoals and rocks where it runs fast, and where the wind blows against it
          race = turb * (1.0 - smoothstep(1.0, 6.5, depth));
          float wat = clamp(-dot(uWindD, fd), 0.0, 1.0) * turb;
          cg *= 1.0 + 1.6 * race + 0.9 * wat; ag *= 1.0 + 1.5 * race;
          // the buoys and the pier head in the stream
          for (int i = 0; i < ${N_OBS}; i++) {
            vec4 o = uObs[i]; if (o.w < 0.5) continue;
            vec2 r = l - o.xy; float d = length(r); if (d > 110.0) continue;
            vec4 ov = uObsV[i]; float U = length(ov.xy); if (U < 0.08) continue;
            vec2 vd = ov.xy / U, vp = vec2(-vd.y, vd.x); float al = dot(r, vd), ac = dot(r, vp), R = o.z, on = smoothstep(0.08, 0.7, U);
            if (al > -R) {
              float wdt = R * 0.95 + max(al, 0.0) * 0.1, len = 5.0 + 18.0 * U;
              float lace = wn(vec2(al * 0.45 - ov.z, ac * 1.5)) * 0.6 + wn(vec2(al * 1.3 - ov.z * 2.9, ac * 3.7 + 7.0)) * 0.4;
              obsFoam += exp(-sq(ac / wdt)) * exp(-max(al, 0.0) / len) * smoothstep(0.38, 0.7, lace) * on * smoothstep(-R, R * 0.5, al);
              // waves off it in a V, as a boat's: their length from the stream's speed
              float k = 9.81 / max(U * U, 0.04), cu = abs(ac) - max(al, 0.0) * 0.354;
              float arm = exp(-sq(cu / (0.45 + 0.07 * al))) * exp(-max(al, 0.0) / (18.0 + 22.0 * U)) * on * step(0.0, al);
              og += arm * 0.08 * cos(k * (al * 0.816 + abs(ac) * 0.577) - ov.w) * (vd * 0.816 + vp * sign(ac) * 0.577) * (1.0 - smoothstep(0.6, 1.6, k * fp));
            }
            // the pillow of water heaped against its upstream face
            obsFoam += exp(-sq((d - R * 1.12) / (0.3 + 0.2 * R))) * smoothstep(0.1, 0.9, -al / max(d, 0.01)) * on * 0.8;
          }
          alb *= 0.93 + 0.13 * silt;
          alb = mix(alb, uShallow * 1.1, boil * 0.55);
        }
        #endif
        float glass = 1.0 - 0.65 * boil;   // a boil's top is smooth
        vec3 n = normalize(vec3(-sg.x - (rg.x + cg.x) * glass - ag.x - og.x, 1.0, -sg.y - (rg.y + cg.y) * glass - ag.y - og.y));
        vec3 col = alb*(0.62 + 0.38*clamp(dot(n, uSun), 0.0, 1.0));
        vec3 V = normalize(uCamL - vL); vec3 R = reflect(-V, n);
        vec3 sky = mix(uFog, uSkyTop, smoothstep(0.0, 0.5, R.y));
        float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, V), 0.0), 5.0);
        #ifdef BASIN
        col = mix(col, sky*0.9, clamp(fres*0.8, 0.0, 0.7));
        #else
        col = mix(col, sky*vec3(0.88, 0.87, 0.84), clamp(fres*0.8, 0.0, 0.62));   // silty water: the body colour holds even at a glance, greyed by the sky
        #endif
        vec3 H = normalize(V + uSun); col += uSpec*pow(max(dot(n, H), 0.0), 140.0);
        if (uSheen > 0.0) col += uSpec*uSheen*pow(max(dot(n, H), 0.0), 9.0);   // by night the moon lays a broad pale sheen on the water, not only its glitter
        #ifndef BASIN
        float crest = smoothstep(0.6, 1.0, vH)*smoothstep(0.22, 0.6, uAmp);
        float edge = (1.0 - smoothstep(0.05, 0.5 + uAmp, depth)) * (0.4 + 0.3*sin(uPh - depth*6.0 + l.x*0.03 - l.y*0.02));
        vec3 scum = vec3(0.79, 0.76, 0.67), froth = vec3(0.89, 0.87, 0.80);
        col = mix(col, scum, clamp(crest*0.5 + edge*0.5, 0.0, 0.7));
        col = mix(col, scum, clamp(streak * 0.38 + race * 0.12 * smoothstep(0.55, 0.8, silt), 0.0, 0.55));
        col = mix(col, froth, clamp(obsFoam, 0.0, 0.9));
        // White horses. A crest high enough breaks where a pattern running with the waves says so (so a crest breaks here
        // and not there, now and not a moment later): bright on the face it is toppling down. The foam it leaves does not
        // travel with the wave but lies on the water where the crest was a second or two ago, thinning to lace as it
        // ages. Wind against a hard-running stream over the shoals breaks more of them. Far off, where a cap is finer than
        // the pixel, the sea is whitened by their share instead.
        if (uWhM > 0.0 && dist < 3000.0) {
          float nearW = 1.0 - smoothstep(0.3, 1.4, fp), white = uWhM * 1.3 * shel * shel;
          if (nearW > 0.0) {
            float cap = 0.0, m = smoothstep(uWh.z, uWh.z + 0.1, wn(l * 0.09 + uWhQ.xy) * 0.6 + wn(l * 0.23 + uWhQ.zw) * 0.4);
            if (m > 0.0) {
              // the lace: three sizes of cell, each turned off the last's axes and the lot pushed about by a larger swirl
              vec2 wq = l + 0.9 * (vec2(wn(l * 0.23 + uWhA.xy), wn(l * 0.23 + uWhA.xy + 31.7)) - 0.5);
              float lace = wn(vec2(0.80 * wq.x - 0.60 * wq.y, 0.60 * wq.x + 0.80 * wq.y) * 1.3 + uWhL.xy) * 0.5
                + wn(vec2(0.28 * wq.x + 0.96 * wq.y, -0.96 * wq.x + 0.28 * wq.y) * 3.1 + uWhL.zw) * 0.32 + wn(vec2(-0.71 * wq.x - 0.70 * wq.y, 0.70 * wq.x - 0.71 * wq.y) * 7.9 + uWhA.zw) * 0.18;
              float face = smoothstep(-0.25, 0.3, -dot(wgf, uWind) * shel * uWh.w);            // the side the crest is falling down
              cap = smoothstep(uWh.y, uWh.y + 0.45, ce + race * 0.5 + (lace - 0.45) * 0.7) * face * (0.6 + 0.4 * smoothstep(0.22, 0.48, lace));   // ragged, not a smooth band
              // where the crest stood 0.55, 1.2 and 2.1 seconds ago
              float c1 = 0.0, c2 = 0.0, c3 = 0.0;
              for (int i = 0; i < 6; i++) { float a = uChopD[i].w, w = uChopW[i]; c1 += a * sin(cph[i] + w * 0.55); c2 += a * sin(cph[i] + w * 1.2); c3 += a * sin(cph[i] + w * 2.1); }
              float sc = shel / uWh.x, t0 = uWh.y - 0.4 - race * 0.5;
              float res = max(max(smoothstep(t0, t0 + 0.6, c1 * sc) * smoothstep(0.33, 0.52, lace) * 0.9, smoothstep(t0, t0 + 0.6, c2 * sc) * smoothstep(0.46, 0.62, lace) * 0.7),
                smoothstep(t0, t0 + 0.6, c3 * sc) * smoothstep(0.56, 0.70, lace) * 0.42);
              cap = max(cap, res) * m;
            }
            white = mix(white, cap, nearW);
          }
          // foam takes the daylight as the water does
          col = mix(col, froth * (0.8 + 0.2 * clamp(dot(n, uSun), 0.0, 1.0)), clamp(white, 0.0, 0.94) * (1.0 - edge * 0.5));
        }
        #endif
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
}
const waterNearMat = waterMaterial(1, false), waterFarMat = waterMaterial(0, false), basinWaterMat = waterMaterial(0, true);
// the rings: 0.4 m apart to 8 m out, then each a twentieth wider; inside 8 m the pieces halve in number at 8, 4, 2 and
// 1 m, so they do not crowd to slivers at the middle
const WATER_RINGS = (() => { const r = [WATER_R0]; while (r[r.length - 1] < WATER_HALF * 0.97) { const a = r[r.length - 1]; r.push(a + Math.max(0.4, a * (WATER_G - 1))); } r[r.length - 1] = WATER_HALF;
  return r.map(a => ({ r: a, n: Math.max(14, WATER_NTH >> Math.max(0, Math.ceil(Math.log2(8 / a)))) })); })();
const waterNear = new THREE.Mesh((() => {
  const R = WATER_RINGS, base = [1]; for (const q of R) base.push(base[base.length - 1] + q.n);
  const pos = new Float32Array(base[R.length] * 3), idx = [];
  R.forEach((q, k) => { for (let j = 0; j < q.n; j++) { const a = j / q.n * Math.PI * 2, o = (base[k] + j) * 3; pos[o] = q.r * Math.cos(a); pos[o + 2] = q.r * Math.sin(a); } });
  for (let j = 0; j < R[0].n; j++) idx.push(0, 1 + (j + 1) % R[0].n, 1 + j);
  for (let k = 0; k < R.length - 1; k++) {
    const ni = R[k].n, no = R[k + 1].n, I = (j) => base[k] + j % ni, O = (j) => base[k + 1] + j % no;
    for (let j = 0; j < ni; j++) {
      if (no === ni) { if ((j + k) & 1) idx.push(I(j), I(j + 1), O(j), I(j + 1), O(j + 1), O(j)); else idx.push(I(j), I(j + 1), O(j + 1), I(j), O(j + 1), O(j)); }
      else idx.push(I(j), O(2 * j + 1), O(2 * j), I(j), I(j + 1), O(2 * j + 1), I(j + 1), O(2 * j + 2), O(2 * j + 1));   // twice as many outside
    }
  }
  const nv = base[R.length], g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1)); return g;
})(), waterNearMat);
waterNear.frustumCulled = false;
// beyond it, flat water to the horizon: one ring more, from the last ring's own points
const waterFar = (() => {
  const N = WATER_NTH, b = 40000, pos = new Float32Array(N * 2 * 3), idx = [];
  for (let j = 0; j < N; j++) { const a = j / N * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); pos.set([WATER_HALF * c, 0, WATER_HALF * sn], j * 3); pos.set([b * c, 0, b * sn], (N + j) * 3); }
  for (let j = 0; j < N; j++) { const a = j, e = (j + 1) % N; idx.push(a, e, N + a, e, N + e, N + a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, waterFarMat); m.material.side = THREE.DoubleSide; m.frustumCulled = false; return m;
})();
// drawn after everything else solid, so the hull, the quays and the land hide it before it is shaded, not after
waterNear.renderOrder = waterFar.renderOrder = 1;
scene.add(waterNear, waterFar);
// the water's middle lies between the boat and the eye, nearer the boat (she is what is looked at); when the eye is off on
// its own it goes with the eye
function waterCentre() {
  const c = camera.position; if (!S) return [c.x, c.z];
  const dx = c.x - RB.x, dz = c.z + RB.y;
  return Math.hypot(dx, dz) > 200 ? [c.x, c.z] : [RB.x + dx * 0.4, -RB.y + dz * 0.4];
}
// the lowest the sea's surface can be just now, below its level: every swell and chop train in its trough at once
function seaTrough() { const C = S && (S.chop || (S.chop = chopSea())); return S ? WAVES.reduce((t, w) => t + w.a, 0) * S.wx.wave + C.reduce((t, c) => t + c.a, 0) : 0; }

// ---------- foam and spray ----------
// White water in pieces: flecks of froth that lie on the water and ride it (wash from the prop, the stream's froth off the
// buoys, the lock's churn), and spray in the air, thrown up and falling back (a planing hull's chines, a slam, the rooster
// tail). Each is a soft round point of its own size and strength. A fleck's height is the water's level where it lies,
// plus the sea's surface there worked out as the water's own is (in the marina and the lock the water is flat); a drop
// of spray carries its height above that and falls to it, where it leaves a fleck for a moment.
function makeFlecks(N, rgb) {
  const pos = new Float32Array(N * 3), sa = new Float32Array(N * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSA', new THREE.BufferAttribute(sa, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), SEA_U, { uH: { value: 600 }, uCol: { value: new THREE.Color(...rgb) } }),
    vertexShader: VTF_GLSL + SEA_GLSL + `attribute vec3 aSA; varying float vA; uniform float uH;
      #include <fog_pars_vertex>
      void main(){ float sw; vec3 p = vec3(position.x, position.y + seaY(position.xz - uOrg, sw) * aSA.z, position.z);   // aSA: size, strength, on the sea or not
        vec4 mvPosition = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSA.x * projectionMatrix[1][1] * uH * 0.5 / max(0.2, -mvPosition.z); vA = aSA.y;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying float vA; uniform vec3 uCol;
      #include <fog_pars_fragment>
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0 || vA <= 0.0) discard;
        gl_FragColor = vec4(uCol, vA * (1.0 - r) * (1.0 - r * 0.5));
        #include <tonemapping_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts);
  return { pts, pos, sa, g };
}
const FOAM_N = 2600;
const foam = Object.assign(makeFlecks(FOAM_N, [0.92, 0.91, 0.86]), { vel: new Float32Array(FOAM_N * 3), base: new Float32Array(FOAM_N), h: new Float32Array(FOAM_N), life: new Float32Array(FOAM_N), max: new Float32Array(FOAM_N), size: new Float32Array(FOAM_N), air: new Uint8Array(FOAM_N), i: 0 });
// a fleck on the water at (x east, y north) drifting at (vx, vy), or with vh a drop of spray leaving h above the water
function spawnFoam(x, y, vx, vy, life, size = 0.5, h = 0.04, vh = 0) {
  const i = foam.i; foam.i = (foam.i + 1) % FOAM_N;
  foam.pos[i * 3] = x; foam.pos[i * 3 + 2] = -y; foam.base[i] = levelAt(x, y); foam.h[i] = h; foam.pos[i * 3 + 1] = foam.base[i] + h; foam.sa[i * 3 + 2] = waterBody(x, y) === 'sea' ? 1 : 0;
  foam.vel[i * 3] = vx; foam.vel[i * 3 + 1] = vh; foam.vel[i * 3 + 2] = -vy; foam.life[i] = foam.max[i] = life; foam.size[i] = size; foam.air[i] = vh !== 0 || h > 0.2 ? 1 : 0;
}
function updateFoam(dt) {
  const P = foam.pos, V = foam.vel, A = foam.sa;
  for (let i = 0; i < FOAM_N; i++) {
    const k = i * 3;
    if (foam.life[i] <= 0) { if (A[k + 1] !== 0) { A[k] = 0; A[k + 1] = 0; } continue; }
    foam.life[i] -= dt;
    P[k] += V[k] * dt; P[k + 2] += V[k + 2] * dt;
    let f = clamp(foam.life[i] / foam.max[i], 0, 1), sz = foam.size[i], al;
    if (foam.air[i]) {
      // spray: thrown, slowed by the air, falling; where it lands it lies as a fleck for half a second or so
      V[k + 1] -= 9.81 * dt; foam.h[i] += V[k + 1] * dt; const drag = Math.max(0, 1 - 1.6 * dt); V[k] *= drag; V[k + 2] *= drag;
      if (foam.h[i] <= 0.03) { foam.h[i] = 0.03; foam.air[i] = 0; V[k] *= 0.15; V[k + 2] *= 0.15; foam.life[i] = foam.max[i] = 0.35 + 0.5 * sz; f = 1; }
      al = 0.6 * Math.min(1, f * 3) * Math.min(1, (1 - f) * 12 + 0.25); sz *= 0.8 + 1.2 * (1 - f);   // a drop spreads into mist as it flies
    } else {
      const damp = Math.max(0, 1 - 0.7 * dt); V[k] *= damp; V[k + 2] *= damp;
      al = 0.8 * f * Math.min(1, (1 - f) * 10 + 0.3); sz *= 1 + 0.7 * (1 - f);   // spreading and thinning as it fades
    }
    P[k + 1] = foam.base[i] + foam.h[i]; A[k] = sz; A[k + 1] = al;
  }
  foam.g.attributes.position.needsUpdate = true; foam.g.attributes.aSA.needsUpdate = true;
}
// ---------- wake ----------
// White water left astern, laid along the track actually run: each stretch born as strong as her speed and prop wash make
// it, then spreading and fading with age.
const WAKE_N = 520;
function makeWake() {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(WAKE_N * 6), aw = new Float32Array(WAKE_N * 6), ax = new Float32Array(WAKE_N * 6);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aw', new THREE.BufferAttribute(aw, 3)); g.setAttribute('ax', new THREE.BufferAttribute(ax, 3));
  const idx = new Uint16Array((WAKE_N - 1) * 6); g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), SEA_U, { uNoise: { value: NOISE_TEX }, uPlane: { value: 0 } }),
    // the ribbon lies on the water as the water draws it, a hand's breadth clear (ax.z: on the sea, or the marina's or the
    // lock's still water)
    vertexShader: VTF_GLSL + SEA_GLSL + `attribute vec3 aw; attribute vec3 ax; varying vec3 vAw; varying vec2 vAx;
      #include <fog_pars_vertex>
      void main(){ vAw = aw; vAx = ax.xy; float sw; vec3 p = vec3(position.x, position.y + seaY(position.xz - uOrg, sw) * ax.z + 0.05, position.z);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vAw; varying vec2 vAx; uniform float uPlane;
      #include <fog_pars_fragment>
      ` + NOISE_GLSL + `
      float wnz(vec2 p){ return vnoise(p); }
      void main(){
        // vAw: across the wake (-1..1), metres along the track, strength now; vAx: the wake's half-width here, its age.
        // In metres, so the foam's grain stays the size it is while the wake spreads. New wash is all but solid; as it
        // weakens the lace eats into it until only flecks are left. Under it and after it the churned water lies paler and
        // smooth (silt stirred up and full of air): that outlasts the foam. Off a planing hull the froth comes off the
        // chines, and the water straight astern is clean for the first second or so.
        float x = abs(vAw.x), hw = vAx.x, age = vAx.y, z = vAw.z; vec2 m = vec2(vAw.x * hw, vAw.y);
        float n1 = wnz(m * 0.45), n2 = wnz(vec2(m.x * 1.4 + 3.1, m.y * 0.8)), n3 = wnz(vec2(m.x * 4.3, m.y * 2.1) + 9.7);
        float lace = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
        float edge = 1.0 - smoothstep(0.55, 1.0, x + (n2 - 0.5) * 0.4);
        float chine = mix(1.0, smoothstep(0.15, 0.7, x), uPlane * (1.0 - smoothstep(0.3, 1.8, age)));
        float th = mix(0.74, 0.16, z);
        float white = smoothstep(th, th + 0.17, lace) * edge * chine * (0.3 + 0.7 * z);
        float pale = edge * sqrt(z) * 0.44 * (0.35 + 0.65 * smoothstep(0.25, 0.7, n1 * 0.6 + n2 * 0.4));
        float a = clamp(max(white * 0.92, pale), 0.0, 0.92);
        vec3 c = mix(vec3(0.66, 0.62, 0.53), vec3(0.92, 0.91, 0.86), clamp(white * 1.2, 0.0, 1.0));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  return { g, pos, aw, ax, idx, pts: [], mesh };
}
const WAKE = makeWake();
function updateWake() {
  const V = RB, t = S.t, P = WAKE.pts;
  const sp = Math.sin(V.psi), cp = Math.cos(V.psi), vx = V.u * sp + V.v * cp, vy = V.u * cp - V.v * sp, spd = Math.hypot(vx, vy);
  const ux = spd > 0.05 ? vx / spd : sp, uy = spd > 0.05 ? vy / spd : cp, half = 3.2, x = V.x - ux * half, y = V.y - uy * half;
  let last = P[P.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) > 80) { P.length = 0; last = null; }
  const I = clamp(0.14 * smooth(0.3, 1.2, spd) + smooth(1.2, 4, spd) * 0.3 + smooth(5, 11, spd) * 0.45 + 0.15 * clamp(Math.abs(RB.T) / 2500, 0, 1) * smooth(0.3, 2, spd), 0, 1);
  const tau = 3 + 0.9 * spd, hw0 = 1.05, grow = 0.22, gap = last ? Math.hypot(x - last.x, y - last.y) : 1e9;
  const sea = waterBody(x, y) === 'sea' ? 1 : 0;
  if (I > 0.02 && gap > 1.5) { P.push({ x, y, t, I, tau, s: last ? last.s + Math.min(gap, 80) : 0, sea }); if (P.length > WAKE_N - 1) P.shift(); }
  while (P.length && P[0].I * Math.exp(-(t - P[0].t) / P[0].tau) < 0.03) P.shift();
  const pts = P.slice(); if (I > 0.02 && P.length && gap > 0.2) pts.push({ x, y, t, I, tau, s: P[P.length - 1].s + gap, sea });
  const n = pts.length, pos = WAKE.pos, aw = WAKE.aw, ax = WAKE.ax, idx = WAKE.idx; let q = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const age = t - p.t, str = p.I * Math.exp(-age / p.tau), hw = hw0 * (0.75 + 0.25 * p.I) + grow * age, lv = levelAt(p.x, p.y), sea = p.sea;
    for (const sd of [-1, 1]) {
      const wx = p.x - ty * hw * sd, wy = p.y + tx * hw * sd, k = (i * 2 + (sd > 0 ? 1 : 0)) * 3;
      pos[k] = wx; pos[k + 1] = lv; pos[k + 2] = -wy; aw[k] = sd; aw[k + 1] = p.s; aw[k + 2] = str; ax[k] = hw; ax[k + 1] = age; ax[k + 2] = sea;
    }
    if (i > 0 && Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) < 40) { const v = (i - 1) * 2; idx[q++] = v; idx[q++] = v + 2; idx[q++] = v + 1; idx[q++] = v + 1; idx[q++] = v + 2; idx[q++] = v + 3; }
  }
  WAKE.g.setDrawRange(0, q); WAKE.g.attributes.position.needsUpdate = true; WAKE.g.attributes.aw.needsUpdate = true; WAKE.g.attributes.ax.needsUpdate = true; WAKE.g.index.needsUpdate = true;
  WAKE.mesh.material.uniforms.uPlane.value = RB.plane || 0;
}
// ---------- marks: the channel buoys and the south cardinal on Denny Shoal ----------
function buildMarks() {
  const grp = []; MARKS.list = grp;
  for (const m of PD.marks) {
    const g = new THREE.Group(); scene.add(g);
    const green = 0x2f8f4a, red = 0xc4302b, yel = 0xe8c21a, blk = 0x1a1a1a;
    if (m.k === 'stbd') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.4, 12), M(green)); b.position.y = 0.4; g.add(b); const c = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 12), M(green)); c.position.y = 2.1; g.add(c); }
    else if (m.k === 'port') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.4, 12), M(red)); b.position.y = 0.4; g.add(b); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.9, 12), M(red)); c.position.y = 2.0; g.add(c); }
    else { const b = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 1.4, 12), M(yel)); b.position.y = 0.4; g.add(b); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 3.2, 10), M(blk)); p.position.y = 2.5; g.add(p); const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 10), M(yel)); p2.position.y = 3.3; g.add(p2);
      for (const yy of [4.7, 5.5]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 10), M(blk)); c.position.y = yy; c.rotation.x = Math.PI; g.add(c); } }
    // each light's character as the chart gives it, each on its own phase (lights are not synchronised)
    const lt = m.lt, ph = hash(m.p[0] | 0, m.p[1] | 0) * 20;
    const f = /^Fl\(2\)/.test(lt) ? FLASH.fln(2, 5, ph) : /^Fl\(3\) G/.test(lt) ? FLASH.fln(3, 15, ph) : /^Fl\(3\) R/.test(lt) ? FLASH.fln(3, 10, ph) : /^Fl G 5/.test(lt) ? FLASH.fl(5, ph) : /^Fl R 2.5/.test(lt) ? FLASH.fl(2.5, ph) : /^Q G/.test(lt) ? FLASH.q(ph) : FLASH.south(ph);
    const n = navLight(g, 0, 4.2, 0, m.k === 'port' ? 0xff3b30 : m.k === 'stbd' ? 0x3dff6a : 0xffffff, 'all', null, 0.024, f); n.day = true;
    grp.push({ g, x: m.p[0], y: m.p[1], m });
  }
}
const MARKS = { list: [] };
function updateMarks() {
  for (const k of MARKS.list) {
    const c = currentAt(k.x, k.y), U = Math.hypot(c.x, c.y), a = 0.18 * U, sw = 0.05 * U * Math.sin(S.t * 2 * Math.PI * 0.1 * U + k.x);
    const dx = U > 0.01 ? c.x / U : 0, dy = U > 0.01 ? c.y / U : 0;
    k.g.position.set(k.x, S.tide + seaH(k.x, k.y, S.t) * 0.8 - 0.3 - 0.12 * U, -k.y);
    // lean downstream (about x for the north component, about z for the east) plus a swing across
    k.g.rotation.set(-dy * a + dx * sw, 0, -dx * a - dy * sw + Math.sin(S.t * 1.1 + k.x) * 0.04 * (0.3 + S.wx.wave));
    k.U = U; k.c = c;
  }
}
// ---------- the stream made visible: froth peeling off the buoys and the pier head, carried away downstream ----------
const FLOWF_N = 1600;
const FLOWF = (() => {
  const F = makeFlecks(FLOWF_N, [0.88, 0.86, 0.79]);
  return Object.assign(F, { vel: new Float32Array(FLOWF_N * 2), cur: new Float32Array(FLOWF_N * 2), life: new Float32Array(FLOWF_N), max: new Float32Array(FLOWF_N), br: new Float32Array(FLOWF_N), i: 0, n: 0, acc: 0, facc: 0 });
})();
function flowSpawn(x, y, vx, vy, life, br) {
  const F = FLOWF, i = F.i; F.i = (F.i + 1) % FLOWF_N;
  const c = currentAt(x, y); F.pos[i * 3] = x; F.pos[i * 3 + 2] = -y; F.vel[i * 2] = vx; F.vel[i * 2 + 1] = vy; F.cur[i * 2] = c.x; F.cur[i * 2 + 1] = c.y;
  F.life[i] = F.max[i] = life; F.br[i] = br;
}
const FLOW_OBS = () => MARKS.list.map(k => ({ x: k.x, y: k.y, R: 1.0, c: k.c || { x: 0, y: 0 } })).concat([{ x: PD.lights[1].p[0], y: PD.lights[1].p[1], R: 5.5, c: currentAt(PD.lights[1].p[0], PD.lights[1].p[1]) }]);
function updateFlowFoam(dt) {
  const F = FLOWF, cx = camera.position.x, cy = -camera.position.z;
  // off the obstacles near the camera: froth from the upstream face, pulled round and away downstream
  for (const o of FLOW_OBS()) {
    if (Math.hypot(o.x - cx, o.y - cy) > 700) continue;
    const U = Math.hypot(o.c.x, o.c.y); if (U < 0.12) continue;
    const ux = o.c.x / U, uy = o.c.y / U, n = U * U * 6 * dt * (o.R > 2 ? 2.5 : 1);
    o.acc = (o.acc || 0) + n; let k = 0;
    while (Math.random() < n && k++ < 6) {
      const side = Math.random() * 2 - 1, px = o.x - ux * o.R * 0.9 + uy * side * o.R, py = o.y - uy * o.R * 0.9 - ux * side * o.R;
      flowSpawn(px, py, uy * side * U * 0.6, -ux * side * U * 0.6, 7 + Math.random() * 9, 0.9);
    }
  }
  const t = S.t, refresh = (Math.floor(t * 10) % 8);
  for (let i = 0; i < FLOWF_N; i++) {
    if (F.life[i] <= 0) { if (F.sa[i * 3 + 1] !== 0) F.sa[i * 3 + 1] = 0; continue; }
    F.life[i] -= dt;
    const x = F.pos[i * 3], y = -F.pos[i * 3 + 2];
    if (i % 8 === refresh) { const c = currentAt(x, y); F.cur[i * 2] = c.x; F.cur[i * 2 + 1] = c.y; }
    const damp = Math.max(0, 1 - 0.5 * dt); F.vel[i * 2] *= damp; F.vel[i * 2 + 1] *= damp;
    const nx = x + (F.cur[i * 2] + F.vel[i * 2]) * dt, ny = y + (F.cur[i * 2 + 1] + F.vel[i * 2 + 1]) * dt;
    if (heightAt(nx, ny) > S.tide - 0.05 && (i % 4 === 0)) { F.life[i] = Math.min(F.life[i], 1.5); }   // stranded on the mud
    F.pos[i * 3] = nx; F.pos[i * 3 + 2] = -ny; F.pos[i * 3 + 1] = S.tide + 0.05;
    const f = clamp(F.life[i] / F.max[i], 0, 1) * F.br[i], e = smooth(0, 0.15, F.max[i] - F.life[i]);
    F.sa[i * 3] = 0.55 * (1 + 0.4 * (1 - f)); F.sa[i * 3 + 1] = 0.85 * f * e; F.sa[i * 3 + 2] = 1;
  }
  F.g.attributes.position.needsUpdate = true; F.g.attributes.aSA.needsUpdate = true;
}
// the stream for the water's shader: its strength now, the flow pattern's phase, the wind, and the obstacles nearest the camera
function updateWaterFlow(ox, oz) {
  const W = WATER_FLOW, t = S.t, base = streamBase(S.ms);
  W.uBase.value = base; W.uFPh.value.set(((t / FLOW_CYCLE) % 1 + 1) % 1, ((t / FLOW_CYCLE + 0.5) % 1 + 1) % 1);
  const to = (S.wind.from + 180) * DEG; W.uWindD.value.set(Math.sin(to), -Math.cos(to));
  const cx = camera.position.x, cy = -camera.position.z, L = FLOW_OBS().map(o => Object.assign(o, { d: Math.hypot(o.x - cx, o.y - cy) })).sort((a, b) => a.d - b.d);
  for (let i = 0; i < N_OBS; i++) {
    const o = L[i];
    if (!o || o.d > 1500) { W.uObs.value[i].set(0, 0, 0, 0); continue; }
    const U = Math.hypot(o.c.x, o.c.y);
    W.uObs.value[i].set(o.x - ox, -o.y - oz, o.R, 1); W.uObsV.value[i].set(o.c.x, -o.c.y, wrapA(U * t * 0.45, 256), 0);
  }
}
