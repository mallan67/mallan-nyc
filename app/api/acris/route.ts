import { NextResponse } from "next/server";
import { soda } from "@/lib/soda";
export const runtime = "nodejs";

const MASTER   = process.env.SODA_DATASET_ACRIS_MASTER!;
const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY!;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    // Support both combined bbl param and separate borough/block/lot
    const bbl = (u.searchParams.get('bbl') || '').trim();
    const borough = u.searchParams.get('borough') || '';
    const block = u.searchParams.get('block') || '';
    const lot = u.searchParams.get('lot') || '';

    let where: string;
    if (borough && block && lot) {
      // ACRIS real property uses separate columns: borough, block (5-digit), lot (4-digit)
      where = `borough='${borough}' AND block='${block.padStart(5, '0')}' AND lot='${lot.padStart(4, '0')}'`;
    } else if (bbl && bbl.length === 10) {
      // Parse combined BBL: 1-digit borough + 5-digit block + 4-digit lot
      where = `borough='${bbl[0]}' AND block='${bbl.substring(1, 6)}' AND lot='${bbl.substring(6, 10)}'`;
    } else {
      return NextResponse.json({ ok:false, error:'bbl (10-digit) or borough+block+lot required' }, { status: 400 });
    }

    const ids = await soda<{ document_id: string }>({
      resource: REALPROP,
      where,
      select: 'document_id',
      order: 'document_id DESC',
      limit: 50,
    });

    const docIds = ids.map(r => r.document_id);
    if (!docIds.length) return NextResponse.json({ ok:true, count:0, items:[] });

    const masterWhere = `document_id in (${docIds.map(id => `'${id}'`).join(',')})`;
    const docs = await soda({ resource: MASTER, where: masterWhere, order: 'recorded_datetime DESC', limit: docIds.length });

    return NextResponse.json({ ok:true, count: docs.length, items: docs });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message }, { status: 200 });
  }
}
