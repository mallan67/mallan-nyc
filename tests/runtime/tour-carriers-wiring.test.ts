/**
 * The 3D/video carriers reach every reader (2026-09-08 exhaustive live census): on this feed tours and
 * videos exist ONLY as Property.VirtualTourURLUnbranded[/2/3]/Branded (26,371 / 2,382 / 354 / 13,878
 * rows) — the Media subsection has 0 Video / 0 VirtualTour rows in any status. This pins the wiring:
 * the sync passes raw_data to the projection, the backfill selects it, every $select asks for all four
 * carriers, and the readers resolve them through the boundary helper — never a bare raw read.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('tour carriers — wiring', () => {
  it('lib/idx/sync.ts passes raw_data into BOTH projection inputs', () => {
    const s = src('lib/idx/sync.ts');
    const blocks = s.split('const projectionInput: ListingProjectionSource = {').slice(1);
    expect(blocks.length).toBe(2);
    for (const block of blocks) {
      const body = block.slice(0, block.indexOf('\n      };'));
      expect(body).toMatch(/raw_data: mapped\.raw_data as Record<string, unknown>,/);
    }
  });

  it('scripts/backfill-listing-search-projection.ts selects and forwards raw_data', () => {
    const s = src('scripts/backfill-listing-search-projection.ts');
    expect(s).toMatch(/raw_data: true/);
    expect(s).toMatch(/raw_data: \(listing\.raw_data/);
  });

  it('every runtime $select asks for all four carriers', () => {
    for (const file of ['lib/search/engine/select.ts', 'lib/idx/card-fields.ts']) {
      const s = src(file);
      for (const f of ['VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLUnbranded3', 'VirtualTourURLBranded']) expect(s).toContain(`"${f}"`);
    }
  });

  it('lib/idx/card-fields.ts is compile-checked against the contract', () => {
    expect(src('lib/idx/card-fields.ts')).toMatch(/cotalityFields\(["']Property["'],\s*\[/);
  });

  it('the CRM search DTO and the public DTO read every carrier by its live Cotality name — no invented wrapper', () => {
    const crm = src('lib/search/crm-idx-mapper.ts');
    for (const f of ['VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLUnbranded3', 'VirtualTourURLBranded']) expect(crm).toContain(`raw.${f}`);
    const dto = src('lib/idx/db-to-public-dto.ts');
    for (const f of ['VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLUnbranded3', 'VirtualTourURLBranded']) expect(dto).toContain(`rawData.${f}`);
    expect(crm + dto + src('lib/media/listing-media-resolver.ts')).not.toMatch(/providerTourUrls/);
  });
});
