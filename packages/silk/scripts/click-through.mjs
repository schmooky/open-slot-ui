import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * CLICK THROUGH THE CANVAS HUD.
 *
 * The canvas has no DOM to assert against, so the only way to know that the menu
 * opens is to press where the menu button is and ask the binding which state it drew.
 * This walks the same five doors a player walks through, shooting each one.
 *
 *   node packages/silk/scripts/click-through.mjs [url]
 */
const url = process.argv[2] ?? 'http://localhost:5199/?renderer=silk';
const dir = fileURLToPath(new URL('../parity/states', import.meta.url));
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
try {
  await page.waitForFunction(() => !!window.__silk, null, { timeout: 15000 });
} catch {
  console.log('the canvas binding never published itself. console says:');
  console.log(`  ${errors.slice(0, 8).join('\n  ') || '(nothing)'}`);
  await page.screenshot({ path: `${dir}/boot-failure.png` });
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1500);

/** Press the centre of a captured element, in page pixels. */
const press = async (id) => {
  const at = await page.evaluate((elId) => window.__silk?.pointOf(elId) ?? null, id);
  if (!at) return `no such box: ${id}`;
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(450);
  return null;
};

const steps = [
  { want: 'idle', press: null },
  { want: 'menu', press: 'MainMenuToggle' },
  { want: 'info', press: 'GameInfoBtn' },
  { want: 'idle', press: 'GameInfoClose' },
  { want: 'menu', press: 'MainMenuToggle' },
  { want: 'history', press: 'BetHistoryBtn' },
  { want: 'idle', press: 'BetHistoryClose' },
  { want: 'autoplay', press: 'AutoplayBtn' },
  { want: 'idle', press: 'AutoplayBtn' },
  { want: 'buy', press: 'FeatureBuyToggle' },
  { want: 'idle', press: 'FeatureBuyClose' },
];

let bad = 0;
for (const [i, step] of steps.entries()) {
  if (step.press) {
    const err = await press(step.press);
    if (err) { console.log(`  ! ${err}`); bad++; continue; }
  }
  const got = await page.evaluate(() => window.__silk?.state());
  const ok = got === step.want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(i).padStart(2)} ${(step.press ?? 'load').padEnd(18)} → ${got}${ok ? '' : ` (wanted ${step.want})`}`);
  await page.screenshot({ path: `${dir}/${String(i).padStart(2, '0')}-${step.press ?? 'load'}-${got}.png` });
}

// The doors are one half of it; the other is that the buttons do something. These
// press the ones that change a number and read the number back off the canvas.
const valueOf = (id) => page.evaluate((elId) => window.__silk?.textOf(elId) ?? null, id);
const before = await valueOf('BetAmountValue');
await press('BetAmountIncrease');
const up = await valueOf('BetAmountValue');
await press('BetAmountDecrease');
const back = await valueOf('BetAmountValue');
const stepped = before !== up && back === before;
if (!stepped) bad++;
console.log(`${stepped ? 'ok  ' : 'FAIL'} 11 bet changers      → ${before} → ${up} → ${back}`);

const balance = await valueOf('BalanceValue');
await press('PlaceBetBtn');
await page.waitForTimeout(1200);
const spun = (await valueOf('BalanceValue')) !== balance;
if (!spun) bad++;
console.log(`${spun ? 'ok  ' : 'FAIL'} 12 round button       → balance ${balance} → ${await valueOf('BalanceValue')}`);

if (errors.length) console.log(`\nconsole errors:\n  ${errors.slice(0, 6).join('\n  ')}`);
console.log(`\n${bad === 0 && errors.length === 0 ? 'all doors open' : `${bad} bad transitions, ${errors.length} console errors`}`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);
