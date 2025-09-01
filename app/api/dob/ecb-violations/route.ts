import { NextResponse } from "next/server";
export const runtime = "nodejs";

const TOKEN = (process.env.SOCRATA_APP_TOKEN || "").trim();
// NYC Open Data: DOB ECB Violations
const DATASET = "6bgk-3dad";
const BASE = `https://data.cityofnewyork.us/resource/${DATASET}.json`;

function ok(data: any, status = 200) { return NextResponse.json(data, { status }); }
const esc = (s: string) => s.replace(/'/g, "''");

// Convert YYYYMMDD -> YYYY-MM-DD
const fixDate = (s?: string) =>
  s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;

function whereFromParams(bin: string | null, bbl: string | null) {
  if (bin) {
    // bin is TEXT in Socrata; compare as string
    return `bin='${esc(bin)}'`;
  }
  if (bbl) {
    // Translate BBL -> boro/block/lot
    const digits = bbl.replace(/\D/g, "");
    if (digits.length >= 10) {
      const d = digits.slice(-10);
      const boro = d[0];
      const block5 = d.slice(1, 6).padStart(5, "0");
      const lot4 = d.slice(6, 10).replace(/^0+/, "") || "0";
      const lot5 = d.slice(6, 10).padStart(5, "0");
      // Try both 4- and 5-digit lot representations
      return `boro='${esc(boro)}' AND block='${esc(block5)}' AND (lot='${esc(lot4)}' OR lot='${esc(lot5)}')`;
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bin = (url.searchParams.get("bin") || "").trim() || null;
    const bbl = (url.searchParams.get("bbl") || "").trim() || null;
    const debug = (url.searchParams.get("debug") || "").toLowerCase() === "1" ||
                  (url.searchParams.get("debug") || "").toLowerCase() === "true";
    const wantOpen = url.searchParams.has("open"); // ?open=1 to show likely-open ECBs

    const baseWhere = whereFromParams(bin, bbl);
    if (!baseWhere) return ok({ ok: false, error: "missing ?bin or valid ?bbl" }, 400);

    const q = new URL(BASE);
    q.searchParams.set("$limit", "1000");
    q.searchParams.set("$order", "issue_date DESC");

    let where = baseWhere;
    if (wantOpen) {
      // Exclude resolved/dismissed statuses; (balance filter is avoided to keep SoQL simple & reliable)
      const openWhere = "NOT upper(ecb_violation_status) in ('RESOLVE','RESOLVED','DISMISSED','WITHDRAWN','CANCELLED','CANCELED')";
      where = `(${baseWhere}) AND (${openWhere})`;
    }
    q.searchParams.set("$where", where);

    const res = await fetch(q.toString(), {
      headers: TOKEN ? { "X-App-Token": TOKEN } : {},
    });

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!res.ok) {
      return ok({ ok: false, error: `Socrata error ${res.status}`, body: json ?? text }, debug ? 200 : 502);
    }

    const items = (Array.isArray(json) ? json : []).map((r: any) => ({
      ...r,
      issue_date_iso: fixDate(r.issue_date),
      served_date_iso: fixDate(r.served_date),
      hearing_date_iso: fixDate(r.hearing_date),
    }));

    const payload: any = { ok: true, count: items.length, items };
    if (debug) {
      payload.debug = {
        where,
        url: q.toString(),
        notes: ["Developer Mode is on. Debug exists only when ?debug=1."]
      };
    }

    return ok(payload);
  } catch (e: any) {
    return ok({ ok: false, error: e?.message || String(e) });
  }
}

    return NextResponse.json({ error: e?.message || "Unhandled server error" }, { status: 500 });
  }
}
