/// <reference types="jest" />
/**
 * The Rental Add / Edit form says only what happened when it submits or saves.
 *
 * Found by an adversarial read of the form:
 *  - Submit could be pressed twice while the first was out: a new listing was created twice;
 *  - a failed submit was said in a green "success" toast (the page turns every alert() into one), and promised a draft "saved locally" even for a saved listing, where it sent the failed request
 *    again and then said "Saved to listing ...";
 *  - anything that went wrong AFTER the listing was saved (a step of the page's own) was said as "Submission failed", so the agent pressed Submit again and created it again;
 *  - Save Draft on a saved listing sent the changes without waiting for the server and said "Saved to listing ..." at once, whatever the server answered;
 *  - a new listing's Save Draft said "Draft saved successfully" for a copy that lives in this browser only, and Save Draft kept its name for a listing that is already in the CRM.
 * These tests drive the REAL page with a CRM that is slow, refuses, or fails.
 */
import { bootAddForm, sleep, until, type AddFormOpts, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const FORM = 'RENTAL-FORM-REDESIGN';
const BUTTONS = '[onclick*="submitRentalListing"], [onclick*="saveRentalDraft"], [onclick*="manualSaveDraft"]';
const SAVED = { id: '9', listing_id: 'RL-9', status: 'Draft', address: {}, features: {}, agent_info: {}, media: [], raw_data: {} };

const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };
const pick = (f: BootedForm, id: string) => {
  const select = f.d.getElementById(id) as HTMLSelectElement;
  select.value = [...select.options].find((o) => o.value && o.value !== 'custom' && !o.disabled)!.value;
};
const gate = () => { let release!: () => void; const promise = new Promise<void>((r) => { release = r; }); return { promise, release }; };
// the page's own toasts: the text, and the colour the page gave them ('' is its green)
const toasts = (f: BootedForm) => [...f.d.querySelectorAll('div.toast-notification')].map((t) => ({ text: t.textContent ?? '', colour: (t as HTMLElement).style.background }));
const RED = 'rgb(220, 38, 38)', AMBER = 'rgb(217, 119, 6)';
const buttons = (f: BootedForm) => [...f.d.querySelectorAll(BUTTONS)] as HTMLButtonElement[];

/** Every control the page asks for before it submits (the required fields of its tabs), filled in. */
function fillRequired(f: BootedForm) {
  set(f, 'rentalStreetAddress', '333 E 46th St');
  pick(f, 'rentalBorough');
  (f.d.querySelector('input[name="rentalPropertyType"]') as HTMLInputElement).checked = true;
  pick(f, 'rentalCommonInterest');
  set(f, 'rentalMonthlyRent', '4200');
  set(f, 'rentalDateListed', '2026-10-01');
  set(f, 'rentalAvailableDate', '2026-11-01');
  set(f, 'rentalExclusiveStart', '2026-10-01');
  set(f, 'rentalDescription', 'A bright one bedroom near the park.');
  (f.d.getElementById('rentalFairHousingAck') as HTMLInputElement).checked = true;
  (f.d.getElementById('rentalCommNegotiabilityAck') as HTMLInputElement).checked = true;
  set(f, 'rentalCity', 'New York');
  pick(f, 'rentalState');
  set(f, 'rentalZip', '10017');
  pick(f, 'rentalBedrooms');
  pick(f, 'rentalFullBathrooms');
}

/** A form with the required fields filled in, whose alerts are collected (the page says the successes with alert()). */
async function newForm(o: AddFormOpts = {}) {
  const f = await bootAddForm(FORM, { settle: 800, ...o });
  const alerts: string[] = [];
  f.w.alert = (message: unknown) => { alerts.push(String(message)); };
  fillRequired(f);
  return { f, alerts };
}
/** A saved listing, opened for editing once it is back in the form. */
async function savedForm(o: AddFormOpts = {}) {
  const f = await bootAddForm(FORM, { search: '?id=9', listing: SAVED, settle: 1500, ...o });
  await until(() => f.w.eval('_rentalEditLoad') === 'loaded', 40000);
  const alerts: string[] = [];
  f.w.alert = (message: unknown) => { alerts.push(String(message)); };
  return { f, alerts };
}
const closeAfter = async (f: BootedForm) => { await sleep(100); f.close(); };

