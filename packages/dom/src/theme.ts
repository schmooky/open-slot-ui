import { defaultTheme, type Theme } from '@open-slot-ui/core';

/**
 * THE THEME, IN THE SKIN'S OWN LANGUAGE.
 *
 * `theme` has always been part of the spec, and the canvas binding has always read
 * it. The markup binding did not: it set `data-theme="default"` and left every
 * colour to the stylesheet, so `theme: { color: { accent: '#0f0' } }` changed the
 * canvas HUD and did nothing at all to this one. That is a configuration option
 * that lies, which is worse than one that does not exist.
 *
 * A skin is a stylesheet built on custom properties, so the way to theme it is to
 * set those properties — not to add rules that fight it. The reference skin names
 * them `--hg-*`; this maps our tokens onto that vocabulary, and onto our own
 * `--ohm-*` names, which the blocks stylesheet and the motion rules read.
 *
 * ONLY WHAT THE HOST OVERRODE is emitted. Writing every default would replace the
 * skin's palette with ours the moment anyone passed a theme at all — a game that
 * asked for a green accent would get our greys everywhere else. A token the host
 * did not mention is left to the stylesheet, which is the whole point of a skin.
 */

/** One theme token, mapped onto the properties the skin reads it from. */
interface Mapping {
  /** Where the value lives in the theme. */
  get(t: Theme): string | number;
  /** The custom properties to write it to. */
  vars: string[];
  /** Colours also publish an `r, g, b` triple, because the skin fades them. */
  rgb?: string[];
  /** Numbers that are lengths or durations carry their unit. */
  unit?: 'px' | 'ms';
}

const MAP: Mapping[] = [
  // ── colour ────────────────────────────────────────────────────────────────
  { get: (t) => t.color.accent, vars: ['--ohm-accent', '--hg-bg-accent'], rgb: ['--hg-bg-accent-rgb'] },
  { get: (t) => t.color.accentText, vars: ['--ohm-accent-text'] },
  { get: (t) => t.color.text, vars: ['--ohm-text', '--hg-text-primary'], rgb: ['--hg-text-primary-rgb'] },
  { get: (t) => t.color.textDim, vars: ['--ohm-text-dim', '--hg-text-secondary'], rgb: ['--hg-text-secondary-rgb'] },
  { get: (t) => t.color.label, vars: ['--hg-text-tertiary'], rgb: ['--hg-text-tertiary-rgb'] },
  { get: (t) => t.color.surface, vars: ['--ohm-surface', '--hg-bg-secondary'], rgb: ['--hg-bg-secondary-rgb'] },
  { get: (t) => t.color.surfaceAlt, vars: ['--ohm-surface-alt', '--hg-bg-tertiary'], rgb: ['--hg-bg-tertiary-rgb'] },
  { get: (t) => t.color.bar, vars: ['--hg-bg-user-panel'], rgb: ['--hg-bg-user-panel-rgb'] },
  { get: (t) => t.color.menu, vars: ['--hg-bg-main-panel'], rgb: ['--hg-bg-main-panel-rgb'] },
  // ONE TOKEN, TWO JOBS. The skin paints the buy coin with it and, while a bought
  // feature is on, re-points its whole accent at it — so the banner, the round
  // button, the stake and the ladder bar all take the game's buy colour. Setting
  // this is how a game says "my feature colour is cyan", not just "my coin is".
  { get: (t) => t.color.featureBuy, vars: ['--ohm-feature-buy', '--hg-bg-feature-buy'], rgb: ['--hg-bg-feature-buy-rgb'] },
  { get: (t) => t.color.featureBuyText, vars: ['--ohm-feature-buy-text'] },
  { get: (t) => t.color.edge, vars: ['--ohm-rule', '--hg-border-color'], rgb: ['--hg-border-color-rgb'] },
  { get: (t) => t.color.danger, vars: ['--ohm-danger'] },
  // ── shape and type ────────────────────────────────────────────────────────
  { get: (t) => t.radius.card, vars: ['--hg-border-radius-base', '--hg-pane-border-radius', '--hg-dialog-border-radius'], unit: 'px' },
  { get: (t) => t.radius.pill, vars: ['--hg-btn-border-radius'], unit: 'px' },
  { get: (t) => t.type.family, vars: ['--ohm-font', '--hg-typography-font-family'] },
  // ── motion ────────────────────────────────────────────────────────────────
  // The skin transitions on one duration; ours are three, and the rules this
  // package adds use all of them.
  { get: (t) => t.motion.fast, vars: ['--ohm-motion-fast'], unit: 'ms' },
  { get: (t) => t.motion.base, vars: ['--ohm-motion-base', '--hg-ui-transition-duration'], unit: 'ms' },
  { get: (t) => t.motion.slow, vars: ['--ohm-motion-slow'], unit: 'ms' },
];

/** `#ffc529` → `255, 197, 41`, which is how the skin fades a colour. */
export function rgbTriple(color: string): string | null {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1] as string;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const [r, g, b] = (rgb[1] as string).split(/[,/]/).map((v) => parseFloat(v));
    if ([r, g, b].every((v) => Number.isFinite(v))) return `${r}, ${g}, ${b}`;
  }
  return null;
}

/**
 * The custom properties a theme asks for — only the tokens it changed.
 *
 * `base` is what "unchanged" means; it defaults to the library's own theme, which
 * is what `resolveTheme` starts from.
 */
export function themeVars(theme: Theme, base: Theme = defaultTheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of MAP) {
    const value = m.get(theme);
    if (value === m.get(base)) continue;
    const text = m.unit === 'px' ? `${value}px` : m.unit === 'ms' ? `${value}ms` : String(value);
    for (const name of m.vars) out[name] = text;
    if (m.rgb && typeof value === 'string') {
      const triple = rgbTriple(value);
      // A colour the skin fades needs its triple too, or the faded copies keep the
      // old hue and the HUD ends up two-toned.
      if (triple) for (const name of m.rgb) out[name] = triple;
    }
  }
  return out;
}

/** How much of the HUD is allowed to move. */
export type MotionSetting = 'auto' | 'full' | 'reduced' | 'none';

/**
 * Resolve `auto` against the player's own setting.
 *
 * A player who has asked their system for less motion has asked this HUD too, and
 * a casino bar is exactly the kind of thing the setting exists for — sliding
 * sheets, counting numbers, a spinning icon. `full` and `none` are the host
 * overriding that, which is theirs to do; `auto` is the default and listens.
 */
export function resolveMotion(setting: MotionSetting = 'auto'): Exclude<MotionSetting, 'auto'> {
  if (setting !== 'auto') return setting;
  const prefersLess = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return prefersLess ? 'reduced' : 'full';
}
