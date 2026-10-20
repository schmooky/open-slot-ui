import { describe, it, expect, afterEach } from 'vitest';
import { mountDomHud, type DomHud } from '../src/mountDomHud';

const SPEC = {
  currency: { code: 'USD', symbol: '$', display: 'symbol' as const, position: 'prefix' as const, decimals: 2 },
  betLadder: { levels: [0.5, 1, 2, 5], index: 1 },
  autoplay: { options: [10, 25, 50], lossLimits: [5, 20], winLimits: [10, 20] },
  game: { name: 'Test Game' },
};

let hud: DomHud | null = null;
afterEach(() => {
  hud?.dispose();
  hud = null;
  document.body.innerHTML = '';
});

const root = (): HTMLElement => document.querySelector<HTMLElement>('.OpenSlotUiContainer')!;
const press = (el: Element): MouseEvent => {
  const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
};

describe('focus', () => {
  it('keeps every control out of the Tab order by default', () => {
    hud = mountDomHud(SPEC);
    const controls = [...root().querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')];
    expect(controls.length).toBeGreaterThan(5);
    for (const el of controls) expect(el.tabIndex, el.id || el.className).toBe(-1);
  });

  it('takes rows rendered later out of the Tab order too', async () => {
    hud = mountDomHud(SPEC);
    const late = document.createElement('button');
    root().querySelector('#MainMenu ul')!.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.tabIndex).toBe(-1);
  });

  it('a mouse press does not focus a button, and a field still takes the focus', () => {
    hud = mountDomHud(SPEC);
    expect(press(document.getElementById('BetAmountIncrease')!).defaultPrevented).toBe(true);
    expect(press(document.getElementById('PlaceBetBtn')!).defaultPrevented).toBe(true);
    const field = document.getElementById('LossLimitCustomInput')!;
    expect(press(field).defaultPrevented).toBe(false);
  });

  it('lets go of a focused control after its click, but not of a text field', () => {
    hud = mountDomHud(SPEC);
    const btn = document.getElementById('BetAmountIncrease') as HTMLButtonElement;
    btn.focus();
    btn.click();
    expect(document.activeElement).not.toBe(btn);
    const field = document.getElementById('LossLimitCustomInput') as HTMLInputElement;
    field.focus();
    field.click();
    expect(document.activeElement).toBe(field);
  });

  it('`focus: true` leaves the controls as the browser has them', () => {
    hud = mountDomHud(SPEC, { focus: true });
    expect(document.getElementById('PlaceBetBtn')!.tabIndex).toBe(0);
    expect(press(document.getElementById('PlaceBetBtn')!).defaultPrevented).toBe(false);
  });
});
