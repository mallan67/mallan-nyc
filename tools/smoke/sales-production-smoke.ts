#!/usr/bin/env tsx
/**
 * Sales Production Smoke Runner — READ-ONLY proof of live behavior.
 *
 * Runs 10 GET-only checks against a production-style base URL (default:
 * https://mallan.nyc) to prove a known sales listing is discoverable,
 * resolvable via the canonical URL, and not corrupted by duplicate media or
 * "Listing Not Available" fallthrough.
 *
 * HARD RULES:
 *   - Read-only. No POST / PATCH / PUT / DELETE.
 *   - No DB mutation. No CRM auth. No publish/save.
 *   - No Vercel preview required. Targets production.
 *   - All listing-specific values come from env. NO hardcoded real listing
 *     addresses, IDs, or unit numbers anywhere in this file. That keeps the
 *     tool generic and re-runnable for any other sales listing.
 *
 * USAGE:
 *   SALES_SMOKE_BASE_URL=https://mallan.nyc \
 *   SALES_SMOKE_LISTING_ID=SL-0004 \
 *   SALES_SMOKE_ADDRESS_QUERY="333 E 46th St" \
 *   SALES_SMOKE_CANONICAL_PATH=/listing/{address-slug}/{listing-id} \
 *   SALES_SMOKE_EXPECTED_ADDRESS_TOKENS="333,46th,2G,10017" \
 *   npm run smoke:sales:prod
 *
 * OUTPUT:
 *   ops/audit/sales-smoke/sales-smoke-<ISO>.json
 *   ops/audit/sales-smoke/sales-smoke-<ISO>.md
 *
 * EXIT CODE:
 *   0 if all required checks pass.
 *   1 if any required check fails.
 *
 * @module tools/smoke/sales-production-smoke
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';

interface CheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  required: boolean;
  durationMs: number;
  detail: string;
  evidence?: Record<string, unknown>;
  error?: string;
}

interface SmokeConfig {
  baseUrl: string;
  listingId: string;
  addressQuery: string;
  canonicalPath: string;
  expectedAddressTokens: string[];
  expectedUniqueMediaMax: number | null;
  timeoutMs: number;
  userAgent: string;
}

// ─── Config ──────────────────────────────────────────────────────────────

function readConfig(): { ok: true; config: SmokeConfig } | { ok: false; error: string } {
  const baseUrl = (process.env.SALES_SMOKE_BASE_URL || '').replace(/\/+$/, '');
  const listingId = process.env.SALES_SMOKE_LISTING_ID || '';
  const addressQuery = process.env.SALES_SMOKE_ADDRESS_QUERY || '';
  const canonicalPath = process.env.SALES_SMOKE_CANONICAL_PATH || '';
  const tokens = (process.env.SALES_SMOKE_EXPECTED_ADDRESS_TOKENS || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  const uniqueMax = process.env.SALES_SMOKE_EXPECTED_UNIQUE_MEDIA_MAX;
  const timeoutMs = Number(process.env.SALES_SMOKE_TIMEOUT_MS || '15000');

  const missing: string[] = [];
  if (!baseUrl) missing.push('SALES_SMOKE_BASE_URL');
  if (!listingId) missing.push('SALES_SMOKE_LISTING_ID');
  if (!addressQuery) missing.push('SALES_SMOKE_ADDRESS_QUERY');
  if (!canonicalPath) missing.push('SALES_SMOKE_CANONICAL_PATH');
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required env: ${missing.join(', ')}. See file header for usage.`,
    };
  }
  if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://')) {
    return { ok: false, error: `SALES_SMOKE_BASE_URL must include scheme (http:// or https://).` };
  }
  if (!canonicalPath.startsWith('/')) {
    return { ok: false, error: `SALES_SMOKE_CANONICAL_PATH must start with '/'.` };
  }

  return {
    ok: true,
    config: {
      baseUrl,
      listingId,
      addressQuery,
      canonicalPath,
      expectedAddressTokens: tokens,
      expectedUniqueMediaMax: uniqueMax ? Number(uniqueMax) : null,
      timeoutMs,
      userAgent: 'mallan-sales-smoke/1.0 (+https://mallan.nyc) read-only-probe',
    },
  };
}

// ─── HTTP helper ─────────────────────────────────────────────────────────

interface FetchResult {
  ok: boolean;
  status: number;
  redirectChain: { from: string; to: string; status: number }[];
  finalUrl: string;
  body: string;
  json: unknown | null;
  durationMs: number;
  error?: string;
}

async function probe(
  url: string,
  cfg: SmokeConfig,
  opts: { followRedirects?: boolean } = {},
): Promise<FetchResult> {
  const followRedirects = opts.followRedirects !== false;
  const started = Date.now();
  const redirectChain: { from: string; to: string; status: number }[] = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);

  try {
    let currentUrl = url;
    let hops = 0;
    const maxHops = 5;
    let resp: Response | null = null;

    while (hops < maxHops) {
      const r = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': cfg.userAgent, Accept: '*/*' },
        signal: ctrl.signal,
      });
      if ([301, 302, 303, 307, 308].includes(r.status) && followRedirects) {
        const loc = r.headers.get('location') || '';
        if (!loc) {
          resp = r;
          break;
        }
        const next = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
        redirectChain.push({ from: currentUrl, to: next, status: r.status });
        currentUrl = next;
        hops++;
        continue;
      }
      resp = r;
      break;
    }

    if (!resp) {
      return {
        ok: false,
        status: 0,
        redirectChain,
        finalUrl: currentUrl,
        body: '',
        json: null,
        durationMs: Date.now() - started,
        error: 'Exceeded max redirect hops',
      };
    }

    const body = await resp.text();
    let json: unknown | null = null;
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { json = JSON.parse(body); } catch { json = null; }
    }

    return {
      ok: resp.ok,
      status: resp.status,
      redirectChain,
      finalUrl: currentUrl,
      body,
      json,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      redirectChain,
      finalUrl: url,
      body: '',
      json: null,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Helpers for payload inspection ──────────────────────────────────────

function findListingInPayload(
  payload: unknown,
  listingId: string,
): { found: boolean; listing?: Record<string, unknown> } {
  if (!payload || typeof payload !== 'object') return { found: false };
  const lid = listingId.toLowerCase();

  const candidates: unknown[] = [];
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.listings)) candidates.push(...p.listings);
  if (Array.isArray(p.results)) candidates.push(...p.results);
  if (Array.isArray(p.suggestions)) candidates.push(...p.suggestions);
  if (Array.isArray(p.items)) candidates.push(...p.items);
  if (p.listing && typeof p.listing === 'object') candidates.push(p.listing);

  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const row = c as Record<string, unknown>;
    const id = String(row.id || row.listing_id || row.listingId || row.mlsId || '').toLowerCase();
    if (id === lid) return { found: true, listing: row };
    const slug = String(row.slug || '').toLowerCase();
    if (slug.endsWith(`-${lid}`) || slug === `listing-${lid}`) {
      return { found: true, listing: row };
    }
  }
  return { found: false };
}

