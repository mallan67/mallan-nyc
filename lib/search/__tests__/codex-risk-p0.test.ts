import * as fs from "node:fs";
import * as path from "node:path";

import { hashIp } from "@/lib/inquiries/create";

// ──────────────────────────────────────────────────────────────────────
// Codex Risk P0 — static + pure-function guards.
//
// Route-level tests live in tests/runtime/codex-risk-p0.test.ts.
// This file covers what can be proven without spinning up the route:
//   1. pagination.js no longer renders an unaudited mailto: link to
//      the listing-agent address (Fix #1)
//   2. search-engine.js does not forward openHouseDateFrom/To (or
//      transit/grid bounds) to the API params (Fix #4)
//   3. hashIp produces a non-reversible 64-char hex digest, distinct
//      from base64-of-raw-IP (Fix #6)
//   4. contact / inquiries / cma route source no longer logs a raw
//      Error object on the email/notification catch paths (Fix #7)
// ──────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../../");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

describe("Codex Risk P0 — static frontend source guards", () => {
  describe("Fix #1 — listing-agent mailto bypass removed", () => {
    const src = readFile("public/crm/js/search/pagination.js");

    it("listing-agent contact card no longer contains a mailto: link to listing.agentEmail", () => {
      // The original bypass at pagination.js:972 was:
      //   <a href="mailto:'+escapeHtml(listing.agentEmail)+'?subject=...'
      // After the fix, the contact card uses sendAgentInquiry(...)
      // which routes through /api/crm/agent-inquiry with audit trail.
      //
      // Source-grep for any remaining mailto: in the listing-agent card
      // section. (The file does still contain a mailto: at the
      // emailListingDetail() function further down for "share to anyone"
      // — that's out of scope per Codex's specific listing-agent
      // contact-action call-out. We assert no mailto: occurs adjacent
      // to listing.agentEmail.)
      const mailtoNearAgentEmail = /mailto:['"`+ ]*\+?\s*[a-zA-Z]*\(?[a-zA-Z]*\.?listing\.agentEmail/;
      expect(src).not.toMatch(mailtoNearAgentEmail);
    });

    it("listing-agent contact card uses the audited sendAgentInquiry path", () => {
      // The fix replaces the mailto: anchor with a delegated button.
      expect(src).toMatch(/data-agent-inquiry-listing-id/);
      expect(src).not.toMatch(/onclick=["']sendAgentInquiry\(/);
      // sendAgentInquiry exists in the file
      expect(src).toMatch(/function\s+sendAgentInquiry\s*\(/);
      // sendAgentInquiry POSTs to the audited route
      expect(src).toMatch(/fetch\(['"`]\/api\/crm\/agent-inquiry/);
    });
  });

  describe("Fix #4 — unsupported criteria not silently submitted", () => {
    const src = readFile("public/crm/js/search/search-engine.js");

    it("buildIdxSearchParams does not forward openHouseDateFrom/To", () => {
      // Old behavior: `params.openHouseDateFrom = criteria.openHouseDateFrom;`
      // New behavior: the assignment is removed; if criteria contains
      // these keys we emit a console.warn instead of submitting them.
      expect(src).not.toMatch(/params\.openHouseDateFrom\s*=\s*criteria\.openHouseDateFrom/);
      expect(src).not.toMatch(/params\.openHouseDateTo\s*=\s*criteria\.openHouseDateTo/);
    });

    it("the serializer REFUSES openHouseDate criteria by name — never strips-and-warns, never widens", () => {
      // Search Consolidation Packet 1: a criterion the executor does not execute is
      // refused by name before any request (serializeSearchCriteria → refused[]),
      // mirroring the route's 400 UNSUPPORTED_CRITERION. The old strip-and-warn
      // path (a silent widening with a console signal) is gone.
      expect(src).toMatch(/\['openHouseDateFrom',\s*'Open House date'\]/);
      expect(src).toMatch(/\['openHouseDateTo',\s*'Open House date'\]/);
      expect(src).not.toMatch(/Stripped unsupported openHouseDate/i);
      expect(src).toMatch(/window\.serializeSearchCriteria\s*=\s*function/);
    });

    it("buildIdxSearchParams does not forward _transitBounds or _gridBounds (no Lat/Lng on REBNY feed)", () => {
      // The two old TransitSearch / ManhattanGrid blocks built a
      // gridFilter param from null Lat/Lng fields. They are now
      // commented out / replaced with a strip-and-warn block.
      // We assert the gridFilter assignment from these sources is gone.
      expect(src).not.toMatch(/params\.gridFilter\s*=\s*transitParts\.join/);
      expect(src).not.toMatch(/params\.gridFilter\s*=\s*gridParts\.join/);
    });
  });

  describe("Fix #7 — error logs do not pass raw Error objects on email catch paths", () => {
    const contactSrc = readFile("app/api/contact/route.ts");
    const inquiriesSrc = readFile("app/api/inquiries/route.ts");
    const cmaSrc = readFile("app/api/cma/route.ts");

    function findRawErrorLogs(src: string, route: string): string[] {
      // Look for `console.error(..., emailErr)` / `..., autoErr)` / `..., err)`
      // / `..., error)` patterns where the trailing comma indicates a
      // second argument that is the raw error object.
      //
      // Skip comment lines — the routes intentionally cite the OLD
      // log shape inside the explanation comments (so reviewers can
      // see what changed) and those mentions must not trip the test.
      const offenders: string[] = [];
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        // Skip comments
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (!trimmed.includes("console.error")) return;
        // Match `console.error('<msg>', err)` style — second arg is the
        // raw error binding, which can carry stack/secrets.
        if (/console\.error\([^,]+,\s*(emailErr|autoErr|err|error)\)/.test(line)) {
          offenders.push(`${route}:${i + 1}: ${trimmed}`);
        }
      });
      return offenders;
    }

    it("app/api/contact/route.ts has no console.error(<msg>, errObj) on email/exception paths", () => {
      expect(findRawErrorLogs(contactSrc, "app/api/contact/route.ts")).toEqual([]);
    });

    it("app/api/inquiries/route.ts has no console.error(<msg>, errObj) on email/exception paths", () => {
      expect(findRawErrorLogs(inquiriesSrc, "app/api/inquiries/route.ts")).toEqual([]);
    });

    it("app/api/cma/route.ts has no console.error(<msg>, errObj) on email/exception paths", () => {
      expect(findRawErrorLogs(cmaSrc, "app/api/cma/route.ts")).toEqual([]);
    });

    it("error logs use a category= prefix so categories are observable", () => {
      // Each redacted log emits `category=<name>` so ops dashboards
      // can group failures without pulling the raw error object.
      expect(contactSrc).toMatch(/category=\$\{[a-zA-Z_]+\}/);
      expect(inquiriesSrc).toMatch(/category=\$\{[a-zA-Z_]+\}/);
      expect(cmaSrc).toMatch(/category=\$\{[a-zA-Z_]+\}/);
    });
  });
});

describe("Codex Risk P0 — hashIp is non-reversible (fix #6)", () => {
  it("returns null for null/undefined/empty", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("")).toBeNull();
  });

  it("returns a 64-character lowercase hex digest", () => {
    const hash = hashIp("203.0.113.42");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same input under the same salt", () => {
    const a = hashIp("203.0.113.42");
    const b = hashIp("203.0.113.42");
    expect(a).toBe(b);
  });

  it("produces different hashes for different IPs (no collision in practice)", () => {
    expect(hashIp("203.0.113.42")).not.toBe(hashIp("203.0.113.43"));
    expect(hashIp("10.0.0.1")).not.toBe(hashIp("192.168.0.1"));
  });

  it("output does NOT match base64-of-raw-IP (the prior weak format)", () => {
    const ip = "203.0.113.42";
    const base64Slice = Buffer.from(ip).toString("base64").slice(0, 16);
    const hash = hashIp(ip);
    expect(hash).not.toBe(base64Slice);
    // 64-hex digest cannot be base64-decoded back to the raw IP
    expect(hash).not.toContain("203");
    expect(hash).not.toContain("113");
  });

  it("does not include any portion of the raw IP in the digest", () => {
    const ip = "8.8.8.8";
    const hash = hashIp(ip);
    expect(hash).not.toContain("8.8.8.8");
    // Single-digit octets could theoretically appear as substrings of a
    // hex digest by coincidence; that's acceptable for IPv4 since it's
    // not reversible. We just guard against the literal IP string.
  });
});
