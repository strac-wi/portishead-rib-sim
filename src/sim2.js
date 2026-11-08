
// ================= THREE SETUP =================
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// drawn at the screen's own sharpness up to 2x, but no more than about two and a half million pixels
const PX_BUDGET = 2.5e6;
const basePR = () => Math.min(window.devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(PX_BUDGET / Math.max(1, innerWidth * innerHeight))));
renderer.setPixelRatio(basePR());
renderer.shadowMap.enabled = true;
renderer.localClippingEnabled = true;   // the RIB's outer skin is cut at the waterline in the helm view
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.LinearToneMapping; renderer.toneMappingExposure = 1;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xb7c4cc), SKY_TOP = new THREE.Color(0x7393ab);
const FOG_NEAR = 900, FOG_FAR = 14000;
scene.background = SKY; scene.fog = new THREE.Fog(SKY, FOG_NEAR, 11000);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 42000);
const hemi = new THREE.HemisphereLight(0xd6e2ea, 0x3e4a35, 0.72); hemi.layers.enableAll(); scene.add(hemi);
const SUN_DIR = new THREE.Vector3(-3000, 4200, 2600).normalize();
const sun = new THREE.DirectionalLight(0xffedd0, 0.95);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 700 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.layers.enableAll();
scene.add(sun, sun.target);
const V3 = THREE.Vector3;

// ---------- day, dusk and night ----------
const LIGHTS = {
  day:   { exp: 1, hemi: [0xd6e2ea, 0x3e4a35, 0.72], sun: [0xffedd0, 0.95], dir: [-3000, 4200, 2600], hor: 0xb7c4cc, top: 0x7393ab, glow: [1, 0.88, 0.68], cloud: [1, 1, 1], spec: [0.7, 0.66, 0.6] },
  dusk:  { exp: 0.62, hemi: [0x9aa0c0, 0x2e2a28, 0.75], sun: [0xff8a50, 0.45], dir: [-0.93, 0.03, 0.34], hor: 0xe0a27a, top: 0x41587e, glow: [1.6, 0.75, 0.35], cloud: [0.95, 0.66, 0.6], spec: [1.2, 0.6, 0.3] },
  night: { exp: 0.42, hemi: [0x4a5c80, 0x0b0d10, 0.75], sun: [0xb4c4e6, 0.7], dir: [0.45, 0.55, 0.62], hor: 0x2a3a58, top: 0x0b1428, glow: [2.4, 2.5, 2.7], cloud: [0.22, 0.25, 0.32], spec: [1.4, 1.5, 1.7] },
};
const NAV = { list: [], on: false, tex: (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})() };
const WATER_SPEC = new THREE.Color(0.7, 0.66, 0.6);
const OPTS = { light: 'day' };
function setLight(mode) {
  const L = LIGHTS[mode] || LIGHTS.day; OPTS.light = mode;
  renderer.toneMappingExposure = L.exp;
  hemi.color.setHex(L.hemi[0]); hemi.groundColor.setHex(L.hemi[1]); hemi.intensity = L.hemi[2];
  sun.color.setHex(L.sun[0]); sun.intensity = L.sun[1]; SUN_DIR.set(...L.dir).normalize();
  SKY.setHex(L.hor); SKY_TOP.setHex(L.top); scene.fog.color.setHex(L.hor);
  const su = scene.userData.sky.material.uniforms; su.uGlow.value.setRGB(...L.glow); su.uCloudCol.value.setRGB(...L.cloud);
  WATER_SPEC.setRGB(...L.spec);
  NAV.on = mode !== 'day';
  if (!NAV.on) for (const n of NAV.list) n.s.visible = n.always === true;
  if (NAV.lamps) NAV.lamps.forEach(m => { m.visible = NAV.on; });
}
// kind: 'all' round, 'side' (112.5° each side, red or green by the side it is on), 'stern'. who: 'rib' or null for a
// fixed or floating mark. flash(t) gives on or off. always: lit by day too (the lock's signals)
function navLight(parent, x, y, z, color, kind, who, size = 0.016, flash = null) {
  const m = new THREE.SpriteMaterial({ map: NAV.tex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false });
  const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size); s.visible = false; s.renderOrder = 3; parent.add(s);
  const n = { s, kind, who, flash, size }; NAV.list.push(n); return n;
}
// light characters
const FLASH = {
  fl: (per, ph = 0) => (t) => ((t + ph) % per) < 0.5,
  fln: (n, per, ph = 0) => (t) => { const q = (t + ph) % per; return q < n * 1.0 && (q % 1.0) < 0.45; },
  q: (ph = 0) => (t) => ((t + ph) % 1.0) < 0.5,
  qn: (n, per, ph = 0) => (t) => { const q = (t + ph) % per; return q < n * 1.0 && (q % 1.0) < 0.5; },
  iso: (per, ph = 0) => (t) => ((t + ph) % per) < per / 2,
  south: (ph = 0) => (t) => { const q = (t + ph) % 10; return q < 6 * 0.5 ? (q % 0.5) < 0.25 : q < 3.3 ? false : q < 5.3; },
};
const NV_P = new V3(), NV_C = new V3();
function updateNav() {
  camera.getWorldPosition(NV_C);
  for (const n of NAV.list) {
    // by day only the lock's signals show, and a lit buoy's flash close to (within 450 m), smaller
    let dayLit = false;
    if (!NAV.on && !n.always) { if (!n.day || n.s.getWorldPosition(NV_P).distanceTo(NV_C) > 450) { n.s.visible = false; continue; } dayLit = true; }
    n.s.scale.setScalar(dayLit ? n.size * 0.6 : n.size);
    let on = true, col = null;
    if (n.who === 'rib' && !(RIB.root && RIB.root.visible)) on = false;
    if (on && n.cond) on = n.cond();
    if (on && n.flash) on = n.flash(S ? S.t : 0);
    if (on && n.who === 'rib') {
      const hd = RB.psi, hx = Math.sin(hd), hy = Math.cos(hd);
      n.s.getWorldPosition(NV_P);
      const px = NV_P.x, py = -NV_P.z, vx = NV_C.x - px, vy = -NV_C.z - py, rel = Math.atan2(vx * hy - vy * hx, vx * hx + vy * hy) / DEG;
      const lat = (px - RB.x) * hy - (py - RB.y) * hx;
      if (n.kind === 'stern') on = Math.abs(rel) >= 112.5;
      else if (n.kind === 'side') { const stbd = lat > 0; on = stbd ? rel > -1 && rel <= 112.5 : rel < 1 && rel >= -112.5; col = stbd ? 0x3dff6a : 0xff3b30; }
    }
    n.s.visible = on;
    if (on && col !== null) n.s.material.color.setHex(col);
  }
}
// tileable fbm for the cloud deck
function cloudTex() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
  const lat = (i, j, p) => hash(((i % p) + p) % p + 131, ((j % p) + p) % p + 71);
  const vn = (x, y, p) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy); return lerp(lerp(lat(i, j, p), lat(i + 1, j, p), ux), lerp(lat(i, j + 1, p), lat(i + 1, j + 1, p), ux), uy); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, a = 0.5, f = 4; for (let o = 0; o < 5; o++) { v += a * vn(x / N * f, y / N * f, f); a *= 0.5; f *= 2; }
    const k = (y * N + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(clamp(v * 1.15 - 0.05, 0, 1) * 255); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
{
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, hor: { value: SKY }, sunDir: { value: SUN_DIR }, uCloud: { value: cloudTex() }, uOff: { value: new THREE.Vector2() }, uCov: { value: 0.52 }, uGlow: { value: new THREE.Color(1, 0.88, 0.68) }, uCloudCol: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform sampler2D uCloud; uniform vec2 uOff; uniform float uCov; uniform vec3 uGlow; uniform vec3 uCloudCol; varying vec3 vD;
      void main(){ vec3 d = normalize(vD);
        vec3 c = mix(hor, top, smoothstep(0.0, 0.42, d.y));
        float s = max(dot(d, sunDir), 0.0);
        c += uGlow * (pow(s, 600.0) * 1.4 + pow(s, 14.0) * 0.16);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.05) * 0.16 + uOff;
          float n = texture2D(uCloud, uv).r, n2 = texture2D(uCloud, uv * 2.7 + 0.31).r;
          float dens = smoothstep(uCov, uCov + 0.22, n * 0.8 + n2 * 0.2) * smoothstep(0.0, 0.16, d.y);
          float lit = clamp(0.55 + (n - texture2D(uCloud, uv + sunDir.xz * 0.012).r) * 6.0, 0.0, 1.0);
          vec3 cc = mix(vec3(0.70, 0.74, 0.79), vec3(1.05, 1.03, 1.0), lit) * uCloudCol + uGlow * pow(s, 8.0) * 0.25;
          c = mix(c, cc, dens * 0.92);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(36000, 32, 16), m); sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky); scene.userData.sky = sky;
}
// random values for the value noise in the water and wake shaders, read from a texture rather than hashed in the shader
const NOISE_TEX = (() => {
  const N = 256, rnd = mulberry(4242), d = new Uint8Array(N * N * 4);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(rnd() * 256);
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const NOISE_GLSL = `uniform sampler2D uNoise;
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f); return texture2D(uNoise, (i + f + 0.5) / 256.0).r; }`;
function mergeGeos(list) {
  const parts = list.map(g => g.index ? g.toNonIndexed() : g);
  const n = parts.reduce((t, g) => t + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}
const M = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
// a builder for big merged meshes with per-vertex colour: triangles in world space (x east, y up, z = -north)
function TriBuf() { this.p = []; this.c = []; }
TriBuf.prototype.tri = function (a, b, c, col) { this.p.push(a[0], a[1], -a[2], b[0], b[1], -b[2], c[0], c[1], -c[2]); for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b); };
TriBuf.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
// a vertical wall between two map points from y0 to y1, facing the side given by normal n (2D, towards which it looks)
TriBuf.prototype.wall = function (ax, ay, bx, by, y0, y1, col, nx, ny) {
  const fx = by - ay, fy = -(bx - ax);   // right of a->b
  const flip = nx !== undefined && fx * nx + fy * ny < 0;
  const A = [ax, y0, ay], B = [bx, y0, by], C = [bx, y1, by], D = [ax, y1, ay];
  if (flip) this.quad(B, A, D, C, col); else this.quad(A, B, C, D, col);
};
TriBuf.prototype.mesh = function (mat) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); return m;
};
const col3 = (r, g, b) => ({ r, g, b });

