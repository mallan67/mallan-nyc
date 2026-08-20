import * as fs from "node:fs";
import * as path from "node:path";

import {
  _ALERT_KEYS_FOR_TEST,
  _SEARCH_KEYS_FOR_TEST,
  getUnsupportedAlertCriteria,
  getUnsupportedSearchCriteria,
} from "@/lib/search/criteria-to-prisma";
import {
  canEnableAlertForCriteria,
  getUnsupportedProjectionCriteria,
} from "@/lib/search/criteria-to-prisma";

// ──────────────────────────────────────────────────────────────────────
// Codex Risk P0 fix #3 — alert-gate key parity (frontend ↔ backend)
//
// The alert gate is enforced server-side at /api/crm/saved-searches
// POST/PATCH and the search-alerts cron, all reading
// `ALERT_SUPPORTED_CRITERIA_KEYS` in lib/search/criteria-to-prisma.ts.
// The frontend (`public/crm/js/search/saved-searches.js`) keeps an
// independent JS mirror in `_ALERT_SUPPORTED_KEYS` so the modal can
// gray the alert dropdown before the user submits.
//
// Two static lists drift over time. This test loads both at runtime,
// extracts the key sets, and asserts they are equal. If the test
// fails: someone added/removed a key on one side and forgot the other.
// Re-sync the smaller list with the larger; do not silence by editing
// this test.
// ──────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../../");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

/** Pull the literal Set members from ALERT_SUPPORTED_CRITERIA_KEYS. */
function backendSupportedKeys(): Set<string> {
  const src = readFile("lib/search/criteria-to-prisma.ts");
  const match = src.match(
    /ALERT_SUPPORTED_CRITERIA_KEYS\s*=\s*new\s+Set\(\[\s*([\s\S]*?)\]\)/,
  );
  if (!match) {
    throw new Error("Could not locate ALERT_SUPPORTED_CRITERIA_KEYS in criteria-to-prisma.ts");
  }
  const body = match[1];
  // Extract every double-quoted token. The body is a JS array literal
  // of strings; we don't try to parse it as JSON because trailing
  // commas / comments are common.
  const tokens = body.match(/"([^"]+)"/g);
  if (!tokens) return new Set();
  return new Set(tokens.map((t) => t.slice(1, -1)));
}

/** Pull the keys from frontend `_ALERT_SUPPORTED_KEYS` object literal. */
function frontendSupportedKeys(): Set<string> {
  const src = readFile("public/crm/js/search/saved-searches.js");
  const match = src.match(
    /var\s+_ALERT_SUPPORTED_KEYS\s*=\s*\{\s*([\s\S]*?)\}\s*;/,
  );
  if (!match) {
    throw new Error("Could not locate _ALERT_SUPPORTED_KEYS in saved-searches.js");
  }
  const body = match[1];
  // Each key is `name: 1,`. Capture the bare identifier before the colon.
  const tokens = body.match(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g);
  if (!tokens) return new Set();
  return new Set(tokens.map((t) => t.replace(/\s*:\s*$/, "")));
}

