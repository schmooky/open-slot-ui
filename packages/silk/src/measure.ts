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

/** One stop of a CSS ramp, as pixi-silk wants it. */
export interface RampStop {
  offset: number;
  color: number;
  alpha: number;
}

/**
 * A CSS `linear-gradient(...)` as a ramp between two points of the shape's box.
 *
 * The browser hands back the computed form — an angle or nothing, then colours with
 * optional positions — and this turns it into the two points and the stops a canvas
 * gradient is made of. The geometry is CSS's own: 0deg points up, the line runs
 * through the centre of the box, and its length is what makes the corners land on
 * the end colours.
 */
export function parseRamp(css: string): { from: [number, number]; to: [number, number]; stops: RampStop[] } | null {
  const body = css.match(/^linear-gradient\((.*)\)$/s)?.[1];
  if (!body) return null;
  const parts = splitTop(body);
  if (!parts.length) return null;

  let angle = 180; // CSS default: to bottom
  const first = parts[0]!.trim();
  const deg = first.match(/^(-?[\d.]+)deg$/);
  if (deg) {
    angle = parseFloat(deg[1] as string);
    parts.shift();
  } else if (first.startsWith('to ')) {
    const sides = first.slice(3).trim();
    const map: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'right top': 45, 'bottom right': 135, 'right bottom': 135, 'bottom left': 225, 'left bottom': 225, 'top left': 315, 'left top': 315 };
    angle = map[sides] ?? 180;
    parts.shift();
  }

  const stops: RampStop[] = [];
  parts.forEach((part, i) => {
    const text = part.trim();
    const at = text.match(/\s(-?[\d.]+)%$/);
    const colour = cssColor(at ? text.slice(0, at.index).trim() : text);
    const offset = at ? parseFloat(at[1] as string) / 100 : parts.length > 1 ? i / (parts.length - 1) : 0;
    stops.push({ offset, color: colour.color, alpha: colour.alpha });
  });
  if (stops.length < 2) return null;

  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  // The length of the gradient line across a unit box, so the ends land where CSS
  // puts them rather than inside the corners.
  const len = Math.abs(dx) + Math.abs(dy);
  return {
    from: [0.5 - (dx * len) / 2, 0.5 - (dy * len) / 2],
    to: [0.5 + (dx * len) / 2, 0.5 + (dy * len) / 2],
    stops,
  };
}

/** Split on the commas that are not inside brackets — a colour has commas of its own. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(from, i));
      from = i + 1;
    }
  }
  out.push(s.slice(from));
  return out.filter((p) => p.trim());
}
