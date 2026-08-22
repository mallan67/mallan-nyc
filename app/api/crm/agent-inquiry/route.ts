// POST /api/crm/agent-inquiry
//
// Agent-to-agent inquiry about a listing. The "Email Listing Agent"
// button on the CRM detail page POSTs here. Replaces the prior
// client-side mailto / sendEmailDirect path which had no audit trail
// and no REBNY attribution in the body.
//
// Compliance gates:
//   - REBNY UCBA Art. III §2(C) attribution in email body
//   - NY DOS 19 NYCRR §175.25 brokerage identity (Mallan Real Estate Inc.
//     + office address + phone + brokerage license #10991205323)
//   - NY SHIELD Act audit trail (AuditEvent row, IP not logged in
//     plaintext per existing pattern)
//   - SMTP fail-loud in production (Bug A15 pattern)
//
// Auth: requireAgentOrBroker. Sender identity comes from the session
// (NOT from the request body) so an agent cannot impersonate another
// broker. Recipient identity (agent_email / agent_name) comes from
// the listing record displayed in the CRM.
//
// Body validation:
//   listing_id          required (RLS ID — Trestle Property.ListingId)
//   listing_address     required
//   agent_email         required (recipient listing agent's email)
//   agent_name          required (recipient listing agent's display name)
//   message             required (free-text question/request)
//   listing_price       optional (number; rendered as "$N")
//   listing_status      optional (post-A14 mapped status string)
//   listing_unit        optional
//   listing_url         optional (canonical public mallan.nyc URL)
//   listing_neighborhood / listing_borough / listing_zip optional
//
// Side effects (per call):
//   1. sendEmail(recipient, subject, html) via the standard
//      lib/email/sendgrid.ts pipeline
//   2. prisma.auditEvent.create({ action: 'agent_inquiry_sent',
//      entity_type: 'listing', entity_id: listing_id, user_type: 'agent',
//      user_id: from session, changes: { recipient_email, listing_address,
//      message_length, source: 'crm_detail_page' } })
//
// Lead/Inquiry rows are NOT created — agent-to-agent inquiries are
// not consumer leads.

import { migrateLegacyStatusValue } from '@/lib/search/legacy-status-migration';
import { statusDisplayLabel } from '@/lib/search/canonical/status-token-contract';
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import { hashIp } from '@/lib/inquiries/create';

export const dynamic = 'force-dynamic';

interface AgentInquiryBody {
  listing_id: string;
  listing_address: string;
  agent_email: string;
  agent_name: string;
  message: string;
  listing_price?: number | string | null;
  listing_status?: string | null;
  listing_unit?: string | null;
  listing_url?: string | null;
  listing_neighborhood?: string | null;
  listing_borough?: string | null;
  listing_zip?: string | null;
}

const BROKERAGE_NAME = 'Mallan Real Estate Inc.';
const BROKERAGE_ADDRESS = '400 East 90th Street, Suite 17C, New York, NY 10128';
const BROKERAGE_PHONE = '646-258-4460';
const BROKERAGE_LICENSE = '#10991205323';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function statusLabel(raw: string | null | undefined): string {
  // Labels are derived from the EXACT Cotality StandardStatus member, which is
  // what `status` now carries end to end. This compared against a Mallan
  // uppercase vocabulary that no longer exists in the data.
  //
  // An absent status no longer reads as 'Active': telling a client an unknown
  // listing is on the market is the defect this whole pass exists to remove.
  // THIS IS AN INBOUND API BOUNDARY. `listing_status` arrives in a caller's
  // payload and may still carry a legacy spelling, so it is migrated to the
  // exact Cotality member HERE, explicitly, before anything is rendered.
  //
  // The previous version compared exact members directly and let anything else
  // fall through to a defensive `charAt(0) + slice(1).toLowerCase()` reformat.
  // A caller sending the legacy `COMING_SOON` therefore produced "Coming soon"
  // - lower-case s - in an email to a listing agent. CI caught it. Reformatting
  // an unrecognised machine value into something that LOOKS like a label is the
  // same class of invention as the vocabulary this pass removed.
  const member = migrateLegacyStatusValue(raw);
  if (member === null) return 'Status Unavailable';

  // Surface-specific wording. This email is addressed to a listing agent, where
  // "In Contract" is the term of art; the shared statusDisplayLabel() says
  // "Under Contract" for broker-facing UI. Different audience, same underlying
  // member - presentation may vary, the value may not.
  if (member === 'ActiveUnderContract') return 'In Contract';

  return statusDisplayLabel(member);
}

