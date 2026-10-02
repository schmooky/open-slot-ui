import { test, expect, type Page } from '@playwright/test';
import { shots } from './_helpers';

/**
 * FREE ROUNDS AN OPERATOR GAVE AWAY.
 *
 * With `hud.freeRounds: 'takeover'`, a running campaign gives the round button's
 * place to a TOTAL WIN | FREE ROUNDS box and steps the whole action panel aside,
 * because the HUD plays those rounds itself.
 *
 * This runs on every device project, which is the point: the takeover shipped
 * once with its labels clipped in landscape, where the skin turns the panel into a
 * fixed column pinned to the right edge. Desktop and portrait looked perfect. So
 * the assertions here are the ones a screenshot cannot make for you — does every
 * readout fit inside its own box, on this device, in this orientation.
 */
const DIR = shots('free-rounds');

interface Takeover {
  active: boolean;
  visible: boolean;
  counter: string | null;
  /** Nothing is cut off: no box is narrower than the words inside it. */
  fits: boolean;
  /** The items, so a failure says WHICH readout was clipped. */
  items: Array<{ id: string; width: number; scrollWidth: number; text: string }>;
  actionPanel: string;
  spinWidth: number;
  /** The stake stays readable in the data panel, as it does during free spins. */
  betVisible: boolean;
}

const read = (page: Page): Promise<Takeover> =>
  page.evaluate(() => {
    const panel = document.querySelector('.FreeRoundsPanel');
    const root = document.querySelector('[data-openui-free-rounds]') as HTMLElement | null;
    const action = document.querySelector('.ActionPanel');
    const spin = document.querySelector('.CircleButton--place-bet');
    const bet = document.querySelector('#BetAmountStaticItem');
    const items = panel ? ([...panel.children] as HTMLElement[]).filter((el) => el.id) : [];
    // WIDTH is the axis that clips: the panel hides its overflow, and a readout
    // whose box is narrower than its own label loses the ends of the words. Height
    // is not checked, because `scrollHeight` on these items runs a pixel or two
    // over `clientHeight` from ordinary line-box rounding, on every device, with
    // nothing cut off.
    const snug = (el: Element): boolean => el.scrollWidth <= el.clientWidth + 1;
    return {
      active: root?.dataset.openuiFreeRounds === 'true',
      visible: !!panel?.classList.contains('is-visible'),
      counter: document.querySelector('#FreeRoundsCounterValue')?.textContent?.trim() ?? null,
      fits: !!panel && snug(panel) && items.every(snug),
      items: items.map((el) => ({
        id: el.id,
        width: Math.round(el.getBoundingClientRect().width),
        scrollWidth: el.scrollWidth,
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })),
      actionPanel: action ? getComputedStyle(action).display : '(absent)',
      spinWidth: spin ? Math.round(spin.getBoundingClientRect().width) : 0,
      betVisible: !!bet && bet.getBoundingClientRect().width > 0,
    };
  });

const setCount = (page: Page, n: number): Promise<void> =>
  page.evaluate((count) => (window as unknown as { openui: { setFreeRounds(n: number): void } }).openui.setFreeRounds(count), n);

test.describe('free-rounds takeover', () => {
  test('the box takes the bar, reads in full, and gives it back at zero', async ({ page }, testInfo) => {
    await page.goto('/?fr=8');
    await page.waitForFunction(() => !!(window as unknown as { openui?: unknown }).openui, undefined, { timeout: 25_000 });
    await page.waitForTimeout(600); // the skin's own transition

    const on = await read(page);
    await page.screenshot({ path: `${DIR}${testInfo.project.name}.png` });

    expect(on.active, 'the root should carry data-openui-free-rounds').toBe(true);
    expect(on.visible, 'the free-rounds box should be on screen').toBe(true);
    expect(on.counter, 'the counter should read what the operator granted').toBe('8');

    // The ids are the contract: a skin hangs its own rules on them, so they have to
    // be there wherever the box sits.
    expect(on.items.map((i) => i.id).sort()).toEqual(['FreeRoundsCounterItem', 'FreeRoundsWinItem']);

    // THE REGRESSION. Each readout is label over value; if the item is narrower
    // than its label the panel's `overflow: hidden` eats the ends of the words —
    // "OTAL WIN", "EE ROUNDS" — which is what landscape shipped with.
    expect(on.fits, `a readout is clipped: ${JSON.stringify(on.items)}`).toBe(true);

    // The controls step aside, because they have nothing to control.
    expect(on.actionPanel, 'the action panel should step aside').toBe('none');
    expect(on.spinWidth, 'the round button should not be on screen').toBe(0);
    expect(on.betVisible, 'the stake stays readable in the data panel').toBe(true);

    // ...and the campaign ending puts the bar back, in one call.
    await setCount(page, 0);
    await page.waitForTimeout(600);
    const off = await read(page);
    expect(off.active, 'the flag should clear').toBe(false);
    expect(off.visible, 'the box should go away').toBe(false);
    expect(off.actionPanel, 'the action panel should come back').not.toBe('none');
    expect(off.spinWidth, 'the round button should come back').toBeGreaterThan(40);
  });

  test('a count that arrives mid-session takes the bar the same way', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the arrival path is device-independent; runs once');
    await page.goto('/');
    await page.waitForFunction(() => !!(window as unknown as { openui?: unknown }).openui, undefined, { timeout: 25_000 });
    await page.waitForTimeout(400);

    expect((await read(page)).active, 'no campaign on a plain boot').toBe(false);

    await setCount(page, 25);
    await page.waitForTimeout(600);
    const on = await read(page);
    expect(on.active).toBe(true);
    expect(on.counter).toBe('25');
    expect(on.fits, `a readout is clipped: ${JSON.stringify(on.items)}`).toBe(true);
  });
});
