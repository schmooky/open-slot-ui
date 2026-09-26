import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ARE THE TWO RENDERERS THE SAME PICTURE?
 *
 * The same client, the same spec, the same flat backdrop — once with the markup
 * binding and once with the canvas one — driven through every window a player can
 * open, and compared pixel by pixel. It reports the share of pixels that differ per
 * state and writes the two shots plus a difference map, so a regression is something
 * to look at rather than argue about.
 *
 *   node packages/silk/scripts/parity.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://localhost:5199';
const out = fileURLToPath(new URL('../parity/', import.meta.url));
mkdirSync(out, { recursive: true });

const VIEW = { width: 1440, height: 900 };
/**
 * The plate is semi-transparent, so whatever is behind it is part of its colour.
 * Both pages are given the same flat backdrop and no game, which is what makes the
 * comparison about the HUD.
 */
const BACKDROP = '1a1d21';
const FLAGS = `bare=1&bg=${BACKDROP}`;

/** The doors, and the buttons that open them — by the skin's own element ids. */
const STATES = [
  { name: 'idle', press: [] },
  { name: 'menu', press: ['MainMenuToggle'] },
  { name: 'autoplay', press: ['AutoplayBtn'] },
  { name: 'info', press: ['MainMenuToggle', 'GameInfoBtn'] },
  { name: 'buy', press: ['FeatureBuyToggle'] },
  { name: 'history', press: ['MainMenuToggle', 'BetHistoryBtn'] },
];

const browser = await chromium.launch();

/** Open the client, walk it into one state, photograph the whole window. */
async function shoot(renderer, state) {
  const q = renderer === 'silk' ? `?renderer=silk&${FLAGS}` : `?${FLAGS}`;
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.goto(`${base}/${q}`, { waitUntil: 'networkidle' });
  if (renderer === 'silk') await page.waitForFunction(() => !!window.__silk, null, { timeout: 15000 });
  else await page.waitForSelector('.UiRibbonUserPanel__container');
  await page.waitForTimeout(1600);
  for (const id of state.press) {
    if (renderer === 'silk') {
      const at = await page.evaluate((elId) => window.__silk.pointOf(elId), id);
      if (!at) throw new Error(`silk has no box for ${id} in ${state.name}`);
      await page.mouse.click(at.x, at.y);
    } else {
      await page.click(`#${id}`);
    }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(400);
  const buf = await page.screenshot();
  await page.close();
  return buf;
}

/** Compare two PNGs in a browser page: decode both, count differing pixels. */
async function diff(aBuf, bBuf) {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ([a, b]) => {
      const load = (data) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () => res(img);
          img.src = `data:image/png;base64,${data}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const read = (img) => {
        const c = new OffscreenCanvas(w, h);
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, w, h).data;
      };
      const pa = read(ia);
      const pb = read(ib);
      const out = new Uint8ClampedArray(w * h * 4);
      let differing = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
        const bad = d > 24;
        if (bad) differing++;
        out[i] = bad ? 255 : pa[i] * 0.25;
        out[i + 1] = bad ? 0 : pa[i + 1] * 0.25;
        out[i + 2] = bad ? 128 : pa[i + 2] * 0.25;
        out[i + 3] = 255;
      }
      const c = new OffscreenCanvas(w, h);
      c.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
      const blob = await c.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (const byte of buf) bin += String.fromCharCode(byte);
      return { w, h, differing, total: w * h, png: btoa(bin) };
    },
    [aBuf.toString('base64'), bBuf.toString('base64')],
  );
  await page.close();
  return result;
}

const only = process.argv[3];
let worst = 0;
for (const state of STATES) {
  if (only && state.name !== only) continue;
  const dom = await shoot('dom', state);
  const silk = await shoot('silk', state);
  writeFileSync(`${out}${state.name}-dom.png`, dom);
  writeFileSync(`${out}${state.name}-silk.png`, silk);
  const d = await diff(dom, silk);
  writeFileSync(`${out}${state.name}-diff.png`, Buffer.from(d.png, 'base64'));
  const pct = (d.differing / d.total) * 100;
  worst = Math.max(worst, pct);
  console.log(`${state.name.padEnd(9)} ${pct.toFixed(2)}% of pixels differ  → parity/${state.name}-diff.png`);
}
console.log(`\nworst state: ${worst.toFixed(2)}%`);
await browser.close();
