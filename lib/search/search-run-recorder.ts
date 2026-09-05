import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export interface SearchRunActor {
  userType: string;
  /** The EFFECTIVE user — unchanged semantics. */
  userId: bigint | null;
  /**
   * The REAL human actor when it differs — the principal broker during
   * delegated access. Null/absent for the cron caller, which has no session.
   */
  actorUserId?: bigint | null;
}

export interface RecordSearchRunInput {
  savedSearchId: string;
  actor: SearchRunActor;
  resultCount: number;
  limit?: number;
  offset?: number;
  source: "saved_search_execute" | "search_alert_cron";
  criteria?: Record<string, unknown>;
}

export async function recordSearchRun(input: RecordSearchRunInput): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      action: "search_run",
      entity_type: "saved_search",
      entity_id: input.savedSearchId,
      user_type: input.actor.userType,
      user_id: input.actor.userId,
      actor_user_id: input.actor.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: {
        source: input.source,
        resultCount: input.resultCount,
        limit: input.limit ?? null,
        offset: input.offset ?? null,
        criteria: input.criteria ?? null,
      } as Prisma.InputJsonValue,
    },
  });
}
