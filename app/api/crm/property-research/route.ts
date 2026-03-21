/**
 * GET /api/crm/property-research
 *
 * Aggregates live NYC public data for a property into one response.
 * Used by the Seller Workspace Research tab to show inline data
 * instead of sending the agent to external websites.
 *
 * Sources:
 *   PLUTO  — BBL lookup, building data (year built, units, floors, class)
 *   ACRIS  — Deed owner, ownership duration, mortgage
 *   DOB    — Violations, permits, building risk
 *   DOF    — Tax class, annual property tax estimate
 *
 * Query params (one of):
 *   ?bbl=1007700059          — 10-digit BBL (fastest, skips PLUTO lookup)
 *   ?address=234+W+21+St&borough=1  — address + borough code (1-5)
 *   ?client_id=123           — auto-resolves from Lead.bbl or Lead.property_address
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { soda } from "@/lib/soda";
import { collectAcrisSignals } from "@/lib/seller-readiness/signals/acris";
import { collectDobSignals } from "@/lib/seller-readiness/signals/dob";
import { fetchDofTaxData } from "@/lib/seller-readiness/signals/dof-tax";
import prisma from "@/lib/prisma";

const PLUTO = process.env.SODA_DATASET_PLUTO ?? "64uk-42ks";

// ── Borough name/code mapping ──────────────────────────────────────────────────
const BOROUGH_NAMES: Record<string, string> = {
  "1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island",
  manhattan: "1", bronx: "2", brooklyn: "3", queens: "4", "staten island": "5",
};

function boroughCode(input: string): string {
  const n = input.trim().toLowerCase();
  if (/^[1-5]$/.test(n)) return n;
  return BOROUGH_NAMES[n] ?? "1";
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
  assesstot?: string;
  exempttot?: string;
  lotarea?: string;
  bldgarea?: string;
  borocode?: string;
  zipcode?: string;
  latitude?: string;
  longitude?: string;
}

/** Normalize PLUTO BBL: "1007700059.00000000" → "1007700059" */
function normBbl(raw: string): string {
  return raw.split(".")[0].padStart(10, "0");
}

