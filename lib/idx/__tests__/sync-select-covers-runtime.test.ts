/**
 * One selection authority (Domain 2, 2026-09-08).
 *
 * The persisted select (`IDX_PLUS_SELECT_FIELDS`, what the sync stores in `raw_data`) must cover every
 * populated Property field the runtime provider paths (`SEARCH_SELECT_FIELDS`, `CARD_SELECT_FIELDS`) serve —
 * otherwise the DB-backed page and the provider-direct page show different facts for the same listing.
 * Likewise a `RAW_DATA_KEEP_FIELDS` entry is inert unless the field is actually requested from the provider.
 *
 * "Populated" is the live census in data/cotality-contract/contract.compact.json (populated > 0). Fields the
 * contract declares but the feed never fills (e.g. PetsAllowedYN, VirtualTourURLBranded2/3) are allowed in a
 * runtime select — a zero today is not an unsupported contract — but they are not required to be persisted.
 */
import fs from 'fs';
import path from 'path';
import { IDX_PLUS_SELECT_FIELDS } from '../trestle-mapper';
import { CARD_SELECT_FIELDS } from '../card-fields';
import { SEARCH_SELECT_FIELDS } from '@/lib/search/engine/select';
import { RAW_DATA_KEEP_FIELDS } from '@/lib/compliance/raw-data-keep-fields';

type CompactContract = { resources: { Property: { fields: Record<string, { populated: number }> } } };
const contract = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../data/cotality-contract/contract.compact.json'), 'utf8'),
) as CompactContract;
const PROPERTY = contract.resources.Property.fields;
const populated = (field: string): boolean => (PROPERTY[field]?.populated ?? 0) > 0;

describe('one selection authority — the persisted select covers what the runtime paths serve', () => {
  const persisted = new Set<string>(IDX_PLUS_SELECT_FIELDS as readonly string[]);

  it('every populated field requested by the runtime search / card selects is also persisted by the sync select', () => {
    const runtime = new Set<string>([...(SEARCH_SELECT_FIELDS as readonly string[]), ...(CARD_SELECT_FIELDS as readonly string[])]);
    const missing = [...runtime].filter((f) => populated(f) && !persisted.has(f)).sort();
    expect(missing).toEqual([]);
  });

  it('every live Property field the raw_data keep-list retains is actually requested from the provider', () => {
    const missing = (RAW_DATA_KEEP_FIELDS as readonly string[]).filter((f) => f in PROPERTY && !persisted.has(f)).sort();
    expect(missing).toEqual([]);
  });
});
