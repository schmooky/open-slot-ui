// The BUY-FEATURE modal — the open-slot-ui host component opened by the bonus button.
// The bonus (☰ coin) button opens a card LIST of the game's buyable/activatable features;
// each card has its own Buy/Activate action, and buying (or activating a boost) is gated by
// the shared Pixi confirm notice. Rendered ENTIRELY in Pixi (in-canvas Container on the HUD
// root) — no DOM overlay — so the whole HUD stays on the canvas. One biased white design
// (independent of the game theme), matching the notice/menu; fully localized + social-aware.
//
// Each feature is a card: `buy` = one-tap purchase (start that mode once), `boost` = an
// activatable per-spin bet surcharge that toggles on/off. Actions emit `cardActivated` on the
// bus AND call the `onBuy`/`onActivate` host hooks. Returns a leak-free teardown.

import { Container, Graphics, Sprite, Text, Texture, Rectangle, Assets, type FederatedPointerEvent } from 'pixi.js';
import type { Application } from 'pixi.js';
import type { BootedHud } from './mountHud';
import { formatAmountPrecise, type CurrencySpec, type OpenUI, type ScreenState } from '@open-slot-ui/core';

/** A buy-feature card. */
export interface FeatureSpec {
  id: string;
  name: string;
  variant: 'buy' | 'boost';
  /** Cost as a multiple of the base bet. For `buy` this is the FULL stake multiple
   *  (deducted = cost × bet); for `boost` it is the SURCHARGE over the base bet, so the
   *  full per-spin cost shown/deducted is (1 + cost) × bet. */
  cost: number;
  /** Card image URL (or data URI). Optional — a neutral gradient is used when absent. */
  image?: string;
}

/** Configurable behavior of the activatable bet-boost cards. */
export interface BuyFeatureOptions {
  /** `'single'` → only one boost active at a time · `'multi'` → combine them. Default `'multi'`. */
  activation?: 'single' | 'multi';
  /** When any boost is active, disable the Buy buttons. Default `false`. */
  activationBlocksBuy?: boolean;
  /** Host hook for a confirmed Buy (the modal has just closed): deduct + start the feature. */
  onBuy?: (id: string, cost: number) => void;
  /** Host hook whenever the active-boost set changes (the modal stays open). */
  onActivate?: (activeIds: string[], id: string, active: boolean) => void;
  /** BASE bet source for pricing. Default reads ui.bet — pass this when ui.bet
   *  displays a modified EFFECTIVE stake (boost active) instead of the base bet. */
  getBet?: () => number;
}

/** The Figma "default" white card look (independent of the dark game theme) — matches
 *  the notice/menu sheets: dark text on white, black border, gold accent. */
const LIGHT = {
  surface: '#ffffff',
  surfaceAlt: '#eef1f6',
  text: '#181b20',
  textDim: '#5b6472',
  border: '#000000',
  accent: '#d99000',
  accentText: '#1a1200',
  scrim: '#080604',
} as const;

// Base (design) geometry — the whole sheet is uniformly scaled to fit any viewport.
const CARD_W = 200;
const IMG_H = 120;
const STRIP_H = 8;
const CARD_H = 214; // frame: image + strip + name/price body
const ACT_GAP = 12;
const ACT_H = 50;
const CELL_H = CARD_H + ACT_GAP + ACT_H;
const GAP = 18;
const STEP_R = 27;
const BET_W = 220;
const BET_H = 60;
const TITLE_H = 40;
const ROW_GAP = 22;
const TAP_SLOP = 24; // a press that lifts within this many screen px still counts as a tap

/** Texture cache so a card image loads once, not on every re-render. */
const texCache = new Map<string, Promise<Texture>>();
function loadTex(url: string): Promise<Texture> {
  let p = texCache.get(url);
  if (!p) { p = Assets.load<Texture>(url).catch(() => Texture.EMPTY); texCache.set(url, p); }
  return p;
}

