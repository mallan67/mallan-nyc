#!/usr/bin/env tsx
/**
 * Smoke-test the two Trestle fetchers that the listing page relies on when
 * Neon is unreachable. Exercises every failure mode the production soft-404s
 * were showing:
 *
 *   1. fetchSingleListing("RLS20059088")   — string ListingId (always worked)
 *   2. fetchSingleListing("1146011469")    — numeric ListingKey (was returning null)
 *   3. fetchListingByAddress(217 W 57th)   — composed directional prefix (was returning null)
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-listing-resolution.ts
 */
import { fetchSingleListing, fetchListingByAddress } from '../lib/idx/fetch';

(async () => {
  const results: Array<{ label: string; ok: boolean; detail: string }> = [];

  const r1 = await fetchSingleListing('RLS20059088');
  results.push({
    label: 'fetchSingleListing by ListingId (string)',
    ok: !!r1 && r1.ListingId === 'RLS20059088',
    detail: r1 ? `id=${r1.ListingId} key=${r1.ListingKey}` : 'null',
  });

  const r2 = await fetchSingleListing('1146011469');
  results.push({
    label: 'fetchSingleListing by ListingKey (numeric)',
    ok: !!r2 && r2.ListingId === 'RLS20059088',
    detail: r2 ? `id=${r2.ListingId} key=${r2.ListingKey}` : 'null',
  });

  const r3 = await fetchListingByAddress({
    streetNumber: '217',
    streetName: 'w 57th street',
    city: 'new york city',
    postalCode: '10019',
    unitNumber: '127128',
  });
  results.push({
    label: 'fetchListingByAddress 217 W 57th St #127/128',
    ok: !!r3 && r3.ListingId === 'RLS20059088',
    detail: r3 ? `id=${r3.ListingId} unit=${r3.UnitNumber}` : 'null',
  });

  // Negative: garbage key should still return null.
  const r4 = await fetchSingleListing('DOES_NOT_EXIST_123');
  results.push({
    label: 'fetchSingleListing garbage key → null (negative)',
    ok: r4 === null,
    detail: r4 === null ? 'null' : `unexpected: ${JSON.stringify(r4).slice(0,80)}`,
  });

  // Negative: ZIP with no 217 street number should return null.
  const r5 = await fetchListingByAddress({
    streetNumber: '999999',
    streetName: 'fake street',
    city: 'new york',
    postalCode: '10019',
  });
  results.push({
    label: 'fetchListingByAddress no match → null (negative)',
    ok: r5 === null,
    detail: r5 === null ? 'null' : `unexpected: ${JSON.stringify(r5).slice(0,80)}`,
  });

  console.log('\n=== Listing-resolution smoke test ===\n');
  let pass = 0, fail = 0;
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.label}  —  ${r.detail}`);
    r.ok ? pass++ : fail++;
  }
  console.log(`\nsummary: ${pass} pass · ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
