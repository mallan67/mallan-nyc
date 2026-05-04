import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { inquiryAutoResponseEmail } from '@/lib/email/templates';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import { createInquiry } from '@/lib/inquiries/create';

/**
 * POST /api/inquiries
 *
 * Handles listing inquiry submissions from the public website.
 * Creates/updates a Lead record and logs an audit event.
 * TCPA/CTIA: requires explicit consent (agreeToTerms).
 * CAN-SPAM: optInUpdates is optional and separate from inquiry.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 30/hr/IP. Inquiries are the highest-volume legitimate
    // lead-capture, so this is generous — but bounded enough that a bot
    // can't flood the broker inbox or fill the Lead table.
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'inquiry', 30, 3600))) {
      return NextResponse.json(
        { error: 'Too many inquiries. Please try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { name, email, phone, message, preferredDate, listingId, listingAddress, agreeToTerms, optInUpdates, source } = body;

    // Calculator leads require only email; standard inquiries require name + email + phone
    const isCalculatorLead = source === 'calculator';

    // Validate required fields
    if (!email || (!isCalculatorLead && (!name || !phone))) {
      return NextResponse.json(
        { error: isCalculatorLead ? 'Email is required' : 'Name, email, and phone are required' },
        { status: 400 }
      );
    }

    if (!agreeToTerms) {
      return NextResponse.json(
        { error: 'You must agree to the Terms of Service and Privacy Policy' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Sanitize phone (strip non-digits except +)
    const sanitizedPhone = phone ? phone.replace(/[^\d+\-() ]/g, '').slice(0, 20) : '';

    // Parse name into first/last
    const displayName = name || 'Calculator Lead';
    const nameParts = displayName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Upsert lead — if email already exists, update; otherwise create new
    const consentNow = new Date();
    const lead = await prisma.lead.upsert({
      where: { email: email.toLowerCase().trim() },
      create: {
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase().trim(),
        phone: sanitizedPhone,
        roles: ['buyer'],
        status: 'new',
        source: isCalculatorLead ? 'calculator' : 'website',
        consent_captured_at: consentNow,
      },
      update: {
        // Update phone if provided (lead may have changed number)
        ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
        // Record consent timestamp if not already set
        consent_captured_at: consentNow,
        updated_at: new Date(),
      },
    });

    // Log the inquiry as an audit event
    await prisma.auditEvent.create({
      data: {
        action: 'inquiry_submitted',
        entity_type: 'lead',
        entity_id: lead.id.toString(),
        user_type: 'public',
        user_id: null,
        changes: {
          listing_id: listingId || null,
          listing_address: listingAddress || null,
          message: message || null,
          preferred_date: preferredDate || null,
          opt_in_updates: optInUpdates || false,
          source: 'website_inquiry_form',
          submitted_at: new Date().toISOString(),
        },
      },
    });

    // Real Inquiry row (Workstream C1 of master refactor). Never throws —
    // a missing table or other failure does not break lead capture.
    await createInquiry({
      source: 'inquiry',
      listingId: listingId ?? null,
      leadId: lead.id,
      message: message ?? null,
      email: lead.email,
      phone: lead.phone,
      firstName: lead.first_name,
      lastName: lead.last_name,
      consentCapturedAt: consentNow,
      userAgent: request.headers.get('user-agent'),
      rawClientIp: ip,
      metadata: {
        listing_address: listingAddress ?? undefined,
        preferred_date: preferredDate ?? undefined,
        opt_in_updates: optInUpdates ?? false,
        is_calculator_lead: isCalculatorLead,
      },
    });

    // Send email notification to agent (non-fatal)
    try {
      const subjectLine = listingAddress
        ? `New Inquiry: ${listingAddress}`
        : 'New Inquiry: General Inquiry';

      const td = 'padding:4px 12px 4px 0;font-weight:bold;';
      const emailBody = `
        <h2>New Listing Inquiry</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="${td}">Name:</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="${td}">Email:</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="${td}">Phone:</td><td>${escapeHtml(sanitizedPhone)}</td></tr>
          ${listingId ? `<tr><td style="${td}">Listing ID:</td><td>${escapeHtml(String(listingId))}</td></tr>` : ''}
          ${listingAddress ? `<tr><td style="${td}">Address:</td><td>${escapeHtml(String(listingAddress))}</td></tr>` : ''}
          ${preferredDate ? `<tr><td style="${td}">Preferred Date:</td><td>${escapeHtml(String(preferredDate))}</td></tr>` : ''}
          ${message ? `<tr><td style="${td}">Message:</td><td>${escapeHtml(String(message))}</td></tr>` : ''}
        </table>
      `.trim();

      const brokerEmailResult = await sendEmail('info@mallan.nyc', subjectLine, emailBody);
      if (!brokerEmailResult.success) {
        // ── SMTP fail-loud (P0-B compliance gate) ────────────────
        // Pattern mirrors /api/contact post-Bug A15. Lead/Inquiry/
        // AuditEvent rows are already saved above; surface 503 to the
        // caller in production when the broker notification can't go
        // out due to missing SMTP env vars rather than silently
        // returning success.
        const isProd =
          process.env.NODE_ENV === 'production' ||
          process.env.VERCEL_ENV === 'production';
        if (isProd && brokerEmailResult._devMode === true) {
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
        console.error('[/api/inquiries] Notification email failed: provider error redacted');
      }
    } catch (emailErr) {
      console.error('[/api/inquiries] [email redacted] notification error (non-fatal):', emailErr);
    }

    // Send auto-response to the client (non-fatal)
    try {
      const autoResponseHtml = inquiryAutoResponseEmail(firstName, listingAddress || undefined);
      // Transactional: direct response to a user's explicit inquiry submission
      await sendEmail(
        email.toLowerCase().trim(),
        listingAddress
          ? `We Received Your Inquiry About ${listingAddress}`
          : 'Thank You for Your Inquiry — Mallan Real Estate',
        autoResponseHtml,
        undefined,
        { transactional: true }
      );
    } catch (autoErr) {
      console.error('[/api/inquiries] Auto-response error (non-fatal):', autoErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Inquiry submitted successfully',
    });
  } catch (err) {
    console.error('[/api/inquiries] Error:', err);
    return NextResponse.json(
      { error: 'Failed to submit inquiry. Please try again.' },
      { status: 500 }
    );
  }
}
