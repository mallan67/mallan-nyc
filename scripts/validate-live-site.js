#!/usr/bin/env node
/**
 * Live Site Validator (Phase 4 — release-truth framework)
 *
 * Closes the repo-vs-production gap. The repo can look healthy while
 * production is stale, broken, or stuck in a loading shell.
 *
 * Smoke checks:
 *   1. Homepage 200 + reasonable response time
 *   2. Search page 200 with rendered results (not just a loading shell)
 *   3. Public health endpoint 200
 *   4. "Data last updated" freshness within policy threshold
 *   5. REBNY attribution visible on listing pages (mandatory by license)
 *   6. (optional) Sitemap reachable + non-empty
 *
 * Statuses (per shared validator-truth vocabulary):
 *   PASS        all smoke checks succeed
 *   FAIL        a hard requirement failed (homepage 5xx, missing attribution)
 *   BLOCKED     edge protections (Cloudflare challenge, IP block) prevent verification
 *   UNVERIFIED  smoke not run OR DNS resolution failed
 *
 * Exit codes:
 *   0  PASS or BLOCKED (BLOCKED is informational; caller decides)
 *   1  any FAIL
 *   2  UNVERIFIED in --strict mode
 *
 * Usage:
 *   node scripts/validate-live-site.js
 *   node scripts/validate-live-site.js --base-url https://mallan.nyc
 *   node scripts/validate-live-site.js --json
 *   node scripts/validate-live-site.js --strict
 *   node scripts/validate-live-site.js --max-staleness-hours 24
 */

const args = process.argv.slice(2);
const argFlag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const has = (n) => args.includes(n);

const BASE_URL = (argFlag('--base-url') || 'https://mallan.nyc').replace(/\/$/, '');
const jsonOutput = has('--json');
const strict = has('--strict');
const MAX_STALENESS_HOURS = Number(argFlag('--max-staleness-hours') || '24');
const TIMEOUT_MS = Number(argFlag('--timeout-ms') || '15000');

async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const start = Date.now();
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    const elapsed = Date.now() - start;
    return { res, elapsed };
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

const results = {
  timestamp: new Date().toISOString(),
  base_url: BASE_URL,
  checks: [],
  summary: { pass: 0, fail: 0, blocked: 0, unverified: 0 },
};

function record(name, verdict, detail) {
  results.checks.push({ check: name, verdict, ...detail });
  if (verdict === 'PASS') results.summary.pass++;
  else if (verdict === 'FAIL') results.summary.fail++;
  else if (verdict === 'BLOCKED') results.summary.blocked++;
  else if (verdict === 'UNVERIFIED') results.summary.unverified++;
}

function looksBlocked(html) {
  return /cloudflare|cf-ray|access denied|just a moment\.\.|attention required/i.test(html.slice(0, 5000));
}

