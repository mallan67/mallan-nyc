import { readFileSync } from 'fs';
import { resolve } from 'path';
import { IDX_PLUS_SELECT_FIELDS } from '../trestle-mapper';
import { RAW_DATA_KEEP_SET } from '@/lib/compliance/raw-data-keep-fields';

/**
 * End-to-end ingestion guard for the move-in cost fields (Codex review on #342).
 *
 * Restoring the fields to RAW_DATA_KEEP_FIELDS is not enough on its own:
 * fetchFromTrestle() builds its $select from IDX_PLUS_SELECT_FIELDS
 * (the fields come from B27_RENTAL). Unless the
 * fields are in that select set, the Trestle response never carries them and the
 * keep-list has nothing to persist for Trestle-imported rows.
 *
 * The chain that must hold for MoveInCostsAmount + MoveInCostsComments:
 *   live in Cotality  →  selected from Cotality  →  preserved in raw_data.
 * MoveInCostsAmountTotal must remain OUT of every link (still phantom).
 */
const LIVE = ['MoveInCostsAmount', 'MoveInCostsComments'];

describe('MoveInCosts* ingestion chain (live → select → raw_data)', () => {
  // Every field name declared in live $metadata (committed as data/cotality-enums.live.json).
  const live = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf-8'));
  const liveNames = new Set<string>(
    Object.values(live.entities as Record<string, Record<string, string>>).flatMap((e) => Object.keys(e)),
  );

  it('1. live in Cotality $metadata', () => {
    for (const f of LIVE) expect(liveNames.has(f)).toBe(true);
  });

  it('2. selected from Cotality — in IDX_PLUS_SELECT_FIELDS (drives fetch $select)', () => {
    for (const f of LIVE) expect(IDX_PLUS_SELECT_FIELDS).toContain(f);
  });

  it('3. the fetch $select string actually requests both fields', () => {
    // fetchFromTrestle() uses IDX_PLUS_SELECT_FIELDS.join(',') as $select.
    const select = IDX_PLUS_SELECT_FIELDS.join(',');
    for (const f of LIVE) {
      expect(select.split(',')).toContain(f);
    }
  });

  it('4. preserved in raw_data — in RAW_DATA_KEEP_SET', () => {
    for (const f of LIVE) expect(RAW_DATA_KEEP_SET.has(f)).toBe(true);
  });

  it('5. MoveInCostsAmountTotal stays OUT of every link (still phantom)', () => {
    expect(liveNames.has('MoveInCostsAmountTotal')).toBe(false);
    expect(IDX_PLUS_SELECT_FIELDS).not.toContain('MoveInCostsAmountTotal');
    expect(RAW_DATA_KEEP_SET.has('MoveInCostsAmountTotal')).toBe(false);
  });
});
