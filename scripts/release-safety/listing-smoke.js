#!/usr/bin/env node
/**
 * Release-safety P2 — control 3: post-deployment listing smoke.
 *
 * The five production probes the PR #523 incident proved were missing from
 * every monitoring layer (the hourly validate-live-site.js has ZERO
 * /listing/* probes — the outage ran undetected):
 *
 *   1. GET /api/listings?limit=5            (discovery — API contract)
 *   2. GET <listing.url>                    (canonical detail page — the URL
 *                                            comes from the API response
 *                                            VERBATIM; never synthesized)
 *   3. GET /listing/<id>                    (ID-only alias contract)
 *   4. GET /api/listings/similar?...       (similar-properties API)
 *   5. GET /api/open-houses                (open-houses API)
 *
 * Execution policy (per the approved P2 plan):
 *   - Runbook post-deploy step + workflow_dispatch ONLY. NOT wired into the
 *     hourly cron: a full run costs ~7–15 Neon queries, up to 1 Neon audit
 *     write, and 2–6 Cotality requests — negligible per release, but hourly
 *     it would keep the Neon endpoint permanently awake and undermine the
 *     Neon remediation program (preflight §3 calculation, 2026-07-19).
 *   - GET-only (enforced — the fetch wrapper rejects any other method).
 *   - Bounded: per-request timeout (default 15 s), max 1 retry per probe,
 *     retry only on TIMEOUT / NETWORK / HTTP 5xx. A 404 on a *discovered*
 *     listing triggers one fresh-discovery retry (the listing may have gone
 *     off-market between calls) before failing.
 *
 * Failure classes: DISCOVERY_EMPTY | HTTP_STATUS | FAILURE_TEXT | TIMEOUT |
 *                  NETWORK | BAD_CONTRACT
 *
 * Exit codes (CLI): 0 all probes pass · 1 any probe fails · 2 usage error.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

/** Body substrings that mean the page/route is broken even when HTTP 200. */
const FAILURE_STRINGS = [
  'app-static-to-dynamic-error', // Next E132 — the exact PR #523 signature
  'DYNAMIC_SERVER_USAGE',
  'Application error: a client-side exception',
  'Internal Server Error',
  'E132',
  '__NEXT_ERROR__',
];

class SmokeHttpError extends Error {
  constructor(failureClass, message) {
    super(message);
    this.failureClass = failureClass;
  }
}

