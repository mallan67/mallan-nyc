/**
 * Domain 4 (2026-09-08) — agent / office attribution.
 *
 * Provider facts (whole corpus, live): every buyer-side scalar is suppressed except BuyerAgentMlsId and
 * BuyerOfficeMlsId; the list side is populated; the CoListAgent2 / CoListOffice2 fields (~51k rows) and the
 * CoListAgent3 fields (~8k) are populated scalars even though the CoListAgent navigation returns only the first
 * co-list agent.
 *
 * Mallan facts: `syncAgentHistory` stamps `agent_id` onto THIRD-PARTY feed rows where a Mallan agent was the
 * BUYER (BuyerAgentMlsId match). `agent_id` is therefore never ownership. A public renderer that treats it as
 * ownership publishes a false claim of brokerage (NY DOS 19 NYCRR §175.25, UCBA Art. III §2(C)) and, through
 * the exclusive card, a third-party agent's email / phone.
 */
import * as fs from 'fs';
import * as path from 'path';
import { RAW_DATA_KEEP_FIELDS } from '@/lib/compliance/raw-data-keep-fields';
import { IDX_PLUS_SELECT_FIELDS } from '@/lib/idx/trestle-mapper';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('public attribution never defaults to Mallan for a third-party listing', () => {
  it('the agent-listings card falls back to the neutral attribution on the third-party branch', () => {
    const src = read('app/agents/[name]/listings/ActiveListingsTabs.tsx');
    expect(src).toMatch(/RLS · Listing Courtesy of \$\{publicListOfficeName\(listing\.listOfficeName\)\}/);
    expect(src).not.toMatch(/listOfficeName \|\| 'Mallan Real Estate Inc\.'/);
  });
});

describe('the attribution facts the feed delivers are retained losslessly', () => {
  const kept = new Set<string>(RAW_DATA_KEEP_FIELDS as readonly string[]);
  const selected = new Set<string>(IDX_PLUS_SELECT_FIELDS as readonly string[]);

  it('co-list agents 2 and 3 and the second co-list office (populated scalars) are selected and kept', () => {
    for (const f of ['CoListAgent2FullName', 'CoListAgent3FullName', 'CoListOffice2Name', 'CoListOffice2MlsId']) {
      expect(selected.has(f)).toBe(true);
      expect(kept.has(f)).toBe(true);
    }
  });

  it('the buyer-side OFFICE identity (the only buyer-side facts the feed delivers besides the private agent id) is selected and kept', () => {
    for (const f of ['BuyerOfficeMlsId', 'CoBuyerOfficeMlsId']) {
      expect(selected.has(f)).toBe(true);
      expect(kept.has(f)).toBe(true);
    }
  });
});
