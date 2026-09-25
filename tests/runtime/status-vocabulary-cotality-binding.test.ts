/// <reference types="jest" />
/**
 * MARKET STATUS IS A COTALITY FACT. MALLAN DOES NOT GET TO SPELL IT DIFFERENTLY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROVIDER VOCABULARY (not asserted here — imported)
 *
 * `Property.StandardStatus` has exactly 11 members. This test does NOT hardcode
 * them; it imports `STANDARD_STATUS_MEMBERS` from lib/search/canonical/live-truth,
 * a projection of `data/cotality-enums.live.json` (pulled 2026-07-05 from
 * https://api.cotality.com/trestle/odata/$metadata) that is drift-bound to that
 * file by its own test. When Cotality changes, this test changes with it.
 *
 * The same 11 members, with per-value Lookup definitions and per-probe evidence,
 * are independently recorded in the compiled contract
 * `data/cotality-contract/contract.json` (capturedAt 2026-08-18T02:38:06.395Z,
 * exactOnly; Property.StandardStatus selectable + filterable VERIFIED_SUPPORTED,
 * filterable count 591,132). Two independent live captures agree.
 *
 * The provider's value is `Canceled` — ONE L. `standardValue: "Canceled"`,
 * `legacyODataValue: "Canceled"`, `resoStandard: true`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `Cancelled` (two Ls) is not a Cotality value. Mallan invented it, then wrote
 * two comments asserting the opposite of the truth:
 *
 *   lib/idx/trestle-mapper.ts   "canceled" (US English single-L)
 *                               -> "Cancelled" (RESO canonical double-L)
 *   lib/compliance/status.ts    // Common typo / alternate spelling
 *                               'Canceled': Status.CANCELLED
 *
 * The provider's real value is filed as a typo. The invented value is filed as
 * canonical.
 *
 * This is not cosmetic, because the two writers into `listings.status` disagree:
 *
 *   Cotality sync   lib/idx/trestle-mapper.ts:1031
 *                   `const status = String(raw.StandardStatus || ...)`
 *                   -> stores the RAW provider value: "Canceled"
 *
 *   CRM writes      normalizeStandardStatus(...) applies the alias
 *                   -> stores the invented value: "Cancelled"
 *
 * One column, both spellings, decided by which writer created the row. Every
 * exact-match predicate then sees half the population:
 *
 *   PROVEN MISS — app/api/cron/data-retention/route.ts:29 declares
 *   TERMINAL_STATUSES = [..., "Cancelled"] and uses it as `status: { in: [...] }`
 *   at lines 230 and 287. A Cotality-synced row stored as "Canceled" matches
 *   neither the T+30 media strip nor the T+180 archive. The rows the PROVIDER
 *   marked canceled are exactly the rows retention never reaches. (Retention and
 *   archival only — public display is NOT affected; see NOT CLAIMED below.)
 *
 *   PROVEN SPLIT — public/crm/js/dashboard/panels.js:798 counts
 *   `l.status === 'Canceled'` over GET /api/crm/listings. It sees Cotality-synced
 *   rows and misses every CRM-written one.
 *
 *   PROVEN WRONG VERDICT — lib/syndication/eligibility.ts:96 omits "Canceled", so
 *   a provider-canceled row is judged NON-terminal. (Syndication is held closed
 *   by MALLAN_OFFICE_MLS_IDS=[], so this is latent, not live.)
 *
 * NOT CLAIMED: this is not a public-display leak. Both live public read paths are
 * allow-lists — `buildSearchDisplayWhere` (ACTIVE_DISPLAY_VALUES) and
 * `filterDisplayableDbListings` (DISPLAYABLE_STATUSES) — so an unknown or
 * misspelled status fails closed. The one deny-list-shaped gate that WOULD fail
 * open, `PUBLIC_LISTING_GATE` in lib/compliance/public-listing-filter.ts, has zero
 * consumers: dead code and a trap for the next reader, not an exposure.
 *
 * That the split was already known and never rooted out: three separate files
 * already carry BOTH spellings defensively rather than fixing the cause —
 * public-listing-filter.ts:18-19, crm-idx-mapper.ts:148-149,
 * compliance/status.ts:61,77.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NO-BACKFILL INVARIANT
 *
 * Real rows already carry both spellings and NO production backfill is in scope.
 * So the invariant under test is not "everything says Canceled" — it is:
 *
 *      A "Canceled" row and a "Cancelled" row must reach the SAME decision
 *      at every gate, forever.
 *
 * New writes converge on the provider's spelling; every reader keeps accepting
 * the legacy one. Stale rows become harmless without being touched.
 */
