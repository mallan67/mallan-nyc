// /api/crm/agents
// GET: Returns agent roster. POST: Create agent. Broker-only.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import {
  rejectNonCanonicalLicenseType,
  rejectUnverifiedMemberMlsId,
  canonicalTitleFor,
} from "@/lib/agents/license-designation";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const agents = await prisma.agent.findMany({
    where: { status: "active" },
    orderBy: { last_name: "asc" },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      full_name: true,
      email: true,
      phone: true,
      license_no: true,
      license_type: true,
      license_expiry: true,
      trestle_mls_id: true,
      sale_split: true,
      rental_split: true,
      role: true,
      status: true,
      last_login: true,
      created_at: true,
      // Public profile fields
      title: true,
      bio: true,
      photo: true,
      public_slug: true,
      featured: true,
      specialties: true,
      languages: true,
      // UCBA Art. III §6 ethics-training (Workstream C4 — Broker admin panel
      // reads these to render compliance status. Schema in PR #51, gate in
      // PR #58, broker UI in PR #59 / C4c).
      ethics_training_completed_at: true,
      ethics_training_expires_at: true,
    },
  });

  const serialized = agents.map((a) => ({
    ...a,
    id: a.id.toString(),
    sale_split: a.sale_split?.toString() ?? null,
    rental_split: a.rental_split?.toString() ?? null,
    ethics_training_completed_at:
      a.ethics_training_completed_at?.toISOString() ?? null,
    ethics_training_expires_at:
      a.ethics_training_expires_at?.toISOString() ?? null,
  }));

  return NextResponse.json({ agents: serialized });
}

/**
 * POST /api/crm/agents
 * Create a new agent. Broker-only.
 */
export async function POST(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const firstName = body.first_name as string | undefined;
  const lastName = body.last_name as string | undefined;
  const email = body.email as string | undefined;

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: "first_name, last_name, and email are required" },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }

  // SERVER BOUNDARY INVARIANT. A stale browser, a malformed request or a
  // direct API caller must not be able to put a designation display string -
  // or any other text - into a column whose canonical values are
  // broker | salesperson. Refuse BEFORE any write.
  const licenseTypeError = rejectNonCanonicalLicenseType(body.license_type);
  if (licenseTypeError) {
    return NextResponse.json({ error: licenseTypeError }, { status: 400 });
  }

  // ONBOARDING CONTRACT. The form marks the licence designation, the NY DOS
  // licence number and the expiry as required; the server enforced none of
  // them, so an active brokerage account could be created with no licence
  // facts at all. HTML `required` is not a contract.
  const missingLicence: string[] = [];
  if (!body.license_type) missingLicence.push("license_type");
  if (!body.license_no) missingLicence.push("license_no");
  if (!body.license_expiry) missingLicence.push("license_expiry");
  if (missingLicence.length > 0) {
    return NextResponse.json(
      {
        error: "Missing required licence facts: " + missingLicence.join(", "),
        message: "An active brokerage agent account requires a licence designation, "
          + "NY DOS licence number and expiry.",
      },
      { status: 400 }
    );
  }

  // Provider identity is resolved and verified, never typed. See
  // rejectUnverifiedMemberMlsId.
  const mlsIdError = rejectUnverifiedMemberMlsId(body.trestle_mls_id);
  if (mlsIdError) {
    return NextResponse.json({ error: mlsIdError }, { status: 400 });
  }

  const existing = await prisma.agent.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An agent with this email already exists" },
      { status: 409 }
    );
  }

  // Generate a cryptographically random temporary password for invite-based onboarding
  const crypto = await import("crypto");
  const tempPassword = `Mallan-${crypto.randomBytes(8).toString("hex")}`;
  const passwordHash = await hashPassword(tempPassword);

  const slug =
    (body.public_slug as string) ||
    `${firstName}-${lastName}`.toLowerCase().replace(/\s+/g, "-");

  const agent = await prisma.agent.create({
    data: {
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      email,
      password_hash: passwordHash,
      phone: (body.phone as string) ?? null,
      license_no: (body.license_no as string) ?? null,
      license_type: (body.license_type as string) ?? null,
      // Both columns already exist on Agent and PATCH writes them; create did
      // not, so a licence expiry typed on the Add Agent form was collected and
      // then dropped. GET even selects license_expiry, which made the loss
      // invisible until you reopened the record.
      license_expiry: body.license_expiry ? new Date(body.license_expiry as string) : null,
      // Always NULL at creation - see rejectUnverifiedMemberMlsId.
      trestle_mls_id: null,
      sale_split: body.sale_split != null ? Number(body.sale_split) : null,
      rental_split: body.rental_split != null ? Number(body.rental_split) : null,
      role: "AGENT",
      status: "active",
      // Public profile fields
      // DERIVED from licence class + authorisation role. Never client input:
      // the title is a regulated statement about the licence.
      title: canonicalTitleFor(body.license_type as string, "AGENT"),
      bio: (body.bio as string) ?? null,
      photo: (body.photo as string) ?? null,
      public_slug: slug,
      featured: body.featured === true,
      specialties: Array.isArray(body.specialties) ? body.specialties.map(String) : [],
      languages: Array.isArray(body.languages) ? body.languages.map(String) : [],
    },
  });

  await logAuditEvent(
    "create",
    "agent",
    agent.id.toString(),
    auth,
    { email },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json(
    {
      id: agent.id.toString(),
      email: agent.email,
      status: agent.status,
      tempPassword, // Broker sees this once to share with agent
    },
    { status: 201 }
  );
}
