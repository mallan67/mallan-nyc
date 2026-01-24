import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Default resources - can be extended from database later
const DEFAULT_RESOURCES = [
  { title: "Buyer's Guide", href: '/resources/buyers-guide' },
  { title: "Seller's Guide", href: '/resources/sellers-guide' },
  { title: 'Investors Guide', href: '/resources/investors-guide' },
];

export async function GET() {
  // In the future, this can fetch from database
  // For now, return default resources
  // Example future implementation:
  // const resources = await db.resources.findMany({ where: { published: true } });

  return NextResponse.json(DEFAULT_RESOURCES);
}
