// POST /api/auth/agent/register
// Broker-only: create a new agent with a temporary password.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireBroker,
  isAuthError,
  hashPassword,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import {
  rejectNonCanonicalLicenseType,
  canonicalTitleFor,
} from "@/lib/agents/license-designation";

export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, licenseNo, licenseType, saleSplit, rentalSplit } = body;

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "firstName, lastName, and email are required" },
        { status: 400 }
      );
    }

    // Check for duplicate email
    // Same licence contract as every other writer. This is the SECOND Agent
    // creation path; until it is consolidated it must not be a way around the
    // invariant the primary path enforces.
    const licenseTypeError = rejectNonCanonicalLicenseType(licenseType);
    if (licenseTypeError) {
      return NextResponse.json({ error: licenseTypeError }, { status: 400 });
    }

    const existing = await prisma.agent.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An agent with this email already exists" },
        { status: 409 }
      );
    }

    // Generate temporary password
    const crypto = await import('crypto');
    const tempPassword = `Mallan-${crypto.randomBytes(12).toString('hex')}`;
    const hash = await hashPassword(tempPassword);

    const agent = await prisma.agent.create({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim().toLowerCase(),
        password_hash: hash,
        phone: phone?.trim() || null,
        license_no: licenseNo?.trim() || null,
        license_type: licenseType || null,
        // derived, never client-chosen
        title: canonicalTitleFor(licenseType, "AGENT"),
        sale_split: saleSplit ?? null,
        rental_split: rentalSplit ?? null,
        role: "AGENT",
        status: "active",
      },
    });

    await logAuditEvent("create", "agent", agent.id.toString(), auth, {
      email: agent.email,
      name: agent.full_name,
    }, req.headers.get("x-forwarded-for") || "unknown");

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id.toString(),
        name: agent.full_name,
        email: agent.email,
      },
      tempPassword,
    });
  } catch (err) {
    console.error("Agent register error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
