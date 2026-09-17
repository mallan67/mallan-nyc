/// <reference types="jest" />
/**
 * Agent + listing identity (Cotality-authoritative) + canonical URL.
 *
 * Audit: docs/crm/agent-listing-identity-cotality-url-audit-2026-05-28.md
 *
 * Verified live values that drive these tests:
 *   - Agent "Maya Allan": id=1, trestle_mls_id=39361, email=maya@mallan.nyc
 *   - SL-0004 (CRM exclusive):   agent_id=1, idx_display_yn=false, rls_eligible=false,
 *                                agent_info.ListAgentMlsId="" (empty — broken picker)
 *   - RLS20093870 (Trestle copy): agent_id=null, idx_display_yn=true,
 *                                  ListAgentMlsId=39361 (== Maya), same unit 2G
 *
 * Mix of runtime (real functions) + source-verification (route/auth/form wiring).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  preferCrmExclusiveOverIdxDuplicate,
  buildAddressKey,
  type DedupeCandidate,
} from '@/lib/listings/dedupe-crm-vs-idx';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ── RUNTIME: cross-source dedupe survives DB-shape vs Trestle-shape divergence ──
describe('cross-source dedupe — DB DTO vs Trestle DTO address shapes', () => {
  // DB shape (dbListingToPublicDTO): streetDirPrefix separate, streetName = name+suffix.
  const SL_0004: DedupeCandidate = {
    id: 'SL-0004',
    address: { streetNumber: '333', streetDirPrefix: 'E', streetName: '46th Street', unitNumber: '2G', postalCode: '10017' },
  };
  // Live-provider shape through the canonical chain: no streetDirPrefix,
  // streetName already = "<dir> <name> <suffix>".
  const RLS_20093870: DedupeCandidate = {
    id: 'RLS20093870',
    address: { streetNumber: '333', streetName: 'E 46th Street', unitNumber: '2G', postalCode: '10017' },
  };
  const RLS_20087929: DedupeCandidate = {
    id: 'RLS20087929',
    address: { streetNumber: '333', streetName: 'E 46th Street', unitNumber: '20B', postalCode: '10017' }, // different unit
  };
  const WEST_46TH: DedupeCandidate = {
    id: 'RLS20099999',
    address: { streetNumber: '333', streetName: 'W 46th Street', unitNumber: '2G', postalCode: '10017' }, // different direction
  };

  it('DB-shape and Trestle-shape rows for the same unit produce the IDENTICAL address key', () => {
    expect(buildAddressKey(SL_0004.address)).toBe(buildAddressKey(RLS_20093870.address));
  });

  it('agent-page merge: SL-0004 (CRM) wins, RLS20093870 (Trestle dup) suppressed', () => {
    const merged = preferCrmExclusiveOverIdxDuplicate([SL_0004, RLS_20093870, RLS_20087929]);
    const ids = merged.map((l) => l.id);
    expect(ids).toContain('SL-0004');
    expect(ids).not.toContain('RLS20093870');
    expect(ids).toContain('RLS20087929'); // same building, different unit — remains
  });

  it('same building, different unit is NOT deduped', () => {
    expect(buildAddressKey(SL_0004.address)).not.toBe(buildAddressKey(RLS_20087929.address));
  });

  it('same number/unit/zip but different street direction is NOT deduped', () => {
    expect(buildAddressKey(SL_0004.address)).not.toBe(buildAddressKey(WEST_46TH.address));
    const merged = preferCrmExclusiveOverIdxDuplicate([SL_0004, WEST_46TH]);
    expect(merged.map((l) => l.id).sort()).toEqual(['RLS20099999', 'SL-0004']);
  });

  it('when no CRM row exists, the Trestle row is kept (no over-suppression)', () => {
    const merged = preferCrmExclusiveOverIdxDuplicate([RLS_20093870, RLS_20087929]);
    expect(merged.map((l) => l.id).sort()).toEqual(['RLS20087929', 'RLS20093870']);
  });
});

// ── RUNTIME: one canonical URL shape ──
describe('canonical URL — buildCanonicalListingPath emits one two-segment form', () => {
  it('strips the hybrid -id suffix → /listing/{address}/{id-lower}', () => {
    expect(buildCanonicalListingPath({ slug: '333-e-46th-street-apt-2g-new-york-ny-10017-sl-0004', id: 'SL-0004' }))
      .toBe('/listing/333-e-46th-street-apt-2g-new-york-ny-10017/sl-0004');
  });
  it('address-only slug (no suffix) still emits canonical two-segment', () => {
    expect(buildCanonicalListingPath({ slug: '333-e-46th-street-apt-2g-new-york-ny-10017', id: 'SL-0004' }))
      .toBe('/listing/333-e-46th-street-apt-2g-new-york-ny-10017/sl-0004');
  });
  it('suppressed-address (listing- slug) keeps id-only canonical — no address leak', () => {
    expect(buildCanonicalListingPath({ slug: 'listing-sl-0004', id: 'SL-0004' }))
      .toBe('/listing/listing-sl-0004');
  });
  it('never emits a ?key= query or a hybrid {address}-{id} path', () => {
    const out = buildCanonicalListingPath({ slug: '333-e-46th-street-apt-2g-new-york-ny-10017-sl-0004', id: 'SL-0004' });
    expect(out).not.toContain('?key=');
    expect(out).not.toMatch(/-sl-0004$/);
  });
});

// ── SOURCE: agent route Cotality-authoritative behavior ──
describe('agent route — Cotality identity + display gate + cross-source dedupe', () => {
  const route = read('app/api/agents/[slug]/listings/route.ts');

  it('DB select includes rls_eligible (fixes the website-only/Mallan-exclusive bypass)', () => {
    expect(route).toMatch(/rls_eligible:\s*true/);
  });
  it('agent lookup selects trestle_mls_id', () => {
    expect(route).toMatch(/trestle_mls_id:\s*true/);
  });
  it('Trestle branch matches by ListAgentMlsId when an MLS id is present', () => {
    expect(route).toMatch(/ListAgentMlsId eq '\$\{/);
  });
  it('name matching is fallback only (ListAgentFullName behind the mlsId ternary)', () => {
    expect(route).toMatch(/mlsId\s*\?[\s\S]*ListAgentMlsId eq[\s\S]*:\s*`ListAgentFullName eq/);
  });
  it('cross-source dedupe runs on the merged active + closed sets', () => {
    expect(route).toMatch(/preferCrmExclusiveOverIdxDuplicate\(\[\.\.\.dbActiveNew/);
    expect(route).toMatch(/preferCrmExclusiveOverIdxDuplicate\(\[\.\.\.dbClosedNew/);
  });
});

// ── SOURCE: identity capture path (auth + form) ──
describe('identity capture — /api/auth/me exposes trestle_mls_id; form stamps it', () => {
  const me = read('app/api/auth/me/route.ts');
  const form = read('public/crm/SALE-FORM-REDESIGN.html');

  it('/api/auth/me selects + returns the Cotality MLS id (mlsId)', () => {
    expect(me).toMatch(/trestle_mls_id:\s*true/);
    expect(me).toMatch(/mlsId:\s*agent\.trestle_mls_id/);
  });
  it('form collect maps ListAgentMlsId from the Cotality mls id, NOT the internal Agent.id', () => {
    expect(form).toMatch(/data\.ListAgentMlsId\s*=\s*data\.saleUpdatingAgentMlsId/);
    expect(form).not.toMatch(/data\.ListAgentMlsId\s*=\s*data\.saleUpdatingAgent\b\s*\|\|/);
  });
  it('form persists the hidden saleUpdatingAgentMlsId field from the session', () => {
    expect(form).toMatch(/id="saleUpdatingAgentMlsId"/);
    expect(form).toMatch(/setVal\('saleUpdatingAgentMlsId',\s*u\.mlsId\)/);
  });
  it('CRM-owned office name is canonical; the company-key slug is no longer written into ListOfficeKey', () => {
    expect(form).toMatch(/data\.ListOfficeName\s*=\s*data\.saleUpdatingAgentCompanyName\s*\|\|\s*'Mallan Real Estate Inc\.'/);
    // The prior bug wrote the "mallan" company-key slug into ListOfficeKey.
    expect(form).not.toMatch(/data\.ListOfficeKey\s*=\s*data\.saleUpdatingAgentCompanyKey/);
  });
});

// ── SOURCE: emitters use the canonical URL, never hybrid/?key= ──
describe('URL emitters — canonical only, no hybrid slug + ?key=', () => {
  const emitters = [
    'app/components/FeaturedListings.tsx',
    'app/agents/[name]/listings/ActiveListingsTabs.tsx',
    'app/components/SimilarListings.tsx',
    'app/components/neighborhoods/LiveListingsWidget.tsx',
    'app/components/RecentlyViewed.tsx',
    'app/components/CompareProperties.tsx',
    'app/favorites/page.tsx',
    'lib/idx/display-adapter.ts',
    'app/sitemap.ts',
  ];
  for (const f of emitters) {
    it(`${f} no longer emits /listing/\${slug}?key=`, () => {
      const src = read(f);
      expect(src).not.toMatch(/\/listing\/\$\{[^}]*\}\?key=/);
    });
  }
  it('DTO builders set url via buildCanonicalListingPath', () => {
    // lib/idx/public-dto.ts no longer builds DTOs (the second builder is gone, Packet 2 closure); live Cotality
    // records reach the ONE builder (db-to-public-dto.ts) through lib/idx/cotality-public-dto.ts.
    expect(read('lib/idx/public-dto.ts')).not.toMatch(/url:\s*buildCanonicalListingPath\(/);
    expect(read('lib/idx/cotality-public-dto.ts')).toMatch(/dbListingToPublicDTO\(/);
    expect(read('lib/idx/db-to-public-dto.ts')).toMatch(/url:\s*buildCanonicalListingPath\(/);
  });
});

// ── SOURCE: canonical lowercase id resolves (Codex PR #272) ──
describe('detail route — canonical lowercase listing id resolves', () => {
  const page = read('app/listing/[...slug]/page.tsx');
  it('normalizes the listing_id lookup to uppercase (canonical URLs lowercase it)', () => {
    // Both the keyOverride/MLS-ID path and the trailing-segment path must
    // upper-normalize so /listing/{address}/sl-0004 resolves to SL-0004.
    expect(page).toMatch(/listing_id:\s*lookupId\.toUpperCase\(\)/);
    expect(page).toMatch(/listing_id:\s*slug\.toUpperCase\(\)/);
  });
});

// ── SOURCE: backfill-crm script is RETIRED + HARD-DISABLED (tombstone, Codex #427) ──
// It previously dry-ran / --applied an agent_info fill. Post Phase-D step 2 it is a tombstone:
// fails closed unconditionally, with no DB/write path and no re-enable flag. The old
// dry-run/apply/blank-only assertions were removed (the implementation no longer exists);
// operators are pointed to the typed-first tools instead.
describe('backfill script — retired + hard-disabled (tombstone)', () => {
  const bf = read('scripts/backfill-crm-exclusive-cotality-identity.mjs');

  it('exits / fails closed unconditionally (no dry-run or apply path)', () => {
    expect(bf).toMatch(/process\.exit\(2\);\s*$/);
  });
  it('has NO write path / NO DB connection / NO Prisma import', () => {
    expect(bf).not.toMatch(/PrismaClient/);
    expect(bf).not.toContain('prisma.listing.update');
  });
  it('cannot be re-enabled — no ALLOW_RETIRED flag, no --apply arg processing', () => {
    expect(bf).not.toContain('ALLOW_RETIRED_AGENT_INFO_BACKFILL');
    expect(bf).not.toContain('process.argv');
  });
  it('selects no agent_info JSON', () => {
    expect(bf).not.toContain('agent_info: true');
  });
  it('points operators to the typed-first tools', () => {
    expect(bf).toMatch(/repair-exclusive-agent-assignment/);
    expect(bf).toMatch(/set-exclusive-listing-agent/);
  });
});
