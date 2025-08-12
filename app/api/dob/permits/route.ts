import { NextRequest } from "next/server";
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN;

export async function GET(req: NextRequest) {
  const base = "https://data.cityofnewyork.us/resource/ipu4-2q9a.json";
  const { searchParams } = new URL(req.url);
  const url = new URL(base);
  searchParams.forEach((v,k)=>url.searchParams.set(k,v));
  const headers: Record<string,string> = { accept: "application/json" };
  if (APP_TOKEN) headers["X-App-Token"] = APP_TOKEN;
  const r = await fetch(url, { headers });
  const data = await r.json();
  return new Response(JSON.stringify(data), { status: r.status, headers: { "content-type": "application/json" } });
}
