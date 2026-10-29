// POST /api/crm/reports/email
//
// Emails a CRM property report (the HTML the Reports modal renders: grid, list,
// summary, detail, fact sheet, CMA, open house, images, comparison) to one
// recipient through the standard server mail pipeline (lib/email/sendgrid.ts,
// Microsoft 365 SMTP). Replaces the client-side EmailJS / "Email sent
// (simulated)" path, which never delivered anything and left no server record
// (found 2026-10-27: the Reports modal said "sent" while nothing left the CRM).
//
// Same shape as /api/crm/agent-inquiry: sender identity from the session (never
// from the body), AuditEvent on every attempt, SMTP fail-loud in production.
//
// Body:
//   to_email      required  recipient address
//   to_name       optional  recipient display name
//   subject       required
//   html          required  the report HTML (already carries the REBNY attribution,
//                           Equal Housing and commission-negotiability footers)
//   title         optional  report title (audit)
//   format        optional  grid | list | … (audit)
//   version       optional  customer | agent (audit)
//   listing_ids   optional  RLS ids in the report (audit; max 250)
//   client_id     optional  CRM client the report was addressed to (audit)
//
// Side effects: sendEmail(to, subject, html) on the agent channel (From = the
// sending agent, Reply-To = the agent); prisma.auditEvent.create({ action:
// 'report_emailed' | 'report_email_failed', entity_type: 'report', … }).

import { NextRequest, NextResponse } from 'next/server';
import { stripActiveContent } from '@/lib/email/relay-html';
import { requireAgentOrBroker, isAuthError, type SessionUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import { hashIp } from '@/lib/inquiries/create';

export const dynamic = 'force-dynamic';

interface ReportEmailBody {
  to_email: string;
  to_name?: string | null;
  subject: string;
  html: string;
  title?: string | null;
  format?: string | null;
  version?: string | null;
  listing_ids?: unknown;
  client_id?: string | number | null;
}

/** Mail clients and gateways refuse very large messages; the printed reports are well under this. */
const MAX_HTML_BYTES = 1_500_000;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // 60 report emails per hour per IP: a working agent's whole day, and a stop for a loop.
  const ip = extractClientIp(req.headers);
  if (!(await checkRouteRateLimit(ip, 'report_email', 60, 3600))) {
    return NextResponse.json(
      { error: 'Too many report emails. Please try again in an hour.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  let body: ReportEmailBody;
  try {
    body = (await req.json()) as ReportEmailBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const errors: string[] = [];
  if (!body.to_email || typeof body.to_email !== 'string' || !isValidEmail(body.to_email.trim())) errors.push('to_email');
  if (!body.subject || typeof body.subject !== 'string' || !body.subject.trim()) errors.push('subject');
  if (!body.html || typeof body.html !== 'string' || !body.html.trim()) errors.push('html');
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Missing or invalid required fields: ' + errors.join(', ') }, { status: 400 });
  }
  if (Buffer.byteLength(body.html, 'utf8') > MAX_HTML_BYTES) {
    return NextResponse.json({ error: 'Report is too large to email. Reduce the number of listings or photos.' }, { status: 413 });
  }

  const listingIds = Array.isArray(body.listing_ids)
    ? body.listing_ids.filter((v): v is string => typeof v === 'string').slice(0, 250)
    : [];
  const toEmail = body.to_email.trim();
  const toName = typeof body.to_name === 'string' ? body.to_name.trim().slice(0, 120) : '';
  const subject = body.subject.trim().slice(0, 200);

  const sessionUser: SessionUser = auth;

  // Sender = the canonical Agent record of the session user (From / Reply-To).
  let sender: { full_name: string | null; email: string } | null = null;
  try {
    sender = await prisma.agent.findUnique({
      where: { id: sessionUser.userId },
      select: { full_name: true, email: true },
    });
  } catch (err) {
    console.error('[reports/email] could not resolve the sending agent; sending from the company address:', err instanceof Error ? err.message : err);
  }
  const fromName = sender?.full_name?.trim() || 'Mallan Real Estate';
  const fromEmail = sender?.email || '';

  // The report is relayed as the agent composed it (the report builder escapes every listing text); the server strips active content and composes no HTML of its own.
  const html = stripActiveContent(body.html);
  const emailResult = await sendEmail(toEmail, subject, html, sessionUser as never, {
    channel: fromEmail ? 'agent' : 'company',
    from: fromEmail ? { email: fromEmail, name: fromName } : undefined,
    replyTo: fromEmail || undefined,
  });

  await prisma.auditEvent.create({
    data: {
      action: emailResult.success ? 'report_emailed' : 'report_email_failed',
      entity_type: 'report',
      entity_id: listingIds[0] || 'report',
      user_type: sessionUser.role === 'BROKER' ? 'broker' : 'agent',
      user_id: sessionUser.userId,
      changes: {
        recipient_name: toName || null,
        recipient_email_domain: toEmail.split('@')[1] || 'unknown',
        client_id: body.client_id != null ? String(body.client_id) : null,
        title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
        format: typeof body.format === 'string' ? body.format.slice(0, 40) : null,
        version: typeof body.version === 'string' ? body.version.slice(0, 40) : null,
        listing_count: listingIds.length,
        listing_ids: listingIds,
        html_bytes: Buffer.byteLength(html, 'utf8'),
        source: 'crm_reports_modal',
        success: emailResult.success,
        error_class: emailResult._devMode === true ? 'smtp_not_configured' : (emailResult.success ? null : (emailResult._suppressed ? 'recipient_unsubscribed' : 'send_failed')),
        ip_hash: hashIp(ip),
      },
    },
  });

  if (!emailResult.success) {
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    if (emailResult._suppressed) {
      return NextResponse.json(
        { error: 'This recipient has unsubscribed from Mallan email. The report was not sent.', code: 'RECIPIENT_UNSUBSCRIBED' },
        { status: 409 },
      );
    }
    if (isProd && emailResult._devMode === true) {
      return NextResponse.json(
        { error: 'Email service unavailable. The report was not sent.', code: 'SMTP_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    if (emailResult._devMode === true) {
      // Development without SMTP: say so instead of pretending it went out.
      return NextResponse.json(
        { error: 'Email is not configured in this environment. The report was not sent.', code: 'SMTP_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: 'The report could not be emailed. Please retry shortly.', code: 'SEND_FAILED' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { success: true, recipientEmail: toEmail, recipientName: toName, listingCount: listingIds.length, messageId: emailResult.messageId ?? null },
    { status: 200 },
  );
}
