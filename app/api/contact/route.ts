import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/sendgrid';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import { createInquiry } from '@/lib/inquiries/create';
import {
  extractBehavioralSessionId,
  linkBehavioralSessionToLead,
} from '@/lib/behavioral/session-link';
// A3 (2026-05-20): intent routing. Re-exported below so a refactor that
// renames or removes these symbols red-lights the contact-form-consent
// test suite (source-pin assertion).
import {
  INTENT_ALLOWLIST,
  classifyIntent,
  mergeRoles,
  truncateIntentRaw,
} from '@/lib/leads/intent';
// A3 Codex fix (2026-05-20): atomic DB-side roles union — see
// lib/leads/lead-upsert.ts header for the race scenario this closes.
import { atomicMergeUpsertLead } from '@/lib/leads/lead-upsert';

// Re-export so the symbols are visibly part of the route module surface and
// the source-pin test in tests/runtime/contact-form-consent.test.ts can
// assert their presence without requiring a separate import line.
// `mergeRoles` is still exported because (a) external callers may rely on
// the JS implementation, and (b) the source-pin test asserts it is
// present — see tests/runtime/contact-form-consent.test.ts.
export { INTENT_ALLOWLIST, classifyIntent, mergeRoles };

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

    // ── TCPA affirmative consent (47 CFR 64.1200(f)(8)) ─────────────
    // Bug A14 — prior to 2026-05-04 the route accepted only the
    // consent timestamp. Frontend sent it on every submit regardless
    // of whether the user actually checked the consent box, so the
    // audit trail recorded a timestamp without proof of affirmative
    // consent. Fix: require body.consent === true literally.
    if (body.consent !== true) {
      return NextResponse.json(
        { error: 'Affirmative consent (TCPA) is required. Please check the consent box and resubmit.' },
        { status: 400 }
      );
    }

    if (!body.consentTimestamp || typeof body.consentTimestamp !== 'string') {
      return NextResponse.json({ error: 'Consent timestamp is required' }, { status: 400 });
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
    const behavioralSessionId = extractBehavioralSessionId(body);

    // ── Intent routing (A3, 2026-05-20) ─────────────────────────────
    // Public CTAs across the site pass `?intent=...` to /contact (e.g.
    // /contact?intent=international-seller for the international-owner
    // landing page). The client posts it through as body.intent. We:
    //   1. classify against a CLOSED allowlist (unknown → "general")
    //   2. keep the raw value (truncated) for forensic logging only
    //   3. additively merge the resulting role(s) onto any existing
    //      roles already on the lead — never demote, never overwrite.
    // Audit pointer:
    //   docs/audits/exclusive-launch-readiness-audit-2026-05-20.md → A3.
    const intentRaw = truncateIntentRaw(body.intent);
    const { intent, roles: incomingRoles } = classifyIntent(body.intent);

    // Store in database as a Lead record
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const consentDate = new Date(body.consentTimestamp);

    // Atomic insert-or-merge — the roles union is evaluated DB-side
    // inside a single INSERT ... ON CONFLICT statement, so concurrent
    // submissions for the same email cannot drop a role under TOCTOU.
    // See lib/leads/lead-upsert.ts header for the race scenario that
    // the prior findUnique → mergeRoles → upsert path was vulnerable to
    // (Codex review on PR #171, 2026-05-20). The JS `mergeRoles()`
    // helper is still exported for use by other lead-write surfaces
    // and for the source-pin contract in the test suite, but it is
    // intentionally NOT called on this hot path.
    const lead = await atomicMergeUpsertLead(prisma, {
      email,
      firstName,
      lastName,
      phone: phone || '',
      incomingRoles,
      consentCapturedAt: consentDate,
    });
    const mergedRoles = lead.roles;

    await linkBehavioralSessionToLead(behavioralSessionId, lead.id);

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
          // A3: intent routing audit trail. `intent` is the normalized
          // allowlist value; `intent_raw` preserves the (truncated) input
          // for forensic review even when the input was XSS payload or
          // unknown garbage; `roles_after_merge` records the post-merge
          // role array so re-running classifyIntent later is not needed.
          intent,
          intent_raw: intentRaw,
          roles_after_merge: mergedRoles,
        },
      },
    });

    // Real Inquiry row (Workstream C1 of master refactor). Never throws —
    // a missing table or other failure does not break the contact form.
    await createInquiry({
      source: 'contact_form',
      leadId: lead.id,
      message,
      email,
      phone: phone || null,
      firstName,
      lastName,
      consentCapturedAt: consentDate,
      userAgent: request.headers.get('user-agent'),
      rawClientIp: ip,
      metadata: {
        received_at: receivedAt,
        // A3: normalized intent (allowlist value). Raw value is intentionally
        // kept ONLY in AuditEvent.changes.intent_raw — not duplicated into
        // Inquiry.metadata — so forensic review has a single canonical home.
        intent,
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
        console.error('[CONTACT] Notification email failed: provider error redacted');
        // ── Bug A15 / SMTP fail-loud (P0 compliance) ──────────────
        // Per the proof-matrix audit (2026-05-04), missing SMTP
        // config silently dropped emails and returned 200 to the
        // user — a "success" that hid the broken pipeline. In
        // production, when the email send fails specifically because
        // SMTP is not configured (_devMode flag from sendgrid.ts:93),
        // surface 503 to the user. The Lead row is already saved
        // above so the inquiry data isn't lost.
        const isProd =
          process.env.NODE_ENV === 'production' ||
          process.env.VERCEL_ENV === 'production';
        if (isProd && emailResult._devMode === true) {
          return NextResponse.json(
            {
              error:
                'Email service unavailable. Your inquiry has been received (reference: ' +
                lead.id +
                '); we will respond directly. Please also feel free to call 646-258-4460.',
              leadId: String(lead.id),
              code: 'SMTP_NOT_CONFIGURED',
            },
            { status: 503 }
          );
        }
      }
    } catch (emailErr) {
      // Codex Risk P0 fix: do not pass the raw exception object —
      // SMTP errors can carry the recipient address, message id, server
      // banner, or other sensitive fragments. Log a category + lead ref
      // only. The AuditEvent row above (action=contact_form_submitted)
      // is the durable record; this console line is operational.
      const errCategory =
        emailErr instanceof Error ? errCategory_(emailErr.message) : 'unknown';
      console.error(`[CONTACT] notification error (non-fatal) | category=${errCategory} ref=${lead.id}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    // Codex Risk P0 fix: redact server error logs. The original
    // `console.error('[CONTACT] Error processing submission:', error)`
    // emitted full stack traces including DB error payloads which can
    // include parameter values. Log a category only.
    const errCategory =
      error instanceof Error ? errCategory_(error.message) : 'unknown';
    console.error(`[CONTACT] submission error | category=${errCategory}`);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Map an arbitrary error message to one of a fixed set of categories so
// the operational console line never emits user-typed data, recipient
// addresses, or provider banners.
function errCategory_(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('rate limit') || m.includes('429')) return 'rate_limited';
  if (m.includes('econn') || m.includes('etimed') || m.includes('timeout')) return 'network_timeout';
  if (m.includes('auth') || m.includes('535') || m.includes('credentials')) return 'auth_failed';
  if (m.includes('quota') || m.includes('throttl')) return 'quota';
  if (m.includes('prisma') || m.includes('database') || m.includes('p2002')) return 'db';
  if (m.includes('json') || m.includes('parse')) return 'parse';
  return 'other';
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
    // Codex Risk P0 fix: redact raw Prisma error from admin read path.
    const cat = error instanceof Error ? errCategory_(error.message) : 'unknown';
    console.error(`[CONTACT] read error | category=${cat}`);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
