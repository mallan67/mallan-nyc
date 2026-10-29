/// <reference types="jest" />
/**
 * The Add / Edit form harness (add-form-harness.ts) itself.
 *
 * MallanAPI.onReady's callback was scheduled on a timer of the test process, so a window that was closed before the session answered was still called back, and the page's code threw on its
 * dead document ("reading 'getElementById'") in whichever test was running by then: a failure that depended on how busy the machine was. The callback is now scheduled on the window's own timer,
 * which a closed window never fires. The same held for the other answers the harness delays (the listing, a directory member): a request that was out when the window was closed was still answered,
 * and the page threw on its dead document ("reading 'createElement'", in showToast) in the test that was running. Such an answer is now never delivered. And a test that wants "the session has not
 * answered yet" no longer has to guess a number of milliseconds (a busy machine made it wrong): it holds the session back with a gate and opens it when it wants.
 */
import { bootAddForm, sleep, until, val } from './add-form-harness';

jest.setTimeout(120000);

const gate = () => { let release!: () => void; const promise = new Promise<void>((r) => { release = r; }); return { promise, release }; };

describe('add-form-harness: the session answer', () => {
  it('is not delivered to a window that was closed before it came (an error thrown by a dead page would fail the test that happens to be running)', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 0, readyDelay: 300 });
    f.close();
    await sleep(800);                                   // the callback was due at 300 ms: Jest fails the test an uncaught error from a timer lands in
    expect(f.errors).toEqual([]);
  });

  it('is delivered to a window that is open, when the test lets the session answer (and not before)', async () => {
    const { promise, release } = gate();
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 0, readyGate: promise });
    try {
      await sleep(300);
      expect(val(f.d, 'rentalUpdatingAgentDisplay')).toBe('');            // the session has not answered: the gate is shut
      release();
      await until(() => val(f.d, 'rentalUpdatingAgentDisplay') !== '');   // the signed-in agent, once the session has answered
    } finally { f.close(); }
  });

  it('is not delivered to a window that was closed before the gate opened', async () => {
    const { promise, release } = gate();
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 0, readyGate: promise });
    f.close();
    release();
    await sleep(300);
    expect(f.errors).toEqual([]);
  });
});

describe('add-form-harness: the answers to requests', () => {
  it('answers a listing request that was out when the window was closed by delivering nothing, and says so', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=9', getDelay: 300, getError: 'offline', settle: 50 });
    expect(f.dropped).toEqual([]);                      // nothing was dropped while the window was open
    f.close();
    await sleep(700);                                   // the answer was due at 300 ms: the page would have shown "could not load" on a dead document
    expect(f.dropped).toEqual(['listings.get']);
    expect(f.errors).toEqual([]);
  });

  it('answers a directory lookup that was out when the window was closed by delivering nothing, and says so', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { memberDelays: { '39361': 300 }, settle: 150 });
    expect(f.fetched.some((path) => /directory\/members\?.*mlsId=39361/.test(path))).toBe(true);        // the page asked
    f.close();
    await sleep(700);
    expect(f.dropped).toEqual(['directory member 39361']);
    expect(f.errors).toEqual([]);
  });

  it('delivers the answers to a window that stays open', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=9', listing: { id: '9', listing_id: 'RL-9', status: 'Draft', address: {}, features: {}, agent_info: {}, media: [], raw_data: { TaxLot: '88' } }, getDelay: 200, settle: 0 });
    try {
      await until(() => val(f.d, 'bldgTaxLot') === '88', 60000);        // the listing was delivered and restored into the form
      expect(f.dropped).toEqual([]);
    } finally { f.close(); }
  });
});
