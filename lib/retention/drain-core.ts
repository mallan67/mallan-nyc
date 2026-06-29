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

const CANONICAL_HOST = "ep-cold-waterfall-adno3ao2";
const STALE_HOST = "ep-royal-dawn-ad6eh8t2";

/** Refuse any connection that is not canonical cold-waterfall; refuse the stale royal-dawn outright. */
export function assertCanonicalHost(url: string): void {
  if (url.includes(STALE_HOST)) {
    throw new Error(`FATAL: refusing the STALE / do-not-serve royal-dawn host (${STALE_HOST}). Aborting.`);
  }
  if (!url.includes(CANONICAL_HOST)) {
    throw new Error(`FATAL: target is not canonical cold-waterfall (${CANONICAL_HOST}). Aborting.`);
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
  /** Archive one row (execute mode only). */
  archiveRow: (row: DrainRow) => Promise<{ ok: boolean }>;
  /** Durably record a touched id (execute mode only). */
  recordTouched: (t: { id: unknown; listing_key: string | null; status: string }) => void;
  execute: boolean;
  maxRows: number;
  chunkSize: number;
  log?: (msg: string) => void;
  /** Optional inter-chunk pause (let autovacuum / WAL breathe). */
  sleep?: () => Promise<void>;
}

export interface RunDrainResult {
  scanned: number;
  archived: number;
  errors: number;
  lastId: unknown;
}

/**
 * Keyset-chunked drain loop. Bounded by maxRows; never requests more than chunkSize per page.
 * Dry-run (execute=false) performs ZERO writes — it only scans + asserts eligibility. Execute mode
 * archives each row and records its touched id. Any non-eligible row aborts the whole run (fail-closed).
 */
export async function runDrain(opts: RunDrainOpts): Promise<RunDrainResult> {
  const { selectChunk, archiveRow, recordTouched, execute, maxRows, chunkSize } = opts;
  const log = opts.log ?? (() => {});

  let lastId: unknown = 0;
  let scanned = 0;
  let archived = 0;
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
        const r = await archiveRow(row);
        if (r && r.ok) {
          archived++;
          recordTouched({ id: row.id, listing_key: row.mls_id ?? row.listing_id ?? null, status: row.status });
        } else {
          errors++;
        }
      }
      if (scanned >= maxRows) break;
    }

    if (opts.sleep) await opts.sleep();
  }

  log(`[drain] execute=${execute} scanned=${scanned} archived=${archived} errors=${errors}`);
  return { scanned, archived, errors, lastId };
}
