/// <reference types="jest" />
/**
 * STEP 2 — STATUS SEMANTICS, END TO END.
 *
 * Two opposite substitutions cancelled each other out, which is why neither was
 * visible from one end alone:
 *
 *   OUTBOUND  search-engine.js   'PENDING' -> 'ActiveUnderContract'
 *   INBOUND   crm-idx-mapper.ts  ActiveUnderContract -> 'PENDING'
 *
 * A broker ticking "Pending" asked Cotality for `ActiveUnderContract`, which has
 * ZERO rows on the live feed while `Pending` is populated — so the search came
 * back empty and the broker concluded there was no pending inventory. Coming the
 * other way, a listing genuinely under contract was displayed as merely pending.
 *
 * Round-tripping HID the defect: out turned PENDING into ActiveUnderContract and
 * back turned ActiveUnderContract into PENDING, so an end-to-end check
 * "confirmed" the value survived. It did not survive; it was laundered.
 *
 * These tests assert each leg separately AND the round trip, because a round
 * trip alone cannot distinguish "preserved" from "laundered".
 */
import {
  STANDARD_STATUS_MEMBERS,
  crmTokenToStandardStatus,
  standardStatusToCrmToken,
  standardStatusOData,
  isStandardStatusMember,
} from '@/lib/search/canonical/status-token-contract';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

describe('Pending and ActiveUnderContract are distinct in BOTH directions', () => {
  it('PENDING asks for Pending, not ActiveUnderContract', () => {
    expect(crmTokenToStandardStatus('PENDING')).toBe('Pending');
  });

  it('UNDER_CONTRACT asks for ActiveUnderContract', () => {
    expect(crmTokenToStandardStatus('UNDER_CONTRACT')).toBe('ActiveUnderContract');
  });

  it('raw Pending reads back as PENDING', () => {
    expect(standardStatusToCrmToken('Pending')).toBe('PENDING');
  });

  it('raw ActiveUnderContract does NOT read back as PENDING', () => {
    expect(standardStatusToCrmToken('ActiveUnderContract')).toBe('UNDER_CONTRACT');
  });

  it('the two tokens never resolve to the same provider member', () => {
    expect(crmTokenToStandardStatus('PENDING')).not.toBe(crmTokenToStandardStatus('UNDER_CONTRACT'));
  });

  it('selecting both produces TWO predicates, not one de-duplicated to one', () => {
    // The old map sent both to 'ActiveUnderContract' and then de-duplicated.
    const { members, filter } = standardStatusOData(['PENDING', 'UNDER_CONTRACT']);
    expect(members).toHaveLength(2);
    expect(filter).toContain("StandardStatus eq 'Pending'");
    expect(filter).toContain("StandardStatus eq 'ActiveUnderContract'");
  });
});

describe('the mapping is a true inverse for every live member', () => {
  it.each(STANDARD_STATUS_MEMBERS)('%s round-trips to itself', (member) => {
    const token = standardStatusToCrmToken(member);
    expect(crmTokenToStandardStatus(token)).toBe(member);
  });

  it('no two members share a token', () => {
    const tokens = STANDARD_STATUS_MEMBERS.map(standardStatusToCrmToken);
    expect(new Set(tokens).size).toBe(STANDARD_STATUS_MEMBERS.length);
  });
});

describe('unknown stays unknown, and never becomes Active', () => {
  it.each([null, undefined, '', 'Leased', 'AttorneyReview', 'Contingent', 'OFFEROUT'])(
    '%p reads as UNKNOWN',
    (v) => expect(standardStatusToCrmToken(v)).toBe('UNKNOWN'),
  );

  it.each(['Leased', 'AttorneyReview', 'PendingShortSale', 'CompSold'])(
    'the MlsStatus-only value %s is not a StandardStatus member',
    (v) => expect(isStandardStatusMember(v)).toBe(false),
  );

  it('an unmappable token THROWS rather than yielding no predicate', () => {
    // CORRECTED. My first version asserted the token was dropped and reported.
    // Dropping it removes the status clause, so the search widens to every
    // status while still returning HTTP 200 — a narrow question answered
    // broadly, with nothing to indicate it. Fail closed instead.
    expect(() => standardStatusOData(['OFFEROUT'])).toThrow(/Unsupported status criterion/);
  });
});

describe('the REAL OData writer serialises the correct member', () => {
  const filterFor = (status: string) =>
    buildCrmIdxODataFilter(new URLSearchParams({ status }));

  it('status=Pending emits the Pending predicate', () => {
    expect(filterFor('Pending')).toContain("StandardStatus eq 'Pending'");
  });

  it('status=Pending does NOT emit ActiveUnderContract', () => {
    expect(filterFor('Pending')).not.toContain('ActiveUnderContract');
  });

  it('status=ActiveUnderContract does NOT emit Pending', () => {
    const f = filterFor('ActiveUnderContract');
    expect(f).toContain("StandardStatus eq 'ActiveUnderContract'");
    expect(f).not.toContain("StandardStatus eq 'Pending'");
  });

  it('refuses a value that is not a live StandardStatus member', () => {
    // `OFFEROUT` is a Mallan-only token. Passed through verbatim it became
    // `StandardStatus eq 'OFFEROUT'`, which the provider answers with HTTP 400 —
    // failing the WHOLE query. CORRECTED: it is not merely omitted either, since
    // omitting the clause widens the search. It throws, and the route renders
    // the typed UNSUPPORTED_CRITERION 400.
    expect(() => filterFor('OFFEROUT')).toThrow(/Unsupported status criterion/);
  });
});

