// lib/auth/session.ts
// Server-side session management backed by PostgreSQL
import { randomUUID } from "crypto";
import prisma from "@/lib/prisma";
import { isPrincipalBroker, isLicenseeAccessRole } from "@/lib/agents/brokerage-role";

// Per-role session durations (must match cookie-config.ts maxAge values)
const SESSION_TTL_MS = {
  broker: 24 * 60 * 60 * 1000,   // 24 hours
  agent:   8 * 60 * 60 * 1000,   //  8 hours
  client: 30 * 24 * 60 * 60 * 1000, // 30 days
  default: 24 * 60 * 60 * 1000,  // 24 hours fallback
} as const;

// Refresh threshold: 1 hour before expiry (or 10% of TTL, whichever is smaller)
const REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// UCBA Art. III §6 ethics training tracking (Workstream C4b).
// Ethics training is an ADMINISTRATIVE compliance RECORD only. The DB fields
// (ethics_training_completed_at, ethics_training_expires_at), the admin panel
// at /broker/people/ethics, and the ethics-training admin API are for record-
// keeping and broker-directed follow-up. Ethics/CE dates do NOT block session
// creation, login, or MFA — authentication is governed solely by account
// status (active/inactive/suspended). Missing or expired ethics training must
// never automatically block login. It is NOT wired into any automated
// authentication or listing-submission gate.
//
// PR-Licensing.1: Licensing Department workflow (agent self-upload of
// proof, renewal reminders, broker review dashboard) is the next PR.
// ─────────────────────────────────────────────────────────────────────────────

// The throwing enforcement primitives that once lived here —
// `EthicsTrainingExpiredError` and `assertAgentEthicsTrainingValid()` — have
// been removed. They had no approved production caller, and ethics training is
// NOT an authentication or listing-submission gate (see the module header and
// commit 2c10ce0b). Ethics-training records are maintained through the broker
// admin API (app/api/crm/agents/[id]/ethics-training/route.ts, which writes an
// audit event) and surfaced read-only by
// scripts/ethics-training-status-report.ts for broker follow-up.

/** Resolve the correct TTL for a user type + role combination */
function getSessionDurationMs(userType: string, role: string): number {
  if (role === "BROKER" || role === "broker") return SESSION_TTL_MS.broker;
  if (userType === "agent") return SESSION_TTL_MS.agent;
  if (userType === "lead") return SESSION_TTL_MS.client;
  return SESSION_TTL_MS.default;
}

export interface SessionUser {
  /**
   * The EFFECTIVE user — who this session acts as. During delegated access
   * this is the AGENT, so every authorisation decision downstream operates
   * with the agent's permissions and NOT the broker's.
   */
  userId: bigint;
  userType: "agent" | "lead";
  /** The EFFECTIVE role. During delegation this is the agent's role. */
  role: string;
  sessionId: string;
  /**
   * Parent broker `Session.id` when this session is delegated, else null.
   * An ID — NEVER a token. Null means an ordinary session.
   */
  parentSessionId: string | null;
  /**
   * The REAL HUMAN ACTOR when it differs from the effective user — i.e. the
   * principal broker's id during delegated access. Null for ordinary
   * activity, which means actor == effective user.
   *
   * Resolved from the PARENT SESSION ROW, never from the child, so it cannot
   * be forged by writing to the delegated row.
   */
  actorUserId: bigint | null;
}

/**
 * Hard ceiling on a delegated session, measured from creation.
 *
 * This is a MAXIMUM LIFETIME, not a sliding window: it is never extended by
 * use and never re-derived from the target agent's role. Before this existed,
 * the impersonate route set a 2h COOKIE over an 8h SERVER ROW, so the server
 * kept honouring the delegation for six hours after the browser stopped
 * showing it.
 */
export const DELEGATED_SESSION_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * What the caller must state to create a DELEGATED session. Both fields are
 * required together: a duration may only be supplied for a delegation, so no
 * ordinary login path can quietly mint a session with a hand-picked lifetime.
 */
