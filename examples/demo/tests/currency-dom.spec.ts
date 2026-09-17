import { test, expect, type Page } from '@playwright/test';
import { shots } from './_helpers';

/**
 * MONEY THAT DOES NOT FIT.
 *
 * Two shapes break naive HUDs: a zero-decimal currency whose numbers run to twelve
 * digits (IRR), and crypto with a long fraction (mBTC). Both go through the same
 * readouts, the same bet widget and the same buy sheet, on every device — so these
 * assert the FORMAT (the core's job) and the LAYOUT (the skin's), together.
 */
const DIR = shots('currency');

interface Box { x: number; y: number; width: number; height: number }

const boxOf = async (page: Page, id: string): Promise<Box> => {
  const b = await page.locator(`#${id}`).boundingBox();
  if (!b) throw new Error(`#${id} has no box`);
  return b;
};

/** Two boxes must not share pixels — readouts that collide are unreadable. */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const CASES = [
  {
    name: 'IRR',
    query: 'currency=IRR&balance=987654321000&bet=5000000&win=123456789',
    balance: '987,654,321,000 IRR',
    bet: '5,000,000 IRR',
    win: '123,456,789 IRR',
  },
  {
    name: 'mBTC',
    query: 'currency=mBTC&balance=1234.56789&bet=0.05&win=98765.4321',
    balance: '1,234.56789 mBTC',
    bet: '0.05000 mBTC',
    win: '98,765.43210 mBTC',
  },
];

for (const c of CASES) {
  test.describe(`${c.name} — big and long money`, () => {
    test('the readouts print in full and keep off each other', async ({ page }, testInfo) => {
      await page.goto(`/?${c.query}`);
      await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);
      await page.waitForTimeout(500);

      // FORMAT: every digit, the right separator, the right precision.
      await expect(page.locator('#BalanceValue')).toHaveText(c.balance);
      await expect(page.locator('#WinAmountValue')).toHaveText(c.win);
      // The bet shows in the action panel on desktop and in the strip on a phone;
      // whichever is on screen must carry the full figure.
      const betTexts = await page.locator('#BetAmountValue, #BetAmountStaticValue').allTextContents();
      expect(betTexts.some((t) => t === c.bet)).toBe(true);

      // LAYOUT: nothing spills off the viewport, and the readouts do not collide.
      const view = page.viewportSize()!;
      const ids = ['BalanceValue', 'WinAmountValue'];
      const boxes: Box[] = [];
      for (const id of ids) {
        const b = await boxOf(page, id);
        expect(b.x, `${id} starts off-screen`).toBeGreaterThanOrEqual(-1);
        expect(b.x + b.width, `${id} overflows the right edge`).toBeLessThanOrEqual(view.width + 1);
        expect(b.y + b.height, `${id} overflows the bottom`).toBeLessThanOrEqual(view.height + 1);
        boxes.push(b);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i]!, boxes[j]!), `${ids[i]} overlaps ${ids[j]}`).toBe(false);
        }
      }

      await page.screenshot({ path: `${DIR}${testInfo.project.name}__${c.name}.png` });
    });

    test('the buy sheet prices in the same money, and its cards stay on screen', async ({ page }) => {
      await page.goto(`/?${c.query}`);
      await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);
      await page.waitForTimeout(400);
      await page.locator('#FeatureBuyToggle').click();
      await page.waitForTimeout(400);

      const prices = await page.locator('.FeatureBuyGridCard__description--value').allTextContents();
      expect(prices.length).toBeGreaterThan(0);
      // Same currency, same precision — a card that prints raw floats is a bug.
      const suffix = c.name;
      for (const p of prices) expect(p.endsWith(suffix), `"${p}" is not ${suffix}`).toBe(true);
      if (c.name === 'mBTC') for (const p of prices) expect(p).toMatch(/\.\d{5} mBTC$/);
      if (c.name === 'IRR') for (const p of prices) expect(p).not.toContain('.');

      // The sheet's own BET selector carries the figure too, and nothing overflows.
      await expect(page.locator('#FeatureBuyAmountValue')).toHaveText(c.bet);
      const view = page.viewportSize()!;
      for (const card of await page.locator('.FeatureBuyGridCard').all()) {
        const b = await card.boundingBox();
        if (!b) continue;
        expect(b.x, 'a card starts off-screen').toBeGreaterThanOrEqual(-1);
        expect(b.x + b.width, 'a card overflows the right edge').toBeLessThanOrEqual(view.width + 1);
      }
    });
  });
}

