/**
 * S-BE-005 replacement (Sentinel-L retirement).
 *
 * The CRM status route (app/api/crm/listings/[id]/status/route.ts) treats the
 * listing_search_projection dual-write as BEST-EFFORT by design: on failure it
 * records a `projection_dual_write_failed` AuditEvent, and the data-retention
 * cron's per-row dual-write reconciles it (belt-and-suspenders). The agent's
 * status change is intentionally NOT blocked (see the route comment, "does NOT
 * block the agent's status change"). This contract test locks that documented
 * design so a future refactor cannot silently change it without updating here.
 *
 * (This replaces Sentinel-L rule S-BE-005, whose regex did not even fire on the
 * current route — a false negative — confirming the scanner is not a reliable
 * gate. Source-contract scan; no DB/network.)
 */
import * as fs from "fs";
import * as path from "path";

const ROUTE = path.resolve(
  __dirname,
  "../../app/api/crm/listings/[id]/status/route.ts",
);
const src = fs.readFileSync(ROUTE, "utf8");

describe("CRM status route — projection dual-write is best-effort (S-BE-005 contract)", () => {
  it("wraps dualWriteProjectionForListingId in a try/catch (best-effort)", () => {
    expect(src).toMatch(
      /try\s*\{[\s\S]{0,160}dualWriteProjectionForListingId[\s\S]{0,80}\}\s*catch/,
    );
  });

  it("records a projection_dual_write_failed AuditEvent on failure", () => {
    expect(src).toContain('action: "projection_dual_write_failed"');
  });

  it("documents that projection failure does NOT block the status change", () => {
    expect(src).toMatch(/does NOT block the agent's status change/i);
  });

  it("still returns the publish success payload (publicUrl/rebnyListingUrl) after the catch", () => {
    const afterCatch = src.slice(src.indexOf('projection_dual_write_failed'));
    expect(afterCatch).toMatch(/publicUrl/);
    expect(afterCatch).toMatch(/rebnyListingUrl/);
    // the catch handler itself does not re-throw the projection error
    const catchBlock = src.slice(
      src.indexOf('} catch (err) {'),
      src.indexOf('projection_dual_write_failed') + 600,
    );
    expect(catchBlock).not.toMatch(/throw\s+err\b/);
  });
});
