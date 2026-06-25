import { defineConfig } from 'tsup';

// Builds the vendored counter to dist (ESM + CJS + .d.ts). `pixi.js` stays
// external (the single shared instance comes from the host). @open-ui/pixi then
// resolves + INLINES this dist into its own bundle, so the counter ships inside
// @open-ui/pixi and is never a separate runtime dependency. Build order:
// pixi-text-counter → @open-ui/core → @open-ui/pixi (see the root `build` script).
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['pixi.js', 'gsap'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
