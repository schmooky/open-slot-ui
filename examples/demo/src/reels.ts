import { Application, Container, Graphics } from 'pixi.js';

/**
 * The example client's stand-in "game": a shuffling pip grid. It exists so the HUD
 * has something to sit over — both renderer demos (canvas and DOM) share it.
 */
export function buildReels(): {
  container: Container;
  layout: (w: number, h: number) => void;
  spin: (app: Application, turbo?: boolean) => Promise<void>;
  skip: () => void;
} {
  const COLS = 5;
  const ROWS = 3;
  const CELL = 150;
  const GAP = 14;
  const PALETTE = [0x4cc9f0, 0xf72585, 0xffc935, 0x80ed99, 0xb5179e];

  const container = new Container();
  const grid = new Container();
  container.addChild(grid);

  const pips: Graphics[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const cell = new Container();
      cell.x = c * (CELL + GAP);
      cell.y = r * (CELL + GAP);
      const bg = new Graphics();
      bg.roundRect(0, 0, CELL, CELL, 16).fill({ color: 0x161b22 }).stroke({ width: 2, color: 0x222b36 });
      const pip = new Graphics();
      pip.x = CELL / 2;
      pip.y = CELL / 2;
      drawPip(pip, PALETTE[(c + r) % PALETTE.length] ?? 0xffffff);
      cell.addChild(bg, pip);
      grid.addChild(cell);
      pips.push(pip);
    }
  }

  const gridW = COLS * CELL + (COLS - 1) * GAP;
  const gridH = ROWS * CELL + (ROWS - 1) * GAP;

  const layout = (w: number, h: number): void => {
    const portrait = w / h < 0.85;
    const scale = Math.min(portrait ? (w * 0.92) / gridW : (w * 0.62) / gridW, (h * 0.42) / gridH);
    container.scale.set(scale);
    container.x = (w - gridW * scale) / 2;
    container.y = (h - gridH * scale) / 2 - h * (portrait ? 0.16 : 0.12);
  };

  let skipFlag = false;
  const shuffle = (): void => {
    for (const pip of pips) drawPip(pip, PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? 0xffffff);
  };
  const spin = (app: Application, turbo = false): Promise<void> =>
    new Promise<void>((resolve) => {
      skipFlag = false;
      let elapsed = 0;
      let acc = 0;
      const duration = turbo ? 360 : 1100;
      const step = turbo ? 45 : 70;
      const fn = (): void => {
        const dt = app.ticker.deltaMS;
        elapsed += dt;
        acc += dt;
        if (acc > step) {
          acc = 0;
          shuffle();
        }
        if (elapsed >= duration || skipFlag) {
          app.ticker.remove(fn);
          shuffle();
          resolve();
        }
      };
      app.ticker.add(fn);
    });
  const skip = (): void => {
    skipFlag = true;
  };

  return { container, layout, spin, skip };
}


function drawPip(g: Graphics, color: number): void {
  g.clear();
  g.roundRect(-44, -44, 88, 88, 14).fill({ color });
}

