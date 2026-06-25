import { Container, Graphics } from 'pixi.js';
import type { CellRenderer } from './types';
import { Strip } from './Strip';

export class DigitColumn<C extends Container = Container> {
  readonly container: Container;
  readonly strip: Strip<C>;
  private readonly mask: Graphics;
  readonly digitWidth: number;
  readonly digitHeight: number;
  currentIndex = 0;
  positionTweenIndex = -1;
  alphaTweenIndex = -1;

  constructor(renderer: CellRenderer<C>, digitWidth: number, digitHeight: number) {
    this.digitWidth = digitWidth;
    this.digitHeight = digitHeight;
    this.container = new Container();
    this.strip = new Strip<C>(renderer, digitHeight);
    this.container.addChild(this.strip.container);

    this.mask = new Graphics();
    this.mask.rect(0, 0, digitWidth, digitHeight).fill({ color: 0xffffff });
    this.container.addChild(this.mask);
    this.strip.container.mask = this.mask;

    this.setDigit(0);
  }

  setDigit(digit: number): void {
    const idx = ((digit % 10) + 10) % 10;
    this.currentIndex = idx;
    this.strip.setY(this.strip.yForIndex(idx));
    this.strip.clearFillers();
  }

  get currentDigit(): number {
    return this.currentIndex % 10;
  }

  paintFillers(fromIdx: number, toIdx: number): void {
    this.strip.paintFillers(fromIdx, toIdx);
  }

  getStripY(): number {
    return this.strip.container.y;
  }

  setStripY(y: number): void {
    this.strip.setY(y);
  }

  commitIndex(index: number): void {
    this.currentIndex = ((index % 10) + 10) % 10;
    this.strip.setY(this.strip.yForIndex(this.currentIndex));
    this.strip.clearFillers();
  }

  destroy(): void {
    this.mask.destroy();
    this.strip.destroy();
    this.container.destroy({ children: true });
  }
}