describe(`${FORM}: Submit`, () => {
  it('sends a new listing once, however often Submit is pressed while the first is out; the buttons are off meanwhile and on again after', async () => {
    const { promise, release } = gate();
    const { f } = await newForm({ createGate: promise });
    try {
      f.w.submitRentalListing();
      f.w.submitRentalListing();
      (f.d.querySelector('[onclick="submitRentalListing()"]') as HTMLElement).click();
      await sleep(100);
      expect(f.calls).toEqual(['create']);
      expect(buttons(f)).toHaveLength(4);                                                  // Save Draft and Submit, in the header and at the foot
      expect(buttons(f).every((b) => b.disabled)).toBe(true);
      expect(buttons(f).every((b) => b.classList.contains('opacity-60') && b.classList.contains('cursor-not-allowed'))).toBe(true);          // and they look off
      release();
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      await sleep(300);
      expect(buttons(f).some((b) => b.classList.contains('opacity-60') || b.classList.contains('cursor-not-allowed'))).toBe(false);
      expect(f.calls).toEqual(['create']);
      expect(f.saved).toHaveLength(1);
    } finally { release(); await closeAfter(f); }
  });

  it('presses Submit again after a save: the listing is updated, not created again, and each answer names the listing', async () => {
    const { f, alerts } = await newForm();
    try {
      f.w.submitRentalListing();
      await until(() => f.saved.length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      expect(alerts[0]).toContain('SUCCESS! Your rental listing has been submitted.');
      expect(alerts[0]).toContain('Listing ID: L-1');
      expect(f.d.getElementById('rentalListingIdDisplay')!.textContent).toBe('L-1');
      f.w.submitRentalListing();
      await until(() => f.calls.length === 2 && buttons(f).every((b) => !b.disabled), 15000);
      expect(f.calls).toEqual(['create', 'update 1']);
      expect(alerts[1]).toContain('SUCCESS! Listing updated.');
      expect(alerts[1]).toContain('Listing ID: L-1');
      expect(f.d.getElementById('rentalListingIdDisplay')!.textContent).toBe('L-1');
    } finally { await closeAfter(f); }
  });

  it('says a refused submit in an error toast with the server\'s words, keeps the entries and a copy in this browser, turns the buttons on and lets the agent try again', async () => {
    const { f, alerts } = await newForm({ createError: 'Description holds wording the server refuses' });
    try {
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Submission failed/.test(t.text))!;
      expect(failure.text).toContain('Submission failed: Description holds wording the server refuses');
      expect(failure.text).toContain('Nothing was saved to the CRM');
      expect(failure.text).toContain('the form still holds everything you entered');
      expect(failure.text).toContain('a copy is kept in this browser');
      expect(failure.colour).toBe(RED);
      expect(alerts).toEqual([]);                                                          // (an alert would be the page's green toast)
      expect(toasts(f).some((t) => /Saved to listing|Draft saved/.test(t.text))).toBe(false);
      expect(f.saved).toEqual([]);
      expect((f.d.getElementById('rentalMonthlyRent') as HTMLInputElement).value).toBe('4200');          // the form still holds what was entered
      const copy = JSON.parse(f.w.localStorage.getItem('rentalListingDraft'));                            // and so does this browser, with the time it was kept
      expect(copy.rentalMonthlyRent).toBe('4200');
      expect(copy._savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      f.w.submitRentalListing();
      await until(() => f.calls.length === 2, 15000);
      expect(f.calls).toEqual(['create', 'create']);
    } finally { await closeAfter(f); }
  });

  it('does not say a copy is kept when this browser cannot keep one', async () => {
    const { f } = await newForm({ createError: 'refused' });
    try {
      f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Submission failed/.test(t.text))!;
      expect(failure.text).toContain('Nothing was saved to the CRM; the form still holds everything you entered.');
      expect(failure.text).not.toContain('copy');
      expect(failure.colour).toBe(RED);
    } finally { await closeAfter(f); }
  });

  it('turns the buttons on again even when the page cannot show the failure', async () => {
    const { f } = await newForm({ createError: 'refused' });
    try {
      f.w.showToast = () => { throw new Error('the toast could not be shown'); };
      f.w.submitRentalListing();
      await until(() => f.calls.length === 1, 15000);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('says a failed update of a saved listing as an update, without a browser copy (the saved listing is not shadowed by one), and does not send it a second time', async () => {
    const { f } = await savedForm({ updateError: 'The listing is locked' });
    try {
      fillRequired(f);
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /Update failed/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Update failed/.test(t.text))!;
      expect(failure.text).toContain('Update failed: The listing is locked');
      expect(failure.text).toContain('Nothing was saved to the CRM');
      expect(failure.text).not.toContain('copy');
      expect(failure.colour).toBe(RED);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
      expect(f.calls).toEqual(['update 9']);                                               // (the failed request is not sent again behind the failure message)
      expect(toasts(f).some((t) => /Saved to listing/.test(t.text))).toBe(false);
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('does not say the submit failed when the listing was saved and a later step of the page broke: it says the listing is saved, so it is not sent again', async () => {
    const { f, alerts } = await newForm({ created: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' }, statusAnswer: { status: 'Active' } });
    try {
      f.w.MallanListingPublished = { show() { throw new Error('the panel broke'); } };
      (f.d.getElementById('rentalStatus') as HTMLSelectElement).value = 'Active';
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /was saved/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /was saved/.test(t.text))!;
      expect(note.text).toContain('The listing was saved as L-1, but a later step failed: the panel broke. Do not submit it again; open the listing to check it.');
      expect(note.colour).toBe(AMBER);
      expect(toasts(f).some((t) => /Submission failed/.test(t.text))).toBe(false);
      expect(alerts.some((a) => /Submission failed/.test(a))).toBe(false);
      expect(f.w.eval('_rentalEditMode')).toBe(true);                                      // the page now holds a saved listing: a second Submit updates it
      expect(f.d.getElementById('rentalListingIdDisplay')!.textContent).toBe('L-1');       // (the header shows it although a later step broke: it was written last, after the step that threw)
      expect(f.d.getElementById('rentalLastUpdated')!.textContent).not.toBe('--');
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      f.w.submitRentalListing();
      await until(() => f.calls.length === 2, 15000);
      expect(f.calls).toEqual(['create', 'update 1']);
    } finally { await closeAfter(f); }
  });

  it.each<[string, () => unknown, string]>([
    ['with a reason', () => new Error('the panel broke'), 'the panel broke'],
    ['with none', () => undefined, 'an error'],
  ])('names a saved listing by the id the page holds, though the server\'s answer to its update has none, when a later step of the page breaks %s', async (_what, failure, said) => {
    const { f } = await savedForm({ updated: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' }, statusAnswer: { status: 'Active' } });
    try {
      fillRequired(f);
      f.w.MallanListingPublished = { show() { throw failure(); } };
      (f.d.getElementById('rentalStatus') as HTMLSelectElement).value = 'Active';
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /was saved/.test(t.text)), 15000);
      expect(toasts(f).find((t) => /was saved/.test(t.text))!.text).toContain(`The listing was saved as RL-9, but a later step failed: ${said}. Do not submit it again; open the listing to check it.`);
      expect(f.calls).toEqual(['update 9']);
      expect(toasts(f).some((t) => /Update failed|Submission failed/.test(t.text))).toBe(false);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('shows the id of the listing it updated in the alert and in the header, though the server\'s answer to an update has none (it is the one the page holds)', async () => {
    const { f, alerts } = await savedForm();
    try {
      fillRequired(f);
      f.w.submitRentalListing();
      await until(() => alerts.some((a) => /SUCCESS/.test(a)) && buttons(f).every((b) => !b.disabled), 15000);
      const said = alerts.find((a) => /SUCCESS/.test(a))!;
      expect(said).toContain('SUCCESS! Listing updated.');
      expect(said).toContain('Listing ID: RL-9');
      expect(f.d.getElementById('rentalListingIdDisplay')!.textContent).toBe('RL-9');
      expect(f.calls).toEqual(['update 9']);
    } finally { await closeAfter(f); }
  });

  it('updates, and does not create again, when the server\'s answer to the first save had no database id', async () => {
    const { f } = await newForm({ created: { id: undefined } });
    try {
      f.w.submitRentalListing();
      await until(() => f.saved.length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      f.w.submitRentalListing();
      await until(() => f.calls.length === 2, 15000);
      expect(f.calls).toEqual(['create', 'update L-1']);                                   // (by the listing id the server gave)
    } finally { await closeAfter(f); }
  });

  it('turns Submit into Update, and Save Draft into Save Changes, once the page holds a saved listing (opened, or created by this Submit)', async () => {
    const { f } = await newForm();
    try {
      const labels = () => buttons(f).map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
      const icons = () => f.d.querySelectorAll('[onclick*="submitRentalListing"] i, [onclick*="saveRentalDraft"] i, [onclick*="manualSaveDraft"] i').length;
      const iconsBefore = icons();
      expect(iconsBefore).toBeGreaterThanOrEqual(3);
      expect(labels()).toEqual(['Save Draft', 'Submit', 'Save Draft', 'Submit Listing']);
      f.w.submitRentalListing();
      await until(() => f.saved.length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      expect(labels()).toEqual(['Save Changes', 'Update', 'Save Changes', 'Update Listing']);
      expect(icons()).toBe(iconsBefore);                                                   // (every button keeps its icon, Submit's too)
    } finally { await closeAfter(f); }
    const opened = await savedForm();
    try {
      expect(buttons(opened.f).map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim())).toEqual(['Save Changes', 'Update', 'Save Changes', 'Update Listing']);
      expect(opened.f.d.querySelectorAll('[onclick*="saveRentalDraft"] i, [onclick*="manualSaveDraft"] i')).toHaveLength(2);          // (the icon stays)
    } finally { await closeAfter(opened.f); }
  });

  it('says that nothing was submitted when the CRM is not connected, and keeps a copy of a new listing in this browser', async () => {
    const { f } = await newForm();
    try {
      f.w.MallanAPI.isReady = false;
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /not connected/.test(t.text)), 15000);
      await sleep(200);
      expect(toasts(f)).toHaveLength(1);                                                   // (one toast says it all: toasts are stacked, but a note and its explanation belong together)
      const note = toasts(f)[0];
      expect(note.text).toContain('The CRM is not connected, so the listing was not submitted. A copy is kept in this browser; submit it again when the CRM is back.');
      expect(note.colour).toBe(AMBER);
      expect(f.calls).toEqual([]);
      expect(JSON.parse(f.w.localStorage.getItem('rentalListingDraft')).rentalMonthlyRent).toBe('4200');
    } finally { await closeAfter(f); }
  });

  it.each(['listings', 'listings.create', 'listings.update'] as const)('says that nothing was submitted when the page cannot send listings (the CRM client has no %s), not that the CRM gave no answer', async (missing) => {
    const { f } = await newForm();
    try {
      if (missing === 'listings') delete f.w.MallanAPI.listings;
      else delete f.w.MallanAPI.listings[missing.split('.')[1]];
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /cannot send listings/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /cannot send listings/.test(t.text))!;
      expect(note.text).toContain('The page cannot send listings to the CRM (its client did not load), so the listing was not submitted. The form still holds everything you entered.');
      expect(note.colour).toBe(RED);
      expect(toasts(f).some((t) => /did not confirm|Submission failed/.test(t.text))).toBe(false);
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('says in one toast that nothing was submitted when the CRM is not connected and this browser cannot keep a copy either', async () => {
    const { f } = await newForm();
    try {
      f.w.MallanAPI.isReady = false;
      f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      f.w.submitRentalListing();
      await until(() => toasts(f).length > 0, 15000);
      await sleep(200);
      expect(toasts(f)).toHaveLength(1);
      expect(toasts(f)[0].text).toContain('The CRM is not connected, so the listing was not submitted, and this browser could not keep a copy. The form still holds everything you entered.');
      expect(toasts(f)[0].colour).toBe(RED);
      expect(f.calls).toEqual([]);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('says once that nothing was saved when the CRM is not connected for a saved listing: no copy is kept (it would shadow the listing), and the form still holds the changes', async () => {
    const { f } = await savedForm();
    try {
      fillRequired(f);
      f.w.localStorage.setItem('rentalListingDraft', '{"stale":true}');
      f.w.MallanAPI.isReady = false;
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /not connected/.test(t.text)), 15000);
      await sleep(300);
      const about = toasts(f).filter((t) => /not connected/.test(t.text));
      expect(about).toHaveLength(1);
      expect(about[0].text).toContain('Not saved: the CRM is not connected. The form still holds your changes.');
      expect(about[0].colour).toBe(RED);
      expect(toasts(f).some((t) => /not submitted/.test(t.text))).toBe(false);
      expect(f.calls).toEqual([]);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();                       // (a stale copy is cleared: it would shadow the saved listing)
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: Save Draft`, () => {
  it('on a saved listing, says the changes are saved only once the server has taken them, and sends them once however often it is pressed', async () => {
    const { promise, release } = gate();
    const { f } = await savedForm({ updateGate: promise });
    try {
      f.w.saveRentalDraft();
      f.w.saveRentalDraft();
      (f.d.querySelector('[onclick="manualSaveDraft(\'rental\')"]') as HTMLElement).click();
      await sleep(150);
      expect(f.calls).toEqual(['update 9']);
      expect(buttons(f).every((b) => b.disabled)).toBe(true);
      expect(toasts(f).some((t) => /Saved to listing/.test(t.text))).toBe(false);          // (the server has not answered)
      release();
      await until(() => toasts(f).some((t) => /Saved to listing RL-9/.test(t.text)), 15000);
      expect(toasts(f).find((t) => /Saved to listing/.test(t.text))!.colour).toBe('');      // the page's green
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      expect(f.calls).toEqual(['update 9']);
    } finally { release(); await closeAfter(f); }
  });

  it('turns the buttons on again after a save even when the page cannot show the answer (the saved toast, or the refusal)', async () => {
    const ok = await savedForm();
    const refused = await savedForm({ updateError: 'no' });
    try {
      for (const { f } of [ok, refused]) {
        f.w.showToast = () => { throw new Error('the toast could not be shown'); };
        f.w.saveRentalDraft();
        await until(() => f.calls.length === 1, 15000);
        await until(() => buttons(f).every((b) => !b.disabled), 15000);
      }
    } finally { await closeAfter(ok.f); await closeAfter(refused.f); }
  });

  it('gives a reason of its own when the server\'s refusal has none, for a submit and for a save', async () => {
    const submitting = await newForm();
    const saving = await savedForm();
    try {
      submitting.f.w.MallanAPI.listings.create = () => Promise.reject(Object.assign(new Error(''), { status: 422 }));
      submitting.f.w.submitRentalListing();
      await until(() => toasts(submitting.f).some((t) => /Submission failed/.test(t.text)), 15000);
      expect(toasts(submitting.f).find((t) => /Submission failed/.test(t.text))!.text).toContain('Submission failed: the server did not accept the listing.');
      saving.f.w.MallanAPI.listings.update = () => Promise.reject(Object.assign(new Error(''), { status: 422 }));
      saving.f.w.saveRentalDraft();
      await until(() => toasts(saving.f).some((t) => /Not saved/.test(t.text)), 15000);
      expect(toasts(saving.f).find((t) => /Not saved/.test(t.text))!.text).toContain('Not saved: the server did not accept the changes.');
    } finally { await closeAfter(submitting.f); await closeAfter(saving.f); }
  });

  it('on a saved listing, says the changes were NOT saved, and why, when the server refuses them', async () => {
    const { f } = await savedForm({ updateError: 'Monthly rent must be above 0' });
    try {
      f.w.saveRentalDraft();
      await until(() => toasts(f).some((t) => /Not saved/.test(t.text)), 15000);
      const failure = toasts(f).find((t) => /Not saved/.test(t.text))!;
      expect(failure.text).toContain('Not saved: Monthly rent must be above 0');
      expect(failure.text).toContain('The form still holds your changes');
      expect(failure.colour).toBe(RED);
      expect(toasts(f).some((t) => /Saved to listing/.test(t.text))).toBe(false);
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
    } finally { await closeAfter(f); }
  });

  it('on a saved listing, says it was not saved when the changes cannot even be sent, and turns the buttons on again', async () => {
    const { f } = await savedForm();
    try {
      delete f.w.MallanAPI.listings;                                                       // (the CRM client lost its listings)
      expect(await f.w.saveRentalDraft()).toBe(false);                                     // (and the caller is told it was not saved)
      await until(() => toasts(f).some((t) => /Not saved/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /Not saved/.test(t.text))!;
      expect(note.text).toContain('Not saved: the page cannot send listings to the CRM (its client did not load). The form still holds your changes.');
      expect(note.colour).toBe(RED);
      expect(toasts(f).some((t) => /did not confirm/.test(t.text))).toBe(false);          // (nothing was sent: that is known, it is not "no answer")
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('on a saved listing, treats a CRM client that throws at the call like one that gives no answer: the caller is told it was not saved, and the buttons come on again', async () => {
    const { f } = await savedForm();
    try {
      f.w.MallanAPI.listings.update = () => { throw new Error('the client broke'); };      // (it throws at the call: it does not return a failed promise)
      expect(await f.w.saveRentalDraft()).toBe(false);
      const note = toasts(f).find((t) => /did not confirm/.test(t.text))!;
      expect(note.text).toContain('The CRM did not confirm that the changes were saved: the client broke.');
      expect(note.colour).toBe(RED);
      expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      expect(f.d.querySelector('[onclick*="submitRentalListing"]')!.hasAttribute('disabled')).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('tells its caller whether the changes were saved: yes for the server\'s yes and for a copy in this browser, no for a refusal, a missing CRM and a full browser', async () => {
    const saved = await savedForm();
    const refused = await savedForm({ updateError: 'no' });
    const fresh = await newForm();
    try {
      expect(await saved.f.w.saveRentalDraft()).toBe(true);
      expect(await refused.f.w.saveRentalDraft()).toBe(false);
      saved.f.w.MallanAPI.isReady = false;
      expect(await saved.f.w.saveRentalDraft()).toBe(false);
      expect(await fresh.f.w.saveRentalDraft()).toBe(true);
      fresh.f.w.Storage.prototype.setItem = () => { throw new Error('full'); };
      expect(await fresh.f.w.saveRentalDraft()).toBe(false);
    } finally { await closeAfter(saved.f); await closeAfter(refused.f); await closeAfter(fresh.f); }
  });

  it('on a saved listing, clears a stale browser draft (it would shadow the saved listing on the next load)', async () => {
    const { f } = await savedForm();
    try {
      f.w.localStorage.setItem('rentalListingDraft', JSON.stringify({ stale: true }));
      f.w.saveRentalDraft();
      await until(() => toasts(f).some((t) => /Saved to listing/.test(t.text)), 15000);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
      f.w.localStorage.setItem('rentalListingDraft', JSON.stringify({ stale: true }));
      f.w.MallanAPI.isReady = false;
      f.w.saveRentalDraft();
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();                   // (also when the CRM is not connected)
    } finally { await closeAfter(f); }
  });

  it('sends nothing, with Save Draft or with Submit, while the saved listing is still loading or after it failed to load (a save would replace it with a blank form), and says so', async () => {
    const loading = await bootAddForm(FORM, { search: '?id=9', listing: SAVED, getDelay: 30000, settle: 300 });
    const failed = await bootAddForm(FORM, { search: '?id=9', getError: 'offline', settle: 300 });
    try {
      await until(() => loading.w.eval('_rentalEditLoad') === 'loading', 15000);
      await until(() => failed.w.eval('_rentalEditLoad') === 'failed', 30000);
      for (const [f, said] of [[loading, /still loading/], [failed, /did not load/]] as const) {
        f.w.saveRentalDraft();
        f.w.submitRentalListing();
        const notes = toasts(f).filter((t) => said.test(t.text));
        expect(notes).toHaveLength(2);                                                       // one for each press
        expect(notes.every((t) => t.colour === RED)).toBe(true);
        expect(f.calls).toEqual([]);
        expect(buttons(f).every((b) => !b.disabled)).toBe(true);
      }
    } finally { loading.close(); failed.close(); }
  });

  it('on a saved listing, says it was not saved when the CRM is not connected, and sends nothing', async () => {
    const { f } = await savedForm();
    try {
      f.w.MallanAPI.isReady = false;
      f.w.saveRentalDraft();
      await sleep(100);
      expect(f.calls).toEqual([]);
      const failure = toasts(f).find((t) => /Not saved/.test(t.text))!;
      expect(failure.text).toContain('the CRM is not connected');
      expect(failure.colour).toBe(RED);
    } finally { await closeAfter(f); }
  });

  it('on a new listing, keeps a copy in this browser and says it is only there (it reaches the CRM when Submit is pressed)', async () => {
    const { f } = await newForm();
    try {
      f.w.saveRentalDraft();
      await sleep(100);
      expect(f.calls).toEqual([]);
      const note = toasts(f).find((t) => /browser/.test(t.text))!;
      expect(note.text).toContain('Saved in this browser only');
      expect(note.text).toContain('Submit');
      expect(note.colour).toBe(AMBER);                                                     // (it is not in the CRM yet: a warning, not the page's green)
      const copy = JSON.parse(f.w.localStorage.getItem('rentalListingDraft'));
      expect(copy.rentalMonthlyRent).toBe('4200');
      expect(copy._savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(toasts(f).some((t) => /Draft saved successfully/.test(t.text))).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('on a new listing, says so when this browser cannot keep the copy, and does not say it saved one', async () => {
    const { f } = await newForm();
    try {
      f.w.Storage.prototype.setItem = () => { throw new Error('storage is full'); };
      f.w.saveRentalDraft();
      await sleep(100);
      const failure = toasts(f).find((t) => /Failed to save draft/.test(t.text))!;
      expect(failure.text).toContain('storage is full');
      expect(failure.colour).toBe(RED);
      expect(toasts(f).some((t) => /Saved in this browser/.test(t.text))).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('on a listing the page has only the listing id of, saves it to the server by that id and says so when the server has answered', async () => {
    const { f } = await newForm({ created: { id: undefined } });
    try {
      f.w.submitRentalListing();
      await until(() => f.saved.length === 1 && buttons(f).every((b) => !b.disabled), 15000);
      f.w.saveRentalDraft();
      await until(() => toasts(f).some((t) => /Saved to listing L-1/.test(t.text)), 15000);
      expect(f.calls).toEqual(['create', 'update L-1']);
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: what alert() shows`, () => {
  it('shows a success as a success and anything else as a warning (the page turns alert() into a toast, which was green whatever the message)', async () => {
    const page = await bootAddForm(FORM, { settle: 800 });
    try {
      page.w.alert('SUCCESS! Listing updated.');
      page.w.alert('Something went wrong');
      page.w.alert('This was not a SUCCESS: the CRM said no');                                // (a success is what a message starts with)
      const [ok, bad, notAtTheStart] = toasts(page);
      expect(ok.colour).toBe('');
      expect(bad.colour).toBe(AMBER);
      expect(bad.text).toContain('Something went wrong');
      expect(notAtTheStart.colour).toBe(AMBER);
    } finally { page.close(); }
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
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /did not confirm/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /did not confirm/.test(t.text))!;
      expect(note.text).toContain('The CRM did not confirm whether the listing was saved: Failed to create listing: boom. Check My Listings for this address before submitting it again; the form still holds everything you entered, and a copy is kept in this browser.');
      expect(note.text).not.toContain('Nothing was saved');
      expect(note.colour).toBe(RED);
      expect(toasts(f).some((t) => /Submission failed/.test(t.text))).toBe(false);
      expect(JSON.parse(f.w.localStorage.getItem('rentalListingDraft')).rentalMonthlyRent).toBe('4200');
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 499] as const)('says that nothing was saved when the server refuses a new listing with a %i', async (status) => {
    const { f } = await newForm({ createError: 'The server said no', createErrorStatus: status });
    try {
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /Submission failed/.test(t.text))!;
      expect(note.text).toContain('Submission failed: The server said no. Nothing was saved to the CRM; the form still holds everything you entered, and a copy is kept in this browser.');
      expect(toasts(f).some((t) => /did not confirm/.test(t.text))).toBe(false);
    } finally { await closeAfter(f); }
  });

  it('says an update of a saved listing that the CRM did not confirm as that, and says it can be sent again (the same changes)', async () => {
    const { f } = await savedForm({ updateError: 'Request failed: 503', updateErrorStatus: 503 });
    try {
      fillRequired(f);
      f.w.localStorage.setItem('rentalListingDraft', '{"stale":true}');
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /did not confirm/.test(t.text)), 15000);
      const note = toasts(f).find((t) => /did not confirm/.test(t.text))!;
      expect(note.text).toContain('The CRM did not confirm whether the changes were saved: Request failed: 503. Press Update to send them again; the form still holds everything you entered.');
      expect(note.text).not.toContain('Nothing was saved');
      expect(note.text).not.toContain('copy');
      expect(note.colour).toBe(RED);
      expect(f.calls).toEqual(['update 9']);
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
    } finally { await closeAfter(f); }
  });

  it('on a saved listing, says Save Changes could not be confirmed (and can be pressed again) when the CRM does not answer, and "Not saved" when the server refuses', async () => {
    const silent = await savedForm({ updateError: 'Failed to fetch', updateErrorStatus: null });
    const refused = await savedForm({ updateError: 'The listing is locked', updateErrorStatus: 409 });
    try {
      silent.f.w.saveRentalDraft();
      await until(() => toasts(silent.f).some((t) => /did not confirm/.test(t.text)), 15000);
      const unknown = toasts(silent.f).find((t) => /did not confirm/.test(t.text))!;
      expect(unknown.text).toContain('The CRM did not confirm that the changes were saved: Failed to fetch. The form still holds your changes; press Save Changes again.');
      expect(unknown.colour).toBe(RED);
      expect(toasts(silent.f).some((t) => /Not saved/.test(t.text))).toBe(false);
      refused.f.w.saveRentalDraft();
      await until(() => toasts(refused.f).some((t) => /Not saved/.test(t.text)), 15000);
      expect(toasts(refused.f).find((t) => /Not saved/.test(t.text))!.text).toContain('Not saved: The listing is locked. The form still holds your changes.');
      expect(toasts(refused.f).some((t) => /did not confirm/.test(t.text))).toBe(false);
    } finally { await closeAfter(silent.f); await closeAfter(refused.f); }
  });

  it('gives a failure with no words of its own (or that is not even an error) a reason in each case', async () => {
    const created = await newForm();
    const updated = await savedForm();
    try {
      created.f.w.MallanAPI.listings.create = () => Promise.reject(undefined);
      created.f.w.submitRentalListing();
      await until(() => toasts(created.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(toasts(created.f).find((t) => /did not confirm/.test(t.text))!.text).toContain('The CRM did not confirm whether the listing was saved: no answer. Check My Listings');
      updated.f.w.MallanAPI.listings.update = async () => { throw Object.assign(new Error(''), { status: 500 }); };
      updated.f.w.saveRentalDraft();
      await until(() => toasts(updated.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(toasts(updated.f).find((t) => /did not confirm/.test(t.text))!.text).toContain('The CRM did not confirm that the changes were saved: no answer. The form still holds your changes');
    } finally { await closeAfter(created.f); await closeAfter(updated.f); }
  });
});

describe(`${FORM}: toasts`, () => {
  it('stack: a later toast does not cover an earlier one', async () => {
    const page = await bootAddForm(FORM, { settle: 800 });
    try {
      page.w.showToast('first', 'success');
      page.w.showToast('second', 'error');
      page.w.showToast('third', 'warning');
      const bottoms = [...page.d.querySelectorAll('div.toast-notification')].map((t) => parseInt((t as HTMLElement).style.bottom, 10));
      expect(bottoms).toEqual([20, 76, 132]);                                              // (the corner, then above each toast: its height (48 where nothing is laid out, as here) and a gap of 8)
    } finally { page.close(); }
  });

  it('stay long enough to be read: 3 seconds for a success, 10 for an error or a warning, and as long as the caller says', async () => {
    const page = await bootAddForm(FORM, { settle: 800 });
    try {
      const delays: number[] = [];
      page.w.setTimeout = (_fn: () => void, ms: number) => { delays.push(ms); return 0; };
      page.w.showToast('ok', 'success');
      page.w.showToast('no', 'error');
      page.w.showToast('hm', 'warning');
      page.w.showToast('info');
      page.w.showToast('long', 'error', 15000);
      expect(delays).toEqual([3000, 10000, 10000, 3000, 15000]);
    } finally { page.close(); }
  });

  it('keep the note that says not to submit again, and the one that says nothing is known, for a long time', async () => {
    const created = await newForm({ created: { status: 'Active', publicUrl: 'https://www.mallan.nyc/listing/x', realPlusUrl: 'https://realplus.example/x' }, statusAnswer: { status: 'Active' } });
    const unknown = await newForm({ createError: 'boom', createErrorStatus: 500 });
    try {
      for (const { f } of [created, unknown]) {
        const delays: number[] = [];
        f.w.setTimeout = ((fn: () => void, ms: number) => { delays.push(ms); return 0; });
        f.w.MallanListingPublished = { show() { throw new Error('the panel broke'); } };
        (f.d.getElementById('rentalStatus') as HTMLSelectElement).value = 'Active';
        f.w.submitRentalListing();
        await until(() => toasts(f).some((t) => /was saved|did not confirm/.test(t.text)), 15000);
        expect(delays.some((ms) => ms >= 15000)).toBe(true);
      }
    } finally { await closeAfter(created.f); await closeAfter(unknown.f); }
  });
});

describe(`${FORM}: a note that the CRM did not confirm a save`, () => {
  it('stays for a long time, for Save Changes and for Update as for Submit', async () => {
    const saved = await savedForm({ updateError: 'boom', updateErrorStatus: 503 });
    const updating = await savedForm({ updateError: 'boom', updateErrorStatus: 503 });
    try {
      const delays: number[] = [];
      saved.f.w.setTimeout = (_fn: () => void, ms: number) => { delays.push(ms); return 0; };
      saved.f.w.saveRentalDraft();
      await until(() => toasts(saved.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(delays).toContain(15000);
      const more: number[] = [];
      updating.f.w.setTimeout = (_fn: () => void, ms: number) => { more.push(ms); return 0; };
      fillRequired(updating.f);
      updating.f.w.submitRentalListing();
      await until(() => toasts(updating.f).some((t) => /did not confirm/.test(t.text)), 15000);
      expect(more).toContain(15000);
    } finally { await closeAfter(saved.f); await closeAfter(updating.f); }
  });
});

describe(`${FORM}: leaving the page while a save is out`, () => {
  it('does not close the form, and the browser asks before the page is left, until the server has answered', async () => {
    const { promise, release } = gate();
    const { f } = await newForm({ createGate: promise });
    try {
      const asked: string[] = [];
      f.w.confirm = (m: string) => { asked.push(m); return false; };
      f.w.submitRentalListing();
      await sleep(100);
      f.w.cancelRentalForm();
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
      f.w.cancelRentalForm();
      expect(asked).toHaveLength(1);                                                       // (asked as always, once the save is over)
      const free = new f.w.Event('beforeunload', { cancelable: true });
      f.w.dispatchEvent(free);
      expect(free.defaultPrevented).toBe(false);
    } finally { release(); await closeAfter(f); }
  });
});

describe(`${FORM}: the copy kept in this browser`, () => {
  it('is removed once the listing is saved (a refused submit kept one; restoring it would submit the listing again)', async () => {
    const { f, alerts } = await newForm({ createError: 'refused' });
    try {
      f.w.submitRentalListing();
      await until(() => toasts(f).some((t) => /Submission failed/.test(t.text)), 15000);
      expect(f.w.localStorage.getItem('rentalListingDraft')).not.toBeNull();
      await until(() => buttons(f).every((b) => !b.disabled), 15000);
      f.w.MallanAPI.listings.create = async () => ({ id: '1', listing_id: 'L-1', status: 'Draft' });          // the server takes it this time
      f.w.submitRentalListing();
      await until(() => alerts.some((a) => /SUCCESS/.test(a)), 15000);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
    } finally { await closeAfter(f); }
  });

  it('is removed when Save Draft kept one and the listing is then submitted', async () => {
    const { f, alerts } = await newForm();
    try {
      f.w.saveRentalDraft();
      await sleep(100);
      expect(f.w.localStorage.getItem('rentalListingDraft')).not.toBeNull();
      f.w.submitRentalListing();
      await until(() => alerts.some((a) => /SUCCESS/.test(a)), 15000);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
    } finally { await closeAfter(f); }
  });
});

describe(`${FORM}: what an unsaved listing is told about photos and open houses`, () => {
  it('is told to Submit the listing first (Save Draft keeps a copy in this browser only, it does not create the listing)', async () => {
    const { f, alerts } = await newForm();
    try {
      set(f, 'rentalNewOHDate', '2026-10-20'); set(f, 'rentalNewOHStart', '11:00'); set(f, 'rentalNewOHEnd', '12:00');
      f.w.saveRentalOpenHouse();
      await sleep(100);
      expect(alerts).toContain('Submit the listing first, then add open houses: they attach to the saved listing.');
      expect(alerts.some((a) => /as a draft/.test(a))).toBe(false);
      f.w.saveRentalMedia();
      await sleep(100);
      expect(toasts(f).some((t) => t.text.includes('Submit the listing first before uploading media.'))).toBe(true);
      expect(toasts(f).some((t) => /Save the listing first/.test(t.text))).toBe(false);
    } finally { await closeAfter(f); }
  });
});