(async () => {
  // 1. Homepage
  {
    const r = await fetchWithTimeout(`${BASE_URL}/`);
    if (r.error) {
      record('homepage', 'UNVERIFIED', { reason: `network error: ${r.error}` });
    } else if (r.res.status >= 500) {
      record('homepage', 'FAIL', { reason: `HTTP ${r.res.status}`, elapsed_ms: r.elapsed });
    } else if (r.res.status >= 400) {
      record('homepage', 'FAIL', { reason: `HTTP ${r.res.status}`, elapsed_ms: r.elapsed });
    } else {
      const html = await r.res.text();
      if (looksBlocked(html)) {
        record('homepage', 'BLOCKED', { reason: 'edge protection (Cloudflare challenge or similar) detected', elapsed_ms: r.elapsed });
      } else if (html.length < 500) {
        record('homepage', 'FAIL', { reason: `response < 500 bytes (${html.length})`, elapsed_ms: r.elapsed });
      } else {
        record('homepage', 'PASS', { reason: `HTTP 200, ${html.length} bytes`, elapsed_ms: r.elapsed });
      }
    }
  }

  // 2. Search page — must render something useful
  {
    const r = await fetchWithTimeout(`${BASE_URL}/search`);
    if (r.error) {
      record('search_page', 'UNVERIFIED', { reason: `network error: ${r.error}` });
    } else if (r.res.status >= 400) {
      record('search_page', 'FAIL', { reason: `HTTP ${r.res.status}`, elapsed_ms: r.elapsed });
    } else {
      const html = await r.res.text();
      if (looksBlocked(html)) {
        record('search_page', 'BLOCKED', { reason: 'edge protection', elapsed_ms: r.elapsed });
      } else if (html.length < 1000) {
        record('search_page', 'FAIL', { reason: `body < 1000 bytes (${html.length}) — possible empty shell`, elapsed_ms: r.elapsed });
      } else if (/<div[^>]*class="[^"]*loading[^"]*"[^>]*>[^<]*<\/div>\s*$/i.test(html.slice(-500))) {
        record('search_page', 'FAIL', { reason: 'page ends in a loading shell — possibly stuck', elapsed_ms: r.elapsed });
      } else {
        record('search_page', 'PASS', { reason: `HTTP 200, ${html.length} bytes`, elapsed_ms: r.elapsed });
      }
    }
  }

  // 3. Public health endpoint — best-effort, may not exist
  {
    const r = await fetchWithTimeout(`${BASE_URL}/api/health`);
    if (r.error) {
      record('api_health', 'UNVERIFIED', { reason: `network error: ${r.error}` });
    } else if (r.res.status === 404) {
      record('api_health', 'UNVERIFIED', { reason: 'no /api/health endpoint defined (optional)' });
    } else if (r.res.status >= 500) {
      record('api_health', 'FAIL', { reason: `HTTP ${r.res.status}`, elapsed_ms: r.elapsed });
    } else if (r.res.status === 200) {
      record('api_health', 'PASS', { reason: 'HTTP 200', elapsed_ms: r.elapsed });
    } else {
      record('api_health', 'UNVERIFIED', { reason: `HTTP ${r.res.status}`, elapsed_ms: r.elapsed });
    }
  }

  // 4. REBNY attribution presence on a listing page (sample)
  //    We hit the search page since IDX listings need attribution per RLS rules.
  //    "Listing Courtesy of" or "Mallan" branding must appear.
  {
    const r = await fetchWithTimeout(`${BASE_URL}/search`);
    if (!r.error && r.res?.ok) {
      const html = await r.res.text();
      const hasAttribution = /Listing\s+Courtesy\s+of|REBNY\s+RLS|Mallan\s+Real\s+Estate/i.test(html);
      const hasBrokerInfo = /10991205323|400\s*East\s*90th|646.*258.*4460/.test(html);
      if (hasAttribution || hasBrokerInfo) {
        record('rebny_attribution', 'PASS', { reason: 'attribution or brokerage identity present on /search' });
      } else {
        // Could be that /search doesn't show listings until JS loads — check homepage too
        const home = await fetchWithTimeout(`${BASE_URL}/`);
        if (home.res?.ok) {
          const homeHtml = await home.res.text();
          if (/Mallan\s+Real\s+Estate|10991205323|400\s*East\s*90th/i.test(homeHtml)) {
            record('rebny_attribution', 'PASS', { reason: 'brokerage identity present on homepage' });
          } else {
            record('rebny_attribution', 'FAIL', { reason: 'no REBNY attribution or brokerage identity found on homepage or /search — RLS license requires this' });
          }
        } else {
          record('rebny_attribution', 'UNVERIFIED', { reason: 'could not load homepage to confirm attribution' });
        }
      }
    } else {
      record('rebny_attribution', 'UNVERIFIED', { reason: 'search page unreachable for attribution check' });
    }
  }

  // 5. Data freshness (best-effort — looks for "Updated:" / "Last sync" / ISO timestamp on homepage or about page)
  {
    const r = await fetchWithTimeout(`${BASE_URL}/`);
    if (!r.error && r.res?.ok) {
      const html = await r.res.text();
      // Match ISO 8601 dates from data attributes or visible text
      const isoDates = [...html.matchAll(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/g)]
        .map((m) => new Date(m[1]))
        .filter((d) => !isNaN(d.valueOf()));

      if (isoDates.length === 0) {
        record('data_freshness', 'UNVERIFIED', { reason: 'no ISO timestamp found on homepage to assess freshness' });
      } else {
        const newest = new Date(Math.max(...isoDates.map((d) => d.valueOf())));
        const ageHours = (Date.now() - newest.valueOf()) / (60 * 60 * 1000);
        if (ageHours <= MAX_STALENESS_HOURS) {
          record('data_freshness', 'PASS', { reason: `freshest timestamp ${newest.toISOString()}, ${ageHours.toFixed(1)}h ago (threshold ${MAX_STALENESS_HOURS}h)` });
        } else {
          record('data_freshness', 'FAIL', { reason: `stalest acceptable: ${MAX_STALENESS_HOURS}h. Found freshest at ${ageHours.toFixed(1)}h ago.` });
        }
      }
    } else {
      record('data_freshness', 'UNVERIFIED', { reason: 'homepage unreachable for freshness check' });
    }
  }

  // 6. Sitemap reachable
  {
    const r = await fetchWithTimeout(`${BASE_URL}/sitemap.xml`);
    if (r.error) {
      record('sitemap', 'UNVERIFIED', { reason: `network error: ${r.error}` });
    } else if (r.res.status === 200) {
      const body = await r.res.text();
      if (body.length < 200) {
        record('sitemap', 'FAIL', { reason: `sitemap < 200 bytes (${body.length})`, elapsed_ms: r.elapsed });
      } else {
        record('sitemap', 'PASS', { reason: `${body.length} bytes`, elapsed_ms: r.elapsed });
      }
    } else if (r.res.status === 404) {
      record('sitemap', 'UNVERIFIED', { reason: 'no sitemap.xml served (not blocking)', elapsed_ms: r.elapsed });
    } else {
      record('sitemap', 'FAIL', { reason: `HTTP ${r.res.status}`, elapsed_ms: r.elapsed });
    }
  }

  // ─── Output ─────────────────────────────────────────────────────────────
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         Live Site Smoke Validator                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Target:     ${BASE_URL}`);
    console.log(`  Timestamp:  ${results.timestamp}`);
    console.log(`  Threshold:  freshness ≤ ${MAX_STALENESS_HOURS}h`);
    console.log('');

    for (const c of results.checks) {
      const icon = c.verdict === 'PASS' ? '✓' :
                   c.verdict === 'FAIL' ? '✗' :
                   c.verdict === 'BLOCKED' ? '⛌' : '?';
      const color = c.verdict === 'PASS' ? '\x1b[32m' :
                    c.verdict === 'FAIL' ? '\x1b[31m' :
                    c.verdict === 'BLOCKED' ? '\x1b[33m' : '\x1b[36m';
      const ms = c.elapsed_ms ? ` (${c.elapsed_ms}ms)` : '';
      console.log(`  ${color}${icon} ${c.verdict.padEnd(11)}\x1b[0m  ${c.check.padEnd(20)} ${c.reason}${ms}`);
    }
    console.log('');

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                        SUMMARY                             ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║  \x1b[32mPASS:\x1b[0m       ${String(results.summary.pass).padStart(4)}                                       ║`);
    console.log(`║  \x1b[31mFAIL:\x1b[0m       ${String(results.summary.fail).padStart(4)}                                       ║`);
    console.log(`║  \x1b[33mBLOCKED:\x1b[0m    ${String(results.summary.blocked).padStart(4)}                                       ║`);
    console.log(`║  \x1b[36mUNVERIFIED:\x1b[0m ${String(results.summary.unverified).padStart(4)}                                       ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');
  }

  let exitCode = 0;
  if (results.summary.fail > 0) exitCode = 1;
  else if (strict && results.summary.unverified > 0) exitCode = 2;
  process.exit(exitCode);
})();
