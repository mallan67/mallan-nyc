/// <reference types="jest" />
/**
 * THE ONE SHARED BROWSER STATUS PRESENTATION AUTHORITY (`public/crm/js/core/status-presentation.js`).
 *
 * Owner rulings (Maya, 2026-09-08 / 2026-09-09), enforced here against EXECUTED code, never source text:
 *   - a status is a live Cotality StandardStatus token — Active, ActiveUnderContract, Canceled (ONE L), Closed,
 *     ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn. The browser never invents a
 *     presentation vocabulary of its own ('ACTIVE', 'COMING_SOON', 'CANCELLED', 'OFF_MARKET', 'UNKNOWN');
 *   - broker language is a LABEL applied per TRANSACTION: a sale's Closed reads "Sold" and a rental's reads
 *     "Rented"; a sale's Pending reads "In Contract" and a rental's reads "Pending";
 *   - a blank / unresolvable status is "Status unavailable". It is NEVER defaulted to Active — defaulting
 *     advertises an off-market or unknown row as live inventory;
 *   - ActiveUnderContract and Pending are two distinct live members and must never be collapsed;
 *   - the helper's offline fallback vocabulary is RATCHETED to the server authority (the executor contract's
 *     `members.StandardStatus` + `statusChoices`, and lib/crm/status-mapping.ts `canonicalLabels`). If the
 *     server vocabulary moves and the browser copy does not, these tests fail.
 *
 * Every assertion below runs the REAL shipped function — the DTO mapper, the helper lifted from the shipped
 * `.js` and evaluated in a real DOM, `domDisplay` / `getStatusBadgeClasses` / `comingSoonBadge` /
 * `transformAPIListing` from their shipped files — and asserts on the RETURNED VALUE or the RENDERED DOM.
 * A source-text grep proves nothing here and is not used as evidence for any defect.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { searchContract } from '@/lib/search/engine/contract';
import { SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING } from '@/lib/crm/status-mapping';
import { MALLAN_TERMINAL_STATUSES } from '@/lib/listings/mallan-status';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const CONTRACT = searchContract();
const LIVE_TOKENS = CONTRACT.members.StandardStatus.map((m) => m.token);
const UNAVAILABLE = 'Status unavailable';

/** Lift ONE brace-matched declaration out of a shipped browser file (the precedent in crm-search-status-modes). */
function lift(source: string, needle: string): string {
  const start = source.indexOf(needle);
  if (start < 0) throw new Error(`not found in shipped source: ${needle}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`unbalanced braces after: ${needle}`);
}

const map = (raw: Record<string, unknown>) =>
  mapTrestleToCrmListing({ ListingId: 'X', InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true, ...raw }, 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The DOM the helper and its consumers actually run in.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let win: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MallanStatus: any;

beforeAll(() => {
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/crm/',
    runScripts: 'dangerously',
    virtualConsole,
  });
  win = dom.window;

  // THE helper, verbatim from the file the build inlines.
  win.eval(read('public/crm/js/core/status-presentation.js'));
  // Its two shipped consumers in this surface — both are pure top-level declarations.
  win.eval(read('public/crm/js/core/reso-field-map.js'));
  win.eval(read('public/crm/js/render/shared-badges.js'));
  // data-loader.js has top-level side effects (fetch / localStorage); lift the one function under test.
  win.eval(lift(read('public/crm/js/core/data-loader.js'), 'function transformAPIListing(') + ';');

  MallanStatus = win.MallanStatus;
});
afterAll(() => win?.close());

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. The offline fallback vocabulary IS the server vocabulary (the ratchet).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
describe('the browser fallback vocabulary is ratcheted to the server authority', () => {
  it('the token list equals the executor contract members.StandardStatus exactly', () => {
    expect([...MallanStatus._FALLBACK.tokens].sort()).toEqual([...LIVE_TOKENS].sort());
  });

  it('the per-transaction labels equal lib/crm/status-mapping canonicalLabels exactly', () => {
    expect({ ...MallanStatus._FALLBACK.labels.sale }).toEqual({ ...SALE_STATUS_MAPPING.canonicalLabels });
    expect({ ...MallanStatus._FALLBACK.labels.rental }).toEqual({ ...RENTAL_STATUS_MAPPING.canonicalLabels });
  });

  it('the off-market set is the terminal set plus the provider Hold — nothing hand-invented', () => {
    expect([...MallanStatus._FALLBACK.offMarket].sort()).toEqual([...MALLAN_TERMINAL_STATUSES, 'Hold'].sort());
  });

  it('the DOM clock partitions the off-market set: paused ∪ stopped = off-market, and they are disjoint', () => {
    const paused = MallanStatus._FALLBACK.clockPaused as string[];
    const stopped = MallanStatus._FALLBACK.clockStopped as string[];
    expect(paused.filter((t) => stopped.indexOf(t) !== -1)).toEqual([]);
    expect([...paused, ...stopped].sort()).toEqual([...MallanStatus._FALLBACK.offMarket].sort());
  });

  it('with the REAL served contract in the page, every label equals the contract label — and the offline value', () => {
    for (const transaction of ['sale', 'rental'] as const) {
      for (const choice of CONTRACT.statusChoices[transaction]) {
        if (choice.refine) continue; // Back On Market is a refinement of Active, not a status
        const listing = { status: choice.token, status_transaction: transaction === 'rental' ? 'rent' : 'sale' };
        win.SEARCH_CONTRACT = undefined;
        const offline = MallanStatus.label(listing);
        win.SEARCH_CONTRACT = JSON.parse(JSON.stringify(CONTRACT));
        const served = MallanStatus.label(listing);
        expect({ transaction, token: choice.token, offline, served })
          .toEqual({ transaction, token: choice.token, offline: choice.label, served: choice.label });
      }
    }
    win.SEARCH_CONTRACT = undefined;
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. The helper's own contract.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
describe('MallanStatus.token — the exact live token, or null; never an invention', () => {
  it.each(LIVE_TOKENS)('%s passes through verbatim', (t) => {
    expect(MallanStatus.token(t)).toBe(t);
    expect(MallanStatus.token({ status: t })).toBe(t);
  });

  it('the retired uppercase presentation words resolve back to their live token', () => {
    expect(MallanStatus.token('ACTIVE')).toBe('Active');
    expect(MallanStatus.token('COMING_SOON')).toBe('ComingSoon');
    expect(MallanStatus.token('PENDING')).toBe('Pending');
    expect(MallanStatus.token('CLOSED')).toBe('Closed');
    expect(MallanStatus.token('WITHDRAWN')).toBe('Withdrawn');
    expect(MallanStatus.token('EXPIRED')).toBe('Expired');
    expect(MallanStatus.token('HOLD')).toBe('Hold');
    expect(MallanStatus.token('DELETED')).toBe('Delete');
    expect(MallanStatus.token('ACTIVE_UNDER_CONTRACT')).toBe('ActiveUnderContract');
  });

  it('both Cancelled spellings resolve to the ONE live member Canceled', () => {
    expect(MallanStatus.token('Cancelled')).toBe('Canceled');
    expect(MallanStatus.token('CANCELLED')).toBe('Canceled');
    expect(MallanStatus.token('Canceled')).toBe('Canceled');
  });

  it('the legacy Mallan storage spellings resolve to their token', () => {
    expect(MallanStatus.token('Sold')).toBe('Closed');
    expect(MallanStatus.token('Rented')).toBe('Closed');
    expect(MallanStatus.token('Leased')).toBe('Closed');
    expect(MallanStatus.token('Draft')).toBe('Incomplete');
  });

  it('a sentinel or presence word is NOT a status — it is null, never Active', () => {
    for (const notAStatus of ['UNKNOWN', 'OFF_MARKET', 'Off Market', 'OFF MARKET', 'DELISTED', 'SomeFutureEnum', '', '   ']) {
      expect({ input: notAStatus, token: MallanStatus.token(notAStatus) }).toEqual({ input: notAStatus, token: null });
    }
    expect(MallanStatus.token(null)).toBeNull();
    expect(MallanStatus.token(undefined)).toBeNull();
    expect(MallanStatus.token({})).toBeNull();
  });
});

describe('MallanStatus.label — transaction-aware broker language, fail-closed', () => {
  const sale = (status: unknown) => ({ status, status_transaction: 'sale' });
  const rent = (status: unknown) => ({ status, status_transaction: 'rent' });

  it('a sale Closed reads Sold and a rental Closed reads Rented', () => {
    expect(MallanStatus.label(sale('Closed'))).toBe('Sold');
    expect(MallanStatus.label(rent('Closed'))).toBe('Rented');
  });

  it('a sale Pending reads In Contract and a rental Pending reads Pending', () => {
    expect(MallanStatus.label(sale('Pending'))).toBe('In Contract');
    expect(MallanStatus.label(rent('Pending'))).toBe('Pending');
  });

  it('ActiveUnderContract is its OWN state — never collapsed into Pending', () => {
    expect(MallanStatus.token(sale('ActiveUnderContract'))).toBe('ActiveUnderContract');
    expect(MallanStatus.label(sale('ActiveUnderContract'))).toBe('Active Under Contract');
    expect(MallanStatus.label(sale('ActiveUnderContract'))).not.toBe(MallanStatus.label(sale('Pending')));
  });

  it('a status-less row reads "Status unavailable" — never Active', () => {
    for (const row of [{}, { status: null }, { status: '' }, { status: 'UNKNOWN' }, { status: 'OFF_MARKET' }]) {
      const label = MallanStatus.label(row);
      expect({ row, label }).toEqual({ row, label: UNAVAILABLE });
      expect(label).not.toMatch(/Active/i);
    }
  });

  it('a token outside this transaction\'s canonical set is not relabelled into the other transaction\'s language', () => {
    // ComingSoon is sales-only (UCBA Art. I §16); the rental mapping has no such canonical status.
    expect(MallanStatus.label(sale('ComingSoon'))).toBe('Coming Soon');
    expect(MallanStatus.label(rent('ComingSoon'))).toBe(UNAVAILABLE);
  });

  it('NO label the helper can produce carries the banned two-L Cancelled', () => {
    for (const transaction of ['sale', 'rent'] as const) {
      for (const token of [...LIVE_TOKENS, 'Cancelled', 'CANCELLED']) {
        expect(MallanStatus.label({ status: token, status_transaction: transaction })).not.toMatch(/Cancelled/);
      }
    }
  });

  it('a server-supplied status_label (the lib/compliance/dto projection) wins over the derived one', () => {
    expect(MallanStatus.label({ status: 'Active', status_transaction: 'sale', status_label: 'Off Market — reason unknown' }))
      .toBe('Off Market — reason unknown');
  });

  it('the transaction is read from listingCategory when status_transaction is absent (the legacy DTO shape)', () => {
    expect(MallanStatus.label({ status: 'Closed', listingCategory: 'rental' })).toBe('Rented');
    expect(MallanStatus.label({ status: 'Closed' })).toBe('Sold');
  });
});

describe('MallanStatus.isOffMarket / isComingSoon / domClock', () => {
  it('the REBNY off-market photo restriction fires on Canceled in BOTH spellings', () => {
    expect(MallanStatus.isOffMarket({ status: 'Canceled' })).toBe(true);
    expect(MallanStatus.isOffMarket({ status: 'CANCELLED' })).toBe(true);
    expect(MallanStatus.isOffMarket({ status: 'Cancelled' })).toBe(true);
  });

  it('every off-market token is off market and every marketable token is not', () => {
    for (const t of ['Closed', 'Withdrawn', 'Hold', 'Canceled', 'Expired', 'Delete']) {
      expect({ t, off: MallanStatus.isOffMarket({ status: t }) }).toEqual({ t, off: true });
    }
    for (const t of ['Active', 'ActiveUnderContract', 'Pending', 'ComingSoon', 'Incomplete']) {
      expect({ t, off: MallanStatus.isOffMarket({ status: t }) }).toEqual({ t, off: false });
    }
    // an unknown status is not asserted to be on market
    expect(MallanStatus.isOffMarket({ status: 'UNKNOWN' })).toBe(false);
  });

  it('isComingSoon is the token, and still fires on a rental (a showing restriction never fails open)', () => {
    expect(MallanStatus.isComingSoon({ status: 'ComingSoon' })).toBe(true);
    expect(MallanStatus.isComingSoon({ status: 'COMING_SOON' })).toBe(true);
    expect(MallanStatus.isComingSoon({ status: 'ComingSoon', status_transaction: 'rent' })).toBe(true);
    expect(MallanStatus.isComingSoon({ status: 'Active' })).toBe(false);
  });

  it('the DOM clock stops on Closed / Canceled / Expired / Delete and pauses on Hold / Withdrawn', () => {
    const clock = (status: string) => MallanStatus.domClock({ status: status });
    expect(clock('Closed')).toBe('stopped');
    expect(clock('Canceled')).toBe('stopped');
    expect(clock('CANCELLED')).toBe('stopped');
    expect(clock('Expired')).toBe('stopped');
    expect(clock('Delete')).toBe('stopped');
    expect(clock('Hold')).toBe('paused');
    expect(clock('Withdrawn')).toBe('paused');
    expect(clock('ComingSoon')).toBe('exempt');
    expect(clock('Active')).toBe('accruing');
    expect(MallanStatus.domClock({ status: 'Active', permissions: { participantOnly: true } })).toBe('exempt');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. The server DTO mapper — the origin of the browser's status vocabulary.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
describe('lib/search/crm-idx-mapper ships the live token plus a per-transaction label', () => {
  it('Canceled stays the ONE-L live member — the browser never receives CANCELLED', () => {
    expect(map({ StandardStatus: 'Canceled', PropertyType: 'Residential' }).status).toBe('Canceled');
    expect(map({ StandardStatus: 'Canceled', PropertyType: 'Residential' }).status).not.toBe('CANCELLED');
  });

  it('ActiveUnderContract is NOT collapsed into Pending', () => {
    expect(map({ StandardStatus: 'ActiveUnderContract', PropertyType: 'Residential' }).status).toBe('ActiveUnderContract');
    expect(map({ StandardStatus: 'ActiveUnderContract', PropertyType: 'Residential' }).status)
      .not.toBe(map({ StandardStatus: 'Pending', PropertyType: 'Residential' }).status);
  });

  it('every live member round-trips verbatim, on both transactions', () => {
    for (const token of LIVE_TOKENS) {
      for (const PropertyType of ['Residential', 'ResidentialLease']) {
        expect({ token, PropertyType, got: map({ StandardStatus: token, PropertyType }).status })
          .toEqual({ token, PropertyType, got: token });
      }
    }
  });

  it('status_label is the transaction\'s broker language', () => {
    expect(map({ StandardStatus: 'Closed', PropertyType: 'Residential' }).status_label).toBe('Sold');
    expect(map({ StandardStatus: 'Closed', PropertyType: 'ResidentialLease' }).status_label).toBe('Rented');
    expect(map({ StandardStatus: 'Pending', PropertyType: 'Residential' }).status_label).toBe('In Contract');
    expect(map({ StandardStatus: 'Pending', PropertyType: 'ResidentialLease' }).status_label).toBe('Pending');
    expect(map({ StandardStatus: 'ComingSoon', PropertyType: 'Residential' }).status_label).toBe('Coming Soon');
  });

  it('status_transaction is emitted and agrees with listingCategory', () => {
    const s = map({ StandardStatus: 'Active', PropertyType: 'Residential' });
    const r = map({ StandardStatus: 'Active', PropertyType: 'ResidentialLease' });
    expect(s.status_transaction).toBe('sale');
    expect(s.listingCategory).toBeUndefined();
    expect(r.status_transaction).toBe('rent');
    expect(r.listingCategory).toBe('rental');
  });

  it('a row with no status carries null and "Status unavailable" — never ACTIVE', () => {
    const l = map({ PropertyType: 'Residential' });
    expect(l.status).toBeNull();
    expect(l.status_label).toBe(UNAVAILABLE);
  });

  it('a sentinel / unmapped provider value is null, never a fabricated token and never raw uppercase text', () => {
    for (const junk of ['SomeFutureStatusEnum', 'Off Market', 'Off-Market', 'OffMarket', 'off market', 'DELISTED']) {
      const l = map({ MlsStatus: junk, PropertyType: 'Residential' });
      expect({ junk, status: l.status, label: l.status_label })
        .toEqual({ junk, status: null, label: UNAVAILABLE });
    }
  });

  it('every status the mapper can emit is a live contract member, or null', () => {
    const inputs = [...LIVE_TOKENS, 'Cancelled', 'Sold', 'Rented', 'Leased', 'Draft', 'Coming Soon',
      'Active Under Contract', 'ACTIVE', 'CLOSED', 'Off Market', 'garbage', ''];
    for (const input of inputs) {
      for (const PropertyType of ['Residential', 'ResidentialLease']) {
        const got = map({ StandardStatus: input, PropertyType }).status;
        expect({ input, PropertyType, ok: got === null || LIVE_TOKENS.indexOf(got as string) !== -1 })
          .toEqual({ input, PropertyType, ok: true });
      }
    }
  });

  it('comingSoonDate still populates off the live ComingSoon token (UCBA Art. I §16(C))', () => {
    const l = map({ StandardStatus: 'ComingSoon', PropertyType: 'Residential', ActivationDate: '2026-06-15T00:00:00Z' });
    expect(l.status).toBe('ComingSoon');
    expect(l.comingSoonDate).toBe('2026-06-15');
    expect(map({ StandardStatus: 'Active', PropertyType: 'Residential', ActivationDate: '2026-06-15T00:00:00Z' }).comingSoonDate).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════
// 4. The shipped browser consumers, executed end-to-end on rows the REAL mapper produced.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════
describe('the shipped display sites read the helper, on rows the real mapper produced', () => {
  const row = (StandardStatus: string, PropertyType = 'Residential', extra: Record<string, unknown> = {}): Record<string, unknown> =>
    ({ ...map({ StandardStatus, PropertyType, ...extra }), dom: 97 });

  it('domDisplay stops the clock on a Canceled / Expired / Delete row and pauses it on Hold / Withdrawn', () => {
    const cases: Array<[string, string, string]> = [
      ['Canceled', 'stopped', '(final)'],
      ['Closed', 'stopped', '(final)'],
      ['Expired', 'stopped', '(final)'],
      ['Delete', 'stopped', '(final)'],
      ['Hold', 'paused', '(paused)'],
      ['Withdrawn', 'paused', '(paused)'],
    ];
    for (const [token, clock, text] of cases) {
      const html = win.domDisplay(row(token));
      expect({ token, hasClock: html.indexOf('data-dom-status="' + clock + '"') !== -1, hasText: html.indexOf(text) !== -1 })
        .toEqual({ token, hasClock: true, hasText: true });
    }
    expect(win.domDisplay(row('Active'))).toContain('data-dom-status="accruing"');
    expect(win.domDisplay(row('ComingSoon'))).toContain('data-dom-status="exempt"');
  });

  it('domDisplay and the helper cannot disagree — one authority, every live token', () => {
    for (const token of LIVE_TOKENS) {
      const l = row(token);
      const html = win.domDisplay(l);
      expect({ token, html: html.indexOf('data-dom-status="' + MallanStatus.domClock(l) + '"') !== -1 })
        .toEqual({ token, html: true });
    }
  });

  it('getStatusBadgeClasses is the helper — including on Canceled, which used to fall to the grey default', () => {
    const unknown = MallanStatus.classes({});
    for (const token of LIVE_TOKENS) {
      const l = row(token);
      expect({ token, classes: win.getStatusBadgeClasses(l.status) }).toEqual({ token, classes: MallanStatus.classes(l) });
    }
    expect(win.getStatusBadgeClasses(row('Canceled').status)).not.toBe(unknown);
    expect(win.getStatusBadgeClasses(row('Expired').status)).not.toBe(unknown);
    expect(win.getStatusBadgeClasses(row('Hold').status)).not.toBe(unknown);
  });

  it('the Coming Soon badge fires exactly when the helper says the row is Coming Soon', () => {
    for (const token of LIVE_TOKENS) {
      const l = row(token);
      expect({ token, badge: win.comingSoonBadge(l) !== '' }).toEqual({ token, badge: MallanStatus.isComingSoon(l) });
      expect({ token, notice: win.comingSoonShowingNotice(l) !== '' }).toEqual({ token, notice: MallanStatus.isComingSoon(l) });
    }
  });

  it('transformAPIListing carries the live token and its label — and never fabricates ACTIVE', () => {
    const active = win.transformAPIListing({ id: '1', status: 'Active', listing_type: 'sale' }, 0);
    expect(active.status).toBe('Active');
    expect(active.status_label).toBe('Active');

    const closedRental = win.transformAPIListing({ id: '2', status: 'Closed', listing_type: 'rent' }, 1);
    expect(closedRental.status).toBe('Closed');
    expect(closedRental.status_label).toBe('Rented');
    expect(closedRental.status_transaction).toBe('rent');

    const canceled = win.transformAPIListing({ id: '3', status: 'Cancelled', listing_type: 'sale' }, 2);
    expect(canceled.status).toBe('Canceled');
    expect(canceled.status_label).toBe('Canceled');

    const blank = win.transformAPIListing({ id: '4' }, 3);
    expect(blank.status).toBeNull();
    expect(blank.status_label).toBe(UNAVAILABLE);
    expect(blank.status).not.toBe('ACTIVE');
  });

  it('nothing in this surface mutates the row it was handed', () => {
    const l = row('Canceled');
    const before = JSON.stringify(l);
    win.domDisplay(l);
    win.getStatusBadgeClasses(l.status);
    win.comingSoonBadge(l);
    MallanStatus.label(l);
    MallanStatus.classes(l);
    MallanStatus.isOffMarket(l);
    expect(JSON.stringify(l)).toBe(before);
  });
});
