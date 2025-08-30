// app/api/dob/permits/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bin = (searchParams.get("bin") || "").trim();
  if (!bin) return NextResponse.json({ error: "missing ?bin" }, { status: 400 });

  const url = new URL("https://data.cityofnewyork.us/resource/ipu4-2q9a.json");
  url.searchParams.set("$limit", "50");
  url.searchParams.set("$order", "issuance_date DESC");
  url.searchParams.set("bin", bin);

  const headers: Record<string, string> = { "Accept": "application/json" };
  const token = process.env.SOCRATA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const r = await fetch(url.toString(), { headers });
  const data = await r.json().catch(() => null);
  if (!r.ok) return NextResponse.json({ error: "Socrata error", details: data }, { status: r.status });

  return NextResponse.json({ ok: true, count: Array.isArray(data) ? data.length : 0, items: data });
}
