/**
 * POST /api/crm/sales/prospects/[id]/research
 *
 * Triggers PLUTO/ACRIS/DOF/DOB research for a seller prospect.
 * Enriches the prospect record with public NYC data and runs readiness scoring.
 *
 * Rate limited: max 1 research call per hour per prospect.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";
import { soda } from "@/lib/soda";
import { scoreSellerLead } from "@/lib/seller-readiness/scorer";
import { fetchDofTaxData } from "@/lib/seller-readiness/signals/dof-tax";

const PLUTO = process.env.SODA_DATASET_PLUTO ?? "64uk-42ks";

// Borough name/code mapping (bidirectional)
const BOROUGH_CODES: Record<string, string> = {
  manhattan: "1", bronx: "2", brooklyn: "3", queens: "4", "staten island": "5",
  mn: "1", bx: "2", bk: "3", qn: "4", si: "5",
};

function boroughCode(input: string): string {
  const n = input.trim().toLowerCase();
  if (/^[1-5]$/.test(n)) return n;
  return BOROUGH_CODES[n] ?? "1";
}

interface PlutoRow {
  bbl?: string;
  address?: string;
  ownername?: string;
  yearbuilt?: string;
  numfloors?: string;
  unitsres?: string;
  unitstotal?: string;
  bldgclass?: string;
  lotarea?: string;
  bldgarea?: string;
  borocode?: string;
}

/** Normalize PLUTO BBL: "1007700059.00000000" -> "1007700059" */
function normBbl(raw: string): string {
  return raw.split(".")[0].padStart(10, "0");
}

/** Sanitize BBL: must be exactly 10 digits */
function sanitizeBbl(bbl: string): string | null {
  const cleaned = bbl.replace(/\D/g, "");
  return cleaned.length === 10 ? cleaned : null;
}

