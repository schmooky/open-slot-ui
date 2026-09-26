import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * MEASURE THE DOM HUD, so the canvas one can match it.
 *
 * This binding has to look like the binding it forks — the same bar, drawn with
 * pixi-silk instead of markup and CSS. Eyeballing that is how two renderers drift,
 * so the geometry is not guessed: this opens the DOM HUD in a real browser, reads
 * every box and computed colour off the live skin, and writes the numbers out as
 * `src/skin.generated.ts`. Re-run it when the skin changes.
 *
 *   node packages/silk/scripts/extract-skin.mjs [url]
 */
const url = process.argv[2] ?? 'http://localhost:5199/';
const out = fileURLToPath(new URL('../src/skin.generated.ts', import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('.UiRibbonUserPanel__container');
await page.waitForTimeout(1200);

const manifest = await page.evaluate(() => {
  const plate = document.querySelector('.UiRibbonUserPanel__container');
  const origin = plate.getBoundingClientRect();
  const px = (v) => Math.round(parseFloat(v) * 100) / 100;
  const box = (sel, root = document) => {
    const el = typeof sel === 'string' ? root.querySelector(sel) : sel;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round((b.left - origin.left) * 100) / 100,
      y: Math.round((b.top - origin.top) * 100) / 100,
      w: Math.round(b.width * 100) / 100,
      h: Math.round(b.height * 100) / 100,
      bg: cs.backgroundColor,
      color: cs.color,
      radius: px(cs.borderTopLeftRadius),
      font: { size: px(cs.fontSize), weight: cs.fontWeight, family: cs.fontFamily.split(',')[0].replace(/"/g, ''), spacing: cs.letterSpacing, transform: cs.textTransform },
      border: { width: px(cs.borderTopWidth), color: cs.borderTopColor },
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow,
      text: (el.textContent || '').trim().slice(0, 40),
    };
  };
  const ids = [
    'UiWrapper', 'MainPanel', 'DataPanel', 'ActionPanel', 'FeatureBuyToggle', 'MainMenuToggle',
    'BalanceItem', 'BalanceLabel', 'BalanceValue', 'WinAmountItem', 'WinAmountLabel', 'WinAmountValue',
    'BetAmountItem', 'BetAmountLabel', 'BetAmountValue', 'BetAmountIndicatorProgress',
    'BetAmountIncrease', 'BetAmountDecrease', 'PlaceBetBtn', 'AutoplayBtn', 'FeedbackMsg',
  ];
  const out = { plate: { w: Math.round(origin.width * 100) / 100, h: Math.round(origin.height * 100) / 100, ...box(plate) } };
  for (const id of ids) out[id] = box(`#${id}`);
  out['BetAmountProgressbar'] = box('.BetAmountProgressbar');
  out['divider'] = box('.divider--vertical');
  out['coinContainer'] = box('.ToggleButton__container--feature-buy');
  out['BetAmountWidget'] = box('.BetAmountWidget__container');
  // The coin is a rotated square with a ring drawn as ::after. Both matter: the
  // circle is 84 across whatever the bounding box says, and the ring is the thing
  // that makes it read as a coin rather than a dot.
  {
    const btn = document.getElementById('FeatureBuyToggle');
    const cs = getComputedStyle(btn);
    const after = getComputedStyle(btn, '::after');
    const m = new DOMMatrixReadOnly(cs.transform);
    out.coin = {
      size: px(cs.width),
      rotation: Math.round(Math.atan2(m.b, m.a) * 10000) / 10000,
      padding: px(cs.padding),
      lineHeight: px(cs.lineHeight),
      ring: after.content === 'none' ? null : { width: px(after.borderTopWidth), color: after.borderTopColor, size: px(after.width), inset: px(after.top) },
    };
  }
  out['BetAmountChangers'] = box('.BetAmountChangersWidget');
  out['actions'] = box('.ActionPanel__container--game-actions');
  // The icon glyphs are a font: record which codepoint each button draws, so the
  // canvas renderer can draw the same glyph from the same font file.
  const glyph = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el, '::before');
    return { content: cs.content, font: cs.fontFamily.split(',')[0].replace(/"/g, ''), size: px(cs.fontSize), color: cs.color };
  };
  out.glyphs = {
    menu: glyph('#MainMenuToggle .icon-menu'),
    spin: glyph('#PlaceBetBtn .icon-spin'),
    autoplay: glyph('#AutoplayBtn .icon-autoplay2'),
    up: glyph('#BetAmountIncrease .icon-arrow-up'),
    down: glyph('#BetAmountDecrease .icon-arrow-down'),
    stop: glyph('#StopBtn .icon-stop'),
  };
  // Where the bar sits against the screen, and what shows through it: the plate is
  // semi-transparent, so its painted colour is a composite and the canvas renderer
  // has to be given the same backdrop to land on the same pixels.
  out.viewport = { w: innerWidth, h: innerHeight };
  out.anchor = { bottomGap: Math.round((innerHeight - origin.bottom) * 100) / 100 };
  out.page = { background: getComputedStyle(document.body).backgroundColor };
  return out;
});
await browser.close();

const body = `/* GENERATED by scripts/extract-skin.mjs — do not edit by hand.
 * Measured from the DOM binding wearing the example skin, at 1440×900, DPR 1.
 * Coordinates are relative to the ribbon plate's top-left corner.
 */
export const SKIN = ${JSON.stringify(manifest, null, 2)} as const;

export type SkinManifest = typeof SKIN;
`;
writeFileSync(out, body);
console.log(`skin manifest → ${out}`);
