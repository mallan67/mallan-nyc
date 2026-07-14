/// <reference types="jest" />
/**
 * lib/leads/lead-upsert — REAL PostgreSQL integration test.
 *
 * Why this exists: the sibling `lead-upsert.test.ts` only inspects the SQL
 * *string* Prisma would send (Prisma is mocked). That mocked test could not
 * catch the 2026-06-28 production outage — the statement said `INSERT INTO
 * "Lead"` while Prisma maps the model to the physical table `leads`, so every
 * fresh contact submission threw `42P01 undefined_table` and silently dropped
 * the lead for 16 days. A string-only test is structurally blind to "does this
 * table actually exist?". This test executes the real `atomicMergeUpsertLead`
 * against a real, migrated Postgres and asserts the committed row.
 *
 * Safety: gated behind `CONTACT_DB_INTEGRATION_URL`. It NEVER runs against the
 * default `DATABASE_URL` and self-skips when the dedicated var is absent, so it
 * cannot touch production. Point it at a throwaway/CI Postgres that has the
 * Prisma schema applied (`prisma db push`). A ready-to-run local harness is in
 * `scripts/verify-contact-capture.sql` (spins up a disposable instance).
 */

const INTEGRATION_URL = process.env.CONTACT_DB_INTEGRATION_URL;
const describeIf = INTEGRATION_URL ? describe : describe.skip;

describeIf("atomicMergeUpsertLead — real Postgres round-trip", () => {
  // Lazy requires so the mocked suite never needs a generated client / live DB.
  const { PrismaClient } = require("@prisma/client");
  const { atomicMergeUpsertLead } = require("@/lib/leads/lead-upsert");

  const prisma = new PrismaClient({
    datasources: { db: { url: INTEGRATION_URL } },
  });
  // Unique per run so parallel/rerun invocations never collide.
  const email = `contact-capture-itest+${Date.now()}@example.test`;

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM leads WHERE email = $1`, email);
    await prisma.$disconnect();
  });

  it("creates exactly one row, merges roles, guards phone, updates consent (all 6 acceptance criteria)", async () => {
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

    // (2) A repeat submission does NOT duplicate; (3) existing role preserved +
    // new role added; (4) a BLANK phone does not erase the stored phone;
    // (5) consent timestamp updates.
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

    // (6) is exercised by the route test / production canary: the public
    // contact route continues past this call into the AuditEvent + Inquiry
    // writes only if this function returns (previously it threw 42P01).
  });
});
