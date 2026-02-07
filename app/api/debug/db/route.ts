import { NextResponse } from "next/server";

/**
 * Debug route — protected by PRIVATE_COLLECTION_PASS.
 * Returns whether a DB env is present and a masked connection string.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const expectedKey = process.env.PRIVATE_COLLECTION_PASS;

  if (!expectedKey || key !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.ASSISTANT_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
  const masked = dbUrl ? dbUrl.replace(/:(?:[^:@]+)@/, ":****@") : null;
  return NextResponse.json({ ok: !!dbUrl, connectionString: masked });
}
