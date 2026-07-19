#!/usr/bin/env node
/**
 * Release-safety P2 — control 3: post-deployment listing smoke.
 *
 * The five production probes the PR #523 incident proved were missing from
 * every monitoring layer (the hourly validate-live-site.js has ZERO
 * /listing/* probes — the outage ran undetected):
 *
 *   1. GET /api/listings?limit=5            (discovery — requires
 *                                            success === true + a valid
 *                                            listing DTO)
 *   2. GET <listing.url>                    (canonical detail page — the URL
 *                                            comes from the API response
 *                                            VERBATIM; never synthesized)
 *   3. GET /listing/<id>                    (ID-only alias — must END at the
 *                                            expected canonical URL, by
 *                                            redirect target or rendered
 *                                            canonical link)
 *   4. GET /api/listings/similar?...       (query derived from the SAME
 *                                            listing's real values; response
 *                                            must carry listings[] AND a
 *                                            recognized _compliance.source —
 *                                            the empty short-circuit has
 *                                            neither)
 *   5. GET /api/open-houses                (HTTP/JSON-CONTRACT-PROVEN only:
 *                                            the route returns
 *                                            { openHouses: [] } even when its
 *                                            backends degrade, so backend
 *                                            Neon/Cotality health remains
 *                                            UNVERIFIED by this probe)
 *
 * Execution policy (per the approved P2 plan):
 *   - Runbook post-deploy step + workflow_dispatch ONLY. NOT wired into the
 *     hourly cron: a full run costs ~7–15 Neon queries, up to 1 Neon audit
 *     write, and 2–6 Cotality requests — negligible per release. Repeated
 *     probes increase Neon wake frequency; actual active time and CU
 *     consumption require production measurement (which is why cadence
 *     decisions stay with Maya, cost stated first).
 *   - GET-only (enforced — the fetch wrapper rejects any other method).
 *   - Bounded: per-request timeout (default 15 s), max 1 retry per probe,
 *     retry only on TIMEOUT / NETWORK / HTTP 5xx. A 404 on a *discovered*
 *     listing triggers one fresh-discovery retry before failing.
 *   - Failure-text matching is CASE-INSENSITIVE.
 *
 * Output is FACTUAL EVIDENCE ONLY — no proof-tier label is emitted:
 *   { passed, observed_at, base_url, expected_sha, deployment_id,
 *     listing: { id, canonical_url }, probes: [...] }
 * expected_sha / deployment_id are recorded verbatim from the caller
 * (--expected-sha / --deployment-id) so the evidence can be bound to a
 * specific verified deployment; they are null when not supplied.
 *
 * Failure classes: DISCOVERY_EMPTY | HTTP_STATUS | FAILURE_TEXT | TIMEOUT |
 *                  NETWORK | BAD_CONTRACT
 *
 * Exit codes (CLI): 0 all probes pass · 1 any probe fails · 2 usage error.
 */

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

/** Body substrings (matched case-insensitively) that mean the page/route is
 *  broken even when HTTP 200 — HARD signatures: their presence ANYWHERE in
 *  the body is a failure. */
const FAILURE_STRINGS = [
  'app-static-to-dynamic-error', // Next E132 — the exact PR #523 signature
  'E132',
  'E550',
  'no-store fetch', // the E132/E550 error text names the offending fetch
  'DYNAMIC_SERVER_USAGE',
  'Application error: a client-side exception',
  'Internal Server Error',
  '__NEXT_ERROR__',
];
const FAILURE_STRINGS_LOWER = FAILURE_STRINGS.map((s) => s.toLowerCase());

/**
 * CONTEXT-SENSITIVE signature: "Listing Not Available".
 *
 * Production-characterized 2026-07-19 (dpl_4fWoEo7… @ 5cdee59b…): a HEALTHY
 * canonical listing page's raw Next.js HTML contains this phrase exactly
 * once — DORMANT, inside the serialized notFound template in escaped RSC
 * flight data (`\"children\":\"Listing Not Available\"`), never as rendered
 * markup. An ACTIVE unavailable page renders it as a real HTML text node
 * (`<h1 …>Listing Not Available</h1>` ⇒ `>Listing Not Available<`).
 *
 * The phrase therefore fails a probe ONLY when it is the active page
 * result: (a) it appears in rendered `>…<` form, or (b) the page lacks the
 * positive listing identity (canonical URL + listing id) that every healthy
 * render carries. A dormant serialized occurrence in otherwise-valid
 * listing HTML passes (recorded on the probe as a note, not hidden).
 */