/** Look up a property in PLUTO by address + borough */
async function plutoByAddress(address: string, borough: string): Promise<PlutoRow | null> {
  const normalized = address.trim().toUpperCase();
  try {
    const rows = await soda<PlutoRow>({
      resource: PLUTO,
      where: `address='${normalized}' AND borocode='${boroughCode(borough)}'`,
      limit: 1,
    });
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Look up a property in PLUTO by BBL */
async function plutoByBbl(bbl: string): Promise<PlutoRow | null> {
  const normalized = bbl.padStart(10, "0") + ".00000000";
  try {
    const rows = await soda<PlutoRow>({
      resource: PLUTO,
      where: `bbl='${normalized}'`,
      limit: 1,
    });
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  let bbl = sp.get("bbl")?.replace(/\D/g, "") ?? null;
  const address = sp.get("address") ?? null;
  const borough = sp.get("borough") ?? "1";
  const clientId = sp.get("client_id") ?? null;

  // ── Resolve BBL from client_id if not provided ────────────────────────────
  if (!bbl && clientId) {
    try {
      const lead = await prisma.lead.findFirst({
        where: { id: BigInt(clientId) },
        select: { bbl: true, property_address: true, borough: true } as any,
      });
      if ((lead as any)?.bbl) {
        bbl = (lead as any).bbl;
      }
    } catch {
      // Non-fatal
    }
  }

  // ── PLUTO lookup ──────────────────────────────────────────────────────────
  let pluto: PlutoRow | null = null;

  if (bbl) {
    pluto = await plutoByBbl(bbl);
  } else if (address) {
    pluto = await plutoByAddress(address, borough);
    if (pluto?.bbl) {
      bbl = normBbl(pluto.bbl);
    }
  }

  if (!bbl && !pluto) {
    return NextResponse.json(
      { error: "Property not found. Provide bbl, address+borough, or client_id." },
      { status: 404 }
    );
  }

  if (pluto?.bbl && !bbl) {
    bbl = normBbl(pluto.bbl);
  }

  // ── Fetch all sources in parallel ─────────────────────────────────────────
  const [acrisSignals, dobSignals, dofData] = await Promise.allSettled([
    bbl ? collectAcrisSignals(bbl) : Promise.resolve([]),
    bbl ? collectDobSignals(bbl) : Promise.resolve([]),
    bbl ? fetchDofTaxData(bbl) : Promise.resolve(null),
  ]);

  const acris = acrisSignals.status === "fulfilled" ? acrisSignals.value : [];
  const dob = dobSignals.status === "fulfilled" ? dobSignals.value : [];
  const dof = dofData.status === "fulfilled" ? dofData.value : null;

  // ── Extract key values from signals ───────────────────────────────────────

  // ACRIS
  const ownershipSig = acris.find(s => s.signal_type === "ownership_duration");
  const mortgageSig = acris.find(s => s.signal_type === "mortgage_age");
  const equitySig = acris.find(s => s.signal_type === "equity_estimate");

  const ownershipMeta = ownershipSig?.metadata as any;
  const mortgageMeta = mortgageSig?.metadata as any;

  // DOB
  const dobPermitSig = dob.find(s => s.signal_type === "dob_permits");
  const dobRiskSig = dob.find(s => s.signal_type === "building_risk");
  const dobRenovSig = dob.find(s => s.signal_type === "renovation_signal");

  const dobPermitMeta = dobPermitSig?.metadata as any;
  const dobRiskMeta = dobRiskSig?.metadata as any;

  // ── Build response ─────────────────────────────────────────────────────────
  const result = {
    bbl,
    found: true,

    // Building identity (PLUTO)
    building: pluto ? {
      address: pluto.address,
      owner_name: pluto.ownername,
      year_built: pluto.yearbuilt ? parseInt(pluto.yearbuilt) : null,
      num_floors: pluto.numfloors ? parseFloat(pluto.numfloors) : null,
      units_residential: pluto.unitsres ? parseInt(pluto.unitsres) : null,
      units_total: pluto.unitstotal ? parseInt(pluto.unitstotal) : null,
      building_class: pluto.bldgclass,
      lot_area_sqft: pluto.lotarea ? parseFloat(pluto.lotarea) : null,
      building_area_sqft: pluto.bldgarea ? parseFloat(pluto.bldgarea) : null,
      borough: BOROUGH_NAMES[pluto.borocode ?? "1"] ?? "Manhattan",
      zip: pluto.zipcode,
      latitude: pluto.latitude ? parseFloat(pluto.latitude) : null,
      longitude: pluto.longitude ? parseFloat(pluto.longitude) : null,
    } : null,

    // Ownership (ACRIS)
    ownership: {
      deed_owner: ownershipMeta?.deed_owner ?? null,
      deed_date: ownershipMeta?.deed_date ?? null,
      years_owned: ownershipSig?.raw_value ?? null,
      ownership_score: ownershipSig?.normalized ?? null,
      mortgage_exists: mortgageMeta?.mortgage_date ? true : false,
      mortgage_date: mortgageMeta?.mortgage_date ?? null,
      mortgage_amount: mortgageMeta?.mortgage_amount ?? null,
      mortgage_age_years: mortgageSig?.raw_value ?? null,
      estimated_ltv: equitySig ? (1 - (equitySig.normalized ?? 0)) : null,
      equity_signal: equitySig?.normalized ?? null,
    },

    // Building risk (DOB)
    dob: {
      total_permits: dobPermitMeta?.total_permits ?? 0,
      renovation_permits: dobRenovSig ? (dobRenovSig.metadata as any)?.renovation_permits ?? 0 : 0,
      permit_types: dobPermitMeta?.permit_types ?? [],
      open_violations: dobRiskMeta?.open_violations ?? 0,
      total_violations: dobRiskMeta?.total_violations ?? 0,
      risk_level: dobRiskSig
        ? dobRiskSig.normalized > 0.5 ? "High" : dobRiskSig.normalized > 0.2 ? "Medium" : "Low"
        : "Unknown",
      risk_score: dobRiskSig?.normalized ?? null,
    },

    // Property tax (DOF)
    tax: dof ? {
      tax_class: dof.tax_class,
      tax_class_label: taxClassLabel(dof.tax_class),
      market_value: dof.market_value,
      assessed_value: dof.assessed_value,
      exemption_amount: dof.exemption_amount,
      taxable_assessed: dof.taxable_assessed,
      estimated_annual_tax: dof.estimated_annual_tax,
      estimated_monthly_tax: Math.round(dof.estimated_annual_tax / 12),
      tax_rate_pct: (dof.tax_rate * 100).toFixed(3),
      building_class: dof.building_class,
      roll_year: dof.roll_year,
      owner_name_dof: dof.owner_name,
    } : null,

    // Pre-filled values for cost-of-sale calculator
    calculator_prefill: {
      sale_price_estimate: dof?.market_value ?? null,
      mortgage_balance: mortgageMeta?.mortgage_amount
        ? estimateMortgageBalance(mortgageMeta.mortgage_amount, mortgageMeta.mortgage_date)
        : null,
      annual_property_tax: dof?.estimated_annual_tax ?? null,
    },

    // Readiness summary
    readiness: {
      score: computeSimpleScore(ownershipSig?.normalized, mortgageSig?.normalized, equitySig?.normalized, dobRiskSig?.normalized),
      signals: {
        long_owner: (ownershipSig?.normalized ?? 0) > 0.5,
        high_equity: (equitySig?.normalized ?? 0) > 0.5,
        recent_renovation: (dobRenovSig?.normalized ?? 0) > 0.3,
        building_issues: (dobRiskSig?.normalized ?? 0) > 0.3,
        tax_burden: dof ? dof.estimated_annual_tax / Math.max(dof.market_value, 1) > 0.012 : false,
      },
    },
  };

  return NextResponse.json(result);
}

function taxClassLabel(cls: string): string {
  const map: Record<string, string> = {
    "1": "1-3 Family Home",
    "2": "Residential (4+ units / Co-op / Condo)",
    "2a": "Residential — 4-6 units",
    "2b": "Residential — 7-10 units",
    "2c": "Residential — Co-op/Condo (small)",
    "4": "Commercial / Mixed-Use",
  };
  return map[cls.toLowerCase()] ?? `Class ${cls}`;
}

/** Rough mortgage balance estimate based on original amount and age */
function estimateMortgageBalance(originalAmount: number, mortgageDate: string): number | null {
  if (!originalAmount || !mortgageDate) return null;
  const yearsOld = (Date.now() - new Date(mortgageDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (yearsOld <= 0 || yearsOld > 30) return null;
  // Simple amortization estimate: 30yr fixed, ~5% rate
  const monthlyRate = 0.05 / 12;
  const n = 360;
  const elapsed = Math.min(Math.floor(yearsOld * 12), n);
  const remaining = n - elapsed;
  if (remaining <= 0) return 0;
  const balance = originalAmount * (Math.pow(1 + monthlyRate, remaining) - 1) /
    (Math.pow(1 + monthlyRate, n) - 1);
  return Math.round(balance);
}

function computeSimpleScore(
  ownershipNorm?: number | null,
  mortgageNorm?: number | null,
  equityNorm?: number | null,
  riskNorm?: number | null,
): number {
  const vals = [ownershipNorm, mortgageNorm, equityNorm].filter(v => v != null) as number[];
  if (vals.length === 0) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  // Risk slightly boosts score (troubled building = more motivation to sell)
  const riskBonus = (riskNorm ?? 0) * 0.1;
  return Math.min(100, Math.round((avg + riskBonus) * 100));
}
