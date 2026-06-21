/// <reference types="jest" />
/**
 * Phase C — the CRM edit forms (sale + rental) hydrate agent/contact fields TYPED-FIRST
 * (Codex #420 P2). Post-Phase-C, agent_info JSON is frozen/empty, so a CRM-created exclusive's
 * live attribution is in the typed columns. The edit forms must prefer the typed columns, then
 * agent_info, then raw_data — otherwise opening an exclusive to edit shows blank/stale agent
 * fields (and a re-save could clear attribution).
 *
 * These forms are served/fetched at runtime (NOT inlined into index-built.html), so the source
 * .html IS the served file. Structural assertion: each hydration expression must read the typed
 * column before the agent_info fallback.
 */
import { readFileSync } from "fs";
import { join } from "path";

const sale = readFileSync(join(process.cwd(), "public", "crm", "SALE-FORM-REDESIGN.html"), "utf8");
const rental = readFileSync(join(process.cwd(), "public", "crm", "RENTAL-FORM-REDESIGN.html"), "utf8");

describe("Phase C — SALE form hydrates agent fields typed-first", () => {
  it.each([
    ["list_agent_mls_id", "ListAgentMlsId"],
    ["list_agent_full_name", "ListAgentFullName"],
    ["list_agent_direct_phone", "ListAgentDirectPhone"],
    ["list_agent_email", "ListAgentEmail"],
    ["list_office_name", "ListOfficeName"],
  ])("reads listing.%s before agentInfo.%s", (typedCol, jsonKey) => {
    expect(sale).toContain(`listing.${typedCol} || agentInfo.${jsonKey}`);
  });

  it("hasSavedAgent gate also considers the typed columns (post-Phase-C exclusive recognized)", () => {
    expect(sale).toMatch(/hasSavedAgent\s*=\s*!!\(listing\.list_agent_mls_id \|\| listing\.list_agent_full_name/);
  });

  // Second hydration path: the SALE_FIELD_MAP generic loader for the hidden saleUpdatingAgent*
  // fields (which feed the save). Each agent entry must carry a typedKey and the loader must
  // read the typed column before the agent_info fallback.
  it.each([
    ["ListAgentMlsId", "list_agent_mls_id"],
    ["ListAgentFullName", "list_agent_full_name"],
    ["ListAgentEmail", "list_agent_email"],
    ["ListAgentDirectPhone", "list_agent_direct_phone"],
    ["ListOfficeName", "list_office_name"],
  ])("SALE_FIELD_MAP %s entry carries typedKey %s", (agentKey, typedKey) => {
    expect(sale).toMatch(new RegExp(`agentKey: '${agentKey}', typedKey: '${typedKey}'`));
  });

  it("SALE_FIELD_MAP loader reads listing[f.typedKey] before agentInfo[f.agentKey]", () => {
    const loaderIdx = sale.indexOf("f.typedKey ? listing[f.typedKey] : null) || agentInfo[f.agentKey]");
    expect(loaderIdx).toBeGreaterThan(-1);
  });
});

describe("Phase C — RENTAL form hydrates agent fields typed-first", () => {
  it.each([
    ["list_agent_full_name", "ListAgentFullName"],
    ["list_office_name", "ListOfficeName"],
    ["list_agent_direct_phone", "ListAgentDirectPhone"],
    ["list_agent_email", "ListAgentEmail"],
  ])("reads listing.%s before agentInfo.%s", (typedCol, jsonKey) => {
    expect(rental).toContain(`listing.${typedCol} || agentInfo.${jsonKey}`);
  });
});
