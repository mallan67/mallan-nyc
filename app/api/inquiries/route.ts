import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { inquiryAutoResponseEmail } from '@/lib/email/templates';

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
    const body = await request.json();

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
      },
      update: {
        // Update phone if provided (lead may have changed number)
        ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
        // Don't overwrite existing status — only update if still 'new'
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

    // Send email notification to agent (non-fatal)
    try {
      const subjectLine = listingAddress
        ? `New Inquiry: ${listingAddress}`
        : 'New Inquiry: General Inquiry';

      const emailBody = `
        <h2>New Listing Inquiry</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Name:</td><td>${name}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Email:</td><td>${email}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Phone:</td><td>${sanitizedPhone}</td></tr>
          ${listingId ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Listing ID:</td><td>${listingId}</td></tr>` : ''}
          ${listingAddress ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Address:</td><td>${listingAddress}</td></tr>` : ''}
          ${preferredDate ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Preferred Date:</td><td>${preferredDate}</td></tr>` : ''}
          ${message ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Message:</td><td>${message}</td></tr>` : ''}
        </table>
      `.trim();

      await sendEmail('info@mallan.nyc', subjectLine, emailBody);
    } catch (emailErr) {
      console.error('[/api/inquiries] Email notification error (non-fatal):', emailErr);
    }

    // Send auto-response to the client (non-fatal)
    try {
      const autoResponseHtml = inquiryAutoResponseEmail(firstName, listingAddress || undefined);
      await sendEmail(
        email.toLowerCase().trim(),
        listingAddress
          ? `We Received Your Inquiry About ${listingAddress}`
          : 'Thank You for Your Inquiry — Mallan Real Estate',
        autoResponseHtml
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
