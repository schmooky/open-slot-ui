/**
 * GAME FACTS + the rules-completeness AUDIT — the "can't forget" layer for the
 * Info/Rules menu (Charter P11: data, not prose).
 *
 * A game declares WHAT IT HAS as structured facts — its math modes (base game, buy
 * features, bet boosts) with their RTP and max win, its free-spins behavior, its
 * volatility/cap — via `UISpec.facts` and/or `ui.declareFacts` (the buy-feature modal
 * declares its configured features automatically). The rules content stays modular
 * blocks (the "block builder"), and two mechanisms tie the two together:
 *
 * 1. The `mode-stats` block AUTO-RENDERS the per-mode RTP / Max-win grid straight
 *    from the facts — declared once, so the table can never drift from the config.
 * 2. `auditRules(facts, rules)` checks the rules blocks against the facts and
 *    reports every REQUIRED declaration that is missing (a mode's RTP or max win,
 *    an undescribed buy feature) plus the HIGHLY RECOMMENDED ones (free-spins count
 *    + retrigger policy, the legal disclaimer, a controls guide). The info menu
 *    renders these findings as an explicit warning card when the rules open — a
 *    forgotten declaration is stated, never silent.
 *
 * Any block may carry `covers: ['rtp:bonus', 'freespins', …]` to mark a topic as
 * covered by hand-written prose the text heuristics can't see.
 */
import type { BlockSpec } from './types';

/** One math mode / play mode the game exposes (base · buy feature · bet boost · ante). */
export interface GameModeFact {
  /** Stable id (matches the buy-feature card / RGS mode id), e.g. `'base'`, `'bonus'`. */
  id: string;
  /** Display name, e.g. `'Golden Rush'` — run through `ui.t` (social swaps apply). */
  name: string;
  /** What kind of mode this is. `'base'` is the plain game; everything else is a
   *  configured feature that MUST be described in the rules. */
  kind?: 'base' | 'buy' | 'boost' | 'ante' | 'bonus';
  /** Cost as a multiple of the base bet (buy price / per-spin surcharge). */
  cost?: number;
  /** The mode's RTP in percent (e.g. 95.5). Required in the rules for every mode. */
  rtp?: number;
  /** The mode's maximum win as a multiple of the base bet (e.g. 5000). Required. */
  maxWinX?: number;
}

/** Free-spins behavior — HIGHLY RECOMMENDED to declare (or `false` = game has none). */
export interface FreeSpinsFact {
  /** How many free spins the bonus awards (e.g. exactly 3). */
  count?: number;
  /** Whether free spins can be retriggered during the bonus. */
  retrigger?: boolean;
  /** Free-form note (not audited). */
  note?: string;
}

/** Everything the game HAS, declared as data. Drives `mode-stats` + `auditRules`. */
export interface GameFacts {
  modes?: GameModeFact[];
  /** Free-spins facts, or `false` to state explicitly the game has none. */
  freeSpins?: FreeSpinsFact | false;
  /** Volatility label shown by `mode-stats` (e.g. `'Very high'`). */
  volatility?: string;
  /** The overall round win cap (× base bet) shown by `mode-stats` (e.g. 5000). */
  maxWinCapX?: number;
}

/** Merge two facts declarations: modes merge BY ID (defined incoming fields win);
 *  scalar facts take the incoming value when defined. Pure — never mutates inputs. */
export function mergeFacts(base: GameFacts, add: GameFacts): GameFacts {
  const modes = [...(base.modes ?? [])];
  for (const m of add.modes ?? []) {
    const i = modes.findIndex((x) => x.id === m.id);
    if (i < 0) modes.push({ ...m });
    else {
      const merged = { ...modes[i] } as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(m)) if (v !== undefined) merged[k] = v;
      modes[i] = merged as unknown as GameModeFact;
    }
  }
  return {
    ...(modes.length ? { modes } : {}),
    freeSpins: add.freeSpins !== undefined ? add.freeSpins : base.freeSpins,
    volatility: add.volatility ?? base.volatility,
    maxWinCapX: add.maxWinCapX ?? base.maxWinCapX,
  };
}

/** Format an RTP percent the Stake way: always two decimals (95.5 → "95.50%"). */
export function formatRtp(rtp: number): string {
  return `${rtp.toFixed(2)}%`;
}

