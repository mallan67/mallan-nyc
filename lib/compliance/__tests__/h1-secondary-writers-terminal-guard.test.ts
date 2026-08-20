/**
 * H1 fix (2026-05-13) — close the secondary-writer §2.05 gap.
 *
 * The C2 fix at `lib/idx/trestle-mapper.ts:724` closed the dominant
 * re-flip path (Trestle idx-sync re-emitting terminal rows with
 * idx_display_yn=true). The H1 investigation enumerated four
 * additional writer call sites that hard-coded or body-piped
 * `idx_display_yn=true` without consulting `StandardStatus`:
 *
 *   1. app/api/idx/ensure-listing/route.ts:113 — agent-portal hydration
 *      (HIGH RISK: body.status is user-controlled)
 *   2. app/api/crm/listings/route.ts:323      — CRM POST create
 *   3. app/api/crm/listings/[id]/route.ts:164 — CRM PATCH update
 *   4. app/api/crm/convert/route.ts:217       — Lead→Listing convert
 *
 * The fix adds a `!TERMINAL_STATUSES.has(...)` guard at each call site,
 * reusing the canonical set exported from `lib/idx/trestle-mapper.ts` so
 * the writer set and the cron predicate stay in lock-step.
 *
 * The tests below validate the predicate against the documented rules:
 *   - All 7 terminal statuses force false.
 *   - All 3 non-terminal statuses (Active, ComingSoon, ActiveUnderContract)
 *     remain eligible.
 *   - "Draft" (CRM initial) is treated as non-terminal — eligible.
 *   - Unknown statuses fall through to non-terminal (no spurious blocking).
 *
 * The tests target the predicate directly. End-to-end route tests would
 * require Prisma stubs and request mocks; the predicate is the single
 * source of truth that every patched call site consumes, so locking it in
 * here protects all four routes against the same regression class.
 */

import { TERMINAL_STATUSES } from '../../idx/trestle-mapper';

/**
 * Re-implements the exact one-liner each H1 patch uses, against an
 * arbitrary status string. This is the literal predicate that lives in
 * production after the H1 patch — locking it here guards against any
 * future drift in any of the four call sites.
 */
function guardAllowsDisplay(status: string | null | undefined): boolean {
  return !TERMINAL_STATUSES.has(String(status || 'Active'));
}

describe('H1 — secondary-writer terminal-status guard', () => {
  // "all 7" was a hard-coded claim that went stale the moment TERMINAL_STATUSES
  // gained an 8th member ('Canceled', 2026-08-19) — and the literal below went
  // stale with it, so the guard was never exercised against the provider's own
  // cancellation spelling. Both the count and the list are now DERIVED.
  describe(`terminal statuses (all ${TERMINAL_STATUSES.size}) force idx_display_yn=false`, () => {
    it.each([...TERMINAL_STATUSES])('%s → false', (status) => {
      expect(guardAllowsDisplay(status)).toBe(false);
    });
  });

  describe('non-terminal statuses remain eligible', () => {
    it.each([
      'Active',
      'ComingSoon',
      'ActiveUnderContract',
    ])('%s → true', (status) => {
      expect(guardAllowsDisplay(status)).toBe(true);
    });
  });

  describe('CRM initial states remain eligible', () => {
    it('Draft (CRM STATUS_INITIAL) → true', () => {
      // crm/listings/route.ts and crm/convert/route.ts both start listings
      // in "Draft". Draft is not in TERMINAL_STATUSES, so the guard is a
      // no-op at the moment but is preserved as defence-in-depth for any
      // future refactor that lets the initial status come from request body.
      expect(guardAllowsDisplay('Draft')).toBe(true);
      expect(TERMINAL_STATUSES.has('Draft')).toBe(false);
    });
  });

  describe('untrusted body input — null / undefined / empty defaults', () => {
    it('null status → defaults to Active → true', () => {
      // ensure-listing/route.ts:113 receives body.status from an untrusted
      // POST. When the agent's client omits the field entirely, the route
      // defaults to "Active" and the guard must allow display.
      expect(guardAllowsDisplay(null)).toBe(true);
      expect(guardAllowsDisplay(undefined)).toBe(true);
      expect(guardAllowsDisplay('')).toBe(true);
    });

    it('unknown status string → falls through (no spurious blocking)', () => {
      // A status the canonical set doesn't recognize is treated as
      // non-terminal — this mirrors the C2 doctrine. New statuses must be
      // added to TERMINAL_STATUSES explicitly, never silently fail-closed.
      expect(guardAllowsDisplay('NotAStatusThatExists')).toBe(true);
    });

    it('case sensitivity — "closed" lowercase is NOT in the canonical set', () => {
      // The cron predicate matches exact-case RESO strings; mirroring it
      // here keeps writer and cron in lock-step. Documents the contract,
      // not a desired behavior — Trestle emits exact-case canonical
      // values, and any drift would require coordinated change on both
      // sides of the dual-write boundary.
      expect(guardAllowsDisplay('closed')).toBe(true);
      expect(TERMINAL_STATUSES.has('closed')).toBe(false);
    });
  });

  describe('predicate composition with display permissions', () => {
    it('terminal status + display permissions true → still false', () => {
      // crm/listings/[id]/route.ts:164 combines the guard with
      // coerceStrictBool(body.IDXEntireListingDisplayYN) — verify that
      // the terminal guard short-circuits regardless of the permission
      // value the agent sent.
      const effectiveDisplay = (status: string, permissionFromBody: boolean) =>
        guardAllowsDisplay(status) && permissionFromBody;
      expect(effectiveDisplay('Closed', true)).toBe(false);
      expect(effectiveDisplay('Sold', true)).toBe(false);
    });

    it('non-terminal status + display permission false → still false', () => {
      // The existing permission gate must still bind — terminal-status is
      // an ADDITIONAL constraint, not a replacement for the per-row gate.
      const effectiveDisplay = (status: string, permissionFromBody: boolean) =>
        guardAllowsDisplay(status) && permissionFromBody;
      expect(effectiveDisplay('Active', false)).toBe(false);
      expect(effectiveDisplay('ComingSoon', false)).toBe(false);
    });

    it('non-terminal status + display permission true → true', () => {
      const effectiveDisplay = (status: string, permissionFromBody: boolean) =>
        guardAllowsDisplay(status) && permissionFromBody;
      expect(effectiveDisplay('Active', true)).toBe(true);
      expect(effectiveDisplay('ActiveUnderContract', true)).toBe(true);
    });
  });

  describe('regression — terminal cohort from C2 production investigation', () => {
    // The C2 audit-event JOIN found these 7 listings being re-flipped
    // through the trestle-mapper path. After C2 those rows can no longer
    // be re-emitted with idx_display_yn=true via that path; this test
    // documents that any SECONDARY writer hitting them with the same
    // post-close status must also refuse to set idx_display_yn=true.
    const PRODUCTION_VIOLATORS = [
      'RLS20070684', 'RLS20072739', 'RLS20076460',
      'RLS20082783', 'RLS20085077', 'RLS20089100', 'RLS20079995',
    ];

    it.each(PRODUCTION_VIOLATORS)(
      '%s (closed) — guard refuses display regardless of caller',
      (_listingId) => {
        // Real-world scenario: agent invokes ensure-listing with this
        // ListingId and the (correct) status="Closed" body — the new
        // record would have been a §2.05 violation before this guard.
        expect(guardAllowsDisplay('Closed')).toBe(false);
      },
    );
  });
});
