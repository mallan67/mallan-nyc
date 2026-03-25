import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const k1 = (process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || "").trim() || null;
  const k2 = (process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 || "").trim() || null;
  const kp = (process.env.GEOCLIENT_PRIMARY_KEY || "").trim() || null;
  const ks = (process.env.GEOCLIENT_SECONDARY_KEY || "").trim() || null;

  const v1id = (process.env.NYC_GEOCLIENT_APP_ID || process.env.GEOCLIENT_APP_ID || "").trim() || null;
  const v1key = (process.env.NYC_GEOCLIENT_APP_KEY || process.env.GEOCLIENT_APP_KEY || "").trim() || null;

  return NextResponse.json({ mode: k1 || k2 || kp || ks ? "v2 (subscription)" : (v1id && v1key) ? "v1 (legacy)" : "missing",
    present: {
      NYC_GEOCLIENT_SUBSCRIPTION_KEY: !!k1,
      NYC_GEOCLIENT_SUBSCRIPTION_KEY_2: !!k2,
      GEOCLIENT_PRIMARY_KEY: !!kp,
      GEOCLIENT_SECONDARY_KEY: !!ks,
      NYC_GEOCLIENT_APP_ID: !!v1id,
      NYC_GEOCLIENT_APP_KEY: !!v1key,
    },
  });
}
