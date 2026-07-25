/// <reference types="jest" />
/**
 * Phase-1 write-amplification forensic — GENUINE accumulation proof.
 *
 * The route-level media-sync test can pass with all-zero counters (0 === 0+…),
 * so it does NOT prove multiple nonzero per-listing results sum correctly. This
 * tests the pure accumulator `runMediaSync` actually uses, with distinct nonzero
 * inputs, so a broken `+=` (e.g. always-zero, or crossed counters) fails loudly.
 * Covers the Codex-P2 split: signature-rotation vs identity-change accumulate
 * independently.
 */
import {
  newMediaWriteCauseTotals,
  accumulateMediaWriteCauses,
} from "@/lib/idx/media-sync";

describe("accumulateMediaWriteCauses — nonzero multi-result accumulation", () => {
  it("sums two nonzero per-listing results correctly (split counters)", () => {
    const acc = newMediaWriteCauseTotals();
    accumulateMediaWriteCauses(acc, {
      deliveryUrlRefreshed: 2,
      suppressedUrlSignatureRotation: 3,
      suppressedUrlIdentityChanged: 8,
      writeFailures: 1,
    });
    accumulateMediaWriteCauses(acc, {
      deliveryUrlRefreshed: 5,
      suppressedUrlSignatureRotation: 7,
      suppressedUrlIdentityChanged: 9,
      writeFailures: 2,
    });
    expect(acc).toEqual({
      delivery_url_refreshed: 7,
      suppressed_url_signature_rotation: 10,
      suppressed_url_identity_changed: 17,
      write_failures: 3,
    });
  });

  it("starts at zero and is order-independent", () => {
    expect(newMediaWriteCauseTotals()).toEqual({
      delivery_url_refreshed: 0,
      suppressed_url_signature_rotation: 0,
      suppressed_url_identity_changed: 0,
      write_failures: 0,
    });
    const r1 = {
      deliveryUrlRefreshed: 4,
      suppressedUrlSignatureRotation: 0,
      suppressedUrlIdentityChanged: 2,
      writeFailures: 6,
    };
    const r2 = {
      deliveryUrlRefreshed: 0,
      suppressedUrlSignatureRotation: 9,
      suppressedUrlIdentityChanged: 0,
      writeFailures: 0,
    };
    const a = newMediaWriteCauseTotals();
    const b = newMediaWriteCauseTotals();
    accumulateMediaWriteCauses(a, r1);
    accumulateMediaWriteCauses(a, r2);
    accumulateMediaWriteCauses(b, r2);
    accumulateMediaWriteCauses(b, r1);
    expect(a).toEqual(b);
    expect(a).toEqual({
      delivery_url_refreshed: 4,
      suppressed_url_signature_rotation: 9,
      suppressed_url_identity_changed: 2,
      write_failures: 6,
    });
  });

  it("keeps signature-rotation and identity-change counters independent", () => {
    const acc = newMediaWriteCauseTotals();
    for (const r of [
      { deliveryUrlRefreshed: 0, suppressedUrlSignatureRotation: 1, suppressedUrlIdentityChanged: 0, writeFailures: 0 },
      { deliveryUrlRefreshed: 0, suppressedUrlSignatureRotation: 0, suppressedUrlIdentityChanged: 1, writeFailures: 0 },
      { deliveryUrlRefreshed: 0, suppressedUrlSignatureRotation: 2, suppressedUrlIdentityChanged: 3, writeFailures: 0 },
    ]) {
      accumulateMediaWriteCauses(acc, r);
    }
    expect(acc.suppressed_url_signature_rotation).toBe(3);
    expect(acc.suppressed_url_identity_changed).toBe(4);
  });
});
