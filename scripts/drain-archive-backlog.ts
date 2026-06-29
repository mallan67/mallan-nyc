/**
 * Gate 6 — controlled, bounded operator drain for the T+180 archive backlog (board #415).
 *
 * DRY-RUN BY DEFAULT (zero writes). Requires explicit `--execute` to write. Host-guarded to canonical
 * cold-waterfall; refuses the stale royal-dawn host. Bounded by `--max-rows` (hard MAX_RUN_CEILING) and
 * `--chunk-size`. Does NOT read or change ARCHIVE_T180_BACKLOG_ENABLED and does NOT depend on the Vercel
 * cron — it is the attended operator path. Reuses the SAME archive core as the nightly cron
 * (lib/retention/archive-terminals.ts) so the two paths can NEVER drift.
 *
 * ROLLBACK REALITY: the archive strip is ONE-WAY per row (raw_data/media/compliance are destroyed).
 * The touched-id log records IDS ONLY (never the stripped payloads) — it is an audit/verification
 * record, NOT a restore source. The ONLY real rollback is the pre-run Neon rollback branch, which is
 * REQUIRED before any `--execute` (acknowledge with `--ack-rollback-branch`).
 *
 * Usage:
 *   npx tsx scripts/drain-archive-backlog.ts --max-rows=5000                                  # DRY-RUN (default)
 *   npx tsx scripts/drain-archive-backlog.ts --execute --ack-rollback-branch --max-rows=5000  # WRITE (pilot, gated)
 *   npx tsx scripts/drain-archive-backlog.ts --execute --ack-rollback-branch --max-rows=20000 --chunk-size=500
 */
import path from "node:path";
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env.local"), override: true });
import { PrismaClient } from "@prisma/client";
import {
  archiveEligibilityWhere,
  ARCHIVE_SELECT,
  archiveOneListing,
  type ArchiveCandidateRow,
} from "../lib/retention/archive-terminals";
import {
  parseDrainArgs,
  assertCanonicalHost,
  formatTouchedLine,
  runDrain,
  MAX_RUN_CEILING,
  type DrainRow,
} from "../lib/retention/drain-core";

const SLEEP_MS = 300; // inter-chunk pause — let autovacuum / WAL breathe

// ── Durable touched-id log (fsync-before-return), mirroring scripts/backfill-terminal-since.ts ──
function appendDurable(file: string, text: string): void {
  const buf = Buffer.from(text, "utf8");
  const fd = openSync(file, "a");
  try {
    let off = 0;
    while (off < buf.length) {
      const n = writeSync(fd, buf, off, buf.length - off);
      if (n <= 0) throw new Error(`durable log write made no progress at offset ${off}/${buf.length}`);
      off += n;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function fsyncDirIfSupported(dir: string): void {
  if (process.platform === "win32") return; // NTFS journals metadata; openSync(dir) unsupported
  try {
    const dfd = openSync(dir, "r");
    try { fsyncSync(dfd); } finally { closeSync(dfd); }
  } catch {
    /* power-loss fallback = the pre-run Neon rollback branch */
  }
}

async function main() {
  const argv = process.argv.slice(2);

  // Host guard FIRST — refuse anything that is not canonical cold-waterfall (and the stale royal-dawn).
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
  assertCanonicalHost(url);

  const { execute, maxRows, chunkSize } = parseDrainArgs(argv);

  // Pre-run Neon rollback branch is MANDATORY for any write (the strip is one-way per row).
  if (execute && !argv.includes("--ack-rollback-branch")) {
    throw new Error(
      "REFUSING --execute without --ack-rollback-branch. Create a fresh pre-run Neon rollback branch off " +
        "canonical main FIRST (the archive strip is one-way per row; the touched-id log is audit-only, not a " +
        "restore source), then re-run with --ack-rollback-branch.",
    );
  }

  const now = new Date();
  const baseWhere = archiveEligibilityWhere({ now, clock: "terminal_since" });

  // Dedicated single-connection client so SET statement_timeout/lock_timeout stick for the whole run.
  const runUrl = url.includes("?") ? `${url}&connection_limit=1` : `${url}?connection_limit=1`;
  const prisma = new PrismaClient({ datasources: { db: { url: runUrl } } });

  const STAMP = now.toISOString().replace(/[:.]/g, "-");
  const LOG_DIR = path.resolve("artifacts");
  const LOG_PATH = path.join(LOG_DIR, `gate6-archive-touched-${STAMP}.jsonl`);

  try {
    if (execute) {
      await prisma.$executeRawUnsafe("SET statement_timeout = '30000'");
      await prisma.$executeRawUnsafe("SET lock_timeout = '5000'");
    }

    const eligible = await prisma.listing.count({ where: baseWhere });

    console.log("──────────────────────────────────────────────────────────────");
    console.log(`Gate 6 archive drain — ${execute ? "EXECUTE (WRITES)" : "DRY-RUN (no writes)"}`);
    console.log(`  host:        cold-waterfall (canonical) — guarded`);
    console.log(`  max-rows:    ${maxRows}  (hard ceiling ${MAX_RUN_CEILING})`);
    console.log(`  chunk-size:  ${chunkSize}`);
    console.log(`  eligible backlog (terminal_since clock): ${eligible}`);
    if (execute) console.log(`  touched-id log: ${LOG_PATH}`);
    console.log("──────────────────────────────────────────────────────────────");

    if (execute) {
      mkdirSync(LOG_DIR, { recursive: true });
      closeSync(openSync(LOG_PATH, "a")); // pre-create so the dir entry exists
      fsyncDirIfSupported(LOG_DIR);
    }

    const selectChunk = async (lastId: unknown, take: number): Promise<DrainRow[]> => {
      const rows = await prisma.listing.findMany({
        where: { ...baseWhere, id: { gt: BigInt((lastId as bigint | number) ?? 0) } },
        select: ARCHIVE_SELECT,
        orderBy: { id: "asc" },
        take,
      });
      return rows as unknown as DrainRow[];
    };

    const result = await runDrain({
      selectChunk,
      archiveRow: (row) => archiveOneListing(prisma, row as unknown as ArchiveCandidateRow),
      recordTouched: (t) =>
        appendDurable(LOG_PATH, formatTouchedLine({ id: t.id, listing_key: t.listing_key, status: t.status, run: STAMP }) + "\n"),
      execute,
      maxRows,
      chunkSize,
      log: (m) => console.log(m),
      sleep: execute ? () => new Promise<void>((r) => setTimeout(r, SLEEP_MS)) : undefined,
    });

    console.log("──────────────────────────────────────────────────────────────");
    if (execute) {
      console.log(`[EXECUTE] archived ${result.archived} / scanned ${result.scanned} (errors ${result.errors}).`);
      console.log(`[EXECUTE] touched-id log: ${LOG_PATH}`);
      console.log(`[EXECUTE] storage is NOT reclaimed by this run (dead tuples; reclaim is a separate gate).`);
      console.log(`[EXECUTE] verify per the Gate 6 runbook + post proof to #415 before any further run.`);
    } else {
      console.log(`[DRY-RUN] would archive up to ${result.scanned} rows (no writes performed).`);
      console.log(`[DRY-RUN] re-run with --execute --ack-rollback-branch (gated) after a pre-run Neon rollback branch.`);
    }
    console.log("──────────────────────────────────────────────────────────────");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
