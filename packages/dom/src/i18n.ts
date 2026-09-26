import { labelFor, type OpenUI } from '@open-slot-ui/core';

/**
 * The markup labels itself with `data-translation` keys. open-ui resolves each one
 * through the host's own translator first (so a game that already localizes the HUD
 * localizes this markup too), then through the `openui.*` key it maps to, and only
 * then through the English default below.
 *
 * Keeping the reference's key names means a studio can drop in the language files it
 * already has, unchanged.
 */
export { LABEL_KEYS, labelFor as label } from '@open-slot-ui/core';


/** Fill every `[data-translation]` in a subtree. Called on mount and on locale change. */
export function translateTree(ui: OpenUI, root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-translation]'))) {
    const key = el.dataset.translation;
    if (key) el.textContent = labelFor(ui, key);
  }
}
