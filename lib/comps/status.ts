/**
 * The statuses a comp search may ask Cotality for.
 *
 * lib/comps/fetch-comps.ts kept its own table from the CRM's display names to status strings, and passed any other
 * string straight into the OData $filter, unescaped. lib/compliance/status.ts says it is the only place that knows
 * status strings; the table duplicated it, and a criteria value an agent can edit (the PATCH route checked only that
 * `building` and `area` exist) became part of the query text. This module turns a criteria value into a canonical
 * status through that module, allows only the statuses a comp search asks for, and refuses everything else.
 *
 * The comps are read from Cotality, not from the database, so a status must also be a member of live Cotality's
 * StandardStatus (data/cotality-enums.live.json; tests/runtime/comps-status.test.ts checks every allowed value against
 * it). The canonical module's database spellings are not all live members: it stores "Cancelled" where Cotality has
 * "Canceled", and "Sold", "Leased" and "Rented" are not StandardStatus members at all, so they are not allowed here.
 */
import { Status, normalizeStatus, statusDisplayLabel, type StatusValue } from '@/lib/compliance/status';

export const COMP_STATUSES: readonly StatusValue[] = Object.freeze([
  Status.ACTIVE,
  Status.ACTIVE_UNDER_CONTRACT,
  Status.COMING_SOON,
  Status.PENDING,
  Status.CLOSED,
  Status.EXPIRED,
]);

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value.slice(0, 40)) : value === null ? 'null' : typeof value;
}

export class UnsupportedCompStatusError extends Error {
  readonly name = 'UnsupportedCompStatusError';
  constructor(public readonly value: unknown) {
    super(
      `Unsupported comp status: ${describe(value)}. Supported: ${COMP_STATUSES.map((s) => statusDisplayLabel(s)).join(', ')}.`,
    );
  }
}

// The CRM shows display labels ("Under Contract"). normalizeStatus accepts the canonical and the RESO spellings but not
// the label the same module produces for them, so the label is turned back through the module's own label function.
const FROM_LABEL = new Map<string, StatusValue>(
  Object.values(Status).map((value): [string, StatusValue] => [statusDisplayLabel(value), value]),
);

/** One status of a comp search, as the CRM or the stored criteria spell it, as its canonical value; throws when a comp search does not ask for it. */
export function compStatusValue(input: unknown): StatusValue {
  const text = typeof input === 'string' ? input.trim() : '';
  const canonical = normalizeStatus(text) ?? FROM_LABEL.get(text) ?? null;
  if (canonical === null || !COMP_STATUSES.includes(canonical)) throw new UnsupportedCompStatusError(input);
  return canonical;
}

/** The statuses of a comp search, each canonical, in order, without repeats. An empty list means "no status filter", as it always did. */
export function compStatusValues(statuses: unknown): StatusValue[] {
  if (!Array.isArray(statuses)) throw new UnsupportedCompStatusError(statuses);
  return [...new Set(statuses.map((s) => compStatusValue(s)))];
}
