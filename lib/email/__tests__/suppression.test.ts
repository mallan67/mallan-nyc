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
    lead: { findUnique: async () => opts.lead ?? null },
    auditEvent: {
      findFirst: async () => opts.audit ?? null,
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
      lead: { findUnique: async () => { throw new Error('Neon timeout'); } },
      auditEvent: { findFirst: async () => null, create: async () => ({}) },
    };
    await expect(findEmailSuppression('a@x.com', db)).rejects.toThrow(/timeout/i);
  });

  it('an AuditEvent lookup failure propagates', async () => {
    const db: SuppressionDb = {
      lead: { findUnique: async () => null },
      auditEvent: { findFirst: async () => { throw new Error('prisma down'); }, create: async () => ({}) },
    };
    await expect(findEmailSuppression('a@x.com', db)).rejects.toThrow(/prisma/i);
  });
});

describe('filterSuppressedEmails', () => {
  it('partitions non-Lead (AuditEvent-only) recipients into suppressed[]', async () => {
    // suppress only cold@acris.com via an AuditEvent; safe@x.com passes.
    const db: SuppressionDb = {
      lead: { findUnique: async () => null },
      auditEvent: {
        findFirst: async (args: unknown) => {
          const where = (args as { where?: { entity_id?: string } }).where;
          return where?.entity_id === 'cold@acris.com' ? { created_at: T2 } : null;
        },
        create: async () => ({}),
      },
    };
    const { allowed, suppressed } = await filterSuppressedEmails(
      ['Cold@ACRIS.com', 'safe@x.com', 'cold@acris.com'], // dup + mixed case
      db,
    );
    expect(suppressed).toEqual(['cold@acris.com']); // deduped + normalized
    expect(allowed).toEqual(['safe@x.com']);
  });

  it('removes Lead-based opt-outs too', async () => {
    const db: SuppressionDb = {
      lead: { findUnique: async (args: unknown) => {
        const where = (args as { where?: { email?: string } }).where;
        return where?.email === 'gone@x.com' ? { last_unsubscribe_at: T1 } : null;
      } },
      auditEvent: { findFirst: async () => null, create: async () => ({}) },
    };
    const { allowed, suppressed } = await filterSuppressedEmails(['gone@x.com', 'ok@x.com'], db);
    expect(suppressed).toEqual(['gone@x.com']);
    expect(allowed).toEqual(['ok@x.com']);
  });

  it('FAILS CLOSED: a lookup failure blocks the whole dry-run (rejects, not "all safe")', async () => {
    const db: SuppressionDb = {
      lead: { findUnique: async () => { throw new Error('Neon unavailable'); } },
      auditEvent: { findFirst: async () => null, create: async () => ({}) },
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
