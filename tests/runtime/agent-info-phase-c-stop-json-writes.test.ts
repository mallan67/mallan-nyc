/// <reference types="jest" />
/**
 * Phase C (agent_info normalization) — producers STOP persisting the legacy `agent_info`
 * JSON column while still writing the 8 typed agent columns. Design = Option B: the trestle
 * mapper is UNCHANGED (still emits `agent_info` in-memory so typed columns can be derived);
 * each persistence site strips `agent_info` from the Prisma write payload.
 *
 * This suite proves:
 *   1. the mapper still emits agent_info + the 8 typed columns (in-memory derivation source intact);
 *   2. the CREATE-path strip (`const { agent_info, ...typedOnlyMapped } = mapped`) removes agent_info
 *      while keeping all 8 typed columns;
 *   3. the UPDATE-path derivation (`typedAgentColumnsFromJson(mapped.agent_info)`) still yields all 8;
 *   4. STATIC GUARD: no runtime producer / kept ops script contains an `agent_info` JSON WRITE.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";

const TYPED_KEYS = [
  "list_agent_full_name", "list_office_name", "list_agent_email", "list_agent_direct_phone",
  "list_office_mls_id", "list_agent_mls_id", "co_list_office_mls_id", "co_list_agent_mls_id",
] as const;

function mapped() {
  return mapTrestleToPrisma({
    ListingId: "RLS-C-1", ListingKey: "RLS-C-1", StandardStatus: "Active",
    ListAgentFullName: "Jane Doe", ListOfficeName: "Acme Realty",
    ListAgentEmail: "jane@acme.com", ListAgentDirectPhone: "212-555-0100",
    ListOfficeMlsId: "OFF1", ListAgentMlsId: "AG1",
    CoListOfficeMlsId: "OFF2", CoListAgentMlsId: "AG2",
  } as unknown as Record<string, unknown>) as Record<string, unknown>;
}

describe("Phase C — derivation source intact (Option B keeps mapper unchanged)", () => {
  it("mapper still emits agent_info (in-memory) AND all 8 typed columns", () => {
    const out = mapped();
    expect(out.agent_info).toBeDefined();
    for (const k of TYPED_KEYS) expect(out[k]).toBeDefined();
    expect(out.list_office_name).toBe("Acme Realty");
    expect(out.list_agent_email).toBe("jane@acme.com");
  });

  it("CREATE-path strip removes agent_info but keeps all 8 typed columns", () => {
    const { agent_info, ...typedOnlyMapped } = mapped();
    expect(agent_info).toBeDefined();                       // it existed
    expect(typedOnlyMapped).not.toHaveProperty("agent_info"); // ...and is gone from the write payload
    for (const k of TYPED_KEYS) {
      expect(typedOnlyMapped).toHaveProperty(k);
    }
    expect((typedOnlyMapped as Record<string, unknown>).list_office_name).toBe("Acme Realty");
  });

  it("UPDATE-path derivation still yields all 8 typed columns from in-memory agent_info", () => {
    const out = mapped();
    const typed = typedAgentColumnsFromJson(out.agent_info as Record<string, unknown>);
    for (const k of TYPED_KEYS) expect(typed).toHaveProperty(k);
    expect(typed.list_agent_email).toBe("jane@acme.com");
    expect(typed.co_list_agent_mls_id).toBe("AG2");
  });
});

describe("Phase C — STATIC GUARD: no producer persists agent_info JSON", () => {
  // Files whose Prisma WRITE payloads must never set agent_info. Excludes (by design):
  //  - lib/idx/trestle-mapper.ts (Option B: emits agent_info in-memory, never a DB write here)
  //  - readers / resolver / dto.ts / data-loader (read + JSON fallback — Phase B)
  //  - lib/listings/agent-info-typed-columns.ts (derivation seam)
  //  - scripts/backfill-agent-info-typed-columns.ts (A6 backfill — typed-only raw SQL)
  //  - scripts/backfill-crm-exclusive-cotality-identity.mjs (RETIRED, fails fast)
  //  - tests/** fixtures
  const PRODUCER_FILES = [
    "lib/idx/sync.ts",
    "app/api/idx/ensure-listing/route.ts",
    "app/api/crm/listings/route.ts",
    "app/api/crm/listings/[id]/route.ts",
    "app/api/crm/listings/reset-sync/route.ts",
    "app/api/cron/feed-reconcile/route.ts",
    "scripts/ops/set-exclusive-listing-agent.mjs",
    "scripts/ops/repair-exclusive-agent-assignment.mjs",
  ];

  // A WRITE is `agent_info:` at the start of a payload line with a non-`true` value
  // (`agent_info: true` is a SELECT read, allowed), or a `.agent_info =` property assignment.
  const WRITE_KEY = /^\s*agent_info\s*:\s*(?!true\b)[A-Za-z_({[]/m;
  const PROP_ASSIGN = /\.agent_info\s*=\s*[^=]/;

  it.each(PRODUCER_FILES)("%s persists no agent_info JSON", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(WRITE_KEY);
    expect(src).not.toMatch(PROP_ASSIGN);
  });

  it("the static guard itself is sensitive (catches a synthetic write)", () => {
    expect("  agent_info: mapped.agent_info as Prisma.InputJsonValue,").toMatch(WRITE_KEY);
    expect("    update.agent_info = something;").toMatch(PROP_ASSIGN);
    // and does NOT flag a select read or a property read:
    expect("        agent_info: true,").not.toMatch(WRITE_KEY);
    expect("  const x = listing.agent_info as Record<string, unknown>;").not.toMatch(WRITE_KEY);
    expect("  const x = listing.agent_info as Record<string, unknown>;").not.toMatch(PROP_ASSIGN);
  });
});
