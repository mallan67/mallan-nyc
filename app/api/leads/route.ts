import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  // Simple auth check — require the same key used for other admin endpoints
  const key = req.nextUrl.searchParams.get('key');
  if (key !== process.env.PRIVATE_COLLECTION_PASS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    total: leads.length,
    leads: leads.map(l => ({
      id: l.id.toString(),
      firstName: l.firstName,
      lastName: l.lastName,
      email: l.email,
      phone: l.phone,
      roles: l.roles,
      status: l.status,
      assignedAgent: l.assignedAgent,
      source: l.source,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
