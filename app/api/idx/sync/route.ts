// POST /api/idx/sync
// Broker-only manual trigger for Trestle sync.
// Rate-limited: 1 call per 5 minutes (enforced in middleware).
import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { syncListings, getLastSyncTimestamp } from "@/lib/idx/sync";
import { hasCredentials } from "@/lib/idx/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  // Check IDX is enabled and credentials present
  if (process.env.IDX_ENABLED !== "true") {
    return NextResponse.json(
      { error: "IDX is disabled. Set IDX_ENABLED=true." },
      { status: 503 }
    );
  }

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "IDX credentials not configured." },
      { status: 503 }
    );
  }

  try {
    // Parse options from request body
    let type: "sale" | "rent" | undefined;
    let fullSync = false;
    let maxRecords = 1000;

    try {
      const body = await req.json();
      if (body.type === "sale" || body.type === "rent") type = body.type;
      if (body.fullSync === true) fullSync = true;
      if (body.maxRecords && typeof body.maxRecords === "number") {
        maxRecords = Math.min(body.maxRecords, 5000);
      }
    } catch {
      // No body is fine — use defaults
    }

    // Get last sync time for incremental
    const since = fullSync ? undefined : (await getLastSyncTimestamp()) || undefined;

    const result = await syncListings({
      type,
      since: since || undefined,
      maxRecords,
      fullSync,
    });

    await logAuditEvent("idx_sync_trigger", "listing", "bulk", auth, {
      ...result,
      type: type || "all",
      fullSync,
    }, req.headers.get("x-forwarded-for") || "unknown");

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[IDX Sync API] Error:", errorMessage);

    return NextResponse.json(
      { error: `Sync failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