/** Format a × multiple with thousands grouping (5000 → "5,000×"). */
export function formatTimes(x: number): string {
  return `${x.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
}

/**
 * The auto-generated per-mode stat rows a `mode-stats` block renders: one
 * `RTP · <mode>` + `Max win · <mode>` pair per declared mode, then Volatility and
 * the round cap when declared. `tr` localizes the label words + mode names (social
 * mode swaps "Max win" → "Max prize" via the built-in social dictionary).
 */
export function modeStatsItems(
  facts: GameFacts | undefined,
  tr: (s: string) => string = (s) => s,
): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const m of facts?.modes ?? []) {
    if (m.rtp != null) out.push({ label: `${tr('RTP')} · ${tr(m.name)}`, value: formatRtp(m.rtp) });
    if (m.maxWinX != null) out.push({ label: `${tr('Max win')} · ${tr(m.name)}`, value: formatTimes(m.maxWinX) });
  }
  if (facts?.volatility) out.push({ label: tr('Volatility'), value: tr(facts.volatility) });
  if (facts?.maxWinCapX != null) out.push({ label: tr('Round cap'), value: formatTimes(facts.maxWinCapX) });
  return out;
}

/** One finding from the rules audit. `required` findings are compliance gaps
 *  (RTP / max win / an undescribed configured feature); `recommended` are the
 *  strongly-advised ones (free-spins details, legal disclaimer, controls guide). */
export interface RulesAuditIssue {
  level: 'required' | 'recommended';
  /** Machine code, e.g. `'rules-missing-rtp'`, `'facts-missing-maxwin'`. */
  code: string;
  /** The coverage topic that would satisfy it, e.g. `'rtp:bonus'`, `'freespins'`. */
  topic: string;
  /** Human sentence shown in the info menu's warning card. */
  message: string;
}

/** Everything the audit extracts from the rules blocks in one pass. */
interface RulesScan {
  text: string;
  headings: string;
  covers: Set<string>;
  hasModeStats: boolean;
  hasLegal: boolean;
}

function scanBlocks(blocks: BlockSpec[] | undefined): RulesScan {
  const scan: RulesScan = { text: '', headings: '', covers: new Set(), hasModeStats: false, hasLegal: false };
  const addText = (t: unknown): void => {
    if (typeof t === 'string' && t) scan.text += `\n${t}`;
  };
  const walk = (list: BlockSpec[] | undefined): void => {
    for (const b of list ?? []) {
      for (const c of b.covers ?? []) scan.covers.add(c);
      const anyB = b as Record<string, unknown>;
      switch (b.kind) {
        case 'mode-stats':
          scan.hasModeStats = true;
          (b.extras ?? []).forEach((it) => {
            addText(it.label);
            addText(it.value);
          });
          break;
        case 'legal':
          scan.hasLegal = true;
          addText(b.text);
          break;
        case 'heading':
        case 'subheading':
          scan.headings += `\n${b.text}`;
          addText(b.text);
          break;
        case 'text':
          addText(b.text);
          break;
        case 'callout':
          addText(b.title);
          addText(b.text);
          break;
        case 'media':
          addText(b.title);
          addText(b.text);
          break;
        case 'steps':
          b.items.forEach(addText);
          break;
        case 'table':
          (b.columns ?? []).forEach(addText);
          b.rows.forEach((r) => r.forEach(addText));
          break;
        case 'paytable':
          b.rows.forEach((r) => {
            addText(r.symbol);
            addText(r.payouts);
          });
          break;
        case 'cards':
          b.items.forEach((it) => {
            addText(it.title);
            addText(it.text);
          });
          break;
        case 'stat-grid':
          b.items.forEach((it) => {
            addText(it.label);
            addText(it.value);
          });
          break;
        case 'group':
          addText(b.title);
          walk(b.children);
          break;
        default:
          addText(anyB.label);
          addText(anyB.hint);
          break;
      }
    }
  };
  walk(blocks);
  return scan;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does the text state this RTP? Accepts "95.5%" / "95.50%" (and "96%" / "96.00%"). */
function mentionsRtp(text: string, rtp: number): boolean {
  const s = String(rtp);
  const [int = '', frac = ''] = s.split('.');
  const body = frac ? `${escapeRe(int)}[.,]${escapeRe(frac)}0*` : `${escapeRe(int)}(?:[.,]0{1,2})?`;
  return new RegExp(`\\b${body}\\s*%`).test(text);
}

/** Does the text state this × multiple? Accepts "5,000×" / "5000x" / "5 000 x". */
function mentionsTimes(text: string, x: number): boolean {
  const digits = String(Math.trunc(Math.abs(x)));
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += '[,.\\s\\u00a0]?';
    grouped += digits[i];
  }
  const frac = Math.abs(x) % 1 !== 0 ? `[.,]\\d+` : `(?:[.,]\\d+)?`;
  return new RegExp(`\\b${grouped}${frac}\\s*[x×]`, 'i').test(text);
}

const mentionsName = (text: string, name: string): boolean => text.toLowerCase().includes(name.toLowerCase());

/**
 * Audit the rules blocks against the declared game facts. Pure + never-throw.
 * Findings come back most severe first (`required`, then `recommended`); an empty
 * array means the rules declare everything the game's configuration demands.
 */
export function auditRules(facts: GameFacts | undefined, rules: BlockSpec[] | undefined): RulesAuditIssue[] {
  const out: RulesAuditIssue[] = [];
  try {
    const scan = scanBlocks(rules);
    const add = (level: RulesAuditIssue['level'], code: string, topic: string, message: string): void => {
      out.push({ level, code, topic, message });
    };
    const covered = (topic: string): boolean => scan.covers.has(topic);

    for (const m of facts?.modes ?? []) {
      const nameIn = mentionsName(scan.text, m.name);
      // RTP — required for every mode.
      if (m.rtp == null) {
        add('required', 'facts-missing-rtp', `rtp:${m.id}`, `“${m.name}” declares no RTP — set facts.modes[].rtp so the rules can state it.`);
      } else if (!(scan.hasModeStats || covered(`rtp:${m.id}`) || (nameIn && mentionsRtp(scan.text, m.rtp)))) {
        add('required', 'rules-missing-rtp', `rtp:${m.id}`, `The RTP of “${m.name}” (${formatRtp(m.rtp)}) is not stated in the rules.`);
      }
      // Max win — required for every mode.
      if (m.maxWinX == null) {
        add('required', 'facts-missing-maxwin', `maxwin:${m.id}`, `“${m.name}” declares no max win — set facts.modes[].maxWinX so the rules can state it.`);
      } else if (!(scan.hasModeStats || covered(`maxwin:${m.id}`) || (nameIn && mentionsTimes(scan.text, m.maxWinX)))) {
        add('required', 'rules-missing-maxwin', `maxwin:${m.id}`, `The max win of “${m.name}” (${formatTimes(m.maxWinX)}) is not stated in the rules.`);
      }
      // Every configured feature (anything that isn't the base game) must be described.
      if (m.kind && m.kind !== 'base' && !(covered(`feature:${m.id}`) || nameIn)) {
        add('required', 'rules-missing-feature', `feature:${m.id}`, `The configured feature “${m.name}” is not described in the rules.`);
      }
    }

    // Free spins — highly recommended (only nag games that opted into facts at all).
    const fs = facts?.freeSpins;
    if (fs === undefined) {
      if (facts?.modes?.length) {
        add('recommended', 'facts-missing-freespins', 'freespins', 'Free-spins info is highly recommended: declare facts.freeSpins { count, retrigger } — or freeSpins: false if the game has none.');
      }
    } else if (fs !== false) {
      const fsIn = covered('freespins') || /free\s*spins?/i.test(scan.text);
      if (!fsIn) {
        add('recommended', 'rules-missing-freespins', 'freespins', 'The rules never mention the free spins this game declares.');
      } else {
        if (fs.count != null && !covered('freespins:count') && !new RegExp(`\\b${fs.count}\\b[\\s\\S]{0,60}?spins?|spins?[\\s\\S]{0,60}?\\b${fs.count}\\b`, 'i').test(scan.text)) {
          add('recommended', 'rules-missing-fs-count', 'freespins:count', `State that the bonus awards exactly ${fs.count} free spins.`);
        }
        if (fs.retrigger != null && !covered('freespins:retrigger') && !/re-?trigger/i.test(scan.text)) {
          add('recommended', 'rules-missing-fs-retrigger', 'freespins:retrigger', `State that free spins ${fs.retrigger ? 'CAN' : 'CANNOT'} be retriggered.`);
        }
      }
    }

    // Legal disclaimer + a controls guide — recommended for every game.
    if (rules?.length && !scan.hasLegal && !/malfunction/i.test(scan.text)) {
      add('recommended', 'rules-missing-legal', 'legal', 'Add the platform legal disclaimer (a `legal` block).');
    }
    if (rules?.length && !covered('controls') && !/\bcontrols?\b/i.test(scan.headings)) {
      add('recommended', 'rules-missing-controls', 'controls', 'Describe every interactive control (a “Controls” section or covers: ["controls"]).');
    }

    out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'required' ? -1 : 1));
  } catch {
    /* the audit must never break the menu */
  }
  return out;
}