/** Make a Container tap-interactive with tap-slop (a lift within TAP_SLOP of the press still
 *  fires) + a subtle alpha press. Robust on touch; the mountHud pointercancel→pointerup fix
 *  covers emulated-touch cancels. */
function wireTap(node: Container, hit: Rectangle, onTap: () => void): void {
  node.eventMode = 'static';
  node.cursor = 'pointer';
  node.hitArea = hit;
  let down: { x: number; y: number } | null = null;
  node.on('pointerdown', (e: FederatedPointerEvent) => { down = { x: e.global.x, y: e.global.y }; node.alpha = 0.82; });
  const end = (e: FederatedPointerEvent, inside: boolean): void => {
    node.alpha = 1;
    const p = down; down = null;
    if (!p) return;
    if (inside || Math.hypot(e.global.x - p.x, e.global.y - p.y) <= TAP_SLOP) onTap();
  };
  node.on('pointerup', (e) => end(e, true));
  node.on('pointerupoutside', (e) => end(e, false));
}

/** One feature card (image + gold strip + name + price + action button). Built once; only
 *  the price + action state update on bet/boost change. */
class FeatureCard extends Container {
  private readonly priceText: Text;
  private readonly actionBg = new Graphics();
  private readonly actionLabel: Text;
  private readonly action = new Container();

  constructor(spec: FeatureSpec, ui: OpenUI, onAction: () => void) {
    super();
    const fam = ui.theme.type.family;

    // Rounded white frame (fill under, black stroke over the clipped content).
    const fill = new Graphics().roundRect(0, 0, CARD_W, CARD_H, 14).fill({ color: LIGHT.surface });
    const clip = new Container();
    const clipMask = new Graphics().roundRect(0, 0, CARD_W, CARD_H, 14).fill({ color: 0xffffff });
    clip.mask = clipMask;

    // Image (or neutral gradient placeholder) in the top band.
    const placeholder = new Graphics().rect(0, 0, CARD_W, IMG_H).fill({ color: LIGHT.surfaceAlt });
    clip.addChild(placeholder);
    if (spec.image) {
      void loadTex(spec.image).then((tex) => {
        if (this.destroyed || tex === Texture.EMPTY) return;
        const sp = new Sprite(tex);
        const s = Math.max(CARD_W / tex.width, IMG_H / tex.height); // cover
        sp.scale.set(s);
        sp.x = (CARD_W - tex.width * s) / 2;
        sp.y = (IMG_H - tex.height * s) / 2;
        clip.addChildAt(sp, 1);
      });
    }
    const strip = new Graphics().rect(0, IMG_H, CARD_W, STRIP_H).fill({ color: LIGHT.accent });
    const name = new Text({ text: ui.t(spec.name), style: { fontFamily: fam, fontSize: 16, fontWeight: '600', fill: LIGHT.text } });
    name.anchor.set(0.5, 0);
    name.position.set(CARD_W / 2, IMG_H + STRIP_H + 12);
    this.priceText = new Text({ text: '', style: { fontFamily: fam, fontSize: 22, fontWeight: '800', fill: LIGHT.text } });
    this.priceText.anchor.set(0.5, 0);
    this.priceText.position.set(CARD_W / 2, IMG_H + STRIP_H + 36);
    clip.addChild(strip, name, this.priceText);

    const stroke = new Graphics().roundRect(0, 0, CARD_W, CARD_H, 14).stroke({ width: 4, color: LIGHT.border });
    this.addChild(fill, clip, clipMask, stroke);

    // Action button (Buy / Activate / Activated), pinned below the card.
    this.actionLabel = new Text({ text: '', style: { fontFamily: fam, fontSize: 15, fontWeight: '800', fill: LIGHT.text, letterSpacing: 0.5 } });
    this.actionLabel.anchor.set(0.5);
    this.actionLabel.position.set(CARD_W / 2, CARD_H + ACT_GAP + ACT_H / 2);
    this.action.addChild(this.actionBg, this.actionLabel);
    wireTap(this.action, new Rectangle(0, CARD_H + ACT_GAP, CARD_W, ACT_H), onAction);
    this.addChild(this.action);
  }