export interface DelegationSpec {
  /** The parent broker `Session.id`. An ID — NEVER a token. */
  parentSessionId: string;
  /** Hard ceiling from creation. Clamped down to the parent's own expiry. */
  maxLifetimeMs: number;
}

export type DelegationRefusalReason =
  | "PARENT_NOT_FOUND"
  | "PARENT_EXPIRED"
  | "PARENT_IS_DELEGATED"
  | "PARENT_NOT_BROKER"
  | "TARGET_IS_BROKER"
  | "TARGET_NOT_LICENSEE";

/**
 * MAY A DELEGATED SESSION BE CREATED FOR THIS TARGET ROLE?
 *
 * The product rule: delegated access exists so the PRINCIPAL BROKER can enter
 * an AGENT / ASSOCIATE-BROKER account. A target carrying principal BROKER
 * authority is REFUSED, so that no delegated session can ever hold broker
 * powers at all.
 *
 * This is deliberately STRONGER than the anti-chaining rule. Anti-chaining
 * only stops a delegated broker-role session from delegating AGAIN; it would
 * still leave a live session carrying broker authority whose real actor is
 * hidden behind a delegation. Refusing the target outright removes that
 * session from existence rather than merely limiting what it can do next.
 *
 * Legacy "AGENT" rows are accepted: they state no profession, but they are
 * real non-broker licensee accounts that still exist and still need support.
 */
export function isDelegationTargetRole(role: string | null | undefined): boolean {
  return isLicenseeAccessRole(role) && !isPrincipalBroker(role);
}

/**
 * Thrown INSTEAD of creating a session row. Every refusal path leaves the
 * sessions table untouched — a refused delegation must not leave a usable
 * credential behind.
 */
export class DelegationRefusedError extends Error {
  readonly reason: DelegationRefusalReason;
  constructor(reason: DelegationRefusalReason) {
    super(`Delegation refused: ${reason}`);
    this.name = "DelegationRefusedError";
    this.reason = reason;
  }
}

/** A newly created session row, with the expiry the SERVER actually stored. */
export interface CreatedSession {
  token: string;
  sessionId: string;
  /** The stored `expires_at`. Cookie maxAge must be derived from THIS. */
  expiresAt: Date;
}

/** The preserved parent broker session, handed back with a fresh token. */
export interface RestoredParentSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
  userId: bigint;
  role: string;
}

/**
 * THE SINGLE WRITER for session rows — ordinary and delegated alike.
 *
 * There is deliberately no second creation path: broker delegated access is a
 * property of a normal session row (one nullable column), not a parallel
 * authentication system with its own table, cookie and lifetime rules.
 *
 * Returns the token AND the expiry the server actually stored, so a caller can
 * size the cookie from the real row instead of guessing. Guessing is exactly
 * how the impersonate route ended up with a 2h cookie over an 8h server row.
 *
 * When `delegation` is supplied the parent is validated FAIL-CLOSED and no row
 * is created unless every check passes.
 */
