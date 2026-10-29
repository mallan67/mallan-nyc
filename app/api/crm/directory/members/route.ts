// GET /api/crm/directory/members
// Live Cotality Member lookup for the CRM pickers and Agent Search: by agent name, firm name, MLS ID or office MLS ID.
// Auth: agent or broker session cookie required. Read-only, identity fields only (no contact data), never cached publicly.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { DirectoryUpstreamError, parseMemberQuery, searchMembers } from "@/lib/idx/directory";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  if (process.env.IDX_ENABLED !== "true" || !hasCredentials()) {
    return NextResponse.json({ error: "Directory not available", code: "IDX_UNAVAILABLE" }, { status: 503, headers: NO_STORE });
  }

  const parsed = parseMemberQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  }

  try {
    const { rows, total } = await searchMembers(parsed.query);
    return NextResponse.json({ members: rows, total, source: "cotality-live" }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof DirectoryUpstreamError && err.status === 429) {
      const headers: Record<string, string> = { ...NO_STORE };
      if (err.retryAfterSeconds != null) headers["Retry-After"] = String(err.retryAfterSeconds);
      return NextResponse.json({ error: "Directory is rate limited, try again shortly", code: "DIRECTORY_RATE_LIMITED" }, { status: 429, headers });
    }
    console.error("[directory/members] upstream failure:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Directory lookup failed", code: "DIRECTORY_UPSTREAM" }, { status: 502, headers: NO_STORE });
  }
}
