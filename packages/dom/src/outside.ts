import type { Dispose, OpenUI } from '@open-slot-ui/core';

/**
 * A TAP OUTSIDE CLOSES WHAT IS OPEN.
 *
 * The ☰ menu and the autoplay panel are popovers: a player who opened one and taps
 * the game expects it to go away (the reference's mobile menu already closes on a tap
 * on its own scrim; on desktop, and for the autoplay panel, nothing did). With
 * `hud.closeOnOutsideTap`, a press anywhere but the open panel and the controls that
 * work it closes the panel. The press itself is left alone: it still reaches what it
 * landed on.
 *
 * What counts as inside:
 *  - the menu: its list and the ☰ toggle (which closes it itself);
 *  - the autoplay panel: the panel, the autoplay button, and the round button with
 *    its bet changers — while picking, the round button is START, and the stake the
 *    panel prices the run from is still the player's to change.
 */
const MENU_INSIDE = '#MainMenu, #MainMenuToggle';
const AUTOPLAY_INSIDE = '.AutoplayMenuPanel, #AutoplayBtn, .ActionPanel__container--game-actions';

export function closeOnOutsideTap(ui: OpenUI, root: HTMLElement): Dispose {
  const onDown = (e: Event): void => {
    const target = e.target as Element | null;
    if (!target?.closest) return;
    // A modal in front (a notice, the rules) owns the screen; the panels wait behind it.
    if (ui.noticePanel.isOpen) return;
    const inHud = root.contains(target);
    if (ui.mainMenuPanel.isOpen && !(inHud && target.closest(MENU_INSIDE))) ui.mainMenuPanel.closePanel();
    if (ui.autoplayPanel.isOpen && !ui.autoplay.isActive && !(inHud && target.closest(AUTOPLAY_INSIDE))) {
      ui.autoplayPanel.closePanel();
      ui.autoplay.cancelPicker();
    }
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
