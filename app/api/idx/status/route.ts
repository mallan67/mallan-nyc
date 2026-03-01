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

    return NextResponse.json({
      enabled,
      credentialsPresent,
      ready,
      endpoint: process.env.IDX_BASE_URL || "https://api.cotality.com",
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