function buildAgentInquiryHtml(opts: {
  listingId: string;
  listingAddress: string;
  listingUnit: string;
  listingPrice: number;
  listingStatus: string;
  listingNeighborhood: string;
  listingBorough: string;
  listingZip: string;
  listingUrl: string;
  recipientName: string;
  message: string;
  fromName: string;
  fromTitle: string;
  fromEmail: string;
  fromPhone: string;
}): string {
  const e = escapeHtml;
  const fullAddr = e(opts.listingAddress) + (opts.listingUnit ? `, ${e(opts.listingUnit)}` : '');
  const priceStr = opts.listingPrice > 0
    ? `$${opts.listingPrice.toLocaleString('en-US')}`
    : '—';
  const locationLine = [opts.listingNeighborhood, opts.listingBorough, opts.listingZip]
    .filter(Boolean)
    .map(e)
    .join(', ');
  const greeting = opts.recipientName
    ? `Dear ${e(opts.recipientName.split(' ')[0])},`
    : 'Hello,';

  return [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">',
      '<div style="background:#1a1a1a;padding:16px 24px;border-radius:8px 8px 0 0;">',
        '<span style="font-size:18px;font-weight:700;color:#C4A052;letter-spacing:2px;">MALLAN</span>',
        '<span style="font-size:18px;font-weight:300;color:#fff;letter-spacing:2px;margin-left:4px;">NYC</span>',
      '</div>',
      '<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">',
        `<p style="font-size:14px;margin:0 0 12px;">${greeting}</p>`,
        '<p style="font-size:14px;margin:0 0 16px;">I am writing to inquire about the following listing:</p>',
        // Listing card
        '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;background:#f9fafb;margin:0 0 16px;">',
          `<p style="margin:0 0 4px;font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.5px;">RLS ID: ${e(opts.listingId)}</p>`,
          `<p style="margin:0 0 2px;font-size:18px;font-weight:700;">${priceStr}</p>`,
          `<p style="margin:0 0 4px;font-size:15px;font-weight:600;">${fullAddr}</p>`,
          locationLine ? `<p style="margin:0 0 6px;font-size:13px;color:#6b7280;">${locationLine}</p>` : '',
          `<p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#374151;">Status: ${e(opts.listingStatus)}</p>`,
          opts.listingUrl
            ? `<a href="${e(opts.listingUrl)}" style="display:inline-block;padding:8px 16px;background:#1a1a1a;color:#fff;font-size:12px;font-weight:600;text-decoration:none;border-radius:6px;">View Listing</a>`
            : '',
        '</div>',
        // The actual message
        '<p style="font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin:16px 0 6px;">Message</p>',
        `<div style="font-size:14px;line-height:1.5;white-space:pre-wrap;margin:0 0 20px;">${e(opts.message)}</div>`,
        // Sender contact card
        '<div style="border-top:1px solid #e5e7eb;padding-top:16px;">',
          '<p style="margin:0 0 2px;font-size:9px;text-transform:uppercase;color:#9ca3af;letter-spacing:1px;">From</p>',
          `<p style="margin:0 0 2px;font-size:15px;font-weight:700;">${e(opts.fromName)}</p>`,
          `<p style="margin:0 0 2px;font-size:13px;color:#4b5563;">${e(opts.fromTitle)}</p>`,
          `<p style="margin:0 0 2px;font-size:13px;color:#4b5563;">${BROKERAGE_NAME} · License ${BROKERAGE_LICENSE}</p>`,
          `<p style="margin:0 0 2px;font-size:13px;color:#4b5563;">${BROKERAGE_ADDRESS}</p>`,
          `<p style="margin:0;font-size:13px;color:#2563eb;">${e(opts.fromPhone || BROKERAGE_PHONE)}${opts.fromEmail ? ' · ' + e(opts.fromEmail) : ''}</p>`,
        '</div>',
      '</div>',
      // REBNY/IDX attribution footer (UCBA Art. III §2(C))
      '<div style="margin-top:14px;padding:0 4px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;line-height:1.4;">',
        'Listing data via REBNY RLS / IDX Plus (Cotality/Trestle). ',
        `${BROKERAGE_NAME} is a participating broker. ${BROKERAGE_ADDRESS} · ${BROKERAGE_PHONE}.`,
      '</div>',
    '</div>',
  ].join('');
}

