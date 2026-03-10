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

  return NextResponse.json({ ok: true, total, items: serialized });
}

export async function POST(req: NextRequest) {
  const writeBlock = assertWriteAllowed();
  if (writeBlock) return writeBlock;

  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { property_address, borough, neighborhood, listing_type, property_type, bedrooms, bathrooms, living_area, floor, notes } = body;

  if (!property_address) {
    return NextResponse.json({ ok: false, error: "property_address is required" }, { status: 400 });
  }

  // Find comps
  const comps = await findComps({
    property_address, borough, neighborhood, listing_type: listing_type || "sale",
    property_type, bedrooms, bathrooms, living_area, floor,
  });

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

  return NextResponse.json({
    ok: true,
    item: {
      ...report, id: report.id.toString(), agent_id: report.agent_id.toString(),
      estimated_value: report.estimated_value?.toString() ?? null,
      price_range_low: report.price_range_low?.toString() ?? null,
      price_range_high: report.price_range_high?.toString() ?? null,
    },
    valuation,
  }, { status: 201 });
}
