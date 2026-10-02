import { describe, it, expect } from 'vitest';
import { createUI } from '../src';
import { persistSettings, captureSettings, applySettings, readSettings, type SettingsStorage } from '../src/settings';
import { resolveHudChrome, modePrice, factsVars, auditRules, type ChromeIssue } from '../src';

/** A storage that lives in a Map, and one that refuses everything. */
const memory = (seed?: Record<string, string>): SettingsStorage & { data: Map<string, string> } => {
  const data = new Map(Object.entries(seed ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};
const hostile: SettingsStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
  removeItem: () => undefined,
};

const flush = (): Promise<void> => new Promise((r) => queueMicrotask(() => r()));

describe('settings that survive a reload', () => {
  it('writes what a player chose, and nothing they did not', async () => {
    const ui = createUI({ hud: { features: { superTurbo: true } } });
    const store = memory();
    persistSettings(ui, { key: 'g', storage: store });
    ui.speeds[0]!.base.set(true);
    await flush();
    const saved = JSON.parse(store.data.get('g') as string);
    expect(saved.speeds.turbo.base).toBe(true);
    expect(saved).toHaveProperty('sfx');
    expect(saved).toHaveProperty('muted');
    expect(saved).toHaveProperty('spacebar');
    // per-session decisions are NOT settings
    expect(saved).not.toHaveProperty('bet');
    expect(saved).not.toHaveProperty('autoplay');
  });

  it('restores volumes, master mute, speeds and spacebar', () => {
    const stored = JSON.stringify({ sfx: 0.25, music: 0, muted: true, speeds: { turbo: { base: true, bonus: false } }, spacebar: false });
    const ui = createUI({});
    persistSettings(ui, { key: 'g', storage: memory({ g: stored }) });
    expect(ui.sfxSlider.value.get()).toBe(0.25);
    expect(ui.musicSlider.value.get()).toBe(0);
    expect(ui.muted.get()).toBe(true); // the one hosts kept losing
    expect(ui.speeds[0]!.base.isOn).toBe(true);
    expect(ui.spacebar.isOn).toBe(false);
  });

  it('ignores a stored set from a game that has changed', () => {
    const stored = JSON.stringify({ sfx: 'loud', speeds: { 'a-speed-this-game-dropped': { base: true } }, nonsense: 1 });
    const ui = createUI({});
    expect(() => persistSettings(ui, { key: 'g', storage: memory({ g: stored }) })).not.toThrow();
    expect(ui.sfxSlider.value.get()).toBe(0.5);
  });

  it('costs the memory, never the game, when storage refuses', async () => {
    const ui = createUI({});
    expect(() => persistSettings(ui, { key: 'g', storage: hostile })).not.toThrow();
    ui.spacebar.toggle();
    await expect(flush()).resolves.toBeUndefined();
    expect(readSettings({ key: 'g', storage: hostile })).toEqual({});
  });

  it('stops writing once disposed', async () => {
    const ui = createUI({});
    const store = memory();
    const stop = persistSettings(ui, { key: 'g', storage: store });
    ui.spacebar.toggle();
    await flush();
    const first = store.data.get('g');
    stop();
    ui.spacebar.toggle();
    await flush();
    expect(store.data.get('g')).toBe(first);
  });

  it('captures and applies as a plain object, for a host with its own store', () => {
    const ui = createUI({});
    ui.sfxSlider.setNormalized(0.1);
    const snap = captureSettings(ui);
    const other = createUI({});
    applySettings(other, snap);
    expect(other.sfxSlider.value.get()).toBe(0.1);
  });
});

describe('what a mode costs a player', () => {
  it('prices a boost as the stake PLUS its surcharge, and a buy as its price', () => {
    expect(modePrice({ id: 'lucky', name: 'Lucky', kind: 'boost', cost: 1 })).toBe(2);
    expect(modePrice({ id: 'ante', name: 'Ante', kind: 'ante', cost: 0.25 })).toBe(1.25);
    expect(modePrice({ id: 'bonus', name: 'Bonus', kind: 'buy', cost: 100 })).toBe(100);
    expect(modePrice({ id: 'x', name: 'X', kind: 'boost', cost: 1, price: 3 })).toBe(3);
    expect(modePrice({ id: 'base', name: 'Base', kind: 'base' })).toBeUndefined();
  });

  it('offers both numbers to rules copy', () => {
    const vars = factsVars({ modes: [{ id: 'lucky', name: 'Lucky Bet', kind: 'boost', cost: 1 }] });
    expect(vars['cost.lucky']).toBe('1×'); // what it adds
    expect(vars['price.lucky']).toBe('2×'); // what a round costs
  });

  it('accepts a section that states the full price, not only the surcharge', () => {
    const facts = { modes: [{ id: 'lucky', name: 'Lucky Bet', kind: 'boost' as const, cost: 1, rtp: 96, maxWinX: 5000 }] };
    const stating = (text: string): number =>
      auditRules(facts, [
        { kind: 'heading', id: 'h', text: 'Lucky Bet' },
        { kind: 'text', id: 'p', text },
      ]).filter((i) => i.code === 'rules-mode-missing-cost').length;
    expect(stating('Lucky Bet doubles your chances. Each round costs 2× the bet, and the RTP is 96.00% with a 5,000× cap.')).toBe(0);
    expect(stating('Lucky Bet adds 1× to the stake. The RTP is 96.00% and the cap is 5,000×.')).toBe(0);
    expect(stating('Lucky Bet doubles your chances of the bonus. The RTP is 96.00% and the cap is 5,000×.')).toBe(1);
  });
});

describe('the rows a menu can have', () => {
  it("takes a spacebar row and a game's own toggle", () => {
    const issues: ChromeIssue[] = [];
    const rows = resolveHudChrome(
      { menu: [{ kind: 'spacebar' }, { kind: 'toggle', id: 'hints', label: 'HINTS', icon: 'icon-info-a-off', initial: true }] },
      (i) => issues.push(i),
    ).menu;
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.id)).toEqual(['spacebar', 'hints']);
    expect(rows[1]).toMatchObject({ kind: 'toggle', iconOn: 'icon-info-a-on', initial: true });
  });

  it('drops a toggle row with no id to name it by', () => {
    const issues: ChromeIssue[] = [];
    const rows = resolveHudChrome({ menu: [{ kind: 'toggle' }] }, (i) => issues.push(i)).menu;
    expect(rows).toEqual([]);
    expect(issues[0]!.code).toBe('bad-menu-item');
  });
});

describe('the controls a host can lock', () => {
  it('has a button for the autoplay SHEET, separate from the run', () => {
    const ui = createUI({});
    expect(ui.autoplayMenuButton.interactable).toBe(true);
    ui.autoplayMenuButton.disable();
    expect(ui.autoplayMenuButton.interactable).toBe(false);
  });

  it('has spacebar as a player setting, on by default', () => {
    const ui = createUI({});
    expect(ui.spacebar.isOn).toBe(true);
    ui.spacebar.toggle();
    expect(ui.spacebar.isOn).toBe(false);
  });

  it('says whether the session is play money', () => {
    const ui = createUI({});
    expect(ui.demo.get()).toBe(false);
    ui.setDemo(true);
    expect(ui.demo.get()).toBe(true);
  });
});