export async function createSessionRecord(
  userType: "agent" | "lead",
  userId: bigint,
  role: string,
  ipAddress?: string,
  userAgent?: string,
  delegation?: DelegationSpec
): Promise<CreatedSession> {
  // Ethics/CE tracking lives in the DB and admin panel but does NOT
  // block session creation. Compliance is enforced at listing submission.

  const token = randomUUID();
  const now = Date.now();

  let expiresAt: Date;
  let parentSessionId: string | null = null;

  if (delegation) {
    // ── TARGET RULE — enforced at the SINGLE WRITER, not only at the route ──
    // No delegated session may ever carry principal BROKER authority. Putting
    // it here means no present or future caller can create one by going round
    // the route, and it is checked BEFORE the parent lookup so a refused
    // delegation costs nothing and creates nothing.
    if (isPrincipalBroker(role)) throw new DelegationRefusedError("TARGET_IS_BROKER");
    if (!isDelegationTargetRole(role)) throw new DelegationRefusedError("TARGET_NOT_LICENSEE");

    const parent = await prisma.session.findUnique({
      where: { id: delegation.parentSessionId },
      select: { id: true, role: true, expires_at: true, parent_session_id: true },
    });

    // ── INVARIANT 1 — the parent must be a genuine, live, BROKER session ──
    if (!parent) throw new DelegationRefusedError("PARENT_NOT_FOUND");
    if (parent.expires_at.getTime() <= now) throw new DelegationRefusedError("PARENT_EXPIRED");

    // ── INVARIANT 2 — NO CHAINING ──
    // A delegated session may never create a further delegated session. This
    // is the check that actually closes the escalation path: a broker may
    // delegate into another row whose role is BROKER, and that child would
    // then satisfy requireBroker() and could delegate again. A chain would
    // obscure which human is really acting, which is the whole point here.
    if (parent.parent_session_id !== null) throw new DelegationRefusedError("PARENT_IS_DELEGATED");

    // Principal broker only. Narrow, and deliberately kept narrow — an
    // associate broker does not acquire this authority.
    if (!isPrincipalBroker(parent.role)) throw new DelegationRefusedError("PARENT_NOT_BROKER");

    // ── INVARIANT 4 — a child may never outlive its parent ──
    // Clamp at creation, so the bound holds even if nothing revalidates later.
    const cap = new Date(now + delegation.maxLifetimeMs);
    expiresAt = cap.getTime() < parent.expires_at.getTime() ? cap : parent.expires_at;
    parentSessionId = parent.id;
  } else {
    expiresAt = new Date(now + getSessionDurationMs(userType, role));
  }

  const created = await prisma.session.create({
    data: {
      token,
      user_type: userType,
      // The EFFECTIVE user. For a delegated row this is the AGENT — the
      // broker's identity is reachable only through parent_session_id.
      user_id: userId,
      role,
      expires_at: expiresAt,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
      // An ID, never a token. No parent credential is copied anywhere.
      parent_session_id: parentSessionId,
    },
    select: { id: true },
  });

  return { token, sessionId: created.id, expiresAt };
}

/**
 * Create a new session for a user.
 * Returns the session token (to set as httpOnly cookie).
 * DB expires_at matches the cookie maxAge for the user's role.
 *
 * Thin wrapper over createSessionRecord() for the ~10 ordinary login callers
 * that only need the token.
 */
export async function createSession(
  userType: "agent" | "lead",
  userId: bigint,
  role: string,
  ipAddress?: string,
  userAgent?: string,
  delegation?: DelegationSpec
): Promise<string> {
  const created = await createSessionRecord(userType, userId, role, ipAddress, userAgent, delegation);
  return created.token;
}

/**
 * Validate a session token.
 * Returns the session user if valid, null if expired/missing.
 * Automatically rotates the token if close to expiry.
 *
 * ── FAIL-CLOSED PRECEDENCE, in this exact order ──────────────────────
 *   no parent_session_id                  -> ordinary session (sliding refresh)
 *   parent present, resolvable and valid  -> EFFECTIVE AGENT permissions
 *   parent unresolvable or expired        -> null. FAIL CLOSED.
 *
 * The third branch is the one that matters. It must NEVER fall back to broker
 * authority and must never treat the row as an ordinary agent session: either
 * would turn a lapsed delegation into standing access that nobody granted.
 */