  /** Update price + action label/state for the current bet + boost state. */
  update(price: string, label: string, active: boolean, blocked: boolean): void {
    this.priceText.text = price;
    this.actionLabel.text = label;
    this.actionLabel.style.fill = active ? LIGHT.accentText : LIGHT.text;
    this.actionBg.clear().roundRect(0, CARD_H + ACT_GAP, CARD_W, ACT_H, 12)
      .fill({ color: active ? LIGHT.accent : LIGHT.surface }).stroke({ width: 4, color: LIGHT.border });
    this.action.eventMode = blocked ? 'none' : 'static';
    this.action.alpha = blocked ? 0.38 : 1;
  }
}

class BuyFeatureModalView extends Container {
  private readonly backdrop = new Graphics();
  private readonly content = new Container();
  private readonly closeBtn = new Container();
  private readonly title: Text;
  private readonly betValue: Text;
  private readonly cardsRow = new Container();
  private readonly cards: FeatureCard[] = [];
  private readonly list: FeatureSpec[];
  private readonly boosts = new Set<string>();
  private readonly disposers: Array<() => void> = [];
  private screen: ScreenState | undefined;

  constructor(private readonly hud: BootedHud, features: FeatureSpec[], private readonly opts: BuyFeatureOptions) {
    super();
    const ui = hud.ui;
    const fam = ui.theme.type.family;
    this.list = features.slice(0, 4);
    this.zIndex = 125; // above the menu (120), below the confirm notice (DialogView, 130)
    this.visible = false;
    this.eventMode = 'none';

    // Declare the configured features as GAME FACTS (rules-completeness audit reads these).
    ui.declareFacts({ modes: this.list.map((f) => ({ id: f.id, name: f.name, kind: f.variant, cost: f.cost })) });

    // Backdrop — dim scrim; a tap on it closes the modal.
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.close());

    // Title.
    this.title = new Text({ text: ui.t('Buy Feature'), style: { fontFamily: fam, fontSize: 30, fontWeight: '800', fill: '#ffffff', letterSpacing: 1 } });
    this.title.anchor.set(0.5, 0);

    // Bet stepper row: − [ BET / value ] +
    const minus = this.stepButton('−', () => ui.betStepper.dec());
    const plus = this.stepButton('+', () => ui.betStepper.inc());
    const betBox = new Container();
    const betBg = new Graphics().roundRect(-BET_W / 2, -BET_H / 2, BET_W, BET_H, 12).fill({ color: LIGHT.surface }).stroke({ width: 3, color: LIGHT.border });
    const betLabel = new Text({ text: ui.t('Bet'), style: { fontFamily: fam, fontSize: 12, fontWeight: '700', fill: LIGHT.textDim, letterSpacing: 1 } });
    betLabel.anchor.set(0.5, 0); betLabel.position.set(0, -BET_H / 2 + 8);
    this.betValue = new Text({ text: '', style: { fontFamily: fam, fontSize: 24, fontWeight: '800', fill: LIGHT.text } });
    this.betValue.anchor.set(0.5, 1); this.betValue.position.set(0, BET_H / 2 - 8);
    betBox.addChild(betBg, betLabel, this.betValue);
    const betRow = new Container();
    minus.position.set(STEP_R, 0); // center at STEP_R → left edge at x=0
    betBox.position.set(STEP_R * 2 + 16 + BET_W / 2, 0);
    plus.position.set(STEP_R * 2 + 16 + BET_W + 16 + STEP_R, 0);
    betRow.addChild(minus, betBox, plus);
    this.betRow = betRow;

    // Feature cards.
    for (const spec of this.list) {
      const card = new FeatureCard(spec, ui, () => this.onAction(spec.id, spec.variant));
      this.cards.push(card);
      this.cardsRow.addChild(card);
    }

    this.content.addChild(this.title, betRow, this.cardsRow);

