/// <reference types="jest" />
/**
 * Backend-Search-1 — canonical search/intelligence contract.
 *
 * Proves the contract's static rules. Per CLAUDE.md §J.8: green here proves the CONTRACT rules,
 * NOT that any field is live on Cotality — the live-authority binding is the `data/cotality-enums.live.json`
 * assertions below + the separate `cotality:verify` step. Nothing here is wired to a runtime reader.
 */
import {
  // status / lifecycle
  statusGroup, lifecycleToGroup, queryStatusesFor,
  // class / ownership
  listingClass, propertyTypeFor, ownershipClass, ownershipClassFromUiLabel, commonInterestFor,
  // display gate
  displayGate,
  // comp eligibility
  compEligibility,
  // sort
  resolveSort, TIEBREAK, DEFAULT_SORT_KEY, isSortKey, type SortKey,
  // filter keys
  toCanonicalFilterKey, assertCanonicalFilterKey,
  // saved search
  // attribution
  resolveAttribution, courtesyLabel, attributionViolation,
  // capability
  isVerified, requiresLiveProbe, isUnsupported,
  // registry
  FIELD_REGISTRY, REQUIRED_FAMILIES, missingFamilies, representedFamilies, getField,
  assertCapabilityUsable,
  // live truth
  STANDARD_STATUS_MEMBERS, COMMON_INTEREST_MEMBERS, PROPERTY_TYPE_SALE, PROPERTY_TYPE_RENTAL,
  MLS_STATUS_FILTERABLE, DEAD_OR_INVALID_VALUES,
  // reserved
  RESERVED_DIMENSIONS, isReservedOnly,
  type CanonicalFilterKey,
} from '../canonical';
import { savedCriteriaFromExecuted, isSavedSearchCriteria, savedSearchVersionState, resolveStoredCriteria, CRITERIA_VERSION } from '../engine/saved-search';
import { resolveVisibility, type Audience, type LifecycleStatus } from '../visibility-contract';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LIVE = require('../../../data/cotality-enums.live.json') as { enums: Record<string, string[]> };

const ALL_STATUSES: LifecycleStatus[] = [
  'active', 'pending', 'temp_off_market', 'withdrawn', 'canceled', 'expired', 'closed_sold', 'closed_rented', 'unknown',
];
const ALL_SORT_KEYS: SortKey[] = [
  'price_desc', 'price_asc', 'newest', 'largest', 'beds_desc', 'neighborhood', 'new_development', 'exclusives',
];

describe('1. unknown status fails CLOSED publicly', () => {
  it('resolveVisibility public + unknown → blocked', () => {
    expect(resolveVisibility({ audience: 'public', status: 'unknown', source: 'mls', transactionType: 'sale', usage: 'search' }).allowed).toBe(false);
  });
  it('statusGroup(novel/blank) → unavailable (fail-closed)', () => {
    expect(statusGroup('SomeBrandNewCotalityStatus')).toBe('unavailable');
    expect(statusGroup('')).toBe('unavailable');
    expect(statusGroup(null)).toBe('unavailable');
    expect(lifecycleToGroup('unknown')).toBe('unavailable');
  });
  it('displayGate public + unknown → suppressed', () => {
    const gates = { idxDisplayYn: true, ownerOptOut: false, participantOnly: false, internetEntireListingDisplayYn: true };
    expect(displayGate({ audience: 'public', status: 'unknown', source: 'mls', transactionType: 'sale', gates })).toBe('suppressed');
  });
});

describe('2. agent / internal_report / client lifecycle is PRESERVED', () => {
  for (const audience of ['agent', 'internal_report', 'client'] as Audience[]) {
    it(`${audience} sees EVERY lifecycle status (incl. unknown, closed, off-market)`, () => {
      for (const s of ALL_STATUSES) {
        expect(resolveVisibility({ audience, status: s, source: 'mls', transactionType: 'sale', usage: 'comp' }).allowed).toBe(true);
      }
    });
  }
  it('displayGate maps agent → internal_only, client → seller_report_only', () => {
    const gates = { idxDisplayYn: null as boolean | null, ownerOptOut: null, participantOnly: null, internetEntireListingDisplayYn: null };
    expect(displayGate({ audience: 'agent', status: 'closed_sold', source: 'mls', transactionType: 'sale', gates })).toBe('internal_only');
    expect(displayGate({ audience: 'client', status: 'expired', source: 'mls', transactionType: 'sale', gates })).toBe('seller_report_only');
  });
});

