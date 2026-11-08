
// ---------- water ----------
// The Severn here is brown with silt: no seabed shows through, only a paler band where it shoals. The swell is short and
// small this far up; the wind's chop is the sea that matters. Shaded relative to a point near the camera (uOrg) so a
// reduced-precision GPU never works with kilometre-sized coordinates.
const WAVES = [{ dx: 0.8, dz: 0.6, l: 34, a: 0.35 }, { dx: -0.3, dz: 0.954, l: 21, a: 0.2 }, { dx: 0.954, dz: -0.3, l: 48, a: 0.25 }].map(w => Object.assign(w, { k: 2 * Math.PI / w.l, w: Math.sqrt(9.81 * 2 * Math.PI / w.l) }));
const WAVE_GLSL = 'uniform float uTime; uniform float uAmp;\nfloat waveH(vec2 p){ float h = 0.0;\n' +
  WAVES.map(w => `h += ${w.a.toFixed(3)}*sin(${w.k.toFixed(5)}*dot(p, vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})) - ${w.w.toFixed(4)}*uTime);`).join('\n') + '\nreturn h*uAmp; }\n';
const SHADE_WAVES = WAVES.map(w => ({ dx: w.dx, dz: w.dz, l: w.l, a: w.a * 0.35 })).concat(
  [[11, 0.07, 38], [14, 0.09, -27], [17, 0.1, 55], [23, 0.12, -48], [29, 0.1, 14], [37, 0.13, -8], [9, 0.05, 71], [19, 0.08, -66]].map(([l, a, deg]) => {
    const b = Math.atan2(0.6, 0.8) + deg * Math.PI / 180; return { dx: Math.cos(b), dz: Math.sin(b), l, a };
  })).map((w, i) => Object.assign(w, { k: 2 * Math.PI / w.l, w: Math.sqrt(9.81 * 2 * Math.PI / w.l), ph: (i * 2.39996) % 6.283 }));
const WAVE_GRAD_GLSL = `uniform float uWPh[${SHADE_WAVES.length}];\nvec2 waveGrad(vec2 l, float fp){ vec2 g = vec2(0.0);\n` +
  SHADE_WAVES.map((w, i) => `g += ${(w.a * w.k).toFixed(4)}*cos(${w.k.toFixed(5)}*dot(l, vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})) + uWPh[${i}])*vec2(${w.dx.toFixed(3)}, ${w.dz.toFixed(3)})*(1.0 - smoothstep(0.6, 1.6, ${w.k.toFixed(5)}*fp));`).join('\n') + '\nreturn g; }\n';
const TAU = Math.PI * 2, wrapA = (a, m = TAU) => ((a % m) + m) % m;
const WATER_CHOP = { d: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, p: { value: new Float32Array(6) }, wh: { value: new THREE.Vector4(1, 9, 1, 0) }, q: { value: new THREE.Vector4() }, m: { value: 0 } };
const WATER_U = { uOrg: { value: new THREE.Vector2() }, uWPh: { value: new Float32Array(SHADE_WAVES.length) }, uRipA: { value: new THREE.Vector2() }, uRipC: { value: new THREE.Vector3() },
  uChopQ: { value: new THREE.Vector2() }, uChopR: { value: new THREE.Vector2() }, uCamL: { value: new THREE.Vector3() }, uGridL: { value: new THREE.Vector4() }, uFineL: { value: new THREE.Vector4() }, uMaskL: { value: new THREE.Vector4() }, uMaskS: { value: 1e5 }, uPh: { value: 0 } };
// The stream as the water draws it: the same model as currentAt (the tide's rate of rise scaled by depth, the sheltered
// harbour and shore, the Pool's eddy on the flood), worked out per pixel from the seabed texture so the surface's silt,
// boils and scum lines slide past at the stream's own speed (two-phase flow-map advection). Obstacles in the stream (the
// buoys, the pier head) each get a trail of broken water, a pillow heaped against their upstream face and a V of waves.
const N_OBS = 8;
const WATER_FLOW = { uBase: { value: 0 }, uFlood: { value: new THREE.Vector2(Math.sin(68 * DEG), -Math.cos(68 * DEG)) }, uFPh: { value: new THREE.Vector2() },
  uObs: { value: Array.from({ length: N_OBS }, () => new THREE.Vector4()) }, uObsV: { value: Array.from({ length: N_OBS }, () => new THREE.Vector4()) }, uWindD: { value: new THREE.Vector2(0, 1) } };