import { STANDARD_STATUS_MEMBERS } from '@/lib/search/canonical/live-truth';
import {
  normalizeStandardStatus,
  TERMINAL_STATUSES,
  computeGateColumns,
} from '@/lib/idx/trestle-mapper';
import {
  normalizeStatus,
  isTerminalStatus,
  isActiveDisplayStatus,
} from '@/lib/compliance/status';
import { ARCHIVE_TERMINAL_STATUSES } from '@/lib/retention/archive-terminals';

/** Named so the intent of each case reads without counting Ls. */
const LEGACY_CANCELLED = 'Cancelled';
const PROVIDER_CANCELED = 'Canceled';

describe('the normalizer is bound to the live Cotality vocabulary', () => {
  it.each([...STANDARD_STATUS_MEMBERS])(
    '%s survives normalization unchanged',
    (member) => {
      // A provider value must never come back as something the provider does
      // not have. Today `Canceled` comes back as `Cancelled`.
      expect(normalizeStandardStatus(member)).toBe(member);
    },
  );

  it.each([...STANDARD_STATUS_MEMBERS])(
    '%s is recognised case-insensitively, not passed through raw',
    (member) => {
      // The fall-through branch returns the trimmed INPUT. For a status the
      // normalizer does not know, that puts a lowercase value in the column —
      // the "stealth audit anomaly" the function's own docstring warns about:
      // invisible to every exact-case counter.
      expect(normalizeStandardStatus(member.toLowerCase())).toBe(member);
    },
  );

  it('the legacy invented spelling converges forward', () => {
    expect(normalizeStandardStatus(LEGACY_CANCELLED)).toBe(PROVIDER_CANCELED);
    expect(normalizeStandardStatus('cancelled')).toBe(PROVIDER_CANCELED);
  });
});

describe('both spellings reach the same decision (the no-backfill invariant)', () => {
  const gatesFor = (status: string) =>
    computeGateColumns({
      status,
      internetEntireListingDisplayYN: null,
      internetAddressDisplayYN: null,
    });

  it('the display gate cannot tell them apart', () => {
    expect(gatesFor(PROVIDER_CANCELED)).toEqual(gatesFor(LEGACY_CANCELLED));
  });

  it('and blocks both', () => {
    expect(gatesFor(PROVIDER_CANCELED).idx_display_yn).toBe(false);
    expect(gatesFor(LEGACY_CANCELLED).idx_display_yn).toBe(false);
  });

  it.each([PROVIDER_CANCELED, LEGACY_CANCELLED])(
    'the trestle terminal set contains %s',
    (spelling) => {
      expect(TERMINAL_STATUSES.has(spelling)).toBe(true);
    },
  );

  it.each([PROVIDER_CANCELED, LEGACY_CANCELLED])(
    'the compliance terminal predicate accepts %s',
    (spelling) => {
      expect(isTerminalStatus(spelling)).toBe(true);
    },
  );

  it.each([PROVIDER_CANCELED, LEGACY_CANCELLED])(
    '%s is not publicly displayable',
    (spelling) => {
      expect(isActiveDisplayStatus(spelling)).toBe(false);
    },
  );

  it('the compliance normalizer folds both onto the provider spelling', () => {
    expect(normalizeStatus(PROVIDER_CANCELED)).toBe(PROVIDER_CANCELED);
    expect(normalizeStatus(LEGACY_CANCELLED)).toBe(PROVIDER_CANCELED);
  });
});

describe('retention reaches the rows the provider marked canceled', () => {
  // The proven miss. ARCHIVE_TERMINAL_STATUSES goes straight into a Prisma
  // `status: { in: [...] }`, so a spelling it lacks is a row it never sees —
  // no error, no log, just silence.
  it.each([PROVIDER_CANCELED, LEGACY_CANCELLED])(
    'the archive predicate includes %s',
    (spelling) => {
      expect([...ARCHIVE_TERMINAL_STATUSES]).toContain(spelling);
    },
  );
});

describe('off-market and past-its-life are different questions', () => {
  // TERMINAL_STATUSES is asked BOTH "may this display?" and "may this be
  // archived?". Hold is the status where those answers diverge: per Cotality it
  // means the listing "may be completely off market", but a contract still
  // exists and it is expected back. Archiving strips media from a listing that
  // is coming back.
  it('Hold is not publicly displayable', () => {
    expect(isActiveDisplayStatus('Hold')).toBe(false);
    expect(
      computeGateColumns({ status: 'Hold', internetEntireListingDisplayYN: null })
        .normalized_status,
    ).toBe('Hold');
  });

  it('Hold is NOT archivable — it is expected back on market', () => {
    expect([...ARCHIVE_TERMINAL_STATUSES]).not.toContain('Hold');
  });

  it('Incomplete is not publicly displayable and not archivable', () => {
    // Cotality: "has not yet been completely entered and is not yet published."
    expect(isActiveDisplayStatus('Incomplete')).toBe(false);
    expect([...ARCHIVE_TERMINAL_STATUSES]).not.toContain('Incomplete');
  });
});
