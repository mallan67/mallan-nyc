// GET /api/crm/agents/[id]/purge-preview
//
// Read-only, ADVISORY dependency preview for Agent permanent delete.
// Writes nothing and is safe to call freely. It is NOT authorization: the
// POST /purge handler independently re-counts everything inside its own
// transaction and refuses on its own findings, so a stale or forged preview
// can never widen what the purge is allowed to do.
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireBroker, isAuthError } from '@/lib/auth';
import {
  countPurgeBlockers,
  blockingCounts,
  refusePurge,
  REFUSAL_MESSAGE,
  headshotObjectKey,
  PURGE_BLOCKERS,
} from '@/lib/agents/agent-purge';
import agentsJson from '@/data/agents.json';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid agent id' }, { status: 400 });
  }
  const agentId = BigInt(numericId);

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true, first_name: true, last_name: true, full_name: true, email: true,
      license_no: true, license_type: true, role: true, status: true,
      public_slug: true, photo: true, last_login: true, created_at: true,
    },
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const counts = await countPurgeBlockers(prisma, agentId);
  const blockers = blockingCounts(counts);
  const refusal = refusePurge(
    { id: agent.id, role: agent.role, last_login: agent.last_login },
    auth.userId,
    counts,
  );

  // Ephemeral rows the purge would remove. Reported for transparency; their
  // presence never blocks — they are authentication state, not history.
  const [sessions, mfaSessions] = await Promise.all([
    prisma.session.count({ where: { user_type: 'agent', user_id: agentId } }),
    prisma.mfaSession.count({ where: { agent_id: agentId } }),
  ]);

  // Audit events ABOUT this agent record written by someone else — the
  // create / profile / photo trail from onboarding. Preserved by the purge,
  // and deliberately NOT a blocker.
  const preservedAuditEvents = await prisma.auditEvent.count({
    where: { entity_type: 'agent', entity_id: agent.id.toString(), NOT: { user_id: agentId } },
  });

  // The static public roster is a SEPARATE authority from the database and the
  // purge never touches it (it is a Git-tracked file). Surfaced explicitly so
  // the broker knows the public profile outlives the account.
  const staticEntry = (agentsJson.agents as Array<{ id: string; email: string }>).find(
    (a) => a.email === agent.email || a.id === agent.public_slug,
  );

  return NextResponse.json({
    agent: {
      id: agent.id.toString(),
      full_name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
      email: agent.email,
      role: agent.role,
      license_type: agent.license_type,
      status: agent.status,
      public_slug: agent.public_slug,
      last_login: agent.last_login,
      created_at: agent.created_at,
    },
    can_purge: refusal === null,
    refusal: refusal,
    message: refusal ? REFUSAL_MESSAGE[refusal] : 'This record has no brokerage history and may be permanently deleted.',
    blocked_by: blockers,
    checks_run: PURGE_BLOCKERS.length,
    will_delete: { sessions, mfa_sessions: mfaSessions },
    will_preserve: { audit_events_about_this_agent: preservedAuditEvents },
    // Media is report-only and separately authorization-gated.
    orphaned_media: {
      r2_key: headshotObjectKey(agent.public_slug),
      stored_url: agent.photo,
      note: 'Retained. The purge never deletes R2 objects.',
    },
    // Git-tracked static roster — the reason a purged account can still have a
    // live public profile page.
    static_profile_exists: Boolean(staticEntry),
    public_profile_will_remain: Boolean(staticEntry),
    static_profile_note: staticEntry
      ? `data/agents.json still contains "${staticEntry.id}". /agents/${staticEntry.id} will keep rendering from the repository after this account is deleted. The purge does not modify Git.`
      : null,
    advisory: 'Preview only. POST /purge re-checks every dependency inside its own transaction.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
