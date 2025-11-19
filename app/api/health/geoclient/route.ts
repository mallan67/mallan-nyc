import { NextResponse } from "next/server";
export const runtime = "nodejs";
const mask = (s?: string | null) => (s ? `${s.slice(0,4)}…${s.slice(-4)}` : null);

export async function GET() {
  const k1 = (process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || "").trim() || null;
  const k2 = (process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY_2 || "").trim() || null;
  const kp = (process.env.GEOCLIENT_PRIMARY_KEY || "").trim() || null;
  const ks = (process.env.GEOCLIENT_SECONDARY_KEY || "").trim() || null;

  const v1id = (process.env.NYC_GEOCLIENT_APP_ID || process.env.GEOCLIENT_APP_ID || "").trim() || null;
  const v1key = (process.env.NYC_GEOCLIENT_APP_KEY || process.env.GEOCLIENT_APP_KEY || "").trim() || null;

  return NextResponse.json({
    ok: true,
    mode: k1 || k2 || kp || ks ? "v2 (subscription)" : (v1id && v1key) ? "v1 (legacy)" : "missing",
    present: {
      NYC_GEOCLIENT_SUBSCRIPTION_KEY: !!k1,
      NYC_GEOCLIENT_SUBSCRIPTION_KEY_2: !!k2,
      GEOCLIENT_PRIMARY_KEY: !!kp,
      GEOCLIENT_SECONDARY_KEY: !!ks,
      NYC_GEOCLIENT_APP_ID: !!v1id,
      NYC_GEOCLIENT_APP_KEY: !!v1key,
    },
    masked: {
      v2_primary: mask(k1 || kp),
      v2_secondary: mask(k2 || ks),
      v1_id: mask(v1id),
      v1_key: mask(v1key),
    }
  });
}
