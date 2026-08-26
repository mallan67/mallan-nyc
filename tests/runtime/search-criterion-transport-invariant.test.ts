/// <reference types="jest" />
/**
 * THE CRITERION TRANSPORT INVARIANT.
 *
 * A criterion can be collected, canonicalised, serialized — and then silently
 * dropped before the network request. The broker sees no error, no toast and a
 * full result set. Unnarrowed results that look legitimate are worse than a
 * visible failure, and this has now happened twice in this codebase at two
 * different boundaries:
 *
 *   1. `params.status` was computed and never assigned (de217734). Selecting a
 *      status silently returned active inventory.
 *   2. `params.checkboxFilters` IS assigned and is never forwarded onto the
 *      /api/idx/search query string — so all 45 data-field controls (425
 *      instances) never reach the server at all.
 *
 * Fixing those one at a time does not stop the third. This test makes the
 * transport chain MECHANICAL: it reads the real source at every boundary and
 * fails BY CRITERION NAME when one disappears.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEVEN DISTINCT ROOT CAUSES. NEVER COLLAPSE THEM.
 *
 *   VERIFIED_WORKING        proven end to end
 *   TRANSPORT_BROKEN        lost between two layers of our OWN code
 *   NEEDS_PROVIDER_PROOF    reaches the server; provider behaviour unproven
 *   NEEDS_SEMANTIC_MAPPING  transports, but the Mallan label -> provider value
 *                           equivalence is not established
 *   PROVIDER_UNAVAILABLE    proven absent or unentitled on the live contract
 *   MALLAN_DERIVED          answered from Mallan data, not the provider
 *   LOCAL_WORKFLOW_ONLY     never intended to reach the provider
 *
 * "collected but not serialized", "serialized but not forwarded", "forwarded but
 * never read", "read but produces no filter", "filter rejected by provider",
 * "provider returns rows but the mapper discards them" and "mapper works but the
 * renderer throws" are SEVEN different defects with seven different fixes. A
 * single "unsupported" bucket is how they keep getting rediscovered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS NOT
 *
 * It is not the business register. Code-key counts are not criteria counts —
 * 43 server reads does not mean 43 supported criteria. This pins TRANSPORT only:
 * whether a value survives from the serializer to the server. Semantics,
 * picklists, operators and population are proven elsewhere, per field.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const searchEngine = read('public/crm/js/search/search-engine.js');
const apiClient = read('public/crm/js/core/api-client.js');
const crmFilter = read('lib/search/crm-idx-filter.ts');
const searchRoute = read('app/api/idx/search/route.ts');

/** Every criterion key `collectSearchCriteria()` produces. */
function collectorProduces(): Set<string> {
  const start = searchEngine.indexOf('function collectSearchCriteria');
  const end = searchEngine.indexOf('\n        function ', start + 10);
  const body = searchEngine.slice(start, end);
  return new Set([
    ...[...body.matchAll(/criteria\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]),
    ...[...body.matchAll(/criteria\.([A-Za-z_]\w*)\.push/g)].map((m) => m[1]),
  ]);
}

/**
 * Every criterion key the serializer READS.
 *
 * Read, not "emits" — the key is renamed across this boundary
 * (`criteria.priceMin` becomes `params.minPrice`), so a name diff would be
 * meaningless. What matters is whether the collected value is consulted at all.
 */
function serializerConsumes(): Set<string> {
  const start = searchEngine.indexOf('window.buildIdxSearchParams = function');
  const end = searchEngine.indexOf('\n        };', start);
  return new Set(
    [...searchEngine.slice(start, end).matchAll(/criteria\.([A-Za-z_]\w*)/g)].map((m) => m[1]),
  );
}

/** Everything `buildIdxSearchParams()` assigns onto its params object. */
function serializerEmits(): Set<string> {
  const start = searchEngine.indexOf('window.buildIdxSearchParams = function');
  const end = searchEngine.indexOf('\n        };', start);
  const body = searchEngine.slice(start, end);
  return new Set([...body.matchAll(/params\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]));
}

