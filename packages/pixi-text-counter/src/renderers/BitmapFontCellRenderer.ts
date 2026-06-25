import { BitmapText, Container, type ColorSource } from 'pixi.js';
import type { CellRenderer } from '../types';

const DIGITS: readonly string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export interface BitmapFontCellRendererOptions {
  fontName: string;
  fontSize?: number;
  fillerChar?: string;
  digitWidth: number;
  digitHeight: number;
  fill?: ColorSource;
  align?: 'left' | 'center' | 'right';
}

export class BitmapFontCellRenderer implements CellRenderer<Container> {
  private readonly fontName: string;
  private readonly fontSize: number;
  private readonly fillerChar: string;
  private readonly digitWidth: number;
  private readonly digitHeight: number;
  private readonly fill: ColorSource;
  private readonly anchorX: number;

  constructor(opts: BitmapFontCellRendererOptions) {
    this.fontName = opts.fontName;
    this.fontSize = opts.fontSize ?? 32;
    this.fillerChar = opts.fillerChar ?? '';
    this.digitWidth = opts.digitWidth;
    this.digitHeight = opts.digitHeight;
    this.fill = opts.fill ?? 0xffffff;
    const align = opts.align ?? 'center';
    this.anchorX = align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
  }

  createCell(digit: number): Container {
    const container = new Container();
    const text = this.makeText(DIGITS[digit]);
    text.anchor.set(this.anchorX, 0.5);
    text.x = this.digitWidth * this.anchorX;
    text.y = this.digitHeight / 2;
    container.addChild(text);
    return container;
  }

  setDigit(cell: Container, digit: number): void {
    const text = cell.children[0] as BitmapText;
    const next = DIGITS[digit];
    if (text.text !== next) text.text = next;
  }

  setFiller(cell: Container, _digit: number): void {
    const text = cell.children[0] as BitmapText;
    if (text.text !== this.fillerChar) text.text = this.fillerChar;
  }

  createSeparator(char: string): Container {
    const container = new Container();
    const text = this.makeText(char);
    text.anchor.set(0.5, 0.5);
    container.addChild(text);
    text.y = this.digitHeight / 2;
    text.x = text.width / 2;
    return container;
  }

  destroyCell(cell: Container): void {
    cell.destroy({ children: true });
  }

  private makeText(value: string): BitmapText {
    return new BitmapText({
      text: value,
      style: {
        fontFamily: this.fontName,
        fontSize: this.fontSize,
        fill: this.fill,
      },
    });
  }
}
