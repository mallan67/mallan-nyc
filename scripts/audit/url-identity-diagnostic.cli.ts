#!/usr/bin/env tsx
// scripts/audit/url-identity-diagnostic.cli.ts
//
// tsx entry for the READ-ONLY URL-identity diagnostic (DESIGN v1). Holds the
// concrete read-only Neon + Cotality readers and the SINGLE in-memory token.
//
// SAFETY (DESIGN v1):
//   • Neon access is a SINGLE interactive transaction that issues
//     `SET TRANSACTION READ ONLY` first and ALWAYS rolls back (a sentinel throw
//     forces the rollback). Only SELECTs run inside it. No create/update/
//     delete/upsert/executeRaw-write path exists anywhere in this file.
//   • Cotality base is asserted EXACTLY `https://api.cotality.com/trestle`
//     (reusing #525 assertValidBase) BEFORE any token. getAccessToken() is
//     called AT MOST ONCE, held in memory, never refreshed; a later 401 is
//     treated as inconclusive. Every OData data request uses redirect:'error';
//     every @odata.nextLink is strictly validated (validateMediaNextLink)
//     before the bearer is attached.
//   • Bounded: DATA_ATTEMPT_CAP via the shared accountant; MAX_PAGES per
//     unit; sequential (concurrency 1); retry only timeout/network/5xx.
//   • Output: aggregate + categorical only (no URL/pathname/query/MediaKey/
//     ListingKey/listing-id/hash). Errors carry only slot/scope/page/status.
//
// EXECUTION against Neon or Cotality is a SEPARATE explicit approval. Guarded:
// the network run only proceeds with `--run-approved <TOKEN>` AND the env
// approval flag; without both, it prints the plan and exits (no I/O).

import { pathToFileURL } from 'node:url';
import prisma from '@/lib/prisma';
import { classifyTrestleMediaCategory } from '@/lib/media/media-sync-service';
import {
  runUrlIdentityDiagnostic, buildMediaQuery, validateMediaNextLink, DIAG_PARAMS,
  attemptWithAccounting, CapStopError,
  type DiagnosticNeonReader, type DiagnosticCotalityReader, type StoredMediaRow,
  type MediaScope, type MediaFetchResult, type RawMediaRow, type RequestAccountant,
} from './url-identity-diagnostic';
import { assertValidBase, COTALITY_BASE } from './media-coverage-audit.cli';

// The explicit two-key execution gate (both required to touch the network/DB).
const RUN_APPROVAL_ENV = 'URL_DIAG_RUN_APPROVED';
const RUN_APPROVAL_TOKEN = 'RUN-APPROVED-URL-IDENTITY-DIAGNOSTIC';

// ─── READ-ONLY Neon reader (SET TRANSACTION READ ONLY + forced ROLLBACK) ────

class ReadonlyRollback extends Error { readonly sentinel = true; }

