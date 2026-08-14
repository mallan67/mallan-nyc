// POST /api/idx/sync
// Broker-only manual trigger for Trestle sync.
// Rate-limited: 1 call per 5 minutes (enforced in middleware).
import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { syncListings, getPropertyKeysetCursor } from "@/lib/idx/sync";
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

    // ONE Property cursor contract — this manual route must resolve its resume
    // position exactly as the scheduled member does (lib/idx/idx-sync-member.ts).
    // Reading the bare timestamp and dropping the ListingKey would resume with
    // no tie-breaker, which cannot express "at T, after key K" and so either
    // re-reads or skips inside a same-timestamp cluster (production carries 797
    // rows at one ModificationTimestamp).
    //
    // NOTE on scoped runs: a `type` of "sale"/"rent" traverses a SUBSET, so
    // syncListings refuses to advance the shared cursor for it (see
    // `advancesGlobalCursor` there). Reading the position is still correct —
    // it only narrows what this manual run re-processes — but nothing this run
    // does can move the global position.
    const cursor = fullSync
      ? { since: null as Date | null, listingKey: null as string | null }
      : await getPropertyKeysetCursor();

    const result = await syncListings({
      type,
      since: cursor.since || undefined,
      sinceListingKey: cursor.listingKey,
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
