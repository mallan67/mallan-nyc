/// <reference types="jest" />
/**
 * Phase D code-prep (board #415) — NO runtime (`app/api`) Prisma reader selects `agent_info: true`.
 *
 * After A6 backfill proved `typed_gap_rows = 0`, runtime readers resolve agent attribution
 * TYPED-FIRST from the 8 typed columns; the `agent_info` JSON is no longer fetched. So a later
 * `DROP COLUMN agent_info` cannot error a runtime select, and no attribution is lost (typed is
 * complete). The DTO types declare `agent_info` OPTIONAL and the consumers are absent-safe.
 *
 * Scope: this guard covers the RUNTIME `app/api` paths. Operator scripts (repair/set-exclusive/
 * audit/retired-backfill) still select agent_info and are a tracked follow-up (not runtime).
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { resolveListingAgentInfo } from "@/lib/listings/agent-info-resolver";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("Phase D code-prep — no runtime agent_info: true select", () => {
  it("no app/api route file selects `agent_info: true`", () => {
    const offenders = walk(join(process.cwd(), "app", "api"))
      .filter((f) => !f.endsWith(".test.ts"))
      .filter((f) => /agent_info:\s*true/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });

  it("DbListing + PortalListingInput declare agent_info as OPTIONAL (drop-safe)", () => {
    expect(readFileSync(join(process.cwd(), "lib", "idx", "db-to-public-dto.ts"), "utf8")).toMatch(
      /agent_info\?:\s*unknown/,
    );
    expect(readFileSync(join(process.cwd(), "lib", "compliance", "dto.ts"), "utf8")).toMatch(
      /agent_info\?:\s*unknown/,
    );
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
