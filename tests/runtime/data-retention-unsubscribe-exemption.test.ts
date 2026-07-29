/// <reference types="jest" />
/**
 * Data-retention exemption for the durable email-suppression ledger (PR #514).
 *
 * The 2-year AuditEvent purge (REBNY RLS retention floor) must NOT delete
 * `email_unsubscribed` rows. Those rows are the DURABLE commercial-email opt-out
 * record (lib/email/suppression.ts) — the only suppression source for NON-Lead
 * recipients (no Lead.last_unsubscribe_at). Purging them after 2 years would
 * silently make an opted-out recipient emailable again — a CAN-SPAM violation.
 *
 * Proven structurally: the `auditEvent.deleteMany` where-clause carries BOTH the
 * 2-year `created_at < cutoff` boundary AND `action: { not: "email_unsubscribed" }`,
 * so an old opt-out row survives while ordinary old audit rows are purged.
 */

import { makeRequest } from "./helpers";

// Captured where-clause from the 2-year auditEvent.deleteMany purge. Referenced
// only inside the jest.fn closure, so it is not an out-of-scope factory reference.
const auditDeleteWheres: Array<Record<string, unknown>> = [];

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    mfaSession: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    auditEvent: {
      deleteMany: jest.fn(async (args: { where?: Record<string, unknown> }) => {
        if (args?.where) auditDeleteWheres.push(args.where);
        return { count: 0 };
      }),
      createMany: jest.fn(async () => ({})),
      create: jest.fn(async () => ({})),
    },
    listing: {
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
      update: jest.fn(async () => ({})),
    },
    listingsArchive: { upsert: jest.fn(async () => ({})) },
    syncError: { create: jest.fn(async () => ({})) },
    lead: { updateMany: jest.fn(async () => ({ count: 0 })) },
    notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    geocodeCache: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (arg: unknown) => (Array.isArray(arg) ? [] : null)),
  },
}));

jest.mock("@/lib/search/listing-search-projection", () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));

import { GET } from "@/app/api/cron/data-retention/route";

function runCron() {
  return GET(
    makeRequest({
      method: "GET",
      url: "http://localhost/api/cron/data-retention",
      headers: { authorization: "Bearer test-secret" },
    }),
  );
}

/** The 2-year purge is the deleteMany whose where carries a `created_at.lt` Date. */
function purgeWhere(): Record<string, unknown> {
  const purge = auditDeleteWheres.find(
    (w) => (w.created_at as Record<string, unknown> | undefined)?.lt instanceof Date,
  );
  expect(purge).toBeDefined();
  return purge as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  auditDeleteWheres.length = 0;
  process.env.CRON_SECRET = "test-secret";
  delete process.env.ARCHIVE_ENABLED; // exemption is independent of archive gating
});

afterAll(() => {
  delete process.env.ARCHIVE_ENABLED;
});

describe("data-retention — email_unsubscribed suppression ledger is exempt from the 2-year purge", () => {
  it("purges ordinary audit rows older than 2 years (created_at < cutoff)", async () => {
    await runCron();
    const where = purgeWhere();
    expect((where.created_at as Record<string, unknown>).lt).toBeInstanceOf(Date);
    // Cutoff is ~2 years back, not "now".
    const cutoff = (where.created_at as { lt: Date }).lt;
    expect(cutoff.getFullYear()).toBeLessThanOrEqual(new Date().getFullYear() - 2);
  });

  it("EXCLUDES email_unsubscribed rows so old opt-outs survive (action != email_unsubscribed)", async () => {
    await runCron();
    const where = purgeWhere();
    expect(where.action).toEqual({ not: "email_unsubscribed" });
  });

  it("regression guard: the durable suppression action is never deleted by ANY auditEvent.deleteMany", async () => {
    await runCron();
    // No deleteMany may match email_unsubscribed rows. Any capture carrying a
    // date cutoff must PROVABLY exclude the suppression action, in one of only
    // two safe forms:
    //
    //   (a) explicit exclusion — `action: { not: "email_unsubscribed" }`
    //       (the 2-year compliance purge), or
    //   (b) explicit allowlist — `action: { in: [...] }` whose members are
    //       enumerated and demonstrably do not include it (the 30-day
    //       system-diagnostic purge).
    //
    // Anything else fails: no action filter, a pattern match, an empty
    // allowlist, or an allowlist that contains the suppression action. Form (b)
    // is checked by READING the list, so a careless edit that adds the action
    // to an allowlist is caught here rather than silently making an opted-out
    // recipient emailable again (CAN-SPAM).
    for (const where of auditDeleteWheres) {
      const isDatedPurge =
        (where.created_at as Record<string, unknown> | undefined)?.lt instanceof Date;
      if (!isDatedPurge) continue;

      const action = where.action as Record<string, unknown> | undefined;
      const excludesExplicitly = action?.not === "email_unsubscribed";
      const allowlist = action?.in;
      const isSafeAllowlist =
        Array.isArray(allowlist) &&
        allowlist.length > 0 &&
        !allowlist.includes("email_unsubscribed");

      expect(excludesExplicitly || isSafeAllowlist).toBe(true);
    }
  });
});
