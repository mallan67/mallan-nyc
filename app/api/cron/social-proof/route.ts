// /api/cron/social-proof — Daily 4pm: compute anonymized demand signals per active listing
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { batchComputeSocialProof } from "@/lib/social-proof/cache";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || (() => { const expected = "Bearer " + (process.env.CRON_SECRET || ""); return authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected)); })()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    const result = await batchComputeSocialProof(100);

    await prisma.auditEvent.create({
      data: {
        action: "cron_social_proof",
        entity_type: "cron",
        entity_id: "social-proof",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ ...result, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ...result, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_social_proof_error",
        entity_type: "cron",
        entity_id: "social-proof",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/social-proof] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
