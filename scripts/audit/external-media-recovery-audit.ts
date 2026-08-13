/**
 * Pure planner for the Cotality Property external-media recovery audit.
 *
 * The planner receives data through read-only interfaces. It cannot write to
 * Neon or Cotality. A later, separately reviewed and explicitly authorized
 * recovery command may consume the same canonical diff rules, but this audit
 * deliberately exposes no apply/execute capability.
 */

import {
  COTALITY_TOUR_SLOTS,
  buildDesiredCotalityExternalMedia,
  diffExternalMedia,
  isSafeExternalUrl,
  type ExternalMediaKind,
  type StoredExternalMediaRow,
} from '@/lib/media/external-media';

export interface RecoveryCandidateRow {
  listing_id: string;
}

export interface RecoveryProviderResult {
  records: Record<string, unknown>[];
  /** False means a provider nextLink or another truncation signal was present. */
  complete: boolean;
}

export interface ExternalMediaRecoveryAuditDeps {
  candidates: {
    /** Must return rows ordered by listing_id, strictly after cursor. */
    fetchPage(cursor: string | null, take: number): Promise<RecoveryCandidateRow[]>;
  };
  existing: {
    fetchByListingIds(listingIds: string[]): Promise<StoredExternalMediaRow[]>;
  };
  provider: {
    fetchByListingIds(listingIds: string[]): Promise<RecoveryProviderResult>;
  };
  storageReady: boolean;
}

export interface ExternalMediaRecoveryAuditBudgets {
  pageSize: number;
  maxListings: number;
  providerBatchSize: number;
  maxProviderQueries: number;
}

export const DEFAULT_EXTERNAL_MEDIA_RECOVERY_BUDGETS: ExternalMediaRecoveryAuditBudgets = {
  pageSize: 200,
  maxListings: 1_000,
  providerBatchSize: 25,
  maxProviderQueries: 40,
};

export interface ExternalMediaRecoveryPlanTotals {
  desiredRows: number;
  inserts: number;
  updates: number;
  deletes: number;
  unchangedRows: number;
  unchangedListings: number;
  unsafeValuesSkipped: number;
  byKind: Record<ExternalMediaKind, number>;
}

export interface ExternalMediaRecoveryBatchPlan {
  requestedListings: number;
  providerRecords: number;
  matchedListings: number;
  sourceMissingListings: number;
  unexpectedProviderRecords: number;
  providerRowsWithoutListingId: number;
  duplicateProviderRows: number;
  conflictListingIds: string[];
  changedListingIds: string[];
  totals: ExternalMediaRecoveryPlanTotals;
}

export interface ExternalMediaRecoveryAuditResult extends ExternalMediaRecoveryBatchPlan {
  storageReady: boolean;
  scanComplete: boolean;
  planComplete: boolean;
  processedListings: number;
  providerQueries: number;
  candidateDuplicatesIgnored: number;
  cursor: string | null;
  errors: string[];
  incompleteReasons: string[];
}

function emptyTotals(): ExternalMediaRecoveryPlanTotals {
  return {
    desiredRows: 0,
    inserts: 0,
    updates: 0,
    deletes: 0,
    unchangedRows: 0,
    unchangedListings: 0,
    unsafeValuesSkipped: 0,
    byKind: { video: 0, virtual_tour: 0, unknown: 0 },
  };
}

