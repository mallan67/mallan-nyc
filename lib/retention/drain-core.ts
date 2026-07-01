/**
 * Gate 6 — controlled archive-drain orchestration + guards (board #415).
 *
 * Pure, dependency-injected logic used by scripts/drain-archive-backlog.ts. Holds NO Prisma client
 * and performs NO I/O on import — every external effect (DB select, archive, touched-id log, sleep)
 * is injected so the safety rules are unit-testable without a live DB.
 *
 * Safety invariants enforced here:
 *  - bounded ONLY: --max-rows required (no unlimited mode), hard MAX_RUN_CEILING, bounded chunk size.
 *  - dry-run by default; writes happen only when execute === true.
 *  - host guard: canonical cold-waterfall only; stale royal-dawn explicitly refused.
 *  - fail-closed: any non-terminal / already-archived row surfaced by the query STOPS the run.
 *  - touched-id log records ids ONLY — never the stripped raw payloads.
 */
import { ARCHIVE_TERMINAL_STATUSES } from "@/lib/retention/archive-terminals";

/** Hard ceiling on a single run's --max-rows. Guards against an operator typo (e.g. 200000). */
export const MAX_RUN_CEILING = 25000;
/** Upper bound on --chunk-size so each keyset page / transaction stays small (no long locks). */
export const MAX_CHUNK_SIZE = 1000;
/** Default keyset page / chunk size (matches the cron's proven per-run size). */
export const DEFAULT_CHUNK_SIZE = 500;

const CANONICAL_ENDPOINT = "ep-cold-waterfall-adno3ao2";
const STALE_ENDPOINT = "ep-royal-dawn-ad6eh8t2";
const NEON_HOST_SUFFIX = ".neon.tech";

/**
 * Refuse any connection whose PARSED HOSTNAME is not the canonical cold-waterfall Neon endpoint.
 * A substring check on the whole URL is unsafe — the canonical string could appear in a query param
 * (e.g. `?application_name=ep-cold-waterfall-adno3ao2`), the password, or the path. So we parse
 * `new URL(url)` and compare the hostname's first label (the Neon endpoint id) against the canonical
 * direct + pooler variants, and require the `.neon.tech` suffix. Stale royal-dawn, malformed URLs,
 * and any non-canonical hostname all fail closed.
 */
export function assertCanonicalHost(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("FATAL: DATABASE_URL is malformed / unparseable — refusing to connect. Aborting.");
  }
  if (!host) throw new Error("FATAL: DATABASE_URL has no host — refusing to connect. Aborting.");

  const endpoint = host.split(".")[0];
  if (endpoint === STALE_ENDPOINT) {
    throw new Error(`FATAL: refusing the STALE / do-not-serve royal-dawn host (${STALE_ENDPOINT}). Aborting.`);
  }
  const endpointOk = endpoint === CANONICAL_ENDPOINT || endpoint === `${CANONICAL_ENDPOINT}-pooler`;
  if (!endpointOk || !host.endsWith(NEON_HOST_SUFFIX)) {
    throw new Error(
      `FATAL: target host '${host}' is not the canonical cold-waterfall endpoint ` +
        `(${CANONICAL_ENDPOINT}[-pooler]${NEON_HOST_SUFFIX}). Aborting.`,
    );
  }
}

function readNum(argv: string[], flag: string): number | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === flag) {
      const v = argv[i + 1];
      return v === undefined ? NaN : Number(v);
    }
    if (a.startsWith(flag + "=")) return Number(a.slice(flag.length + 1));
  }
  return undefined;
}

export interface DrainArgs {
  execute: boolean;
  maxRows: number;
  chunkSize: number;
}

/** Parse + validate CLI args. Dry-run by default; --max-rows is mandatory (there is no unlimited mode). */
export function parseDrainArgs(argv: string[]): DrainArgs {
  const execute = argv.includes("--execute");
  const maxRows = readNum(argv, "--max-rows");
  const chunkRaw = readNum(argv, "--chunk-size");
  const chunkSize = chunkRaw === undefined ? DEFAULT_CHUNK_SIZE : chunkRaw;

  if (maxRows === undefined) {
    throw new Error("--max-rows=N is required (there is no unlimited mode).");
  }
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new Error("--max-rows must be a positive integer.");
  }
  if (maxRows > MAX_RUN_CEILING) {
    throw new Error(`--max-rows ${maxRows} exceeds the hard safety ceiling MAX_RUN_CEILING=${MAX_RUN_CEILING}.`);
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("--chunk-size must be a positive integer.");
  }
  if (chunkSize > MAX_CHUNK_SIZE) {
    throw new Error(`--chunk-size ${chunkSize} exceeds MAX_CHUNK_SIZE=${MAX_CHUNK_SIZE}.`);
  }
  return { execute, maxRows, chunkSize };
}

