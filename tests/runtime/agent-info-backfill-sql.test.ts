/// <reference types="jest" />
/**
 * A6 backfill SQL safety (Codex #416 P2 x2):
 *   1. FILL-ONLY / RACE-SAFE: every column is written as COALESCE(col, derived), so a non-null
 *      value (incl. one set by a concurrent idx-sync/CRM write) is never overwritten.
 *   2. PRESERVES updated_at: the UPDATE never references updated_at, so Prisma @updatedAt is not
 *      triggered and public/CRM lists (sorted by updated_at desc) do not reorder.
 *   + PARITY with the producer seam: PascalCase + lowercase fallback; trim+empty→null.
 */
import { buildUpdateSql, buildDryRunSql, BACKFILL_COLUMNS } from "../../scripts/backfill-agent-info-typed-columns";

const ALL_8 = [
  "list_agent_full_name", "list_office_name", "list_agent_email", "list_agent_direct_phone",
  "list_office_mls_id", "list_agent_mls_id", "co_list_office_mls_id", "co_list_agent_mls_id",
];

describe("A6 backfill UPDATE SQL — fill-only + updated_at-preserving", () => {
  const sql = buildUpdateSql();

  it("covers all 8 typed columns", () => {
    expect(BACKFILL_COLUMNS.map((c) => c.col).sort()).toEqual([...ALL_8].sort());
  });

  it("writes EVERY column as COALESCE(col, derived) — never overwrites a non-null value (race-safe)", () => {
    for (const col of ALL_8) {
      expect(sql).toContain(`${col} = COALESCE(${col},`);
    }
  });

  it("NEVER references updated_at (preserves @updatedAt ordering)", () => {
    expect(sql.toLowerCase()).not.toContain("updated_at");
    expect(buildDryRunSql().toLowerCase()).not.toContain("updated_at");
  });

  it("only touches rows that still need a fill (WHERE col IS NULL AND derived IS NOT NULL)", () => {
    expect(sql).toMatch(/WHERE id > \$1 AND id <= \$2 AND \(/);
    // contact fields gate on their own NULL + a derivable value
    expect(sql).toContain("list_agent_email IS NULL AND NULLIF(btrim(COALESCE(agent_info->>'ListAgentEmail', agent_info->>'email')), '') IS NOT NULL");
  });

  it("parity with the seam: PascalCase ?? lowercase fallback for name/office/email/phone", () => {
    expect(sql).toContain("COALESCE(agent_info->>'ListAgentFullName', agent_info->>'name')");
    expect(sql).toContain("COALESCE(agent_info->>'ListOfficeName', agent_info->>'company')");
    expect(sql).toContain("COALESCE(agent_info->>'ListAgentEmail', agent_info->>'email')");
    expect(sql).toContain("COALESCE(agent_info->>'ListAgentDirectPhone', agent_info->>'phone')");
  });

  it("parity: MLS-ID columns derive from their single PascalCase key (no lowercase shape)", () => {
    expect(sql).toContain("NULLIF(btrim(agent_info->>'ListOfficeMlsId'), '')");
    expect(sql).toContain("NULLIF(btrim(agent_info->>'CoListAgentMlsId'), '')");
  });

  it("cleanStr parity: trim + empty-string→null via NULLIF(btrim(...),'')", () => {
    for (const c of BACKFILL_COLUMNS) {
      expect(c.derive.startsWith("NULLIF(btrim(")).toBe(true);
      expect(c.derive.endsWith(", '')")).toBe(true);
    }
  });
});
