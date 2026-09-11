/**
 * Phase A2 (agent_info normalization, spec #410 / plan #411): the Trestle mapper
 * must DUAL-WRITE the 8 typed agent columns alongside the unchanged `agent_info`
 * JSON, so the typed columns added in A1 populate on every new/updated row.
 *
 * Invariant: each typed column mirrors the corresponding `agent_info` JSON value
 * (same source, two destinations). agent_info JSON is unchanged (still emitted).
 * No reader/writer changes here — this only adds the typed fields to the mapper
 * output (persistence to DB by sync writers is Phase A3, separate + gated).
 */
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";

const asStr = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function mapRow() {
  return mapTrestleToPrisma({
    ListingId: "RLS-A2-1",
    ListingKey: "RLS-A2-1",
    StandardStatus: "Active",
    PropertyType: "Residential",
    ListPrice: 1000000,
    ModificationTimestamp: "2026-09-01T00:00:00Z",
    ListAgentFullName: "Jane Doe",
    ListOfficeName: "Acme Realty",
    ListAgentEmail: "jane@acme.com",
    ListAgentDirectPhone: "212-555-0100",
    ListOfficeMlsId: "OFF1",
    ListAgentMlsId: "AG1",
    CoListOfficeMlsId: "OFF2",
    CoListAgentMlsId: "AG2",
  } as unknown as Record<string, unknown>);
}

describe("Phase A2 — Trestle mapper dual-writes typed agent columns", () => {
  it("emits all 8 typed columns", () => {
    const out = mapRow() as Record<string, unknown>;
    expect(out.list_agent_full_name).toBe("Jane Doe");
    expect(out.list_office_name).toBe("Acme Realty");
    expect(out.list_agent_email).toBe("jane@acme.com");
    expect(out.list_agent_direct_phone).toBe("212-555-0100");
    expect(out.list_office_mls_id).toBe("OFF1");
    expect(out.list_agent_mls_id).toBe("AG1");
    expect(out.co_list_office_mls_id).toBe("OFF2");
    expect(out.co_list_agent_mls_id).toBe("AG2");
  });

  it("each typed column mirrors the agent_info JSON value (dual-write invariant)", () => {
    const out = mapRow() as Record<string, unknown>;
    const ai = (out.agent_info ?? {}) as Record<string, unknown>;
    expect(out.list_agent_full_name).toBe(asStr(ai.ListAgentFullName));
    expect(out.list_office_name).toBe(asStr(ai.ListOfficeName));
    expect(out.list_agent_email).toBe(asStr(ai.ListAgentEmail));
    expect(out.list_agent_direct_phone).toBe(asStr(ai.ListAgentDirectPhone));
    expect(out.list_office_mls_id).toBe(asStr(ai.ListOfficeMlsId));
    expect(out.list_agent_mls_id).toBe(asStr(ai.ListAgentMlsId));
    expect(out.co_list_office_mls_id).toBe(asStr(ai.CoListOfficeMlsId));
    expect(out.co_list_agent_mls_id).toBe(asStr(ai.CoListAgentMlsId));
  });

  it("agent_info JSON is unchanged (still emitted with its keys)", () => {
    const out = mapRow() as Record<string, unknown>;
    const ai = (out.agent_info ?? {}) as Record<string, unknown>;
    expect(ai.ListAgentFullName).toBe("Jane Doe");
    expect(ai.ListAgentEmail).toBe("jane@acme.com");
    expect(ai.ListOfficeName).toBe("Acme Realty");
  });

  it("missing source values yield null typed columns (nullable, no empty strings)", () => {
    const out = mapTrestleToPrisma({
      ListingId: "RLS-A2-2", ListingKey: "RLS-A2-2", StandardStatus: "Active",
      PropertyType: "Residential", ListPrice: 1000000, ModificationTimestamp: "2026-09-01T00:00:00Z",
      ListAgentFullName: "Solo Agent", ListOfficeName: "Solo Office",
    } as unknown as Record<string, unknown>) as Record<string, unknown>;
    expect(out.list_agent_full_name).toBe("Solo Agent");
    expect(out.list_agent_email).toBeNull();
    expect(out.list_agent_direct_phone).toBeNull();
    expect(out.co_list_office_mls_id).toBeNull();
    expect(out.co_list_agent_mls_id).toBeNull();
  });
});
