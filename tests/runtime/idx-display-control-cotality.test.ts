/// <reference types="jest" />
/**
 * IDX-display control reclassified (Cotality-clean 2026-05-30).
 *
 * There is no Cotality field for "IDX display" — `IDXEntireListingDisplayYN` was a
 * phantom. It is reclassified to the internal flag `saleIdxDisplayYN`, which drives
 * the internal `idx_display_yn` column (the Mallan decision key `_mallanIdxDisplay` since the
 * blocker round; the retired name is refused by the live resource and is no longer
 * accepted (fallback). Critically, the §2.05 terminal-status guard on
 * `idx_display_yn` must remain intact (no terminal listing can be flipped to
 * display).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const formHtml = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
const routeTs = readFileSync(resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts'), 'utf8');

describe('IDX-display control — internal saleIdxDisplayYN; §2.05 guard preserved', () => {
  it('form emits internal saleIdxDisplayYN (not the phantom IDXEntireListingDisplayYN) as the IDX control', () => {
    expect(formHtml).toMatch(/data\.saleIdxDisplayYN\s*=/);
    expect(formHtml).not.toMatch(/data\.IDXEntireListingDisplayYN\s*=/);
  });

  it('SALE_FIELD_MAP restores the control from the idx_display_yn column under the internal key', () => {
    expect(formHtml).toMatch(
      /rls:\s*'saleIdxDisplayYN',\s*form:\s*'saleDist_IDX'[^}]*listingKey:\s*'idx_display_yn'/,
    );
  });

  it('PATCH reads the Mallan IDX-display decision (_mallanIdxDisplay, then the form keys) and never a provider-named key', () => {
    expect(routeTs).toMatch(
      /const idxDisplayControl = body\._mallanIdxDisplay \?\? body\.saleIdxDisplayYN \?\? body\.rentalIdxDisplayYN;/,
    );
    expect(routeTs).not.toMatch(/body\.IDXEntireListingDisplayYN/);
  });

  it('§2.05 terminal guard preserved: rls-eligible AND not-terminal AND coerceStrictBool(control)', () => {
    expect(routeTs).toMatch(
      /update\.idx_display_yn\s*=\s*[\s\S]*?effectiveRlsEligible\s*&&[\s\S]*?!TERMINAL_STATUSES\.has\(effectiveStatus\)\s*&&[\s\S]*?coerceStrictBool\(idxDisplayControl\)/,
    );
  });
});