// ---------- ground detail: roads, parks, woods and car parks from OpenStreetMap, painted as a multiply over the land ----------
const GTX = { x0: -1600, y0: -1000, x1: 1700, y1: 800, W: 4096, H: 2234 };
const GROUND = (() => {
  const q = b64bytes(PD.ground), dv = new DataView(q.buffer); let o = 0; const F = [];
  while (o < q.length) { const c = dv.getUint8(o), n = dv.getUint16(o + 1, true); o += 3; const P = []; for (let i = 0; i < n; i++) { P.push([dv.getInt16(o, true) / 2, dv.getInt16(o + 2, true) / 2]); o += 4; } F.push({ c, P }); }
  return F;
})();
function groundTexture() {
  const mobile = Math.min(innerWidth, innerHeight) < 700, W = mobile ? 2048 : GTX.W, H = Math.round(W * (GTX.y1 - GTX.y0) / (GTX.x1 - GTX.x0));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), sx = W / (GTX.x1 - GTX.x0), sy = H / (GTX.y1 - GTX.y0);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const path = (P) => { g.beginPath(); P.forEach(([x, y], i) => { const u = (x - GTX.x0) * sx, v = (GTX.y1 - y) * sy; i ? g.lineTo(u, v) : g.moveTo(u, v); }); };
  // the built-up land a little greyer than the fields, so gardens and parks read
  const fills = { 0: '#e2f0cf', 1: '#9fb98e', 2: '#fff3d6', 3: '#c9c6bf', 4: '#8fb0c8', 5: '#d4ecb6', 6: '#d8e2c4' };
  for (const k of [6, 0, 5, 1, 2, 3, 4]) for (const f of GROUND) if (f.c === k && f.P.length > 2) { path(f.P); g.fillStyle = fills[k]; g.fill(); }
  // roads: kerbs, then the tarmac
  const RW = { 10: 9, 11: 8, 12: 6, 13: 4, 14: 2.2 }, RC = { 10: '#8a8a88', 11: '#8f8f8d', 12: '#999896', 13: '#a3a29f', 14: '#c9c1ae' };
  g.lineCap = g.lineJoin = 'round';
  for (const k of [14, 13, 12, 11, 10]) for (const f of GROUND) if (f.c === k) { path(f.P); g.strokeStyle = k === 14 ? RC[k] : '#d5d3cf'; g.lineWidth = (RW[k] + (k === 14 ? 0 : 1.4)) * sx; g.stroke(); }
  for (const k of [13, 12, 11, 10]) for (const f of GROUND) if (f.c === k) { path(f.P); g.strokeStyle = RC[k]; g.lineWidth = RW[k] * sx; g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---------- terrain ----------
// Two meshes: 5 m cells over the town, the marina and Portishead Pool, 20 m over the rest of the charts. The marina basin
// and the pier are cut out and built as walls. Colour by height: the town's grass above the sea wall, shingle and rock at
// the point, the grey-brown Severn mud from the waterline up, the saltmarsh at the top of the flats towards Portbury.
const TERRAIN = { meshes: [] };
const INNER = { x0: -720, y0: -620, x1: 620, y1: 760, step: Math.min(innerWidth, innerHeight) < 700 ? 8 : 5 };
function groundCol(x, y, z, slope) {
  const n = fbm(x * 0.02, y * 0.02), n2 = vnoise(x * 0.12, y * 0.12);
  if (z >= 14.6) {
    const rock = smooth(0.55, 0.9, slope);
    const grass = col3(0.40 + 0.08 * n, 0.50 + 0.08 * n, 0.30 + 0.04 * n2);
    return col3(lerp(grass.r, 0.52, rock), lerp(grass.g, 0.49, rock), lerp(grass.b, 0.44, rock));
  }
  // the foreshore: rock at Battery Point and towards Woodhill, shingle along the front, mud elsewhere
  const point = (1 - smooth(-900, -650, x)) * smooth(-1350, -1150, x) * smooth(200, 330, y);
  const marsh = smooth(10.8, 12.4, z) * smooth(300, 600, x);
  let r = 0.43 + 0.05 * n, g = 0.39 + 0.04 * n, b = 0.32 + 0.03 * n;   // mud
  const wet = 1 - smooth(1, 9, z); r -= 0.07 * wet; g -= 0.06 * wet; b -= 0.04 * wet;
  if (point > 0) { r = lerp(r, 0.40 + 0.1 * n2, point * 0.8); g = lerp(g, 0.38 + 0.09 * n2, point * 0.8); b = lerp(b, 0.34 + 0.08 * n2, point * 0.8); }
  if (marsh > 0) { r = lerp(r, 0.40, marsh); g = lerp(g, 0.45, marsh); b = lerp(b, 0.27, marsh); }
  return col3(r, g, b);
}
function buildTerrainMesh(x0, y0, x1, y1, step, cut, mat, skip) {
  const nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1;
  const pos = new Float32Array(nx * ny * 3), colA = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), H = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, y = y0 + j * step, k = j * nx + i; let z = heightAt(x, y);
    if (inDock(x, y)) z = QUAY;   // the basin's own floor is drawn with its walls
    H[k] = z; pos[k * 3] = x; pos[k * 3 + 1] = z; pos[k * 3 + 2] = -y;
    uv[k * 2] = (x - GTX.x0) / (GTX.x1 - GTX.x0); uv[k * 2 + 1] = (y - GTX.y0) / (GTX.y1 - GTX.y0);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * step, y = y0 + j * step;
    const dzx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) / (2 * step), dzy = (H[Math.min(ny - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) / (2 * step);
    const c = groundCol(x, y, H[k], Math.hypot(dzx, dzy)); colA[k * 3] = c.r; colA[k * 3 + 1] = c.g; colA[k * 3 + 2] = c.b;
  }
  // a cell goes if any corner is in the cut (the basin, the pier): no ground overhangs their walls; the quay paving
  // drawn with the walls covers the gap
  const cutV = cut ? new Uint8Array(nx * ny) : null;
  if (cut) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) cutV[j * nx + i] = cut(x0 + i * step, y0 + j * step) ? 1 : 0;
  const idx = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1, cx = x0 + (i + 0.5) * step, cy = y0 + (j + 0.5) * step;
    if (skip && skip(cx, cy)) continue;
    if (cutV && (cutV[a] | cutV[b] | cutV[c] | cutV[d])) continue;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colA, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); TERRAIN.meshes.push(m); return m;
}
// The harbour patch: ground on a grid squared to the marina and the lock (both run at 038°), so every quay, the lock
// yard and the sea wall meet the water along straight edges rather than the stepped edge of a north-south grid. Its
// across-lock lines fall on the approach's two walls.
const PATCH = (() => {
  const phone = Math.min(innerWidth, innerHeight) < 700, ds = phone ? 3 : 2, dc = phone ? 20.3 / 7 : 20.3 / 10;
  const c0 = APPROACH.cNW - dc * Math.round(71 / dc), c1 = APPROACH.cNW + dc * Math.round(91 / dc);
  return { s0: -660, s1: 520, c0, c1, ds, dc };
})();
const inPatch = (x, y, m = 0) => { const s = lkS(x, y), c = lkC(x, y); return s > PATCH.s0 + m && s < PATCH.s1 - m && c > PATCH.c0 + m && c < PATCH.c1 - m; };
function buildPatch(mat) {
  const P = PATCH, ns = Math.round((P.s1 - P.s0) / P.ds) + 1, nc = Math.round((P.c1 - P.c0) / P.dc) + 1, n = ns * nc;
  const pos = new Float32Array(n * 3), colA = new Float32Array(n * 3), uv = new Float32Array(n * 2), H = new Float32Array(n), cutV = new Uint8Array(n);
  for (let j = 0; j < nc; j++) for (let i = 0; i < ns; i++) {
    const sv = P.s0 + i * P.ds, cv = P.c0 + j * P.dc, [x, y] = lkP(sv, cv), k = j * ns + i;
    let z = heightAt(x, y); const dock = inDock(x, y), pier = inPier(x, y);
    if (dock) z = QUAY;
    cutV[k] = dock || pier ? 1 : 0;
    H[k] = z; pos[k * 3] = x; pos[k * 3 + 1] = z + 0.02; pos[k * 3 + 2] = -y;
    uv[k * 2] = (x - GTX.x0) / (GTX.x1 - GTX.x0); uv[k * 2 + 1] = (y - GTX.y0) / (GTX.y1 - GTX.y0);
  }
  const conc = (x, y) => { const v = 0.6 + 0.05 * vnoise(x * 0.3, y * 0.3); return col3(v + 0.02, v + 0.015, v - 0.01); };
  for (let j = 0; j < nc; j++) for (let i = 0; i < ns; i++) {
    const k = j * ns + i, x = pos[k * 3], y = -pos[k * 3 + 2], z = H[k];
    const dzs = (H[j * ns + Math.min(ns - 1, i + 1)] - H[j * ns + Math.max(0, i - 1)]) / (2 * P.ds), dzc = (H[Math.min(nc - 1, j + 1) * ns + i] - H[Math.max(0, j - 1) * ns + i]) / (2 * P.dc), sl = Math.hypot(dzs, dzc);
    let c;
    if (Math.abs(z - QUAY) < 0.05 && quayAt(x, y)) c = conc(x, y);
    else if (sl > 1.2 && z > 4 && z < 15.5) { const v = 0.44 + 0.05 * vnoise(x * 0.4, y * 0.4); c = col3(v + 0.03, v, v - 0.04); }   // the face of the sea wall
    else c = groundCol(x, y, z, sl);
    colA[k * 3] = c.r; colA[k * 3 + 1] = c.g; colA[k * 3 + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < nc - 1; j++) for (let i = 0; i < ns - 1; i++) {
    const a = j * ns + i, b = a + 1, c = a + ns, d = c + 1;
    if (cutV[a] | cutV[b] | cutV[c] | cutV[d]) continue;
    if (inApproach(P.s0 + (i + 0.5) * P.ds, P.c0 + (j + 0.5) * P.dc)) continue;   // the approach has its own floor and walls
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colA, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const pm = mat.clone(); pm.polygonOffset = true; pm.polygonOffsetFactor = -1; pm.polygonOffsetUnits = -2;
  const m = new THREE.Mesh(g, pm); m.receiveShadow = true; scene.add(m); TERRAIN.meshes.push(m); return m;
}
function buildTerrain() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTexture() });
  const cut = (x, y) => inDock(x, y) || inPier(x, y);
  buildPatch(mat);
  buildTerrainMesh(INNER.x0, INNER.y0, INNER.x1, INNER.y1, INNER.step, cut, mat, (x, y) => inPatch(x, y, 4));
  const outer = buildTerrainMesh(DOM.x0, DOM.y0 - 1500, DOM.x1, DOM.y1, 20, null, mat, (x, y) => x > INNER.x0 + 10 && x < INNER.x1 - 10 && y > INNER.y0 + 10 && y < INNER.y1 - 10);
  outer.position.y = -0.12;
}

