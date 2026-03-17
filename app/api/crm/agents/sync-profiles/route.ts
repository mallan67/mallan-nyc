// POST /api/crm/agents/sync-profiles
// One-time sync: imports agent profile data from data/agents.json into the DB.
// Broker-only. Safe to run multiple times.
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
    if (a.title && !existing.title) {
      update.title = a.title;
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
