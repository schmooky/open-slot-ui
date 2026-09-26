import { Assets, CanvasTextMetrics, Container, Sprite, Text, Texture, type TextStyleOptions } from 'pixi.js';
import { SilkGraphics, linear } from 'pixi-silk';
import { cssColor, parseRamp, parseShadow, anchorOf, type Anchor } from './measure';

export { anchorOf, type Anchor } from './measure';

/**
 * A captured box: one element of the DOM HUD, as the browser painted it.
 * `scripts/capture.mjs` writes these; nothing in here is authored by hand.
 */
export interface Node {
  id?: string;
  cls?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  bg?: string;
  /** A CSS `linear-gradient(...)` background, when the box is painted with a ramp. */
  ramp?: string;
  radius?: number;
  radii?: number[];
  border?: { w: number; color: string };
  shadow?: string;
  text?: string;
  glyph?: {
    ch: string;
    font: string;
    size: number;
    color: string;
    pseudo: string;
    /** Where the glyph's ink actually fell in the browser, not where its box was. */
    ink?: { x: number; y: number; w: number; h: number } | null;
  };
  font?: { size: number; weight: string; family: string; align: string; lineHeight: number; spacing: number; transform: string };
  color?: string;
  /**
   * Where each line of this element's own text landed, measured in the browser. The
   * canvas draws these rather than re-breaking the paragraph itself.
   */
  lines?: Array<{ text: string; x: number; y: number; w: number; h: number }>;
  opacity?: number;
  /** The angle the element is turned by, in radians, about (`rx`, `ry`). */
  rotate?: number;
  rx?: number;
  ry?: number;
  img?: string;
  /** Which edge of the screen CSS anchors this to: the bar, the strip, or a window. */
  zone?: 'top' | 'bottom' | 'window';
  /** The z-index of the layer this belongs to: what paints over what. */
  rank?: number;
  /** The clipping ancestor's box, if the element sits inside one that scrolls. */
  clip?: number[];
}


export interface RenderedTree {
  view: Container;
  /**
   * The capture is a photograph of one window size, and a HUD is not a photograph:
   * the bar belongs to the bottom edge, the compliance strip to the top, a modal to
   * the middle, and a backdrop to the whole screen. Each box is filed under the edge
   * it belongs to, and the layout anchors the four groups separately — which is the
   * difference between a HUD and a picture pinned to the floor.
   */
  groups: Record<Anchor, Container>;
  /**
   * The layer behind everything, for the tap that closes an open window. It is last
   * in the hit test precisely because it is first in the paint: a press lands on a
   * button if there is one under the finger, and on the backdrop only if there is not.
   */
  backstop: Container;
  /** The text objects that carry a value, by element id, so they can be re-set. */
  texts: Map<string, Text>;
  /** Every node's box by element id, for hit areas. */
  boxes: Map<string, Node>;
  /** The box the open window occupies, if one is open: what a press must not fall through. */
  windowBox?: { x: number; y: number; w: number; h: number };
}


const upper = (s: string, transform?: string): string => (transform === 'uppercase' ? s.toUpperCase() : s);

/** A 2D context kept around to ask this browser where a glyph's ink falls. */
let ruler: CanvasRenderingContext2D | null | undefined;

/**
 * Where to put a glyph so its ink lands where the capture measured it.
 *
 * An icon is a character, and a character sits inside its line box wherever the font
 * says. The capture measured where the ink landed in the markup; this works out
 * where Pixi would put the same ink, and moves the text by the difference. The
 * measurements are taken with the font string PIXI ITSELF will use, because a
 * family list falls back differently from a bare family name and a few pixels of
 * difference on a 86px icon is exactly what a player notices.
 */
