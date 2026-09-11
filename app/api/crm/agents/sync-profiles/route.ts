// POST /api/crm/agents/sync-profiles
// Broker-only admin import of NON-REGULATED public profile fields from
// data/agents.json into the DB. Safe to run multiple times.
//
// Fields it may write: bio, photo, specialties, languages, phone, public_slug,
// featured. Nothing else.
//
// -- WHAT THIS ROUTE MAY NOT WRITE ----------------------------------------
// `Agent.title` is the REGULATED professional designation (NY DOS 19 NYCRR
// 175.25). It is DERIVED from the verified `Agent.license_type` by
// lib/agents/professional-title.ts, and static profile data may not
// independently manufacture it.
//
// This route used to set it whenever the stored title was empty, which made a
// tracked JSON file a SECOND professional-identity writer: a row with
// `license_type = null`, or a legacy ambiguous row, could be handed
// "Licensed Associate Real Estate Broker" purely because the static file said
// so - with no licence class anywhere in the write set.
//
// The SEED path is not the same thing and is unaffected: it normalises the
// designation into a canonical licence class, validates the independently
// recorded brokerage role, and writes license_type + role + the canonical
// title TOGETHER.
//
// `license_type` and `role` are deliberately NOT synced here either. Adding
// them would create a THIRD identity writer rather than closing the second.
// The licence class and the brokerage role are set through the governed Agent
// create/edit path, and the title follows the licence class from there.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import agentsJson from "@/data/agents.json";

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const results: { name: string; status: string; fields?: string[] }[] = [];

  for (const a of agentsJson.agents) {
    const slug = a.id || a.name.toLowerCase().replace(/\s+/g, "-");

    const existing = await prisma.agent.findUnique({
      where: { email: a.email },
    });

    if (!existing) {
      results.push({ name: a.name, status: "skipped — email not found in DB" });
      continue;
    }

    const update: Record<string, unknown> = {};

    if (a.bio && (!existing.bio || existing.bio.length < a.bio.length)) {
      update.bio = a.bio;
    }
    if (a.photo && !existing.photo) {
      update.photo = a.photo;
    }
    if (
      a.specialties &&
      a.specialties.length > 0 &&
      (!existing.specialties || existing.specialties.length === 0)
    ) {
      update.specialties = a.specialties;
    }
    if (
      a.languages &&
      a.languages.length > 0 &&
      (!existing.languages || existing.languages.length === 0)
    ) {
      update.languages = a.languages;
    }
    if (!existing.public_slug) {
      update.public_slug = slug;
    }
    if (a.featured !== undefined && !existing.featured) {
      update.featured = a.featured;
    }
    if (a.phone && !existing.phone) {
      update.phone = a.phone;
    }

    if (Object.keys(update).length === 0) {
      results.push({ name: a.name, status: "already up to date" });
      continue;
    }

    await prisma.agent.update({
      where: { id: existing.id },
      data: update,
    });

    results.push({
      name: a.name,
      status: "updated",
      fields: Object.keys(update),
    });
  }

  await logAuditEvent(
    "sync_agent_profiles",
    "system",
    "bulk",
    auth,
    { results },
    req.headers.get("x-forwarded-for") ?? undefined
  );

  return NextResponse.json({
    synced: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status !== "updated").length,
    results,
  });
}