/** Fail-closed guard: any row that is not a terminal, not-yet-archived listing STOPS the run. */
export function assertArchivable(row: { id: unknown; status: string; sync_status?: string | null }): void {
  if (!(ARCHIVE_TERMINAL_STATUSES as readonly string[]).includes(row.status)) {
    throw new Error(`SAFETY MISMATCH: non-terminal status '${row.status}' surfaced for archive (id ${String(row.id)}). Stopping.`);
  }
  if (row.sync_status === "archived") {
    throw new Error(`SAFETY MISMATCH: row already archived (id ${String(row.id)}). Stopping.`);
  }
}

/** One JSONL touched-id line. IDs ONLY — the stripped raw payloads are NEVER stored here. */
export function formatTouchedLine(t: { id: unknown; listing_key: string | null; status: string; run: string }): string {
  return JSON.stringify({
    id: typeof t.id === "bigint" ? t.id.toString() : t.id,
    listing_key: t.listing_key,
    status: t.status,
    archived_run: t.run,
  });
}

export interface DrainRow {
  id: unknown;
  status: string;
  sync_status?: string | null;
  mls_id?: string | null;
  listing_id: string;
  [k: string]: unknown;
}

export interface RunDrainOpts {
  /** Fetch up to `take` eligible rows with id > lastId (keyset), ordered by id. */
  selectChunk: (lastId: unknown, take: number) => Promise<DrainRow[]>;
  /** Archive one row (execute mode only). Returns ok (stripped), skipped (eligibility drift), or neither (error). */
  archiveRow: (row: DrainRow) => Promise<{ ok: boolean; skipped?: boolean }>;
  /**
   * Durably record a touched id as a PRE-COMMIT INTENT (execute mode only). Called BEFORE the strip
   * commits, so a stripped row can never be missing from the audit log. MUST fsync and MUST throw on
   * write failure (the throw aborts the run before the strip). Over-reporting (a logged id whose strip
   * later skipped/failed) is acceptable; under-reporting an actually-stripped id is not.
   */
  recordTouched: (t: { id: unknown; listing_key: string | null; status: string }) => void;
  execute: boolean;
  maxRows: number;
  chunkSize: number;
  /** Stop the run if eligibility-drift skips exceed this (default Infinity → never stop on skips). */
  skipThreshold?: number;
  log?: (msg: string) => void;
  /** Optional inter-chunk pause (let autovacuum / WAL breathe). */
  sleep?: () => Promise<void>;
}

export interface RunDrainResult {
  scanned: number;
  archived: number;
  skipped: number;
  errors: number;
  lastId: unknown;
}

/**
 * Keyset-chunked drain loop. Bounded by maxRows; never requests more than chunkSize per page.
 * Dry-run (execute=false) performs ZERO writes — it only scans + asserts eligibility. Execute mode
 * writes the durable PRE-COMMIT intent log for each row, then archives it; the strip is fail-closed
 * (archiveOneListing re-checks eligibility atomically → skip on drift). Any non-eligible row surfaced
 * by the query aborts the whole run (fail-closed), as does exceeding skipThreshold.
 */
export async function runDrain(opts: RunDrainOpts): Promise<RunDrainResult> {
  const { selectChunk, archiveRow, recordTouched, execute, maxRows, chunkSize } = opts;
  const log = opts.log ?? (() => {});
  const skipThreshold = opts.skipThreshold ?? Infinity;

  let lastId: unknown = 0;
  let scanned = 0;
  let archived = 0;
  let skipped = 0;
  let errors = 0;

  while (scanned < maxRows) {
    const take = Math.min(chunkSize, maxRows - scanned);
    const rows = await selectChunk(lastId, take);
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      assertArchivable(row); // fail-closed — throws to STOP the run on any non-eligible row
      scanned++;
      lastId = row.id;
      if (execute) {
        // Durable PRE-COMMIT intent: record the id BEFORE the strip. A failing (throwing) log write
        // aborts the run here — the strip never runs, so a stripped row can never be unlogged.
        recordTouched({ id: row.id, listing_key: row.mls_id ?? row.listing_id ?? null, status: row.status });
        const r = await archiveRow(row);
        if (r?.skipped) {
          skipped++;
          if (skipped > skipThreshold) {
            throw new Error(
              `SAFETY STOP: ${skipped} eligibility-drift skips exceeded threshold ${skipThreshold}. Stopping.`,
            );
          }
        } else if (r?.ok) {
          archived++;
        } else {
          errors++;
        }
      }
      if (scanned >= maxRows) break;
    }

    if (opts.sleep) await opts.sleep();
  }

  log(`[drain] execute=${execute} scanned=${scanned} archived=${archived} skipped=${skipped} errors=${errors}`);
  return { scanned, archived, skipped, errors, lastId };
}
