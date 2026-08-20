/**
 * RENTAL FORM — CancellationDate chain.
 *
 * The rental form maps its CRM status `Cancelled` to the LIVE Cotality member
 * `Canceled` (single L) in CRM_TO_RESO_STATUS, so REBNY rule CF-CANCELLED-001
 * ("Cancelled requires CancellationDate", BLOCKER) matched its payloads even
 * BEFORE the 2026-08-20 spelling-closure work — yet the form collected no
 * CancellationDate at all (zero occurrences in the file). Cancelling a rental
 * therefore 422'd with no input for the agent to fill.
 *
 * The rule is NOT weakened here. The missing input, visibility wiring and
 * payload assembly are supplied instead, mirroring the OffMarketDate chain that
 * already existed in the same file.
 *
 * Persistence needs no migration: lib/compliance/rebny-field-tables.ts declares
 * `CancellationDate: { raw: true }`, so it rides raw_data like OffMarketDate.
 *
 * NOTE ON SCOPE — the rental form does not hydrate `rentalOffMarketDate` back
 * from the API either (no setVal for it in _populateRentalFormFromApi). That is
 * a PRE-EXISTING gap affecting both date fields equally; this change reaches
 * parity with OffMarketDate and does not introduce it. Pinned below so the gap
 * is visible rather than forgotten.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FORM = join(process.cwd(), "public", "crm", "RENTAL-FORM-REDESIGN.html");
const src = readFileSync(FORM, "utf8");

describe("rental form — CancellationDate chain mirrors OffMarketDate", () => {
  it("LINK 1: the conditional wrapper and the date input exist", () => {
    expect(src).toContain('id="rentalCancellationDateField"');
    expect(src).toMatch(
      /<input[^>]*id="rentalCancellationDate"[^>]*data-rls-field="CancellationDate"/
    );
  });

  it("LINK 2: the wrapper is hidden by default and revealed only for the cancel status", () => {
    // Default-hidden in markup.
    expect(src).toMatch(/id="rentalCancellationDateField"\s+style="display:none;"/);
    // Reset to hidden on every status change, then revealed by its OWN branch.
    expect(src).toContain("if (cancellation) cancellation.style.display = 'none';");
    expect(src).toMatch(
      /if \(\['Cancelled'\]\.includes\(status\)\)\s*\{\s*\n\s*if \(cancellation\) cancellation\.style\.display = '';/
    );
  });

  it("LINK 2b: cancellation is NOT folded into the off-market status list", () => {
    // CF-CANCELLED-001 applies to the cancel class alone. PermOffMarket /
    // TempOffMarket / Expired / Withdrawn carry no such rule, so sharing one
    // branch would prompt for a date those statuses never need.
    const offMarketBranch = src.match(
      /if \(\['PermOffMarket'[^)]*\)\)\s*\{\s*\n\s*if \(offMarket\) offMarket\.style\.display = '';\s*\n\s*\}/
    );
    expect(offMarketBranch).not.toBeNull();
    expect(offMarketBranch![0]).not.toContain("cancellation");
  });

  it("LINK 3: the value is collected from the input", () => {
    expect(src).toContain("cancellationDate: val('rentalCancellationDate'),");
  });

  it("LINK 4: the RLS key is assembled UNCONDITIONALLY so a blank arrives as ''", () => {
    // Emitting '' (rather than omitting the key) is what keeps the BLOCKER
    // fail-closed: rls-enforcement treats '' as missing.
    expect(src).toContain("data.CancellationDate = data.rentalCancellationDate || '';");
  });

  it("the cancel status still maps to the LIVE provider member, not the CRM spelling", () => {
    // 'Canceled' (single L) is the Cotality member; 'Cancelled' returns HTTP 400
    // from the provider. This mapping is why the rule already matched this form.
    expect(src).toMatch(/'Cancelled':\s*'Canceled'/);
  });

  it("PINNED PRE-EXISTING GAP: neither date field hydrates back from the API", () => {
    // If someone adds hydration for one, this fails and tells them to add both.
    const hydratesOffMarket = /setVal\(\s*'rentalOffMarketDate'/.test(src);
    const hydratesCancellation = /setVal\(\s*'rentalCancellationDate'/.test(src);
    expect({ hydratesOffMarket, hydratesCancellation }).toEqual({
      hydratesOffMarket: false,
      hydratesCancellation: false,
    });
  });
});
