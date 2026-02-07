import { NextResponse } from 'next/server';

/**
 * IDX environment debug — protected by PRIVATE_COLLECTION_PASS.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const expectedKey = process.env.PRIVATE_COLLECTION_PASS;

  if (!expectedKey || key !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    IDX_ENABLED: process.env.IDX_ENABLED === 'true',
    HAS_CLIENT_ID: Boolean(process.env.IDX_CLIENT_ID),
    HAS_CLIENT_SECRET: Boolean(process.env.IDX_CLIENT_SECRET),
  });
}
