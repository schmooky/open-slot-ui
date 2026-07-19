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
  const st = screen.stage;
  return {
    x: st.x + ax * st.width + ox * screen.scale,
    y: st.y + ay * st.height + oy * screen.scale,
    scale: screen.scale * (spec.scale ?? 1),
    rotation: ((spec.rotation ?? 0) * Math.PI) / 180,
  };
}
