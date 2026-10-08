/// <reference types="jest" />
/**
 * The Sale Add / Edit form says only what happened when it submits or saves (the Rental form's crm-rental-save-feedback.test.ts, for the Sale form).
 *
 * Found by an adversarial read of the form:
 *  - Submit and Save Draft could be pressed again while the first was out: a new listing was created twice;
 *  - a failed submit was said in the page's neutral toast and promised "Draft has been saved locally" while it wrote a list (`saleListings`) that nothing ever reads, so a failed submit was not
 *    restorable from what it said;
 *  - anything that went wrong AFTER the listing was saved (a step of the page's own) was said as "Submission failed", so the agent pressed Submit again;
 *  - with the CRM not connected, Submit said "SUCCESS! Draft saved locally (offline mode)." with the listing id "undefined";
 *  - the autosave indicator said "Draft saved <time>" for a saved listing's changes whatever the server answered.
 * These tests drive the REAL page with a CRM that is slow, refuses, or fails.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'SALE-FORM-REDESIGN';
const BUTTONS = '[onclick*="submitSalesListing"], [onclick*="saveSalesDraft"], [onclick*="manualSaveDraft"]';
const SAVED = { id: '9', listing_id: 'SL-9', status: 'Draft', address: {}, features: {}, agent_info: {}, media: [], raw_data: {} };
const DRAFT = 'mallan_draft_sale';

const gate = () => { let release!: () => void; const promise = new Promise<void>((r) => { release = r; }); return { promise, release }; };
// the page's own toasts: the text, and the colour the page gave them
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('body > div[style*="99999"]')].map((t) => ({ text: t.textContent ?? '', colour: (t as HTMLElement).style.background }));
const RED = 'rgb(220, 38, 38)', AMBER = 'rgb(217, 119, 6)';
const buttons = (f: BootedForm) => [...f.d.querySelectorAll(BUTTONS)] as HTMLButtonElement[];
const creates = (f: BootedForm) => f.calls.filter((c) => c === 'create');
const labels = (f: BootedForm) => buttons(f).map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
const closeAfter = async (f: BootedForm) => { await sleep(100); f.close(); };
/** What the autosave indicator in the listing bar says now. */
const indicatorText = (f: BootedForm) => (f.d.getElementById('saleAutoSaveText')?.textContent ?? '').trim();
const choose = (f: BootedForm, step: string) => {
  const select = f.d.getElementById('saleStatus') as HTMLSelectElement;
  if (![...select.options].some((o) => o.value === step)) {
    const option = f.d.createElement('option');
    option.value = step; option.textContent = step;
    select.appendChild(option);
  }
  select.value = step;
};

