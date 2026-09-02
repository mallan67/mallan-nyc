/// <reference types="jest" />
/**
 * THE §2.05 24-HOUR DISPLAY-REMOVAL STEP MUST USE THE MODULE'S TERMINAL SET,
 * NOT A PRIVATE COPY OF IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS STEP IS
 *
 * app/api/cron/data-retention/route.ts step 3 flips `idx_display_yn=false` on
 * terminal listings that crossed the 24-hour boundary. Its own comment marks it
 * MANDATORY and carved out from the archive flag:
 *
 *   "⚠️ MANDATORY CARVE-OUT (OPS-009): this T+24h step runs UNCONDITIONALLY —
 *    it is REBNY UCBA Art. I §6 / RLS §2.05 display compliance (off-market
 *    removal), NOT archiving."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * The file declares `const TERMINAL_STATUSES` near the top and uses it for the
 * T+30 media strip and the T+180 archive. But this step did not use it. It
 * carried its own inline literal:
 *
 *   status: { in: ["Closed","Sold","Leased","Rented","Withdrawn","Expired","Cancelled"] }
 *
 * — a seventh copy of the terminal-status list, in the same file as the const it
 * duplicates, and it still carried only the invented `Cancelled` spelling. So a
 * listing the PROVIDER marked `Canceled` (the live Cotality value, written raw
 * into `listings.status` by the Trestle sync) was never flipped, and kept
 * `idx_display_yn = true` in the database indefinitely.
 *
 * PRECISION ABOUT THE CONSEQUENCE. The three public READ paths are allow-lists
 * (buildSearchDisplayWhere, buildProjectionSearchWhere,
 * filterDisplayableDbListings), so such a row still does not render on the
 * public site — that fail-closed posture holds and is not what this fixes. What
 * this fixes is the WRITER: `idx_display_yn` is the stored REBNY distribution
 * gate, the column that says whether Mallan is displaying a listing. Leaving it
 * true on a provider-canceled row means the 24-hour removal never happened as
 * far as the data is concerned, and any surface that leans on that column plus
 * its own status list — app/api/portal/comparables/route.ts does exactly this,
 * and says so in its comment ("the `idx_display_yn: true` filter is the
 * canonical fail-closed gate") — inherits the gap.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE TEST IS SHAPED THIS WAY
 *
 * Adding `"Canceled"` to the inline literal would fix today and leave the eighth
 * copy in place for tomorrow. The list has drifted seven times already. So the
 * assertion is not "the literal contains Canceled" — it is "there is no second
 * list", checked by extracting every status-array literal in the file and
 * requiring the terminal ones to be the same object.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTE = resolve(
  __dirname,
  '../../app/api/cron/data-retention/route.ts',
);
const src = readFileSync(ROUTE, 'utf8');

/** The module-level canonical set. */
function moduleTerminalStatuses(): string[] {
  const m = src.match(/const\s+TERMINAL_STATUSES\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('TERMINAL_STATUSES not found in the data-retention route');
  return (m[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''));
}

describe('the data-retention route has ONE terminal-status list', () => {
  it('the canonical set carries both spellings of canceled', () => {
    const statuses = moduleTerminalStatuses();
    expect(statuses).toContain('Canceled'); // the live Cotality value
    expect(statuses).toContain('Cancelled'); // the legacy value still on rows
  });

  it('no step re-declares the terminal list inline', () => {
    // Every `status: { in: [ ... ] }` in the file. A terminal-looking one that
    // is a literal rather than a spread of the const is a second owner.
    const inlineStatusArrays = src.match(/status:\s*\{\s*in:\s*\[[^\]]*\]/g) || [];
    const offenders = inlineStatusArrays.filter(
      (frag) => frag.includes('"Closed"') || frag.includes("'Closed'"),
    );
    expect(offenders).toEqual([]);
  });

  it('the §2.05 24-hour display-removal step reads the canonical set', () => {
    // Locate the step by its own compliance marker so this cannot drift onto a
    // different query.
    const idx = src.indexOf('MANDATORY CARVE-OUT (OPS-009)');
    expect(idx).toBeGreaterThan(-1);
    const step = src.slice(idx, idx + 1200);
    expect(step).toMatch(/status:\s*\{\s*in:\s*\[\.\.\.TERMINAL_STATUSES\]\s*\}/);
    // And it must still be unconditional — not moved behind the archive flag.
    expect(step).not.toMatch(/if\s*\(archiveWrites\)/);
  });
});

describe('rental comparables do not silently omit Mallan rentals', () => {
  const COMPS = resolve(__dirname, '../../app/api/portal/comparables/route.ts');
  const compsSrc = readFileSync(COMPS, 'utf8');

  it('the comps status list includes Rented', () => {
    // The list read ["Active","Closed","Sold","Leased"]. `Leased` is written by
    // NOTHING in this codebase — it survives only in read-side sets — while
    // `Rented` is what the CRM status route actually writes when a Mallan rental
    // closes (Pending → Rented). So rental comps included a status no row has
    // and excluded the one every Mallan rental ends up in.
    const m = compsSrc.match(/status:\s*\{\s*in:\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const statuses = (m![1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, ''));
    expect(statuses).toContain('Rented');
  });
});