/** GET-only bounded fetch. Throws SmokeHttpError(TIMEOUT|NETWORK). */
async function boundedGet(url, { fetchImpl, timeoutMs }) {
  const options = { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'mallan-release-smoke/1.0' } };
  if (options.method !== 'GET') {
    // Structural guarantee referenced by tests: this module can never issue
    // a non-GET request.
    throw new SmokeHttpError('BAD_CONTRACT', 'listing-smoke is GET-only');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new SmokeHttpError('TIMEOUT', `timeout after ${timeoutMs}ms: ${url}`);
    }
    throw new SmokeHttpError('NETWORK', `network error: ${url}: ${err && err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** One probe attempt. Returns {ok, status, failureClass, detail}. */
async function probeOnce(url, { fetchImpl, timeoutMs, expectJson, checkFailureText }) {
  let res;
  try {
    res = await boundedGet(url, { fetchImpl, timeoutMs });
  } catch (err) {
    return { ok: false, status: null, failureClass: err.failureClass || 'NETWORK', detail: err.message };
  }
  if (res.status !== 200) {
    return { ok: false, status: res.status, failureClass: 'HTTP_STATUS', detail: `HTTP ${res.status}: ${url}` };
  }
  const body = await res.text();
  if (expectJson) {
    try {
      return { ok: true, status: 200, json: JSON.parse(body), body };
    } catch {
      return { ok: false, status: 200, failureClass: 'BAD_CONTRACT', detail: `non-JSON body: ${url}` };
    }
  }
  if (checkFailureText) {
    for (const s of FAILURE_STRINGS) {
      if (body.includes(s)) {
        return { ok: false, status: 200, failureClass: 'FAILURE_TEXT', detail: `body contains "${s}": ${url}` };
      }
    }
  }
  return { ok: true, status: 200, body };
}

/** Probe with bounded retry (TIMEOUT / NETWORK / 5xx only). */
async function probeWithRetry(name, url, ctx, opts) {
  let attempt = 0;
  let last;
  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    last = await probeOnce(url, { ...ctx, ...opts });
    if (last.ok) break;
    const retryable =
      last.failureClass === 'TIMEOUT' ||
      last.failureClass === 'NETWORK' ||
      (last.failureClass === 'HTTP_STATUS' && last.status >= 500);
    if (!retryable) break;
  }
  return { name, url, attempts: attempt, ...last };
}

/** Discover a probe-eligible listing from the API. Uses the API-returned
 *  `url` verbatim (the canonical-URL contract) — never synthesizes one. */
async function discoverListing(baseUrl, ctx) {
  const discovery = await probeWithRetry('discovery', `${baseUrl}/api/listings?limit=5`, ctx, {
    expectJson: true,
  });
  if (!discovery.ok) return { discovery, listing: null };
  const listings = Array.isArray(discovery.json && discovery.json.listings)
    ? discovery.json.listings
    : null;
  if (!listings) {
    return {
      discovery: { ...discovery, ok: false, failureClass: 'BAD_CONTRACT', detail: 'response has no `listings` array' },
      listing: null,
    };
  }
  const eligible = listings.find(
    (l) =>
      l &&
      typeof l.url === 'string' &&
      l.url.startsWith('/listing/') &&
      typeof l.id === 'string' &&
      l.id.length > 0
  );
  if (!eligible) {
    return {
      discovery: {
        ...discovery,
        ok: false,
        failureClass: 'DISCOVERY_EMPTY',
        detail: `no eligible listing among ${listings.length} returned (need string url starting with /listing/ and non-empty id)`,
      },
      listing: null,
    };
  }
  return { discovery, listing: eligible };
}

/**
 * Run the full five-probe smoke.
 * @param {object} opts
 * @param {string} opts.baseUrl        e.g. https://mallan.nyc (required)
 * @param {string} [opts.listingId]    optional pin: skip discovery-based
 *                                     canonical probe target selection
 * @param {function} [opts.fetchImpl]  injectable fetch (tests)
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{passed:boolean, probes:Array, tier:string}>}
 */
async function runListingSmoke(opts) {
  const { baseUrl, listingId, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = opts || {};
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('runListingSmoke: baseUrl (http/https) is required');
  }
  const base = baseUrl.replace(/\/+$/, '');
  const ctx = { fetchImpl, timeoutMs };
  const probes = [];

  // Probe 1 — discovery (also supplies the canonical URL + id)
  let { discovery, listing } = await discoverListing(base, ctx);
  probes.push(discovery);

  let canonicalUrl = null;
  let idForAlias = null;
  if (listingId) {
    idForAlias = listingId;
    // A pinned listing still uses the API's URL when the pin appears in
    // discovery; otherwise only the alias contract is probed for the pin.
    const pinned = listing && listing.id === listingId ? listing : null;
    canonicalUrl = pinned ? pinned.url : null;
    if (!canonicalUrl && listing) canonicalUrl = listing.url; // fall back to discovered listing for canonical coverage
  } else if (listing) {
    canonicalUrl = listing.url;
    idForAlias = listing.id;
  }

  // Probe 2 — canonical detail page (API-returned URL, verbatim)
  if (canonicalUrl) {
    let canonical = await probeWithRetry('canonical-detail', `${base}${canonicalUrl}`, ctx, {
      checkFailureText: true,
    });
    if (!canonical.ok && canonical.status === 404 && !listingId) {
      // Discovered listing may have gone off-market between calls —
      // INCONCLUSIVE: one fresh discovery, then final verdict.
      const second = await discoverListing(base, ctx);
      if (second.listing) {
        listing = second.listing;
        idForAlias = second.listing.id;
        canonical = await probeWithRetry('canonical-detail(rediscovered)', `${base}${second.listing.url}`, ctx, {
          checkFailureText: true,
        });
      }
    }
    probes.push(canonical);
  } else {
    probes.push({ name: 'canonical-detail', ok: false, failureClass: 'DISCOVERY_EMPTY', detail: 'no canonical URL available (discovery failed and no pin)' });
  }

  // Probe 3 — ID-only alias contract
  if (idForAlias) {
    probes.push(
      await probeWithRetry('id-alias', `${base}/listing/${encodeURIComponent(idForAlias)}`, ctx, {
        checkFailureText: true,
      })
    );
  } else {
    probes.push({ name: 'id-alias', ok: false, failureClass: 'DISCOVERY_EMPTY', detail: 'no listing id available' });
  }

  // Probe 4 — similar-properties API (bounded static params + excludeId)
  const similarQs = new URLSearchParams({ type: 'sale', beds: '2', price: '1500000' });
  if (idForAlias) similarQs.set('excludeId', idForAlias);
  probes.push(
    await probeWithRetry('similar-api', `${base}/api/listings/similar?${similarQs.toString()}`, ctx, {
      expectJson: true,
    })
  );

  // Probe 5 — open-houses API
  probes.push(await probeWithRetry('open-houses-api', `${base}/api/open-houses`, ctx, { expectJson: true }));

  const passed = probes.every((p) => p.ok);
  return {
    passed,
    probes: probes.map(({ json, body, ...rest }) => rest), // strip payloads from the report
    tier: passed ? 'PRODUCTION-PROVEN(at-run-time)' : 'FAILED',
  };
}

module.exports = { runListingSmoke, FAILURE_STRINGS, boundedGet, probeWithRetry };

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const baseUrl = flag('--base-url');
  const listingId = flag('--listing-id') || process.env.SMOKE_LISTING_ID || undefined;
  if (!baseUrl) {
    console.error('Usage: node scripts/release-safety/listing-smoke.js --base-url https://mallan.nyc [--listing-id <id>]');
    process.exit(2);
  }
  runListingSmoke({ baseUrl, listingId })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`listing-smoke fatal: ${err.message}`);
      process.exit(1);
    });
}
