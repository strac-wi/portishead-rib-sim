// Load the page in headless Chromium, three.js served from tools/vendor; report errors and take screenshots.
// Usage: node tools/smoke.js [outdir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || '/tmp/pth'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.route('**/three.min.js', r => r.fulfill({ path: path.join(__dirname, 'vendor/three-r128.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const t0 = Date.now();
  await p.goto('file://' + path.join(__dirname, '../index.html'));
  await p.waitForFunction(() => window.PTH, null, { timeout: 120000 });
  console.log('loaded in', (Date.now() - t0) / 1000, 's');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/0-menu.png' });
  await p.click('#bGo');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '/1-start.png' });
  const st = await p.evaluate(() => { const S = PTH.S, R = PTH.RB, L = PTH.LKS; return { ms: new Date(S.ms).toISOString(), tide: S.tide, x: R.x, y: R.y, lv: R.lv, fast: R.fast, M: L.M, Lv: L.L, gIn: L.gIn, gOut: L.gOut, mode: L.mode, win: L.win && [new Date(L.win.from).toISOString(), new Date(L.win.to).toISOString(), L.win.open, L.win.hw.h] }; });
  console.log(JSON.stringify(st));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
