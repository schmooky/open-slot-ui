import type { OpenUI } from './OpenUI';
import type { Dispose } from './signal';

/**
 * SETTINGS THAT SURVIVE A RELOAD.
 *
 * A player who muted the game and switched turbo on expects to find it that way
 * next time; several markets require it. The library did not help: a host had to
 * know which controls are settings, read each one, write its own JSON, and put it
 * all back in the right order at boot — so most hosts saved some of it and lost the
 * rest. (Master mute was the usual casualty, because it is a control, not a level.)
 *
 * This is opt-in, because storage is the host's business: pass a key and the HUD
 * remembers what a player chose, pass nothing and it remembers nothing.
 *
 * Three rules it follows:
 *
 *  - **Never throws.** Storage can be full, blocked, or absent (a private window, a
 *    sandboxed iframe, a server render). Every read and write is guarded; a failure
 *    costs the memory, never the game.
 *  - **Reads what is there, ignores what is not.** A stored blob from an older
 *    version — a speed the game no longer has, a key it never heard of — is dropped
 *    silently. Settings are a convenience; they do not get to break a boot.
 *  - **Only what a player chose.** Volumes, mute, each speed's scopes, spacebar.
 *    Not the stake, not autoplay's limits: those are per-session decisions a game
 *    must ask for again.
 */

/** What gets written, as a plain object so a host can inspect or ship it elsewhere. */
export interface Settings {
  /** 0..1 — the sound and music sliders. */
  sfx?: number;
  music?: number;
  /** The master mute. */
  muted?: boolean;
  /** Per speed id: whether its base / bonus scopes are on. */
  speeds?: Record<string, { base?: boolean; bonus?: boolean }>;
  /** SPACEBAR TO SPIN. */
  spacebar?: boolean;
}

/** Where settings live. Anything with these three methods will do. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** What the host asks for: a key, and optionally somewhere other than localStorage. */
export interface PersistOptions {
  key: string;
  storage?: SettingsStorage;
}

/** The browser's own store, when there is one and it answers. */
function defaultStorage(): SettingsStorage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    // Safari in private mode has the object and throws on write; find out now, with
    // a key that is ours and is removed immediately.
    const probe = '__open-slot-ui__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Read what a player chose last time. Returns `{}` for anything unreadable. */
export function readSettings(opts: PersistOptions): Settings {
  const store = opts.storage ?? defaultStorage();
  if (!store) return {};
  try {
    const raw = store.getItem(opts.key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Settings;
  } catch {
    return {};
  }
}

/** What the HUD is set to right now. */
export function captureSettings(ui: OpenUI): Settings {
  return {
    sfx: ui.sfxSlider.value.get(),
    music: ui.musicSlider.value.get(),
    muted: ui.muted.get(),
    speeds: Object.fromEntries(ui.speeds.map((s) => [s.id, { base: s.base.isOn, bonus: s.bonus.isOn }])),
    spacebar: ui.spacebar.isOn,
  };
}

/** Put a stored set back on the HUD. Unknown speeds and bad values are ignored. */
export function applySettings(ui: OpenUI, settings: Settings): void {
  const level = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
  const sfx = level(settings.sfx);
  if (sfx !== null) ui.sfxSlider.setNormalized(sfx);
  const music = level(settings.music);
  if (music !== null) ui.musicSlider.setNormalized(music);
  if (typeof settings.muted === 'boolean' && ui.muted.get() !== settings.muted) ui.setMuted(settings.muted);
  for (const speed of ui.speeds) {
    const stored = settings.speeds?.[speed.id];
    if (!stored) continue;
    if (typeof stored.base === 'boolean') speed.base.set(stored.base);
    if (typeof stored.bonus === 'boolean') speed.bonus.set(stored.bonus);
  }
  if (typeof settings.spacebar === 'boolean') ui.spacebar.set(settings.spacebar);
}

/**
 * Restore what was stored, then keep it up to date.
 *
 * Returns the usual disposer. Writes are coalesced to the end of the task, because
 * a player dragging a volume slider should cost one write, not fifty.
 */
export function persistSettings(ui: OpenUI, opts: PersistOptions): Dispose {
  const store = opts.storage ?? defaultStorage();
  if (!store) return () => undefined;

  applySettings(ui, readSettings({ ...opts, storage: store }));

  let queued = false;
  const save = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      try {
        store.setItem(opts.key, JSON.stringify(captureSettings(ui)));
      } catch {
        /* a full or blocked store costs the memory, never the game */
      }
    });
  };

  const stops: Dispose[] = [
    ui.sfxSlider.value.subscribe(save),
    ui.musicSlider.value.subscribe(save),
    ui.muted.subscribe(save),
    ui.spacebar.state.subscribe(save),
    ...ui.speeds.flatMap((s) => [s.base.state.subscribe(save), s.bonus.state.subscribe(save)]),
  ];
  return () => stops.forEach((stop) => stop());
}
