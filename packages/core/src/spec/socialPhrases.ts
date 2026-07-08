/**
 * Social-mode FORBIDDEN-PHRASE checker (Charter B8/P11). Stake US social/sweepstakes
 * jurisdiction restricts gambling wording; a game must not surface "bet", "pay(table)",
 * "funds", "cash", etc. anywhere in its copy. This scans the ENGLISH strings a game
 * ships (menu blocks, rules, section titles, control labels/hints, the `en` dictionary,
 * the game name) and reports every restricted phrase with a compliant replacement, so
 * the classic "we shipped a *paytable* while `pay` is banned" slips through no longer.
 *
 * It's a lint, not a gate — never throws; `createUI` runs it automatically in social
 * mode and forwards findings to `HostHooks.onDataIssue` (+ a console warning), and a
 * game's own test can call {@link checkSocialPhrases} directly.
 *
 * See Stake's "Jurisdiction Requirements → forbidden phrases" for the authoritative
 * list; this covers the common roots and their recommended replacements.
 */
import type { UISpec, BlockSpec } from './types';
import { openuiSocialDefaults } from '../i18n/translator';

export interface ForbiddenMatch {
  /** The restricted root that matched ("pay*", "bet", "funds", …). */
  term: string;
  /** The recommended compliant replacement. */
  replacement: string;
}
export interface SocialPhraseIssue {
  /** Where the copy lives (e.g. `menu.rules[3]`, `locale.en["Paytable"]`). */
  source: string;
  /** The offending string. */
  text: string;
  /** Every restricted phrase found in it. */
  matches: ForbiddenMatch[];
}

// Restricted roots → compliant replacements. Case-insensitive. Anchored so a bare root
// can't over-flag ("bet" must not hit "between"/"better"); `\w*` roots (pay*/cash*/…)
// deliberately catch compounds like "paytable"/"cashout" — the whole point here.
const FORBIDDEN: ReadonlyArray<{ re: RegExp; term: string; replacement: string }> = [
  { re: /\bpay\w*/i, term: 'pay*', replacement: 'prize / award (e.g. "paytable" → "prizes")' },
  { re: /\bpayout\w*/i, term: 'payout', replacement: 'award' },
  { re: /\bbets?\b|\bbetting\b/i, term: 'bet', replacement: 'play' },
  { re: /\bwager\w*/i, term: 'wager', replacement: 'play' },
  { re: /\bgambl\w*/i, term: 'gamble', replacement: 'play' },
  { re: /\bcash\w*/i, term: 'cash', replacement: 'coins' },
  { re: /\bfunds?\b/i, term: 'funds', replacement: 'coins / balance' },
  { re: /\bmoney\b/i, term: 'money', replacement: 'coins' },
  { re: /\bdeposit\w*/i, term: 'deposit', replacement: 'purchase' },
  { re: /\bwithdraw\w*/i, term: 'withdraw', replacement: 'redeem' },
  { re: /\bcredits?\b/i, term: 'credit', replacement: 'coins / balance' },
  { re: /\bwinnings?\b/i, term: 'winnings', replacement: 'prizes' },
  { re: /\bjackpots?\b/i, term: 'jackpot', replacement: 'grand prize' },
  { re: /\breal[-\s]?money\b/i, term: 'real money', replacement: 'coins' },
];

/** Every restricted phrase in `text` (empty when clean). Pure + total. */
export function findForbiddenPhrases(text: string): ForbiddenMatch[] {
  if (typeof text !== 'string' || !text) return [];
  const seen = new Set<string>();
  const out: ForbiddenMatch[] = [];
  for (const r of FORBIDDEN) {
    if (r.re.test(text) && !seen.has(r.term)) {
      seen.add(r.term);
      out.push({ term: r.term, replacement: r.replacement });
    }
  }
  return out;
}

/** A collected string. `text` is the base English (what renders with no social
 *  override); `key` is the i18n key used to look up a social override — it defaults
 *  to `text`, since a game's menu/rules copy doubles as its own key. */
type Entry = { source: string; text: string; key?: string };

