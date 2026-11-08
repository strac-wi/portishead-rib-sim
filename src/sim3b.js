
// ---------- the boat: a Highfield Patrol 660 ----------
// After the user's photographs and Highfield's top-down drawing: charcoal Hypalon tubes with a black rubbing strake and
// black non-slip pads along their tops, a dark powder-coated aluminium deep-V hull (26°), dark EVA decking ruled in a grid,
// a black centre console with a tan quilted front and a seat ahead of it, a black tubular frame over the console, four
// black jockey seats with tan quilted backs in two pairs aft of the console, a rear bench over the stern locker, an
// A-frame over the outboard carrying two horseshoe lifebuoys and the all-round light, and a bow seat ahead of the anchor
// locker. A silver four-stroke on the transom. Body frame: x to starboard, y up, -z forward; 6.54 m from the bow of the
// tubes to the stern caps, 2.49 m over the tubes.
const RIB_CLIP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);   // clips nothing until the helm pass sets it to the waterline
const DECK_Y = 0.24;
function buildRib() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); scene.add(root); root.visible = false;
  const add = (p, geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
  const OUTER = [], STAT = new THREE.Group(); body.add(STAT);
  const blk = M(0x17191b), blk2 = M(0x24272a), anth = M(0x2e3236), tubeDk = M(0x232527), tan = M(0xb8743f);
  const steel = new THREE.MeshPhongMaterial({ color: 0xc8ced2, shininess: 90, specular: 0xffffff });
  const frameM = new THREE.MeshPhongMaterial({ color: 0x141618, shininess: 40, specular: 0x333333 });
  // the tan quilting: diamond-stitched leather in the orange-tan of the photographs
  const quiltTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#b8743f'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#7d4a22'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(255,220,180,.18)'; g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 32); g.lineTo(32, 32); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const quilt = (a, b) => { const t = quiltTex.clone(); t.needsUpdate = true; t.repeat.set(a / 0.1, b / 0.1); return M(0xffffff, { map: t }); };
  const box = (w, h, d, mat, x, y, z, p = STAT) => add(p, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  // a tan quilted panel facing along fz (+1 aft, -1 forward) or along fx (sideways)
  const panelZ = (w, h, x, y, z, fz) => box(w, h, 0.012, quilt(w, h), x, y, z + fz * 0.006);
  const tube = (pts, r, mat, p = STAT) => { const c = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)), false, 'centripetal', 0.3); return add(p, new THREE.TubeGeometry(c, Math.max(8, pts.length * 12), r, 10), mat, 0, 0, 0); };
  // swept tube of varying radius with per-vertex colour
  const sweep = (crv, NS, NR, rad, colorAt) => {
    const F = crv.computeFrenetFrames(NS, false), pos = [], col = [], idx = [], P = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i <= NS; i++) {
      const t = i / NS; crv.getPointAt(t, P); const N = F.normals[i], B = F.binormals[i], r = rad(t);
      for (let j = 0; j <= NR; j++) {
        const a = j / NR * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const dx = ca * N.x + sa * B.x, dy = ca * N.y + sa * B.y, dz = ca * N.z + sa * B.z;
        pos.push(P.x + r * dx, P.y + r * dy, P.z + r * dz); colorAt(c, P, dx, dy, dz); col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b = a + NR + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // the tubes: level along most of her length, sweeping up into the bow
  const half = [[0.975, 0.30, 3.0], [0.985, 0.30, 1.6], [0.985, 0.31, 0.0], [0.955, 0.35, -1.15], [0.83, 0.43, -2.0], [0.61, 0.53, -2.6], [0.32, 0.63, -2.98]];
  const path = half.concat([[0, 0.67, -3.08]], half.slice().reverse().map(p => [-p[0], p[1], p[2]])).map(p => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  const tubeR = (t) => lerp(0.27, 0.225, smooth(0.25, 0.5, Math.min(t, 1 - t)));
  const tubeColor = (c, P, dx, dy, dz) => {
    const out = Math.sign(P.x || 1) * dx;
    if (dy < -0.6) return c.setHex(0x26292c);                                                    // underside
    if (dy < -0.12 && dy > -0.5 && out > -0.2) return c.setHex(0x111213);                        // the black rubbing strake
    if (dy > 0.55 && Math.abs(P.z) < 2.4 && ((P.z + 10) % 0.62) < 0.42) return c.setHex(0x1c1e20);   // non-slip pads along the top
    return c.setHex(0x3d4145);
  };
  OUTER.push(add(body, sweep(curve, 200, 22, tubeR, tubeColor), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0, 0, 0));
  const TS = []; for (let i = 0; i <= 200; i++) TS.push(curve.getPointAt(0.5 * i / 200));
  const tubeAt = (z) => {
    if (z >= TS[0].z) return { x: TS[0].x, y: TS[0].y };
    for (let i = 0; i < 200; i++) { const a = TS[i], b = TS[i + 1]; if (z <= a.z && z >= b.z) { const f = (a.z - z) / (a.z - b.z || 1); return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }; } }
    return { x: 0, y: TS[200].y };
  };
  // black cones on the tube ends astern
  for (const s of [-1, 1]) { const cap = add(body, new THREE.CylinderGeometry(0.27, 0.2, 0.22, 20), blk, s * 0.975, 0.30, 3.1); cap.rotation.x = Math.PI / 2; OUTER.push(cap); }
  // the lifelines: black rope through D-rings along the top of each tube, and the grab handles
  for (const s of [-1, 1]) {
    const pts = []; for (let z = 2.7; z > -2.55; z -= 0.75) { const T = tubeAt(z); pts.push([s * (T.x + 0.06), T.y + 0.24 + 0.03 * Math.sin(z * 5), z]); }
    tube(pts, 0.011, blk);
    for (const z of [2.2, 1.2, 0.2, -0.8, -1.7]) { const T = tubeAt(z); box(0.05, 0.03, 0.16, blk, s * (T.x + 0.18), T.y + 0.17, z); }
  }
  // the hull: a deep V of dark powder-coated aluminium under the tubes, from the stem to the transom
  {
    const pos = [], secs = [], Z0 = -2.95, Z1 = 2.86;
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, z = Z0 + t * (Z1 - Z0), ky = -0.42 + 0.36 * (1 - smooth(0, 0.42, t)) ** 2, w = 0.82 * Math.sqrt(smooth(0, 0.4, t)), T = tubeAt(z);
      secs.push([[0, ky, z], [w, ky + 0.4 * w / 0.82, z], [Math.max(w + 0.02, T.x - 0.05) * smooth(0, 0.08, t), T.y - 0.2, z]]);
    }
    const tri = (a, b2, c) => pos.push(...a, ...b2, ...c), mir = (p) => [-p[0], p[1], p[2]];
    for (let i = 0; i < secs.length - 1; i++) {
      const A = secs[i], Bs = secs[i + 1];
      for (const s of [1, -1]) { const f = (p) => s > 0 ? p : mir(p); for (let k = 0; k < 2; k++) { const a = f(A[k]), b2 = f(A[k + 1]), c = f(Bs[k]), d = f(Bs[k + 1]); tri(a, c, b2); tri(b2, c, d); } }
    }
    const tr = secs[secs.length - 1]; for (const s of [1, -1]) { const f = (p) => s > 0 ? p : mir(p); tri(tr[0], f(tr[1]), f(tr[2])); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    OUTER.push(add(body, g, M(0x2c3034, { side: THREE.DoubleSide }), 0, 0, 0));
  }
  // the deck: dark EVA ruled in a grid of pale lines, out under the tubes from the transom to the bow
  {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#26282a'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.2})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5); }
    g.fillStyle = '#7f8487'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    const outline = [], zs = []; for (let z = 2.86; z > -2.7; z -= 0.1) zs.push(z);
    for (const z of zs) { const T = tubeAt(z); outline.push([Math.max(0.02, T.x - 0.16), z]); }
    const sh = new THREE.Shape(); outline.forEach(([x, z], i) => i ? sh.lineTo(x, z) : sh.moveTo(x, z)); outline.slice().reverse().forEach(([x, z]) => sh.lineTo(-x, z));
    const geo = new THREE.ShapeGeometry(sh); geo.rotateX(Math.PI / 2);   // shape (x, z) onto the deck plane, y up
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.62, uv.getY(i) / 0.62);
    const deck = add(STAT, geo, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }), 0, DECK_Y, 0); deck.castShadow = false;
  }
  const D = DECK_Y;
  // ---- the transom: the engine well between two moulded boxes, the stern locker under a bench, and the A-frame over all
  for (const s of [-1, 1]) { box(0.42, 0.52, 0.45, anth, s * 0.56, D + 0.26, 2.62); box(0.36, 0.012, 0.36, blk2, s * 0.56, D + 0.525, 2.62); }
  box(0.7, 0.3, 0.4, anth, 0, D + 0.15, 2.66); box(0.7, 0.5, 0.06, anth, 0, D + 0.25, 2.86);
  // the rear bench over the stern locker (the drawing's grey block across the boat), tan cushion and quilted back
  box(1.56, 0.42, 0.46, blk, 0, D + 0.21, 2.0); box(1.5, 0.08, 0.42, blk2, 0, D + 0.46, 2.0); box(1.42, 0.012, 0.36, quilt(1.42, 0.36), 0, D + 0.506, 2.0);
  box(1.5, 0.34, 0.07, blk, 0, D + 0.68, 2.22); panelZ(1.36, 0.26, 0, D + 0.68, 2.185, -1);
  // the A-frame over the outboard: two black legs from the transom corners leaning aft, a cross-member, two horseshoe
  // lifebuoys on its legs and the all-round white light on top
  {
    { const half = [[0.72, D + 0.5, 2.55], [0.7, D + 1.3, 2.75], [0.63, D + 1.92, 2.94], [0.42, D + 2.06, 2.98]], pts = half.map(([x, y, z]) => [-x, y, z]).concat([[0, D + 2.09, 2.99]], half.slice().reverse());
      tube(pts, 0.032, frameM); for (const s of [-1, 1]) add(STAT, new THREE.SphereGeometry(0.045, 10, 8), frameM, s * 0.72, D + 0.5, 2.55); }
    const hs = new THREE.TorusGeometry(0.22, 0.06, 8, 18, Math.PI * 1.55); hs.rotateZ(-Math.PI * 0.27);
    for (const s of [-1, 1]) { const b = add(STAT, hs, M(0xf2f2ee), s * 0.73, D + 1.25, 2.86); b.rotation.y = s * 0.15; }
    box(0.09, 0.22, 0.09, blk, 0, D + 2.2, 2.99);
  }
  // ---- four jockey seats in two pairs aft of the console, placed from the drawing: the forward pair 0.3-0.8 m aft of
  // the console, the after pair 0.95-1.45 m; 0.3 m either side of the centreline. Black saddles on black pedestals, a tan
  // quilted backrest on each and a stainless grab bar across the front of the after pair.
  const JOCKEY = [[-0.3, 0.55], [0.3, 0.55], [-0.3, 1.2], [0.3, 1.2]];
  for (const [x, z] of JOCKEY) {
    box(0.3, 0.5, 0.42, blk2, x, D + 0.25, z);
    box(0.38, 0.13, 0.54, blk, x, D + 0.58, z + 0.02);
    box(0.36, 0.014, 0.5, M(0x1e2022), x, D + 0.65, z + 0.02);
    box(0.38, 0.34, 0.08, blk, x, D + 0.86, z + 0.26); panelZ(0.32, 0.27, x, D + 0.86, z + 0.22, -1);
    tube([[x - 0.16, D + 0.62, z - 0.26], [x - 0.16, D + 0.8, z - 0.3], [x + 0.16, D + 0.8, z - 0.3], [x + 0.16, D + 0.62, z - 0.26]], 0.013, steel);
    box(0.34, 0.03, 0.12, blk, x, D + 0.12, z + 0.22);   // footrest
  }
  // ---- the centre console, black, its dash sloping up forward, extruded from the side profile with rounded edges
  {
    const sh = new THREE.Shape(), P = [[0.02, D], [0.02, D + 0.78], [-0.22, D + 1.2], [-0.42, D + 1.22], [-0.56, D + 1.05], [-0.62, D + 0.6], [-0.62, D]];
    P.forEach(([u, v], i) => i ? sh.lineTo(u, v) : sh.moveTo(u, v));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.84, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
    g.rotateY(-Math.PI / 2); g.translate(0.42, 0, 0); g.deleteAttribute("uv");
    add(STAT, g, blk, 0, 0, 0);
  }
  // the seat ahead of the console, its quilted back against the console's front
  box(0.84, 0.44, 0.42, blk, 0, D + 0.22, -0.86); box(0.8, 0.08, 0.4, blk2, 0, D + 0.48, -0.86); box(0.72, 0.012, 0.34, quilt(0.72, 0.34), 0, D + 0.522, -0.86);
  box(0.8, 0.012, 0.36, quilt(0.8, 0.36), 0, D + 0.8, -0.665);   // the console's quilted front, facing forward
  STAT.children[STAT.children.length - 1].rotation.x = Math.PI / 2;
  // the dash faces aft and up along DN; f runs from its foot (0) to its top (1)
  const DN = [0.868, 0.496], dash = (f, off) => [0.02 - 0.24 * f + DN[0] * (0.03 + off), D + 0.78 + 0.42 * f + DN[1] * (0.03 + off)];
  for (const [gx, f] of [[0.25, 0.2], [0.34, 0.2]]) {
    const [z, y] = dash(f, 0.006), gg = add(STAT, new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), blk2, gx, y, z); gg.rotation.x = 1.052;
    const fc = add(STAT, new THREE.CircleGeometry(0.028, 16), new THREE.MeshBasicMaterial({ color: 0xe8ecef }), gx, y + DN[1] * 0.0065, z + DN[0] * 0.0065); fc.rotation.x = -0.519;
  }
  // the wheel, port of the centreline as the drawing has it, on a short column out of the lower dash
  {
    const [z, y] = dash(0.1, 0), col = add(STAT, new THREE.CylinderGeometry(0.03, 0.036, 0.13, 10), blk2, -0.16, y + DN[1] * 0.065, z + DN[0] * 0.065); col.rotation.x = 1.052;
    const wheelG = new THREE.Group(); wheelG.position.set(-0.16, y + DN[1] * 0.13, z + DN[0] * 0.13); wheelG.rotation.x = -0.62; body.add(wheelG);
    add(wheelG, new THREE.TorusGeometry(0.18, 0.018, 10, 40), M(0x1c1e20), 0, 0, 0);
    add(wheelG, new THREE.CylinderGeometry(0.042, 0.042, 0.045, 14), steel, 0, 0, 0).rotation.x = Math.PI / 2;
    for (let a = 0; a < 3; a++) { const sp2 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.16, 0.01), steel); sp2.rotation.z = a * Math.PI * 2 / 3; sp2.position.set(-Math.sin(a * 2.094) * 0.09, Math.cos(a * 2.094) * 0.09, 0); wheelG.add(sp2); }
    RIB.wheel = wheelG;
  }
  // the chartplotter set into the top of the dash, live: chart, data bar and sonar
  {
    const c = document.createElement('canvas'); c.width = 560; c.height = 346;
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    const [z, y] = dash(0.68, 0.012), scr = add(body, new THREE.PlaneGeometry(0.36, 0.22), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0.02, y, z);
    scr.rotation.x = -0.519; scr.castShadow = false;
    const [zb, yb] = dash(0.68, 0), bz = add(STAT, new THREE.BoxGeometry(0.38, 0.235, 0.02), blk2, 0.02, yb, zb); bz.rotation.x = -0.519;
    const mk = (w, h) => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
    const cc = mk(340, 262), sc = mk(184, 262);
    RIB.mfd = { c, g: c.getContext('2d'), tex, cc, cg: cc.getContext('2d'), sc, sg: sc.getContext('2d'), t: -1 };
    RIB.mfd.sg.fillStyle = '#4a3f22'; RIB.mfd.sg.fillRect(0, 0, 184, 262);
  }
  // the single lever, starboard of the wheel on the console's side
  const lev = new THREE.Group(); lev.position.set(0.45, D + 0.92, -0.18); body.add(lev);
  add(lev, new THREE.BoxGeometry(0.07, 0.11, 0.16), blk2, 0, 0, 0);
  const arm = new THREE.Group(); lev.add(arm); add(arm, new THREE.BoxGeometry(0.025, 0.23, 0.025), steel, 0, 0.115, 0); add(arm, new THREE.BoxGeometry(0.1, 0.035, 0.035), blk, 0.03, 0.23, 0);
  RIB.lever = arm;
  // the black tubular frame over the console with a low smoked screen in it
  { const half = [[0.4, D + 1.02, -0.5], [0.4, D + 1.42, -0.42], [0.37, D + 1.68, -0.31], [0.27, D + 1.79, -0.22]], pts = half.map(([x, y, z]) => [-x, y, z]).concat([[0, D + 1.81, -0.2]], half.slice().reverse());
    tube(pts, 0.025, frameM);
    for (const s of [-1, 1]) { tube([[s * 0.4, D + 1.02, -0.08], [s * 0.42, D + 1.26, -0.06], [s * 0.4, D + 1.42, -0.42]], 0.02, frameM);
      for (const [y, z] of [[1.02, -0.5], [1.02, -0.08], [1.42, -0.42]]) add(STAT, new THREE.SphereGeometry(0.032, 10, 8), frameM, s * 0.4, D + y, z); } }
  { const scr2 = box(0.66, 0.24, 0.012, new THREE.MeshPhongMaterial({ color: 0x1f2830, transparent: true, opacity: 0.6, shininess: 100, depthWrite: false }), 0, D + 1.36, -0.46); scr2.rotation.x = 0.35; scr2.castShadow = false; RIB.screen = scr2; }
  // ---- the bow: a seat ahead of the anchor locker, a tan quilted panel on its back, the locker, cleat and roller
  box(0.95, 0.4, 0.46, blk, 0, D + 0.2, -2.1); box(0.9, 0.08, 0.42, blk2, 0, D + 0.44, -2.1); box(0.82, 0.012, 0.36, quilt(0.82, 0.36), 0, D + 0.482, -2.1);
  box(0.56, 0.42, 0.34, blk, 0, D + 0.3, -2.5); panelZ(0.48, 0.28, 0, D + 0.3, -2.33, 1);
  box(0.46, 0.02, 0.3, blk2, 0, D + 0.52, -2.5);
  box(0.07, 0.05, 0.3, steel, 0, D + 0.58, -2.82); box(0.14, 0.03, 0.035, steel, 0, D + 0.55, -2.68);
  // navigation lights: red and green either side of the bow fitting, the all-round white on the A-frame
  const lite = (c) => new THREE.MeshBasicMaterial({ color: c });
  box(0.05, 0.035, 0.07, lite(0x33ff66), 0.12, D + 0.6, -2.84); box(0.05, 0.035, 0.07, lite(0xff3333), -0.12, D + 0.6, -2.84);
  navLight(body, 0.13, D + 0.63, -2.87, 0xffffff, 'side', 'rib', 0.016); navLight(body, -0.13, D + 0.63, -2.87, 0xffffff, 'side', 'rib', 0.016);
  add(STAT, new THREE.SphereGeometry(0.04, 8, 6), lite(0xffffff), 0, D + 2.34, 2.99);
  navLight(body, 0, D + 2.36, 2.99, 0xfff1dc, 'all', 'rib', 0.017);
  // the helm in a lifejacket, astride the forward port jockey seat at the wheel
  const person = (x, z, jacket, parent) => {
    const p = new THREE.Group(); p.position.set(x, D, z); parent.add(p);
    const trousers = M(0x23303f), hip = 0.86;
    for (const s of [-1, 1]) { const l = box(0.15, hip, 0.18, trousers, s * 0.14, hip / 2, 0, p); l.rotation.z = s * 0.1; }
    box(0.44, 0.58, 0.28, M(jacket), 0, hip + 0.33, 0, p);
    add(p, new THREE.SphereGeometry(0.12, 12, 8), M(0xd9b08c), 0, hip + 0.8, 0);
    add(p, new THREE.SphereGeometry(0.126, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.2), M(0x22262a), 0, hip + 0.83, 0);
    for (const s of [-1, 1]) { const a2 = box(0.1, 0.5, 0.1, M(jacket), s * 0.22, hip + 0.37, -0.18, p); a2.rotation.x = 0.95; }
    return p;
  };
  RIB.helm = person(-0.26, 0.48, 0xe0571d, body);
  // ---- the outboard, silver, on the transom: trim and tilt on the bracket, steering on the swivel, prop on the gearcase
  const ob = new THREE.Group(); ob.position.set(0, D + 0.28, 2.95); body.add(ob);
  const trimG = new THREE.Group(); ob.add(trimG); const steerG = new THREE.Group(); steerG.position.set(0, 0, 0.18); trimG.add(steerG);
  box(0.36, 0.42, 0.14, blk, 0, -0.08, 0.05, trimG);
  const cowlM = new THREE.MeshPhongMaterial({ color: 0xd9dbdc, shininess: 70, specular: 0x9aa0a6 }), lowerM = M(0x55595d), alu = M(0x3a3e42);
  {
    const sh = new THREE.Shape(), P = [[0.16, 0.42], [0.2, 0.82], [0.1, 1.04], [-0.36, 1.12], [-0.6, 1.02], [-0.65, 0.7], [-0.6, 0.42]];
    P.forEach(([u, v], i) => i ? sh.lineTo(u, v) : sh.moveTo(u, v));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 4 });
    g.rotateY(Math.PI / 2); g.translate(-0.21, 0, 0); g.deleteAttribute('uv');
    add(steerG, g, cowlM, 0, 0, 0);
    box(0.5, 0.06, 0.78, blk, 0, 0.44, 0.22, steerG);   // the black wrap round the cowl's foot
    // HONDA down each side of the cowl, and the badge with the wing on its back, as on the user's boat
    const decal = (txt, w, h, font, col) => { const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const g = c.getContext('2d'); g.fillStyle = col; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 256, c.height / 2); const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4; return new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, toneMapped: true }); };
    const hm = decal('HONDA', 0.46, 0.09, 'bold 82px Arial, sans-serif', '#1d1f22');
    for (const sd of [-1, 1]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.09), hm); pl.position.set(sd * 0.3, 0.78, 0.22); pl.rotation.y = sd * Math.PI / 2; pl.scale.x = 1; if (sd < 0) pl.rotation.y = -Math.PI / 2; steerG.add(pl); }
    { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.06), decal('BF150', 0.22, 0.06, 'bold 150px Arial, sans-serif', '#c8102e')); pl.position.set(0, 0.86, 0.73); steerG.add(pl); }
  }
  box(0.5, 0.16, 0.76, lowerM, 0, 0.32, 0.2, steerG);
  box(0.2, 1.12, 0.34, lowerM, 0, -0.3, 0.12, steerG);
  box(0.38, 0.024, 0.56, alu, 0, -0.84, 0.17, steerG);
  box(0.12, 0.15, 0.3, alu, 0, -0.93, 0.12, steerG);
  const tor = add(steerG, new THREE.CylinderGeometry(0.08, 0.058, 0.5, 12), alu, 0, -1.03, 0.17); tor.rotation.x = Math.PI / 2;
  box(0.026, 0.18, 0.2, alu, 0, -1.16, 0.28, steerG);
  const prop = new THREE.Group(); prop.position.set(0, -1.03, 0.45); steerG.add(prop);
  for (let k = 0; k < 3; k++) { const bl = add(prop, new THREE.BoxGeometry(0.08, 0.19, 0.016), M(0x9aa1a6), 0, 0, 0); bl.geometry.translate(0, 0.095, 0); bl.rotation.z = k * Math.PI * 2 / 3; bl.rotation.y = 0.5; }
  RIB.trim = trimG; RIB.steer = steerG; RIB.prop = prop;
  ob.traverse(o => { if (o.isMesh) OUTER.push(o); });
  for (const o of OUTER) { o.material = o.material.clone(); o.material.clippingPlanes = [RIB_CLIP]; }
  // the static parts merged by material, so the boat costs a couple of dozen draw calls rather than a few hundred
  {
    STAT.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(STAT.matrixWorld).invert(), byKey = new Map(), keep = [];
    STAT.traverse(o => {
      if (!o.isMesh) return;
      const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      if (o.material.map || o.material.transparent || o.material.type !== 'MeshLambertMaterial' && o.material.type !== 'MeshPhongMaterial') { keep.push([o, rel]); return; }
      const key = o.material.type + o.material.color.getHex() + o.material.side;
      if (!byKey.has(key)) byKey.set(key, { mat: o.material, geos: [] });
      byKey.get(key).geos.push(o.geometry.clone().applyMatrix4(rel));
    });
    while (STAT.children.length) STAT.remove(STAT.children[0]);
    for (const { mat, geos } of byKey.values()) { const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = m.receiveShadow = true; STAT.add(m); }
    for (const [o, rel] of keep) { rel.decompose(o.position, o.quaternion, o.scale); STAT.add(o); }
  }
  RIB.root = root; RIB.body = body;
  root.traverse(o => { if (o.isMesh) o.layers.enable(2); });
  if (RIB.screen) RIB.screen.layers.disable(2);
  // the casualty, and the green outline of the berth to come alongside
  const cas = new THREE.Group(); add(cas, new THREE.TorusGeometry(0.28, 0.1, 8, 14), M(0xf06a1c), 0, 0, 0).rotation.x = Math.PI / 2; add(cas, new THREE.SphereGeometry(0.13, 10, 8), M(0xd9b08c), 0, 0.12, 0);
  cas.visible = false; scene.add(cas); RIB.cas = cas;
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.15, 6.7), new THREE.MeshBasicMaterial({ color: 0x3fdc8a, transparent: true, opacity: 0.32, depthWrite: false }));
  ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.55, 0.15, 6.7)), new THREE.LineBasicMaterial({ color: 0x7dffb6 }))); ghost.visible = false; scene.add(ghost); RIB.ghost = ghost;
}
