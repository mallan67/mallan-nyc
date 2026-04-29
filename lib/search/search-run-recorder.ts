import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export interface SearchRunActor {
  userType: string;
  userId: bigint | null;
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
