// /api/settings/company — company settings, canonical build-time source.
//
// HONESTY CORRECTION (2026-07-23, Maya finding #6): the old POST wrote
// data/company-settings.json on EPHEMERAL serverless storage — the write
// vanished on the next cold start, and after the Neon-quiet change the
// public shell (Footer/HeroSearch) renders the canonical build-time module
// regardless. Leaving POST "working" would let a broker believe an update
// took effect when the public site could never show it. The editor path is
// therefore EXPLICITLY DEPRECATED: POST now returns 410 Gone with a clear
// message. No in-repo UI calls this POST (repo-wide sweep 2026-07-23:
// zero callers). To change company settings today, edit
// lib/config/public-company-settings.ts and deploy — the one source both
// this GET and the public shell serve. A durable editor requires the
// CompanySetting table migration (HELD — Maya approval) plus tag-based
// invalidation of the public shell; that design is noted in
// docs/operations/neon-quiet-public-shell-2026-07-23.md.
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, isAuthError, logAuditEvent } from '@/lib/auth/middleware';
import { PUBLIC_COMPANY_SETTINGS } from '@/lib/config/public-company-settings';

export const dynamic = 'force-dynamic';

// ONE canonical source shared with the public shell (Footer/HeroSearch
// import it directly) — GET serves the same module so nothing can drift.
const DEFAULT_SETTINGS = PUBLIC_COMPANY_SETTINGS;

export async function GET() {
  return NextResponse.json(DEFAULT_SETTINGS);
}

export async function POST(request: NextRequest) {
  // Still broker-gated so the deprecation response never leaks to anonymous
  // callers, and the attempt is auditable.
  const auth = await requireBroker(request);
  if (isAuthError(auth)) return auth;

  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  await logAuditEvent('update_rejected_deprecated', 'company_settings', 'company', auth, {
    reason: 'ephemeral-editor-deprecated-2026-07-23',
  }, ip);

  return NextResponse.json(
    {
      error:
        'The company-settings editor is deprecated: its storage was ephemeral and updates never reliably reached the public site. ' +
        'Edit lib/config/public-company-settings.ts and deploy instead.',
    },
    { status: 410 },
  );
}
