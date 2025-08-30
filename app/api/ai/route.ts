// app/api/ai/route.ts
import { NextResponse } from "next/server";

// Simple GET handler so you can open /api/ai in the browser
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/ai", accepts: ["POST"] });
}

// POST handler for chat
export async function POST(req: Request) {
  const { messages } = await req.json();

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // fast, good for chat
      input: messages,
    }),
  });

  const data = await r.json();
  const text = (data as any)?.output_text || "Sorry—no reply.";
  return NextResponse.json({ text });
}
