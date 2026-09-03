/// <reference types="jest" />
/**
 * PENDING MUST BE SEARCHABLE IN AUTHENTICATED AGENT SEARCH.
 *
 * Live Cotality supplies Pending inventory (probed 2026-08-25: StandardStatus
 * eq 'Pending' -> 5,913 rows on the Property feed; 5,560 of them sale-scoped).
 * Before this test the CRM could not ask for any of it: every control carrying
 * `data-value="Pending"` also carried `data-sub-status` (Offer, OfferOut,
 * OfferThruUs, Contract, ContractOut, ...), and the Cotality criteria boundary
 * correctly disables every sub-status control because those values are Mallan
 * business sub-states, not live `StandardStatus` members.
 *
 * So the broker had a screen full of Pending-looking checkboxes and no way to
 * search Pending. That is not a serializer defect — transport was already
 * proven — it is a missing criterion.
 *
 * THE FIX IS ONE TOP-LEVEL CRITERION, NOT RE-ENABLING THE SUB-STATUSES.
 * Offer/OfferOut/ContractOut and friends stay disabled until each has a
 * separately VERIFIED Cotality semantic mapping. Re-enabling them would ship
 * exactly the invented equivalence this codebase has been bitten by three times.
 *
 * These assertions execute the SERVED artifact (public/crm/index-built.html) —
 * the file that actually serves /crm/search — not the source tree, because a
 * source-only fix does not reach a deploy until the shell is rebuilt.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

const BUILT = resolve(__dirname, '../../public/crm/index-built.html');
const built = readFileSync(BUILT, 'utf8');

/** Every `data-field="MlsStatus"` input tag in the served artifact. */
const statusInputs = built.match(/<input[^>]*data-field="MlsStatus"[^>]*>/g) || [];

const topLevel = (value: string) =>
  statusInputs.filter(
    (tag) => tag.includes(`data-value="${value}"`) && !tag.includes('data-sub-status'),
  );

describe('Pending is reachable as a top-level Agent Search criterion', () => {
  it('the served artifact carries at least one Pending control with NO data-sub-status', () => {
    expect(topLevel('Pending').length).toBeGreaterThan(0);
  });

  /**
   * ALL FOUR STATUS CONTAINERS, NOT JUST THE ADVANCED ONES.
   *
   * collectSearchCriteria() picks its container by mode: in advanced mode it
   * reads #saleStatusOptions / #rentalStatusOptions, but in BASIC mode it reads
   * the active basic form instead. An earlier cut of this fix added Pending to
   * the two advanced panels only — every assertion here passed while a broker in
   * basic mode (the default) still could not select Pending. Enumerating the
   * containers explicitly is what makes that impossible to repeat.
   */
  it.each([
    ['sale basic', 'id="searchBasicMode"', 'id="searchBasicModeRental"'],
    ['rental basic', 'id="searchBasicModeRental"', 'id="saleStatusOptions"'],
    ['sale advanced', 'id="saleStatusOptions"', 'id="rentalStatusOptions"'],
    ['rental advanced', 'id="rentalStatusOptions"', null],
  ])('%s panel offers a top-level Pending control', (_label, startMarker, endMarker) => {
    const start = built.indexOf(startMarker as string);
    expect(start).toBeGreaterThan(-1);
    const end = endMarker ? built.indexOf(endMarker as string, start) : start + 12000;
    const panel = built.slice(start, end > start ? end : start + 12000);
    expect(panel).toMatch(
      /<input[^>]*data-field="MlsStatus"[^>]*data-value="Pending"(?![^>]*data-sub-status)[^>]*>/,
    );
  });

  it('the Pending sub-status controls are still present and still sub-status', () => {
    // The fix must ADD a criterion, not delete the historical sub-status UI.
    const subs = statusInputs.filter(
      (t) => t.includes('data-value="Pending"') && t.includes('data-sub-status'),
    );
    expect(subs.length).toBeGreaterThan(0);
  });
});

/**
 * Execute the real serializer out of the served artifact — the same technique
 * the status-transport suite uses — and prove the criterion reaches the wire
 * and becomes the exact provider predicate.
 */
describe('Pending criterion -> request -> OData', () => {
  const FN_START = 'window.buildIdxSearchParams = function(criteria) {';
  const FN_END = '\n        };';
  const B_START = '(function installCotalityCriteriaBoundary() {';
  const B_END = '\n})();';

  function servedSerializer(): (c: Record<string, unknown>) => Record<string, string> {
    const cut = (s: string, e: string) => {
      const a = built.indexOf(s);
      const b = built.indexOf(e, a);
      if (a === -1 || b === -1) throw new Error(`not found in served artifact: ${s}`);
      return built.slice(a, b + e.length);
    };
    const sandbox: Record<string, unknown> = {
      window: {},
      document: { querySelectorAll: () => [], readyState: 'complete', addEventListener: () => {} },
      console: { warn() {}, log() {}, error() {} },
      Set, Object, Array, String, Error, JSON,
    };
    runInNewContext(cut(FN_START, FN_END), sandbox);
    runInNewContext(cut(B_START, B_END), sandbox);
    const w = sandbox.window as Record<string, unknown>;
    return w.buildIdxSearchParams as (c: Record<string, unknown>) => Record<string, string>;
  }

  it('serializes the exact live provider member, not a Mallan respelling', () => {
    const params = servedSerializer()({ searchTab: 'sale', statuses: ['Pending'] });
    expect(params.status).toBe('Pending');
  });

  it('produces StandardStatus eq \'Pending\' and never the default active clause', () => {
    const params = servedSerializer()({ searchTab: 'sale', statuses: ['Pending'] });
    const qs = new URLSearchParams();
    qs.set('type', params.type);
    qs.set('status', params.status);
    const filter = buildCrmIdxODataFilter(qs);
    expect(filter).toContain("StandardStatus eq 'Pending'");
    expect(filter).toContain("PropertyType eq 'Residential'");
    expect(filter).not.toContain(
      "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')",
    );
  });

  it('rental Pending targets the lease universe', () => {
    const params = servedSerializer()({ searchTab: 'rent', statuses: ['Pending'] });
    const qs = new URLSearchParams();
    qs.set('type', params.type);
    qs.set('status', params.status);
    const filter = buildCrmIdxODataFilter(qs);
    expect(filter).toContain("PropertyType eq 'ResidentialLease'");
    expect(filter).toContain("StandardStatus eq 'Pending'");
  });

  it('Pending stays DISTINCT from ActiveUnderContract', () => {
    // The 2026-08-22 correction. ActiveUnderContract had 0 live rows while
    // Pending was populated, so collapsing them sent brokers to an empty member.
    const filter = buildCrmIdxODataFilter(new URLSearchParams({ status: 'Pending' }));
    expect(filter).toContain("StandardStatus eq 'Pending'");
    expect(filter).not.toContain('ActiveUnderContract');
  });

  it('an unverified sub-status token is still rejected, not quietly accepted', () => {
    // Offer/OfferOut/... have no proven Cotality mapping. If one ever reaches
    // the writer it must fail loudly rather than widen the search.
    expect(() => buildCrmIdxODataFilter(new URLSearchParams({ status: 'OfferOut' }))).toThrow();
  });
});
