import { defineConfig } from 'tsup';

// @open-slot-ui/dom is the DOM renderer binding. `@open-slot-ui/core` ships
// separately, so it stays external; the package has no other runtime dependency.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@open-slot-ui/core'],
});