function inkAt(glyph: NonNullable<Node['glyph']>, text: Text): { x: number; y: number } | null {
  const ink = glyph.ink;
  if (!ink) return null;
  if (ruler === undefined) ruler = document.createElement('canvas').getContext('2d');
  if (!ruler) return null;
  const metrics = CanvasTextMetrics.measureText(glyph.ch, text.style);
  const font = text.style._fontString;
  ruler.font = font;
  const m = ruler.measureText(glyph.ch);
  if (!Number.isFinite(m.actualBoundingBoxAscent)) return null;
  // Pixi draws each line's baseline at `ascent` from the top of its box, plus half
  // of whatever the line height adds beyond the font's own size.
  const props = metrics.fontProperties;
  const shift = Math.max(0, (metrics.lineHeight - props.fontSize) / 2);
  return { x: ink.x + m.actualBoundingBoxLeft, y: ink.y - (props.ascent + shift) + m.actualBoundingBoxAscent };
}

/**
 * Draw one captured state.
 *
 * Boxes become pixi-silk primitives — a round rect with the measured radii, a
 * stroke for a border, a soft-blurred copy underneath for a shadow — and text
 * becomes Pixi text in the measured face, size, weight and alignment. The result
 * is the same picture the browser painted, made of shapes a GPU can draw.
 */