describe('3. unsupported fields are NOT silently accepted (fail loud)', () => {
  it('assertCanonicalFilterKey throws on an unmapped param', () => {
    expect(() => assertCanonicalFilterKey('totallyBogusParam')).toThrow(/Unmapped filter param/);
  });
  it('MlsStatus filter is unsupported → assertCapabilityUsable returns a loud error', () => {
    const mls = getField('mls_status')!;
    expect(mls.filterable).toBe('unsupported');
    expect(isUnsupported(mls.filterable)).toBe(true);
    expect(assertCapabilityUsable(mls, 'filterable')).toMatch(/UNSUPPORTED/);
  });
  it('a product-gap computed field (price_per_sqft) is unsupported for filter/sort', () => {
    const ppsf = getField('price_per_sqft')!;
    expect(ppsf.filterable).toBe('unsupported');
    expect(ppsf.sortable).toBe('unsupported');
  });
});

describe('4. needs_probe fields cannot be treated as verified', () => {
  it('isVerified is false for needs_probe/unsupported/no; true only for yes', () => {
    expect(isVerified('yes')).toBe(true);
    expect(isVerified('needs_probe')).toBe(false);
    expect(isVerified('unsupported')).toBe(false);
    expect(isVerified('no')).toBe(false);
    expect(requiresLiveProbe('needs_probe')).toBe(true);
  });
  it('a needs_probe field returns a probe-required error, not usable', () => {
    const nd = getField('new_development')!;
    expect(nd.filterable).toBe('needs_probe');
    expect(assertCapabilityUsable(nd, 'filterable')).toMatch(/needs_probe/);
  });
});

describe('5. every UI/search/report field family has a registry entry', () => {
  it('no required family is missing', () => {
    expect(missingFamilies()).toEqual([]);
    for (const fam of REQUIRED_FAMILIES) expect(representedFamilies().has(fam)).toBe(true);
  });
  it('every registry field declares all four capability axes explicitly', () => {
    const allowed = new Set(['yes', 'no', 'needs_probe', 'unsupported']);
    for (const s of FIELD_REGISTRY) {
      for (const axis of ['filterable', 'sortable', 'alertable', 'reportable'] as const) {
        expect(allowed.has(s[axis])).toBe(true);
      }
    }
  });
});

describe('6. all sort keys have a deterministic tie-break', () => {
  it('every sort key ends in the unique id-asc tie-break', () => {
    for (const key of ALL_SORT_KEYS) {
      const terms = resolveSort(key);
      expect(terms.length).toBeGreaterThanOrEqual(2);
      expect(terms[terms.length - 1]).toEqual(TIEBREAK);
      expect(TIEBREAK).toEqual({ field: 'id', dir: 'asc' });
    }
  });
  it('unknown sort key falls back to default (still tie-broken, never unstable)', () => {
    expect(isSortKey('nonsense')).toBe(false);
    const terms = resolveSort('nonsense');
    expect(terms[terms.length - 1]).toEqual(TIEBREAK);
    expect(resolveSort(DEFAULT_SORT_KEY)[0]).toEqual(terms[0]);
  });
});

