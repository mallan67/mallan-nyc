import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function fetchJSON(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || `${r.status} ${r.statusText}`);
  return j;
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/nyc", accepts: ["POST"] });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Accept either { query: "address" } or OpenAI-style { messages: [...] }
    let query = (body?.query || body?.address || "").trim();
    if (!query && Array.isArray(body?.messages)) {
      const lastUser = [...body.messages].reverse().find((m: any) => m?.role === "user");
      query = lastUser?.content?.toString()?.trim() || "";
    }
    if (!query) {
      return NextResponse.json(
        { error: 'Provide { "query": "<NYC address>" } or { "messages": [...] }' },
        { status: 400 }
      );
    }

    // Resolve BIN via NYC Geoclient v2 (subscription key header)
    const key = (process.env.GEOCLIENT_KEY || "").trim();
    if (!key) {
      return NextResponse.json(
        { error: "GEOCLIENT_KEY is not set in environment variables." },
        { status: 500 }
      );
    }
    const g = new URL("https://api.nyc.gov/geoclient/v2/search.json");
    g.searchParams.set("input", query);
    const gData = await fetchJSON(g.toString(), { "Ocp-Apim-Subscription-Key": key });

    // Try to pluck the BIN from likely shapes
    const cand =
      gData?.results?.[0]?.response?.results?.[0]?.result ||
      gData?.results?.[0]?.response?.result ||
      gData?.result;
    const bin: string | null =
      cand?.buildingIdentificationNumber || cand?.bin || null;

    if (!bin) {
      return NextResponse.json({
        text: `I couldn’t resolve a BIN for “${query}”. Try a full address like “300 East 90 Street Manhattan 10128”.`
      });
    }

    const origin = new URL(req.url).origin;
    const [viol, perm] = await Promise.all([
      fetchJSON(`${origin}/api/dob/violations?bin=${encodeURIComponent(bin)}`),
      fetchJSON(`${origin}/api/dob/permits?bin=${encodeURIComponent(bin)}`)
    ]);

    const vCount = viol?.count ?? 0;
    const pCount = perm?.count ?? 0;

    const vSample = (viol?.items || [])
      .slice(0, 3)
      .map((v: any) =>
        `${v.issue_date ?? v.date ?? ""} – ${v.violation_type || v.violation_type_code || ""} – ${v.violation_category || ""}`
      );

    const pSample = (perm?.items || [])
      .slice(0, 3)
      .map((p: any) =>
        `${p.issuance_date ?? ""} – ${p.permit_type ?? ""} – job ${p.job ?? ""}`
      );

    const text = [
      `BIN ${bin}: found ${vCount} DOB violations and ${pCount} DOB permits.`,
      vSample.length ? `Recent violations:\n- ${vSample.join("\n- ")}` : "",
      pSample.length ? `Recent permits:\n- ${pSample.join("\n- ")}` : "",
      `Tip: you can open JSON details at /api/dob/violations?bin=${bin} or /api/dob/permits?bin=${bin}.`
    ]
      .filter(Boolean)
      .join("\n\n");

    return NextResponse.json({
      text,
      bin,
      counts: { violations: vCount, permits: pCount }
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unhandled server error" },
      { status: 500 }
    );
  }
}
