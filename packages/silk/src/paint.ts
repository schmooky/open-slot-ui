import { Container, Text, type TextStyleOptions } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';

/**
 * The drawing primitives this binding builds the bar out of.
 *
 * Each one is the canvas equivalent of a rule in the skin's stylesheet — a filled
 * round rect for a plate, a circle for a coin, a glyph from the icon font for a
 * button — and each takes the numbers straight from the measured manifest, so a
 * change to the skin travels through `extract-skin` and lands here without anyone
 * re-drawing anything by eye.
 */

/** `rgba(0, 0, 0, 0.6)` / `rgb(255, 198, 55)` as Pixi wants them. */
export function cssColor(css: string): { color: number; alpha: number } {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return { color: 0x000000, alpha: css === 'transparent' ? 0 : 1 };
  const [r = 0, g = 0, b = 0, a = 1] = (m[1] as string).split(',').map((n) => parseFloat(n));
  return { color: ((r & 255) << 16) | ((g & 255) << 8) | (b & 255), alpha: a };
}

export interface BoxStyle {
  radius?: number;
  /** Corner smoothing, 0 = a plain round rect, 1 = a full squircle. */
  smoothing?: number;
  fill?: string;
  border?: { width: number; color: string };
}

/** A plate: the rounded, semi-transparent slab the whole bar sits on. */
export function box(g: SilkGraphics, x: number, y: number, w: number, h: number, style: BoxStyle): SilkGraphics {
  const r = style.radius ?? 0;
  if (style.fill) {
    const { color, alpha } = cssColor(style.fill);
    if (alpha > 0) g.roundRect(x, y, w, h, r, style.smoothing ?? 0).fill({ color, alpha });
  }
  if (style.border && style.border.width > 0) {
    const { color, alpha } = cssColor(style.border.color);
    g.roundRect(x, y, w, h, r, style.smoothing ?? 0).stroke({ width: style.border.width, color, alpha, alignment: 'inside' });
  }
  return g;
}

/** A coin or a round button. */
export function disc(g: SilkGraphics, cx: number, cy: number, r: number, fill: string, border?: { width: number; color: string }): SilkGraphics {
  const f = cssColor(fill);
  if (f.alpha > 0) g.circle(cx, cy, r).fill({ color: f.color, alpha: f.alpha });
  if (border && border.width > 0) {
    const b = cssColor(border.color);
    g.circle(cx, cy, r - border.width / 2).stroke({ width: border.width, color: b.color, alpha: b.alpha });
  }
  return g;
}

export interface LabelOptions {
  size: number;
  weight?: string;
  family?: string;
  color?: string;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  /** 0 = left/top edge at (x, y), 0.5 = centred there, 1 = right/bottom. */
  anchor?: [number, number];
}

/** A run of text, positioned the way the CSS box it replaces positioned it. */
export function label(parent: Container, value: string, x: number, y: number, o: LabelOptions): Text {
  const { color, alpha } = cssColor(o.color ?? 'rgb(255,255,255)');
  const style: TextStyleOptions = {
    // The skin names a face and ships no file for it, so the DOM HUD renders in the
    // fallback — and so must this, or the two would differ by a whole typeface.
    fontFamily: [o.family ?? 'HacksawUI', 'sans-serif'],
    fontSize: o.size,
    fontWeight: (o.weight ?? '400') as TextStyleOptions['fontWeight'],
    fill: color,
    letterSpacing: o.letterSpacing ?? 0,
    align: o.align ?? 'left',
  };
  const t = new Text({ text: value, style });
  t.alpha = alpha;
  t.anchor.set(o.anchor?.[0] ?? 0, o.anchor?.[1] ?? 0);
  t.position.set(x, y);
  t.resolution = Math.min(globalThis.devicePixelRatio || 1, 3);
  parent.addChild(t);
  return t;
}

/**
 * One glyph of the skin's icon font.
 *
 * The buttons in the DOM binding are `<span class="icon-menu">`, and the stylesheet
 * turns that into a codepoint in `icomoon`. The manifest records which codepoint,
 * so the canvas draws the same character from the same file rather than a redrawn
 * approximation of it.
 */
export function glyph(parent: Container, codepoint: string, x: number, y: number, size: number, color: string, family = 'icomoon'): Text {
  const ch = codepoint.replace(/^"|"$/g, '');
  return label(parent, ch, x, y, { size, family, color, anchor: [0.5, 0.5] });
}