export async function validateSession(
  token: string
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
  });

  if (!session) return null;

  const now = new Date();
  if (session.expires_at < now) {
    // Expired — clean up and return null. For a delegated row the cascade
    // takes any children with it; the PARENT is never touched from here.
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }

  let actorUserId: bigint | null = null;

  if (session.parent_session_id !== null) {
    // ── DELEGATED SESSION ──
    const parent = await prisma.session.findUnique({
      where: { id: session.parent_session_id },
      select: { user_id: true, role: true, expires_at: true, parent_session_id: true },
    });

    // Parent gone. ON DELETE CASCADE normally removes the child with it, so
    // reaching here means the row outlived its parent some other way (a
    // restored dump, a manual edit). Refuse it — do not "recover" it into an
    // ordinary session, which is precisely what onDelete: SetNull would have
    // done silently at the database level.
    if (!parent) return null;

    // ── INVARIANT 5 — parent expiry invalidates the child immediately ──
    if (parent.expires_at < now) return null;

    // ── INVARIANT 2 — a chain is never valid, even if one got written ──
    if (parent.parent_session_id !== null) return null;

    // The real human actor, read from the PARENT ROW. It cannot be forged by
    // writing to the delegated row, because the delegated row never holds it.
    actorUserId = parent.user_id;

    // ── INVARIANT 3 — NO SLIDING REFRESH FOR A DELEGATED ROW ──
    // Deliberately no update here. A delegated session has a FIXED MAXIMUM
    // LIFETIME from creation: it cannot be extended by use, and its duration
    // is never re-derived from the target agent's role. Running the block
    // below would silently re-extend a 2h delegation to the agent's 8h.
  } else {
    // ── ORDINARY SESSION ──
    // Rotate if within refresh threshold — use role-appropriate duration
    const timeUntilExpiry = session.expires_at.getTime() - Date.now();
    if (timeUntilExpiry < REFRESH_THRESHOLD_MS) {
      const durationMs = getSessionDurationMs(session.user_type, session.role);
      await prisma.session.update({
        where: { token },
        data: { expires_at: new Date(Date.now() + durationMs) },
      });
    }
  }

  return {
    // The EFFECTIVE identity — the agent during delegation.
    userId: session.user_id,
    userType: session.user_type as "agent" | "lead",
    role: session.role,
    sessionId: session.id,
    parentSessionId: session.parent_session_id,
    actorUserId,
  };
}

/**
 * RETURN TO BROKER — end a delegated session and hand the broker back their
 * OWN session, with no second MFA.
 *
 * The parent row was never destroyed when the delegation started, so there is
 * nothing to re-authenticate: the broker's authority still exists server-side.
 * What changes is the token. A FRESH token is rotated onto the preserved
 * parent row and the delegated row is deleted, in one transaction.
 *
 * Rotating rather than reusing matters: the pre-delegation token is discarded,
 * so nothing that may have observed it can replay it, and at no point is a
 * parent credential copied onto the delegated row or into a second cookie.
 *
 * Returns null — destroying the delegated row on the way out — when the caller
 * is not delegated or the parent is no longer valid. Fail closed: never mint
 * broker authority that the parent session does not still carry.
 */
export async function endDelegationAndRotateParent(
  delegatedSessionId: string
): Promise<RestoredParentSession | null> {
  const delegated = await prisma.session.findUnique({
    where: { id: delegatedSessionId },
    select: { id: true, parent_session_id: true },
  });
  if (!delegated || delegated.parent_session_id === null) return null;

  const parent = await prisma.session.findUnique({
    where: { id: delegated.parent_session_id },
    select: { id: true, user_id: true, role: true, expires_at: true, parent_session_id: true },
  });

  if (!parent || parent.expires_at < new Date() || parent.parent_session_id !== null) {
    // Nothing legitimate to return to. Destroy the delegated row so the
    // caller is left with no session at all rather than a stranded one.
    await prisma.session.delete({ where: { id: delegated.id } }).catch(() => {});
    return null;
  }

  const newParentToken = randomUUID();
  await prisma.$transaction([
    prisma.session.update({
      where: { id: parent.id },
      data: { token: newParentToken },
    }),
    // Destroys ONLY the delegated row. The agent's own sessions are separate
    // rows with parent_session_id = null and are untouched.
    prisma.session.delete({ where: { id: delegated.id } }),
  ]);

  return {
    token: newParentToken,
    sessionId: parent.id,
    expiresAt: parent.expires_at,
    userId: parent.user_id,
    role: parent.role,
  };
}

/**
 * Destroy a session (logout).
 */
export async function destroySession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

/**
 * Clean up expired sessions. Call from cron job.
 */
export async function cleanExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expires_at: { lt: new Date() } },
  });
  return result.count;
}
