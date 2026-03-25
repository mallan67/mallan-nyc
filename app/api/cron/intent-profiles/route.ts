// /api/cron/intent-profiles — Daily 11am: recompute BuyerIntentProfile for leads with recent activity
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchRecompute } from "@/lib/buyer-intent/profiler";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const computed = await batchRecompute(50);

    await prisma.auditEvent.create({
      data: {
        action: "cron_intent_profiles",
        entity_type: "cron",
        entity_id: "intent-profiles",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ computed, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ computed, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_intent_profiles_error",
        entity_type: "cron",
        entity_id: "intent-profiles",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/intent-profiles] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
