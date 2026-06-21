/// <reference types="jest" />
/**
 * Phase B checkpoint 2 — public DTO + portal PII mask now read TYPED-FIRST via
 * resolveListingAgentInfo, with agent_info JSON fallback. PII boundary UNCHANGED:
 *   - public DTO for third-party IDX exposes NO agent email/phone;
 *   - the mallan-exclusive contact card is the only public path for agent email/phone (gated);
 *   - the portal mask stays fail-closed ({ company } only).
 */
import { dbListingToPublicDTO, type DbListing } from "@/lib/idx/db-to-public-dto";
import { sanitizeForPortal } from "@/lib/compliance/dto";

function baseListing(extra: Partial<DbListing> = {}): DbListing {
  return {
    id: "1", listing_id: "RLS123", status: "Active", listing_type: "sale",
    property_type: "Residential", property_sub_type: "Condo", list_price: "1000000",
    bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: "1000",
    borough: "Manhattan", neighborhood: "Midtown",
    address: {}, features: {}, media: [], agent_info: {}, raw_data: {},
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    listing_contract_date: null, modification_timestamp: new Date("2026-01-01T00:00:00.000Z"),
    ...extra,
  } as unknown as DbListing;
}

describe("Phase B — public DTO agent attribution (typed-first, PII-safe)", () => {
  it("third-party IDX listing exposes NO agent email/phone (no _assignedAgent)", () => {
    const dto = dbListingToPublicDTO(baseListing({
      listing_id: "RLS999", agent_id: null, rls_eligible: true,
      list_agent_email: "agent@other.com", list_agent_direct_phone: "212-555-9999",
      list_office_name: "Other Brokerage",
      agent_info: { ListAgentEmail: "agent@other.com", ListAgentDirectPhone: "212-555-9999" },
    } as Partial<DbListing>));
    expect((dto as unknown as Record<string, unknown>)._assignedAgent).toBeUndefined();
    expect(JSON.stringify(dto)).not.toContain("agent@other.com");
    expect(JSON.stringify(dto)).not.toContain("212-555-9999");
  });

  it("listOfficeName is TYPED-FIRST (typed column wins over JSON)", () => {
    const dto = dbListingToPublicDTO(baseListing({
      list_office_name: "Typed Brokerage",
      agent_info: { ListOfficeName: "Json Brokerage" },
    } as Partial<DbListing>));
    expect(dto.listOfficeName).toBe("Typed Brokerage");
  });

  it("listOfficeName falls back to JSON when typed column null", () => {
    const dto = dbListingToPublicDTO(baseListing({
      list_office_name: null, agent_info: { ListOfficeName: "Json Brokerage" },
    } as Partial<DbListing>));
    expect(dto.listOfficeName).toBe("Json Brokerage");
  });

  it("mallan-exclusive contact card IS the gated path for agent email/phone (typed-first)", () => {
    const dto = dbListingToPublicDTO(baseListing({
      listing_id: "SL-0001", rls_eligible: false,
      list_agent_full_name: "Maya Allan", list_agent_email: "maya@mallan.nyc",
      list_agent_direct_phone: "646-258-4460", list_office_name: "Mallan Real Estate Inc.",
      agent_info: { ListAgentFullName: "Old Json", ListAgentEmail: "old@json.com" },
    } as Partial<DbListing>));
    const card = (dto as unknown as Record<string, unknown>)._assignedAgent as Record<string, string> | undefined;
    expect(card).toBeDefined();
    expect(card!.name).toBe("Maya Allan");          // typed wins over JSON "Old Json"
    expect(card!.email).toBe("maya@mallan.nyc");    // typed wins over JSON "old@json.com"
    expect(card!.phone).toBe("646-258-4460");
  });
});

describe("Phase B — portal PII mask stays fail-closed (typed-first company)", () => {
  it("emits only { company }, never agent email/phone", () => {
    const r = sanitizeForPortal({
      id: 1, listing_id: "RLS1", status: "Active",
      list_office_name: "Typed Office",
      agent_info: { ListOfficeName: "Json Office", ListAgentEmail: "leak@x.com", ListAgentDirectPhone: "212-555-0000" },
    } as Record<string, unknown>, "buyer");
    expect(r.agent_info).toEqual({ company: "Typed Office" }); // typed-first, company-only
    expect(JSON.stringify(r)).not.toContain("leak@x.com");
    expect(JSON.stringify(r)).not.toContain("212-555-0000");
  });

  it("company falls back to JSON ListOfficeName when typed null", () => {
    const r = sanitizeForPortal({
      id: 1, listing_id: "RLS1", status: "Active",
      agent_info: { ListOfficeName: "Json Office" },
    } as Record<string, unknown>, "buyer");
    expect(r.agent_info).toEqual({ company: "Json Office" });
  });
});
