/// <reference types="jest" />
/**
 * Phase 2A · CODE-2 — pure two-strike reconciliation guard decision engine.
 *
 * Covers the fixed reconciliation truth table (spec §12.5) + the safety
 * invariants (§12.4): a same-cycle re-observation can NEVER confirm a removal;
 * a regressing PCT/source timestamp can NEVER confirm; an invalid set is never
 * destructive; strike two requires two DISTINCT natural run IDs on the SAME
 * candidate hash.
 */
import { decideReconcile, type ReconcileGuardInput, type PendingCandidateState } from "@/lib/idx/media-reconcile-guard";
import fc from "fast-check";

const H = (hash = "v1:AAA"): ReconcileGuardInput["hashResult"] => ({ ok: true, hash, count: 2 });
const T = (iso: string) => new Date(iso);

const base = (): ReconcileGuardInput => ({
  listingKey: "L1",
  cycleRunId: "cyc-1",
  hashResult: H(),
  previousActiveFeedKeys: ["a", "b"],
  candidateFeedKeys: ["a", "b"],
  pending: null,
  observedPct: T("2026-01-02T00:00:00Z"),
  observedSourceModTs: T("2026-01-02T00:00:00Z"),
  lastCheckpointHash: null,
  now: T("2026-01-03T00:00:00Z"),
});

const pendingFor = (o: Partial<PendingCandidateState> = {}): PendingCandidateState => ({
  candidateSetHash: "v1:AAA",
  candidateMediaCount: 1,
  missingMediaCount: 1,
  photosChangeTimestamp: T("2026-01-02T00:00:00Z"),
  sourceModificationTs: T("2026-01-02T00:00:00Z"),
  firstObservedAt: T("2026-01-02T00:00:00Z"),
  lastObservationRunId: "cyc-0",
  confirmationCount: 1,
  ...o,
});

describe("decideReconcile — truth table (§12.5)", () => {
  it("no implicit disappearance → reconcile_normal, checkpoint advances", () => {
    const d = decideReconcile(base());
    expect(d.action).toBe("reconcile_normal");
    expect(d.tombstoneVanishedFeed).toBe(true);
    expect(d.advanceCheckpoint).toBe(true);
    expect(d.checkpointHash).toBe("v1:AAA");
  });

  it("candidate == last checkpoint & no disappearance → no_op (no cache work)", () => {
    const d = decideReconcile({ ...base(), lastCheckpointHash: "v1:AAA" });
    expect(d.action).toBe("no_op");
    expect(d.tombstoneVanishedFeed).toBe(false);
    expect(d.invalidateCachesAfterCommit).toBe(false);
    expect(d.advanceCheckpoint).toBe(false);
  });

  it("first implicit shrink → record_pending, NO tombstone/summary/checkpoint", () => {
    const d = decideReconcile({ ...base(), candidateFeedKeys: ["a"], hashResult: H("v1:SHRINK") });
    expect(d.action).toBe("record_pending");
    expect(d.tombstoneVanishedFeed).toBe(false);
    expect(d.updateSummary).toBe(false);
    expect(d.advanceCheckpoint).toBe(false);
    expect(d.invalidateCachesAfterCommit).toBe(false);
    expect(d.pendingWrite?.confirmationCount).toBe(1);
    expect(d.pendingWrite?.candidateSetHash).toBe("v1:SHRINK");
    expect(d.pendingWrite?.missingMediaCount).toBe(1);
  });

  it("complete-empty first strike → record_pending (preserve hero/count)", () => {
    const d = decideReconcile({ ...base(), candidateFeedKeys: [], hashResult: H("v1:empty") });
    expect(d.action).toBe("record_pending");
    expect(d.tombstoneVanishedFeed).toBe(false);
    expect(d.updateSummary).toBe(false);
  });

  it("same candidate, SAME cycle id → not confirmed (stays pending)", () => {
    const d = decideReconcile({
      ...base(),
      candidateFeedKeys: ["a"],
      hashResult: H("v1:AAA"),
      pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: "cyc-1" }),
      cycleRunId: "cyc-1",
    });
    expect(d.action).toBe("record_pending");
    expect(d.tombstoneVanishedFeed).toBe(false);
  });

  it("same candidate, DIFFERENT cycle, non-regressing → confirm_removal", () => {
    const d = decideReconcile({
      ...base(),
      candidateFeedKeys: ["a"],
      hashResult: H("v1:AAA"),
      pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: "cyc-0" }),
      cycleRunId: "cyc-1",
    });
    expect(d.action).toBe("confirm_removal");
    expect(d.tombstoneVanishedFeed).toBe(true);
    expect(d.updateSummary).toBe(true);
    expect(d.advanceCheckpoint).toBe(true);
  });

  it("second candidate DIFFERS from strike-1 → replace pending, not confirmed", () => {
    const d = decideReconcile({
      ...base(),
      candidateFeedKeys: ["a"],
      hashResult: H("v1:DIFFERENT"),
      pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: "cyc-0" }),
      cycleRunId: "cyc-1",
    });
    expect(d.action).toBe("record_pending");
    expect(d.pendingWrite?.candidateSetHash).toBe("v1:DIFFERENT");
    expect(d.pendingWrite?.confirmationCount).toBe(1);
  });

  it("regressing PCT on 2nd obs → not confirmed", () => {
    const d = decideReconcile({
      ...base(),
      candidateFeedKeys: ["a"],
      hashResult: H("v1:AAA"),
      observedPct: T("2026-01-01T00:00:00Z"), // earlier than pending's 2026-01-02
      pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: "cyc-0", photosChangeTimestamp: T("2026-01-02T00:00:00Z") }),
      cycleRunId: "cyc-1",
    });
    expect(d.action).toBe("record_pending");
    expect(d.tombstoneVanishedFeed).toBe(false);
  });

  it("regressing source ts on 2nd obs → not confirmed", () => {
    const d = decideReconcile({
      ...base(),
      candidateFeedKeys: ["a"],
      hashResult: H("v1:AAA"),
      observedSourceModTs: T("2026-01-01T00:00:00Z"),
      pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: "cyc-0", sourceModificationTs: T("2026-01-02T00:00:00Z") }),
      cycleRunId: "cyc-1",
    });
    expect(d.action).toBe("record_pending");
  });

  it("invalid hash → unsafe_retry, no destructive action, no checkpoint", () => {
    const d = decideReconcile({ ...base(), hashResult: { ok: false, reasons: ["duplicate_media_key"] } });
    expect(d.action).toBe("unsafe_retry");
    expect(d.tombstoneVanishedFeed).toBe(false);
    expect(d.advanceCheckpoint).toBe(false);
    expect(d.updateSummary).toBe(false);
  });
});

