// /api/crm/agents/me
// GET: Fetch own profile — the profile is returned at the TOP LEVEL of the
//      body, NOT wrapped in an `agent` key. The CRM My Profile panel read
//      `res.agent` for months, got undefined, and silently fell back to the
//      /api/auth/me session cache; see js/dashboard/panels.js.
// PATCH: Update own profile fields.
//
// ── THE SELF-SERVICE BOUNDARY IS AN ALLOWLIST, AND IT IS THE ONLY ONE ─────
//
// This is the SELF-SERVICE PROFILE WRITER for EVERY professional role,
// BROKER included. Exactly five facts are self-editable:
//
//     SELF_EDITABLE_FIELDS = bio | photo | phone | specialties | languages
//
// A body carrying ANY other key — governed today or invented tomorrow — is
// refused WHOLE, with 403. Nothing is applied, nothing is silently dropped,
// and Prisma is never reached.
//
// This file used to say exactly that in this header and then contradict it
// forty lines lower, where an `auth.role === "BROKER"` block self-wrote
// first_name, last_name, license_no, sale_split, rental_split, featured,
// public_slug and status. Only `license_type` was genuinely refused.
//
// The fix is deliberately NOT eight more per-field refusals. A denylist
// closes the eight fields that exist today and leaves the ninth open: the
// next developer to add a self-writable administrative field would trip
// nothing. DENY-BY-DEFAULT is the property being bought here, and it is what
// makes the boundary hold for fields nobody has written yet.
//
// ── WHY EACH FIELD LEFT ───────────────────────────────────────────────────
//
//   license_type / license_no  regulated licence identity
//   first_name / last_name     canonical professional identity
//   sale_split / rental_split  compensation terms
//   status                     account lifecycle and session authority
//   public_slug                public identity and routing
//   featured                   brokerage publication / marketing authority
//   title                      the derived 19 NYCRR §175.25 designation
//   role                       authorisation grant
//
// None of them belongs in a self-service profile writer merely because the
// logged-in person happens to be the principal broker.
//
// ── THE CANONICAL WRITER, UNCHANGED ───────────────────────────────────────
//
//   Broker Agent Management -> PATCH /api/crm/agents/[id] (requireBroker)
//                           -> the governed Agent fields
//                           -> canonicalTitleFor() for the §175.25 title
//
// Every one of the facts above is still changeable there, where the action is
// explicitly a broker ADMINISTRATIVE action rather than a self-profile edit.
//
// ── REFUSED, NOT IGNORED ──────────────────────────────────────────────────
//
// Dropping a key and answering 200 would be a false success — the same defect
// class this branch exists to remove, where My Profile offered an editable
// `title` the route silently discarded. The refusal names the offending keys
// so it is diagnosable rather than a mystery, and the presence of the key is
// what is refused, not its value: an explicit `null` is a write attempt too,
// and an invalid value must be refused as NOT SELF-EDITABLE (403) rather than
// as bad vocabulary (400) — a 400 invites a retry with the canonical spelling
// on a route that may never accept the field at all.
//
// `photo` is in the writable set because this route writes the column, but the
// CRM uploads a headshot through POST /api/crm/agents/me/photo, which stores
// the file and writes `agent.photo` itself. That route is untouched by this
// allowlist: it reads multipart form data, not a JSON body. (`photo_url` was
// once posted here and read by nothing; it is now refused rather than ignored.)
//
// `specialties` and `languages` are text[] columns and are accepted ONLY as
// arrays — a non-array is a 400, never a silent [].
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { rejectIncoherentLicenceRole } from "@/lib/agents/license-designation";

/**
 * THE SELF-SERVICE WRITABLE SET — stated ONCE, for every role.
 *
 * Adding a key here grants self-service write authority over that column to
 * every licensee in the brokerage. Nothing else on this route may write.
 */
const SELF_EDITABLE_FIELDS = [
  "bio",
  "photo",
  "phone",
  "specialties",
  "languages",
] as const;

/** The array-valued members, which own Postgres text[] columns. */
const SELF_EDITABLE_ARRAY_FIELDS = ["specialties", "languages"] as const;

const SELF_EDITABLE = new Set<string>(SELF_EDITABLE_FIELDS);

