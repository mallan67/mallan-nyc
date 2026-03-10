import { NextResponse } from "next/server";
import { soda } from "@/lib/soda";
import { sanitizeBorough, sanitizeNumeric, sanitizeDocumentId } from "@/lib/sanitize";
export const runtime = "nodejs";

const MASTER   = process.env.SODA_DATASET_ACRIS_MASTER!;
const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY!;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    // Support both combined bbl param and separate borough/block/lot
    const bbl = (u.searchParams.get('bbl') || '').trim();
    const boroughRaw = u.searchParams.get('borough') || '';
    const blockRaw = u.searchParams.get('block') || '';
    const lotRaw = u.searchParams.get('lot') || '';

    let borough: string | null;
    let block: string | null;
    let lot: string | null;

    if (boroughRaw && blockRaw && lotRaw) {
      borough = sanitizeBorough(boroughRaw);
      block = sanitizeNumeric(blockRaw);
      lot = sanitizeNumeric(lotRaw);
      if (!borough || !block || !lot) {
        return NextResponse.json({ ok:false, error:'borough must be 1-5, block and lot must be numeric' }, { status: 400 });
      }
    } else if (bbl && bbl.length === 10 && /^\d{10}$/.test(bbl)) {
      borough = sanitizeBorough(bbl[0]);
      block = sanitizeNumeric(bbl.substring(1, 6));
      lot = sanitizeNumeric(bbl.substring(6, 10));
      if (!borough || !block || !lot) {
        return NextResponse.json({ ok:false, error:'invalid bbl format' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ ok:false, error:'bbl (10-digit) or borough+block+lot required' }, { status: 400 });
    }

    // Values are validated as pure digits — safe for SoQL interpolation
    const where = `borough='${borough}' AND block='${block.padStart(5, '0')}' AND lot='${lot.padStart(4, '0')}'`;

    const ids = await soda<{ document_id: string }>({
      resource: REALPROP,
      where,
      select: 'document_id',
      order: 'document_id DESC',
      limit: 50,
    });

    const docIds = ids
      .map(r => sanitizeDocumentId(r.document_id || ''))
      .filter((id): id is string => id !== null);
    if (!docIds.length) return NextResponse.json({ ok:true, count:0, items:[] });

    const masterWhere = `document_id in (${docIds.map(id => `'${id}'`).join(',')})`;
    const docs = await soda({ resource: MASTER, where: masterWhere, order: 'recorded_datetime DESC', limit: docIds.length });

    return NextResponse.json({ ok:true, count: docs.length, items: docs });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message }, { status: 500 });
  }
}
