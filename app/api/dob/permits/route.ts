// app/api/dob/permits/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Socrata dataset: DOB NOW: Build – Issued Permits
// https://data.cityofnewyork.us/resource/ipu4-2q9a.json
const DATASET_URL = "https://data.cityofnewyork.us/resource/ipu4-2q9a.json";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bin = (url.searchParams.get("bin") || "").trim();

    // simple guardrails
    if (!bin) {
      return NextResponse.json(
        { error: "Query param ?bin= is required" },
        { status: 400 }
      );
    }
    if (!/^\d{6,8}$/.test(bin)) {
      return NextResponse.json(
        { error: "bin must be 6–8 digits (NYC BIN)" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      // IMPORTANT: the permits dataset uses bin__ (double underscore)
      $where: `bin__='${bin}'`,
      $order: "issuance_date DESC",
      $limit: "200",
    });

    const headers: Record<string, string> = {};
    const token = (process.env.SOCRATA_APP_TOKEN || "").trim();
    if (token) headers["X-App-Token"] = token;

    const r = await fetch(`${DATASET_URL}?${params.toString()}`, { headers });
    const raw = await r.json().catch(() => null);

    if (!r.ok) {
      // bubble up the Socrata error so it’s easy to debug from logs
      return NextResponse.json(
        {
          error: `Socrata returned ${r.status} ${r.statusText}`,
          detail: raw || null,
        },
        { status: 502 }
      );
    }

    const items = Array.isArray(raw) ? raw : [];

    // normalize a few fields you’ll likely want to display
    const normalized = items.map((d: any) => ({
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

    return NextResponse.json({
      ok: true,
      count: normalized.length,
      items: normalized,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unhandled server error" },
      { status: 500 }
    );
  }
}
