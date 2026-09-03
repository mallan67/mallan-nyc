/**
 * ONE MAPPING AUTHORITY, OR IT IS NOT AN AUTHORITY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING THIS FILE EXISTS FOR
 *
 * `field-registry.ts` opens with "THE CANONICAL SEARCH MAPPING AUTHORITY".
 * The authenticated Search executor — `app/api/idx/search/route.ts` →
 * `lib/search/crm-idx-filter.ts` — has never imported it. It carries its own
 * `searchParam → Cotality field` table:
 *
 *     ["minPrice", "ListPrice",              "ge", false],
 *     ["minBeds",  "BedroomsTotal",          "ge", true ],
 *     ["minBaths", "BathroomsTotalInteger",  "ge", false],
 *     …16 rows…
 *
 * A census (`scripts/search/registry-vs-executor-census.mjs`) measured the
 * divergence rather than asserting it:
 *
 *   - 16 numeric criterion→field mappings exist ONLY in the executor;
 *   - 16 further params the executor reads have no registry entry at all;
 *   - the registry's `searchParam` column was PROSE — values like
 *     `"minPrice/maxPrice"`, `"beds/maxBeds"`, `"amenities:pet-friendly"` —
 *     so there was no key any consumer could join on. The registry could not
 *     have been authoritative in that shape even if a reader had wanted to be
 *     driven by it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TEST FIXES IN PLACE
 *
 * It does not move the mapping yet. It makes the two tables JOINABLE and then
 * forbids them to disagree, which is what makes moving the mapping a provable
 * refactor instead of a rewrite. Concretely, every criterion the executor can
 * actually ask Cotality about must resolve to exactly one registry entry, and
 * where both name a provider field they must name the SAME one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE FACT, ONE OWNER
 *
 * Five canonical modules already own their own provider mapping properly —
 * status, geography, checkbox, property type and property sub-type. For those,
 * the registry entry declares the OWNER and deliberately does not restate the
 * Cotality field. Restating it would recreate the same two-tables problem one
 * level down, and it is how `borough` came to say `CountyOrParish` in the
 * registry while the executor queries `CityRegion`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT A PROVIDER CLAIM
 *
 * Nothing here asserts a Cotality fact. It compares two Mallan tables to each
 * other. Field truth still comes only from the live authenticated Cotality API
 * (CLAUDE.md §A.0), and the owning modules carry their own probe records.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIELD_REGISTRY, executionReadiness, type FieldSpec } from '../canonical/field-registry';
import { CANONICAL_FILTER_KEYS } from '../canonical/filter-keys.generated';
import { DEFAULT_MARKET_STATUS_TOKENS, standardStatusOData } from '../canonical/status-token-contract';

const REPO = resolve(__dirname, '../../..');
const EXECUTOR_PATH = 'lib/search/crm-idx-filter.ts';
const executorSrc = readFileSync(resolve(REPO, EXECUTOR_PATH), 'utf8');

const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/** `["minPrice", "ListPrice", "ge", false]` — the executor's private table. */
function numericMappings(): Array<{ param: string; field: string }> {
  const out: Array<{ param: string; field: string }> = [];
  const re = /\[\s*"([A-Za-z_]+)"\s*,\s*"([A-Za-z]+)"\s*,\s*"(?:ge|le|gt|lt|eq)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(executorSrc))) out.push({ param: m[1], field: m[2] });
  return out;
}

/** Every `params.get("x")` the executor performs. */
function paramsRead(): string[] {
  const out = new Set<string>();
  const re = /params\.get\(\s*"([^"]+)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(executorSrc))) out.add(m[1]);
  return [...out].sort();
}

/**
 * Params that select a Mallan business universe rather than a Cotality field.
 * `type` picks Sale vs Rental, which `property-type-universe` renders; it is a
 * workflow selector, not a criterion, and giving it a registry entry would put
 * a non-field in a field table.
 */
const WORKFLOW_SELECTORS = new Set(['type']);

/**
 * Params the executor reads to resolve a KNOWN identity, not to search for one.
 *
 * `listingKey` is a live Cotality field and it does filter - but a broker never
 * types one. It has no control anywhere in `public/crm/html`, and the identity a
 * broker actually knows (the RLS number) is already a criterion, owned by
 * `listing_id_canonical` with `criterionRole: 'broker_input'`. `listingKey` is
 * how Compare re-reads rows the broker already selected and then paged away
 * from: the identity is supplied by a prior result, never by a search form.
 *
 * That is a different thing from a criterion, and the registry says so - these
 * stay `non_search_fact`. Calling one `broker_input` to satisfy this guard would
 * put "Provider Listing Key" into SaleCriteria, RentalCriteria, BuildingCriteria
 * and ComparableCriteria, and Building Search returns BUILDINGS. The generated
 * criterion vocabulary is a product surface; it must not grow to accommodate an
 * internal resolver.
 *
 * This is NOT an escape hatch. Membership is checked below: each one must still
 * be registry-owned, still `non_search_fact`, and still carry proven live
 * provider filterability. Only the CRITERION claim is withheld.
 */
const IDENTITY_RESOLVERS = new Map([['listingKey', 'listing_key']]);


function registryByParam(): Map<string, FieldSpec[]> {
  const byParam = new Map<string, FieldSpec[]>();
  for (const spec of FIELD_REGISTRY) {
    for (const param of spec.searchParams ?? []) {
      const list = byParam.get(param) ?? [];
      list.push(spec);
      byParam.set(param, list);
    }
  }
  return byParam;
}

describe('the extraction itself works', () => {
  // Guard the guard. A regex that stops matching would make every assertion
  // below vacuously true, which is the exact failure mode this whole file is
  // about: a table that looks authoritative and answers nothing.
  it('finds the executor numeric table', () => {
    // 14, not 16. minBaths/maxBaths LEFT this table in Section 5: bathrooms have
    // a canonical mapping owner, and a generic `field op value` row cannot
    // express `BathroomsFull` + `BathroomsHalf`. The table shrinking is the
    // consolidation working — a criterion with a real owner should not also have
    // a generic row that can disagree with it.
    expect(numericMappings().length).toBeGreaterThanOrEqual(14);
  });

  it('does NOT carry a generic row for a criterion that has a mapping owner', () => {
    // The bathrooms defect in one assertion: a generic `BathroomsTotalInteger`
    // row sat here while `bath-contract.ts` rejected that field outright, so the
    // Prisma engine and the provider engine answered the same question
    // differently and nothing forced them to agree.
    const generic = numericMappings().map((m) => m.param);
    expect(generic).not.toContain('minBaths');
    expect(generic).not.toContain('maxBaths');
  });

  it('finds the params the executor reads', () => {
    expect(paramsRead().length).toBeGreaterThanOrEqual(20);
  });

  it('finds registry entries carrying structured search params', () => {
    expect(registryByParam().size).toBeGreaterThanOrEqual(20);
  });
});

