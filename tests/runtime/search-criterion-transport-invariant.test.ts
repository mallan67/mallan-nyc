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
import { DEFAULT_MARKET_STATUS_TOKENS, standardStatusOData } from '@/lib/search/canonical/status-token-contract';

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
  // DIRECT ASSIGNMENTS ARE NOT THE WHOLE PICTURE.
  //
  // The canonical serializer writes most criteria DYNAMICALLY from
  // `CANONICAL_TO_WIRE`, where the names are data rather than identifiers — and
  // therefore invisible to a `criteria.foo =` scan.
  //
  // That blind spot is why `financingMin` and `financingMax` could be produced
  // here, forwarded by nothing, read by nobody, and still leave five green CI
  // workflows. A transport invariant that cannot see half the transport reports
  // coverage it never checked, which is worse than having none.
  const table = /var CANONICAL_TO_WIRE = \{[\s\S]*?\n        \};/.exec(searchEngine)?.[0] ?? '';
  const dynamic = [
    ...table.matchAll(/(?:min|max|basis|set|csv|text):\s*'([A-Za-z_]\w*)'/g),
  ].map((m) => m[1]);

  return new Set([
    ...[...body.matchAll(/criteria\.([A-Za-z_]\w*)\s*=/g)].map((m) => m[1]),
    ...[...body.matchAll(/criteria\.([A-Za-z_]\w*)\.push/g)].map((m) => m[1]),
    ...dynamic,
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

/**
 * Everything `buildIdxSearchParams()` assigns onto its params object.
 *
 * DIRECT ASSIGNMENTS ARE NOT THE WHOLE PICTURE. This scanned for
 * `params.foo =` only, so every parameter emitted DYNAMICALLY through the
 * canonical `CANONICAL_TO_WIRE` table was invisible to the census — the keys are
 * data there, not identifiers.
 *
 * That blind spot is why `financingMin` and `financingMax` could be produced by
 * the serializer, forwarded by nothing, read by nobody, and still leave five
 * green CI workflows. A transport invariant that cannot see half the transport
 * is worse than none: it reports coverage it never checked.
 */
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
  // checkboxFilters was CLOSED in Tranche 1 (2026-08-26). It is forwarded now,
  // and the server validates every field and value against the closed
  // live-verified registry in lib/search/canonical/checkbox-criteria.ts, so
  // transporting it does not hand the browser an open field=value passthrough.
  // Un-declared deliberately, because the third guard in this file refuses to
  // let a fixed param sit in the table hiding a future regression.
  // keyword and unit were CLOSED 2026-08-31 (Section 5.F) and are deliberately
  // un-declared here, because the third guard in this file refuses to let a fixed
  // param sit in the table hiding a future regression.
  //
  // Both were assigned and forwarded by nothing, so an agent typed a narrowing
  // criterion and the search ran WIDER than asked under HTTP 200. They now
  // transport, and the server answers each truthfully rather than identically:
  // `unit` EXECUTES as toupper(UnitNumber) eq, proven live; `keyword` is REFUSED
  // by name, because contains(PublicRemarks,...) never returns — five probes,
  // every shape, each aborting with no HTTP status. A refusal the agent can see
  // is the fix; a criterion that evaporates between the form and the request is
  // the defect.
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
/**
 * EMPTY, and that is the improvement.
 *
 * `financingMin` used to live here: the legacy collector set it and nothing read
 * it — write-only. That collector is gone. `max_financing_percent` is now a
 * canonical criterion mapped by the ONE serializer, so the value it carries
 * reaches the wire and the provider refuses it BY NAME rather than the criterion
 * evaporating in the client.
 *
 * A criterion that is collected and never serialized is silent widening: the
 * agent's filter disappears between the form and the request. Keeping this set
 * empty is the invariant; anything added here needs a reason strong enough to
 * justify a filter that cannot execute.
 */
const COLLECTED_BUT_NOT_SERIALIZED: Readonly<Record<string, string>> = Object.freeze({});

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

/**
 * THE BLIND SPOT BETWEEN THE TWO BOUNDARIES ABOVE.
 *
 * Boundary 1 asks: is every collected criterion READ by the serializer?
 * Boundary 2 asks: is every param the serializer EMITS forwarded?
 *
 * A criterion that is READ and emits NOTHING satisfies both and is checked by
 * neither. That is not hypothetical — it is defect (1) in this file's own
 * header: `params.status` was computed from `criteria.statuses` and never
 * assigned. `criteria.statuses` IS read, so boundary 1 passed; no `status` param
 * was ever emitted, so boundary 2 never saw it.
 *
 * The consequence is the worst shape of failure. The server treats an absent
 * `status` as a DEFAULT — `(StandardStatus eq 'Active' or 'ComingSoon' or
 * 'ActiveUnderContract')` — so a broker who ticks Closed or Pending does not get
 * an error or an empty grid. They get active inventory, presented as the answer
 * to a question they did not ask.
 */
function serializerBody(): string {
  const start = searchEngine.indexOf('window.buildIdxSearchParams = function');
  const end = searchEngine.indexOf('\n        };', start);
  return searchEngine.slice(start, end);
}

/**
 * Criteria that are read, guard a block, and assign no param inside it.
 *
 * Modelled structurally rather than by proximity: the serializer's shape is a
 * run of `if (criteria.X ...) { … params.Y = … }` guards, so each guarded chunk
 * must produce at least one param assignment.
 */
function readButEmitsNothing(): string[] {
  const body = serializerBody();
  const guards = [...body.matchAll(/if \(criteria\.([A-Za-z_]\w*)/g)];
  const offenders = new Set<string>();

  for (const guard of guards) {
    const from = guard.index ?? 0;
    // Brace-match the guarded block. Slicing to the NEXT guard instead would
    // sweep in the following statement's assignment and report the block as
    // healthy — which is exactly how `statuses` hid: the code after its block
    // assigns a param, so a coarse chunk looked fine.
    const braceAt = body.indexOf('{', from);
    const singleStatementEnd = body.indexOf('\n', from);
    let chunk: string;
    if (braceAt !== -1 && braceAt < singleStatementEnd) {
      let depth = 0;
      let i = braceAt;
      for (; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      chunk = body.slice(from, i + 1);
    } else {
      // `if (criteria.x) params.y = …;` on one line.
      chunk = body.slice(from, singleStatementEnd === -1 ? body.length : singleStatementEnd);
    }
    if (!/params\.[A-Za-z_]\w*\s*=/.test(chunk)) offenders.add(guard[1]);
  }
  return [...offenders].sort();
}

/**
 * Criteria the serializer reads DELIBERATELY without emitting a param.
 *
 * The serializer warns on these and drops them on purpose — the backend has no
 * handler, so sending them would submit a request whose narrowing intent is
 * silently discarded. Declared, so a criterion that stops emitting by accident
 * cannot hide among them.
 */
const READ_BUT_INTENTIONALLY_EMITS_NOTHING: Readonly<Record<string, string>> = Object.freeze({
  // Named as the FIRST operand of its guard, which also covers openHouseDateTo.
  openHouseDateFrom:
    'Warned and stripped, with openHouseDateTo in the same guard — the backend ' +
    'has no OpenHouse handler, so sending it would submit a request whose ' +
    'narrowing intent is discarded server-side.',
  _transitBounds: 'Warned and stripped — the feed carries no Latitude/Longitude.',
  _gridBounds: 'Warned and stripped — the feed carries no Latitude/Longitude.',
});

describe('criterion transport — read by the serializer, but emitted?', () => {
  it('every criterion the serializer reads emits a param or is declared silent', () => {
    const undeclared = readButEmitsNothing().filter(
      (k) => !(k in READ_BUT_INTENTIONALLY_EMITS_NOTHING),
    );
    // Fails BY NAME. This is the check that would have caught params.status.
    expect(undeclared).toEqual([]);
  });

  it('the declared-silent set has not grown', () => {
    expect(readButEmitsNothing()).toEqual(
      Object.keys(READ_BUT_INTENTIONALLY_EMITS_NOTHING).sort(),
    );
  });

  it('the extraction found the guards it is supposed to be checking', () => {
    // Guard the guard: a regex that stops matching would make both assertions
    // above vacuously true, which is precisely how the first status defect
    // survived a test suite written to prevent it.
    const body = serializerBody();
    expect(body.length).toBeGreaterThan(1000);
    expect([...body.matchAll(/if \(criteria\.([A-Za-z_]\w*)/g)].length).toBeGreaterThan(20);
  });
});

describe('the market-status criterion reaches the server', () => {
  it('the serializer assigns a status param', () => {
    // Named on its own, not only through the structural check, because this
    // exact criterion has been silently dropped once before and its failure is
    // indistinguishable from a correct search.
    expect(serializerBody()).toMatch(/params\.status\s*=/);
  });

  it('and the wire forwards it', () => {
    expect(requestForwards().has('status')).toBe(true);
  });

  it('and the server reads it rather than falling back to its default', () => {
    expect(serverReads().has('status')).toBe(true);

    // The default exists and is correct for "no status asked". It must never be
    // what a broker gets after asking for one.
    //
    // ASSERTED AGAINST THE OWNER since Section 5. This used to grep the filter
    // for the literal clause, because the filter built one itself — a second
    // renderer for a field whose registry entry names status-token-contract as
    // its mapping owner. The default now goes through that owner, so the filter
    // no longer contains the string and the old grep would fail on a change that
    // altered no behaviour at all.
    //
    // Behaviour is pinned harder than before: the previous version matched a
    // substring of a hand-written literal, while this renders the real clause
    // through the real function and compares it whole.
    expect(crmFilter).toMatch(/DEFAULT_MARKET_STATUS_TOKENS/);
    const { filter } = standardStatusOData([...DEFAULT_MARKET_STATUS_TOKENS]);
    expect(filter).toBe(
      "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')",
    );
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
