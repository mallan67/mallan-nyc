import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { cmaAutoResponseEmail } from '@/lib/email/templates';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import { createInquiry } from '@/lib/inquiries/create';

/**
 * POST /api/cma
 *
 * Handles Comparative Market Analysis (CMA) requests from the public /sell page.
 * Creates/updates a Lead record and logs an audit event.
 * TCPA/CTIA: form includes explicit consent checkbox (required affirmative action).
 */

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10/hr/IP. CMA submission sends two emails (broker + auto-response);
    // keeping the cap tight prevents bots from draining the outbound mail quota.
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'cma', 10, 3600))) {
      return NextResponse.json(
        { error: 'Too many valuation requests. Please try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      name, email, phone, address, unit, borough,
      propertyType, bedrooms, bathrooms, sqft, notes,
    } = body;

    // Validate required fields
    if (!name || !email || !phone || !address) {
      return NextResponse.json(
        { error: 'Name, email, phone, and property address are required' },
        { status: 400 }
      );
    }

    // ── TCPA affirmative consent (47 CFR 64.1200(f)(8)) ─────────────
    // P0-B compliance gate. Frontend (app/components/HomeValueWidget.tsx)
    // sends body.consent = formData.tcpaConsent === true. Reject any
    // submission missing the literal boolean true. Pattern mirrors the
    // /api/contact route post-Bug A14.
    if (body.consent !== true) {
      return NextResponse.json(
        { error: 'Affirmative consent (TCPA) is required. Please check the consent box and resubmit.' },
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
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Upsert lead — if email already exists, update; otherwise create new
    const lead = await prisma.lead.upsert({
      where: { email: email.toLowerCase().trim() },
      create: {
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase().trim(),
        phone: sanitizedPhone,
        roles: ['seller'],
        status: 'new',
        source: 'website',
        consent_captured_at: new Date(),
      },
      update: {
        // Update phone if provided (lead may have changed number)
        ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
        consent_captured_at: new Date(),
        updated_at: new Date(),
      },
    });

    // Log the CMA request as an audit event
    await prisma.auditEvent.create({
      data: {
        action: 'cma_request_submitted',
        entity_type: 'lead',
        entity_id: lead.id.toString(),
        user_type: 'public',
        user_id: null,
        changes: {
          address,
          unit: unit || null,
          borough: borough || null,
          property_type: propertyType || null,
          bedrooms: bedrooms || null,
          bathrooms: bathrooms || null,
          sqft: sqft || null,
          notes: notes || null,
          source: 'website_cma_form',
          submitted_at: new Date().toISOString(),
        },
      },
    });

    // Real Inquiry row (Workstream C1 of master refactor). Never throws —
    // a missing table or other failure does not break the CMA request.
    await createInquiry({
      source: 'cma_request',
      leadId: lead.id,
      message: notes ?? null,
      email: lead.email,
      phone: lead.phone,
      firstName,
      lastName,
      userAgent: request.headers.get('user-agent'),
      rawClientIp: ip,
      metadata: {
        address,
        unit: unit ?? undefined,
        borough: borough ?? undefined,
        property_type: propertyType ?? undefined,
        bedrooms: bedrooms ?? undefined,
        bathrooms: bathrooms ?? undefined,
        sqft: sqft ?? undefined,
      },
    });

    // Send email notification to broker (non-fatal)
    try {
      const safeAddress = address.replace(/[<>"]/g, '');
      const safeUnit = unit ? unit.replace(/[<>"]/g, '') : '';
      const subjectLine = `CMA Request: ${safeAddress}${safeUnit ? ` #${safeUnit}` : ''}`;
      const boroughLabel = borough
        ? borough.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        : '';

      const td = 'padding:4px 12px 4px 0;font-weight:bold;';
      const emailBody = `
        <h2>New CMA Request</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="${td}">Name:</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="${td}">Email:</td><td>${escapeHtml(email)}</td></tr>
          ${sanitizedPhone ? `<tr><td style="${td}">Phone:</td><td>${escapeHtml(sanitizedPhone)}</td></tr>` : ''}
          <tr><td style="${td}">Address:</td><td>${escapeHtml(address)}${unit ? ` #${escapeHtml(unit)}` : ''}</td></tr>
          ${boroughLabel ? `<tr><td style="${td}">Borough:</td><td>${escapeHtml(boroughLabel)}</td></tr>` : ''}
          ${propertyType ? `<tr><td style="${td}">Property Type:</td><td>${escapeHtml(String(propertyType))}</td></tr>` : ''}
          ${bedrooms ? `<tr><td style="${td}">Bedrooms:</td><td>${escapeHtml(String(bedrooms))}</td></tr>` : ''}
          ${bathrooms ? `<tr><td style="${td}">Bathrooms:</td><td>${escapeHtml(String(bathrooms))}</td></tr>` : ''}
          ${sqft ? `<tr><td style="${td}">Sq Ft:</td><td>${escapeHtml(String(sqft))}</td></tr>` : ''}
          ${notes ? `<tr><td style="${td}vertical-align:top;">Notes:</td><td>${escapeHtml(String(notes))}</td></tr>` : ''}
        </table>
      `.trim();

      const brokerEmailResult = await sendEmail('info@mallan.nyc', subjectLine, emailBody);
      if (!brokerEmailResult.success) {
        // ── SMTP fail-loud (P0-B compliance gate) ────────────────
        // When email send fails specifically because SMTP is not
        // configured (_devMode flag from sendgrid.ts:93), surface 503
        // to the caller. The Lead row is already saved above so the
        // valuation request data isn't lost. Pattern mirrors
        // /api/contact post-Bug A15.
        const isProd =
          process.env.NODE_ENV === 'production' ||
          process.env.VERCEL_ENV === 'production';
        if (isProd && brokerEmailResult._devMode === true) {
          return NextResponse.json(
            {
              error:
                'Email service unavailable. Your CMA request has been received (reference: ' +
                lead.id +
                '); we will follow up directly. Please also feel free to call 646-258-4460.',
              leadId: String(lead.id),
              code: 'SMTP_NOT_CONFIGURED',
            },
            { status: 503 }
          );
        }
        console.error('[/api/cma] Notification email failed: provider error redacted');
      }
    } catch (emailErr) {
      console.error('[/api/cma] [email redacted] notification error (non-fatal):', emailErr);
    }

    // Send auto-response to the requester (non-fatal)
    try {
      const autoResponseHtml = cmaAutoResponseEmail(firstName, address);
      // Transactional: direct response to a user's explicit CMA request
      await sendEmail(
        email.toLowerCase().trim(),
        `Your Property Valuation Request — ${address}`,
        autoResponseHtml,
        undefined,
        { transactional: true }
      );
    } catch (autoErr) {
      console.error('[/api/cma] Auto-response error (non-fatal):', autoErr);
    }

    return NextResponse.json({
      success: true,
      message: 'CMA request submitted successfully',
    });
  } catch (err) {
    console.error('[/api/cma] Error:', err);
    return NextResponse.json(
      { error: 'Failed to submit CMA request. Please try again.' },
      { status: 500 }
    );
  }
}
