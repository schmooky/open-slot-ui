import { Container, type Application } from 'pixi.js';
import { gsap } from 'gsap';
import {
  ReelSetBuilder,
  CardSymbol,
  CARD_DECK,
  WILD_CARD,
  SpeedPresets,
  SpinTextureCache,
  StaticSpinSymbol,
  type ReelSet,
} from 'pixi-reels';

/**
 * The example client's GAME: a real 5×3 slot on `pixi-reels`, using the card
 * symbols the engine ships so the demo needs no art at all.
 *
 * It exists so the HUD has something honest to drive — both renderer demos (the
 * canvas ribbon and the DOM binding) mount this same slot, and the HUD's turbo
 * switch, slam-stop and round loop are wired to it rather than to a fake timer.
 */
export const REELS = 5;
export const ROWS = 3;
const CELL = 150;
const GAP = 10;

/** The strip: the card deck plus a rarer WILD. */
const SYMBOLS = [...CARD_DECK.map((c) => c.id), WILD_CARD.id];
const WEIGHTS: Record<string, number> = Object.fromEntries([
  ...CARD_DECK.map((c, i) => [c.id, 40 - i * 3]), // low cards are common, aces rare
  [WILD_CARD.id, 4],
]);

export interface Slot {
  /** The display object to add to the stage. */
  readonly container: Container;
  /** Fit + centre the reels in the play area above the HUD bar. */
  layout(width: number, height: number, barHeight?: number): void;
  /** Spin, land on a random grid, and resolve with what landed. */
  spin(turbo?: boolean): Promise<string[][]>;
  /** Slam-stop: land the in-flight spin right now. */
  skip(): void;
  /** Play the win animation on every cell of a winning line. */
  celebrate(cells: Array<[reel: number, row: number]>): void;
  destroy(): void;
}

/**
 * Build the slot. Symbols spin as BAKED MOTION-BLUR snapshots
 * (`StaticSpinSymbol` over a shared `SpinTextureCache`) — the blur is rendered
 * once per symbol and reused, so a spinning reel costs a sprite per cell, not a
 * live filter.
 */
export function buildReels(app: Application): Slot {
  const cache = new SpinTextureCache({ renderer: app.renderer });

  const set: ReelSet = new ReelSetBuilder()
    .reels(REELS)
    .visibleCells(ROWS)
    .symbolSize(CELL, CELL)
    .symbolGap(GAP, GAP)
    .bufferSymbols(2)
    .symbols((registry) => {
      for (const card of [...CARD_DECK, WILD_CARD]) {
        registry.register(card.id, StaticSpinSymbol, {
          createInner: () =>
            new CardSymbol({
              color: card.color,
              label: card.label,
              ...('textColor' in card ? { textColor: card.textColor } : {}),
            }),
          cache,
          spinTexture: 'blurred',
          blurRampMs: 120,
        });
      }
    })
    .weights(WEIGHTS)
    // Two tempos, switched by the HUD's turbo control.
    .speed(SpeedPresets.NORMAL.name, SpeedPresets.NORMAL)
    .speed(SpeedPresets.TURBO.name, SpeedPresets.TURBO)
    .ticker(app.ticker)
    .gsap(gsap)
    .build();

  const container = new Container();
  container.addChild(set);

  const gridW = REELS * CELL + (REELS - 1) * GAP;
  const gridH = ROWS * CELL + (ROWS - 1) * GAP;

  const randomSymbol = (): string => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)] ?? '7';

  return {
    container,

    layout(width, height, barHeight = 0) {
      // The play area is everything the HUD did not reserve, less a margin so the
      // message strip above the bar has air and the reels never sit under it.
      const play = Math.max(120, height - barHeight - 28);
      const scale = Math.min((width * 0.66) / gridW, (play * 0.86) / gridH);
      container.scale.set(scale);
      container.x = (width - gridW * scale) / 2;
      container.y = Math.max(8, (play - gridH * scale) / 2);
    },

    async spin(turbo = false) {
      set.setSpeed(turbo ? SpeedPresets.TURBO.name : SpeedPresets.NORMAL.name);
      const spinning = set.spin();
      // A real game asks its RGS here; the demo rolls its own grid.
      const grid: string[][] = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, randomSymbol));
      set.setResult(grid.map((visible) => ({ visible })));
      await spinning;
      return grid;
    },

    skip() {
      set.skipSpin();
    },

    celebrate(cells) {
      // One reel at a time: `getReel(i).getSymbolAt(cell)` is the engine's handle on
      // the live symbol, and every ReelSymbol knows how to play its own win.
      for (const [reel, row] of cells) void set.getReel(reel)?.getSymbolAt(row)?.playWin();
    },

    destroy() {
      set.destroy();
      container.destroy({ children: true });
    },
  };
}

/**
 * The demo's paytable: the centre row pays for 3+ matching symbols from the
 * left, and WILD stands in for anything. Small, but real — the WIN readout then
 * means something instead of being a random number.
 */
export function evaluate(grid: string[][]): { win: number; cells: Array<[number, number]>; symbol?: string } {
  const row = 1; // the centre payline
  const line = grid.map((reel) => reel[row] ?? '');
  const first = line.find((s) => s !== WILD_CARD.id) ?? line[0] ?? '';
  let run = 0;
  for (const s of line) {
    if (s === first || s === WILD_CARD.id) run++;
    else break;
  }
  if (run < 3) return { win: 0, cells: [] };
  const PAYS: Record<number, number> = { 3: 1, 4: 5, 5: 25 };
  const wilds = line.slice(0, run).filter((s) => s === WILD_CARD.id).length;
  const base = PAYS[run] ?? 0;
  return {
    win: base * (wilds > 0 ? 2 : 1), // wilds double the line
    cells: Array.from({ length: run }, (_, reel) => [reel, row] as [number, number]),
    symbol: first,
  };
}
