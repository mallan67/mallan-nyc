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

    // NOTE: we cast the awaited result to an array so TypeScript understands `ids` is an array:
    const ids = (await soda<{ document_id: string }>({
      resource: REALPROP,
      where: `bbl='${bbl}'`,
      select: 'document_id',
      order: 'document_id DESC',
      limit: 50,
    })) as { document_id: string }[];

    const docIds = ids.map(r => r.document_id);
    if (!docIds.length) return NextResponse.json({ ok:true, count:0, items:[] });

    const where = `document_id in (${docIds.map(id => `'${id}'`).join(',')})`;
    const docs = await soda({ resource: MASTER, where, order: 'recordedfiledate DESC', limit: docIds.length });

    return NextResponse.json({ ok:true, count: docs.length, items: docs });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message }, { status: 200 });
  }
}
