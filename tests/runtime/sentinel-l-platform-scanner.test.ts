/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

import { SENTINEL_L_CONTRACT } from '../../tools/sentinel-l/run-sentinel-l';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('Sentinel-L platform actionable error scanner', () => {
  test('package exposes npm run sentinel:l', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.scripts['sentinel:l']).toBe('tsx tools/sentinel-l/run-sentinel-l.ts');
  });

  test('scanner covers changed files plus the mandated hot paths', () => {
    const hotPaths = SENTINEL_L_CONTRACT.hotPaths;

    expect(hotPaths).toContain('public/crm/SALE-FORM-REDESIGN.html');
    expect(hotPaths).toContain('public/crm/RENTAL-FORM-REDESIGN.html');
    expect(hotPaths).toContain('public/crm/js/dashboard/panels.js');
    expect(hotPaths).toContain('public/crm/js/manage/manage-listings.js');
    expect(hotPaths).toContain('app/api/crm/listings/route.ts');
    expect(hotPaths).toContain('app/api/crm/listings/[id]/route.ts');
    expect(hotPaths).toContain('app/api/crm/listings/[id]/status/route.ts');
    expect(hotPaths).toContain('app/api/listings/route.ts');
    expect(hotPaths).toContain('app/api/listings/suggest/route.ts');
    expect(hotPaths).toContain('app/api/buildings/search/route.ts');
    expect(hotPaths).toContain('lib/search/**');
    expect(hotPaths).toContain('lib/idx/**');
    expect(hotPaths).toContain('lib/crm/**');
    expect(hotPaths).toContain('lib/media/**');
    expect(hotPaths).toContain('lib/compliance/**');
    expect(hotPaths).toContain('lib/address/**');
    expect(hotPaths).toContain('app/components/FeaturedListings.tsx');
    expect(hotPaths).toContain('app/components/SearchListingCard.tsx');
    expect(hotPaths).toContain('app/components/IDXImage.tsx');
  });

  test('catalog contains the full platform code families', () => {
    const codes = new Set(SENTINEL_L_CONTRACT.catalog.map((entry) => entry.code));

    for (const code of [
      'S-REG-001',
      'S-REG-009',
      'S-BE-001',
      'S-BE-010',
      'S-DB-001',
      'S-DB-010',
      'S-SALE-001',
      'S-SALE-014',
      'S-RENT-001',
      'S-RENT-012',
      'S-CRM-001',
      'S-CRM-011',
      'S-LEAD-001',
      'S-LEAD-010',
      'S-AGENT-001',
      'S-AGENT-009',
      'S-SUGGEST-001',
      'S-SUGGEST-008',
      'S-BUILDING-001',
      'S-BUILDING-008',
      'S-SAVED-001',
      'S-SAVED-012',
      'S-EMAIL-001',
      'S-EMAIL-009',
      'S-REPORT-001',
      'S-REPORT-010',
      'S-MEDIA-001',
      'S-MEDIA-009',
      'S-URL-001',
      'S-URL-009',
      'S-COMP-001',
      'S-COMP-010',
    ]) {
      expect(codes).toContain(code);
    }
  });

  test('public search and backend search are separate systems', () => {
    expect(SENTINEL_L_CONTRACT.searchScopeMandate).toContain(
      'Public search and backend CRM search are separate systems',
    );
    expect(SENTINEL_L_CONTRACT.searchScopeMandate).toContain('Public search is display-gated');
    expect(SENTINEL_L_CONTRACT.searchScopeMandate).toContain('Backend search is role-gated');

    const publicCodes = SENTINEL_L_CONTRACT.catalog
      .filter((entry) => entry.code.startsWith('S-PUBSEARCH-'))
      .map((entry) => entry.searchSystem);
    const backendCodes = SENTINEL_L_CONTRACT.catalog
      .filter((entry) => entry.code.startsWith('S-BACKSEARCH-'))
      .map((entry) => entry.searchSystem);

    expect(publicCodes).toHaveLength(13);
    expect(backendCodes).toHaveLength(18);
    expect(new Set(publicCodes)).toEqual(new Set(['PUBLIC_SEARCH']));
    expect(new Set(backendCodes)).toEqual(new Set(['BACKEND_SEARCH']));
  });

  test('scanner forbids narrative audit output and pins actionable fields', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'tools', 'sentinel-l', 'run-sentinel-l.ts'),
      'utf8',
    );

    expect(source).toContain('Status: PASS');
    expect(source).toContain('NO ACTIONABLE ERRORS FOUND');
    expect(source).toContain('Status: FAIL');
    expect(source).toContain('Actionable errors:');
    expect(source).toContain('actualFailure');
    expect(source).toContain('Evidence:');
    expect(source).toContain('matchedSource');
    expect(source).toContain("'failing field/query/pattern'");
    expect(source).toContain("'required fix'");
    expect(source).toContain("'proof required'");
    expect(source).toContain('Only post a short PR comment when actionable errors exist');
    expect(source).not.toMatch(/Final verdict:\s*YELLOW/);
    expect(source).not.toMatch(new RegExp('LIMITED\\s+[\\u2014-]'));
  });
});
