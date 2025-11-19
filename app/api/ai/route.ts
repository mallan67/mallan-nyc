// app/api/ai/route.ts
import { NextResponse } from "next/server";

// Make sure this runs on the Node runtime (not Edge)
export const runtime = "nodejs";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

// Simple GET so you can open /api/ai in the browser to verify it's deployed
export async function GET() {
  const key = (process.env.OPENAI_API_KEY || "").trim();
  return NextResponse.json({
    ok: true,
    route: "/api/ai",
    accepts: ["POST"],
    hasKey: Boolean(key),
    keyLength: key.length || 0,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  });
}

// Chat POST handler
export async function POST(req: Request) {
  try {
    // Read body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
      : [];

    if (!messages.length) {
      return NextResponse.json(
        { error: 'Body must include { "messages": [{ "role": "user" | "assistant" | "system", "content": "..." }] }' },
        { status: 400 }
      );
    }

    const rawKey = process.env.OPENAI_API_KEY;
    const OPENAI_API_KEY = (rawKey || "").trim();
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set (or empty after trim())" },
        { status: 500 }
      );
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Call OpenAI Chat Completions
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
      }),
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      const msg =
        (data && data.error && data.error.message) ||
        `${r.status} ${r.statusText} (OpenAI request failed)`;
      return NextResponse.json(
        { error: msg, openai: data?.error ?? null },
        { status: r.status }
      );
    }

    const text =
      data?.choices?.[0]?.message?.content?.toString()?.trim() || "No reply.";
    return NextResponse.json({ text, model });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unhandled server error" },
      { status: 500 }
    );
  }
}
