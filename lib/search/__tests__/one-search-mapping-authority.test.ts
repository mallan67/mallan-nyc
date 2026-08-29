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
    expect(numericMappings().length).toBeGreaterThanOrEqual(16);
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
    const derived = FIELD_REGISTRY.filter((f) => f.searchParams !== undefined)
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
    expect(verified).toEqual([
      'borough',
      'furnished',
      'listing_universe',
      'mallan_exclusive',
      'market_status',
      'media_category',
      'media_classification',
      'media_display_permission',
      'media_status',
      'neighborhood',
      'new_development',
      // RESTORED: ownership carries a genuine 2026-08-21 exhaustive Active census
      // (Condominium 3,722 / StockCooperative 2,509 / ... = 8,015 = ne null
      // exactly), now recorded as structured liveEvidence. I demoted it in the
      // first pass without checking whether its evidence should be STRUCTURED
      // rather than the capability lowered.
      'ownership',
      'pets',
      'property_sub_type',
      'structure_type',
      'transaction_type',
    ]);
  });

  it('and only ONE Search criterion is fully verified executable today', () => {
    // capability:yes is necessary and NOT sufficient. Verified executable needs a
    // proven clause, capability yes, live evidence AND no conflict with a
    // canonical contract. `bathrooms` is capability:yes with a proven clause and
    // is NOT verified: it queries BathroomsTotalInteger, which bath-contract.ts
    // lists under `rejected` on live evidence. A built clause is not a correct one.
    const marketStatus = FIELD_REGISTRY.find((f) => f.canonicalKey === 'market_status');
    expect(marketStatus?.filterable).toBe('yes');
    expect(marketStatus?.mappingOwner).toBe('status-token-contract');
    expect(marketStatus?.searchParams).toEqual(['status', 'statuses']);
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

  it('a known mapping conflict outranks everything — it executes, and executes WRONGLY', () => {
    expect(executionReadiness(spec('bathrooms'), wired)).toBe('mapping_conflict');
  });

  it('a DUAL-DOMAIN identifier is blocked, not emitted to the wrong provider', () => {
    // `listing_id_canonical` holds either a Cotality ListingId or a Mallan
    // SL-/RL- reference, but the executor emits `ListingId eq` for EVERY value
    // with no domain check. A Mallan-domain identifier sent to Cotality matches
    // nothing, so searching a Mallan listing by its own reference silently
    // returns empty. It stays blocked until a domain-aware lookup exists.
    expect(spec('listing_id_canonical').mappingConflict).toMatch(/DUAL-DOMAIN/);
    expect(executionReadiness(spec('listing_id_canonical'), wired)).toBe('mapping_conflict');
  });

  it('a criterion with strategy, transport, live evidence and proven semantics is verified', () => {
    expect(spec('market_status').executionStrategy).toBe('provider_filter');
    expect(executionReadiness(spec('market_status'), wired)).toBe('verified_executable');
  });

  it('capability short of yes on the provider path is needs_probe', () => {
    // list_price was demoted from 'yes' to 'needs_probe': the shared
    // CapabilityStatus contract defines 'yes' as VERIFIED against live Cotality,
    // and no probe record exists for it. Redefining 'yes' downward to keep the
    // old label would have corrupted every other consumer of that contract.
    expect(spec('list_price').filterable).toBe('needs_probe');
    expect(executionReadiness(spec('list_price'), wired)).toBe('needs_probe');
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
    // geography.ts proves CityRegion and SubdivisionName exist and are
    // filterable. It does NOT prove the 593 neighbourhood alias equivalences,
    // which were generated 2026-03-19 against an RLS-era understanding, five
    // months before that probe. Field existence and equivalence correctness are
    // DIFFERENT PROOFS and the model must not collapse them.
    expect(spec('neighborhood').liveEvidence).toBeDefined();
    expect(spec('neighborhood').semanticEquivalenceProven).toBe(false);
    expect(executionReadiness(spec('neighborhood'), wired)).toBe('needs_probe');
  });

  it('live evidence is STRUCTURED, never inferred from note prose', () => {
    // year_built's note contains the words "probe record" inside the sentence
    // "this file has no probe record for" it. The old prose scan read the ABSENCE
    // of evidence as evidence and reported it live-verified.
    expect(spec('year_built').notes).toMatch(/no probe record/);
    expect(spec('year_built').liveEvidence).toBeUndefined();
    expect(spec('market_status').liveEvidence?.probedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
