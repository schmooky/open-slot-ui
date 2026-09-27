import type { Dispose, OpenUI } from '@open-slot-ui/core';

/**
 * THE KEYBOARD.
 *
 * Every real slot client answers the spacebar, and this one answered nothing —
 * there was no key handling in the binding at all, even though the compliance
 * layer already carried a `disabledSpacebar` flag for jurisdictions that forbid
 * it. A flag that switches off something that was never built is a promise the
 * library was not keeping.
 *
 * Three rules make keyboard input safe in a game client:
 *
 *  - **Not while typing.** The autoplay panel has real number inputs; space in a
 *    text field is a space, and Escape belongs to the field's own editing.
 *  - **Not against the jurisdiction.** A market that forbids keyboard spin gets
 *    no keyboard spin, whatever the host configured.
 *  - **Not while a window is up.** Space should not spin the reels behind an open
 *    rules window; there, Escape closes what is in front instead.
 */
export interface KeyboardOptions {
  /**
   * Keys that press the round button. Default `[' ']` — the spacebar. `[]` turns
   * it off. Values are `KeyboardEvent.key`, so `'Enter'` works too.
   */
  spin?: string[];
  /**
   * Keys that close the window or sheet in front. Default `['Escape']`.
   */
  close?: string[];
  /** Keys that step the stake. Default `['ArrowUp']` / `['ArrowDown']`; `[]` turns them off. */
  betUp?: string[];
  betDown?: string[];
  /** Off entirely. */
  enabled?: boolean;
}

const DEFAULTS: Required<Omit<KeyboardOptions, 'enabled'>> = {
  spin: [' '],
  close: ['Escape'],
  betUp: ['ArrowUp'],
  betDown: ['ArrowDown'],
};

/** A field the player is typing into owns its keys. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/**
 * Bind the keys. Returns the usual dispose.
 *
 * `root` is only used to find the panels; the listener is on the document,
 * because a player pressing space has not necessarily clicked the bar first.
 */
export function bindKeyboard(ui: OpenUI, opts: KeyboardOptions = {}): Dispose {
  if (opts.enabled === false) return () => undefined;
  const keys = { ...DEFAULTS, ...opts };

  /** The panels a press of Escape should close, front to back. */
  const windows = (): Array<{ isOpen: boolean; closePanel(): void }> => [
    ui.settingsPanel,
    ui.historyPanel,
    ui.noticePanel,
    ui.autoplayPanel,
    ui.mainMenuPanel,
  ];

  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.repeat || typing(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (keys.close.includes(e.key)) {
      const open = windows().find((p) => p.isOpen);
      if (!open) return;
      open.closePanel();
      e.preventDefault();
      return;
    }

    // Nothing else reaches the game while something is open in front of it.
    if (windows().some((p) => p.isOpen)) return;

    if (keys.spin.includes(e.key)) {
      if (ui.isDisabled('spacebar') || ui.locked.get()) return;
      ui.spin.activate();
      e.preventDefault(); // space scrolls a page, and this page is a game
      return;
    }
    if (keys.betUp.includes(e.key)) {
      if (ui.locked.get()) return;
      ui.betPlus.activate();
      e.preventDefault();
      return;
    }
    if (keys.betDown.includes(e.key)) {
      if (ui.locked.get()) return;
      ui.betMinus.activate();
      e.preventDefault();
    }
  };

  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
