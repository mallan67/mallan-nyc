import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import dns from 'dns/promises';
import { isDisposableDomain } from '@/lib/disposable-domains';
import { hashPassword } from '@/lib/auth';
import { randomInt } from 'crypto';
import { sendEmail } from '@/lib/email/sendgrid';
import { escapeHtml } from '@/lib/sanitize';
import { checkRouteRateLimit } from '@/lib/middleware/rate-limiter';
import { createInquiry } from '@/lib/inquiries/create';
import {
  extractBehavioralSessionId,
  linkBehavioralSessionToLead,
} from '@/lib/behavioral/session-link';

const VALID_ROLES = ['buyer', 'renter', 'seller', 'landlord'];

// Rate limit: 10 sign-ups per IP per hour.
// Upstash-backed via `checkRouteRateLimit('signup', ...)` — survives cold starts
// and is shared across Vercel serverless instances. The previous in-module Map
// was per-instance only and trivially bypassable by hammering until a fresh
// instance was spawned.
const SIGNUP_LIMIT = 10;
const SIGNUP_WINDOW_S = 60 * 60; // 1 hour

/** Check that the email domain has valid MX records */
async function verifyEmailDomain(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;
  try {
    const mx = await dns.resolveMx(domain);
    return mx && mx.length > 0;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, password, roles, website, tcpaConsent, tcpaConsentTimestamp } = body;
    const behavioralSessionId = extractBehavioralSessionId(body);

    // TCPA prior express written consent is a server-side gate, not just UI.
    // A bot or modified client that skips the checkbox must still be rejected here.
    // 47 CFR 64.1200(f)(8): required for auto-dialed/prerecorded calls & SMS.
    if (tcpaConsent !== true) {
      return NextResponse.json(
        { error: 'Phone consent is required to create an account.' },
        { status: 400 }
      );
    }

    // --- Honeypot: bots fill the hidden "website" field, humans don't ---
    if (website) {
      // Silently accept but don't save — bot thinks it succeeded
      return NextResponse.json(
        { success: true, message: 'Account created successfully', id: '0' },
        { status: 201 }
      );
    }

    // --- Rate limit by IP (Upstash-backed, shared across instances) ---
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const allowed = await checkRouteRateLimit(ip, 'signup', SIGNUP_LIMIT, SIGNUP_WINDOW_S);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again in an hour.' },
        { status: 429 }
      );
    }

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !password || !roles?.length) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate email syntax
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // --- Block disposable/temporary email domains ---
    if (isDisposableDomain(email)) {
      return NextResponse.json(
        { error: 'Disposable email addresses are not allowed. Please use your real email.' },
        { status: 400 }
      );
    }

    // --- Validate email domain has MX records (real mail server) ---
    const hasMx = await verifyEmailDomain(email);
    if (!hasMx) {
      return NextResponse.json(
        { error: 'This email domain does not appear to accept mail. Please use a valid email address.' },
        { status: 400 }
      );
    }

    // Validate roles
    const validRoles = roles.filter((r: string) => VALID_ROLES.includes(r));
    if (validRoles.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid role is required' },
        { status: 400 }
      );
    }

    // Check for existing lead with same email
    const existing = await prisma.lead.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 }
      );
    }

    // Validate password
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Determine portal role from first selected role
    const portalRole = validRoles.includes('buyer') ? 'buyer'
      : validRoles.includes('renter') ? 'tenant'
      : validRoles.includes('seller') ? 'seller'
      : validRoles.includes('landlord') ? 'landlord'
      : 'buyer';

    // Capture optional intake fields from sign-up form
    const { budget, neighborhood, borough, moveInDate, message } = body;

    // Create lead — unassigned (agent_id = null), broker distributes
    const lead = await prisma.lead.create({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password_hash: passwordHash,
        roles: validRoles,
        portal_role: portalRole,
        primary_portal_role: portalRole,
        enabled_workspaces: [portalRole],
        status: 'new',
        source: 'website',
        // TCPA: record the client's own consent timestamp when available (proves the
        // checkbox was ticked at that moment) and fall back to server clock.
        consent_captured_at: tcpaConsentTimestamp ? new Date(tcpaConsentTimestamp) : new Date(),
        // Optional intake fields captured at sign-up
        notes: message ? `[Sign-up message]: ${message}` : null,
      } as any,
    });

    await linkBehavioralSessionToLead(behavioralSessionId, lead.id);

    // Real Inquiry row (Workstream C1 of master refactor). Never throws —
    // a missing table or other failure does not break sign-up.
    await createInquiry({
      source: 'sign_up',
      leadId: lead.id,
      message: message ?? null,
      email: lead.email,
      phone: lead.phone,
      firstName: lead.first_name,
      lastName: lead.last_name,
      consentCapturedAt: tcpaConsentTimestamp ? new Date(tcpaConsentTimestamp) : new Date(),
      userAgent: req.headers.get('user-agent'),
      rawClientIp: ip,
      metadata: {
        portal_role: portalRole,
        roles: validRoles,
        budget: budget ?? undefined,
        neighborhood: neighborhood ?? undefined,
        borough: borough ?? undefined,
        move_in_date: moveInDate ?? undefined,
      },
    });

    // ── Send email verification code (self-signup only) ──
    const verifyCode = randomInt(100000, 999999).toString();
    const verifyExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await prisma.lead.update({
      where: { id: lead.id },
      data: { email_verify_token: verifyCode, email_verify_expires: verifyExpires },
    });
    // Fire-and-forget — don't block signup response on email delivery
    sendEmail(
      email.trim().toLowerCase(),
      'Verify Your Email — Mallan Real Estate',
      `<div style="font-family:'Inter',system-ui,sans-serif;max-width:460px;margin:0 auto;padding:32px;">
        <h2 style="font-size:18px;font-weight:700;color:#111;margin-bottom:8px;">Verify Your Email</h2>
        <p style="font-size:14px;color:#6b7280;margin-bottom:24px;">Hi ${escapeHtml(firstName.trim())}, enter this code to verify your email:</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#111;">${verifyCode}</span>
        </div>
        <p style="font-size:12px;color:#9ca3af;">This code expires in 15 minutes.</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:11px;color:#9ca3af;">Mallan Real Estate Inc. | 400 East 90th Street, Suite 17C, New York, NY 10128</p>
      </div>`,
      undefined,
      { channel: 'company', transactional: true }
    ).catch(() => { /* non-fatal */ });

    // Notify ALL brokers of the new unassigned lead
    const brokers = await prisma.agent.findMany({
      where: { role: 'BROKER' },
      select: { id: true },
    });

    const roleLabel = portalRole === 'tenant' ? 'Renter'
      : portalRole.charAt(0).toUpperCase() + portalRole.slice(1);

    const notificationBody: Record<string, unknown> = {
      name: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      role: roleLabel,
      source: 'Website self-registration',
      lead_id: lead.id.toString(),
    };
    if (budget) notificationBody.budget = budget;
    if (neighborhood) notificationBody.neighborhood = neighborhood;
    if (borough) notificationBody.borough = borough;
    if (moveInDate) notificationBody.move_in_date = moveInDate;
    if (message) notificationBody.message = message;

    await Promise.allSettled(
      brokers.map(broker =>
        prisma.notification.create({
          data: {
            recipient_type: 'agent',
            recipient_id: broker.id,
            channel: 'in_app',
            type: 'new_self_signup_lead',
            title: `New ${roleLabel} Lead — ${firstName.trim()} ${lastName.trim()}`,
            body: `${roleLabel} signed up on mallan.nyc. Unassigned — please distribute.`,
            data: notificationBody as Record<string, string>,
            status: 'pending',
          },
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Account created. Please check your email for a verification code.',
        requiresVerification: true,
        id: lead.id.toString(),
        role: portalRole,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Sign-up error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
