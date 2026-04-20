import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/sendgrid';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';

/**
 * Contact Form API - TCPA-Safe Implementation
 *
 * Compliance requirements:
 * - No autoresponders (manual follow-up only)
 * - No SMS sending
 * - No CRM automation
 * - Store consent timestamp for compliance records
 * - Minimal data collection
 *
 * Storage: PostgreSQL via Prisma (Lead + AuditEvent)
 */

export const dynamic = 'force-dynamic';

// Validation helpers
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeString(str: string, maxLength: number): string {
  return str.trim().slice(0, maxLength).replace(/[<>]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 submissions/hr/IP. Contact forms are the #1 vector for
    // DB row flood + broker-inbox spam; this keeps the route usable for humans
    // but stops bots from bulk-filling the Lead table.
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'contact', 20, 3600))) {
      return NextResponse.json(
        { error: 'Too many contact form submissions. Please try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!body.email || typeof body.email !== 'string' || !isValidEmail(body.email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!body.consentTimestamp || typeof body.consentTimestamp !== 'string') {
      return NextResponse.json({ error: 'Consent is required' }, { status: 400 });
    }

    // Validate consent timestamp is recent (within last 5 minutes)
    const consentTime = Date.parse(body.consentTimestamp);
    if (isNaN(consentTime) || Date.now() - consentTime > 5 * 60 * 1000) {
      return NextResponse.json({ error: 'Invalid consent' }, { status: 400 });
    }

    // Sanitize input
    const name = sanitizeString(body.name, 100);
    const email = sanitizeString(body.email, 254).toLowerCase();
    const phone = body.phone ? sanitizeString(body.phone, 20) : undefined;
    const message = sanitizeString(body.message, 2000);
    const receivedAt = new Date().toISOString();

    // Store in database as a Lead record
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const consentDate = new Date(body.consentTimestamp);
    const lead = await prisma.lead.upsert({
      where: { email },
      create: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || '',
        roles: ['buyer'],
        status: 'new',
        source: 'contact_form',
        consent_captured_at: consentDate,
      },
      update: {
        phone: phone || undefined,
        consent_captured_at: consentDate,
        updated_at: new Date(),
      },
    });

    await prisma.auditEvent.create({
      data: {
        action: 'contact_form_submitted',
        entity_type: 'lead',
        entity_id: lead.id.toString(),
        user_type: 'public',
        user_id: null,
        changes: {
          message,
          consent_timestamp: body.consentTimestamp,
          source: 'contact_form',
        },
      },
    });

    // Audit trail is in DB (AuditEvent above) — no console PII logging in production

    // Send email notification (non-fatal — don't fail the API response if email fails)
    try {
      const subjectLine = `New Contact Form: ${name}`;
      const td = 'padding:4px 12px 4px 0;font-weight:bold;';
      const emailBody = `
        <h2>New Contact Form Submission</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="${td}">Name:</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="${td}">Email:</td><td>${escapeHtml(email)}</td></tr>
          ${phone ? `<tr><td style="${td}">Phone:</td><td>${escapeHtml(phone)}</td></tr>` : ''}
          <tr><td style="${td}">Message:</td><td>${escapeHtml(message)}</td></tr>
          <tr><td style="${td}">Received:</td><td>${receivedAt}</td></tr>
        </table>
      `.trim();

      const emailResult = await sendEmail('info@mallan.nyc', subjectLine, emailBody);
      if (!emailResult.success) {
        console.error('[CONTACT] Notification email failed:', emailResult.error);
      }
    } catch (emailErr) {
      console.error('[CONTACT] [email redacted] notification error (non-fatal):', emailErr);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[CONTACT] Error processing submission:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET - Admin endpoint to retrieve submissions (requires agent/broker session)
export async function GET(request: NextRequest) {
  const auth = await requireAgentOrBroker(request);
  if (isAuthError(auth)) return auth;

  try {
    const leads = await prisma.lead.findMany({
      where: { source: 'contact_form' },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: {
        id: true, first_name: true, last_name: true, email: true, phone: true,
        source: true, status: true, notes: true, created_at: true,
      },
    });
    return NextResponse.json(leads.map(l => ({ ...l, id: String(l.id) })));
  } catch (error) {
    console.error('[CONTACT] Error reading submissions:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