const FLOW_CYCLE = 7;
function waterOrigin(ox, oz, t) {
  const U = WATER_U; U.uOrg.value.set(ox, oz);
  SHADE_WAVES.forEach((w, i) => { U.uWPh.value[i] = wrapA(w.k * (w.dx * ox + w.dz * oz) - w.w * t + w.ph); });
  U.uRipA.value.set(wrapA(0.071 * oz + 0.3 * t), wrapA(0.063 * ox - 0.27 * t));
  U.uRipC.value.set(wrapA(0.83 * (0.8 * ox + 0.6 * oz) + 2.4 * t), wrapA(1.37 * (-0.53 * ox + 0.85 * oz) + 3.1 * t), wrapA(2.21 * (0.96 * ox - 0.28 * oz) + 4.1 * t));
  U.uChopQ.value.set(wrapA(0.55 * ox + 0.33 * t, 256), wrapA(0.55 * oz + 0.21 * t, 256)); U.uChopR.value.set(wrapA(1.6 * ox - 0.47 * t, 256), wrapA(1.6 * oz + 0.39 * t, 256));
  if (S && S.wind) {
    const C = S.chop || (S.chop = chopSea()), W = WATER_CHOP, kn = S.wx.wind, Us = kn * KN;
    C.forEach((c, i) => { W.d.value[i].set(c.dx, -c.dy, c.k, c.a); W.p.value[i] = wrapA(c.k * (c.dx * ox - c.dy * oz) - c.w * t + c.ph); });
    const cov = Math.min(0.2, 2 * 3.84e-6 * Math.pow(Us, 3.41)) * smooth(6, 9, kn), tx = Math.sin(C.to), tz = -Math.cos(C.to), c0 = Math.sqrt(9.81 / C[1].k);
    W.wh.value.set(Math.max(C.sig, 1e-3), 1.05, 1.02 - 0.72 * Math.pow(smooth(6, 30, kn), 0.6), 0); W.m.value = cov;
    W.q.value.set(wrapA(0.15 * (ox - tx * c0 * t), 256), wrapA(0.15 * (oz - tz * c0 * t), 256), wrapA(0.37 * (ox - tx * 0.4 * c0 * t), 256), wrapA(0.37 * (oz - tz * 0.4 * c0 * t), 256));
  }
  U.uCamL.value.set(camera.position.x - ox, camera.position.y, camera.position.z - oz);
  U.uGridL.value.set(GRID.x0 - ox, -GRID.y1 - oz, GRID.x1 - GRID.x0, GRID.y1 - GRID.y0);
  U.uFineL.value.set(FINE.x0 - ox, -FINE.y1 - oz, FINE.x1 - FINE.x0, FINE.y1 - FINE.y0);
  U.uMaskL.value.set(MASK.x0 - ox, -MASK.y1 - oz, MASK.x1 - MASK.x0, MASK.y1 - MASK.y0);
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
function waterMaterial(amp, basin) {
  return new THREE.ShaderMaterial({
    extensions: { derivatives: true },
    defines: basin ? { BASIN: '' } : {},
    uniforms: Object.assign({
      uTime: { value: 0 }, uAmp: { value: amp }, uTide: { value: 7 }, uGrid: { value: GRID_TEX }, uFine: { value: FINE_TEX }, uMask: { value: MASK.tex },
      uDeep: { value: basin ? new THREE.Color(0x2b3a2d) : new THREE.Color(0x6e5b3c) }, uShallow: { value: basin ? new THREE.Color(0x3c4a3a) : new THREE.Color(0x8c7653) }, uSkyTop: { value: SKY_TOP },
      uFog: { value: SKY }, uSun: { value: SUN_DIR }, uFogNear: { value: FOG_NEAR }, uFogFar: { value: FOG_FAR }, uRip: { value: 0.1 }, uSpec: { value: WATER_SPEC }, uNoise: { value: NOISE_TEX },
      uChopD: WATER_CHOP.d, uChopP: WATER_CHOP.p, uWh: WATER_CHOP.wh, uWhQ: WATER_CHOP.q, uWhM: WATER_CHOP.m,
    }, WATER_U, WATER_FLOW),
    vertexShader: WAVE_GLSL + `uniform vec2 uOrg; varying vec3 vL; varying float vH;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0);
        float d = distance(wp.xz, cameraPosition.xz);
        float wh = waveH(wp.xz)*(1.0 - smoothstep(350.0, 760.0, d));
        #ifdef BASIN
        wh = 0.0;
        #endif
        wp.y += wh; vH = wh / max(uAmp, 0.01);
        vL = vec3(wp.x - uOrg.x, wp.y, wp.z - uOrg.y); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyTop; uniform vec3 uFog; uniform vec3 uSun;
      uniform float uFogNear; uniform float uFogFar; uniform float uTime; uniform float uAmp; uniform float uTide; uniform float uRip; uniform vec3 uSpec;
      uniform sampler2D uGrid; uniform sampler2D uFine; uniform sampler2D uMask; uniform vec4 uGridL; uniform vec4 uFineL; uniform vec4 uMaskL;
      uniform vec2 uRipA; uniform vec3 uRipC; uniform vec2 uChopQ; uniform vec2 uChopR; uniform vec3 uCamL; uniform float uPh; uniform float uMaskS;
      uniform vec4 uChopD[6]; uniform float uChopP[6]; uniform vec4 uWh; uniform vec4 uWhQ; uniform float uWhM;
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
      float chopE(vec2 l, float fp, out vec2 g){
        float h = 0.0; g = vec2(0.0);
        for (int i = 0; i < 6; i++) { vec4 c = uChopD[i]; float ph = c.z * dot(c.xy, l) + uChopP[i]; h += c.w * sin(ph); g += c.w * c.z * cos(ph) * c.xy * (1.0 - smoothstep(0.6, 1.6, c.z * fp)); }
        return h;
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
        vec2 wg = vec2(0.0); float ce = 0.0;
        #ifndef BASIN
        if (dist < 3000.0) { ce = chopE(l, fp, wg) / uWh.x; cg += wg * (1.0 - smoothstep(600.0, 3000.0, dist)); }
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
        col = mix(col, sky*vec3(0.86, 0.84, 0.8), clamp(fres*0.75, 0.0, 0.55));   // silty water: the body colour holds even at a glance
        #endif
        vec3 H = normalize(V + uSun); col += uSpec*pow(max(dot(n, H), 0.0), 140.0);
        #ifndef BASIN
        float crest = smoothstep(0.6, 1.0, vH)*smoothstep(0.22, 0.6, uAmp);
        float edge = (1.0 - smoothstep(0.05, 0.5 + uAmp, depth)) * (0.4 + 0.3*sin(uPh - depth*6.0 + l.x*0.03 - l.y*0.02));
        vec3 scum = vec3(0.80, 0.74, 0.60), froth = vec3(0.87, 0.83, 0.73);
        col = mix(col, scum, clamp(crest*0.5 + edge*0.5, 0.0, 0.7));
        col = mix(col, scum, clamp(streak * 0.38 + race * 0.12 * smoothstep(0.55, 0.8, silt), 0.0, 0.55));
        col = mix(col, froth, clamp(obsFoam, 0.0, 0.9));
        if (uWhM > 0.0 && dist < 3000.0) {
          float br = wn(l * 0.15 + uWhQ.xy) * 0.6 + wn(l * 0.37 + uWhQ.zw) * 0.4, m = smoothstep(uWh.z, uWh.z + 0.08, br);
          float lace = wn(l * 1.9) * 0.55 + wn(l * 4.7) * 0.45;
          float cap = clamp(smoothstep(uWh.y + 0.35 - race * 0.5, uWh.y + 0.85 - race * 0.5, ce) * m * smoothstep(0.28, 0.5, lace), 0.0, 1.0);
          col = mix(col, froth, clamp(mix(uWhM * 1.4, cap, 1.0 - smoothstep(0.25, 1.2, fp)), 0.0, 0.85));
        }
        #endif
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
}
const WATER_HALF = 800, WATER_CELL = 12.5;
const waterNearMat = waterMaterial(1, false), waterFarMat = waterMaterial(0, false), basinWaterMat = waterMaterial(0, true);
const waterNear = new THREE.Mesh(new THREE.PlaneGeometry(WATER_HALF * 2, WATER_HALF * 2, 128, 128).rotateX(-Math.PI / 2), waterNearMat); waterNear.frustumCulled = false;
const waterFar = (() => {
  const a = WATER_HALF, b = 40000, v = [-b, -b, b, -b, b, b, -b, b, -a, -a, a, -a, a, a, -a, a], pos = [];
  for (let i = 0; i < 8; i++) pos.push(v[i * 2], 0, v[i * 2 + 1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4]);
  const m = new THREE.Mesh(g, waterFarMat); m.material.side = THREE.DoubleSide; m.frustumCulled = false; return m;
})();
scene.add(waterNear, waterFar);

// ---------- foam ----------
const FOAM_N = 1400;
const foam = (() => {
  const pos = new Float32Array(FOAM_N * 3), col = new Float32Array(FOAM_N * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const cv = document.createElement('canvas'); cv.width = cv.height = 32; const cx = cv.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, sizeAttenuation: true, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, col, g, vel: new Float32Array(FOAM_N * 2), life: new Float32Array(FOAM_N), max: new Float32Array(FOAM_N), i: 0 };
})();
const SEA_RGB = [0.45, 0.38, 0.26];
function spawnFoam(x, y, z, vx, vz, life) {
  const i = foam.i; foam.i = (foam.i + 1) % FOAM_N;
  foam.pos[i * 3] = x; foam.pos[i * 3 + 1] = y; foam.pos[i * 3 + 2] = z; foam.vel[i * 2] = vx; foam.vel[i * 2 + 1] = vz; foam.life[i] = foam.max[i] = life;
}
function updateFoam(dt) {
  for (let i = 0; i < FOAM_N; i++) {
    if (foam.life[i] <= 0) { foam.pos[i * 3 + 1] = -50; continue; }
    foam.life[i] -= dt; foam.pos[i * 3] += foam.vel[i * 2] * dt; foam.pos[i * 3 + 2] += foam.vel[i * 2 + 1] * dt;
    const damp = Math.max(0, 1 - 0.7 * dt); foam.vel[i * 2] *= damp; foam.vel[i * 2 + 1] *= damp;
    const f = clamp(foam.life[i] / foam.max[i], 0, 1);
    foam.col[i * 3] = lerp(SEA_RGB[0], 0.88, f); foam.col[i * 3 + 1] = lerp(SEA_RGB[1], 0.84, f); foam.col[i * 3 + 2] = lerp(SEA_RGB[2], 0.74, f);
  }
  foam.g.attributes.position.needsUpdate = true; foam.g.attributes.color.needsUpdate = true;
}
// ---------- wake ----------
// White water left astern, laid along the track actually run: each stretch born as strong as her speed and prop wash make
// it, then spreading and fading with age.
const WAKE_N = 520;
function makeWake() {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(WAKE_N * 6), aw = new Float32Array(WAKE_N * 6);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aw', new THREE.BufferAttribute(aw, 3));
  const idx = new Uint16Array((WAKE_N - 1) * 6); g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), { uNoise: { value: NOISE_TEX } }),
    vertexShader: 'attribute vec3 aw; varying vec3 vAw;\n#include <fog_pars_vertex>\nvoid main(){ vAw = aw; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: `varying vec3 vAw;
      #include <fog_pars_fragment>
      ` + NOISE_GLSL + `
      float wnz(vec2 p){ return vnoise(p); }
      void main(){
        float lace = wnz(vec2(vAw.x * 4.0, vAw.y * 0.035)) * 0.5 + wnz(vec2(vAw.x * 13.0 + 3.0, vAw.y * 0.16)) * 0.3 + wnz(vec2(vAw.x * 31.0, vAw.y * 0.55)) * 0.2;
        float ax = abs(vAw.x) + (wnz(vec2(sign(vAw.x) * 5.0, vAw.y * 0.3)) - 0.5) * 0.35, z = vAw.z;
        float profile = (1.0 - smoothstep(0.55, 1.0, ax)) * (0.55 + 0.45 * smoothstep(0.3, 0.7, ax));
        float th = 1.0 - min(1.0, z * 1.15);
        float a = smoothstep(th - 0.08, th + 0.14, lace) * profile * (0.35 + 0.45 * z);
        gl_FragColor = vec4(0.87, 0.83, 0.73, clamp(a, 0.0, 0.8));
        #include <tonemapping_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  return { g, pos, aw, idx, pts: [], mesh };
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
  if (I > 0.02 && gap > 1.5) { P.push({ x, y, t, I, tau, s: last ? last.s + Math.min(gap, 80) : 0, lv: levelAt(x, y) }); if (P.length > WAKE_N - 1) P.shift(); }
  while (P.length && P[0].I * Math.exp(-(t - P[0].t) / P[0].tau) < 0.03) P.shift();
  const pts = P.slice(); if (I > 0.02 && P.length && gap > 0.2) pts.push({ x, y, t, I, tau, s: P[P.length - 1].s + gap, lv: levelAt(x, y) });
  const n = pts.length, pos = WAKE.pos, aw = WAKE.aw, idx = WAKE.idx; let q = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const age = t - p.t, str = p.I * Math.exp(-age / p.tau), hw = hw0 * (0.75 + 0.25 * p.I) + grow * age, lv = levelAt(p.x, p.y);
    for (const sd of [-1, 1]) {
      const wx = p.x - ty * hw * sd, wy = p.y + tx * hw * sd, k = (i * 2 + (sd > 0 ? 1 : 0)) * 3;
      pos[k] = wx; pos[k + 1] = lv + waveH(wx, -wy, t) * seaAt(wx, wy) + 0.06; pos[k + 2] = -wy; aw[k] = sd; aw[k + 1] = p.s; aw[k + 2] = str;
    }
    if (i > 0 && Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) < 40) { const v = (i - 1) * 2; idx[q++] = v; idx[q++] = v + 2; idx[q++] = v + 1; idx[q++] = v + 1; idx[q++] = v + 2; idx[q++] = v + 3; }
  }
  WAKE.g.setDrawRange(0, q); WAKE.g.attributes.position.needsUpdate = true; WAKE.g.attributes.aw.needsUpdate = true; WAKE.g.index.needsUpdate = true;
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
    k.g.position.set(k.x, S.tide + waveH(k.x, -k.y, S.t) * 0.8 - 0.3 - 0.12 * U, -k.y);
    // lean downstream (about x for the north component, about z for the east) plus a swing across
    k.g.rotation.set(-dy * a + dx * sw, 0, -dx * a - dy * sw + Math.sin(S.t * 1.1 + k.x) * 0.04 * (0.3 + S.wx.wave));
    k.U = U; k.c = c;
  }
}
// ---------- the stream made visible: froth peeling off the buoys and the pier head, carried away downstream ----------
const FLOWF_N = 1600;
const FLOWF = (() => {
  const pos = new Float32Array(FLOWF_N * 3), col = new Float32Array(FLOWF_N * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, map: foam.pts.material.map, transparent: true, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  for (let i = 0; i < FLOWF_N; i++) pos[i * 3 + 1] = -50;
  return { pts, pos, col, g, vel: new Float32Array(FLOWF_N * 2), cur: new Float32Array(FLOWF_N * 2), life: new Float32Array(FLOWF_N), max: new Float32Array(FLOWF_N), br: new Float32Array(FLOWF_N), i: 0, n: 0, acc: 0, facc: 0 };
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
    if (F.life[i] <= 0) { F.pos[i * 3 + 1] = -50; continue; }
    F.life[i] -= dt;
    const x = F.pos[i * 3], y = -F.pos[i * 3 + 2];
    if (i % 8 === refresh) { const c = currentAt(x, y); F.cur[i * 2] = c.x; F.cur[i * 2 + 1] = c.y; }
    const damp = Math.max(0, 1 - 0.5 * dt); F.vel[i * 2] *= damp; F.vel[i * 2 + 1] *= damp;
    const nx = x + (F.cur[i * 2] + F.vel[i * 2]) * dt, ny = y + (F.cur[i * 2 + 1] + F.vel[i * 2 + 1]) * dt;
    if (heightAt(nx, ny) > S.tide - 0.05 && (i % 4 === 0)) { F.life[i] = Math.min(F.life[i], 1.5); }   // stranded on the mud
    F.pos[i * 3] = nx; F.pos[i * 3 + 2] = -ny; F.pos[i * 3 + 1] = S.tide + waveH(nx, -ny, t) + 0.05;
    const f = clamp(F.life[i] / F.max[i], 0, 1) * F.br[i], e = smooth(0, 0.15, F.max[i] - F.life[i]);
    F.col[i * 3] = lerp(SEA_RGB[0], 0.86, f * e); F.col[i * 3 + 1] = lerp(SEA_RGB[1], 0.81, f * e); F.col[i * 3 + 2] = lerp(SEA_RGB[2], 0.70, f * e);
  }
  F.g.attributes.position.needsUpdate = true; F.g.attributes.color.needsUpdate = true;
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
