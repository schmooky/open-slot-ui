import { defineConfig } from '@playwright/test';

/**
 * STAKE ENGINE DIMENSION MATRIX — modelled on the real Stake web-sdk, not a random
 * pick of named phones. Two things drive it (see StakeEngine/web-sdk
 * `utils-layout/createLayout.svelte.ts` + `config-storybook`):
 *
 *  1. The game runs inside Stake's own **16:9 iframe** players — `1200×675` (main),
 *     `800×450` (mini expanded), `400×225` (mini). These are the primary targets.
 *  2. Fullscreen, the sdk buckets the viewport by RATIO and short-edge SIZE:
 *       ratio ≥ 1.3            → longWidth   (landscape / desktop)
 *       0.8 < ratio < 1.3      → almostSquare (a dedicated 1920×1920 "tablet" layout)
 *       ratio ≤ 0.8            → longHeight  (portrait)
 *       short edge ≤375/480/820/1024 → smallMobile / mobile / tablet / largeTablet
 *
 * So we sweep every ratio band × size band (incl. the almost-square band a plain
 * phone/tablet list never hits) and each Stake iframe. Each project screenshots the
 * HUD, big-values, menu and buy-feature into `screenshots/matrix/<category>/`.
 *
 *   pnpm --dir examples/demo matrix        # capture + build contact sheets
 */

type Dev = readonly [name: string, w: number, h: number, mobile?: boolean];

// Stake's own player containers — the 16:9 iframes the game literally runs in.
const STAKE_PLAYER: Dev[] = [
  ['stake mini 400', 400, 225, true],
  ['stake mini expanded 800', 800, 450],
  ['stake iframe 1200', 1200, 675],
];

// Fullscreen LANDSCAPE — ratio ≥ 1.3 (createLayout "longWidth").
const LANDSCAPE: Dev[] = [
  ['desktop FHD 16-9', 1920, 1080],
  ['laptop 16-10', 1440, 900],
  ['ultrawide 21-9', 2560, 1080],
  ['super-ultrawide 32-9', 3840, 1080],
  ['ipad landscape 4-3', 1180, 886], // ratio 1.33 — just into landscape
  ['phone landscape', 844, 390, true], // small-mobile → sdk "landscape" bucket
  ['small phone landscape', 667, 375, true], // iPhone-SE landscape, smallMobile
];

// ALMOST-SQUARE — 0.8 < ratio < 1.3 (createLayout "tablet", the square 1920×1920 layout).
const SQUARE: Dev[] = [
  ['square 1-1', 1024, 1024],
  ['near-square wide 1.17', 1200, 1024],
  ['near-square tall 0.9', 940, 1044],
  ['fold expanded', 1104, 884, true],
];

// PORTRAIT — ratio ≤ 0.8 (createLayout "longHeight").
const PORTRAIT: Dev[] = [
  ['portrait 9-16', 1080, 1920],
  ['iphone 9-19.5', 393, 852, true],
  ['pixel 9-20', 412, 915, true],
  ['tall phone 9-21', 360, 800, true],
  ['small phone', 375, 667, true], // smallMobile portrait
  ['ipad portrait 3-4', 820, 1180, true], // ratio 0.69 → portrait
];

const proj = (category: string, devices: Dev[]) =>
  devices.map(([name, w, h, mobile]) => ({
    name: `${category}__${name}`,
    metadata: { category, device: name, orientation: w >= h ? 'landscape' : 'portrait' },
    use: {
      browserName: 'chromium' as const,
      viewport: { width: w, height: h },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: !!mobile,
      hasTouch: !!mobile,
    },
  }));

export default defineConfig({
  testDir: './tests',
  testMatch: '**/matrix.spec.ts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 4, // be gentle on the placehold.co art the menu/modal load
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', headless: true },
  projects: [
    ...proj('stake-player', STAKE_PLAYER),
    ...proj('landscape', LANDSCAPE),
    ...proj('square', SQUARE),
    ...proj('portrait', PORTRAIT),
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