describe("Codex Risk P0 fix #3 — alert-gate key parity", () => {
  it("frontend _ALERT_SUPPORTED_KEYS matches backend ALERT_SUPPORTED_CRITERIA_KEYS plus the reserved key", () => {
    const backend = backendSupportedKeys();
    const frontend = frontendSupportedKeys();

    // Frontend treats `_search_tab` as supported (reserved on the
    // backend per PROJECTION_RESERVED_CRITERIA_KEYS, so the same end
    // user experience). Build the canonical set the frontend should
    // mirror.
    const expectedFrontend = new Set(backend);
    expectedFrontend.add("_search_tab");

    const frontendOnly = [...frontend].filter((k) => !expectedFrontend.has(k)).sort();
    const backendOnly = [...expectedFrontend].filter((k) => !frontend.has(k)).sort();

    expect({ frontendOnly, backendOnly }).toEqual({ frontendOnly: [], backendOnly: [] });
  });

  it("every frontend-supported key, when sent solo, is accepted by canEnableAlertForCriteria", () => {
    // Defense-in-depth: even if the static lists drift, the runtime
    // gate function should still accept any key the frontend would
    // unblock the alert dropdown for. Loop the frontend list and
    // assert each is OK in isolation. Per-key value shapes mirror
    // isSupportedProjectionCriterionValue() in criteria-to-prisma.ts.
    const stringKeys = new Set([
      "_search_tab",
      "listing_type", "listingType", "type", "searchTab",
      "borough", "neighborhood",
    ]);
    const stringOrArrayKeys = new Set([
      "statuses", "status", "standardStatus", "standard_status",
      "property_type", "property_types", "propertyType", "propertyTypes",
      "neighborhoods",
    ]);
    const frontend = frontendSupportedKeys();
    for (const key of frontend) {
      let value: unknown;
      if (stringKeys.has(key)) value = "sale";
      else if (stringOrArrayKeys.has(key)) value = ["Active"];
      else value = 1; // numeric range keys: price/beds/baths/sqft + min/max variants
      const decision = canEnableAlertForCriteria({ [key]: value });
      expect({ key, ok: decision.ok, unsupported: decision.unsupported }).toEqual({
        key,
        ok: true,
        unsupported: [],
      });
    }
  });

  it("an unrecognized criterion is unanimously rejected by both layers' policies", () => {
    // Simple smoke test: a clearly-unsupported key (`address`) is
    // unsupported per the runtime gate AND would fail the frontend
    // gate (because `address` is not in _ALERT_SUPPORTED_KEYS).
    const frontend = frontendSupportedKeys();
    expect(frontend.has("address")).toBe(false);
    expect(getUnsupportedProjectionCriteria({ address: "x" })).toContain("address");
  });
});

/**
 * SEARCH CAPABILITY vs ALERT ELIGIBILITY — the invariant is CONTAINMENT.
 *
 * These were one set, and `saved-searches/[id]/execute` gated SEARCH EXECUTION
 * on it. So a criterion the engine could genuinely execute became unrunnable
 * merely because the alert key list — which must stay byte-parity with a
 * frontend file under a standing authorization hold — had not been widened.
 *
 * Correct relationship:
 *     ALERT_SUPPORTED_KEYS  ⊆  SEARCH_ENGINE_SUPPORTED_KEYS
 * never equality. Alerts are an authorized SUBSET of what Search can do.
 */
describe("alert eligibility is a strict subset of search capability", () => {
  it("every alert-supported key is executable by the search engine", () => {
    for (const key of _ALERT_KEYS_FOR_TEST) {
      expect(_SEARCH_KEYS_FOR_TEST.has(key)).toBe(true);
    }
  });

  it("the search engine reaches criteria alerts cannot replay", () => {
    // If these ever became equal, the containment would have collapsed back
    // into the coupling this guards against.
    const extra = [..._SEARCH_KEYS_FOR_TEST].filter((k) => !_ALERT_KEYS_FOR_TEST.has(k));
    expect(extra.length).toBeGreaterThan(0);
    expect(extra).toEqual(expect.arrayContaining(["amenities", "keywords", "ownershipTypes", "yearBuilt"]));
  });

  it("SEARCH capability admits the newly verified criteria", () => {
    // The regression: these returned "unsupported" and blocked execution.
    for (const criteria of [
      { amenities: ["elevator"] },
      { keywords: ["penthouse"] },
      { ownershipTypes: ["Condo"] },
      { yearBuilt: "pre-war" },
      { furnished: true },
      { pets: true },
    ]) {
      expect(getUnsupportedSearchCriteria(criteria)).toEqual([]);
    }
  });

  it("ALERT eligibility stays conservative for those same criteria", () => {
    // Unchanged until the held CRM key list is widened with approval.
    expect(getUnsupportedAlertCriteria({ amenities: ["elevator"] })).toEqual(["amenities"]);
  });
});
