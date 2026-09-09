/// <reference types="jest" />
export {};
/**
 * BUILD DRIFT — `public/crm/index-built.html` must be exactly what `public/crm/build.js` produces from the
 * current sources.
 *
 * `index-built.html` is a GENERATED file (CLAUDE.md §A.2: never edit it by hand) assembled from
 * `public/crm/index.html`, the `public/crm/html/*.html` partials and `public/crm/js/**\/*.js`. It is also the file
 * the CRM actually SERVES. So a source change that is not followed by `npm run crm:build` ships nothing — the
 * corrected partial sits in the repo while the browser keeps loading the stale build. Equally, a hand-edit to the
 * built file survives until the next rebuild silently reverts it.
 *
 * Owner instruction 2026-09-09: *"Rebuild index-built.html only after the source changes are complete, then run
 * the build-drift check."* There was no such check — only a manual rebuild-and-compare that nothing enforced.
 * This is it.
 *
 * The test runs the real builder and byte-compares, then RESTORES whatever was on disk, so it can never leave the
 * working tree different from how it found it (including when it fails).
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const BUILT = resolve(ROOT, 'public/crm/index-built.html');
const BUILDER = resolve(ROOT, 'public/crm/build.js');

describe('the served CRM build matches its sources', () => {
  // The builder inlines ~60 files; give it room on a cold Windows filesystem.
  jest.setTimeout(180_000);

  it('running public/crm/build.js reproduces index-built.html byte for byte', () => {
    const onDisk = readFileSync(BUILT);
    let rebuilt: Buffer;
    try {
      execFileSync(process.execPath, [BUILDER], { cwd: ROOT, stdio: 'pipe' });
      rebuilt = readFileSync(BUILT);
    } finally {
      // Always put back exactly what was there — a failing drift check must not "helpfully" commit the rebuild.
      writeFileSync(BUILT, onDisk);
    }

    if (!rebuilt.equals(onDisk)) {
      throw new Error(
        'index-built.html is STALE: a source file under public/crm/ changed without a rebuild.\n' +
        `  on disk: ${onDisk.length} bytes\n` +
        `  rebuilt: ${rebuilt.length} bytes\n` +
        'Run `npm run crm:build` and commit the regenerated file. Never hand-edit index-built.html.'
      );
    }
    expect(rebuilt.equals(onDisk)).toBe(true);
  });
});
