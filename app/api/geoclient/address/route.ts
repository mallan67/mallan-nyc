import { NextRequest } from "next/server";

const BASE = process.env.GEOCLIENT_URL || "https://api.nyc.gov/geoclient/v2";
const KEY  = process.env.GEOCLIENT_KEY!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const houseNumber = searchParams.get("houseNumber") || "";
  const street      = searchParams.get("street") || "";
  const borough     = searchParams.get("borough") || "";
  const zip         = searchParams.get("zip") || "";
  const url = new URL(`${BASE}/address.json`);
  if (houseNumber) url.searchParams.set("houseNumber", houseNumber);
  if (street)      url.searchParams.set("street", street);
  if (borough)     url.searchParams.set("borough", borough);
  if (zip)         url.searchParams.set("zip", zip);
  const r = await fetch(url.toString(), { headers: { "Ocp-Apim-Subscription-Key": KEY } });
  const data = await r.json();
  return new Response(JSON.stringify(data), { status: r.status, headers: { "content-type": "application/json" } });
}
