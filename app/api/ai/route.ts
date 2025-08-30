// app/api/ai/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime (not Edge)

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai", accepts: ["POST"] });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages) {
      return NextResponse.json(
        { error: "Body must include { messages: Array<{role, content}> }" },
        { status: 400 }
      );
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages, // [{ role: "user" | "assistant" | "system", content: "..." }]
        temperature: 0.7,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      // surface OpenAI error details in response
      const msg =
        (data?.error && (data.error.message || data.error.type)) ||
        "OpenAI request failed";
      return NextResponse.json({ error: msg }, { status: r.status });
    }

    const text =
      data?.choices?.[0]?.message?.content?.trim() || "No reply.";
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid JSON or network error." },
      { status: 400 }
    );
  }
}
