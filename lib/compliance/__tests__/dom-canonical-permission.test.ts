/**
 * DOM canonical-permission contract (UCBA 2026 Art. I §11).
 *
 * ROOT CAUSE THIS FILE LOCKS DOWN
 * -------------------------------
 * The DOM subsystem used to consume a RAW Cotality permission string
 * (`permissions?: string | null`) and re-interpret provider vocabulary itself
 * via `DOM_SUPPRESSING_PERMISSIONS.has(...)`. That produced two symptoms of one
 * defect:
 *
 *   D1  `Set.has()` is an EXACT string match, but Cotality `Permission` is
 *       `Collection(Multi.ListingPermission)` serialized comma-joined. Live
 *       values include `IDX,OfficeInactive` and `IDX,SyndicateOptOut`, so
 *       `has("IDX,Private")` is false and suppression silently failed.
 *
 *   D3  The read path fed it from `listing.compliance.Permissions` — a key
 *       measured on 0 of 26,497 production rows (read-only census 2026-09-07;
 *       the only keys present anywhere in that JSON are rls_eligibility,
 *       validated_at, warnings, validation_result, valid, stripped_fields, on
 *       7 rows). So suppression received null on 100% of rows.
 *
 * THE FIX IS ONE CANONICALIZATION, NOT TWO PATCHES.
 * Cotality wire vocabulary is parsed EXACTLY ONCE, at the provider boundary:
 *
 *     Permission
 *       -> enumValueTokens('Permission', raw.Permission)   [live-contract.ts]
 *       -> permissionTokens.includes('Private')            [trestle-mapper.ts]
 *       -> listings.participant_only : boolean             [canonical Mallan fact]
 *
 * DOM consumes the typed Mallan fact. It must never see provider vocabulary.
 */

import fs from "node:fs";
import path from "node:path";
import { computeDomTransition, getCurrentDom } from "../dom-tracker";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(d.getHours() - 1);
  return d;
}

describe("DOM consumes the canonical participant_only fact", () => {
  // A — Active + participant_only => no accrual
  it("A: does not accrue while Active and participant_only", () => {
    expect(
      getCurrentDom({
        status: "Active",
        participant_only: true,
        status_changed_at: daysAgo(20),
        first_active_date: daysAgo(20),
        days_on_market: 5,
      })
    ).toBe(5); // frozen at the stored snapshot, 20 elapsed days NOT added
  });

  // B — Active + not participant_only => accrues normally
  it("B: accrues while Active and not participant_only", () => {
    expect(
      getCurrentDom({
        status: "Active",
        participant_only: false,
        status_changed_at: daysAgo(20),
        first_active_date: daysAgo(20),
        days_on_market: 5,
      })
    ).toBe(25); // 5 stored + 20 elapsed
  });

  // C — ComingSoon never accrues, regardless of participant_only
  it.each([true, false])(
    "C: ComingSoon never accrues (participant_only=%s)",
    (participantOnly) => {
      expect(
        getCurrentDom({
          status: "ComingSoon",
          participant_only: participantOnly,
          status_changed_at: daysAgo(13),
          first_active_date: null,
          days_on_market: 0,
        })
      ).toBe(0);
    }
  );

  // D — the read-path regression: suppression must hold even though the
  // compliance JSON carries no permission key at all (production reality).
  it("D: suppresses on participant_only even when compliance JSON is empty", () => {
    const complianceFromDb: Record<string, unknown> = {}; // 26,490 of 26,497 rows
    expect((complianceFromDb as Record<string, unknown>).Permissions).toBeUndefined();

    expect(
      getCurrentDom({
        status: "Active",
        participant_only: true, // typed canonical fact — the ONLY source
        status_changed_at: daysAgo(40),
        first_active_date: daysAgo(40),
        days_on_market: 0,
      })
    ).toBe(0);
  });

  it("D: transition input also uses the canonical fact, not a provider string", () => {
    // Active + participant_only, staying Active -> still no accrual.
    expect(
      computeDomTransition(
        {
          status: "Active",
          participant_only: true,
          status_changed_at: daysAgo(20),
          first_active_date: daysAgo(20),
          days_on_market: 0,
        },
        "Active"
      ).days_on_market
    ).toBe(0);
  });
});

// E — architectural guard: no second provider tokenizer may exist in the DOM layer.
//
// The guard inspects CODE, not prose. Naming the provider tokens in a comment
// that explains why they are banned is legitimate and must stay possible;
// branching on them is the defect. So comments are stripped before matching —
// otherwise the guard would forbid its own rationale.
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/^[ \t]*\/\/.*$/gm, " ") // whole-line // comments
    .replace(/[ \t]+\/\/.*$/gm, " "); // trailing // comments
}

describe("DOM layer contains no Cotality permission vocabulary", () => {
  const domTrackerSource = codeOnly(
    fs.readFileSync(path.join(__dirname, "..", "dom-tracker.ts"), "utf-8")
  );

  // Provider-vocabulary tokens that must be interpreted at the mapper boundary
  // ONLY. `Private` is a live ListingPermission member; "Participant Only
  // Network" was never one (the live 18-member enum is AgentOnly, ComingSoon,
  // CompSold, DownPaymentResourceNo, DownPaymentResourceYes, FirmOnly, History,
  // IDX, MemberInactive, OfficeInactive, OfficeOnly, OfficeSuspended,
  // Officeidxoptout, PhotoOptedOut, Private, Public, SyndicateOptOut, VOW).
  it.each(["Private", "Participant Only Network", "IDX", "OfficeInactive"])(
    "E: dom-tracker.ts does not hard-code the provider token %s",
    (token) => {
      expect(domTrackerSource.includes(`"${token}"`)).toBe(false);
      expect(domTrackerSource.includes(`'${token}'`)).toBe(false);
    }
  );

  it("E: dom-tracker.ts does not re-tokenize a comma-joined provider value", () => {
    expect(domTrackerSource).not.toContain("enumValueTokens");
    expect(domTrackerSource).not.toContain('.split(",")');
    expect(domTrackerSource).not.toContain("DOM_SUPPRESSING_PERMISSIONS");
  });

  it("E: the CRM sales read path no longer reconstructs permissions from JSON", () => {
    const routeSource = codeOnly(
      fs.readFileSync(
        path.join(
          __dirname,
          "..",
          "..",
          "..",
          "app",
          "api",
          "crm",
          "sales",
          "listings",
          "route.ts"
        ),
        "utf-8"
      )
    );
    expect(routeSource).not.toContain("compliance.Permissions");
    expect(routeSource).not.toContain(".Permissions as string");
    expect(routeSource).toContain("participant_only");
  });

  it("E: no DOM caller reconstructs a raw provider Permission string", () => {
    // `readTrestlePermissions` existed in TWO places (lib/idx/sync.ts and
    // scripts/recover-stale-property-listings.ts) and fed raw provider values
    // straight into computeDomTransition. Both are removed.
    const callers = [
      ["..", "..", "idx", "sync.ts"],
      ["..", "..", "..", "scripts", "recover-stale-property-listings.ts"],
    ];
    for (const rel of callers) {
      const src = codeOnly(
        fs.readFileSync(path.join(__dirname, ...rel), "utf-8")
      );
      expect(src).not.toContain("readTrestlePermissions");
      expect(src).not.toContain("raw.Permission");
    }
  });
});
