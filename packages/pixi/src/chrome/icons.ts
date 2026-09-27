import { Graphics } from 'pixi.js';

/**
 * The ribbon's icon set, drawn as vectors.
 *
 * The reference UI ships an icon FONT; open-ui draws the same glyph vocabulary with
 * `Graphics` instead. That keeps the library art-free (Charter B2) — no font file to
 * host, no licence to inherit, no atlas to load — and every icon inherits the theme
 * colour and scales cleanly to any `rem`.
 *
 * Every icon draws centred on (0, 0) inside a `size × size` box.
 */
export type IconName =
  | 'menu'
  | 'close'
  | 'spin'
  | 'play'
  | 'auto'
  | 'stop'
  | 'up'
  | 'down'
  | 'plus'
  | 'minus'
  | 'sound-on'
  | 'sound-off'
  | 'music-on'
  | 'music-off'
  | 'turbo'
  | 'super-turbo'
  | 'history'
  | 'info'
  | 'home'
  | 'coins'
  | 'chip'
  | 'fullscreen'
  | 'fullscreen-exit'
  | 'check'
  | 'caret-up'
  | 'caret-down';

interface IconOpts {
  color: string;
  /** Stroke weight as a fraction of `size`. Default 0.1. */
  weight?: number;
  alpha?: number;
}

