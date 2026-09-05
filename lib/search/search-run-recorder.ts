import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export interface SearchRunActor {
  userType: string;
  /** EFFECTIVE agent / business owner — becomes AuditEvent.user_id. */
  userId: bigint | null;
  /**
   * REAL actor during broker delegated access (frozen branch edab58bb: AuditEvent.actor_user_id).
   * Null for ordinary execution and for the cron's system user. This branch has no
   * actor_user_id column yet, so a non-null value is carried in `changes.actor_user_id`;
   * the delegated branch moves it to the column — a mechanical change, not a semantic one.
   */
  actorUserId?: bigint | null;
}

/**
 * Alert pipeline observability (cron only). Every stage is counted separately so the audit
 * says what ACTUALLY happened: `delivered` / `emailed` are the listings placed in the
 * successfully sent email — never a pre-hydration candidate count.
 */
export interface SearchRunDelta {
  since: string;
  /** Universe rows modified after `since`. */
  matched: number;
  unknownTimestamp: number;
  /** Excluded by this alert's own history (agent-only). */
  alreadyDelivered: number;
  /** Excluded by the Lead's canonical client history (lead-linked). */
  alreadySentToLead: number;
  /** Fresh candidates after exclusion, before the cap. */
  candidates: number;
  /** Candidates after the delivery cap. */
  capped: number;
  hydrationMissing: number;
  gateExcluded: number;
  /** Lead-linked candidates that could not be given a local identity (not sent). */
  unrepresentable: number;
  /** Listings actually in the successfully sent email (0 on failure / nothing to send). */
  emailed: number;
  /** Same meaning as `emailed` (kept for readers of earlier runs). */
  delivered: number;
  sendSuccess: boolean;
}

export interface RecordSearchRunInput {
  savedSearchId: string;
  actor: SearchRunActor;
  /** The canonical universe total (the Saved Search's result_count meaning). */
  resultCount: number;
  limit?: number;
  offset?: number;
  source: "saved_search_execute" | "search_alert_cron";
  criteria?: Record<string, unknown>;
  universe?: { total: number; countMeaning: "exact" | "lower_bound" };
  delta?: SearchRunDelta;
}

export async function recordSearchRun(input: RecordSearchRunInput): Promise<void> {
  const changes: Record<string, unknown> = {
    source: input.source,
    resultCount: input.resultCount,
    limit: input.limit ?? null,
    offset: input.offset ?? null,
    criteria: input.criteria ?? null,
    universe: input.universe ?? null,
    delta: input.delta ?? null,
  };
  if (input.actor.actorUserId != null) changes.actor_user_id = String(input.actor.actorUserId);
  await prisma.auditEvent.create({
    data: {
      action: "search_run",
      entity_type: "saved_search",
      entity_id: input.savedSearchId,
      user_type: input.actor.userType,
      user_id: input.actor.userId,
      changes: changes as Prisma.InputJsonValue,
    },
  });
}
