/**
 * GET  /api/crm/sales/prospects/[id]/comps?q=...
 *   - With q param: search Trestle for comparable sales (by ListingId or address)
 *   - Without q param: return saved comps from pitch_data
 *
 * POST /api/crm/sales/prospects/[id]/comps
 *   - Save curated comp list (with optional per-comp overrides) to pitch_data
 *
 * MLS data is server-side only — never expose Trestle responses raw to the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { getAccessToken } from "@/lib/idx/auth";
import { sanitizeOData } from "@/lib/sanitize";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";

type RouteParams = { params: Promise<{ id: string }> };

// ── Constants ────────────────────────────────────────────────────────────────

const TRESTLE_URL =
  process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

const COMP_SELECT = [
  "ListingId",
  "UnparsedAddress",
  "UnitNumber",
  "ClosePrice",
  "CloseDate",
  "BedroomsTotal",
  "BathroomsFull",
  "LivingArea",
  "BuildingName",
  "PropertySubType",
  "StreetNumber",
  "StreetName",
].join(",");

// ── Types ────────────────────────────────────────────────────────────────────

interface TrestleComp {
  ListingId?: string;
  UnparsedAddress?: string;
  UnitNumber?: string;
  ClosePrice?: number;
  CloseDate?: string;
  BedroomsTotal?: number;
  BathroomsFull?: number;
  LivingArea?: number;
  BuildingName?: string;
  PropertySubType?: string;
  StreetNumber?: string;
  StreetName?: string;
}

interface MappedComp {
  mls_id: string;
  address: string;
  unit: string | null;
  close_price: number | null;
  close_date: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  building_name: string | null;
  property_type: string | null;
}

interface SavedComp extends MappedComp {
  [key: string]: unknown;
}

interface PitchData {
  comps?: SavedComp[];
  overrides?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Trestle helper ───────────────────────────────────────────────────────────

async function searchTrestle(filter: string): Promise<MappedComp[]> {
  try {
    const token = await getAccessToken();
    const url =
      `${TRESTLE_URL}/odata/Property` +
      `?$filter=${encodeURIComponent(filter)}` +
      `&$select=${COMP_SELECT}` +
      `&$top=20` +
      `&$orderby=CloseDate desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[comps] Trestle query failed (${res.status})`);
      return [];
    }

    const data = await res.json();
    const items: TrestleComp[] = data.value || [];

    return items.map(
      (s): MappedComp => ({
        mls_id: s.ListingId ?? "",
        address: s.UnparsedAddress ?? "",
        unit: s.UnitNumber ?? null,
        close_price: s.ClosePrice ?? null,
        close_date: s.CloseDate ?? null,
        beds: s.BedroomsTotal ?? null,
        baths: s.BathroomsFull ?? null,
        sqft: s.LivingArea ?? null,
        building_name: s.BuildingName ?? null,
        property_type: s.PropertySubType ?? null,
      }),
    );
  } catch (err) {
    console.error("[comps] Trestle fetch error:", err);
    return [];
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // ── Search mode: q param present ──────────────────────────────────────────
  if (q) {
    let filter: string;

    if (q.toUpperCase().startsWith("RLS") || /^[A-Z0-9]{8,}$/i.test(q)) {
      // Treat as ListingId
      const safeId = sanitizeOData(q);
      filter = `ListingId eq '${safeId}'`;
    } else {
      // Treat as address: split into street number + street name
      const parts = q.trim().split(/\s+/);
      const rawNum = parts[0] ?? "";
      const rawStreet = parts.slice(1).join(" ");

      const streetNum = sanitizeOData(rawNum);
      const streetName = sanitizeOData(rawStreet);

      if (!streetNum || !streetName) {
        return NextResponse.json(
          { error: "Please provide a street number and street name" },
          { status: 400 },
        );
      }

      filter =
        `StreetNumber eq '${streetNum}'` +
        ` and contains(StreetName,'${streetName}')` +
        ` and StandardStatus eq 'Closed'`;
    }

    const results = await searchTrestle(filter);
    return NextResponse.json({ results });
  }

  // ── Saved comps mode: no q param ─────────────────────────────────────────
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
    select: { pitch_data: true },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const pitchData = (prospect.pitch_data as PitchData) ?? {};

  return NextResponse.json(
    serializeBigInts({
      comps: pitchData.comps ?? [],
      overrides: pitchData.overrides ?? {},
    }),
  );
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  // Ownership check
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
    select: { id: true, pitch_data: true },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  const body = await req.json();
  const { comps, overrides } = body as {
    comps?: unknown[];
    overrides?: Record<string, unknown>;
  };

  // Validate comps array
  if (!Array.isArray(comps)) {
    return NextResponse.json(
      { error: "comps must be an array" },
      { status: 400 },
    );
  }

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i] as Record<string, unknown>;
    if (typeof comp.mls_id !== "string" || !comp.mls_id) {
      return NextResponse.json(
        { error: `comps[${i}].mls_id must be a non-empty string` },
        { status: 400 },
      );
    }
    if (typeof comp.close_price !== "number" || comp.close_price <= 0) {
      return NextResponse.json(
        { error: `comps[${i}].close_price must be a number greater than 0` },
        { status: 400 },
      );
    }
  }

  // Merge with existing pitch_data (preserve other keys)
  const existing = (prospect.pitch_data as PitchData) ?? {};
  const updated: PitchData = {
    ...existing,
    comps: comps as SavedComp[],
    ...(overrides !== undefined ? { overrides } : {}),
  };

  await prisma.sellerLead.update({
    where: { id: prospectId },
    data: { pitch_data: JSON.parse(JSON.stringify(updated)) },
  });

  return NextResponse.json(
    serializeBigInts({
      comps: updated.comps ?? [],
      overrides: updated.overrides ?? {},
    }),
  );
}
