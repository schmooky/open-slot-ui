import { Container, Graphics, type Ticker } from 'pixi.js';
import { type OpenUI } from '@open-slot-ui/core';
import { Sheet, MenuRow, ToggleSwitch, SheetLegend } from './sheet';

/**
 * The ☰ sheet: the reference's main menu, flown up out of the bar.
 *
 * Sound / music are one-tap rows; TURBO and SUPER TURBO™ are accordions holding a
 * BASE GAME and a BONUS GAME switch (so a player can keep the bonus at full speed);
 * history / info open their windows; the operator rows (home, deposit, real money)
 * just emit — the host owns where they go. Every row is a chrome feature flag, so a
 * game without turbo simply doesn't have the row.
 */
export class MainMenuSheet extends Sheet {
  private readonly rows: Array<{ node: Container; height: () => number; children?: Container[] }> = [];
  private expanded: 'turbo' | 'super-turbo' | null = null;
  /** Remembered volumes, so toggling sound off and on restores what it was. */
  private lastSfx = 0.5;
  private lastMusic = 0.7;

  constructor(ui: OpenUI, ticker: Ticker) {
    super(ui, ui.mainMenuPanel, ticker);
    this.build();
    this.disposers.push(
      ui.sfxSlider.value.subscribe(() => this.refresh()),
      ui.musicSlider.value.subscribe(() => this.refresh()),
      ui.turboBase.state.subscribe(() => this.refresh()),
      ui.turboBonus.state.subscribe(() => this.refresh()),
      ui.superTurboBase.state.subscribe(() => this.refresh()),
      ui.superTurboBonus.state.subscribe(() => this.refresh()),
    );
  }

  private build(): void {
    const ui = this.ui;
    const f = ui.chrome.features;
    const add = (node: Container, height: () => number): void => {
      this.body.addChild(node);
      this.rows.push({ node, height });
    };

    if (f.sound) {
      const row = new MenuRow(ui, 'sound-on', 'openui.sound', () => {
        const on = ui.sfxSlider.value.get() > 0;
        if (on) this.lastSfx = ui.sfxSlider.value.get();
        ui.sfxSlider.setNormalized(on ? 0 : this.lastSfx || 0.5);
      });
      add(row, () => row.rowHeight);
      this.soundRow = row;
    }
    if (f.music) {
      const row = new MenuRow(ui, 'music-on', 'openui.music', () => {
        const on = ui.musicSlider.value.get() > 0;
        if (on) this.lastMusic = ui.musicSlider.value.get();
        ui.musicSlider.setNormalized(on ? 0 : this.lastMusic || 0.7);
      });
      add(row, () => row.rowHeight);
      this.musicRow = row;
    }
    if (f.superTurbo) this.addAccordion('super-turbo', 'openui.superTurbo', ui.superTurboBase, ui.superTurboBonus, add);
    if (f.turbo) this.addAccordion('turbo', 'openui.turbo', ui.turboBase, ui.turboBonus, add);
    if (f.history) {
      const row = new MenuRow(ui, 'history', 'openui.history', () => {
        ui.mainMenuPanel.closePanel();
        ui.historyPanel.openPanel();
      });
      add(row, () => row.rowHeight);
    }
    if (f.info) {
      const row = new MenuRow(ui, 'info', 'openui.info', () => {
        ui.mainMenuPanel.closePanel();
        ui.settingsPanel.openPanel();
      });
      add(row, () => row.rowHeight);
    }
    if (f.realMoney) this.addEmitRow('real-money', 'chip', 'openui.realMoney', add);
    if (f.deposit) this.addEmitRow('deposit', 'coins', 'openui.deposit', add);
    if (f.lobby) this.addEmitRow('lobby', 'home', 'openui.home', add);
  }

  private soundRow?: MenuRow;
  private musicRow?: MenuRow;
  private readonly accordions: Array<{
    id: 'turbo' | 'super-turbo';
    header: MenuRow;
    subs: Array<{ legend: SheetLegend; toggle: ToggleSwitch }>;
    group: Container;
  }> = [];

  private addEmitRow(id: string, icon: 'chip' | 'coins' | 'home', key: string, add: (n: Container, h: () => number) => void): void {
    const row = new MenuRow(this.ui, icon, key, () => {
      this.ui.mainMenuPanel.closePanel();
      this.ui.bus.emit('buttonActivated', { id });
    });
    add(row, () => row.rowHeight);
  }

  private addAccordion(
    id: 'turbo' | 'super-turbo',
    key: string,
    base: OpenUI['turboBase'],
    bonus: OpenUI['turboBonus'],
    add: (n: Container, h: () => number) => void,
  ): void {
    const group = new Container();
    const header = new MenuRow(this.ui, id === 'turbo' ? 'turbo' : 'super-turbo', key, () => {
      this.expanded = this.expanded === id ? null : id;
      this.refresh();
    });
    group.addChild(header);
    const subs = [
      { legend: new SheetLegend(this.ui, 'openui.baseGame'), toggle: new ToggleSwitch(this.ui, base) },
      { legend: new SheetLegend(this.ui, 'openui.bonusGame'), toggle: new ToggleSwitch(this.ui, bonus) },
    ];
    for (const s of subs) group.addChild(s.legend, s.toggle);
    this.accordions.push({ id, header, subs, group });
    add(group, () => header.rowHeight * (this.expanded === id ? 3 : 1));
  }

  protected buildRows(): number {
    const rem = this.rem;
    const pad = rem * 0.7;
    const w = this.width_ - pad * 2;
    let y = pad;

    if (this.soundRow) this.soundRow.set(this.ui.sfxSlider.value.get() > 0 ? 'sound-on' : 'sound-off');
    if (this.musicRow) this.musicRow.set(this.ui.musicSlider.value.get() > 0 ? 'music-on' : 'music-off');

    for (const { node } of this.rows) {
      node.position.set(pad, y);
      if (node instanceof MenuRow) {
        node.resize(w, rem);
        y += node.rowHeight;
        continue;
      }
      // an accordion group
      const acc = this.accordions.find((a) => a.group === node);
      if (!acc) continue;
      acc.header.resize(w, rem);
      const open = this.expanded === acc.id;
      const on = acc.id === 'turbo' ? this.ui.turboBase.isOn || this.ui.turboBonus.isOn : this.ui.superTurboBase.isOn || this.ui.superTurboBonus.isOn;
      acc.header.setAccent(on);
      let sy = acc.header.rowHeight;
      for (const s of acc.subs) {
        s.legend.visible = open;
        s.toggle.visible = open;
        if (!open) continue;
        s.legend.resize(rem);
        s.toggle.size(rem * 0.9);
        s.legend.position.set(rem * 1.15, sy + rem * 0.5);
        s.toggle.position.set(w - rem * 2.1, sy + rem * 0.35);
        sy += acc.header.rowHeight;
      }
      y += open ? sy : acc.header.rowHeight;
    }
    return y + pad;
  }

  /** A hairline under each row keeps the list readable on a busy reel background. */
  protected override paint(): void {
    super.paint();
    if (!this.separators.parent) this.body.addChildAt(this.separators, 0);
    const t = this.ui.theme;
    const pad = this.rem * 0.7;
    this.separators.clear();
    let y = pad;
    for (const r of this.rows) {
      y += r.height();
      if (r !== this.rows[this.rows.length - 1]) {
        this.separators.moveTo(pad, Math.round(y)).lineTo(this.width_ - pad, Math.round(y));
      }
    }
    this.separators.stroke({ width: 1, color: t.color.text, alpha: 0.12 });
  }

  private readonly separators = new Graphics();
}
