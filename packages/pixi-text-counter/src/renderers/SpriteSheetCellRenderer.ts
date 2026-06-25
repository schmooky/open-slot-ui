import { Container, Sprite, type Texture } from 'pixi.js';
import type { CellRenderer } from '../types';

export interface SpriteSheetCellRendererOptions {
  digitTextures: Texture[];
  fillerTextures: Texture[];
  digitWidth: number;
  digitHeight: number;
  separatorTextures?: Record<string, Texture>;
}

export class SpriteSheetCellRenderer implements CellRenderer<Container> {
  private readonly digitTextures: Texture[];
  private readonly fillerTextures: Texture[];
  private readonly perDigitFiller: boolean;
  private readonly digitWidth: number;
  private readonly digitHeight: number;
  private readonly separatorTextures: Record<string, Texture>;

  constructor(opts: SpriteSheetCellRendererOptions) {
    if (opts.digitTextures.length !== 10) {
      throw new Error(
        `SpriteSheetCellRenderer: digitTextures must have length 10, got ${opts.digitTextures.length}`,
      );
    }
    if (opts.fillerTextures.length !== 1 && opts.fillerTextures.length !== 10) {
      throw new Error(
        `SpriteSheetCellRenderer: fillerTextures must have length 1 or 10, got ${opts.fillerTextures.length}`,
      );
    }
    this.digitTextures = opts.digitTextures;
    this.fillerTextures = opts.fillerTextures;
    this.perDigitFiller = opts.fillerTextures.length === 10;
    this.digitWidth = opts.digitWidth;
    this.digitHeight = opts.digitHeight;
    this.separatorTextures = opts.separatorTextures ?? {};
  }

  createCell(digit: number): Container {
    const container = new Container();
    const sprite = new Sprite(this.digitTextures[digit]);
    sprite.anchor.set(0.5, 0.5);
    sprite.x = this.digitWidth / 2;
    sprite.y = this.digitHeight / 2;
    container.addChild(sprite);
    return container;
  }

  setDigit(cell: Container, digit: number): void {
    const sprite = cell.children[0] as Sprite;
    const next = this.digitTextures[digit];
    if (sprite.texture !== next) sprite.texture = next;
  }

  setFiller(cell: Container, digit: number): void {
    const sprite = cell.children[0] as Sprite;
    const next = this.perDigitFiller ? this.fillerTextures[digit] : this.fillerTextures[0];
    if (sprite.texture !== next) sprite.texture = next;
  }

  createSeparator(char: string): Container {
    const tex = this.separatorTextures[char];
    const container = new Container();
    if (!tex) return container;
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5, 0.5);
    sprite.x = tex.width / 2;
    sprite.y = this.digitHeight / 2;
    container.addChild(sprite);
    return container;
  }

  destroyCell(cell: Container): void {
    cell.destroy({ children: true });
  }
}
