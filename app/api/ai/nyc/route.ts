// app/api/ai/nyc/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Build absolute base URL (works in dev & prod) */
function baseUrlFrom(req: Request) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

/** Fetch JSON safely. On any HTTP error or exception, return a benign shape. */
async function safeJson(url: string) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const status = r.status;
    if (!r.ok) {
      // Normalize an error response so the aggregator doesn't break
      return { ok: false, status, count: 0, items: [], error: `HTTP ${status}` };
    }
    const data = await r.json();

    // Normalize count/items even if the upstream shape varies
    const items = Array.isArray(data?.items) ? data.items : [];
    const count =
      typeof data?.count === "number"
        ? data.count
        : Array.isArray(items)
        ? items.length
        : 0;

    // If upstream includes an error field, treat as soft-fail
    const ok = data?.ok !== false && !data?.error;

    return { ok, status, count, items, raw: data, error: data?.error };
  } catch (e: any) {
    return { ok: false, status: 0, count: 0, items: [], error: e?.message || "fetch_error" };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Accept either { query } or { messages: [...] }
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const lastMsg = messages.length ? messages[messages.length - 1] : null;
    const query = String(body?.query ?? lastMsg?.content ?? "").trim();

    if (!query) {
      return NextResponse.json(
        { error: 'Send { "query": "<full NYC address>" }' },
        { status: 400 }
      );
    }

    const base = baseUrlFrom(req);

    // 1) Resolve BIN via your Geoclient helper
    const geo = await safeJson(`${base}/api/geoclient/address?q=${encodeURIComponent(query)}`);

    // Try a few common shapes to find BIN
    const bin =
      geo?.raw?.bin ??
      geo?.bin ??
      geo?.raw?.address?.buildingIdentificationNumber ??
      null;

    if (!bin) {
      return NextResponse.json({
        text:
          `I couldn’t resolve a BIN for “${query}”. ` +
          `Try a fully spelled address like “300 East 90 Street Manhattan 10128”.`,
      });
    }

    // 2) Pull DOB data from your own routes — each call is soft-failed & normalized
    const [viol, permits, complaints, ecb] = await Promise.all([
      safeJson(`${base}/api/dob/violations?bin=${bin}`),
      safeJson(`${base}/api/dob/permits?bin=${bin}`),
      safeJson(`${base}/api/dob/complaints?bin=${bin}`),
      safeJson(`${base}/api/dob/ecb-violations?bin=${bin}`),
    ]);

    // 3) Normalize counts; any missing/404 source just contributes 0
    const counts = {
      violations: Number.isFinite(viol?.count) ? Number(viol.count) : 0,
      permits: Number.isFinite(permits?.count) ? Number(permits.count) : 0,
      complaints: Number.isFinite(complaints?.count) ? Number(complaints.count) : 0,
      ecb_violations: Number.isFinite(ecb?.count) ? Number(ecb.count) : 0,
    };

    // Optional: expose which sources were unavailable (handy for debugging)
    const sources = {
      violations_ok: !!viol?.ok,
      permits_ok: !!permits?.ok,
      complaints_ok: !!complaints?.ok,
      ecb_ok: !!ecb?.ok,
    };

    // 4) Compose a friendly summary without depending on OpenAI
    const text =
      `BIN ${bin} — quick NYC DOB summary:\n` +
      `• Violations: ${counts.violations}\n` +
      `• ECB/OATH: ${counts.ecb_violations}\n` +
      `• Complaints: ${counts.complaints}\n` +
      `• Permits: ${counts.permits}\n` +
      `Use the links to inspect details.`;

    const links = {
      violations: `${base}/api/dob/violations?bin=${bin}`,
      permits: `${base}/api/dob/permits?bin=${bin}`,
      complaints: `${base}/api/dob/complaints?bin=${bin}`,
      ecb: `${base}/api/dob/ecb-violations?bin=${bin}`,
    };

    return NextResponse.json({ text, bin, counts, links, sources });
  } catch (e: any) {
    // Final guard: never expose a 500 to the client if we can give something graceful
    return NextResponse.json(
      { error: e?.message || "Unhandled server error", text: "Summary unavailable right now." },
      { status: 200 }
    );
  }
}