function walkBlock(b: BlockSpec, src: string, out: Entry[]): void {
  const add = (t: unknown, s: string = src): void => {
    if (typeof t === 'string' && t) out.push({ source: s, text: t });
  };
  const anyB = b as Record<string, unknown>;
  switch (b.kind) {
    case 'text':
    case 'heading':
    case 'subheading':
    case 'legal':
      add(b.text);
      break;
    case 'callout':
      add(b.title);
      add(b.text);
      break;
    case 'media':
      add(b.title);
      add(b.text);
      break;
    case 'slider':
    case 'toggle':
    case 'button':
    case 'select':
    case 'stepper':
    case 'value':
      add(anyB.label);
      add(anyB.hint);
      break;
    case 'steps':
      b.items.forEach((s, i) => add(s, `${src}.items[${i}]`));
      break;
    case 'table':
      (b.columns ?? []).forEach((c) => add(c));
      b.rows.forEach((row) => row.forEach((c) => add(c)));
      break;
    case 'paytable':
      b.rows.forEach((r) => {
        add(r.symbol);
        add(r.payouts);
      });
      break;
    case 'cards':
      b.items.forEach((it) => {
        add(it.title);
        add(it.text);
      });
      break;
    case 'stat-grid':
      b.items.forEach((it) => {
        add(it.label);
        add(it.value);
      });
      break;
    case 'group':
      add(b.title);
      b.children.forEach((c, i) => walkBlock(c, `${src}.children[${i}]`, out));
      break;
    default:
      break;
  }
}

/** Collect every English string a spec ships (menu/rules blocks, titles, labels+hints,
 *  game name, the `en` dictionary) with a source path — the input to {@link checkSocialPhrases}. */
export function collectSocialCopy(spec: UISpec): Entry[] {
  const out: Entry[] = [];
  const menu = spec.menu;
  if (menu) {
    const sections: Array<[string, BlockSpec[] | undefined]> = [
      ['settings', menu.settings],
      ['paytable', menu.paytable],
      ['rules', menu.rules],
    ];
    for (const [sec, blocks] of sections) (blocks ?? []).forEach((b, i) => walkBlock(b, `menu.${sec}[${i}]`, out));
    if (menu.titles) for (const [k, v] of Object.entries(menu.titles)) if (v) out.push({ source: `menu.titles.${k}`, text: v });
    if (menu.banner?.src) {
      /* image only, no copy */
    }
  }
  (spec.rules ?? []).forEach((b, i) => walkBlock(b, `rules[${i}]`, out));
  if (spec.game?.name) out.push({ source: 'game.name', text: spec.game.name });
  const en = spec.locale?.messages?.en;
  // The en dict is a translation SOURCE: in social mode the KEY resolves through the
  // social dictionary, so carry `key: k` and check what actually renders for that key.
  if (en) for (const [k, v] of Object.entries(en)) if (typeof v === 'string') out.push({ source: `locale.en[${JSON.stringify(k)}]`, text: v, key: k });
  return out;
}

/**
 * Scan a spec's English copy AS IT RENDERS IN SOCIAL MODE and return every restricted
 * phrase. Each collected string is first resolved through the social dictionary
 * (`locale.socialMessages.en` → built-in `openuiSocialDefaults` → the base text) —
 * exactly like the translator does — so a game that already swaps "bet"/"pay(table)"
 * for compliant wording in social mode is NOT flagged, while a phrase with NO social
 * override (the classic slipped-through "paytable") IS. English by design: the check
 * targets the base `en` copy that every jurisdiction review starts from.
 */
export function checkSocialPhrases(spec: UISpec): SocialPhraseIssue[] {
  const socialEn = spec.locale?.socialMessages?.en ?? {};
  const render = (e: Entry): string => socialEn[e.key ?? e.text] ?? openuiSocialDefaults[e.key ?? e.text] ?? e.text;
  const issues: SocialPhraseIssue[] = [];
  for (const e of collectSocialCopy(spec)) {
    const text = render(e);
    const matches = findForbiddenPhrases(text);
    if (matches.length) issues.push({ source: e.source, text, matches });
  }
  return issues;
}