/**
 * THE BAR DOES NOT GROW WITH THE NUMBER.
 *
 * A rial balance is three times the width of a dollar one at the same font size.
 * The reference's answer is to size a readout off its own length (`data-charcount`,
 * one rule per length), so the plate keeps its geometry and the round button — which
 * hangs off the plate's right edge — stays on the screen. Before this, IRR pushed it
 * clean off a 620px window.
 */
test.describe('long money keeps the shape of the bar', () => {
  const HUGE = 'currency=IRR&balance=98765432100000&bet=5000000&win=25000000000000';

  const widthOf = async (page: Page, sel: string): Promise<number> =>
    (await page.locator(sel).boundingBox())?.width ?? 0;

  test('the whole bar, overhangs included, stays inside the window', async ({ page }) => {
    await page.goto(`/?${HUGE}`);
    await page.waitForFunction(() => !!document.querySelector('.HacksawCasinoUiContainer'));
    await page.waitForTimeout(700);
    const view = page.viewportSize()!;
    // The round button on the right and the buy coin on the left hang OUTSIDE the
    // plate; the fit has to measure them, not just the plate. The phone layout lets
    // the coin bleed a few pixels past the edge by design, so what is checked is
    // that essentially all of each part is on screen — not that it is pixel-inside.
    const slack = 4;
    for (const sel of ['#PlaceBetBtn', '#FeatureBuyToggle', '.UiRibbonUserPanel__container']) {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) continue;
      expect(b.x, `${sel} starts off-screen`).toBeGreaterThanOrEqual(-slack);
      expect(b.x + b.width, `${sel} hangs off the right edge`).toBeLessThanOrEqual(view.width + slack);
    }
  });

  test('a long value shrinks itself instead of stretching its slot', async ({ page }) => {
    await page.goto(`/?${HUGE}`);
    await page.waitForFunction(() => !!document.querySelector('.HacksawCasinoUiContainer'));
    await page.waitForTimeout(700);
    const long = await page.evaluate(() => {
      const el = document.getElementById('BalanceValue')!;
      return { count: el.dataset.charcount, size: parseFloat(getComputedStyle(el).fontSize), slot: Math.round(el.parentElement!.getBoundingClientRect().width) };
    });
    expect(long.count).toBe('22'); // "98,765,432,100,000 IRR"
    const plateLong = await widthOf(page, '.UiRibbonUserPanel__container');

    await page.goto('/?currency=USD&balance=12345.67&bet=1&win=0');
    await page.waitForFunction(() => !!document.querySelector('.HacksawCasinoUiContainer'));
    await page.waitForTimeout(700);
    const short = await page.evaluate(() => {
      const el = document.getElementById('BalanceValue')!;
      return { count: el.dataset.charcount, size: parseFloat(getComputedStyle(el).fontSize) };
    });
    const plateShort = await widthOf(page, '.UiRibbonUserPanel__container');

    // The rial is set smaller than the base size the dollar gets — on a phone both
    // land on the stylesheet's 10px floor, so the honest assertion is "no larger,
    // and well under the 24px a short value is set at".
    expect(long.size).toBeLessThanOrEqual(short.size);
    expect(long.size).toBeLessThan(16);
    expect(short.count).toBe('10'); // "$12,345.67"
    // …and the plate is the same bar either way.
    expect(Math.abs(plateLong - plateShort)).toBeLessThanOrEqual(2);
  });

  test('the stake charged is the stake shown', async ({ page }) => {
    await page.goto(`/?${HUGE}`);
    await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);
    await page.waitForTimeout(900);
    const read = (t: string): number => Number(t.replace(/[^\d]/g, ''));
    const before = read(await page.locator('#BalanceValue').innerText());
    const bet = read((await page.locator('#BetAmountValue, #BetAmountStaticValue').allTextContents()).find(Boolean) ?? '0');
    await page.locator('#PlaceBetBtn').click();
    await page.waitForTimeout(1200);
    const after = read(await page.locator('#BalanceValue').innerText());
    expect(before - after, 'the round charged something other than the bet on the bar').toBe(bet);
  });
});
