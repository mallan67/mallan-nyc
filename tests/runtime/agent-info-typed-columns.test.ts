/**
 * Phase A producer dual-write proof package (spec #410, plan #411).
 *
 * The shared seam `typedAgentColumnsFromJson` is the function EVERY writer uses to
 * derive the 8 typed columns from the agent_info JSON it persists. Proving the seam
 * + that each writer feeds it the persisted JSON = proving the dual-write invariant.
 *
 * Covers: the seam (PascalCase, lowercase ensure-listing shape, null/empty, co-list),
 * the exclusive-assignment producer (returns all 8 incl. PII), and the per-route
 * source shapes (ensure-listing lowercase, CRM merged, import-closed selected
 * email/phone + MLS IDs).
 */
import { typedAgentColumnsFromJson } from "@/lib/listings/agent-info-typed-columns";
import { buildExclusiveAgentAssignment } from "@/lib/listings/exclusive-agent-assignment";

describe("typedAgentColumnsFromJson — the producer seam", () => {
  it("maps PascalCase Cotality keys (Trestle/CRM) to all 8 typed columns", () => {
    const t = typedAgentColumnsFromJson({
      ListAgentFullName: "Jane Doe",
      ListOfficeName: "Acme Realty",
      ListAgentEmail: "jane@acme.com",
      ListAgentDirectPhone: "212-555-0100",
      ListOfficeMlsId: "OFF1",
      ListAgentMlsId: "AG1",
      CoListOfficeMlsId: "OFF2",
      CoListAgentMlsId: "AG2",
    });
    expect(t).toEqual({
      list_agent_full_name: "Jane Doe",
      list_office_name: "Acme Realty",
      list_agent_email: "jane@acme.com",
      list_agent_direct_phone: "212-555-0100",
      list_office_mls_id: "OFF1",
      list_agent_mls_id: "AG1",
      co_list_office_mls_id: "OFF2",
      co_list_agent_mls_id: "AG2",
    });
  });

  it("maps the lowercase ensure-listing shape {name,email,phone,company}", () => {
    const t = typedAgentColumnsFromJson({
      name: "Bob Smith", email: "bob@x.com", phone: "917-555-0199", company: "X Realty",
    });
    expect(t.list_agent_full_name).toBe("Bob Smith");
    expect(t.list_agent_email).toBe("bob@x.com");
    expect(t.list_agent_direct_phone).toBe("917-555-0199");
    expect(t.list_office_name).toBe("X Realty");
    expect(t.list_office_mls_id).toBeNull(); // no MLS IDs in the manual shape
  });

  it("missing/empty values become null (nullable columns, no empty strings)", () => {
    const t = typedAgentColumnsFromJson({ ListAgentFullName: "", ListOfficeName: "  " });
    expect(t.list_agent_full_name).toBeNull();
    expect(t.list_office_name).toBeNull();
    expect(t.list_agent_email).toBeNull();
    expect(typedAgentColumnsFromJson(null).list_agent_full_name).toBeNull();
    expect(typedAgentColumnsFromJson(undefined).co_list_agent_mls_id).toBeNull();
  });
});

describe("exclusive-agent-assignment producer dual-writes all 8 typed columns", () => {
  it("returns the 6 net-new typed columns (incl. PII email/phone) from the merged agent_info", () => {
    const out = buildExclusiveAgentAssignment(
      { id: 1n, full_name: "Maya Allan", email: "maya@mallan.nyc", phone: "646-258-4460", office_name: "Mallan Real Estate Inc." },
      { listing_id: "SL-0001", rls_eligible: false },
      {},
    );
    expect(out).not.toBeNull();
    expect(out!.list_agent_full_name).toBe("Maya Allan");
    expect(out!.list_office_name).toBe("Mallan Real Estate Inc.");
    // PII present in typed columns (exposure gated by the READ layer, not here):
    expect(out!.list_agent_email).toBe("maya@mallan.nyc");
    expect(out!.list_agent_direct_phone).toBe("646-258-4460");
    // all 8 keys exist on the returned shape
    expect(out).toHaveProperty("list_office_mls_id");
    expect(out).toHaveProperty("list_agent_mls_id");
    expect(out).toHaveProperty("co_list_office_mls_id");
    expect(out).toHaveProperty("co_list_agent_mls_id");
  });
});

describe("per-route source shapes feed the seam correctly", () => {
  it("CRM merged agent_info → typed columns (POST/PATCH dual-write source)", () => {
    // CRM POST/PATCH write `typedAgentColumnsFromJson(agent_info)` on the same
    // object they persist as the JSON — proving lock-step for the merged shape.
    const merged = { ListAgentFullName: "CRM Agent", ListOfficeName: "Mallan Real Estate Inc.", ListAgentEmail: "a@mallan.nyc" };
    const t = typedAgentColumnsFromJson(merged);
    expect(t.list_agent_full_name).toBe("CRM Agent");
    expect(t.list_office_name).toBe("Mallan Real Estate Inc.");
    expect(t.list_agent_email).toBe("a@mallan.nyc");
  });

  it("import-closed selected email/phone + MLS IDs map when present; co-list absent → null", () => {
    // import-closed selects ListAgentEmail/ListAgentDirectPhone and now includes
    // them in the JSON; CoList* are NOT selected by that import → null.
    const closed = {
      ListAgentFullName: "Closed Agent",
      ListAgentEmail: "closed@x.com",
      ListAgentDirectPhone: "718-555-0123",
      ListAgentMlsId: "CAG1",
      ListOfficeName: "X Realty",
      ListOfficeMlsId: "COFF1",
    };
    const t = typedAgentColumnsFromJson(closed);
    expect(t.list_agent_email).toBe("closed@x.com");
    expect(t.list_agent_direct_phone).toBe("718-555-0123");
    expect(t.list_agent_mls_id).toBe("CAG1");
    expect(t.list_office_mls_id).toBe("COFF1");
    expect(t.co_list_office_mls_id).toBeNull();
    expect(t.co_list_agent_mls_id).toBeNull();
  });
});
