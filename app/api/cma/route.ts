import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { cmaAutoResponseEmail } from '@/lib/email/templates';

/**
 * POST /api/cma
 *
 * Handles Comparative Market Analysis (CMA) requests from the public /sell page.
 * Creates/updates a Lead record and logs an audit event.
 * TCPA/CTIA: form includes explicit consent checkbox (required affirmative action).
 */

/** Escape HTML entities to prevent injection in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
      },
      update: {
        // Update phone if provided (lead may have changed number)
        ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
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

      await sendEmail('info@mallan.nyc', subjectLine, emailBody);
    } catch (emailErr) {
      console.error('[/api/cma] Email notification error (non-fatal):', emailErr);
    }

    // Send auto-response to the requester (non-fatal)
    try {
      const autoResponseHtml = cmaAutoResponseEmail(firstName, address);
      await sendEmail(
        email.toLowerCase().trim(),
        `Your Property Valuation Request — ${address}`,
        autoResponseHtml
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
