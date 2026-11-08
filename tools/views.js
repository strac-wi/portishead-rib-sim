// Screenshots from set places: the marina from above, the lock, the pier from outside, the estuary. Usage: node tools/views.js outdir
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || '/tmp/pth'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.route('**/three.min.js', r => r.fulfill({ path: path.join(__dirname, 'vendor/three-r128.min.js'), contentType: 'application/javascript' }));
  await p.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.goto('file://' + path.join(__dirname, '../index.html'));
  await p.waitForFunction(() => window.PTH, null, { timeout: 120000 });
  await p.click('#bGo'); await p.waitForTimeout(1500);
  const shot = async (name, fn, wait = 1200) => { await p.evaluate(fn); await p.waitForTimeout(wait); await p.screenshot({ path: OUT + '/' + name + '.png' }); };
  const views = JSON.parse(process.env.VIEWS || '[]');
  for (const v of views) await shot(v.name, v.fn, v.wait || 1200);
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
