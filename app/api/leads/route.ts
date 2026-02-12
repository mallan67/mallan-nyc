import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  // Basic auth check — same credentials as other admin pages
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const decoded = atob(authHeader.slice(6));
  const [user, pass] = decoded.split(':');
  if (user !== process.env.ADMIN_BASIC_USER || pass !== process.env.ADMIN_BASIC_PASS) {
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
