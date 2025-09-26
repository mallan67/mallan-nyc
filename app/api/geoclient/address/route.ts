import { NextResponse } from "next/server";
export const runtime = "nodejs";

function enc(v?: string | null) { return v ? encodeURIComponent(v) : ""; }

export async function GET(req: Request) {
  const u = new URL(req.url);

  // EXACT param names that worked in the portal:
  const houseNumber = u.searchParams.get("houseNumber") ?? "";
  const street      = u.searchParams.get("street") ?? "";
  const borough     = u.searchParams.get("borough") ?? "";
  const zip         = u.searchParams.get("zip") ?? u.searchParams.get("zipCode") ?? "";

  const key = process.env.NYC_GEOCLIENT_SUBSCRIPTION_KEY || "";
  if (!key) {
    return NextResponse.json({ ok:false, error:"Missing NYC_GEOCLIENT_SUBSCRIPTION_KEY" }, { status:200 });
  }

  const url =
    `https://api.nyc.gov/geoclient/v2/address?houseNumber=${enc(houseNumber)}` +
    `&street=${enc(street)}&borough=${enc(borough)}&zip=${enc(zip)}`;

  try {
    const r = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Accept": "application/json"
      }
    });

    const text = await r.text();
    let data: any = null; try { data = text ? JSON.parse(text) : null; } catch {}

    if (!r.ok) {
      return NextResponse.json(
        { ok:false, keyMasked: key.slice(0,4)+"…"+key.slice(-4), attempt:{ url, status:r.status, body:data ?? text } },
        { status:200 }
      );
    }

    return NextResponse.json({ ok:true, data }, { status:200 });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:200 });
  }
}
