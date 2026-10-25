import { describe, it, expect, afterEach } from 'vitest';
import { mountDomHud, type DomHud } from '../src/mountDomHud';
import { limitText } from '../src/bindings';

/**
 * WHAT A CERTIFICATION LAB TESTS ON THE BAR.
 *
 * Four switches a market can ask for, each off by default so the reference behaves
 * as it always did: a number of rounds that starts the run, the autoplay button as
 * the run's only stop, speed rows that open without switching anything, and a tap
 * on the game that closes the open popover. Plus one fix that is not a switch: a
 * limit field takes a number and nothing else.
 */
let hud: DomHud | undefined;
const AUTOPLAY = { options: [10, 25, 50], lossLimits: [5, 20], winLimits: [10, 20] };
const mount = (spec: NonNullable<Parameters<typeof mountDomHud>[0]> = {}): DomHud => {
  document.body.innerHTML = '';
  hud = mountDomHud({ ...spec, autoplay: { ...AUTOPLAY, ...spec.autoplay } });
  return hud;
};
const id = <T extends HTMLElement = HTMLElement>(x: string): T => document.getElementById(x) as T;
const visible = (x: string): boolean => id(x).classList.contains('is-visible');
const chips = (): HTMLElement[] => [...id('AutoplayNavList').querySelectorAll<HTMLElement>('li')];
const tapOutside = (target: Element = document.body): void => {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
};

afterEach(() => {
  hud?.dispose();
  hud = undefined;
  document.body.innerHTML = '';
});

describe('autoplay.startOnSelect', () => {
  it('off (the reference): a number of rounds is only selected; START begins the run', () => {
    const h = mount();
    id('AutoplayBtn').click();
    chips()[1]!.click();
    expect(h.ui.autoplay.isActive).toBe(false);
    expect(h.ui.autoplayPanel.isOpen).toBe(true);
    id('StartAutoplayBtn').click();
    expect(h.ui.autoplay.count.get()).toBe(25);
  });

  it('on: tapping a number of rounds starts the run, with the limits set above it', () => {
    const h = mount({ autoplay: { startOnSelect: true } });
    id('AutoplayBtn').click();
    // the ADVANCED limits are chosen first…
    id('AutoplayAdvancedToggle').click();
    const loss = id('LossLimitNavList').querySelectorAll<HTMLElement>('li[data-openui-generated]')[1]!; // 20×
    loss.click();
    // …then the number of rounds starts the run
    chips()[2]!.click();
    expect(h.ui.autoplay.isActive).toBe(true);
    expect(h.ui.autoplay.count.get()).toBe(50);
    expect(h.ui.autoplay.lossLimit).toBe(20);
    expect(h.ui.autoplayPanel.isOpen).toBe(false);
  });

  it('a market that requires both limits gets no run until they are set', () => {
    const h = mount({ autoplay: { startOnSelect: true, requireLimits: true } });
    id('AutoplayBtn').click();
    chips()[0]!.click();
    expect(h.ui.autoplay.isActive).toBe(false);
    expect(h.ui.autoplayPanel.isOpen).toBe(true);
    id('LossLimitNavList').querySelector<HTMLElement>('li[data-openui-generated]')!.click();
    id('WinLimitNavList').querySelector<HTMLElement>('li[data-openui-generated]')!.click();
    chips()[0]!.click();
    expect(h.ui.autoplay.isActive).toBe(true);
  });
});