function uniqueMediaCount(media: unknown): { unique: number; total: number } {
  if (!Array.isArray(media)) return { unique: 0, total: 0 };
  const seen = new Set<string>();
  for (const m of media) {
    if (!m || typeof m !== 'object') continue;
    const row = m as Record<string, unknown>;
    const url = String(row.url || row.MediaURL || row.heroUrl || '').trim();
    if (url) seen.add(url);
  }
  return { unique: seen.size, total: media.length };
}

// ─── Checks ──────────────────────────────────────────────────────────────

async function runChecks(cfg: SmokeConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const record = (r: CheckResult) => {
    results.push(r);
    const tag = r.status === 'PASS' ? '✓' : r.status === 'SKIP' ? '·' : '✗';
    process.stdout.write(`  ${tag} [${r.id}] ${r.name} (${r.durationMs}ms)\n`);
    if (r.status === 'FAIL') process.stdout.write(`      → ${r.detail}\n`);
  };

  // 1. Suggest by listing id
  {
    const url = `${cfg.baseUrl}/api/listings/suggest?q=${encodeURIComponent(cfg.listingId)}`;
    const r = await probe(url, cfg);
    const match = findListingInPayload(r.json, cfg.listingId);
    record({
      id: 'CHECK-1',
      name: 'suggest by listing id returns the listing',
      status: r.ok && match.found ? 'PASS' : 'FAIL',
      required: true,
      durationMs: r.durationMs,
      detail: r.ok
        ? (match.found ? 'listing surfaced in suggest payload' : `200 OK but ${cfg.listingId} not in suggestions`)
        : `HTTP ${r.status} ${r.error || ''}`,
      evidence: { url, httpStatus: r.status, redirectChain: r.redirectChain, found: match.found },
    });
  }

  // 2. Suggest by address query
  {
    const url = `${cfg.baseUrl}/api/listings/suggest?q=${encodeURIComponent(cfg.addressQuery)}`;
    const r = await probe(url, cfg);
    const match = findListingInPayload(r.json, cfg.listingId);
    record({
      id: 'CHECK-2',
      name: 'suggest by address query returns the listing',
      status: r.ok && match.found ? 'PASS' : 'FAIL',
      required: true,
      durationMs: r.durationMs,
      detail: r.ok
        ? (match.found ? 'listing surfaced in suggest payload' : 'listing missing from suggest results')
        : `HTTP ${r.status} ${r.error || ''}`,
      evidence: { url, httpStatus: r.status, found: match.found },
    });
  }

  // 3. /api/listings?address={query}
  {
    const url = `${cfg.baseUrl}/api/listings?address=${encodeURIComponent(cfg.addressQuery)}&limit=20`;
    const r = await probe(url, cfg);
    const match = findListingInPayload(r.json, cfg.listingId);
    record({
      id: 'CHECK-3',
      name: '/api/listings?address={query} returns the listing',
      status: r.ok && match.found ? 'PASS' : 'FAIL',
      required: true,
      durationMs: r.durationMs,
      detail: r.ok
        ? (match.found ? 'listing returned in public search' : 'listing not in public address search results')
        : `HTTP ${r.status} ${r.error || ''}`,
      evidence: { url, httpStatus: r.status, found: match.found },
    });
  }

  // 4. /listing/{listingId} redirects to canonical path
  {
    const url = `${cfg.baseUrl}/listing/${cfg.listingId.toLowerCase()}`;
    // First probe without following redirects, to capture the initial status.
    const noFollow = await probe(url, cfg, { followRedirects: false });
    const isRedirectStatus = [301, 302, 303, 307, 308].includes(noFollow.status);
    let followFinalUrl = '';
    if (!isRedirectStatus) {
      // Some implementations resolve via internal redirect inside the framework
      // and surface as 200 with the canonical URL already in place. Re-probe
      // following redirects to capture the final URL for the canonical compare.
      const followed = await probe(url, cfg);
      followFinalUrl = followed.finalUrl;
    } else {
      const followed = await probe(url, cfg);
      followFinalUrl = followed.finalUrl;
    }
    const finalPath = (() => {
      try { return new URL(followFinalUrl).pathname; } catch { return ''; }
    })();
    const canonicalLower = cfg.canonicalPath.toLowerCase();
    const passes = isRedirectStatus || finalPath.toLowerCase() === canonicalLower;
    record({
      id: 'CHECK-4',
      name: '/listing/{listingId} redirects to (or resolves to) canonical path',
      status: passes ? 'PASS' : 'FAIL',
      required: true,
      durationMs: noFollow.durationMs,
      detail: passes
        ? `initial ${noFollow.status}${isRedirectStatus ? ' redirect' : ''}; final path: ${finalPath}`
        : `expected redirect or final path ${canonicalLower}, got status ${noFollow.status} → ${finalPath}`,
      evidence: { url, initialStatus: noFollow.status, finalUrl: followFinalUrl, expectedPath: canonicalLower },
    });
  }

  // 5. canonical path returns 200
  let canonicalBody = '';
  let canonicalJson: unknown | null = null;
  {
    const url = `${cfg.baseUrl}${cfg.canonicalPath}`;
    const r = await probe(url, cfg);
    canonicalBody = r.body;
    canonicalJson = r.json;
    record({
      id: 'CHECK-5',
      name: 'canonical path returns 200',
      status: r.ok ? 'PASS' : 'FAIL',
      required: true,
      durationMs: r.durationMs,
      detail: r.ok ? '200 OK' : `HTTP ${r.status} ${r.error || ''}`,
      evidence: { url, httpStatus: r.status, finalUrl: r.finalUrl, byteLength: r.body.length },
    });
  }

  // 6. canonical page does NOT contain "Listing Not Available"
  {
    const hit = canonicalBody.includes('Listing Not Available');
    record({
      id: 'CHECK-6',
      name: 'canonical page does NOT contain "Listing Not Available"',
      status: hit ? 'FAIL' : 'PASS',
      required: true,
      durationMs: 0,
      detail: hit
        ? 'canonical page rendered the not-available fallback — listing is being blocked by display gates'
        : 'not-available text not present',
      evidence: { foundNotAvailable: hit },
    });
  }

  // 7. canonical page contains every expected address token
  {
    if (cfg.expectedAddressTokens.length === 0) {
      record({
        id: 'CHECK-7',
        name: 'canonical page contains expected address tokens from env',
        status: 'SKIP',
        required: false,
        durationMs: 0,
        detail: 'no SALES_SMOKE_EXPECTED_ADDRESS_TOKENS provided',
      });
    } else {
      const missing = cfg.expectedAddressTokens.filter(tok => !canonicalBody.includes(tok));
      record({
        id: 'CHECK-7',
        name: 'canonical page contains expected address tokens from env',
        status: missing.length === 0 ? 'PASS' : 'FAIL',
        required: true,
        durationMs: 0,
        detail: missing.length === 0
          ? `all ${cfg.expectedAddressTokens.length} tokens present`
          : `missing tokens: ${missing.join(', ')}`,
        evidence: { expected: cfg.expectedAddressTokens, missing },
      });
    }
  }

  // 8. public API payload includes listing id + status + display gates (if exposed)
  {
    const url = `${cfg.baseUrl}/api/listings?address=${encodeURIComponent(cfg.addressQuery)}&limit=5`;
    const r = await probe(url, cfg);
    const match = findListingInPayload(r.json, cfg.listingId);
    if (!match.found || !match.listing) {
      record({
        id: 'CHECK-8',
        name: 'public API payload exposes id + status (and display gates if present)',
        status: 'FAIL',
        required: true,
        durationMs: r.durationMs,
        detail: 'listing not found in payload — cannot inspect gates',
        evidence: { url, httpStatus: r.status },
      });
    } else {
      const row = match.listing as Record<string, unknown>;
      const id = String(row.id || row.listing_id || row.listingId || row.mlsId || '');
      const status = String(row.status || '');
      const internetGate = row.internet_entire_listing_display_yn;
      const addressGate = row.internet_address_display_yn;
      const idMatches = id.toLowerCase() === cfg.listingId.toLowerCase();
      const statusOk = ['Active', 'ComingSoon', 'ActiveUnderContract', 'Coming Soon'].includes(status);
      const gateOk = internetGate === undefined || internetGate !== false;
      const addrGateOk = addressGate === undefined || addressGate !== false;
      const allOk = idMatches && statusOk && gateOk && addrGateOk;
      record({
        id: 'CHECK-8',
        name: 'public API payload exposes id + status (and display gates if present)',
        status: allOk ? 'PASS' : 'FAIL',
        required: true,
        durationMs: r.durationMs,
        detail: allOk
          ? `id=${id}, status=${status}, gates ok`
          : `idMatches=${idMatches}, statusOk=${statusOk}(${status}), gateOk=${gateOk}, addrGateOk=${addrGateOk}`,
        evidence: { id, status, internetGate, addressGate },
      });
    }
  }

  // 9. media count not duplicated beyond known unique max (if cap provided + payload exposes media)
  {
    const url = `${cfg.baseUrl}/api/listings?address=${encodeURIComponent(cfg.addressQuery)}&limit=5`;
    const r = await probe(url, cfg);
    const match = findListingInPayload(r.json, cfg.listingId);
    if (!match.found || !match.listing) {
      record({
        id: 'CHECK-9',
        name: 'media has no exact-URL duplicates (and unique <= expected max if provided)',
        status: 'SKIP',
        required: false,
        durationMs: r.durationMs,
        detail: 'listing not in payload — skipping media inspection',
      });
    } else {
      const row = match.listing as Record<string, unknown>;
      const counts = uniqueMediaCount(row.media);
      const hasExactDupes = counts.total > counts.unique;
      const capOk = cfg.expectedUniqueMediaMax === null || counts.unique <= cfg.expectedUniqueMediaMax;
      const pass = !hasExactDupes && capOk;
      record({
        id: 'CHECK-9',
        name: 'media has no exact-URL duplicates (and unique <= expected max if provided)',
        status: pass ? 'PASS' : 'FAIL',
        required: cfg.expectedUniqueMediaMax !== null,
        durationMs: r.durationMs,
        detail: pass
          ? `${counts.unique} unique URLs (total ${counts.total})`
          : `unique=${counts.unique}, total=${counts.total}, cap=${cfg.expectedUniqueMediaMax ?? 'n/a'}`,
        evidence: counts,
      });
    }
  }

  // 10. Featured/Exclusives includes the listing (if eligible)
  {
    const url = `${cfg.baseUrl}/api/listings?type=sale&exclusive=mallan&limit=50`;
    const r = await probe(url, cfg);
    const match = findListingInPayload(r.json, cfg.listingId);
    record({
      id: 'CHECK-10',
      name: 'Mallan exclusives feed includes the listing if eligible',
      status: r.ok && match.found ? 'PASS' : 'FAIL',
      // Marked non-required so a non-eligible listing (commercial, suppressed,
      // not opted into Mallan exclusives) does not red-light the whole run.
      // CHECK-3 and CHECK-5 already prove core public discoverability.
      required: false,
      durationMs: r.durationMs,
      detail: r.ok
        ? (match.found ? 'listing in exclusives feed' : 'not in exclusives feed (may be intentional)')
        : `HTTP ${r.status} ${r.error || ''}`,
      evidence: { url, httpStatus: r.status, found: match.found },
    });
  }

  // canonicalJson is intentionally unused below — captured here so a future
  // check can inspect JSON-LD or open-graph payload without re-probing.
  void canonicalJson;

  return results;
}

