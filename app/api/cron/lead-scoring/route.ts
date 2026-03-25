// /api/cron/lead-scoring — Daily 1pm: batch-score leads with stale LeadScore records
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchScoreLeads } from "@/lib/lead-scoring/scorer";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const scored = await batchScoreLeads(100);

    await prisma.auditEvent.create({
      data: {
        action: "cron_lead_scoring",
        entity_type: "cron",
        entity_id: "lead-scoring",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ scored, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ scored, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_lead_scoring_error",
        entity_type: "cron",
        entity_id: "lead-scoring",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/lead-scoring] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
