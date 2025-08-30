import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasGeoclientId: !!process.env.GEOCLIENT_APP_ID,
    hasGeoclientKey: !!process.env.GEOCLIENT_APP_KEY,
    hasSocrata: !!process.env.SOCRATA_APP_TOKEN,
    node: process.version,
  });
}
