/// <reference types="jest" />
import { bootAddForm, sleep, until, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
const B800 = { address: '800 2ND Avenue', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', common_interest: 'Condominium', year_built: 1957, stories_total: 18, source: 'cotality' };
const B333 = { address: '333 E 46TH Street', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', common_interest: 'Condop', source: 'cotality' };
const val = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLInputElement).value;
const input = (f: BootedForm, id: string, text: string) => {
  const x = f.d.getElementById(id) as HTMLInputElement; x.value = text;
  x.dispatchEvent(new f.w.Event('input', { bubbles: true }));
};
const waitFor = async (condition: () => boolean) => until(condition, 8000);

describe('Sale building lookup - actual browser form and shared NYC normalizer', () => {
  it('keeps 100 Amsterdam and 1 Unit Street intact, without inventing an apartment', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 350 });
    try {
      const bl = (f.w as any).MallanBuildingLookup;
      expect(bl.splitAddress('100 Amsterdam')).toEqual({ street: '100 Amsterdam', unit: '' });
      expect(bl.splitAddress('1 Unit Street')).toEqual({ street: '1 Unit Street', unit: '' });
      expect(bl.exactMatch([B800], '800 Second Avenue')).toBeTruthy();
      expect(bl.exactMatch([B800], '800 2nd Ave')).toBeTruthy();
      expect(bl.exactMatch([B800], '800 12th Avenue')).toBeNull();
    } finally { f.close(); }
  });

  it('a complete street address with unit hydrates the one matching building, preserving the typed unit', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400, buildings: (q) => q.includes('800') ? [B800] : [] });
    try {
      input(f, 'saleStreetAddress', '800 Second Avenue Apt 806');
      (f.w as any).saleAddressBlurLookup();
      await waitFor(() => val(f, 'saleStreetAddress') === B800.address);
      expect(val(f, 'saleUnitNumber')).toBe('806');
      expect(val(f, 'saleBorough')).toBe('Manhattan');
      expect(val(f, 'saleZipCode')).toBe('10017');
      expect(f.searched).toContain('800 Second Avenue');
      expect(val(f, 'saleStreetName')).toBe('2ND');
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('the Building Lookup input keeps the typed unit when an agent selects the matching result', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400, buildings: [B800] });
    try {
      input(f, 'saleBuildingSearch', '800 Second Avenue #806');
      const results = f.d.getElementById('saleBuildingSearchResults')!;
      await waitFor(() => results.textContent!.includes('800 2ND Avenue'));
      const row = results.querySelector('div.p-3') as HTMLElement;
      expect(row).toBeTruthy();
      row.click();
      expect(val(f, 'saleStreetAddress')).toBe('800 2ND Avenue');
      expect(val(f, 'saleUnitNumber')).toBe('806');
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('an earlier slow empty lookup cannot replace a later successful lookup', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', {
      settle: 400,
      buildings: q => q.includes('2nd') ? [B800] : [],
      buildingsDelay: q => q === '800' ? 900 : 0,
      buildingsHint: 'No Cotality building match found.',
    });
    try {
      const results = f.d.getElementById('saleBuildingSearchResults')!;
      input(f, 'saleBuildingSearch', '800');
      await sleep(430);
      input(f, 'saleBuildingSearch', '800 2nd');
      await waitFor(() => results.textContent!.includes('800 2ND Avenue'));
      await sleep(1000);
      expect(results.textContent).toContain('800 2ND Avenue');
      expect(results.textContent).not.toContain('No matching');
      expect(f.searched).toEqual(['800', '800 2nd']);
    } finally { f.close(); }
  });

  it('a wrong-address candidate is never silently applied from the Street Address field', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400, buildings: [B800] });
    try {
      input(f, 'saleStreetAddress', '333 East 46th Street');
      (f.w as any).saleAddressBlurLookup();
      await waitFor(() => f.searched.length > 0);
      await sleep(80);
      expect(val(f, 'saleStreetAddress')).toBe('333 East 46th Street');
      expect(f.d.getElementById('saleIdxMatchBanner')!.classList.contains('hidden')).toBe(true);
    } finally { f.close(); }
  });

  it('a failed authenticated lookup shows the session error instead of claiming the building is missing', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 400, buildingsStatus: 401, buildingsHint: 'Session expired. Please log in again.' });
    try {
      input(f, 'saleBuildingSearch', '800 Second Avenue');
      const results = f.d.getElementById('saleBuildingSearchResults')!;
      await waitFor(() => results.textContent!.includes('Session expired'));
      expect(results.textContent).not.toContain('No matches found');
    } finally { f.close(); }
  });

  it('an older blur answer cannot overwrite a newly typed street address', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', {
      settle: 400, buildings: q => q.includes('800') ? [B800] : [B333], buildingsDelay: q => q.includes('800') ? 500 : 0,
    });
    try {
      input(f, 'saleStreetAddress', '800 Second Avenue');
      (f.w as any).saleAddressBlurLookup();
      input(f, 'saleStreetAddress', '333 East 46th Street');
      (f.w as any).saleAddressBlurLookup();
      await waitFor(() => val(f, 'saleStreetAddress') === B333.address);
      await sleep(640);
      expect(val(f, 'saleStreetAddress')).toBe(B333.address);
      expect(val(f, 'saleUnitNumber')).toBe('');
    } finally { f.close(); }
  });
});