// ---------- the town: buildings from OpenStreetMap, extruded to their levels, houses with hipped roofs ----------
function buildTown() {
  const q = b64bytes(PD.bld), dv = new DataView(q.buffer); let o = 0;
  const T = new TriBuf(), rnd = mulberry(77);
  const WALLS_H = [col3(0.88, 0.86, 0.80), col3(0.93, 0.92, 0.88), col3(0.80, 0.74, 0.64), col3(0.70, 0.52, 0.42), col3(0.86, 0.83, 0.75)];
  const WALLS_A = [col3(0.92, 0.92, 0.90), col3(0.84, 0.84, 0.82), col3(0.78, 0.50, 0.33), col3(0.88, 0.88, 0.86), col3(0.62, 0.64, 0.66)];
  const ROOF_H = [col3(0.36, 0.37, 0.40), col3(0.45, 0.30, 0.25), col3(0.40, 0.40, 0.42)];
  const ROOF_A = col3(0.55, 0.56, 0.57);
  while (o < q.length) {
    const H = dv.getUint8(o) / 4, kind = dv.getUint8(o + 1), n = dv.getUint16(o + 2, true); o += 4;
    const P = []; for (let i = 0; i < n; i++) { P.push([dv.getInt16(o, true) / 2, dv.getInt16(o + 2, true) / 2]); o += 4; }
    let area = 0; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) P.reverse();   // anticlockwise seen from above
    let base = 1e9; for (const [x, y] of P) base = Math.min(base, heightAt(x, y));
    if (base < 13) base = 13;
    const wc = kind ? WALLS_H[Math.floor(rnd() * WALLS_H.length)] : WALLS_A[Math.floor(rnd() * WALLS_A.length)], top = base + H, sh = 0.94 + rnd() * 0.08;
    const wcs = col3(wc.r * sh, wc.g * sh, wc.b * sh);
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; T.quad([a[0], base - 2, a[1]], [b[0], base - 2, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], wcs); }
    if (kind && n === 4) {
      // a hipped roof along the longer side
      let [A, B, C, D] = P; if (Math.hypot(B[0] - A[0], B[1] - A[1]) < Math.hypot(C[0] - B[0], C[1] - B[1])) [A, B, C, D] = [B, C, D, A];
      const w = Math.hypot(C[0] - B[0], C[1] - B[1]), rh = Math.min(3.5, w * 0.38), L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const mAD = [(A[0] + D[0]) / 2, (A[1] + D[1]) / 2], mBC = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2], ux = (mBC[0] - mAD[0]) / L, uy = (mBC[1] - mAD[1]) / L, inset = Math.min(w / 2, L / 2 - 0.3);
      const R1 = [mAD[0] + ux * inset, top + rh, mAD[1] + uy * inset], R2 = [mBC[0] - ux * inset, top + rh, mBC[1] - uy * inset];
      const rc = ROOF_H[Math.floor(rnd() * ROOF_H.length)], a3 = [A[0], top, A[1]], b3 = [B[0], top, B[1]], c3 = [C[0], top, C[1]], d3 = [D[0], top, D[1]];
      T.quad(a3, b3, R2, R1, rc); T.quad(c3, d3, R1, R2, rc); T.tri(b3, c3, R2, rc); T.tri(d3, a3, R1, rc);
    } else {
      const shape = P.map(([x, y]) => new THREE.Vector2(x, y)), tris = THREE.ShapeUtils.triangulateShape(shape, []), rc = kind ? ROOF_H[0] : ROOF_A;
      for (const [a, b, c] of tris) T.tri([P[a][0], top, P[a][1]], [P[b][0], top, P[b][1]], [P[c][0], top, P[c][1]], rc);
    }
  }
  const m = T.mesh(new THREE.MeshLambertMaterial({ vertexColors: true })); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  TOWN.mesh = m;
}
const TOWN = {};
// trees in the woods and along the slopes, from OpenStreetMap's woodland
function buildTrees() {
  const rnd = mulberry(99), P = [];
  for (const f of GROUND) {
    if (f.c !== 1 || f.P.length < 3) continue;
    const B = bbox(f.P);
    for (let x = B.x0; x < B.x1; x += 9) for (let y = B.y0; y < B.y1; y += 9) {
      const px = x + (rnd() - 0.5) * 7, py = y + (rnd() - 0.5) * 7;
      if (inPoly(f.P, px, py) && !inDock(px, py)) P.push([px, py, heightAt(px, py)]);
      if (P.length > 2600) break;
    }
  }
  const crown = new THREE.OctahedronGeometry(3.6, 0); crown.scale(1, 1.15, 1); crown.translate(0, 6.2, 0);
  const trunk = new THREE.CylinderGeometry(0.3, 0.45, 4, 4, 1, true); trunk.translate(0, 2, 0);
  const cm = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), P.length);
  const tm = new THREE.InstancedMesh(trunk, M(0x4a3b2c), P.length);
  const d = new THREE.Object3D(), c = new THREE.Color();
  P.forEach(([x, y, z], i) => {
    const s = 0.7 + rnd() * 0.7; d.position.set(x, z - 0.3, -y); d.rotation.y = rnd() * 6.28; d.scale.set(s, s * (0.9 + rnd() * 0.4), s); d.updateMatrix();
    cm.setMatrixAt(i, d.matrix); tm.setMatrixAt(i, d.matrix);
    c.setRGB(0.22 + rnd() * 0.08, 0.33 + rnd() * 0.1, 0.17 + rnd() * 0.05); cm.setColorAt(i, c);
  });
  cm.castShadow = true; scene.add(cm, tm); TOWN.trees = [cm, tm];
}

