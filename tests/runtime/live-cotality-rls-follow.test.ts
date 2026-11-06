/// <reference types="jest" />
/**
 * LIVE: the scheduled follow job's own request to Cotality (lib/listings/rls-follow-fetch.ts), against the real Cotality API. Nothing about Cotality is stubbed: the token and the Property query are
 * the real ones.
 *
 * It runs only when IDX_CLIENT_ID and IDX_CLIENT_SECRET are in the environment (pull-request CI has none, by design). Without them every test here is SKIPPED, and a skipped live test is not a pass:
 * say "offline" about the run, never "verified". tools/mallan-live-tests.js in mallan-ops runs it with the credentials from the Vercel Development scope, in memory.
 *
 * What it proves, for SL-0010 <-> RLS20123633:
 *   1. the job's $select and $expand are ones live Cotality accepts (a custom key in $select, or a field that is not a Property column, is a 400 and the whole run writes nothing)
 *   2. the record that comes back is the listing's own (Mallan's office) and carries the REBNY custom key the RE tax lives in (TaxMonthlyAmount), flattened in, with no other custom field
 *   3. what the plan makes of it: the annual tax is monthly x 12 (live: "1571.00" monthly, no TaxAnnualAmount)
 */
import { getAccessToken } from '@/lib/idx/auth';
import { fetchRlsRecords } from '@/lib/listings/rls-follow-fetch';
import { CUSTOM_FOLLOW_KEYS, FOLLOW_SELECT, FOLLOWED_FACTS, planRlsFollow } from '@/lib/listings/rls-followed-facts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const LIVE = !!((process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY) && (process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET));
const live = LIVE ? describe : describe.skip;
jest.setTimeout(120000);

const RLS = 'RLS20123633';
const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/+$/, '');

let fetched: Awaited<ReturnType<typeof fetchRlsRecords>>;
let record: Record<string, unknown> | undefined;
let customFields: Record<string, unknown> = {};

beforeAll(async () => {
  if (!LIVE) return;
  fetched = await fetchRlsRecords([RLS]);
  record = fetched.ok ? fetched.records.get(RLS) : undefined;
  // the oracle: the same record read independently, with its whole custom-fields text
  const token = await getAccessToken();
  const r = await fetch(`${BASE}/odata/Property?$filter=${encodeURIComponent(`ListingId eq '${RLS}'`)}&$top=2&$expand=${encodeURIComponent('CustomProperty($select=CustomFields)')}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`the oracle query failed: HTTP ${r.status}`);
  const rows = (await r.json()).value as Array<{ CustomProperty?: Array<{ CustomFields?: string }> }>;
  if (rows.length !== 1) throw new Error(`expected one live record for ${RLS}, found ${rows.length}`);
  try { customFields = JSON.parse(rows[0].CustomProperty?.[0]?.CustomFields ?? '{}'); } catch { customFields = {}; }
});

live('LIVE: the follow job asks Cotality for RLS20123633', () => {
  it("live Cotality accepts the job's own $select and $expand, and answers with the listing's record (Mallan's office)", () => {
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.refused).toEqual([]);
    expect(record).toBeDefined();
    expect(record?.ListingId).toBe(RLS);
    expect(String(record?.ListOfficeMlsId)).toBe('7041');
  });

  it('the REBNY custom key the RE tax lives in is read from the custom fields and flattened into the record, and nothing else of the custom fields comes with it', () => {
    expect(CUSTOM_FOLLOW_KEYS).toContain('TaxMonthlyAmount');
    expect(Number(customFields.TaxMonthlyAmount)).toBeGreaterThan(0);                      // live today: "1571.00"
    expect(record?.TaxMonthlyAmount).toBe(customFields.TaxMonthlyAmount);
    expect(record).not.toHaveProperty('CustomProperty');
    // (a custom key that is also a Property column the job asks for, such as ListingKey, is there as the column)
    for (const other of Object.keys(customFields).filter((k) => !CUSTOM_FOLLOW_KEYS.includes(k) && !FOLLOW_SELECT.includes(k))) expect(record).not.toHaveProperty(other);
  });

  it('every fact the job follows that live Cotality holds is in the record it gets, as live holds it', () => {
    const missing = FOLLOWED_FACTS.filter((f) => !f.custom).map((f) => f.cotality).filter((k) => !(k in (record ?? {})));
    expect(missing).toEqual([]);                                                          // the $select names real Property columns (an unknown one would have been a 400 above)
  });

  it('the plan for a listing with no tax yet: the monthly tax as Cotality holds it, and the annual tax as monthly x 12 (no TaxAnnualAmount is sent for this listing)', () => {
    expect(record?.TaxAnnualAmount ?? null).toBeNull();
    const monthly = Number(customFields.TaxMonthlyAmount);
    const plan = planRlsFollow({ list_price: 1, bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 1, living_area: 1, features: {}, address: {}, raw_data: {} }, record as Record<string, unknown>);
    expect(plan.features.TaxMonthlyAmount).toBe(monthly);
    expect(plan.features.TaxAnnualAmount).toBe(Math.round(monthly * 12 * 100) / 100);
    expect(plan.raw).toMatchObject({ saleTaxMonthly: monthly, saleRETaxes: Math.round(monthly * 12 * 100) / 100 });
  });
});
