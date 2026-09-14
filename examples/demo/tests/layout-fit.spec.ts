import { test, expect } from '@playwright/test';

/**
 * THE BAR MUST FIT.
 *
 * The plate is not the whole bar: the buy coin hangs outside it, so a fit that
 * measures the plate alone pushes the coin off the left edge. And the skin arrives
 * as a stylesheet link — a fit computed before it loads is measuring the wrong tree.
 * Both of those shipped as bugs; this is the guard.
 */
const WIDTHS = [1920, 1600, 1440, 1280, 1024, 900, 800, 700];

test.describe('the HUD fits the window', () => {
  test('at every desktop width, nothing hangs off either edge', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(250);

      const box = await page.evaluate(() => {
        const q = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null;
        const plate = q('.UiRibbonUserPanel__container')!;
        const coin = q('.ToggleButton__container--feature-buy');
        return {
          left: Math.min(plate.left, coin?.left ?? plate.left),
          right: Math.max(plate.right, coin?.right ?? plate.right),
          bottom: plate.bottom,
        };
      });

      expect(box.left, `bar overflows the LEFT at ${width}px`).toBeGreaterThanOrEqual(-1);
      expect(box.right, `bar overflows the RIGHT at ${width}px`).toBeLessThanOrEqual(width + 1);
      expect(box.bottom, `bar overflows the BOTTOM at ${width}px`).toBeLessThanOrEqual(801);
    }
  });

  test('the buy sheet fits too — the skin pins its grid to a fixed width', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);
    await page.locator('#FeatureBuyToggle').click();
    await page.waitForTimeout(400);

    // [data-total-item-count="4"] asks for 1150px; these windows do not have it.
    for (const width of [1400, 1200, 1000, 820]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);
      const span = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.FeatureBuyGridCard')].map((c) => c.getBoundingClientRect());
        return { left: Math.min(...cards.map((c) => c.left)), right: Math.max(...cards.map((c) => c.right)) };
      });
      expect(span.left, `sheet overflows LEFT at ${width}px`).toBeGreaterThanOrEqual(-1);
      expect(span.right, `sheet overflows RIGHT at ${width}px`).toBeLessThanOrEqual(width + 1);
    }
  });

  test('it is centred when there is room, and only shrinks when there is not', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);

    const read = async (): Promise<{ scale: number; slackLeft: number; slackRight: number }> =>
      page.evaluate(() => {
        const wrap = document.getElementById('UiWrapper')!;
        const m = new DOMMatrixReadOnly(getComputedStyle(wrap).transform);
        const plate = document.querySelector('.UiRibbonUserPanel__container')!.getBoundingClientRect();
        const coin = document.querySelector('.ToggleButton__container--feature-buy')?.getBoundingClientRect();
        const left = Math.min(plate.left, coin?.left ?? plate.left);
        const right = Math.max(plate.right, coin?.right ?? plate.right);
        return { scale: m.a || 1, slackLeft: left, slackRight: window.innerWidth - right };
      });

    await page.setViewportSize({ width: 1600, height: 800 });
    await page.waitForTimeout(250);
    const roomy = await read();
    expect(roomy.scale, 'a wide window must not blow the bar up').toBeCloseTo(1, 2);
    expect(Math.abs(roomy.slackLeft - roomy.slackRight), 'the bar is off-centre').toBeLessThan(3);

    await page.setViewportSize({ width: 720, height: 800 });
    await page.waitForTimeout(250);
    const tight = await read();
    expect(tight.scale, 'a narrow window must shrink the bar').toBeLessThan(1);
    expect(tight.slackLeft).toBeGreaterThanOrEqual(-1);
  });
});
