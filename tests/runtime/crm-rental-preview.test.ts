/// <reference types="jest" />
/**
 * The Preview tab of the Rental Add / Edit form, on the REAL page.
 *
 * The Preview is what the agent reads before submitting, and several of its lines looked up controls the form does not have (a listing address box spelt another way, a photo grid, a video box, a
 * townhouse unit count, a building name, radio buttons for the doorman, the elevator and the pets), so they said "--", "None" or "0" whatever the agent had entered; a bedroom list that starts on
 * "Custom" (no answer) was shown as "custom Beds"; "Studio (Apartment)" as "Apartment Beds"; and the Townhouse card was kept for types the form does not have. These tests set the controls the form
 * really has and read the Preview.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const box = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLInputElement;
const set = (f: BootedForm, id: string, value: string) => { box(f, id).value = value; };
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const shown = (f: BootedForm, id: string) => { f.w.updateRentalPreview(); return box(f, id).textContent!; };          // exactly what the Preview wrote: no blanks around it
const hidden = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLElement).style.display === 'none';
const typeIs = (f: BootedForm, value: string) => {
  (f.d.querySelectorAll('input[name="rentalPropertyType"]') as NodeListOf<HTMLInputElement>).forEach((r) => { r.checked = r.value === value; });
};
const tick = (f: BootedForm, selector: string, on = true) => { (f.d.querySelector(selector) as HTMLInputElement).checked = on; };

describe(`${FORM}: Listing Essentials`, () => {
  it('says the status in the words of the list, and says when none is chosen', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'rentalPreviewStatus')).toBe('Draft');
      set(f, 'rentalStatus', 'LeaseSigned');
      expect(shown(f, 'rentalPreviewStatus')).toBe('Lease Signed');
      set(f, 'rentalStatus', 'BackOnMarket');
      expect(shown(f, 'rentalPreviewStatus')).toBe('Back On Market');
      (f.d.getElementById('rentalStatus') as HTMLSelectElement).selectedIndex = -1;
      expect(shown(f, 'rentalPreviewStatus')).toBe('No status chosen');
    } finally { await closeAfter(f); }
  });

  it('a page without the status list says Draft', async () => {
    const f = await boot();
    try {
      f.d.getElementById('rentalStatus')!.remove();
      expect(shown(f, 'rentalPreviewStatus')).toBe('Draft');
    } finally { await closeAfter(f); }
  });

  it('says the property type by its label', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'rentalPreviewPropType')).toBe('Rental Building');
      typeIs(f, 'SingleFamilyTownhouse');
      const label = (f.d.querySelector('input[name="rentalPropertyType"][value="SingleFamilyTownhouse"]') as HTMLElement).closest('label')!.textContent!.trim();
      expect(shown(f, 'rentalPreviewPropType')).toBe(label);
      expect(label).not.toBe('SingleFamilyTownhouse');
      expect(shown(f, 'rentalPreviewSitePropType')).toBe(label);
      expect(shown(f, 'rentalPreviewSiteDetailType')).toBe(label);
      typeIs(f, '');
      expect(shown(f, 'rentalPreviewPropType')).toBe('--');
      expect(shown(f, 'rentalPreviewSitePropType')).toBe('--');
      expect(shown(f, 'rentalPreviewSiteDetailType')).toBe('--');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the Listing URL`, () => {
  it('is the one in the Listing URL box, and "--" when the box is empty', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'rentalPreviewCRMURL')).toBe('--');
      set(f, 'rentalListingUrl', 'https://www.mallan.nyc/listing/333-e-46th-st/rl-1');
      expect(shown(f, 'rentalPreviewCRMURL')).toBe('https://www.mallan.nyc/listing/333-e-46th-st/rl-1');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: bedrooms and bathrooms`, () => {
  const ROWS: [string, string, string][] = [['custom', '--', '-- Beds'], ['Apartment', 'Studio', 'Studio'], ['1', '1', '1 Beds'], ['2', '2', '2 Beds'], ['6+', '6+', '6+ Beds']];
  it.each(ROWS)('Bedrooms %s is %s in the summary and the public page, and %s on the card', async (value, summary, card) => {
    const f = await boot();
    try {
      set(f, 'rentalBedrooms', value);
      expect(shown(f, 'rentalPreviewCRMBeds')).toBe(summary);
      expect(shown(f, 'rentalPreviewSiteBeds')).toBe(summary);
      expect(shown(f, 'previewBeds')).toBe(' ' + card);                             // (the card has its icon in front of the text)
    } finally { await closeAfter(f); }
  });

  const BATHS: [string, string, string][] = [['custom', '--', '-- Baths'], ['1', '1', '1 Baths'], ['3', '3', '3 Baths'], ['5+', '5+', '5+ Baths']];
  it.each(BATHS)('Full Bathrooms %s is %s in the summary and the public page, and %s on the card', async (value, summary, card) => {
    const f = await boot();
    try {
      set(f, 'rentalFullBathrooms', value);
      expect(shown(f, 'rentalPreviewCRMBaths')).toBe(summary);
      expect(shown(f, 'rentalPreviewSiteBaths')).toBe(summary);
      expect(shown(f, 'previewBaths')).toBe(' ' + card);
    } finally { await closeAfter(f); }
  });

  it('a page without the lists says "--" and does not fail', async () => {
    const f = await boot();
    try {
      f.d.getElementById('rentalBedrooms')!.remove();
      f.d.getElementById('rentalFullBathrooms')!.remove();
      expect(shown(f, 'rentalPreviewCRMBeds')).toBe('--');
      expect(shown(f, 'rentalPreviewCRMBaths')).toBe('--');
      expect(shown(f, 'previewBeds')).toBe(' -- Beds');
      expect(shown(f, 'rentalPreviewSiteBeds')).toBe('--');
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('a form that holds neither (a list with nothing selected) says "--"', async () => {
    const f = await boot();
    try {
      (f.d.getElementById('rentalBedrooms') as HTMLSelectElement).selectedIndex = -1;
      (f.d.getElementById('rentalFullBathrooms') as HTMLSelectElement).selectedIndex = -1;
      expect(shown(f, 'rentalPreviewCRMBeds')).toBe('--');
      expect(shown(f, 'rentalPreviewCRMBaths')).toBe('--');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: photos, video and virtual tour`, () => {
  const choose = (f: BootedForm, inputId: string, names: string[]) => {
    const input = f.d.getElementById(inputId) as HTMLInputElement;
    const files = names.map((n, i) => { const file = new f.w.File(['x'], n, { type: 'image/jpeg' }); Object.defineProperty(file, 'size', { value: 100 + i }); return file; });
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new f.w.Event('change'));
  };

  it('counts the photos waiting for the save, and not the floor plans', async () => {
    const f = await boot({ mediaRows: [] });
    try {
      expect(shown(f, 'rentalPreviewPhotos')).toBe('0');
      choose(f, 'rentalPhotoInput', ['a.jpg', 'b.jpg']);
      choose(f, 'rentalFloorplanInput', ['plan.jpg']);
      expect(shown(f, 'rentalPreviewPhotos')).toBe('2 photo(s)');
    } finally { await closeAfter(f); }
  });

  it('counts the photos a saved listing has', async () => {
    const rows = [
      { media_key: 'k1', media_type: 'Photo', url: 'https://cdn.example/k1.webp', preferred_photo_yn: true },
      { media_key: 'k2', media_type: 'Photo', url: 'https://cdn.example/k2.webp' },
      { media_key: 'f1', media_type: 'FloorPlan', url: 'https://cdn.example/f1.webp' },
    ];
    const f = await boot({ search: '?id=RL-1', listing: { id: '77', listing_id: 'RL-1', status: 'Draft', raw_data: {} }, mediaRows: rows });
    try {
      await until(() => f.d.querySelectorAll('#rentalPhotoPreview [data-media-key]').length === 2, 20000);
      expect(shown(f, 'rentalPreviewPhotos')).toBe('2 photo(s)');
    } finally { await closeAfter(f); }
  });

  it.each(['rentalVideoUrl', 'rentalVideoTourUrl'])('%s makes the video "Yes"', async (id) => {
    const f = await boot();
    try {
      expect(shown(f, 'rentalPreviewCRMVideo')).toBe('None');
      set(f, id, 'https://youtube.com/watch?v=abc');
      expect(shown(f, 'rentalPreviewCRMVideo')).toBe('Yes');
      set(f, id, '   ');
      expect(shown(f, 'rentalPreviewCRMVideo')).toBe('None');
    } finally { await closeAfter(f); }
  });

  it.each(['rentalMatterportUrl', 'rentalVirtualTourUnbranded', 'rentalVirtualTourUnbranded2', 'rentalVirtualTourUnbranded3'])('%s makes the virtual tour "Yes"', async (id) => {
    const f = await boot();
    try {
      expect(shown(f, 'rentalPreviewCRMTour')).toBe('None');
      set(f, id, 'https://my.matterport.com/show/?m=abc');
      expect(shown(f, 'rentalPreviewCRMTour')).toBe('Yes');
      set(f, id, '');
      expect(shown(f, 'rentalPreviewCRMTour')).toBe('None');
    } finally { await closeAfter(f); }
  });

  it('a video does not make a virtual tour, nor the other way round', async () => {
    const f = await boot();
    try {
      set(f, 'rentalVideoUrl', 'https://youtube.com/watch?v=abc');
      expect(shown(f, 'rentalPreviewCRMTour')).toBe('None');
      set(f, 'rentalVideoUrl', '');
      set(f, 'rentalVirtualTourUnbranded', 'https://my.matterport.com/show/?m=abc');
      expect(shown(f, 'rentalPreviewCRMVideo')).toBe('None');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the Townhouse and Building cards`, () => {
  const TOWNHOUSE_TYPES = ['SingleFamilyTownhouse', 'MultiFamilyTownhouse', 'SingleFamily', 'MultiFamily', 'MixedUse'];
  const BUILDING_TYPES = ['Coop', 'Condo', 'Condop', 'RentalBuilding', 'Loft'];

  it.each(TOWNHOUSE_TYPES)('%s has the Townhouse card and not the Building card', async (type) => {
    const f = await boot();
    try {
      typeIs(f, type);
      f.w.updateRentalPreview();
      expect(hidden(f, 'rentalPreviewTHCard')).toBe(false);
      expect(hidden(f, 'rentalPreviewBldgCard')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it.each(BUILDING_TYPES)('%s has the Building card and not the Townhouse card (it skips the Townhouse tab)', async (type) => {
    const f = await boot();
    try {
      typeIs(f, type);
      f.w.updateRentalPreview();
      expect(hidden(f, 'rentalPreviewTHCard')).toBe(true);
      expect(hidden(f, 'rentalPreviewBldgCard')).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('no property type chosen has neither card', async () => {
    const f = await boot();
    try {
      typeIs(f, '');
      f.w.updateRentalPreview();
      expect(hidden(f, 'rentalPreviewTHCard')).toBe(true);
      expect(hidden(f, 'rentalPreviewBldgCard')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('the Townhouse card says what the Townhouse tab holds', async () => {
    const f = await boot();
    try {
      typeIs(f, 'SingleFamilyTownhouse');
      set(f, 'rentalTHStories', '4');
      set(f, 'rentalTHUnitsTotal', '2');
      set(f, 'rentalTHLotSize', '2500');
      set(f, 'rentalTHBuildingArea', '4200');
      set(f, 'rentalTHGarageYN', 'Yes');
      set(f, 'rentalTHCapRate', '5.5');
      expect(shown(f, 'rentalPreviewTHStories')).toBe('4');
      expect(shown(f, 'rentalPreviewTHUnits')).toBe('2');
      expect(shown(f, 'rentalPreviewTHLot')).toBe('2500 sqft');
      expect(shown(f, 'rentalPreviewTHBldgArea')).toBe('4200 sqft');
      expect(shown(f, 'rentalPreviewTHGarage')).toBe('Yes');
      expect(shown(f, 'rentalPreviewTHCapRate')).toBe('5.5%');
    } finally { await closeAfter(f); }
  });

  it('the Townhouse card says "--" for what the tab does not hold', async () => {
    const f = await boot();
    try {
      typeIs(f, 'MultiFamily');
      for (const id of ['rentalPreviewTHStories', 'rentalPreviewTHUnits', 'rentalPreviewTHLot', 'rentalPreviewTHBldgArea', 'rentalPreviewTHGarage', 'rentalPreviewTHCapRate']) expect(shown(f, id)).toBe('--');
    } finally { await closeAfter(f); }
  });

  it('the Building card says what the Building tab holds', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Condo');
      set(f, 'bldgName', 'The Grand');
      set(f, 'bldgYearBuilt', '1929');
      set(f, 'bldgTotalUnits', '120');
      set(f, 'bldgTotalFloors', '22');
      tick(f, 'input[name="rentalAttendanceType"][value="DoormanFullTime"]');
      tick(f, 'input[name="rentalAttendanceType"][value="ConciergePartTime"]');
      tick(f, '#bldgElevator');
      tick(f, 'input[name="rentalBuildingPetsAllowed"][value="BuildingCatsOK"]');
      tick(f, 'input[name="rentalBuildingPetsAllowed"][value="BuildingSizeLimit"]');
      expect(shown(f, 'rentalPreviewBldgName')).toBe('The Grand');
      expect(shown(f, 'rentalPreviewBldgYear')).toBe('1929');
      expect(shown(f, 'rentalPreviewBldgUnits')).toBe('120');
      expect(shown(f, 'rentalPreviewBldgFloors')).toBe('22');
      expect(shown(f, 'rentalPreviewBldgDoorman')).toBe('Doorman (Full-Time), Concierge (Part-Time)');
      expect(shown(f, 'rentalPreviewBldgElevator')).toBe('Yes');
      expect(shown(f, 'rentalPreviewBldgPets')).toBe('Cats OK, Size Limit');
    } finally { await closeAfter(f); }
  });

  it('a ticked box that no label holds is named by its value', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Condo');
      const loose = f.d.createElement('input');
      loose.type = 'checkbox'; loose.name = 'rentalAttendanceType'; loose.value = 'ExtraAttendant'; loose.checked = true;
      f.d.body.appendChild(loose);
      expect(shown(f, 'rentalPreviewBldgDoorman')).toBe('ExtraAttendant');
    } finally { await closeAfter(f); }
  });

  it('the Building card says "--" for what the Building tab does not hold, and names its attendance row for what it is', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Coop');
      for (const id of ['rentalPreviewBldgName', 'rentalPreviewBldgYear', 'rentalPreviewBldgUnits', 'rentalPreviewBldgFloors', 'rentalPreviewBldgDoorman', 'rentalPreviewBldgElevator', 'rentalPreviewBldgPets']) expect(shown(f, id)).toBe('--');
      expect(box(f, 'rentalPreviewBldgDoorman').parentElement!.textContent).toContain('Attendance');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the public page`, () => {
  it('names the neighborhood, the borough, and the state and zip of the listing (not New York for every one), and nothing it does not have', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'rentalPreviewSiteNeighborhood')).toBe('Neighborhood, Borough, NY');
      set(f, 'rentalZip', '07030');
      set(f, 'rentalStateOrProvince', 'NJ');
      expect(shown(f, 'rentalPreviewSiteNeighborhood')).toBe('NJ 07030');
      set(f, 'rentalStateOrProvince', '');
      expect(shown(f, 'rentalPreviewSiteNeighborhood')).toBe('NY 07030');
      set(f, 'rentalBorough', 'Manhattan');
      expect(shown(f, 'rentalPreviewSiteNeighborhood')).toBe('Manhattan, NY 07030');
      const hood = [...(box(f, 'rentalNeighborhood') as unknown as HTMLSelectElement).options].map((o) => o.value).find(Boolean)!;
      set(f, 'rentalNeighborhood', hood);
      expect(shown(f, 'rentalPreviewSiteNeighborhood')).toBe(`${hood}, Manhattan, NY 07030`);
      set(f, 'rentalZip', '');
      expect(shown(f, 'rentalPreviewSiteNeighborhood')).toBe(`${hood}, Manhattan`);
    } finally { await closeAfter(f); }
  });

  it('a page without the controls it reads does not fail', async () => {
    const f = await boot();
    try {
      for (const id of ['rentalListingUrl', 'rentalVideoUrl', 'rentalVideoTourUrl', 'rentalMatterportUrl', 'rentalVirtualTourUnbranded', 'rentalVirtualTourUnbranded2', 'rentalVirtualTourUnbranded3',
        'rentalPhotoPreview', 'rentalStateOrProvince', 'rentalTHUnitsTotal', 'rentalTHGarageYN', 'bldgName', 'bldgElevator']) f.d.getElementById(id)?.remove();
      typeIs(f, 'Condo');
      expect(() => f.w.updateRentalPreview()).not.toThrow();
      typeIs(f, 'SingleFamilyTownhouse');
      expect(() => f.w.updateRentalPreview()).not.toThrow();
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
