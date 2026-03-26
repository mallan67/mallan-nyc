// /api/crm/buildings
// GET: List/search buildings from the local PostgreSQL building database.
// Auth: agent or broker required.
// Query params:
//   ?count_only=true        — returns { count: N } (used by RLS tracker)
//   ?q=search+term          — free-text on name, street_name, neighborhood
//   ?borough=Manhattan      — filter by borough
//   ?neighborhood=Carnegie+Hill
//   ?ownership_type=Co-op
//   ?new_construction=true
//   ?building_condition=UnderConstruction
//   ?limit=50&offset=0      — pagination (default 50, max 200)
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { serializeBigInts } from "@/lib/api/serialize";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;

  // ── count_only shortcut (for RLS tracker badge) ──────────────────────────
  if (searchParams.get("count_only") === "true") {
    const count = await prisma.building.count();
    return NextResponse.json({ count });
  }

  // ── pagination ───────────────────────────────────────────────────────────
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");

  // ── filters ──────────────────────────────────────────────────────────────
  const q = searchParams.get("q")?.trim();
  const borough = searchParams.get("borough");
  const neighborhood = searchParams.get("neighborhood");
  const ownership_type = searchParams.get("ownership_type");
  const new_construction = searchParams.get("new_construction");
  const building_condition = searchParams.get("building_condition");

  const where: Prisma.BuildingWhereInput = {};

  // Free-text search across name, street_name, neighborhood
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { street_name: { contains: q, mode: "insensitive" } },
      { neighborhood: { contains: q, mode: "insensitive" } },
    ];
  }

  if (borough) where.borough = { equals: borough, mode: "insensitive" };
  if (neighborhood) where.neighborhood = { equals: neighborhood, mode: "insensitive" };
  if (ownership_type) where.ownership_type = { equals: ownership_type, mode: "insensitive" };
  if (building_condition) where.building_condition = { equals: building_condition, mode: "insensitive" };
  if (new_construction === "true") where.new_construction = true;
  if (new_construction === "false") where.new_construction = false;

  // ── query ─────────────────────────────────────────────────────────────────
  const [buildings, total] = await Promise.all([
    prisma.building.findMany({
      where,
      orderBy: [{ active_listing_count: "desc" }, { name: "asc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        building_key: true,
        name: true,
        street_number: true,
        street_name: true,
        street_dir: true,
        street_suffix: true,
        neighborhood: true,
        borough: true,
        zip: true,
        city: true,
        latitude: true,
        longitude: true,
        ownership_type: true,
        structure_type: true,
        new_construction: true,
        building_condition: true,
        development_status: true,
        year_built: true,
        stories_total: true,
        total_units: true,
        units_leased: true,
        units_vacant: true,
        building_features: true,
        security_features: true,
        community_features: true,
        association_amenities: true,
        pets_allowed: true,
        parking_features: true,
        laundry_features: true,
        maintenance_fee: true,
        maintenance_fee_frequency: true,
        tax_annual: true,
        board_approval_required: true,
        walk_score: true,
        garage_yn: true,
        garage_spaces: true,
        parking_total: true,
        management_company: true,
        agent_notes: true,
        custom_tags: true,
        active_listing_count: true,
        total_listing_count: true,
        first_seen_at: true,
        last_synced_at: true,
        // Include unit count via relation aggregate
        _count: {
          select: { units: true },
        },
      },
    }),
    prisma.building.count({ where }),
  ]);

  // ── format + serialize ────────────────────────────────────────────────────
  const items = buildings.map((b) => {
    // Build a human-readable address string
    const parts = [
      b.street_number,
      b.street_dir,
      b.street_name,
      b.street_suffix,
    ].filter(Boolean);
    const street = parts.join(" ");
    const cityLine = [b.city || "New York", b.borough, b.zip]
      .filter(Boolean)
      .join(", ");
    const display_address = [street, cityLine].filter(Boolean).join(", ");

    const { _count, ...rest } = b;
    return {
      ...rest,
      unit_count: _count.units,
      display_address,
    };
  });

  return NextResponse.json(
    serializeBigInts({
      total,
      items,
      limit,
      offset,
    })
  );
}
