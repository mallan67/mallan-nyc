import { NextResponse } from "next/server";

export const runtime = "nodejs";

// DOB NOW: Build — Issued Permits
// https://data.cityofnewyork.us/resource/ipu4-2q9a.json
const DATASET = "https://data.cityofnewyork.us/resource/ipu4-2q9a.json";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bin = (url.searchParams.get("bin") || "").trim();

    if (!bin) {
      return NextResponse.json({ error: "Query param ?bin= is required" }, { status: 400 });
    }
    if (!/^\d{6,8}$/.test(bin)) {
      return NextResponse.json({ error: "bin must be 6–8 digits" }, { status: 400 });
    }

    // Use plain equality (no $where) -> fewer 400s from Socrata
    const params = new URLSearchParams({
      // IMPORTANT: dataset field is bin__ (double underscore)
      "bin__": bin,
      "$order": "issuance_date DESC",
      "$limit": "200",
    });

    const headers: Record<string, string> = {};
    const token = (process.env.SOCRATA_APP_TOKEN || "").trim();
    if (token) headers["X-App-Token"] = token;

    const resp = await fetch(`${DATASET}?${params.toString()}`, { headers });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Socrata ${resp.status} ${resp.statusText}`, detail: data ?? null },
        { status: 502 }
      );
    }

    const items = (Array.isArray(data) ? data : []).map((d: any) => ({
      bin: d.bin__ ?? null,
      job: d.job__ ?? null,
      borough: d.borough ?? d.boro ?? null,
      house_number: d.house__ ?? d.house ?? null,
      street_name: d.street_name ?? d.streetname ?? null,
      permit_type: d.permit_type ?? null,
      permit_status: d.permit_status ?? d.latest_status ?? null,
      issuance_date: d.issuance_date ?? null,
      expiration_date: d.expiration_date ?? null,
      filing_date: d.filing_date ?? null,
      permittee: d.permittee_business_name ?? d.permittee_s_first__last_name ?? null,
      owner: d.owner_business_name ?? d.owner_s_first__last_name ?? null,
      description: d.work_description ?? null,
    }));

    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unhandled server error" }, { status: 500 });
  }
}
