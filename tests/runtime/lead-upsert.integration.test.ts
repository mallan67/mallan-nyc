/// <reference types="jest" />
/**
 * lib/leads/lead-upsert — REAL PostgreSQL integration test.
 *
 * Why this exists: the sibling `lead-upsert.test.ts` only inspects the SQL
 * *string* Prisma would send (Prisma is mocked). A string-only test is
 * structurally blind to "does this table actually exist?", which is exactly
 * how a statement targeting the wrong physical table name shipped and silently
 * dropped fresh contact leads. This test executes the real
 * `atomicMergeUpsertLead` against a real, migrated Postgres and asserts the
 * committed row.
 *
 * Safety + gating: runs ONLY when `CONTACT_DB_INTEGRATION_URL` is set, and never
 * against the default `DATABASE_URL`. CI configures CONTACT_DB_INTEGRATION_URL
 * to use the ephemeral PostgreSQL service. Local runs must use a throwaway
 * database with the Prisma schema applied (`prisma db push`).
 *
 * Structure note: the guard is a top-level `if (!url) { describe.skip } else {
 * describe }` — NOT `describe.skip(...)` with a constructing callback. Jest
 * evaluates a `describe.skip` callback body at collection time, so constructing
 * `new PrismaClient({ url: undefined })` inside a skipped block would still throw
 * and fail the whole suite. Keeping the client construction inside the `else`
 * branch means it is only ever reached when the URL is present.
 */

const integrationUrl = process.env.CONTACT_DB_INTEGRATION_URL;

if (!integrationUrl) {
  describe.skip("atomicMergeUpsertLead — real Postgres round-trip", () => {
    it("requires CONTACT_DB_INTEGRATION_URL (set in CI / local harness)", () => {
      // Intentionally empty — the describe is skipped; this placeholder keeps
      // the file from being an empty test suite when the URL is absent.
    });
  });
} else {
  describe("atomicMergeUpsertLead — real Postgres round-trip", () => {
    const { PrismaClient } = require("@prisma/client");
    const { atomicMergeUpsertLead } = require("@/lib/leads/lead-upsert");

    const prisma = new PrismaClient({
      datasources: { db: { url: integrationUrl } },
    });
    // Unique per run so parallel / rerun invocations never collide.
    const email = `contact-capture-itest+${Date.now()}@example.test`;

    afterAll(async () => {
      await prisma.$executeRawUnsafe(
        `DELETE FROM leads WHERE email = $1`,
        email
      );
      await prisma.$disconnect();
    });

    it("creates exactly one row, merges roles, guards phone, updates consent (criteria 1–5)", async () => {
      // (1) A brand-new email creates one row.
      const first = await atomicMergeUpsertLead(prisma, {
        email,
        firstName: "Jane",
        lastName: "Doe",
        phone: "555-1000",
        incomingRoles: ["buyer"],
        consentCapturedAt: new Date("2026-07-14T00:00:00Z"),
      });
      expect(first.roles.sort()).toEqual(["buyer"]);

      const afterFirst = await prisma.lead.findUnique({ where: { email } });
      expect(afterFirst).not.toBeNull();
      expect(afterFirst.phone).toBe("555-1000");

      // (2) repeat does NOT duplicate; (3) existing role preserved + new added;
      // (4) blank phone does not erase the stored phone; (5) consent updates.
      const second = await atomicMergeUpsertLead(prisma, {
        email,
        firstName: "Jane",
        lastName: "Doe",
        phone: "", // blank — must NOT overwrite the existing 555-1000
        incomingRoles: ["seller"],
        consentCapturedAt: new Date("2026-07-15T00:00:00Z"),
      });
      expect(second.id).toBe(first.id); // same row, no duplicate
      expect(second.roles.sort()).toEqual(["buyer", "seller"]); // preserved + added

      const rows = await prisma.lead.findMany({ where: { email } });
      expect(rows).toHaveLength(1); // (2) still exactly one row
      expect(rows[0].phone).toBe("555-1000"); // (4) blank did not erase
      expect(rows[0].consent_captured_at?.toISOString()).toBe(
        "2026-07-15T00:00:00.000Z"
      ); // (5) consent updated

      // (6) full-route effects (AuditEvent + Inquiry + notification + HTTP 200)
      // are NOT covered here — this test proves only the upsert. Criterion 6 is
      // proven by the production canary after deploy.
    });
  });
}
