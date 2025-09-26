import { NextResponse } from "next/server";
import { soda } from "@/lib/soda";
export const runtime = "nodejs";

const DATASET = process.env.SODA_DATASET_OATH_ECB!;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const bbl = (u.searchParams.get("bbl") || "").trim();
    const openOnly = (u.searchParams.get("open") || "1") === "1";
    if (!bbl) return NextResponse.json({ ok: false, error: "bbl required" }, { status: 400 });

    if (!DATASET) throw new Error("SODA_DATASET_OATH_ECB is not set");

    const where = [`bbl='${bbl}'`, openOnly ? `violation_status='OPEN'` : ""]
      .filter(Boolean)
      .join(" AND ");
    const items = await soda({ resource: DATASET, where, limit: 200, order: "violation_date DESC" });

    const openCount = items.length;
    const balance = items.reduce((sum: number, it: any) => sum + (Number(it?.balance_due) || 0), 0);
    return NextResponse.json({ ok: true, openCount, balance, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 });
  }
}
