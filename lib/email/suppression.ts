// lib/email/suppression.ts
//
// Single source of truth for COMMERCIAL email opt-out suppression.
//
// A recipient is suppressed when EITHER:
//   1. a Lead row has a non-null `last_unsubscribe_at` for the normalized email, OR
//   2. an AuditEvent exists with action = 'email_unsubscribed' and entity_id = the
//      normalized email.
//
// (2) is what makes non-Lead recipients — e.g. the ~236 cold ACRIS/1031 emails that
// have no Lead row — durably suppressable WITHOUT a new table or Neon migration: the
// unsubscribe route already writes that AuditEvent keyed by the normalized email.
// We deliberately do NOT filter on `entity_type` when reading historical rows, because
// existing rows use entity_type = 'lead' even when no Lead row exists.
//
// FAIL-CLOSED: every lookup here PROPAGATES database errors. Commercial callers MUST
// treat a lookup failure as "block the send" — never as "not suppressed".

import prisma from "@/lib/prisma";

export type SuppressionSource = "lead" | "audit_event" | "both";

export interface EmailSuppression {
  suppressed: boolean;
  /** Most recent opt-out timestamp available from either source (null when not suppressed). */
  at: Date | null;
  /** Which source(s) proved the opt-out (null when not suppressed). */
  source: SuppressionSource | null;
}

/** The minimal Prisma surface these helpers use — lets tests pass a lightweight mock. */
export interface SuppressionDb {
  lead: {
    findUnique(args: unknown): Promise<{ last_unsubscribe_at: Date | null } | null>;
    findMany(args: unknown): Promise<{ email: string; last_unsubscribe_at: Date | null }[]>;
  };
  auditEvent: {
    findFirst(args: unknown): Promise<{ created_at: Date | null } | null>;
    findMany(args: unknown): Promise<{ entity_id: string; created_at: Date | null }[]>;
    create(args: unknown): Promise<unknown>;
  };
}

// All email_unsubscribed rows are written with entity_type = 'lead' (even when no Lead
// row exists), so scoping reads to it lets the lookups hit the EXISTING AuditEvent index
// on (entity_type, entity_id) — instead of scanning by (action, entity_id), which has no
// index — while still matching non-Lead opt-outs.
const UNSUBSCRIBE_ENTITY_TYPE = "lead";

const defaultDb = prisma as unknown as SuppressionDb;

export function normalizeEmail(email: string): string {
  return (email || "").toLowerCase().trim();
}

/**
 * Resolve suppression for a single email from BOTH sources. THROWS on any DB error
 * (the caller must fail closed). Returns the most recent opt-out timestamp.
 */
export async function findEmailSuppression(
  email: string,
  db: SuppressionDb = defaultDb,
): Promise<EmailSuppression> {
  const e = normalizeEmail(email);
  if (!e) return { suppressed: false, at: null, source: null };

  // Both lookups run; a rejection propagates so the caller fails closed.
  const [lead, audit] = await Promise.all([
    db.lead.findUnique({ where: { email: e }, select: { last_unsubscribe_at: true } }),
    db.auditEvent.findFirst({
      // entity_type scoped to hit the (entity_type, entity_id) index; the writer always
      // uses 'lead' even for non-Lead emails, so this still matches non-Lead opt-outs.
      where: { action: "email_unsubscribed", entity_type: UNSUBSCRIBE_ENTITY_TYPE, entity_id: e },
      orderBy: { created_at: "desc" },
      select: { created_at: true },
    }),
  ]);

  const leadAt = lead?.last_unsubscribe_at ?? null;
  const auditAt = audit?.created_at ?? null;
  const suppressed = Boolean(leadAt || auditAt);
  const source: SuppressionSource | null =
    leadAt && auditAt ? "both" : leadAt ? "lead" : auditAt ? "audit_event" : null;
  const at = suppressed
    ? new Date(Math.max(leadAt ? leadAt.getTime() : 0, auditAt ? auditAt.getTime() : 0))
    : null;

  return { suppressed, at, source };
}

/** Boolean convenience over findEmailSuppression. THROWS on DB error (fail closed). */
export async function isEmailSuppressed(email: string, db: SuppressionDb = defaultDb): Promise<boolean> {
  return (await findEmailSuppression(email, db)).suppressed;
}

/**
 * Partition a list of emails into `allowed` vs `suppressed` (deduped + normalized).
 *
 * Uses exactly TWO batch queries total — one `lead.findMany` + one `auditEvent.findMany`
 * over the whole normalized list — never one lookup per recipient. (A per-recipient
 * approach would fire ~2×N queries — ~472 for a 236-address campaign — the exact Neon
 * activity we're eliminating.) THROWS on any DB error: a suppression-lookup failure must
 * BLOCK campaign preparation, never return every recipient as safe.
 */
export async function filterSuppressedEmails(
  emails: string[],
  db: SuppressionDb = defaultDb,
): Promise<{ allowed: string[]; suppressed: string[] }> {
  const unique = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)));
  if (unique.length === 0) return { allowed: [], suppressed: [] };

  // Two batch reads; a rejection propagates so the whole dry-run fails closed.
  const [leadOptOuts, auditOptOuts] = await Promise.all([
    db.lead.findMany({
      where: { email: { in: unique }, last_unsubscribe_at: { not: null } },
      select: { email: true, last_unsubscribe_at: true },
    }),
    db.auditEvent.findMany({
      where: {
        action: "email_unsubscribed",
        entity_type: UNSUBSCRIBE_ENTITY_TYPE, // indexed (entity_type, entity_id)
        entity_id: { in: unique },
      },
      select: { entity_id: true, created_at: true },
    }),
  ]);

  const suppressedSet = new Set<string>();
  for (const l of leadOptOuts) if (l.last_unsubscribe_at) suppressedSet.add(normalizeEmail(l.email));
  for (const a of auditOptOuts) suppressedSet.add(normalizeEmail(a.entity_id));

  const allowed: string[] = [];
  const suppressed: string[] = [];
  for (const e of unique) (suppressedSet.has(e) ? suppressed : allowed).push(e);
  return { allowed, suppressed };
}

/**
 * Persist the DURABLE suppression record for a recipient — the AuditEvent that keeps a
 * non-Lead email suppressed for all future commercial sends. This is the source of
 * truth; it does NOT require (and must not depend on) a Lead row existing.
 * THROWS if the durable record cannot be written (the caller must not report success).
 */
export async function recordEmailUnsubscribe(
  email: string,
  source: string,
  db: SuppressionDb = defaultDb,
): Promise<void> {
  const e = normalizeEmail(email);
  await db.auditEvent.create({
    data: {
      action: "email_unsubscribed",
      // Historical convention; the durable key is entity_id (the normalized email).
      entity_type: "lead",
      entity_id: e,
      user_type: "public",
      user_id: null,
      changes: { email: e, source },
    },
  });
}
