// /api/cron/intent-profiles — Daily 11am: recompute BuyerIntentProfile for leads with recent activity
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchRecompute } from "@/lib/buyer-intent/profiler";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    return NextResponse.json({ ok: true, computed, durationMs: Date.now() - started });
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