/**
 * GET /api/crm/agents/me
 * Fetch own agent profile. Agent or broker.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
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
      role: true,
      status: true,
      sale_split: true,
      rental_split: true,
      public_slug: true,
      title: true,
      bio: true,
      photo: true,
      specialties: true,
      languages: true,
      featured: true,
      created_at: true,
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: agent.id.toString(),
    first_name: agent.first_name,
    last_name: agent.last_name,
    full_name: agent.full_name,
    email: agent.email,
    phone: agent.phone,
    license_no: agent.license_no,
    license_type: agent.license_type,
    license_expiry: agent.license_expiry?.toISOString().split("T")[0] ?? null,
    role: agent.role,
    status: agent.status,
    sale_split: agent.sale_split?.toString() ?? null,
    rental_split: agent.rental_split?.toString() ?? null,
    public_slug: agent.public_slug,
    title: agent.title,
    bio: agent.bio,
    photo: agent.photo,
    specialties: agent.specialties,
    languages: agent.languages,
    featured: agent.featured,
    created_at: agent.created_at.toISOString(),
  });
}

/**
 * PATCH /api/crm/agents/me
 * Update own profile. The writable set is SELF_EDITABLE_FIELDS and nothing
 * else, for every role including BROKER. Any other key refuses the whole
 * request with 403.
 */
export async function PATCH(req: NextRequest) {
  const blocked = assertWriteAllowed();
  if (blocked) return blocked;
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const agent = await prisma.agent.findUnique({
    where: { id: auth.userId },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  // ══ THE ONE-WRITER BOUNDARY — DENY BY DEFAULT ═══════════════════════════
  //
  // Checked before anything else is considered, and before any Prisma
  // mutation can occur. A key absent from SELF_EDITABLE_FIELDS refuses the
  // WHOLE request:
  //
  //   * Refusing the whole body rather than stripping the key is deliberate.
  //     A caller that believed it was setting an account status must not be
  //     told "saved" because a bio in the same body happened to be legal, and
  //     a partial apply is indistinguishable from a full one at the call site.
  //
  //   * `Object.keys` sees exactly the caller's OWN enumerable keys, so an
  //     inherited or prototype-borrowed name is never mistaken for a member,
  //     and membership is tested against a Set rather than an object so no
  //     key can be satisfied by Object.prototype.
  //
  //   * The offending keys are NAMED. A refusal nobody can diagnose gets
  //     worked around rather than fixed.
  const rejected = Object.keys(body)
    .filter((key) => !SELF_EDITABLE.has(key))
    .sort();
  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error:
          rejected.length === 1
            ? `${rejected[0]} is not self-editable; use Agent Management`
            : `These fields are not self-editable; use Agent Management: ${rejected.join(", ")}`,
        rejected_fields: rejected,
        self_editable_fields: [...SELF_EDITABLE_FIELDS],
      },
      { status: 403 }
    );
  }

  // STORED licence class against STORED role. Nothing on this route can change
  // either one, so this is a coherence check on the existing record: it never
  // derives one axis from the other.
  const coherence = rejectIncoherentLicenceRole(agent.license_type, agent.role);
  if (coherence) {
    return NextResponse.json({ error: coherence }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.bio !== undefined) update.bio = body.bio as string | null;
  if (body.photo !== undefined) update.photo = body.photo as string | null;
  if (body.phone !== undefined) update.phone = body.phone as string | null;

  // `specialties` and `languages` are Postgres text[] columns. Anything that
  // was not an array used to be COERCED to [], so the CRM — which serialised
  // both as comma-separated STRINGS — silently emptied the two columns on
  // every save, whether or not the agent had typed anything. A malformed
  // value is now a 400 instead of a silent wipe. Sending [] still clears them
  // deliberately, because [] is an array.
  for (const key of SELF_EDITABLE_ARRAY_FIELDS) {
    const value = body[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      return NextResponse.json(
        { error: `${key} must be an array of strings (send [] to clear it)` },
        { status: 400 }
      );
    }
    update[key] = value.map(String);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  // A single write. The outer transaction this replaced existed only to keep a
  // generic field update atomic with an account-status transition, and status
  // is no longer writable from a self-service route at all — its one authority
  // is applyAgentStatusTransition, reached through Agent Management.
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: update,
  });

  await logAuditEvent(
    "update",
    "agent",
    agent.id.toString(),
    auth,
    { fields: Object.keys(update), self_edit: true },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    id: updated.id.toString(),
    status: updated.status,
    updated_fields: Object.keys(update),
  });
}
