// /api/cron/seller-scoring — Daily 8am: re-score stale SellerLead records using NYC Open Data
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchRescore } from "@/lib/seller-readiness/scorer";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const scored = await batchRescore(50);

    await prisma.auditEvent.create({
      data: {
        action: "cron_seller_scoring",
        entity_type: "cron",
        entity_id: "seller-scoring",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ scored, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ok: true, scored, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_seller_scoring_error",
        entity_type: "cron",
        entity_id: "seller-scoring",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/seller-scoring] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
