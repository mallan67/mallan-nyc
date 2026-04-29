/**
 * PUT /api/crm/clients/[id]/parties
 *
 * Bulk upsert lead parties (co-owners, roommates, managing members, etc.)
 * Replaces all existing parties with the submitted list.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";
import { assertLeadAccess } from "@/lib/crm/access";

type RouteParams = { params: Promise<{ id: string }> };

interface PartyInput {
  id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  signs_documents?: boolean;
  appears_on_deed?: boolean;
  appears_on_lease?: boolean;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const access = await assertLeadAccess(auth, leadId);
  if (access) return access;

  let body: { parties: PartyInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.parties || !Array.isArray(body.parties)) {
    return NextResponse.json({ error: "parties array required" }, { status: 400 });
  }

  // Validate each party
  for (let i = 0; i < body.parties.length; i++) {
    const p = body.parties[i];
    if (!p.first_name || !p.last_name) {
      return NextResponse.json({ error: `Party ${i + 1}: first_name and last_name required` }, { status: 400 });
    }
    if (!p.role) {
      return NextResponse.json({ error: `Party ${i + 1}: role required` }, { status: 400 });
    }
  }

  // Delete all existing parties for this lead
  await prisma.leadParty.deleteMany({ where: { lead_id: leadId } });

  // Create new parties
  if (body.parties.length > 0) {
    await prisma.leadParty.createMany({
      data: body.parties.map((p) => ({
        lead_id: leadId,
        first_name: p.first_name.trim(),
        last_name: p.last_name.trim(),
        email: p.email?.trim() || null,
        phone: p.phone?.trim() || null,
        role: p.role,
        signs_documents: p.signs_documents ?? false,
        appears_on_deed: p.appears_on_deed ?? false,
        appears_on_lease: p.appears_on_lease ?? false,
      })),
    });
  }

  // Fetch updated parties
  const parties = await prisma.leadParty.findMany({
    where: { lead_id: leadId },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({ parties: serializeBigInts(parties) });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const leadId = safeBigInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const access = await assertLeadAccess(auth, leadId);
  if (access) return access;

  const parties = await prisma.leadParty.findMany({
    where: { lead_id: leadId },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({ parties: serializeBigInts(parties) });
}
