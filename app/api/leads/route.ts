import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const pass = req.headers.get('x-admin-pass');
  if (!pass || pass !== process.env.ADMIN_BASIC_PASS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [leads, agents] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.agent.findMany({ orderBy: { full_name: 'asc' } }),
  ]);

  return NextResponse.json({
    total: leads.length,
    agents: agents.map(a => ({
      email: a.email || '',
      name: a.full_name || `${a.first_name} ${a.last_name}`,
    })),
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