/** Draw `name` into `g` (which is cleared first), centred, fitting `size`. */
export function drawIcon(g: Graphics, name: IconName, size: number, opts: IconOpts): void {
  g.clear();
  const s = size;
  const c = opts.color;
  const a = opts.alpha ?? 1;
  const w = (opts.weight ?? 0.1) * s;
  const stroke = { width: w, color: c, alpha: a, cap: 'round' as const, join: 'round' as const };
  const fill = { color: c, alpha: a };

  switch (name) {
    case 'menu': {
      const halfW = s * 0.34;
      for (const y of [-s * 0.22, 0, s * 0.22]) g.moveTo(-halfW, y).lineTo(halfW, y);
      g.stroke(stroke);
      break;
    }
    case 'close': {
      const d = s * 0.28;
      g.moveTo(-d, -d).lineTo(d, d).moveTo(d, -d).lineTo(-d, d).stroke(stroke);
      break;
    }
    case 'spin': {
      // A three-quarter circular arrow — the round button's default face.
      const r = s * 0.32;
      g.arc(0, 0, r, Math.PI * 0.35, Math.PI * 1.9).stroke({ ...stroke, width: w * 1.15 });
      const head = s * 0.17;
      const ax = Math.cos(Math.PI * 0.35) * r;
      const ay = Math.sin(Math.PI * 0.35) * r;
      g.moveTo(ax + head * 0.1, ay + head * 0.55)
        .lineTo(ax + head * 0.95, ay - head * 0.2)
        .lineTo(ax - head * 0.35, ay - head * 0.6)
        .closePath()
        .fill(fill);
      break;
    }
    case 'play': {
      const r = s * 0.3;
      g.moveTo(-r * 0.75, -r).lineTo(r, 0).lineTo(-r * 0.75, r).closePath().fill(fill);
      break;
    }
    case 'auto': {
      // The autoplay glyph: a circular arrow around a play triangle.
      const r = s * 0.34;
      g.arc(0, 0, r, Math.PI * 0.75, Math.PI * 0.45).stroke({ ...stroke, width: w * 0.9 });
      const head = s * 0.15;
      const ax = Math.cos(Math.PI * 0.75) * r;
      const ay = Math.sin(Math.PI * 0.75) * r;
      g.moveTo(ax - head * 0.55, ay - head * 0.35).lineTo(ax + head * 0.5, ay - head * 0.55).lineTo(ax + head * 0.1, ay + head * 0.6).closePath().fill(fill);
      const t = s * 0.17;
      g.moveTo(-t * 0.6, -t).lineTo(t * 0.85, 0).lineTo(-t * 0.6, t).closePath().fill(fill);
      break;
    }
    case 'stop': {
      const r = s * 0.24;
      g.roundRect(-r, -r, r * 2, r * 2, r * 0.22).fill(fill);
      break;
    }
    case 'up':
    case 'down': {
      const dir = name === 'up' ? -1 : 1;
      const r = s * 0.3;
      g.moveTo(-r, dir * -r * 0.45).lineTo(0, dir * r * 0.5).lineTo(r, dir * -r * 0.45).stroke({ ...stroke, width: w * 1.15 });
      break;
    }
    case 'caret-up':
    case 'caret-down': {
      const dir = name === 'caret-up' ? -1 : 1;
      const r = s * 0.26;
      g.moveTo(-r, dir * -r * 0.5).lineTo(0, dir * r * 0.5).lineTo(r, dir * -r * 0.5).closePath().fill(fill);
      break;
    }
    case 'plus':
    case 'minus': {
      const r = s * 0.3;
      g.moveTo(-r, 0).lineTo(r, 0);
      if (name === 'plus') g.moveTo(0, -r).lineTo(0, r);
      g.stroke(stroke);
      break;
    }
    case 'sound-on':
    case 'sound-off': {
      const bx = s * 0.3;
      g.moveTo(-bx, -s * 0.12)
        .lineTo(-bx * 0.45, -s * 0.12)
        .lineTo(-s * 0.02, -s * 0.3)
        .lineTo(-s * 0.02, s * 0.3)
        .lineTo(-bx * 0.45, s * 0.12)
        .lineTo(-bx, s * 0.12)
        .closePath()
        .fill(fill);
      if (name === 'sound-on') {
        g.arc(s * 0.02, 0, s * 0.18, -Math.PI * 0.4, Math.PI * 0.4).stroke({ ...stroke, width: w * 0.8 });
        g.arc(s * 0.02, 0, s * 0.3, -Math.PI * 0.4, Math.PI * 0.4).stroke({ ...stroke, width: w * 0.8 });
      } else {
        const d = s * 0.14;
        g.moveTo(s * 0.1, -d).lineTo(s * 0.1 + d * 2, d).moveTo(s * 0.1 + d * 2, -d).lineTo(s * 0.1, d).stroke({ ...stroke, width: w * 0.8 });
      }
      break;
    }
    case 'music-on':
    case 'music-off': {
      const stemX = s * 0.16;
      const top = -s * 0.3;
      g.moveTo(-stemX, s * 0.2).lineTo(-stemX, top).lineTo(stemX * 1.6, top - s * 0.06).lineTo(stemX * 1.6, s * 0.1).stroke({ ...stroke, width: w * 0.85 });
      g.circle(-stemX - s * 0.09, s * 0.22, s * 0.1).fill(fill);
      g.circle(stemX * 1.6 - s * 0.09, s * 0.12, s * 0.1).fill(fill);
      if (name === 'music-off') {
        const d = s * 0.34;
        g.moveTo(-d, -d).lineTo(d, d).stroke({ ...stroke, width: w * 0.85 });
      }
      break;
    }
    case 'turbo':
    case 'super-turbo': {
      // A lightning bolt; the "super" variant doubles it.
      const bolt = (ox: number, scale: number): void => {
        const h = s * 0.34 * scale;
        const wd = s * 0.2 * scale;
        g.moveTo(ox + wd * 0.35, -h)
          .lineTo(ox - wd, h * 0.12)
          .lineTo(ox - wd * 0.05, h * 0.12)
          .lineTo(ox - wd * 0.4, h)
          .lineTo(ox + wd, -h * 0.15)
          .lineTo(ox + wd * 0.05, -h * 0.15)
          .closePath()
          .fill(fill);
      };
      if (name === 'turbo') bolt(0, 1);
      else {
        bolt(-s * 0.16, 0.92);
        bolt(s * 0.16, 0.92);
      }
      break;
    }
    case 'history': {
      const r = s * 0.3;
      g.arc(0, 0, r, Math.PI * 0.6, Math.PI * 0.35).stroke({ ...stroke, width: w * 0.9 });
      const head = s * 0.13;
      const ax = Math.cos(Math.PI * 0.6) * r;
      const ay = Math.sin(Math.PI * 0.6) * r;
      g.moveTo(ax - head, ay - head * 0.2).lineTo(ax + head * 0.5, ay - head * 0.7).lineTo(ax + head * 0.2, ay + head * 0.7).closePath().fill(fill);
      g.moveTo(0, -r * 0.55).lineTo(0, 0).lineTo(r * 0.45, r * 0.2).stroke({ ...stroke, width: w * 0.8 });
      break;
    }
    case 'info': {
      const r = s * 0.32;
      g.circle(0, 0, r).stroke({ ...stroke, width: w * 0.85 });
      g.circle(0, -r * 0.42, w * 0.5).fill(fill);
      g.moveTo(0, -r * 0.1).lineTo(0, r * 0.5).stroke({ ...stroke, width: w * 0.85 });
      break;
    }
    case 'home': {
      const r = s * 0.3;
      g.moveTo(-r, -r * 0.05).lineTo(0, -r * 0.8).lineTo(r, -r * 0.05).stroke({ ...stroke, width: w * 0.9 });
      g.moveTo(-r * 0.72, -r * 0.02).lineTo(-r * 0.72, r * 0.75).lineTo(r * 0.72, r * 0.75).lineTo(r * 0.72, -r * 0.02).stroke({ ...stroke, width: w * 0.9 });
      break;
    }
    case 'coins': {
      const r = s * 0.19;
      g.ellipse(-s * 0.08, -s * 0.1, r, r * 0.55).stroke({ ...stroke, width: w * 0.8 });
      g.ellipse(s * 0.1, s * 0.12, r, r * 0.55).stroke({ ...stroke, width: w * 0.8 });
      break;
    }
    case 'chip': {
      const r = s * 0.3;
      g.circle(0, 0, r).stroke({ ...stroke, width: w * 0.85 });
      g.circle(0, 0, r * 0.42).fill(fill);
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2 + Math.PI / 4;
        g.moveTo(Math.cos(ang) * r * 0.7, Math.sin(ang) * r * 0.7).lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      g.stroke({ ...stroke, width: w * 0.85 });
      break;
    }
    case 'fullscreen':
    case 'fullscreen-exit': {
      const r = s * 0.3;
      const arm = r * 0.55;
      const corner = (sx: number, sy: number): void => {
        const x = sx * r;
        const y = sy * r;
        if (name === 'fullscreen') g.moveTo(x - sx * arm, y).lineTo(x, y).lineTo(x, y - sy * arm);
        else g.moveTo(x - sx * arm, y - sy * arm * 0.0).lineTo(x - sx * arm, y - sy * arm).lineTo(x, y - sy * arm);
      };
      corner(-1, -1);
      corner(1, -1);
      corner(-1, 1);
      corner(1, 1);
      g.stroke({ ...stroke, width: w * 0.95 });
      break;
    }
    case 'check': {
      const r = s * 0.3;
      g.moveTo(-r, 0).lineTo(-r * 0.25, r * 0.6).lineTo(r, -r * 0.55).stroke({ ...stroke, width: w * 1.1 });
      break;
    }
  }
}

/** A ready-made `Graphics` for one icon. */
export function icon(name: IconName, size: number, opts: IconOpts): Graphics {
  const g = new Graphics();
  drawIcon(g, name, size, opts);
  return g;
}
