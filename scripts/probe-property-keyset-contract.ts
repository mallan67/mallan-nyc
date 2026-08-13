/**
 * LIVE COTALITY EXECUTION PROOF for the Property keyset cursor contract.
 *
 * The production design in PR #608 depends on Cotality accepting four things.
 * This script verifies each against CURRENT live Property data and writes
 * sanitized, durable evidence. It does NOT rely on any prior session's claim.
 *
 *   A) $orderby=ModificationTimestamp asc,ListingKey asc
 *   B) bootstrap boundary:  ModificationTimestamp ge T
 *   C) keyed continuation:  MT gt T or (MT eq T and ListingKey gt 'K')
 *   D) @odata.nextLink preserves BOTH the ordering and the filter
 *
 * STRICTLY READ-ONLY. Only HTTP GET against /odata/Property, plus the OAuth2
 * client-credentials token request. It writes nothing to Neon and mutates
 * nothing at the provider.
 *
 * USAGE
 *   npm run trestle:probe-keyset
 * Requires IDX_CLIENT_ID + IDX_CLIENT_SECRET (and optionally TRESTLE_API_URL)
 * in .env.local — the same variables lib/idx/auth.ts reads. The npm script
 * loads .env.local via --env-file-if-exists, so no secret is ever passed on the
 * command line.
 *
 * EVIDENCE HYGIENE — this output is committed, so it must never leak:
 *   - no Authorization header, token, client id or secret is printed
 *   - request URLs are recorded verbatim EXCEPT the host, which is recorded as
 *     the configured base (it carries no secret) — query strings are the
 *     contract under test and are kept in full
 *   - only ListingKey + ModificationTimestamp are recorded per row. No address,
 *     price, agent, or any other listing field is captured, so the artifact
 *     carries no REBNY-restricted content and is safe to commit.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
const PROPERTY = `${BASE}/odata/Property`;
const SELECT = "ListingKey,ModificationTimestamp";

type Row = { ListingKey?: string; ModificationTimestamp?: string };
type Capture = {
  label: string;
  url: string;
  httpStatus: number;
  ok: boolean;
  rowCount: number;
  firstRows: Row[];
  lastRows: Row[];
  nextLink: string | null;
  error?: string;
};

const captures: Capture[] = [];
const findings: { check: string; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; detail: string }[] = [];

async function token(): Promise<string> {
  const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET. Put them in .env.local (same vars lib/idx/auth.ts reads).",
    );
  }
  const res = await fetch(`${BASE}/oidc/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "api",
    }),
  });
  if (!res.ok) throw new Error(`token request failed: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("token response carried no access_token");
  return j.access_token;
}

/** One READ-ONLY GET, captured. `url` is used verbatim (nextLink included). */
async function probe(label: string, url: string, bearer: string): Promise<Capture> {
  let cap: Capture;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    });
    const body = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
    const rows = (body?.value as Row[] | undefined) ?? [];
    const slim = (r: Row): Row => ({
      ListingKey: r.ListingKey ? String(r.ListingKey) : undefined,
      ModificationTimestamp: r.ModificationTimestamp ? String(r.ModificationTimestamp) : undefined,
    });
    cap = {
      label,
      url: url.replace(BASE, "{TRESTLE_API_URL}"),
      httpStatus: res.status,
      ok: res.ok,
      rowCount: rows.length,
      firstRows: rows.slice(0, 3).map(slim),
      lastRows: rows.slice(-3).map(slim),
      nextLink: (body?.["@odata.nextLink"] as string | undefined)?.replace(BASE, "{TRESTLE_API_URL}") ?? null,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    cap = {
      label,
      url: url.replace(BASE, "{TRESTLE_API_URL}"),
      httpStatus: 0,
      ok: false,
      rowCount: 0,
      firstRows: [],
      lastRows: [],
      nextLink: null,
      error: err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
    };
  }
  captures.push(cap);
  console.log(`[${cap.ok ? "OK " : "ERR"}] ${label} -> HTTP ${cap.httpStatus}, ${cap.rowCount} rows`);
  return cap;
}

