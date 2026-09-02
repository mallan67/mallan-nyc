/// <reference types="jest" />
/**
 * STATUS-SPELLING CLOSURE — the test that would have caught the 2026-08-19 defect.
 *
 * ── THE DEFECT THIS EXISTS TO PREVENT ──────────────────────────────────────
 * `listings.status` is one column written by two authorities that spell the same
 * state differently: the provider writes `Canceled` (live Cotality enumeration
 * member, stored VERBATIM by `mapTrestleToPrisma`) and the Mallan CRM writes
 * `Cancelled` (rejected by the provider with HTTP 400). On 2026-08-19 `Canceled`
 * was correctly added to ONE terminal-status set and left out of eight
 * hand-copied duplicates of the same concept. The worst consequence was proven
 * by execution, not argued:
 *
 *     shouldResetDom({status:'Cancelled', status_changed_at:-60d, dom:42}) === true
 *     shouldResetDom({status:'Canceled',  ...identical...})                === false
 *
 * — a UCBA 2026 Art. I §11 DOM-reset failure.
 *
 * ── THE TWO HALVES ─────────────────────────────────────────────────────────
 * PART A — BEHAVIOURAL. Every predicate in the repo that classifies a STORED
 * status is called with each member of each spelling class and must return
 * IDENTICAL results. No regex, no false positives, and it fails on real
 * behaviour rather than on source text. This is the half that actually proves
 * the bug is closed.
 *
 * PART B — STRUCTURAL. A source scan over the directories that hold
 * stored-status predicates. Any status-set literal that mentions one member of a
 * spelling class without its siblings FAILS, unless the line carries an explicit
 * `STATUS-SPELLING-EXEMPT: <reason>` marker. Vocabulary declarations (the list of
 * members the provider ACCEPTS, the list it REJECTS) are legitimately not
 * spelling-closed and carry that marker. This is the half that stops a TENTH
 * duplicate from appearing silently: a new unmarked literal fails immediately.
 *
 * Part B is deliberately NOT a whole-repo scan. Its enforced scope is the set of
 * directories where predicates over `listings.status` actually live. Surfaces
 * outside that scope are listed in `OUT_OF_SCOPE` below WITH REASONS rather than
 * quietly skipped — several of them are owned by other workstreams and two of
 * them carry known gaps that this test records instead of hiding.
 *
 * ── TWO BLIND SPOTS IN PART B, CLOSED 2026-08-20 ───────────────────────────
 * The first version of Part B could not fail on two of the exact shapes it
 * exists to police. A guard that cannot fail on its own defect is worse than no
 * guard, because it gets quoted as assurance:
 *
 *   (a) SINGLE-ELEMENT LITERALS were never examined. `scan()` carried
 *       `if (statuses.length < 2) continue;`, and the live REBNY BLOCKER
 *       `CANCELLED-001` was written `MlsStatus: ['Canceled']` — exactly that
 *       shape, in an ENFORCED directory (`lib/compliance`), 24 lines above the
 *       `OFFMARKET-001` literal the same pass had just fixed. Part B stayed
 *       green through the whole thing. The minimum is now ONE status, so a
 *       one-element literal and a bare `x === 'Cancelled'` comparison both
 *       count.
 *
 *   (b) OBJECT / RECORD LITERALS AND switch/case ARMS WERE INVISIBLE. The
 *       scanner's group regex matched only `[...]` and `(...)`, so a
 *       `Record<string, X>` keyed on status — `statusReverseMap` in
 *       `lib/compliance/reso-mapper.ts`, whose missing `Canceled` key fell
 *       through a `|| 'Active'` default — was not scanned at all. `{...}` and
 *       switch statements are now scanned too.
 *
 * For an object literal the closure question is asked of its KEYS, not its
 * values: the keys are the input domain the map must cover, while a value is an
 * OUTPUT and is legitimately a single canonical spelling (that is precisely what
 * `canonicalProviderSpelling` and `STATUS_ALIASES` are for). For a `switch`, all
 * `case` labels in the statement are one group — an arm anywhere in it counts.
 *
 * Both closures are proven, not asserted: `scanSource()` is exercised directly
 * on mutant sources carrying each shape, and each mutant must produce a
 * violation while its corrected form produces none.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ACTIVE_DISPLAY_STATUSES,
  ALL_MODELLED_STATUSES,
  canonicalProviderSpelling,
  CRM_HIDDEN_STATUSES,
  DOM_RESET_ELIGIBLE_STATUSES,
  LIVE_PROVIDER_STANDARD_STATUSES,
  NON_DISPLAYABLE_STATUSES,
  STATUS_SPELLING_CLASSES,
  statusSpellings,
  TERMINAL_STATUSES,
  withStatusSpellings,
} from '@/lib/compliance/listing-status-vocabulary';
import { shouldResetDom, computeDomTransition } from '@/lib/compliance/dom-tracker';
import { mapRESOToListing } from '@/lib/compliance/reso-mapper';
import {
  classifyStandardStatus,
  computeGateColumns,
  normalizeStandardStatus,
  TERMINAL_STATUSES as MAPPER_TERMINAL_STATUSES,
} from '@/lib/idx/trestle-mapper';
import { reconcileStatusDecision, resolveIdxDisplay } from '@/lib/idx/reconcile-decision';
import { evaluateMallanSyndicationEligibility } from '@/lib/syndication/eligibility';
import { ARCHIVE_TERMINAL_STATUSES } from '@/lib/retention/archive-terminals';
import { TERMINAL_STATUSES as PUBLIC_FILTER_TERMINALS } from '@/lib/compliance/public-listing-filter';
import { OFF_MARKET_STATUSES } from '@/lib/scanner/trestle-off-market-filter';
import { STATUS_TRANSITIONS } from '@/app/api/crm/listings/[id]/status/route';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// ═══════════════════════════════════════════════════════════════════════════
// PART A — BEHAVIOURAL: both spellings must be indistinguishable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every predicate the repo exposes that answers a question ABOUT A STORED
 * `listings.status` VALUE. Each is called with one status string and must return
 * a value that is deep-equal across the members of a spelling class.
 *
 * Adding a new stored-status predicate to the repo? Add it here. Part B's scan
 * will point you at this list if you forget.
 */
