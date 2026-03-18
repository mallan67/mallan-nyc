// POST /api/idx/sync-historical
// Broker-only endpoint to pull an agent's historical listings from Trestle.
// Fetches Closed (Sold/Rented), Expired, Hold (Temp Off), Withdrawn (Perm Off).
// Matches agent by license_no → Trestle ListAgentMlsId / ListAgentStateLicense.
import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { syncAgentHistory } from "@/lib/idx/sync";
import { hasCredentials } from "@/lib/idx/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

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

  // Parse options from request body
  let agentId: string | undefined;
  let type: "sale" | "rent" | undefined;
  let maxRecords = 2000;

  try {
    const body = await req.json();
    agentId = body.agentId ? String(body.agentId) : undefined;
    if (body.type === "sale" || body.type === "rent") type = body.type;
    if (body.maxRecords && typeof body.maxRecords === "number") {
      maxRecords = Math.min(body.maxRecords, 5000);
    }
  } catch {
    // No body — will default to current user
  }

  try {
    // Resolve agent: if agentId provided, look up that agent; otherwise use current broker
    let agent;
    if (agentId) {
      agent = await prisma.agent.findUnique({
        where: { id: BigInt(agentId) },
        select: { id: true, license_no: true, trestle_mls_id: true, full_name: true, first_name: true, last_name: true },
      });
    } else {
      // Default to the logged-in broker's own listings
      agent = await prisma.agent.findUnique({
        where: { id: auth.userId },
        select: { id: true, license_no: true, trestle_mls_id: true, full_name: true, first_name: true, last_name: true },
      });
    }

    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // The agent's trestle_mls_id is the REBNY member ID on Trestle (e.g. "39361").
    // This is different from the NY state license number (license_no).
    // Falls back to license_no if trestle_mls_id is not set.
    const agentMlsId = agent.trestle_mls_id || agent.license_no;
    if (!agentMlsId) {
      return NextResponse.json(
        { error: "Agent has no Trestle MLS ID or license number on file. Set trestle_mls_id on the Agent record." },
        { status: 422 }
      );
    }

    const agentName = agent.full_name || `${agent.first_name} ${agent.last_name}`;
    console.log(`[IDX Historical] Syncing history for ${agentName} (license: ${agentMlsId})`);

    const result = await syncAgentHistory({
      agentMlsId,
      agentDbId: agent.id,
      type,
      maxRecords,
    });

    await logAuditEvent("idx_sync_historical_trigger", "listing", "bulk", auth, {
      ...result,
      agentMlsId,
      agentName,
      type: type || "all",
    });

    return NextResponse.json({
      success: true,
      agent: agentName,
      agentMlsId,
      ...result,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[IDX Historical Sync] Error:", errorMessage);

    return NextResponse.json(
      { error: `Historical sync failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
