/**
 * Pure safety controls for the one-way raw_data shedding operator script.
 *
 * No I/O and no Prisma import: every destructive precondition is testable
 * without touching Neon. Dry-run stays the default and is bounded too, so an
 * accidental audit cannot scan the entire production table indefinitely.
 */

export const RAW_SHED_MAX_ROWS = 25_000;
export const RAW_SHED_MAX_BATCH_SIZE = 1_000;
export const RAW_SHED_DEFAULT_BATCH_SIZE = 500;
export const RAW_SHED_DEFAULT_DRY_RUN_ROWS = 5_000;
export const RAW_SHED_CONFIRMATION = 'SHED_RAW_DATA';

export interface RawDataShedArgs {
  execute: boolean;
  maxRows: number;
  batchSize: number;
  maxBatches: number;
  rollbackAcknowledged: boolean;
  confirmation: string | null;
}

function readNumber(argv: string[], names: string[]): number | undefined {
  for (let i = 0; i < argv.length; i++) {
    for (const name of names) {
      if (argv[i] === name) {
        const value = argv[i + 1];
        return value === undefined ? NaN : Number(value);
      }
      if (argv[i].startsWith(`${name}=`)) {
        return Number(argv[i].slice(name.length + 1));
      }
    }
  }
  return undefined;
}

function readString(argv: string[], name: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1] ?? null;
    if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
  return null;
}

/**
 * Parse a bounded dry-run/execute request.
 *
 * `--dry-run` / `--audit-only` always wins over `--execute`. Execute requires
 * an explicitly supplied bound; a dry-run without one inspects at most 5,000
 * rows. `--limit` remains a compatibility alias for the old CLI.
 */
export function parseRawDataShedArgs(argv: string[]): RawDataShedArgs {
  const forcedDryRun = argv.includes('--dry-run') || argv.includes('--audit-only');
  const execute = argv.includes('--execute') && !forcedDryRun;
  const explicitMaxRows = readNumber(argv, ['--max-rows', '--limit']);
  const maxRows = explicitMaxRows ?? RAW_SHED_DEFAULT_DRY_RUN_ROWS;
  const batchSize = readNumber(argv, ['--batch']) ?? RAW_SHED_DEFAULT_BATCH_SIZE;

  if (execute && explicitMaxRows === undefined) {
    throw new Error('--execute requires an explicit --max-rows=N bound.');
  }
  if (!Number.isInteger(maxRows) || maxRows <= 0) {
    throw new Error('--max-rows/--limit must be a positive integer.');
  }
  if (maxRows > RAW_SHED_MAX_ROWS) {
    throw new Error(
      `--max-rows ${maxRows} exceeds the hard safety ceiling RAW_SHED_MAX_ROWS=${RAW_SHED_MAX_ROWS}.`,
    );
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('--batch must be a positive integer.');
  }
  if (batchSize > RAW_SHED_MAX_BATCH_SIZE) {
    throw new Error(
      `--batch ${batchSize} exceeds RAW_SHED_MAX_BATCH_SIZE=${RAW_SHED_MAX_BATCH_SIZE}.`,
    );
  }

  const naturalBatchLimit = Math.ceil(maxRows / batchSize);
  const requestedMaxBatches = readNumber(argv, ['--max-batches']);
  const maxBatches = requestedMaxBatches ?? naturalBatchLimit;
  if (!Number.isInteger(maxBatches) || maxBatches <= 0) {
    throw new Error('--max-batches must be a positive integer.');
  }
  if (maxBatches > naturalBatchLimit) {
    throw new Error(
      `--max-batches ${maxBatches} exceeds the bounded run requirement (${naturalBatchLimit} for ` +
        `maxRows=${maxRows}, batch=${batchSize}).`,
    );
  }

  return {
    execute,
    maxRows,
    batchSize,
    maxBatches,
    rollbackAcknowledged: argv.includes('--ack-rollback-branch'),
    confirmation: readString(argv, '--confirm'),
  };
}

/** Execute is permitted only after all three independent operator gates pass. */
export function assertRawDataShedExecuteAllowed(
  args: RawDataShedArgs,
  env: Record<string, string | undefined>,
): void {
  if (!args.execute) return;

  const missing: string[] = [];
  if (!args.rollbackAcknowledged) missing.push('--ack-rollback-branch');
  if (args.confirmation !== RAW_SHED_CONFIRMATION) {
    missing.push(`--confirm=${RAW_SHED_CONFIRMATION}`);
  }
  if (env.RAW_DATA_SHEDDING_ENABLED !== 'true') {
    missing.push('RAW_DATA_SHEDDING_ENABLED=true');
  }

  if (missing.length > 0) {
    throw new Error(
      `REFUSING raw_data shedding execute; missing gate(s): ${missing.join(', ')}.`,
    );
  }
}

