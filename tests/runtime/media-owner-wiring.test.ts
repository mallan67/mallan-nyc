/**
 * Media has different owners (Maya 2026-09-08): every runtime consumer of Cotality Media declares the owner it reads.
 * Source ratchet: a top-level Media query names the Property owner; the listing_media writer never stores a foreign
 * owner; the Property→Media $expand sites send the one select (which carries ResourceName) so the resolver can prove
 * each row's owner. `lib/idx/sync.ts` is HELD (three literal Media selects, no owner predicate) and is recorded in
 * the audit, not asserted here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

/** Runtime sites that query /odata/Media at the top level (keyed by ResourceRecordKey / ResourceRecordID). */
const TOP_LEVEL_MEDIA_QUERIES = [
  'lib/search/engine/hydrate.ts',
  'lib/idx/fetch.ts',
  'app/api/media/batch/route.ts',
  'app/api/agents/[slug]/listings/route.ts',
  'lib/idx/media-sync.ts',
];

describe('media owners — no consumer flattens the contexts', () => {
  it.each(TOP_LEVEL_MEDIA_QUERIES)('%s scopes its top-level Media query to the Property owner', (file) => {
    expect(read(file)).toMatch(/PROPERTY_MEDIA_FILTER/);
  });
  it('the listing_media writer stores Property media only and counts a foreign owner instead of flattening it', () => {
    const s = read('lib/idx/media-sync.ts');
    expect(s).toMatch(/skippedForeignOwner/);
    expect(s).toMatch(/ResourceName/);
  });
  it('every Property→Media $expand sends the one select (ResourceName included) so the resolver proves each row\'s owner', () => {
    for (const f of ['lib/idx/fetch.ts', 'app/api/cron/feed-reconcile/route.ts', 'lib/buildings/public-building-data.ts']) {
      expect(read(f)).toMatch(/Media\(\$select=\$\{MEDIA_SELECT_FIELDS\.join\(/);
    }
  });
  it('agent portraits are Mallan-owned files, never a listing photo and never a Member media read (0 Member rows live)', () => {
    expect(read('prisma/schema.prisma')).toMatch(/photo\s+String\?\s*\/\/ URL path e\.g\. "\/images\/agents\//);
    expect(read('lib/agents/avatar.ts')).not.toMatch(/listing_media|MediaURL|odata\/Media/);
  });
});