const LISTING_UNAVAILABLE_TEXT = 'Listing Not Available';
const ACTIVE_UNAVAILABLE_RE = />\s*listing not available\s*</i;

/** _compliance.source values that prove the similar route's meaningful
 *  (DB/Cotality) path executed. The empty short-circuit response carries no
 *  _compliance at all. */
const RECOGNIZED_SIMILAR_SOURCES = ['idx'];

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

/** One probe attempt. Returns {ok, status, finalUrl, failureClass, detail}. */
async function probeOnce(url, { fetchImpl, timeoutMs, expectJson, checkFailureText }) {
  let res;
  try {
    res = await boundedGet(url, { fetchImpl, timeoutMs });
  } catch (err) {
    return { ok: false, status: null, failureClass: err.failureClass || 'NETWORK', detail: err.message };
  }
  const finalUrl = typeof res.url === 'string' && res.url ? res.url : null;
  if (res.status !== 200) {
    return { ok: false, status: res.status, finalUrl, failureClass: 'HTTP_STATUS', detail: `HTTP ${res.status}: ${url}` };
  }
  const body = await res.text();
  if (expectJson) {
    try {
      return { ok: true, status: 200, finalUrl, json: JSON.parse(body), body };
    } catch {
      return { ok: false, status: 200, finalUrl, failureClass: 'BAD_CONTRACT', detail: `non-JSON body: ${url}` };
    }
  }
  if (checkFailureText) {
    const lower = body.toLowerCase();
    for (let i = 0; i < FAILURE_STRINGS_LOWER.length; i += 1) {
      if (lower.includes(FAILURE_STRINGS_LOWER[i])) {
        return { ok: false, status: 200, finalUrl, failureClass: 'FAILURE_TEXT', detail: `body contains "${FAILURE_STRINGS[i]}" (case-insensitive): ${url}` };
      }
    }
  }
  return { ok: true, status: 200, finalUrl, body };
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

/** Is this a usable listing DTO for probing? */
function isValidListingDto(l) {
  return (
    !!l &&
    typeof l.url === 'string' &&
    l.url.startsWith('/listing/') &&
    typeof l.id === 'string' &&
    l.id.length > 0
  );
}

/**
 * Build the similar-properties query from a DISCOVERED listing's real values:
 * required — listPrice (> 0), address.postalCode (non-empty), listingType
 * ('sale'|'rent'), bedroomsTotal (numeric); optional — propertyType,
 * propertySubType. Missing required fields => {ok:false} (BAD_CONTRACT).
 */
function buildSimilarQueryFromListing(listing) {
  if (!listing) {
    return { ok: false, detail: 'no discovered listing to derive the similar query from' };
  }
  const price = Number(listing.listPrice);
  const postalCode =
    listing.address && typeof listing.address.postalCode === 'string'
      ? listing.address.postalCode.trim()
      : '';
  const type = listing.listingType;
  const beds = listing.bedroomsTotal;
  const missing = [];
  if (!(price > 0)) missing.push('listPrice');
  if (!postalCode) missing.push('address.postalCode');
  if (type !== 'sale' && type !== 'rent') missing.push('listingType');
  if (typeof beds !== 'number' || Number.isNaN(beds)) missing.push('bedroomsTotal');
  if (missing.length > 0) {
    return {
      ok: false,
      detail: `discovered listing ${listing.id || '?'} lacks required similar-query fields: ${missing.join(', ')} — refusing a superficial request`,
    };
  }
  const qs = new URLSearchParams({
    type,
    beds: String(beds),
    price: String(price),
    postalCode,
    excludeId: String(listing.id),
  });
  if (typeof listing.propertyType === 'string' && listing.propertyType) {
    qs.set('propertyType', listing.propertyType);
  }
  if (typeof listing.propertySubType === 'string' && listing.propertySubType) {
    qs.set('propertySubType', listing.propertySubType);
  }
  return { ok: true, qs };
}

/** Validate the similar route's response body: it must prove the meaningful
 *  path ran (listings[] + recognized _compliance.source). */
function validateSimilarResponse(json) {
  if (!json || typeof json !== 'object') return 'response is not an object';
  if (json.error) return `route returned an error payload: ${String(json.error).slice(0, 80)}`;
  if (!Array.isArray(json.listings)) return 'response has no listings array';
  const source = json._compliance && json._compliance.source;
  if (typeof source !== 'string' || !RECOGNIZED_SIMILAR_SOURCES.includes(source)) {
    return `response lacks a recognized _compliance.source (got ${JSON.stringify(source)}) — the meaningful DB/Cotality path did NOT run (empty short-circuit responses omit _compliance)`;
  }
  return null;
}

/** Discover a probe-eligible listing from the API. Uses the API-returned
 *  `url` verbatim (the canonical-URL contract) — never synthesizes one.
 *  Requires the documented response contract: success === true + listings[]. */
async function discoverListing(baseUrl, ctx) {
  const discovery = await probeWithRetry('discovery', `${baseUrl}/api/listings?limit=5`, ctx, {
    expectJson: true,
  });
  if (!discovery.ok) return { discovery, listing: null };
  const json = discovery.json;
  if (!json || json.success !== true) {
    return {
      discovery: { ...discovery, ok: false, failureClass: 'BAD_CONTRACT', detail: 'response success !== true' },
      listing: null,
    };
  }
  if (!Array.isArray(json.listings)) {
    return {
      discovery: { ...discovery, ok: false, failureClass: 'BAD_CONTRACT', detail: 'response has no `listings` array' },
      listing: null,
    };
  }
  const eligible = json.listings.find(isValidListingDto);
  if (!eligible) {
    return {
      discovery: {
        ...discovery,
        ok: false,
        failureClass: 'DISCOVERY_EMPTY',
        detail: `no eligible listing among ${json.listings.length} returned (need string url starting with /listing/ and non-empty id)`,
      },
      listing: null,
    };
  }
  return { discovery, listing: eligible, listings: json.listings };
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * INDEPENDENT listing-render identity — evidence the URL alone can never
 * satisfy (Codex review of PR #537: the canonical href itself contains the
 * listing id, so a whole-body substring match is NOT independent proof; a
 * soft-404 that echoes the requested canonical link would have passed).
 *
 * Accepted markers (characterized on the live page, 2026-07-19: healthy
 * renders carry `"listingId":"RLS…"` ×8 and `"currentListingId":"RLS…"` ×2
 * in flight data; URLs only ever carry the id as a lowercase path segment):
 *   - structured component/data property, plain or flight-escaped:
 *     "listingId":"<ID>" · "currentListingId":"<ID>" · "mlsId":"<ID>"
 *   - rendered MLS number text: MLS #<ID> / MLS: <ID>
 * A quoted property VALUE or rendered MLS text cannot be produced by an
 * href/src/og:url/router path, so URL occurrences never count.
 */
function hasIndependentListingIdentity(body, listingId) {
  if (!listingId || typeof body !== 'string') return false;
  const id = escapeRegExp(String(listingId));
  const structuredProp = new RegExp(
    `(?:currentListingId|listingId|mlsId)\\\\?["']\\s*:\\s*\\\\?["']${id}\\\\?["']`,
    'i'
  );
  const renderedMls = new RegExp(`MLS\\s*#?\\s*:?\\s*${id}(?![\\w-])`, 'i');
  return structuredProp.test(body) || renderedMls.test(body);
}

/**
 * Does the page's <title> represent the discovered listing's address?
 * Returns true/false, or null when the discovery DTO carries no displayable
 * street address (suppressed/undisclosed addresses, out-of-band pins) — in
 * that case the structured-id marker above is the deciding identity signal.
 */
function titleRepresentsListing(body, address) {
  if (!address || typeof address !== 'object') return null;
  const streetNumber = typeof address.streetNumber === 'string' ? address.streetNumber.trim() : '';
  const streetName = typeof address.streetName === 'string' ? address.streetName.trim() : '';
  if (!streetNumber || !streetName || /undisclosed/i.test(streetName)) return null;
  const m = /<title>([^<]*)/i.exec(body);
  const title = (m ? m[1] : '').toLowerCase();
  if (!title) return false;
  const nameTokens = streetName.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  const tokensOk = nameTokens.length === 0 || nameTokens.some((t) => title.includes(t));
  return title.includes(streetNumber.toLowerCase()) && tokensOk;
}

/**
 * Assess a listing PAGE body (canonical or alias-resolved) for the
 * context-sensitive unavailable state and the positive listing identity.
 *
 * Canonical-URL verification and listing-identity verification are kept
 * SEPARATE (the canonical href contains the listing id, so it can never
 * double as identity proof). A page passes only when ALL hold:
 *   - the expected canonical URL is present (canonical verification);
 *   - an INDEPENDENT listing-render identity marker is present
 *     (hasIndependentListingIdentity — URL occurrences never count);
 *   - the title/address metadata represents the discovered listing
 *     (when the DTO carries a displayable address);
 *   - "Listing Not Available" is not the ACTIVE page result.
 * Returns { ok, failureClass?, detail?, note? }.
 */
function assessListingPageBody(body, canonicalPath, listingId, { address } = {}) {
  const text = typeof body === 'string' ? body : '';
  const lower = text.toLowerCase();
  const phrasePresent = lower.includes(LISTING_UNAVAILABLE_TEXT.toLowerCase());
  if (ACTIVE_UNAVAILABLE_RE.test(text)) {
    return {
      ok: false,
      failureClass: 'FAILURE_TEXT',
      detail: `"${LISTING_UNAVAILABLE_TEXT}" is the ACTIVE page result (rendered as an HTML text node)`,
    };
  }
  const hasCanonical = !!canonicalPath && text.includes(canonicalPath);
  if (!hasCanonical) {
    return {
      ok: false,
      failureClass: phrasePresent ? 'FAILURE_TEXT' : 'BAD_CONTRACT',
      detail: phrasePresent
        ? `"${LISTING_UNAVAILABLE_TEXT}" present and the expected canonical URL is missing — treating as the active page result`
        : 'page does not carry the expected canonical URL',
    };
  }
  const independent = hasIndependentListingIdentity(text, listingId);
  if (!independent) {
    // The canonical href alone is NOT identity (it contains the id by
    // construction). A soft-404/fallback echoing the requested link lands
    // here and fails.
    return {
      ok: false,
      failureClass: phrasePresent ? 'FAILURE_TEXT' : 'BAD_CONTRACT',
      detail: phrasePresent
        ? `"${LISTING_UNAVAILABLE_TEXT}" present and NO independent listing-render identity found (structured listingId/currentListingId/mlsId property or rendered MLS number) — canonical href alone is not identity; treating as the active/soft-404 page result`
        : 'page carries the canonical URL but NO independent listing-render identity (structured listingId/currentListingId/mlsId property or rendered MLS number)',
    };
  }
  const metadata = titleRepresentsListing(text, address);
  if (metadata === false) {
    return {
      ok: false,
      failureClass: 'BAD_CONTRACT',
      detail: 'page title/address metadata does not represent the discovered listing',
    };
  }
  return {
    ok: true,
    note: phrasePresent
      ? 'dormant serialized notFound template present in flight data (expected on healthy Next.js renders) — independent listing identity verified, not an active failure'
      : undefined,
  };
}

/** Does the alias probe provably END at the expected canonical URL?
 *  Accepts either a followed redirect whose final pathname equals the
 *  canonical path, or a directly-rendered page whose body contains the
 *  canonical path (rendered canonical link). */
function aliasEndsAtCanonical(aliasResult, canonicalPath) {
  if (aliasResult.finalUrl) {
    try {
      const finalPath = new URL(aliasResult.finalUrl).pathname;
      if (finalPath === canonicalPath) return true;
      if (decodeURIComponent(finalPath) === canonicalPath) return true;
      // finalUrl still on the alias path => fall through to body check
      if (!canonicalPath.startsWith(finalPath)) {
        // an unrelated final path is only acceptable if the body proves the
        // canonical link — checked below
      }
    } catch {
      /* unparseable finalUrl -> body check */
    }
  }
  return typeof aliasResult.body === 'string' && aliasResult.body.includes(canonicalPath);
}

/**
 * Run the full five-probe smoke.
 * @param {object} opts
 * @param {string} opts.baseUrl        e.g. https://mallan.nyc (required)
 * @param {string} [opts.listingId]    stable pin: the probe target MUST be
 *                                     this exact listing (found by exact-id
 *                                     match in discovery, or supplied
 *                                     directly with listingUrl). Never
 *                                     silently substituted.
 * @param {string} [opts.listingUrl]   canonical URL for the pinned listing
 *                                     (used with listingId when the pin may
 *                                     not appear in discovery)
 * @param {string} [opts.expectedSha]  recorded verbatim in the evidence
 * @param {string} [opts.deploymentId] recorded verbatim in the evidence
 * @param {function} [opts.fetchImpl]  injectable fetch (tests)
 * @param {function} [opts.now]        injectable clock (tests)
 * @param {number} [opts.timeoutMs]
 */
async function runListingSmoke(opts) {
  const {
    baseUrl,
    listingId,
    listingUrl,
    expectedSha = null,
    deploymentId = null,
    fetchImpl = globalThis.fetch,
    now = () => new Date().toISOString(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts || {};
  if (!baseUrl || typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('runListingSmoke: baseUrl (http/https) is required');
  }
  const base = baseUrl.replace(/\/+$/, '');
  const ctx = { fetchImpl, timeoutMs };
  const probes = [];

  // Probe 1 — discovery (also supplies/validates the probe target)
  const first = await discoverListing(base, ctx);
  probes.push(first.discovery);

  // Resolve ONE exact target listing for canonical + alias + similar.
  let target = null;
  if (listingId) {
    const pinned = (first.listings || []).find((l) => isValidListingDto(l) && l.id === listingId);
    if (pinned) {
      target = pinned;
    } else if (listingUrl && listingUrl.startsWith('/listing/')) {
      // Exact pin supplied out-of-band (ID + canonical URL): usable even when
      // not among the first discovery results. Similar-query fields are
      // unavailable on this path, so the similar probe will report
      // BAD_CONTRACT unless the pin appears in discovery.
      target = { id: listingId, url: listingUrl };
    } else {
      probes.push({
        name: 'pin-resolution',
        ok: false,
        failureClass: 'BAD_CONTRACT',
        detail: `pinned listing '${listingId}' is not among the discovery results and no --listing-url was supplied — refusing to substitute an unrelated listing`,
      });
    }
  } else if (first.listing) {
    target = first.listing;
  }

  // Probe 2 — canonical detail page (API/pin URL, verbatim)
  let canonicalPath = target ? target.url : null;
  if (canonicalPath) {
    let canonical = await probeWithRetry('canonical-detail', `${base}${canonicalPath}`, ctx, {
      checkFailureText: true,
    });
    if (!canonical.ok && canonical.status === 404 && !listingId) {
      // Discovered listing may have gone off-market between calls —
      // one fresh discovery, then final verdict (same-listing 404 stays FAIL).
      const second = await discoverListing(base, ctx);
      if (second.listing) {
        target = second.listing;
        canonicalPath = second.listing.url;
        canonical = await probeWithRetry('canonical-detail(rediscovered)', `${base}${canonicalPath}`, ctx, {
          checkFailureText: true,
        });
      }
    }
    // Context-sensitive assessment: the page must REPRESENT the discovered
    // listing (canonical URL + id present) and "Listing Not Available" must
    // not be the active result — a dormant serialized notFound template in
    // otherwise-valid listing HTML passes (see assessListingPageBody).
    if (canonical.ok) {
      const assessment = assessListingPageBody(canonical.body, canonicalPath, target && target.id, {
        address: target && target.address,
      });
      if (!assessment.ok) {
        canonical.ok = false;
        canonical.failureClass = assessment.failureClass;
        canonical.detail = assessment.detail;
      } else if (assessment.note) {
        canonical.note = assessment.note;
      }
    }
    delete canonical.body;
    probes.push(canonical);
  } else {
    probes.push({ name: 'canonical-detail', ok: false, failureClass: 'DISCOVERY_EMPTY', detail: 'no probe target resolved (discovery failed or pin unresolvable)' });
  }

  // Probe 3 — ID-only alias: must resolve AND provably end at the SAME
  // listing's canonical URL (redirect target or rendered canonical link).
  if (target) {
    const alias = await probeWithRetry('id-alias', `${base}/listing/${encodeURIComponent(target.id)}`, ctx, {
      checkFailureText: true,
    });
    if (alias.ok && ACTIVE_UNAVAILABLE_RE.test(alias.body || '')) {
      alias.ok = false;
      alias.failureClass = 'FAILURE_TEXT';
      alias.detail = `alias page: "${LISTING_UNAVAILABLE_TEXT}" is the ACTIVE page result (rendered as an HTML text node)`;
    } else if (alias.ok && !aliasEndsAtCanonical(alias, canonicalPath)) {
      alias.ok = false;
      alias.failureClass = 'BAD_CONTRACT';
      alias.detail = `alias /listing/${target.id} did not provably end at the expected canonical URL ${canonicalPath} (no matching redirect target or canonical link in the body)`;
    }
    delete alias.body;
    probes.push(alias);
  } else {
    probes.push({ name: 'id-alias', ok: false, failureClass: 'DISCOVERY_EMPTY', detail: 'no probe target resolved' });
  }

  // Probe 4 — similar-properties API. The route provably short-circuits to an
  // empty 200 without `postalCode` AND `price`, so the query is derived from
  // the target listing's REAL values, and the response must prove the
  // meaningful path ran (listings[] + recognized _compliance.source).
  const similarParams = buildSimilarQueryFromListing(target);
  if (!similarParams.ok) {
    probes.push({
      name: 'similar-api',
      ok: false,
      failureClass: target ? 'BAD_CONTRACT' : 'DISCOVERY_EMPTY',
      detail: similarParams.detail,
    });
  } else {
    const similar = await probeWithRetry('similar-api', `${base}/api/listings/similar?${similarParams.qs.toString()}`, ctx, {
      expectJson: true,
    });
    if (similar.ok) {
      const contractError = validateSimilarResponse(similar.json);
      if (contractError) {
        similar.ok = false;
        similar.failureClass = 'BAD_CONTRACT';
        similar.detail = contractError;
      }
    }
    probes.push(similar);
  }

  // Probe 5 — open-houses API. HTTP/JSON-CONTRACT-PROVEN ONLY: the route
  // degrades to { openHouses: [] } on backend failure, so this probe cannot
  // verify Neon/Cotality health (stated on the probe, not hidden).
  const openHouses = await probeWithRetry('open-houses-api', `${base}/api/open-houses`, ctx, { expectJson: true });
  if (openHouses.ok && !(openHouses.json && Array.isArray(openHouses.json.openHouses))) {
    openHouses.ok = false;
    openHouses.failureClass = 'BAD_CONTRACT';
    openHouses.detail = 'response has no openHouses array';
  }
  openHouses.proof = 'HTTP/JSON-CONTRACT-PROVEN';
  openHouses.note = 'backend Neon/Cotality health UNVERIFIED — the route returns an empty array on internal failure under the current contract';
  probes.push(openHouses);

  const passed = probes.every((p) => p.ok);
  return {
    passed,
    observed_at: now(),
    base_url: base,
    expected_sha: expectedSha,
    deployment_id: deploymentId,
    listing: target ? { id: target.id, canonical_url: canonicalPath } : null,
    probes: probes.map(({ json, body, ...rest }) => rest), // strip payloads from the report
  };
}

module.exports = {
  runListingSmoke,
  FAILURE_STRINGS,
  LISTING_UNAVAILABLE_TEXT,
  ACTIVE_UNAVAILABLE_RE,
  RECOGNIZED_SIMILAR_SOURCES,
  boundedGet,
  probeWithRetry,
  buildSimilarQueryFromListing,
  validateSimilarResponse,
  aliasEndsAtCanonical,
  assessListingPageBody,
  hasIndependentListingIdentity,
  titleRepresentsListing,
};

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const baseUrl = flag('--base-url');
  if (!baseUrl) {
    console.error('Usage: node scripts/release-safety/listing-smoke.js --base-url https://mallan.nyc [--listing-id <id> [--listing-url </listing/...>]] [--expected-sha <sha>] [--deployment-id <dpl_...>]');
    process.exit(2);
  }
  runListingSmoke({
    baseUrl,
    listingId: flag('--listing-id') || process.env.SMOKE_LISTING_ID || undefined,
    listingUrl: flag('--listing-url') || process.env.SMOKE_LISTING_URL || undefined,
    expectedSha: flag('--expected-sha') || undefined,
    deploymentId: flag('--deployment-id') || undefined,
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error(`listing-smoke fatal: ${err.message}`);
      process.exit(1);
    });
}
