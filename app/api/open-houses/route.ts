import { NextResponse } from 'next/server';

// Static import for Vercel serverless compatibility
import openHousesData from '@/data/open-houses.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(openHousesData);
}

export async function POST() {
  // Note: POST is only functional in development (local filesystem)
  // In production, use a database or CMS
  return NextResponse.json(
    { error: 'POST not supported in production. Edit data/open-houses.json locally.' },
    { status: 501 }
  );
}
