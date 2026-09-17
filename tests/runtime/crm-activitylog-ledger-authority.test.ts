/// <reference types="jest" />
/**
 * THE CANONICAL LEDGER HAS ONE SET OF AUTHORS.
 *
 * Lane 3 Packet 2 made two ActivityLog row types authoritative — they are the anchors
 * lib/crm/nurture-due.ts trusts to decide a client's six-month relationship cadence:
 *
 *     client_report_sent  + metadata.qualifies_nurture + metadata.delivery_status
 *     status_change       + metadata.new_pipeline_stage
 *
 * The governed report-send route earns the first one through auth, ownership, an inactive-client
 * refusal, server-side listing eligibility, a suppression-checked send, an accepted SMTP result, a
 * recognised substantive report type and current canonical Nurture membership. The client PATCH
 * earns the second by actually changing a stage.
 *
 * Meanwhile POST /api/crm/events wrote caller-supplied activity_type and caller-supplied metadata
 * into the same table behind nothing but lead access. So every one of those checks could be walked
 * around by posting the finished record directly. That was survivable while the ledger had no
 * reader; this packet gave it one, which turns it from untidiness into a forgery surface — the
 * governed route validating carefully while another endpoint manufactures the same authoritative
 * row for free.
 *
 * THE FIX PROTECTS THE EXISTING LEDGER RATHER THAN ADDING ANOTHER ONE. A generic caller keeps the
 * generic vocabulary. The governed types are refused here and written only where they are earned.
 *
 * Worth recording from the census behind this suite: the generic endpoint has no working caller in
 * either direction. public/crm/js/dashboard/events.js POSTs
 * {id, type, category, entityType, entityId, actorId, severity, payload, createdAt} while the route
 * requires entity_id, activity_type and title — so every call 400s, and the caller swallows it with
 * `.catch(function () {})` under the comment "API may not exist yet". Its GET is mismatched the same
 * camelCase-for-snake_case way. The legitimate vocabulary is therefore empty, which is why this is a
 * reserved-type refusal rather than an allowlist: an allowlist of nothing would refuse a future
 * intended use as well as the forgery.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildPrismaMock, makeRequest, readJson } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

const activityLogCreate = jest.fn(async (a: { data: Record<string, unknown> }) => ({
  id: 9n,
  created_at: new Date('2026-09-17T12:00:00.000Z'),
  ...a.data,
}));

const { prisma: prismaMock } = buildPrismaMock({
  activityLog: { create: activityLogCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({ userId: 'agent-1', userType: 'agent', role: 'BROKER' })),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));
// Lead access is granted throughout: the point of this suite is that access is NOT sufficient.
jest.mock('@/lib/crm/access', () => ({
  __esModule: true,
  assertLeadAccess: jest.fn(async () => null),
  assertLeadIdStringAccess: jest.fn(async () => ({ leadId: 7n, response: null })),
}));

async function postEvent(body: Record<string, unknown>) {
  jest.resetModules();
  const { POST } = await import('@/app/api/crm/events/route');
  const res = await POST(
    makeRequest({ method: 'POST', url: 'http://localhost/api/crm/events', body }) as never,
  );
  return { res, json: await readJson<any>(res) };
}

function createdRow() {
  const call = activityLogCreate.mock.calls.at(-1)?.[0] as { data: Record<string, any> } | undefined;
  return call?.data;
}

beforeEach(() => activityLogCreate.mockClear());

// ═════════════════════════════════════════════════════════════════════════════
// A — the nurture discharge anchor cannot be forged
// ═════════════════════════════════════════════════════════════════════════════
describe('A · generic events cannot forge a qualifying nurture report', () => {
  it('refuses activity_type client_report_sent outright', async () => {
    const { res, json } = await postEvent({
      entity_id: '7',
      activity_type: 'client_report_sent',
      title: 'Forged report',
      metadata: { qualifies_nurture: true, delivery_status: 'accepted' },
    });
    expect(res.status).toBe(403);
    expect(json.error).toMatch(/governed workflow/i);
    // Nothing reached the ledger at all.
    expect(activityLogCreate).not.toHaveBeenCalled();
  });

  it('refuses the failure variant too, so history cannot be poisoned either', async () => {
    const { res } = await postEvent({
      entity_id: '7',
      activity_type: 'client_report_send_failed',
      title: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('strips the decision keys even under an innocuous activity_type', async () => {
    // Defence in depth. Refusing the types above is what closes the forgery; this makes sure a
    // future edit that adds a type cannot silently reopen it.
    const { res } = await postEvent({
      entity_id: '7',
      activity_type: 'note',
      title: 'A normal note',
      metadata: { qualifies_nurture: true, delivery_status: 'accepted', comment: 'keep me' },
    });
    expect(res.status).toBe(201);
    const meta = createdRow()!.metadata as Record<string, unknown>;
    expect(meta.qualifies_nurture).toBeUndefined();
    expect(meta.delivery_status).toBeUndefined();
    // The caller's own descriptive fields survive — this is a scrub, not a rejection.
    expect(meta.comment).toBe('keep me');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the stage-entry anchor cannot be forged
// ═════════════════════════════════════════════════════════════════════════════
describe('B · generic events cannot forge a nurture stage entry', () => {
  it('refuses activity_type status_change', async () => {
    const { res } = await postEvent({
      entity_id: '7',
      activity_type: 'status_change',
      title: 'Forged entry',
      metadata: { new_pipeline_stage: 'nurturing' },
    });
    expect(res.status).toBe(403);
    expect(activityLogCreate).not.toHaveBeenCalled();
  });

  it('strips the stage keys under an innocuous type', async () => {
    const { res } = await postEvent({
      entity_id: '7',
      activity_type: 'comment',
      title: 'A comment',
      metadata: { new_pipeline_stage: 'nurturing', old_pipeline_stage: 'new' },
    });
    expect(res.status).toBe(201);
    const meta = createdRow()!.metadata as Record<string, unknown>;
    expect(meta.new_pipeline_stage).toBeUndefined();
    expect(meta.old_pipeline_stage).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — the generic endpoint still does its own job
// ═════════════════════════════════════════════════════════════════════════════
describe('C · a legitimate generic CRM event still succeeds', () => {
  it.each(['note', 'comment', 'contact', 'showing', 'impersonation_started'])(
    '%s is written normally',
    async (activity_type) => {
      const { res, json } = await postEvent({
        entity_id: '7',
        activity_type,
        title: 'Something happened',
        detail: 'detail text',
        metadata: { source: 'crm' },
      });
      expect(res.status).toBe(201);
      expect(json.activity_type).toBe(activity_type);
      expect(createdRow()!.activity_type).toBe(activity_type);
    },
  );

  it('still scrubs PII, which this guard must not have displaced', async () => {
    const { res } = await postEvent({
      entity_id: '7',
      activity_type: 'note',
      title: 'note',
      metadata: { ssn: '123-45-6789', bank_account: '1', note: 'fine' },
    });
    expect(res.status).toBe(201);
    const meta = createdRow()!.metadata as Record<string, unknown>;
    expect(meta.ssn).toBeUndefined();
    expect(meta.bank_account).toBeUndefined();
    expect(meta.note).toBe('fine');
  });

  it('still attributes the row to the caller rather than to the system', async () => {
    await postEvent({ entity_id: '7', activity_type: 'note', title: 'note' });
    expect(createdRow()!.actor_id).toBe('agent-1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — the reserved set matches what the clock actually reads
// ═════════════════════════════════════════════════════════════════════════════
describe('D · the reserved set and the clock agree', () => {
  it('every activity_type the canonical clock reads is reserved', () => {
    // If the clock learns to read a new type, this fails until the type is protected — which is the
    // coupling that was missing when the ledger first acquired a reader.
    const clock = readFileSync(resolve(__dirname, '../../lib/crm/nurture-due.ts'), 'utf8');
    const events = readFileSync(resolve(__dirname, '../../app/api/crm/events/route.ts'), 'utf8');
    for (const [, type] of clock.matchAll(/_ACTIVITY\s*=\s*'([a-z_]+)'/g)) {
      expect({ type, reserved: events.includes(`"${type}"`) }).toEqual({ type, reserved: true });
    }
  });
});