describe('7. saved-search criteria carries criteria_version (Packet 2: executor parameters)', () => {
  it('savedCriteriaFromExecuted stamps the current version and stores only executor parameters', () => {
    const r = savedCriteriaFromExecuted({ type: 'sale', minPrice: 1000, sort: 'price_desc', limit: 50 });
    expect(r.ok && r.criteria.criteria_version).toBe(CRITERIA_VERSION);
    expect(r.ok && isSavedSearchCriteria(r.criteria)).toBe(true);
    expect(r.ok && r.criteria.params).toEqual({ type: 'sale', minPrice: '1000', sort: 'price_desc' });
  });
  it('criteria without a version is legacy — converted only by the proven map, never read as current', () => {
    expect(isSavedSearchCriteria({ listing_type: 'sale' })).toBe(false);
    expect(savedSearchVersionState({ listing_type: 'sale' })).toBe('legacy');
    expect(resolveStoredCriteria({ listing_type: 'sale' }).state).toBe('migrated');
  });
  it('a STALE version (the never-persisted v1 draft) is invalid, never reinterpreted', () => {
    const stale = { criteria_version: 1, filters: { price_min: 1000 }, sort: 'price_desc' };
    expect(savedSearchVersionState(stale)).toBe('invalid');
    expect(resolveStoredCriteria(stale).state).toBe('invalid');
  });
  it('a bogus/unmapped parameter fails loud (invalid), never accepted', () => {
    const blob = { criteria_version: CRITERIA_VERSION, params: { totallyBogus: '1' } };
    expect(savedSearchVersionState(blob)).toBe('invalid');
    expect(isSavedSearchCriteria(blob)).toBe(false);
  });
  it('alert eligibility is executor eligibility: an unexecutable criterion is refused at save, not silently saved', () => {
    const r = savedCriteriaFromExecuted({ type: 'sale', amenities: 'doorman', minPrice: 1000 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.refusal.unsupported).toEqual(['amenities']);
  });
});

describe('8. attribution labels are required by source/audience', () => {
  it('MLS-sourced closed row requires attribution; ACRIS public does not', () => {
    expect(resolveAttribution({ audience: 'agent', status: 'closed_sold', source: 'mls', transactionType: 'sale' }).requiresAttribution).toBe(true);
    expect(resolveAttribution({ audience: 'public', status: 'closed_sold', source: 'acris', transactionType: 'sale' }).requiresAttribution).toBe(false);
  });
  it('sold vs rented labels are never collapsed on closed rows', () => {
    const d = resolveAttribution({ audience: 'agent', status: 'closed_rented', source: 'mls', transactionType: 'rental' });
    expect(d.requiresTransactionLabel).toBe(true);
  });
  it('attributionViolation fires when attribution is required but no office is present', () => {
    const req = resolveAttribution({ audience: 'client', status: 'closed_sold', source: 'mls', transactionType: 'sale' });
    expect(attributionViolation(req, null)).toMatch(/attribution required/);
    expect(attributionViolation(req, 'Mallan Real Estate Inc.')).toBeNull();
    expect(courtesyLabel('Mallan Real Estate Inc.')).toBe('Listing Courtesy of Mallan Real Estate Inc.');
  });
});

describe('9. public visibility does not suppress private intelligence', () => {
  it('every non-public field is still visible to agent (private lifecycle retained)', () => {
    for (const s of FIELD_REGISTRY) {
      if (!s.visibility.public) expect(s.visibility.agent).toBe(true);
    }
  });
  it('agent retains the full closed/off-market lifecycle that public blocks', () => {
    for (const s of ['closed_sold', 'closed_rented', 'withdrawn', 'expired', 'canceled', 'temp_off_market'] as LifecycleStatus[]) {
      expect(resolveVisibility({ audience: 'agent', status: s, source: 'mls', transactionType: 'sale', usage: 'comp' }).allowed).toBe(true);
    }
  });
});

describe('module: class / ownership (exact live values)', () => {
  it('listingClass exact values; space variant is unknown', () => {
    expect(listingClass('Residential')).toBe('sale');
    expect(listingClass('ResidentialLease')).toBe('rental');
    expect(listingClass('Residential Lease')).toBe('unknown'); // invalid space variant
    expect(propertyTypeFor('rental')).toBe('ResidentialLease');
  });
  it('ownershipClass: StockCooperative→coop; Cooperative is invalid', () => {
    expect(ownershipClass('StockCooperative')).toBe('coop');
    expect(ownershipClass('Cooperative')).toBe('unknown'); // not a live member
    expect(ownershipClassFromUiLabel('Co-op')).toBe('coop');
    expect(commonInterestFor('coop')).toEqual(['StockCooperative']);
  });
  it('valid live non-segmentation members → other (never silently unknown)', () => {
    expect(ownershipClass('CommunityApartment')).toBe('other');
    expect(ownershipClass('PlannedDevelopment')).toBe('other');
    expect(ownershipClass('Timeshare')).toBe('other');
    expect(ownershipClass('totally-fake-value')).toBe('unknown');
  });
});

describe('module: status query set is CONSISTENT with classification', () => {
  it('every off_market query status classifies back to off_market', () => {
    for (const s of queryStatusesFor('off_market')) expect(statusGroup(s)).toBe('off_market');
  });
  it('Delete/Incomplete are unavailable (not real inventory) and not off_market query targets', () => {
    expect(statusGroup('Delete')).toBe('unavailable');
    expect(statusGroup('Incomplete')).toBe('unavailable');
    expect(queryStatusesFor('off_market')).not.toContain('Delete');
    expect(queryStatusesFor('off_market')).not.toContain('Incomplete');
  });
});

describe('module: display-gate composes compliance columns (hard block)', () => {
  it('a compliance column blocks public display even for an active listing', () => {
    const base = { audience: 'public' as Audience, status: 'active' as LifecycleStatus, source: 'mls' as const, transactionType: 'sale' as const };
    expect(displayGate({ ...base, gates: { idxDisplayYn: true, ownerOptOut: false, participantOnly: false, internetEntireListingDisplayYn: true } })).toBe('public_displayable');
    expect(displayGate({ ...base, gates: { idxDisplayYn: false, ownerOptOut: false, participantOnly: false, internetEntireListingDisplayYn: true } })).toBe('suppressed');
    expect(displayGate({ ...base, gates: { idxDisplayYn: true, ownerOptOut: true, participantOnly: false, internetEntireListingDisplayYn: true } })).toBe('suppressed');
  });
});

describe('module: comp-eligibility uses CloseDate window + ownership segmentation', () => {
  const criteria = { targetOwnership: 'coop' as const, asOf: '2026-07-01', closedWindowDays: 180 };
  it('closed comp inside CloseDate window is a closed_comp; outside is excluded', () => {
    expect(compEligibility({ group: 'closed_recent', ownership: 'coop', closeDate: '2026-06-01' }, criteria)).toBe('closed_comp');
    expect(compEligibility({ group: 'closed_recent', ownership: 'coop', closeDate: '2020-01-01' }, criteria)).toBe('excluded');
    expect(compEligibility({ group: 'closed_recent', ownership: 'coop', closeDate: null }, criteria)).toBe('excluded');
  });
  it('ownership mismatch is excluded unless mixOwnership', () => {
    expect(compEligibility({ group: 'active_on_market', ownership: 'condo' }, criteria)).toBe('excluded');
    expect(compEligibility({ group: 'active_on_market', ownership: 'condo' }, { ...criteria, mixOwnership: true })).toBe('active_comp');
  });
});

describe('module: filter-keys map divergent params, fail loud on unmapped', () => {
  it('resolves the analysis param divergences to one canonical key', () => {
    expect(toCanonicalFilterKey('baths')).toBe('baths_min');
    expect(toCanonicalFilterKey('minBaths')).toBe('baths_min');
    expect(toCanonicalFilterKey('q')).toBe('address');
    expect(toCanonicalFilterKey('zipCodes')).toBe('zip');
    expect(toCanonicalFilterKey('keyword')).toBe('keywords');
    expect(toCanonicalFilterKey('propertySubType')).toBe('property_sub_types'); // singular — crm-idx-filter.ts:217
    expect(toCanonicalFilterKey('propertySubTypes')).toBe('property_sub_types');
    expect(toCanonicalFilterKey('nope')).toBeNull();
  });
});

describe('live-authority binding: constants ⊆ data/cotality-enums.live.json', () => {
  it('StandardStatus + CommonInterest members exist in the live enum file', () => {
    const liveStatus = new Set(LIVE.enums.StandardStatus);
    for (const m of STANDARD_STATUS_MEMBERS) expect(liveStatus.has(m)).toBe(true);
    const liveCI = new Set(LIVE.enums.CommonInterest);
    for (const m of COMMON_INTEREST_MEMBERS) expect(liveCI.has(m)).toBe(true);
  });
  it('PropertyType sale/rental values are live members; MlsStatus not filterable', () => {
    const livePT = new Set(LIVE.enums.PropertyType);
    expect(livePT.has(PROPERTY_TYPE_SALE)).toBe(true);
    expect(livePT.has(PROPERTY_TYPE_RENTAL)).toBe(true);
    expect(MLS_STATUS_FILTERABLE).toBe(false);
  });
  it('Permission / ListingPermission have NO OwnerOptOut member (owner-opt-out fails closed)', () => {
    expect(LIVE.enums.Permission).not.toContain('OwnerOptOut');
    expect(LIVE.enums.ListingPermission).not.toContain('OwnerOptOut');
    const guard = DEAD_OR_INVALID_VALUES.find((d) => d.value === 'OwnerOptOut');
    expect(guard?.keepAsFailClosedGuard).toBe(true);
  });
  it('the invalid Cooperative literal is NOT a live CommonInterest member', () => {
    expect(LIVE.enums.CommonInterest).not.toContain('Cooperative');
  });
});

describe('reserved dimensions: 12 placeholders, none wired', () => {
  it('all reserved dimensions are reserved | not wired | no schema | no runtime behavior', () => {
    expect(RESERVED_DIMENSIONS.length).toBe(12);
    for (const d of RESERVED_DIMENSIONS) {
      expect(isReservedOnly(d)).toBe(true);
      expect(d.wired).toBe(false);
      expect(d.schema).toBe(false);
      expect(d.runtimeBehavior).toBe(false);
    }
  });
});
