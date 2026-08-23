/// <reference types="jest" />
/**
 * CRM form save/load field parity (2026-05-27).
 *
 * Verifies that SALE_FIELD_MAP covers every RLS field that
 * collectSaleFormData() produces, and that _populateSaleFormFromApi
 * uses the data-driven FIELD_MAP approach.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const FORM_PATH = path.resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formSource = readFileSync(FORM_PATH, 'utf-8');

describe('CRM form save/load field parity', () => {
  test('SALE_FIELD_MAP exists and has 80+ entries', () => {
    expect(formSource).toMatch(/var SALE_FIELD_MAP\s*=\s*\[/);
    const mapMatch = formSource.match(/var SALE_FIELD_MAP\s*=\s*\[([\s\S]*?)\];/);
    expect(mapMatch).not.toBeNull();
    const entries = (mapMatch![1].match(/\{[^}]+\}/g) || []);
    expect(entries.length).toBeGreaterThanOrEqual(80);
  });

  test('every RLS field in collectSaleFormData has a FIELD_MAP entry', () => {
    const collectBlock = formSource.match(/function collectSaleFormData\(\)([\s\S]*?)^function /m);
    expect(collectBlock).not.toBeNull();
    const rlsAssignments = collectBlock![1].match(/data\.([A-Z][A-Za-z]+)\s*=/g) || [];
    const rlsFields = rlsAssignments.map(a => a.replace('data.', '').replace(' =', '').trim());
    const uniqueRls = [...new Set(rlsFields)].filter(f =>
      !['listing_type', 'type', 'status', 'saleListingType', 'inHouseVisibility', 'Permission', 'Permissions',
        'IDXEntireListingDisplayYN', 'SyndicateYN', 'BathroomsTotal',
        'PropertyType', 'PropertySubType', 'CommonInterest', 'MlsStatus',
        'ListingAgreement', 'BuildingFeatures', 'CoBrokeAgreement',
        // Checkbox-array groups newly added by PR #268 + this PR. These are
        // restored via SALE_CHECKBOX_ARRAY_MAP, NOT SALE_FIELD_MAP, so they
        // have no `rls: 'X'` entry in SALE_FIELD_MAP. The corresponding
        // CHECKBOX_ARRAY_MAP entries (e.g. {rls:'Heating',name:'saleHeating'},
        // {rls:'BuildingHeating',name:'saleBldgHeating'}, etc.) provide the
        // round-trip restore. See:
        //   - sale-form-save-load-retention.test.ts (PR #268 fields)
        //   - sale-form-all-radio-checkbox-coverage.test.ts (this PR — full
        //     parametrized inventory + restore-map contract for ALL groups)
        'Heating', 'Cooling', 'SyndicateTo',
        'BuildingHeating', 'BuildingCooling',
        // 'View' is the canonical Cotality array mirror (audit F7, 2026-05-30),
        // emitted from saleViewList for the server-side RLS conditional
        // (ViewYN=true → require View). It is restored via the saleViewList
        // SALE_CHECKBOX_ARRAY_MAP entry (form-key sibling), same as Heating/Cooling.
        'View',
        // Note: 'Flooring' was previously in this skip-list because the
        // form was writing data.Flooring as a canonical Cotality array.
        // Codex PR #270 review caught that "Herringbone" (a visible
        // Flooring option) is not in REBNY's Flooring enum — writing it
        // to canonical would emit a non-compliant value. Flooring is
        // now persisted as Mallan internal (data.saleFlooring), so it
        // no longer appears in collect as a capital-letter RLS key.
        // Canonical Cotality writes from form radios / single-id booleans.
        // saleInternetAVMDisplayYN radio → InternetAutomatedValuationDisplayYN
        // canonical (per-row opt-out, fail-CLOSED). Same for ConsumerComment.
        // Both restored via SALE_RADIO_MAP / SALE_FIELD_MAP fallbackRls keys.
        'InternetAutomatedValuationDisplayYN', 'InternetConsumerCommentYN',
      ].includes(f)
    );
    for (const field of uniqueRls) {
      expect(formSource).toContain("rls: '" + field + "'");
    }
  });

  test('_populateSaleFormFromApi uses SALE_FIELD_MAP.forEach', () => {
    expect(formSource).toMatch(/SALE_FIELD_MAP\.forEach/);
  });

  test('edit mode checks _saleEditDbId for PATCH vs POST', () => {
    expect(formSource).toMatch(/if\s*\(\s*_saleEditDbId\s*\)/);
  });

  test('media upload handles 409 Conflict', () => {
    expect(formSource).toMatch(/resp\.status === 409/);
  });

  test('submit redirects to My Listings', () => {
    expect(formSource).toMatch(/\/crm\/dashboard#\/ops\/listings/);
  });
});
