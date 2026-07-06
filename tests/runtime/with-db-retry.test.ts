/// <reference types="jest" />
/**
 * Characterization tests for lib/db/with-retry.ts (the EXISTING helper,
 * added in PR #476, previously untested).
 *
 * These lock in the shipped behavior so the gap-fill wiring (cma / rsvp /
 * createInquiry) rests on a proven contract:
 *   - retries TRANSIENT connection codes {P1001, P1002, P1008, P1017}
 *     and PrismaClientInitializationError, with bounded attempts;
 *   - does NOT retry deterministic errors (e.g. P2002 unique violation);
 *   - rethrows the last error once attempts are exhausted.
 *
 * NOTE: this is a characterization suite of already-shipped code, so it is
 * green on first run by design (documented for the reviewer). delayMs:0
 * keeps the retry loop instant.
 */
import { Prisma } from "@prisma/client";
import { withDbRetry } from "@/lib/db/with-retry";

const FAST = { delayMs: 0 } as const;

/** A transient Prisma error carries a string `.code` the helper inspects. */
function codeErr(code: string): Error {
  return Object.assign(new Error(`prisma ${code}`), { code });
}
function initErr(): Prisma.PrismaClientInitializationError {
  return new Prisma.PrismaClientInitializationError(
    "Can't reach database server",
    "6.17.1",
  );
}

describe("withDbRetry (existing helper — characterization)", () => {
  test("success path calls fn exactly once and returns the value", async () => {
    let calls = 0;
    const out = await withDbRetry(async () => {
      calls++;
      return "ok";
    }, FAST);
    expect(out).toBe("ok");
    expect(calls).toBe(1);
  });

  test.each(["P1001", "P1002", "P1008", "P1017"])(
    "transient %s once then success → retries and succeeds",
    async (code) => {
      let calls = 0;
      const out = await withDbRetry(async () => {
        calls++;
        if (calls < 2) throw codeErr(code);
        return "recovered";
      }, FAST);
      expect(out).toBe("recovered");
      expect(calls).toBe(2);
    },
  );

  test("PrismaClientInitializationError once then success → retries", async () => {
    let calls = 0;
    const out = await withDbRetry(async () => {
      calls++;
      if (calls < 2) throw initErr();
      return "recovered";
    }, FAST);
    expect(out).toBe("recovered");
    expect(calls).toBe(2);
  });

  test("transient forever → stops after default max attempts (1 + 2 retries) and rethrows", async () => {
    let calls = 0;
    const original = codeErr("P1001");
    await expect(
      withDbRetry(async () => {
        calls++;
        throw original;
      }, FAST),
    ).rejects.toBe(original);
    expect(calls).toBe(3);
  });

  test("respects opts.retries", async () => {
    let calls = 0;
    await expect(
      withDbRetry(
        async () => {
          calls++;
          throw codeErr("P1001");
        },
        { delayMs: 0, retries: 1 },
      ),
    ).rejects.toBeDefined();
    expect(calls).toBe(2); // 1 initial + 1 retry
  });

  test("deterministic error (P2002 unique) → NOT retried, thrown on first attempt", async () => {
    let calls = 0;
    await expect(
      withDbRetry(async () => {
        calls++;
        throw codeErr("P2002");
      }, FAST),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(calls).toBe(1);
  });

  test("error with no code → NOT retried", async () => {
    let calls = 0;
    await expect(
      withDbRetry(async () => {
        calls++;
        throw new Error("boom");
      }, FAST),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });
});
