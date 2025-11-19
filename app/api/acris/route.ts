import { NextResponse } from "next/server";
import { soda } from "@/lib/soda";
export const runtime = "nodejs";

const MASTER   = process.env.SODA_DATASET_ACRIS_MASTER!;
const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY!;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const bbl = (u.searchParams.get('bbl') || '').trim();
    if (!bbl) return NextResponse.json({ ok:false, error:'bbl required' }, { status: 400 });

    const ids = await (soda as any)({
      resource: REALPROP,
      where: `bbl='${bbl}'`,
      select: 'document_id',
      order: 'document_id DESC',
      limit: 50,
    });

    const docIds = ids.map((r: any) => r.document_id);
    if (!docIds.length) return NextResponse.json({ ok:true, count:0, items:[] });

    const where = `document_id in (${docIds.map((id: any) => `'${id}'`).join(',')})`;
    const docs = await (soda as any)({ resource: MASTER, where, order: 'recordedfiledate DESC', limit: docIds.length });

    return NextResponse.json({ ok:true, count: docs.length, items: docs });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message }, { status: 200 });
  }
}


