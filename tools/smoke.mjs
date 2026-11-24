// CI smoke test: plays the game in headless Chrome at iPad size, takes screenshots and fails on any error.
// Usage: node tools/smoke.mjs http://localhost:8000/
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.argv[2] || 'http://localhost:8000/';
mkdirSync('shots', { recursive: true });
const errors = [], fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { console.log(`[page:${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(url + '#test', { waitUntil: 'load' });
await page.waitForFunction(() => window.__p?.ready, { timeout: 60000 });

const ev = (fn, arg) => page.evaluate(fn, arg);
const step = sec => ev(s => __p.step(s), sec);
const state = () => ev(() => {
  const G = __p.G;
  return { phase: G.phase, wave: G.wave, gold: Math.floor(G.gold), treats: G.treats, critters: G.critters.length,
    kinds: [...new Set(G.critters.map(c => c.kind))], towers: G.towers.filter(Boolean).length, ...G.stats };
});
const shot = async name => {
  await ev(() => { __p.resize(); __p.draw(); });
  await page.screenshot({ path: `shots/${name}.png` });
  console.log('shot', name, JSON.stringify(await state()));
};
const grandma = async n => { for (let i = 0; i < n; i++) await page.tap('#grandma'); };

// 1. Title screen, then Play.
await shot('01-title');
await page.tap('#play');
const howtoUp = () => ev(() => !document.getElementById('overlay').hidden && !!document.querySelector('#overlay .howto'));
check(await howtoUp(), 'the first Play shows How to play');
await shot('01b-howto');
await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await shot('01c-howto-portrait');
await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.tap('#play');
check(await ev(() => __p.G.phase === 'build' && document.getElementById('overlay').hidden), 'its Play button starts the game');
check(await ev(() => localStorage.getItem('purr.howto') === '1'), 'How to play is remembered as seen');

// 2. Tap a cushion on the canvas (real touch input), the build menu opens, build a Yarn Tabby.
const pad = await ev(() => __p.pad(4));
await page.touchscreen.tap(pad.x, pad.y);
check(await ev(() => !document.getElementById('menu').hidden), 'tapping a cushion opens the build menu');
await shot('02-build-menu');
await page.tap('#menu button');
check(await ev(() => __p.G.towers[4]?.kind === 'yarn'), 'the first menu button builds a Yarn Tabby on that cushion');

// 3. Grandma Cat spends the rest, then the first wave.
await grandma(3);
await step(0.1);
await page.tap('#go');
check(await ev(() => __p.G.phase === 'wave' && __p.G.wave === 1), 'the go button starts wave 1');
for (let i = 0; i < 14; i++) await step(1);
await shot('03-wave-1');
for (let i = 0; i < 60 && (await ev(() => __p.G.phase)) === 'wave'; i++) await step(1);
const s1 = await state();
check(s1.phase === 'build' && s1.wave === 1, 'wave 1 ends');
await page.tap('#help');
check(await howtoUp() && await ev(() => __p.G.paused), 'the ? button pauses and shows How to play');
await page.tap('#play');
check(await ev(() => !__p.G.paused && __p.G.phase === 'build'), 'and Play goes back to the game');
check(s1.defeated > 0, `critters were defeated (${s1.defeated})`);

// 4. Fast-forward to the boss on wave 5 with plenty of fish for Grandma.
await ev(() => { __p.G.gold += 3000; });
await grandma(25);
for (let i = 0; i < 600; i++) {
  const st = await state();
  if (st.wave >= 5 && st.kinds.includes('boss')) break;
  if (st.phase === 'build') await page.tap('#go');
  if (st.phase === 'lost') await page.tap('#play');
  await step(1);
}
await step(3);
const s5 = await state();
check(s5.wave === 5 && s5.kinds.includes('boss'), 'wave 5 brings the boss');
await shot('04-boss');

// 5. Upgraded tower menu, portrait layout, then losing and retrying.
const built = await ev(() => __p.G.towers.findIndex(t => t && t.lvl === 3));
check(built >= 0, 'Grandma upgraded a cat to level 3');
const bp = await ev(i => __p.pad(i), Math.max(0, built));
await page.touchscreen.tap(bp.x, bp.y);
await shot('05-tower-menu');
await page.keyboard.press('Escape');

await page.setViewport({ width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await shot('06-portrait');
await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await ev(() => {
  const G = __p.G;
  for (const t of G.towers) if (t) t.cd = 1e9; // cats nap so the critters get through
  G.treats = 2;
});
for (let i = 0; i < 120 && (await ev(() => __p.G.phase)) !== 'lost'; i++) {
  if ((await ev(() => __p.G.phase)) === 'build') await page.tap('#go');
  await step(1);
}
check(await ev(() => __p.G.phase === 'lost'), 'running out of treats shows the snack party');
await shot('07-lost');
await page.tap('#play');
check(await ev(() => __p.G.phase === 'build' && __p.G.treats === 20), 'retry refills the treat jar');

// 6. The real requestAnimationFrame loop runs without errors.
await ev(() => { for (const t of __p.G.towers) if (t) t.cd = 0; __p.run(); });
await new Promise(r => setTimeout(r, 4000));
const frames = await ev(() => __p.frames());
check(frames >= 2, `the real-time loop draws frames (${frames} in 4 s)`);
await page.screenshot({ path: 'shots/08-live.png' });

const final = await state();
writeFileSync('shots/state.json', JSON.stringify({ final, errors, fails }, null, 2));
check(errors.length === 0, `no page errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
await browser.close();
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
