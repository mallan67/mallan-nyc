/// <reference types="jest" />
/**
 * THE CRM MUST BE ABLE TO SHOW A BROKER EVERY STATE ITS OWN BACKEND PRODUCES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A CONFORMANCE TEST AND NOT A GREP
 *
 * Both sides of this contract are string lists maintained by hand in different
 * files, in different languages, by different people. Asserting that one file
 * "contains 'Draft'" would prove nothing. So this test EXTRACTS both
 * vocabularies and compares them as sets, and it fails loudly if either shape
 * changes enough that extraction stops working — an extraction that silently
 * returns nothing would turn this into a test that always passes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `listings.status` carries two vocabularies at once. The column is declared
 * `// RESO StandardStatus` in prisma/schema.prisma, and Cotality-synced rows do
 * hold provider values. But Mallan-local listings hold Mallan's own words:
 *
 *   Draft   — a PUBLICATION state, not a market status. Nothing in the market
 *             is "draft". Cotality's word for this is `Incomplete`.
 *   Sold    — Cotality's word is `Closed`.
 *   Rented  — Cotality's word is `Closed`.
 *
 * The CRM agent roster (public/crm/js/dashboard/panels.js, `_agentListingsView`)
 * renders one badge + filter button per status, and its list was written against
 * the PROVIDER vocabulary. So the three states the CRM's own status route
 * actually produces for a Mallan-local listing — Draft, Sold, Rented — have no
 * badge and no filter button. A broker looking at an agent's roster can see
 * those listings only inside the "All" bucket and cannot filter to them.
 *
 * The mirror of the same split: the roster HAS a "Closed" bucket, but no
 * Mallan-local listing is ever `Closed` — the status route writes `Sold` or
 * `Rented`. That bucket counts Cotality-synced rows only.
 *
 * This is the frontend↔backend conformance failure the status conflation
 * causes, stated in the one place a broker actually notices it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TEST DELIBERATELY DOES NOT DECIDE
 *
 * It does not rule on whether Mallan SHOULD store `Sold` rather than `Closed`,
 * or `Draft` rather than `Incomplete`. How Mallan names its own product states
 * is Maya's call, not Cotality's — the authority split cuts both ways. What is
 * not optional is that the CRM can display whatever the backend stores.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');

const statusRouteSrc = readFileSync(
  resolve(REPO, 'app/api/crm/listings/[id]/status/route.ts'),
  'utf8',
);
const listingsRouteSrc = readFileSync(
  resolve(REPO, 'app/api/crm/listings/route.ts'),
  'utf8',
);
const panelsSrc = readFileSync(
  resolve(REPO, 'public/crm/js/dashboard/panels.js'),
  'utf8',
);

/**
 * Every status a MALLAN-LOCAL listing can hold: the state it is created in,
 * plus every state the transition machine can move it into or out of.
 */
function backendProducibleStatuses(): Set<string> {
  const initial = statusRouteSrc.match(/STATUS_INITIAL/)
    ? null
    : null; // STATUS_INITIAL lives in the listings route, read below.

  const machine = statusRouteSrc.match(
    /const STATUS_TRANSITIONS: Record<string, string\[\]> = \{([\s\S]*?)\n\};/,
  );
  if (!machine) {
    throw new Error(
      'Could not find STATUS_TRANSITIONS in the CRM status route. This test ' +
        'compares vocabularies; if it cannot read one of them it must fail, ' +
        'not quietly pass.',
    );
  }
  const found = machine[1].match(/'[^']+'|"[^"]+"/g) || [];
  const states = new Set(found.map((s) => s.slice(1, -1)));

  // Transition-map KEYS are unquoted object keys, so pick them up separately.
  for (const line of machine[1].split('\n')) {
    const key = line.match(/^\s*([A-Za-z]+):/);
    if (key) states.add(key[1]);
  }

  const initialMatch = listingsRouteSrc.match(/const STATUS_INITIAL = "([^"]+)"/);
  if (!initialMatch) {
    throw new Error('Could not find STATUS_INITIAL in the CRM listings route.');
  }
  states.add(initialMatch[1]);

  void initial;
  return states;
}

/** The status buckets the agent roster renders as badge + filter button. */
function rosterBuckets(): Set<string> {
  const block = panelsSrc.match(/var statusDefs = \[([\s\S]*?)\n {4}\];/);
  if (!block) {
    throw new Error(
      'Could not find `statusDefs` in dashboard/panels.js. This test compares ' +
        'vocabularies; if it cannot read one of them it must fail, not pass.',
    );
  }
  const keys = block[1].match(/\{ key: '([^']*)'/g) || [];
  const buckets = new Set(
    keys.map((k) => k.replace(/^\{ key: '/, '').replace(/'$/, '')),
  );
  buckets.delete(''); // the "All" bucket is not a status
  return buckets;
}

/**
 * The one legacy spelling the CRM does NOT need a bucket for: core/api-client.js
 * folds it to the live Cotality spelling on the way in, so no screen ever sees
 * it. Keeping this list explicit means a SECOND legacy spelling could not hide
 * behind the first.
 */
const FOLDED_AT_THE_API_BOUNDARY = new Set(['Cancelled']);

describe('every status the CRM backend produces is visible in the CRM', () => {
  const backend = backendProducibleStatuses();
  const roster = rosterBuckets();

  it('extraction actually found both vocabularies', () => {
    // Guard the guard. A regex that stops matching would otherwise make every
    // assertion below vacuously true.
    expect(backend.size).toBeGreaterThan(5);
    expect(roster.size).toBeGreaterThan(5);
    expect(backend.has('Active')).toBe(true);
    expect(roster.has('Active')).toBe(true);
  });

  it('the api-client fold is real, not assumed', () => {
    const apiClient = readFileSync(
      resolve(REPO, 'public/crm/js/core/api-client.js'),
      'utf8',
    );
    for (const legacy of FOLDED_AT_THE_API_BOUNDARY) {
      expect(apiClient).toContain(`${legacy}: 'Canceled'`);
    }
  });

  it('has a roster bucket for every backend-producible status', () => {
    const missing = [...backend]
      .filter((s) => !FOLDED_AT_THE_API_BOUNDARY.has(s))
      .filter((s) => !roster.has(s))
      .sort();
    expect(missing).toEqual([]);
  });

  it.each(['Draft', 'Sold', 'Rented'])(
    '%s — a state the CRM status route writes — is filterable',
    (status) => {
      // Named individually so a failure says WHICH state a broker cannot see,
      // rather than only that the sets differ.
      expect(backend.has(status)).toBe(true);
      expect(roster.has(status)).toBe(true);
    },
  );
});
