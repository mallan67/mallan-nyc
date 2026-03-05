// GET /api/idx/status
// IDX status endpoint — returns config, credential status, and sync stats.
// Broker-only.
import { NextRequest, NextResponse } from "next/server";
import { requireBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { getSyncStats } from "@/lib/idx/sync";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const enabled = process.env.IDX_ENABLED === "true";
    const credentialsPresent = hasCredentials();
    const ready = enabled && credentialsPresent;

    let stats = null;
    if (ready) {
      try {
        stats = await getSyncStats();
      } catch (err) {
        console.warn("[IDX Status] Could not fetch sync stats:", err);
      }
    }

    const endpointConfigured = Boolean(
      process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT
    );

    return NextResponse.json({
      enabled,
      credentialsPresent,
      endpointConfigured,
      ready: ready && endpointConfigured,
      stats,
    });
  } catch (err) {
    console.error("[IDX Status] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
