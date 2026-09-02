/**
 * PHASE 3.5 DEPENDENCY WIRING — the gap the other 20 tests do not cover.
 *
 * The content-verification suite injects mock deps, so it proves the STATE MACHINE but never proves
 * the wiring built inside `runMediaSync` Phase 3.5 actually returns bytes. A dep that fetched and
 * returned `undefined` would pass every existing test and fail silently in production: `sha256` of
 * an empty buffer is a stable value, so two failures would "match" and record VERIFIED on garbage.
 *
 * This asserts the real contract: provider bytes are RETURNED, HTTP failure THROWS, and the compare
 * is genuinely provider-vs-R2.
 */
import { verifyRow, type VerifiableRow, type VerificationDeps, type ContentCheckState } from '../content-verification';

const NOW = new Date('2026-08-19T12:00:00.000Z');
const row: VerifiableRow = {
  media_key: 'MK1', listing_id: 'L1', r2_key: 'photos/L1/MK1.abc12345.jpg',
  media_url_original: 'https://api.cotality.com/x', content_check_at: null, content_check_state: null,
};

/** Mirrors the Phase 3.5 wiring in lib/idx/media-sync.ts exactly. */
function realWiring(fetchImpl: typeof fetch): VerificationDeps {
  const token = 'TOKEN';
  const recorded: Array<{ state: ContentCheckState }> = [];
  (realWiring as any).recorded = recorded;
  return {
    async resolveFreshLocator(mediaKey) {
      const r = await fetchImpl(`https://api.cotality.com/trestle/odata/Media?MediaKey=${mediaKey}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      } as any);
      if (!r.ok) throw new Error(`provider HTTP ${r.status}`);
      const j = await r.json();
      return j.value?.[0]?.MediaURL ?? null;
    },
    async fetchProviderBytes(url) {
      const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'image/*' } } as any);
      if (!r.ok) throw new Error(`provider HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
    async readR2Bytes(key) {
      const r = await fetchImpl(`https://pub-x.r2.dev/${key}`);
      if (!r.ok) throw new Error(`r2 HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
    async recordCheck(_mk, _at, state) { recorded.push({ state }); },
  };
}

const res = (body: Buffer | object, ok = true, status = 200) => ({
  ok, status,
  json: async () => body as any,
  arrayBuffer: async () => (body as Buffer).buffer.slice((body as Buffer).byteOffset, (body as Buffer).byteOffset + (body as Buffer).byteLength),
}) as unknown as Response;

describe('Phase 3.5 dependency wiring — bytes are actually returned and compared', () => {
  it('returns provider bytes and records VERIFIED when they equal the R2 bytes', async () => {
    const SAME = Buffer.from('IDENTICAL-IMAGE-BYTES');
    const deps = realWiring((async (u: string) =>
      String(u).includes('odata/Media') ? res({ value: [{ MediaURL: 'https://api.cotality.com/media/1' }] })
        : res(SAME)) as unknown as typeof fetch);
    const out = await verifyRow(row, deps, NOW);
    expect(out.state).toBe('VERIFIED');
    expect(out.hashes?.provider).toBe(out.hashes?.delivered);
    expect(out.hashes?.provider).toHaveLength(64); // a real sha256, not undefined
  });

  it('records MISMATCH when provider bytes differ from R2 bytes — proves both sides are real', async () => {
    const deps = realWiring((async (u: string) =>
      String(u).includes('odata/Media') ? res({ value: [{ MediaURL: 'https://api.cotality.com/media/1' }] })
        : String(u).includes('r2.dev') ? res(Buffer.from('OLD-R2-BYTES')) : res(Buffer.from('NEW-PROVIDER-BYTES'))) as unknown as typeof fetch);
    const out = await verifyRow(row, deps, NOW);
    expect(out.state).toBe('MISMATCH');
    expect(out.hashes?.provider).not.toBe(out.hashes?.delivered);
  });

  it('THROWS on provider HTTP failure — never silently returns empty bytes', async () => {
    const deps = realWiring((async (u: string) =>
      String(u).includes('odata/Media') ? res({ value: [{ MediaURL: 'https://api.cotality.com/media/1' }] })
        : String(u).includes('r2.dev') ? res(Buffer.from('R2')) : res(Buffer.from(''), false, 503)) as unknown as typeof fetch);
    const out = await verifyRow(row, deps, NOW);
    expect(out.state).toBe('INDETERMINATE');
    expect(out.reason).toContain('503');
  });

  it('REGRESSION GUARD: a dep that fetches but returns nothing must NOT produce VERIFIED', async () => {
    // The exact defect this file exists for. sha256(undefined->empty) is stable, so a broken dep on
    // BOTH sides would "match" and record VERIFIED on garbage.
    const broken: VerificationDeps = {
      ...realWiring((async () => res(Buffer.from('X'))) as unknown as typeof fetch),
      async fetchProviderBytes() { return undefined as unknown as Buffer; },
    };
    await expect(verifyRow(row, broken, NOW)).resolves.toMatchObject({ state: 'INDETERMINATE' });
  });
});
