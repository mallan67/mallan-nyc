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
import { FIELD_REGISTRY, type FieldSpec } from '../canonical/field-registry';

const REPO = resolve(__dirname, '../../..');
const EXECUTOR_PATH = 'lib/search/crm-idx-filter.ts';
const executorSrc = readFileSync(resolve(REPO, EXECUTOR_PATH), 'utf8');

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
