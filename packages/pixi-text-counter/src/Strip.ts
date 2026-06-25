import { Container } from 'pixi.js';
import type { CellRenderer } from './types';

export const CELLS_PER_STRIP = 20;

export class Strip<C extends Container = Container> {
  readonly container: Container;
  readonly cells: C[];
  private readonly renderer: CellRenderer<C>;
  private readonly digitHeight: number;

  dirtyLow = 1;
  dirtyHigh = 0;

  constructor(renderer: CellRenderer<C>, digitHeight: number) {
    this.container = new Container();
    this.renderer = renderer;
    this.digitHeight = digitHeight;
    this.cells = new Array<C>(CELLS_PER_STRIP);
    for (let i = 0; i < CELLS_PER_STRIP; i++) {
      const cell = renderer.createCell(i % 10);
      cell.y = i * digitHeight;
      this.cells[i] = cell;
      this.container.addChild(cell);
    }
  }

  paintFillers(fromIdx: number, toIdx: number): void {
    const cells = this.cells;
    if (this.dirtyHigh >= this.dirtyLow) {
      for (let i = this.dirtyLow; i <= this.dirtyHigh; i++) {
        this.renderer.setDigit(cells[i], i % 10);
      }
    }
    const lo = fromIdx < toIdx ? fromIdx : toIdx;
    const hi = fromIdx < toIdx ? toIdx : fromIdx;
    const fillStart = lo + 1;
    const fillEnd = hi - 1;
    if (fillEnd < fillStart) {
      this.dirtyLow = 1;
      this.dirtyHigh = 0;
      return;
    }
    for (let i = fillStart; i <= fillEnd; i++) {
      this.renderer.setFiller(cells[i], i % 10);
    }
    this.dirtyLow = fillStart;
    this.dirtyHigh = fillEnd;
  }

  clearFillers(): void {
    if (this.dirtyHigh < this.dirtyLow) return;
    const cells = this.cells;
    for (let i = this.dirtyLow; i <= this.dirtyHigh; i++) {
      this.renderer.setDigit(cells[i], i % 10);
    }
    this.dirtyLow = 1;
    this.dirtyHigh = 0;
  }

  setY(y: number): void {
    this.container.y = y;
  }

  yForIndex(index: number): number {
    return -index * this.digitHeight;
  }

  destroy(): void {
    const cells = this.cells;
    if (this.renderer.destroyCell) {
      for (let i = 0; i < CELLS_PER_STRIP; i++) {
        this.renderer.destroyCell(cells[i]);
      }
    }
    this.container.destroy({ children: true });
  }
}