// ---------- the marina: quay walls, the basin floor, pontoons, the lock and its gates, the approach and the pier ----------
const MAR = {};
function polyArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function shapeGeo(P, y) {
  const sh = new THREE.Shape(P.map(([x, yy]) => new THREE.Vector2(x, yy))), g = new THREE.ShapeGeometry(sh);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g;   // ShapeGeometry is in x,y; turned flat its y becomes -z, which is our north
}
function buildMarina() {
  const T = new TriBuf(), conc = col3(0.62, 0.61, 0.57), concD = col3(0.50, 0.49, 0.46), weed = col3(0.26, 0.27, 0.20), stone = col3(0.55, 0.52, 0.47);
  // quay walls round the basin and the lock, facing the water; below the water they are weedy
  const ccw = polyArea(DOCK) > 0;
  for (let i = 0; i < DOCK.length; i++) {
    const a = DOCK[i], b = DOCK[(i + 1) % DOCK.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    const nx = ccw ? -ey / l : ey / l, ny = ccw ? ex / l : -ex / l;   // towards the water
    if (!solidAt(mx - nx * 1.5, my - ny * 1.5) && !solidAt(mx + nx * 1.5, my + ny * 1.5)) continue;   // water both sides: the outline closing across the sea gates
    const s = lkS(mx, my), inLock = s >= LOCK.sIn - 4, fl = inLock ? LOCK.floor - 0.5 : MARINA_FLOOR - 0.5;
    T.wall(a[0], a[1], b[0], b[1], fl, inLock ? 12.6 : 12.9, weed, nx, ny);
    T.wall(a[0], a[1], b[0], b[1], inLock ? 12.6 : 12.9, QUAY, inLock ? concD : conc, nx, ny);
    // the coping and a strip of quay behind it, covering the terrain's ragged edge (not round the gates' recesses)
    if (l < 1.5 || Math.abs(s - LOCK.sIn) < 11 || Math.abs(s - LOCK.sOut) < 11) continue;   // none round the gates' recesses
    const ox = -nx * 2.5, oy = -ny * 2.5, cA = [a[0], QUAY + 0.03, a[1]], cB = [b[0], QUAY + 0.03, b[1]], cC = [b[0] + ox, QUAY + 0.03, b[1] + oy], cD = [a[0] + ox, QUAY + 0.03, a[1] + oy];
    if (ccw) T.quad(cA, cD, cC, cB, col3(0.66, 0.65, 0.62)); else T.quad(cA, cB, cC, cD, col3(0.66, 0.65, 0.62));
  }
  // the lock's chamber walls (with their ladders' recesses ignored), and the paved quays either side of it out to the
  // approach walls
  for (const [c, sgn] of [[LOCK.cNW, 1], [LOCK.cSE, -1]]) {
    const a = lkP(LOCK.sIn - 2, c), b = lkP(LOCK.sOut + 2, c), nx = LK_N[0] * sgn, ny = LK_N[1] * sgn;
    T.wall(a[0], a[1], b[0], b[1], LOCK.floor - 0.5, 12.6, weed, nx, ny); T.wall(a[0], a[1], b[0], b[1], 12.6, QUAY, concD, nx, ny);
    void 0;
  }
  // the approach walls out to the pier, and the pier's own faces
  const AW = PD.approachW;
  for (let i = 0; i < AW.length - 1; i++) {
    const a = AW[i], b = AW[i + 1], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n1 = [ey / l, -ex / l], wet = !solidAt(m[0] + n1[0] * 1.5, m[1] + n1[1] * 1.5);
    if (wet && !solidAt(m[0] - n1[0] * 1.5, m[1] - n1[1] * 1.5)) continue;   // water both sides: no wall here
    const nx = wet ? n1[0] : -n1[0], ny = wet ? n1[1] : -n1[1];
    const bed = Math.min(heightAt(m[0] + nx * 3, m[1] + ny * 3), APPROACH.floor) - 0.5;
    T.wall(a[0], a[1], b[0], b[1], bed, 11.5, weed, nx, ny); T.wall(a[0], a[1], b[0], b[1], 11.5, QUAY, stone, nx, ny);
  }
  const pccw = polyArea(PIER) > 0;
  for (let i = 0; i < PIER.length; i++) {
    const a = PIER[i], b = PIER[(i + 1) % PIER.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    const nx = pccw ? ey / l : -ey / l, ny = pccw ? -ex / l : ex / l;   // outward
    const m = [(a[0] + b[0]) / 2 + nx * 4, (a[1] + b[1]) / 2 + ny * 4], bed = Math.min(12, heightAt(m[0], m[1])) - 0.6;
    T.wall(a[0], a[1], b[0], b[1], bed, 11.8, weed, nx, ny); T.wall(a[0], a[1], b[0], b[1], 11.8, PIER_TOP, stone, nx, ny);
  }
  {
    const tris = THREE.ShapeUtils.triangulateShape(PIER.map(([x, y]) => new THREE.Vector2(x, y)), []);
    for (const [a, b, c] of tris) { const A = PIER[a], B = PIER[b], C = PIER[c]; if (pccw) T.tri([A[0], PIER_TOP, A[1]], [B[0], PIER_TOP, B[1]], [C[0], PIER_TOP, C[1]], col3(0.60, 0.57, 0.52)); else T.tri([A[0], PIER_TOP, A[1]], [C[0], PIER_TOP, C[1]], [B[0], PIER_TOP, B[1]], col3(0.60, 0.57, 0.52)); }
  }
  const walls = T.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); walls.receiveShadow = true; walls.castShadow = true; scene.add(walls);
  // floors: the basin's and the chamber's (seen when the lock is down)
  const fl = new THREE.Mesh(shapeGeo(MARINA_POLY, MARINA_FLOOR), M(0x3a3a30)); scene.add(fl);
  const ch = [lkP(LOCK.sIn - 2, LOCK.cNW), lkP(LOCK.sOut + 2, LOCK.cNW), lkP(LOCK.sOut + 2, LOCK.cSE), lkP(LOCK.sIn - 2, LOCK.cSE)];
  scene.add(new THREE.Mesh(shapeGeo(ch, LOCK.floor), M(0x4a4436)));
  { const ap = [lkP(LOCK.sOut, APPROACH.cNW), lkP(APPROACH.s1 + 1, APPROACH.cNW), lkP(APPROACH.s1 + 1, APPROACH.cSE), lkP(LOCK.sOut, APPROACH.cSE)];
    const m = new THREE.Mesh(shapeGeo(ap, APPROACH.floor), M(0x5a4c34)); m.receiveShadow = true; scene.add(m); }
  buildLockPontoons();
  // pontoons: grey decking on floats, riding on the marina's level
  const pg = new THREE.Group(); scene.add(pg); MAR.pont = pg;
  const deck = new THREE.MeshLambertMaterial({ color: 0x8d8a84 }), flt = new THREE.MeshLambertMaterial({ color: 0x3c3f42 });
  for (const p of PONT) {
    const sh = new THREE.Shape(p.P.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, 0.42, 0);
    const m = new THREE.Mesh(g, deck); m.receiveShadow = true; m.castShadow = true; pg.add(m);
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: false }); g2.rotateX(-Math.PI / 2); g2.translate(0, -0.13, 0); g2.scale(1, 1, 1);
    pg.add(new THREE.Mesh(g2, flt));
  }
  // piles at the walkway corners and hammerheads, steel, standing up through the pontoons
  {
    const pts = []; for (const h of HAMMER) { const a = h.c, L = h.L / 2 - 0.6; pts.push([a[0] + 0.618 * L, a[1] + 0.786 * L], [a[0] - 0.618 * L, a[1] - 0.786 * L]); }
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 10, 8), M(0x5a5e62), pts.length), d = new THREE.Object3D();
    pts.forEach(([x, y], i) => { d.position.set(x, 11.5, -y); d.updateMatrix(); pm.setMatrixAt(i, d.matrix); }); scene.add(pm);
  }
  // the gangway from the head of the main walkway up to the quay, by the marina office
  {
    const top = [24.6, 17.6], foot = [17.2, 9.4], dx = top[0] - foot[0], dy = top[1] - foot[1], L = Math.hypot(dx, dy);
    const gw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, L + 0.6), M(0x7d7a73)); gw.userData = { foot, top, L };
    gw.rotation.order = 'YXZ'; gw.rotation.y = Math.atan2(dx, -dy); scene.add(gw); MAR.gangway = gw;
  }
  // water: the marina's and the chamber's, each a flat sheet at its own level
  MAR.water = new THREE.Mesh(shapeGeo(MARINA_POLY, 0), basinWaterMat); scene.add(MAR.water);
  const chW = [lkP(LOCK.sIn - 3, LOCK.cNW - 1), lkP(LOCK.sOut + 0.5, LOCK.cNW - 1), lkP(LOCK.sOut + 0.5, LOCK.cSE + 1), lkP(LOCK.sIn - 3, LOCK.cSE + 1)];
  MAR.lockMat = waterMaterial(0, true); MAR.lockWater = new THREE.Mesh(shapeGeo(chW, 0), MAR.lockMat); scene.add(MAR.lockWater); MAR.mud = 0;
  buildGates(); buildSignals(); buildBoats();
}
// The lock's floating pontoons: one along each wall, riding up and down on steel guide rails as the chamber fills and
// empties, decked in grey with a yellow edge, cleats along the outer edge every 4 m
function buildLockPontoons() {
  const g = new THREE.Group(); scene.add(g); MAR.lockPont = g; MAR.lockCleats = [];
  const deck = M(0x8a8780), edge = M(0xe0b520), flt = M(0x2b2e31), steel = M(0x3a3f44), cleatM = new THREE.MeshPhongMaterial({ color: 0x9aa3a8, shininess: 70 });
  const L = LOCK.ps1 - LOCK.ps0, yaw = Math.atan2(LK_U[1], LK_U[0]);
  for (const side of [-1, 1]) {
    const cIn = side < 0 ? LOCK.cNW + LOCK.pw : LOCK.cSE - LOCK.pw, cMid = side < 0 ? LOCK.cNW + LOCK.pw / 2 : LOCK.cSE - LOCK.pw / 2, sMid = (LOCK.ps0 + LOCK.ps1) / 2;
    const [mx, my] = lkP(sMid, cMid);
    const box = (w, h, d, mat, y, cOff = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(L, h, w), mat); const [px, py] = lkP(sMid, cMid + cOff); m.position.set(px, y, -py); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    box(LOCK.pw, 0.5, 0, flt, 0.05);
    box(LOCK.pw, 0.12, 0, deck, 0.36);
    box(0.12, 0.13, 0, edge, 0.365, (cIn - cMid) * 0.97);   // the yellow edge on the water side
    // cleats along the water side, and the hoops round the rails
    for (let sc = LOCK.ps0 + 2; sc <= LOCK.ps1 - 1.9; sc += 4) {
      const [cx, cy] = lkP(sc, cIn - side * 0.22), c = new THREE.Group(); c.position.set(cx, 0.42, -cy); c.rotation.y = yaw; g.add(c);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.07), cleatM); bar.position.y = 0.1; c.add(bar);
      for (const k of [-0.07, 0.07]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.06), cleatM); post.position.set(k, 0.05, 0); c.add(post); }
      MAR.lockCleats.push({ x: cx, y: cy, side });
    }
    for (const sr of [LOCK.ps0 + 6, sMid, LOCK.ps1 - 6]) {
      // guide rails on the wall, fixed, and a hoop on the pontoon that slides on each
      const wc = side < 0 ? LOCK.cNW + 0.12 : LOCK.cSE - 0.12, [rx, ry] = lkP(sr, wc);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, QUAY - LOCK.floor, 0.18), steel); rail.position.set(rx, (QUAY + LOCK.floor) / 2, -ry); rail.rotation.y = yaw; scene.add(rail);
      const [hx, hy] = lkP(sr, wc - side * 0.18), hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 12), steel); hoop.position.set(hx, 0.48, -hy); hoop.rotation.x = Math.PI / 2; g.add(hoop);
    }
    void mx; void my;
  }
}
// the boat's lines when she is made fast: a bow line and a stern line from her cleats to the shore, sagging a little
const LINES = (() => {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(2 * 9 * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const idx = []; for (let l = 0; l < 2; l++) for (let i = 0; i < 8; i++) idx.push(l * 9 + i, l * 9 + i + 1); g.setIndex(idx);
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe9e2cf })); m.frustumCulled = false; m.visible = false; scene.add(m);
  return { m, g, pos };
})();
function updateLines() {
  const R = RB, F = R.fastPts; LINES.m.visible = !!(R.fast && F);
  if (!LINES.m.visible) return;
  RIB.root.updateMatrixWorld(true);
  for (let l = 0; l < 2; l++) {
    const f = F[l], a = RIB.body.localToWorld(new V3(f.side * RIBC.B * 0.42, 0.62, -f.xb)), sy = f.top();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, x = lerp(a.x, f.x, t), z = lerp(a.z, -f.y, t), y = lerp(a.y, sy, t) - Math.sin(t * Math.PI) * 0.25, k = (l * 9 + i) * 3;
      LINES.pos[k] = x; LINES.pos[k + 1] = y; LINES.pos[k + 2] = z;
    }
  }
  LINES.g.attributes.position.needsUpdate = true;
}
function updateMarina() {
  if (MAR.lockPont) MAR.lockPont.position.y = LKS.L;
  MAR.pont.position.y = LKS.M; MAR.water.position.y = LKS.M; MAR.lockWater.position.y = LKS.L;
  { const u = MAR.lockMat.uniforms, dt = 0.016 * (S ? S.warp : 1); const seaIn = LKS.gOut > 0.02; WATER_U.uMaskS.value = seaIn ? LOCK.sIn + 1 : 1e5; MAR.lockWater.visible = !seaIn; MAR.mud = seaIn ? 1 : Math.max(0, MAR.mud - dt / 900);
    u.uDeep.value.setHex(0x2b3a2d).lerp(new THREE.Color(0x6e5b3c), MAR.mud); u.uShallow.value.setHex(0x3c4a3a).lerp(new THREE.Color(0x8c7653), MAR.mud);
    for (const k of ['uTime', 'uRip']) u[k].value = basinWaterMat.uniforms[k].value; }
  const G = MAR.gangway, { foot, top, L } = G.userData, dz = QUAY - (LKS.M + 0.55);
  G.position.set((foot[0] + top[0]) / 2, (LKS.M + 0.55 + QUAY) / 2, -(foot[1] + top[1]) / 2); G.rotation.x = -Math.atan2(dz, L);
  if (MAR.boatM !== LKS.M) { MAR.boatM = LKS.M; MAR.boats.position.y = LKS.M; }
  for (const gt of MAR.gates) { const o = gt.which === 'in' ? LKS.gIn : LKS.gOut; for (const lf of gt.leaves) lf.g.rotation.y = lf.closed + lf.dir * o * 82 * DEG; }
  const lit = { go: ['g', 'w', 'g'], red: ['r', 'r', 'r'] };
  for (const sg of MAR.sigs) { const st = sg.which === 'in' ? LKS.sigIn : LKS.sigOut, L3 = lit[st]; sg.lamps.forEach((m, i) => { m.material = MAR.lampMat[L3[i]]; }); sg.glow.forEach((n, i) => { n.s.material.color.setHex(L3[i] === 'r' ? 0xff3b30 : L3[i] === 'g' ? 0x3dff6a : 0xffffff); }); }
}
// Sector gates: at each end a pair of curved steel leaves on vertical pivots in the walls, swinging back into recesses. Closed,
// they meet on the centreline; open, they lie in the walls. A walkway with handrails crosses each gate on top.
function buildGates() {
  MAR.gates = [];
  const steel = M(0x2b2f33), rail = M(0x9aa3a8), arm = M(0x3a3f44);
  for (const [which, s] of [['in', LOCK.sIn], ['out', LOCK.sOut]]) {
    const gt = { which, s, leaves: [] };
    for (const [c, side] of [[LOCK.cNW, 1], [LOCK.cSE, -1]]) {
      const [px, py] = lkP(s, c - side * 0.3), g = new THREE.Group(); g.position.set(px, 0, -py); scene.add(g);
      const len = LOCK.gateR, H = QUAY - LOCK.floor;
      // the leaf: a curved skin of radius about the pivot, built along +x (towards the chamber's centre when closed)
      const skin = new THREE.Mesh(new THREE.BoxGeometry(len, H, 0.5), steel); skin.position.set(len / 2, LOCK.floor + H / 2, 0); skin.castShadow = true; g.add(skin);
      for (const yy of [LOCK.floor + 2, 7, 12]) { const a = new THREE.Mesh(new THREE.BoxGeometry(len * 0.95, 0.3, 0.3), arm); a.position.set(len / 2, yy, 0.6); g.add(a); }
      const rl = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), rail); rl.position.set(len / 2, QUAY + 1.0, 0); g.add(rl);
      for (let k = 0; k <= 3; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), rail); p.position.set(len * k / 3, QUAY + 0.5, 0); g.add(p); }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 1.2), M(0x55595c)); deck.position.set(len / 2, QUAY + 0.05, 0); g.add(deck);
      // closed: pointing across the chamber from its wall; it opens away from the chamber, into its recess (towards the
      // marina for the marina-side gate, the sea for the sea-side one). rotation.y = a turns the leaf's +x to map (cos a, sin a).
      const dirx = side * LK_N[0], diry = side * LK_N[1], yaw = Math.atan2(diry, dirx), away = which === 'in' ? -1 : 1;
      const crossZ = dirx * LK_U[1] * away - diry * LK_U[0] * away;
      gt.leaves.push({ g, closed: yaw, dir: Math.sign(crossZ) || 1, side });
      g.rotation.y = yaw;
    }
    MAR.gates.push(gt);
  }
}
// The traffic signals, three lights in a vertical column on a post on the port side of each entrance: the south-east wall
// coming in from the sea, the north-west wall coming in from the marina
function buildSignals() {
  MAR.sigs = []; MAR.lampMat = { r: new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }), g: new THREE.MeshBasicMaterial({ color: 0x3dff6a, toneMapped: false }), w: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), o: M(0x222629) };
  for (const [which, s, c] of [['out', LOCK.sOut + 6, LOCK.cSE + 1.2], ['in', LOCK.sIn - 6, LOCK.cNW - 1.2]]) {
    const [x, y] = lkP(s, c), g = new THREE.Group(); g.position.set(x, QUAY, -y); scene.add(g);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), M(0x2a2e31)); post.position.y = 1.7; g.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.25, 0.32), M(0x16191b)); box.position.y = 3.4; g.add(box);
    const lamps = [], glow = [];
    const face = which === 'out' ? 1 : -1;   // facing the boats coming in
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), MAR.lampMat.r); m.position.set(0, 3.8 - i * 0.4, 0); g.add(m); lamps.push(m);
      const n = navLight(g, 0, 3.8 - i * 0.4, 0, 0xff3b30, 'all', null, 0.022); n.always = true; glow.push(n);
    }
    void face;
    MAR.sigs.push({ which, lamps, glow });
  }
  // the entrance lights on the approach's wall ends (F G and F R on the chart), and the pier head's (Iso G 2s)
  const ends = [[lkP(APPROACH.s1 - 4, APPROACH.cNW + 0.8), 0x3dff6a], [lkP(APPROACH.s1 - 14, APPROACH.cSE - 0.8), 0xff3b30]];
  for (const [[x, y], c] of ends) { const n = navLight(scene, x, QUAY + 2.5, -y, c, 'all', null, 0.014); void n; }
  const ph = PD.lights[1].p; MAR.pierLight = navLight(scene, ph[0], PIER_TOP + 4, -ph[1], 0x3dff6a, 'all', null, 0.02, FLASH.iso(2));
  { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3.6, 8), M(0x2f6b3f)); post.position.set(ph[0], PIER_TOP + 1.8, -ph[1]); scene.add(post); }
  const pt = PD.lights[0].p; navLight(scene, pt[0], heightAt(pt[0], pt[1]) + 12, -pt[1], 0xffffff, 'all', null, 0.024, FLASH.qn(3, 10));
  { const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 9, 10), M(0xe8e4dc)); tw.position.set(pt[0], heightAt(pt[0], pt[1]) + 4.5, -pt[1]); scene.add(tw); }
}
// Boats on their berths, from the satellite views: yachts, motor cruisers, small open boats and the houseboat on B's hammerhead
function buildBoats() {
  const grp = new THREE.Group(); scene.add(grp); MAR.boats = grp;
  const rnd = mulberry(5150), byType = [[], [], [], []];
  for (const b of BOATS) byType[b.type].push(b);
  const hullG = (() => {   // a unit hull, 1 m long and 1 m wide, bow towards -z: a pointed deck plan extruded down
    const s = new THREE.Shape(); s.moveTo(0, -0.5); s.quadraticCurveTo(0.5, -0.22, 0.5, 0.15); s.lineTo(0.45, 0.5); s.lineTo(-0.45, 0.5); s.lineTo(-0.5, 0.15); s.quadraticCurveTo(-0.5, -0.22, 0, -0.5);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 }); g.rotateX(Math.PI / 2); g.translate(0, 1, 0); return g;   // from y 0 (waterline) up 1
  })();
  const keelG = (() => { const g = new THREE.CylinderGeometry(0.5, 0.2, 1, 8, 1); g.translate(0, -0.5, 0); g.scale(1, 1, 3.2); return g; })();
  const cabinG = new THREE.BoxGeometry(1, 1, 1); cabinG.translate(0, 0.5, 0);
  const mastG = new THREE.CylinderGeometry(0.06, 0.08, 1, 6); mastG.translate(0, 0.5, 0);
  const D = new THREE.Object3D(), C = new THREE.Color();
  const inst = (geo, mat, list, f, colf) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => { f(b, D); D.updateMatrix(); m.setMatrixAt(i, D.matrix); if (colf) { colf(b, C); m.setColorAt(i, C); } });
    m.castShadow = true; m.receiveShadow = true; grp.add(m); return m;
  };
  const place = (b, D, dy, sx, sy, sz, oz = 0) => { D.position.set(b.x + Math.sin(b.psi) * oz, dy, -(b.y + Math.cos(b.psi) * oz)); D.rotation.set(0, -b.psi, 0); D.scale.set(sx, sy, sz); };
  const hullCols = [0xf2f3f1, 0xf2f3f1, 0xeceeec, 0xf6f6f2, 0x1d2a44, 0xf2f3f1, 0x8a1f22, 0xf2f3f1, 0x23413a, 0xe8e2d0];
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  BOATS.forEach(b => { b.hc = hullCols[Math.floor(rnd() * hullCols.length)]; b.free = 0.5 + 0.05 * b.L; });
  // hulls of everything
  inst(hullG, white, BOATS, (b, D) => place(b, D, -0.35, b.B, b.type === 3 ? 1.1 : 0.5 + 0.06 * b.L, b.L), (b, C) => C.setHex(b.hc));
  // yachts: a coachroof, a mast with its boom, and a keel under the water
  const Y = byType[0];
  inst(cabinG, M(0xe9ebe8), Y, (b, D) => place(b, D, 0.15 + 0.06 * b.L, b.B * 0.6, 0.45 + 0.02 * b.L, b.L * 0.38, -b.L * 0.02));
  inst(mastG, M(0xc4c9cd), Y, (b, D) => place(b, D, 0.4, 1, b.L * 1.35, 1, b.L * 0.08));
  inst(new THREE.BoxGeometry(0.1, 0.12, 1), M(0x2f4a6b), Y, (b, D) => place(b, D, 0.5 + 0.06 * b.L + 1.1, 1, 1, b.L * 0.36, -b.L * 0.12));   // sail covers on the booms
  // motor cruisers: a superstructure and a flybridge screen
  const P = byType[1];
  inst(cabinG, M(0xf4f4f2), P, (b, D) => place(b, D, 0.2 + 0.06 * b.L, b.B * 0.8, 0.9 + 0.05 * b.L, b.L * 0.5, b.L * 0.06), (b, C) => C.setHex(0xf4f4f2));
  inst(cabinG, M(0x20262c), P, (b, D) => place(b, D, 0.45 + 0.06 * b.L + 0.5 + 0.03 * b.L, b.B * 0.82, 0.35, b.L * 0.2, -b.L * 0.08));
  // small open boats: a console
  const Q = byType[2];
  inst(cabinG, M(0xdde1e3), Q, (b, D) => place(b, D, 0.5, b.B * 0.35, 0.8, b.L * 0.16, -b.L * 0.05));
  // the houseboat: a long cabin
  const HB = byType[3];
  inst(cabinG, M(0xd9dcd7), HB, (b, D) => place(b, D, 1.0, b.B * 0.86, 2.2, b.L * 0.82));
  inst(keelG, M(0x2b2b2b), Y, (b, D) => place(b, D, -0.2, b.B * 0.25, 1.2 + 0.05 * b.L, b.L * 0.12));
}
