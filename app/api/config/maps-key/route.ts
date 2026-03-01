// GET /api/config/maps-key
// Returns the Google Maps API key from env vars so it never appears in source.
// The key itself is still public (sent to browser) but restricted by domain in GCP.
import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  return NextResponse.json({ key });
}
