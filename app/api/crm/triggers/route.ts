import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { DEFAULT_TRIGGERS } from '@/lib/lifecycle/engine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/triggers — List all lifecycle triggers (broker only)
 * POST /api/crm/triggers — Create a new trigger (broker only)
 */

async function verifyBrokerAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    select: { user_id: true, role: true, expires_at: true },
  });

  if (!session || session.expires_at < new Date() || session.role !== 'BROKER') {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await verifyBrokerAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const triggers = await prisma.lifecycleTrigger.findMany({
    orderBy: { created_at: 'desc' },
    include: {
      _count: { select: { executions: true } },
    },
  });

  return NextResponse.json({
    triggers: triggers.map((t) => ({
      id: String(t.id),
      name: t.name,
      triggerType: t.trigger_type,
      conditions: t.conditions,
      actionType: t.action_type,
      actionConfig: t.action_config,
      enabled: t.enabled,
      cooldownHours: t.cooldown_hours,
      lastExecutedAt: t.last_executed_at?.toISOString(),
      executionCount: t.execution_count,
      totalExecutions: t._count.executions,
    })),
    defaults: DEFAULT_TRIGGERS,
  });
}

export async function POST(request: NextRequest) {
  const session = await verifyBrokerAuth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, triggerType, conditions, actionType, actionConfig, cooldownHours } = body;

  if (!name || !triggerType || !actionType) {
    return NextResponse.json({ error: 'name, triggerType, actionType required' }, { status: 400 });
  }

  const trigger = await prisma.lifecycleTrigger.create({
    data: {
      name,
      trigger_type: triggerType,
      conditions: conditions || {},
      action_type: actionType,
      action_config: actionConfig || {},
      cooldown_hours: cooldownHours || 24,
    },
  });

  return NextResponse.json({
    id: String(trigger.id),
    name: trigger.name,
    triggerType: trigger.trigger_type,
    enabled: trigger.enabled,
  }, { status: 201 });
}