/** Everything the REAL /api/idx/search request forwarder puts on the wire. */
function requestForwards(): Set<string> {
  const end = apiClient.indexOf("return _fetch('/api/idx/search'");
  const start = apiClient.lastIndexOf('search:', end);
  const block = apiClient.slice(start, end);
  return new Set([...block.matchAll(/qs\.push\('([A-Za-z_]\w*)=/g)].map((m) => m[1]));
}

/** Everything the server actually reads, including the numeric loop table. */
function serverReads(): Set<string> {
  const literal = [...`${crmFilter}${searchRoute}`.matchAll(/params\.get\("([A-Za-z_]\w*)"\)/g)].map((m) => m[1]);
  const loopTable = [...crmFilter.matchAll(/\["(min[A-Za-z]+|max[A-Za-z]+)"/g)].map((m) => m[1]);
  // minBeds falls back to `beds` for older callers.
  return new Set([...literal, ...loopTable, 'beds']);
}

/**
 * THE DECLARED TRANSPORT STATE.
 *
 * Every param the serializer emits must appear here with a disposition. That is
 * the point: adding a criterion without deciding how it transports fails this
 * test, and so does fixing one without recording it.
 */
const TRANSPORT_BROKEN: Readonly<Record<string, string>> = Object.freeze({
  checkboxFilters:
    'Carries ALL 45 data-field controls (425 instances). Assigned by the ' +
    'serializer, never forwarded. Every amenity/feature/condition filter is ' +
    'silently inert. The server WOULD reject unsupported fields, but that ' +
    'throw is unreachable from the CRM because the value never arrives.',
  keyword: 'Assigned, never forwarded. Keyword search does nothing.',
  unit: 'Assigned, never forwarded. Unit-number narrowing does nothing.',
  managementCompany:
    'Assigned, never forwarded. The server throws UnsupportedSearchCriterionError ' +
    'for it, so that fail-closed path is unreachable from the UI.',
  contractDateFrom: 'Assigned, never forwarded. Contract-date range does nothing.',
  contractDateTo: 'Assigned, never forwarded. Contract-date range does nothing.',
});

/**
 * COLLECTED BY THE FORM, NEVER READ BY THE SERIALIZER.
 *
 * The FIRST boundary, and a different defect class from the six lost at the
 * wire: this value dies before a param is ever built for it.
 */
const COLLECTED_BUT_NOT_SERIALIZED: Readonly<Record<string, string>> = Object.freeze({
  financingMin:
    'Set at search-engine.js:1203 and referenced NOWHERE else in the entire CRM ' +
    '— write-only. The related control family MaximumFinancingPercent is ' +
    'separately disabled and carries the magic data-value strings "gt:0"/"eq:0", ' +
    'which no canonical parser owns. Financing has two dead paths, not one.',
});

describe('criterion transport — the form to the serializer', () => {
  it('every collected criterion is read by the serializer or declared dead', () => {
    const undeclared = [...collectorProduces()].filter(
      (k) => !serializerConsumes().has(k) && !(k in COLLECTED_BUT_NOT_SERIALIZED),
    );
    expect(undeclared).toEqual([]);
  });

  it('the collected-but-dead set has not grown', () => {
    const consumed = serializerConsumes();
    const dead = [...collectorProduces()].filter((k) => !consumed.has(k)).sort();
    expect(dead).toEqual(Object.keys(COLLECTED_BUT_NOT_SERIALIZED).sort());
  });
});

describe('criterion transport — serializer to the wire', () => {
  it('every param the serializer emits is either forwarded or declared TRANSPORT_BROKEN', () => {
    const emitted = serializerEmits();
    const forwarded = requestForwards();
    const undeclared = [...emitted].filter(
      (p) => !forwarded.has(p) && !(p in TRANSPORT_BROKEN),
    );
    // Fails BY NAME so the next dropped criterion is identified, not counted.
    expect(undeclared).toEqual([]);
  });

  it('the known-broken set has not grown', () => {
    const emitted = serializerEmits();
    const forwarded = requestForwards();
    const actuallyBroken = [...emitted].filter((p) => !forwarded.has(p)).sort();
    expect(actuallyBroken).toEqual(Object.keys(TRANSPORT_BROKEN).sort());
  });

  it('a declared-broken param that starts working must be un-declared deliberately', () => {
    // Prevents the table rotting into a list of things that were fixed years ago
    // and now hide a real regression behind a stale exemption.
    const forwarded = requestForwards();
    const staleExemptions = Object.keys(TRANSPORT_BROKEN).filter((p) => forwarded.has(p));
    expect(staleExemptions).toEqual([]);
  });
});

describe('criterion transport — the wire to the server', () => {
  it('every forwarded param is read by the server', () => {
    const forwarded = requestForwards();
    const reads = serverReads();
    const ignored = [...forwarded].filter((p) => !reads.has(p)).sort();
    expect(ignored).toEqual([]);
  });
});

describe('the served artifact carries the same transport chain as the source', () => {
  // A source-only fix does not reach a deploy until the shell is rebuilt, and
  // that gap has already shipped a broken status serializer once.
  const built = read('public/crm/index-built.html');

  it.each(Object.keys(TRANSPORT_BROKEN))(
    '%s is assigned in the served bundle too (same defect, not a build artifact)',
    (param) => {
      expect(built).toContain(`params.${param} =`);
    },
  );

  it.each([...requestForwards()])('%s is forwarded in the served bundle', (param) => {
    expect(built).toContain(`qs.push('${param}=`);
  });
});
