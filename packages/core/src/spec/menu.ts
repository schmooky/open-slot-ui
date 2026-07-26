/**
 * The unified MENU: one scrollable surface opened by the ☰ button, composed of
 * three ordered sections — Settings (Music/Sound + a Language switch + your
 * extras), Paytable, then Rules. `composeMenu` is pure: it flattens a `MenuSpec`
 * into the ordered `BlockSpec[]` the renderer draws, injecting section headings.
 * Section text is localizable (it flows through `ui.t` in the view).
 */
import type { BlockSpec } from './types';

/**
 * How the Settings section exposes sound:
 * - `'toggle'`  — a single Sound on/off switch (mute).
 * - `'master'`  — the Sound switch + one Volume slider (music + effects together).
 * - `'sliders'` — the Sound switch + separate **Music** and **Effects** sliders. (default)
 */
export type SoundControls = 'toggle' | 'master' | 'sliders';

export interface MenuSpec {
  /** A banner image shown at the very top of the menu (e.g. a themed title art). */
  banner?: { src: string; width?: number; height?: number };
  /** How sound is configured in Settings (toggle · master slider · music+effects). Default `'sliders'`. */
  sound?: SoundControls;
  /** Extra settings, appended after the built-in Music/Sound (+ Language). */
  settings?: BlockSpec[];
  /** Paytable section content (omit → no Paytable section). */
  paytable?: BlockSpec[];
  /** Rules section content (omit → no Rules section). */
  rules?: BlockSpec[];
  /** Override the section heading text (each is run through `ui.t`). */
  titles?: { settings?: string; paytable?: string; rules?: string };
}

// The English section titles double as their i18n keys (a game's dict localizes them).
// "Paytable" is social-restricted → the social dictionary swaps it to "Prizes" (see
// openuiSocialDefaults), so the heading is compliant in social mode without extra config.
export const DEFAULT_MENU_TITLES = { settings: 'Settings', paytable: 'Paytable', rules: 'Rules' } as const;

/** Native names for the language switch; falls back to the upper-cased code.
 *  Covers Stake Engine's locale set (ar de en es fr id ja ko pl pt ru tr vi zh fi hi). */
export const LOCALE_LABELS: Record<string, string> = {
  en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch', fr: 'Français',
  ru: 'Русский', tr: 'Türkçe', zh: '中文', ja: '日本語', ar: 'العربية',
  pl: 'Polski', ko: '한국어', hi: 'हिन्दी', id: 'Bahasa Indonesia', vi: 'Tiếng Việt',
  fi: 'Suomi', it: 'Italiano', nl: 'Nederlands',
};

export interface ComposeMenuOptions {
  /** Locale codes available — when 2+, a Language select is added to Settings. */
  locales?: string[];
  /** The select id that switches locale (must match createUI's localeSelectId). */
  localeSelectId?: string;
  /** Back-compat: a top-level `rules` array used when `menu.rules` is absent. */
  rulesFallback?: BlockSpec[];
}

/**
 * Compose the ordered menu blocks. The built-in Music/Sound sliders reuse the
 * real `music`/`sfx` controls (the view's reuse resolver wires them), so the menu
 * drives the actual volume — it doesn't shadow it.
 */
export function composeMenu(menu: MenuSpec | undefined, opts: ComposeMenuOptions = {}): BlockSpec[] {
  const titles = { ...DEFAULT_MENU_TITLES, ...menu?.titles };
  const out: BlockSpec[] = [];

  // ── Banner (optional themed title art) ──────────────────────────────────────
  if (menu?.banner?.src) {
    out.push({ kind: 'image', id: 'menu-banner', src: menu.banner.src, width: menu.banner.width, height: menu.banner.height });
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  // Order: heading → the host's extra settings (e.g. Speed / Sound toggles) → Music + Effects
  // volume sliders → a Language switch. Each row shows its name + a description with the control
  // on the right (see `settingRow` in the pixi block renderer).
  out.push({ kind: 'heading', id: 'menu-sec-settings', text: titles.settings });
  if (menu?.settings?.length) out.push(...menu.settings);
  out.push({ kind: 'slider', id: 'music', label: 'Music', hint: 'Background music volume.' });
  out.push({ kind: 'slider', id: 'sfx', label: 'Effects', hint: 'Sound effect volume.' });
  const locales = opts.locales ?? [];
  if (locales.length >= 2) {
    out.push({
      kind: 'select',
      id: opts.localeSelectId ?? 'lang',
      label: 'Language',
      options: locales.map((code) => ({ value: code, label: LOCALE_LABELS[code] ?? code.toUpperCase() })),
    });
  }

  // ── Paytable ──────────────────────────────────────────────────────────────
  if (menu?.paytable?.length) {
    out.push({ kind: 'heading', id: 'menu-sec-paytable', text: titles.paytable });
    out.push(...menu.paytable);
  }

  // ── Rules ─────────────────────────────────────────────────────────────────
  const rules = menu?.rules?.length ? menu.rules : opts.rulesFallback;
  if (rules?.length) {
    out.push({ kind: 'heading', id: 'menu-sec-rules', text: titles.rules });
    out.push(...rules);
  }

  return out;
}