describe('the mapper reads StandardStatus and never lets MlsStatus override it', () => {
  const mapped = (raw: Record<string, unknown>) =>
    mapTrestleToCrmListing({ ListingId: 'RLS1', ...raw }, 0) as Record<string, unknown>;

  it('reports a Pending listing as PENDING', () => {
    expect(mapped({ StandardStatus: 'Pending' }).status).toBe('PENDING');
  });

  it('reports an ActiveUnderContract listing as UNDER_CONTRACT, not PENDING', () => {
    expect(mapped({ StandardStatus: 'ActiveUnderContract' }).status).toBe('UNDER_CONTRACT');
  });

  it('a populated MlsStatus does NOT replace StandardStatus', () => {
    // MlsStatus is a different 25-member vocabulary and the provider suppresses
    // it for filtering entirely. It is evidence, never the canonical input.
    expect(mapped({ StandardStatus: 'Active', MlsStatus: 'Leased' }).status).toBe('ACTIVE');
  });

  it('an MlsStatus-only row is UNKNOWN, not guessed from that vocabulary', () => {
    expect(mapped({ MlsStatus: 'Leased' }).status).toBe('UNKNOWN');
  });

  it('an absent status is UNKNOWN, never ACTIVE', () => {
    expect(mapped({}).status).toBe('UNKNOWN');
  });
});

describe('Sale and Rental consume the SAME status contract', () => {
  it.each(['sale', 'rental'])('type=%s serialises Pending identically', (type) => {
    const f = buildCrmIdxODataFilter(new URLSearchParams({ type, status: 'Pending' }));
    expect(f).toContain("StandardStatus eq 'Pending'");
    expect(f).not.toContain('ActiveUnderContract');
  });
});

/**
 * FAIL CLOSED — the correction to my own first cut.
 *
 * The writer initially validated status members, `console.warn`ed the rest, and
 * continued. That is WORSE than the defect it replaced. Dropping an unsupported
 * token removes the status clause entirely, so a broker asking for one status
 * gets EVERY status back — with HTTP 200 and nothing to indicate the question
 * changed. The behaviour it replaced at least failed loudly with a 400.
 *
 * A criterion the provider cannot express now throws, and the route renders the
 * same typed UNSUPPORTED_CRITERION 400 already used for PropertySubType — one
 * error architecture, not two.
 */
describe('an unsupported status criterion fails closed', () => {
  it('throws rather than dropping the criterion', () => {
    const { standardStatusOData: render, UnsupportedStatusCriterionError: Err } =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/lib/search/canonical/status-token-contract');
    expect(() => render(['OFFEROUT'])).toThrow(Err);
  });

  it('names the offending values so a client can fix them', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { standardStatusOData: render } = require('@/lib/search/canonical/status-token-contract');
    try {
      render(['OFFEROUT', 'CONTRACTSIGNED']);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.unsupportedTokens).toEqual(['OFFEROUT', 'CONTRACTSIGNED']);
    }
  });

  it('does NOT partially execute a mixed valid + unsupported request', () => {
    // Running the valid half answers a different question from the one asked.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { standardStatusOData: render } = require('@/lib/search/canonical/status-token-contract');
    expect(() => render(['ACTIVE', 'OFFEROUT'])).toThrow(/Unsupported status criterion/);
  });

  it('the real writer surfaces it rather than widening the search', () => {
    // The whole point: this must not return a filter with no status clause.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ status: 'OFFEROUT' }))).toThrow(
      /Unsupported status criterion/,
    );
  });

  it('FUTURE is unsupported — Incomplete is not proven to mean it', () => {
    // The browser used to send FUTURE as `Incomplete`. Cotality declares
    // Incomplete and does not declare Future; one existing establishes nothing
    // about the other's meaning. Same shape as PENDING -> ActiveUnderContract.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ status: 'FUTURE' }))).toThrow(
      /Unsupported status criterion/,
    );
  });
});

describe('legitimate UI aliases resolve in the ONE contract', () => {
  it.each([
    ['CONTRACT', 'ActiveUnderContract'],
    ['CANCELED', 'Canceled'],
    ['COMINGSOON', 'ComingSoon'],
  ])('%s resolves to %s', (token, member) => {
    expect(crmTokenToStandardStatus(token)).toBe(member);
  });

  it('an alias is a spelling, never a new concept borrowing a member', () => {
    // FUTURE is not aliased to INCOMPLETE, though the member exists.
    expect(crmTokenToStandardStatus('FUTURE')).toBeNull();
  });
});
