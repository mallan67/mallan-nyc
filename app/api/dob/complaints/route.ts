import { NextResponse } from "next/server";
import { soda } from "@/lib/soda";
import { sanitizeBIN, sanitizeNumeric } from "@/lib/sanitize";
export const runtime = "nodejs";

const DATASET = process.env.SODA_DATASET_DOB_COMPLAINTS!;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const binRaw = (u.searchParams.get('bin') || '').trim();
    const bblRaw = (u.searchParams.get('bbl') || '').trim();
    if (!binRaw && !bblRaw) return NextResponse.json({ ok:false, error:'bin or bbl required' }, { status: 400 });

    const where: string[] = [];
    if (binRaw) {
      const bin = sanitizeBIN(binRaw);
      if (!bin) return NextResponse.json({ ok:false, error:'bin must be numeric' }, { status: 400 });
      where.push(`bin='${bin}'`);
    }
    if (bblRaw) {
      const bbl = sanitizeNumeric(bblRaw);
      if (!bbl) return NextResponse.json({ ok:false, error:'bbl must be numeric' }, { status: 400 });
      where.push(`bbl='${bbl}'`);
    }

    const items = await soda({ resource: DATASET, where: where.join(' AND '), limit: 100, order: 'received_date DESC' });
    return NextResponse.json({ ok:true, count: items.length, items });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message }, { status: 500 });
  }
}
