import { NextResponse } from "next/server";
export const runtime = "nodejs";

const TOKEN = (process.env.SOCRATA_APP_TOKEN || "").trim();
const DATASET = "6bgk-3dad";
const BASE = `https://data.cityofnewyork.us/resource/${DATASET}.json`;

function ok(data: any, status = 200) { return NextResponse.json(data, { status }); }
const esc = (s: string) => s.replace(/'/g, "''");

// Convert YYYYMMDD -> YYYY-MM-DD
const fixDate = (s?: string) =>
  s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;

function whereFromParams(bin: string | null, bbl: string | null) {
  if (bin) return `bin='${esc(bin)}'`;
  if (bbl) {
    const digits = bbl.replace(/\D/g, "");
    if (digits.length >= 10) {
      const d = digits.slice(-10);
      const boro = d[0];
      const block5 = d.slice(1, 6).padStart(5, "0");
      const lot4 = d.slice(6, 10).replace(/^0+/, "") || "0";
      const lot5 = d.slice(6, 10).padStart(5, "0");
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
    const wantOpen = url.searchParams.has("open"); // ?open=1 to show likely-open

    const baseWhere = whereFromParams(bin, bbl);
    if (!baseWhere) return ok({ ok: false, error: "missing ?bin or valid ?bbl" });

    const q = new URL(BASE);
    q.searchParams.set("$limit", "1000");
    q.searchParams.set("$order", "issue_date DESC");

    let where = baseWhere;
    if (wantOpen) {
      const openWhere =
        "coalesce(upper(ecb_violation_status),'') NOT IN " +
        "('RESOLVE','RESOLVED','DISMISSED','WITHDRAWN','CANCELLED','CANCELED')" +
        " AND coalesce(balance_due,'0')::number > 0";
      where = `(${baseWhere}) AND (${openWhere})`;
    }
    q.searchParams.set("$where", where);

    const res = await fetch(q.toString(), {
      headers: TOKEN ? { "X-App-Token": TOKEN } : {},
      next: { revalidate: 3600 }, // cache 1h
    });

    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!res.ok) {
      return ok({ ok: false, error: `Socrata error ${res.status}`, body: json ?? text }, 502);
    }

    const items = (Array.isArray(json) ? json : []).map((r: any) => {
      const ecb = String(r.ecb_violation_number || "").trim();
      return {
        ...r,
        penalty_imposed: r.penalty_imposed ?? r.penality_imposed,
        issue_date_iso: fixDate(r.issue_date),
        served_date_iso: fixDate(r.served_date),
        hearing_date_iso: fixDate(r.hearing_date),
        links: ecb
          ? {
              explore: `https://data.cityofnewyork.us/d/${DATASET}?search=${encodeURIComponent(ecb)}`,
              json: `https://data.cityofnewyork.us/resource/${DATASET}.json?ecb_violation_number=${encodeURIComponent(ecb)}`,
            }
          : undefined,
      };
    });

    return ok({ ok: true, count: items.length, items, bin: bin ?? undefined, wantOpen: wantOpen || undefined });
  } catch (e: any) {
    return ok({ ok: false, error: e?.message || String(e) });
  }
}
