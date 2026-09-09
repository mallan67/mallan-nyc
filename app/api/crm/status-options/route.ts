// GET /api/crm/status-options?type=sale|rental
//
// The ONE server projection of a transaction's status mapping (lib/crm/status-mapping.ts). Every CRM UI that
// offers a status choice — the manage-listings status panels, the quick-status modal, the filter pills — builds
// itself from this payload instead of carrying its own map.
//
// Owner rulings (Maya, 2026-09-08 / 2026-09-09):
//   - a sale is resolved through the SALE mapping and a rental through the RENTAL mapping; there is never one
//     shared list, and the transaction must be named explicitly (no default mapping);
//   - the canonical status is a live Cotality StandardStatus token; broker language ("Sold", "Rented",
//     "In Contract") is a LABEL applied per transaction, never a stored token;
//   - a workflow word resolves to its token PLUS the Cotality fact(s) the transition must carry. A rental's
//     Pending carries the Mallan lease-signed fact — PurchaseContractDate is NEVER collected on a rental UI, so
//     it is not even named in a rental payload;
//   - workflow words are never called MlsStatus. This payload contains no provider status-field name at all.
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import {
  MALLAN_LEASE_SIGNED_DATE_KEY,
  STATUS_FACT_FIELDS,
  statusMappingFor,
  requiredFactsFor,
  transactionTypeOf,
  type TransactionStatusMapping,
} from "@/lib/crm/status-mapping";

export const dynamic = "force-dynamic";

/** Agent-facing names for the Cotality date / price facts a status transition carries. */
const FACT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  PurchaseContractDate: "Contract Signed Date",
  CloseDate: "Close Date",
  ClosePrice: "Close Price",
  ExpirationDate: "Expiration Date",
  WithdrawnDate: "Withdrawn Date",
  CancellationDate: "Cancellation Date",
  BackOnMarketDate: "Back On Market Date",
  OffMarketDate: "Off Market Date",
  ActivationDate: "Activation Date",
  [MALLAN_LEASE_SIGNED_DATE_KEY]: "Lease Signed Date (Mallan workflow fact)",
});

/** The facts a transaction's UI may collect. A rental never collects PurchaseContractDate. */
function factLabelsFor(mapping: TransactionStatusMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of STATUS_FACT_FIELDS) {
    if (mapping.transaction === "rent" && field === "PurchaseContractDate") continue;
    const label = FACT_LABELS[field];
    if (label) out[field] = label;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const raw = new URL(req.url).searchParams.get("type");
  const transaction = transactionTypeOf(raw);
  const mapping = transaction ? statusMappingFor(transaction) : null;
  if (!mapping) {
    // Fail closed: no transaction, no mapping. Never fall back to a default (a sale must never be offered a
    // rental word and vice versa).
    return NextResponse.json(
      { error: "A transaction is required: type=sale or type=rental" },
      { status: 400 },
    );
  }

  const workflow = mapping.workflowStatuses.map((word) => {
    const canonical = mapping.workflowToCanonical[word];
    return {
      word,
      label: mapping.displayLabels[word] ?? word,
      canonical,
      canonicalLabel: mapping.canonicalLabels[canonical] ?? canonical,
      requiredFacts: [...(requiredFactsFor(word, mapping.transaction) ?? [])],
    };
  });

  const canonical = mapping.canonicalStatuses.map((token) => ({
    token,
    label: mapping.canonicalLabels[token] ?? token,
    facts: [...(mapping.statusFacts[token] ?? [])],
  }));

  return NextResponse.json({
    transaction: mapping.transaction,
    formKey: mapping.formKey,
    workflow,
    canonical,
    factLabels: factLabelsFor(mapping),
  });
}
