// GET /api/cron/lifecycle-triggers
// Daily cron — evaluates all enabled lifecycle triggers against current scoring data
// (conviction scores, ghost status, listing momentum, stale inquiries, lease expirations,
// quarterly nurture cohort) and fires notifications/emails/agent alerts.
//
// Runs AFTER the scoring crons (lead-scoring 13:00 UTC, conviction-scores 14:00 UTC,
// listing-momentum 15:00 UTC) so it operates on fresh scoring data.
//
// On first run, auto-seeds DEFAULT_TRIGGERS from lib/lifecycle/engine.ts into the
// lifecycle_triggers table — no manual setup required.
//
// COMPLIANCE NOTES:
// - TCPA: engine.findQuarterlyNurtureTargets() already requires consent_captured_at
// - Fair Housing: no demographic-based triggers (see engine.ts header comment)
// - Cooldowns enforced per-trigger AND per-target to prevent spam
//
// Protected by CRON_SECRET header (Vercel Cron).

import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { evaluateAllTriggers, DEFAULT_TRIGGERS } from "@/lib/lifecycle/engine";
import type { Prisma } from "@prisma/client";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    !authHeader ||
    authHeader.length !== ("Bearer " + cronSecret).length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from("Bearer " + cronSecret))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();

  try {
    // ──────────────────────────────────────────────────────────────
    // Auto-seed default triggers on first run (idempotent — only seeds
    // if the table is empty). Future manual edits via CRM aren't overwritten.
    // ──────────────────────────────────────────────────────────────
    const existing = await prisma.lifecycleTrigger.count();
    let seeded = 0;
    if (existing === 0) {
      for (const t of DEFAULT_TRIGGERS) {
        await prisma.lifecycleTrigger.create({
          data: {
            name: t.name,
            trigger_type: t.trigger_type,
            conditions: t.conditions as Prisma.InputJsonValue,
            action_type: t.action_type,
            action_config: t.action_config as Prisma.InputJsonValue,
            cooldown_hours: t.cooldown_hours,
            enabled: true,
          },
        });
        seeded++;
      }
    }

    // ──────────────────────────────────────────────────────────────
    // Evaluate all enabled triggers against latest scoring data
    // ──────────────────────────────────────────────────────────────
    const result = await evaluateAllTriggers();

    const duration_ms = Date.now() - started;

    // Audit log — matches pattern of other scoring/trigger crons
    await prisma.auditEvent.create({
      data: {
        action: "cron_lifecycle_triggers",
        entity_type: "lifecycle_trigger",
        entity_id: "bulk",
        user_type: "system",
        user_id: null,
        changes: {
          seeded,
          evaluated: result.evaluated,
          fired: result.fired,
          suppressed: result.suppressed,
          duration_ms,
        },
      },
    });

    return NextResponse.json({
      success: true,
      seeded,
      ...result,
      duration_ms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Lifecycle Triggers Cron] Error:", msg);

    await prisma.auditEvent
      .create({
        data: {
          action: "cron_lifecycle_triggers_error",
          entity_type: "lifecycle_trigger",
          entity_id: "bulk",
          user_type: "system",
          user_id: null,
          changes: { error: msg },
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { error: `Lifecycle triggers cron failed: ${msg}` },
      { status: 500 }
    );
  }
}
