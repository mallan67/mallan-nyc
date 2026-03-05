import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const expectedKey = process.env.PRIVATE_COLLECTION_PASS;

  if (!expectedKey || key !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const val = process.env.OPENAI_API_KEY || "";
  return NextResponse.json({ hasKey: Boolean(val) });
}
