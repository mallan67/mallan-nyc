// GET /api/health — simple reachability probe.
//
// Intentionally zero DB operations. Per docs/DEPLOYMENT.md the health endpoint
// only confirms the Next.js runtime is serving HTTP — that alone is enough for
// Vercel / uptime monitors to detect a fully-down site. Running DB queries on
// every probe would burn Neon compute (free-tier budget: 191.9 hrs/month) for
// no incremental signal: the real user-facing routes already hit the DB, and
// when Neon is suspended THEY return 500s — that's where alerting should come
// from, not from a purpose-built probe that itself contributes to the burn.
//
// If deep-probe checks are ever needed (schema drift, sync freshness, etc.),
// add them on a separate authenticated endpoint and call it manually / on a
// cron, not from uptime monitors.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: true });
}