const STORED_STATUS_PREDICATES: Array<{ name: string; of: (status: string) => unknown }> = [
  // ── The canonical vocabulary sets ──
  { name: 'TERMINAL_STATUSES.has', of: (s) => TERMINAL_STATUSES.has(s) },
  { name: 'DOM_RESET_ELIGIBLE_STATUSES.has', of: (s) => DOM_RESET_ELIGIBLE_STATUSES.has(s) },
  { name: 'NON_DISPLAYABLE_STATUSES.has', of: (s) => NON_DISPLAYABLE_STATUSES.has(s) },
  { name: 'ACTIVE_DISPLAY_STATUSES.has', of: (s) => ACTIVE_DISPLAY_STATUSES.has(s) },
  { name: 'CRM_HIDDEN_STATUSES.includes', of: (s) => CRM_HIDDEN_STATUSES.includes(s) },

  // ── Duplicated mirrors that must agree with the canonical sets ──
  { name: 'trestle-mapper TERMINAL_STATUSES.has', of: (s) => MAPPER_TERMINAL_STATUSES.has(s) },
  { name: 'archive-terminals ARCHIVE_TERMINAL_STATUSES.includes', of: (s) => (ARCHIVE_TERMINAL_STATUSES as readonly string[]).includes(s) },
  { name: 'public-listing-filter TERMINAL_STATUSES.includes', of: (s) => (PUBLIC_FILTER_TERMINALS as readonly string[]).includes(s) },
  { name: 'trestle-off-market-filter OFF_MARKET_STATUSES.has', of: (s) => OFF_MARKET_STATUSES.has(s) },

  // ── Classifiers / normalizers ──
  // `normalizeStandardStatus` is compared through the spelling fold: the two
  // spellings legitimately round-trip to THEMSELVES (provider provenance is
  // preserved verbatim), so the invariant is that they land in the same CLASS.
  { name: 'normalizeStandardStatus (folded to class)', of: (s) => canonicalProviderSpelling(normalizeStandardStatus(s)) },
  { name: 'classifyStandardStatus', of: (s) => classifyStandardStatus(s) },

  // ── DOM / UCBA Art. I §11 ──
  {
    name: 'shouldResetDom (60d in status, dom=42)',
    of: (s) =>
      shouldResetDom({
        status: s,
        permissions: null,
        status_changed_at: new Date(Date.now() - 60 * 864e5),
        first_active_date: new Date(Date.now() - 200 * 864e5),
        days_on_market: 42,
      }),
  },
  {
    name: 'computeDomTransition(status → Active).days_on_market',
    of: (s) =>
      computeDomTransition(
        {
          status: s,
          permissions: null,
          status_changed_at: new Date(Date.now() - 60 * 864e5),
          first_active_date: new Date(Date.now() - 200 * 864e5),
          days_on_market: 42,
        },
        'Active',
      ).days_on_market,
  },

  // ── Display gate ──
  {
    name: 'computeGateColumns({status}).idx_display_yn',
    of: (s) => computeGateColumns({ status: s }).idx_display_yn,
  },
  { name: 'computeGateColumns({status}).is_terminal', of: (s) => computeGateColumns({ status: s }).is_terminal },

  // ── RESO reverse map (a terminal status must never become Active) ──
  //
  // REACHABILITY, stated so this suite does not imply more than it proves:
  // `mapRESOToListing` has NO production call site (grep 2026-08-20 — only the
  // unimported `lib/compliance/index.ts` barrel re-export and tests). The live
  // inbound path is `lib/idx/trestle-mapper.ts`, covered separately above. This
  // entry pins a latent fail-open in an exported mapper; it is not evidence of a
  // live display exposure, and the earlier framing that said so was wrong.
  {
    name: 'mapRESOToListing().mlsStatus',
    of: (s) => mapRESOToListing({ MLSStatus: s, PropertyType: 'Residential' } as never).mlsStatus,
  },

  // ── Syndication gate ──
  {
    name: 'evaluateMallanSyndicationEligibility (eligible + reason class)',
    of: (s) => {
      const r = evaluateMallanSyndicationEligibility(
        {
          listing_id: 'SL-0001',
          status: s,
          list_office_mls_id: 'OFFICE1',
          rls_eligible: true,
          owner_opt_out: false,
          participant_only: false,
          internet_entire_listing_display_yn: true,
          idx_display_yn: true,
        } as never,
        { officeMlsIds: new Set(['OFFICE1']), agentMlsIds: new Set<string>() },
      );
      // Compare the reason CODES with the status name stripped — the codes must
      // match even though each reason string embeds its own spelling.
      return {
        eligible: r.eligible,
        codes: r.reasons.map((x) => x.replace(/\s*\(.*\)$/, '')).sort(),
      };
    },
  },

  // ── CRM status state machine ──
  {
    name: 'STATUS_TRANSITIONS[status] (allowed next states)',
    of: (s) => STATUS_TRANSITIONS[s] ?? null,
  },

  // ── Reconciliation ──
  {
    name: "reconcileStatusDecision(status, absent)",
    of: (s) => {
      const d = reconcileStatusDecision(s, { kind: 'absent' });
      return { action: d.action, targetStatus: canonicalProviderSpelling(d.targetStatus), targetIsTerminal: d.targetIsTerminal, className: d.className };
    },
  },
  {
    name: "resolveIdxDisplay(reconcile(status, absent), true)",
    of: (s) => resolveIdxDisplay(reconcileStatusDecision(s, { kind: 'absent' }), true),
  },
];