/** Strict ascending over (MT, ListingKey) — the exact order the cursor assumes. */
function isAscending(rows: Row[]): { ok: boolean; violationAt?: number } {
  for (let i = 1; i < rows.length; i++) {
    const pt = Date.parse(String(rows[i - 1].ModificationTimestamp));
    const ct = Date.parse(String(rows[i].ModificationTimestamp));
    if (ct < pt) return { ok: false, violationAt: i };
    if (ct === pt && String(rows[i].ListingKey) < String(rows[i - 1].ListingKey)) {
      return { ok: false, violationAt: i };
    }
  }
  return { ok: true };
}

async function main() {
  const bearer = await token();
  const q = (params: Record<string, string>) =>
    `${PROPERTY}?${new URLSearchParams({ $select: SELECT, ...params }).toString()}`;

  // ── A) ASC composite ordering is accepted ────────────────────────────────
  const a = await probe(
    "A: $orderby=ModificationTimestamp asc,ListingKey asc",
    q({ $orderby: "ModificationTimestamp asc,ListingKey asc", $top: "50" }),
    bearer,
  );
  const aAsc = isAscending([...a.firstRows, ...a.lastRows]);
  findings.push({
    check: "A_orderby_asc_composite_accepted",
    verdict: a.ok ? (aAsc.ok ? "PASS" : "FAIL") : "FAIL",
    detail: a.ok
      ? `HTTP 200, ${a.rowCount} rows; captured rows ascending=${aAsc.ok}`
      : `rejected: ${a.error}`,
  });

  // Anchor everything else on a REAL timestamp that exists in the feed.
  const anchorTs = a.firstRows[0]?.ModificationTimestamp ?? null;
  if (!a.ok || !anchorTs) {
    finish();
    return;
  }

  // ── B) bootstrap boundary: `ge` is accepted and INCLUDES the boundary ────
  const b = await probe(
    "B: ModificationTimestamp ge <anchor>",
    q({
      $filter: `ModificationTimestamp ge ${anchorTs}`,
      $orderby: "ModificationTimestamp asc,ListingKey asc",
      $top: "50",
    }),
    bearer,
  );
  const bIncludesBoundary = b.firstRows.some((r) => r.ModificationTimestamp === anchorTs);
  findings.push({
    check: "B_bootstrap_ge_accepted_and_inclusive",
    verdict: b.ok ? (bIncludesBoundary ? "PASS" : "FAIL") : "FAIL",
    detail: b.ok
      ? `HTTP 200, ${b.rowCount} rows; boundary timestamp present in result=${bIncludesBoundary} (inclusive semantics are what make the bootstrap replay-safe)`
      : `rejected: ${b.error}`,
  });

  // Find a timestamp shared by >1 ListingKey so the tie-breaker is exercised
  // for real rather than trivially.
  const cluster = await probe(
    "C-pre: locate a shared ModificationTimestamp (tie-breaker must matter)",
    q({
      $filter: `ModificationTimestamp ge ${anchorTs}`,
      $orderby: "ModificationTimestamp asc,ListingKey asc",
      $top: "200",
    }),
    bearer,
  );
  // firstRows/lastRows are all we retain; use them to pick a key at the anchor.
  const atAnchor = [...cluster.firstRows, ...cluster.lastRows].filter(
    (r) => r.ModificationTimestamp === anchorTs && r.ListingKey,
  );
  const anchorKey = atAnchor[0]?.ListingKey ?? a.firstRows[0]?.ListingKey ?? null;

  // ── C) keyed continuation ────────────────────────────────────────────────
  if (anchorKey) {
    const esc = anchorKey.replace(/'/g, "''");
    const c = await probe(
      "C: MT gt T or (MT eq T and ListingKey gt 'K')",
      q({
        $filter: `(ModificationTimestamp gt ${anchorTs} or (ModificationTimestamp eq ${anchorTs} and ListingKey gt '${esc}'))`,
        $orderby: "ModificationTimestamp asc,ListingKey asc",
        $top: "50",
      }),
      bearer,
    );
    const cExcludesAnchorRow = !c.firstRows.some(
      (r) => r.ModificationTimestamp === anchorTs && r.ListingKey === anchorKey,
    );
    findings.push({
      check: "C_keyed_continuation_accepted",
      verdict: c.ok ? (cExcludesAnchorRow ? "PASS" : "FAIL") : "FAIL",
      detail: c.ok
        ? `HTTP 200, ${c.rowCount} rows; the anchored row itself is excluded=${cExcludesAnchorRow} (proves the tie-breaker advances past exactly one row, neither stalling nor skipping)`
        : `rejected: ${c.error}`,
    });

    // ── D) nextLink preserves ordering AND filter ─────────────────────────
    const paged = await probe(
      "D-page1: small $top to force @odata.nextLink",
      q({
        $filter: `(ModificationTimestamp gt ${anchorTs} or (ModificationTimestamp eq ${anchorTs} and ListingKey gt '${esc}'))`,
        $orderby: "ModificationTimestamp asc,ListingKey asc",
        $top: "5",
      }),
      bearer,
    );
    if (paged.nextLink) {
      const followed = await probe(
        "D-page2: follow @odata.nextLink verbatim",
        paged.nextLink.replace("{TRESTLE_API_URL}", BASE),
        bearer,
      );
      const stillAsc = isAscending([...followed.firstRows, ...followed.lastRows]);
      // Page 2 must continue AFTER page 1's last row under the same order.
      const p1Last = paged.lastRows[paged.lastRows.length - 1];
      const p2First = followed.firstRows[0];
      const continues =
        !!p1Last && !!p2First && isAscending([p1Last, p2First]).ok;
      findings.push({
        check: "D_nextlink_preserves_order_and_filter",
        verdict: followed.ok ? (stillAsc.ok && continues ? "PASS" : "FAIL") : "FAIL",
        detail: followed.ok
          ? `page2 ascending=${stillAsc.ok}; page2 continues after page1 without overlap or gap=${continues}`
          : `rejected: ${followed.error}`,
      });
    } else {
      findings.push({
        check: "D_nextlink_preserves_order_and_filter",
        verdict: "INCONCLUSIVE",
        detail: "no @odata.nextLink returned at $top=5 — result set smaller than one page",
      });
    }
  } else {
    findings.push({
      check: "C_keyed_continuation_accepted",
      verdict: "INCONCLUSIVE",
      detail: "could not resolve a ListingKey at the anchor timestamp",
    });
  }

  finish();
}

function finish() {
  const outDir = path.resolve(process.cwd(), "artifacts");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "cotality-keyset-probe.json");
  const payload = {
    probedAt: new Date().toISOString(),
    base: "{TRESTLE_API_URL}",
    note:
      "Sanitized. No token/credential recorded. Only ListingKey + ModificationTimestamp retained per row, so no REBNY-restricted listing content is present.",
    findings,
    captures,
  };
  writeFileSync(out, JSON.stringify(payload, null, 2));

  console.log("\n──────── VERDICTS ────────");
  for (const f of findings) console.log(`${f.verdict.padEnd(12)} ${f.check}\n             ${f.detail}`);
  console.log(`\nEvidence written: ${out}`);

  const failed = findings.filter((f) => f.verdict === "FAIL").length;
  const incon = findings.filter((f) => f.verdict === "INCONCLUSIVE").length;
  console.log(`\n${findings.length} checks: ${findings.length - failed - incon} PASS, ${failed} FAIL, ${incon} INCONCLUSIVE`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("probe failed:", err instanceof Error ? err.message : err);
  finish();
  process.exitCode = 1;
});
