/// <reference types="jest" />
/**
 * Sale form — Buyer Representative removal + Buyer's Agent section gating.
 *
 * (A) The "Buyer Representative Agreement" acknowledgment is removed from the
 *     listing-side sale form. UCBA 2026 Art. II §16 puts the executed Buyer
 *     Representation Agreement obligation on the CO-BROKER (buyer's agent)
 *     before showing — not on the listing agent. The listing agent cannot
 *     attest to the buyer's rep agreement, so it never belonged here.
 *
 * (B) The Buyer's Agent Contact section is HIDDEN during initial listing entry
 *     and shown ONLY once the status reaches Contract/Sold (a cooperating
 *     buyer's agent exists). Auto-populate from the REBNY directory on select
 *     is unchanged.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');

function extractFn(src: string, name: string): string {
  const sig = `function ${name}(`;
  let start = src.indexOf(sig);
  if (start === -1) throw new Error(`not found: ${name}`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  const b = src.indexOf('{', start);
  let d = 0;
  for (let i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`unbalanced: ${name}`);
}

describe('(A) Buyer Representative Agreement acknowledgment removed', () => {
  it('the saleBuyerRepAgreementAck checkbox is gone from the form', () => {
    expect(FORM).not.toMatch(/id="saleBuyerRepAgreementAck"/);
    expect(FORM).not.toMatch(/Buyer Representative Agreement:<\/strong>/);
  });
  it('its SALE_FIELD_MAP restore entry is removed', () => {
    expect(FORM).not.toMatch(/rls:\s*'saleBuyerRepAgreementAck'/);
  });
  it('a comment records the UCBA Art. II §16 (buyer-agent obligation) basis', () => {
    expect(FORM).toMatch(/UCBA 2026 Art\. II §16[\s\S]*CO-BROKER \(buyer's agent\)/);
  });
});

describe("(B) Buyer's Agent Contact section is status-gated (Contract/Sold only)", () => {
  it('the section wrapper has an id and is hidden by default', () => {
    expect(FORM).toMatch(/id="saleBuyerAgentSection"[^>]*display:none/);
  });

  it('edit-load re-runs status gating so saved Contract/Sold listings reveal the section (Codex #298)', () => {
    // saleStatus restore in _populateSaleFormFromApi happens with the change
    // event suppressed, so updateSaleStatusFields must be called explicitly at
    // the end — otherwise a saved Sold listing keeps the section hidden.
    const fn = extractFn(FORM, '_populateSaleFormFromApi');
    expect(fn).toMatch(/updateSaleStatusFields\(\)/);
  });

  it('REBNY auto-populate on select still fills id/phone/email/license + shows the info', () => {
    // The buyer-agent dropdown onSelect populates from the REBNY directory.
    expect(FORM).toMatch(/getElementById\('saleBuyerAgentId'\)\.textContent\s*=\s*data\.id/);
    expect(FORM).toMatch(/getElementById\('saleBuyerAgentPhone'\)\.textContent\s*=\s*data\.phone/);
    expect(FORM).toMatch(/getElementById\('saleBuyerAgentEmail'\)\.textContent\s*=\s*data\.email/);
    expect(FORM).toMatch(/getElementById\('saleBuyerAgentLicense'\)\.textContent\s*=\s*data\.license/);
    expect(FORM).toMatch(/getElementById\('saleBuyerAgentInfo'\)\.style\.display\s*=\s*'block'/);
  });

  describe('updateSaleStatusFields toggles the section by status (behavioral)', () => {
    function displayFor(status: string): string {
      const section = { style: { display: 'PRELOAD' } };
      const els: Record<string, unknown> = { saleStatus: { value: status }, saleBuyerAgentSection: section };
      const document = { getElementById: (id: string) => els[id] || null };
      const src = extractFn(FORM, 'updateSaleStatusFields');
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      new Function('document', `${src}; return updateSaleStatusFields;`)(document)();
      return section.style.display;
    }

    it('hidden for listing-entry statuses (Draft / Active / ComingSoon)', () => {
      ['Draft', 'Active', 'ComingSoon'].forEach((s) => expect(displayFor(s)).toBe('none'));
    });

    it('shown for the contract→sold window', () => {
      ['ContractSigned', 'ContractSignedThruUs', 'BoardApproved', 'Sold', 'SoldThruUs']
        .forEach((s) => expect(displayFor(s)).toBe(''));
    });

    it('hidden again for off-market statuses', () => {
      ['Withdrawn', 'Expired', 'TempOffMarket'].forEach((s) => expect(displayFor(s)).toBe('none'));
    });
  });
});
