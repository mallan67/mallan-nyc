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
const TAX_LIEN_SALE = "gy4f-u74s"; // NYC DOF Tax Lien Sale List

// Borough name/code mapping (bidirectional)
const BOROUGH_CODES: Record<string, string> = {
  manhattan: "1", bronx: "2", brooklyn: "3", queens: "4", "staten island": "5",
  mn: "1", bx: "2", bk: "3", qn: "4", si: "5",
};

// NYC neighborhood abbreviation mapping (used in search/display, not PLUTO)
export const NEIGHBORHOOD_ABBREV: Record<string, string> = {
  ues: "Upper East Side", uws: "Upper West Side", les: "Lower East Side",
  fidi: "Financial District", soho: "SoHo", noho: "NoHo", nolita: "Nolita",
  tribeca: "TriBeCa", dumbo: "DUMBO", bk: "Brooklyn", bx: "Bronx",
  lic: "Long Island City", fh: "Forest Hills", eh: "East Harlem",
  wh: "West Harlem", ch: "Clinton Hill", ph: "Prospect Heights",
  cp: "Crown Heights", ws: "Williamsburg", gp: "Gramercy Park",
  ev: "East Village", wv: "West Village", gv: "Greenwich Village",
  hk: "Hell's Kitchen", ms: "Murray Hill", ki: "Kips Bay",
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

/** Normalize NYC address to PLUTO format: "400 East 90th Street" → "400 EAST 90 STREET" */
function normalizePlutoAddress(addr: string): string {
  let s = addr.trim().toUpperCase();
  // Strip apartment/unit suffixes
  s = s.replace(/,?\s*(APT|UNIT|SUITE|#)\s*\S*$/i, "");
  // "90TH" → "90", "1ST" → "1", "2ND" → "2", "3RD" → "3"
  s = s.replace(/(\d+)\s*(ST|ND|RD|TH)\b/g, "$1");
  // Sanitize for SoQL
  s = s.replace(/'/g, "''").replace(/[;\\{}]/g, "");
  return s;
}

/** Try multiple address formats for PLUTO lookup */
function plutoAddressVariants(addr: string): string[] {
  const base = normalizePlutoAddress(addr);
  const variants = [base];

  // Try abbreviated: EAST→E, WEST→W, NORTH→N, SOUTH→S
  const abbrev = base
    .replace(/\bEAST\b/g, "E")
    .replace(/\bWEST\b/g, "W")
    .replace(/\bNORTH\b/g, "N")
    .replace(/\bSOUTH\b/g, "S");
  if (abbrev !== base) variants.push(abbrev);

  // Try expanded: E→EAST, W→WEST, N→NORTH, S→SOUTH (works both ways)
  const expanded = base
    .replace(/\bE\b/g, "EAST")
    .replace(/\bW\b/g, "WEST")
    .replace(/\bN\b/g, "NORTH")
    .replace(/\bS\b/g, "SOUTH");
  if (expanded !== base && expanded !== abbrev) variants.push(expanded);

  // Try with LIKE for partial match (number + first word)
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
    variants.push(`${parts[0]} ${parts[1]}%`);
  }

  return variants;
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
      // Resolve BBL from address + borough — try multiple address formats
      const variants = plutoAddressVariants(prospect.address);
      const boro = boroughCode(prospect.borough);

      for (const variant of variants) {
        const useLike = variant.includes("%");
        const where = useLike
          ? `address LIKE '${variant}' AND borocode='${boro}'`
          : `address='${variant}' AND borocode='${boro}'`;
        const rows = await soda<PlutoRow>({
          resource: PLUTO,
          where,
          limit: 1,
        });
        if (rows?.[0]) {
          pluto = rows[0];
          if (pluto.bbl) bbl = normBbl(pluto.bbl);
          break;
        }
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

  // ── Step 4: Pull ACTUAL ACRIS transaction data (real amounts) ───────────────
  const acrisUpdate: Record<string, unknown> = {};
  interface AcrisTransaction {
    doc_type: string;
    amount: number;
    date: string;
    document_id: string;
  }
  const allTransactions: AcrisTransaction[] = [];

  if (bbl) {
    try {
      const borough = bbl[0];
      const block = bbl.substring(1, 6);
      const lot = bbl.substring(6, 10);

      const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY;
      const MASTER = process.env.SODA_DATASET_ACRIS_MASTER;

      if (REALPROP && MASTER) {
        // Get all document IDs for this property
        const docIdRows = await soda<{ document_id: string }>({
          resource: REALPROP,
          where: `borough='${borough}' AND block='${block}' AND lot='${lot}'`,
          select: "document_id",
          order: "document_id DESC",
          limit: 100,
        });

        const docIds = (docIdRows || []).map((r) => r.document_id).filter(Boolean);

        if (docIds.length > 0) {
          // Get ALL master records with actual amounts
          const masterWhere = `document_id in (${docIds.map((id) => `'${id}'`).join(",")})`;
          const docs = await soda<{
            document_id: string;
            doc_type: string;
            recorded_datetime?: string;
            doc_amount?: string;
            good_through_date?: string;
          }>({
            resource: MASTER,
            where: masterWhere,
            order: "recorded_datetime DESC",
            limit: docIds.length,
          });

          // Process each document — store all with real dollar amounts
          const deedTypes = ["DEED", "DEEDO"];
          const mortgageTypes = ["MTGE", "MORTGAGE"];
          const assignTypes = ["AGMT", "ASST"];
          const satisfyTypes = ["SAT", "SATI"]; // Satisfaction of mortgage = paid off

          let lastDeed: typeof docs[0] | null = null;
          let lastMortgage: typeof docs[0] | null = null;

          for (const doc of docs) {
            const type = (doc.doc_type || "").toUpperCase();
            const amount = parseFloat(doc.doc_amount || "0");
            const date = doc.recorded_datetime || "";

            if (amount > 0 && date) {
              allTransactions.push({
                doc_type: type,
                amount,
                date,
                document_id: doc.document_id,
              });
            }

            // Most recent deed = purchase
            if (!lastDeed && deedTypes.some((dt) => type.includes(dt))) {
              lastDeed = doc;
            }
            // Most recent mortgage
            if (!lastMortgage && mortgageTypes.some((mt) => type.includes(mt))) {
              lastMortgage = doc;
            }
          }

          // Enrich SellerLead with actual amounts
          if (lastDeed) {
            const deedAmt = parseFloat(lastDeed.doc_amount || "0");
            const deedDate = lastDeed.recorded_datetime;
            if (deedAmt > 0) acrisUpdate.last_purchase_price = deedAmt;
            if (deedDate) {
              acrisUpdate.last_purchase_date = new Date(deedDate);
              const years = (Date.now() - new Date(deedDate).getTime()) / (365.25 * 24 * 3600000);
              acrisUpdate.ownership_years = Math.round(years * 10) / 10;
            }
          }

          if (lastMortgage) {
            const mortAmt = parseFloat(lastMortgage.doc_amount || "0");
            const mortDate = lastMortgage.recorded_datetime;
            if (mortAmt > 0) acrisUpdate.mortgage_amount = mortAmt;
            if (mortDate) acrisUpdate.mortgage_date = new Date(mortDate);

            // Calculate LTV if we have both
            if (lastDeed?.doc_amount && lastMortgage.doc_amount) {
              const purchase = parseFloat(lastDeed.doc_amount);
              const mortgage = parseFloat(lastMortgage.doc_amount);
              if (purchase > 0 && mortgage > 0) {
                acrisUpdate.equity_ratio = Math.max(0, Math.min(0.99, mortgage / purchase));
              }
            }
          }

          // Store all transactions as a signal so the UI can show the full history
          if (allTransactions.length > 0) {
            // Delete old acris_transactions signal if exists
            await prisma.readinessSignal.deleteMany({
              where: { seller_lead_id: prospectId, signal_type: "acris_transactions" },
            });
            await prisma.readinessSignal.create({
              data: {
                seller_lead_id: prospectId,
                signal_type: "acris_transactions",
                raw_value: `${allTransactions.length} recorded documents`,
                normalized: 0,
                source: "acris",
                metadata: { transactions: allTransactions } as Record<string, unknown>,
              },
            });
          }
        }
      }
    } catch (err) {
      console.warn("[prospect-research] Direct ACRIS pull failed:", (err as Error).message);
      // Fall back to scoring signals
      if (scoreResult?.signals) {
        const ownershipSig = scoreResult.signals.find((s) => s.signal_type === "ownership_duration");
        const mortgageSig = scoreResult.signals.find((s) => s.signal_type === "mortgage_age");
        const equitySig = scoreResult.signals.find((s) => s.signal_type === "equity_estimate");
        if (ownershipSig?.metadata) {
          const meta = ownershipSig.metadata as Record<string, unknown>;
          if (meta.deed_date) acrisUpdate.last_purchase_date = new Date(meta.deed_date as string);
        }
        if (mortgageSig?.metadata) {
          const meta = mortgageSig.metadata as Record<string, unknown>;
          if (meta.amount) acrisUpdate.mortgage_amount = parseFloat(String(meta.amount));
        }
        if (equitySig?.metadata) {
          const meta = equitySig.metadata as Record<string, unknown>;
          if (meta.purchase_price) acrisUpdate.last_purchase_price = parseFloat(String(meta.purchase_price));
        }
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

  // ── Step 5b: Check Tax Lien Sale history ───────────────────────────────────
  let taxLienHistory: { year: string; lien_type: string; amount: string }[] = [];
  if (bbl) {
    try {
      // Query tax lien sale list by BBL
      const borough = bbl.charAt(0);
      const block = bbl.substring(1, 6);
      const lot = bbl.substring(6);
      const lienRows = await soda<Record<string, string>>({
        resource: TAX_LIEN_SALE,
        where: `borough='${borough}' AND block='${block.replace(/^0+/, "")}' AND lot='${lot.replace(/^0+/, "")}'`,
        limit: 10,
        order: "year DESC",
      });
      if (lienRows && lienRows.length > 0) {
        taxLienHistory = lienRows.map((r) => ({
          year: r.year || r.cycle || "Unknown",
          lien_type: r.lien_type || r.type || "Tax Lien",
          amount: r.amount || r.total || "Unknown",
        }));
        // Store as a signal for display
        await prisma.readinessSignal.create({
          data: {
            seller_lead_id: prospectId,
            signal_type: "tax_lien_history",
            raw_value: `${taxLienHistory.length} lien sale record(s)`,
            normalized: Math.min(taxLienHistory.length * 0.3, 1.0), // Higher = more liens = more motivated seller
            source: "dof",
            metadata: { liens: taxLienHistory } as Record<string, unknown>,
          },
        });
      }
    } catch (err) {
      console.warn("[prospect-research] Tax lien check failed:", (err as Error).message);
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
