import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * WHAT THE FIRST SECOND LOOKS LIKE.
 *
 * Loads the client in a throttled browser and reports the three things that decide
 * whether a boot feels broken: when the HUD is actually on screen, every long task
 * that blocks it, and every layout shift (the jump you see when a late stylesheet
 * lands). Screenshots go to `screenshots/boot/` as a filmstrip.
 *
 *   node scripts/boot-probe.mjs [url] [--film]
 *   CPU=4 NET=100 node scripts/boot-probe.mjs http://localhost:4179/
 *
 * Measure the BUILT app (`pnpm build:demo && npx vite preview --port 4179`), not the
 * dev server: Vite's dev transform dominates everything else and hides the truth.
 */
const url = process.argv[2] ?? 'http://localhost:4179/';
const film = process.argv.includes('--film');
const cpu = Number(process.env.CPU ?? 4); // a mid-range phone is ~4× slower than this laptop
const netMs = Number(process.env.NET ?? 100);

// Headless Chromium falls back to SOFTWARE WebGL (SwiftShader), which turns every
// GPU cost into seconds of CPU and drowns out what is being measured. HEADED=1 runs
// a real window on the real GPU — the numbers a player would see.
const browser = await chromium.launch(process.env.HEADED === '1' ? { headless: false } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
if (netMs > 0) {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: netMs, downloadThroughput: 1.5e6 / 8, uploadThroughput: 7.5e5 / 8 });
}

await page.addInitScript(() => {
  const T0 = performance.now();
  const log = { frames: [], marks: [], long: [], shifts: [] };
  window.__boot = log;
  const mark = (name) => log.marks.push({ name, t: Math.round(performance.now()) });
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => log.long.push({ t: Math.round(e.startTime), dur: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => log.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4) }))).observe({ type: 'layout-shift', buffered: true });
  } catch { /* an engine without the observers still reports the marks */ }
  let last = performance.now();
  const frame = () => {
    const now = performance.now();
    log.frames.push(Math.round(now - last));
    last = now;
    if (now - T0 < 6000) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // The milestones that matter, as they happen.
  const seen = new Set();
  const poll = () => {
    const hit = (name, cond) => { if (cond && !seen.has(name)) { seen.add(name); mark(name); } };
    const root = document.querySelector('.HacksawCasinoUiContainer');
    const link = document.querySelector('link[rel=stylesheet]');
    hit('hud-mounted', !!root);
    hit('skin-loaded', !!link && !!link.sheet);
    hit('hud-visible', !!root && getComputedStyle(root).visibility === 'visible');
    hit('game-canvas', !!document.querySelector('canvas'));
    if (performance.now() - T0 < 6000) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  addEventListener('load', () => mark('load'));
});

const dir = fileURLToPath(new URL('../screenshots/boot/', import.meta.url));
if (film) mkdirSync(dir, { recursive: true });
await page.goto(url, { waitUntil: 'commit' });
const t0 = Date.now();
if (film) {
  for (let i = 0; i < 20; i++) {
    await page.screenshot({ path: `${dir}f${String(i).padStart(2, '0')}_${Date.now() - t0}ms.png` });
    await page.waitForTimeout(120);
  }
}
await page.waitForTimeout(5000);
const boot = await page.evaluate(() => {
  const l = window.__boot;
  return {
    marks: l.marks,
    longTasks: l.long.filter((t) => t.dur >= 50),
    cls: +l.shifts.reduce((a, s) => a + s.v, 0).toFixed(4),
    shifts: l.shifts.filter((s) => s.v >= 0.001),
    worstFrame: Math.max(...l.frames),
    paint: performance.getEntriesByType('paint').map((p) => ({ n: p.name, t: Math.round(p.startTime) })),
    stages: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('M:')).map((m) => ({ n: m.name, t: Math.round(m.startTime) })),
  };
});
console.log(`cpu ×${cpu}  net +${netMs}ms  ${url}`);
console.log('milestones :', boot.marks.map((m) => `${m.name}@${m.t}`).join('  '));
console.log('paint      :', boot.paint.map((p) => `${p.n}@${p.t}`).join('  '));
if (boot.stages?.length) console.log('stages     :', boot.stages.map((m) => `${m.n}@${m.t}`).join('  '));
console.log('long tasks :', boot.longTasks.map((t) => `${t.dur}ms@${t.t}`).join('  ') || 'none ≥50ms');
console.log(`layout shift: ${boot.cls}${boot.shifts.length ? `  (${boot.shifts.map((s) => `${s.v}@${s.t}`).join(', ')})` : ''}`);
if (film) console.log(`filmstrip  : ${dir}`);
await browser.close();
