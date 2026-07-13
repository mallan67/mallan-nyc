/**
 * Repository guard: the shared media resolver must be the SOLE hero-selection
 * authority. Fails when a card/public consumer:
 *   (1) selects a hero without importing lib/media/listing-media-resolver, or
 *   (2) re-introduces the "photo by empty mediaType" accept — the exact defect
 *       that let null-category DOCUMENT- floor plans become card heroes.
 *
 * This is a lint-style test (reads source, not behaviour) so a future consumer
 * that hand-rolls hero selection fails CI instead of silently regressing.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';

const ROOT = resolve(__dirname, '../../..');

// Every surface that selects a card/thumbnail/public hero image.
const HERO_PRODUCERS = [
  'app/api/media/batch/route.ts',
  'app/api/listings/similar/route.ts',
  'lib/idx/agent-card-media.ts',
  'lib/media/listing-card-media.ts',
  'lib/idx/db-to-public-dto.ts',
  'lib/idx/public-dto.ts',
  'lib/search/crm-idx-mapper.ts',
];

// The empty-mediaType photo accept: `mediaType === 'Photo' || !<x>mediaType`.
// Use classifyMediaItem() (URL-shape aware) instead.
const EMPTY_TYPE_ACCEPT = /mediaType\s*===\s*['"]Photo['"]\s*\|\|\s*!\s*[\w.?]*mediaType/;

// Files explicitly permitted to match, each with a written justification.
const ALLOWLIST = new Set<string>([]);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

describe('hero-selection guard', () => {
  it.each(HERO_PRODUCERS)('%s imports the shared media resolver', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).toMatch(/listing-media-resolver/);
  });

  it('no consumer accepts a photo by empty mediaType (null-category floor-plan leak)', () => {
    const roots = ['app', 'lib', 'public/crm/js'].map((d) => join(ROOT, d));
    const offenders: string[] = [];
    for (const r of roots) {
      for (const f of walk(r)) {
        const rel = relative(ROOT, f).replace(/\\/g, '/');
        if (ALLOWLIST.has(rel)) continue;
        if (EMPTY_TYPE_ACCEPT.test(stripComments(readFileSync(f, 'utf8')))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
