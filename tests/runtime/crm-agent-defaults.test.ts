/// <reference types="jest" />
/**
 * The agent (or broker) who starts a listing is its listing agent, and the listing carries that agent's Cotality identity.
 *
 * Before: both Add / Edit forms kept the signed-in agent in hidden <prefix>UpdatingAgent* inputs that sit OUTSIDE the area the save routine sweeps, so the
 * payload carried ListAgentMlsId / ListAgentFullName / ListAgentEmail / ListAgentDirectPhone as blanks on every listing (the server fills a name, office,
 * email and phone from the session, never the MLS id, so list_agent_mls_id stayed null). The Rental form also did not default the Contacts tab to the agent
 * at all, and the Sale form showed the internal agent id where Cotality has an MLS id.
 *
 * public/crm/js/forms/agent-defaults.js is now the one place that defaults the agent, restores a saved listing's agent, asks the live Cotality Member
 * directory for the agent's MemberKey and office, and says what it found. These tests drive the REAL pages and the real server normalizer.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizePayload, buildPersistenceRecord } from '@/lib/compliance/normalizer';
import { typedAgentColumnsFromJson } from '@/lib/listings/agent-info-typed-columns';
import { bootAddForm, checked, cotalityStatus, sleep, until, txt, val, PAGE_MODULES, SESSION_MEMBER, SESSION_USER, type AddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const NAVIGATION = 'Not implemented: navigation (except hash changes)';
const FORMS: [AddForm, 'sale' | 'rental', string][] = [
  ['SALE-FORM-REDESIGN', 'sale', 'collectSaleFormData'],
  ['RENTAL-FORM-REDESIGN', 'rental', 'collectRentalFormData'],
];

const payloadOf = (f: BootedForm, collector: string): Record<string, any> => f.w[collector]();
const persisted = (payload: Record<string, unknown>) => {
  const { normalized } = normalizePayload(payload);
  const rec = buildPersistenceRecord(normalized);
  return { agentInfo: rec.agentInfo, typed: typedAgentColumnsFromJson(rec.agentInfo) };
};
const tableRows = (f: BootedForm, prefix: string) => [...f.d.querySelectorAll(`#${prefix}AgentContactsTable tr`)] as HTMLTableRowElement[];

// jsdom does not fetch external scripts, so the harness loads the page modules itself: the tags that make the browser load them are asserted here.
describe.each(FORMS)('%s: loads its agent module', (form) => {
  it('lists agent-defaults.js after the API client and the directory picker', () => {
    const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
    const api = html.indexOf('<script src="js/core/api-client.js"></script>');
    const picker = html.indexOf('<script src="js/forms/directory-picker.js"></script>');
    const agent = html.indexOf('<script src="js/forms/agent-defaults.js"></script>');
    expect(api).toBeGreaterThan(-1);
    expect(picker).toBeGreaterThan(api);
    expect(agent).toBeGreaterThan(picker);
    expect(html.split('<script src="js/forms/agent-defaults.js"></script>').length - 1).toBe(1);
  });
});

describe.each(FORMS)('%s: a new listing defaults to the signed-in agent', (form, prefix, collector) => {
  let f: BootedForm;
  beforeAll(async () => {
    f = await bootAddForm(form);
    await checked(f.d, prefix);
  });
  afterAll(() => f.close());

  it('boots without a page error and asks the live Cotality directory once for the agent by MLS ID', () => {
    expect([...new Set(f.errors)]).toEqual([]);
    expect(f.fetched.filter((p) => p.includes('/api/crm/directory/members'))).toEqual(['/api/crm/directory/members?mlsId=39361&includeInactive=1&limit=1']);
  });

  it('shows the agent as the Listing Agent, in the header and in the Contacts tab', () => {
    expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('Sender Agent · MLS ID 39361');
    expect(txt(f.d, 'headerAgentName')).toBe('Sender Agent');
    expect(txt(f.d, 'headerCompanyName')).toBe('Mallan Real Estate Inc.');
    expect(val(f.d, `${prefix}ListingCompany`)).toBe('mallan');
    expect(val(f.d, `${prefix}ListingCompanySearch`)).toBe('Mallan Real Estate Inc.');
    expect(val(f.d, `${prefix}ListingAgent`)).toBe('AG-9');
    expect((f.d.getElementById(`${prefix}ListingAgent`) as HTMLElement).dataset.company).toBe('mallan');   // the agent dropdown lists this company's agents
    const search = f.d.getElementById(`${prefix}ListingAgentSearch`) as HTMLInputElement;
    expect(search.value).toBe('Sender Agent');
    expect(search.disabled).toBe(false);
    const panel = f.d.getElementById(`${prefix}ListingAgentInfo`) as HTMLElement;
    expect(panel.style.display).toBe('block');
    expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('39361');            // the Cotality MLS ID, not the internal agent id
    expect(txt(f.d, `${prefix}ListingAgentPhone`)).toBe('212-555-0199');
    expect(txt(f.d, `${prefix}ListingAgentEmail`)).toBe('sender@example.test');
    expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('L-123');
  });

  it('lists the agent once in the contacts table', () => {
    const rows = tableRows(f, prefix);
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-type')).toBe('listing');
    expect([...rows[0].children].slice(1, 6).map((c) => c.textContent)).toEqual(['39361', 'Sender Agent', 'Mallan Real Estate Inc.', '212-555-0199', 'sender@example.test']);
  });

  it('says what Cotality returned for the agent', () => {
    expect(cotalityStatus(f.d, prefix)).toBe('Cotality agent: Sender Agent (MLS ID 39361) · office Cotality Office Name (MLS ID 7041)');
    expect(f.d.getElementById(`${prefix}AgentCotalityStatus`)?.className).toMatch(/green/);
  });

  it('submits the agent identity, with the Cotality keys the directory returned, and never the company slug as an office key', () => {
    const p = payloadOf(f, collector);
    expect(p).toMatchObject({
      ListAgentMlsId: '39361', ListAgentKey: '4455667', ListAgentFullName: 'Sender Agent', ListAgentEmail: 'sender@example.test', ListAgentDirectPhone: '212-555-0199',
      ListOfficeName: 'Mallan Real Estate Inc.', ListOfficeKey: '5671398', ListOfficeMlsId: '7041',
    });
    expect(p.ListOfficeKey).not.toBe('mallan');
    expect(p.ListAgentMlsId).not.toBe(SESSION_USER.id);                   // the internal agent id is not a Cotality identifier
  });

  it('survives the real server normalizer into the agent_info bucket and the typed MLS id columns', () => {
    const { agentInfo, typed } = persisted(payloadOf(f, collector));
    expect(agentInfo).toMatchObject({
      ListAgentMlsId: '39361', ListAgentKey: '4455667', ListAgentFullName: 'Sender Agent', ListOfficeKey: '5671398', ListOfficeMlsId: '7041', ListOfficeName: 'Mallan Real Estate Inc.',
    });
    expect(typed).toMatchObject({ list_agent_mls_id: '39361', list_office_mls_id: '7041' });
  });
});

describe.each(FORMS)('%s: what the agent profile or Cotality cannot supply is left out, not guessed', (form, prefix, collector) => {
  const KEYS = ['ListAgentKey', 'ListOfficeKey', 'ListOfficeMlsId'];

  it('a profile with no Cotality MLS ID says so and submits no Cotality key', async () => {
    const f = await bootAddForm(form, { user: { ...SESSION_USER, mlsId: null } });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toMatch(/has no Cotality MLS ID/);
      expect(f.fetched.filter((p) => p.includes('/directory/'))).toEqual([]);
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('');
      expect(p.ListAgentFullName).toBe('Sender Agent');
      for (const k of KEYS) expect(p).not.toHaveProperty(k);
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('Sender Agent');   // no "MLS ID" the agent does not have
    } finally { f.close(); }
  });

  it('an MLS ID Cotality does not know says so and submits the MLS ID without a key', async () => {
    const f = await bootAddForm(form, { members: { '39361': null } });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toMatch(/No Cotality member was found for MLS ID 39361/);
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('39361');
      for (const k of KEYS) expect(p).not.toHaveProperty(k);
    } finally { f.close(); }
  });

  it('a directory that fails says so, and the form still saves', async () => {
    const f = await bootAddForm(form, { directoryError: 'directory down' });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('Could not check MLS ID 39361 in Cotality (directory down).');
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('39361');
      for (const k of KEYS) expect(p).not.toHaveProperty(k);
    } finally { f.close(); }
  });

  it('an office key that is not a Cotality key (digits) is never submitted, wherever it came from', async () => {
    const f = await bootAddForm(form, { members: { '39361': { ...SESSION_MEMBER, officeKey: 'mallan' } } });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p).not.toHaveProperty('ListOfficeKey');
      expect(p.ListAgentKey).toBe('4455667');                              // the rest of what the directory said is still used
    } finally { f.close(); }
  });

  it('what the directory returns is shown as text, never as markup', async () => {
    const hostile = '<img src=x onerror="window.__pwned=1">';
    const f = await bootAddForm(form, { members: { '39361': { ...SESSION_MEMBER, fullName: hostile } } });
    try {
      await checked(f.d, prefix);
      const status = f.d.getElementById(`${prefix}AgentCotalityStatus`) as HTMLElement;
      expect(status.querySelector('img')).toBeNull();
      expect(status.textContent).toContain(hostile);
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });

  it('an inactive Cotality member is flagged, not hidden', async () => {
    const f = await bootAddForm(form, { members: { '39361': { ...SESSION_MEMBER, status: 'Inactive' } } });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toMatch(/status: Inactive$/);
      expect(f.d.getElementById(`${prefix}AgentCotalityStatus`)?.className).toMatch(/amber/);
    } finally { f.close(); }
  });

  it('with no session the page sends the visitor to the login page and the Contacts tab stays empty', async () => {
    const f = await bootAddForm(form, { user: null });
    try {
      expect([...new Set(f.errors)]).toEqual([NAVIGATION]);                 // the auth gate's redirect is the only thing that happens (jsdom cannot navigate)
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('');
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('');
      expect(tableRows(f, prefix).map((r) => r.id)).toEqual([`${prefix}AgentContactsPlaceholder`]);
    } finally { f.close(); }
  });

  it('a page whose agent module did not load still boots, and submits no identity it cannot vouch for', async () => {
    const f = await bootAddForm(form, { modules: ['directory-picker', 'colist-section'] });
    try {
      expect([...new Set(f.errors)]).toEqual([]);
      const p = payloadOf(f, collector);
      for (const k of ['ListAgentMlsId', ...KEYS]) expect(p).not.toHaveProperty(k);
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: agent and company text is never interpreted as markup', (form, prefix) => {
  it('renders hostile profile text as text in the contacts table and the panel', async () => {
    const hostile = '<img src=x onerror="window.__pwned=1">';
    const f = await bootAddForm(form, { user: { ...SESSION_USER, name: hostile, email: hostile, companyName: hostile } });
    try {
      await checked(f.d, prefix);
      const table = f.d.getElementById(`${prefix}AgentContactsTable`) as HTMLElement;
      expect(table.querySelector('img')).toBeNull();
      expect(table.textContent).toContain(hostile);
      expect(f.d.getElementById(`${prefix}ListingAgentInfo`)?.querySelector('img')).toBeNull();
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });
});

// ── Editing a saved listing: the identity it was saved with wins, the session fills only what the listing lacks ──────────────────────────────────────────
const SAVED = {
  id: '1', listing_id: 'L-1', status: 'Draft',
  list_agent_full_name: 'Saved Agent', list_agent_mls_id: '11111', list_agent_email: 'saved@example.test', list_agent_direct_phone: '212-555-0111',
  list_office_name: 'Saved Office Inc.', list_office_mls_id: '2222',
  address: {}, features: {}, media: [], agent_info: { ListAgentKey: '777', ListOfficeKey: '888' }, raw_data: {},
};
const SAVED_MEMBER = { key: '777', mlsId: '11111', fullName: 'Saved Agent', status: 'Active', officeKey: '888', officeMlsId: '2222', officeName: 'Saved Office Inc.' };

describe.each(FORMS)('%s: editing a saved listing', (form, prefix, collector) => {
  // both orders of arrival: the session user before the listing, and the listing before the session user
  it.each([
    ['the session user arrives first', { readyDelay: 5, getDelay: 300 }],
    ['the listing arrives first', { readyDelay: 500, getDelay: 10 }],
  ])('keeps the saved agent and office when %s', async (_name, timing) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: SAVED, members: { '39361': SESSION_MEMBER, '11111': SAVED_MEMBER }, settle: 1500, ...timing });
    try {
      await checked(f.d, prefix);
      await sleep(300);
      expect([...new Set(f.errors)]).toEqual([]);
      const p = payloadOf(f, collector);
      expect(p).toMatchObject({
        ListAgentMlsId: '11111', ListAgentKey: '777', ListAgentFullName: 'Saved Agent', ListAgentEmail: 'saved@example.test', ListAgentDirectPhone: '212-555-0111',
        ListOfficeName: 'Saved Office Inc.', ListOfficeKey: '888', ListOfficeMlsId: '2222',
      });
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('Saved Agent');
      expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('11111');
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('Saved Agent · MLS ID 11111');
      expect(tableRows(f, prefix)).toHaveLength(1);
      expect([...tableRows(f, prefix)[0].children].slice(1, 3).map((c) => c.textContent)).toEqual(['11111', 'Saved Agent']);
    } finally { f.close(); }
  });

  it('fills an MLS ID a saved listing lacks from the session when the signed-in agent OWNS the listing (every listing saved before this fix has none), and drops the old company slug', async () => {
    const legacy = {
      ...SAVED, agent_id: 'AG-9', list_agent_full_name: 'Sender Agent', list_agent_mls_id: null, list_office_mls_id: null,
      agent_info: { ListOfficeKey: 'mallan' }, raw_data: { ListOfficeKey: 'mallan' },
    };
    const f = await bootAddForm(form, { search: '?id=1', listing: legacy, settle: 1500 });
    try {
      await checked(f.d, prefix);
      await sleep(300);
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('39361');                              // from the session: the listing is the signed-in agent's own
      expect(p.ListAgentFullName).toBe('Sender Agent');
      expect(p.ListOfficeKey).toBe('5671398');                             // the live Cotality office key replaces the old slug
      expect(p.ListOfficeKey).not.toBe('mallan');
    } finally { f.close(); }
  });

  it('a slow Cotality answer for an earlier MLS ID never attaches the wrong agent keys to the saved listing', async () => {
    // the session user's lookup (39361) is answered after the listing has put the saved agent (11111) in its place, and before the saved agent's own answer
    const noKeys = { ...SAVED, agent_info: {}, raw_data: {} };
    const f = await bootAddForm(form, {
      search: '?id=1', listing: noKeys, members: { '39361': SESSION_MEMBER, '11111': SAVED_MEMBER }, memberDelays: { '39361': 300, '11111': 700 }, getDelay: 100, settle: 1600,
    });
    try {
      await sleep(400);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111' });
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey', '4455667');
      await sleep(600);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111', ListAgentKey: '777', ListOfficeKey: '888', ListOfficeMlsId: '2222' });
    } finally { f.close(); }
  });

  it('a saved MLS ID with no saved Cotality keys gets the keys of THAT agent, not the signed-in agent\'s', async () => {
    const noKeys = { ...SAVED, agent_info: {}, raw_data: {} };
    const f = await bootAddForm(form, { search: '?id=1', listing: noKeys, members: { '39361': SESSION_MEMBER, '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111', ListAgentKey: '777', ListOfficeKey: '888', ListOfficeMlsId: '2222' });
      expect(f.fetched.filter((p) => p.includes('mlsId=39361'))).toEqual([]);     // the session agent's record was never needed
    } finally { f.close(); }
  });

  it('a directory member whose name is not the listing agent\'s is reported and attaches no key (an MLS ID typed against the wrong person)', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...SAVED, agent_info: {}, raw_data: {} }, settle: 1500,
      members: { '11111': { ...SAVED_MEMBER, fullName: 'Someone Else', key: '999', officeKey: '998', officeMlsId: '997' } },
    });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('MLS ID 11111 belongs to Someone Else in Cotality, not to Saved Agent, so no Cotality key was attached.');
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('11111');
      for (const k of ['ListAgentKey', 'ListOfficeKey']) expect(p).not.toHaveProperty(k);
      expect(p.ListOfficeMlsId).toBe('2222');                              // the office the listing was saved with is the listing's own, not the directory's
    } finally { f.close(); }
  });

  it.each([
    ['Mike Smith', 'Michael Smith', true],        // the same family name and a nickname of the given name: one person
    ['Mike Smith', 'Mike Jones', false],          // another family name
    ['Dara Smith', 'Paeder Smith', false],        // the same family name, another first name
    ['Smith', 'Michael Smith', false],            // a one-word name agrees with a longer one but proves nothing: nothing is attached
    ['Smith', 'Michael Jones', false],
    ['', 'Michael Smith', true],                  // an MLS ID and no name: nothing contradicts the directory
    ['José García', 'Jose Garcia', true],         // accents are not a different person
    ['Michael Smith Jr.', 'Michael Smith', true], // nor is a suffix
    ['Bob Smith', 'Robert Smith', true],
    ['王伟', '李娜', false],                       // a name with no ASCII letters is compared, not skipped
    ['Álvaro Pérez', 'Lucía Pérez', false],       // an accented first letter is a letter
    ['Michael Smith', 'Mark Smith', false],       // the same family name and first initial are not the same person
  ])('the listing names %j, Cotality has %j for that MLS ID: keys attached = %s', async (listed, member, attaches) => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...SAVED, list_agent_full_name: listed || null, agent_info: {}, raw_data: {} }, settle: 1200,
      members: { '11111': { ...SAVED_MEMBER, fullName: member } },
    });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      if (attaches) expect(p).toMatchObject({ ListAgentKey: '777', ListOfficeKey: '888' });
      else for (const k of ['ListAgentKey', 'ListOfficeKey']) expect(p).not.toHaveProperty(k);
    } finally { f.close(); }
  });

  it('Cotality\'s keys replace the ones a listing was saved with when the member Cotality returns IS the listing\'s agent (live Cotality is the only authority)', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: SAVED, settle: 1200,
      members: { '11111': { ...SAVED_MEMBER, key: '999', officeKey: '998', officeMlsId: '997' } },
    });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '999', ListOfficeKey: '998', ListOfficeMlsId: '997' });
    } finally { f.close(); }
  });

  it('an MLS ID that is not a Cotality MLS ID (digits only) is not looked up and is said so', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED, list_agent_mls_id: 'AB-12', agent_info: {}, raw_data: {} }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('MLS ID "AB-12" is not a Cotality MLS ID (digits only), so it was not checked.');
      expect(f.fetched.filter((p) => p.includes('/directory/'))).toEqual([]);
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');
    } finally { f.close(); }
  });

  it('never submits the old company slug as an office key, even when Cotality cannot be reached: the saved slug is cleared instead', async () => {
    const legacy = { ...SAVED, agent_info: { ListOfficeKey: 'mallan' }, raw_data: { ListOfficeKey: 'mallan' } };
    const f = await bootAddForm(form, { search: '?id=1', listing: legacy, directoryError: 'down', settle: 1500 });
    try {
      await sleep(400);
      const p = payloadOf(f, collector);
      expect(p.ListOfficeKey).toBe('');                                    // an explicit blank replaces the stored slug (the save merges, so omitting it would keep it)
      expect(p.ListOfficeKey).not.toBe('mallan');
    } finally { f.close(); }
  });
});

// ── A broker may edit any listing. Opening somebody else's listing must not make the broker its listing agent. ───────────────────────────────────────────────
// (every listing saved before this fix has no MLS ID, no Cotality keys and an old company slug, so it is also the shape of the listings a broker meets first)
describe.each(FORMS)('%s: a broker who edits another agent\'s listing never becomes its listing agent', (form, prefix, collector) => {
  const OTHERS = { ...SAVED, agent_id: '77', list_agent_mls_id: null, list_office_mls_id: null, agent_info: {}, raw_data: {} };
  const NOT_THE_BROKER = ['Sender Agent', '39361', 'sender@example.test', '212-555-0199', 'L-123'];
  const everythingShown = (f: BootedForm) => [
    ...[...f.d.querySelectorAll(`#${prefix}AgentContactsTable td`)].map((c) => c.textContent),
    txt(f.d, `${prefix}ListingAgentId`), txt(f.d, `${prefix}ListingAgentPhone`), txt(f.d, `${prefix}ListingAgentEmail`), txt(f.d, `${prefix}ListingAgentLicense`),
    val(f.d, `${prefix}ListingAgentSearch`), val(f.d, `${prefix}UpdatingAgentDisplay`), val(f.d, `${prefix}UpdatingAgentName`), val(f.d, `${prefix}UpdatingAgentMlsId`),
  ].join(' | ');

  it.each([
    ['the session user arrives first', { readyDelay: 5, getDelay: 400 }],
    ['the listing arrives first', { readyDelay: 600, getDelay: 10 }],
    ['both arrive together', { readyDelay: 100, getDelay: 100 }],
  ])('shows and submits only what the listing carries, and no session identity, when %s', async (_name, timing) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: OTHERS, settle: 1800, ...timing });
    try {
      await checked(f.d, prefix);
      await sleep(300);
      expect([...new Set(f.errors)]).toEqual([]);
      const p = payloadOf(f, collector);
      expect(p).toMatchObject({ ListAgentFullName: 'Saved Agent', ListAgentEmail: 'saved@example.test', ListAgentDirectPhone: '212-555-0111', ListOfficeName: 'Saved Office Inc.' });
      expect(p.ListAgentMlsId).toBe('');                                   // the listing has none, and the broker's is not its agent's
      for (const k of ['ListAgentKey', 'ListOfficeKey', 'ListOfficeMlsId']) expect(p).not.toHaveProperty(k);
      const shown = everythingShown(f);
      for (const mine of NOT_THE_BROKER) expect(shown).not.toContain(mine);
      expect(cotalityStatus(f.d, prefix)).toBe('This listing has no Cotality MLS ID for its agent, so it cannot be matched to that agent in Cotality.');
      expect(f.fetched.filter((x) => x.includes('/directory/'))).toEqual([]);   // nothing to look up for anybody
      expect(txt(f.d, 'headerAgentName')).toBe('Sender Agent');            // the header is the signed-in user's, and only the header
    } finally { f.close(); }
  });

  it('a listing that carries no office name does not get the broker\'s company', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...OTHERS, list_office_name: null }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector).ListOfficeName).toBe('');
      expect(val(f.d, `${prefix}ListingCompanySearch`)).not.toBe('Mallan Real Estate Inc.');
    } finally { f.close(); }
  });

  it('a listing the broker owns but that names another agent is not filled in from the broker either', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...OTHERS, agent_id: 'AG-9', list_agent_full_name: 'Pat Jones' }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector).ListAgentMlsId).toBe('');
      expect(everythingShown(f)).not.toContain('39361');
      expect(cotalityStatus(f.d, prefix)).toMatch(/^This listing has no Cotality MLS ID for its agent/);
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: the agent whose listing it is gets what the listing lacks from their profile, in either order', (form, prefix, collector) => {
  const OWN = {
    ...SAVED, agent_id: 'AG-9', list_agent_full_name: null, list_agent_mls_id: null, list_agent_email: null, list_agent_direct_phone: null, list_office_name: null,
    list_office_mls_id: null, agent_info: {}, raw_data: {},
  };
  it.each([
    ['the session user arrives first', { readyDelay: 5, getDelay: 400 }],
    ['the listing arrives first', { readyDelay: 600, getDelay: 10 }],
  ])('a listing with no agent at all becomes the owner\'s own when %s', async (_name, timing) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: OWN, settle: 1800, ...timing });
    try {
      await checked(f.d, prefix);
      await sleep(300);
      expect(payloadOf(f, collector)).toMatchObject({
        ListAgentMlsId: '39361', ListAgentKey: '4455667', ListAgentFullName: 'Sender Agent', ListAgentEmail: 'sender@example.test', ListAgentDirectPhone: '212-555-0199',
        ListOfficeName: 'Mallan Real Estate Inc.', ListOfficeKey: '5671398', ListOfficeMlsId: '7041',
      });
      expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('L-123');
      expect(tableRows(f, prefix)).toHaveLength(1);
    } finally { f.close(); }
  });

  it('an MLS ID the listing already carries is kept even when it is not the owner\'s profile MLS ID: the profile fills only what the listing lacks', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...OWN, list_agent_full_name: 'Sender Agent', list_agent_mls_id: '11111' }, settle: 1500,
      members: { '11111': { ...SAVED_MEMBER, fullName: 'Sender Agent' } },
    });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111', ListAgentKey: '777' });
      expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('11111');
    } finally { f.close(); }
  });

  it('a saved name that is the owner written another way keeps the saved spelling, and takes the MLS ID the listing lacks from the owner', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...OWN, list_agent_full_name: 'S. Agent' }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p.ListAgentFullName).toBe('S. Agent');
      expect(p.ListAgentMlsId).toBe('39361');
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('S. Agent');
    } finally { f.close(); }
  });

  it('a saved name that is a different person from the owner keeps the saved name and borrows nothing of the owner\'s', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...OWN, list_agent_full_name: 'Mike Jones' }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p.ListAgentFullName).toBe('Mike Jones');
      expect(p.ListAgentMlsId).toBe('');
      expect(p.ListAgentEmail).toBe('');
      expect(p.ListAgentDirectPhone).toBe('');
      expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('--');
    } finally { f.close(); }
  });
});

// ── Opening a listing to edit: the signed-in user is nobody's agent until the listing says so ───────────────────────────────────────────────────────────
describe.each(FORMS)('%s: while a saved listing is still loading', (form, prefix, collector) => {
  it('shows and submits no agent at all (the session user is not displayed as the agent of a listing that may be somebody else\'s)', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED, agent_id: '77' }, readyDelay: 5, getDelay: 1500, settle: 700 });
    try {
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('');
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('');
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('');
      expect((f.d.getElementById(`${prefix}ListingAgentInfo`) as HTMLElement).style.display).not.toBe('block');
      expect(tableRows(f, prefix).map((r) => r.id)).toEqual([`${prefix}AgentContactsPlaceholder`]);
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('');
      expect(p.ListAgentFullName).toBe('');
      expect(f.fetched.filter((x) => x.includes('/directory/'))).toEqual([]);
      expect(cotalityStatus(f.d, prefix)).toBe('');
      await sleep(1000);                                                    // the listing arrives (the page must still be open when it does)
      await checked(f.d, prefix);
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('Saved Agent · MLS ID 11111');
    } finally { f.close(); }
  });

  it('the header is still the signed-in user\'s', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: SAVED, readyDelay: 5, getDelay: 1500, settle: 700 });
    try {
      expect(txt(f.d, 'headerAgentName')).toBe('Sender Agent');
      expect(txt(f.d, 'headerCompanyName')).toBe('Mallan Real Estate Inc.');
      await sleep(1000);
      expect(txt(f.d, 'headerAgentName')).toBe('Sender Agent');            // and still, once the listing has arrived
    } finally { f.close(); }
  });

  // MallanAPI.onReady calls back at once when the auth gate has already resolved, which is BEFORE the page has looked at ?id=: the session user is applied as the
  // agent of what still looks like a new listing, then the page learns it is editing.
  it('is not fooled by a session that was ready before the page knew it was editing: the saved agent wins, and the session agent\'s late answer changes nothing', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...SAVED, agent_info: {}, raw_data: {} }, readySync: true, getDelay: 100, settle: 1500,
      members: { '39361': SESSION_MEMBER, '11111': SAVED_MEMBER }, memberDelays: { '39361': 300 },
    });
    try {
      await checked(f.d, prefix);
      await sleep(400);                                    // the session agent's own (slow) answer has arrived by now
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: 'Saved Agent', ListAgentMlsId: '11111', ListAgentKey: '777', ListOfficeKey: '888', ListOfficeMlsId: '2222' });
      expect(cotalityStatus(f.d, prefix)).toMatch(/^Cotality agent: Saved Agent \(MLS ID 11111\)/);
    } finally { f.close(); }
  });

  it('a listing that never loads leaves no agent shown or submitted, even though the session was ready first', async () => {
    const f = await bootAddForm(form, { search: '?id=1', readySync: true, getError: 'down', memberDelays: { '39361': 200 }, settle: 1200 });
    try {
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('');
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('');
      expect(cotalityStatus(f.d, prefix)).toBe('');
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('');
      for (const k of ['ListAgentKey', 'ListOfficeKey', 'ListOfficeMlsId']) expect(p).not.toHaveProperty(k);   // the session agent's late answer attached nothing
    } finally { f.close(); }
  });
});

// ── What an adversarial review of 72d9091b found ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Names are compared the way people compare names; a page opened to edit never shows the signed-in user as the agent; what Cotality says about the MLS ID decides
// which keys a listing carries; the Commission tab, the dropdown lists and the Draft Saved panel; a Rental form that could not put the listing back; a stale module.
const AGENT_MODULE = readFileSync(resolve(__dirname, '../../public/crm/js/forms/agent-defaults.js'), 'utf8');
const compareNames: (a: string, b: string) => string = (() => { const w: any = {}; new Function('window', 'document', AGENT_MODULE)(w, {}); return w.MallanAgentDefaults.compareNames; })();

const NAMES: [string, string, 'same' | 'different' | 'unknown'][] = [
  ['Mike Smith', 'Michael Smith', 'same'],                     // a nickname
  ['Bob Smith', 'Robert Smith', 'same'],
  ['Bill Smith', 'William Smith', 'same'],
  ['Peggy Smith', 'Margaret Smith', 'same'],
  ['Bob Smith', 'Rob Smith', 'same'],                          // two nicknames of one given name
  ['Chris Evans', 'Christopher Evans', 'same'],                // a nickname that can stand for two given names matches either
  ['Chris Evans', 'Christina Evans', 'same'],
  ['Pat Jones', 'Patricia Jones', 'same'],
  ['S. Agent', 'Sender Agent', 'same'],                        // an initial
  ['J. Michael Smith', 'Michael Smith', 'same'],               // a middle name
  ['José García', 'Jose Garcia', 'same'],                      // accents
  ['Zoë Müller', 'Zoe Muller', 'same'],
  ["Sean O'Brien", 'Sean OBrien', 'same'],                     // punctuation
  ['Michael Smith Jr.', 'Michael Smith', 'same'],              // suffixes and titles
  ['Michael Smith, Esq.', 'Michael Smith', 'same'],
  ['Dr. Michael Smith', 'Michael Smith', 'same'],
  ['王伟', '王伟', 'same'],                                     // names with no ASCII letters are names
  ['Дмитрий Иванов', 'Дмитрий Иванов', 'same'],
  ['Sender Agent', 'Sender Agent', 'same'],
  ['Cher', 'Cher', 'same'],
  ['Mike Smith', 'Mike Jones', 'different'],                   // another family name
  ['Dara Smith', 'Paeder Smith', 'different'],                 // the same family name, another first name
  ['Michael Smith', 'Mark Smith', 'different'],                // the same family name and first initial are not the same person
  ['David Cohen', 'Daniel Cohen', 'different'],
  ['Maria Cohen', 'Michael Cohen', 'different'],
  ['Christopher Evans', 'Christina Evans', 'different'],       // two given names that share a nickname are two people
  ['Patrick Jones', 'Patricia Jones', 'different'],
  ['Bob Smith', 'William Smith', 'different'],
  ['王伟', '李娜', 'different'],
  ['김민수', '이영희', 'different'],
  ['Дмитрий Иванов', 'Анна Петрова', 'different'],
  ['Álvaro Pérez', 'Lucía Pérez', 'different'],                // an accented first letter is a letter
  ['Pat', 'Sender Agent', 'different'],                        // a one-word name that is nowhere in the other name
  ['Smith', 'Michael Jones', 'different'],
  ['Cher', 'Madonna', 'different'],
  ['<img src=x onerror="window.__pwned=1">', 'Sender Agent', 'different'],
  ['Smith', 'Michael Smith', 'unknown'],                       // a one-word name agrees with a longer one but proves nothing
  ['Michael', 'Michael Jones', 'unknown'],
  ['Michael', 'Mike Jones', 'unknown'],
  ['', 'Michael Smith', 'unknown'],                            // nothing to compare
  ['Jr.', 'Michael Smith', 'unknown'],
  ['--', 'Michael Smith', 'unknown'],
];

describe('agent-defaults: comparing the name a listing carries with the name Cotality has', () => {
  it.each(NAMES)('%j vs %j: %s', (a, b, expected) => {
    expect(compareNames(a, b)).toBe(expected);
  });

  it('gives the same answer whichever name comes first', () => {
    for (const [a, b] of NAMES) expect([a, b, compareNames(b, a)]).toEqual([a, b, compareNames(a, b)]);
  });
});

// another agent's listing, with nothing of the broker's in it
const ANOTHERS_LISTING = { ...SAVED, agent_id: '77', list_agent_mls_id: null, list_office_mls_id: null, agent_info: {}, raw_data: {} };

describe.each(FORMS)('%s: a page opened to edit never shows the signed-in user as the agent, whichever arrives first', (form, prefix, collector) => {
  const BROKER = ['Sender Agent', '39361', 'sender@example.test', '212-555-0199', 'L-123', 'Mallan Real Estate Inc.'];
  // everything the page shows, or keeps, about the listing agent
  const shown = (f: BootedForm) => [
    ...[...f.d.querySelectorAll(`#${prefix}AgentContactsTable td`)].map((c) => c.textContent),
    txt(f.d, `${prefix}ListingAgentId`), txt(f.d, `${prefix}ListingAgentPhone`), txt(f.d, `${prefix}ListingAgentEmail`), txt(f.d, `${prefix}ListingAgentLicense`),
    val(f.d, `${prefix}ListingAgentSearch`), val(f.d, `${prefix}ListingCompanySearch`), val(f.d, `${prefix}UpdatingAgentDisplay`),
    val(f.d, `${prefix}UpdatingAgentName`), val(f.d, `${prefix}UpdatingAgentMlsId`), val(f.d, `${prefix}UpdatingAgentEmail`),
    JSON.stringify((f.w as any).rebnyListingAgents), JSON.stringify((f.w as any).rebnyAgents),
  ].join(' | ');
  const noBroker = (f: BootedForm) => { const all = shown(f); for (const mine of BROKER) expect(all).not.toContain(mine); };
  const onlyThePlaceholder = (f: BootedForm) => expect(tableRows(f, prefix).map((r) => r.id)).toEqual([`${prefix}AgentContactsPlaceholder`]);

  it('the session is ready before the page looks at ?id= and the listing is slow: nothing of the broker is shown, kept or listed while it loads', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: ANOTHERS_LISTING, readySync: true, getDelay: 1500, settle: 600 });
    try {
      noBroker(f);
      onlyThePlaceholder(f);
      expect((f.w as any).rebnyListingAgents.mallan).toEqual([]);
      await sleep(1300);
      await checked(f.d, prefix);
      noBroker(f);                                                                  // and nothing of the broker once it has loaded
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('Saved Agent');
      expect((f.w as any).rebnyListingAgents.mallan.map((a: any) => a.name)).toEqual(['Saved Agent']);
      expect((f.w as any).rebnyAgents.mallan).toEqual([]);
    } finally { f.close(); }
  });

  it('the listing names nobody: the broker is not put in its place', async () => {
    const nameless = { ...ANOTHERS_LISTING, list_agent_full_name: null, list_agent_email: null, list_agent_direct_phone: null, list_office_name: null };
    const f = await bootAddForm(form, { search: '?id=1', listing: nameless, readySync: true, settle: 1500 });
    try {
      await checked(f.d, prefix);
      noBroker(f);
      onlyThePlaceholder(f);
      expect((f.w as any).rebnyListingAgents.mallan).toEqual([]);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: '', ListAgentMlsId: '' });
    } finally { f.close(); }
  });

  it('the listing never loads: the broker is not shown, listed, or copied into the showing instructions', async () => {
    const f = await bootAddForm(form, { search: '?id=1', readySync: true, getError: 'down', settle: 1200 });
    try {
      noBroker(f);
      onlyThePlaceholder(f);
      expect((f.w as any).rebnyListingAgents.mallan).toEqual([]);
      if (prefix === 'sale') {
        f.w.useSaleExclusiveAgentContact();                                           // copies the agent panel's text into the showing instructions
        expect(val(f.d, 'saleShowingInstructions')).toBe('');
      }
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: what Cotality says about the MLS ID decides the keys a listing carries', (form, prefix, collector) => {
  // the keys an older version put on every listing: the signed-in broker's
  const BROKERS_KEYS = { ListAgentKey: '4455667', ListOfficeKey: '5671398', ListOfficeMlsId: '7041' };
  const WITH_BROKERS_KEYS = { ...SAVED, list_office_mls_id: null, agent_info: {}, raw_data: { ...BROKERS_KEYS } };

  it('replaces the keys a listing was saved with when the member Cotality returns is the listing\'s agent', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: WITH_BROKERS_KEYS, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111', ListAgentKey: '777', ListOfficeKey: '888', ListOfficeMlsId: '2222' });
      expect(f.d.getElementById(`${prefix}AgentCotalityStatus`)?.className).toMatch(/green/);
    } finally { f.close(); }
  });

  it('keeps the keys a listing was saved with when the directory returns none for its agent', async () => {
    const none = { ...SAVED_MEMBER, key: '', officeKey: '', officeMlsId: '' };
    const f = await bootAddForm(form, { search: '?id=1', listing: WITH_BROKERS_KEYS, members: { '11111': none }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject(BROKERS_KEYS);
    } finally { f.close(); }
  });

  it('removes the agent key a listing was saved with when Cotality says the MLS ID is somebody else\'s, keeps the office, and says so', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: WITH_BROKERS_KEYS, members: { '11111': { ...SAVED_MEMBER, fullName: 'Someone Else' } }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p.ListAgentKey).toBe('');                                     // an explicit blank: a save merges, so leaving the key out would keep the stored one
      expect(val(f.d, `${prefix}UpdatingAgentKey`)).toBe('');              // and the page holds no agent key any more
      expect(p).toMatchObject({ ListAgentMlsId: '11111', ListOfficeKey: '5671398', ListOfficeMlsId: '7041' });
      expect(cotalityStatus(f.d, prefix)).toBe('MLS ID 11111 belongs to Someone Else in Cotality, not to Saved Agent, so no Cotality key was attached and the agent key saved with this listing was removed.');
      expect(f.d.getElementById(`${prefix}AgentCotalityStatus`)?.className).toMatch(/amber/);
    } finally { f.close(); }
  });

  it.each([
    ['is the agent', SAVED_MEMBER, { ListAgentKey: '777', ListOfficeKey: '888', ListOfficeMlsId: '2222' }, /^Cotality agent: Saved Agent/],
    ['is somebody else', { ...SAVED_MEMBER, fullName: 'Someone Else' }, { ListAgentKey: '' }, /so no Cotality key was attached and the agent key saved with this listing was removed\.$/],
  ])('what Cotality said (the member %s) still holds when the page rewrites the identity from what it knows', async (_name, member, expected, status) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: WITH_BROKERS_KEYS, members: { '11111': member }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      void f.w.MallanAgentDefaults.apply(prefix, SESSION_USER, {});          // the session user arrives again: the inputs are rewritten from what is known
      expect(payloadOf(f, collector)).toMatchObject(expected);               // before the new answer has come back
      await checked(f.d, prefix);                                            // (and the page is still open when it does)
      expect(payloadOf(f, collector)).toMatchObject(expected);               // and after: the answer that finds the key already blanked still blanks it in the save
      expect(cotalityStatus(f.d, prefix)).toMatch(status);
    } finally { f.close(); }
  });

  it('what Cotality said about one agent is not applied to another: a new MLS ID, or a new name, starts again', async () => {
    const f = await bootAddForm(form);                                       // the signed-in agent: Cotality says member 39361 is Sender Agent, and gives keys
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '4455667' });
      // the same name behind another MLS ID
      void f.w.MallanAgentDefaults.hydrate(prefix, { id: '1', agent_id: 'AG-9', list_agent_full_name: 'Sender Agent', list_agent_mls_id: '55555', agent_info: {}, raw_data: {} }, {});
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '55555' });
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');
      await checked(f.d, prefix);
      // another name behind the same MLS ID
      void f.w.MallanAgentDefaults.hydrate(prefix, { id: '1', agent_id: '77', list_agent_full_name: 'Pat Jones', list_agent_mls_id: '39361', agent_info: {}, raw_data: {} }, {});
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: 'Pat Jones', ListAgentMlsId: '39361' });
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');
      await checked(f.d, prefix);
    } finally { f.close(); }
  });

  it('a name too short to tell attaches no key and removes none, and says so', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...WITH_BROKERS_KEYS, list_agent_full_name: 'Saved' }, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject(BROKERS_KEYS);
      expect(cotalityStatus(f.d, prefix)).toBe('Cotality lists MLS ID 11111 under Saved Agent, but the name here (Saved) is too short to confirm it is the same person, so no Cotality key was attached.');
    } finally { f.close(); }
  });

  it('an MLS ID Cotality has no member for says only what is true, and keeps what the listing was saved with', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: WITH_BROKERS_KEYS, members: { '11111': null }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('No Cotality member was found for MLS ID 11111, so no Cotality agent key was confirmed for this listing.');
      expect(payloadOf(f, collector)).toMatchObject(BROKERS_KEYS);
    } finally { f.close(); }
  });

  it.each([
    ['Cotality says the signed-in agent\'s MLS ID is somebody else\'s', { members: { '39361': { ...SESSION_MEMBER, fullName: 'Someone Else' } } },
      'MLS ID 39361 belongs to Someone Else in Cotality, not to Sender Agent, so no Cotality key was attached. Ask a broker to correct your agent profile.'],
    ['the signed-in agent\'s profile name is one word', { user: { ...SESSION_USER, name: 'Sender' } },
      'Cotality lists MLS ID 39361 under Sender Agent, but the name here (Sender) is too short to confirm it is the same person, so no Cotality key was attached. Ask a broker to complete your agent profile.'],
  ])('a new listing: %s, and the agent is told who can fix it', async (_name, opts, message) => {
    const f = await bootAddForm(form, opts);
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe(message);
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');       // nothing was saved with a new listing: nothing to blank
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: the Commission Request tab names the listing agent', (form, prefix) => {
  const fill = (f: BootedForm) => f.w[prefix === 'sale' ? 'populateSaleCommissionFields' : 'populateRentalCommissionFields']();
  const field = prefix === 'sale' ? 'commSaleListingAgent' : 'commRentalListingAgent';

  it('a new listing names the signed-in agent', async () => {
    const f = await bootAddForm(form);
    try {
      await checked(f.d, prefix);
      fill(f);
      expect(val(f.d, field)).toBe('Sender Agent');
    } finally { f.close(); }
  });

  it('another agent\'s listing names that agent, not the broker who opened it', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: ANOTHERS_LISTING, settle: 1500 });
    try {
      await checked(f.d, prefix);
      fill(f);
      expect(val(f.d, field)).toBe('Saved Agent');
    } finally { f.close(); }
  });

  it('a listing that names nobody shows a dash, not the broker', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...ANOTHERS_LISTING, list_agent_full_name: null }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      fill(f);
      expect(val(f.d, field)).toBe('–');
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: the listing agent has a list of their own', (form, prefix) => {
  const click = (f: BootedForm, selector: string) => (f.d.querySelector(selector) as HTMLElement).dispatchEvent(new f.w.MouseEvent('click', { bubbles: true }));
  const OTHER = prefix === 'sale'
    ? { company: 'saleBuyerCompanySearch', companyList: 'buyerCompanyList', agent: 'saleBuyerAgentSearch', agentList: 'buyerAgentList' }
    : { company: 'rentalTenantCompanySearch', companyList: 'tenantCompanyList', agent: 'rentalTenantAgentSearch', agentList: 'tenantAgentList' };

  it('is not offered as the other side\'s agent (the buyer\'s on a sale, the tenant\'s on a rental)', async () => {
    const f = await bootAddForm(form);
    try {
      await checked(f.d, prefix);
      f.d.getElementById(OTHER.company)!.dispatchEvent(new f.w.Event('focus'));
      click(f, `#${OTHER.companyList} .dd-item[data-key="mallan"]`);
      f.d.getElementById(OTHER.agent)!.dispatchEvent(new f.w.Event('focus'));
      expect([...f.d.querySelectorAll(`#${OTHER.agentList} .dd-item`)]).toEqual([]);
      expect((f.w as any).rebnyListingAgents.mallan.map((a: any) => a.name)).toEqual(['Sender Agent']);
    } finally { f.close(); }
  });

  it('picking a listing agent who has no Cotality MLS ID again shows "--", never the internal agent id', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: ANOTHERS_LISTING, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const search = f.d.getElementById(`${prefix}ListingAgentSearch`) as HTMLInputElement;
      search.value = '';
      search.dispatchEvent(new f.w.Event('focus'));
      click(f, '#listingAgentList .dd-item');
      expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('--');
      expect([...tableRows(f, prefix)[0].children].slice(1, 3).map((c) => c.textContent)).toEqual(['--', 'Saved Agent']);
    } finally { f.close(); }
  });
});

describe('Rental: a stored listing that could not be put back into the form is not "loaded"', () => {
  it('refuses to save over it, and says the listing did not load, when listing-hydration.js did not run', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', listing: { ...SAVED, price: 3500 }, modules: PAGE_MODULES.filter((m) => m !== 'listing-hydration'), settle: 900 });
    try {
      expect(toasts(f).some((t) => /Failed to load listing/.test(t))).toBe(true);
      for (const saver of ['saveRentalDraft', 'submitRentalListing']) {
        const before = toasts(f).filter((t) => /This listing did not load/.test(t)).length;
        await f.w[saver]();
        await sleep(150);
        expect(toasts(f).filter((t) => /This listing did not load/.test(t)).length).toBe(before + 1);
      }
      expect(f.saved).toEqual([]);                                          // nothing was written: a blank form would have replaced the stored listing
    } finally { f.close(); }
  });
});

describe('Sale: the Draft Saved panel never runs what the page was opened with', () => {
  it('a crafted ?id= is shown and copied as text', async () => {
    const hostile = `1')-(window.__pwned=1)-('`;
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: `?id=${hostile}`, listing: SAVED, settle: 1500 });
    try {
      Object.defineProperty(f.w.navigator, 'clipboard', { value: { writeText: () => undefined }, configurable: true });
      await f.w.manualSaveDraft();
      await sleep(150);
      const panel = f.d.getElementById('saleDraftRecovery') as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.querySelectorAll('[onclick]')).toHaveLength(0);
      const link = panel.querySelector('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(`/crm/SALE-FORM-REDESIGN.html?id=${encodeURIComponent(hostile)}`);
      expect(link.textContent).toBe(link.getAttribute('href'));
      const copy = [...panel.querySelectorAll('button')].find((b) => /Copy Link/.test(b.textContent ?? '')) as HTMLButtonElement;
      copy.click();
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: a copy of the agent module cached from before beginEdit existed', (form, prefix, collector) => {
  const savers: Record<string, string> = { 'SALE-FORM-REDESIGN': 'manualSaveDraft', 'RENTAL-FORM-REDESIGN': 'saveRentalDraft' };

  it('does not stop the listing from loading', async () => {
    expect(AGENT_MODULE).toContain('beginEdit: beginEdit, ');
    const stale = (source: string) => source.replace('beginEdit: beginEdit, ', '');
    const f = await bootAddForm(form, { search: '?id=1', listing: SAVED, moduleSources: { 'agent-defaults': stale }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('Saved Agent');
      await f.w[savers[form]]();
      await sleep(150);
      expect(f.saved).toHaveLength(1);                                        // the listing loaded, so the save is the listing and not a refusal
      expect(f.saved[0]).toMatchObject({ ListAgentFullName: 'Saved Agent', ListAgentMlsId: '11111' });
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111' });
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: a page that tells the agent module a saved listing is on its way', (form, prefix, collector) => {
  it('cancels a Cotality check that was on its way for the agent it wiped', async () => {
    const f = await bootAddForm(form, { memberDelays: { '39361': 500 }, settle: 300 });
    try {
      f.w.MallanAgentDefaults.beginEdit(prefix);
      await sleep(500);                                                      // the answer for the wiped agent arrives now
      expect(cotalityStatus(f.d, prefix)).toBe('');
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');
    } finally { f.close(); }
  });

  it('wipes what an earlier apply showed (the agent, the panel text, the status), and the signed-in user arriving again shows nobody', async () => {
    const f = await bootAddForm(form);                                       // a new listing: the signed-in agent is shown
    try {
      await checked(f.d, prefix);
      expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('39361');
      f.w.MallanAgentDefaults.beginEdit(prefix);
      for (const id of ['UpdatingAgentDisplay', 'UpdatingAgentName', 'UpdatingAgentMlsId', 'UpdatingAgentEmail', 'ListingAgent', 'ListingAgentSearch']) expect(val(f.d, `${prefix}${id}`)).toBe('');
      expect(cotalityStatus(f.d, prefix)).toBe('');
      expect((f.d.getElementById(`${prefix}ListingAgentInfo`) as HTMLElement).style.display).toBe('none');
      for (const part of ['Id', 'Phone', 'Email', 'License']) expect(txt(f.d, `${prefix}ListingAgent${part}`)).toBe('--');
      await f.w.MallanAgentDefaults.apply(prefix, SESSION_USER, {});
      expect(val(f.d, `${prefix}UpdatingAgentName`)).toBe('');
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: an anonymous session', (form, prefix, collector) => {
  it('says the profile could not be loaded, shows nobody, and submits no agent', async () => {
    const f = await bootAddForm(form, { user: null });
    try {
      expect(cotalityStatus(f.d, prefix)).toBe('Could not load your agent profile. Check the Listing Agent before saving.');
      expect(toasts(f).some((t) => /Could not load agent profile/.test(t))).toBe(true);
      expect(tableRows(f, prefix).map((r) => r.id)).toEqual([`${prefix}AgentContactsPlaceholder`]);
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('');
      expect(p.ListAgentFullName).toBe('');
    } finally { f.close(); }
  });
});

// ── The agent dropdown can pick the listing agent again, and picking the company again does not drop the agent ────────────────────────────────────────────
describe.each(FORMS)('%s: the Contacts tab stays usable', (form, prefix) => {
  const pick = (f: BootedForm, listId: string, selector: string) => {
    const item = f.d.querySelector(`#${listId} ${selector}`) as HTMLElement | null;
    expect(item).not.toBeNull();
    item!.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true }));
  };

  it('lists the listing agent in the agent dropdown, and picking them again shows their Cotality MLS ID', async () => {
    const f = await bootAddForm(form);
    try {
      await checked(f.d, prefix);
      await f.w.MallanAgentDefaults.apply(prefix, SESSION_USER, {});          // the user arriving again must not list the agent twice
      (f.d.getElementById(`${prefix}ListingAgentSearch`) as HTMLInputElement).value = '';
      f.d.getElementById(`${prefix}ListingAgentSearch`)!.dispatchEvent(new f.w.Event('focus'));
      expect([...f.d.querySelectorAll('#listingAgentList .dd-item')].map((i) => i.textContent)).toEqual(['Sender Agent  (Lic #L-123)']);
      pick(f, 'listingAgentList', '.dd-item');
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('AG-9');
      expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('39361');          // the Cotality MLS ID, as when the form opened
      expect(tableRows(f, prefix)).toHaveLength(1);
      expect([...tableRows(f, prefix)[0].children].slice(1, 3).map((c) => c.textContent)).toEqual(['39361', 'Sender Agent']);
    } finally { f.close(); }
  });

  it('the agent box is usable whenever an agent is shown in it', async () => {
    const f = await bootAddForm(form);
    try {
      await checked(f.d, prefix);
      const search = f.d.getElementById(`${prefix}ListingAgentSearch`) as HTMLInputElement;
      search.disabled = true;                                              // the page starts it disabled until a company is picked
      await f.w.MallanAgentDefaults.apply(prefix, SESSION_USER, {});
      expect(search.disabled).toBe(false);
    } finally { f.close(); }
  });

  it('picking the same company again keeps the agent', async () => {
    const f = await bootAddForm(form);
    try {
      await checked(f.d, prefix);
      f.d.getElementById(`${prefix}ListingCompanySearch`)!.dispatchEvent(new f.w.Event('focus'));
      pick(f, 'listingCompanyList', '.dd-item[data-key="mallan"]');
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('AG-9');
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('Sender Agent');
      expect((f.d.getElementById(`${prefix}ListingAgentInfo`) as HTMLElement).style.display).toBe('block');
    } finally { f.close(); }
  });

  it('renders text that matches no company as text, not markup (the company name in the search box can come from the agent profile)', async () => {
    const hostile = '<img src=x onerror="window.__pwned=1">';
    const f = await bootAddForm(form, { user: { ...SESSION_USER, companyName: hostile } });
    try {
      await checked(f.d, prefix);
      expect(val(f.d, `${prefix}ListingCompanySearch`)).toBe(hostile);
      f.d.getElementById(`${prefix}ListingCompanySearch`)!.dispatchEvent(new f.w.Event('focus'));
      const list = f.d.getElementById('listingCompanyList') as HTMLElement;
      expect(list.querySelector('img')).toBeNull();
      expect(list.querySelector('.dd-empty')?.textContent).toBe(`No companies match "${hostile}"`);
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });
});

// ── A listing that did not load must not be saved over: the form holds nothing of it ────────────────────────────────────────────────────────────────────
// Opened with ?id=, the form is blank until the saved listing has been restored into it. Every save writes the WHOLE form, so a save before that (or after the
// listing failed to load) would replace the saved listing with a blank form.
const SAVERS: [AddForm, string[]][] = [
  ['SALE-FORM-REDESIGN', ['manualSaveDraft', 'submitSalesListing']],
  ['RENTAL-FORM-REDESIGN', ['saveRentalDraft', 'submitRentalListing']],
];
const TOAST = '.toast-notification, body > div[style*="99999"]';          // the Rental page's toast has a class, the Sale page's is styled inline
const toasts = (f: BootedForm) => [...f.d.querySelectorAll(TOAST)].map((t) => t.textContent ?? '');
const DID_NOT_LOAD = /did not load/;
const STILL_LOADING = /still loading/;

describe.each(SAVERS)('%s: saving is refused while the listing named by ?id= has not loaded', (form, savers) => {
  // Every entry point must say why it did nothing: an empty form fails validation on its own, so "wrote nothing" would prove nothing about the guard.
  const refusedBy = async (f: BootedForm, name: string, why: RegExp) => {
    const other = why === STILL_LOADING ? DID_NOT_LOAD : STILL_LOADING;
    const count = (re: RegExp) => toasts(f).filter((t) => re.test(t)).length;
    const [before, beforeOther, written] = [count(why), count(other), f.saved.length];
    await f.w[name]();
    await sleep(150);
    expect(count(why)).toBe(before + 1);                  // it said the right thing, once
    expect(count(other)).toBe(beforeOther);
    expect(f.saved.length).toBe(written);
  };

  it('writes nothing, and says why, when the listing could not be loaded', async () => {
    const f = await bootAddForm(form, { search: '?id=1', getError: 'network down', settle: 800 });
    try {
      for (const name of savers) await refusedBy(f, name, DID_NOT_LOAD);
      expect(f.w.localStorage.getItem('rentalListingDraft')).toBeNull();
      expect(f.w.localStorage.getItem('mallan_draft_sale')).toBeNull();
    } finally { f.close(); }
  });

  it('writes nothing, and says why, when there is no API to load the listing from', async () => {
    const f = await bootAddForm(form, { search: '?id=1', noListingsApi: true, settle: 800 });
    try {
      for (const name of savers) await refusedBy(f, name, DID_NOT_LOAD);
    } finally { f.close(); }
  });

  it('writes nothing, and says why, while the listing is still loading; then saves once it has loaded', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: SAVED, getDelay: 2000, settle: 600 });
    try {
      for (const name of savers) await refusedBy(f, name, STILL_LOADING);
      await sleep(1800);
      await f.w[savers[0]]();
      await sleep(150);
      expect(f.saved.length).toBe(1);
      expect(f.saved[0]).toMatchObject({ ListAgentMlsId: '11111', ListAgentFullName: 'Saved Agent' });   // and what it saved is the listing, not a blank form
    } finally { f.close(); }
  });

  it('saves a new listing, which has nothing to load', async () => {
    const f = await bootAddForm(form, { settle: 800 });
    try {
      await f.w[savers[0]]();
      await sleep(150);
      // a new Sale listing is created through the API; a new Rental listing is kept as a browser draft until it is submitted
      expect(f.saved.length + (f.w.localStorage.getItem('rentalListingDraft') ? 1 : 0)).toBe(1);
    } finally { f.close(); }
  });
});

describe('Rental: a toast shows its message as text, not markup (a listing id comes from the URL and the server)', () => {
  it('a load error that carries markup', async () => {
    const hostile = '<img src=x onerror="window.__pwned=1">';
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { search: '?id=1', getError: hostile, settle: 900 });
    try {
      const failed = [...f.d.querySelectorAll('.toast-notification')].find((t) => /Failed to load listing/.test(t.textContent ?? ''));
      expect(failed).toBeDefined();
      expect(failed!.querySelector('img')).toBeNull();
      expect(failed!.textContent).toContain(hostile);
      expect((f.w as any).__pwned).toBeUndefined();
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: the agent module is missing', (form, prefix) => {
  it('says what that means: the identity will not be submitted', async () => {
    const f = await bootAddForm(form, { modules: ['directory-picker', 'colist-section'] });
    try {
      const shown = toasts(f);
      expect(shown.some((t) => /agent module did not load/.test(t) && /Cotality agent identity/.test(t))).toBe(true);
      expect(shown.some((t) => /Could not load agent profile/.test(t))).toBe(false);   // the profile loaded; the script did not
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('');
    } finally { f.close(); }
  });
});

// ── Phase C: agent_info is frozen, so the typed columns are the record; a saved agent is read typed-first, then agent_info, then raw_data ─────────────────
describe.each(FORMS)('%s: a saved agent is read typed-first', (form, prefix, collector) => {
  const hydrated = async (listing: Record<string, unknown>) => {
    const f = await bootAddForm(form, { search: '?id=1', listing, members: {}, settle: 1500 });
    try {
      await checked(f.d, prefix);
      await sleep(200);
      return payloadOf(f, collector);
    } finally { f.close(); }
  };

  it('prefers the typed column over agent_info and raw_data for every identity field', async () => {
    const p = await hydrated({
      ...SAVED,
      list_agent_full_name: 'Typed Name', list_agent_mls_id: '10101', list_agent_email: 'typed@example.test', list_agent_direct_phone: '212-555-0101',
      list_office_name: 'Typed Office', list_office_mls_id: '2020',
      agent_info: { ListAgentFullName: 'Info Name', ListAgentMlsId: '20202', ListAgentEmail: 'info@example.test', ListAgentDirectPhone: '212-555-0202', ListOfficeName: 'Info Office', ListOfficeMlsId: '3030' },
      raw_data: { ListAgentFullName: 'Raw Name', ListAgentMlsId: '30303', ListAgentEmail: 'raw@example.test', ListAgentDirectPhone: '212-555-0303', ListOfficeName: 'Raw Office', ListOfficeMlsId: '4040' },
    });
    expect(p).toMatchObject({
      ListAgentFullName: 'Typed Name', ListAgentMlsId: '10101', ListAgentEmail: 'typed@example.test', ListAgentDirectPhone: '212-555-0101',
      ListOfficeName: 'Typed Office', ListOfficeMlsId: '2020',
    });
  });

  it('falls back to agent_info, then raw_data, when the typed column is empty', async () => {
    const empty = { list_agent_full_name: null, list_agent_mls_id: null, list_agent_email: null, list_agent_direct_phone: null, list_office_name: null, list_office_mls_id: null };
    const fromInfo = await hydrated({
      ...SAVED, ...empty,
      agent_info: { ListAgentFullName: 'Info Name', ListAgentMlsId: '20202', ListAgentEmail: 'info@example.test', ListAgentDirectPhone: '212-555-0202', ListOfficeName: 'Info Office', ListOfficeMlsId: '3030' },
      raw_data: { ListAgentFullName: 'Raw Name', ListAgentMlsId: '30303' },
    });
    expect(fromInfo).toMatchObject({ ListAgentFullName: 'Info Name', ListAgentMlsId: '20202', ListOfficeName: 'Info Office', ListOfficeMlsId: '3030' });
    const fromRaw = await hydrated({ ...SAVED, ...empty, agent_info: {}, raw_data: { ListAgentFullName: 'Raw Name', ListAgentMlsId: '30303', ListOfficeName: 'Raw Office', ListOfficeMlsId: '4040' } });
    expect(fromRaw).toMatchObject({ ListAgentFullName: 'Raw Name', ListAgentMlsId: '30303', ListOfficeName: 'Raw Office', ListOfficeMlsId: '4040' });
  });

  it('an object in a typed column is not a value, and does not hide the one behind it', async () => {
    const p = await hydrated({ ...SAVED, list_agent_full_name: { oops: true }, agent_info: { ListAgentFullName: 'Info Name' } });
    expect(p.ListAgentFullName).toBe('Info Name');
  });

  it('a listing that carries only typed columns is recognised as having a saved agent (the session does not replace it)', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED, agent_info: {}, raw_data: {} }, members: {}, settle: 1500, readyDelay: 500 });
    try {
      await checked(f.d, prefix);
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('Saved Agent');
      expect(txt(f.d, `${prefix}ListingAgentId`)).toBe('11111');
    } finally { f.close(); }
  });
});

// keep the unused import honest if a future edit drops the last use
void until;
