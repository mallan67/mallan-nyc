// GET /api/crm/system-status
// Protected (agent/broker), read-only. Returns the Cotality sync system-status
// snapshot (target vs configured cadence, drift, last runs, cursor lag, health,
// Neon pooled/direct, environment). No writes; never exposes DATABASE_URL.
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { getCotalitySystemStatus } from '@/lib/cotality/system-status';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const status = await getCotalitySystemStatus();
    return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Never return the raw exception to the client — a Prisma/connection error can
    // carry table names, SQL, hosts, or connection details. Log only a sanitized
    // category server-side; return an opaque error to the caller.
    console.error('[system-status] failed', { category: 'status_snapshot_failed' });
    return NextResponse.json(
      { error: 'status_unavailable' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
