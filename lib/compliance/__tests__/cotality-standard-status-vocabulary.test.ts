/// <reference types="jest" />
/**
 * COTALITY StandardStatus VOCABULARY — the provider is the only authority.
 *
 * ── LIVE EVIDENCE (this repo may not be cited for any of it) ────────────────
 * Probed read-only against `api.cotality.com/trestle` on 2026-08-19 with
 * client-credentials auth. Raw bodies + sha256 in
 * `.cache/cotality-authority-m2/raw/`, index in
 * `.cache/cotality-authority-m2/PROBE-STATUS.json`.
 *
 *   GET /odata/Property/$count?$filter=StandardStatus eq '<X>'
 *
 *   HTTP 200 (SUPPORTED — X is a real enumeration member), with @odata.count:
 *     Active 8,103 · ActiveUnderContract 0 · Canceled 0 · Closed 577,073 ·
 *     ComingSoon 1 · Delete 0 · Expired 0 · Hold 0 · Incomplete 0 ·
 *     Pending 6,029 · Withdrawn 0
 *
 *   HTTP 400 (PROVIDER_REJECTED — "The string '<X>' is not a valid enumeration
 *   type constant"):
 *     Cancelled · Sold · Rented · Leased · TemporarilyOffMarket · OwnerOptOut ·
 *     Draft
 *
 *   GET /odata/$metadata (HTTP 200, 1,946,777 bytes,
 *   sha256 1984a8adbcc31d9aad49e203a8da0521dde4d0e5d69b844525470fff7e2ae105)
 *   declares EnumType StandardStatus with exactly those 11 members and no
 *   others. $metadata is used here ONLY to prove the candidate list is CLOSED
 *   (that no 12th member went unprobed); membership itself is proven by the
 *   per-value probe above, never by the schema declaration.
 *
 * SUPPORTED / PROVIDER_REJECTED / UNVERIFIED are three distinct states and are
 * never collapsed. Nothing below is inferred from a repo constant.
 *
 * ── WHAT THIS TEST ENFORCES ────────────────────────────────────────────────
 * 1. Every live-valid member is HANDLED — it round-trips through
 *    `normalizeStandardStatus` unchanged (the writer never rewrites a provider
 *    value into a string the provider rejects with HTTP 400), and
 * 2. every live-valid member gets a DEFENSIBLE `idx_display_yn` from the single
 *    gate helper, and
 * 3. the status the mapper actually STORES for a member the provider calls
 *    off-market is matched by the data-retention cron's exact-case terminal
 *    predicate — otherwise the row is invisible to the REBNY RLS §2.05 removal,
 *    to the T+30d media-null, and to the T+180 archive, and its media/JSON is
 *    retained forever.
 *
 * It is written to FAIL if a live-valid StandardStatus member is unhandled.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyStandardStatus,
  computeGateColumns,
  LIVE_PROVIDER_STANDARD_STATUSES,
  mapTrestleToPrisma,
  normalizeStandardStatus,
  NON_DISPLAYABLE_STATUSES,
  TERMINAL_STATUSES,
} from '@/lib/idx/trestle-mapper';

/**
 * The 11 members proven SUPPORTED (HTTP 200) by the 2026-08-19 live probe.
 *
 * STATUS-SPELLING-EXEMPT: provider vocabulary. Only strings the provider accepts
 * belong here.
 */
const LIVE_VALID_MEMBERS = [
  'Active',
  'ActiveUnderContract',
  'Canceled',
  'Closed',
  'ComingSoon',
  'Delete',
  'Expired',
  'Hold',
  'Incomplete',
  'Pending',
  'Withdrawn',
] as const;

/**
 * Strings the live provider REJECTED with HTTP 400 — Mallan-internal only.
 *
 * STATUS-SPELLING-EXEMPT: the REJECTED vocabulary. Adding the accepted spelling
 * `Canceled` here would invert the fact this list records.
 */
const PROVIDER_REJECTED = [
  'Cancelled',
  'Sold',
  'Rented',
  'Leased',
  'TemporarilyOffMarket',
  'OwnerOptOut',
  'Draft',
] as const;

/**
 * Provider members that must NEVER be publicly displayed.
 *
 * Sources, all inside this repo and all consistent:
 *   - `lib/compliance/rebny-field-tables.ts:1175`
 *     `suppressFromPublicSearch: ['Hold', 'Incomplete', 'Withdrawn', 'Canceled']`
 *   - `lib/compliance/rebny-field-tables.ts:1174`
 *     `hideWhenMlsStatus: ['Closed', 'Expired']`
 *   - `lib/scanner/trestle-off-market-filter.ts:17` — Expired / Withdrawn /
 *     Canceled / Hold "MAY NOT be displayed publicly"
 *   - `lib/search/canonical/status.ts:35` — Withdrawn/Canceled/Expired/Hold are
 *     off_market
 *   - `Delete` is the provider's tombstone member; a deleted record can never be
 *     a displayable one.
 */
// STATUS-SPELLING-EXEMPT: provider-member subset (which LIVE members must not
// display). Mallan-only spellings are covered by TERMINAL_STATUSES instead.
const MUST_NOT_DISPLAY = [
  'Canceled',
  'Closed',
  'Delete',
  'Expired',
  'Hold',
  'Incomplete',
  'Withdrawn',
] as const;

/** Provider members that ARE publicly displayable today (behaviour preserved). */
const MAY_DISPLAY = ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending'] as const;

const REQUIRED_MIN_FIELDS: Record<string, unknown> = {
  ListingId: 'RLS20000001',
  ListingKey: 'RLS20000001',
  PropertyType: 'Residential',
  ListPrice: 1000000,
  StreetName: '57th',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10019',
  ListAgentMlsId: '74001',
  ListOfficeName: 'Compass',
  ModificationTimestamp: '2026-05-13T09:00:00Z',
};

