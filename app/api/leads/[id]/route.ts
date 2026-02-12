import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function checkAuth(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Basic ')) return false;
  const decoded = atob(authHeader.slice(6));
  const [user, pass] = decoded.split(':');
  return user === process.env.ADMIN_BASIC_USER && pass === process.env.ADMIN_BASIC_PASS;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (body.status && ['new', 'contacted', 'active', 'closed'].includes(body.status)) {
    allowed.status = body.status;
  }
  if (body.assignedAgent !== undefined) {
    allowed.assignedAgent = body.assignedAgent || null;
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: BigInt(id) },
    data: allowed,
  });

  return NextResponse.json({
    success: true,
    lead: {
      id: lead.id.toString(),
      status: lead.status,
      assignedAgent: lead.assignedAgent,
    },
  });
}
