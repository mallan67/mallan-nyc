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

const defaults = readFileSync(join(process.cwd(), "public", "crm", "js", "forms", "agent-defaults.js"), "utf8");

describe("Phase C — both forms hydrate the saved listing agent typed-first (MallanAgentDefaults.hydrate)", () => {
  // The hydration lives in public/crm/js/forms/agent-defaults.js, which both forms call. crm-agent-defaults.test.ts boots the real pages with typed
  // columns that differ from agent_info and raw_data and requires the typed value; this pins the structure.
  it.each([
    ["list_agent_mls_id", "ListAgentMlsId"],
    ["list_agent_full_name", "ListAgentFullName"],
    ["list_agent_direct_phone", "ListAgentDirectPhone"],
    ["list_agent_email", "ListAgentEmail"],
    ["list_office_name", "ListOfficeName"],
    ["list_office_mls_id", "ListOfficeMlsId"],
  ])("reads listing.%s before agentInfo.%s", (typedCol, jsonKey) => {
    expect(defaults).toContain(`pick('${typedCol}', '${jsonKey}')`);
  });

  it("the reader tries the typed column, then agent_info, then raw_data", () => {
    expect(defaults).toContain("(typed && listing[typed]) || info[key] || raw[key]");
  });

  it("both forms hand the saved listing to the module", () => {
    expect(sale).toContain("MallanAgentDefaults.hydrate('sale', listing");
    expect(rental).toContain("MallanAgentDefaults.hydrate('rental', listing");
  });
});

describe("Phase C — SALE form hydrates the hidden agent fields typed-first", () => {

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

  // The ListAgentMlsId map entry must hydrate `saleUpdatingAgentMlsId` — the hidden field
  // collectSaleFormData() actually SUBMITS as ListAgentMlsId — NOT the internal-id field
  // `saleUpdatingAgent` (else a no-op edit re-sends the editor's session MLS id). (Codex #420.)
  it("ListAgentMlsId hydrates saleUpdatingAgentMlsId (the submitted field), not saleUpdatingAgent", () => {
    expect(sale).toContain("{ rls: 'ListAgentMlsId', form: 'saleUpdatingAgentMlsId', type: 'text', src: 'agentInfo', agentKey: 'ListAgentMlsId', typedKey: 'list_agent_mls_id' }");
    // and the save submits ListAgentMlsId from that same field, through the module that reads the hidden inputs by id (they sit outside the swept area)
    expect(sale).toContain("MallanAgentDefaults.identity('sale')");
    expect(defaults).toContain("ListAgentMlsId: read(prefix, 'mlsId')");
  });
});
