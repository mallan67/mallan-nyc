/**
 * HERO AUTHORITY — explicit precedence between a CRM choice and the feed hint.
 *
 * PROVEN DEFECT IN THE OLD SET-MAIN. `PATCH /api/crm/listings/[id]/media/[mediaId]`
 * cleared `preferred_photo_yn` on EVERY active sibling, including Trestle feed
 * rows. But `preferred_photo_yn` on a feed row is source-owned: media-sync
 * rewrites it from `PreferredPhotoYN` on every complete set
 * (media-sync.ts:1263/1293) and treats a difference as a MATERIAL change
 * (media-sync.ts:975). So the clear
 *
 *   1. mutated source-owned metadata,
 *   2. was reverted by the next sync — silently undoing the agent's choice, and
 *   3. produced a material rewrite of every feed row each time — write
 *      amplification, which is one of the problems this PR exists to remove.
 *
 * THE POLICY. Set-main clears only `crm:` siblings. Hero precedence is:
 *     CRM-preferred  >  feed-preferred  >  lowest order  >  first-encountered
 * so an explicit agent choice survives every subsequent sync without anyone
 * writing to a feed row.
 */

import { selectHeroPhoto } from '@/lib/idx/media-sync';

const base = { media_type: 'Photo', status: 'active', preferred_photo_yn: false, order: 0 };

const feedPlain = { ...base, media_key: '1001', order: 0 };
const feedPreferred = { ...base, media_key: '1002', order: 1, preferred_photo_yn: true };
const crmPlain = { ...base, media_key: 'crm:SL-1:aaa', order: 50 };
const crmPreferred = { ...base, media_key: 'crm:SL-1:bbb', order: 51, preferred_photo_yn: true };

describe('CRM choice outranks the feed hint', () => {
  it('a crm: preferred photo beats a feed preferred photo', () => {
    // Without this, the feed row ties on `preferred` and wins on `order`
    // (feed rows are ordered 0..N, CRM uploads appended after) — which is
    // exactly how the agent's set-main silently reverted after a sync.
    expect(selectHeroPhoto([feedPreferred, crmPreferred])?.media_key).toBe(crmPreferred.media_key);
  });

  it('a crm: preferred photo beats a lower-ordered feed photo', () => {
    expect(selectHeroPhoto([feedPlain, crmPreferred])?.media_key).toBe(crmPreferred.media_key);
  });

  it('an UNpreferred crm: photo does NOT jump the queue', () => {
    // Only an explicit choice carries authority; merely being CRM does not.
    expect(selectHeroPhoto([feedPlain, crmPlain])?.media_key).toBe(feedPlain.media_key);
  });
});

describe('behavior is UNCHANGED when no CRM choice exists', () => {
  it('feed preferred still wins over feed plain', () => {
    expect(selectHeroPhoto([feedPlain, feedPreferred])?.media_key).toBe(feedPreferred.media_key);
  });

  it('lowest order wins among equals', () => {
    const a = { ...base, media_key: '2001', order: 5 };
    const b = { ...base, media_key: '2002', order: 2 };
    expect(selectHeroPhoto([a, b])?.media_key).toBe('2002');
  });

  it('first-encountered breaks a total tie (stable)', () => {
    const a = { ...base, media_key: '3001', order: 0 };
    const b = { ...base, media_key: '3002', order: 0 };
    expect(selectHeroPhoto([a, b])?.media_key).toBe('3001');
  });

  it('rows WITHOUT media_key behave exactly as before', () => {
    // media_key is optional — a caller that has not widened its select must be
    // byte-identical to the pre-change ordering.
    const p = { ...base, order: 9, preferred_photo_yn: true };
    const q = { ...base, order: 1 };
    expect(selectHeroPhoto([q, p])).toBe(p);
  });
});

describe('eligibility is unchanged', () => {
  it('a deleted crm: preferred row is not the hero', () => {
    const deleted = { ...crmPreferred, status: 'deleted' };
    expect(selectHeroPhoto([feedPlain, deleted])?.media_key).toBe(feedPlain.media_key);
  });

  it('a crm: preferred FLOOR PLAN is never the hero', () => {
    const fp = { ...crmPreferred, media_type: 'FloorPlan' };
    expect(selectHeroPhoto([feedPlain, fp])?.media_key).toBe(feedPlain.media_key);
  });

  it('returns null when nothing is eligible', () => {
    expect(selectHeroPhoto([{ ...base, status: 'deleted' }])).toBeNull();
  });
});
