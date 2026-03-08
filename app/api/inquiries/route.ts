import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

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

    const { name, email, phone, message, preferredDate, listingId, listingAddress, agreeToTerms, optInUpdates } = body;

    // Validate required fields
    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required' },
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
    const sanitizedPhone = phone.replace(/[^\d+\-() ]/g, '').slice(0, 20);

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
        roles: ['buyer'],
        status: 'new',
        source: 'website',
      },
      update: {
        // Update phone if provided (lead may have changed number)
        phone: sanitizedPhone,
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
