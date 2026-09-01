// POST /api/crm/agents/[id]/purge
//
// Agent PERMANENT DELETE — mistake rollback only. Broker-only, audited, and
// atomic: the eligibility re-check, the ephemeral-row deletion, the Agent
// deletion and the purge AuditEvent all happen in ONE transaction. If any part
// fails, none of it happened.
//
// This is deliberately hard to qualify for. Anything proving the target acted
// as a broker refuses the purge and directs the caller to Deactivate instead.
// Nothing is ever nulled or rewritten to make a delete succeed.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireBroker, isAuthError } from '@/lib/auth';
import { assertWriteAllowed } from '@/lib/auth/readonly-guard';
import {
  countPurgeBlockers,
  blockingCounts,
  refusePurge,
  REFUSAL_MESSAGE,
  headshotObjectKey,
  type RefusalCode,
} from '@/lib/agents/agent-purge';

type RouteParams = { params: Promise<{ id: string }> };

/** Thrown inside the transaction to force a rollback, carrying the reason out. */
class PurgeRefused extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly blocked_by: Record<string, number>,
  ) {
    super(code);
    this.name = 'PurgeRefused';
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });
  }
  const agentId = BigInt(numericId);

  let body: { confirm_email?: unknown };
  try {
    body = (await req.json()) as { confirm_email?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const confirmEmail = typeof body.confirm_email === 'string' ? body.confirm_email.trim() : '';
  if (!confirmEmail) {
    return NextResponse.json(
      { error: 'confirm_email is required', message: 'Type the agent’s email address to confirm permanent deletion.' },
      { status: 400 },
    );
  }

  const ip = req.headers.get('x-forwarded-for') ?? null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Re-read the target INSIDE the transaction. The GET preview is advisory
      // and is never trusted as authorization.
      const agent = await tx.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true, first_name: true, last_name: true, full_name: true, email: true,
          license_no: true, license_type: true, role: true, status: true,
          public_slug: true, photo: true, last_login: true, created_at: true,
        },
      });
      if (!agent) return { notFound: true as const };

      // Typed confirmation must match the real target, case-insensitively.
      if (confirmEmail.toLowerCase() !== agent.email.toLowerCase()) {
        return { mismatch: true as const };
      }

      // Full dependency re-count, in-transaction.
      const counts = await countPurgeBlockers(tx, agentId);
      const refusal = refusePurge(
        { id: agent.id, role: agent.role, last_login: agent.last_login },
        auth.userId,
        counts,
      );
      if (refusal) throw new PurgeRefused(refusal, blockingCounts(counts));

      // Ephemeral authentication state — removable, not history.
      const sessions = await tx.session.deleteMany({
        where: { user_type: 'agent', user_id: agentId },
      });
      const mfaSessions = await tx.mfaSession.deleteMany({ where: { agent_id: agentId } });

      await tx.agent.delete({ where: { id: agentId } });

      // The purge audit event carries a COMPLETE identity snapshot, because
      // after this transaction there is deliberately no Agent row left to
      // resolve the id against. Written with tx (not logAuditEvent, which uses
      // the module-level client) so it shares the transaction.
      const snapshot = {
        agent_id: agent.id.toString(),
        first_name: agent.first_name,
        last_name: agent.last_name,
        full_name: agent.full_name,
        email: agent.email,
        license_no: agent.license_no,
        license_type: agent.license_type,
        role: agent.role,
        public_slug: agent.public_slug,
        status_at_purge: agent.status,
        created_at: agent.created_at.toISOString(),
        photo_url: agent.photo,
      };
      await tx.auditEvent.create({
        data: {
          action: 'purge',
          entity_type: 'agent',
          entity_id: agent.id.toString(),
          user_type: auth.userType,
          user_id: auth.userId,
          ip_address: ip,
          changes: {
            reason: 'erroneous_record_rollback',
            deleted_agent: snapshot,
            dependency_counts_at_purge: counts,
            ephemeral_deleted: { sessions: sessions.count, mfa_sessions: mfaSessions.count },
            retained_media: {
              r2_key: headshotObjectKey(agent.public_slug),
              note: 'R2 object retained — separately authorization-gated.',
            },
          },
        },
      });

      return {
        ok: true as const,
        snapshot,
        deleted: { sessions: sessions.count, mfa_sessions: mfaSessions.count },
      };
    });

    if ('notFound' in result) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    if ('mismatch' in result) {
      return NextResponse.json(
        {
          error: 'confirm_email_mismatch',
          message: 'The email you typed does not match this agent. Nothing was deleted.',
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      purged: true,
      agent: result.snapshot,
      deleted: result.deleted,
      retained: {
        audit_trail: 'All AuditEvent history retained, including a new purge record.',
        r2_media: headshotObjectKey(result.snapshot.public_slug),
      },
      note: 'If a static entry for this agent remains in data/agents.json, their public profile page '
        + 'will continue to render from the repository. This endpoint does not modify Git.',
    });
  } catch (err) {
    if (err instanceof PurgeRefused) {
      // Nothing was written — the transaction rolled back on the throw.
      return NextResponse.json(
        {
          error: err.code,
          message: REFUSAL_MESSAGE[err.code],
          blocked_by: err.blocked_by,
          remedy: 'deactivate',
        },
        { status: 409 },
      );
    }
    console.error(
      '[agents/purge] transaction failed; nothing was deleted:',
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: 'purge_failed', message: 'The purge failed and was rolled back. No records were deleted.' },
      { status: 500 },
    );
  }
}
