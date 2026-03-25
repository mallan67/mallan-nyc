import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth';
import { safeJson } from "@/lib/api/safe-json";

export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/rentals/applications — Returns rental applications (showing history records).
 * POST /api/crm/rentals/applications — Create a new application record.
 * Auth: agent or broker.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const landlordId = searchParams.get('landlord_id');

  const where: Record<string, unknown> = {};

  if (landlordId) {
    // Get listings owned by this landlord, then find showings on those listings
    const landlord = await prisma.lead.findUnique({
      where: { id: BigInt(landlordId) },
      select: { active_rental_listing_id: true },
    });
    if (landlord?.active_rental_listing_id) {
      where.listing_id = landlord.active_rental_listing_id;
    }
  }

  if (auth.role !== 'BROKER') {
    // Agents see only their own clients' applications
    where.lead = { agent_id: auth.userId };
  }

  const applications = await prisma.showingHistory.findMany({
    where,
    include: {
      lead: { select: { id: true, first_name: true, last_name: true, email: true, phone: true } },
    },
    orderBy: { showing_date: 'desc' },
    take: 200,
  });

  return NextResponse.json({
    applications: applications.map(a => ({
      ...a,
      id: String(a.id),
      lead_id: String(a.lead_id),
      price_at_time: a.price_at_time ? Number(a.price_at_time) : null,
      lead: a.lead ? { ...a.lead, id: String(a.lead.id) } : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { lead_id, listing_id, address, unit, showing_date, price_at_time, reaction, notes } = body as Record<string, unknown>;

  if (!lead_id || !address || !showing_date) {
    return NextResponse.json(
      { error: 'lead_id, address, and showing_date are required' },
      { status: 400 },
    );
  }

  const record = await prisma.showingHistory.create({
    data: {
      lead_id: BigInt(lead_id),
      listing_id: listing_id || null,
      address,
      unit: unit || null,
      showing_date: new Date(showing_date),
      price_at_time: price_at_time ? price_at_time : null,
      reaction: reaction || null,
      notes: notes || null,
      rented: false,
    },
  });

  return NextResponse.json({
    id: String(record.id),
    lead_id: String(record.lead_id),
    address: record.address,
    showing_date: record.showing_date,
  }, { status: 201 });
}
