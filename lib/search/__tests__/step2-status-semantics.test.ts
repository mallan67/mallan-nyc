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
/** The read value is now the exact member itself; UNKNOWN when unrecognised. */
const standardStatusRead = (v: unknown): string => (isMember(v) ? String(v) : 'UNKNOWN');

import {
  STANDARD_STATUS_MEMBERS,
  crmTokenToStandardStatus,
  isStandardStatusMember as isMember,
  standardStatusOData,
  isStandardStatusMember,
} from '@/lib/search/canonical/status-token-contract';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

describe('Pending and ActiveUnderContract are distinct in BOTH directions', () => {
  // RETARGETED. The criterion is now the EXACT member, so these assert that a
  // member asks for itself. The old uppercase spellings are rejected by the
  // canonical contract and migrate only at the legacy boundary — asserted in
  // step2-status-readside.test.ts.
  it('Pending asks for Pending, not ActiveUnderContract', () => {
    expect(crmTokenToStandardStatus('Pending')).toBe('Pending');
    expect(crmTokenToStandardStatus('Pending')).not.toBe('ActiveUnderContract');
  });

  it('ActiveUnderContract asks for ActiveUnderContract', () => {
    expect(crmTokenToStandardStatus('ActiveUnderContract')).toBe('ActiveUnderContract');
  });

  // RETARGETED 2026-08-22. These asserted a Mallan-invented read vocabulary
  // (PENDING / UNDER_CONTRACT). The DTO now carries the EXACT Cotality member,
  // so the real assertion is that each member reads back as ITSELF and the two
  // never converge.
  it('raw Pending reads back as Pending', () => {
    expect(standardStatusRead('Pending')).toBe('Pending');
  });

  it('raw ActiveUnderContract does NOT read back as Pending', () => {
    expect(standardStatusRead('ActiveUnderContract')).toBe('ActiveUnderContract');
  });

  it('the two never resolve to the same provider member', () => {
    expect(crmTokenToStandardStatus('Pending')).not.toBe(crmTokenToStandardStatus('ActiveUnderContract'));
  });

  it('selecting both produces TWO predicates, not one de-duplicated to one', () => {
    // The old map sent both to 'ActiveUnderContract' and then de-duplicated.
    const { members, filter } = standardStatusOData(['Pending', 'ActiveUnderContract']);
    expect(members).toHaveLength(2);
    expect(filter).toContain("StandardStatus eq 'Pending'");
    expect(filter).toContain("StandardStatus eq 'ActiveUnderContract'");
  });
});

describe('the mapping is a true inverse for every live member', () => {
  it.each(STANDARD_STATUS_MEMBERS)('%s round-trips to itself', (member) => {
    expect(crmTokenToStandardStatus(standardStatusRead(member))).toBe(member);
  });

  it('no two members collapse to the same read value', () => {
    const values = STANDARD_STATUS_MEMBERS.map(standardStatusRead);
    expect(new Set(values).size).toBe(STANDARD_STATUS_MEMBERS.length);
  });
});

