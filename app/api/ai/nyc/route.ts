// app/api/ai/nyc/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const runtime = "nodejs";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

function baseUrl() {
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

async function getJSON(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query: string | undefined = body?.query;
    const address: string | undefined = body?.address;
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    const addr = (address || query || "").trim();
    if (!addr) {
      return NextResponse.json(
        { error: 'Provide "address" or "query" in the request body.' },
        { status: 400 }
      );
    }

    const base = baseUrl();

    // 1) Geocode (to get BIN)
    const geo = await getJSON(`${base}/api/geoclient/address?q=${encodeURIComponent(addr)}`);
    if (!geo.ok) return NextResponse.json({ error: "Geoclient lookup failed", geo }, { status: 502 });

    // Try a few shapes to find BIN
    const bin =
      geo.data?.bin ||
      geo.data?.result?.bin ||
      geo.data?.address?.bin ||
      geo.data?.data?.bin ||
      (Array.isArray(geo.data) ? geo.data[0]?.bin : null);

    if (!bin) {
      return NextResponse.json({ error: "BIN not found for address", geo }, { status: 404 });
    }

    // 2) DOB data
    const [viol, permits] = await Promise.all([
      getJSON(`${base}/api/dob/violations?bin=${encodeURIComponent(bin)}`),
      getJSON(`${base}/api/dob/permits?bin=${encodeURIComponent(bin)}`),
    ]);

    const vItems = Array.isArray(viol.data?.items) ? viol.data.items : Array.isArray(viol.data) ? viol.data : [];
    const pItems = Array.isArray(permits.data?.items) ? permits.data.items : Array.isArray(permits.data) ? permits.data : [];

    const vCount = vItems.length;
    const pCount = pItems.length;

    const short = (s: any) => String(s ?? "").replace(/\s+/g, " ").slice(0, 280);

    const vTop = vItems.slice(0, 5)
      .map((v: any) => `• ${v.issue_date || v.date || v.open_date || ""} ${v.status || ""} ${short(v.description || v.violation_description || v.narrative)}`.trim())
      .join("\n");

    const pTop = pItems.slice(0, 5)
      .map((p: any) => `• ${p.filing_date || p.issued_date || p.date || ""} ${p.permit_type || p.job_type || ""} ${short(p.work_description || p.description || p.job_description)}`)
      .join("\n");

    const context = `
NYC Building intel
Query/Address: ${addr}
BIN: ${bin}
Violations: ${vCount}
Permits: ${pCount}

Top Violations:
${vTop || "• none found"}

Top Permits:
${pTop || "• none found"}
`.trim();

    const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const chat: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a NYC real-estate assistant. Use the provided building intel to answer. If data is missing, say what is missing and suggest practical next steps. Be concise.",
      },
      { role: "system", content: context },
      ...messages,
      { role: "user", content: `Answer using the intel above. Focus on: ${addr}.` },
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages: chat, temperature: 0.3 }),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = data?.error?.message || `${r.status} ${r.statusText}`;
      return NextResponse.json({ error: msg, openai: data?.error, context }, { status: r.status });
    }

    const text = data?.choices?.[0]?.message?.content?.toString()?.trim() || "No reply.";
    return NextResponse.json({ text, model, bin, counts: { violations: vCount, permits: pCount } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
