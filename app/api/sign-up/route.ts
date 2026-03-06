import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import dns from 'dns/promises';
import { isDisposableDomain } from '@/lib/disposable-domains';
import { hashPassword } from '@/lib/auth';

const VALID_ROLES = ['buyer', 'renter', 'seller', 'landlord'];

// --- Rate limiter: 3 sign-ups per IP per hour (in-memory) ---
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Clean up stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 10 * 60 * 1000);

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
    const { firstName, lastName, email, phone, password, roles, website } = body;

    // --- Honeypot: bots fill the hidden "website" field, humans don't ---
    if (website) {
      // Silently accept but don't save — bot thinks it succeeded
      return NextResponse.json(
        { success: true, message: 'Account created successfully', id: '0' },
        { status: 201 }
      );
    }

    // --- Rate limit by IP ---
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    if (!checkRateLimit(ip)) {
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

    // Create lead
    const lead = await prisma.lead.create({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password_hash: passwordHash,
        roles: validRoles,
        portal_role: portalRole,
        status: 'new',
        source: 'website',
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        id: lead.id.toString(),
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