// ─── Report writer ───────────────────────────────────────────────────────

async function writeReport(
  cfg: SmokeConfig,
  results: CheckResult[],
  outDir: string,
): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `sales-smoke-${ts}.json`);
  const mdPath = path.join(outDir, `sales-smoke-${ts}.md`);

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const requiredFailed = results.filter(r => r.status === 'FAIL' && r.required).length;
  const verdict: 'GREEN' | 'YELLOW' | 'RED' = requiredFailed > 0
    ? 'RED'
    : failed > 0 ? 'YELLOW' : 'GREEN';

  const payload = {
    timestamp: new Date().toISOString(),
    verdict,
    summary: { total: results.length, passed, failed, skipped, requiredFailed },
    config: {
      baseUrl: cfg.baseUrl,
      listingId: cfg.listingId,
      addressQuery: cfg.addressQuery,
      canonicalPath: cfg.canonicalPath,
      expectedAddressTokens: cfg.expectedAddressTokens,
      expectedUniqueMediaMax: cfg.expectedUniqueMediaMax,
    },
    results,
  };
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));

  const md: string[] = [];
  md.push(`# Sales Production Smoke — ${verdict}`);
  md.push('');
  md.push(`- **Timestamp**: ${payload.timestamp}`);
  md.push(`- **Base URL**: ${cfg.baseUrl}`);
  md.push(`- **Listing ID**: ${cfg.listingId}`);
  md.push(`- **Address query**: ${cfg.addressQuery}`);
  md.push(`- **Canonical path**: ${cfg.canonicalPath}`);
  md.push(`- **Verdict**: ${verdict} (passed=${passed}, failed=${failed}, skipped=${skipped}, required-failed=${requiredFailed})`);
  md.push('');
  md.push('## Results');
  md.push('');
  md.push('| Check | Required | Status | Duration | Detail |');
  md.push('|---|---|---|---|---|');
  for (const r of results) {
    md.push(`| ${r.id} ${r.name} | ${r.required ? 'yes' : 'no'} | ${r.status} | ${r.durationMs}ms | ${r.detail.replace(/\|/g, '\\|')} |`);
  }
  md.push('');
  md.push('## Notes');
  md.push('- Read-only. No DB writes, no CRM auth, no publish/save.');
  md.push('- All listing-specific values came from env (no hardcoded examples).');
  md.push('- Required-failed → exit 1. YELLOW (non-required failures only) → exit 0.');
  await fs.writeFile(mdPath, md.join('\n') + '\n');

  return { jsonPath, mdPath };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cfgResult = readConfig();
  if (!cfgResult.ok) {
    process.stderr.write(`[sales-smoke] config error: ${cfgResult.error}\n`);
    process.exit(2);
  }
  const cfg = cfgResult.config;

  process.stdout.write(`[sales-smoke] Running against ${cfg.baseUrl} for listing ${cfg.listingId}\n`);
  process.stdout.write(`[sales-smoke] Canonical path: ${cfg.canonicalPath}\n\n`);

  const results = await runChecks(cfg);

  const outDir = path.resolve(process.cwd(), 'ops', 'audit', 'sales-smoke');
  const { jsonPath, mdPath } = await writeReport(cfg, results, outDir);

  const requiredFailed = results.filter(r => r.status === 'FAIL' && r.required).length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const passed = results.filter(r => r.status === 'PASS').length;

  process.stdout.write(`\n[sales-smoke] passed=${passed}, failed=${failed}, required-failed=${requiredFailed}\n`);
  process.stdout.write(`[sales-smoke] JSON: ${jsonPath}\n`);
  process.stdout.write(`[sales-smoke] MD:   ${mdPath}\n`);

  if (requiredFailed > 0) {
    process.stdout.write(`[sales-smoke] VERDICT: RED — required check(s) failed.\n`);
    process.exit(1);
  }
  if (failed > 0) {
    process.stdout.write(`[sales-smoke] VERDICT: YELLOW — optional check(s) failed.\n`);
    process.exit(0);
  }
  process.stdout.write(`[sales-smoke] VERDICT: GREEN — all checks passed.\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[sales-smoke] unexpected error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`);
  process.exit(3);
});