/** The exact-case terminal predicate the data-retention cron runs, read from source. */
function retentionTerminalStatuses(): string[] {
  const src = readFileSync(
    join(__dirname, '../../../app/api/cron/data-retention/route.ts'),
    'utf8',
  );
  const m = src.match(/const\s+TERMINAL_STATUSES\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('data-retention TERMINAL_STATUSES literal not found');
  return (m[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''));
}

describe('vocabulary closure — the 11 live-valid StandardStatus members', () => {
  it('the two classification lists partition the live vocabulary exactly', () => {
    const partition = [...MUST_NOT_DISPLAY, ...MAY_DISPLAY].sort();
    expect(partition).toEqual([...LIVE_VALID_MEMBERS].sort());
  });

  it("the repo's declared provider vocabulary matches what the live probe proved", () => {
    // Guards against the constant drifting away from the evidence in its own
    // docblock. If Cotality adds a 12th member, RE-PROBE — do not edit either
    // list from memory.
    expect([...LIVE_PROVIDER_STANDARD_STATUSES].sort()).toEqual([...LIVE_VALID_MEMBERS].sort());
  });

  it.each(LIVE_VALID_MEMBERS)(
    'NO live-valid member is unhandled — %s classifies into a modelled set',
    (member) => {
      // THE UNHANDLED-MEMBER GUARD. Before 2026-08-19, Hold and Delete landed
      // here as 'unclassified' and therefore FAILED OPEN in computeGateColumns.
      expect(classifyStandardStatus(member)).not.toBe('unclassified');
    },
  );

  it('a status outside every modelled set is reported as unclassified, not silently absorbed', () => {
    // Negative control for the guard above: it must be able to detect an
    // unhandled value, otherwise it proves nothing.
    expect(classifyStandardStatus('NotAStatusThatExists')).toBe('unclassified');
  });

  it('terminal and non-displayable are DISJOINT — they answer different questions', () => {
    for (const s of NON_DISPLAYABLE_STATUSES) {
      // Hold/Incomplete/Delete block DISPLAY. They must not become terminal:
      // `terminal_since`, the T+180 archive clock and the UCBA DOM rules all
      // key off terminality and none of them means "temporarily off market".
      expect(TERMINAL_STATUSES.has(s)).toBe(false);
    }
  });

  it.each(LIVE_VALID_MEMBERS)(
    "%s survives normalization VERBATIM (a provider value is never rewritten into one the provider 400s)",
    (member) => {
      expect(normalizeStandardStatus(member)).toBe(member);
    },
  );
});

describe('display gate — every live-valid member gets a defensible idx_display_yn', () => {
  it.each(MUST_NOT_DISPLAY)(
    "%s → idx_display_yn=false even with every other gate wide open",
    (member) => {
      const result = computeGateColumns({
        status: member,
        internetEntireListingDisplayYN: true,
        internetAddressDisplayYN: true,
        internetAutomatedValuationDisplayYN: true,
        internetConsumerCommentYN: true,
        participantOnly: false,
        ownerOptOut: false,
      });
      expect(result.idx_display_yn).toBe(false);
    },
  );

  it.each(MAY_DISPLAY)("%s → idx_display_yn=true (behaviour preserved)", (member) => {
    const result = computeGateColumns({
      status: member,
      internetEntireListingDisplayYN: true,
      internetAddressDisplayYN: true,
      participantOnly: false,
      ownerOptOut: false,
    });
    expect(result.idx_display_yn).toBe(true);
  });
});

describe('retention reachability — what the mapper STORES must be what the cron MATCHES', () => {
  // STATUS-SPELLING-EXEMPT: the PROVIDER members that are terminal. Each is fed
  // through `mapTrestleToPrisma` as a RAW PROVIDER PAYLOAD, so only strings the
  // provider can actually send belong here — `Cancelled` is a payload the feed
  // cannot produce (HTTP 400 at the provider). The CRM-spelling side of the same
  // question is covered behaviourally in
  // `listing-status-spelling-closure.test.ts` Part A.
  const RETENTION_SCOPED = ['Canceled', 'Closed', 'Expired', 'Withdrawn'] as const;

  it.each(RETENTION_SCOPED)(
    "a provider row with StandardStatus=%s is stored as a value the data-retention terminal predicate matches",
    (member) => {
      const mapped = mapTrestleToPrisma({ ...REQUIRED_MIN_FIELDS, StandardStatus: member });
      // The mapper stores the provider's verbatim spelling (provenance).
      expect(mapped.status).toBe(member);
      // ...and the cron's exact-case `status: { in: [...] }` must see it.
      expect(retentionTerminalStatuses()).toContain(mapped.status);
      // ...as must the shared writer-side set.
      expect(TERMINAL_STATUSES.has(mapped.status)).toBe(true);
    },
  );
});

describe('negative — provider-rejected strings are Mallan-internal, never provider values', () => {
  it.each(PROVIDER_REJECTED)(
    "%s is NOT a live StandardStatus member and must not be listed as one",
    (s) => {
      expect(LIVE_VALID_MEMBERS as readonly string[]).not.toContain(s);
    },
  );

  it("the Mallan-internal 'Cancelled' and the provider's 'Canceled' are BOTH terminal", () => {
    // 'Cancelled' is a legitimate Mallan-internal canonical value (CRM vocabulary,
    // lib/crm/status-mapping.ts). It is NOT a provider value. Both spellings must
    // be terminal so neither can slip past a display or retention gate.
    expect(TERMINAL_STATUSES.has('Cancelled')).toBe(true);
    expect(TERMINAL_STATUSES.has('Canceled')).toBe(true);
  });
});
