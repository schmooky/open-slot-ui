import type { ScreenState } from './screen';

/** Explicit anchors — no magic numbers buried in components (Charter P9). */
export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface LayoutSpec {
  anchor: Anchor;
  /** Offset from the anchor, in reference px (scaled with the screen). */
  offset?: [number, number];
  /** Extra scale multiplier on top of the screen's fit scale. */
  scale?: number;
  /** Rotation in degrees, clockwise. Default 0. */
  rotation?: number;
  /**
   * Which rect the anchor resolves against. `'stage'` (default) = the uniformly-scaled
   * design FRAME, so the HUD scales as one homogeneous unit and inter-control gaps never
   * change with aspect ratio. `'screen'` = the RAW viewport, so a control hugs the true
   * screen edge even when the frame is letterboxed off it — for the corner utility buttons
   * (mute / fullscreen / RTP / timers), which must sit in the viewport corner at every
   * aspect (otherwise a bottom-anchored letterboxed frame drops a "top" control mid-screen).
   */
  origin?: 'stage' | 'screen';
}

export interface Placement {
  x: number;
  y: number;
  scale: number;
  /** Rotation in radians (resolved from `LayoutSpec.rotation`, which is degrees). */
  rotation: number;
}

function anchorFactors(anchor: Anchor): [number, number] {
  const ax = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
  const ay = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
  return [ax, ay];
}

/**
 * Resolve a control's layout against the current screen. Pure math.
 *
 * Anchors to the uniformly-scaled `screen.stage` frame — NOT the raw screen — so the
 * whole HUD scales as one homogeneous unit: the gap between two controls is always a
 * fixed fraction of the (uniformly-scaled) frame, never a function of the viewport's
 * aspect ratio. That's what stops a growing value or a narrow window from letting
 * controls drift into each other. At the reference resolution `stage` equals the
 * screen, so authored offsets land pixel-identically.
 */
export function resolvePlacement(spec: LayoutSpec, screen: ScreenState): Placement {
  const [ax, ay] = anchorFactors(spec.anchor);
  const [ox, oy] = spec.offset ?? [0, 0];
  // `screen`-origin controls anchor to the raw viewport so they hug the true screen edge even
  // when the design frame is letterboxed off it; the default anchors to the uniformly-scaled
  // `stage` frame (at the reference aspect stage == screen, so both are identical there).
  const rect = spec.origin === 'screen' ? { x: 0, y: 0, width: screen.width, height: screen.height } : screen.stage;
  return {
    x: rect.x + ax * rect.width + ox * screen.scale,
    y: rect.y + ay * rect.height + oy * screen.scale,
    scale: screen.scale * (spec.scale ?? 1),
    rotation: ((spec.rotation ?? 0) * Math.PI) / 180,
  };
}