    // Close ✕ — dark circle top-right of the viewport (not scaled with content).
    const cbg = new Graphics().circle(0, 0, 23).fill({ color: LIGHT.scrim, alpha: 0.85 });
    const cx = new Graphics().moveTo(-7, -7).lineTo(7, 7).moveTo(7, -7).lineTo(-7, 7).stroke({ width: 3, color: '#ffffff', cap: 'round' });
    this.closeBtn.addChild(cbg, cx);
    wireTap(this.closeBtn, new Rectangle(-23, -23, 46, 46), () => this.close());

    this.addChild(this.backdrop, this.content, this.closeBtn);

    this.disposers.push(
      ui.bet.value.subscribe(() => this.refresh()),
      ui.locale.subscribe(() => {
        this.title.text = ui.t('Buy Feature');
        betLabel.text = ui.t('Bet');
        this.refresh();
        this.relayout();
      }),
    );
  }

  private betRow!: Container;

  private stepButton(glyph: string, onTap: () => void): Container {
    const c = new Container();
    const fam = this.hud.ui.theme.type.family;
    const bg = new Graphics().circle(0, 0, STEP_R).fill({ color: LIGHT.surface }).stroke({ width: 3, color: LIGHT.border });
    const t = new Text({ text: glyph, style: { fontFamily: fam, fontSize: 28, fontWeight: '800', fill: LIGHT.text } });
    t.anchor.set(0.5); t.position.set(0, -1);
    c.addChild(bg, t);
    wireTap(c, new Rectangle(-STEP_R, -STEP_R, STEP_R * 2, STEP_R * 2), onTap);
    return c;
  }

  /** Price + action state per current bet + boosts. */
  private refresh(): void {
    const ui = this.hud.ui;
    const bet = this.opts.getBet ? this.opts.getBet() : ui.bet.get();
    const cur = ui.bet.currency.get();
    const money = (n: number): string => formatAmountPrecise(n, cur);
    this.betValue.text = money(bet);
    const blocksBuy = this.opts.activationBlocksBuy ?? false;
    this.list.forEach((f, i) => {
      const active = this.boosts.has(f.id);
      const perSpin = (f.variant === 'buy' ? f.cost : 1 + f.cost) * bet;
      const label = f.variant === 'buy' ? ui.t('Buy') : active ? ui.t('Activated') : ui.t('Activate');
      const blocked = f.variant === 'buy' && blocksBuy && this.boosts.size > 0;
      this.cards[i]!.update(money(perSpin), label, active, blocked);
    });
  }

  private onAction(id: string, variant: FeatureSpec['variant']): void {
    const ui = this.hud.ui;
    const f = this.list.find((x) => x.id === id);
    const bet = this.opts.getBet ? this.opts.getBet() : ui.bet.get();
    const cur = ui.bet.currency.get();
    const money = (n: number): string => formatAmountPrecise(n, cur);
    const activation = this.opts.activation ?? 'multi';
    const blocksBuy = this.opts.activationBlocksBuy ?? false;

    if (variant === 'boost') {
      const wasActive = this.boosts.has(id);
      const commit = (): void => {
        if (activation === 'single') this.boosts.clear();
        if (wasActive) this.boosts.delete(id); else this.boosts.add(id);
        ui.bus.emit('cardActivated', { id });
        this.refresh();
        this.opts.onActivate?.([...this.boosts], id, this.boosts.has(id));
      };
      if (wasActive) { commit(); return; } // turning a boost OFF never needs confirming
      const total = 1 + (f?.cost ?? 0);
      this.askConfirm(f?.name ?? id, money(total * bet), commit);
    } else {
      if (blocksBuy && this.boosts.size > 0) return;
      const cost = (f?.cost ?? 0) * bet;
      this.askConfirm(f?.name ?? id, money(cost), () => {
        ui.bus.emit('cardActivated', { id });
        this.close();
        this.opts.onBuy?.(id, cost);
      });
    }
  }

  /** The ONE universal confirm — the in-canvas Pixi notice (DialogView, zIndex 130), so it
   *  layers over this modal. Message + labels come from the library's i18n (social-aware). */
  private askConfirm(name: string, price: string, onYes: () => void): void {
    const ui = this.hud.ui;
    const message = ui.t('openui.buyFeature.confirm', { name: ui.t(name), price });
    ui.showNotice(
      [
        { kind: 'heading', id: 'bfm-confirm-h', text: 'Buy Feature' },
        { kind: 'text', id: 'bfm-confirm-b', text: message },
      ],
      [
        { label: 'openui.cancel', variant: 'secondary' },
        { label: 'openui.confirm', variant: 'primary', onSelect: () => { ui.hideNotice(); onYes(); } },
      ],
    );
  }

  layout(screen: ScreenState): void {
    this.screen = screen;
    if (this.visible) this.relayout();
  }

  private relayout(): void {
    const s = this.screen;
    if (!s) return;
    const W = s.width;
    const H = s.height;

    this.backdrop.clear().rect(0, 0, W, H).fill({ color: LIGHT.scrim, alpha: 0.55 });
    this.backdrop.hitArea = new Rectangle(0, 0, W, H);

    // Column count — 4 across only when there's real width (else 2, which scales taller/bigger).
    const n = this.list.length;
    const cols = W >= 720 && (W >= 900 || H <= 540) ? Math.min(4, n) : Math.min(2, n);
    const rows = Math.ceil(n / cols);

    // Lay the cards into a grid.
    this.cards.forEach((card, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      card.position.set(c * (CARD_W + GAP), r * (CELL_H + GAP));
    });
    const gridW = cols * CARD_W + (cols - 1) * GAP;
    const gridH = rows * CELL_H + (rows - 1) * GAP;

    // Stack: title, bet row, cards grid — all centered on the content's x.
    const betW = 4 * STEP_R + BET_W + 32; // − [ betbox ] +  (see constructor layout)
    const contentW = Math.max(gridW, betW, 340);
    this.title.position.set(contentW / 2, 0);
    this.betRow.position.set((contentW - betW) / 2, TITLE_H + ROW_GAP + STEP_R);
    this.cardsRow.position.set((contentW - gridW) / 2, TITLE_H + ROW_GAP + BET_H + ROW_GAP);
    const contentH = TITLE_H + ROW_GAP + BET_H + ROW_GAP + gridH;

    // Uniform scale to fit, centered.
    const scale = Math.min(1, (W * 0.94) / contentW, (H * 0.92) / contentH);
    this.content.scale.set(scale);
    this.content.position.set((W - contentW * scale) / 2, (H - contentH * scale) / 2);

    this.closeBtn.position.set(W - 34, 34);
  }

  open(): void {
    if (this.visible) return;
    this.hud.ui.lock();
    this.visible = true;
    this.eventMode = 'static';
    this.refresh();
    this.relayout();
  }

  close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.eventMode = 'none';
    this.hud.ui.unlock();
  }

  get isOpen(): boolean {
    return this.visible;
  }

  dispose(): void {
    if (this.visible) this.hud.ui.unlock(); // don't leak the lock on teardown-while-open
    for (const d of this.disposers.splice(0)) d();
    if (!this.destroyed) this.destroy({ children: true });
  }
}

/** Mount the buy-feature modal (in-canvas Pixi). Returns a leak-free teardown. */
export function mountBuyFeatureModal(
  _app: Application,
  hud: BootedHud,
  features: FeatureSpec[],
  opts: BuyFeatureOptions = {},
): () => void {
  const ui = hud.ui;
  const view = new BuyFeatureModalView(hud, features, opts);
  hud.pixi.root.addChild(view);
  view.layout(ui.screen.get());
  const offScreen = ui.screen.subscribe(() => view.layout(ui.screen.get()));
  const offOpen = ui.on('buttonActivated', ({ id }) => { if (id === 'bonus') view.open(); });
  return () => {
    offScreen();
    offOpen();
    view.dispose();
  };
}
