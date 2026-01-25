import { NextResponse } from 'next/server';

// Static import for Vercel serverless compatibility
import agentsData from '@/data/agents.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(agentsData);
}

export async function POST() {
  // Note: POST is only functional in development (local filesystem)
  // In production, use a database or CMS
  return NextResponse.json(
    { error: 'POST not supported in production. Edit data/agents.json locally.' },
    { status: 501 }
  );
}
