// /api/cron/listing-momentum — Daily 3pm: compute momentum scores for all active listings
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchComputeMomentum } from "@/lib/listing-momentum/scorer";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const result = await batchComputeMomentum(100);

    await prisma.auditEvent.create({
      data: {
        action: "cron_listing_momentum",
        entity_type: "cron",
        entity_id: "listing-momentum",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ ...result, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ...result, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_listing_momentum_error",
        entity_type: "cron",
        entity_id: "listing-momentum",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/listing-momentum] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