/** A new form that can be submitted as it is (an In-House web listing asks for no REBNY field), whose alerts are collected. */
async function newForm(o: AddFormOpts = {}) {
  const f = await bootAddForm(FORM, { settle: 1200, ...o });
  (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
  const alerts: string[] = [];
  f.w.alert = (message: unknown) => { alerts.push(String(message)); };
  return { f, alerts };
}
/** A saved listing, opened for editing once it is back in the form. */
async function savedForm(o: AddFormOpts = {}) {
  const f = await bootAddForm(FORM, { search: '?id=9', listing: SAVED, settle: 1500, ...o });
  await until(() => f.w.eval('_saleEditLoad') === 'loaded', 40000);
  (f.d.querySelector('input[name="saleListingType"][value="InHouseWebOnly"]') as HTMLInputElement).checked = true;
  const alerts: string[] = [];
  f.w.alert = (message: unknown) => { alerts.push(String(message)); };
  return { f, alerts };
}

describe(`${FORM}: Submit`, () => {
  it('sends a new listing once, however often Submit is pressed while the first is out; the buttons are off meanwhile and on again after', async () => {
    const { promise, release } = gate();
    const { f } = await newForm({ createGate: promise });
    try {
      f.w.submitSalesListing();
      f.w.submitSalesListing();
      (f.d.querySelector('[onclick="submitSalesListing()"]') as HTMLElement).click();
      await sleep(100);
      expect(f.calls).toEqual(['create']);
      expect(buttons(f)).toHaveLength(4);                                                  // Save Draft and Submit, in the header and at the foot
      expect(buttons(f).every((b) => b.disabled)).toBe(true);
      expect(buttons(f).every((b) => b.classList.contains('opacity-60') && b.classList.contains('cursor-not-allowed'))).toBe(true);          // and they look off
      release();
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      expect(buttons(f).some((b) => b.classList.contains('opacity-60') || b.classList.contains('cursor-not-allowed'))).toBe(false);
      expect(creates(f)).toHaveLength(1);
    } finally { release(); await closeAfter(f); }
  });

  it('presses Submit again after a save: the listing is updated, not created again, and each answer names the listing', async () => {
    const { f } = await newForm();
    try {
      f.w.submitSalesListing();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      expect(toasts(f).filter((t) => /Listing L-1 saved — Status: Draft/.test(t.text))).toHaveLength(1);
      expect(f.d.getElementById('saleListingIdDisplay')!.textContent).toBe('L-1');
      const before = f.calls.length;
      f.w.submitSalesListing();
      await until(() => f.calls.length > before && buttons(f).every((b) => !b.disabled), 15000);
      expect(creates(f)).toHaveLength(1);
      expect(f.calls[before]).toBe('update 1');
      await until(() => toasts(f).filter((t) => /Listing L-1 saved — Status: Draft/.test(t.text)).length === 2, 15000);          // (the server's answer to an update names no listing: the page's own is used)
      expect(f.d.getElementById('saleListingIdDisplay')!.textContent).toBe('L-1');
    } finally { await closeAfter(f); }
  });

  it('names a saved listing in its answer by the id the page holds, though the server\'s answer to its update has none', async () => {
    const { f } = await savedForm();
    try {
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /Listing SL-9 saved — Status: Draft/.test(t.text)) && buttons(f).every((b) => !b.disabled), 15000);
      expect(f.d.getElementById('saleListingIdDisplay')!.textContent).toBe('SL-9');
      expect(f.calls[0]).toBe('update 9');
    } finally { await closeAfter(f); }
  });

  it('says a refused submit in an error toast with the server\'s words, keeps the entries and a copy where the draft is restored from, turns the buttons on and lets the agent try again', async () => {
    const { f, alerts } = await newForm({ createError: 'Description holds wording the server refuses' });
    try {
      (f.d.getElementById('salePrice') as HTMLInputElement).value = '1500000';
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Submission failed/.test(t.text))!;
      expect(failure.text).toContain('Submission failed: Description holds wording the server refuses');
      expect(failure.text).toContain('Nothing was saved to the CRM');
      expect(failure.text).toContain('the form still holds everything you entered');
      expect(failure.text).toContain('a copy is kept in this browser');
      expect(failure.colour).toBe(RED);
      expect(alerts).toEqual([]);
      expect(f.saved).toEqual([]);
      const copy = JSON.parse(f.w.localStorage.getItem(DRAFT));                              // (the key the restore reads)
      expect(copy._savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(copy._formType).toBe('sale');
      expect(copy.salePrice).toBe('1500000');                                               // (what was entered is in it)
      expect(f.w.localStorage.getItem('saleListings')).toBeNull();                         // (a list nothing reads)
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      f.w.submitSalesListing();
      await until(() => creates(f).length === 2, 15000);
    } finally { await closeAfter(f); }
  });

  it('does not say a copy is kept when this browser cannot keep one', async () => {
    const { f } = await newForm({ createError: 'refused' });
    try {
      f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Submission failed/.test(t.text))!;
      expect(failure.text).toContain('Nothing was saved to the CRM; the form still holds everything you entered.');
      expect(failure.text).not.toContain('copy');
      expect(failure.colour).toBe(RED);
    } finally { await closeAfter(f); }
  });

  it('says a failed update of a saved listing as an update, without a browser copy (it would shadow the saved listing), and sends it once', async () => {
    const { f } = await savedForm({ updateError: 'The listing is locked' });
    try {
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /Update failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Update failed/.test(t.text))!;
      expect(failure.text).toContain('Update failed: The listing is locked');
      expect(failure.text).toContain('Nothing was saved to the CRM');
      expect(failure.text).not.toContain('copy');
      expect(failure.colour).toBe(RED);
      expect(f.w.localStorage.getItem(DRAFT)).toBeNull();
      expect(f.calls).toEqual(['update 9']);
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('does not say the submit failed when the listing was saved and a later step of the page broke: it says the listing is saved, so it is not sent again', async () => {
    const { f, alerts } = await newForm({ statusAnswer: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' } });
    try {
      f.w.showSalePublishedPanel = () => { throw new Error('the panel broke'); };
      choose(f, 'Active');
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /The (listing|draft) was saved as/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /The (listing|draft) was saved as/.test(t.text))!;
      expect(note.text).toContain('The listing was saved as L-1, but a later step failed: the panel broke. Do not submit it again; open the listing to check it.');
      expect(note.colour).toBe(AMBER);
      expect(toasts(f).some((t) => /Submission failed/.test(t.text))).toBe(false);
      expect(alerts.some((a) => /Submission failed/.test(a))).toBe(false);
      expect(f.w.eval('_saleEditMode')).toBe(true);                                        // the page now holds a saved listing: a second Submit updates it
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      f.w.submitSalesListing();
      await until(() => f.calls.filter((c) => c === 'update 1').length >= 2, 15000);
      expect(creates(f)).toHaveLength(1);
    } finally { await closeAfter(f); }
  });

  it.each<[string, () => unknown, string]>([
    ['with a reason', () => new Error('the panel broke'), 'the panel broke'],
    ['with none', () => undefined, 'an error'],
  ])('names a saved listing by the id the page holds, though the server\'s answer to its update has none, when a later step of the page breaks %s', async (_what, failure, said) => {
    const { f } = await savedForm({ statusAnswer: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' } });
    try {
      f.w.showSalePublishedPanel = () => { throw failure(); };
      choose(f, 'Active');
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /The (listing|draft) was saved as/.test(t.text)), 15000);
      expect(toasts(f).find((t) => /The (listing|draft) was saved as/.test(t.text))!.text).toContain(`The listing was saved as SL-9, but a later step failed: ${said}. Do not submit it again; open the listing to check it.`);
      expect(toasts(f).some((t) => /Update failed|Submission failed/.test(t.text))).toBe(false);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('updates, and does not create again, when the server\'s answer to the first save had no database id (by the listing id the server gave, which the route takes as well)', async () => {
    const { f, alerts } = await newForm({ created: { id: undefined } });
    try {
      f.w.submitSalesListing();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      f.w.submitSalesListing();
      await until(() => f.calls.length === 2 && buttons(f).every((b) => !b.disabled), 15000);
      expect(f.calls).toEqual(['create', 'update L-1']);
      expect(alerts).toEqual([]);                                                          // (it was refused with "Please save as draft first", which created the listing again)
    } finally { await closeAfter(f); }
  });

  it('gives a reason of its own when the server\'s refusal has none, for a submit and for a save', async () => {
    const submit = await newForm();
    const save = await newForm();
    try {
      submit.f.w.MallanAPI.listings.create = async () => { throw Object.assign(new Error(''), { status: 422 }); };
      submit.f.w.submitSalesListing();
      await until(() => toasts(submit.f).some((t) => /Submission failed/.test(t.text)), 15000);
      expect(toasts(submit.f).find((t) => /Submission failed/.test(t.text))!.text).toContain('Submission failed: the server did not accept the listing. Nothing was saved to the CRM');
      save.f.w.MallanAPI.listings.create = async () => { throw Object.assign(new Error(''), { status: 422 }); };
      save.f.w.manualSaveDraft();
      await until(() => toasts(save.f).some((t) => /Save failed/.test(t.text)), 15000);
      expect(toasts(save.f).find((t) => /Save failed/.test(t.text))!.text).toContain('Save failed: the server did not accept the draft');
      await until(() => buttons(save.f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(submit.f); await closeAfter(save.f); }
  });

  it('turns the buttons on again even when the page cannot show the failure', async () => {
    const { f } = await newForm({ createError: 'refused' });
    try {
      f.w.showToast = () => { throw new Error('the toast could not be shown'); };
      f.w.submitSalesListing();
      await until(() => f.calls.length === 1, 15000);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('says that nothing was submitted when the CRM is not connected, keeps a copy of a new listing, and says no "SUCCESS"', async () => {
    const { f, alerts } = await newForm();
    try {
      f.w.MallanAPI.isReady = false;
      f.w.submitSalesListing();
      const note = toasts(f).find((t) => /not connected/.test(t.text))!;
      expect(note.text).toContain('the listing was not submitted');
      expect(note.text).toContain('A copy is kept in this browser');
      expect(note.colour).toBe(AMBER);
      expect(f.calls).toEqual([]);
      expect(JSON.parse(f.w.localStorage.getItem(DRAFT))._formType).toBe('sale');
      expect(f.w.localStorage.getItem('saleListings')).toBeNull();
      expect(alerts).toEqual([]);                                                          // (no "SUCCESS! Draft saved locally")
      expect(f.d.getElementById('saleListingIdDisplay')!.textContent).not.toContain('undefined');
    } finally { await closeAfter(f); }
  });

  it('says so when the CRM is not connected and this browser cannot keep a copy either, and for a saved listing says nothing was submitted without a copy (it would shadow the saved listing)', async () => {
    const fresh = await newForm();
    const saved = await savedForm();
    try {
      fresh.f.w.MallanAPI.isReady = false;
      fresh.f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      fresh.f.w.submitSalesListing();
      const noCopy = toasts(fresh.f).find((t) => /not connected/.test(t.text))!;
      expect(noCopy.text).toContain('could not keep a copy');
      expect(noCopy.colour).toBe(RED);
      saved.f.w.MallanAPI.isReady = false;
      saved.f.w.submitSalesListing();
      const note = toasts(saved.f).find((t) => /not connected/.test(t.text))!;
      expect(note.text).toContain('the listing was not submitted. The form still holds everything you entered.');
      expect(note.text).not.toContain('copy');
      expect(note.colour).toBe(RED);
      expect(saved.f.w.localStorage.getItem(DRAFT)).toBeNull();
    } finally { await closeAfter(fresh.f); await closeAfter(saved.f); }
  });

  it('turns Submit into Update, and Save Draft into Save Changes, once the page holds a saved listing (opened, or created by this Submit)', async () => {
    const { f } = await newForm();
    try {
      const icons = () => f.d.querySelectorAll('[onclick*="submitSalesListing"] i, [onclick*="saveSalesDraft"] i, [onclick*="manualSaveDraft"] i').length;
      const iconsBefore = icons();
      expect(iconsBefore).toBeGreaterThanOrEqual(2);
      expect(labels(f)).toEqual(['Save Draft', 'Submit', 'Save as Draft', 'Submit']);
      f.w.submitSalesListing();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      expect(labels(f)).toEqual(['Save Changes', 'Update', 'Save Changes', 'Update']);
      expect(icons()).toBe(iconsBefore);                                                   // (every button keeps its icon, Submit's too)
    } finally { await closeAfter(f); }
    const opened = await savedForm();
    try {
      expect(labels(opened.f)).toEqual(['Save Changes', 'Update', 'Save Changes', 'Update']);
      expect(opened.f.d.querySelectorAll('[onclick*="saveSalesDraft"] i, [onclick*="manualSaveDraft"] i')).toHaveLength(2);          // (the icon stays)
    } finally { await closeAfter(opened.f); }
  });

  it('sends nothing, with Save Draft or with Submit, while the saved listing is still loading or after it failed to load (a save would replace it with a blank form), and says so', async () => {
    const loading = await bootAddForm(FORM, { search: '?id=9', listing: SAVED, getDelay: 30000, settle: 300 });
    const failed = await bootAddForm(FORM, { search: '?id=9', getError: 'offline', settle: 300 });
    try {
      await until(() => loading.w.eval('_saleEditLoad') === 'loading', 15000);
      await until(() => failed.w.eval('_saleEditLoad') === 'failed', 30000);
      for (const [f, said] of [[loading, /still loading/], [failed, /did not load/]] as const) {
        f.w.manualSaveDraft();
        f.w.submitSalesListing();
        const notes = toasts(f).filter((t) => said.test(t.text));
        expect(notes).toHaveLength(2);                                                       // one for each press
        expect(notes.every((t) => t.colour === RED)).toBe(true);
        expect(f.calls).toEqual([]);
        expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      }
    } finally { loading.close(); failed.close(); }
  });
});

describe(`${FORM}: Save Draft`, () => {
  it('sends a new listing once however often it is pressed while the first is out; the buttons are off meanwhile; the draft is said saved once the server has answered', async () => {
    const { promise, release } = gate();
    const { f } = await newForm({ createGate: promise });
    try {
      f.w.manualSaveDraft();
      f.w.manualSaveDraft();
      (f.d.querySelector('[onclick="manualSaveDraft(\'sale\')"]') as HTMLElement).click();
      f.w.saveSalesDraft();                                                                // the foot's button goes through the same function
      await sleep(150);
      expect(f.calls).toEqual(['create']);
      expect(buttons(f).every((b) => b.disabled)).toBe(true);
      expect(toasts(f).some((t) => /Draft saved/.test(t.text))).toBe(false);                // (the server has not answered)
      release();
      await until(() => toasts(f).some((t) => /Draft saved: L-1/.test(t.text)), 15000);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      expect(f.calls).toEqual(['create']);
    } finally { release(); await closeAfter(f); }
  });

  it('on a saved listing, sends the changes once and says so once the server has taken them', async () => {
    const { promise, release } = gate();
    const { f } = await savedForm({ updateGate: promise });
    try {
      f.w.manualSaveDraft();
      f.w.manualSaveDraft();
      await sleep(150);
      expect(f.calls).toEqual(['update 9']);
      expect(buttons(f).every((b) => b.disabled)).toBe(true);
      expect(toasts(f).some((t) => /Draft saved/.test(t.text))).toBe(false);
      release();
      await until(() => toasts(f).some((t) => /Draft saved: SL-9/.test(t.text)), 15000);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      expect(f.calls).toEqual(['update 9']);
    } finally { release(); await closeAfter(f); }
  });

  it('says the draft was NOT saved when the server refuses it, keeps a copy of a new listing where the restore reads it, and turns the buttons on', async () => {
    const { f } = await newForm({ createError: 'Monthly price must be above 0' });
    try {
      f.w._saleAutoSaveReady = true;
      f.w.manualSaveDraft();
      await until(() => toasts(f).some((t) => /Save failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Save failed/.test(t.text))!;
      expect(failure.text).toContain('Save failed: Monthly price must be above 0');
      expect(failure.colour).toBe(RED);
      expect(JSON.parse(f.w.localStorage.getItem(DRAFT))._formType).toBe('sale');
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('on a saved listing, keeps no browser copy when the server refuses the changes (a copy would shadow the saved listing), and says they were not saved', async () => {
    const { f } = await savedForm({ updateError: 'no' });
    try {
      f.w._saleAutoSaveReady = true;
      f.w.manualSaveDraft();
      await until(() => toasts(f).some((t) => /Save failed/.test(t.text)), 15000);
      expect(f.w.localStorage.getItem(DRAFT)).toBeNull();
      expect(indicatorText(f)).toBe('Not saved to the CRM');
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('does not send the changes of a saved listing again after the server refused them (the autosave waits two seconds, so this waits longer)', async () => {
    const { f } = await savedForm({ updateError: 'no' });
    try {
      f.w._saleAutoSaveReady = true;
      f.w.manualSaveDraft();
      await until(() => toasts(f).some((t) => /Save failed/.test(t.text)) && buttons(f).every((b) => !b.disabled), 15000);
      await sleep(2600);
      expect(f.calls).toEqual(['update 9']);
      expect(f.w.localStorage.getItem(DRAFT)).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('updates, and does not create again, when the server\'s answer to the first save had no database id (by the listing id the server gave)', async () => {
    const { f } = await newForm({ created: { id: undefined } });
    try {
      f.w.manualSaveDraft();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      f.w.manualSaveDraft();
      await until(() => f.calls.length === 2 && buttons(f).every((b) => !b.disabled), 15000);
      expect(f.calls).toEqual(['create', 'update L-1']);
      await until(() => toasts(f).filter((t) => /Draft saved: L-1/.test(t.text)).length === 2, 15000);
    } finally { await closeAfter(f); }
  });

  it('says the changes are not confirmed, not that the draft may not exist, when the page knows the listing only by the listing id the server gave', async () => {
    const { f } = await newForm({ created: { id: undefined, listing_id: 'SL-5' } });
    try {
      f.w.manualSaveDraft();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      f.w.MallanAPI.listings.update = () => Promise.reject(Object.assign(new Error('Failed to fetch'), { status: null }));
      f.w.manualSaveDraft().catch(() => undefined);
      await until(() => toasts(f).some((t) => /did not confirm/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /did not confirm/.test(t.text))!.text;
      expect(note).toContain('did not confirm that the changes were saved');
      expect(note).not.toContain('whether the draft was saved');
    } finally { await closeAfter(f); }
  });

  it('turns the buttons on again after a save even when the page cannot show the answer', async () => {
    const ok = await savedForm();
    const refused = await savedForm({ updateError: 'no' });
    try {
      for (const { f } of [ok, refused]) {
        f.w.showToast = () => { throw new Error('the toast could not be shown'); };
        f.w.manualSaveDraft().catch(() => undefined);                                       // (the page's own handler would log it)
        await until(() => f.calls.length === 1, 15000);
        await until(() => buttons(f).every((b) => !b.disabled), 15000);
      }
    } finally { await closeAfter(ok.f); await closeAfter(refused.f); }
  });
});

describe(`${FORM}: the autosave indicator`, () => {
  const indicator = (f: BootedForm) => ({ text: (f.d.getElementById('saleAutoSaveText')?.textContent ?? '').trim(), el: f.d.getElementById('saleAutoSaveIndicator') as HTMLElement });
  const colour = (f: BootedForm) => ['text-gray-600', 'text-green-700', 'text-red-700'].filter((c) => indicator(f).el.classList.contains(c));
  const GREY = ['text-gray-600'], GREEN = ['text-green-700'], RED_TEXT = ['text-red-700'];
  const says = (f: BootedForm, text: string) => until(() => indicator(f).text === text, 15000);

  it('is in the listing bar, hidden until the autosave has run, and announced to screen readers', async () => {
    const { f } = await newForm();
    try {
      expect(indicator(f).el.classList.contains('hidden')).toBe(true);                         // (nothing to say until the autosave has run)
      expect(indicator(f).el.getAttribute('role')).toBe('status');
      expect(indicator(f).el.getAttribute('aria-live')).toBe('polite');
      expect(indicator(f).el.title).toBe('');
      f.w._saleAutoSaveReady = true;
      f.w.performAutoSave();
      expect(indicator(f).el.classList.contains('hidden')).toBe(false);
      expect(indicator(f).text).toBe('Saving...');
      expect(indicator(f).el.title).toBe('');                                                  // ("Saving..." has no time: nothing has been saved yet)
      expect(colour(f)).toEqual(GREY);
    } finally { await closeAfter(f); }
  });

  it('does not break the autosave, or the saves, on a page that has no indicator', async () => {
    const { f } = await savedForm();
    try {
      f.d.getElementById('saleAutoSaveIndicator')!.remove();
      f.w._saleAutoSaveReady = true;
      expect(() => f.w.performAutoSave()).not.toThrow();
      await until(() => f.calls.length === 1, 15000);
      expect(f.calls).toEqual(['update 9']);
      await sleep(800);                                                                    // (the indicator is set 500 ms after the save: a page error there would come later)
      f.d.getElementById('saleAutoSaveText')?.remove();
      expect(() => f.w._saleShowSaveState('Saved to the CRM', 'ok')).not.toThrow();
      expect(f.errors).toEqual([]);
    } finally { await closeAfter(f); }
  });

  it('does not break the autosave on a page that has the indicator but not its text, or the text but not the indicator', async () => {
    const noText = await savedForm();
    const noIndicator = await savedForm();
    try {
      noText.f.d.getElementById('saleAutoSaveText')!.remove();
      noIndicator.f.d.getElementById('saleAutoSaveIndicator')!.remove();
      for (const { f } of [noText, noIndicator]) {
        f.w._saleAutoSaveReady = true;
        expect(() => f.w.performAutoSave()).not.toThrow();
        await until(() => f.calls.length === 1, 15000);
        await sleep(800);                                                                  // (the indicator is set 500 ms after the save)
        expect(f.errors).toEqual([]);
        expect(() => f.w._saleShowSaveState('Saved to the CRM', 'ok')).not.toThrow();
      }
    } finally { await closeAfter(noText.f); await closeAfter(noIndicator.f); }
  });

  it('keeps no copy in this browser for a saved listing whose first answer had no database id (the page holds the listing id only), and saves its changes to the CRM', async () => {
    const { f } = await newForm({ created: { id: undefined, listing_id: 'SL-5' } });
    try {
      f.w.manualSaveDraft();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      f.w.localStorage.removeItem(DRAFT);
      f.w._saleAutoSaveReady = true;
      f.w.performAutoSave();
      await says(f, 'Saved to the CRM');
      expect(f.w.localStorage.getItem(DRAFT)).toBeNull();                                  // (a copy would shadow the saved listing)
      expect(f.calls).toEqual(['create', 'update SL-5']);
    } finally { await closeAfter(f); }
  });

  it('says a new listing\'s draft is in this browser, and the time as its tooltip', async () => {
    const { f } = await newForm();
    try {
      f.w._saleAutoSaveReady = true;
      f.w.performAutoSave();
      await says(f, 'Draft saved in this browser');
      expect(colour(f)).toEqual(GREEN);
      expect(indicator(f).el.title).toMatch(/\d{1,2}:\d{2}:\d{2}/);
      expect(f.calls).toEqual([]);
      expect(f.d.getElementById('saleLastUpdated')!.textContent).not.toBe('--');
    } finally { await closeAfter(f); }
  });

  it('says in red that a new listing\'s draft is nowhere when this browser cannot keep a copy, and does not touch the time of the last update', async () => {
    const { f } = await newForm();
    try {
      f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      f.w._saleAutoSaveReady = true;
      f.w.performAutoSave();
      await says(f, 'Not saved: this browser could not keep a copy');
      expect(colour(f)).toEqual(RED_TEXT);
      expect(f.d.getElementById('saleLastUpdated')!.textContent).toBe('--');
    } finally { await closeAfter(f); }
  });

  it('says a saved listing\'s changes are saved to the CRM once the server has taken them, and says in red when it refused them or did not answer, without touching the time of the last update', async () => {
    const ok = await savedForm();
    const refused = await savedForm({ updateError: 'The listing is locked' });
    const silent = await savedForm({ updateError: 'Failed to fetch', updateErrorStatus: null });
    try {
      ok.f.w._saleAutoSaveReady = true;
      ok.f.w.performAutoSave();
      expect(indicator(ok.f).text).toBe('Saving...');
      expect(colour(ok.f)).toEqual(GREY);
      await says(ok.f, 'Saved to the CRM');
      expect(colour(ok.f)).toEqual(GREEN);                                                   // (the colour of the answer, not the grey of "Saving...")
      expect(ok.f.d.getElementById('saleLastUpdated')!.textContent).not.toBe('');
      ok.f.w.performAutoSave();                                                              // the next one starts from grey again
      expect(indicator(ok.f).text).toBe('Saving...');
      expect(colour(ok.f)).toEqual(GREY);

      const stamp = refused.f.d.getElementById('saleLastUpdated')!.textContent;
      refused.f.w._saleAutoSaveReady = true;
      refused.f.w.performAutoSave();
      await says(refused.f, 'Not saved to the CRM');
      expect(colour(refused.f)).toEqual(RED_TEXT);
      expect(refused.f.d.getElementById('saleLastUpdated')!.textContent).toBe(stamp);
      refused.f.w.MallanAPI.listings.update = async () => ({});                           // the server takes the next one
      refused.f.w.performAutoSave();
      await says(refused.f, 'Saved to the CRM');
      expect(colour(refused.f)).toEqual(GREEN);

      const quiet = silent.f.d.getElementById('saleLastUpdated')!.textContent;
      silent.f.w._saleAutoSaveReady = true;
      silent.f.w.performAutoSave();
      await says(silent.f, 'Not confirmed by the CRM');
      expect(colour(silent.f)).toEqual(RED_TEXT);
      expect(silent.f.d.getElementById('saleLastUpdated')!.textContent).toBe(quiet);
    } finally { await closeAfter(ok.f); await closeAfter(refused.f); await closeAfter(silent.f); }
  });

  it('does not take a failure with no reason for a success (a request rejected with nothing)', async () => {
    const { f } = await savedForm();
    try {
      f.w.MallanAPI.listings.update = () => Promise.reject(undefined);
      f.w._saleAutoSaveReady = true;
      f.w.performAutoSave();
      await says(f, 'Not confirmed by the CRM');
      expect(colour(f)).toEqual(RED_TEXT);
    } finally { await closeAfter(f); }
  });

  it('says a saved listing is not saved when it could not be sent at all (the CRM is not connected, or the client did not load)', async () => {
    const offline = await savedForm();
    const noClient = await savedForm();
    try {
      offline.f.w.MallanAPI.isReady = false;
      offline.f.w._saleAutoSaveReady = true;
      offline.f.w.performAutoSave();
      await says(offline.f, 'Not saved to the CRM');
      expect(colour(offline.f)).toEqual(RED_TEXT);
      expect(offline.f.w.localStorage.getItem(DRAFT)).toBeNull();                          // (a saved listing keeps no copy in this browser: the indicator must not say it has one)
      delete noClient.f.w.MallanAPI.listings;
      noClient.f.w._saleAutoSaveReady = true;
      noClient.f.w.performAutoSave();
      await says(noClient.f, 'Not saved to the CRM');
      expect(noClient.f.errors).toEqual([]);
    } finally { await closeAfter(offline.f); await closeAfter(noClient.f); }
  });

  it('waits for a submit that is out, and runs when it is over (two requests for one listing could land in either order)', async () => {
    const { promise, release } = gate();
    const { f } = await savedForm({ updateGate: promise });
    try {
      f.w.submitSalesListing();
      await sleep(100);
      expect(f.calls).toEqual(['update 9']);
      f.w._saleAutoSaveReady = true;
      f.w.performAutoSave();
      expect(f.calls).toEqual(['update 9']);                                                // (it sent nothing: the submit is out)
      expect(indicator(f).el.classList.contains('hidden')).toBe(true);                       // and said nothing
      release();
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      const afterSubmit = f.calls.length;
      expect(f.calls.slice(afterSubmit)).toEqual([]);
      await until(() => f.calls.length === afterSubmit + 1, 15000);                          // (the autosave that came due while the submit was out runs now)
      expect(f.calls[afterSubmit]).toBe('update 9');
      expect(f.w._saleAutoSavePending).toBe(false);                                          // (and it is used up: it ran once, and the next request that ends does not run it again)
    } finally { release(); await closeAfter(f); }
  });

  it('does not run an autosave that is waiting when a request starts, only when it is over', async () => {
    const { f } = await savedForm();
    try {
      f.w._saleAutoSaveReady = true;
      f.w._saleAutoSavePending = true;                                                      // (an autosave came due while the last request was out and has not run yet)
      f.w._saleSetBusy(true);
      expect(f.w._saleAutoSavePending).toBe(true);                                          // (a request starting does not use it up)
      f.w._saleSetBusy(false);
      expect(f.w._saleAutoSavePending).toBe(false);                                         // (one that is over does)
    } finally { await closeAfter(f); }
  });

  it('is told by Save Draft and by Submit too: saved to the CRM, or in red that it was not saved, or not confirmed', async () => {
    const created = await newForm();
    const refused = await newForm({ createError: 'no' });
    const silent = await savedForm({ updateError: 'boom', updateErrorStatus: 503 });
    const submitted = await newForm();
    const submitRefused = await newForm({ createError: 'no' });
    const submitSilent = await newForm({ createError: 'boom', createErrorStatus: 500 });
    try {
      created.f.w.manualSaveDraft();
      await says(created.f, 'Saved to the CRM');
      expect(colour(created.f)).toEqual(GREEN);
      refused.f.w.manualSaveDraft();
      await says(refused.f, 'Not saved to the CRM');
      expect(colour(refused.f)).toEqual(RED_TEXT);
      silent.f.w.manualSaveDraft();
      await says(silent.f, 'Not confirmed by the CRM');
      expect(colour(silent.f)).toEqual(RED_TEXT);
      submitted.f.w.submitSalesListing();
      await says(submitted.f, 'Saved to the CRM');
      expect(colour(submitted.f)).toEqual(GREEN);
      submitRefused.f.w.submitSalesListing();
      await says(submitRefused.f, 'Not saved to the CRM');
      expect(colour(submitRefused.f)).toEqual(RED_TEXT);
      submitSilent.f.w.submitSalesListing();
      await says(submitSilent.f, 'Not confirmed by the CRM');
      expect(colour(submitSilent.f)).toEqual(RED_TEXT);
    } finally { for (const x of [created, refused, silent, submitted, submitRefused, submitSilent]) await closeAfter(x.f); }
  });
});

describe(`${FORM}: when the CRM does not say what happened`, () => {
  // The create route answers 500 when it committed the listing and could not build its answer, and a request that got no answer says nothing at all: "nothing was saved" is only for a refusal (a 4xx).
  it.each([
    ['a 500 (the create route answers it when the listing was committed and the answer could not be built)', 500],
    ['a 502', 502],
    ['a 408', 408],
    ['a 304 (not an answer to a create)', 304],
    ['no answer at all (the network is down)', null],
  ] as const)('does not say that nothing was saved when a new listing\'s submit gets %s: it says to check My Listings before submitting again, and keeps a copy', async (_why, status) => {
    const { f } = await newForm({ createError: 'Failed to create listing: boom', createErrorStatus: status });
    try {
      (f.d.getElementById('salePrice') as HTMLInputElement).value = '1500000';
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /did not confirm/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /did not confirm/.test(t.text))!;
      expect(note.text).toContain('The CRM did not confirm whether the listing was saved: Failed to create listing: boom. Check My Listings for this address before submitting it again; the form still holds everything you entered, and a copy is kept in this browser.');
      expect(note.text).not.toContain('Nothing was saved');
      expect(note.colour).toBe(RED);
      expect(toasts(f).some((t) => /Submission failed/.test(t.text))).toBe(false);
      expect(JSON.parse(f.w.localStorage.getItem(DRAFT)).salePrice).toBe('1500000');
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 499] as const)('says that nothing was saved when the server refuses a new listing with a %i', async (status) => {
    const { f } = await newForm({ createError: 'The server said no', createErrorStatus: status });
    try {
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /Submission failed/.test(t.text))!;
      expect(note.text).toContain('Submission failed: The server said no. Nothing was saved to the CRM; the form still holds everything you entered, and a copy is kept in this browser.');
      expect(toasts(f).some((t) => /did not confirm/.test(t.text))).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('says an update of a saved listing that the CRM did not confirm as that, and says it can be sent again (the same changes), keeping no browser copy', async () => {
    const { f } = await savedForm({ updateError: 'Request failed: 503', updateErrorStatus: 503 });
    try {
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /did not confirm/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /did not confirm/.test(t.text))!;
      expect(note.text).toContain('The CRM did not confirm whether the changes were saved: Request failed: 503. Press Update to send them again; the form still holds everything you entered.');
      expect(note.text).not.toContain('Nothing was saved');
      expect(note.text).not.toContain('copy');
      expect(note.colour).toBe(RED);
      expect(f.w.localStorage.getItem(DRAFT)).toBeNull();
      expect(f.calls).toEqual(['update 9']);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('says a Save Draft that the CRM did not confirm as that: for a new draft to check My Listings first, for a saved listing that Save Changes can be pressed again; and "Save failed" only for a refusal', async () => {
    const created = await newForm({ createError: 'boom', createErrorStatus: 500 });
    const updated = await savedForm({ updateError: 'Failed to fetch', updateErrorStatus: null });
    const refused = await savedForm({ updateError: 'The listing is locked', updateErrorStatus: 409 });
    try {
      created.f.w.manualSaveDraft();
      await until(() => toasts(created.f).some((t) => /did not confirm/.test(t.text)), 15000);
      const first = toasts(created.f).find((t) => /did not confirm/.test(t.text))!;
      expect(first.text).toContain('The CRM did not confirm whether the draft was saved: boom. Check My Listings for this address before saving it again.');
      expect(first.colour).toBe(RED);
      expect(toasts(created.f).some((t) => /Save failed/.test(t.text))).toBe(false);
      updated.f.w.manualSaveDraft();
      await until(() => toasts(updated.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(toasts(updated.f).find((t) => /did not confirm/.test(t.text))!.text).toContain('The CRM did not confirm that the changes were saved: Failed to fetch. The form still holds your changes; press Save Changes again.');
      refused.f.w.manualSaveDraft();
      await until(() => toasts(refused.f).some((t) => /Save failed/.test(t.text)), 15000);
      expect(toasts(refused.f).find((t) => /Save failed/.test(t.text))!.text).toContain('Save failed: The listing is locked');
      expect(toasts(refused.f).some((t) => /did not confirm/.test(t.text))).toBe(false);
    } finally { await closeAfter(created.f); await closeAfter(updated.f); await closeAfter(refused.f); }
  });

  it('gives a failure with no words of its own (or that is not even an error) a reason in each case', async () => {
    const submitted = await newForm();
    const saved = await newForm();
    try {
      submitted.f.w.MallanAPI.listings.create = () => Promise.reject(undefined);
      submitted.f.w.submitSalesListing();
      await until(() => toasts(submitted.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(toasts(submitted.f).find((t) => /did not confirm/.test(t.text))!.text).toContain('The CRM did not confirm whether the listing was saved: no answer. Check My Listings');
      saved.f.w.MallanAPI.listings.create = () => Promise.reject(Object.assign(new Error(''), { status: 500 }));
      saved.f.w.manualSaveDraft();
      await until(() => toasts(saved.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(toasts(saved.f).find((t) => /did not confirm/.test(t.text))!.text).toContain('The CRM did not confirm whether the draft was saved: no answer. Check My Listings');
    } finally { await closeAfter(submitted.f); await closeAfter(saved.f); }
  });

  it('says that nothing was sent when the page cannot send listings at all (the CRM client has no listings, create or update), for Submit and for Save Draft, not that the CRM gave no answer', async () => {
    for (const missing of ['listings', 'listings.create', 'listings.update']) {
      const submit = await newForm();
      const save = await newForm();
      try {
        for (const x of [submit, save]) {
          if (missing === 'listings') delete x.f.w.MallanAPI.listings;
          else delete x.f.w.MallanAPI.listings[missing.split('.')[1]];
        }
        submit.f.w.submitSalesListing();
        await until(() => toasts(submit.f).some((t) => /cannot send listings/.test(t.text)), 15000);
        expect(toasts(submit.f).find((t) => /cannot send listings/.test(t.text))!.text).toContain('The page cannot send listings to the CRM (its client did not load), so the listing was not submitted. The form still holds everything you entered.');
        expect(toasts(submit.f).some((t) => /did not confirm|Submission failed/.test(t.text))).toBe(false);
        expect(buttons(submit.f).every((b) => !b.disabled)).toBe(true);
        save.f.w.manualSaveDraft();
        await until(() => toasts(save.f).some((t) => /cannot send listings/.test(t.text)), 15000);
        const note = toasts(save.f).find((t) => /cannot send listings/.test(t.text))!;
        expect(note.text).toContain('Not saved: the page cannot send listings to the CRM (its client did not load). The form still holds your changes.');
        expect(note.colour).toBe(RED);
        expect(buttons(save.f).every((b) => !b.disabled)).toBe(true);
      } finally { await closeAfter(submit.f); await closeAfter(save.f); }
    }
  });

  it('keeps the note that says the CRM did not confirm, and the one that says not to submit again, for a long time', async () => {
    const saved = await newForm({ statusAnswer: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' } });
    const unknown = await newForm({ createError: 'boom', createErrorStatus: 500 });
    const draft = await savedForm({ updateError: 'boom', updateErrorStatus: 503 });
    try {
      for (const { f, act } of [
        { f: saved.f, act: () => { saved.f.w.showSalePublishedPanel = () => { throw new Error('the panel broke'); }; choose(saved.f, 'Active'); saved.f.w.submitSalesListing(); } },
        { f: unknown.f, act: () => unknown.f.w.submitSalesListing() },
        { f: draft.f, act: () => draft.f.w.manualSaveDraft() },
      ]) {
        const delays: number[] = [];
        f.w.setTimeout = ((fn: () => void, ms: number) => { delays.push(ms); return 0; });
        act();
        await until(() => toasts(f).some((t) => /The (listing|draft) was saved as|did not confirm/.test(t.text)), 15000);
        expect(delays.some((ms) => ms >= 15000)).toBe(true);
      }
    } finally { await closeAfter(saved.f); await closeAfter(unknown.f); await closeAfter(draft.f); }
  });

  it('keeps each of those notes for as long as it needs, whichever button said it: 15 seconds when the CRM did not confirm, 20 when the listing was saved and a later step failed', async () => {
    /** What the page asks showToast for: [text, colour, how long]. */
    const spy = (f: BootedForm) => {
      const asked: Array<[string, string | undefined, number | undefined]> = [];
      const real = f.w.showToast;
      f.w.showToast = (m: string, t?: string, ms?: number) => { asked.push([String(m), t, ms]); return real(m, t, ms); };
      return asked;
    };
    const scenarios: Array<{ name: string; open: () => Promise<{ f: BootedForm }>; act: (f: BootedForm) => void; text: RegExp; colour: string; ms: number }> = [
      { name: 'Submit of a new listing, not confirmed', open: () => newForm({ createError: 'boom', createErrorStatus: 500 }), act: (f) => f.w.submitSalesListing(), text: /did not confirm whether the listing was saved/, colour: 'error', ms: 15000 },
      { name: 'Submit of a saved listing, not confirmed', open: () => savedForm({ updateError: 'boom', updateErrorStatus: 503 }), act: (f) => f.w.submitSalesListing(), text: /did not confirm whether the changes were saved/, colour: 'error', ms: 15000 },
      { name: 'Save Draft of a new listing, not confirmed', open: () => newForm({ createError: 'boom', createErrorStatus: 500 }), act: (f) => f.w.manualSaveDraft(), text: /did not confirm whether the draft was saved/, colour: 'error', ms: 15000 },
      { name: 'Save Draft of a saved listing, not confirmed', open: () => savedForm({ updateError: 'boom', updateErrorStatus: 503 }), act: (f) => f.w.manualSaveDraft(), text: /did not confirm that the changes were saved/, colour: 'error', ms: 15000 },
      { name: 'Submit, a later step failed', open: () => newForm({ statusAnswer: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' } }), act: (f) => { f.w.showSalePublishedPanel = () => { throw new Error('the panel broke'); }; choose(f, 'Active'); f.w.submitSalesListing(); }, text: /The listing was saved as/, colour: 'warning', ms: 20000 },
      { name: 'Save Draft, a later step failed', open: () => newForm(), act: (f) => { f.w.eval('_pendingMediaFiles = [{ uploaded: false }]'); f.w.uploadPendingMedia = async () => { throw new Error('the upload broke'); }; f.w.manualSaveDraft(); }, text: /The draft was saved as/, colour: 'warning', ms: 20000 },
    ];
    for (const s of scenarios) {
      const { f } = await s.open();
      try {
        const asked = spy(f);
        s.act(f);
        await until(() => asked.some(([m]) => s.text.test(m)), 15000);
        const note = asked.find(([m]) => s.text.test(m))!;
        expect([s.name, note[1], note[2]]).toEqual([s.name, s.colour, s.ms]);
      } finally { await closeAfter(f); }
    }
  });
});

describe(`${FORM}: Save Draft, once more`, () => {
  it('turns Submit into Update, and Save Draft into Save Changes, when Save Draft creates the listing', async () => {
    const { f } = await newForm();
    try {
      f.w.manualSaveDraft();
      await until(() => creates(f).length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      expect(labels(f)).toEqual(['Save Changes', 'Update', 'Save Changes', 'Update']);
    } finally { await closeAfter(f); }
  });

  it('does not say the save failed when the draft was saved and a later step of the page broke (the photos): it says the draft is saved, and the next Save Draft updates it', async () => {
    const { f } = await newForm();
    try {
      f.w.eval('_pendingMediaFiles = [{ uploaded: false }]');
      f.w.uploadPendingMedia = async () => { throw new Error('the upload broke'); };
      f.w.manualSaveDraft();
      await until(() => toasts(f).some((t) => /The (listing|draft) was saved as/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /The (listing|draft) was saved as/.test(t.text))!;
      expect(note.text).toContain('The draft was saved as L-1, but a later step failed: the upload broke. Open the listing to check it.');
      expect(note.colour).toBe(AMBER);
      expect(toasts(f).some((t) => /Save failed/.test(t.text))).toBe(false);
      expect(f.w.eval('_saleEditMode')).toBe(true);
      expect(f.d.getElementById('saleListingIdDisplay')!.textContent).toBe('L-1');
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      f.w.eval('_pendingMediaFiles = []');
      f.w.manualSaveDraft();
      await until(() => f.calls.length === 2, 15000);
      expect(f.calls).toEqual(['create', 'update 1']);
    } finally { await closeAfter(f); }
  });

  it('says what was kept when the CRM is not connected: a new draft in this browser, a saved listing nothing (no copy of it is kept: it would shadow the listing), a full browser nothing', async () => {
    const fresh = await newForm();
    const saved = await savedForm();
    const full = await newForm();
    try {
      for (const x of [fresh, saved, full]) x.f.w.MallanAPI.isReady = false;
      full.f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      fresh.f.w.manualSaveDraft();
      await until(() => toasts(fresh.f).some((t) => /Offline/.test(t.text)), 15000);
      expect(toasts(fresh.f)[0].colour).toBe(AMBER);
      expect(JSON.parse(fresh.f.w.localStorage.getItem(DRAFT))._formType).toBe('sale');
      expect(indicatorText(fresh.f)).toBe('Draft saved in this browser');                      // (the listing bar says where the copy is)
      saved.f.w.manualSaveDraft();
      await until(() => toasts(saved.f).some((t) => /not connected/.test(t.text)), 15000);
      const note = toasts(saved.f).find((t) => /not connected/.test(t.text))!;
      expect(note.text).toContain('Not saved: the CRM is not connected. The form still holds your changes.');
      expect(note.colour).toBe(RED);
      expect(toasts(saved.f).some((t) => /locally/.test(t.text))).toBe(false);
      expect(saved.f.w.localStorage.getItem(DRAFT)).toBeNull();
      expect(indicatorText(saved.f)).toBe('Not saved to the CRM');
      full.f.w.manualSaveDraft();
      await until(() => toasts(full.f).some((t) => /not connected/.test(t.text)), 15000);
      const none = toasts(full.f).find((t) => /not connected/.test(t.text))!;
      expect(none.text).toContain('Not saved: the CRM is not connected and this browser could not keep a copy. The form still holds everything you entered.');
      expect(none.colour).toBe(RED);
      expect(toasts(full.f).some((t) => /locally/.test(t.text))).toBe(false);
      expect(indicatorText(full.f)).toBe('Not saved: this browser could not keep a copy');
      for (const x of [fresh, saved, full]) expect(buttons(x.f).every((b) => !b.disabled)).toBe(true);
      expect(fresh.f.calls).toEqual([]);
    } finally { await closeAfter(fresh.f); await closeAfter(saved.f); await closeAfter(full.f); }
  });
});

describe(`${FORM}: toasts`, () => {
  it('stack: a later toast does not cover an earlier one', async () => {
    const page = await bootAddForm(FORM, { settle: 800 });
    try {
      page.w.showToast('first', 'success');
      page.w.showToast('second', 'error');
      page.w.showToast('third', 'warning');
      const tops = [...page.d.querySelectorAll('body > div.mallan-toast')].map((t) => parseInt((t as HTMLElement).style.top, 10));
      expect(tops).toEqual([20, 76, 132]);                                                 // (the corner, then below each toast: its height (48 where nothing is laid out, as here) and a gap of 8)
    } finally { page.close(); }
  });

  it('stay long enough to be read: 4 seconds for a success, 10 for an error or a warning, and as long as the caller says', async () => {
    const page = await bootAddForm(FORM, { settle: 800 });
    try {
      const delays: number[] = [];
      page.w.setTimeout = (_fn: () => void, ms: number) => { delays.push(ms); return 0; };
      page.w.showToast('ok', 'success');
      page.w.showToast('no', 'error');
      page.w.showToast('hm', 'warning');
      page.w.showToast('info');
      page.w.showToast('long', 'error', 15000);
      expect(delays).toEqual([4000, 10000, 10000, 4000, 15000]);
    } finally { page.close(); }
  });

  it('show an alert() as a success when it is one and as a warning otherwise (they were all the same neutral colour)', async () => {
    const page = await bootAddForm(FORM, { settle: 800 });
    try {
      page.w.alert('SUCCESS! Listing updated.');
      page.w.alert('Cannot submit: 2 required field(s) are empty.');
      page.w.alert('This was not a SUCCESS: the CRM said no');                               // (a success is what a message starts with)
      const [ok, bad, notAtTheStart] = toasts(page);
      expect(ok.colour).toBe('rgb(22, 163, 74)');
      expect(bad.colour).toBe(AMBER);
      expect(bad.text).toContain('Cannot submit');
      expect(notAtTheStart.colour).toBe(AMBER);
    } finally { page.close(); }
  });
});

describe(`${FORM}: leaving the page while a save is out`, () => {
  it('does not close the form, and the browser asks before the page is left, until the server has answered', async () => {
    const { promise, release } = gate();
    const { f } = await newForm({ createGate: promise });
    try {
      const asked: string[] = [];
      f.w.confirm = (m: string) => { asked.push(m); return false; };
      f.w.submitSalesListing();
      await sleep(100);
      f.w.cancelSaleForm();
      expect(asked).toEqual([]);
      const note = toasts(f).find((t) => /still out/.test(t.text));
      expect(note?.text).toContain('A save is still out. Wait for the CRM to answer before you close this form.');
      expect(note?.colour).toBe(AMBER);
      const leaving = new f.w.Event('beforeunload', { cancelable: true });
      let prevented = 0;
      const preventDefault = leaving.preventDefault.bind(leaving);
      leaving.preventDefault = () => { prevented++; preventDefault(); };                  // (the standard way to ask; jsdom also takes returnValue = '' for it, a browser's prompt needs preventDefault)
      f.w.dispatchEvent(leaving);
      expect(prevented).toBe(1);
      expect(leaving.defaultPrevented).toBe(true);
      release();
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      f.w.cancelSaleForm();
      expect(asked).toHaveLength(1);                                                       // (asked as always, once the save is over)
      const free = new f.w.Event('beforeunload', { cancelable: true });
      f.w.dispatchEvent(free);
      expect(free.defaultPrevented).toBe(false);
    } finally { release(); await closeAfter(f); }
  });
});

describe(`${FORM}: what a saved listing shows and keeps`, () => {
  it('shows the saved listing in the header, and drops the browser copy, although a later step of the page broke', async () => {
    const { f } = await newForm({ createError: 'refused' });
    try {
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      expect(f.w.localStorage.getItem(DRAFT)).not.toBeNull();                              // (a refused submit kept a copy)
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      f.w.MallanAPI.listings.create = async () => ({ id: '1', listing_id: 'L-1', status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' });
      f.w.MallanAPI.listings.updateStatus = async () => ({ status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' });
      f.w.showSalePublishedPanel = () => { throw new Error('the panel broke'); };
      choose(f, 'Active');
      f.w.submitSalesListing();
      await until(() => toasts(f).some((t) => /The (listing|draft) was saved as/.test(t.text)), 15000);
      expect(f.d.getElementById('saleListingIdDisplay')!.textContent).toBe('L-1');         // (it was written last, after the step that threw)
      expect(f.d.getElementById('saleLastUpdated')!.textContent).not.toBe('--');
      expect(f.w.localStorage.getItem(DRAFT)).toBeNull();                                   // (restoring the copy would submit the listing again)
    } finally { await closeAfter(f); }
  });
});
