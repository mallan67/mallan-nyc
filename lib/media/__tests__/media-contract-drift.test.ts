/// <reference types="jest" />
/**
 * MEDIA CONTRACT DRIFT GUARD — the fragile inference, made loud.
 *
 * `lib/media/listing-media-resolver.ts` treats `MediaClassification === Document`
 * as a floor-plan signal. The live census on 2026-08-22 showed that is exactly
 * correct today — set-equivalent, not merely equal counts:
 *
 *     MediaClassification eq 'Document' and MediaCategory ne 'FloorPlan'  ->  0
 *
 * But it is correct for a reason nobody controls. `DOCUMENT` legitimately spans
 * the whole Cotality document family — `Document`, `Disclosure`, `Addendum`,
 * `Survey`, `Restriction`, `RentalDocuments` — and the equivalence holds ONLY
 * because every one of those categories is unpopulated on this licence right
 * now. The day any of them carries a row, the resolver starts filing
 * disclosures and surveys as floor plans, silently, on client-facing reports.
 *
 * The evidence document (docs/idx/COTALITY-MEDIA-CONTRACT-EVIDENCE-2026-08-22.md
 * §6.1, §7.2) recommends pinning that rather than trusting it. This is the pin.
 *
 * WHY IT IS LIVE-GATED, AND WHY THAT IS NOT A DODGE.
 *
 * A drift guard that asserts a stored snapshot is not a drift guard — it just
 * re-reads the thing that drifted. This has to ask the provider. CI has no
 * Cotality credentials, so without them the suite SKIPS and says so loudly
 * rather than passing vacuously. A skipped guard is honest; a guard that passes
 * because it never asked is the failure mode this whole workstream exists to
 * remove.
 *
 * Run it with credentials in the environment:
 *
 *     vercel env pull <file> --environment=preview --git-branch=<branch>
 *     set -a && . <file> && set +a && npx jest media-contract-drift
 */

// This file declares top-level constants and has no imports, which would make
// TypeScript treat it as a global SCRIPT rather than a module — putting `BASE`
// into the global scope, where it collided with the identically-named constant
// in tests/runtime/release-safety-smoke.test.ts and failed the build. An empty
// export marks it a module so its top-level names stay its own.
export {};

const HAS_CREDENTIALS = Boolean(process.env.IDX_CLIENT_ID && process.env.IDX_CLIENT_SECRET);
const BASE = (process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle').replace(/\/$/, '');

/** Categories whose zero population is what makes Document ⇒ FloorPlan safe. */
const DOCUMENT_FAMILY_MUST_STAY_EMPTY = [
  'Document',
  'Disclosure',
  'Addendum',
  'Survey',
  'Restriction',
  'RentalDocuments',
] as const;

let token: string | null = null;

async function authenticate(): Promise<string> {
  if (token) return token;
  const res = await fetch(`${BASE}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: String(process.env.IDX_CLIENT_ID),
      client_secret: String(process.env.IDX_CLIENT_SECRET),
      grant_type: 'client_credentials',
      scope: 'api',
    }),
  });
  if (!res.ok) throw new Error(`AUTH_FAILED HTTP ${res.status}`);
  token = String((await res.json()).access_token);
  return token;
}

/**
 * Row count for an OData filter.
 *
 * Throws on any non-200. A rejected query is PROVIDER_REJECTED and must never
 * be allowed to read as zero — a silent zero here would make this guard report
 * "still safe" at the precise moment it stopped being able to tell.
 */
async function countWhere(filter: string): Promise<number> {
  const bearer = await authenticate();
  const url = `${BASE}/odata/Media?$top=0&$count=true&$filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${bearer}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`PROVIDER_REJECTED HTTP ${res.status} for [${filter}] :: ${body.slice(0, 200)}`);
  const count = JSON.parse(body)['@odata.count'];
  if (typeof count !== 'number') throw new Error(`no @odata.count returned for [${filter}]`);
  return count;
}

const describeLive = HAS_CREDENTIALS ? describe : describe.skip;

if (!HAS_CREDENTIALS) {
  // Loud, so nobody mistakes a skip for a pass.
  // eslint-disable-next-line no-console
  console.warn(
    '[media-contract-drift] SKIPPED — no IDX_CLIENT_ID / IDX_CLIENT_SECRET in env. ' +
      'The Document => FloorPlan inference is NOT verified in this run.',
  );
}

describeLive('the Document => FloorPlan inference still holds on the live feed', () => {
  jest.setTimeout(120_000);

  it.each(DOCUMENT_FAMILY_MUST_STAY_EMPTY)(
    'MediaCategory %s is still unpopulated',
    async (category) => {
      const rows = await countWhere(`MediaCategory eq '${category}'`);
      // If this fails, the category has come alive and every DOCUMENT-classified
      // row is no longer necessarily a floor plan. listing-media-resolver.ts
      // needs its `cls === 'document'` branch narrowed BEFORE the next sync.
      expect(rows).toBe(0);
    },
  );

  it('no Document-classified row sits outside the FloorPlan category', async () => {
    // The direct statement of the inference, asked of the provider rather than
    // inferred from two counts that merely happen to match.
    expect(await countWhere(`MediaClassification eq 'Document' and MediaCategory ne 'FloorPlan'`)).toBe(0);
  });

  it('MediaClassification still carries both casings as distinct members', async () => {
    // The eq/ne trap depends on this. If Cotality ever collapses the pair, the
    // registry note on media_classification needs revisiting.
    const lower = await countWhere(`MediaClassification eq 'Document'`);
    const upper = await countWhere(`MediaClassification eq 'DOCUMENT'`);
    expect(lower).toBe(upper);

    // And the asymmetry itself: `ne` against the other casing excludes nothing.
    // This is the behaviour that makes an exclusion filter a silent no-op.
    const total = await countWhere(`MediaKey ne null`);
    expect(await countWhere(`MediaClassification ne 'Document'`)).toBe(total);
  });

  it('VirtualTour is still not a MediaCategory member', async () => {
    // A rejection is the expected result. If this ever STOPS throwing, Cotality
    // added the member and the tour mapping can finally be resolved.
    await expect(countWhere(`MediaCategory eq 'VirtualTour'`)).rejects.toThrow(/PROVIDER_REJECTED HTTP 400/);
  });
});