function buildNeonReader(): DiagnosticNeonReader {
  let widened = false;
  return {
    windowWidened: () => widened,
    async sampleCandidates(startIso, endIso) {
      const read = async (fromIso: string, toIso: string): Promise<StoredMediaRow[]> => {
        let rows: Array<Record<string, unknown>> = [];
        try {
          await prisma.$transaction(async (tx) => {
            // Engine-level guarantee: the DB REJECTS any write in this txn.
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
            rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
              SELECT listing_id, media_key, resource_record_key, media_url_original,
                     media_category, media_type, "order", status,
                     (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at_ms
              FROM listing_media
              WHERE status = 'active'
                AND resource_record_key IS NOT NULL
                AND media_url_original IS NOT NULL
                AND media_key NOT LIKE 'crm:%'
                AND updated_at >= ${new Date(fromIso)}
                AND updated_at <= ${new Date(toIso)}
              ORDER BY resource_record_key ASC, media_key ASC`;
            // Force ROLLBACK: never commit a diagnostic read transaction.
            throw new ReadonlyRollback('read-only diagnostic — rolling back');
          });
        } catch (e) {
          if (!(e instanceof ReadonlyRollback)) throw e; // sentinel = expected rollback
        }
        return rows.map((r) => ({
          listingId: String(r.listing_id),
          mediaKey: String(r.media_key),
          resourceRecordKey: String(r.resource_record_key),
          mediaUrlOriginal: String(r.media_url_original),
          mediaCategory: r.media_category == null ? null : String(r.media_category),
          mediaType: String(r.media_type ?? ''),
          order: Number(r.order ?? 0),
          status: String(r.status),
          updatedAtMs: Number(r.updated_at_ms ?? 0),
        }));
      };

      let out = await read(startIso, endIso);
      const need = DIAG_PARAMS.MAX_LISTINGS; // at least a few distinct listings
      if (new Set(out.map((r) => r.resourceRecordKey)).size < need) {
        widened = true;
        const from = new Date(new Date(startIso).getTime() - 2000).toISOString();
        const to = new Date(new Date(endIso).getTime() + 2000).toISOString();
        out = await read(from, to);
      }
      return out;
    },
  };
}

// ─── READ-ONLY Cotality reader (single token, strict nextLink, redirect:error) ─

function buildCotalityReader(base: string, token: string, opts: { timeoutMs: number }): DiagnosticCotalityReader {
  const authedGet = async (url: string, acct: RequestAccountant): Promise<Response> =>
    attemptWithAccounting(async () => {
      const guard = validateMediaNextLink(url, base);
      if ('error' in guard) throw new Error(`unsafe url: ${guard.error}`);
      const res = await fetch(guard.url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // retryable
      return res;
    }, acct, DIAG_PARAMS.RETRIES);

  return {
    async fetchMedia(listingKey: string, scope: MediaScope, acct: RequestAccountant): Promise<MediaFetchResult> {
      const rows: RawMediaRow[] = [];
      let url: string | null = `${base}/odata/Media?${buildMediaQuery(listingKey, scope).toString()}`;
      let pages = 0;
      try {
        while (url) {
          if (pages >= DIAG_PARAMS.MAX_PAGES) return { rows, complete: false, incompleteReason: 'page-cap' };
          pages += 1;
          const res = await authedGet(url, acct);
          if (res.status === 401) return { rows, complete: false, incompleteReason: '401-inconclusive' };
          if (res.status !== 200) return { rows, complete: false, incompleteReason: `http-${res.status}` };
          const data = await res.json();
          for (const r of (data.value || []) as Array<Record<string, unknown>>) {
            rows.push({
              MediaKey: (r.MediaKey as string) ?? null,
              ResourceName: (r.ResourceName as string) ?? null,
              ResourceRecordKey: (r.ResourceRecordKey as string) ?? null,
              ResourceRecordID: (r.ResourceRecordID as string) ?? null,
              MediaURL: (r.MediaURL as string) ?? null,
              MediaCategory: (r.MediaCategory as string) ?? null,
              MediaClassification: (r.MediaClassification as string) ?? null,
              MediaType: (r.MediaType as string) ?? null,
              MediaStatus: (r.MediaStatus as string) ?? null,
              Permission: (r.Permission as string) ?? null,
              Order: (r.Order as number | string) ?? null,
              PreferredPhotoYN: (r.PreferredPhotoYN as boolean | string) ?? null,
              ModificationTimestamp: (r.ModificationTimestamp as string) ?? null,
              MediaModificationTimestamp: (r.MediaModificationTimestamp as string) ?? null,
            });
          }
          const rawNext = (data['@odata.nextLink'] as string) ?? null;
          if (rawNext == null) { url = null; break; }
          const chk = validateMediaNextLink(rawNext, base);
          if ('error' in chk) return { rows, complete: false, incompleteReason: `bad-nextlink:${chk.error}` };
          url = chk.url;
        }
        return { rows, complete: true };
      } catch (e) {
        if (e instanceof CapStopError) throw e; // orchestrator records cap
        return { rows, complete: false, incompleteReason: 'transport' };
      }
    },
  };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const base = COTALITY_BASE();
  assertValidBase(base); // approved-endpoint allowlist BEFORE any token

  const runApproved = args.includes('--run-approved')
    && args[args.indexOf('--run-approved') + 1] === RUN_APPROVAL_TOKEN
    && process.env[RUN_APPROVAL_ENV] === '1';

  if (!runApproved) {
    // NO network, NO DB. Print the bounded plan and exit — execution is a
    // separate explicit approval (both --run-approved <TOKEN> and env flag).
    console.log(JSON.stringify({
      mode: 'PLAN-ONLY (execution NOT approved)',
      note: 'Supply --run-approved ' + RUN_APPROVAL_TOKEN + ' AND ' + RUN_APPROVAL_ENV + '=1 to run read-only.',
      params: DIAG_PARAMS,
      base,
    }, null, 2));
    return;
  }

  // ── Approved read-only run ──
  const { getAccessToken } = await import('@/lib/idx/auth');
  const token = await getAccessToken(); // AT MOST ONCE — held in memory, never refreshed
  try {
    const report = await runUrlIdentityDiagnostic({
      neon: buildNeonReader(),
      cotality: buildCotalityReader(base, token, { timeoutMs: 15_000 }),
      authNetworkAttempts: 1,
      waitInterval: () => new Promise((r) => setTimeout(r, DIAG_PARAMS.INTERVAL_MS)),
      deriveInternalType: (c) => classifyTrestleMediaCategory(c),
    });
    console.log(JSON.stringify({ mode: 'READ-ONLY diagnostic — no writes', ...report }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('url-identity diagnostic failed (read-only, no writes):', e?.message || e); process.exitCode = 1; });
}
