// /api/cron/lifecycle-triggers — Daily 5pm: evaluate all enabled triggers, fire notifications
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { evaluateAllTriggers } from "@/lib/lifecycle/engine";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    // Seed default triggers if table is empty (first-run)
    const triggerCount = await prisma.lifecycleTrigger.count();
    if (triggerCount === 0) {
      // Import and seed DEFAULT_TRIGGERS on first run.
      // Support either a named export or a default export with the function.
      const engine: any = await import("@/lib/lifecycle/engine");
      const seedDefaultTriggers = engine.seedDefaultTriggers || engine.default?.seedDefaultTriggers;
      if (typeof seedDefaultTriggers === "function") {
        await seedDefaultTriggers();
      } else {
        throw new Error("seedDefaultTriggers is not exported from @/lib/lifecycle/engine");
      }
    }

    const result = await evaluateAllTriggers();

    await prisma.auditEvent.create({
      data: {
        action: "cron_lifecycle_triggers",
        entity_type: "cron",
        entity_id: "lifecycle-triggers",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ ...result, durationMs: Date.now() - started })),
      },
    });

    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - started });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.auditEvent.create({
      data: {
        action: "cron_lifecycle_triggers_error",
        entity_type: "cron",
        entity_id: "lifecycle-triggers",
        user_type: "system",
        changes: JSON.parse(JSON.stringify({ error: message })),
      },
    }).catch(() => {});

    console.error("[cron/lifecycle-triggers] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
