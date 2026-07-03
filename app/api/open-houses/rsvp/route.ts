import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendEmail } from '@/lib/email/sendgrid';
import { openHouseRsvpEmail } from '@/lib/email/templates';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';
import { createInquiry } from '@/lib/inquiries/create';
import { parseOpenHouseId } from '@/lib/open-houses/parse-open-house-id';
import { rsvpAddressMatches } from '@/lib/open-houses/rsvp-address-match';

/**
 * POST /api/open-houses/rsvp
 *
 * Handles open house RSVP/registration submissions.
 * Creates/updates a Lead record with source 'open_house_rsvp' and logs an audit event.
 * TCPA/CTIA: requires explicit consent (agreeToTerms).
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20/hr/IP. Open-house RSVPs are rare per-user but a bot
    // could flood this to manipulate attendance counts.
    const ip = extractClientIp(request.headers);
    if (!(await checkRouteRateLimit(ip, 'rsvp', 20, 3600))) {
      return NextResponse.json(
        { error: 'Too many RSVPs. Please try again in an hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    const body = await request.json();

    const { name, email, phone, openHouseId, listingAddress, openHouseDate, openHouseTime, partySize, message, agreeToTerms } = body;

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

    if (!listingAddress || !openHouseDate || !openHouseTime) {
      return NextResponse.json(
        { error: 'Open house details (address, date, time) are required' },
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

    // Validate party size
    const validPartySize = Math.max(1, Math.min(4, parseInt(partySize) || 1));

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
        source: 'open_house_rsvp',
        consent_captured_at: new Date(),
      },
      update: {
        phone: sanitizedPhone,
        consent_captured_at: new Date(),
        updated_at: new Date(),
      },
    });

    // Log the RSVP as an audit event
    await prisma.auditEvent.create({
      data: {
        action: 'open_house_rsvp',
        entity_type: 'lead',
        entity_id: lead.id.toString(),
        user_type: 'public',
        user_id: null,
        changes: {
          open_house_id: openHouseId || null,
          listing_address: listingAddress,
          open_house_date: openHouseDate,
          open_house_time: openHouseTime,
          party_size: validPartySize,
          message: message || null,
          source: 'open_house_rsvp',
          submitted_at: new Date().toISOString(),
        },
      },
    });

    // Codex #472 r3: link the inquiry to its listing so seller reports can
    // count RSVPs. `local-{showingId}` resolves exactly (Mallan CRM open
    // houses); `trestle-` ids stay unlinked by design (documented). Best
    // effort — never blocks the RSVP.
    let rsvpListingId: string | null = null;
    try {
      const parsed = parseOpenHouseId(openHouseId);
      if (parsed?.kind === 'local') {
        // Codex #472 r5: openHouseId is attacker-suppliable. Link ONLY when
        // the Showing is a real ELIGIBLE public open house (same criteria as
        // /api/open-houses: type openhouse, upcoming, not cancelled) AND the
        // submitted address plausibly matches the listing (fail-closed).
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const showing = await prisma.showing.findFirst({
          where: {
            id: parsed.showingId,
            type: 'openhouse',
            date: { gte: today },
            status: { not: 'cancelled' },
          },
          select: { listing: { select: { listing_id: true, address: true } } },
        });
        if (showing?.listing && rsvpAddressMatches(showing.listing.address, listingAddress)) {
          rsvpListingId = showing.listing.listing_id;
        }
      }
    } catch {
      rsvpListingId = null; // best-effort only
    }

    // Real Inquiry row (Workstream C1 of master refactor). Never throws.
    await createInquiry({
      source: 'open_house_rsvp',
      listingId: rsvpListingId,
      leadId: lead.id,
      message: message ?? null,
      email: lead.email,
      phone: lead.phone,
      firstName,
      lastName,
      userAgent: request.headers.get('user-agent'),
      rawClientIp: ip,
      metadata: {
        open_house_id: openHouseId ?? undefined,
        listing_address: listingAddress,
        open_house_date: openHouseDate,
        open_house_time: openHouseTime,
        party_size: validPartySize,
      },
    });

    // Format date for display
    const dateObj = new Date(openHouseDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    // Send email notification to agent (non-fatal)
    try {
      const td = 'padding:4px 12px 4px 0;font-weight:bold;';
      const emailBody = `
        <h2>New Open House RSVP</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="${td}">Name:</td><td>${escapeHtml(name)}</td></tr>
          <tr><td style="${td}">Email:</td><td>${escapeHtml(email)}</td></tr>
          <tr><td style="${td}">Phone:</td><td>${escapeHtml(sanitizedPhone)}</td></tr>
          <tr><td style="${td}">Property:</td><td>${escapeHtml(String(listingAddress))}</td></tr>
          <tr><td style="${td}">Date:</td><td>${escapeHtml(formattedDate)}</td></tr>
          <tr><td style="${td}">Time:</td><td>${escapeHtml(String(openHouseTime))}</td></tr>
          <tr><td style="${td}">Party Size:</td><td>${validPartySize}</td></tr>
          ${message ? `<tr><td style="${td}">Notes:</td><td>${escapeHtml(String(message))}</td></tr>` : ''}
        </table>
      `.trim();

      await sendEmail('info@mallan.nyc', `Open House RSVP: ${listingAddress} — ${formattedDate}`, emailBody);
    } catch (emailErr) {
      console.error('[/api/open-houses/rsvp] [email redacted] notification error (non-fatal):', emailErr);
    }

    // Send auto-response to attendee (non-fatal)
    try {
      const autoResponseHtml = openHouseRsvpEmail(
        firstName,
        listingAddress,
        formattedDate,
        openHouseTime,
        validPartySize
      );
      // Transactional: direct RSVP confirmation to a user who just registered
      await sendEmail(
        email.toLowerCase().trim(),
        `You're Registered: Open House at ${listingAddress}`,
        autoResponseHtml,
        undefined,
        { transactional: true }
      );
    } catch (autoErr) {
      console.error('[/api/open-houses/rsvp] Auto-response error (non-fatal):', autoErr);
    }

    return NextResponse.json({
      success: true,
      message: 'RSVP submitted successfully',
    });
  } catch (err) {
    console.error('[/api/open-houses/rsvp] Error:', err);
    return NextResponse.json(
      { error: 'Failed to submit RSVP. Please try again.' },
      { status: 500 }
    );
  }
}