describe('unknown stays unknown, and never becomes Active', () => {
  it.each([null, undefined, '', 'Leased', 'AttorneyReview', 'Contingent', 'OFFEROUT'])(
    '%p reads as UNKNOWN',
    (v) => expect(standardStatusRead(v)).toBe('UNKNOWN'),
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

  // RETARGETED: the DTO now carries the EXACT Cotality member.
  it('reports a Pending listing as Pending', () => {
    expect(mapped({ StandardStatus: 'Pending' }).status).toBe('Pending');
  });

  it('reports an ActiveUnderContract listing as ActiveUnderContract, not Pending', () => {
    expect(mapped({ StandardStatus: 'ActiveUnderContract' }).status).toBe('ActiveUnderContract');
  });

  it('a populated MlsStatus does NOT replace StandardStatus', () => {
    // MlsStatus is a different 25-member vocabulary and the provider suppresses
    // it for filtering entirely. It is evidence, never the canonical input.
    expect(mapped({ StandardStatus: 'Active', MlsStatus: 'Leased' }).status).toBe('Active');
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

describe('the canonical contract no longer translates invented spellings', () => {
  // MOVED 2026-08-22. These used to assert that CONTRACT / CANCELED / COMINGSOON
  // resolved INSIDE the canonical Cotality contract. Compatibility does not
  // belong there — a contract that accepts non-provider spellings keeps a second
  // vocabulary alive. They are now rejected here and migrated only at
  // lib/search/legacy-status-migration.ts, asserted in
  // step2-status-readside.test.ts.
  it.each(['CONTRACT', 'CANCELED', 'COMINGSOON', 'UNDER_CONTRACT', 'PENDING'])(
    '%s is rejected by the canonical contract',
    (legacy) => expect(crmTokenToStandardStatus(legacy)).toBeNull(),
  );

  it('an exact member is accepted', () => {
    expect(crmTokenToStandardStatus('ActiveUnderContract')).toBe('ActiveUnderContract');
  });
});


/**
 * THE CANONICAL EXECUTABLE VALUE IS THE EXACT COTALITY MEMBER.
 *
 * Mallan does not mint a parallel vocabulary for the Search foundation and then
 * translate it. A criterion, a persisted saved search, and an outgoing $filter
 * all carry the provider's own words: `Pending`, `ActiveUnderContract`,
 * `ComingSoon`.
 *
 * The DOM already agreed — the status checkboxes carry
 * `data-value="Active" / "ComingSoon" / "Pending"`. The uppercase tokens were
 * invented purely in the JavaScript in between, and THREE separate tables
 * existed to translate them back: search-engine.js, saved-searches.js, and the
 * server contract. All three are gone.
 *
 * Legacy uppercase spellings survive ONLY as boundary migration for saved
 * searches written before this, applied once on the way in. They are never
 * persisted again and never reach Cotality.
 */
describe('exact Cotality members are the canonical criterion values', () => {
  it.each(STANDARD_STATUS_MEMBERS)('%s passes through unchanged', (member) => {
    expect(crmTokenToStandardStatus(member)).toBe(member);
  });

  it.each(STANDARD_STATUS_MEMBERS)('%s renders as its own exact predicate', (member) => {
    const { filter } = standardStatusOData([member]);
    expect(filter).toBe(`StandardStatus eq '${member}'`);
  });

  it('an outgoing filter never contains a Mallan-invented term', () => {
    const { filter } = standardStatusOData(['Active', 'Pending', 'ActiveUnderContract']);
    for (const invented of ['UNDER_CONTRACT', 'COMING_SOON', 'CANCELLED', 'CONTRACT', 'FUTURE', 'OFFEROUT']) {
      expect(filter).not.toContain(invented);
    }
  });
});

describe('legacy spellings live at the migration boundary, not in the contract', () => {
  // MOVED 2026-08-22. These called the canonical contract, which now rejects any
  // Mallan-invented spelling outright. Migration is a separate, explicitly named
  // boundary so compatibility can never masquerade as provider truth. Full
  // coverage lives in step2-status-readside.test.ts.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { migrateLegacyStatusValue } = require('@/lib/search/legacy-status-migration');

  it.each([
    ['UNDER_CONTRACT', 'ActiveUnderContract'],
    ['CONTRACT', 'ActiveUnderContract'],
    ['COMING_SOON', 'ComingSoon'],
    ['CANCELLED', 'Canceled'],
    ['PENDING', 'Pending'],
  ])('%s migrates to %s at the boundary', (legacy, member) => {
    expect(migrateLegacyStatusValue(legacy)).toBe(member);
    // ...and is rejected by the canonical contract itself.
    expect(crmTokenToStandardStatus(legacy)).toBeNull();
  });

  it('a migrated value renders as the MEMBER predicate, not the legacy word', () => {
    const member = migrateLegacyStatusValue('UNDER_CONTRACT');
    const { filter } = standardStatusOData([member]);
    expect(filter).toBe("StandardStatus eq 'ActiveUnderContract'");
    expect(filter).not.toContain('UNDER_CONTRACT');
  });

  it.each(['FUTURE', 'OFFEROUT'])('%s does not migrate and is not accepted', (v) => {
    expect(migrateLegacyStatusValue(v)).toBeNull();
    expect(() => standardStatusOData([v])).toThrow(/Unsupported status criterion/);
  });
});


describe('the browser emits exact members — no table left to drift', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('node:fs'), path = require('node:path');
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l: string) => !l.trim().startsWith('//'))
      .join(String.fromCharCode(10));

  it('search-engine.js pushes Cotality members, not invented tokens', () => {
    const src = read('public/crm/js/search/search-engine.js');
    expect(src).toContain("statuses.push('ActiveUnderContract')");
    expect(src).not.toContain("statuses.push('UNDER_CONTRACT')");
    expect(src).not.toContain("statuses.push('COMING_SOON')");
    expect(src).not.toContain("statuses.push('PENDING')");
  });

  it('search-engine.js keeps no status translation table', () => {
    expect(read('public/crm/js/search/search-engine.js')).not.toMatch(/var statusMap = \{/);
  });

  it('saved-searches.js no longer reverse-maps an invented vocabulary', () => {
    expect(read('public/crm/js/search/saved-searches.js')).not.toMatch(/statusReverseMap/);
  });
});
