/**
 * `@open-slot-ui/pixi/art` — the library's built-in default ICON ART: the reference
 * Figma SVGs, bundled as strings and rasterized to textures on demand.
 *
 * Tree-shakeable by design (Charter B2/B5): each icon lives in its own module, so a
 * game that needs just one — say the buy-feature coin —
 *
 * ```ts
 * import { loadBonusTexture } from '@open-slot-ui/pixi/art';
 * const bonus = await loadBonusTexture();
 * mountHud(app, spec, { icons: { bonus } });
 * ```
 *
 * bundles only that one SVG; nothing here is referenced by `mountHud` itself, so a
 * game that ships its own art pays for none of it. For the whole designed set in one
 * call, use {@link loadBuiltinArt}.
 */
import { type SpinSkinFactory } from '../skin/SpinSkin';
import { type OpenUIIcons } from '../OpenUIPixi';
import { loadTurboArt } from './turbo';
import { loadAutoplayArt } from './autoplay';
import { loadBonusTexture } from './bonus';
import { loadBetPlusTexture, loadBetMinusTexture } from './bet';
import { builtinSpinSkin } from './spin';

export { svgToTexture, sliceRows } from './raster';
export { turboSvg, loadTurboArt } from './turbo';
export { autoplaySvg, loadAutoplayArt } from './autoplay';
export { bonusSvg, loadBonusTexture } from './bonus';
export { betPlusSvg, betMinusSvg, loadBetPlusTexture, loadBetMinusTexture } from './bet';
export { spinDefaultSvg, spinAutoSvg, loadSpinArt, builtinSpinSkin } from './spin';

/** The full designed art set, ready to hand straight to `mountHud`. */
export interface BuiltinArt {
  /** Button icons — spread into `mountHud(app, spec, { icons })`. */
  icons: OpenUIIcons;
  /** Spin-button skin — pass as `mountHud(app, spec, { spinSkin })`. */
  spinSkin?: SpinSkinFactory;
}

/**
 * Load the ENTIRE built-in icon set at once (turbo, autoplay, buy, bet ±, spin) and
 * return it shaped for `mountHud`. Referencing every icon, this pulls the whole art
 * bundle — use it for a zero-config "give me the designed HUD"; import the per-icon
 * loaders instead when you only need a few (so the rest tree-shakes away). Resolves
 * with empty art when there is no DOM (SSR/tests), so mounting still succeeds.
 *
 * ```ts
 * const { icons, spinSkin } = await loadBuiltinArt();
 * mountHud(app, spec, { icons, spinSkin });
 * ```
 */
export async function loadBuiltinArt(): Promise<BuiltinArt> {
  const [turbo, auto, bonus, plus, minus, spinSkin] = await Promise.all([
    loadTurboArt(),
    loadAutoplayArt(),
    loadBonusTexture(),
    loadBetPlusTexture(),
    loadBetMinusTexture(),
    builtinSpinSkin(),
  ]);
  const icons: OpenUIIcons = {};
  if (turbo) {
    icons.turboOff = turbo.off;
    icons.turboOn = turbo.on;
  }
  if (auto) {
    icons.autoIdle = auto.idle;
    icons.autoActive = auto.active;
  }
  if (bonus) icons.bonus = bonus;
  if (plus) icons.betPlus = plus;
  if (minus) icons.betMinus = minus;
  return { icons, spinSkin };
}
