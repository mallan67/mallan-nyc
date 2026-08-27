/// <reference types="jest" />
/**
 * THE PROVIDER COLUMN HOLDS THE PROVIDER FACT. THE BUSINESS WORD IS DERIVED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A2 — THE STORAGE CONFLICT, TRACED
 *
 * `listings.status` is declared `// RESO StandardStatus` and holds Cotality
 * market facts on synced rows. Mallan code also wrote its OWN words into it:
 *
 *   `Sold` / `Rented` / `Leased`  ← the status route, on Pending → Sold|Rented
 *   `Draft`                        ← both create paths (CRM listings + convert)
 *   `Cancelled`                    ← the invented spelling (already corrected)
 *
 * None is a Cotality `Property.StandardStatus` member. The live-verified set is
 * exactly: Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete,
 * Expired, Hold, Incomplete, Pending, Withdrawn.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS TRUTHFULLY FIXABLE WITHOUT SCHEMA
 *
 * Sold/Rented/Leased were a PRESENTATION need answered by falsifying a PROVIDER
 * fact. A broker says "sold" about a sale and "rented" about a rental; Cotality
 * has one value for both — `Closed`. The label is a function of the market
 * status AND the listing type, so deriving it costs nothing.
 *
 * New writes now persist `Closed` and derive the word. The API vocabulary is
 * unchanged — the request still says Sold/Rented and every gate still keys on
 * it — so nothing a broker does changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT NEEDED SCHEMA — RESOLVED 2026-08-27
 *
 * `Draft` has no Cotality equivalent. `Incomplete` is a statement about a
 * COTALITY record that has not been finished in the MLS; a Mallan-local listing
 * is not a Cotality record at all, and substituting it is precisely the guess
 * the directive forbids.
 *
 * `Listing.status` was `String NOT NULL` defaulting to `Active`, so an
 * unpublished local listing had to hold SOME string, and every available option
 * was a false provider claim. Maya authorized the minimal schema correction: the
 * column is now nullable with no default, NULL means "this listing has no market
 * status yet", and both create paths write it. Mallan publication state lives in
 * `Listing.compliance.mallan_publication`.
 *
 * Nothing writes `Draft` into the column any more. The last describe block below
 * still pins the sentinel boundary, because REAL ROWS created before that change
 * still carry it and no production backfill is authorized — a stored `Draft` and
 * a NULL must reach the same decision at every gate, forever. The behavioural
 * proof of the new state lives in
 * `tests/runtime/market-status-is-nullable.test.ts`.
 */
import {
  marketStatusLabel,
  marketStatusForBusinessOutcome,
  isMallanLocalSentinelStatus,
  hasNoMarketStatus,
} from '@/lib/crm/market-status-label';
import { STANDARD_STATUS_MEMBERS } from '@/lib/search/canonical/live-truth';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

describe('one provider fact, two business words', () => {
  it('a closed SALE reads "Sold"', () => {
    expect(marketStatusLabel('Closed', 'sale')).toBe('Sold');
  });

  it('a closed RENTAL reads "Rented"', () => {
    expect(marketStatusLabel('Closed', 'rent')).toBe('Rented');
  });

  it('the listing type is what makes the difference', () => {
    // The single reason this helper exists, and the reason the three older
    // display helpers could not do the job: none of them takes a listing type.
    expect(marketStatusLabel('Closed', 'sale')).not.toBe(
      marketStatusLabel('Closed', 'rent'),
    );
  });

  it('an unknown listing type falls back to the sale wording, never throws', () => {
    expect(marketStatusLabel('Closed', null)).toBe('Sold');
    expect(marketStatusLabel('Closed', 'commercial')).toBe('Sold');
  });
});

describe('every live Cotality status has a label', () => {
  it.each([...STANDARD_STATUS_MEMBERS])('%s', (member) => {
    // Imported from the drift-bound live-truth projection rather than hardcoded,
    // so this tracks the provider rather than a snapshot of it.
    const label = marketStatusLabel(member, 'sale');
    expect(label).toBeTruthy();
    expect(label).not.toBe('');
  });
});

describe('legacy values stay readable — no backfill is authorized', () => {
  it.each([
    ['Sold', 'sale', 'Sold'],
    ['Rented', 'rent', 'Rented'],
    ['Leased', 'rent', 'Leased'],
    ['Cancelled', 'sale', 'Canceled'],
    ['Draft', 'sale', 'Draft'],
  ])('a stored %s still labels correctly', (stored, kind, expected) => {
    expect(marketStatusLabel(stored, kind)).toBe(expected);
  });

  it('an unrecognised value passes through rather than vanishing', () => {
    // Silently blanking an unknown status would hide a data problem.
    expect(marketStatusLabel('SomethingNew', 'sale')).toBe('SomethingNew');
  });
});

