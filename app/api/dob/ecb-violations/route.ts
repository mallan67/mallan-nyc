// app/api/dob/ecb-violations/route.ts
import { NextResponse } from "next/server";

const DATA_DOMAIN = "https://data.cityofnewyork.us/resource";
const DATASET_ID = "nc67-uf89"; // <- ECB/OATH violations dataset (correct)
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || "";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bin = (searchParams.get("bin") || "").trim();
    if (!bin) {
      return NextResponse.json({ error: "Missing ?bin=#######" }, { status: 400 });
    }

    const url = `${DATA_DOMAIN}/${DATASET_ID}.json?bin=${encodeURIComponent(bin)}&$limit=1000`;
    const r = await fetch(url, {
      headers: APP_TOKEN ? { "X-App-Token": APP_TOKEN } : {},
      // Socrata likes an explicit user agent
      next: { revalidate: 0 },
    });

    if (!r.ok) {
      const body = await r.text();
      return NextResponse.json({ error: `Socrata error ${r.status}`, body }, { status: r.status });
    }

    const items = await r.json();
    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled server error" }, { status: 500 });
  }
}
