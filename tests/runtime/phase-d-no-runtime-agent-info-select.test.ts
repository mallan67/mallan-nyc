/// <reference types="jest" />
/**
 * Phase D code-prep (board #415) — NO runtime (`app/api`) Prisma reader uses an EXPLICIT
 * `agent_info: true` select.
 *
 * SCOPE / WHAT THIS PROVES (Codex #426): this is a NECESSARY PREREQUISITE, not by itself
 * "drop-safe". Removing the explicit `agent_info: true` selects is required so that `agent_info`
 * can later be removed from `prisma/schema.prisma` WITHOUT a TypeScript error (`select: { agent_info: true }`
 * would not compile once the field is gone). After A6 proved `typed_gap_rows = 0`, these readers
 * resolve attribution TYPED-FIRST and lose nothing by dropping the JSON fallback.
 *
 * WHAT THIS DOES *NOT* PROVE — IMPLICIT reads: Prisma `findUnique`/`findMany` with NO `select`
 * (and `include: { listing }`) fetch EVERY scalar column from the GENERATED CLIENT, including
 * `agent_info`. So a raw `ALTER TABLE listings DROP COLUMN agent_info` run while the Prisma client
 * still knows the field would make those implicit reads error. There are dozens of such reads
 * (e.g. `app/api/crm/listings/[id]/route.ts` no-select findUnique). They are NOT individually
 * converted to explicit selects — instead, drop-safety for ALL reads (explicit + implicit) comes
 * from the standard Prisma column-drop ORDER:
 *   1. remove explicit `agent_info: true` selects   ← THIS PR
 *   2. remove the operator-script selects            ← tracked follow-up
 *   3. remove `agent_info` from prisma/schema.prisma + `prisma generate` + DEPLOY
 *      (now NO read — explicit or implicit — selects the column)
 *   4. THEN `ALTER TABLE listings DROP COLUMN agent_info` (DB)
 *   5. reclaim
 * This PR is step 1. It does NOT remove the schema field and does NOT drop the column.
 *
 * The DTO types declare `agent_info` OPTIONAL and consumers are absent-safe, so once step 3 makes
 * the generated rows omit it, resolution falls through to the typed columns with no code change.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { resolveListingAgentInfo } from "@/lib/listings/agent-info-resolver";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("Phase D code-prep step 1 — no EXPLICIT runtime agent_info: true select", () => {
  it("no app/api route file selects `agent_info: true` (prerequisite for schema-field removal)", () => {
    const offenders = walk(join(process.cwd(), "app", "api"))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => /agent_info:\s*true/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });

  it("DbListing + PortalListingInput declare agent_info as OPTIONAL", () => {
    expect(readFileSync(join(process.cwd(), "lib", "idx", "db-to-public-dto.ts"), "utf8")).toMatch(
      /agent_info\?:\s*unknown/,
    );
    expect(readFileSync(join(process.cwd(), "lib", "compliance", "dto.ts"), "utf8")).toMatch(
      /agent_info\?:\s*unknown/,
    );
  });
});

describe("Phase D step 3/4 — agent_info removed from the Prisma schema/client; step 4 DROP migration present", () => {
  it("prisma/schema.prisma NO LONGER declares the agent_info model field", () => {
    // Step 3 removes agent_info from the Prisma schema/client so Prisma stops selecting it on
    // EVERY read -- including implicit no-`select` findUnique/findMany and `include: { listing }`.
    // This makes the RUNTIME drop-safe BEFORE any DB ALTER. The physical DB column still exists
    // (intentional, temporary schema<->DB drift) and is dropped only in a later, gated step.
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).not.toMatch(/^\s*agent_info\s+Json/m);
  });

  it("the Phase D step 4 DROP migration exists and contains ONLY the intended agent_info DROP", () => {
    // Step 4 (board #415, Maya-approved 2026-06-23): the DB column is dropped via a Prisma
    // migration. This guard FLIPPED from "no DROP migration exists" (step 3) to "exactly one
    // DROP migration exists and its only executable statement is the agent_info DROP" — so a
    // stray/extra DDL in the same migration would fail this test.
    const migDir = join(process.cwd(), "prisma", "migrations");
    const dropFiles = walk(migDir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /DROP COLUMN\s+"?agent_info"?/i.test(readFileSync(f, "utf8")));
    expect(dropFiles.length).toBe(1);
    const sql = readFileSync(dropFiles[0], "utf8");
    const statements = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .join(" ")
      .trim();
    expect(statements).toBe('ALTER TABLE "listings" DROP COLUMN "agent_info";');
  });
});

describe("resolver is absent-safe — agent_info dropped resolves typed-only", () => {
  it("resolves the typed columns with NO agent_info present", () => {
    const r = resolveListingAgentInfo({
      list_agent_full_name: "Jane Agent",
      list_office_name: "Mallan Real Estate Inc.",
      list_agent_email: "jane@mallan.nyc",
      co_list_office_mls_id: "8609",
      co_list_agent_mls_id: "97301",
      // agent_info intentionally ABSENT (simulates the dropped column)
    });
    expect(r.fullName).toBe("Jane Agent");
    expect(r.officeName).toBe("Mallan Real Estate Inc.");
    expect(r.agentEmail).toBe("jane@mallan.nyc");
    expect(r.coListOfficeMlsId).toBe("8609");
    expect(r.coListAgentMlsId).toBe("97301");
  });

  it("returns all-null for an empty listing (never throws)", () => {
    const r = resolveListingAgentInfo({});
    expect(r.fullName).toBeNull();
    expect(r.officeName).toBeNull();
  });
});
