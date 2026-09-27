/**
 * THE GLYPHS, AS CONFIGURATION.
 *
 * A skin draws its buttons with an icon font, and which character each button
 * shows is a class: `icon-spin`, `icon-stop`, `icon-menu`. Those were written into
 * the markup this package mounts, so a studio whose font calls them something else
 * — or who wants a different arrow on the bet changers — had to fork the template
 * to say so.
 *
 * Every glyph the HUD sets is now a named slot with the reference's class as its
 * default. Menu rows and speeds carry their own icon in the spec; these are the
 * ones the bar itself draws, plus the pairs that swap when something is switched.
 */
export interface IconSet {
  /** The ☰ button. */
  menu: string;
  /** The round button's arrow. */
  spin: string;
  /** The slam-stop that replaces it mid-round. */
  stop: string;
  /** The autoplay button, and the round button while an autoplay run is armed. */
  autoplay: string;
  /** The button that stops an autoplay run. */
  autoplayStop: string;
  /** The bet changers. */
  betUp: string;
  betDown: string;
  /** The ADVANCED chevron in the autoplay panel, collapsed and expanded. */
  advancedOpen: string;
  advancedClose: string;
  /** SOUND and MUSIC, on and off. */
  soundOn: string;
  soundOff: string;
  musicOn: string;
  musicOff: string;
}

export const defaultIcons: Readonly<IconSet> = Object.freeze({
  menu: 'icon-menu',
  spin: 'icon-spin',
  stop: 'icon-stop',
  autoplay: 'icon-autoplay2',
  autoplayStop: 'icon-stop',
  betUp: 'icon-arrow-up',
  betDown: 'icon-arrow-down',
  advancedOpen: 'icon-arrow-up',
  advancedClose: 'icon-arrow-down',
  soundOn: 'icon-sound-on',
  soundOff: 'icon-sound-off',
  musicOn: 'icon-music-on',
  musicOff: 'icon-music-off',
});

/** Fill a host's partial set out to a complete one. */
export function resolveIcons(icons?: Partial<IconSet>): IconSet {
  return icons ? { ...defaultIcons, ...icons } : defaultIcons;
}

/**
 * Where each slot's glyph lives in the mounted tree. The value is the element the
 * class sits on, found from the button's id — the `<span>` the skin draws into.
 */
const SLOT_OWNERS: Array<[keyof IconSet, string]> = [
  ['menu', 'MainMenuToggle'],
  ['spin', 'PlaceBetBtn'],
  ['stop', 'StopBtn'],
  ['autoplay', 'AutoplayBtn'],
  ['autoplay', 'StartAutoplayBtn'],
  ['autoplayStop', 'StopAutoplayBtn'],
  ['betUp', 'BetAmountIncrease'],
  ['betDown', 'BetAmountDecrease'],
];

/**
 * Dress the bar's static buttons. The ones that swap with state — sound, music,
 * a speed, the ADVANCED chevron — are set by their own binding as they change.
 */
export function applyIcons(root: ParentNode, icons: IconSet): void {
  for (const [slot, id] of SLOT_OWNERS) {
    const want = icons[slot];
    if (want === defaultIcons[slot]) continue;
    const glyph = root.querySelector(`#${id} [class^="icon-"]`);
    if (!glyph) continue;
    // Keep whatever else the skin put on the span (`branding-logo` on the spin
    // arrow is a styling hook, not an icon).
    const kept = glyph.className.split(/\s+/).filter((c) => c && !c.startsWith('icon-'));
    glyph.className = [want, ...kept].join(' ');
  }
}
