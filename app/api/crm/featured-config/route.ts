// /api/crm/featured-config — GET: read config, PUT: update config (broker-only)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";

const DEFAULT_FILTERS = {
  type: "sale",
  boroughs: ["Manhattan"],
  neighborhoods: [],
  minPrice: 500000,
  maxPrice: 0,
  minBeds: 1,
};

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const config = await prisma.featuredConfig.findFirst({
    where: { is_active: true },
    orderBy: { updated_at: "desc" },
  });

  if (!config) {
    return NextResponse.json({
      pinned_ids: [],
      filters: DEFAULT_FILTERS,
      sort: "price-desc",
      display_limit: 6,
      is_active: true,
    });
  }

  return NextResponse.json({
    id: config.id.toString(),
    pinned_ids: config.pinned_ids,
    filters: config.filters,
    sort: config.sort,
    display_limit: config.display_limit,
    is_active: config.is_active,
    updated_at: config.updated_at.toISOString(),
  });
}

export async function PUT(req: NextRequest) {
  const writeBlocked = assertWriteAllowed();
  if (writeBlocked) return writeBlocked;

  const auth = await requireBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { pinned_ids, filters, sort, display_limit, is_active } = body;

  // Validate
  if (display_limit !== undefined && (display_limit < 1 || display_limit > 24)) {
    return NextResponse.json({ error: "display_limit must be 1-24" }, { status: 400 });
  }
  if (sort && !["price-desc", "price-asc", "newest", "exclusives", "neighborhood", "new-development"].includes(sort)) {
    return NextResponse.json({ error: "Invalid sort value" }, { status: 400 });
  }

  // Upsert — find existing active config or create new
  const existing = await prisma.featuredConfig.findFirst({
    where: { is_active: true },
    orderBy: { updated_at: "desc" },
  });

  const data = {
    pinned_ids: pinned_ids ?? existing?.pinned_ids ?? [],
    filters: filters ?? existing?.filters ?? DEFAULT_FILTERS,
    sort: sort ?? existing?.sort ?? "price-desc",
    display_limit: display_limit ?? existing?.display_limit ?? 6,
    is_active: is_active ?? true,
    updated_by: auth.userId,
  };

  let config;
  if (existing) {
    config = await prisma.featuredConfig.update({
      where: { id: existing.id },
      data,
    });
  } else {
    config = await prisma.featuredConfig.create({ data });
  }

  await logAuditEvent(
    "featured_config_updated",
    "featured_config",
    config.id.toString(),
    auth,
    { pinned_ids: data.pinned_ids, sort: data.sort, display_limit: data.display_limit },
  );

  return NextResponse.json({
    id: config.id.toString(),
    pinned_ids: config.pinned_ids,
    filters: config.filters,
    sort: config.sort,
    display_limit: config.display_limit,
    is_active: config.is_active,
    updated_at: config.updated_at.toISOString(),
  });
}
