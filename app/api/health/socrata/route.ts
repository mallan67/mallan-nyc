// app/api/health/socrata/route.ts
import { NextResponse } from "next/server";
import { sodaFetch, sodaTokenMasked } from "@/lib/soda";
export const runtime = "nodejs";

export async function GET() {
  // Use your configured dataset IDs; DOB violations is a safe 1-row probe
  const ds = process.env.SODA_DATASET_DOB_VIOLATIONS || "3h2n-5cm9";
  const r = await sodaFetch(ds, { $limit: 1 });

  return NextResponse.json({
    ok: r.ok,
    dataset: ds,
    tokenPresent: !!sodaTokenMasked(),
    tokenMasked: sodaTokenMasked(),
    status: (r as any).status ?? 200,
    sample: r.ok ? (r as any).data : (r as any).error,
  });
}
