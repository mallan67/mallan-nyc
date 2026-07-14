/**
 * Atomic Lead upsert with DB-side roles-array union.
 *
 * Background — A3 Codex feedback on PR #171 (2026-05-20).
 *
 * The original A3 implementation used a read-then-write pattern:
 *   1. SELECT roles FROM "Lead" WHERE email = $1
 *   2. mergedRoles = JS-side mergeRoles(existing, incoming)
 *   3. INSERT ... ON CONFLICT (email) DO UPDATE SET roles = <jsValue>
 *
 * Under concurrent submissions for the same email this can drop a role:
 * two requests read the same prior roles snapshot, each computes a
 * different merged value, and the second UPDATE overwrites the first.
 * A new exclusive-seller landing concurrent with the same person's
 * existing buyer-source contact could end up with "seller" silently
 * dropped — exactly the lane this PR was opened to close.
 *
 * Fix — DB-side merge inside a single INSERT ... ON CONFLICT statement,
 * so the union is computed against the conflict-locked row inside
 * Postgres rather than against a JS-cached snapshot. Postgres takes a
 * row-level lock during ON CONFLICT processing, so two concurrent
 * inserts on the same `email` serialize and each sees the other's
 * write before computing its own merge.
 *
 * The union expression (the ON CONFLICT target is aliased `existing` so the
 * merge references the conflict-locked row by a stable alias rather than the
 * physical table name):
 *   ARRAY(
 *     SELECT DISTINCT role
 *     FROM unnest(existing."roles" || EXCLUDED."roles") AS role
 *     WHERE role <> ''
 *   )
 *
 * Guarantees match `mergeRoles()` from `lib/leads/intent.ts`:
 *  - never overwrite, never demote — existing roles are always preserved
 *  - union with the incoming role contribution
 *  - dedup
 *  - foreign legacy strings on the existing row (e.g. an old "renter" tag)
 *    are kept verbatim so we don't quietly drop historical data
 *
 * This module is intentionally narrow — it only handles the contact-form
 * lead upsert path. Other lead-write sites (CRM manual create, portal
 * sign-up, etc.) have their own auth + validation flows and don't share
 * the public-fire-and-forget concurrency profile that motivated this fix.
 */
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export interface AtomicMergeUpsertLeadInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /**
   * Closed-allowlist roles contributed by THIS submission. Must be the
   * output of `classifyIntent(...).roles` (or equivalent) — never raw
   * user input. The helper trusts the caller's validation; the DB-side
   * union just dedups and merges into the existing array.
   */
  incomingRoles: readonly string[];
  consentCapturedAt: Date;
}

export interface AtomicMergeUpsertLeadResult {
  id: bigint;
  /** Post-merge roles array as committed by the DB. */
  roles: string[];
}

/**
 * Atomically insert-or-merge a Lead row from a public contact submission.
 *
 * Concurrency: two POSTs to /api/contact for the same email cannot lose
 * a role. The ON CONFLICT DO UPDATE union is evaluated server-side
 * against the locked row, so the second submission's merge sees the
 * first submission's write.
 *
 * On conflict:
 *  - `phone` is updated only if the incoming value is non-empty.
 *  - `roles` is replaced with the deduplicated union of existing +
 *    incoming arrays.
 *  - `consent_captured_at` is bumped to the incoming consent timestamp
 *    (per-submission TCPA contract — the most recent affirmative
 *    consent is what we hold).
 *  - `updated_at` is bumped to NOW().
 *
 * On insert (no existing row): the incoming values are written verbatim,
 * `status` defaults to 'new', `source` to 'contact_form'.
 *
 * Returns the lead id and the merged roles array (from RETURNING) so
 * the caller can write them into AuditEvent without a second read.
 */
export async function atomicMergeUpsertLead(
  prisma: PrismaClient,
  input: AtomicMergeUpsertLeadInput
): Promise<AtomicMergeUpsertLeadResult> {
  const {
    email,
    firstName,
    lastName,
    phone,
    incomingRoles,
    consentCapturedAt,
  } = input;

  // Build a parameterized "ARRAY[$1, $2, ...]::text[]" fragment from the
  // incoming roles. `Prisma.join` interpolates each role as a separate
  // bound parameter — no concatenation into the SQL string, so there is
  // no injection surface even if a caller bypassed classifyIntent.
  const rolesParam =
    incomingRoles.length === 0
      ? Prisma.sql`ARRAY[]::text[]`
      : Prisma.sql`ARRAY[${Prisma.join(
          incomingRoles.map((r) => Prisma.sql`${r}`)
        )}]::text[]`;

  const rows = await prisma.$queryRaw<
    Array<{ id: bigint; roles: string[] }>
  >`
    INSERT INTO "leads" AS existing (
      "first_name", "last_name", "email", "phone", "roles",
      "status", "source", "consent_captured_at",
      "created_at", "updated_at"
    )
    VALUES (
      ${firstName}, ${lastName}, ${email}, ${phone}, ${rolesParam},
      'new', 'contact_form', ${consentCapturedAt},
      NOW(), NOW()
    )
    ON CONFLICT ("email") DO UPDATE SET
      "phone" = COALESCE(NULLIF(EXCLUDED."phone", ''), existing."phone"),
      "roles" = ARRAY(
        SELECT DISTINCT role
        FROM unnest(existing."roles" || EXCLUDED."roles") AS role
        WHERE role <> ''
      ),
      "consent_captured_at" = EXCLUDED."consent_captured_at",
      "updated_at" = NOW()
    RETURNING "id", "roles"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error(
      "atomicMergeUpsertLead: INSERT ... ON CONFLICT returned no rows"
    );
  }
  return { id: row.id, roles: row.roles };
}
