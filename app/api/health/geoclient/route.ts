import { NextResponse } from "next/server";
export const runtime = "nodejs";
const mask = (s?: string | null) => (s ? `${s.slice(0,4)}…${s.slice(-4)}` : null);

export async function GET() {
  const v2 = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY
    || process.env.GEOCLIENT_SUBSCRIPTION_KEY
    || process.env.GEOCLIENT_PRIMARY_KEY;

  const v1id = process.env.NYC_GEOCLIENT_APP_ID || process.env.GEOCLIENT_APP_ID;
  const v1key = process.env.NYC_GEOCLIENT_APP_KEY || process.env.GEOCLIENT_APP_KEY;

  const mode = v2 ? "v2 (subscription)"
    : (v1id && v1key) ? "v1 (legacy)"
    : "missing";

  return NextResponse.json({
    ok: true, mode,
    present: {
      NYC_GEOCLIENT_SUBSCRIPTION_KEY: !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY,
      GEOCLIENT_SUBSCRIPTION_KEY:     !!process.env.GEOCLIENT_SUBSCRIPTION_KEY,
      GEOCLIENT_PRIMARY_KEY:          !!process.env.GEOCLIENT_PRIMARY_KEY,
      NYC_GEOCLIENT_APP_ID:           !!process.env.NYC_GEOCLIENT_APP_ID,
      NYC_GEOCLIENT_APP_KEY:          !!process.env.NYC_GEOCLIENT_APP_KEY,
      GEOCLIENT_APP_ID:               !!process.env.GEOCLIENT_APP_ID,
      GEOCLIENT_APP_KEY:              !!process.env.GEOCLIENT_APP_KEY,
    },
    masked: { v2: mask(v2 || null), v1_id: mask(v1id || null), v1_key: mask(v1key || null) },
  });
}
