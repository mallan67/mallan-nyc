/**
 * ONE DOM rule (Maya 2026-09-08): every days-on-market consumer derives from lib/compliance/dom-tracker.ts — the
 * two clocks (market: on-market → contract signed; Coming Soon: its own) — and none keeps a private rule
 * (a created_at fallback, the provider's DaysOnMarket, a Pending-accruing set). Source ratchet: it fails when a
 * second rule reappears. `lib/idx/sync.ts` is HELD (its local ACTIVE_SEED_STATUSES still lists Pending) and is
 * recorded in the audit, not asserted here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

describe('one DOM rule — no consumer keeps a private clock', () => {
  it('the public market stats derive from the market clock, never (now - created_at) or the provider DaysOnMarket', () => {
    const s = read('app/api/market/route.ts');
    expect(s).toMatch(/marketDom\(/);
    expect(s).not.toMatch(/created_at\.getTime\(\)/);
    expect(s).not.toMatch(/Number\(r\.DaysOnMarket/);
    expect(s).toMatch(/cotalityFields\('Property'/);
  });
  it('the CRM listing mapper computes dom from the lifecycle, and Mallan rows never masquerade under the provider field', () => {
    expect(read('lib/search/crm-idx-mapper.ts')).not.toMatch(/dom:\s*num\(raw\.DaysOnMarket\)/);
    expect(read('lib/search/crm-idx-mapper.ts')).toMatch(/marketDom\(/);
    expect(read('lib/search/engine/hydrate.ts')).not.toMatch(/(^|[^A-Za-z_])DaysOnMarket:\s*r\.days_on_market/m);
    expect(read('lib/search/engine/hydrate.ts')).toMatch(/_mallanDaysOnMarket/);
  });
  it('comps and the market report use the market clock, not the provider DaysOnMarket', () => {
    expect(read('lib/comps/fetch-comps.ts')).toMatch(/marketDom\(/);
    expect(read('lib/comps/fetch-comps.ts')).not.toMatch(/r\.DaysOnMarket/);
    expect(read('lib/market-report/generator.ts')).toMatch(/marketDom\(/);
    expect(read('lib/market-report/generator.ts')).not.toMatch(/l\.DaysOnMarket/);
    expect(read('lib/cma/engine.ts')).toMatch(/marketDom\(/);
  });
  it('the declared UCBA rule table and the enforcement advisory derive from the tracker', () => {
    const rules = read('lib/compliance/rebny-ucba-rules.ts');
    expect(rules).toMatch(/DOM_ACCRUING_STATUSES/);
    expect(rules).not.toMatch(/'Active', 'ActiveUnderContract', 'Pending'/);
    expect(read('lib/compliance/rls-enforcement.ts')).toMatch(/DOM_RESET_ELIGIBLE_STATUSES/);
  });
  it('the orphan import seeds the clock from the provider on-market day, not a Pending-inclusive wall-clock set', () => {
    const s = read('app/api/cron/feed-reconcile/route.ts');
    expect(s).not.toMatch(/ACTIVE_SEED_STATUSES/);
    expect(s).toMatch(/marketClockStart\(/);
  });
  it('the rules JSON mirrors the one rule (Pending accrues until the close; the clocks are named; the end is CloseDate / OffMarketDate, never PurchaseContractDate)', () => {
    const json = JSON.parse(read('compliance/rules/status-rules.json')) as { statuses?: Record<string, { domAccrues?: boolean }>; domRules: Record<string, unknown> };
    const pending = (json.statuses ?? (json as unknown as Record<string, Record<string, { domAccrues?: boolean }>>).statusRules ?? {}).Pending;
    if (pending) expect(pending.domAccrues).toBe(true);
    expect(String(json.domRules.marketClock)).toMatch(/OnMarketDate/);
    expect(String(json.domRules.marketClock)).toMatch(/CloseDate/);
    expect(String(json.domRules.marketClock)).toMatch(/OffMarketDate/);
    expect(String(json.domRules.marketClock)).not.toMatch(/until the contract is signed/);
    expect(String(json.domRules.comingSoonClock)).toMatch(/ContractStatusChangeDate/);
    expect(json.domRules.accruingStatuses).toEqual(['Active', 'ActiveUnderContract', 'Pending']);
    expect(json.domRules.stopsAt).toBeUndefined();
    expect(json.domRules.endsAt).toEqual({ closed: 'CloseDate', removal: 'OffMarketDate' });
    const rules = read('lib/compliance/rebny-ucba-rules.ts');
    expect(rules).not.toMatch(/stopsAt: 'Pending'/);
    expect(rules).toMatch(/endsAt: \{ closed: 'CloseDate', removal: 'OffMarketDate' \}/);
  });
});