/** Sanitize address for SODA WHERE clause: escape single quotes, strip injection chars */
function sanitizeAddress(addr: string): string {
  return addr
    .trim()
    .toUpperCase()
    .replace(/'/g, "''")       // Escape single quotes for SoQL
    .replace(/[;\\{}]/g, "");  // Strip common injection chars
}

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;
  const writeCheck = assertWriteAllowed();
  if (writeCheck) return writeCheck;

  const { id } = await params;
  const prospectId = safeBigInt(id);
  if (!prospectId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Ownership check
  const prospect = await prisma.sellerLead.findFirst({
    where: {
      id: prospectId,
      ...(auth.role !== "BROKER" ? { assigned_agent_id: auth.userId } : {}),
    },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  // Rate limit: max 1 per hour per prospect
  if (prospect.last_researched_at) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (prospect.last_researched_at > hourAgo) {
      const retryAfterMs = prospect.last_researched_at.getTime() + 60 * 60 * 1000 - Date.now();
      const retryMinutes = Math.ceil(retryAfterMs / 60_000);
      return NextResponse.json(
        { error: `Research was run recently. Try again in ${retryMinutes} minute(s).` },
        { status: 429 },
      );
    }
  }

  // ── Step 1: PLUTO lookup ────────────────────────────────────────────────────
  let bbl = prospect.bbl ? sanitizeBbl(prospect.bbl) : null;
  let pluto: PlutoRow | null = null;

  try {
    if (bbl) {
      // Lookup by BBL
      const padded = bbl.padStart(10, "0") + ".00000000";
      const rows = await soda<PlutoRow>({
        resource: PLUTO,
        where: `bbl='${padded}'`,
        limit: 1,
      });
      pluto = rows?.[0] ?? null;
    } else if (prospect.address && prospect.borough) {
      // Resolve BBL from address + borough
      const addr = sanitizeAddress(prospect.address);
      const boro = boroughCode(prospect.borough);
      const rows = await soda<PlutoRow>({
        resource: PLUTO,
        where: `address='${addr}' AND borocode='${boro}'`,
        limit: 1,
      });
      pluto = rows?.[0] ?? null;
      if (pluto?.bbl) {
        bbl = normBbl(pluto.bbl);
      }
    }
  } catch (err) {
    console.warn("[prospect-research] PLUTO lookup failed:", (err as Error).message);
  }

  // ── Step 2: Update prospect with PLUTO data ────────────────────────────────
  const plutoUpdate: Record<string, unknown> = {
    last_researched_at: new Date(),
  };

  if (bbl && !prospect.bbl) {
    plutoUpdate.bbl = bbl;
  }

  if (pluto) {
    if (pluto.ownername && !prospect.owner_name) {
      plutoUpdate.owner_name = pluto.ownername;
    }
    if (pluto.yearbuilt) {
      plutoUpdate.year_built = parseInt(pluto.yearbuilt) || null;
    }
    if (pluto.numfloors) {
      plutoUpdate.floors = parseInt(pluto.numfloors) || null;
    }
    if (pluto.unitstotal) {
      plutoUpdate.units_total = parseInt(pluto.unitstotal) || null;
    }
    if (pluto.bldgarea) {
      const sqft = parseInt(pluto.bldgarea);
      if (sqft > 0) plutoUpdate.sqft = sqft;
    }
    if (pluto.lotarea) {
      const area = parseInt(pluto.lotarea);
      if (area > 0) plutoUpdate.lot_area = area;
    }
  }

  await prisma.sellerLead.update({
    where: { id: prospectId },
    data: plutoUpdate,
  });

  // ── Step 3: Run scoring (this handles ACRIS/DOB/DOF signal collection) ─────
  let scoreResult = null;
  try {
    scoreResult = await scoreSellerLead(prospectId);
  } catch (err) {
    console.warn("[prospect-research] Scoring failed:", (err as Error).message);
  }

  // ── Step 4: Extract ACRIS enrichment from signals ──────────────────────────
  const acrisUpdate: Record<string, unknown> = {};

  if (scoreResult?.signals) {
    const ownershipSig = scoreResult.signals.find(
      (s) => s.signal_type === "ownership_duration",
    );
    const mortgageSig = scoreResult.signals.find(
      (s) => s.signal_type === "mortgage_age",
    );
    const equitySig = scoreResult.signals.find(
      (s) => s.signal_type === "equity_estimate",
    );

    if (ownershipSig?.metadata) {
      const meta = ownershipSig.metadata as Record<string, unknown>;
      const yearsRaw = ownershipSig.raw_value ?? ""; // e.g. "12.3 years"
      const years = parseFloat(yearsRaw);
      if (!isNaN(years)) acrisUpdate.ownership_years = years;
      if (meta.deed_date) {
        acrisUpdate.last_purchase_date = new Date(meta.deed_date as string);
      }
    }

    if (mortgageSig?.metadata) {
      const meta = mortgageSig.metadata as Record<string, unknown>;
      if (meta.amount || meta.mortgage_amount) {
        const amt = parseFloat(String(meta.amount ?? meta.mortgage_amount));
        if (!isNaN(amt) && amt > 0) acrisUpdate.mortgage_amount = amt;
      }
      if (meta.mortgage_date) {
        acrisUpdate.mortgage_date = new Date(meta.mortgage_date as string);
      }
    }

    if (equitySig?.metadata) {
      const meta = equitySig.metadata as Record<string, unknown>;
      if (meta.purchase_price) {
        const price = parseFloat(String(meta.purchase_price));
        if (!isNaN(price) && price > 0) acrisUpdate.last_purchase_price = price;
      }
      if (meta.estimated_ltv != null) {
        const ltv = parseFloat(String(meta.estimated_ltv));
        if (!isNaN(ltv)) acrisUpdate.equity_ratio = Math.max(0, Math.min(0.99, 1 - ltv));
      }
    }
  }

  // ── Step 5: Fetch DOF tax data directly and update ─────────────────────────
  const taxUpdate: Record<string, unknown> = {};

  if (bbl) {
    try {
      const dof = await fetchDofTaxData(bbl);
      if (dof) {
        taxUpdate.tax_class = dof.tax_class;
        taxUpdate.annual_tax = dof.estimated_annual_tax;
        taxUpdate.market_value = dof.market_value;
        taxUpdate.assessed_value = dof.assessed_value;
      }
    } catch (err) {
      console.warn("[prospect-research] DOF fetch failed:", (err as Error).message);
    }
  }

  // ── Step 6: Apply all enrichment updates ────────────────────────────────────
  const enrichmentData = { ...acrisUpdate, ...taxUpdate };
  if (Object.keys(enrichmentData).length > 0) {
    await prisma.sellerLead.update({
      where: { id: prospectId },
      data: enrichmentData,
    });
  }

  // ── Fetch final state with all relations ────────────────────────────────────
  const final = await prisma.sellerLead.findUnique({
    where: { id: prospectId },
    include: {
      signals: { orderBy: { collected_at: "desc" } },
      outreach_events: { orderBy: { created_at: "desc" }, take: 10 },
      cadence_steps: { orderBy: { day_offset: "asc" } },
    },
  });

  await logAuditEvent(
    "seller_prospect_researched",
    "seller_lead",
    String(prospectId),
    auth,
    {
      bbl,
      pluto_found: !!pluto,
      score: scoreResult?.readiness_score ?? null,
      grade: scoreResult?.score_grade ?? null,
      enriched_fields: Object.keys(enrichmentData),
    },
  );

  return NextResponse.json({
    prospect: serializeBigInts(final),
    research: {
      pluto_found: !!pluto,
      bbl_resolved: !!bbl,
      score: scoreResult?.readiness_score ?? null,
      grade: scoreResult?.score_grade ?? null,
      signals_count: scoreResult?.signals?.length ?? 0,
      enriched_fields: Object.keys(enrichmentData),
    },
  });
}
