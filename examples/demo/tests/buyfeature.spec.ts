import { test, expect, type Page } from '@playwright/test';
import { waitForHud, shots } from './_helpers';

/**
 * The BUY-FEATURE sheet: opened by the BUY BONUS pill, it shows a card per feature
 * (each a one-tap "Buy" or an activatable bet "Boost"), a bet amount with − / +
 * steppers that re-price every card, and it localizes like everything else.
 *
 * The sheet is drawn in Pixi, so the assertions go through the public introspection
 * API + the façade — never through pixels.
 */
const DIR = shots('buyfeature');

const state = (page: Page, id: string): Promise<string | null> =>
  page.evaluate((i) => (window as unknown as { __OPENUI__: { getState(id: string): string | null } }).__OPENUI__.getState(i), id);

const open = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as { ui: { bus: { emit(t: string, p: unknown): void } } }).ui.bus.emit('buttonActivated', { id: 'bonus' }));

test.describe('buy-feature sheet', () => {
  test('opens from the bar as state, locks the HUD, and the backdrop closes it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    await page.goto('/?bare=1');
    await waitForHud(page);

    // closed on load; the BUY BONUS pill opens it — as STATE, not as a pixel
    expect(await state(page, 'buy-feature-panel')).toBe('closed');
    await open(page);
    await expect.poll(() => state(page, 'buy-feature-panel')).toBe('open');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}desktop.png` });

    // the whole HUD is locked while the sheet is up
    const locked = await page.evaluate(() => (window as unknown as { ui: { locked: { get(): boolean } } }).ui.locked.get());
    expect(locked).toBe(true);

    // it closes again from the façade, and the lock is released with it
    await page.evaluate(() => (window as unknown as { ui: { bus: { emit(t: string, p: unknown): void } } }).ui.bus.emit('buttonActivated', { id: 'openui-buy-close' }));
    await page.keyboard.press('Escape');
    await page.mouse.click(20, 20); // the backdrop
    await expect.poll(() => state(page, 'buy-feature-panel')).toBe('closed');
    await expect.poll(() => page.evaluate(() => (window as unknown as { ui: { locked: { get(): boolean } } }).ui.locked.get())).toBe(false);
  });
});
