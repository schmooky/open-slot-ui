/** Responsive screen model: orientation, a named breakpoint, and a fit scale. */

export type Orientation = 'landscape' | 'portrait';

/** A named device bucket. Config can target these to restyle per device. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** The uniformly-scaled DESIGN FRAME ("stage") rect, in screen pixels. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenState {
  width: number;
  height: number;
  orientation: Orientation;
  /** Named device bucket, derived from the shorter screen edge (see LayoutConfig). */
  breakpoint: Breakpoint;
  /** Multiply reference-px sizes by this to fit the current screen. */
  scale: number;
  /**
   * The reference design frame, scaled UNIFORMLY by `scale` and placed in the viewport
   * (letterboxed by `stageAnchor` when the aspect ratio differs). Every control anchors
   * to THIS rect — not the raw screen — so the whole HUD scales as one homogeneous unit
   * and the relative gaps between controls never change with aspect ratio. At the
   * reference resolution `stage` exactly equals the screen, so authored layouts are
   * pixel-identical there.
   */
  stage: StageRect;
}

export interface LayoutConfig {
  /** Reference design resolution for landscape / portrait. */
  refLandscape: [number, number];
  refPortrait: [number, number];
  /** Aspect ratio (w/h) below which we switch to the portrait layout. */
  portraitBelowAspect: number;
  /**
   * Breakpoint thresholds on the SHORTER screen edge (px). A phone is "mobile" in
   * both orientations because its short edge stays small — the right intuition for
   * "what device is this". `<= mobile` → mobile, `<= tablet` → tablet, else desktop.
   */
  breakpoints: { mobile: number; tablet: number };
  /**
   * Where the uniformly-scaled design frame sits in the viewport when the aspect ratio
   * doesn't match the reference (i.e. how the letterbox margins are distributed), as
   * `[x, y]` factors in `0..1`. `[0.5, 1]` (default) = bottom-centre: the bottom bar
   * always hugs the screen bottom and any extra vertical room opens ABOVE (the reel
   * area, filled by the game); horizontal slack splits evenly. `[0.5, 0.5]` centres it.
   */
  stageAnchor: [number, number];
}

export const defaultLayoutConfig: LayoutConfig = {
  // Reference design frames, matching the Figma "DEF" frames 1:1 so offsets map
  // directly: desktop 1920×1080, mobile 360×779 (×3 = 1080×2337). The portrait
  // aspect matches real phones (~0.46), so scaling no longer squashes vertically.
  refLandscape: [1920, 1080],
  refPortrait: [1080, 2337],
  portraitBelowAspect: 0.85,
  breakpoints: { mobile: 480, tablet: 840 },
  // Bottom bar hugs the screen bottom; extra height opens above (reel area).
  stageAnchor: [0.5, 1],
};

/** Classify the shorter edge into a named device bucket. Pure, total. */
export function breakpointFor(width: number, height: number, cfg: LayoutConfig): Breakpoint {
  const short = Math.min(Math.max(width, 1), Math.max(height, 1));
  if (short <= cfg.breakpoints.mobile) return 'mobile';
  if (short <= cfg.breakpoints.tablet) return 'tablet';
  return 'desktop';
}

export function computeScreen(width: number, height: number, cfg: LayoutConfig): ScreenState {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const orientation: Orientation = w / h < cfg.portraitBelowAspect ? 'portrait' : 'landscape';
  const [rw, rh] = orientation === 'portrait' ? cfg.refPortrait : cfg.refLandscape;
  const scale = Math.min(w / rw, h / rh);
  // The design frame, scaled uniformly and letterbox-positioned. At the reference
  // aspect it fills the screen exactly (stage == screen).
  const sw = rw * scale;
  const sh = rh * scale;
  const [ax, ay] = cfg.stageAnchor ?? [0.5, 1];
  const stage: StageRect = { x: (w - sw) * ax, y: (h - sh) * ay, width: sw, height: sh };
  return { width: w, height: h, orientation, breakpoint: breakpointFor(w, h, cfg), scale, stage };
}
