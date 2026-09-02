import type { Prisma } from '@prisma/client';

/**
 * Agent account-state transitions — the ONE authority.
 *
 * @module lib/agents/agent-lifecycle
 *
 * ── The defect this closes ────────────────────────────────────────────────
 * There were two writers of `Agent.status`:
 *
 *   DELETE /api/crm/agents/[id]   set status inactive AND deleted the agent's
 *                                 Session rows AND wrote an audit event.
 *   PATCH  /api/crm/agents/[id]   set status to anything valid and did NOTHING
 *                                 else.
 *
 * That difference is a security defect, not a cosmetic one, because
 * `validateSession` (lib/auth/session.ts) reads only the Session row and its
 * expiry — it never re-reads `Agent.status`, and it will even EXTEND a session
 * approaching expiry. `requireAgentOrBroker` then trusts that session.
 *
 * So: an authenticated agent, edited to status "inactive" through the generic
 * Edit Agent form, kept a working CRM session and went on being accepted.
 *
 * Every transition now runs through `applyAgentStatusTransition`, which
 * performs the full lifecycle consistently: update, revoke, audit.
 *
 * ── Residual risk, stated rather than hidden ──────────────────────────────
 * Revoking at the transition closes the practical hole. It does not make
 * session validation itself status-aware: a session issued to an agent who is
 * deactivated by some future third path would still validate. Making
 * `validateSession` re-read `Agent.status` is the defence-in-depth fix and
 * touches the authentication hot path for every request, so it is deliberately
 * NOT bundled here.
 */

/** Status values `Agent.status` may hold. */
export const AGENT_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export function isAgentStatus(v: unknown): v is AgentStatus {
  return typeof v === 'string' && (AGENT_STATUSES as readonly string[]).includes(v);
}

/** A status that must not keep an authenticated session alive. */
export function revokesSessions(next: AgentStatus): boolean {
  return next !== 'active';
}

/**
 * A Prisma client or an interactive-transaction client. `PrismaClient` is
 * assignable to `Prisma.TransactionClient`, so a transition can run inside a
 * transaction as easily as standalone.
 */
export type LifecycleDb = Prisma.TransactionClient;

export interface LifecycleActor {
  userId: bigint;
  userType: string;
}

export interface TransitionResult {
  status: AgentStatus;
  sessions_revoked: number;
  mfa_sessions_revoked: number;
}

/**
 * Apply an account-state transition with its full consequences.
 *
 * Leaving "active" revokes every session and in-flight MFA challenge, so the
 * agent cannot continue using the CRM. Always writes an audit event naming the
 * transition and what it revoked.
 */
export async function applyAgentStatusTransition(
  db: LifecycleDb,
  agentId: bigint,
  next: AgentStatus,
  actor: LifecycleActor,
  opts: { previous?: string | null; ip?: string | null; reason?: string } = {},
): Promise<TransitionResult> {
  await db.agent.update({ where: { id: agentId }, data: { status: next } });

  let sessions = 0;
  let mfa = 0;
  if (revokesSessions(next)) {
    sessions = (await db.session.deleteMany({
      where: { user_type: 'agent', user_id: agentId },
    })).count;
    mfa = (await db.mfaSession.deleteMany({ where: { agent_id: agentId } })).count;
  }

  await db.auditEvent.create({
    data: {
      action: 'status_change',
      entity_type: 'agent',
      entity_id: agentId.toString(),
      user_type: actor.userType,
      user_id: actor.userId,
      ip_address: opts.ip ?? null,
      changes: {
        status: { old: opts.previous ?? null, new: next },
        sessions_revoked: sessions,
        mfa_sessions_revoked: mfa,
        reason: opts.reason ?? 'status_transition',
      },
    },
  });

  return { status: next, sessions_revoked: sessions, mfa_sessions_revoked: mfa };
}

/** A client that can open an interactive transaction. */
export interface TransactionalDb {
  $transaction: <T>(fn: (tx: LifecycleDb) => Promise<T>) => Promise<T>;
}

/**
 * ATOMIC transition - the form every route must use.
 *
 * `applyAgentStatusTransition` above performs four writes. Run against the
 * plain client they are four independent statements, so a failure between them
 * recreates the exact defect this module exists to close: Agent.status already
 * inactive while the accepted Session row survives.
 *
 * Wrapping them in one interactive transaction means a failure anywhere rolls
 * back all of it - the status stays as it was, the sessions stay as they were,
 * and no lifecycle audit is committed for a transition that did not happen.
 */
export async function transitionAgentStatus(
  db: TransactionalDb,
  agentId: bigint,
  next: AgentStatus,
  actor: LifecycleActor,
  opts: { previous?: string | null; ip?: string | null; reason?: string } = {},
): Promise<TransitionResult> {
  return db.$transaction((tx) =>
    applyAgentStatusTransition(tx, agentId, next, actor, opts));
}
