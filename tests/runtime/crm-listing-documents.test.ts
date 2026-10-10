/// <reference types="jest" />
/**
 * The Documents box and the Owner Opt-Out upload of the Sale and Rental Add / Edit forms (and of the Tools viewers, which are the same pages with the boxes switched off), on the REAL pages.
 *
 * Both boxes took a file and did nothing with it: no handler read it, nothing was sent, and nothing was saved, while the Opt-Out box said "Upload signed Opt-Out form (required within 48 hours)" (an
 * agent who "uploaded" it had not) and the Documents box said "Upload Documents". There is nothing to send them to: the document routes store a document for the agent (and, when given, a deal), not for
 * a listing, and the dashboard's listing Documents tab asks them for a listing's documents and reads an answer they do not give. So the boxes say what is true and are switched off.
 */
import { bootAddForm, sleep, type BootedForm } from './add-form-harness';
import { bootViewer, rendered, until, type ViewerFile } from './tools-viewer-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const closeAfter = async (f: BootedForm) => { await sleep(150); f.close(); };
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function expectDocumentsBoxOff(d: Document, prefix: string) {
  const input = d.getElementById(`${prefix}DocInput`) as HTMLInputElement;
  expect(input.disabled).toBe(true);
  const box = input.parentElement as HTMLElement;
  expect(box.getAttribute('onclick')).toBeNull();
  expect(box.className).not.toMatch(/cursor-pointer/);
  expect(text(box)).toContain('Documents cannot be attached to a listing from this form yet.');
  expect(text(box)).toContain('Nothing chosen here would be saved');
  expect(text(box)).not.toMatch(/Upload Documents/);
  const heading = box.previousElementSibling as HTMLElement;
  expect(text(heading)).toBe('Documents');
}

function expectOptOutUploadOff(d: Document, prefix: string) {
  const input = d.getElementById(`${prefix}OptOutFormUpload`) as HTMLInputElement;
  expect(input.disabled).toBe(true);
  const box = input.parentElement as HTMLElement;
  expect(text(box)).toContain('This form cannot store the signed Opt-Out form.');
  expect(text(box)).toContain('required within 48 hours');
  expect(text(box)).toContain('do not rely on this page for it');
  expect(text(box)).not.toMatch(/Upload signed Opt-Out form/);
}

describe.each([['SALE-FORM-REDESIGN', 'sale'], ['RENTAL-FORM-REDESIGN', 'rental']] as const)('%s', (form, prefix) => {
  it('the Documents box is switched off and says documents cannot be attached to a listing from this form yet', async () => {
    const f = await bootAddForm(form, { settle: 800 });
    try { expectDocumentsBoxOff(f.d, prefix); } finally { await closeAfter(f); }
  });

  it('the Owner Opt-Out upload is switched off and says the form cannot store the signed Opt-Out form (and that it is due within 48 hours)', async () => {
    const f = await bootAddForm(form, { settle: 800 });
    try { expectOptOutUploadOff(f.d, prefix); } finally { await closeAfter(f); }
  });

  it('a file given to either box anyway is not sent anywhere and breaks nothing', async () => {
    const f = await bootAddForm(form, { settle: 800 });
    try {
      for (const id of [`${prefix}DocInput`, `${prefix}OptOutFormUpload`]) {
        const input = f.d.getElementById(id) as HTMLInputElement;
        const file = new f.w.File(['x'], 'optout.pdf', { type: 'application/pdf' });
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      }
      await sleep(200);
      expect(f.requests.filter((r) => /document|upload/i.test(r.url))).toEqual([]);
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('is saved like the rest of the form: the boxes add nothing to what is collected', async () => {
    const f = await bootAddForm(form, { settle: 800 });
    try {
      const data = (prefix === 'sale' ? f.w.collectSaleFormData() : f.w.collectRentalFormData()) as Record<string, unknown>;
      expect(data[`${prefix}DocInput`] ?? '').toBe('');
      expect(data[`${prefix}OptOutFormUpload`] ?? '').toBe('');
    } finally { await closeAfter(f); }
  });
});

describe.each([
  ['SALE-FORM-WITH-TOOLS', 'sale', 'SL-0404'],
  ['RENTAL-FORM-WITH-TOOLS', 'rental', 'RL-0404'],
] as const)('%s (the Tools viewer)', (viewer, prefix, lid) => {
  it('says what the Add form says about the Documents box and the Owner Opt-Out upload', async () => {
    const b = bootViewer(viewer as ViewerFile, { search: `?id=${lid}`, listing: { id: '404', listing_id: lid, status: 'Active', raw_data: {} } });
    try {
      await until(() => rendered(b.d), 15000);
      expectDocumentsBoxOff(b.d, prefix);
      expectOptOutUploadOff(b.d, prefix);
      expect(b.errors).toEqual([]);
    } finally { b.close(); }
  });
});
