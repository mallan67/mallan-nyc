/// <reference types="jest" />
/**
 * lib/email/suppression.ts — the single source of truth for commercial email opt-out.
 *
 * Proves: suppression resolves from EITHER a Lead opt-out OR an AuditEvent
 * (email_unsubscribed) so NON-Lead recipients are durably suppressed; the most-recent
 * timestamp + source are reported; every lookup FAILS CLOSED (propagates DB errors);
 * and recordEmailUnsubscribe writes the durable AuditEvent keyed by the normalized email.
 */
import {
  findEmailSuppression,
  isEmailSuppressed,
  filterSuppressedEmails,
  recordEmailUnsubscribe,
  normalizeEmail,
  type SuppressionDb,
} from '@/lib/email/suppression';

type LeadRow = { last_unsubscribe_at: Date | null } | null;
type AuditRow = { created_at: Date | null } | null;

function makeDb(opts: { lead?: LeadRow; audit?: AuditRow } = {}): SuppressionDb & {
  createCalls: unknown[];
} {
  const createCalls: unknown[] = [];
  return {
    createCalls,
    lead: { findUnique: async () => opts.lead ?? null, findMany: async () => [] },
    auditEvent: {
      findFirst: async () => opts.audit ?? null,
      findMany: async () => [],
      create: async (a: unknown) => {
        createCalls.push(a);
        return {};
      },
    },
  };
}

const T1 = new Date('2026-07-01T00:00:00Z');
const T2 = new Date('2026-07-10T00:00:00Z');

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(normalizeEmail('')).toBe('');
  });
});

describe('findEmailSuppression — both sources', () => {
  it('suppressed via a Lead opt-out (source=lead)', async () => {
    const r = await findEmailSuppression('a@x.com', makeDb({ lead: { last_unsubscribe_at: T1 } }));
    expect(r).toEqual({ suppressed: true, at: T1, source: 'lead' });
  });

  it('suppressed via an AuditEvent ALONE — non-Lead recipient (source=audit_event)', async () => {
    const r = await findEmailSuppression('cold@acris.com', makeDb({ audit: { created_at: T2 } }));
    expect(r).toEqual({ suppressed: true, at: T2, source: 'audit_event' });
  });

  it('both sources present → source=both, most-recent timestamp wins', async () => {
    const r = await findEmailSuppression('a@x.com', makeDb({ lead: { last_unsubscribe_at: T1 }, audit: { created_at: T2 } }));
    expect(r.suppressed).toBe(true);
    expect(r.source).toBe('both');
    expect(r.at).toEqual(T2);
  });

  it('neither source → not suppressed', async () => {
    const r = await findEmailSuppression('safe@x.com', makeDb());
    expect(r).toEqual({ suppressed: false, at: null, source: null });
  });

  it('isEmailSuppressed reflects findEmailSuppression', async () => {
    expect(await isEmailSuppressed('cold@acris.com', makeDb({ audit: { created_at: T2 } }))).toBe(true);
    expect(await isEmailSuppressed('safe@x.com', makeDb())).toBe(false);
  });
});

describe('findEmailSuppression — FAIL CLOSED (propagates DB errors)', () => {
  it('a Lead lookup failure propagates (never returns "not suppressed")', async () => {
    const db: SuppressionDb = {
      lead: { findUnique: async () => { throw new Error('Neon timeout'); }, findMany: async () => [] },
      auditEvent: { findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
    };
    await expect(findEmailSuppression('a@x.com', db)).rejects.toThrow(/timeout/i);
  });

  it('an AuditEvent lookup failure propagates', async () => {
    const db: SuppressionDb = {
      lead: { findUnique: async () => null, findMany: async () => [] },
      auditEvent: { findFirst: async () => { throw new Error('prisma down'); }, findMany: async () => [], create: async () => ({}) },
    };
    await expect(findEmailSuppression('a@x.com', db)).rejects.toThrow(/prisma/i);
  });
});

describe('filterSuppressedEmails — TWO batch queries, correct partition', () => {
  it('partitions Lead-only, AuditEvent-only, and BOTH-source opt-outs; passes the rest (deduped/normalized)', async () => {
    const leadFindMany = jest.fn(async () => [
      { email: 'leadonly@x.com', last_unsubscribe_at: T1 },
      { email: 'both@x.com', last_unsubscribe_at: T1 },
    ]);
    const auditFindMany = jest.fn(async () => [
      { entity_id: 'auditonly@x.com', created_at: T2 }, // NON-Lead opt-out
      { entity_id: 'both@x.com', created_at: T2 },
    ]);
    const db: SuppressionDb = {
      lead: { findUnique: async () => null, findMany: leadFindMany },
      auditEvent: { findFirst: async () => null, findMany: auditFindMany, create: async () => ({}) },
    };
    const { allowed, suppressed } = await filterSuppressedEmails(
      ['LeadOnly@x.com', 'AuditOnly@x.com', 'both@x.com', 'safe@x.com', 'safe@x.com'], // mixed case + dup
      db,
    );
    expect([...suppressed].sort()).toEqual(['auditonly@x.com', 'both@x.com', 'leadonly@x.com']);
    expect(allowed).toEqual(['safe@x.com']);
    // EXACTLY two batch reads — one lead.findMany + one auditEvent.findMany.
    expect(leadFindMany).toHaveBeenCalledTimes(1);
    expect(auditFindMany).toHaveBeenCalledTimes(1);
  });

  it('a 236-address list performs EXACTLY two suppression reads (no N+1 burst)', async () => {
    const leadFindMany = jest.fn(async () => []);
    const auditFindMany = jest.fn(async () => []);
    const db: SuppressionDb = {
      lead: { findUnique: async () => null, findMany: leadFindMany },
      auditEvent: { findFirst: async () => null, findMany: auditFindMany, create: async () => ({}) },
    };
    const emails = Array.from({ length: 236 }, (_, i) => `r${i}@acris.com`);
    await filterSuppressedEmails(emails, db);
    expect(leadFindMany).toHaveBeenCalledTimes(1);
    expect(auditFindMany).toHaveBeenCalledTimes(1);
  });

  it('FAILS CLOSED: a batch-lookup failure blocks the dry-run (rejects, not "all safe")', async () => {
    const db: SuppressionDb = {
      lead: { findUnique: async () => null, findMany: async () => { throw new Error('Neon unavailable'); } },
      auditEvent: { findFirst: async () => null, findMany: async () => [], create: async () => ({}) },
    };
    await expect(filterSuppressedEmails(['a@x.com', 'b@x.com'], db)).rejects.toThrow(/unavailable/i);
  });
});

describe('recordEmailUnsubscribe — durable AuditEvent', () => {
  it('writes email_unsubscribed keyed by the normalized email + source', async () => {
    const db = makeDb();
    await recordEmailUnsubscribe('  Cold@ACRIS.com ', 'one-click', db);
    expect(db.createCalls).toHaveLength(1);
    expect(db.createCalls[0]).toMatchObject({
      data: {
        action: 'email_unsubscribed',
        entity_id: 'cold@acris.com',
        changes: { email: 'cold@acris.com', source: 'one-click' },
      },
    });
  });
});
