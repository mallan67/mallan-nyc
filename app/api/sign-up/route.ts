import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import dns from 'dns/promises';

const VALID_ROLES = ['buyer', 'renter', 'seller', 'landlord'];

/** Check that the email domain has valid MX records (real mail server) */
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
    const { firstName, lastName, email, phone, roles } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !roles?.length) {
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

    // Validate email domain has MX records (real mail server)
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

    // Create lead
    const lead = await prisma.lead.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        roles: validRoles,
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
