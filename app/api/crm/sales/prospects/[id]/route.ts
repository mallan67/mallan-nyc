/**
 * /api/crm/sales/prospects/[id] — GET / PUT / DELETE a single seller prospect
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";
import { safeJson } from "@/lib/api/safe-json";

type RouteParams = { params: Promise<{ id: string }> };

/** Explicit allowlist of fields that can be updated via PUT */
const ALLOWED_UPDATE_FIELDS = new Set([
  "address",
  "unit",
  "borough",
  "bbl",
  "bin",
  "owner_name",
  "owner_email",
  "owner_phone",
  "property_type",
  "beds",
  "baths",
  "sqft",
  "building_name",
  "management_company",
  "entity_type",
  "entity_name",
  "authorized_signatories",
  "secondary_name",
  "secondary_phone",
  "secondary_email",
  "secondary_relationship",
  "attorney_name",
  "attorney_email",
  "attorney_phone",
  "source",
  "source_detail",
  "status",
  "notes",
  "consent_captured_at",
  "consent_opt_out_at",
  "next_follow_up",
  "last_contacted_at",
  "pitch_data",
]);

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
    include: {
      signals: { orderBy: { collected_at: "desc" } },
      outreach_events: { orderBy: { created_at: "desc" }, take: 50 },
      cadence_steps: { orderBy: { day_offset: "asc" } },
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  return NextResponse.json({ prospect: serializeBigInts(prospect) });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Ownership check
  const existing = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;

  // Filter through allowlist (pitch_data handled separately below with validation)
  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (key === "pitch_data") continue;
    if (key in body) {
      // Convert ISO date strings to Date objects for DateTime fields
      if (
        (key === "consent_captured_at" ||
          key === "consent_opt_out_at" ||
          key === "next_follow_up" ||
          key === "last_contacted_at") &&
        body[key]
      ) {
        data[key] = new Date(body[key]);
      } else {
        data[key] = body[key];
      }
    }
  }

  // Validate and handle pitch_data separately (not copied via allowlist loop above)
  if ("pitch_data" in body) {
    const pd = body.pitch_data;
    if (pd !== null && (typeof pd !== "object" || Array.isArray(pd))) {
      return NextResponse.json(
        { error: "pitch_data must be a valid object" },
        { status: 400 },
      );
    }
    if (pd !== null && pd !== undefined) {
      // Validate comps array if present
      if ("comps" in pd) {
        if (!Array.isArray(pd.comps)) {
          return NextResponse.json(
            { error: "pitch_data.comps must be an array" },
            { status: 400 },
          );
        }
        for (let i = 0; i < pd.comps.length; i++) {
          const comp = pd.comps[i];
          if (typeof comp.mls_id !== "string" || !comp.mls_id) {
            return NextResponse.json(
              { error: `pitch_data.comps[${i}].mls_id must be a non-empty string` },
              { status: 400 },
            );
          }
          if (typeof comp.close_price !== "number" || comp.close_price <= 0) {
            return NextResponse.json(
              { error: `pitch_data.comps[${i}].close_price must be a number greater than 0` },
              { status: 400 },
            );
          }
        }
      }
      // Validate overrides object if present
      if ("overrides" in pd) {
        if (typeof pd.overrides !== "object" || Array.isArray(pd.overrides) || pd.overrides === null) {
          return NextResponse.json(
            { error: "pitch_data.overrides must be an object" },
            { status: 400 },
          );
        }
        const ov = pd.overrides;
        if ("commission_rate" in ov) {
          if (typeof ov.commission_rate !== "number" || ov.commission_rate < 0 || ov.commission_rate > 0.15) {
            return NextResponse.json(
              { error: "pitch_data.overrides.commission_rate must be a number between 0 and 0.15" },
              { status: 400 },
            );
          }
        }
        if ("attorney_fees" in ov) {
          if (typeof ov.attorney_fees !== "number" || ov.attorney_fees < 0) {
            return NextResponse.json(
              { error: "pitch_data.overrides.attorney_fees must be a number >= 0" },
              { status: 400 },
            );
          }
        }
      }
    }
    data.pitch_data = pd ?? null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.sellerLead.update({
    where: { id: prospectId },
    data,
    include: {
      cadence_steps: { orderBy: { day_offset: "asc" } },
    },
  });

  await logAuditEvent(
    "seller_prospect_updated",
    "seller_lead",
    String(updated.id),
    auth,
    { fields: Object.keys(data) },
  );

  return NextResponse.json({ prospect: serializeBigInts(updated) });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Ownership check
  const existing = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Cascade delete handled by Prisma schema (signals, outreach_events, cadence_steps)
  await prisma.sellerLead.delete({ where: { id: prospectId } });

  await logAuditEvent(
    "seller_prospect_deleted",
    "seller_lead",
    String(prospectId),
    auth,
    { address: existing.address },
  );

  return NextResponse.json({ deleted: true, id: String(prospectId) });
}
