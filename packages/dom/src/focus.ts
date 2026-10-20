import type { Dispose } from '@open-slot-ui/core';

/**
 * KEEPING FOCUS OFF THE BAR.
 *
 * A slot's bar is played with the pointer and a handful of keys (`keyboard.ts`: space
 * spins, the arrows step the stake, Escape closes what is in front). Its buttons are not
 * a form to Tab through, and a button that keeps the focus after a press is a trap: the
 * next spacebar presses it again (a stake step, a menu toggle) instead of spinning, and
 * the skin keeps a focus ring drawn around it.
 *
 * So, by default, every control is out of the Tab order (`tabindex="-1"`, rows the bar
 * renders later included), a mouse press does not move the focus onto a control, and a
 * control that took the focus anyway (touch, a pen, a checkbox, a slider) lets go of it
 * after the click. Text fields are the exception: tapping one still focuses it, so the
 * player can type a limit, and its keys stay its own.
 */

/** What can sit in the Tab order: natively focusable, or given a tabindex. */
const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]';
/** What a press must not focus (fields are left to the browser). */
const PRESSABLE = 'button, a[href], label, li, [role="button"], [tabindex]';
/** Fields the player types into: they keep the focus they are given. */
const TYPED = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, select';

export function keepFocusOff(root: HTMLElement): Dispose {
  const untab = (scope: ParentNode): void => {
    for (const el of scope.querySelectorAll<HTMLElement>(FOCUSABLE)) if (el.tabIndex !== -1) el.tabIndex = -1;
  };
  untab(root);
  // Rows the bar renders later (the buy cards, the autoplay counts, the menu) join the same way.
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
          for (const r of records)
            for (const n of r.addedNodes) {
              if (!(n instanceof HTMLElement)) continue;
              if (n.matches(FOCUSABLE) && n.tabIndex !== -1) n.tabIndex = -1;
              untab(n);
            }
        });
  observer?.observe(root, { childList: true, subtree: true });

  // A mouse press does not focus what it presses; the click still happens.
  const onDown = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (!target?.closest || target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (target.closest(PRESSABLE)) e.preventDefault();
  };
  // Touch, a pen, a checkbox or a slider focus on their own: let go once the click is done.
  const onClick = (): void => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && root.contains(active) && !active.matches(TYPED)) active.blur();
  };
  root.addEventListener('mousedown', onDown, true);
  root.addEventListener('click', onClick);
  return () => {
    observer?.disconnect();
    root.removeEventListener('mousedown', onDown, true);
    root.removeEventListener('click', onClick);
  };
}
