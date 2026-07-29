/**
 * PR: perf/neon-remove-query-and-write-waste — Part 3.
 *
 * THE WASTE THIS PREVENTS
 * -----------------------
 * `upsertListingMedia` suppresses a write for a materially-unchanged row ONLY
 * when the row is already DELIVERED to R2 (`mediaRowDelivered`). The stated
 * reason for the exception is that an UN-mirrored row still needs its fresh
 * rotating signed `media_url_original`, because the R2 backlog path reuses that
 * stored URL to fetch the binary.
 *
 * That reasoning holds only while an R2 selector can still pick the row up.
 * Post-#584 the two selectors are, on their attempts predicate:
 *
 *   ordinary backlog  `r2_attempts IS NULL OR r2_attempts < 8`
 *   exact-8 recovery  `r2_attempts = 8`
 *
 * So a row ABOVE the retry-exhaustion threshold — the #534 policy-parked
 * sentinel (9) and the frozen legacy overflow (>9) — is unreachable by BOTH.
 * Its refreshed URL has no consumer, so the write was a pure no-op repeated
 * every cycle, forever. In production that population is ~8,595 rows
 * (8,515 parked + 80 legacy) out of ~323k.
 *
 * BOUNDARY THAT MUST NOT MOVE: exactly 8 is recovery-eligible and MUST keep
 * refreshing. NULL must keep refreshing (it matches the ordinary selector).
 *
 * Suppression remains conditional on MATERIAL equality — a parked row whose
 * content actually changed still writes.
 *
 * No live R2, Trestle or database access.
 */

import { mediaRowMirrorUnreachable, R2_RETRY_EXHAUSTED_THRESHOLD, R2_POLICY_PARKED_ATTEMPTS } from "../media-sync";

describe("mediaRowMirrorUnreachable — the selector-reachability predicate", () => {
  it("treats the #534 policy-parked sentinel (9) as unreachable", () => {
    expect(mediaRowMirrorUnreachable({ r2_attempts: R2_POLICY_PARKED_ATTEMPTS })).toBe(true);
  });

  it("treats the frozen legacy overflow (>9) as unreachable", () => {
    for (const stored of [10, 11, 112]) {
      expect(mediaRowMirrorUnreachable({ r2_attempts: stored })).toBe(true);
    }
  });

  it("keeps EXACTLY the retry-exhaustion threshold (8) REACHABLE — recovery owns it", () => {
    // The exact-8 recovery selector still picks this row up, so its fresh
    // signed URL is genuinely needed. Suppressing it here would starve
    // recovery of a fetchable URL.
    expect(mediaRowMirrorUnreachable({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD })).toBe(false);
  });

  it("keeps ordinary counts (NULL and 0..7) reachable", () => {
    expect(mediaRowMirrorUnreachable({ r2_attempts: null })).toBe(false);
    for (const stored of [0, 1, 5, 7]) {
      expect(mediaRowMirrorUnreachable({ r2_attempts: stored })).toBe(false);
    }
  });

  it("FAILS SAFE when the counter was not projected — absent ⇒ reachable", () => {
    // A caller that does not select r2_attempts keeps the pre-existing refresh
    // behaviour and can never lose a URL refresh it needed.
    expect(mediaRowMirrorUnreachable({})).toBe(false);
    expect(mediaRowMirrorUnreachable({ r2_attempts: undefined })).toBe(false);
  });

  it("is exactly the complement of the union of both selector attempts predicates", () => {
    // Non-vacuity: assert the boundary against the selectors' own constants
    // rather than against a hard-coded 9, so a threshold change cannot leave
    // this predicate silently misaligned.
    expect(R2_POLICY_PARKED_ATTEMPTS).toBeGreaterThan(R2_RETRY_EXHAUSTED_THRESHOLD);
    for (let n = 0; n <= R2_RETRY_EXHAUSTED_THRESHOLD; n++) {
      const ordinaryEligible = n < R2_RETRY_EXHAUSTED_THRESHOLD;
      const recoveryEligible = n === R2_RETRY_EXHAUSTED_THRESHOLD;
      expect(mediaRowMirrorUnreachable({ r2_attempts: n })).toBe(
        !(ordinaryEligible || recoveryEligible),
      );
    }
    expect(mediaRowMirrorUnreachable({ r2_attempts: R2_RETRY_EXHAUSTED_THRESHOLD + 1 })).toBe(true);
  });
});
