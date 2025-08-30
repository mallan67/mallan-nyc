import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  const val = process.env.OPENAI_API_KEY || "";
  return NextResponse.json({ hasKey: Boolean(val), length: val.length });
}
