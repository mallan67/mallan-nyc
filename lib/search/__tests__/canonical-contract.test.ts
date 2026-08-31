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
  serializeCriteria, isValidSavedSearch, savedSearchVersionState, unalertableCriteria, CRITERIA_VERSION,
  // attribution
  resolveAttribution, courtesyLabel, attributionViolation,
  // capability
  isVerified, requiresLiveProbe, isUnsupported,
  // registry
  FIELD_REGISTRY, REQUIRED_FAMILIES, missingFamilies, representedFamilies, getField,
  assertCapabilityUsable, alertableFilterKeys,
  // live truth
  STANDARD_STATUS_MEMBERS, COMMON_INTEREST_MEMBERS, PROPERTY_TYPE_SALE, PROPERTY_TYPE_RENTAL,
  MLS_STATUS_FILTERABLE, DEAD_OR_INVALID_VALUES,
  // reserved
  RESERVED_DIMENSIONS, isReservedOnly,
  type CanonicalFilterKey,
} from '../canonical';
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
    // `new_development` used to be the example here. It is now VERIFIED —
    // `NewConstructionYN` is a live filterable Boolean, true on 951 Active, and
    // the registry claim that it "does not exist" was false.
    //
    // `parking` is the better example, and for a more interesting reason: its
    // FIELD is verified (GarageYN, 2,630 live true) while its SEMANTICS are not.
    // GarageYN proves a garage; the UI label also promises generic parking.
    // Token health never upgrades an unproven meaning to verified.
    const parking = getField('parking')!;
    expect(parking.filterable).toBe('needs_probe');
    expect(assertCapabilityUsable(parking, 'filterable')).toMatch(/needs_probe/);
    expect(parking.semanticEquivalenceProven).toBe(false);
  });

  it('new_development is now VERIFIED against live Cotality', () => {
    const nd = getField('new_development')!;
    expect(nd.cotalityField).toBe('NewConstructionYN');
    expect(nd.filterable).toBe('yes');
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

describe('7. saved-search criteria carries criteria_version', () => {
  it('serializeCriteria stamps the current version', () => {
    // VOCABULARY CHANGED 2026-08-28: one persistence key per BUSINESS CONCEPT,
    // not one per bound. The concept is `list_price` and the bounds live in the
    // VALUE. `price_min` / `price_max` were two keys for one criterion, which is
    // why a range had no single business identity to persist.
    const c = serializeCriteria({ filters: { list_price: { min: 1000 } }, sort: 'price_desc' });
    expect(c.criteria_version).toBe(CRITERIA_VERSION);
    expect(isValidSavedSearch(c)).toBe(true);
  });
  it('criteria without a version is invalid', () => {
    expect(isValidSavedSearch({ filters: {}, sort: 'price_desc' })).toBe(false);
    expect(savedSearchVersionState({ filters: {}, sort: 'price_desc' })).toBe('invalid');
  });
  it('a STALE version is migration_required, never read as current', () => {
    const stale = { criteria_version: CRITERIA_VERSION - 1, filters: {}, sort: 'price_desc' };
    expect(savedSearchVersionState(stale)).toBe('migration_required');
    expect(isValidSavedSearch(stale)).toBe(false); // must NOT be reinterpreted as current
  });
  it('a bogus/unmapped filter key fails loud (invalid), never accepted', () => {
    const blob = { criteria_version: CRITERIA_VERSION, filters: { totallyBogus: 1 }, sort: 'price_desc' };
    expect(savedSearchVersionState(blob)).toBe('invalid');
    expect(isValidSavedSearch(blob)).toBe(false);
  });
  it('alert-incompatible criteria are flagged (not silently saved)', () => {
    const alertable = new Set(alertableFilterKeys());
    const c = serializeCriteria({
      filters: { feature_criteria: ['doorman'], list_price: { min: 1000 } },
      sort: 'newest',
    });
    const bad = unalertableCriteria(c, alertable);
    // `amenities` was renamed `feature_criteria`: the checkbox family spans 18
    // Cotality fields including ListingAgreement, LandLeaseYN, BusinessType and
    // OwnerPays — none of which is an amenity.
    expect(bad).toContain('feature_criteria'); // still NOT alert-capable
    expect(bad).not.toContain('list_price');   // list_price IS alert-capable
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
    // Every boundary spelling of ONE concept now resolves to that ONE concept.
    // Both bounds of a range collapse onto the same key: the bound is carried in
    // the value, not encoded in the key name.
    expect(toCanonicalFilterKey('baths')).toBe('bathrooms');
    expect(toCanonicalFilterKey('minBaths')).toBe('bathrooms');
    expect(toCanonicalFilterKey('maxBaths')).toBe('bathrooms');
    expect(toCanonicalFilterKey('q')).toBe('street_address');
    expect(toCanonicalFilterKey('zipCodes')).toBe('postal_code');
    expect(toCanonicalFilterKey('keyword')).toBe('public_remarks_keyword');
    expect(toCanonicalFilterKey('propertySubType')).toBe('property_sub_type');
    expect(toCanonicalFilterKey('propertySubTypes')).toBe('property_sub_type');

    // THE ALIAS THAT WAS MISSING. The wire param has always been `status`
    // (singular) while the old table knew only `statuses`, so a saved status
    // criterion could not be resolved at all.
    expect(toCanonicalFilterKey('status')).toBe('market_status');
    expect(toCanonicalFilterKey('statuses')).toBe('market_status');

    // Legacy snake_case from rows written before this vocabulary existed.
    expect(toCanonicalFilterKey('min_price')).toBe('list_price');
    expect(toCanonicalFilterKey('close_date_from')).toBe('close_date');

    // Broker-facing listing-id search resolves the MALLAN canonical reference,
    // never the provider-evidence entry.
    expect(toCanonicalFilterKey('listingId')).toBe('listing_id_canonical');
    expect(toCanonicalFilterKey('rlsId')).toBe('listing_id_canonical');

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

/**
 * FACTUAL AUTHORITY IS NOT A PER-FIELD CONSTANT.
 *
 * Mallan uses the SAME canonical fields for Mallan-authored local listings and
 * third-party Cotality inventory. `list_price` on a local listing is authored by
 * MALLAN; on third-party inventory it is authored by Cotality/RLS. A static
 * per-field authority is therefore false half the time, and the suppressed
 * Cotality representation of a Mallan listing does not transfer authorship of
 * the local canonical value to the provider.
 *
 * The registry declares HOW authority is resolved; `AttributionEnvelope`
 * carries the answer per fact at runtime.
 */
describe("authority resolution, not a static per-field author", () => {
  const get = (k: string) => FIELD_REGISTRY.find((f) => f.canonicalKey === k)!;

  it("every entry declares how its authorship is decided", () => {
    for (const spec of FIELD_REGISTRY) {
      expect(spec.authorityResolution).toBeDefined();
    }
  });

  it("authorable listing facts are resolved BY LISTING AUTHORITY, never fixed", () => {
    // The exact category error: these are Mallan-authored on a local listing.
    for (const key of ["list_price", "street_address", "bedrooms", "bathrooms", "ownership", "media"]) {
      const spec = get(key);
      expect(spec.authorityResolution).toBe("by_listing_authority");
      // A fixed author would be a lie for half the corpus.
      expect(spec.sourceAuthority).toBeUndefined();
      expect(spec.authorityByListingKind).toEqual({
        mallanLocal: "mallan_crm",
        providerListing: "cotality",
      });
    }
  });

  it("a fixed author is declared ONLY where it is genuinely permanent", () => {
    // Provider identifiers exist only for provider records; CRM state only for Mallan.
    expect(get("listing_key").sourceAuthority).toBe("cotality");
    expect(get("mallan_exclusive").sourceAuthority).toBe("mallan_crm");
    expect(get("acris_sale_history").sourceAuthority).toBe("acris");
    for (const key of ["listing_key", "mallan_exclusive", "acris_sale_history"]) {
      expect(get(key).authorityResolution).toBe("fixed");
    }
  });

  it("UNRESOLVED is not a synonym for mallan_derived", () => {
    // Each of these has a LIVE Cotality candidate that has not been probed:
    //   achieved_rent   LeaseAmount / TotalActualRent
    //   assessment      TaxOtherAnnualAssessmentAmount
    //   price_per_sqft  CustomProperty.PricePerArea + PricePerAreaUnit
    // Declaring them Mallan-derived before probing would bake in a wrong answer.
    for (const key of ["achieved_rent", "assessment", "price_per_sqft", "owner_opt_out"]) {
      const spec = get(key);
      expect(spec.authorityResolution).toBe("unresolved");
      expect(spec.sourceAuthority).toBeUndefined();
    }
  });

  it("neighborhood is resolved BY the live NYC study; borough still is not", () => {
    // This required BOTH to stay unresolved "until the live NYC study". That
    // study ran for neighbourhood on 2026-08-31: the Search-eligible universe was
    // read exhaustively (7,770 rows, 8 pages, not truncated) for 240 distinct
    // SubdivisionName values, and geography.ts now emits only values from that
    // list. Every term is one the provider itself carries — identity, not an
    // asserted equivalence — so holding it at `unresolved` would now be the
    // inaccurate state.
    //
    // It also found the reason the hold was right: reversing the RLS alias file
    // had been merging distinct neighbourhoods, so Williamsburg returned Bushwick
    // and Ridgewood, which is in Queens.
    expect(get("neighborhood").authorityResolution).toBe("fixed");
    expect(get("neighborhood").sourceAuthority).toBe("cotality");

    // BOROUGH IS A DIFFERENT QUESTION and stays provisional. The open item there
    // is which provider fact is canonical — CountyOrParish is a COUNTY, not a
    // borough — and no study has settled that. Resolving it here merely because
    // its neighbour resolved is exactly the inference this file forbids.
    expect(get("borough").authorityResolution).toBe("unresolved");
  });

  it("pipeline lineage is a separate concept, not a canonical source", () => {
    // The canonical key `source` was RENAMED to `provider_lineage`, because the
    // model — not just the note — was wrong. SourceSystem*/OriginatingSystem*
    // describe RLS -> REBNY -> Trestle. On 35 live Mallan-office rows
    // SourceSystemName and SourceSystemKey were BOTH 0/35.
    expect(FIELD_REGISTRY.find((f) => f.canonicalKey === "source")).toBeUndefined();
    const lineage = get("provider_lineage");
    expect(lineage.notes).toMatch(/pipeline/i);
    // Lineage is evidence, never a Search axis.
    expect(lineage.filterable).toBe("no");
    expect(lineage.sortable).toBe("no");
    expect(lineage.reportable).toBe("no");
  });

  it("provider ListingKey and Mallan listing_id are DIFFERENT identity domains", () => {
    // Schema documents Listing.listing_id as "Trestle ListingId OR internal
    // SL-/RL- prefix", while ListingsArchive.listing_key is "Trestle ListingKey".
    // Mapping ListingKey onto the ListingId column conflates two identifiers.
    const key = get("listing_key");
    expect(key.cotalityField).toBe("ListingKey");
    expect(key.dbColumn).not.toBe("listing_id");
    // ListingKey is not in any typed Listing column — raw_data carries it.
    expect(key.dbColumn).toBeNull();

    const canonicalListingId = get("listing_id_canonical");
    expect(canonicalListingId.notes).toMatch(/DUAL-DOMAIN/i);
  });
});