describe("decideReconcile — safety properties (fast-check)", () => {
  const isoArb = fc.integer({ min: Date.parse("2020-01-01"), max: Date.parse("2030-01-01") }).map((ms) => new Date(ms));

  it("a SAME-cycle re-observation NEVER confirms a removal", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), isoArb, isoArb, (cyc, pct, src) => {
        const d = decideReconcile({
          ...base(),
          candidateFeedKeys: ["a"],
          hashResult: H("v1:AAA"),
          observedPct: pct,
          observedSourceModTs: src,
          pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: cyc }),
          cycleRunId: cyc, // SAME as pending's last observation
        });
        return d.action !== "confirm_removal" && d.tombstoneVanishedFeed === false;
      }),
      { numRuns: 300 },
    );
  });

  it("a regressing PCT can NEVER confirm (different cycle, same candidate)", () => {
    fc.assert(
      fc.property(isoArb, isoArb, (pendingPct, obsPct) => {
        fc.pre(obsPct.getTime() < pendingPct.getTime()); // strictly regressing
        const d = decideReconcile({
          ...base(),
          candidateFeedKeys: ["a"],
          hashResult: H("v1:AAA"),
          observedPct: obsPct,
          pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: "cyc-0", photosChangeTimestamp: pendingPct }),
          cycleRunId: "cyc-1",
        });
        return d.action !== "confirm_removal";
      }),
      { numRuns: 300 },
    );
  });

  it("an invalid set is NEVER destructive regardless of pending/cycle", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.boolean(), (cyc, havePending) => {
        const d = decideReconcile({
          ...base(),
          candidateFeedKeys: [],
          hashResult: { ok: false, reasons: ["missing_media_key"] },
          pending: havePending ? pendingFor({ lastObservationRunId: "other" }) : null,
          cycleRunId: cyc,
        });
        return d.action === "unsafe_retry" && d.tombstoneVanishedFeed === false && d.advanceCheckpoint === false;
      }),
      { numRuns: 200 },
    );
  });

  it("confirmation REQUIRES two distinct run IDs on the same candidate", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (c1, c2) => {
        const d = decideReconcile({
          ...base(),
          candidateFeedKeys: ["a"],
          hashResult: H("v1:AAA"),
          pending: pendingFor({ candidateSetHash: "v1:AAA", lastObservationRunId: c1 }),
          cycleRunId: c2,
        });
        // confirm only when the two run IDs differ; otherwise never
        if (c1 === c2) return d.action !== "confirm_removal";
        return d.action === "confirm_removal"; // same candidate + non-regressing base ts
      }),
      { numRuns: 300 },
    );
  });
});
