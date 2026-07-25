/// <reference types="jest" />
/**
 * Phase-1 write-amplification forensic — GENUINE accumulation proof.
 *
 * The route-level media-sync test can pass with all-zero counters (0 === 0+…),
 * so it does NOT prove multiple nonzero per-listing results sum correctly. This
 * tests the pure accumulator `runMediaSync` actually uses, with distinct nonzero
 * inputs, so a broken `+=` (e.g. always-zero) fails loudly.
 */
import {
  newMediaWriteCauseTotals,
  accumulateMediaWriteCauses,
} from "@/lib/idx/media-sync";

describe("accumulateMediaWriteCauses — nonzero multi-result accumulation", () => {
  it("sums two nonzero per-listing results correctly (Maya's case)", () => {
    const acc = newMediaWriteCauseTotals();
    accumulateMediaWriteCauses(acc, {
      deliveryUrlRefreshed: 2,
      suppressedUrlRotationOnly: 3,
      writeFailures: 1,
    });
    accumulateMediaWriteCauses(acc, {
      deliveryUrlRefreshed: 5,
      suppressedUrlRotationOnly: 7,
      writeFailures: 2,
    });
    expect(acc).toEqual({
      delivery_url_refreshed: 7,
      suppressed_url_rotation_only: 10,
      write_failures: 3,
    });
  });

  it("starts at zero and is order-independent", () => {
    expect(newMediaWriteCauseTotals()).toEqual({
      delivery_url_refreshed: 0,
      suppressed_url_rotation_only: 0,
      write_failures: 0,
    });
    const r1 = { deliveryUrlRefreshed: 4, suppressedUrlRotationOnly: 0, writeFailures: 6 };
    const r2 = { deliveryUrlRefreshed: 0, suppressedUrlRotationOnly: 9, writeFailures: 0 };
    const a = newMediaWriteCauseTotals();
    const b = newMediaWriteCauseTotals();
    accumulateMediaWriteCauses(a, r1);
    accumulateMediaWriteCauses(a, r2);
    accumulateMediaWriteCauses(b, r2);
    accumulateMediaWriteCauses(b, r1);
    expect(a).toEqual(b);
    expect(a).toEqual({
      delivery_url_refreshed: 4,
      suppressed_url_rotation_only: 9,
      write_failures: 6,
    });
  });

  it("accumulates across many results", () => {
    const acc = newMediaWriteCauseTotals();
    for (const r of [
      { deliveryUrlRefreshed: 1, suppressedUrlRotationOnly: 2, writeFailures: 0 },
      { deliveryUrlRefreshed: 3, suppressedUrlRotationOnly: 0, writeFailures: 4 },
      { deliveryUrlRefreshed: 0, suppressedUrlRotationOnly: 5, writeFailures: 6 },
    ]) {
      accumulateMediaWriteCauses(acc, r);
    }
    expect(acc.delivery_url_refreshed).toBe(4);
    expect(acc.suppressed_url_rotation_only).toBe(7);
    expect(acc.write_failures).toBe(10);
  });
});
