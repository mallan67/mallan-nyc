// /api/buildings/risk — Building Risk Intelligence
// Query: ?bbl=1234567890 or ?bin=1234567
// Returns: risk score, grade, components, NYC data summary
import { NextRequest, NextResponse } from "next/server";
import { sanitizeNumeric, sanitizeBIN } from "@/lib/sanitize";
import { computeBuildingRisk } from "@/lib/building-risk/scorer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const bblRaw = (req.nextUrl.searchParams.get("bbl") || "").trim();
    const binRaw = (req.nextUrl.searchParams.get("bin") || "").trim();

    if (!bblRaw && !binRaw) {
      return NextResponse.json(
        { ok: false, error: "bbl or bin required" },
        { status: 400 }
      );
    }

    let bbl: string | null = null;
    let bin: string | undefined;

    if (bblRaw) {
      bbl = sanitizeNumeric(bblRaw);
      if (!bbl) {
        return NextResponse.json(
          { ok: false, error: "bbl must be numeric" },
          { status: 400 }
        );
      }
    }

    if (binRaw) {
      const cleanBin = sanitizeBIN(binRaw);
      if (!cleanBin) {
        return NextResponse.json(
          { ok: false, error: "bin must be numeric" },
          { status: 400 }
        );
      }
      bin = cleanBin;
    }

    if (!bbl) {
      return NextResponse.json(
        { ok: false, error: "bbl is required (bin alone is not sufficient for ECB lookups)" },
        { status: 400 }
      );
    }

    const report = await computeBuildingRisk(bbl, bin);

    return NextResponse.json(
      { ok: true, ...report },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[building-risk] Error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
