/**
 * SOURCE-INSPECTION TESTS MUST BE LINE-ENDING PORTABLE.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * `tests/runtime/building-manifest-cache-size.test.ts:114` asserted:
 *
 *   src.toContain("warmBuildingManifestShards(\n  shards: readonly string[] = ...,\n)")
 *
 * The implementation (`lib/buildings/public-building-data.ts:1224-1226`) matches
 * that shape EXACTLY. The test still failed on Windows, because
 * `core.autocrlf=true` checks the file out with CRLF endings:
 *
 *   1343 CRLF / 0 bare LF
 *   LF-needle   present: false   <- why it failed locally
 *   CRLF-needle present: true    <- implementation was correct all along
 *
 * So the suite was permanently red on Windows and green in CI — a platform
 * artifact reported as a baseline code defect. The fix belongs in the test
 * harness (`tests/helpers/read-source.ts`), NOT in production source, NOT in
 * `core.autocrlf`, and NOT in a global re-write of repository line endings.
 *
 * A repo-wide audit found exactly ONE such assertion, so this is a narrow,
 * fully-enumerated class rather than a systemic rewrite.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizeEol, readSource } from '../helpers/read-source';

const SIGNATURE =
  'warmBuildingManifestShards(\n  shards: readonly string[] = BUILDING_MANIFEST_SHARDS,\n)';

describe('normalizeEol', () => {
  it('collapses CRLF to LF', () => {
    expect(normalizeEol('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('collapses a lone CR to LF', () => {
    expect(normalizeEol('a\rb\rc')).toBe('a\nb\nc');
  });

  it('leaves LF text untouched (idempotent)', () => {
    const lf = 'a\nb\nc';
    expect(normalizeEol(lf)).toBe(lf);
    expect(normalizeEol(normalizeEol(lf))).toBe(normalizeEol(lf));
  });

  it('does not invent or drop trailing newlines', () => {
    expect(normalizeEol('a\r\n')).toBe('a\n');
    expect(normalizeEol('a')).toBe('a');
  });
});

describe('readSource is portable across BOTH checkout styles', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eol-portability-'));
  const lfFile = path.join(dir, 'lf-fixture.ts');
  const crlfFile = path.join(dir, 'crlf-fixture.ts');

  // Byte-level fixtures: identical content, different line terminators.
  const body = `export async function ${SIGNATURE}: Promise<ManifestWarmResult> {\n  return null;\n}\n`;

  beforeAll(() => {
    fs.writeFileSync(lfFile, body, 'utf8');
    fs.writeFileSync(crlfFile, body.replace(/\n/g, '\r\n'), 'utf8');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the two fixtures really do differ at the byte level', () => {
    const lfBytes = fs.readFileSync(lfFile);
    const crlfBytes = fs.readFileSync(crlfFile);
    expect(crlfBytes.includes(Buffer.from('\r\n'))).toBe(true);
    expect(lfBytes.includes(Buffer.from('\r\n'))).toBe(false);
    expect(lfBytes.equals(crlfBytes)).toBe(false);
  });

  it('RAW read fails on the CRLF fixture — reproducing the original bug', () => {
    const raw = fs.readFileSync(crlfFile, 'utf8');
    expect(raw.includes(SIGNATURE)).toBe(false); // <- the bug
  });

  it('readSource matches the LF fixture', () => {
    expect(readSource(lfFile)).toContain(SIGNATURE);
  });

  it('readSource matches the CRLF fixture', () => {
    expect(readSource(crlfFile)).toContain(SIGNATURE);
  });

  it('readSource yields IDENTICAL text for both fixtures', () => {
    expect(readSource(lfFile)).toBe(readSource(crlfFile));
  });
});

describe('the real implementation is matched on this platform', () => {
  it('finds the warm signature in lib/buildings/public-building-data.ts', () => {
    const src = readSource(
      path.join(process.cwd(), 'lib', 'buildings', 'public-building-data.ts'),
    );
    expect(src).toContain(SIGNATURE);
  });
});
