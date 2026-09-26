/**
 * The parts of the canvas binding that are only arithmetic.
 *
 * Colour parsing and layer filing need no GPU, no stage and no browser, which means
 * they can be tested directly — and a capture can be checked for sanity — without
 * standing up a renderer.
 */

/** Which edge of the screen a captured box is anchored to. */
export type Anchor = 'top' | 'bottom' | 'center' | 'full';

/** The zones the capture reads off the markup. */
export interface Zoned {
  x: number;
  y: number;
  w: number;
  h: number;
  zone?: 'top' | 'bottom' | 'window';
}

/**
 * Which edge a captured box belongs to. The capture records the zone it read off the
 * markup — the bar, the top strip, a window — and anything covering the whole capture
 * is a backdrop, which stretches to the window instead of being scaled with it.
 */
export function anchorOf(n: Zoned, view: { w: number; h: number }): Anchor {
  if (n.w >= view.w * 0.9 && n.h >= view.h * 0.9) return 'full';
  if (n.zone === 'top' || n.zone === 'bottom') return n.zone;
  if (n.zone === 'window') return 'center';
  // An older capture has no zones; fall back to where the box sits.
  const cy = n.y + n.h / 2;
  return cy < view.h * 0.2 ? 'top' : cy > view.h * 0.62 ? 'bottom' : 'center';
}

/**
 * `rgba(0, 0, 0, 0.6)`, `rgb(255, 198, 55)`, `#ffc637` or the form modern browsers
 * hand back for a colour written in a wide gamut, `color(srgb 0.98 0.98 0.98 / 0.75)`,
 * as Pixi wants them.
 */
export function cssColor(css: string): { color: number; alpha: number } {
  const pack = (r: number, g: number, b: number, a: number): { color: number; alpha: number } => ({
    color: ((Math.round(r) & 255) << 16) | ((Math.round(g) & 255) << 8) | (Math.round(b) & 255),
    alpha: a,
  });
  const srgb = css.match(/color\(srgb\s+([^)]+)\)/);
  if (srgb) {
    const parts = (srgb[1] as string).split('/');
    const [r = 0, g = 0, b = 0] = (parts[0] as string).trim().split(/\s+/).map((n) => parseFloat(n));
    const a = parts[1] ? parseFloat(parts[1]) : 1;
    return pack(r * 255, g * 255, b * 255, Number.isFinite(a) ? a : 1);
  }
  const hex = css.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1] as string;
    const full = h.length <= 4 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full.slice(0, 6), 16);
    const a = full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return { color: n, alpha: a };
  }
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return { color: 0x000000, alpha: css === 'transparent' ? 0 : 1 };
  const [r = 0, g = 0, b = 0, a = 1] = (m[1] as string).split(/[,/]/).map((n) => parseFloat(n));
  return pack(r, g, b, Number.isFinite(a) ? a : 1);
}

/** `rgba(0, 0, 0, 0.3) 0px 3px 5px 3px` → what to draw under the box. */
export function parseShadow(css: string): { color: string; dx: number; dy: number; blur: number } | null {
  const color = css.match(/rgba?\([^)]+\)/)?.[0] ?? '#000';
  const nums = css.replace(/rgba?\([^)]+\)/, '').match(/-?\d+(\.\d+)?px/g);
  if (!nums || nums.length < 2) return null;
  const [dx = '0', dy = '0', blur = '0'] = nums;
  return { color, dx: parseFloat(dx), dy: parseFloat(dy), blur: parseFloat(blur) };
}
