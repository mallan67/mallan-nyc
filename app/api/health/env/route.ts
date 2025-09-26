import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  const need = [
    "NYC_SODA_APP_TOKEN",
    "SODA_DATASET_DOB_VIOLATIONS",
    "SODA_DATASET_DOB_PERMITS",
    "SODA_DATASET_DOB_COMPLAINTS",
    "SODA_DATASET_OATH_ECB",
    "SODA_DATASET_ACRIS_MASTER",
    "SODA_DATASET_ACRIS_REALPROPERTY",
    "NYC_GEOCLIENT_SUBSCRIPTION_KEY",
    "NYC_GEOCLIENT_APP_ID",
    "NYC_GEOCLIENT_APP_KEY",
  ];

  const env = Object.fromEntries(need.map((k) => [k, !!process.env[k]]));
  return NextResponse.json({ ok: true, env });
}
