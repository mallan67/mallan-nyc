import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { linkSessionToLead } from '@/lib/behavioral/events';

export const dynamic = 'force-dynamic';

/**
 * POST /api/identity/capture
 *
 * Soft identity capture — email only, minimal friction.
 * Links anonymous behavioral events to the identified lead.
 * Records TCPA consent timestamp.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, sessionId, source } = body;

    // Validate email
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Sanitize
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || '').trim().substring(0, 100);
    const firstName = cleanName.split(' ')[0] || 'Unknown';
    const lastName = cleanName.split(' ').slice(1).join(' ') || '';

    // Upsert lead
    const lead = await prisma.lead.upsert({
      where: { email: cleanEmail },
      create: {
        first_name: firstName,
        last_name: lastName,
        email: cleanEmail,
        phone: '',
        source: source || 'website',
        anonymous_session_id: sessionId,
        consent_captured_at: new Date(),
      },
      update: {
        anonymous_session_id: sessionId,
        // Only update consent if not already set
        ...(await prisma.lead.findUnique({ where: { email: cleanEmail }, select: { consent_captured_at: true } })
          .then(existing => existing?.consent_captured_at ? {} : { consent_captured_at: new Date() })),
      },
    });

    // Link anonymous behavioral events to this lead
    const linked = await linkSessionToLead(sessionId, lead.id);

    // Update micro-commitment record
    await prisma.microCommitment.upsert({
      where: { id: BigInt(0) }, // Will fail, use create path
      create: {
        anonymous_session_id: sessionId,
        lead_id: lead.id,
        stage: 'soft_identity',
        email: cleanEmail,
        source: source || 'website',
        consent_captured_at: new Date(),
      },
      update: {
        lead_id: lead.id,
        stage: 'soft_identity',
        email: cleanEmail,
      },
    }).catch(() => {
      // If upsert fails (no unique constraint on session), just create
      return prisma.microCommitment.create({
        data: {
          anonymous_session_id: sessionId,
          lead_id: lead.id,
          stage: 'soft_identity',
          email: cleanEmail,
          source: source || 'website',
          consent_captured_at: new Date(),
        },
      });
    });

    return NextResponse.json({
      ok: true,
      linkedEvents: linked,
    });
  } catch (err) {
    console.error('[Identity/Capture] Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