describe('PART A — every stored-status predicate treats a spelling class identically', () => {
  for (const cls of STATUS_SPELLING_CLASSES) {
    const [first, ...rest] = cls.members;
    for (const other of rest) {
      for (const pred of STORED_STATUS_PREDICATES) {
        it(`${pred.name}: '${first}' === '${other}'`, () => {
          const a = pred.of(first);
          const b = pred.of(other);
          expect({ status: other, value: b }).toEqual({ status: other, value: a });
        });
      }
    }
  }

  it('a spelling class never straddles the terminal boundary', () => {
    for (const cls of STATUS_SPELLING_CLASSES) {
      const verdicts = cls.members.map((m) => TERMINAL_STATUSES.has(m));
      expect(new Set(verdicts).size).toBe(1);
    }
  });

  // Name says "latent", not "live": mapRESOToListing is uncalled in production
  // (see the reachability note on its predicate entry above). This pins the
  // fail-closed default for whoever calls it first.
  it('a terminal status NEVER reverse-maps to a displayable one (reso-mapper latent fail-open)', () => {
    for (const s of TERMINAL_STATUSES) {
      const mapped = mapRESOToListing({ MLSStatus: s, PropertyType: 'Residential' } as never).mlsStatus;
      expect({ input: s, mapped }).not.toEqual({ input: s, mapped: 'Active' });
      expect({ input: s, mapped }).not.toEqual({ input: s, mapped: 'Pending' });
    }
  });

  it('an UNKNOWN status reverse-maps fail-CLOSED, never to Active', () => {
    for (const s of ['NotARealStatus', '', 'active-ish', 'TemporarilyOffMarket']) {
      const mapped = mapRESOToListing({ MLSStatus: s, PropertyType: 'Residential' } as never).mlsStatus;
      expect({ input: s, mapped }).not.toEqual({ input: s, mapped: 'Active' });
    }
  });
});

