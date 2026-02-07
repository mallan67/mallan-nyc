import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const expectedKey = process.env.PRIVATE_COLLECTION_PASS;

  if (!expectedKey || key !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    env: {
      NYC_SODA_APP_TOKEN: !!process.env.NYC_SODA_APP_TOKEN,
      SOCRATA_APP_TOKEN: !!process.env.SOCRATA_APP_TOKEN,
      SODA_DATASET_DOB_VIOLATIONS: !!process.env.SODA_DATASET_DOB_VIOLATIONS,
      SODA_DATASET_DOB_PERMITS: !!process.env.SODA_DATASET_DOB_PERMITS,
      SODA_DATASET_DOB_COMPLAINTS: !!process.env.SODA_DATASET_DOB_COMPLAINTS,
      SODA_DATASET_OATH_ECB: !!process.env.SODA_DATASET_OATH_ECB,
      SODA_DATASET_ACRIS_MASTER: !!process.env.SODA_DATASET_ACRIS_MASTER,
      SODA_DATASET_ACRIS_REALPROPERTY: !!process.env.SODA_DATASET_ACRIS_REALPROPERTY,
      NYC_GEOCLIENT_SUBSCRIPTION_KEY: !!process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY,
      NYC_GEOCLIENT_APP_ID: !!process.env.NYC_GEOCLIENT_APP_ID,
      NYC_GEOCLIENT_APP_KEY: !!process.env.NYC_GEOCLIENT_APP_KEY,
      GEOCLIENT_APP_KEY: !!process.env.GEOCLIENT_APP_KEY,
    },
  });
}
