/// <reference types="jest" />
/**
 * Phase C — the exclusive-agent-assignment REPAIR ops logic must be TYPED-FIRST
 * (Codex #420 second blocker). Post-Phase-C, agent_info JSON is frozen/empty, so the
 * repair must decide candidates and fill values from the typed columns, never from the
 * retired JSON — otherwise a row with good typed attribution but `agent_info = {}` gets
 * wrongly repaired (manual name overwritten, MLS/email nulled).
 */
import { planExclusiveRepair, MALLAN_BROKERAGE_NAME } from "@/lib/listings/repair-exclusive-plan";
import type { ResolvableListingAgent } from "@/lib/listings/agent-info-resolver";

const OWNER = {
  id: 5, full_name: "Owning Agent", first_name: "Owning", last_name: "Agent",
  email: "owner@mallan.nyc", phone: "646-000-0000",
};

function row(extra: Partial<ResolvableListingAgent> = {}): ResolvableListingAgent {
  return { agent_info: {}, ...extra };
}

describe("planExclusiveRepair — typed-first candidate + fill", () => {
  it("typed name present + agent_info {} → SKIPPED (not a repair candidate)", () => {
    const d = planExclusiveRepair(row({ list_agent_full_name: "Existing Name", agent_info: {} }), OWNER);
    expect(d.skip).toBe(true);
  });

  it("manual typed override is NOT overwritten by the owning Agent row (force restamp)", () => {
    const d = planExclusiveRepair(
      row({ list_agent_full_name: "Manual Override", list_office_name: "Mallan Real Estate Inc.", agent_info: {} }),
      OWNER,
      { force: true },
    );
    expect(d.skip).toBe(false);
    expect(d.typed!.list_agent_full_name).toBe("Manual Override"); // not "Owning Agent"
  });

  it("typed email/phone/MLS present but JSON missing → PRESERVED, never nulled", () => {
    const d = planExclusiveRepair(
      row({
        list_agent_full_name: null,             // blank name → candidate
        list_agent_email: "manual@mallan.nyc",
        list_agent_direct_phone: "212-555-7777",
        list_office_mls_id: "OFF-KEEP",
        list_agent_mls_id: "AG-KEEP",
        co_list_office_mls_id: "COFF-KEEP",
        co_list_agent_mls_id: "CAG-KEEP",
        agent_info: {},                          // retired JSON empty
      }),
      OWNER,
    );
    expect(d.skip).toBe(false);
    expect(d.typed!.list_agent_email).toBe("manual@mallan.nyc");      // preserved (not owner@)
    expect(d.typed!.list_agent_direct_phone).toBe("212-555-7777");    // preserved
    expect(d.typed!.list_office_mls_id).toBe("OFF-KEEP");             // preserved, not null
    expect(d.typed!.list_agent_mls_id).toBe("AG-KEEP");
    expect(d.typed!.co_list_office_mls_id).toBe("COFF-KEEP");
    expect(d.typed!.co_list_agent_mls_id).toBe("CAG-KEEP");
    // blank name filled from the Agent row
    expect(d.typed!.list_agent_full_name).toBe("Owning Agent");
  });

  it("blank typed name + owning Agent row → fills name/office/contact from the Agent", () => {
    const d = planExclusiveRepair(
      row({ list_agent_full_name: null, list_office_name: null, list_agent_email: null, list_agent_direct_phone: null, agent_info: {} }),
      OWNER,
    );
    expect(d.skip).toBe(false);
    expect(d.typed!.list_agent_full_name).toBe("Owning Agent");
    expect(d.typed!.list_office_name).toBe(MALLAN_BROKERAGE_NAME);
    expect(d.typed!.list_agent_email).toBe("owner@mallan.nyc");
    expect(d.typed!.list_agent_direct_phone).toBe("646-000-0000");
  });

  it("never produces an agent_info write (typed-only payload)", () => {
    const d = planExclusiveRepair(row({ list_agent_full_name: null, agent_info: {} }), OWNER);
    expect(d.typed).toBeDefined();
    expect(d.typed as unknown as Record<string, unknown>).not.toHaveProperty("agent_info");
  });

  it("legacy fallback: name only in agent_info JSON (pre-Phase-C frozen row) → resolved, skipped by default", () => {
    const d = planExclusiveRepair(row({ list_agent_full_name: null, agent_info: { ListAgentFullName: "From JSON" } }), OWNER);
    expect(d.skip).toBe(true); // resolver typed-first falls back to JSON → name present → not a candidate
  });
});
