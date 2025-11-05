import { NextResponse } from "next/server";
import { soda } from "@/lib/soda";
export const runtime = "nodejs";

const DATASET = process.env.SODA_DATASET_DOB_VIOLATIONS!;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const bin = (u.searchParams.get('bin') || '').trim();
    const bbl = (u.searchParams.get('bbl') || '').trim();
    if (!bin && !bbl) return NextResponse.json({ ok:false, error:'bin or bbl required' }, { status: 400 });

    const where: string[] = [];
    if (bin) where.push(`bin='${bin}'`);
    if (bbl) where.push(`bbl='${bbl}'`);

    const items = await (soda as any)({ resource: DATASET, where: where.join(' AND '), limit: 100, order: 'issue_date DESC' });
    return NextResponse.json({ ok:true, count: items.length, items });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message }, { status: 200 });
  }
}

