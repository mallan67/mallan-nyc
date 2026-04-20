// GET /api/health — one URL to tell you if production is broken.
//
// Designed for operators who don't open the Vercel dashboard. Bookmark
// https://mallan.nyc/api/health, load it occasionally, and skim the "ok" field.
// Each check is narrow and fast so the whole handler returns well under 1s.
//
// Returns 200 with {ok:true} when everything is healthy; 503 otherwise with a
// "failures" array naming the broken checks. Uptime monitors (Cronitor,
// Better Uptime, UptimeRobot, Freshping, etc.) treat 503 as a page-fail
// automatically — so pointing any of them at this URL gives you free alerting.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const MIGRATION_SENTINEL = path.join(process.cwd(), ".next", "prisma-migration-state.json");

async function readMigrationSentinel(): Promise<{ status: string; diagnostic?: string; at?: string } | null> {
  try {
    const raw = await fs.readFile(MIGRATION_SENTINEL, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type CheckResult = { name: string; ok: boolean; detail?: string };

async function timedCheck(name: string, fn: () => Promise<string | void>, timeoutMs = 2500): Promise<CheckResult> {
  const started = Date.now();
  try {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout >${timeoutMs}ms`)), timeoutMs)
    );
    const detail = await Promise.race([fn(), timer]);
    return { name, ok: true, detail: `${typeof detail === "string" ? detail + " " : ""}(${Date.now() - started}ms)` };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : "unknown error" };
  }
}

export async function GET() {
  const checks: CheckResult[] = [];

  // 1. DB reachable — the single most likely way a deploy breaks silently.
  checks.push(
    await timedCheck("db", async () => {
      await prisma.$queryRaw`SELECT 1`;
      return "reachable";
    })
  );

  // 2. Migration state — the Vercel build writes a sentinel after running
  // scripts/vercel-migrate-deploy.js. "applied" = healthy; "skipped_cold_start"
  // = warn the operator to check next deploy; anything "blocked_*" means the
  // build should not have succeeded (but the operator deployed anyway).
  checks.push(
    await timedCheck("migration.state", async () => {
      const sentinel = await readMigrationSentinel();
      if (!sentinel) return "no sentinel (local dev or legacy deploy)";
      if (sentinel.status === "applied") return `applied @ ${sentinel.at ?? "unknown time"}`;
      throw new Error(`${sentinel.status}: ${sentinel.diagnostic ?? "no detail"}`);
    })
  );

  // 3. IDX data is fresh. sync cadence is */12min; flag if we're >2h stale.
  checks.push(
    await timedCheck("idx.sync_freshness", async () => {
      const state = await prisma.syncState.findUnique({
        where: { resource: "Property" },
        select: { last_run_at: true },
      });
      if (!state?.last_run_at) throw new Error("no Property sync has run yet");
      const ageMin = Math.round((Date.now() - state.last_run_at.getTime()) / 60_000);
      if (ageMin > 120) throw new Error(`stale — last sync ${ageMin} min ago`);
      return `last sync ${ageMin} min ago`;
    })
  );

  const ok = checks.every((c) => c.ok);
  const failures = checks.filter((c) => !c.ok).map((c) => c.name);

  return NextResponse.json(
    {
      ok,
      failures,
      checks,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local",
      region: process.env.VERCEL_REGION ?? "local",
      now: new Date().toISOString(),
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