export async function POST(req: NextRequest) {
  // Auth — same helper as /api/idx/search; agents and brokers may send.
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  // Rate limit: 30/hr/IP. Agent inquiries are low-volume and broker-
  // initiated, but the cap stops accidental loops + protects the
  // outbound mail quota.
  const ip = extractClientIp(req.headers);
  if (!(await checkRouteRateLimit(ip, 'agent_inquiry', 30, 3600))) {
    return NextResponse.json(
      { error: 'Too many agent inquiries. Please try again in an hour.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  let body: AgentInquiryBody;
  try {
    body = (await req.json()) as AgentInquiryBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields. Sender identity comes from the session
  // (auth) — frontend cannot forge from_agent_*.
  const errors: string[] = [];
  if (!body.listing_id || typeof body.listing_id !== 'string') errors.push('listing_id');
  if (!body.listing_address || typeof body.listing_address !== 'string') errors.push('listing_address');
  if (!body.agent_email || typeof body.agent_email !== 'string' || !isValidEmail(body.agent_email)) errors.push('agent_email');
  if (!body.agent_name || typeof body.agent_name !== 'string') errors.push('agent_name');
  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) errors.push('message');
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Missing or invalid required fields: ' + errors.join(', ') },
      { status: 400 },
    );
  }

  const sessionUser = auth as {
    id?: string | number | bigint;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
  };
  const fromName =
    [sessionUser.first_name, sessionUser.last_name].filter(Boolean).join(' ').trim() ||
    sessionUser.email ||
    'Mallan Agent';
  const fromTitle =
    sessionUser.role === 'BROKER' ? 'Licensed Real Estate Broker' : 'Licensed Real Estate Salesperson';
  const fromEmail = sessionUser.email || '';
  const fromPhone = ''; // Phone lookup deferred; CRM session doesn't currently expose phone

  const html = buildAgentInquiryHtml({
    listingId: body.listing_id,
    listingAddress: body.listing_address,
    listingUnit: body.listing_unit ?? '',
    listingPrice: Number(body.listing_price ?? 0) || 0,
    listingStatus: statusLabel(body.listing_status),
    listingNeighborhood: body.listing_neighborhood ?? '',
    listingBorough: body.listing_borough ?? '',
    listingZip: body.listing_zip ?? '',
    listingUrl: body.listing_url ?? '',
    recipientName: body.agent_name,
    message: body.message.trim().slice(0, 4000),
    fromName,
    fromTitle,
    fromEmail,
    fromPhone,
  });

  const subjectAddrPart = body.listing_unit
    ? `${body.listing_address}, ${body.listing_unit}`
    : body.listing_address;
  const subject = `Agent Inquiry: ${subjectAddrPart}`;

  // Attempt the send. SMTP fail-loud per the post-A15 pattern: when
  // _devMode is true in production, Lead row would be saved here if
  // we had one — but agent inquiries don't create Lead rows. Audit
  // event is written below regardless of outcome so we have a record.
  const emailResult = await sendEmail(body.agent_email, subject, html, sessionUser as never, {
    transactional: true, // direct response to a specific agent's listing inquiry
  });

  // ── AuditEvent (required regardless of email outcome) ──
  // Records the attempt + outcome. Listing entity_id is the RLS ID.
  // user_id is the sending agent. NY SHIELD Act compliance: records
  // who/what/when without leaking recipient PII into log files.
  await prisma.auditEvent.create({
    data: {
      action: emailResult.success ? 'agent_inquiry_sent' : 'agent_inquiry_send_failed',
      entity_type: 'listing',
      entity_id: body.listing_id,
      user_type: sessionUser.role === 'BROKER' ? 'broker' : 'agent',
      // AuditEvent.user_id is BigInt? per prisma/schema.prisma:685.
      // Coerce session id (string|number|bigint) to BigInt; null on
      // missing.
      user_id: sessionUser.id != null
        ? (typeof sessionUser.id === 'bigint' ? sessionUser.id : BigInt(sessionUser.id))
        : null,
      changes: {
        recipient_agent_name: body.agent_name,
        // Recipient email recorded but NOT logged to console
        recipient_email_domain: body.agent_email.split('@')[1] || 'unknown',
        listing_address: body.listing_address,
        listing_id: body.listing_id,
        message_length: body.message.length,
        source: 'crm_detail_page',
        success: emailResult.success,
        error_class: emailResult._devMode === true ? 'smtp_not_configured' : (emailResult.success ? null : 'send_failed'),
        // Codex Risk P0 fix: replace base64-of-IP (trivially reversible)
        // with the keyed SHA-256 hash used by lib/inquiries/create.ts. Same
        // salt source order: INQUIRY_IP_SALT → SESSION_SECRET → fallback.
        ip_hash: hashIp(ip),
      },
    },
  });

  if (!emailResult.success) {
    // SMTP fail-loud (P0-B pattern, post-A15)
    const isProd =
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL_ENV === 'production';
    if (isProd && emailResult._devMode === true) {
      return NextResponse.json(
        {
          error: 'Email service unavailable. Inquiry recorded; please follow up directly. Reference: ' + body.listing_id,
          listingId: body.listing_id,
          code: 'SMTP_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }
    // Non-config failure (transient SMTP error) — return 502, audit
    // event already recorded above so ops can see the failure rate.
    return NextResponse.json(
      { error: 'Email could not be sent. The inquiry was recorded; please retry shortly.' },
      { status: 502 },
    );
  }

  return NextResponse.json(
    { success: true, listingId: body.listing_id, recipientEmail: body.agent_email },
    { status: 200 },
  );
}
