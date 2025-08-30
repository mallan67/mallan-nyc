// app/api/ai/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // small, fast, good for chat
      input: messages,
    }),
  });

  const data = await r.json();
  const text = data?.output_text || "Sorry—no reply.";
  return NextResponse.json({ text });
}
