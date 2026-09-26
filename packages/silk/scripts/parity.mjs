import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ARE THE TWO RENDERERS THE SAME PICTURE?
 *
 * Photographs the DOM bar and the silk bar at the same size, over the same clip,
 * and compares them pixel by pixel. It reports the share of pixels that differ by
 * more than a tolerance, and writes the two shots plus a difference map so a
 * regression can be looked at rather than argued about.
 *
 *   node packages/silk/scripts/parity.mjs [baseUrl]
 */
const base = process.argv[2] ?? 'http://localhost:5199';
const out = fileURLToPath(new URL('../parity/', import.meta.url));
mkdirSync(out, { recursive: true });

const VIEW = { width: 1440, height: 900 };
const CASES = [
  { name: 'usd', query: '' },
  { name: 'irr', query: '?currency=IRR' },
];

/**
 * Both pages are given the same flat backdrop. The plate is semi-transparent, so
 * what is behind it is part of its colour — and the example client has a whole slot
 * back there. Flattening both is what makes the comparison about the HUD.
 */
const BACKDROP = '1a1d21';

const browser = await chromium.launch();

/** The clip both renderers are judged over: the plate plus the parts that hang off it. */
const CLIP = async (page) =>
  page.evaluate(() => {
    const sel = ['#UiWrapper', '.ToggleButton__container--feature-buy', '.ActionPanel__container--game-actions'];
    const boxes = sel.flatMap((s) => [...document.querySelectorAll(s)]).map((el) => el.getBoundingClientRect());
    if (boxes.length) {
      const pad = 24;
      const x = Math.max(0, Math.min(...boxes.map((b) => b.left)) - pad);
      const y = Math.max(0, Math.min(...boxes.map((b) => b.top)) - pad);
      const r = Math.min(innerWidth, Math.max(...boxes.map((b) => b.right)) + pad);
      const bo = Math.min(innerHeight, Math.max(...boxes.map((b) => b.bottom)) + pad);
      return { x: Math.round(x), y: Math.round(y), width: Math.round(r - x), height: Math.round(bo - y) };
    }
    // The canvas renderer has no elements to measure: it reports its own box.
    const hud = window.hud;
    return hud?.clip?.() ?? null;
  });

const shoot = async (url, clip) => {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content: `#GameWrapper, body { background: #${BACKDROP} !important; } #GameWrapper > canvas { display: none !important; }`,
  });
  await page.waitForTimeout(1500);
  const region = clip ?? (await CLIP(page));
  const buf = await page.screenshot(region ? { clip: region } : {});
  await page.close();
  return { buf, region };
};

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

let worst = 0;
for (const c of CASES) {
  const dom = await shoot(`${base}/${c.query}`);
  const sep = c.query ? '&' : '?';
  const silk = await shoot(`${base}/tests/fixtures/silk-hud.html${c.query}${sep}bg=${BACKDROP}`, dom.region);
  writeFileSync(`${out}${c.name}-dom.png`, dom.buf);
  writeFileSync(`${out}${c.name}-silk.png`, silk.buf);
  const d = await diff(dom.buf, silk.buf);
  writeFileSync(`${out}${c.name}-diff.png`, Buffer.from(d.png, 'base64'));
  const pct = (d.differing / d.total) * 100;
  worst = Math.max(worst, pct);
  console.log(`${c.name.padEnd(4)} ${d.w}×${d.h}  ${pct.toFixed(2)}% of pixels differ  → parity/${c.name}-diff.png`);
}
console.log(`\nworst: ${worst.toFixed(2)}%`);
await browser.close();
