/**
 * GET  /api/crm/sales/prospects/[id]/comps?q=...&transaction=sale|rental
 *   - With q param: search Trestle for CLOSED comparables of ONE transaction (by ListingId or address)
 *   - Without q param: return saved comps from pitch_data
 *
 * POST /api/crm/sales/prospects/[id]/comps
 *   - Save curated comp list (with optional per-comp overrides) to pitch_data
 *
 * TRANSACTION + STATUS (Maya, 2026-09-08 / 2026-09-09 - one comp authority across the three CMA paths):
 *   - the transaction comes from the REQUEST (`?transaction=`, default sale) and is refused when it is neither
 *     sale nor rental. It selects the live PropertyType filter: Residential for a sale, ResidentialLease for a
 *     rental. WITHOUT it the ListingId branch had no status filter and NEITHER branch filtered PropertyType, so
 *     closed rentals were served as closed sale comps;
 *   - both branches query `StandardStatus eq 'Closed'` and select StandardStatus + PropertyType, so the
 *     provider status is a fact on the row rather than an assumption;
 *   - a returned comp keeps the EXACT live token in `status` and carries the broker LABEL for its transaction
 *     in `status_label` (a sale Closed reads "Sold", a rental Closed reads "Rented");
 *   - a closed row without a CloseDate is dropped: nothing else may date a closing;
 *   - POST refuses a comp that is not a dated, priced Closed comp of the resolved transaction.
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
import { safeJson } from "@/lib/api/safe-json";
import { lifecycleFromProviderRow } from "@/lib/listings/canonical-lifecycle";
import { compStatusLabel, compTransactionOf, type CompTransaction } from "@/lib/comps/status-criteria";

type RouteParams = { params: Promise<{ id: string }> };

/** The live PropertyType each transaction queries (canonical-lifecycle: Residential = sale, *Lease = rental). */
const TRANSACTION_PROPERTY_TYPE: Readonly<Record<CompTransaction, string>> = Object.freeze({
  sale: "Residential",
  rental: "ResidentialLease",
});

/** The only status a saved / searched comparable may carry: the provider closing. */
const CLOSED_TOKEN = "Closed" as const;

/** An ISO day (YYYY-MM-DD), the shape the provider delivers CloseDate in. */
function isoDay(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) ? d : null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRESTLE_URL =
  process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";

