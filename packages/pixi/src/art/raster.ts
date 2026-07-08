import { Texture, Rectangle, CanvasSource } from 'pixi.js';

/**
 * Shared SVG→texture helpers for the built-in default icon art (`./art/*`). Kept in
 * their own module so a game that imports a single icon loader pulls in only this
 * helper + that one SVG string — the rest tree-shakes away (Charter B2/B5).
 */

/**
 * Rasterize an SVG string to a Texture using the browser's SVG engine (so drop
 * shadows + clip paths render exactly), at `resolution`× the SVG's intrinsic size.
 * Returns `undefined` when there is no DOM (SSR / tests without a document), so
 * callers keep whatever placeholder the view already drew.
 */
export async function svgToTexture(svg: string, resolution = 3): Promise<Texture | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return undefined;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Math.max(1, Math.round((img.naturalWidth || 100) * resolution));
    const h = Math.max(1, Math.round((img.naturalHeight || 100) * resolution));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, w, h);
    // Tag the source with the DPR so it reports the SVG's LOGICAL size (matching a
    // host's `Assets.load({ data: { resolution } })`) — the skins size off that.
    const source = new CanvasSource({ resource: canvas, resolution });
    source.scaleMode = 'linear';
    return new Texture({ source });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Slice a vertically-stacked N-frame sheet into N equal-height frame textures. */
export function sliceRows(tex: Texture, rows: number): Texture[] {
  const src = tex.source;
  const rh = src.height / rows;
  return Array.from({ length: rows }, (_, i) => new Texture({ source: src, frame: new Rectangle(0, i * rh, src.width, rh) }));
}
