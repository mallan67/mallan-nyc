/// <reference types="jest" />
/**
 * Phase B (final readers) — open-houses, similar-listings, archiver cron, detail page,
 * and the CRM grid hydrate now resolve agent attribution TYPED-FIRST.
 *
 * The server routes call `resolveListingAgentInfo(listing).officeName || <fallback>`,
 * so testing the resolver with the exact row shapes each route passes IS the reader test.
 * The archiver adds a third tier (typed → agent_info JSON → raw_data); we prove the
 * resolver yields null when typed+JSON are empty so the route's `|| str(raw.*)` applies.
 *
 * The CRM grid (data-loader.js) is browser JS and cannot import the TS resolver; it uses the
 * same `typed || json || ''` precedence inline. We structurally assert that precedence is
 * present (and in the right order) in the built/source client so a future edit can't silently
 * flip it back to JSON-first.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { resolveListingAgentInfo } from "@/lib/listings/agent-info-resolver";

describe("Phase B — open-houses / similar resolve office attribution typed-first", () => {
  it("typed list_office_name wins over agent_info JSON (ListOfficeName / company)", () => {
    const r = resolveListingAgentInfo({
      list_office_name: "Typed Office",
      agent_info: { ListOfficeName: "Json Office", company: "Json Co" },
    });
    expect(r.officeName).toBe("Typed Office");
  });

  it("falls back to agent_info JSON ListOfficeName when typed column null", () => {
    const r = resolveListingAgentInfo({
      list_office_name: null,
      agent_info: { ListOfficeName: "Json Office" },
    });
    expect(r.officeName).toBe("Json Office");
  });

  it("falls back to agent_info JSON `company` shape when ListOfficeName absent", () => {
    const r = resolveListingAgentInfo({
      list_office_name: null,
      agent_info: { company: "Json Co" },
    });
    expect(r.officeName).toBe("Json Co");
  });

  it("yields null (route then renders its default) when nothing is present", () => {
    const r = resolveListingAgentInfo({ list_office_name: null, agent_info: {} });
    expect(r.officeName).toBeNull();
    // mirrors the route: resolveListingAgentInfo(l).officeName || 'Mallan Real Estate Inc.'
    expect(r.officeName || "Mallan Real Estate Inc.").toBe("Mallan Real Estate Inc.");
  });
});

describe("Phase B — archiver capture is typed → agent_info → raw_data", () => {
  it("typed full name + office win over agent_info JSON", () => {
    const r = resolveListingAgentInfo({
      list_agent_full_name: "Typed Agent",
      list_office_name: "Typed Office",
      agent_info: { ListAgentFullName: "Json Agent", ListOfficeName: "Json Office" },
    });
    expect(r.fullName).toBe("Typed Agent");
    expect(r.officeName).toBe("Typed Office");
  });

  it("resolver returns null when typed+JSON empty, so the route's raw_data fallback applies", () => {
    const r = resolveListingAgentInfo({
      list_agent_full_name: null,
      list_office_name: null,
      agent_info: {},
    });
    expect(r.fullName).toBeNull();
    expect(r.officeName).toBeNull();
    // mirrors the archiver: resolvedAgent.fullName || str(raw.ListAgentFullName)
    expect(r.fullName || "Raw Agent").toBe("Raw Agent");
    expect(r.officeName || "Raw Office").toBe("Raw Office");
  });
});

describe("Phase B — CRM grid hydrate (data-loader.js) is typed-first", () => {
  const src = readFileSync(
    join(process.cwd(), "public", "crm", "js", "core", "data-loader.js"),
    "utf8",
  );

  it.each([
    ["company", "list_office_name", "ListOfficeName"],
    ["agentName", "list_agent_full_name", "ListAgentFullName"],
    ["agentEmail", "list_agent_email", "ListAgentEmail"],
    ["agentPhone", "list_agent_direct_phone", "ListAgentDirectPhone"],
  ])("%s reads typed `%s` before agent_info `%s`", (_field, typedCol, jsonKey) => {
    const typedIdx = src.indexOf(`apiListing.${typedCol}`);
    const jsonIdx = src.indexOf(`agent.${jsonKey}`);
    expect(typedIdx).toBeGreaterThan(-1);
    expect(jsonIdx).toBeGreaterThan(-1);
    // typed reference must appear before the JSON fallback on the same assignment
    expect(typedIdx).toBeLessThan(jsonIdx);
  });
});