const COMP_SELECT = [
  "ListingId",
  "UnparsedAddress",
  "UnitNumber",
  // the provider status and transaction facts — selected, never assumed
  "StandardStatus",
  "PropertyType",
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
  CloseDate?: string | null;
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
  /** The exact live StandardStatus token — always the provider closing on a comparable. */
  status: string;
  /** Broker language for that token on THIS transaction (Sold on a sale, Rented on a rental). */
  status_label: string;
  transaction: CompTransaction;
  close_price: number | null;
  close_date: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  building_name: string | null;
  /** The live PropertyType (the transaction fact), not the sub-type. */
  property_type: string | null;
  property_sub_type: string | null;
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

async function searchTrestle(filter: string, transaction: CompTransaction): Promise<MappedComp[]> {
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
    const wantType = TRANSACTION_PROPERTY_TYPE[transaction];

    // Defense in depth behind the provider clause: a comparable is a CLOSED row of THIS transaction with a
    // real CloseDate. A row the provider returned in another status, of another PropertyType, or without a
    // closing date is not a comparable and is dropped — nothing else may date or type a closing.
    const out: MappedComp[] = [];
    for (const s of items) {
      // The provider row is interpreted ONLY through the canonical lifecycle (lib/listings/canonical-lifecycle.ts
      // — the one Cotality interpretation boundary). Reading `s.StandardStatus` / `s.PropertyType` here directly
      // would be a raw Cotality read outside that boundary, which the ratchet in
      // tests/runtime/cotality-boundary.test.ts refuses. The lifecycle already carries the closing stage, the
      // transaction and the dated closing, so nothing is lost by going through it.
      const lc = lifecycleFromProviderRow(s as never);
      if (!lc || lc.providerStage !== "closed") continue;
      if (lc.transactionType !== transaction) continue;
      const closeDate = lc.closedDate;
      if (!closeDate) continue;
      out.push({
        mls_id: s.ListingId ?? "",
        address: s.UnparsedAddress ?? "",
        unit: s.UnitNumber ?? null,
        status: CLOSED_TOKEN,
        status_label: compStatusLabel(CLOSED_TOKEN, transaction),
        transaction,
        close_price: lc.closePrice,
        close_date: closeDate,
        beds: s.BedroomsTotal ?? null,
        baths: s.BathroomsFull ?? null,
        sqft: s.LivingArea ?? null,
        building_name: s.BuildingName ?? null,
        property_type: wantType,
        property_sub_type: s.PropertySubType ?? null,
      });
    }
    return out;
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

  // The transaction is a REQUEST fact, resolved before any provider call. Unknown -> 400 naming the value;
  // a comp set is never assembled on a guessed transaction (sale and rental never mix).
  const requestedTransaction = req.nextUrl.searchParams.get("transaction");
  const transaction = requestedTransaction ? compTransactionOf(requestedTransaction.trim()) : "sale";
  if (!transaction) {
    return NextResponse.json(
      { error: `Unknown transaction: ${requestedTransaction} — comps are sale or rental`, code: "COMP_TRANSACTION_UNKNOWN", value: requestedTransaction },
      { status: 400 },
    );
  }
  const propertyType = TRANSACTION_PROPERTY_TYPE[transaction];

  // ── Search mode: q param present ──────────────────────────────────────────
  if (q) {
    let filter: string;

    if (q.toUpperCase().startsWith("RLS") || /^[A-Z0-9]{8,}$/i.test(q)) {
      // Treat as ListingId — still constrained to a CLOSED row of THIS transaction: an MLS id is not a
      // licence to return an active listing, or a lease as a sale comparable.
      const safeId = sanitizeOData(q);
      filter =
        `ListingId eq '${safeId}'` +
        ` and PropertyType eq '${propertyType}'` +
        ` and StandardStatus eq '${CLOSED_TOKEN}'`;
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
        ` and PropertyType eq '${propertyType}'` +
        ` and StandardStatus eq '${CLOSED_TOKEN}'`;
    }

    const results = await searchTrestle(filter, transaction);
    return NextResponse.json({ transaction, results });
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
      transaction,
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

  const [body, _parseErr] = await safeJson(req);
  if (_parseErr) return _parseErr;
  const { comps, overrides } = body as {
    comps?: unknown[];
    overrides?: Record<string, unknown>;
    transaction?: unknown;
  };

  // Validate comps array
  if (!Array.isArray(comps)) {
    return NextResponse.json(
      { error: "comps must be an array" },
      { status: 400 },
    );
  }

  // ── The transaction of the saved set ────────────────────────────────────────────────────────────────────
  // Taken from the request (`?transaction=`, else the body) and refused when it is neither sale nor rental.
  // When the request states none, the comps themselves must agree on ONE transaction — a set that mixes a sale
  // and a rental, or declares none at all, is never persisted (Maya: sale and rental never mix).
  const requestedRaw = req.nextUrl?.searchParams?.get("transaction") ?? (typeof body?.transaction === "string" ? (body.transaction as string) : null);
  let transaction: CompTransaction | null = null;
  if (requestedRaw != null) {
    transaction = compTransactionOf(String(requestedRaw).trim());
    if (!transaction) {
      return NextResponse.json(
        { error: `Unknown transaction: ${requestedRaw} — comps are sale or rental`, code: "COMP_TRANSACTION_UNKNOWN", value: requestedRaw },
        { status: 400 },
      );
    }
  }

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i] as Record<string, unknown>;
    if (typeof comp.mls_id !== "string" || !comp.mls_id) {
      return NextResponse.json(
        { error: `comps[${i}].mls_id must be a non-empty string` },
        { status: 400 },
      );
    }
    // The status is the EXACT live closing token. A missing status, an on-market status, or a legacy Mallan
    // spelling ('Sold' / 'Rented' / 'Leased') is refused by name — a comparable is a proven closing.
    if (comp.status !== CLOSED_TOKEN) {
      return NextResponse.json(
        { error: `comps[${i}].status must be the live Closed token, got ${JSON.stringify(comp.status ?? null)}`, code: "COMP_STATUS_INVALID", value: comp.status ?? null },
        { status: 400 },
      );
    }
    const compTransaction = comp.transaction === undefined || comp.transaction === null ? null : compTransactionOf(String(comp.transaction).trim());
    if (comp.transaction !== undefined && comp.transaction !== null && !compTransaction) {
      return NextResponse.json(
        { error: `comps[${i}].transaction must be sale or rental, got ${JSON.stringify(comp.transaction)}`, code: "COMP_TRANSACTION_UNKNOWN", value: comp.transaction },
        { status: 400 },
      );
    }
    if (compTransaction) {
      if (transaction && compTransaction !== transaction) {
        return NextResponse.json(
          { error: `comps[${i}].transaction ${compTransaction} does not match the requested transaction ${transaction}`, code: "COMP_TRANSACTION_MISMATCH", value: comp.transaction },
          { status: 400 },
        );
      }
      transaction = transaction ?? compTransaction;
    }
    // A closing is dated by its own CloseDate and by nothing else.
    if (!isoDay(comp.close_date)) {
      return NextResponse.json(
        { error: `comps[${i}].close_date must be the closing day (YYYY-MM-DD), got ${JSON.stringify(comp.close_date ?? null)}`, code: "COMP_CLOSE_DATE_INVALID", value: comp.close_date ?? null },
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

  if (comps.length > 0 && !transaction) {
    return NextResponse.json(
      { error: "transaction is required — a saved comp set is one transaction (sale or rental)", code: "COMP_TRANSACTION_UNKNOWN" },
      { status: 400 },
    );
  }

  // Stamp the resolved transaction + its broker label so every later reader renders the right word.
  const stamped = comps.map((c) => {
    const comp = c as Record<string, unknown>;
    return {
      ...comp,
      status: CLOSED_TOKEN,
      transaction: transaction as CompTransaction,
      status_label: compStatusLabel(CLOSED_TOKEN, transaction as CompTransaction),
      close_date: isoDay(comp.close_date),
    } as SavedComp;
  });

  // Merge with existing pitch_data (preserve other keys)
  const existing = (prospect.pitch_data as PitchData) ?? {};
  const updated: PitchData = {
    ...existing,
    comps: stamped,
    ...(transaction ? { comps_transaction: transaction } : {}),
    ...(overrides !== undefined ? { overrides } : {}),
  };

  await prisma.sellerLead.update({
    where: { id: prospectId },
    data: { pitch_data: JSON.parse(JSON.stringify(updated)) },
  });

  return NextResponse.json(
    serializeBigInts({
      transaction,
      comps: updated.comps ?? [],
      overrides: updated.overrides ?? {},
    }),
  );
}
