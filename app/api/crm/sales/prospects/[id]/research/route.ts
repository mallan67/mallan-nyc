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
import type { Prisma } from "@prisma/client";
import { requireAgentOrBroker, isAuthError, logAuditEvent } from "@/lib/auth";
import { assertWriteAllowed } from "@/lib/auth/readonly-guard";
import { safeBigInt } from "@/lib/utils/safe-bigint";
import { serializeBigInts } from "@/lib/api/serialize";
import { soda } from "@/lib/soda";
import { scoreSellerLead } from "@/lib/seller-readiness/scorer";
import { fetchDofTaxData } from "@/lib/seller-readiness/signals/dof-tax";
import { getAccessToken } from "@/lib/idx/auth";
import { sanitizeOData } from "@/lib/sanitize";

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
  // NOTE: last_researched_at is set at the END (Step 6), not here, so that
  // a failed research run doesn't block re-runs for an hour.
  const plutoUpdate: Record<string, unknown> = {};

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

    // Auto-detect property_type from PLUTO building class (only if not already set)
    if (!prospect.property_type && pluto.bldgclass) {
      const cls = pluto.bldgclass.toUpperCase();
      if (cls.startsWith("R")) plutoUpdate.property_type = "Condo";
      else if (cls.startsWith("D")) plutoUpdate.property_type = "Co-op";
      else if (cls.startsWith("A")) plutoUpdate.property_type = "Single Family";
      else if (cls.startsWith("B")) plutoUpdate.property_type = "Multi Family";
      else if (cls.startsWith("C")) plutoUpdate.property_type = "Multi Family";
      else if (cls.startsWith("S")) plutoUpdate.property_type = "Mixed Use";
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

  {
    try {
      const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY;
      const MASTER = process.env.SODA_DATASET_ACRIS_MASTER;

      if (REALPROP && MASTER) {
        let docIdRows: { document_id: string }[] = [];

        // Parse address for ACRIS: street_number + street_name + unit
        // ACRIS format: street_number="400", street_name="EAST 90TH STREET", unit="17C"
        // ACRIS keeps ordinals (90TH) — unlike PLUTO which strips them
        const unit = (prospect.unit || "").trim().toUpperCase().replace(/[;\\{}'"]/g, "");

        // Strategy 1: Address + borough + unit search (most precise)
        // ACRIS format: borough + street_number + street_name + unit
        // Borough from: prospect.borough, BBL, or zip code
        let boro = prospect.borough ? boroughCode(prospect.borough) : (bbl ? bbl[0] : "");
        if (!boro && prospect.postal_code) {
          const z = parseInt(prospect.postal_code);
          if (z >= 10001 && z <= 10282) boro = "1"; // Manhattan
          else if (z >= 10451 && z <= 10475) boro = "2"; // Bronx
          else if (z >= 11201 && z <= 11256) boro = "3"; // Brooklyn
          else if (z >= 10301 && z <= 10314) boro = "5"; // Staten Island
          else if (z >= 11001 && z <= 11697) boro = "4"; // Queens
        }
        const boroFilter = boro ? `borough='${boro}' AND ` : "";

        if (prospect.address) {
          // Normalize: uppercase, strip apt/unit suffix, sanitize
          let addrClean = prospect.address.trim().toUpperCase();
          addrClean = addrClean.replace(/,?\s*(APT|UNIT|SUITE|#)\s*\S*$/i, "");
          addrClean = addrClean.replace(/'/g, "''").replace(/[;\\{}]/g, "");
          const parts = addrClean.split(/\s+/);
          const streetNum = parts[0] || "";
          const streetRaw = parts.slice(1).join(" "); // keeps ordinal (90TH)

          // Also build a version without ordinal (90TH→90)
          const streetNoOrd = streetRaw.replace(/(\d+)\s*(ST|ND|RD|TH)\b/g, "$1");

          // Add ordinal if missing: "90 STREET" → "90TH STREET"
          const streetWithOrd = streetNoOrd.replace(
            /(\d+)(\s+(?:STREET|ST|AVENUE|AVE|PLACE|PL|DRIVE|DR|BOULEVARD|BLVD|ROAD|RD))/g,
            (_m, num, rest) => {
              const n = parseInt(num);
              const suf = n % 10 === 1 && n !== 11 ? "ST" : n % 10 === 2 && n !== 12 ? "ND" : n % 10 === 3 && n !== 13 ? "RD" : "TH";
              return num + suf + rest;
            },
          );

          if (streetNum && streetRaw) {
            // Build street name variants — ACRIS is inconsistent, try multiple
            const seen = new Set<string>();
            const streetVariants: string[] = [];
            for (const base of [streetRaw, streetWithOrd, streetNoOrd]) {
              if (!base || seen.has(base)) continue;
              seen.add(base);
              streetVariants.push(base);
              // Direction abbreviations: EAST↔E, WEST↔W
              const abbr = base.replace(/\bEAST\b/g, "E").replace(/\bWEST\b/g, "W").replace(/\bNORTH\b/g, "N").replace(/\bSOUTH\b/g, "S");
              if (!seen.has(abbr)) { seen.add(abbr); streetVariants.push(abbr); }
              const exp = base.replace(/\bE\b/g, "EAST").replace(/\bW\b/g, "WEST").replace(/\bN\b/g, "NORTH").replace(/\bS\b/g, "SOUTH");
              if (!seen.has(exp)) { seen.add(exp); streetVariants.push(exp); }
            }

            const unitFilter = unit ? ` AND unit='${unit}'` : "";

            // Try each street name variant with borough + street_number + unit
            for (const variant of streetVariants) {
              if (docIdRows?.length) break;
              docIdRows = await soda<{ document_id: string }>({
                resource: REALPROP,
                where: `${boroFilter}street_number='${streetNum}' AND street_name='${variant}'${unitFilter}`,
                select: "document_id",
                order: "document_id DESC",
                limit: 200,
              });
            }

            // Partial street match: "EAST 90%" catches "EAST 90TH STREET" and "EAST 90TH   STREET"
            if (!docIdRows?.length) {
              const streetWords = streetNoOrd.split(/\s+/);
              const likePrefix = streetWords.length >= 2 ? streetWords.slice(0, 2).join(" ") : streetWords[0];
              if (likePrefix && likePrefix.length > 1) {
                docIdRows = await soda<{ document_id: string }>({
                  resource: REALPROP,
                  where: `${boroFilter}street_number='${streetNum}' AND street_name LIKE '${likePrefix}%'${unitFilter}`,
                  select: "document_id",
                  order: "document_id DESC",
                  limit: 200,
                });
              }
            }

            // Fallback: borough + street_number + block + unit
            if (!docIdRows?.length && unit && bbl) {
              const block = bbl.substring(1, 6).replace(/^0+/, "") || "0";
              docIdRows = await soda<{ document_id: string }>({
                resource: REALPROP,
                where: `${boroFilter}street_number='${streetNum}' AND block='${block}' AND unit='${unit}'`,
                select: "document_id",
                order: "document_id DESC",
                limit: 200,
              });
            }

            // Last resort for non-unit properties: address without unit
            if (!docIdRows?.length && !unit) {
              for (const variant of streetVariants) {
                if (docIdRows?.length) break;
                docIdRows = await soda<{ document_id: string }>({
                  resource: REALPROP,
                  where: `${boroFilter}street_number='${streetNum}' AND street_name='${variant}'`,
                  select: "document_id",
                  order: "document_id DESC",
                  limit: 200,
                });
              }
            }
          }
        }

        // Strategy 2: BBL-based search (fallback if address didn't work)
        if (!docIdRows?.length && bbl) {
          const borough = bbl[0];
          const block = bbl.substring(1, 6);
          const lot = bbl.substring(6, 10);
          const blockClean = block.replace(/^0+/, "") || "0";
          const lotClean = lot.replace(/^0+/, "") || "0";
          const lotNum = parseInt(lotClean, 10);

          docIdRows = await soda<{ document_id: string }>({
            resource: REALPROP,
            where: `borough='${borough}' AND block='${blockClean}' AND lot='${lotClean}'`,
            select: "document_id",
            order: "document_id DESC",
            limit: 100,
          });

          // Condo fallback: lot >= 7501 in PLUTO → search lots 1001-1999 in ACRIS
          if (!docIdRows?.length && lotNum >= 7501) {
            docIdRows = await soda<{ document_id: string }>({
              resource: REALPROP,
              where: `borough='${borough}' AND block='${blockClean}' AND lot BETWEEN '1001' AND '1999'`,
              select: "document_id",
              order: "document_id DESC",
              limit: 200,
            });
          }
        }

        const docIds = [...new Set((docIdRows || []).map((r) => r.document_id).filter(Boolean))];

        if (docIds.length > 0) {
          // Get ALL master records with actual amounts
          const masterWhere = `document_id in (${docIds.map((id) => `'${id}'`).join(",")})`;
          const docs = await soda<{
            document_id: string;
            doc_type: string;
            recorded_datetime?: string;
            document_amt?: string;
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
            const amount = parseFloat(doc.document_amt || "0");
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
            const deedAmt = parseFloat(lastDeed.document_amt || "0");
            const deedDate = lastDeed.recorded_datetime;
            if (deedAmt > 0) acrisUpdate.last_purchase_price = deedAmt;
            if (deedDate) {
              acrisUpdate.last_purchase_date = new Date(deedDate);
              const years = (Date.now() - new Date(deedDate).getTime()) / (365.25 * 24 * 3600000);
              acrisUpdate.ownership_years = Math.round(years * 10) / 10;
            }

            // ── Pull deed owner name from ACRIS Parties ──────────────────
            // Party type "2" = grantee (buyer / current owner) on deeds
            const PARTIES_DATASET = "636b-3b5g";
            try {
              const parties = await soda<{ party_type: string; name: string }>({
                resource: PARTIES_DATASET,
                where: `document_id='${lastDeed.document_id}' AND party_type='2'`,
                select: "name",
                limit: 5,
              });
              if (parties?.length) {
                // Use the first grantee name (multiple = co-owners)
                const deedOwner = parties.map((p) => p.name).filter(Boolean).join(", ");
                if (deedOwner) {
                  acrisUpdate.owner_name = deedOwner;

                  // Auto-detect entity type from deed party name
                  const upper = deedOwner.toUpperCase();
                  if (/\bLLC\b|\bL\.L\.C\b/.test(upper)) acrisUpdate.entity_type = "llc";
                  else if (/\bTRUST\b|\bTRSTEE?\b/.test(upper)) acrisUpdate.entity_type = "trust";
                  else if (/\bCORP\b|\bINC\b/.test(upper)) acrisUpdate.entity_type = "corp";
                  else if (/\bLP\b|\bL\.P\b|\bPARTNERSHIP\b/.test(upper)) acrisUpdate.entity_type = "partnership";
                  else if (/\bESTATE\b/.test(upper)) acrisUpdate.entity_type = "estate";

                  // If entity detected, also set entity_name
                  if (acrisUpdate.entity_type && acrisUpdate.entity_type !== "individual") {
                    acrisUpdate.entity_name = deedOwner;
                  }
                }
              }
            } catch (partyErr) {
              console.warn("[prospect-research] ACRIS parties lookup failed:", (partyErr as Error).message);
            }
          }

          if (lastMortgage) {
            const mortAmt = parseFloat(lastMortgage.document_amt || "0");
            const mortDate = lastMortgage.recorded_datetime;
            if (mortAmt > 0) acrisUpdate.mortgage_amount = mortAmt;
            if (mortDate) acrisUpdate.mortgage_date = new Date(mortDate);

            // Calculate LTV if we have both
            if (lastDeed?.document_amt && lastMortgage.document_amt) {
              const purchase = parseFloat(lastDeed.document_amt);
              const mortgage = parseFloat(lastMortgage.document_amt);
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
                metadata: { transactions: allTransactions } as unknown as Prisma.InputJsonValue,
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
  // Co-ops and condops pay maintenance (taxes bundled in) — no individual property tax.
  // Only fetch DOF tax for: condos, townhouses, single family, multi family, commercial condos.
  const taxUpdate: Record<string, unknown> = {};
  const resolvedType = ((plutoUpdate.property_type as string) || prospect.property_type || "").toLowerCase();
  const isMaintenanceOnly = resolvedType === "co-op" || resolvedType === "coop" || resolvedType === "condop";

  if (bbl && !isMaintenanceOnly) {
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
            metadata: { liens: taxLienHistory } as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      console.warn("[prospect-research] Tax lien check failed:", (err as Error).message);
    }
  }

  // ── Step 5c: Auto-populate initial comps from Trestle ──────────────────────
  // Only runs if pitch_data.comps is empty — never overwrites curated comps.
  // Non-blocking: research succeeds even if this step fails.
  const compsPitchUpdate: Record<string, unknown> = {};
  try {
    const existingPitchData = (prospect.pitch_data as Record<string, unknown> | null) ?? {};
    const existingComps = Array.isArray((existingPitchData as Record<string, unknown>).comps)
      ? (existingPitchData as Record<string, unknown>).comps as unknown[]
      : [];

    if (existingComps.length === 0) {
      const TRESTLE_URL = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
      const COMP_SELECT = [
        "ListingId", "UnparsedAddress", "UnitNumber", "ClosePrice", "CloseDate",
        "BedroomsTotal", "BathroomsFull", "LivingArea", "BuildingName", "PropertySubType",
      ].join(",");

      // Resolve building name and beds from enriched data or prospect
      const resolvedBuildingName =
        (prospect.building_name ?? "") as string;
      const resolvedBeds =
        (prospect.beds ?? null) as number | null;
      const resolvedZip =
        (prospect.postal_code ?? "") as string;

      // 18 months ago in OData date format
      const eighteenMonthsAgo = new Date();
      eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
      const cutoffDate = eighteenMonthsAgo.toISOString().split("T")[0];

      const trestleToken = await getAccessToken();

      interface TrestleCompRecord {
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
      }

      let compRecords: TrestleCompRecord[] = [];

      // Query 1: Same building (if building name is known)
      if (resolvedBuildingName) {
        const safeBuildingName = sanitizeOData(resolvedBuildingName);
        const buildingFilter =
          `BuildingName eq '${safeBuildingName}'` +
          ` and StandardStatus eq 'Closed'` +
          ` and CloseDate ge ${cutoffDate}`;
        const buildingParams = new URLSearchParams({
          $filter: buildingFilter,
          $select: COMP_SELECT,
          $top: "10",
          $orderby: "CloseDate desc",
        });
        const buildingRes = await fetch(
          `${TRESTLE_URL}/odata/Property?${buildingParams}`,
          {
            headers: { Authorization: `Bearer ${trestleToken}`, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (buildingRes.ok) {
          const buildingData = await buildingRes.json();
          compRecords = buildingData.value || [];
        }
      }

      // Query 2: Same zip ± 1BR fallback (if < 3 building results)
      if (compRecords.length < 3 && resolvedZip) {
        const safeZip = sanitizeOData(resolvedZip);
        let zipFilter =
          `PostalCode eq '${safeZip}'` +
          ` and StandardStatus eq 'Closed'` +
          ` and CloseDate ge ${cutoffDate}`;
        if (resolvedBeds !== null) {
          const bedsMin = Math.max(0, resolvedBeds - 1);
          const bedsMax = resolvedBeds + 1;
          zipFilter += ` and BedroomsTotal ge ${bedsMin} and BedroomsTotal le ${bedsMax}`;
        }
        const zipParams = new URLSearchParams({
          $filter: zipFilter,
          $select: COMP_SELECT,
          $top: "10",
          $orderby: "CloseDate desc",
        });
        const zipRes = await fetch(
          `${TRESTLE_URL}/odata/Property?${zipParams}`,
          {
            headers: { Authorization: `Bearer ${trestleToken}`, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (zipRes.ok) {
          const zipData = await zipRes.json();
          const zipRecords: TrestleCompRecord[] = zipData.value || [];
          // Merge, deduplicate by ListingId
          const seen = new Set(compRecords.map((r) => r.ListingId).filter(Boolean));
          for (const r of zipRecords) {
            if (r.ListingId && !seen.has(r.ListingId)) {
              seen.add(r.ListingId);
              compRecords.push(r);
            }
          }
        }
      }

      // Map to comp objects and take top 8
      if (compRecords.length > 0) {
        const newComps = compRecords.slice(0, 8).map((r) => ({
          mls_id: r.ListingId ?? "",
          address: r.UnparsedAddress ?? "",
          unit: r.UnitNumber ?? null,
          close_price: r.ClosePrice ?? null,
          close_date: r.CloseDate ?? null,
          beds: r.BedroomsTotal ?? null,
          baths: r.BathroomsFull ?? null,
          sqft: r.LivingArea ?? null,
          building_name: r.BuildingName ?? null,
          property_type: r.PropertySubType ?? null,
          added_at: new Date().toISOString(),
        }));

        compsPitchUpdate.pitch_data = {
          ...existingPitchData,
          comps: newComps,
        };

        console.log(
          `[prospect-research] Auto-populated ${newComps.length} initial comps for prospect ${prospectId}`,
        );
      }
    }
  } catch (err) {
    console.warn("[prospect-research] Auto-comp fetch failed (non-blocking):", (err as Error).message);
  }

  // ── Step 6: Apply all enrichment updates + mark research timestamp ─────────
  const enrichmentData = {
    ...acrisUpdate,
    ...taxUpdate,
    ...compsPitchUpdate,
    last_researched_at: new Date(), // Set LAST so failed runs don't block retries
  };
  await prisma.sellerLead.update({
    where: { id: prospectId },
    data: enrichmentData,
  });

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
