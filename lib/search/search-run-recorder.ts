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
  /** Alert delivery rule applied over the complete universe (cron only). */
  delta?: { since: string; matched: number; delivered: number; unknownTimestamp: number };
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
