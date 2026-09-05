// /api/crm/agents/me
// GET: Fetch own profile — the profile is returned at the TOP LEVEL of the
//      body, NOT wrapped in an `agent` key. The CRM My Profile panel read
//      `res.agent` for months, got undefined, and silently fell back to the
//      /api/auth/me session cache; see js/dashboard/panels.js.
// PATCH: Update own profile fields.
// Agent can edit: bio, photo, specialties, languages, phone
// Agent CANNOT edit: title, name, email, license, splits, role, status,
//                    featured, slug
// `specialties` and `languages` are text[] columns and are accepted ONLY as
// arrays — a non-array is a 400, never a silent [].
//
// ── license_type IS NOT A SELF-SERVICE FIELD ──────────────────────────────
// `Agent.license_type` is the NY LICENCE CLASS: a governed regulated identity
// fact and the sole input to the advertised 19 NYCRR §175.25 designation. It
// has exactly ONE canonical writer —
//
//   Broker Agent Management -> PATCH /api/crm/agents/[id] (requireBroker)
//                           -> Agent.license_type -> canonicalTitleFor()
//
// This route used to accept it from a BROKER and re-derive `title` from it,
// which made My Profile a SECOND writer of that fact, outside the governed
// path. A supplied `license_type` is now REFUSED with 403.
//
// REFUSED, not ignored. Dropping the value and answering 200 would be a false
// success — the same defect class this branch exists to remove, where the form
// offered an editable `title` the route silently discarded.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAgentOrBroker,
  isAuthError,
  logAuditEvent,
} from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { rejectIncoherentLicenceRole } from "@/lib/agents/license-designation";
import { applyAgentStatusTransition, isAgentStatus, type AgentStatus } from "@/lib/agents/agent-lifecycle";

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
 * Update own profile. Agent can only edit public profile fields + phone.
 * Broker can edit everything (delegates to /api/crm/agents/[id]).
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // THE ONE-WRITER BOUNDARY, checked before anything else is considered.
  //
  // Refusing the WHOLE request — rather than stripping the key and saving the
  // rest — is deliberate. A caller that believed it was setting a licence class
  // must not be told the save succeeded, and a partial apply is indistinguishable
  // from a full one at the call site.
  //
  // The presence of the key is what is refused, not its value: an explicit
  // `null` is a write attempt too (it would have cleared the column), and a
  // designation display string must be refused as NOT SELF-EDITABLE rather than
  // as bad vocabulary — a 400 would invite a retry with the canonical spelling
  // on a route that may never accept it at all.
  if (Object.prototype.hasOwnProperty.call(body, "license_type")) {
    return NextResponse.json(
      { error: "license_type is not self-editable; use Agent Management" },
      { status: 403 }
    );
  }

  // STORED licence class against STORED role. Nothing on this route can change
  // either one, so this is a coherence check on the existing record, unchanged
  // from before: it never derives one axis from the other.
  const coherence = rejectIncoherentLicenceRole(agent.license_type, agent.role);
  if (coherence) {
    return NextResponse.json({ error: coherence }, { status: 400 });
  }

  let statusTransition: AgentStatus | null = null;
  const update: Record<string, unknown> = {};

  // Fields agents CAN self-edit (public profile + phone)
  // NOT self-editable. `title` is the regulated professional designation,
  // derived from licence class + authorisation role - not a personal tagline.
  // An agent could otherwise style themselves "Licensed Real Estate Broker".
  if (body.bio !== undefined) update.bio = body.bio as string | null;
  if (body.photo !== undefined) update.photo = body.photo as string | null;
  if (body.phone !== undefined) update.phone = body.phone as string | null;

  // `specialties` and `languages` are Postgres text[] columns. Anything that
  // was not an array used to be COERCED to [], so the CRM — which serialised
  // both as comma-separated STRINGS — silently emptied the two columns on
  // every save, whether or not the agent had typed anything. A malformed
  // value is now a 400 instead of a silent wipe. Sending [] still clears them
  // deliberately, because [] is an array.
  for (const key of ["specialties", "languages"] as const) {
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

  // Broker-only fields — silently ignore if agent tries to set them
  if (auth.role === "BROKER") {
    if (body.first_name !== undefined) update.first_name = String(body.first_name);
    if (body.last_name !== undefined) update.last_name = String(body.last_name);
    if (body.first_name !== undefined || body.last_name !== undefined) {
      update.full_name = `${body.first_name ?? agent.first_name} ${body.last_name ?? agent.last_name}`;
    }
    if (body.license_no !== undefined) update.license_no = body.license_no as string | null;
    // `license_type` is deliberately ABSENT, and so is the title derivation
    // that hung off it. Both belong to Broker Agent Management alone; a
    // supplied value never reaches here, it is refused 403 above.
    if (body.sale_split !== undefined) update.sale_split = body.sale_split != null ? Number(body.sale_split) : null;
    if (body.rental_split !== undefined) update.rental_split = body.rental_split != null ? Number(body.rental_split) : null;
    if (body.featured !== undefined) update.featured = Boolean(body.featured);
    if (body.public_slug !== undefined) update.public_slug = body.public_slug as string | null;
    // Account state is NOT a generic field here either. Writing it directly
    // bypassed session revocation, exactly as the Edit Agent path did.
    if (body.status !== undefined) {
      if (!isAgentStatus(body.status)) {
        return NextResponse.json(
          { error: "status must be: active, inactive, or suspended" },
          { status: 400 }
        );
      }
      statusTransition = body.status;
    }
  }

  if (Object.keys(update).length === 0 && !statusTransition) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  // ONE OUTER TRANSACTION, same as the broker Edit path. This route had the
  // opposite split: the status transition committed FIRST, so a failing profile
  // update left the sessions already revoked.
  const { updated, lifecycle } = await prisma.$transaction(async (tx) => {
    let life = null;
    if (statusTransition && statusTransition !== agent.status) {
      life = await applyAgentStatusTransition(tx, agent.id, statusTransition, auth, {
        previous: agent.status,
        ip: req.headers.get("x-forwarded-for"),
        reason: "self_profile_status_change",
      });
    }
    const row = Object.keys(update).length === 0 ? agent : await tx.agent.update({
      where: { id: agent.id },
      data: update,
    });
    return { updated: row, lifecycle: life };
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
