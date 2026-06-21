/// <reference types="jest" />
/**
 * Phase B reader resolver (spec #410 §3, plan #411, board #415 Lane 1).
 * resolveListingAgentInfo = TYPED-FIRST, JSON-fallback only where typed is null.
 */
import { resolveListingAgentInfo } from "@/lib/listings/agent-info-resolver";

describe("resolveListingAgentInfo — typed-first / JSON-fallback", () => {
  it("prefers the typed column over the agent_info JSON", () => {
    const r = resolveListingAgentInfo({
      list_office_name: "Typed Office",
      list_agent_email: "typed@x.com",
      list_office_mls_id: "T1",
      agent_info: { ListOfficeName: "Json Office", ListAgentEmail: "json@x.com", ListOfficeMlsId: "J1" },
    });
    expect(r.officeName).toBe("Typed Office");
    expect(r.agentEmail).toBe("typed@x.com");
    expect(r.officeMlsId).toBe("T1");
  });

  it("falls back to JSON only where the typed column is null (PascalCase)", () => {
    const r = resolveListingAgentInfo({
      list_agent_full_name: null,
      agent_info: { ListAgentFullName: "Json Jane", ListAgentMlsId: "AG1", CoListAgentMlsId: "CO1" },
    });
    expect(r.fullName).toBe("Json Jane");
    expect(r.agentMlsId).toBe("AG1");
    expect(r.coListAgentMlsId).toBe("CO1");
  });

  it("falls back to the lowercase ensure-listing shape {name,email,phone,company}", () => {
    const r = resolveListingAgentInfo({
      agent_info: { name: "Bob", email: "bob@x.com", phone: "212-555-0100", company: "X Realty" },
    });
    expect(r.fullName).toBe("Bob");
    expect(r.agentEmail).toBe("bob@x.com");
    expect(r.agentDirectPhone).toBe("212-555-0100");
    expect(r.officeName).toBe("X Realty");
  });

  it("empty typed string falls through to JSON; empty everything → null", () => {
    expect(resolveListingAgentInfo({ list_office_name: "  ", agent_info: { ListOfficeName: "Fallback" } }).officeName).toBe("Fallback");
    expect(resolveListingAgentInfo({ list_office_name: "", agent_info: {} }).officeName).toBeNull();
  });

  it("resolves all 8 fields and is null-safe", () => {
    const r = resolveListingAgentInfo(null);
    expect(Object.keys(r).sort()).toEqual(
      ["agentDirectPhone","agentEmail","agentMlsId","coListAgentMlsId","coListOfficeMlsId","fullName","officeMlsId","officeName"].sort(),
    );
    for (const v of Object.values(r)) expect(v).toBeNull();
  });

  it("typed-only row (post-A6) resolves purely from typed columns even with empty JSON", () => {
    const r = resolveListingAgentInfo({
      list_agent_full_name: "Maya Allan", list_office_name: "Mallan Real Estate Inc.",
      list_agent_email: "maya@mallan.nyc", list_agent_direct_phone: "646-258-4460",
      list_office_mls_id: "OFF", list_agent_mls_id: "AG", co_list_office_mls_id: null, co_list_agent_mls_id: null,
      agent_info: {},
    });
    expect(r.fullName).toBe("Maya Allan");
    expect(r.agentEmail).toBe("maya@mallan.nyc");
    expect(r.coListOfficeMlsId).toBeNull();
  });
});
