import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';

/**
 * POST /api/guides/download
 *
 * Handles gated guide download requests.
 * Captures lead info, logs audit event, notifies broker, returns guide slug.
 * TCPA: requires explicit consent (agreeToTerms).
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 15/hr/IP. Guide downloads are one-off per user, so this
    // cap is generous but stops email-farm scraping of the broker notification.
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'guide', 15, 3600))) {
      return NextResponse.json(
        { error: 'Too many guide requests. Please try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    const body = await request.json();
    const { name, email, guideType, agreeToTerms } = body;

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!agreeToTerms) {
      return NextResponse.json(
        { error: 'You must agree to the Terms of Service and Privacy Policy' },
        { status: 400 }
      );
    }

    if (!guideType || !['buyer', 'seller'].includes(guideType)) {
      return NextResponse.json(
        { error: 'Invalid guide type' },
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

    // Parse name if provided
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Determine role based on guide type
    const role = guideType === 'buyer' ? 'buyer' : 'seller';

    // Upsert lead
    const lead = await prisma.lead.upsert({
      where: { email: email.toLowerCase().trim() },
      create: {
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase().trim(),
        phone: '',
        roles: [role],
        status: 'new',
        source: 'guide_download',
        consent_captured_at: new Date(),
      },
      update: {
        consent_captured_at: new Date(),
        updated_at: new Date(),
      },
    });

    // Log audit event
    await prisma.auditEvent.create({
      data: {
        action: 'guide_downloaded',
        entity_type: 'lead',
        entity_id: lead.id.toString(),
        user_type: 'public',
        user_id: null,
        changes: {
          guide_type: guideType,
          source: 'guide_download',
          submitted_at: new Date().toISOString(),
        },
      },
    });

    // Notify broker (non-fatal)
    try {
      const guideTitle = guideType === 'buyer' ? "NYC Buyer's Guide" : "NYC Seller's Guide";
      const td = 'padding:4px 12px 4px 0;font-weight:bold;';
      const emailBody = `
        <h2>Guide Download Lead</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="${td}">Guide:</td><td>${escapeHtml(guideTitle)}</td></tr>
          ${name ? `<tr><td style="${td}">Name:</td><td>${escapeHtml(String(name))}</td></tr>` : ''}
          <tr><td style="${td}">Email:</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="${td}">Time:</td><td>${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</td></tr>
        </table>
      `.trim();

      await sendEmail('info@mallan.nyc', `New Lead: ${guideTitle} Download`, emailBody);
    } catch (emailErr) {
      console.error('[/api/guides/download] [email redacted] notification error (non-fatal):', emailErr);
    }

    return NextResponse.json({
      success: true,
      guideType,
    });
  } catch (err) {
    console.error('[/api/guides/download] Error:', err);
    return NextResponse.json(
      { error: 'Failed to process request. Please try again.' },
      { status: 500 }
    );
  }
}