describe('the CUSTOM limit fields take a number and nothing else', () => {
  const type = (input: HTMLInputElement, data: string): boolean => {
    const e = new InputEvent('beforeinput', { data, inputType: 'insertText', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    if (!e.defaultPrevented) {
      input.value += data;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return !e.defaultPrevented;
  };

  it('refuses letters, signs and spaces as they are typed', () => {
    const h = mount();
    const input = id<HTMLInputElement>('LossLimitCustomInput');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    for (const ch of ['a', 'Z', '-', '+', ' ', '$', 'e']) expect(type(input, ch), ch).toBe(false);
    expect(type(input, '1')).toBe(true);
    expect(type(input, '5')).toBe(true);
    expect(input.value).toBe('15');
    expect(h.ui.autoplay.lossLimitOptions).toBeDefined();
  });

  it('keeps only the digits and one decimal point of a paste, and that is the limit', () => {
    mount();
    const input = id<HTMLInputElement>('WinLimitCustomInput');
    input.value = 'x12,5.7abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('12.57');
  });

  it('reads the cleaned value as the limit the run enforces; an empty field is no limit', () => {
    const h = mount({ autoplay: { startOnSelect: true } });
    id('AutoplayBtn').click();
    const input = id<HTMLInputElement>('LossLimitCustomInput');
    input.value = '7.5x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    chips()[0]!.click();
    expect(h.ui.autoplay.lossLimit).toBe(7.5);
    h.ui.autoplay.stop();
    id('AutoplayBtn').click();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    chips()[0]!.click();
    expect(h.ui.autoplay.lossLimit).toBe(Infinity);
  });

  it('cleans as specified', () => {
    expect(limitText('1a2b3')).toBe('123');
    expect(limitText('0,5')).toBe('0.5');
    expect(limitText('1.2.3')).toBe('1.23');
    expect(limitText('1.239')).toBe('1.23');
    expect(limitText('-4e2')).toBe('42');
    expect(limitText('')).toBe('');
  });
});

describe("autoplay.stopControl: 'autoplay-button'", () => {
  it('off (the reference): the round button turns into STOP with the count', () => {
    const h = mount();
    h.ui.autoplay.begin(10);
    expect(visible('StopAutoplayBtn')).toBe(true);
    expect(id('AutoplayBtn').classList.contains('is-counting')).toBe(false);
    id('StopAutoplayBtn').click();
    expect(h.ui.autoplay.isActive).toBe(false);
  });

  it('the autoplay button wears the count and stops the run', () => {
    const h = mount({ autoplay: { stopControl: 'autoplay-button' } });
    h.ui.autoplay.begin(25);
    expect(visible('StopAutoplayBtn')).toBe(false);
    expect(id('AutoplayBtn').classList.contains('is-counting')).toBe(true);
    expect(id('AutoplayBtnCounter').textContent).toBe('25');
    h.ui.autoplay.reportResult(0, 1);
    expect(id('AutoplayBtnCounter').textContent).toBe('24');
    id('AutoplayBtn').click();
    expect(h.ui.autoplay.isActive).toBe(false);
    expect(id('AutoplayBtn').classList.contains('is-counting')).toBe(false);
    expect(id('AutoplayBtnCounter').textContent).toBe('');
  });

  it('the round button keeps its faces through the run and only fast-forwards the round', () => {
    const h = mount({ autoplay: { stopControl: 'autoplay-button' } });
    const spins: number[] = [];
    const skips: number[] = [];
    h.on('spinRequested', () => spins.push(1));
    h.on('skipRequested', () => skips.push(1));
    h.ui.autoplay.begin(10);
    // between two rounds: the play face, with nothing to press it for
    expect(visible('PlaceBetBtn')).toBe(true);
    expect(id<HTMLButtonElement>('PlaceBetBtn').disabled).toBe(true);
    // a round in play that can be slammed: STOP-round, and its press is a fast-forward
    h.ui.spin.busy();
    h.ui.spin.stopState();
    expect(visible('StopBtn')).toBe(true);
    id('StopBtn').click();
    expect(skips).toHaveLength(1);
    expect(spins).toHaveLength(0);
    expect(h.ui.autoplay.isActive).toBe(true);
  });

  it('the spacebar is the same press: a fast-forward that never ends the run', () => {
    const h = mount({ autoplay: { stopControl: 'autoplay-button' } });
    const spins: number[] = [];
    const skips: number[] = [];
    h.on('spinRequested', () => spins.push(1));
    h.on('skipRequested', () => skips.push(1));
    h.ui.autoplay.begin(10);
    h.ui.spin.busy();
    h.ui.spin.stopState();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(skips).toHaveLength(1);
    expect(spins).toHaveLength(0);
    expect(h.ui.autoplay.isActive).toBe(true);
    // out of a run the spacebar spins as before
    h.ui.autoplay.stop();
    h.ui.spin.idle();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(spins).toHaveLength(1);
  });

  it('a market without slam-stop gets no fast-forward either', () => {
    const h = mount({ autoplay: { stopControl: 'autoplay-button' } });
    const skips: number[] = [];
    h.on('skipRequested', () => skips.push(1));
    h.ui.spin.allowSlamStop.set(false);
    h.ui.autoplay.begin(10);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(skips).toHaveLength(0);
    expect(h.ui.autoplay.isActive).toBe(true);
  });

  it('ships the rules that draw the count on the autoplay button', () => {
    mount();
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    expect(css).toContain('#AutoplayBtn.is-counting .AutoplayBtnCounter');
  });
});

describe("hud.speedRow: 'expand'", () => {
  it('off (the reference): tapping TURBO turns it on and opens its switches', () => {
    const h = mount();
    id('MainMenuToggle').click();
    id('TurboToggle').click();
    expect(h.ui.turboBase.isOn).toBe(true);
  });

  it('on: tapping the row only opens it; a switch inside turns the speed on', () => {
    const h = mount({ hud: { speedRow: 'expand', features: { superTurbo: true } } });
    id('MainMenuToggle').click();
    const turbo = id('TurboToggle');
    const accordion = turbo.closest('.Accordion')!;
    turbo.click();
    expect(accordion.classList.contains('is-open')).toBe(true);
    expect(h.ui.turboBase.isOn).toBe(false);
    expect(h.ui.turboBonus.isOn).toBe(false);
    expect(h.ui.turbo.isOn).toBe(false);
    // looking at SUPER TURBO switches nothing either
    id('SuperTurboToggle').click();
    expect(h.ui.superTurboBase.isOn).toBe(false);
    // the BASE switch is what changes the speed
    id<HTMLInputElement>('TurboBaseGameToggler').click();
    expect(h.ui.turboBase.isOn).toBe(true);
    expect(h.ui.turbo.isOn).toBe(true);
    // and a second tap on the title folds the row without switching it off
    turbo.click();
    expect(accordion.classList.contains('is-open')).toBe(false);
    expect(h.ui.turboBase.isOn).toBe(true);
  });

  it('a speed with no scopes is one plain switch either way', () => {
    const h = mount({ hud: { speedRow: 'expand', speeds: [{ id: 'quick', scopes: [] }] } });
    id('MainMenuToggle').click();
    id('QuickToggle').click();
    expect(h.ui.speeds[0]!.isOn).toBe(true);
  });
});

describe('hud.closeOnOutsideTap', () => {
  it('off (the reference): a tap on the game leaves the menu open', () => {
    const h = mount();
    id('MainMenuToggle').click();
    tapOutside();
    expect(h.ui.mainMenuPanel.isOpen).toBe(true);
  });

  it('on: a tap on the game closes the menu and the autoplay panel', () => {
    const h = mount({ hud: { closeOnOutsideTap: true } });
    const game = document.createElement('canvas');
    document.body.appendChild(game);
    id('MainMenuToggle').click();
    tapOutside(game);
    expect(h.ui.mainMenuPanel.isOpen).toBe(false);
    id('AutoplayBtn').click();
    expect(h.ui.autoplayPanel.isOpen).toBe(true);
    tapOutside(game);
    expect(h.ui.autoplayPanel.isOpen).toBe(false);
    expect(h.ui.autoplay.current).toBe('idle');
    expect(visible('PlaceBetBtn')).toBe(true);
  });

  it('a tap inside the open panel, or on the controls that work it, keeps it open', () => {
    const h = mount({ hud: { closeOnOutsideTap: true } });
    id('MainMenuToggle').click();
    tapOutside(document.querySelector('#MainMenu li')!);
    expect(h.ui.mainMenuPanel.isOpen).toBe(true);
    h.ui.mainMenuPanel.closePanel();
    id('AutoplayBtn').click();
    tapOutside(chips()[0]!);
    tapOutside(id('BetAmountIncrease'));
    tapOutside(id('StartAutoplayBtn'));
    expect(h.ui.autoplayPanel.isOpen).toBe(true);
  });

  it('waits behind a notice in front', () => {
    const h = mount({ hud: { closeOnOutsideTap: true } });
    id('MainMenuToggle').click();
    h.ui.showNotice([{ kind: 'text', id: 't', text: 'hello' }], [], { blocking: true });
    tapOutside();
    expect(h.ui.mainMenuPanel.isOpen).toBe(true);
  });
});
