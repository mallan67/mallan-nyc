// /api/featured-config — Homepage featured listings config
// GET: Public (cached 5min). PATCH: Broker only (saves to DB).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";

export const revalidate = 300; // 5 minutes

const DEFAULT_CONFIG = {
  pinnedListingIds: [],
  filters: {
    type: "sale",
    boroughs: ["Manhattan"],
    neighborhoods: [],
    minPrice: 500000,
    maxPrice: 0,
    minBeds: 1,
  },
  sort: "newest",
  limit: 6,
};

export async function GET() {
  try {
    const config = await prisma.featuredConfig.findFirst({
      where: { is_active: true },
      orderBy: { updated_at: "desc" },
    });

    if (!config) {
      return NextResponse.json(DEFAULT_CONFIG, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    const filters = (config.filters as Record<string, unknown>) || {};

    return NextResponse.json(
      {
        pinnedListingIds: config.pinned_ids || [],
        filters: {
          type: (filters.type as string) || "sale",
          boroughs: (filters.boroughs as string[]) || [],
          neighborhoods: (filters.neighborhoods as string[]) || [],
          minPrice: (filters.minPrice as number) || 0,
          maxPrice: (filters.maxPrice as number) || 0,
          minBeds: (filters.minBeds as number) || 0,
        },
        sort: config.sort || "price-desc",
        limit: config.display_limit || 6,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      }
    );
  } catch (err) {
    console.error("[featured-config] DB error, using defaults:", err);
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  if (auth.role !== "BROKER") {
    return NextResponse.json({ error: "Broker only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Featured/Public Tier A P0 — server-side caps on PATCH inputs.
  // Without these, a broker (or compromised broker session) could send
  // limit=999 or pinnedListingIds.length=500 and the homepage would
  // attempt to render every entry, causing performance degradation
  // and unbounded DB lookups against the listing table.
  const PINNED_IDS_CAP = 12;
  const DISPLAY_LIMIT_MAX = 24;
  const DISPLAY_LIMIT_MIN = 1;

  const rawPinnedIds = Array.isArray(body.pinnedListingIds)
    ? body.pinnedListingIds.map(String)
    : undefined;
  const pinned_ids = rawPinnedIds !== undefined
    ? rawPinnedIds.slice(0, PINNED_IDS_CAP)
    : undefined;
  const filters = body.filters as Record<string, unknown> | undefined;
  const sort = body.sort as string | undefined;
  const rawDisplayLimit = body.limit != null ? Number(body.limit) : undefined;
  const display_limit = rawDisplayLimit !== undefined && Number.isFinite(rawDisplayLimit)
    ? Math.min(Math.max(Math.floor(rawDisplayLimit), DISPLAY_LIMIT_MIN), DISPLAY_LIMIT_MAX)
    : undefined;

  // Upsert: update active config or create new one
  const existing = await prisma.featuredConfig.findFirst({
    where: { is_active: true },
    orderBy: { updated_at: "desc" },
  });

  const data: Record<string, unknown> = {
    is_active: true,
    updated_by: auth.userId,
  };
  if (pinned_ids !== undefined) data.pinned_ids = pinned_ids;
  if (filters !== undefined) data.filters = filters;
  if (sort !== undefined) data.sort = sort;
  if (display_limit !== undefined) data.display_limit = display_limit;

  let configId: bigint;
  if (existing) {
    const updated = await prisma.featuredConfig.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
    configId = updated.id;
  } else {
    const created = await prisma.featuredConfig.create({
      data: {
        pinned_ids: pinned_ids || [],
        filters: (filters || DEFAULT_CONFIG.filters) as Record<string, string | number | string[]>,
        sort: sort || "newest",
        display_limit: display_limit ?? 6,
        is_active: true,
        updated_by: auth.userId,
      },
      select: { id: true },
    });
    configId = created.id;
  }

  // Featured/Public Tier A P0 — AuditEvent on every config change.
  // Featured Properties controls what the public homepage displays;
  // NY SHIELD Act + REBNY operational standards require retention of
  // public-display configuration changes for compliance review.
  await prisma.auditEvent.create({
    data: {
      action: "featured_config_update",
      entity_type: "featured_config",
      entity_id: configId.toString(),
      user_type: "agent",
      user_id: auth.userId,
      actor_user_id: auth.actorUserId ?? null,  // broker actor when delegated; null otherwise
      changes: {
        pinned_ids: pinned_ids ?? null,
        pinned_ids_capped: rawPinnedIds !== undefined && rawPinnedIds.length > PINNED_IDS_CAP,
        filters: (filters as object | null) ?? null,
        sort: sort ?? null,
        display_limit: display_limit ?? null,
        display_limit_capped:
          rawDisplayLimit !== undefined &&
          Number.isFinite(rawDisplayLimit) &&
          (rawDisplayLimit > DISPLAY_LIMIT_MAX || rawDisplayLimit < DISPLAY_LIMIT_MIN),
      },
    },
  }).catch(() => { /* audit failure must not block the save */ });

  return NextResponse.json({ saved: true });
}
