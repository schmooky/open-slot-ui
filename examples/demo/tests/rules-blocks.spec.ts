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
  for (const cls of ['.ohm-badges', '.ohm-meter', '.ohm-tabs', '.ohm-symbols', '.ohm-rgrid', '.ohm-timeline', '.ohm-compare', '.ohm-kv', '.ohm-gallery', '.ohm-accs', '.ohm-quote', '.ohm-link', '.ohm-stats', '.ohm-callout']) {
    await expect(body.locator(cls).first(), `${cls} is missing from the info window`).toHaveCount(1, { timeout: 5_000 }).catch(async () => {
      // several blocks of a kind are fine — what matters is that at least one exists
      expect(await body.locator(cls).count(), `${cls} is missing from the info window`).toBeGreaterThan(0);
    });
  }
});

test('the tab strip shows one panel at a time and switches on click', async ({ page }) => {
  const tabs = page.locator('#GameInfoBody .ohm-tabs').first();
  const panels = tabs.locator('.ohm-tabpanel');
  await expect(panels).toHaveCount(3);
  // Exactly one panel is visible, and it is the first one.
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeHidden();

  await tabs.locator('label', { hasText: 'Symbols' }).click();
  await expect(panels.nth(1)).toBeVisible();
  await expect(panels.nth(0)).toBeHidden();
  // …and the symbol table inside it is the one the markup declares.
  const rows = panels.nth(1).locator('.ohm-symbols tbody tr');
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

test('an accordion section opens, and its link leaves the game safely', async ({ page }) => {
  const acc = page.locator('#GameInfoBody details.ohm-acc');
  await expect(acc).toHaveCount(3);
  await expect(acc.nth(1)).not.toHaveAttribute('open', '');
  await acc.nth(1).locator('summary').click();
  await expect(acc.nth(1)).toHaveAttribute('open', '');

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
    await body.locator('.ohm-tabs label', { hasText: 'Symbols' }).click();
    const table = await body.locator('.ohm-symbols').first().boundingBox();
    const box = await body.boundingBox();
    expect(table!.width).toBeLessThanOrEqual(box!.width + 1);
    await page.screenshot({ path: `${DIR}/info-mobile.png`, fullPage: false });
  });
});
