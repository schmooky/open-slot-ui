import type { Node } from './tree';

/**
 * THE CAPTURED SKIN, AND HOW TO ASK IT FOR THE RIGHT ONE.
 *
 * `scripts/capture.mjs` measures the markup HUD at every size the stylesheet lays it
 * out differently — two desktop widths, a tablet, a phone in both orientations — and
 * writes them under short names with the repeats pulled into tables. This expands
 * that back into boxes the renderer understands, one state at a time and only when
 * something asks for it, and picks the breakpoint a given window should be drawn at.
 *
 * Picking a breakpoint rather than scaling one design is the whole point: a HUD
 * reflows, and a photograph does not.
 */

/** A named element's box: what a player can press, even when it paints nothing. */
export interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zone?: 'top' | 'bottom' | 'window';
}

/** One breakpoint of the design. */
export interface Shot {
  w: number;
  h: number;
  channel: 'desktop' | 'mobile';
}

interface RawShot {
  w: number;
  h: number;
  channel: 'desktop' | 'mobile';
  states: Record<string, Array<Record<string, unknown>>>;
  hits: Record<string, Hit[]>;
  fonts: Array<Node['font']>;
  clips: number[][];
  colors: string[];
  ramps: string[];
}

export interface RawCapture {
  sizes: RawShot[];
  keys: { node: Record<string, string>; line: Record<string, string>; glyph: Record<string, string> };
}

export class Skin {
  /** The breakpoints, in the order they were measured. */
  readonly sizes: Shot[];
  private readonly raw: RawCapture;
  private readonly cache = new Map<string, Node[]>();

  constructor(raw: RawCapture) {
    this.raw = raw;
    this.sizes = raw.sizes.map((s) => ({ w: s.w, h: s.h, channel: s.channel }));
  }

  /** The states this capture holds, in the order they were measured. */
  states(at = 0): string[] {
    return Object.keys(this.raw.sizes[at]?.states ?? {});
  }

  /**
   * Which breakpoint to draw a given window at.
   *
   * Orientation first — a phone on its side is not a tall phone — then the widest
   * design that still fits, because that is what a stylesheet's min-width rules do.
   * A window narrower than anything measured gets the narrowest design, scaled.
   */
  pick(width: number, height: number): number {
    const wantsPortrait = height > width;
    const fits = (s: Shot): boolean => s.w <= width + 1;
    const ranked = this.sizes
      .map((s, i) => ({ s, i }))
      .sort((a, b) => {
        const orient = Number(b.s.h > b.s.w === wantsPortrait) - Number(a.s.h > a.s.w === wantsPortrait);
        if (orient) return orient;
        if (fits(a.s) !== fits(b.s)) return fits(a.s) ? -1 : 1;
        return fits(a.s) ? b.s.w - a.s.w : a.s.w - b.s.w;
      });
    return ranked[0]?.i ?? 0;
  }

  /** The boxes of one state at one breakpoint, expanded on first use. */
  nodes(at: number, state: string): Node[] {
    const key = `${at}:${state}`;
    const had = this.cache.get(key);
    if (had) return had;
    const shot = this.raw.sizes[at];
    const list = shot?.states[state] ?? shot?.states.idle ?? [];
    const out = list.map((n) => this.expand(n, shot as RawShot));
    this.cache.set(key, out);
    return out;
  }

  /** The pressable boxes of one state at one breakpoint. */
  hits(at: number, state: string): Map<string, Hit> {
    const shot = this.raw.sizes[at];
    const map = new Map<string, Hit>();
    for (const h of shot?.hits[state] ?? []) map.set(h.id, h);
    return map;
  }

  /** The window the design was measured in. */
  viewport(at: number): { w: number; h: number } {
    const shot = this.raw.sizes[at];
    return { w: shot?.w ?? 1440, h: shot?.h ?? 900 };
  }

  private expand(short: Record<string, unknown>, shot: RawShot): Node {
    const keys = this.raw.keys;
    const long = (map: Record<string, string>, obj: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [name, code] of Object.entries(map)) if (obj[code] !== undefined) out[name] = obj[code];
      return out;
    };
    const hue = (v: unknown): string | undefined =>
      typeof v === 'string' && v.startsWith('#') && /^#\d+$/.test(v) ? shot.colors[Number(v.slice(1))] : (v as string | undefined);

    const n = long(keys.node, short) as unknown as Node & { font?: unknown; clip?: unknown; ramp?: unknown };
    n.bg = hue(n.bg);
    n.color = hue(n.color);
    if (n.border) n.border = { w: n.border.w, color: hue(n.border.color) as string };
    if (typeof n.font === 'number') n.font = shot.fonts[n.font];
    if (typeof n.clip === 'number') n.clip = shot.clips[n.clip];
    if (typeof n.ramp === 'number') n.ramp = shot.ramps?.[n.ramp];
    if (n.glyph) {
      const g = long(keys.glyph, n.glyph as unknown as Record<string, unknown>) as unknown as NonNullable<Node['glyph']>;
      g.color = hue(g.color) as string;
      n.glyph = g;
    }
    if (n.lines) {
      n.lines = (n.lines as unknown as Array<Record<string, unknown>>).map((l) => {
        const line = long(keys.line, l) as unknown as { text: string; x: number; y: number; w: number; h: number };
        // A line that said what its box said was not written twice.
        if (line.text === undefined) line.text = n.text ?? '';
        return line;
      });
    }
    // Four equal corners were written once.
    if (n.radius && !n.radii) n.radii = [n.radius, n.radius, n.radius, n.radius];
    return n;
  }
}
