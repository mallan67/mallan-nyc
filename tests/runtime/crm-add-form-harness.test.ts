/// <reference types="jest" />
/**
 * The Add / Edit form harness (add-form-harness.ts) itself.
 *
 * MallanAPI.onReady's callback was scheduled on a timer of the test process, so a window that was closed before the session answered was still called back, and the page's code threw on its
 * dead document ("reading 'getElementById'") in whichever test was running by then: a failure that depended on how busy the machine was. The callback is now scheduled on the window's own timer,
 * which a closed window never fires.
 */
import { bootAddForm, sleep, val } from './add-form-harness';

jest.setTimeout(120000);

describe('add-form-harness: the session answer', () => {
  it('is not delivered to a window that was closed before it came (an error thrown by a dead page would fail the test that happens to be running)', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 0, readyDelay: 300 });
    f.close();
    await sleep(800);                                   // the callback was due at 300 ms: Jest fails the test an uncaught error from a timer lands in
    expect(f.errors).toEqual([]);
  });

  it('is delivered to a window that is open, at the time the test asked for', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 0, readyDelay: 400 });
    try {
      await sleep(100);
      expect(val(f.d, 'rentalUpdatingAgentDisplay')).toBe('');            // not yet
      await sleep(1400);
      expect(val(f.d, 'rentalUpdatingAgentDisplay')).not.toBe('');        // the signed-in agent, once the session has answered
    } finally { f.close(); }
  });
});
