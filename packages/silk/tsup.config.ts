import { defineConfig } from 'tsup';

// @open-slot-ui/silk draws the HUD with pixi-silk on a PixiJS stage. Both of those
// are peers — one instance shared with the game — and the core ships separately.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@open-slot-ui/core', 'pixi.js', 'pixi-silk'],
});
