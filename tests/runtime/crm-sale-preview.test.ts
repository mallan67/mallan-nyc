/// <reference types="jest" />
/**
 * The Preview tab of the Sale Add / Edit form, on the REAL page.
 *
 * The Preview is what the agent reads before submitting, and several of its lines looked up controls the form does not have (the Listing URL box spelt another way, radio buttons for the
 * distribution, a neighborhood and a zip box of other names, radio buttons for the building's doorman and pets, the type "Co-op" for the form's "Coop"), counted no photos ("0 uploaded" for ever), and
 * said "--" inside the public page's location line whatever the agent had entered. These tests set the controls the form really has and read the Preview.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'SALE-FORM-REDESIGN';
const box = (f: BootedForm, id: string) => f.d.getElementById(id) as HTMLInputElement;
const set = (f: BootedForm, id: string, value: string) => { box(f, id).value = value; };
const boot = (o: AddFormOpts = {}) => bootAddForm(FORM, { settle: o.search ? 1500 : 800, ...o });
const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const shown = (f: BootedForm, id: string) => { f.w.updateSalePreview(); return box(f, id).textContent!; };          // exactly what the Preview wrote: no blanks around it
const hidden = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLElement).style.display === 'none';
const typeIs = (f: BootedForm, value: string) => {
  (f.d.querySelectorAll('input[name="salePropertyType"]') as NodeListOf<HTMLInputElement>).forEach((r) => { r.checked = r.value === value; });
};
const tick = (f: BootedForm, selector: string, on = true) => { (f.d.querySelector(selector) as HTMLInputElement).checked = on; };
const labelOf = (f: BootedForm, selector: string) => (f.d.querySelector(selector) as HTMLElement).closest('label')!.textContent!.trim();

describe(`${FORM}: Listing Essentials`, () => {
  it('says the property type by its label, and "--" when none is chosen', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Coop');
      const label = labelOf(f, 'input[name="salePropertyType"][value="Coop"]');
      expect(label).not.toBe('Coop');
      expect(shown(f, 'salePreviewPropType')).toBe(label);
      expect(shown(f, 'salePreviewSitePropType')).toBe(label);
      expect(shown(f, 'salePreviewSiteDetailType')).toBe(label);
      typeIs(f, 'Loft');
      expect(shown(f, 'salePreviewPropType')).toBe(labelOf(f, 'input[name="salePropertyType"][value="Loft"]'));
      typeIs(f, '');
      expect(shown(f, 'salePreviewPropType')).toBe('--');
      expect(shown(f, 'salePreviewSitePropType')).toBe('--');
      expect(shown(f, 'salePreviewSiteDetailType')).toBe('--');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the Listing URL`, () => {
  it('is the one in the Listing URL box, and "--" when the box is empty', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'salePreviewURL')).toBe('--');
      set(f, 'saleListingUrl', 'https://www.mallan.nyc/listing/200-east-66th-street/sl-1');
      expect(shown(f, 'salePreviewURL')).toBe('https://www.mallan.nyc/listing/200-east-66th-street/sl-1');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: distribution, photos, video and virtual tour`, () => {
  const choose = (f: BootedForm, inputId: string, names: string[]) => {
    f.w.URL.createObjectURL = () => 'blob:preview';                      // jsdom has none
    const input = f.d.getElementById(inputId) as HTMLInputElement;
    const files = names.map((n, i) => { const file = new f.w.File(['x'], n, { type: 'image/jpeg' }); Object.defineProperty(file, 'size', { value: 100 + i }); return file; });
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new f.w.Event('change'));
  };

  it('names the boxes ticked on the Distribution tab (the first four, then how many more); none ticked is "--"', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'salePreviewDistro')).not.toBe('--');
      (f.d.querySelectorAll('#saleMainTab4 input[type="checkbox"]') as NodeListOf<HTMLInputElement>).forEach((c) => { c.checked = false; });
      expect(shown(f, 'salePreviewDistro')).toBe('--');
      tick(f, '#saleDist_IDX');
      expect(shown(f, 'salePreviewDistro')).toBe('IDX');
      tick(f, '#saleDist_VOW');
      expect(shown(f, 'salePreviewDistro')).toBe('IDX, VOW');
      tick(f, '#saleDist_Listhub');
      tick(f, '#saleDist_NYMLS');
      expect(shown(f, 'salePreviewDistro')).toBe('IDX, VOW, Listhub, NY MLS');
      tick(f, '#saleDist_Realtor');
      expect(shown(f, 'salePreviewDistro')).toBe('IDX, VOW, Listhub, NY MLS +1 more');
      tick(f, '#saleDist_WWW');
      tick(f, '#saleDist_RLS');
      expect(shown(f, 'salePreviewDistro')).toBe('IDX, VOW, Listhub, NY MLS +3 more');
      tick(f, '#saleDist_IDX', false);
      expect(shown(f, 'salePreviewDistro')).toBe('VOW, Listhub, NY MLS, Realtor +2 more');
    } finally { await closeAfter(f); }
  });

  it('names a box by the first line of its label (a note below the name is not part of it), and counts no ticked box that has no label', async () => {
    const f = await boot();
    try {
      (f.d.querySelectorAll('#saleMainTab4 input[type="checkbox"]') as NodeListOf<HTMLInputElement>).forEach((c) => { c.checked = false; });
      tick(f, '#saleDist_IDX');
      f.d.getElementById('saleDist_IDX')!.closest('label')!.appendChild(f.d.createTextNode('\n   a note on the second line'));
      const bare = f.d.createElement('input');                                             // (a box of the tab that is in no label)
      bare.type = 'checkbox'; bare.checked = true;
      f.d.getElementById('saleMainTab4')!.appendChild(bare);
      expect(shown(f, 'salePreviewDistro')).toBe('IDX');
    } finally { await closeAfter(f); }
  });

  it('counts the photos waiting for the save, and not the floor plans', async () => {
    const f = await boot({ mediaRows: [] });
    try {
      expect(shown(f, 'salePreviewPhotos')).toBe('0');
      choose(f, 'salePhotoInput', ['a.jpg', 'b.jpg']);
      choose(f, 'saleFloorplanInput', ['plan.jpg']);
      expect(shown(f, 'salePreviewPhotos')).toBe('2 photo(s)');
    } finally { await closeAfter(f); }
  });

  it('counts the photos a saved listing has', async () => {
    const rows = [
      { media_key: 'k1', media_type: 'Photo', url: 'https://cdn.example/k1.webp', preferred_photo_yn: true },
      { media_key: 'k2', media_type: 'Photo', url: 'https://cdn.example/k2.webp' },
      { media_key: 'f1', media_type: 'FloorPlan', url: 'https://cdn.example/f1.webp' },
    ];
    const f = await boot({ search: '?id=SL-1', listing: { id: '77', listing_id: 'SL-1', status: 'Draft', raw_data: {} }, mediaRows: rows });
    try {
      await until(() => f.d.querySelectorAll('#salePhotoPreview [data-media-key]').length === 2, 20000);
      expect(shown(f, 'salePreviewPhotos')).toBe('2 photo(s)');
    } finally { await closeAfter(f); }
  });

  it.each(['saleVideoUrl', 'saleVideoTourUrl'])('%s makes the video "Yes"', async (id) => {
    const f = await boot();
    try {
      expect(shown(f, 'salePreviewVideo')).toBe('None');
      set(f, id, 'https://youtube.com/watch?v=abc');
      expect(shown(f, 'salePreviewVideo')).toBe('Yes');
      set(f, id, '  ');
      expect(shown(f, 'salePreviewVideo')).toBe('None');
    } finally { await closeAfter(f); }
  });

  it.each(['saleMatterportUrl', 'saleVirtualTourUnbranded', 'saleVirtualTourUnbranded2', 'saleVirtualTourUnbranded3'])('%s makes the virtual tour "Yes"', async (id) => {
    const f = await boot();
    try {
      expect(shown(f, 'salePreviewTour')).toBe('None');
      set(f, id, 'https://my.matterport.com/show/?m=abc');
      expect(shown(f, 'salePreviewTour')).toBe('Yes');
      set(f, id, '');
      expect(shown(f, 'salePreviewTour')).toBe('None');
    } finally { await closeAfter(f); }
  });

  it('a video does not make a virtual tour, nor the other way round', async () => {
    const f = await boot();
    try {
      set(f, 'saleVideoUrl', 'https://youtube.com/watch?v=abc');
      expect(shown(f, 'salePreviewTour')).toBe('None');
      set(f, 'saleVideoUrl', '');
      set(f, 'saleVirtualTourUnbranded', 'https://my.matterport.com/show/?m=abc');
      expect(shown(f, 'salePreviewVideo')).toBe('None');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the Townhouse and Building cards`, () => {
  const SKIPPING = ['Coop', 'Condo', 'Condop', 'Loft', 'DeededParking'];
  const HAVING = ['SingleFamilyTownhouse', 'MultiFamilyTownhouse', 'SingleFamily', 'MultiFamily', 'MixedUse', 'Duplex', 'Triplex', 'Quadruplex', 'Land', 'Office', 'Retail', 'Commercial'];

  it.each(HAVING)('%s has the Townhouse card and not the Building card', async (type) => {
    const f = await boot();
    try {
      typeIs(f, type);
      f.w.updateSalePreview();
      expect(hidden(f, 'salePreviewTHCard')).toBe(false);
      expect(hidden(f, 'salePreviewBldgCard')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it.each(SKIPPING)('%s has the Building card and not the Townhouse card (it skips the Townhouse tab)', async (type) => {
    const f = await boot();
    try {
      typeIs(f, type);
      f.w.updateSalePreview();
      expect(hidden(f, 'salePreviewTHCard')).toBe(true);
      expect(hidden(f, 'salePreviewBldgCard')).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('no property type chosen has neither card', async () => {
    const f = await boot();
    try {
      typeIs(f, '');
      f.w.updateSalePreview();
      expect(hidden(f, 'salePreviewTHCard')).toBe(true);
      expect(hidden(f, 'salePreviewBldgCard')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('the Townhouse card says what the Townhouse tab holds', async () => {
    const f = await boot();
    try {
      typeIs(f, 'SingleFamilyTownhouse');
      set(f, 'saleTHStories', '4');
      set(f, 'saleTHUnitsTotal', '2');
      set(f, 'saleTHLotSize', '2500');
      set(f, 'saleTHBuildingArea', '4200');
      set(f, 'saleTHGarageYN', 'Yes');
      set(f, 'saleTHGarageSpaces', '2');
      set(f, 'saleTHCapRate', '5.5');
      expect(shown(f, 'salePreviewTHStories')).toBe('4');
      expect(shown(f, 'salePreviewTHUnits')).toBe('2');
      expect(shown(f, 'salePreviewTHBldgArea')).toBe('4,200 SF');
      expect(shown(f, 'salePreviewTHGarage')).toBe('2 spaces');
      expect(shown(f, 'salePreviewTHCapRate')).toBe('5.5%');
    } finally { await closeAfter(f); }
  });

  it('the Building card says what the Building tab holds', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Condo');
      set(f, 'saleBldgName', 'The Grand');
      set(f, 'saleBldgYearBuilt', '1929');
      set(f, 'saleBldgTotalUnits', '120');
      set(f, 'saleBldgTotalFloors', '22');
      tick(f, 'input[name="saleAttendanceType"][value="DoormanFullTime"]');
      tick(f, 'input[name="saleAttendanceType"][value="ConciergePartTime"]');
      tick(f, '#saleBldgElevator');
      tick(f, 'input[name="saleBuildingPetsAllowed"][value="BuildingCatsOK"]');
      tick(f, 'input[name="saleBuildingPetsAllowed"][value="BuildingSizeLimit"]');
      expect(shown(f, 'salePreviewBldgName')).toBe('The Grand');
      expect(shown(f, 'salePreviewBldgYear')).toBe('1929');
      expect(shown(f, 'salePreviewBldgUnits')).toBe('120');
      expect(shown(f, 'salePreviewBldgFloors')).toBe('22');
      expect(shown(f, 'salePreviewBldgDoorman')).toBe('Doorman (Full-Time), Concierge (Part-Time)');
      expect(shown(f, 'salePreviewBldgElevator')).toBe('Yes');
      expect(shown(f, 'salePreviewBldgPets')).toBe('Cats OK, Size Limit');
    } finally { await closeAfter(f); }
  });

  it('a ticked box that no label holds is named by its value', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Condo');
      const loose = f.d.createElement('input');
      loose.type = 'checkbox'; loose.name = 'saleAttendanceType'; loose.value = 'ExtraAttendant'; loose.checked = true;
      f.d.body.appendChild(loose);
      expect(shown(f, 'salePreviewBldgDoorman')).toBe('ExtraAttendant');
    } finally { await closeAfter(f); }
  });

  it('the Building card says "--" for what the Building tab does not hold, and names its attendance row for what it is', async () => {
    const f = await boot();
    try {
      typeIs(f, 'Coop');
      for (const id of ['salePreviewBldgName', 'salePreviewBldgYear', 'salePreviewBldgUnits', 'salePreviewBldgFloors', 'salePreviewBldgDoorman', 'salePreviewBldgElevator', 'salePreviewBldgPets']) expect(shown(f, id)).toBe('--');
      expect(box(f, 'salePreviewBldgDoorman').parentElement!.textContent).toContain('Attendance');
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: the public page`, () => {
  it('names the neighborhood, the borough and the state and zip of the listing, and nothing it does not have', async () => {
    const f = await boot();
    try {
      expect(shown(f, 'salePreviewSiteNeighborhood')).not.toContain('--');
      set(f, 'saleBorough', 'Manhattan');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe('Manhattan');
      set(f, 'saleZipCode', '10065');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe('Manhattan, NY 10065');
      set(f, 'saleNeighborhoodFromAddress', 'Lenox Hill');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe('Lenox Hill, Manhattan, NY 10065');
      const hood = [...(box(f, 'saleBldgNeighborhood') as unknown as HTMLSelectElement).options].map((o) => o.value).find(Boolean)!;       // the Building tab's list: the building's neighborhood wins
      set(f, 'saleBldgNeighborhood', hood);
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe(`${hood}, Manhattan, NY 10065`);
      set(f, 'saleStateOrProvince', 'NJ');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe(`${hood}, Manhattan, NJ 10065`);
      set(f, 'saleStateOrProvince', '');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe(`${hood}, Manhattan, NY 10065`);
    } finally { await closeAfter(f); }
  });

  it('leaves out the blanks typed around a zip code or a neighborhood', async () => {
    const f = await boot();
    try {
      set(f, 'saleZipCode', '  10065 ');
      set(f, 'saleNeighborhoodFromAddress', ' Lenox Hill  ');
      set(f, 'saleBorough', 'Manhattan');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe('Lenox Hill, Manhattan, NY 10065');
      set(f, 'saleStateOrProvince', '  NJ ');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe('Lenox Hill, Manhattan, NJ 10065');
    } finally { await closeAfter(f); }
  });

  it('with nothing entered the location line is the placeholder, not dashes', async () => {
    const f = await boot();
    try {
      for (const id of ['saleBorough', 'saleZipCode', 'saleNeighborhoodFromAddress', 'saleBldgNeighborhood']) set(f, id, '');
      expect(shown(f, 'salePreviewSiteNeighborhood')).toBe('Neighborhood, Borough, NY');
    } finally { await closeAfter(f); }
  });

  it.each([['Coop', 'Co-op Information'], ['Condo', 'Condo Information'], ['Condop', 'Condop Information']])('%s has the co-op / condo panel titled %s', async (type, title) => {
    const f = await boot();
    try {
      typeIs(f, type);
      expect(shown(f, 'salePreviewSiteCoopTitle')).toBe(title);
      expect((f.d.getElementById('salePreviewSiteCoopInfo') as HTMLElement).classList.contains('hidden')).toBe(false);
    } finally { await closeAfter(f); }
  });

  it.each(['Loft', 'SingleFamily', 'DeededParking'])('%s has no co-op / condo panel', async (type) => {
    const f = await boot();
    try {
      typeIs(f, type);
      f.w.updateSalePreview();
      expect((f.d.getElementById('salePreviewSiteCoopInfo') as HTMLElement).classList.contains('hidden')).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('a page without the controls it reads does not fail', async () => {
    const f = await boot();
    try {
      for (const id of ['saleListingUrl', 'saleVideoUrl', 'saleVideoTourUrl', 'saleMatterportUrl', 'saleVirtualTourUnbranded', 'salePhotoPreview', 'saleStateOrProvince', 'saleZipCode', 'saleBldgNeighborhood',
        'saleTHUnitsTotal', 'saleBldgName', 'saleBldgElevator']) f.d.getElementById(id)?.remove();
      typeIs(f, 'Condo');
      expect(() => f.w.updateSalePreview()).not.toThrow();
      typeIs(f, 'SingleFamilyTownhouse');
      expect(() => f.w.updateSalePreview()).not.toThrow();
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });
});
