import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isAuthError, requireAuth } from "@/lib/auth";

interface IntentPayload {
  event_type: string;
  session_id?: string;
  payload?: Record<string, unknown>;
}

function parseIntentPayload(input: unknown): IntentPayload | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.event_type !== "string") return null;

  const eventType = obj.event_type.trim();
  if (eventType.length === 0 || eventType.length > 64) return null;

  const sessionId = typeof obj.session_id === "string" ? obj.session_id.trim() : undefined;
  if (sessionId !== undefined && (sessionId.length < 8 || sessionId.length > 128)) return null;

  const payload =
    obj.payload && typeof obj.payload === "object" && !Array.isArray(obj.payload)
      ? (obj.payload as Record<string, unknown>)
      : {};

  if (JSON.stringify(payload).length > 10_000) return null;

  return {
    event_type: eventType,
    session_id: sessionId,
    payload,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const event = parseIntentPayload(body);
  if (!event) return new NextResponse(null, { status: 204 });

  const auth = await requireAuth(req);
  if (isAuthError(auth) || auth.userType !== "lead") {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await prisma.$transaction([
      prisma.intentEvent.create({
        data: {
          lead_id: auth.userId,
          event_type: event.event_type,
          session_id: event.session_id || null,
          payload: event.payload as Prisma.InputJsonValue,
        },
      }),
      prisma.buyerIntentProfile.upsert({
        where: { lead_id: auth.userId },
        create: {
          lead_id: auth.userId,
          event_count: 1,
          last_event_at: new Date(),
          preferred_neighborhoods: [],
          preferred_types: [],
          preferred_beds: [],
          amenity_preferences: [],
          preferred_boroughs: [],
          top_features: {} as Prisma.InputJsonValue,
        },
        update: {
          event_count: { increment: 1 },
          last_event_at: new Date(),
        },
      }),
    ]);
  } catch (err) {
    console.warn("[analytics/intent] failed to record event:", err instanceof Error ? err.message : err);
  }

  return new NextResponse(null, { status: 204 });
}
