import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The landing page's images, shot from the GALLERY's own stories.
 *
 * They are the only pictures of the UI on this site, and they are taken from the
 * same stories a reader can open live — so a screenshot here can never show a HUD
 * that no longer exists. Run it against a dev server:
 *
 *   pnpm --dir apps/site dev            # in one terminal
 *   node apps/site/scripts/shoot-hero.mjs
 */
const base = process.argv[2] ?? 'http://localhost:5210';
const out = fileURLToPath(new URL('../public/hero/', import.meta.url));
mkdirSync(out, { recursive: true });

// `clip` is a selector plus padding: a HUD lives at the bottom of a game screen, so
// a full-viewport shot is mostly the empty stage it sits on. The bar is the subject.
const SHOTS = [
  { id: 'bar-idle', file: 'hud-desktop.png', w: 1440, h: 900, clip: { sel: '#UiWrapper, .ToggleButton__container--feature-buy, .ActionPanel__container--game-actions', pad: 40 } },
  { id: 'bar-phone', file: 'hud-mobile.png', w: 390, h: 844, clip: { sel: '#UiWrapper, .ToggleButton__container--feature-buy', pad: 24 } },
  { id: 'control-autoplay-panel', file: 'autoplay-drawer.png', w: 1440, h: 900, clip: { sel: '.HacksawCasinoUiContainer', pad: 0, bottom: 520 } },
  { id: 'window-info', file: 'menu.png', w: 1440, h: 900, clip: { sel: '#GameInfoWindow', pad: 0 } },
  { id: 'window-buy', file: 'buy-sheet.png', w: 1440, h: 900, clip: { sel: '#FeatureBuyWindow', pad: 0 } },
];

const browser = await chromium.launch();
for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h }, deviceScaleFactor: 2 });
  await page.goto(`${base}/stories/?id=${shot.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  let clip;
  if (shot.clip) {
    clip = await page.evaluate(({ sel, pad, bottom }) => {
      // `bottom` asks for a strip of that height at the foot of the screen instead.
      if (bottom) return { x: 0, y: Math.max(0, innerHeight - bottom), width: innerWidth, height: Math.min(bottom, innerHeight) };
      // The union of everything named: the bar plus the coins that hang off it, so
      // a crop of "the bar" is never a crop through the middle of one.
      const boxes = [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
      if (!boxes.length) return null;
      const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - pad);
      const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - pad);
      const right = Math.min(innerWidth, Math.max(...boxes.map((b) => b.right)) + pad);
      const bot = Math.min(innerHeight, Math.max(...boxes.map((b) => b.bottom)) + pad);
      return { x: left, y: top, width: right - left, height: bot - top };
    }, shot.clip);
  }
  await page.screenshot({ path: out + shot.file, ...(clip ? { clip } : {}) });
  console.log(`${shot.file}  ←  /stories/?id=${shot.id}`);
  await page.close();
}
await browser.close();