function desiredSignature(listingId: string, record: Record<string, unknown>): string {
  return JSON.stringify(
    buildDesiredCotalityExternalMedia(listingId, record).map((row) => ({
      source_key: row.source_key,
      url: row.url,
      branded: row.branded,
      kind: row.kind,
    })),
  );
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Plan one exact provider batch. Duplicate provider rows never create duplicate
 * planned mutations: identical duplicates collapse to one record, while
 * conflicting duplicates fail closed and produce no plan for that listing.
 */
export function planExternalMediaRecoveryBatch(input: {
  requestedListingIds: readonly string[];
  providerRecords: readonly Record<string, unknown>[];
  existingRows: readonly StoredExternalMediaRow[];
}): ExternalMediaRecoveryBatchPlan {
  const requested = Array.from(new Set(input.requestedListingIds.filter(Boolean)));
  const requestedSet = new Set(requested);
  const grouped = new Map<string, Record<string, unknown>[]>();
  let providerRowsWithoutListingId = 0;
  let unexpectedProviderRecords = 0;

  for (const record of input.providerRecords) {
    const listingId = typeof record.ListingId === 'string' ? record.ListingId.trim() : '';
    if (!listingId) {
      providerRowsWithoutListingId += 1;
      continue;
    }
    if (!requestedSet.has(listingId)) {
      unexpectedProviderRecords += 1;
      continue;
    }
    const rows = grouped.get(listingId);
    if (rows) rows.push(record);
    else grouped.set(listingId, [record]);
  }

  const existingByListing = new Map<string, StoredExternalMediaRow[]>();
  for (const row of input.existingRows) {
    if (!requestedSet.has(row.listing_id)) continue;
    const rows = existingByListing.get(row.listing_id);
    if (rows) rows.push(row);
    else existingByListing.set(row.listing_id, [row]);
  }

  const totals = emptyTotals();
  const conflictListingIds: string[] = [];
  const changedListingIds: string[] = [];
  let matchedListings = 0;
  let sourceMissingListings = 0;
  let duplicateProviderRows = 0;

  for (const listingId of requested) {
    const records = grouped.get(listingId) ?? [];
    if (records.length === 0) {
      sourceMissingListings += 1;
      continue;
    }
    matchedListings += 1;
    duplicateProviderRows += Math.max(0, records.length - 1);

    const signatures = new Set(records.map((record) => desiredSignature(listingId, record)));
    if (signatures.size !== 1) {
      conflictListingIds.push(listingId);
      continue;
    }

    const providerRecord = records[0];
    const desired = buildDesiredCotalityExternalMedia(listingId, providerRecord);
    totals.desiredRows += desired.length;
    for (const row of desired) totals.byKind[row.kind] += 1;
    for (const slot of COTALITY_TOUR_SLOTS) {
      const value = providerRecord[slot.key];
      if (nonEmpty(value) && !isSafeExternalUrl(value)) totals.unsafeValuesSkipped += 1;
    }

    const diff = diffExternalMedia(existingByListing.get(listingId) ?? [], desired);
    totals.inserts += diff.inserts.length;
    totals.updates += diff.updates.length;
    totals.deletes += diff.deletes.length;
    totals.unchangedRows += Math.max(0, desired.length - diff.inserts.length - diff.updates.length);
    if (diff.inserts.length === 0 && diff.updates.length === 0 && diff.deletes.length === 0) {
      totals.unchangedListings += 1;
    } else {
      changedListingIds.push(listingId);
    }
  }

  return {
    requestedListings: requested.length,
    providerRecords: input.providerRecords.length,
    matchedListings,
    sourceMissingListings,
    unexpectedProviderRecords,
    providerRowsWithoutListingId,
    duplicateProviderRows,
    conflictListingIds: conflictListingIds.sort(),
    changedListingIds: changedListingIds.sort(),
    totals,
  };
}

function mergeBatchPlan(
  aggregate: ExternalMediaRecoveryBatchPlan,
  batch: ExternalMediaRecoveryBatchPlan,
): void {
  aggregate.requestedListings += batch.requestedListings;
  aggregate.providerRecords += batch.providerRecords;
  aggregate.matchedListings += batch.matchedListings;
  aggregate.sourceMissingListings += batch.sourceMissingListings;
  aggregate.unexpectedProviderRecords += batch.unexpectedProviderRecords;
  aggregate.providerRowsWithoutListingId += batch.providerRowsWithoutListingId;
  aggregate.duplicateProviderRows += batch.duplicateProviderRows;
  aggregate.conflictListingIds.push(...batch.conflictListingIds);
  aggregate.changedListingIds.push(...batch.changedListingIds);
  aggregate.totals.desiredRows += batch.totals.desiredRows;
  aggregate.totals.inserts += batch.totals.inserts;
  aggregate.totals.updates += batch.totals.updates;
  aggregate.totals.deletes += batch.totals.deletes;
  aggregate.totals.unchangedRows += batch.totals.unchangedRows;
  aggregate.totals.unchangedListings += batch.totals.unchangedListings;
  aggregate.totals.unsafeValuesSkipped += batch.totals.unsafeValuesSkipped;
  aggregate.totals.byKind.video += batch.totals.byKind.video;
  aggregate.totals.byKind.virtual_tour += batch.totals.byKind.virtual_tour;
  aggregate.totals.byKind.unknown += batch.totals.byKind.unknown;
}

/** Run the bounded audit. Provider query count is an application-boundary
 * count only; it is not represented as transport traffic or quota usage. */
export async function runExternalMediaRecoveryAudit(
  deps: ExternalMediaRecoveryAuditDeps,
  budgets: ExternalMediaRecoveryAuditBudgets,
): Promise<ExternalMediaRecoveryAuditResult> {
  const aggregate: ExternalMediaRecoveryBatchPlan = {
    requestedListings: 0,
    providerRecords: 0,
    matchedListings: 0,
    sourceMissingListings: 0,
    unexpectedProviderRecords: 0,
    providerRowsWithoutListingId: 0,
    duplicateProviderRows: 0,
    conflictListingIds: [],
    changedListingIds: [],
    totals: emptyTotals(),
  };
  const errors: string[] = [];
  const seenCandidates = new Set<string>();
  let candidateDuplicatesIgnored = 0;
  let providerQueries = 0;
  let processedListings = 0;
  let cursor: string | null = null;
  let scanComplete = false;
  let stopped = false;

  while (!stopped && processedListings < budgets.maxListings) {
    const remaining = budgets.maxListings - processedListings;
    const take = Math.min(budgets.pageSize, remaining);
    const page = await deps.candidates.fetchPage(cursor, take + 1);
    const pageHasMore = page.length > take;
    const candidates: RecoveryCandidateRow[] = [];
    for (const row of page.slice(0, take)) {
      if (!row.listing_id || seenCandidates.has(row.listing_id)) {
        candidateDuplicatesIgnored += 1;
        continue;
      }
      seenCandidates.add(row.listing_id);
      candidates.push(row);
    }

    if (candidates.length === 0) {
      scanComplete = !pageHasMore;
      break;
    }

    for (let i = 0; i < candidates.length; i += budgets.providerBatchSize) {
      if (providerQueries >= budgets.maxProviderQueries) {
        stopped = true;
        break;
      }
      const listingIds = candidates
        .slice(i, i + budgets.providerBatchSize)
        .map((row) => row.listing_id);
      providerQueries += 1;

      try {
        const provider = await deps.provider.fetchByListingIds(listingIds);
        if (!provider.complete) {
          errors.push(`provider result was truncated for batch beginning ${listingIds[0]}`);
          stopped = true;
          break;
        }
        const existingRows = deps.storageReady
          ? await deps.existing.fetchByListingIds(listingIds)
          : [];
        mergeBatchPlan(
          aggregate,
          planExternalMediaRecoveryBatch({
            requestedListingIds: listingIds,
            providerRecords: provider.records,
            existingRows,
          }),
        );
        processedListings += listingIds.length;
        cursor = listingIds[listingIds.length - 1] ?? cursor;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown provider/read error';
        errors.push(`batch beginning ${listingIds[0]} failed: ${message}`);
        stopped = true;
        break;
      }
    }

    if (!stopped && !pageHasMore) {
      scanComplete = true;
      break;
    }
  }

  const incompleteReasons: string[] = [];
  if (!deps.storageReady) incompleteReasons.push('listing_external_media table is absent');
  if (!scanComplete) incompleteReasons.push('candidate scan stopped at a configured budget or provider failure');
  if (aggregate.conflictListingIds.length > 0) {
    incompleteReasons.push(`${aggregate.conflictListingIds.length} listing(s) have conflicting duplicate provider rows`);
  }
  if (aggregate.providerRowsWithoutListingId > 0) {
    incompleteReasons.push(`${aggregate.providerRowsWithoutListingId} provider row(s) lack ListingId`);
  }
  if (aggregate.sourceMissingListings > 0) {
    incompleteReasons.push(`${aggregate.sourceMissingListings} local Cotality candidate(s) have no provider row`);
  }
  if (aggregate.duplicateProviderRows > 0) {
    incompleteReasons.push(`${aggregate.duplicateProviderRows} duplicate provider row(s) were collapsed`);
  }
  if (aggregate.unexpectedProviderRecords > 0) {
    incompleteReasons.push(`${aggregate.unexpectedProviderRecords} provider row(s) were outside the requested batch`);
  }
  if (candidateDuplicatesIgnored > 0) {
    incompleteReasons.push(`${candidateDuplicatesIgnored} duplicate local candidate row(s) were ignored`);
  }
  if (errors.length > 0) incompleteReasons.push(`${errors.length} provider/read batch error(s)`);

  return {
    ...aggregate,
    storageReady: deps.storageReady,
    scanComplete,
    planComplete: incompleteReasons.length === 0,
    processedListings,
    providerQueries,
    candidateDuplicatesIgnored,
    cursor,
    errors,
    incompleteReasons,
  };
}
