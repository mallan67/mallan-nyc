// /api/crm/cma — GET: list CMA reports, POST: create new CMA
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { findComps, estimateValue } from "@/lib/cma/engine";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
  const offset = parseInt(searchParams.get("offset") || "0");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (auth.role !== "BROKER") where.agent_id = auth.userId;
  if (status) where.status = status;

  const [reports, total] = await Promise.all([
    prisma.cmaReport.findMany({
      where, orderBy: { created_at: "desc" }, take: limit, skip: offset,
      include: { agent: { select: { id: true, full_name: true } } },
    }),
    prisma.cmaReport.count({ where }),
  ]);

  const serialized = reports.map(r => ({
    ...r, id: r.id.toString(), agent_id: r.agent_id.toString(),
    estimated_value: r.estimated_value?.toString() ?? null,
    price_range_low: r.price_range_low?.toString() ?? null,
    price_range_high: r.price_range_high?.toString() ?? null,
    agent: r.agent ? { ...r.agent, id: r.agent.id.toString() } : null,
  }));

  return NextResponse.json({ total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { property_address, borough, neighborhood, listing_type, property_type, bedrooms, bathrooms, living_area, floor, notes } = body as {
    property_address?: string; borough?: string; neighborhood?: string; listing_type?: string;
    property_type?: string; bedrooms?: number; bathrooms?: number; living_area?: number;
    floor?: number; notes?: string;
  };

  if (!property_address) {
    return NextResponse.json({ error: "property_address is required" }, { status: 400 });
  }

  // Find comps
  const comps = await findComps({
    property_address, borough, neighborhood, listing_type: listing_type || "sale",
    property_type, bedrooms, bathrooms, living_area, floor,
  });

  // Reports/CMA Tier A P0 — empty-pool fail-loud.
  // Previously a zero-comp result silently produced a $0 CmaReport
  // (estimateValue returns {0,0,0}). Sellers receiving such a report
  // had no signal that the comp pool was empty. Now the route returns
  // 422 with a clear error and skips the DB write — agent must broaden
  // criteria or verify Trestle availability before proceeding.
  if (comps.length === 0) {
    return NextResponse.json(
      {
        error: "Insufficient comparable data — broaden criteria or check Trestle availability.",
        code: "INSUFFICIENT_COMPS",
        subject: { property_address, borough, neighborhood, listing_type, property_type, bedrooms, bathrooms },
      },
      { status: 422 },
    );
  }

  const valuation = estimateValue(comps);

  const report = await prisma.cmaReport.create({
    data: {
      agent_id: auth.userId,
      property_address,
      borough: borough || null,
      neighborhood: neighborhood || null,
      subject_details: { listing_type, property_type, bedrooms, bathrooms, living_area, floor } as Prisma.InputJsonValue,
      comps: comps as unknown as Prisma.InputJsonValue,
      adjustments: comps.map(c => c.adjustments) as unknown as Prisma.InputJsonValue,
      estimated_value: valuation.estimated,
      price_range_low: valuation.low,
      price_range_high: valuation.high,
      notes: notes || null,
    },
  });

  await logAuditEvent("create", "cma_report", report.id.toString(), auth);

  return NextResponse.json({ item: {
      ...report, id: report.id.toString(), agent_id: report.agent_id.toString(),
      estimated_value: report.estimated_value?.toString() ?? null,
      price_range_low: report.price_range_low?.toString() ?? null,
      price_range_high: report.price_range_high?.toString() ?? null,
    },
    valuation,
  }, { status: 201 });
}
