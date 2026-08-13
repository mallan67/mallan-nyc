#!/usr/bin/env tsx
/**
 * Bounded, read-only recovery audit for Cotality Property external-media links.
 *
 * Usage:
 *   npm run media:external-recovery:audit -- --max-listings 1000 --json
 *
 * There is intentionally no apply/execute mode. Database access is limited to
 * SELECT/findMany and provider access is limited to authenticated GET requests.
 * Production migration and recovery writes remain separate authorization gates.
 */

import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import { COTALITY_TOUR_SLOTS, type StoredExternalMediaRow } from '@/lib/media/external-media';
import {
  COTALITY_BASE,
  assertValidBase,
  parseBound,
  validateArgs,
} from './media-coverage-audit.cli';
import { validateNextLink } from './media-coverage-audit';
import {
  DEFAULT_EXTERNAL_MEDIA_RECOVERY_BUDGETS,
  runExternalMediaRecoveryAudit,
  type ExternalMediaRecoveryAuditBudgets,
  type RecoveryProviderResult,
} from './external-media-recovery-audit';

const VALUE_FLAGS = [
  '--page-size',
  '--max-listings',
  '--provider-batch-size',
  '--max-provider-queries',
  '--timeout-ms',
] as const;

function bounded(args: string[], name: string, fallback: number, max: number): number {
  const value = parseBound(args, name, fallback);
  if (value > max) {
    console.error(`${name} ${value} exceeds the safety maximum ${max} — refusing to run`);
    process.exit(1);
  }
  return value;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildExternalMediaPropertyUrl(base: string, listingIds: readonly string[]): string {
  const params = new URLSearchParams();
  params.set(
    '$filter',
    listingIds.map((id) => `ListingId eq '${escapeODataString(id)}'`).join(' or '),
  );
  params.set('$select', ['ListingId', ...COTALITY_TOUR_SLOTS.map((slot) => slot.key)].join(','));
  params.set('$top', String(Math.min(100, Math.max(2, listingIds.length * 2))));
  params.set('$orderby', 'ListingId asc');
  return `${base}/odata/Property?${params.toString()}`;
}

export function buildExternalMediaProviderReader(options: {
  base: string;
  timeoutMs: number;
}): { fetchByListingIds(listingIds: string[]): Promise<RecoveryProviderResult> } {
  assertValidBase(options.base);
  return {
    async fetchByListingIds(listingIds) {
      if (listingIds.length === 0) return { records: [], complete: true };
      const url = buildExternalMediaPropertyUrl(options.base, listingIds);
      const guarded = validateNextLink(url, options.base);
      if ('error' in guarded) throw new Error(`unsafe provider URL rejected: ${guarded.error}`);
      // Import only after the endpoint has passed the exact allowlist. The auth
      // module is never reached for an unapproved configured host.
      const { getAccessToken } = await import('@/lib/idx/auth');
      const token = await getAccessToken();
      const response = await fetch(guarded.url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (response.status !== 200) throw new Error(`Cotality Property HTTP ${response.status}`);
      const data = await response.json() as {
        value?: unknown;
        '@odata.nextLink'?: unknown;
      };
      if (!Array.isArray(data.value)) throw new Error('Cotality Property response has no value array');
      return {
        records: data.value as Record<string, unknown>[],
        complete: typeof data['@odata.nextLink'] !== 'string',
      };
    },
  };
}

async function externalMediaTableExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('listing_external_media') IS NOT NULL AS "exists"
  `;
  return rows[0]?.exists === true;
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  validateArgs(args, VALUE_FLAGS, ['--json']);
  const asJson = args.includes('--json');
  const budgets: ExternalMediaRecoveryAuditBudgets = {
    pageSize: bounded(args, '--page-size', DEFAULT_EXTERNAL_MEDIA_RECOVERY_BUDGETS.pageSize, 500),
    maxListings: bounded(args, '--max-listings', DEFAULT_EXTERNAL_MEDIA_RECOVERY_BUDGETS.maxListings, 25_000),
    providerBatchSize: bounded(
      args,
      '--provider-batch-size',
      DEFAULT_EXTERNAL_MEDIA_RECOVERY_BUDGETS.providerBatchSize,
      50,
    ),
    maxProviderQueries: bounded(
      args,
      '--max-provider-queries',
      DEFAULT_EXTERNAL_MEDIA_RECOVERY_BUDGETS.maxProviderQueries,
      1_000,
    ),
  };
  const timeoutMs = bounded(args, '--timeout-ms', 15_000, 60_000);
  const base = COTALITY_BASE();
  assertValidBase(base);

  try {
    const storageReady = await externalMediaTableExists();
    const result = await runExternalMediaRecoveryAudit(
      {
        storageReady,
        candidates: {
          fetchPage: (cursor, take) => prisma.listing.findMany({
            where: {
              ...(cursor ? { listing_id: { gt: cursor } } : {}),
              NOT: [
                { listing_id: { startsWith: 'SL-' } },
                { listing_id: { startsWith: 'RL-' } },
              ],
            },
            orderBy: { listing_id: 'asc' },
            take,
            select: { listing_id: true },
          }),
        },
        existing: {
          fetchByListingIds: async (listingIds) => {
            const rows = await prisma.listingExternalMedia.findMany({
              where: {
                listing_id: { in: listingIds },
                source: 'cotality_property',
              },
              select: {
                listing_id: true,
                source: true,
                source_key: true,
                url: true,
                branded: true,
                kind: true,
              },
            });
            return rows as StoredExternalMediaRow[];
          },
        },
        provider: buildExternalMediaProviderReader({ base, timeoutMs }),
      },
      budgets,
    );

    if (asJson) {
      console.log(JSON.stringify({
        mode: 'READ-ONLY external-media recovery audit — nothing written',
        budgets,
        ...result,
        changedListingIds: result.changedListingIds.slice(0, 100),
        conflictListingIds: result.conflictListingIds.slice(0, 100),
      }, null, 2));
    } else {
      console.log('=== External-media recovery audit (READ-ONLY — nothing written) ===');
      console.log(`storageReady=${result.storageReady} scanComplete=${result.scanComplete} planComplete=${result.planComplete}`);
      console.log(`processed=${result.processedListings} providerQueries=${result.providerQueries} matched=${result.matchedListings} sourceMissing=${result.sourceMissingListings}`);
      console.log(`desired=${result.totals.desiredRows} inserts=${result.totals.inserts} updates=${result.totals.updates} deletes=${result.totals.deletes} unchangedRows=${result.totals.unchangedRows}`);
      console.log(`kinds: video=${result.totals.byKind.video} virtual_tour=${result.totals.byKind.virtual_tour} unknown=${result.totals.byKind.unknown}`);
      console.log(`provider duplicates=${result.duplicateProviderRows} conflicts=${result.conflictListingIds.length} unsafeSkipped=${result.totals.unsafeValuesSkipped}`);
      if (result.incompleteReasons.length > 0) {
        console.error(`INCOMPLETE: ${result.incompleteReasons.join('; ')}`);
      }
    }
    if (!result.planComplete) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('external-media recovery audit failed (READ-ONLY, nothing written):', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
