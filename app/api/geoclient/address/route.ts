import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = (url.searchParams.get('input') || url.searchParams.get('q') || '').trim();
    if (!input) return NextResponse.json({ ok:false, error:'missing input' }, { status: 400 });

    const id  = process.env.NYC_GEOCLIENT_APP_ID!;
    const key = process.env.NYC_GEOCLIENT_APP_KEY!;
    const u = new URL('https://api.nyc.gov/geo/geoclient/v1/search.json');
    u.searchParams.set('input', input);
    u.searchParams.set('app_id', id);
    u.searchParams.set('app_key', key);

    const r = await fetch(u.toString(), { cache:'no-store' });
    const json = await r.json();

    const first = json?.results?.[0]?.response || {};
    const bin = first?.buildingIdentificationNumber || undefined;

    const bbl =
      first?.bbl ||
      (first?.bblBoroughCode && first?.bblBlock && first?.bblLot
        ? `${first.bblBoroughCode}${first.bblBlock}${first.bblLot}`
        : undefined);

    return NextResponse.json({ ok:true, input, bin, bbl, raw: json });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e.message }, { status: 200 });
  }
}
