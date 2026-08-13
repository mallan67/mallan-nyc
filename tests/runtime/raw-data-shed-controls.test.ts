/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';
import {
  RAW_SHED_CONFIRMATION,
  RAW_SHED_DEFAULT_DRY_RUN_ROWS,
  RAW_SHED_MAX_ROWS,
  assertRawDataShedExecuteAllowed,
  parseRawDataShedArgs,
} from '@/lib/retention/raw-data-shed-controls';

const SCRIPT = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/neon-shed-raw-data.ts'),
  'utf8',
);

describe('raw_data shedding CLI is bounded and dry-run by default', () => {
  it('defaults to a bounded 5K audit with no write authority', () => {
    expect(parseRawDataShedArgs([])).toEqual(expect.objectContaining({
      execute: false,
      maxRows: RAW_SHED_DEFAULT_DRY_RUN_ROWS,
      batchSize: 500,
      maxBatches: 10,
    }));
  });

  it('requires an explicit row bound for execute', () => {
    expect(() => parseRawDataShedArgs(['--execute'])).toThrow(
      /requires an explicit --max-rows/,
    );
  });

  it('accepts the old --limit spelling only as a bounded compatibility alias', () => {
    expect(parseRawDataShedArgs(['--execute', '--limit=100'])).toEqual(
      expect.objectContaining({ execute: true, maxRows: 100 }),
    );
  });

  it('rejects zero, fractional, malformed, and over-ceiling row bounds', () => {
    for (const value of ['0', '-1', '1.5', 'nope']) {
      expect(() => parseRawDataShedArgs([`--max-rows=${value}`])).toThrow(/positive integer/);
    }
    expect(() => parseRawDataShedArgs([`--max-rows=${RAW_SHED_MAX_ROWS + 1}`]))
      .toThrow(/hard safety ceiling/);
  });

  it('bounds batch size and max-batches inside the row ceiling', () => {
    expect(() => parseRawDataShedArgs(['--max-rows=100', '--batch=1001']))
      .toThrow(/RAW_SHED_MAX_BATCH_SIZE/);
    expect(() => parseRawDataShedArgs([
      '--max-rows=1000',
      '--batch=500',
      '--max-batches=3',
    ])).toThrow(/bounded run requirement/);
  });

  it('--dry-run/--audit-only always overrides a stray --execute', () => {
    expect(parseRawDataShedArgs(['--execute', '--dry-run']).execute).toBe(false);
    expect(parseRawDataShedArgs(['--execute', '--audit-only']).execute).toBe(false);
  });
});

describe('raw_data shedding execute needs three independent approvals', () => {
  const ready = parseRawDataShedArgs([
    '--execute',
    '--max-rows=5000',
    '--ack-rollback-branch',
    `--confirm=${RAW_SHED_CONFIRMATION}`,
  ]);

  it('rejects a request missing every gate and names them all', () => {
    const unready = parseRawDataShedArgs(['--execute', '--max-rows=5000']);
    expect(() => assertRawDataShedExecuteAllowed(unready, {})).toThrow(
      /--ack-rollback-branch.*--confirm=SHED_RAW_DATA.*RAW_DATA_SHEDDING_ENABLED=true/,
    );
  });

  it('rejects near-match confirmations and non-exact env values', () => {
    const wrongConfirm = { ...ready, confirmation: 'shed_raw_data' };
    expect(() => assertRawDataShedExecuteAllowed(wrongConfirm, {
      RAW_DATA_SHEDDING_ENABLED: 'true',
    })).toThrow(/--confirm=SHED_RAW_DATA/);
    expect(() => assertRawDataShedExecuteAllowed(ready, {
      RAW_DATA_SHEDDING_ENABLED: 'TRUE',
    })).toThrow(/RAW_DATA_SHEDDING_ENABLED=true/);
  });

  it('permits execute only when all gates are exact', () => {
    expect(() => assertRawDataShedExecuteAllowed(ready, {
      RAW_DATA_SHEDDING_ENABLED: 'true',
    })).not.toThrow();
  });

  it('never requires execute approvals for dry-run', () => {
    const dryRun = parseRawDataShedArgs(['--max-rows=5000']);
    expect(() => assertRawDataShedExecuteAllowed(dryRun, {})).not.toThrow();
  });
});

describe('operator script wires guards before its first query', () => {
  it('checks canonical host and execute authorization before listing.count', () => {
    const hostGuard = SCRIPT.indexOf('assertCanonicalHost(databaseUrl)');
    const executeGuard = SCRIPT.indexOf('assertRawDataShedExecuteAllowed(parsed, process.env)');
    const firstQuery = SCRIPT.indexOf('prisma.listing.count');
    expect(hostGuard).toBeGreaterThan(-1);
    expect(executeGuard).toBeGreaterThan(hostGuard);
    expect(firstQuery).toBeGreaterThan(executeGuard);
  });

  it('contains no Infinity/unbounded fallback', () => {
    expect(SCRIPT).not.toContain('Infinity');
  });
});

