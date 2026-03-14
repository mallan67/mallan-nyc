/**
 * Cron route handler factory. Eliminates 15-line boilerplate per cron route.
 *
 * Usage:
 *   import { createCronHandler } from '@/lib/api/cron-handler';
 *   import { batchCompute } from '@/lib/some-module';
 *   export const dynamic = 'force-dynamic';
 *   export const { GET } = createCronHandler('my-cron', () => batchCompute());
 *
 * Provides:
 * - CRON_SECRET auth check (Bearer token)
 * - try/catch with structured error response
 * - Timing (duration_ms in response)
 * - Console logging with cron name prefix
 * - AuditEvent logging (success + failure)
 * - One retry after 2s delay on first failure (within Vercel 30s timeout)
 *
 * Note: Vercel Cron sends GET requests. Always use the returned GET export.
 * Module-level exports (dynamic, runtime, maxDuration) must be set in the route file.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";

type CronResult = Record<string, unknown> | number | void;

/** Constant-time string comparison to prevent timing attacks on secret values. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createCronHandler(
  name: string,
  fn: () => Promise<CronResult>
) {
  function normalizeResult(result: CronResult): Record<string, unknown> {
    if (typeof result === "number") return { count: result };
    if (result && typeof result === "object") return result;
    return {};
  }

  async function logAudit(
    status: "success" | "failure",
    duration_ms: number,
    data: Record<string, unknown>,
    error?: string
  ) {
    try {
      await prisma.auditEvent.create({
        data: {
          action: `cron_${status}`,
          entity_type: "cron",
          entity_id: name,
          user_type: "system",
          user_id: null,
          changes: { duration_ms, ...data, ...(error ? { error } : {}) },
        },
      });
    } catch (auditErr) {
      // Don't let audit failure mask the real result
      console.warn(`[cron/${name}] Audit log failed:`, auditErr);
    }
  }

  async function attempt(): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
    try {
      const result = await fn();
      return { ok: true, data: normalizeResult(result) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, error: message };
    }
  }

  async function handler(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error(`[cron/${name}] CRON_SECRET env var is not set`);
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const start = Date.now();
    let result = await attempt();

    // Retry once after 2s on failure (stays within Vercel 30s timeout)
    if (!result.ok) {
      console.warn(`[cron/${name}] First attempt failed, retrying in 2s: ${result.error}`);
      await new Promise((r) => setTimeout(r, 2000));
      result = await attempt();
    }

    const duration_ms = Date.now() - start;

    if (result.ok) {
      console.log(`[cron/${name}] OK (${duration_ms}ms)`, JSON.stringify(result.data));
      await logAudit("success", duration_ms, result.data);
      return NextResponse.json({ ok: true, ...result.data, duration_ms });
    }

    console.error(`[cron/${name}] FAIL (${duration_ms}ms):`, result.error);
    await logAudit("failure", duration_ms, {}, result.error);
    return NextResponse.json(
      { ok: false, error: result.error, duration_ms },
      { status: 500 }
    );
  }

  return { GET: handler };
}
