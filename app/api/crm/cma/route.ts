// /api/crm/cma — GET: list CMA reports, POST: create new CMA
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { findComps, estimateValue, resolveRates, cleanManual, type CmaRates, type ManualAdjustment } from "@/lib/cma/engine";
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
  const { property_address, unit, borough, neighborhood, listing_type, property_type, bedrooms, bathrooms, living_area, floor, notes,
    subject_listing_key, comp_listing_keys, months, include_active, monthly_cost, rates, manual, opinion } = body as {
    property_address?: string; unit?: string; borough?: string; neighborhood?: string; listing_type?: string;
    property_type?: string; bedrooms?: number; bathrooms?: number; living_area?: number;
    floor?: number; notes?: string; subject_listing_key?: string; comp_listing_keys?: string[]; months?: number; include_active?: boolean;
    /** The subject's monthlies (maintenance / CC + taxes per month), kept with the record so a reopened CMA shows it */
    monthly_cost?: number;
    /** The agent's adjustment rules and per-comparable lines (Broker Price Opinion), kept with the record */
    rates?: CmaRates; manual?: Record<string, unknown[]>;
    /** The broker's own price opinion for the report */
    opinion?: { list_price?: number; sale_price_90?: number; comments?: string };
  };

  if (!property_address) {
    return NextResponse.json({ error: "property_address is required" }, { status: 400 });
  }
  const subjectMonthly = typeof monthly_cost === "number" && monthly_cost > 0 ? Math.round(monthly_cost) : undefined;
  const cleanRates = resolveRates(rates);
  const cleanLines: Record<string, ManualAdjustment[]> = {};
  if (manual && typeof manual === "object") {
    for (const [key, lines] of Object.entries(manual).slice(0, 200)) {
      const c = cleanManual(lines);
      if (c.length) cleanLines[String(key)] = c;
    }
  }
  const cleanOpinion = opinion && typeof opinion === "object" ? {
    list_price: Number.isFinite(Number(opinion.list_price)) && Number(opinion.list_price) > 0 ? Math.round(Number(opinion.list_price)) : undefined,
    sale_price_90: Number.isFinite(Number(opinion.sale_price_90)) && Number(opinion.sale_price_90) > 0 ? Math.round(Number(opinion.sale_price_90)) : undefined,
    comments: opinion.comments ? String(opinion.comments).slice(0, 2000) : undefined,
  } : undefined;

  // Comparables from LIVE Cotality: the agent's exact picks (ListingKeys) or the automatic search
  // in the subject's neighborhood (lib/cma/engine.ts). A criterion Cotality cannot serve is refused.
  let comps;
  try {
    comps = await findComps({
      property_address, unit, borough, neighborhood, listing_type: listing_type || "sale",
      property_type, bedrooms, bathrooms, living_area, floor, monthly_cost: subjectMonthly,
      rates: cleanRates, manual: cleanLines,
      subject_listing_key, months, include_active,
      comp_listing_keys: Array.isArray(comp_listing_keys) ? comp_listing_keys.map(String).filter(Boolean) : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, code: "CRITERIA_UNAVAILABLE" }, { status: 422 });
  }

  // Reports/CMA Tier A P0 — empty-pool fail-loud.
  // Previously a zero-comp result silently produced a $0 CmaReport
  // (estimateValue returns {0,0,0}). Sellers receiving such a report
  // had no signal that the comp pool was empty. Now the route returns
  // 422 with a clear error and skips the DB write — agent must broaden
  // criteria or verify Cotality availability before proceeding.
  if (comps.length === 0) {
    return NextResponse.json(
      {
        error: "No comparable listings in live Cotality for these criteria — widen the time window, area or bedrooms.",
        code: "INSUFFICIENT_COMPS",
        subject: { property_address, unit, borough, neighborhood, listing_type, property_type, bedrooms, bathrooms, months: months || 6 },
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
      subject_details: { unit, listing_type, property_type, bedrooms, bathrooms, living_area, floor, monthly_cost: subjectMonthly, subject_listing_key, months: months || 6, include_active: !!include_active, source: "cotality_live",
        rates: cleanRates, manual: cleanLines, opinion: cleanOpinion } as unknown as Prisma.InputJsonValue,
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
    comps,
    valuation,
  }, { status: 201 });
}
