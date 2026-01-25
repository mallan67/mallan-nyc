import { NextResponse } from 'next/server';

// Static imports for Vercel serverless compatibility
import buyersGuide from '@/data/resources/buyers-guide.json';
import sellersGuide from '@/data/resources/sellers-guide.json';
import investorsGuide from '@/data/resources/investors-guide.json';

export const dynamic = 'force-dynamic';

// Map of available resources
const resources: Record<string, unknown> = {
  'buyers-guide': buyersGuide,
  'sellers-guide': sellersGuide,
  'investors-guide': investorsGuide,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Special case: get all resources for listing
  if (slug === 'all') {
    return NextResponse.json({ resources: Object.values(resources) });
  }

  const content = resources[slug];

  if (!content) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  return NextResponse.json(content);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Note: POST is only functional in development (local filesystem)
  // In production, use a database or CMS
  const { slug } = await params;
  return NextResponse.json(
    { error: `POST not supported in production. Edit data/resources/${slug}.json locally.` },
    { status: 501 }
  );
}
