/**
 * VERIFIED RENTAL FEE FACTS MUST SURVIVE THE MAPPER.
 *
 * `app/api/idx/search/route.ts` already selects four canonical FARE fields from
 * the live Property feed — `MoveInCosts`, `OngoingFees`, `TenantPays`,
 * `TenantPaysDescription` (route.ts:65) — and `mapTrestleToCrmListing` emitted
 * none of them. The data was fetched from Cotality and discarded.
 *
 * COMPLIANCE BOUNDARY (Maya's determination, 2026-08-26):
 *
 *   agent-only internal Search / workbench
 *       -> NO mandatory FARE disclosure rendering
 *   any rental listing/advertisement/share/email/report/portal/print shown to a
 *   PROSPECTIVE TENANT
 *       -> applicable tenant-payable fees MUST be clearly disclosed
 *
 * So this is deliberately NOT a rendering change: nothing new is displayed on
 * the Agent grid. It preserves the verified provider facts through the mapping
 * boundary so a downstream client-facing rental output can enforce disclosure
 * from real data instead of having to re-fetch or invent it.
 *
 * SHAPE. Live `$metadata` (probed 2026-08-26) declares three of the four as
 * MULTI-ENUMS — `Enums.Multi.MoveInCosts`, `Enums.Multi.OngoingFees`,
 * `Enums.Multi.TenantPays` — and `TenantPaysDescription` as a nullable
 * String(1024). The collections are preserved AS COLLECTIONS. Flattening them
 * to a comma-joined string would force every downstream consumer to re-parse a
 * string the provider never sent, which is the same lossy laundering that made
 * `PENDING`/`ActiveUnderContract` mean two different things at two ends.
 *
 * ABSENT IS NULL, NEVER []. An empty array is an affirmative claim — "the
 * provider says there are no tenant-payable fees". Absent means we were not
 * told. A FARE disclosure surface must be able to tell those apart.
 */
import { mapTrestleToCrmListing } from "@/lib/search/crm-idx-mapper";

const map = (raw: Record<string, unknown>) =>
  mapTrestleToCrmListing({ ListingKey: "1183681390", ...raw }, 0) as Record<string, unknown>;

describe("crm-idx-mapper preserves verified FARE rental fee facts", () => {
  it("preserves MoveInCosts as a collection", () => {
    const out = map({ MoveInCosts: ["FirstMonthsRent", "SecurityDeposit"] });
    expect(out.providerMoveInCosts).toEqual(["FirstMonthsRent", "SecurityDeposit"]);
  });

  it("preserves OngoingFees as a collection", () => {
    const out = map({ OngoingFees: ["Electricity", "Gas"] });
    expect(out.providerOngoingFees).toEqual(["Electricity", "Gas"]);
  });

  it("preserves TenantPays as a collection", () => {
    const out = map({ TenantPays: ["Electricity", "CableTv", "Insurance"] });
    expect(out.providerTenantPays).toEqual(["Electricity", "CableTv", "Insurance"]);
  });

  it("preserves TenantPaysDescription verbatim", () => {
    const out = map({ TenantPaysDescription: "Tenant pays electric and cable. Broker fee paid by owner." });
    expect(out.providerTenantPaysDescription).toBe(
      "Tenant pays electric and cable. Broker fee paid by owner.",
    );
  });

  it("does not flatten a collection into a comma-joined string", () => {
    const out = map({ TenantPays: ["Electricity", "CableTv"] });
    expect(out.providerTenantPays).not.toBe("Electricity,CableTv");
    expect(Array.isArray(out.providerTenantPays)).toBe(true);
  });

  it("reports an ABSENT fee fact as null, not as an empty collection", () => {
    // null = "we were not told". [] = "the provider says there are none".
    // A FARE surface must not read the first as the second.
    const out = map({});
    expect(out.providerMoveInCosts).toBeNull();
    expect(out.providerOngoingFees).toBeNull();
    expect(out.providerTenantPays).toBeNull();
    expect(out.providerTenantPaysDescription).toBeNull();
  });

  it("keeps an EMPTY provider collection distinct from an absent one", () => {
    const out = map({ TenantPays: [] });
    expect(out.providerTenantPays).toEqual([]);
    expect(out.providerTenantPays).not.toBeNull();
  });

  it("tolerates a scalar arriving where a collection is declared", () => {
    // Defensive: the contract says multi-enum, but a single-member response
    // must not silently become a per-character array via String() coercion.
    const out = map({ TenantPays: "Electricity" });
    expect(out.providerTenantPays).toEqual(["Electricity"]);
  });

  it("does NOT invent a fareActFees object the provider never sent", () => {
    // The renderers key their FARE block on `fareActFees`. Synthesising one
    // here would make the agent grid start rendering a disclosure built from
    // fields we have not been asked to display, and would put a Mallan-shaped
    // object in front of provider facts.
    const out = map({ TenantPays: ["Electricity"], MoveInCosts: ["SecurityDeposit"] });
    expect("fareActFees" in out).toBe(false);
  });
});
