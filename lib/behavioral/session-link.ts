import prisma from "@/lib/prisma";
import { linkSessionToLead } from "@/lib/behavioral/events";

const SESSION_ID_MIN_LENGTH = 8;
const SESSION_ID_MAX_LENGTH = 128;

export function extractBehavioralSessionId(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const obj = input as Record<string, unknown>;
  const value =
    obj.sessionId ??
    obj.session_id ??
    obj.behavioralSessionId ??
    obj.anonymous_session_id;

  if (typeof value !== "string") return null;

  const sessionId = value.trim();
  if (
    sessionId.length < SESSION_ID_MIN_LENGTH ||
    sessionId.length > SESSION_ID_MAX_LENGTH
  ) {
    return null;
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(sessionId)) return null;

  return sessionId;
}

export async function linkBehavioralSessionToLead(
  sessionId: string | null,
  leadId: bigint,
): Promise<number> {
  if (!sessionId) return 0;

  try {
    const [linked] = await prisma.$transaction([
      prisma.behavioralEvent.updateMany({
        where: { session_id: sessionId, lead_id: null },
        data: { lead_id: leadId },
      }),
      prisma.lead.update({
        where: { id: leadId },
        data: { anonymous_session_id: sessionId },
      }),
    ]);

    return linked.count;
  } catch (err) {
    console.warn(
      "[behavioral] failed to link session to lead:",
      err instanceof Error ? err.message : err,
    );

    try {
      return await linkSessionToLead(sessionId, leadId);
    } catch {
      return 0;
    }
  }
}
