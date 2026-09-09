/**
 * COMP STATUS CRITERIA — the ONE vocabulary an agent-selected comparable filter may speak.
 *
 * Owner rulings (Maya, 2026-09-08 / 2026-09-09) applied to every CMA / comparable path:
 *   - the stored / queried status IS the live Cotality StandardStatus token (Active, ActiveUnderContract,
 *     Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn);
 *   - broker language is a LABEL applied PER TRANSACTION — a sale's Closed reads "Sold", a rental's Closed
 *     reads "Rented", a sale's Pending reads "In Contract". A label is never a stored or queried value and the
 *     two transactions never share one list: "Sold" is meaningless on a rental and "Rented" on a sale;
 *   - a criterion that is neither a live token nor THIS transaction's canonical label is REFUSED with the
 *     offending value (fail-closed) and never reaches an OData filter. Legacy spellings ('Cancelled', 'Leased'),
 *     old display names ('Under Contract') and CRM workflow words ('LeaseSigned', 'OfferOut') are all refused:
 *     they are read-compatibility for STORED rows, never a query vocabulary.
 *
 * This module imports NOTHING from the canonical Search package — it is a vocabulary translator for the comps
 * surface (the transaction status mappings plus the stored-status domain), not a second reader of Search.
 *
 * @module lib/comps/status-criteria
 */
import { MALLAN_STORAGE_STATUSES } from '@/lib/listings/mallan-status';
import { SALE_STATUS_MAPPING, RENTAL_STATUS_MAPPING, type TransactionStatusMapping } from '@/lib/crm/status-mapping';
import { statusDisplayLabelFor } from '@/lib/compliance/status';

/** The comps surface says 'sale' | 'rental' (the provider's PropertyType axis), never 'rent'. */
export type CompTransaction = 'sale' | 'rental';
export const COMP_TRANSACTIONS: readonly CompTransaction[] = Object.freeze(['sale', 'rental']);

/** A live StandardStatus token, exact. */
const LIVE_TOKENS: ReadonlySet<string> = new Set<string>(MALLAN_STORAGE_STATUSES);

/** 'sale' | 'rental' from anything a caller may hold (`listing_type` says 'rent'); null when unknown. */
export function compTransactionOf(v: unknown): CompTransaction | null {
  if (v === 'sale') return 'sale';
  if (v === 'rent' || v === 'rental') return 'rental';
  return null;
}

function mappingFor(t: CompTransaction): TransactionStatusMapping {
  return t === 'sale' ? SALE_STATUS_MAPPING : RENTAL_STATUS_MAPPING;
}

/** The listing_type this transaction stores (the label helpers speak that vocabulary). */
function listingTypeOf(t: CompTransaction): 'sale' | 'rent' {
  return t === 'sale' ? 'sale' : 'rent';
}

/**
 * An agent-selected comp criterion → the live StandardStatus token to query, resolved through THIS
 * transaction's mapping only. Exact live token, or exactly this transaction's canonical label. Anything else —
 * the other transaction's label, a legacy spelling, a workflow word, a case variant, a blank, a non-string —
 * is null (refuse; never guess).
 */
export function resolveCompStatusCriterion(v: unknown, transaction: CompTransaction): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (LIVE_TOKENS.has(s)) return s;
  const labels = mappingFor(transaction).canonicalLabels;
  for (const token of Object.keys(labels)) {
    if (labels[token] === s) return token;
  }
  return null;
}

/**
 * Broker language for a live token on THIS transaction: Closed → "Sold" (sale) / "Rented" (rental),
 * Pending → "In Contract" (sale) / "Pending" (rental). A token this transaction's mapping does not carry
 * falls back to the neutral canonical label, then to the token itself. Never a shared list.
 */
export function compStatusLabel(token: unknown, transaction: CompTransaction): string {
  if (typeof token !== 'string' || !token.trim()) return '';
  const t = token.trim();
  const label = mappingFor(transaction).canonicalLabels[t];
  if (label) return label;
  return statusDisplayLabelFor(t, listingTypeOf(transaction)) || t;
}

/** Thrown when a criterion is not this transaction's vocabulary — carries the offending value fail-closed. */
export class CompCriteriaError extends Error {
  readonly code = 'COMP_STATUS_CRITERION_INVALID' as const;
  readonly value: unknown;
  readonly scope: string;
  readonly transaction: CompTransaction;
  constructor(value: unknown, scope: string, transaction: CompTransaction) {
    super(`Unrecognized ${transaction} comp status criterion: ${JSON.stringify(value)} (${scope})`);
    this.name = 'CompCriteriaError';
    this.value = value;
    this.scope = scope;
    this.transaction = transaction;
  }
}

export function isCompCriteriaError(e: unknown): e is CompCriteriaError {
  return e instanceof CompCriteriaError;
}

/** Resolve a list of criteria to live tokens, throwing on the first offender (naming the scope). */
export function resolveCompStatusCriteria(values: readonly unknown[], scope: string, transaction: CompTransaction): string[] {
  const out: string[] = [];
  for (const v of values) {
    const token = resolveCompStatusCriterion(v, transaction);
    if (!token) throw new CompCriteriaError(v, scope, transaction);
    out.push(token);
  }
  return out;
}

/**
 * Validate a whole CompCriteria object against a transaction: returns a COPY whose `statuses` are live tokens.
 * Throws CompCriteriaError (with `.value` and `.scope`) on the first criterion that is not this transaction's.
 */
export function validateCompCriteria<T>(criteria: T, transaction: CompTransaction): T {
  if (!criteria || typeof criteria !== 'object') throw new CompCriteriaError(criteria, 'criteria', transaction);
  const source = criteria as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };
  for (const scope of ['building', 'area'] as const) {
    const range = source[scope];
    if (!range || typeof range !== 'object') throw new CompCriteriaError(range ?? null, scope, transaction);
    const bucket = range as Record<string, unknown>;
    const raw = Array.isArray(bucket.statuses) ? (bucket.statuses as unknown[]) : [];
    next[scope] = { ...bucket, statuses: resolveCompStatusCriteria(raw, scope, transaction) };
  }
  return next as unknown as T;
}
