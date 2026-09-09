/// <reference types="jest" />
/**
 * AN OPEN HOUSE IS SCHEDULED WHEN THE SERVER SAYS SO — NOT WHEN A BUTTON SAYS SO.
 *
 * Several Open House buttons, several implementations. Two of them in the canonical CRM never reached
 * the server at all, and still reported success:
 *
 *   manage-listings.js  cardOHSave()      pushed onto the in-memory `myOpenHouses` array and toasted
 *                                         "<types> scheduled for <address>". No fetch. No request.
 *                                         Reload the page and the open house is gone - and REBNY has
 *                                         no record of a showing the agent believes is published.
 *
 *   open-houses.js      ohOverviewSave()  writes correctly through MallanAPI.showings.create, but
 *                                         carried a "// Fallback: local only" branch that pushed to
 *                                         the same array and toasted success when MallanAPI was absent.
 *
 * This is the same defect the owner hit on the sale form - "a refused save is no longer called a save"
 * (cd4f8aec) - in a second place. A write that did not happen must never be reported as a write.
 *
 * The rule: multiple Open House BUTTONS are fine; multiple Open House WRITERS are not. Every surface
 * routes through one writer, which persists to /api/crm/showings with type="openhouse", and local
 * state is updated only from what the server returned.
 *
 * This suite drives the SHIPPED cardOHSave in a real DOM and asserts on the request that left the page
 * and on what the operator was told. No assertion here is a grep over source text.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

type Boot = {
  win: any;
  creates: any[];
  toasts: { msg: string; kind: string }[];
  openHouses: () => any[];
  save: (id: string) => Promise<void>;
  close: () => void;
};

/** Boot the shipped manage-listings + open-houses modules over a real Open House card. */
function boot(opts: { createResult?: 'ok' | 'reject'; withApi?: boolean } = {}): Boot {
  const { createResult = 'ok', withApi = true } = opts;
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);

  const LID = 'SL-77';
  const card = `
    <input id="cardOHDate-${LID}" value="2026-10-04">
    <input id="cardOHStart-${LID}" value="13:00">
    <input id="cardOHEnd-${LID}" value="15:00">
    <input type="checkbox" id="cardOHType-public-${LID}" checked>
    <input type="checkbox" id="cardOHType-appt-${LID}">
    <input type="checkbox" id="cardOHType-broker-${LID}">
    <input type="checkbox" id="cardOHType-virtual-${LID}">
    <div id="section-manage"></div>`;
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${card}</body></html>`, {
    url: 'http://localhost/crm',
    runScripts: 'dangerously',
    virtualConsole,
  });
  const win: any = dom.window;

  const creates: any[] = [];
  const toasts: { msg: string; kind: string }[] = [];
  win.__creates = creates;
  win.__toasts = toasts;
  win.__createResult = createResult;

  win.eval(`
    var showToast = function (m, k) { __toasts.push({ msg: String(m), kind: k || 'info' }); };
    var manageShowToast = showToast;
    var Utils = { esc: function (s) { return String(s == null ? '' : s); } };
    var renderOHOverview = function () {};
  `);
  if (withApi) {
    win.eval(`
      var MallanAPI = {
        showings: {
          create: function (payload) {
            __creates.push(payload);
            return __createResult === 'ok'
              ? Promise.resolve({ id: 'SRV-1' })
              : Promise.reject(new Error('server refused'));
          },
        },
        listings: { list: function () { return Promise.resolve({ listings: [] }); } },
        _fetch: function () { return Promise.resolve({}); },
        onReady: function (cb) { cb(); },
      };
    `);
  } else {
    win.eval('var MallanAPI = undefined;');
  }

  win.eval(read('public/crm/js/manage/manage-listings.js'));
  win.eval(read('public/crm/js/manage/open-houses.js'));

  // manage-listings.js declares its OWN manageShowToast, which writes into #manageToastMsg in the
  // real shell. Capture AFTER the modules load, so this observes what the operator would be told
  // rather than being replaced by the module's version.
  win.eval(`
    manageShowToast = function (m, k) { __toasts.push({ msg: String(m), kind: k || 'info' }); };
    showToast = manageShowToast;
    myManagementListings = [{ id: '${LID}', _dbId: '${LID}', category: 'sales', address: '212 E 47th St', unit: '9F', status: 'Active' }];
    renderManageSection = function () {};
    renderOHOverview = function () {};
  `);

  return {
    win,
    creates,
    toasts,
    openHouses: () => win.eval('myOpenHouses.slice()'),
    save: async (id: string) => {
      win.eval(`cardOHSave('${id}')`);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    },
    close: () => win.close(),
  };
}

const LID = 'SL-77';
/** A claim of success. Deliberately NOT /saved/ - an honest "NOT saved" must not read as a claim. */
const claimsScheduled = (t: { msg: string }[]) => t.some((x) => /\bscheduled\b/i.test(x.msg));

describe('scheduling an Open House from a listing card reaches the server', () => {
  it('sends one create to the Open House writer', async () => {
    const t = boot();
    await t.save(LID);
    expect(t.creates).toHaveLength(1);
    expect(t.creates[0]).toMatchObject({ listing_id: LID, type: 'openhouse' });
    t.close();
  });

  it('carries the date and the times the operator entered', async () => {
    const t = boot();
    await t.save(LID);
    const sent = JSON.stringify(t.creates[0]);
    expect(sent).toContain('2026-10-04');
    expect(sent).toContain('13:00');
    t.close();
  });

  it('records the open house locally only after the server accepted it, using the server id', async () => {
    const t = boot();
    await t.save(LID);
    const rows = t.openHouses();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('SRV-1');
    t.close();
  });
});

describe('a refused Open House is never reported as scheduled', () => {
  it('says nothing was scheduled when the server refuses', async () => {
    const t = boot({ createResult: 'reject' });
    await t.save(LID);
    expect(claimsScheduled(t.toasts)).toBe(false);
    expect(t.toasts.some((x) => x.kind === 'error' || /fail|not saved|could not/i.test(x.msg))).toBe(true);
    t.close();
  });

  it('does not leave a phantom open house in local state after a refusal', async () => {
    const t = boot({ createResult: 'reject' });
    await t.save(LID);
    expect(t.openHouses()).toHaveLength(0);
    t.close();
  });

  it('with no API available it refuses rather than inventing a local-only success', async () => {
    const t = boot({ withApi: false });
    await t.save(LID);
    expect(claimsScheduled(t.toasts)).toBe(false);
    expect(t.openHouses()).toHaveLength(0);
    t.close();
  });
});

describe('validation still runs before anything is sent', () => {
  it('an empty date sends no request and reports the missing fields', async () => {
    const t = boot();
    t.win.document.getElementById(`cardOHDate-${LID}`).value = '';
    await t.save(LID);
    expect(t.creates).toHaveLength(0);
    expect(t.toasts.some((x) => /date|time/i.test(x.msg))).toBe(true);
    t.close();
  });

  it('no showing type selected sends no request', async () => {
    const t = boot();
    t.win.document.getElementById(`cardOHType-public-${LID}`).checked = false;
    await t.save(LID);
    expect(t.creates).toHaveLength(0);
    t.close();
  });
});