describe('new writes persist the provider fact', () => {
  it.each(['Sold', 'Rented', 'Leased'])('%s persists as Closed', (requested) => {
    expect(marketStatusForBusinessOutcome(requested)).toBe('Closed');
  });

  it.each([...STANDARD_STATUS_MEMBERS])('%s passes through untouched', (member) => {
    expect(marketStatusForBusinessOutcome(member)).toBe(member);
  });

  it('the status route uses it, and stores the result', () => {
    const src = read('app/api/crm/listings/[id]/status/route.ts');
    expect(src).toMatch(/marketStatusForBusinessOutcome\(newStatus\)/);
    expect(src).toMatch(/status: persistedStatus,/);
  });

  it('and the API still ACCEPTS the broker vocabulary', () => {
    // Changing what a broker may say would be a different, unwanted change. The
    // transition table and both terminal gates still key on the request.
    const src = read('app/api/crm/listings/[id]/status/route.ts');
    expect(src).toMatch(/Sold: \[\], \/\/ Terminal/);
    expect(src).toMatch(/newStatus === "Sold" \|\| newStatus === "Rented"/);
  });

  it('the response reports the stored fact AND the derived label', () => {
    const src = read('app/api/crm/listings/[id]/status/route.ts');
    expect(src).toMatch(/status: persistedStatus,/);
    expect(src).toMatch(/statusLabel: marketStatusLabel\(persistedStatus, listing\.listing_type\)/);
  });

  it('public-URL eligibility is judged on the STORED value', () => {
    // Judging it on "Sold" would ask a display set that contains no such member.
    const src = read('app/api/crm/listings/[id]/status/route.ts');
    const urlsIdx = src.indexOf('const urls = buildListingUrls({');
    expect(urlsIdx).toBeGreaterThan(-1);
    expect(src.slice(urlsIdx, urlsIdx + 400)).toMatch(/status: persistedStatus/);
  });
});

describe('the legacy Draft sentinel still on real rows stays fenced', () => {
  it('it is recognised as one', () => {
    expect(isMallanLocalSentinelStatus('Draft')).toBe(true);
    expect(isMallanLocalSentinelStatus('Active')).toBe(false);
    expect(isMallanLocalSentinelStatus('Incomplete')).toBe(false);
  });

  it('it is NOT a Cotality value, and is not treated as one', () => {
    expect(STANDARD_STATUS_MEMBERS as readonly string[]).not.toContain('Draft');
  });

  it('nothing substitutes Cotality Incomplete for it', () => {
    // The explicit guess the directive forbids. `Incomplete` describes a
    // Cotality record that was never finished in the MLS; a Mallan-local
    // listing is not a Cotality record.
    for (const rel of [
      'app/api/crm/listings/route.ts',
      'app/api/crm/convert/route.ts',
      'app/api/crm/listings/[id]/status/route.ts',
    ]) {
      const code = read(rel)
        .split('\n')
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
      expect(code).not.toMatch(/["']Incomplete["']/);
    }
  });

  it('NOTHING writes it any more — both create paths store no market status', () => {
    // It used to be written by both create paths as the initial status. Since
    // the authorized schema correction they write NULL, which is what "this
    // listing has no market status yet" actually means. A provider-sourced row
    // could never acquire the sentinel either, because neither create path
    // accepts a caller-supplied mls_id (PROVIDER_IDENTITY_NOT_ASSIGNABLE) and
    // the sync writes raw provider values.
    const listings = read('app/api/crm/listings/route.ts');
    expect(listings).toMatch(/const STATUS_INITIAL: string \| null = null;/);
    const convert = read('app/api/crm/convert/route.ts');
    expect(convert).toMatch(/const convertInitialStatus: string \| null = null;/);
  });

  it('but a stored Draft is still readable and still labelled', () => {
    // No production backfill is authorized, so the rows exist. The whole point
    // of keeping the sentinel fenced rather than rewriting it.
    expect(marketStatusLabel('Draft', 'sale')).toBe('Draft');
    expect(isMallanLocalSentinelStatus('Draft')).toBe(true);
  });

  it('and NULL and the legacy Draft answer the same question the same way', () => {
    // The no-backfill invariant in one assertion: a row created today and a row
    // created before the migration are in the SAME state, so no gate may treat
    // them differently.
    expect(hasNoMarketStatus(null)).toBe(true);
    expect(hasNoMarketStatus('Draft')).toBe(true);
    expect(hasNoMarketStatus('')).toBe(true);
    expect(hasNoMarketStatus('Active')).toBe(false);
    expect(hasNoMarketStatus('Closed')).toBe(false);
  });

  it('it is never sent to Cotality in any request', () => {
    // The boundary that makes keeping it truthful: it is a Mallan word, and it
    // must never appear in an OData filter, which would assert it to the
    // provider as one of theirs.
    const offenders: string[] = [];
    for (const rel of [
      'lib/idx/fetch.ts',
      'lib/search/crm-idx-filter.ts',
      'lib/search/public-listing-trestle.ts',
      'lib/comps/fetch-comps.ts',
      'lib/market-report/generator.ts',
      'lib/open-houses/upcoming-open-houses.ts',
    ]) {
      if (/StandardStatus eq '?Draft/.test(read(rel))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it('and it is not publicly displayable', () => {
    // Every public read path is an allow-list of Active | ComingSoon |
    // ActiveUnderContract, so the sentinel fails closed by construction.
    const dto = read('lib/idx/db-to-public-dto.ts');
    expect(dto).toMatch(
      /DISPLAYABLE_STATUSES = \['Active', 'ComingSoon', 'ActiveUnderContract'\]/,
    );
  });

  it('the real pre-publication state lives in the publication namespace', () => {
    // Which is why the column does not need to carry workflow meaning any more —
    // and why the residual conflict is narrow: the column simply cannot be empty.
    const pub = read('lib/crm/publication-state.ts');
    expect(pub).toMatch(/PUBLICATION_NAMESPACE = "mallan_publication"/);
    expect(pub).toMatch(/"DRAFT",/);
  });
});
