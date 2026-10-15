/**
 * THE canonical CRM media mutation boundary.
 *
 * Every CRM write that changes `listing_media` for a listing must go through
 * here. The reason is a proven Production defect: the Cotality media-sync path
 * converges the derived `Listing` media summary after mutating rows, but the CRM
 * paths (upload, restore, delete, set-main, reorder, legacy JSON import) did
 * not. That split left listings reporting a `photo_count` frozen at their
 * pre-tombstone value — the media rows changed, the summary did not.
 *
 * WHY A SERVICE AND NOT A LINE IN EACH ROUTE
 *
 * Appending `await updateListingMediaSummary(...)` to five routes produces five
 * subtly different implementations and five chances to forget. Worse, appending
 * it AFTER an already-committed media write is not atomic: if the summary write
 * fails, the row change stands and the summary is stale — the exact state we
 * are fixing. One boundary, one transaction, one summary owner.
 *
 * WHAT IT GUARANTEES
 *   - the caller's media mutation and the derived summary share ONE real
 *     Prisma transaction: both commit, or neither does;
 *   - the summary is recomputed from the rows as they exist INSIDE that
 *     transaction, so it can never describe a pre-mutation world;
 *   - the summary formula is not duplicated — it delegates to the canonical
 *     `computeListingMediaSummary` via `updateListingMediaSummary`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - authorization: routes remain responsible for who may act;
 *   - external side effects (R2 uploads, cache revalidation, audit logging):
 *     those must not sit inside a database transaction. Do them before (R2) or
 *     after a successful commit (revalidation/audit).
 */

import prisma from "@/lib/prisma";
import { updateListingMediaSummary, type SummaryDbClient } from "@/lib/idx/media-sync";

/**
 * The transaction client handed to the caller's mutation. Deliberately typed as
 * the summary client plus the media delegate: enough to mutate media rows and
 * nothing that invites unrelated work into the transaction.
 */
export type CrmMediaTx = SummaryDbClient;

/**
 * Run a CRM media mutation and converge the derived `Listing` summary in the
 * SAME transaction.
 *
 * @param listingId canonical `Listing.listing_id` whose summary must converge
 * @param mutate    performs the media row change using the supplied tx client.
 *                  MUST use the provided client — using the module client would
 *                  escape the transaction and defeat the atomicity guarantee.
 * @returns whatever `mutate` returned, after the transaction commits
 */
export async function withCrmMediaConvergence<T>(
  listingId: string,
  mutate: (tx: CrmMediaTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await mutate(tx as unknown as CrmMediaTx);
    // Recomputed from the rows as they exist inside this transaction.
    await updateListingMediaSummary(listingId, { client: tx as unknown as SummaryDbClient });
    return result;
  });
}

/**
 * Thrown from inside a `withCrmMediaConvergence` callback when the business
 * precondition fails — the target row is missing, already tombstoned, or the
 * mutation affected a different number of rows than intended.
 *
 * Why an exception and not a return value: the service converges the summary
 * AFTER the callback returns. A callback that returns "nothing happened" still
 * gets a summary write, so a not-found DELETE would perform a hidden write and
 * the route would return 404 while the database had been touched. Throwing
 * aborts the transaction, so a failed business operation performs exactly zero
 * writes. Routes catch this and map it to their own status code.
 */
export class CrmMediaPreconditionError extends Error {
  readonly code = "CRM_MEDIA_PRECONDITION";
  constructor(
    message: string,
    readonly detail?: { expected?: number; actual?: number },
  ) {
    super(message);
    this.name = "CrmMediaPreconditionError";
  }
}

/** True when `err` came from a failed precondition rather than a DB fault. */
export function isCrmMediaPreconditionError(err: unknown): err is CrmMediaPreconditionError {
  return err instanceof CrmMediaPreconditionError;
}

/**
 * Assert a write affected exactly the intended number of rows, inside the
 * transaction. Anything else rolls the whole operation back.
 */
export function expectAffected(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new CrmMediaPreconditionError(
      `${what}: expected ${expected} row(s) to change, ${actual} did`,
      { expected, actual },
    );
  }
}