describe('every criterion the executor can ask about is registry-backed', () => {
  const byParam = registryByParam();

  it('no param the executor reads is outside the registry', () => {
    const orphans = paramsRead()
      .filter((p) => !WORKFLOW_SELECTORS.has(p))
      .filter((p) => !IDENTITY_RESOLVERS.has(p))
      .filter((p) => !byParam.has(p));
    // Named individually so a failure says WHICH criterion escaped the
    // authority, not merely that one did.
    expect(orphans).toEqual([]);
  });

  it('no numeric mapping is outside the registry', () => {
    const orphans = numericMappings()
      .map((n) => n.param)
      .filter((p) => !byParam.has(p));
    expect(orphans).toEqual([]);
  });

  it('a param resolves to exactly one entry — two owners is the bug', () => {
    const ambiguous = [...byParam.entries()]
      .filter(([, specs]) => specs.length > 1)
      .map(([param, specs]) => `${param} → ${specs.map((s) => s.canonicalKey).join(', ')}`);
    expect(ambiguous).toEqual([]);
  });
});

describe('where both name a provider field, they name the same one', () => {
  const byParam = registryByParam();

  it.each(numericMappings())('$param → $field', ({ param, field }) => {
    const spec = byParam.get(param)?.[0];
    expect(spec).toBeDefined();
    const entry = spec as FieldSpec;
    // A numeric range criterion is mapped by the registry itself — there is no
    // subordinate module for it — so the registry must carry the field.
    expect(entry.mappingOwner ?? null).toBeNull();
    expect(entry.cotalityField).toBe(field);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MUTATION GUARDS — nobody introduces a criterion outside the authority graph.
 *
 * The point of B1 is not that the graph is correct once. It is that a future
 * change CANNOT leave it incorrect quietly. Each assertion below fails on a
 * specific way the graph could be broken, and names the offender.
 */
describe('mutation guards — the authority graph cannot be bypassed', () => {
  it('the persistence vocabulary is GENERATED from the entries, not restated', () => {
    // One declaration — the registry entries. Everything else is derived.
    const fk = read('lib/search/canonical/filter-keys.ts');
    expect(fk).toMatch(/from '\.\/filter-keys\.generated'/);
    // No hand-written union anywhere.
    expect(fk).not.toMatch(/export type CanonicalFilterKey\s*=\s*\n?\s*\|/);
    const registry = read('lib/search/canonical/field-registry.ts');
    expect(registry).not.toMatch(/export const CANONICAL_FILTER_KEYS\s*=\s*\[/);
  });

  it('the generated vocabulary is CURRENT — regenerate, do not hand-edit', () => {
    // THE check that makes drift impossible. A stale generated file fails here,
    // and the fix is to run the generator, never to edit the output. This is
    // what a hand-written list plus a "they must agree" assertion could never
    // give: there is nothing to keep in agreement.
    const committed = read('lib/search/canonical/filter-keys.generated.ts');
    // Membership is the BUSINESS ROLE, not whether transport exists. This
    // derived `searchParams !== undefined`, which is the backwards rule the
    // registry no longer uses: it excluded `pets` and `furnished` (verified
    // facts CURRENT.md names for Rental Search) because no URL parameter had
    // been wired, and admitted `map_grid_filter`, a raw viewport predicate that
    // Search explicitly refuses, because one had.
    const derived = FIELD_REGISTRY.filter((f) => f.criterionRole === 'broker_input')
      .map((f) => f.canonicalKey)
      .sort();

    for (const key of derived) {
      expect(committed).toContain(`  '${key}',`);
    }
    const committedKeys = [...committed.matchAll(/^  '([a-z_]+)',$/gm)].map((m) => m[1]);
    expect(committedKeys.sort()).toEqual(derived);
  });

  it('SORT is not a filter criterion', () => {
    // `SavedSearchCriteria` carries `sort` as its own field. Admitting it to the
    // filter vocabulary would allow `filters.sort = 'price_desc'` alongside
    // `sort = 'newest'` — two sort truths in one object.
    expect(CANONICAL_FILTER_KEYS as readonly string[]).not.toContain('sort');
    const fk = read('lib/search/canonical/filter-keys.ts');
    expect(fk).not.toMatch(/^\s*sort: 'sort',/m);
  });

  it('the registry does NOT import a derivative that is generated from it', () => {
    // The registry imports the generated vocabulary's TYPE, so nothing reachable
    // from the generated file may import the registry back.
    //
    // This used to assert the generated file imported NOTHING. That was a proxy
    // for acyclicity, and it stopped being true the moment the file legitimately
    // needed the value primitives — a guard that fails on a safe change while
    // still not checking the real property. Walk the graph instead.
    const reached = new Set<string>();
    const walk = (path: string) => {
      if (reached.has(path)) return;
      reached.add(path);
      for (const m of read(path).matchAll(/from '\.\/([A-Za-z0-9._-]+)'/g)) {
        walk(`lib/search/canonical/${m[1]}.ts`);
      }
    };
    walk('lib/search/canonical/filter-keys.generated.ts');
    expect([...reached]).not.toContain('lib/search/canonical/field-registry.ts');

    const registry = read('lib/search/canonical/field-registry.ts');
    expect(registry).not.toMatch(/import[^;]*from '\.\/filter-keys';/);
  });

  it('there is no separate filterKeys field to disagree with the entry', () => {
    // The persistence key IS the canonicalKey. A `filterKeys` property was a
    // restatement of the entry, and a restatement is something that can be wrong.
    const registry = read('lib/search/canonical/field-registry.ts');
    expect(registry).not.toMatch(/filterKeys\?:/);
    expect(registry).not.toMatch(/ filterKeys: \[/);
  });

  it('an unsupported criterion never also claims alertable/sortable capability', () => {
    const contradictory = FIELD_REGISTRY.filter(
      (s) => s.filterable === 'unsupported' && (s.alertable === 'yes' || s.sortable === 'yes'),
    ).map((s) => s.canonicalKey);
    expect(contradictory).toEqual([]);
  });

  it('promoting a criterion to filterable:yes requires a deliberate edit here', () => {
    // "yes" means VERIFIED WORKING against live Cotality; "needs_probe" means not
    // yet. Pinned as an explicit SET rather than inferred from note prose — an
    // earlier cut regex-matched for "VERIFIED LIVE" and reported 7 offenders where
    // there were 12, which is a check that gets tuned until the number matches
    // instead of failing honestly. A declared set cannot be tuned.
    const verified = FIELD_REGISTRY.filter((f) => f.filterable === 'yes')
      .map((f) => f.canonicalKey)
      .sort();

    // SEVEN Search criteria were demoted to 'needs_probe' on 2026-08-28:
    // street_address, postal_code, list_price, bedrooms, bathrooms, living_area
    // and ownership. The shared CapabilityStatus contract defines 'yes' as
    // verified against live Cotality and `isVerified('yes')` returns true; none
    // of the seven had a probe record. Redefining 'yes' downward to keep their
    // labels would have corrupted every other consumer of that contract.
    //
    // SIXTEEN PROMOTED 2026-08-31 (Section 5.F) — by probe, not by declaration.
    // Each was run against LIVE Cotality using the EXACT expression the executor
    // emits, establishing operator support, a positive hit, an exclusion that
    // actually excludes, null/sentinel behaviour, and survival beside the real
    // Sale universe. Evidence:
    // artifacts/section5f-executor-operator-probe-2026-08-31.json.
    //
    // The probe was not a formality. It found a wrong answer in production:
    // `NumberOfUnitsTotal le N` admitted 267,772 rows (76.9%) with no unit count,
    // and `LivingArea le N` admitted 151,463 (89.9%) with no area, because both
    // fields encode "not specified" as an in-band 0 or -1 rather than null. Those
    // criteria were CORRECTED before promotion, not promoted around.
    //
    // `public_remarks_keyword` was deliberately NOT promoted: contains() on
    // PublicRemarks never returned across five attempts and every shape, which is
    // UNVERIFIED — neither supported nor refused — and stays needs_probe.
    expect(verified).toEqual([
      'activity_date',
      'bathrooms',
      'bedrooms',
      'borough',
      'building_name',
      'close_date',
      'furnished',
      'list_price',
      'listing_contract_date',
      'listing_id_canonical',
      // PROMOTED 2026-09-01 by probe, for a defect it was hiding. The Search
      // row id is a Cotality ListingKey, and ListingKey is a SEPARATE provider
      // field from ListingId with a non-overlapping value space (live pair:
      // ListingKey 1189389648 / ListingId RLS20112214). Compare hydration sent
      // Search ids through the ListingId criterion, which renders
      // `ListingId eq ...` and returned nothing — silently, with no error.
      //
      // Probed live against api.cotality.com with the EXACT expressions the
      // executor now emits:
      //   ListingKey eq '1189389648'                              -> count 1
      //   (ListingKey eq '1189389648' or ListingKey eq '1189389647') -> count 2
      //   ListingId  eq '1189389648'                              -> count 0
      'listing_key',
      'listing_universe',
      'living_area',
      'mallan_exclusive',
      'market_status',
      'media_category',
      'media_classification',
      'media_display_permission',
      'media_status',
      'neighborhood',
      'new_development',
      // PROMOTED 2026-09-01/02 by probe, from `needs_probe`. It had been
      // blocked (2026-08-29, Maya) because the implementation applied it
      // AFTER pagination - a wrong answer, not a missing one. That is fixed:
      // membership is settled before count and page cut.
      //
      // Filterable ON THE OpenHouse RESOURCE, which is the nuance this entry
      // must not lose - it is NOT a Property $filter clause. Probed live
      // against api.cotality.com:
      //   OpenHouse                                        $count 1993
      //   OpenHouseDate ge <today> and le <+30d>           -> 1970
      //   ... and OpenHouseStatus eq 'Active'              accepted
      //   $orderby OpenHouseDate asc                       accepted
      //   Property.ListingKey eq <OpenHouse.ListingKey>    -> 1
      //   Property.ListingId  eq <OpenHouse.ListingKey>    -> 0
      //
      // The last pair is why membership reconciles on ListingKey only: the
      // domains do not overlap, so the wrong one returns an empty 200 that
      // reads exactly like "no listing has an open house".
      'open_house',
      // RESTORED: ownership carries a genuine 2026-08-21 exhaustive Active census
      // (Condominium 3,722 / StockCooperative 2,509 / ... = 8,015 = ne null
      // exactly), now recorded as structured liveEvidence. I demoted it in the
      // first pass without checking whether its evidence should be STRUCTURED
      // rather than the capability lowered.
      'ownership',
      'pets',
      'postal_code',
      'property_sub_type',
      'rooms_total',
      'stories_total',
      'street_address',
      'structure_type',
      'transaction_type',
      'unit',
      'units_total',
      'year_built',
    ]);
  });

  it('ANYTHING THE EXECUTOR CAN RUN IS VERIFIED, REFUSED, OR EXPLICITLY NOT WIRED', () => {
    // REPLACED a test titled "and only ONE Search criterion is fully verified
    // executable today", which asserted three properties of `market_status` and
    // proved nothing about the count in its own title. Once sixteen criteria were
    // promoted it was a historical sentence frozen into an assertion, and its
    // explanation — that bathrooms queries BathroomsTotalInteger — described code
    // deleted in Section 5.
    //
    // THE INVARIANT THAT ACTUALLY MATTERS, derived rather than declared:
    // a criterion the live executor can run must be verified_executable, or
    // carry a named refusal, or be explicitly not_yet_wired. A criterion sitting
    // at needs_probe / mapping_conflict / no_strategy WHILE EXECUTING is the
    // Section 5 defect in one sentence — the authority model saying "unproven"
    // while the executor says "go".
    //
    // This is why the previous census could report CLEAN while `neighborhood`
    // ran with semanticEquivalenceProven: false: nothing compared what executes
    // against what is proven.
    // A PARAM IS REFUSED IF READING IT LEADS TO A THROW — not if its name happens
    // to match the error label. Those differ: the financing bounds are
    // `financingMin`/`financingMax` while the error reads
    // `UnsupportedSearchCriterionError("financing", …)`, because "financing" is
    // the better message for a broker. Matching on the label alone reported
    // max_financing_percent as executing-unproven when it is refused outright.
    const refusesParam = (param: string): boolean => {
      const re = new RegExp(`params\\.get\\("${param}"\\)`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(executorSrc))) {
        // The refusal is the next thing that happens to the value it read.
        if (/UnsupportedSearchCriterionError/.test(executorSrc.slice(m.index, m.index + 600))) return true;
      }
      return false;
    };

    // Guard the guard, both directions: the scan must find the known refusals,
    // and must NOT call an executing criterion refused — otherwise everything
    // would look refused-and-therefore-fine and the whole check would be vacuous.
    expect(refusesParam('managementCompany')).toBe(true);
    expect(refusesParam('keyword')).toBe(true);
    expect(refusesParam('financingMin')).toBe(true);
    expect(refusesParam('gridFilter')).toBe(true);
    expect(refusesParam('zip')).toBe(false);
    expect(refusesParam('neighborhood')).toBe(false);

    const executedParams = new Set([...paramsRead(), ...numericMappings().map((n) => n.param)]);

    const offenders: string[] = [];
    for (const spec of FIELD_REGISTRY) {
      if (spec.criterionRole !== 'broker_input') continue;
      const params = spec.searchParams ?? [];
      if (params.length === 0) continue;
      // Does the executor act on any of this criterion's params at all?
      if (!params.some((p) => executedParams.has(p))) continue;
      // A criterion refused by name is a named, honest boundary.
      if (params.some((p) => refusesParam(p))) continue;

      // strategyImplemented: the executor demonstrably acts on it. reachesServer
      // is asserted separately by the transport invariant; assuming it here would
      // let a transport-broken criterion read as fully wired.
      const readiness = executionReadiness(spec, { reachesServer: true, strategyImplemented: true });
      if (readiness !== 'verified_executable' && readiness !== 'not_yet_wired') {
        offenders.push(`${spec.canonicalKey} → ${readiness}`);
      }
    }
    // Fails BY CRITERION so the failure names what is executing unproven.
    expect(offenders).toEqual([]);
  });

  it('the canonical persistence shape is versioned past the incompatible change', () => {
    // The vocabulary changed incompatibly — one key per concept instead of one
    // per bound, plus renames. Leaving the version at 1 would let a v2 blob be
    // read as v1 and silently reinterpreted, which is exactly what
    // savedSearchVersionState exists to prevent.
    const ss = read('lib/search/canonical/saved-search.ts');
    expect(ss).toMatch(/export const CRITERIA_VERSION = 2 as const;/);
  });
});

describe('the registry answers each key once', () => {
  it('no canonicalKey appears twice', () => {
    // `standard_status` and `mls_status` each had TWO entries. `getField()` is a
    // `.find()`, so the FIRST won and the second — the live-verified 2026-08-22
    // one, carrying the direct $orderby probe and the provider-suppression
    // evidence — was unreachable. An authority that holds two answers for one
    // key and silently returns the older one is not an authority.
    const seen = new Map<string, number>();
    for (const spec of FIELD_REGISTRY) {
      seen.set(spec.canonicalKey, (seen.get(spec.canonicalKey) ?? 0) + 1);
    }
    const duplicated = [...seen.entries()]
      .filter(([, n]) => n > 1)
      .map(([key, n]) => `${key} ×${n}`);
    expect(duplicated).toEqual([]);
  });

  it('a criterion names its provider field one way, not two', () => {
    // `cotalityField` is a single slot and `cotalityFields` is the enumerated
    // composite. Carrying both would put the same criterion in two shapes and
    // leave every reader to guess which one is current.
    const both = FIELD_REGISTRY.filter(
      (s) => s.cotalityField != null && (s.cotalityFields?.length ?? 0) > 0,
    ).map((s) => s.canonicalKey);
    expect(both).toEqual([]);
  });
});

describe('one fact, one owner', () => {
  it('an entry that delegates its mapping does not also restate the field', () => {
    // This is how `borough` drifted: the registry said `CountyOrParish` while
    // `geography.ts` — which actually renders the clause, and carries the live
    // probe record — emits `CityRegion`. Two files describing one mapping is
    // the problem, not the specific value either of them held.
    const restating = FIELD_REGISTRY.filter(
      (s) => s.mappingOwner != null && s.cotalityField != null,
    ).map((s) => `${s.canonicalKey} (owner=${s.mappingOwner}, field=${s.cotalityField})`);
    expect(restating).toEqual([]);
  });

  it('every declared owner is a module the executor actually delegates to', () => {
    const delegated = new Set<string>();
    const re = /from\s*"@\/lib\/search\/canonical\/([a-z-]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(executorSrc))) delegated.add(m[1]);

    const owners = new Set(
      FIELD_REGISTRY.map((s) => s.mappingOwner).filter((o): o is string => o != null),
    );
    const unknownOwners = [...owners].filter((o) => !delegated.has(o));
    // An owner nobody delegates to is a claim with no code behind it.
    expect(unknownOwners).toEqual([]);
  });

  it('a criterion the executor REFUSES is recorded as refused, not omitted', () => {
    // `managementCompany` throws `UnsupportedSearchCriterionError` because
    // Cotality declares no such Property field and list office is a different
    // fact. The refusal is part of the contract, so it belongs in the registry
    // with an unusable capability — omitting it would make the registry look
    // like it had never heard of a criterion the UI can send.
    expect(executorSrc).toMatch(/UnsupportedSearchCriterionError\("managementCompany"/);
    const spec = registryByParam().get('managementCompany')?.[0];
    expect(spec).toBeDefined();
    expect((spec as FieldSpec).filterable).toBe('unsupported');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXECUTION READINESS IS NOT `filterable`.
 *
 * `filterable` answers a PROVIDER question — can this be expressed as a Cotality
 * filter. Runtime readiness asks whether Mallan may execute it NOW, and depends
 * on facts `filterable` does not carry. Conflating them is how a registry
 * becomes documentation instead of enforcement.
 *
 * `executionReadiness()` in the registry is the AUTHORITY; the matrix script is a
 * source-parsed report of the same facts. These cases pin the function itself so
 * the canonical validator has ONE definition to call.
 */
describe('execution readiness — the gate the validator will use', () => {
  const spec = (key: string) => FIELD_REGISTRY.find((f) => f.canonicalKey === key)!;
  const wired = { reachesServer: true, strategyImplemented: true };

  it('a mapping conflict outranks everything — it executes, and executes WRONGLY', () => {
    // NO REGISTRY ENTRY CARRIES ONE ANY MORE, so this uses a synthetic spec.
    //
    // Section 5 resolved both: `bathrooms` routed to the BathroomsTotalInteger
    // field its own contract rejects, and `listing_id_canonical` sent Mallan
    // SL-/RL- references to a provider that has never heard of them. The rule
    // still needs pinning — a conflict must outrank capability, evidence and
    // transport, because executing wrongly is worse than not executing.
    const synthetic = {
      ...spec('market_status'),
      canonicalKey: 'synthetic_conflict',
      mappingConflict: 'the executor queries a field this contract rejects',
    } as FieldSpec;
    expect(executionReadiness(synthetic, wired)).toBe('mapping_conflict');
  });

  it('no registry entry carries an unresolved mapping conflict', () => {
    // The Section 5 objective, stated as an invariant rather than a milestone.
    // A conflict means two owners answer the same question differently, and
    // nothing forces them to agree.
    const conflicted = FIELD_REGISTRY.filter((f) => f.mappingConflict).map((f) => f.canonicalKey);
    expect(conflicted).toEqual([]);
  });

  it('a DUAL-DOMAIN identifier is refused at the executor, not sent to the wrong provider', () => {
    // RESOLVED in Section 5, so this no longer asserts a registry conflict.
    //
    // `listing_id_canonical` holds either a Cotality ListingId or a Mallan
    // SL-/RL- reference, and the executor emitted `ListingId eq` for EVERY value
    // with no domain check — so searching a Mallan listing by its own reference
    // queried a provider that has never heard of it and returned an empty set
    // indistinguishable from "no such listing".
    //
    // The refusal now lives where it belongs, in the executor, and is proven
    // behaviourally in crm-idx-filter.test.ts. What remains asserted here is that
    // the criterion no longer carries an unresolved conflict.
    expect(spec('listing_id_canonical').mappingConflict).toBeUndefined();
    expect(spec('listing_id_canonical').notes ?? '').toMatch(/REFUSED BY NAME/);
  });

  it('a criterion with strategy, transport, live evidence and proven semantics is verified', () => {
    expect(spec('market_status').executionStrategy).toBe('provider_filter');
    expect(executionReadiness(spec('market_status'), wired)).toBe('verified_executable');
  });

  it('capability short of yes on the provider path is needs_probe', () => {
    // The EXAMPLE moved on 2026-08-31; the rule did not. This used `list_price`,
    // which was demoted to needs_probe on 2026-08-28 for having no probe record
    // and was promoted back by the Section 5.F probe batch.
    //
    // `public_remarks_keyword` now carries the case, and carries it better,
    // because it is unverified for the most interesting reason: the provider
    // never REFUSED `contains(PublicRemarks,...)`. It simply never answered —
    // five attempts, every shape, each aborting with no HTTP status — while the
    // identical shape on BuildingName returns a row immediately.
    //
    // Not answering is not the same as refusing, and neither is the same as
    // working. A query that never returns is not a capability.
    expect(spec('public_remarks_keyword').filterable).toBe('needs_probe');
    expect(executionReadiness(spec('public_remarks_keyword'), wired)).toBe('needs_probe');
  });

  it('the provider refusing a criterion is NOT the same as it being unexecutable', () => {
    // Both are filterable:'unsupported'. management_company has no Mallan-side
    // path and never will — a real permanent refusal. max_financing_percent
    // cannot be provider-filtered either (the value lives inside an Edm.String
    // that $filter cannot reach) but HAS a specified Mallan strategy, so it is
    // merely not wired yet. Collapsing these would make a legitimate criterion
    // permanently unexecutable even after Mallan implements it correctly.
    expect(executionReadiness(spec('management_company'), wired)).toBe('unsupported');
    expect(spec('max_financing_percent').executionStrategy).toBe('mallan_projection_filter');
    // Realistic facts: nothing implements the Mallan-side path and the value
    // never reaches the server. not_yet_wired — a repairable state — where
    // management_company is a permanent refusal. Fully wired it would still be
    // needs_probe, because the 0.00 sentinel and the listing-vs-building
    // disagreements are unresolved semantics.
    expect(
      executionReadiness(spec('max_financing_percent'), { reachesServer: false, strategyImplemented: false }),
    ).toBe('not_yet_wired');
  });

  it('a criterion that never reaches the server is not_yet_wired, not verified', () => {
    expect(
      executionReadiness(spec('unit'), { reachesServer: false, strategyImplemented: true }),
    ).toBe('not_yet_wired');
  });

  it('a criterion whose strategy is not implemented is not_yet_wired', () => {
    expect(
      executionReadiness(spec('year_built'), { reachesServer: true, strategyImplemented: false }),
    ).toBe('not_yet_wired');
  });

  it('a PROVEN provider field with UNPROVEN equivalences is not verified', () => {
    // THE EXAMPLE MOVED; THE RULE DID NOT. This used `neighborhood`: geography.ts
    // proved CityRegion and SubdivisionName exist and are filterable, but not the
    // 593 alias equivalences generated 2026-03-19 against an RLS-era
    // understanding. Field existence and equivalence correctness are DIFFERENT
    // PROOFS and the model must not collapse them.
    //
    // Neighbourhood no longer makes an equivalence claim at all — it emits only
    // values the feed itself carries — so it is the wrong example now.
    // `max_financing_percent` carries the case instead, and carries it well: the
    // field is proven live and densely populated (6,803 of 8,010 Active), and its
    // MEANING is still open, because 0.00 is a not-specified sentinel rather than
    // a 0% limit and 380 of 3,402 buildings disagree with themselves across their
    // own listings.
    expect(spec('max_financing_percent').liveEvidence).toBeDefined();
    expect(spec('max_financing_percent').semanticEquivalenceProven).toBe(false);
    expect(executionReadiness(spec('max_financing_percent'), wired)).toBe('needs_probe');

    // And the neighbourhood half of the lesson, kept as the positive case: a
    // criterion that matches the provider's OWN values makes no equivalence claim
    // to prove.
    expect(spec('neighborhood').semanticEquivalenceProven).toBe(true);
  });

  it('live evidence is STRUCTURED, never inferred from note prose', () => {
    // year_built's note contains the words "probe record" inside the sentence
    // "had no probe record for" it. The old prose scan read the ABSENCE of
    // evidence as evidence and reported it live-verified.
    //
    // That sentence is STILL THERE, and year_built is now genuinely probed — so
    // the file currently holds a note whose prose reads unverified beside
    // structured evidence proving otherwise. That is not a contradiction to tidy
    // away: it is the strongest possible statement of the rule. Prose is history
    // and reasoning; `liveEvidence` is the fact. Only one of them may be read as
    // proof, and a scanner that reads the other gets this criterion exactly
    // backwards in both directions.
    expect(spec('year_built').notes).toMatch(/no probe record/);
    expect(spec('year_built').liveEvidence?.probedAt).toBe('2026-08-31');
    expect(spec('market_status').liveEvidence?.probedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The ABSENCE half of the rule still needs a live example, or a bug that
    // stamped evidence onto everything would pass this test.
    expect(spec('public_remarks_keyword').liveEvidence).toBeUndefined();
  });

  it('ONE canonical entry per business fact — no same-concept duplicate', () => {
    // I created one: max_financing and max_financing_percent both described the
    // building financing limit, and the duplicate-KEY guard missed it because the
    // two canonicalKey strings differ. Normalising the human label catches what a
    // string comparison cannot.
    const seen = new Map<string, string[]>();
    for (const f of FIELD_REGISTRY) {
      const label = f.uiLabel.toLowerCase().replace(/[^a-z0-9]/g, '');
      seen.set(label, [...(seen.get(label) ?? []), f.canonicalKey]);
    }
    const duplicates = [...seen.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([label, keys]) => `${label}: ${keys.join(', ')}`);
    expect(duplicates).toEqual([]);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SECTION 5 — ONE EXECUTION OWNER PER EXECUTABLE CRITERION.
 *
 * The section above proves the two tables JOIN and do not disagree. That is
 * necessary and not sufficient: a criterion can join cleanly and still have
 * nobody who owns HOW it runs, or have a second copy of its vocabulary sitting
 * in the executor waiting to drift.
 *
 * These cases pin the two remaining ownership questions.
 */
describe('section 5 — every executable criterion has exactly one execution owner', () => {
  const spec = (key: string) => FIELD_REGISTRY.find((f) => f.canonicalKey === key)!;
  const unwired = { reachesServer: false, strategyImplemented: false };

  it('BOTH CustomFields criteria are classified the same way, because they are the same case', () => {
    // `max_financing_percent` and `sponsor_unit` are one situation: a real,
    // decodable fact living inside `CustomProperty.CustomFields`, a declared
    // Edm.String that `$filter` cannot reach into. Neither is provider-filterable
    // and both are legitimately executable Mallan-side over the complete universe.
    //
    // They were classified DIFFERENTLY. max_financing_percent carried
    // `executionStrategy: 'mallan_projection_filter'` and therefore read as
    // not_yet_wired — repairable. sponsor_unit carried no strategy at all, so
    // `executionReadiness()` hit its `filterable === 'unsupported' && !strategy`
    // branch and returned `unsupported` — the verdict reserved for a PERMANENT
    // refusal like management_company, which Cotality has no field for and never
    // will.
    //
    // That is the same category error the registry header warns about, one level
    // down: a criterion Mallan simply has not built yet was recorded as one
    // Mallan can never build. Section 6 would then have had no reason to look at
    // it again.
    for (const key of ['max_financing_percent', 'sponsor_unit']) {
      const s = spec(key);
      expect(`${key}:${s.cotalityField ?? 'null'}`).toBe(`${key}:CustomProperty.CustomFields`);
      expect(`${key}:${s.filterable}`).toBe(`${key}:unsupported`);
      expect(`${key}:${s.executionStrategy}`).toBe(`${key}:mallan_projection_filter`);
      expect(`${key}:${executionReadiness(s, unwired)}`).toBe(`${key}:not_yet_wired`);
    }
  });

  it('and a criterion the provider genuinely cannot express stays a permanent refusal', () => {
    // The guard-the-guard for the case above: if declaring a Mallan strategy
    // moved EVERYTHING out of `unsupported`, the distinction would be worthless.
    // management_company must not follow sponsor_unit out of that state.
    expect(spec('management_company').executionStrategy).toBeUndefined();
    expect(executionReadiness(spec('management_company'), unwired)).toBe('unsupported');
  });

  it('the CommonInterest vocabulary is declared ONCE, and not by the executor', () => {
    // THREE copies of this 13-member list existed. `live-truth.ts` owns it, read
    // from data/cotality-enums.live.json. `ownership.ts` restated it as
    // CLASSIFY + OTHER_MEMBERS. The executor kept a private `COMMON_INTEREST` Set
    // of its own. All three agreed at the time of writing, which is precisely why
    // it was worth fixing: identical copies do not announce themselves until the
    // day someone updates one of them, and then the executor validates broker
    // input against a vocabulary the provider no longer has.
    //
    // Asserted on SUBSTANCE, not on a variable name. Renaming the Set must not
    // make this pass — what matters is that the member literals live in exactly
    // one place. `Condop` is the sharpest probe: it is NYC-specific, it appears
    // in no other vocabulary, and nothing else in the executor would mention it.
    const members = ['Condominium', 'StockCooperative', 'Condop', 'BareLandCondominium', 'PlannedDevelopment'];
    const hardcoded = members.filter((m) => executorSrc.includes(`"${m}"`) || executorSrc.includes(`'${m}'`));
    expect(hardcoded).toEqual([]);
    expect(executorSrc).toMatch(/COMMON_INTEREST_MEMBERS.*from "@\/lib\/search\/canonical\/live-truth"/);
  });

  it('and the classification layer derives from that owner rather than restating it', () => {
    // ownership.ts still owns the MAPPING (which member means co-op), which is
    // real information. It must not also own the LIST — that half was a
    // restatement, and `OTHER_MEMBERS` is now computed as "every live member that
    // is not one of the five segmentation classes".
    const ownershipSrc = read('lib/search/canonical/ownership.ts');
    expect(ownershipSrc).toMatch(/import \{ COMMON_INTEREST_MEMBERS \} from '\.\/live-truth'/);
    expect(ownershipSrc).not.toMatch(/'BareLandCondominium'/);
  });

  it('the DEFAULT status universe is rendered BY the owner, not hand-rolled beside it', () => {
    // `market_status` declares `mappingOwner: 'status-token-contract'`, and for an
    // explicit status the executor does delegate. But when the broker names NO
    // status it pushed a literal string of its own:
    //
    //   "(StandardStatus eq 'Active' or ... 'ComingSoon' or ... 'ActiveUnderContract')"
    //
    // So the field had TWO renderers after all — the owner for the explicit case,
    // and an inline literal for the default. The default is the case that runs on
    // almost every search, and it is a Mallan business rule about which listings
    // are "on market", which is exactly the kind of decision the owner exists to
    // hold. Left inline, the two can disagree about what Active means the moment
    // either changes.
    expect(executorSrc).not.toMatch(/StandardStatus eq '/);

    // Guard-the-guard: delegating must produce the SAME clause that shipped, or
    // this is a behaviour change wearing a refactor's clothes.
    const { filter } = standardStatusOData([...DEFAULT_MARKET_STATUS_TOKENS]);
    expect(filter).toBe(
      "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')",
    );
  });

  it('every Cotality field the executor NAMES is declared by a registry entry', () => {
    // The check the census could not previously make, and the reason it could
    // not: its parser only compared the 14 rows of the numeric TABLE. The
    // executor also names fields inline — `PostalCode eq`, `contains(PublicRemarks,`,
    // `CloseDate ge` — and the old parser collected those parameter NAMES while
    // discarding the field each one targets. So it reported "(none) disagree"
    // across roughly half the mappings it had never looked at. "(none)" meaning
    // NOT CHECKED is worse than a known gap, because it reads as proof.
    //
    // Comments are stripped first: the bathrooms section explains at length why
    // `BathroomsTotalInteger ge/le` was REMOVED, and matching that sentence would
    // report a deleted mapping as a live one. The cheapest way to silence such a
    // failure is to delete the explanation, so the gate would destroy the
    // reasoning it exists to protect.
    const code = executorSrc
      .split('\n')
      .map((line) => {
        const t = line.trim();
        return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') ? '' : line;
      })
      .join('\n');

    // Guard the guard, both directions: prose gone, live code intact. Without
    // this, an over-eager strip would empty the file and pass vacuously.
    expect(code).not.toContain('BathroomsTotalInteger');
    expect(code).toContain('PostalCode');

    const named = new Set<string>();
    const opRe = /\b([A-Z][A-Za-z0-9]+)\s+(?:eq|ne|ge|le|gt|lt)\b/g;
    let m: RegExpExecArray | null;
    while ((m = opRe.exec(code))) named.add(m[1]);
    const fnRe = /\b(?:contains|startswith|endswith)\(\s*([A-Z][A-Za-z0-9]+)\s*,/g;
    while ((m = fnRe.exec(code))) named.add(m[1]);
    // A field can also be COMPARED through a function — `toupper(UnitNumber) eq
    // 'X'` — where the name is followed by `)` rather than the operator. The
    // pattern above went blind to UnitNumber the moment the unit clause became
    // case-insensitive, and the size guard below is what caught it.
    const wrapRe = /\b(?:toupper|tolower|trim)\(\s*([A-Z][A-Za-z0-9]+)\s*\)\s*(?:eq|ne|ge|le|gt|lt)\b/g;
    while ((m = wrapRe.exec(code))) named.add(m[1]);
    expect(named.size).toBeGreaterThanOrEqual(8);
    expect(named).toContain('UnitNumber');

    const declared = new Set<string>();
    for (const s of FIELD_REGISTRY) {
      if (s.cotalityField) declared.add(s.cotalityField);
      for (const f of s.cotalityFields ?? []) declared.add(f);
    }
    const unowned = [...named].filter((f) => !declared.has(f)).sort();
    expect(unowned).toEqual([]);
  });

  it('UNRESOLVED AUTHORITY CANNOT BE VERIFIED, whatever else is proven', () => {
    // The contradiction that kept Section 5 open. `borough` carried
    // authorityResolution 'unresolved' and providerMappingStatus 'partial' while
    // being filterable:'yes', actively executed, AND listed in the verified set —
    // because executionReadiness() checked conflict, strategy, transport,
    // filterability, evidence and semantic equivalence, and never once asked who
    // AUTHORS the fact.
    //
    // #618's rule is that unresolved stays unresolved: a criterion does not become
    // verified because an enum exists and an expression executes. Authority is a
    // separate question from capability, and skipping it let an explicitly
    // unresolved criterion report as fully verified.
    const wired = { reachesServer: true, strategyImplemented: true };
    const synthetic = {
      ...spec('market_status'),
      canonicalKey: 'synthetic_unresolved',
      authorityResolution: 'unresolved',
    } as FieldSpec;
    expect(executionReadiness(synthetic, wired)).toBe('needs_probe');
  });

  it('and no EXECUTED criterion is left with unresolved authority', () => {
    // The live half. Fails by name so the criterion is identified, not just the
    // count — and so that resolving one by editing its enum, rather than by
    // establishing who authors it, is visible in the diff.
    const executedParams = new Set([...paramsRead(), ...numericMappings().map((n) => n.param)]);
    // A param the executor READS in order to REFUSE it is not executing. That
    // distinction matters here: `management_company` is deliberately unresolved
    // AND deliberately refused — Cotality declares no such Property field, and
    // listing office is a different fact — so requiring it to resolve would force
    // an authority decision about a criterion Mallan will never run.
    const refuses = (param: string): boolean => {
      const re = new RegExp(`params\\.get\\("${param}"\\)`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(executorSrc))) {
        if (/UnsupportedSearchCriterionError/.test(executorSrc.slice(m.index, m.index + 600))) return true;
      }
      return false;
    };
    expect(refuses('managementCompany')).toBe(true);
    expect(refuses('borough')).toBe(false);

    const offenders = FIELD_REGISTRY.filter(
      (f) =>
        f.criterionRole === 'broker_input' &&
        (f.searchParams ?? []).some((p) => executedParams.has(p)) &&
        !(f.searchParams ?? []).some((p) => refuses(p)) &&
        f.authorityResolution === 'unresolved',
    ).map((f) => f.canonicalKey);
    expect(offenders).toEqual([]);
  });

  it('GEOGRAPHY IS AUTHORED BY WHOEVER AUTHORED THE LISTING', () => {
    // Traced rather than inferred from the provider Search field, which is how
    // `neighborhood` briefly became fixed/cotality — a claim that Cotality owns
    // the canonical neighbourhood on EVERY listing. It does not.
    //
    // app/api/crm/listings/route.ts writes both columns from
    // `persistence.topLevel`, i.e. what the Mallan agent entered on the CRM form:
    //
    //   borough:      (persistence.topLevel.borough as string) ?? null
    //   neighborhood: (persistence.topLevel.neighborhood as string) ?? null
    //
    // So a Mallan-authored listing has Mallan-authored geography. Declaring it
    // fixed/cotality would let a SUPPRESSED Mallan-office provider representation
    // supply a canonical fact about a listing Mallan itself authored — the exact
    // return-copy inversion the listing architecture exists to prevent.
    //
    // Same shape as street_address, postal_code and unit, which is the point:
    // geography is an ADDRESS fact and is authored the same way they are.
    for (const key of ['borough', 'neighborhood']) {
      const s = spec(key);
      expect(`${key}:${s.authorityResolution}`).toBe(`${key}:by_listing_authority`);
      expect(s.authorityByListingKind).toEqual({ mallanLocal: 'mallan_crm', providerListing: 'cotality' });
      expect(`${key}:${s.sourceAuthority ?? 'none'}`).toBe(`${key}:none`);
    }
  });

  it('a MALLAN-OWNED fact does not need Cotality evidence to be verified', () => {
    // ARCHITECTURAL DEFECT, corrected 2026-08-31.
    //
    // `executionReadiness()` required `liveEvidence` after the strategy check
    // regardless of WHERE execution happens. `mallan_exclusive` is a Mallan CRM
    // fact — executionStrategy 'mallan_derived_filter', sourceAuthority
    // 'mallan_crm', cotalityField null — and correctly has no Cotality evidence,
    // because there is no Cotality field to have evidence ABOUT.
    //
    // So it could never reach verified_executable no matter how perfectly
    // Section 6 implemented it. The only way to satisfy the old rule was to
    // attach provider evidence to a fact the provider does not own — inventing
    // exactly the kind of false authority this registry exists to prevent.
    //
    // Evidence must be demanded of whoever actually owns the fact.
    const wired = { reachesServer: true, strategyImplemented: true };
    const exclusive = spec('mallan_exclusive');
    expect(exclusive.executionStrategy).toBe('mallan_derived_filter');
    expect(exclusive.cotalityField).toBeNull();
    expect(exclusive.liveEvidence).toBeUndefined();
    expect(executionReadiness(exclusive, wired)).toBe('verified_executable');
  });

  it('but a PROVIDER-executed criterion still cannot skip its live evidence', () => {
    // The other half. If dropping the requirement for Mallan facts also dropped
    // it for provider ones, the correction would have removed the entire point
    // of the gate.
    const wired = { reachesServer: true, strategyImplemented: true };
    const synthetic = {
      ...spec('market_status'),
      canonicalKey: 'synthetic_provider_no_evidence',
      liveEvidence: undefined,
    } as FieldSpec;
    expect(executionReadiness(synthetic, wired)).toBe('needs_probe');
  });

  it('and a MALLAN-PROJECTION criterion over a PROVIDER fact still needs provider evidence', () => {
    // The middle case, which is the subtle one. max_financing_percent is filtered
    // Mallan-side, but the raw fact comes from CustomProperty.CustomFields — a
    // Cotality field. Mallan owning the FILTER does not make Mallan the authority
    // on the VALUE, so provider evidence is still required for the input.
    const wired = { reachesServer: true, strategyImplemented: true };
    const financing = spec('max_financing_percent');
    expect(financing.executionStrategy).toBe('mallan_projection_filter');
    expect(financing.cotalityField).toBe('CustomProperty.CustomFields');
    const withoutEvidence = { ...financing, liveEvidence: undefined } as FieldSpec;
    expect(executionReadiness(withoutEvidence, wired)).toBe('needs_probe');
  });

  it('no executable criterion is left with nothing deciding HOW it runs', () => {
    // `no_strategy` is not a lesser grade of readiness — it means nothing has
    // decided how this criterion would execute at all. A criterion the UI can
    // send, that the registry says the provider supports, with no strategy, is a
    // criterion whose behaviour is undefined at the moment a broker uses it.
    const wired = { reachesServer: true, strategyImplemented: true };
    const stray = FIELD_REGISTRY.filter(
      (f) =>
        f.criterionRole === 'broker_input' &&
        f.filterable === 'yes' &&
        executionReadiness(f, wired) === 'no_strategy',
    ).map((f) => `${f.canonicalKey} (vocabularyOwner=${f.vocabularyOwner ?? 'none'})`);
    expect(stray).toEqual([]);
  });
});

/**
 * The exemption above is the thing most likely to be abused later, so it is
 * held to a HIGHER standard than a criterion, not a lower one. A criterion
 * only has to exist in the registry. A resolver has to exist in the registry,
 * decline criterion status, and carry live provider evidence that it filters.
 */
describe('an identity resolver is exempt from CRITERION status, not from authority', () => {
  const bySpec = new Map(FIELD_REGISTRY.map((f) => [f.canonicalKey, f]));

  it.each([...IDENTITY_RESOLVERS])('%s is owned by registry entry %s', (param, canonicalKey) => {
    const spec = bySpec.get(canonicalKey);
    expect(spec).toBeDefined();

    // NOT a broker criterion — this is the whole point of the exemption.
    expect((spec as FieldSpec).criterionRole).toBe('non_search_fact');

    // And it may not be both: a searchParam would put it back in the
    // criterion vocabulary through the generator's front door.
    expect((spec as FieldSpec).searchParam).toBeNull();

    // The executor really does send it to the provider, so provider
    // filterability must be PROVEN, not assumed from the field's name.
    expect((spec as FieldSpec).filterable).toBe('yes');
    expect((spec as FieldSpec).liveEvidence?.source).toBeTruthy();
  });

  it('no identity resolver leaks into the generated criterion vocabulary', () => {
    // CANONICAL_FILTER_KEYS is the product surface the generator publishes.
    // A resolver appearing there would mean Sale/Rental/Building/Comparable
    // had grown a "Provider Listing Key" input no broker asked for.
    const vocabulary = new Set<string>(CANONICAL_FILTER_KEYS as readonly string[]);
    const leaked = [...IDENTITY_RESOLVERS.keys()].filter((p) => vocabulary.has(p));
    expect(leaked).toEqual([]);
  });

  it('the executor actually reads every param claimed as a resolver', () => {
    // Prevents the set outliving the code it excuses.
    const read = new Set(paramsRead());
    const stale = [...IDENTITY_RESOLVERS.keys()].filter((p) => !read.has(p));
    expect(stale).toEqual([]);
  });
});
