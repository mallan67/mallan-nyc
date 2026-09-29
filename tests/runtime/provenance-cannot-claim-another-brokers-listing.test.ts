/// <reference types="jest" />
/**
 * MALLAN MAY NOT DISPLAY ANOTHER BROKER'S LISTING AS ITS OWN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `classifyDbListing` decided provenance like this:
 *
 *     if (listing.rls_eligible === false) return 'website-only';
 *     if (listing.agent_id != null || listing.owner_client_id != null) {
 *       return 'mallan-exclusive';
 *     }
 *     return 'third-party-idx';
 *
 * `agent_id` is not an ownership signal. `syncAgentHistory` stamps it onto
 * Cotality-synced THIRD-PARTY rows whenever a Mallan agent appears on EITHER
 * side of the deal — `buildAgentHistoricalFilter` matches
 * `ListAgentMlsId OR BuyerAgentMlsId` (lib/idx/fetch.ts:528). Representing the
 * BUYER on someone else's listing is a CRM history fact. It is not ownership of
 * the listing.
 *
 * So any third-party listing where a Mallan agent represented the buyer was
 * classified `mallan-exclusive`, and `buildDisplayCompliance` then emitted:
 *
 *     _source: 'exclusive'
 *     requiresAttribution: false      ← no "Listing courtesy of [actual broker]"
 *     disclaimerRequired: false
 *     _assignedAgent: <the Mallan agent>
 *
 * That is another brokerage's listing, advertised on mallan.nyc as Mallan's,
 * with the real listing broker's attribution removed. UCBA Art. III §2(C)
 * requires attribution to identify the ACTUAL listing broker; NY DOS 19 NYCRR
 * §175.25 governs the advertisement itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE KNOWLEDGE ALREADY EXISTED — IN ONE ROUTE
 *
 * app/api/agents/[slug]/listings/route.ts:291 defends against exactly this, by
 * deliberately NOT selecting the column:
 *
 *     "NOTE: deliberately do NOT select agent_id / owner_client_id here.
 *      syncAgentHistory writes agent_id onto Trestle-synced (third-party IDX)
 *      rows, so passing agent_id to classifyDbListing would mislabel those as
 *      Mallan exclusives and DROP the required RLS courtesy/disclaimer
 *      (UCBA Art. III §2(C))."
 *
 * Defending by omission protects one caller and leaves the classifier wrong for
 * everyone else. `app/api/listings/route.ts:381` — the MAIN public listings API
 * — selects `agent_id: true` and passes the row straight to
 * `dbListingToPublicDTO`. The hazard was documented and then walked past.
 *
 * The fix is in the classifier: provenance is decided by the canonical
 * Mallan-authorship signal (`SL-`/`RL-` listing_id prefix, or
 * `rls_eligible === false` for website-only inventory), never by an association
 * column that records who worked a deal.
 */
import { classifyDbListing } from '@/lib/idx/db-to-public-dto';
import { isMallanLocalListing } from '@/lib/listings/mallan-source-identity';

/** A third-party listing carried in the Cotality feed. */
function thirdParty(over: Record<string, unknown> = {}) {
  return {
    listing_id: 'RLS20093870',
    rls_eligible: true,
    agent_id: null,
    owner_client_id: null,
    ...over,
  } as Parameters<typeof classifyDbListing>[0];
}

/** A Mallan-authored listing. */
function mallanLocal(over: Record<string, unknown> = {}) {
  return {
    listing_id: 'SL-0004',
    rls_eligible: true,
    agent_id: 3n,
    owner_client_id: 501n,
    ...over,
  } as Parameters<typeof classifyDbListing>[0];
}

describe('the premise: agent_id records deal history, not ownership', () => {
  it('the canonical authorship predicate does not consult agent_id', () => {
    // isMallanLocalListing is the charter's predicate: SL-/RL- prefix, or
    // website-only inventory. Note it never sees agent_id at all.
    expect(isMallanLocalListing({ listing_id: 'SL-0004' })).toBe(true);
    expect(isMallanLocalListing({ listing_id: 'RL-0004' })).toBe(true);
    expect(isMallanLocalListing({ listing_id: 'RLS20093870' })).toBe(false);
    expect(isMallanLocalListing({ listing_id: 'RLS20093870', rls_eligible: false })).toBe(true);
  });
});

describe("a third-party listing stays third-party", () => {
  it('even when a Mallan agent worked the BUYER side', () => {
    // This is the live case: syncAgentHistory stamps agent_id from
    // BuyerAgentMlsId onto a listing another brokerage owns.
    expect(classifyDbListing(thirdParty({ agent_id: 3n }))).toBe('third-party-idx');
  });

  it('even when it somehow carries an owner_client_id', () => {
    // A provider row is the provider's listing whatever local columns say.
    expect(classifyDbListing(thirdParty({ owner_client_id: 501n }))).toBe('third-party-idx');
  });

  it('and with both set', () => {
    expect(
      classifyDbListing(thirdParty({ agent_id: 3n, owner_client_id: 501n })),
    ).toBe('third-party-idx');
  });
});

describe('genuine Mallan inventory is still recognised', () => {
  it('an SL- listing is a Mallan exclusive', () => {
    expect(classifyDbListing(mallanLocal())).toBe('mallan-exclusive');
  });

  it('an RL- listing is a Mallan exclusive', () => {
    expect(classifyDbListing(mallanLocal({ listing_id: 'RL-0007' }))).toBe('mallan-exclusive');
  });

  it('and is STILL recognised without agent_id or owner_client_id', () => {
    // The classification must not depend on columns a caller may not select —
    // that dependency is what made one route defend itself by omission.
    expect(
      classifyDbListing(mallanLocal({ agent_id: null, owner_client_id: null })),
    ).toBe('mallan-exclusive');
  });

  it('website-only commercial inventory is website-only', () => {
    expect(
      classifyDbListing(thirdParty({ rls_eligible: false })),
    ).toBe('website-only');
  });
});

describe('the classification drives the public compliance surface', () => {
  it('third-party rows keep attribution and the disclaimer', async () => {
    // The consequence that makes this a compliance defect rather than a label
    // problem: 'mallan-exclusive' suppresses both.
    const { dbListingToPublicDTO } = await import('@/lib/idx/db-to-public-dto');
    const dto = dbListingToPublicDTO({
      ...(thirdParty({ agent_id: 3n }) as Record<string, unknown>),
      id: 1n,
      status: 'Active',
      listing_type: 'sale',
      list_price: 1000000,
      address: { StreetNumber: '1', StreetName: 'Main St', City: 'New York' },
      features: {},
      media: [],
      compliance: {},
      raw_data: {},
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      list_office_name: 'Another Brokerage LLC',
      listing_contract_date: '2026-04-01T00:00:00Z',
      modification_timestamp: '2026-05-05T16:21:52Z',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-05-05T16:21:52Z',
    } as never);

    expect(dto._displayCompliance?.requiresAttribution).toBe(true);
    expect(dto._displayCompliance?.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance?.attributionText).toContain('Another Brokerage LLC');
    // And no Mallan agent is presented as the contact for someone else's listing.
    expect(dto._assignedAgent).toBeUndefined();
  });
});
