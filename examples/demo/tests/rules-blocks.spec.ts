import { test, expect, type Page } from '@playwright/test';
import { shots } from './_helpers';

/**
 * THE RULES, AS BUILDING BLOCKS.
 *
 * The example's rules are not written in TypeScript: they live in `src/rules.xml`
 * and are parsed into `BlockSpec[]`. These tests open the info window the player
 * sees and assert that what the markup declares is actually IN it — the tab strip
 * switches, the symbol table has a row per symbol, the reel grids light the right
 * cells, the fact tokens are resolved, and nothing overflows sideways on a phone.
 */
const DIR = shots('rules');

const openInfo = async (page: Page): Promise<void> => {
  await page.locator('#MainMenuToggle').click();
  await page.locator('#GameInfoBtn').click();
  await expect(page.locator('#GameInfoWindow')).toHaveClass(/is-visible/);
  await page.waitForTimeout(350);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!document.getElementById('GameInfoBody')?.innerHTML, undefined, { timeout: 25_000 });
  await openInfo(page);
});

test('every module the markup declares is rendered', async ({ page }) => {
  const body = page.locator('#GameInfoBody');
  for (const cls of ['.ohm-badges', '.ohm-meter', '.ohm-panels', '.ohm-symbols', '.ohm-rgrid', '.ohm-timeline', '.ohm-compare', '.ohm-kv', '.ohm-gallery', '.ohm-panels', '.ohm-quote', '.ohm-link', '.ohm-stats', '.ohm-callout']) {
    await expect(body.locator(cls).first(), `${cls} is missing from the info window`).toHaveCount(1, { timeout: 5_000 }).catch(async () => {
      // several blocks of a kind are fine — what matters is that at least one exists
      expect(await body.locator(cls).count(), `${cls} is missing from the info window`).toBeGreaterThan(0);
    });
  }
});

test('a tab group reads as titled parts, all of them on the page', async ({ page }) => {
  const body = page.locator('#GameInfoBody');
  // The markup's three tabs render as three open panels — no strip, no radios.
  await expect(body.locator('input[type=radio]')).toHaveCount(0);
  const titles = body.locator('.ohm-panel-title');
  await expect(titles.nth(0)).toHaveText('How to play');
  await expect(titles.nth(1)).toHaveText('Symbols');
  await expect(titles.nth(2)).toHaveText('Numbers');
  for (let i = 0; i < 3; i++) await expect(titles.nth(i)).toBeVisible();

  // …and the symbol table inside the second part is the one the markup declares.
  const rows = body.locator('.ohm-symbols tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Wild');
  await expect(rows.first()).toContainText('50x');
});

test('the reel grids light exactly the cells the markup lists', async ({ page }) => {
  const grids = page.locator('#GameInfoBody .ohm-rgrid');
  expect(await grids.count()).toBeGreaterThanOrEqual(2);
  const first = grids.first();
  await expect(first.locator('i')).toHaveCount(15); // 5 reels × 3 rows, lit or not
  await expect(first.locator('i.on')).toHaveCount(3); // three scatters
  await expect(first.locator('figcaption')).toContainText('Scatters');
});

test('fact tokens resolve against the declared configuration', async ({ page }) => {
  const html = await page.locator('#GameInfoBody').innerHTML();
  expect(html, 'an unresolved {{token}} is showing to the player').not.toMatch(/\{\{[\w.-]+\}\}/);
  await expect(page.locator('#GameInfoBody')).toContainText('10 free spins');
  await expect(page.locator('#GameInfoBody')).toContainText('100× your bet'); // {{cost.free-spins}}
});

test('nothing in the rules is hidden behind a click', async ({ page }) => {
  const body = page.locator('#GameInfoBody');
  // A collapsed section is a section a player can say they never saw, so the
  // document must contain no disclosure widget at all…
  await expect(body.locator('details')).toHaveCount(0);
  await expect(body.locator('summary')).toHaveCount(0);
  // …and every titled panel's copy is on the page, visible, from the start.
  const panels = body.locator('.ohm-panel');
  await expect(panels).toHaveCount(6); // three tab parts + three fine-print sections
  for (const panel of await panels.all()) {
    await expect(panel.locator('.ohm-panel-body')).toBeVisible();
  }
  await expect(body).toContainText('Set a limit before you start.');
  await expect(body).toContainText('Malfunction voids all pays');
});

test('a link out of the game is safe', async ({ page }) => {
  const link = page.locator('#GameInfoBody a.ohm-link').first();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('the rules audit stays silent when every mode is explained', async ({ page }) => {
  await expect(page.locator('#GameInfoBody .ohm-audit')).toHaveCount(0);
});

test('…and speaks up when a section is missing (?forget=1)', async ({ page }) => {
  await page.goto('/?forget=1');
  await page.waitForFunction(() => !!document.getElementById('GameInfoBody')?.innerHTML, undefined, { timeout: 25_000 });
  await openInfo(page);
  const audit = page.locator('#GameInfoBody .ohm-audit');
  await expect(audit).toHaveCount(1);
  await expect(audit).toContainText('Super Spins');
  await expect(audit).toContainText('Ante Bet');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('nothing overflows sideways, and the modules still fit', async ({ page }) => {
    const body = page.locator('#GameInfoBody');
    const over = await body.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(over, 'the info window scrolls sideways').toBeLessThanOrEqual(1);
    const doc = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(doc, 'the page scrolls sideways').toBeLessThanOrEqual(1);

    // Wide blocks are the ones that break first: the symbol table and the grids.
    const table = await body.locator('.ohm-symbols').first().boundingBox();
    const box = await body.boundingBox();
    expect(table!.width).toBeLessThanOrEqual(box!.width + 1);
    await page.screenshot({ path: `${DIR}/info-mobile.png`, fullPage: false });
  });
});
