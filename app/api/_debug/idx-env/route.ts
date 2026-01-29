import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    IDX_ENABLED: process.env.IDX_ENABLED === 'true',
    HAS_CLIENT_ID: Boolean(process.env.IDX_CLIENT_ID),
    HAS_CLIENT_SECRET: Boolean(process.env.IDX_CLIENT_SECRET),
  });
}