describe('PART A — live provider vocabulary is fully modelled', () => {
  it('every live provider member is classified (never "unclassified")', () => {
    for (const member of LIVE_PROVIDER_STANDARD_STATUSES) {
      expect({ member, cls: classifyStandardStatus(member) }).not.toEqual({ member, cls: 'unclassified' });
    }
  });

  it('every live provider member round-trips through the normalizer verbatim', () => {
    for (const member of LIVE_PROVIDER_STANDARD_STATUSES) {
      expect(normalizeStandardStatus(member)).toBe(member);
    }
  });

  it('every live provider member is in ALL_MODELLED_STATUSES', () => {
    for (const member of LIVE_PROVIDER_STANDARD_STATUSES) {
      expect({ member, modelled: ALL_MODELLED_STATUSES.has(member) }).toEqual({ member, modelled: true });
    }
  });

  it('canonicalProviderSpelling never produces a provider-rejected string', () => {
    for (const cls of STATUS_SPELLING_CLASSES) {
      if (!cls.providerSpelling) continue;
      for (const m of cls.members) {
        expect(LIVE_PROVIDER_STANDARD_STATUSES.has(canonicalProviderSpelling(m))).toBe(true);
      }
    }
  });

  it('withStatusSpellings is idempotent and order-stable', () => {
    const once = withStatusSpellings(['Withdrawn', 'Cancelled']);
    expect(once).toEqual(['Withdrawn', 'Cancelled', 'Canceled']);
    expect(withStatusSpellings(once)).toEqual(once);
  });

  it('statusSpellings agrees with the declared classes, and is identity off-class', () => {
    for (const cls of STATUS_SPELLING_CLASSES) {
      for (const m of cls.members) {
        expect(statusSpellings(m).sort()).toEqual([...cls.members].sort());
      }
    }
    // A status with no siblings maps to itself — never to a broader set.
    expect(statusSpellings('Closed')).toEqual(['Closed']);
    expect(statusSpellings('NotAStatus')).toEqual(['NotAStatus']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PART B — STRUCTURAL: no unmarked, non-closed status literal may exist
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Directories that hold predicates over `listings.status`. A status-set literal
 * anywhere in here must be spelling-closed or explicitly marked.
 */
const ENFORCED_ROOTS = [
  'lib/compliance',
  'lib/idx',
  'lib/retention',
  'lib/syndication',
  'lib/listings',
  'app/api/cron',
  'app/api/crm/listings',
  'app/api/crm/listing-campaigns',
  'app/api/idx',
  'scripts/phase1-verify.sql',
  // Added 2026-08-20 once GAP 2 / GAP 3 were closed. Both are CommonJS runners
  // that cannot import the canonical vocabulary; their literals are pinned to it
  // by lib/compliance/__tests__/d9-coming-soon-status-closure.test.ts, and
  // scanning them here stops a NEW incomplete literal from appearing in either.
  'scripts/reconcile-ghosts.js',
  'scripts/phase1-run.js',
];

/**
 * Surfaces NOT scanned, each with the reason. Recorded here rather than silently
 * omitted so the boundary of this test is auditable. An entry here means "this
 * surface is legitimately not a stored-status predicate", NEVER "this surface is
 * broken and we would rather not look" — that second case belongs in KNOWN_GAPS
 * below, which asserts the breakage still exists.
 */
const OUT_OF_SCOPE: Array<{ pathPrefix: string; reason: string }> = [
  { pathPrefix: 'public/crm', reason: 'Browser form-validation + label maps. Does not query listings.status; owned by the CRM-frontend hold (CLAUDE.md §C).' },
  { pathPrefix: 'lib/search', reason: 'Owned by the search workstream; its own canonical status module is pinned by that package\'s contract tests.' },
  { pathPrefix: 'lib/crm/status-mapping.ts', reason: 'Declares the MALLAN CRM vocabulary itself (double-L is the canonical CRM value). Not a predicate over stored provider rows.' },
  { pathPrefix: 'lib/scanner', reason: 'OFF_MARKET_STATUSES is already spelling-closed; covered behaviourally in Part A.' },
  { pathPrefix: 'scripts/idx-validate.js', reason: 'Validator baseline listing PROVIDER vocabulary only (Class E artifact).' },
  { pathPrefix: 'scripts/generate-master-registry.js', reason: 'Generated-registry source listing PROVIDER vocabulary only (Class E artifact).' },
  { pathPrefix: 'tests/runtime', reason: 'Runtime test mirrors; several intentionally assert one spelling. Behaviour is pinned by Part A.' },
  // Added 2026-08-20 together with the single-element fix below. A test that
  // asserts `f('Canceled') === x` is a one-spelling ASSERTION by design, not a
  // predicate over stored status, and dozens of them exist on purpose (both
  // spellings are usually asserted in adjacent `it()` blocks, which the scanner
  // cannot pair up). Lowering the minimum to one status made every one of them a
  // false positive. The cross-spelling invariant for the code those tests cover
  // is pinned by Part A, which calls the real predicates.
  { pathPrefix: '__TESTS__', reason: 'Matched specially below: any __tests__ directory inside an enforced root. One-spelling assertions are the normal, correct shape for a unit test; Part A pins the behaviour instead.' },
  // NOTE (2026-08-20): scripts/phase1-run.js and scripts/reconcile-ghosts.js used
  // to sit here as RECORDED-BUT-UNFIXED gaps. Both are now closed and PROMOTED
  // into ENFORCED_ROOTS above. Do not re-add them here to silence a failure.
];

/**
 * KNOWN, UNFIXED GAPS — recorded rather than hidden.
 *
 * An entry is a REAL spelling-closure violation a change chose not to fix
 * because the file was outside its owned-file set. Entries are matched precisely
 * by file + snippet so they cannot silently expand to cover anything else, and
 * the test below ASSERTS EACH ONE STILL EXISTS — so when somebody fixes it, this
 * test fails and tells them to delete the entry. A stale allowlist is how a
 * "known gap" becomes a forgotten gap.
 *
 * ── CURRENTLY EMPTY, AND THAT IS THE GOAL STATE (2026-08-20) ──────────────
 * The one entry this registry carried — the UCBA D9 lookup in
 * app/api/crm/listings/route.ts, whose literal
 * ["Active","Withdrawn","Expired","Sold","Rented","Cancelled"] reached only
 * 14,422 of 25,239 production listing rows — is closed. The D9 leg now imports
 * COMING_SOON_PRIOR_USE_STATUSES, and coverage is asserted against the frozen
 * production census in
 * lib/compliance/__tests__/d9-coming-soon-status-closure.test.ts.
 *
 * The mechanism is retained on purpose: the next change that finds a real
 * violation it cannot fix must record it HERE (never in OUT_OF_SCOPE), where the
 * assertion below keeps it from rotting into a forgotten allowlist.
 */
const KNOWN_GAPS: Array<{ file: string; snippetIncludes: string; impact: string }> = [];
// `m` flag is REQUIRED: the marker is searched inside a multi-line window, and
// without it `$` anchors to end-of-string so a marker on any line but the last
// silently fails to match. (Found the hard way — the first version of this test
// reported every correctly-marked declaration as a violation.)
const EXEMPT_MARKER = /STATUS-SPELLING-EXEMPT:\s*(\S.*)$/m;
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|sql)$/;
const QUOTED = /['"`]([A-Za-z][A-Za-z ]{2,40})['"`]/g;

/**
 * Object-literal KEYS — quoted (`'Canceled':`) or bare (`Canceled:`), anchored
 * to a member position so a VALUE is never mistaken for a key.
 *
 * Keys, not values, are what a map literal must be spelling-closed over: the
 * keys are the input domain the map has to cover, while a value is an OUTPUT and
 * is legitimately a single canonical spelling. `STATUS_ALIASES` in
 * lib/idx/trestle-mapper.ts (`{ canceled: 'Cancelled' }`) is the case that
 * settles it — its one-way fold to the CRM canonical is deliberate and
 * documented, and a value-based scan would report it as a defect forever.
 */
const OBJECT_KEY =
  /(?:^|[{,;\n])\s*(?:['"`]([A-Za-z][A-Za-z ]{2,40})['"`]|([A-Za-z_$][A-Za-z0-9_$]*))\s*:/g;

/** `case 'Canceled':` — a switch arm is a status predicate like any other. */
const CASE_LABEL = /\bcase\s*['"`]([A-Za-z][A-Za-z ]{2,40})['"`]\s*:/g;

/**
 * The constructors that make a literal spelling-closed BY CONSTRUCTION. A
 * literal wrapped in one of these cannot omit a sibling spelling — the closure
 * is computed at runtime from `STATUS_SPELLING_CLASSES` — so it is correct to
 * write only the "seed" spellings there. This is the shape every new predicate
 * should use, which is why the scanner rewards it rather than demanding a
 * marker.
 */
const CLOSURE_CONSTRUCTORS = /(withStatusSpellings|statusSpellingSet)\s*\(\s*$/;

/**
 * Blank out comments (block, line, SQL) with same-length spaces so byte offsets
 * and line numbers survive. Without this the scanner reports prose — a doc
 * comment that MENTIONS one spelling is not a predicate.
 */
function stripComments(src: string, isSql: boolean): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (!isSql && c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (isSql && c === '-' && n === '-') {
      const end = src.indexOf('\n', i);
      blank(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (!isSql && c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    i++;
  }
  return out.join('');
}

function walk(target: string, out: string[] = []): string[] {
  if (!fs.existsSync(target)) return out;
  if (fs.statSync(target).isFile()) {
    if (SCAN_EXT.test(target)) out.push(target);
    return out;
  }
  for (const e of fs.readdirSync(target, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    walk(path.join(target, e.name), out);
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  kind: GroupKind;
  has: string;
  missing: string;
  snippet: string;
}

type GroupKind = 'list' | 'object' | 'switch';

interface SourceGroup {
  kind: GroupKind;
  /** Offset of the opening delimiter in the (comment-stripped) source. */
  start: number;
  /** Offset just past the closing delimiter. */
  end: number;
  /**
   * The group's DIRECT content: everything between the delimiters with any
   * NESTED group blanked to spaces. Direct-only is what stops a violation in an
   * inner literal from being "healed" by a sibling spelling that happens to
   * appear elsewhere inside the same enclosing block.
   */
  body: string;
}

const CLOSERS: Record<string, string> = { '[': ']', '(': ')', '{': '}' };

/**
 * Split comment-stripped source into bracket groups.
 *
 * Replaces the old `/[[(]([^[\]()]*?)[\])]/gs` regex, which had TWO
 * consequences that together let the CANCELLED-001 defect through:
 *   - it never matched `{...}`, so every Record/object map and every switch body
 *     was invisible;
 *   - being non-nesting, it only ever saw the innermost literal, so a map whose
 *     values contain a call — `{ Canceled: fn(x) }` — would have been skipped
 *     even if braces had been added naively.
 *
 * This scanner is string-aware (a bracket inside a string literal is not a
 * delimiter) and reports EVERY group with its direct content.
 */
function extractGroups(code: string): SourceGroup[] {
  const groups: SourceGroup[] = [];
  const stack: Array<{ ch: string; start: number }> = [];
  const nested: Array<{ parentDepth: number; start: number; end: number }> = [];
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === '[' || c === '(' || c === '{') {
      stack.push({ ch: c, start: i });
      i++;
      continue;
    }
    if (c === ']' || c === ')' || c === '}') {
      const top = stack.pop();
      if (top && CLOSERS[top.ch] === c) {
        nested.push({ parentDepth: stack.length, start: top.start, end: i + 1 });
        groups.push({
          kind: top.ch === '{' ? 'object' : 'list',
          start: top.start,
          end: i + 1,
          body: '',
        });
      }
      i++;
      continue;
    }
    i++;
  }
  // Blank each group's nested children so every body holds DIRECT content only.
  for (const g of groups) {
    const chars = code.slice(g.start + 1, g.end - 1).split('');
    for (const other of groups) {
      if (other === g || other.start <= g.start || other.end > g.end) continue;
      // A direct or transitive child: blank it. (Blanking transitive children
      // twice is harmless — they are already inside a blanked direct child.)
      for (let k = other.start; k < other.end; k++) {
        const idx = k - (g.start + 1);
        if (idx >= 0 && idx < chars.length && chars[idx] !== '\n' && chars[idx] !== '\r') chars[idx] = ' ';
      }
    }
    g.body = chars.join('');
  }
  return groups;
}

/**
 * Every `switch` statement, as ONE group spanning its whole body.
 *
 * A switch is the one construct where healing is CORRECT: an arm handling the
 * sibling spelling anywhere in the same statement means the predicate covers the
 * class, wherever the author chose to put it.
 */
function extractSwitchGroups(code: string): SourceGroup[] {
  const out: SourceGroup[] = [];
  const re = /\bswitch\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
      i++;
    }
    while (i < code.length && code[i] !== '{') i++;
    if (i >= code.length) continue;
    const start = i;
    let braces = 0;
    for (; i < code.length; i++) {
      if (code[i] === '{') braces++;
      else if (code[i] === '}') {
        braces--;
        if (braces === 0) break;
      }
    }
    out.push({ kind: 'switch', start, end: Math.min(i + 1, code.length), body: code.slice(start, i + 1) });
  }
  return out;
}

/** The status strings a group asserts over, by group kind. */
function statusesIn(group: SourceGroup): string[] {
  const found: string[] = [];
  if (group.kind === 'object') {
    for (const k of group.body.matchAll(OBJECT_KEY)) found.push(k[1] ?? k[2]);
  } else if (group.kind === 'switch') {
    for (const k of group.body.matchAll(CASE_LABEL)) found.push(k[1]);
  } else {
    for (const q of group.body.matchAll(QUOTED)) found.push(q[1]);
  }
  return found.filter((v) => ALL_MODELLED_STATUSES.has(v) || v === 'Cancelled' || v === 'Canceled');
}

/**
 * Scan ONE source. Exported from the file's own scope so the negative controls
 * below can run the REAL scanner over synthetic mutants — a guard that is only
 * ever pointed at a tree it passes on has never been shown to fail.
 */
function scanSource(rel: string, raw: string): Violation[] {
  const violations: Violation[] = [];
  const code = stripComments(raw, rel.endsWith('.sql'));
  const lines = raw.split(/\r?\n/);
  const groups = [...extractGroups(code), ...extractSwitchGroups(code)];
  for (const g of groups) {
    const statuses = statusesIn(g);
    // ONE status is enough. The old `< 2` guard is exactly why a live REBNY
    // BLOCKER written `MlsStatus: ['Canceled']` was never examined.
    if (statuses.length < 1) continue;
    const present = new Set(statuses);
    for (const cls of STATUS_SPELLING_CLASSES) {
      const hit = cls.members.filter((c) => present.has(c));
      if (hit.length === 0 || hit.length === cls.members.length) continue;

      // Closed by construction — the literal is a seed passed to the closure
      // constructor, which expands it at runtime.
      if (CLOSURE_CONSTRUCTORS.test(code.slice(Math.max(0, g.start - 60), g.start))) continue;

      const startLine = raw.slice(0, g.start).split('\n').length;
      const endLine = raw.slice(0, g.end).split('\n').length;
      // An exemption marker anywhere inside the literal, or on the 8 lines
      // above it (where a doc comment naturally sits), clears it.
      const window = lines.slice(Math.max(0, startLine - 9), endLine).join('\n');
      if (EXEMPT_MARKER.test(window)) continue;

      violations.push({
        file: rel,
        line: startLine,
        kind: g.kind,
        has: hit.join('+'),
        missing: cls.members.filter((c) => !present.has(c)).join('+'),
        snippet: g.body.replace(/\s+/g, ' ').trim().slice(0, 140),
      });
    }
  }
  return violations;
}

/** True for any `__tests__` directory inside an enforced root — see OUT_OF_SCOPE. */
function isTestFile(rel: string): boolean {
  return rel.split('/').includes('__tests__');
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  const files = ENFORCED_ROOTS.flatMap((r) => walk(path.join(REPO_ROOT, r)));
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (OUT_OF_SCOPE.some((o) => o.pathPrefix !== '__TESTS__' && rel.startsWith(o.pathPrefix))) continue;
    if (isTestFile(rel)) continue;
    violations.push(...scanSource(rel, fs.readFileSync(file, 'utf8')));
  }
  return violations;
}

describe('PART B — no unmarked, spelling-incomplete status literal in the enforced scope', () => {
  it('the scanner actually reads files (sanity check on the test itself)', () => {
    const files = ENFORCED_ROOTS.flatMap((r) => walk(path.join(REPO_ROOT, r)));
    expect(files.length).toBeGreaterThan(50);
  });

  it('the scanner ignores test files but still reads real source', () => {
    // The __tests__ exclusion must not quietly swallow the enforced surface.
    const files = ENFORCED_ROOTS.flatMap((r) => walk(path.join(REPO_ROOT, r))).map((f) =>
      path.relative(REPO_ROOT, f).split(path.sep).join('/'),
    );
    expect(files.some(isTestFile)).toBe(true);
    expect(files.filter((f) => !isTestFile(f)).length).toBeGreaterThan(50);
    expect(isTestFile('lib/compliance/__tests__/x.test.ts')).toBe(true);
    expect(isTestFile('lib/compliance/rebny-field-tables.ts')).toBe(false);
  });

  /**
   * MUTANT PROOFS — the scanner is run over synthetic sources carrying each
   * shape it exists to catch, and must FAIL on the defect and PASS on its
   * correction. Every one of these three is a shape the pre-2026-08-20 scanner
   * reported as clean.
   *
   * STATUS-SPELLING-EXEMPT: this whole block is deliberate synthetic mutants.
   * The literals below are incomplete ON PURPOSE — that is the assertion. (The
   * marker is inert here anyway: scanSource() is called on strings, not on this
   * file, so this file's own text is never the thing being scanned.)
   */
  const MUTANTS: Array<{
    name: string;
    defect: string;
    corrected: string;
    kind: GroupKind;
    has: string;
    missing: string;
  }> = [
    {
      name: '(a) single-element array literal — the CANCELLED-001 shape',
      defect: `const rule = { appliesWhen: { MlsStatus: ['Canceled'] } };`,
      corrected: `const rule = { appliesWhen: { MlsStatus: ['Canceled', 'Cancelled'] } };`,
      kind: 'list',
      has: 'Canceled',
      missing: 'Cancelled',
    },
    {
      name: '(b1) object/Record literal keyed on status — the statusReverseMap shape',
      defect: [
        'const statusReverseMap = {',
        "  Active: 'Active',",
        "  Canceled: 'Withdrawn',",
        "  Closed: 'Closed',",
        '};',
      ].join('\n'),
      corrected: [
        'const statusReverseMap = {',
        "  Active: 'Active',",
        "  Canceled: 'Withdrawn',",
        "  Cancelled: 'Withdrawn',",
        "  Closed: 'Closed',",
        '};',
      ].join('\n'),
      kind: 'object',
      has: 'Canceled',
      missing: 'Cancelled',
    },
    {
      name: '(b2) switch/case arm over a stored status',
      defect: [
        'function f(s) {',
        '  switch (s) {',
        "    case 'Cancelled':",
        "      return 'terminal';",
        '    default:',
        '      return null;',
        '  }',
        '}',
      ].join('\n'),
      corrected: [
        'function f(s) {',
        '  switch (s) {',
        "    case 'Cancelled':",
        "    case 'Canceled':",
        "      return 'terminal';",
        '    default:',
        '      return null;',
        '  }',
        '}',
      ].join('\n'),
      kind: 'switch',
      has: 'Cancelled',
      missing: 'Canceled',
    },
  ];

  it.each(MUTANTS)('MUTANT $name — scanner FAILS on the defect', (m) => {
    const found = scanSource('lib/compliance/synthetic-mutant.ts', m.defect);
    expect({
      name: m.name,
      found: found.map((v) => ({ kind: v.kind, has: v.has, missing: v.missing })),
    }).toEqual({
      name: m.name,
      found: [{ kind: m.kind, has: m.has, missing: m.missing }],
    });
  });

  it.each(MUTANTS)('MUTANT $name — scanner PASSES on the correction', (m) => {
    expect({ name: m.name, violations: scanSource('lib/compliance/synthetic-mutant.ts', m.corrected) }).toEqual({
      name: m.name,
      violations: [],
    });
  });

  it('a closure-constructed literal is accepted without a marker', () => {
    const src = `const S = withStatusSpellings(['Canceled']);`;
    expect(scanSource('lib/compliance/synthetic-mutant.ts', src)).toEqual([]);
  });

  it('an EXEMPT-marked literal is accepted, and only because of the marker', () => {
    const body = `const V = ['Active', 'Canceled', 'Closed'];`;
    expect(scanSource('lib/compliance/synthetic-mutant.ts', body)).toHaveLength(1);
    const marked = `// STATUS-SPELLING-EXEMPT: provider vocabulary declaration.\n${body}`;
    expect(scanSource('lib/compliance/synthetic-mutant.ts', marked)).toEqual([]);
  });

  it('an object VALUE may be a single canonical spelling (one-way folds are legal)', () => {
    // lib/idx/trestle-mapper.ts STATUS_ALIASES: a case-fold of untrusted input
    // onto the CRM canonical. Keys are the domain; the value is an output.
    const src = `const STATUS_ALIASES = {\n  canceled: 'Cancelled',\n};`;
    expect(scanSource('lib/idx/synthetic-mutant.ts', src)).toEqual([]);
  });

  it('prose in a comment is never a violation (comments are stripped)', () => {
    const src = `// The provider spells it 'Canceled' and only 'Canceled'.\nconst n = 1;`;
    expect(scanSource('lib/compliance/synthetic-mutant.ts', src)).toEqual([]);
  });

  // NOT `it.each(KNOWN_GAPS)` — jest throws on `.each([])`, so an empty registry
  // (the goal state) would turn this suite red for the wrong reason. A single
  // looping test keeps the same assertion and survives the registry emptying out.
  it('every KNOWN_GAPS entry still exists — delete the entry once it is fixed', () => {
    if (KNOWN_GAPS.length === 0) {
      expect(KNOWN_GAPS).toEqual([]);
      return;
    }
    const found = scan();
    for (const gap of KNOWN_GAPS) {
      const still = found.some(
        (v) => v.file === gap.file && v.snippet.includes(gap.snippetIncludes),
      );
      expect({ gap: gap.file, stillPresent: still }).toEqual({ gap: gap.file, stillPresent: true });
    }
  });

  it('every status-set literal is spelling-closed or explicitly exempted', () => {
    const violations = scan().filter(
      (v) => !KNOWN_GAPS.some((g) => g.file === v.file && v.snippet.includes(g.snippetIncludes)),
    );
    if (violations.length > 0) {
      const detail = violations
        .map(
          (v) =>
            `  ${v.file}:${v.line}\n     has=${v.has}  MISSING=${v.missing}\n     ${v.snippet}`,
        )
        .join('\n');
      throw new Error(
        `${violations.length} status-set literal(s) mention one spelling of a class without its siblings.\n\n` +
          `Every predicate over listings.status must accept BOTH spellings — the provider writes 'Canceled'\n` +
          `and the Mallan CRM writes 'Cancelled'. Build the set with withStatusSpellings([...]) from\n` +
          `lib/compliance/listing-status-vocabulary.ts, or import a derived set from there.\n` +
          `If the literal is a VOCABULARY DECLARATION rather than a stored-status predicate, add a\n` +
          `"STATUS-SPELLING-EXEMPT: <reason>" comment on or just above it.\n\nViolations:\n${detail}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it('the KNOWN_GAPS registry states an impact for every entry', () => {
    for (const g of KNOWN_GAPS) {
      expect(g.impact.length).toBeGreaterThan(60);
    }
  });

  it('every out-of-scope entry states a reason', () => {
    for (const o of OUT_OF_SCOPE) {
      expect(o.reason.length).toBeGreaterThan(20);
    }
  });
});