export function renderTree(nodes: Node[], viewport: { w: number; h: number }): RenderedTree {
  const view = new Container();
  const groups: Record<Anchor, Container> = {
    bottom: new Container(),
    top: new Container(),
    full: new Container(),
    center: new Container(),
  };
  const backstop = new Container();
  view.addChild(backstop, groups.full, groups.center, groups.top, groups.bottom);
  const texts = new Map<string, Text>();
  const boxes = new Map<string, Node>();
  /** The z-index each layer was given in the markup. */
  const ranks: Partial<Record<Anchor, number>> = {};
  /** The window's own extent, grown box by box as the window is drawn. */
  let win: { x0: number; y0: number; x1: number; y1: number } | undefined;

  /**
   * One painter per (edge, clipping ancestor). Everything the browser drew inside a
   * scrolling window is drawn into a container masked to that window, so content
   * stops where the window stops instead of spilling down the screen.
   */
  const buckets = new Map<Anchor, { key: string; layer: Container; g: SilkGraphics }>();
  const bucket = (anchor: Anchor, clip?: number[]): { layer: Container; g: SilkGraphics } => {
    const key = `${anchor}|${clip ? clip.join(',') : ''}`;
    const open = buckets.get(anchor);
    // A RUN, not a set. Boxes are drawn in the order the browser painted them, so a
    // new container starts whenever the clip changes and the old one is never
    // reopened — reusing it would put a box back underneath what came after it.
    if (open && open.key === key) return open;
    const layer = new Container();
    if (clip) {
      const mask = new SilkGraphics({ label: 'clip' });
      mask.roundRect(clip[0]!, clip[1]!, clip[2]!, clip[3]!, 0).fill({ color: 0xffffff });
      layer.addChild(mask);
      layer.mask = mask;
    }
    const g = new SilkGraphics({ label: `boxes:${key}` });
    layer.addChild(g);
    groups[anchor].addChild(layer);
    const made = { key, layer, g };
    buckets.set(anchor, made);
    return made;
  };

  /** A frame turned by a node's angle, in which that node is drawn upright. */
  const turned = (parent: Container, n: Node): { layer: Container; g: SilkGraphics } => {
    const cx = n.rx ?? n.x + n.w / 2;
    const cy = n.ry ?? n.y + n.h / 2;
    const layer = new Container();
    layer.position.set(cx, cy);
    layer.rotation = n.rotate ?? 0;
    layer.pivot.set(cx, cy);
    layer.position.set(cx, cy);
    const g = new SilkGraphics({ label: 'turned' });
    layer.addChild(g);
    parent.addChild(layer);
    return { layer, g };
  };

  for (const n of nodes) {
    if (n.id) boxes.set(n.id, n);
    const anchor = anchorOf(n, viewport);
    // A backdrop is drawn at the capture's size and stretched by the layout, so its
    // own clip (the window it belongs to) would only fight with that.
    ranks[anchor] = Math.max(ranks[anchor] ?? 0, n.rank ?? 0);
    if (anchor === 'center') {
      win = win
        ? { x0: Math.min(win.x0, n.x), y0: Math.min(win.y0, n.y), x1: Math.max(win.x1, n.x + n.w), y1: Math.max(win.y1, n.y + n.h) }
        : { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h };
    }
    const flat = bucket(anchor, anchor === 'full' ? undefined : n.clip);
    // A turned element gets its own turned frame, so the shape inside it is drawn
    // straight and the frame does the turning — the way the browser does it.
    const { layer, g } = n.rotate ? turned(flat.layer, n) : flat;

    // ── the box ────────────────────────────────────────────────────────────
    if (n.bg || n.ramp || n.border) {
      const radii = n.radii && n.radii.some(Boolean) ? n.radii : n.radius ? [n.radius, n.radius, n.radius, n.radius] : undefined;
      // A radius of 50% comes back as half the box; clamp so it cannot overlap.
      const r = radii ? radii.map((v) => Math.min(v, Math.min(n.w, n.h) / 2)) : 0;
      if (n.shadow) {
        const s = parseShadow(n.shadow);
        if (s) {
          const c = cssColor(s.color);
          g.roundRect(n.x + s.dx, n.y + s.dy, n.w, n.h, r as number[] | number)
            .fill({ color: c.color, alpha: c.alpha * (n.opacity ?? 1), blur: Math.max(1, s.blur / 2) });
        }
      }
      if (n.bg) {
        const c = cssColor(n.bg);
        if (c.alpha > 0) g.roundRect(n.x, n.y, n.w, n.h, r as number[] | number).fill({ color: c.color, alpha: c.alpha * (n.opacity ?? 1) });
      }
      // A ramp paints over the flat colour, exactly as a background image does.
      if (n.ramp) {
        const ramp = parseRamp(n.ramp);
        if (ramp) {
          g.roundRect(n.x, n.y, n.w, n.h, r as number[] | number).fill({
            gradient: linear(
              ramp.stops.map((s) => ({ offset: s.offset, color: s.color, alpha: s.alpha })),
              { from: ramp.from, to: ramp.to, units: 'shape', space: 'srgb' },
            ),
            alpha: n.opacity ?? 1,
          });
        }
      }
      if (n.border) {
        const c = cssColor(n.border.color);
        g.roundRect(n.x + n.border.w / 2, n.y + n.border.w / 2, Math.max(0, n.w - n.border.w), Math.max(0, n.h - n.border.w), r as number[] | number)
          .stroke({ width: n.border.w, color: c.color, alpha: c.alpha * (n.opacity ?? 1) });
      }
    }

    // ── a picture ──────────────────────────────────────────────────────────
    if (n.img) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.position.set(n.x, n.y);
      sprite.width = n.w;
      sprite.height = n.h;
      layer.addChild(sprite);
      void Assets.load<Texture>(n.img)
        .then((tex) => {
          if (sprite.destroyed) return;
          sprite.texture = tex;
          sprite.width = n.w;
          sprite.height = n.h;
        })
        .catch(() => undefined);
    }

    // ── an icon ────────────────────────────────────────────────────────────
    if (n.glyph) {
      const c = cssColor(n.glyph.color);
      const t = new Text({
        text: n.glyph.ch,
        style: { fontFamily: [n.glyph.font, 'sans-serif'], fontSize: n.glyph.size, fill: c.color },
      });
      t.alpha = c.alpha * (n.opacity ?? 1);
      t.resolution = Math.min(globalThis.devicePixelRatio || 1, 3);
      const ink = n.glyph.ink ? inkAt(n.glyph, t) : null;
      if (ink) {
        // The capture measured where the glyph's ink landed; this puts the ink
        // there, rather than centring a line box and hoping the font agrees.
        t.anchor.set(0, 0);
        t.position.set(ink.x, ink.y);
      } else {
        t.anchor.set(0.5);
        t.position.set(n.x + n.w / 2, n.y + n.h / 2);
      }
      layer.addChild(t);
      if (n.id) texts.set(`${n.id}:glyph`, t);
    }

    // ── words ──────────────────────────────────────────────────────────────
    // Text the player never changes is drawn line by line, where the browser put
    // each line. A live value — a balance, a stake — is drawn against its box
    // instead, because it has to stay put when the number under it changes length.
    if (n.lines?.length && n.font && !(n.id && n.lines.length === 1)) {
      const c = cssColor(n.color ?? 'rgb(255,255,255)');
      for (const line of n.lines) {
        const t = new Text({
          text: upper(line.text, n.font.transform),
          style: {
            fontFamily: [n.font.family, 'sans-serif'],
            fontSize: n.font.size,
            fontWeight: n.font.weight as TextStyleOptions['fontWeight'],
            fill: c.color,
            letterSpacing: n.font.spacing,
            wordWrap: false,
          },
        });
        t.alpha = c.alpha * (n.opacity ?? 1);
        t.anchor.set(0, 0.5);
        t.position.set(line.x, line.y + line.h / 2);
        t.resolution = Math.min(globalThis.devicePixelRatio || 1, 3);
        layer.addChild(t);
      }
      if (n.id) texts.set(n.id, layer.children[layer.children.length - 1] as Text);
    } else if (n.text && n.font) {
      const c = cssColor(n.color ?? 'rgb(255,255,255)');
      // A live value is anchored on the line the browser drew, not on the element's
      // box: a padded box would put the number a few pixels off, and the anchor is
      // what keeps it in place when the number changes length.
      const line = n.lines?.[0];
      const style: TextStyleOptions = {
        fontFamily: [n.font.family, 'sans-serif'],
        fontSize: n.font.size,
        fontWeight: n.font.weight as TextStyleOptions['fontWeight'],
        fill: c.color,
        letterSpacing: n.font.spacing,
        lineHeight: n.font.lineHeight,
        align: (n.font.align === 'center' ? 'center' : n.font.align === 'right' ? 'right' : 'left') as 'left' | 'center' | 'right',
        wordWrap: true,
        wordWrapWidth: Math.max(8, n.w + 2),
      };
      const t = new Text({ text: upper(n.text, n.font.transform), style });
      t.alpha = c.alpha * (n.opacity ?? 1);
      const ax = n.font.align === 'center' ? 0.5 : n.font.align === 'right' ? 1 : 0;
      t.anchor.set(ax, 0.5);
      if (line) t.position.set(line.x + line.w * ax, line.y + line.h / 2);
      else t.position.set(n.x + n.w * ax, n.y + n.h / 2);

      t.resolution = Math.min(globalThis.devicePixelRatio || 1, 3);
      layer.addChild(t);
      if (n.id) texts.set(n.id, t);
    }
  }

  // WHAT PAINTS OVER WHAT is the markup's business, not this file's. The capture
  // read each layer's z-index off the skin — in this one the bar sits ABOVE the
  // windows, which is why the buy coin stays lit while the rules are open — and the
  // layers are stacked in that order. The backstop stays at the bottom: it is there
  // to catch a press that hits nothing else.
  const order: Anchor[] = ['full', 'center', 'top', 'bottom'];
  order.sort((a, b) => (ranks[a] ?? 0) - (ranks[b] ?? 0) || order.indexOf(a) - order.indexOf(b));
  for (const a of order) view.addChild(groups[a]);

  return {
    view,
    groups,
    backstop,
    texts,
    boxes,
    windowBox: win ? { x: win.x0, y: win.y0, w: win.x1 - win.x0, h: win.y1 - win.y0 } : undefined,
  };
}

