// app/api/ai/nyc/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

async function jsonGET(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query: string = body?.query;
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: 'Body must include { "query": "<address string>" }' },
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;

    // --- 1) Resolve BIN from address via our own geoclient route
    let bin: string | null = null;
    let geoclient: any = null;

    try {
      const enc = encodeURIComponent(query);
      try {
        geoclient = await jsonGET(`${origin}/api/geoclient/address?q=${enc}`);
      } catch {
        // some implementations use ?text=
        geoclient = await jsonGET(`${origin}/api/geoclient/address?text=${enc}`);
      }
      bin =
        geoclient?.bin ||
        geoclient?.result?.bin ||
        geoclient?.data?.bin ||
        geoclient?.address?.bin ||
        (Array.isArray(geoclient?.results) ? geoclient.results[0]?.bin : null) ||
        deepFindBin(geoclient);
    } catch {
      // If we can't resolve a BIN, we'll still answer—but we'll say data is limited
    }

    // --- 2) With BIN, pull DOB data from our own routes
    let violations: any = null;
    let permits: any = null;
    if (bin) {
      try {
        violations = await jsonGET(`${origin}/api/dob/violations?bin=${encodeURIComponent(bin)}`);
      } catch {}
      try {
        permits = await jsonGET(`${origin}/api/dob/permits?bin=${encodeURIComponent(bin)}`);
      } catch {}
    }

    // --- 3) Build context and ask OpenAI to summarize
    const context = [
      `Address query: ${query}`,
      bin ? `BIN: ${bin}` : `BIN: not resolved`,
      violations ? `Violations JSON: ${safeString(violations).slice(0, 5000)}` : `Violations: not available`,
      permits ? `Permits JSON: ${safeString(permits).slice(0, 5000)}` : `Permits: not available`,
    ].join("\n\n");

    const system: ChatMessage = {
      role: "system",
      content:
        "You are a New York City real-estate assistant. Use any DOB data provided in CONTEXT to answer clearly. " +
        "If BIN or data is missing, say that results are limited and explain how to look up more (DOB NOW/BIS). " +
        "Be concise and factual; do not invent details."
    };

    const user: ChatMessage = {
      role: "user",
      content: `CONTEXT:\n${context}\n\nQuestion: Summarize any DOB violations and recent permits for the address. If none available, say so politely.`
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${(process.env.OPENAI_API_KEY || "").trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        messages: [...messages, system, user],
      }),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "OpenAI request failed", openai: data?.error ?? null },
        { status: r.status }
      );
    }

    const text = data?.choices?.[0]?.message?.content?.toString()?.trim() || "No reply.";
    return NextResponse.json({
      text,
      bin: bin ?? undefined,
      raw: {
        violationsCount: countArrayish(violations),
        permitsCount: countArrayish(permits),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai/nyc", accepts: ["POST"] });
}

// ---- helpers
function safeString(x: any) {
  try {
    return typeof x === "string" ? x : JSON.stringify(x);
  } catch {
    return "";
  }
}
function deepFindBin(obj: any): string | null {
  try {
    let found: string | null = null;
    JSON.stringify(obj, (_k, v) => {
      if (!found && typeof v === "string" && /^[0-9]{7}$/.test(v)) found = v;
      return v;
    });
    return found;
  } catch {
    return null;
  }
}
function countArrayish(x: any) {
  if (Array.isArray(x)) return x.length;
  if (x && Array.isArray(x?.data)) return x.data.length;
  if (x && Array.isArray(x?.results)) return x.results.length;
  return undefined;
}
