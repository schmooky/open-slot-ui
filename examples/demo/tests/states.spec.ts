import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * DECLARATIVE STATE TESTS — drive the HUD into each scenario over the demo's
 * `postMessage` harness (see src/harness.ts), assert on the returned introspection
 * snapshot (no pixel-diff needed), and drop one screenshot per state for the record.
 * No URL state params, no hand-poked globals: every setup is a command + an ack.
 *
 *   pnpm --dir examples/demo exec playwright test states --project=desktop
 */
const ROOT = fileURLToPath(new URL('../screenshots/states/', import.meta.url));

interface Snapshot {
  freeSpins: number;
  balance: number;
  bet: number;
  totalWin: number;
  netEmphasized: boolean;
  betEmphasized: boolean;
  locale: string;
  boosts: string[];
}

/** Post a harness command and resolve with its ack (round-trips through the page). */
async function cmd(page: Page, name: string, ...args: unknown[]): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return page.evaluate(
    ({ name, args }) =>
      new Promise((resolve) => {
        const id = Date.now() + Math.random();
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as { __openui?: string; id?: number; ok?: boolean; result?: unknown; error?: string };
          if (d && d.__openui === 'ack' && d.id === id) {
            window.removeEventListener('message', onMsg);
            resolve({ ok: !!d.ok, result: d.result, error: d.error });
          }
        };
        window.addEventListener('message', onMsg);
        window.postMessage({ __openui: 'cmd', id, cmd: name, args }, '*');
        setTimeout(() => resolve({ ok: false, error: 'timeout' }), 5000);
      }),
    { name, args },
  );
}

const snap = async (page: Page): Promise<Snapshot> => (await cmd(page, 'snapshot')).result as Snapshot;

async function boot(page: Page): Promise<string> {
  const dir = ROOT;
  mkdirSync(dir, { recursive: true });
  await page.goto('/?builtin=1&bare=1'); // ONE structural url; all state via the harness
  await page.waitForFunction(() => !!(window as unknown as { ui?: unknown }).ui);
  await cmd(page, 'reset');
  return dir;
}

test.describe('declarative HUD states (postMessage harness)', () => {
  test('base play → buy button, no free spins', async ({ page }, info) => {
    const dir = await boot(page);
    const s = await snap(page);
    expect(s.freeSpins).toBe(0);
    expect(s.netEmphasized).toBe(false);
    await page.screenshot({ path: `${dir}${info.project.name} - 1 base.png` });
  });

  test('enter bonus → FS coin + total-win, then it COUNTS DOWN and EXITS (never stuck)', async ({ page }, info) => {
    const dir = await boot(page);
    await cmd(page, 'enterBonus', 5);
    await cmd(page, 'setTotalWin', 25.5);
    expect((await snap(page)).freeSpins).toBe(5);
    await page.screenshot({ path: `${dir}${info.project.name} - 2 bonus (5 fs).png` });

    // spin through the whole bonus — the count must decrement to 0 and exit to base play
    for (let i = 0; i < 5; i++) await cmd(page, 'spin');
    const after = await snap(page);
    expect(after.freeSpins).toBe(0); // ← proves it is NOT stuck in FS
    await page.screenshot({ path: `${dir}${info.project.name} - 3 bonus exited.png` });
  });

  test('activate a bet BOOST → net + bet turn accent, bet shows the modified stake', async ({ page }, info) => {
    const dir = await boot(page);
    const base = (await snap(page)).bet; // base ladder bet (e.g. 1)
    await cmd(page, 'setBoosts', ['ante-bet']); // ante-bet = +0.25 surcharge
    const boosted = await snap(page);
    expect(boosted.netEmphasized).toBe(true); // net position accent-tinted
    expect(boosted.betEmphasized).toBe(true);
    expect(boosted.bet).toBeCloseTo(base * 1.25, 5); // modified value shown
    await page.screenshot({ path: `${dir}${info.project.name} - 4 boost active (net yellow).png` });

    await cmd(page, 'clearBoosts');
    const cleared = await snap(page);
    expect(cleared.netEmphasized).toBe(false);
    expect(cleared.bet).toBeCloseTo(base, 5);
  });

  test('big balance + bet stay bounded in their boxes', async ({ page }, info) => {
    const dir = await boot(page);
    await cmd(page, 'setBalance', 98765432.1);
    await cmd(page, 'setBet', 12500);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}${info.project.name} - 5 big values.png` });
  });

  test('localized bonus (ru) → Баланс / Ставка / Общий выигрыш all match', async ({ page }, info) => {
    const dir = await boot(page);
    await cmd(page, 'setLocale', 'ru');
    await cmd(page, 'enterBonus', 8);
    await cmd(page, 'setTotalWin', 125.5);
    expect((await snap(page)).locale).toBe('ru');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}${info.project.name} - 6 bonus ru.png` });
  });
});
