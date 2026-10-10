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
    ['Michael J. Kim', 'Jennifer Kim', false],    // a middle initial is not the other person's first name
    ['Maria de la Cruz', 'Carlos de la Cruz', false],   // particles are not given names
    ['Jean-Marc Dupont', 'Jean-Luc Dupont', false],     // a hyphenated given name is one name
    ['Mary Ann Smith', 'Mary Beth Smith', false],       // given names are compared in order
    ['Alex Johnson', 'Alexander Johnson', true],        // the nicknames people really use
    ['Maria Garcia Lopez', 'Maria Garcia', true],       // a second family name
    ['Michael Smith, CPA', 'Michael Smith', true],      // a credential
    ['Hans Müller', 'Hans Mueller', true],              // a German umlaut written either way
    ['Smith, John', 'John Smith', true],                // the family name first
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

  it('Cotality\'s agent key replaces the one a listing was saved with when the member Cotality returns IS the listing\'s agent, and the listing\'s own office stays (live Cotality is the only authority on the agent)', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: SAVED, settle: 1200,
      // the agent has moved since: the member's office is not the office the listing was saved with. The office is the listing's own: its name stays, so do its ids.
      members: { '11111': { ...SAVED_MEMBER, key: '999', officeKey: '998', officeMlsId: '997', officeName: 'New Brokerage LLC' } },
    });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '999', ListOfficeKey: '888', ListOfficeMlsId: '2222', ListOfficeName: 'Saved Office Inc.' });
    } finally { f.close(); }
  });

  it('a member with no office MLS ID is not the office the listing was saved with: the saved office key stays', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...SAVED, list_office_mls_id: null, raw_data: {}, agent_info: { ListAgentKey: '777', ListOfficeKey: '888' } }, settle: 1200,
      members: { '11111': { ...SAVED_MEMBER, key: '999', officeKey: '998', officeMlsId: '' } },
    });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p).toMatchObject({ ListAgentKey: '999', ListOfficeKey: '888' });
      expect(p).not.toHaveProperty('ListOfficeMlsId');
    } finally { f.close(); }
  });

  it.each([
    ['no office at all', { list_office_mls_id: null, agent_info: { ListAgentKey: '777' } }, { ListOfficeKey: '998', ListOfficeMlsId: '997' }],                  // the member's office fills it
    ['the member\'s office MLS ID', { list_office_mls_id: '997', agent_info: { ListAgentKey: '777' } }, { ListOfficeKey: '998', ListOfficeMlsId: '997' }],      // the same office: the key it lacks
    ['the member\'s office key', { list_office_mls_id: null, agent_info: { ListAgentKey: '777', ListOfficeKey: '998' } }, { ListOfficeKey: '998', ListOfficeMlsId: '997' }],   // and the MLS ID it lacks
    ['another office\'s key', { list_office_mls_id: null, agent_info: { ListAgentKey: '777', ListOfficeKey: '888' } }, { ListOfficeKey: '888' }],                // another office: left alone
  ])('the member\'s office goes into a saved listing only when it has none, or has that office: a listing with %s', async (_name, saved, expected) => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...SAVED, raw_data: {}, ...saved }, settle: 1200,
      members: { '11111': { ...SAVED_MEMBER, key: '999', officeKey: '998', officeMlsId: '997', officeName: 'New Brokerage LLC' } },
    });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p).toMatchObject({ ListAgentKey: '999', ...expected });
      if (!('ListOfficeMlsId' in expected)) expect(p).not.toHaveProperty('ListOfficeMlsId');          // nothing made up for an office that is not the member's
    } finally { f.close(); }
  });

  it('an MLS ID that is not a Cotality MLS ID (1 to 12 digits) is not looked up and is said so', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED, list_agent_mls_id: 'AB-12', agent_info: {}, raw_data: {} }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('MLS ID "AB-12" is not a Cotality MLS ID (1 to 12 digits), so it was not checked.');
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

  // the broker whose listing it is borrows from their profile only when the listing names them: a name that is not clearly theirs is somebody else's listing
  it.each([
    ['Jennifer Kim', { ...SESSION_USER, name: 'Michael J. Kim' }],            // a middle initial that starts the other agent's first name
    ['Sam Agent', SESSION_USER],                                               // the same family name, and another first name
    ['Maria de la Cruz', { ...SESSION_USER, name: 'Carlos de la Cruz' }],      // particles are not given names
    ['Jean-Luc Dupont', { ...SESSION_USER, name: 'Jean-Marc Dupont' }],        // a hyphenated given name is one name
  ])('a listing the broker owns that names %s (not them) borrows nothing of theirs', async (named, user) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...OWN, list_agent_full_name: named }, user, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p).toMatchObject({ ListAgentFullName: named, ListAgentMlsId: '', ListAgentEmail: '', ListAgentDirectPhone: '', ListOfficeName: '' });
      expect(p).not.toHaveProperty('ListAgentKey');
      expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('--');
      expect(JSON.stringify((f.w as any).rebnyListingAgents)).not.toContain('AG-9');          // the broker's id is not the named agent's
    } finally { f.close(); }
  });

  it('a saved name that is a nickname of the owner is the owner: the profile fills what the listing lacks', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...OWN, list_agent_full_name: 'Mike Smith' }, user: { ...SESSION_USER, name: 'Michael Smith' }, settle: 1500,
      members: { '39361': { ...SESSION_MEMBER, fullName: 'Michael Smith' } },
    });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: 'Mike Smith', ListAgentMlsId: '39361', ListAgentKey: '4455667', ListAgentEmail: 'sender@example.test' });
    } finally { f.close(); }
  });

  // agent_id is the listing's OWNER; the agent shown and submitted is the one the listing NAMES
  it('the agent picker holds the owner\'s id only when the listing\'s agent is the owner', async () => {
    const own = await bootAddForm(form, { search: '?id=1', listing: OWN, settle: 1500 });
    const other = await bootAddForm(form, { search: '?id=1', listing: { ...OWN, list_agent_full_name: 'Saved Agent', list_agent_mls_id: '11111' }, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(own.d, prefix);
      await checked(other.d, prefix);
      expect(val(own.d, `${prefix}ListingAgent`)).toBe('AG-9');
      expect(val(own.d, `${prefix}UpdatingAgent`)).toBe('AG-9');
      expect(val(other.d, `${prefix}ListingAgent`)).toBe('11111');                          // the named agent's own value (their MLS ID), never the broker's id
      expect(val(other.d, `${prefix}UpdatingAgent`)).toBe('');
      expect(JSON.stringify((other.w as any).rebnyListingAgents)).not.toContain('AG-9');
      expect((other.w as any).rebnyListingAgents.mallan.map((a: any) => [a.id, a.name])).toEqual([['11111', 'Saved Agent']]);
    } finally { own.close(); other.close(); }
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

// What a name decides here is whose Cotality key a listing carries. A wrong 'same' attaches somebody else's key, a wrong 'different' removes the right one: every doubt is 'unknown',
// which attaches nothing and removes nothing. 'different' is only a family name that nothing in the other name matches.
const NAMES: [string, string, 'same' | 'different' | 'unknown'][] = [
  // ── the same person ──
  ['Mike Smith', 'Michael Smith', 'same'],                     // a nickname
  ['Bob Smith', 'Robert Smith', 'same'],
  ['Bill Smith', 'William Smith', 'same'],
  ['Peggy Smith', 'Margaret Smith', 'same'],
  ['Bob Smith', 'Rob Smith', 'same'],                          // two nicknames of one given name
  ['Chris Evans', 'Christopher Evans', 'same'],                // a nickname that can stand for two given names matches either
  ['Chris Evans', 'Christina Evans', 'same'],
  ['Pat Jones', 'Patricia Jones', 'same'],
  ['Pat Jones', 'Patrick Jones', 'same'],
  ['Alex Johnson', 'Alexander Johnson', 'same'],
  ['Alex Johnson', 'Alexandra Johnson', 'same'],
  ['Jon Smith', 'Jonathan Smith', 'same'],
  ['Nate Smith', 'Nathan Smith', 'same'],
  ['Phil Smith', 'Philip Smith', 'same'],
  ['Vince Smith', 'Vincent Smith', 'same'],
  ['Kim Smith', 'Kimberly Smith', 'same'],
  ['Cindy Smith', 'Cynthia Smith', 'same'],
  ['Sandy Smith', 'Sandra Smith', 'same'],
  ['Jerry Smith', 'Gerald Smith', 'same'],
  ['Jerry Smith', 'Jeremy Smith', 'same'],
  ['Nikki Smith', 'Nicole Smith', 'same'],
  ['Betsy Smith', 'Elizabeth Smith', 'same'],
  ['Peg Smith', 'Margaret Smith', 'same'],
  ['Gene Smith', 'Eugene Smith', 'same'],
  ['Randy Smith', 'Randall Smith', 'same'],
  ['Ginny Smith', 'Virginia Smith', 'same'],
  ['Chris Evans', 'Christian Evans', 'same'],
  ['Gabe Smith', 'Gabriel Smith', 'same'],
  ['Hal Smith', 'Harold Smith', 'same'],
  ['Abby Smith', 'Abigail Smith', 'same'],
  ['Maddie Smith', 'Madeline Smith', 'same'],
  ['Mohammad Khan', 'Muhammad Khan', 'same'],
  ['Md Khan', 'Mohammed Khan', 'same'],
  ['S. Agent', 'Sender Agent', 'same'],                        // an initial, at its own place
  ['Michael J. Smith', 'Michael James Smith', 'same'],
  ['J. Michael Smith', 'Michael Smith', 'same'],               // a middle name used as the first
  ['Michael Smith', 'Michael Smith Jones', 'same'],            // a name with more of it
  ['Maria Garcia Lopez', 'Maria Garcia', 'same'],              // double and hyphenated family names
  ['Maria Garcia-Lopez', 'Maria Garcia', 'same'],
  ['Maria Garcia-Lopez', 'Maria Lopez', 'same'],
  ['Maria Garcia-Lopez', 'Maria Garcia Lopez', 'same'],
  ['Anna Smith', 'Anna Smith-Jones', 'same'],
  ['Maria de la Cruz', 'Maria Delacruz', 'same'],              // particles belong to the family name
  ['Maria de la Cruz', 'Maria Cruz', 'same'],
  ['Pieter VanGogh', 'Pieter van Gogh', 'same'],
  ['Jean-Marc Dupont', 'Jean Marc Dupont', 'same'],            // a hyphen
  ['Mary Ann Smith', 'Mary Smith', 'same'],
  ['Mary Ann Smith', 'Maryann Smith', 'same'],
  ['José García', 'Jose Garcia', 'same'],                      // accents and letters no accent folds
  ['Søren Sørensen', 'Soren Sorensen', 'same'],
  ['Łukasz Nowak', 'Lukasz Nowak', 'same'],
  ['Anna Weiß', 'Anna Weiss', 'same'],
  ['Zoë Müller', 'Zoe Muller', 'same'],                        // a German umlaut is written either way
  ['Zoë Müller', 'Zoe Mueller', 'same'],
  ['Hans Müller', 'Hans Mueller', 'same'],
  ["Sean O'Brien", 'Sean OBrien', 'same'],                     // punctuation, whichever apostrophe
  ['Sean O‘Brien', "Sean O'Brien", 'same'],
  ['Sean OʼBrien', "Sean O'Brien", 'same'],
  ['Sean O´Brien', "Sean O'Brien", 'same'],
  ['Michael Smith Jr.', 'Michael Smith', 'same'],              // suffixes, titles, credentials, a nickname in brackets
  ['Michael Smith III', 'Michael Smith', 'same'],
  ['Michael Smith 3rd', 'Michael Smith', 'same'],
  ['Michael Smith, Esq.', 'Michael Smith', 'same'],
  ['Michael Smith, CPA', 'Michael Smith', 'same'],
  ['Michael Smith, CPA, CRS', 'Michael Smith', 'same'],
  ['Michael Smith CRS GRI', 'Michael Smith', 'same'],
  ['Dr. Michael Smith', 'Michael Smith', 'same'],
  ['Michael Smith (Mike)', 'Michael Smith', 'same'],
  ['Michael "Mike" Smith', 'Mike Smith', 'same'],
  ['Smith, John', 'John Smith', 'same'],                       // the family name first
  ['Smith, John Michael', 'John Michael Smith', 'same'],
  ['de la Cruz, Maria', 'Maria de la Cruz', 'same'],
  ['Smith Jr., John', 'John Smith', 'same'],
  ['Mike Smith Jr.', 'Michael Smith', 'same'],
  ['Mike Smith Jr. CPA', 'Michael Smith', 'same'],            // every suffix goes, not the first one only
  ['Mike Smith, Jr., CPA', 'Michael Smith', 'same'],
  ['Mr. Dr. Michael Smith', 'Michael Jones', 'different'],      // and every title
  ['Michael Smith (Jones)', 'Michael Jones', 'different'],      // what is in brackets is not part of the name
  ['Michael Smith [Jones]', 'Michael Jones', 'different'],
  ['Michael Smith {Jones}', 'Michael Jones', 'different'],
  ['Michael Smith -', 'Michael Smith', 'same'],                 // a dash on its own is not a word
  ['Cher --', 'Cher --', 'unknown'],                          // dashes on their own are not words: nothing here says whose name it is
  ['Cher -', 'Cher', 'unknown'],
  ['Anna Smith-Jones', 'Anna SmithJones', 'same'],              // a hyphen is not part of a family name
  ['Anna Smith-de', 'Anna Smith de', 'same'],                   // the same words, written with a hyphen or without
  ['Jean–Marc Dupont', 'Jean-Marc Dupont', 'same'],            // whichever dash
  ['Maria Garcia', 'Anna Maria Garcia Lopez', 'same'],         // a name inside another may sit in the middle of it
  ['王伟', '王伟', 'same'],                                     // names with no Latin letters are names
  ['Дмитрий Иванов', 'Дмитрий Иванов', 'same'],
  ['Sender Agent', 'Sender Agent', 'same'],
  // ── a family name that nothing in the other name matches ──
  ['Mike Smith', 'Mike Jones', 'different'],
  ['Mary Smith', 'Mary Johnson', 'different'],
  ['M. Smith', 'J. Jones', 'different'],
  ['Michael Smith', 'Jennifer Kim', 'different'],
  ['Sender Agent', 'Jennifer Kim', 'different'],
  ['Дмитрий Иванов', 'Анна Петрова', 'different'],
  ['<img src=x onerror="window.__pwned=1">', 'Sender Agent', 'different'],
  ['Michael constructor', 'Michael Smith', 'different'],       // a word that is a property of every object is a word
  ['Michael __proto__', 'Michael Smith', 'different'],
  // ── the family name agrees and a given name does not: relatives, a married name, a middle name used as the first. Nothing is attached, nothing is removed ──
  ['Dara Smith', 'Paeder Smith', 'unknown'],
  ['Michael Smith', 'Mark Smith', 'unknown'],
  ['David Cohen', 'Daniel Cohen', 'unknown'],
  ['Maria Cohen', 'Michael Cohen', 'unknown'],
  ['Álvaro Pérez', 'Lucía Pérez', 'unknown'],
  ['Christopher Evans', 'Christina Evans', 'unknown'],         // two given names that share a nickname are two people
  ['Patrick Jones', 'Patricia Jones', 'unknown'],
  ['Alexander Johnson', 'Alexandra Johnson', 'unknown'],
  ['Gerald Smith', 'Jeremy Smith', 'unknown'],
  ['Randall Smith', 'Randolph Smith', 'unknown'],
  ['Christian Evans', 'Christopher Evans', 'unknown'],
  ['Bob Smith', 'William Smith', 'unknown'],
  ['Sender Agent', 'Sam Agent', 'unknown'],
  ['constructor Smith', 'Mike Smith', 'unknown'],
  ['Michael J. Kim', 'Jennifer Kim', 'unknown'],               // the middle initial of one is not the first name of the other
  ['Maria L. Garcia', 'Luis Garcia', 'unknown'],
  ['Robert J. Chen', 'Jessica Chen', 'unknown'],
  ['Maria de la Cruz', 'Carlos de la Cruz', 'unknown'],        // particles are not given names
  ['Anna van der Berg', 'Peter van der Berg', 'unknown'],
  ['Pieter van Gogh', 'Anna van Gogh', 'unknown'],
  ['Jean-Marc Dupont', 'Jean-Luc Dupont', 'unknown'],          // a hyphenated given name is one name
  ['Mary Ann Smith', 'Mary Beth Smith', 'unknown'],            // given names are compared in order
  ['Michael John Smith', 'John Michael Smith', 'unknown'],
  ['J. Smith', 'Michael John Smith', 'unknown'],               // an initial matches only the word at its own place
  ['Michael J. Smith', 'Michael Anne Smith', 'unknown'],
  ['Maria Garcia Lopez', 'Luis Garcia', 'unknown'],
  ['J. Smith', 'Anna J. Smith Jones', 'unknown'],              // one real word and an initial are not enough to say a name is inside another
  ['Van Smith', 'Peter Van Smith', 'unknown'],                 // the first word is a given name, even when it is a particle
  ['Anna B', 'Peter Smith', 'unknown'],                        // a name that ends in an initial has no family name to tell it apart by
  ['Dr. Smith', 'Dr. Smith', 'unknown'],                       // a title is not a word of the name
  ['Mike Smith', 'Mike Smyth', 'unknown'],                     // a slip of the pen is too close to call
  ['Mike Cohen', 'Mike Cahan', 'different'],                   // two slips of the pen are too many for a short word
  ['Anna Lee', 'Anna Lea', 'different'],                       // and any at all for a very short one
  ['Maria de Cruz', 'Carlos de Vega', 'different'],            // a particle two families share is not a family name they share
  ['Jean-Marc Dupont', 'Jean Dupont', 'unknown'],              // a hyphenated given name is one name: Jean-Marc is not Jean
  ['Jean–Marc Dupont', 'Jean Dupont', 'unknown'],
  ['J. Smith', 'M. Smith', 'unknown'],                         // two initials that are not the same letter
  ['Smith Anna', 'Peter Smith', 'unknown'],                    // the family name of one is the first word of the other: either order
  ['Сергей Иванов', 'Сергеи Иванов', 'unknown'],               // a mark can make another letter in another script
  ['Anna Müller', 'Anna Muellner', 'unknown'],                  // one way of writing the umlaut says 'different', the other cannot tell: it is not 'different'
  ['Anna Vandenberg', 'Anna Vandenburgh', 'unknown'],           // a long word is allowed two slips of the pen
  ['Mike Smiht', 'Mike Smith', 'unknown'],                      // and a swap of two letters is one slip
  ['Sean O Brien', "Sean O'Brien", 'unknown'],
  ['Li Wei', 'Wei Li', 'unknown'],                             // the family name first, without a comma: either order
  ['Wei Chen', 'Chen Wei', 'unknown'],
  // ── too little to tell: one word, one real word, another script, no letters ──
  ['Smith', 'Michael Smith', 'unknown'],
  ['Michael', 'Michael Jones', 'unknown'],
  ['Michael', 'Mike Jones', 'unknown'],
  ['Smith', 'Michael Jones', 'unknown'],
  ['Pat', 'Sender Agent', 'unknown'],
  ['Cher', 'Cher', 'unknown'],                                 // two equal one-word names say nothing about whose they are
  ['Cher', 'Madonna', 'unknown'],
  ['Smith', 'Smith', 'unknown'],
  ['(.*)+ Smith', 'Smith', 'unknown'],
  ['<regex chars> Smith', 'Smith', 'unknown'],
  ['De La Cruz', 'De La Cruz', 'unknown'],
  ['王伟', '李娜', 'unknown'],                                   // another character is not another person: Simplified and Traditional write one name two ways
  ['김민수', '이영희', 'unknown'],
  ['王伟', 'Wei Wang', 'unknown'],                              // another script cannot be compared
  ['Дмитрий Иванов', 'Dmitry Ivanov', 'unknown'],
  ['', 'Michael Smith', 'unknown'],                            // nothing to compare
  ['Jr.', 'Michael Smith', 'unknown'],
  ['--', 'Michael Smith', 'unknown'],
  ['Michael Smith, Compass, Inc.', 'Michael Smith', 'unknown'],
  ['a b c d e f g h i j k l Smith', 'Michael Smith', 'unknown'],
  ['Michael b c d e f g h i j k Smith', 'Michael Smith', 'unknown'],     // more words than any name has

  // a family name written with a space is the same letters without one (a space is not a different name: nothing to attach, nothing to remove)
  ['Anna Mc Donald', 'Anna McDonald', 'unknown'],
  ['Anna Mac Donald', 'Anna MacDonald', 'unknown'],
  ['Carlos San Martin', 'Carlos Sanmartin', 'unknown'],
  ['Maria De Los Santos', 'Maria Delossantos', 'unknown'],
  ['Maria Las Heras', 'Maria Lasheras', 'unknown'],
  ['Sean Fitz Patrick', 'Sean Fitzpatrick', 'unknown'],
  ['Lisa Lo Presti', 'Lisa Lopresti', 'unknown'],
  ['Omar Abdel Rahman', 'Omar Abdelrahman', 'unknown'],
  ['Tom Mac Kenzie', 'Tom Mackenzie', 'unknown'],
  ['Santo Domingo', 'Santodomingo', 'unknown'],
  ['Anna Mc Donald', 'Anna Mc Donalds', 'unknown'],
  ['Anna Mc Donald', 'Anna Smith', 'different'],                          // a space does not make a different name look like this one
  ['Maria De Los Santos', 'Maria Garcia', 'different'],
  // a family name spelt two ways more than one letter apart (a romanization): too close to call, not a different person
  ['Ivan Petrov', 'Ivan Petroff', 'unknown'],
  ['Sergey Rabinovich', 'Sergey Rabinowitz', 'unknown'],
  ['Alexander Gorenstein', 'Alexander Gornshteyn', 'unknown'],
  ['Mark Johnson', 'Mark Jackson', 'different'],                          // three edits apart: another name
  ['Wei Li', 'Wei Lee', 'different'],                                     // a short name has to be the same
  ['Jenny Wu', 'Jenny Woo', 'different'],
  ['Mark Peterson', 'Mark Petersen', 'unknown'],                          // one edit, as before
  // two names that are the same words are the same name, whether or not the family name is a particle that belongs to a longer one
  ['Anh Le', 'Anh Le', 'same'],
  ['Kim Du', 'Kim Du', 'same'],
  ['Thanh Van', 'Thanh Van', 'same'],
  ['Maria Del', 'Maria Del', 'same'],
  ['Jose Da', 'Jose Da', 'same'],
  ['Kim Le', 'Kimberly Le', 'same'],
  ['Anh Le', 'Anh Le Tran', 'same'],
  ['De La Cruz', 'De La Cruz', 'unknown'],                                // no given name: nothing says whose
  ['Anh Le', 'Linh Le', 'unknown'],
  // a generation is part of who somebody is: a father and a son are not one person
  ['John Smith Jr', 'John Smith Sr', 'unknown'],
  ['John Smith II', 'John Smith III', 'unknown'],
  ['John Smith III', 'John Smith IV', 'unknown'],
  ['John Smith 2nd', 'John Smith 3rd', 'unknown'],
  ['Smith, John Jr.', 'Smith, John Sr.', 'unknown'],
  ['Mark Lee', 'Mark Lea', 'different'],                                  // three letters have to be the same
  ['Mark Rees', 'Mark Reed', 'unknown'],                                  // four letters may be one edit away
  ['Jo Mc Donald', 'Joanne McDonald', 'unknown'],                         // the family name is closed up without the given name
  ['Sean O＇Brien', 'Sean O\'Brien', 'same'],                         // a full-width apostrophe
  ['John Smith Jr', 'John Smith II', 'same'],                             // two ways of writing one generation
  ['John Smith Jr', 'John Smith 2nd', 'same'],
  ['John Smith II', 'John Smith 2nd', 'same'],
  ['John Smith III', 'John Smith 3rd', 'same'],
  ['John Smith IV', 'John Smith 4th', 'same'],
  ['John Smith 3rd', 'John Smith 4th', 'unknown'],
  ['John Smith Sr', 'John Smith Jr', 'unknown'],
  ['John Smith Sr', 'John Smith III', 'unknown'],
  ['John Smith Jr, MBA', 'John Smith Sr, MBA', 'unknown'],                // a credential after the generation does not hide it
  ['John Smith Jr, MBA', 'John Smith II', 'same'],
  ['Robert Kennedy Jr', 'Robert Kennedy', 'same'],                        // a suffix on one side only: the MLS ID decides, the name does not contradict it
  ['John Smith Sr', 'John Smith Sr', 'same'],
  // what copy and paste leaves in a name: soft hyphens, zero-width characters, full-width letters
  ['John Smi­th', 'John Smith', 'same'],
  ['John Smi​th', 'John Smith', 'same'],
  ['Jo⁠hn Smith', 'John Smith', 'same'],
  ['﻿John Smith', 'John Smith', 'same'],
  ['Ｊｏｈｎ Ｓｍｉｔｈ', 'John Smith', 'same'],
  ['John Smith', 'Ｊｏｈｎ Ｓｍｉｔｈ', 'same'],
];

describe('agent-defaults: comparing the name a listing carries with the name Cotality has', () => {
  it.each(NAMES)('%j vs %j: %s', (a, b, expected) => {
    expect(compareNames(a, b)).toBe(expected);
  });

  it('gives the same answer whichever name comes first', () => {
    for (const [a, b] of NAMES) expect([a, b, compareNames(b, a)]).toEqual([a, b, compareNames(a, b)]);
  });

  it('compares a name of any length in bounded time, and never throws', () => {
    const started = Date.now();
    expect(compareNames('Michael Smith', 'x'.repeat(100000))).toBe('unknown');
    expect(compareNames(`${'x'.repeat(100000)} ${'y'.repeat(100000)}`, 'Michael Smith')).toBe('unknown');
    expect(compareNames('a-'.repeat(50000), 'b-'.repeat(50000))).toBe('unknown');
    expect(compareNames(`${'x'.repeat(100000)} ${'y'.repeat(100000)}`, `${'p'.repeat(100000)} ${'q'.repeat(100000)}`)).toBe('unknown');
    expect(compareNames(`Anna ${'x'.repeat(150)}`, `Anna ${'y'.repeat(150)}`)).toBe('different');       // two long words are compared too, in no time
    expect(compareNames(null as any, undefined as any)).toBe('unknown');
    expect(compareNames({} as any, [] as any)).toBe('unknown');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  // Every title, suffix and credential the module knows is left out of a name wherever it stands: left in, it makes a name look like a different one (a word the other
  // name's family shares, a name that is not the one written twice).
  it.each(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr'])('the title %s is not part of a name', (title) => {
    expect(compareNames(`${title} Michael Smith`, 'Michael Jones')).toBe('different');
    expect(compareNames(`${title}. Mike Smith`, 'Michael Smith')).toBe('same');
  });
  it.each(['jr', 'sr', 'ii', 'iii', 'iv', '2nd', '3rd', '4th', 'esq', 'md', 'phd', 'dds', 'mba', 'cpa', 'jd', 'crs', 'gri', 'abr', 'cdpe', 'e-pro', 'sres', 'srs', 'realtor', 'broker'])(
    'the suffix or credential %s is not part of a name', (suffix) => {
      expect(compareNames(`Michael Smith ${suffix}`, 'Michael Jones')).toBe('different');
      expect(compareNames(`Michael Smith, ${suffix}`, 'Michael Jones')).toBe('different');
      expect(compareNames(`Mike Smith ${suffix}`, 'Michael Smith')).toBe('same');
    });
  // a particle belongs to the family name that follows it, joined to it or apart ("VanGogh", "van Gogh"), and is not a given name two people can share
  it.each(['de', 'del', 'della', 'di', 'da', 'dos', 'das', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'den', 'ter', 'bin', 'ibn', 'al', 'el', 'st'])(
    'the particle %s belongs to the family name that follows it', (particle) => {
      expect(compareNames(`Anna ${particle}Berg`, `Anna ${particle} Berg`)).toBe('same');
      expect(compareNames(`Maria ${particle} Berg`, `Carlos ${particle} Berg`)).toBe('unknown');
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

  it('replaces the agent key a listing was saved with when the member Cotality returns is the listing\'s agent (the office ids it was saved with stay: they are the listing\'s own)', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: WITH_BROKERS_KEYS, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentMlsId: '11111', ListAgentKey: '777', ListOfficeKey: BROKERS_KEYS.ListOfficeKey, ListOfficeMlsId: BROKERS_KEYS.ListOfficeMlsId });
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
    ['is the agent', SAVED_MEMBER, { ListAgentKey: '777', ListOfficeKey: BROKERS_KEYS.ListOfficeKey, ListOfficeMlsId: BROKERS_KEYS.ListOfficeMlsId }, /^Cotality agent: Saved Agent/],
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

  it.each([
    ['one word', 'Saved'],
    ['the family name and another first name (a relative, a married name, a middle name used as the first)', 'Sam Agent'],
    ['a middle initial that is not the member\'s first name', 'Michael J. Agent'],
  ])('a name that cannot be confirmed (%s) attaches no key and removes none, and says so', async (_name, listed) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...WITH_BROKERS_KEYS, list_agent_full_name: listed }, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject(BROKERS_KEYS);
      expect(cotalityStatus(f.d, prefix)).toBe(`Cotality lists MLS ID 11111 under Saved Agent, but the name here (${listed}) could not be confirmed as the same person, so no Cotality key was attached.`);
      expect(f.d.getElementById(`${prefix}AgentCotalityStatus`)?.className).toMatch(/amber/);
    } finally { f.close(); }
  });

  it('a new listing that Cotality confirmed and then says belongs to somebody else sends no blank key and claims no removal: nothing was saved, so nothing is removed', async () => {
    const f = await bootAddForm(form);
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '4455667' });
      f.w.MallanDirectory.lookupMember = () => Promise.resolve({ ...SESSION_MEMBER, fullName: 'Someone Else' });     // the directory changes its answer
      void f.w.MallanAgentDefaults.apply(prefix, SESSION_USER, {});                                                   // the same agent again: the page asks again
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('MLS ID 39361 belongs to Someone Else in Cotality, not to Sender Agent, so no Cotality key was attached. Ask a broker to correct your agent profile.');
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');                                              // not even a blank
      expect(val(f.d, `${prefix}UpdatingAgentKey`)).toBe('');
    } finally { f.close(); }
  });

  it('the same agent spelled another way (a double space, the family name first) keeps the keys Cotality gave them while the page checks again', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED, agent_info: {}, raw_data: {} }, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '777', ListOfficeKey: '888' });
      for (const spelled of ['Saved  Agent', 'Agent, Saved', 'Dr. Saved Agent, CPA']) {
        void f.w.MallanAgentDefaults.hydrate(prefix, { ...SAVED, list_agent_full_name: spelled, agent_info: {}, raw_data: {} }, {});
        expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: spelled, ListAgentKey: '777', ListOfficeKey: '888' });   // before the new answer has come back
        await checked(f.d, prefix);
        expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '777' });
      }
    } finally { f.close(); }
  });

  it('what Cotality said about one spelling of a name is not applied to another spelling that compares differently', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', listing: { ...SAVED, list_agent_full_name: 'Hans Müller', agent_info: {}, raw_data: {} }, members: { '11111': { ...SAVED_MEMBER, fullName: 'Hans Mueller' } }, settle: 1500,
    });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '777' });                       // Müller is Mueller
      void f.w.MallanAgentDefaults.hydrate(prefix, { ...SAVED, list_agent_full_name: 'Hans Muller', agent_info: {}, raw_data: {} }, {});
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');                            // Muller is only close to Mueller: nothing is carried over from the other spelling
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');
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
      'Cotality lists MLS ID 39361 under Sender Agent, but the name here (Sender) could not be confirmed as the same person, so no Cotality key was attached. Ask a broker to check your agent profile.'],
    ['the signed-in agent\'s profile name is a middle initial away from the first name Cotality has', { user: { ...SESSION_USER, name: 'Michael J. Kim' }, members: { '39361': { ...SESSION_MEMBER, fullName: 'Jennifer Kim' } } },
      'Cotality lists MLS ID 39361 under Jennifer Kim, but the name here (Michael J. Kim) could not be confirmed as the same person, so no Cotality key was attached. Ask a broker to check your agent profile.'],
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

// ── A restored draft, or a stored control value, never puts another agent in the Contacts tab than the one the form submits ────────────────────────────────────
// The agent module writes the identity inputs and the Contacts tab's company and agent pickers from the agent the listing carries. A draft (saved by another agent, on the
// same browser) and a saved listing's own control keys carry those controls too; restoring them last left the tab showing an agent the form did not submit.
describe('a restored draft leaves the Contacts tab to the agent module', () => {
  const OTHER_AGENTS_PICKERS = {
    saleListingCompany: 'other', saleListingCompanySearch: 'Other Company Inc.', saleListingAgent: 'AG-77', saleListingAgentSearch: 'Other Agent',
    saleUpdatingAgentName: 'Other Agent', saleUpdatingAgentMlsId: '77777', saleUpdatingAgentEmail: 'other@example.test', saleUpdatingAgentDisplay: 'Other Agent · MLS ID 77777',
  };

  it.each([
    ['the session is ready before the draft is restored (what the real client does once it has resolved)', { readySync: true }],
    ['the session arrives after the draft is restored', { readyDelay: 300 }],
  ])('Sale ?restore=local, %s: the tab shows the signed-in agent the form submits, and the rest of the draft comes back', async (_name, timing) => {
    const draft = JSON.stringify({ ...OTHER_AGENTS_PICKERS, salePrice: '1234567' });
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?restore=local', storage: { mallan_draft_sale: draft }, settle: 1200, ...timing });
    try {
      await checked(f.d, 'sale');
      expect(val(f.d, 'salePrice')).toBe('1234567');                               // the draft was restored...
      expect(val(f.d, 'saleListingAgentSearch')).toBe('Sender Agent');             // ...except what the agent module owns
      expect(val(f.d, 'saleListingAgent')).toBe('AG-9');
      expect(val(f.d, 'saleListingCompany')).toBe('mallan');
      expect(val(f.d, 'saleListingCompanySearch')).toMatch(/^Mallan Real Estate Inc/);     // (the page's own company list spells it without the period)
      expect(val(f.d, 'saleUpdatingAgentName')).toBe('Sender Agent');
      expect(val(f.d, 'saleUpdatingAgentDisplay')).toBe('Sender Agent · MLS ID 39361');
      expect(f.w.collectSaleFormData()).toMatchObject({ ListAgentFullName: 'Sender Agent', ListAgentMlsId: '39361', ListAgentEmail: 'sender@example.test' });
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('Rental: a draft saved by one agent, opened by the next agent on the same browser (the session ready at once)', async () => {
    const first = await bootAddForm('RENTAL-FORM-REDESIGN');
    let draft = '';
    try {
      await checked(first.d, 'rental');
      (first.d.getElementById('rentalMonthlyRent') as HTMLInputElement).value = '4321';
      first.w.saveRentalDraft();
      draft = first.w.localStorage.getItem('rentalListingDraft') ?? '';
    } finally { first.close(); }
    expect(JSON.parse(draft)).toMatchObject({ rentalListingAgentSearch: 'Sender Agent', rentalListingAgent: 'AG-9', rentalMonthlyRent: '4321' });   // the draft carries the first agent's pickers
    const SECOND = { ...SESSION_USER, id: 'AG-2', mlsId: '22222', name: 'Second Agent', email: 'second@example.test', phone: '212-555-0222' };
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', {
      storage: { rentalListingDraft: draft }, user: SECOND, readySync: true, settle: 1200,
      members: { '22222': { ...SESSION_MEMBER, mlsId: '22222', fullName: 'Second Agent', key: '7777777' } },
    });
    try {
      await checked(f.d, 'rental');
      expect(val(f.d, 'rentalMonthlyRent')).toBe('4321');                          // the draft was restored...
      expect(val(f.d, 'rentalListingAgentSearch')).toBe('Second Agent');           // ...except what the agent module owns
      expect(val(f.d, 'rentalListingAgent')).toBe('AG-2');
      expect(val(f.d, 'rentalUpdatingAgentName')).toBe('Second Agent');
      expect(f.w.collectRentalFormData()).toMatchObject({ ListAgentFullName: 'Second Agent', ListAgentMlsId: '22222', ListAgentKey: '7777777' });
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  // a saved listing's own control keys (the form saves every control under its id) carry the pickers as well
  it.each([
    ['SALE-FORM-REDESIGN', 'sale', { ...OTHER_AGENTS_PICKERS }],
    ['RENTAL-FORM-REDESIGN', 'rental', Object.fromEntries(Object.entries(OTHER_AGENTS_PICKERS).map(([k, v]) => [k.replace(/^sale/, 'rental'), v])) as Record<string, string>],
  ] as [AddForm, 'sale' | 'rental', Record<string, string>][])('%s: an edit-mode load does not write the stored agent controls, and writes the rest', async (form, prefix, stored) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED, agent_info: {}, raw_data: { ...stored } }, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('Saved Agent');          // the agent the listing carries, not the one its control keys remember
      expect(val(f.d, `${prefix}ListingAgent`)).toBe('11111');
      expect(val(f.d, `${prefix}ListingCompany`)).toBe('mallan');
      expect(val(f.d, `${prefix}UpdatingAgentName`)).toBe('Saved Agent');
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe('Saved Agent · MLS ID 11111');
    } finally { f.close(); }
  });

  it.each([
    ['SALE-FORM-REDESIGN', 'sale', 'salePrice'],
    ['RENTAL-FORM-REDESIGN', 'rental', 'rentalMonthlyRent'],
  ] as [AddForm, 'sale' | 'rental', string][])('%s: the control pass of an edit-mode load skips exactly the agent module\'s controls', async (form, prefix, plain) => {
    const f = await bootAddForm(form, { settle: 600 });
    try {
      const ids = ['ListingCompany', 'ListingCompanySearch', 'ListingAgent', 'ListingAgentSearch', 'UpdatingAgentName', 'UpdatingAgentDisplay', 'UpdatingAgentKey'].map((s) => prefix + s);
      const before = Object.fromEntries(ids.map((id) => [id, val(f.d, id)]));
      f.w.MallanListingHydration.hydrate(prefix, { raw_data: { ...Object.fromEntries(ids.map((id) => [id, 'STORED'])), [plain]: '555' } }, { mode: 'edit' });
      for (const id of ids) expect([id, val(f.d, id)]).toEqual([id, before[id]]);       // none of the agent module's controls was written
      expect(val(f.d, plain)).toBe('555');                                              // every other control was
      // the viewers (the Tools pages) hydrate in view mode: the signed-in agent's controls are the session's there too (a record carries another agent's, the listing agent's, and a viewer
      // that put it there would print the listing agent as the one preparing the report); every other control the record carries is written
      f.w.MallanListingHydration.hydrate(prefix, { raw_data: { [`${prefix}UpdatingAgentDisplay`]: 'VIEWED', [`${prefix}UpdatingAgentName`]: 'VIEWED', [plain]: '777' } });
      expect(val(f.d, plain)).toBe('777');                                              // (the pass ran)
      expect(val(f.d, `${prefix}UpdatingAgentDisplay`)).toBe(before[`${prefix}UpdatingAgentDisplay`]);
      expect(val(f.d, `${prefix}UpdatingAgentName`)).toBe(before[`${prefix}UpdatingAgentName`]);
    } finally { f.close(); }
  });
});

// ── What the second adversarial review (of a4a87f64) found in the listing agent ──────────────────────────────────────────────────────────────────────────

describe('a draft the Sale collector produced (it carries the first agent\'s provider keys) opened by the next agent', () => {
  const SECOND = { ...SESSION_USER, id: 'AG-2', mlsId: '22222', name: 'Second Agent', email: 'second@example.test', phone: '212-555-0222' };
  const SECOND_MEMBER = { ...SESSION_MEMBER, mlsId: '22222', fullName: 'Second Agent', key: '7777777', officeKey: '8888888', officeMlsId: '9999', officeName: 'B Office' };

  it.each([
    ['the session is ready before the draft is restored', { readySync: true }],
    ['the session arrives after the draft is restored', { readyDelay: 300 }],
  ])('?restore=local, %s: the form submits the signed-in agent, and not the agent who saved the draft', async (_name, timing) => {
    const first = await bootAddForm('SALE-FORM-REDESIGN');
    let draft = '';
    try {
      await checked(first.d, 'sale');
      (first.d.getElementById('salePrice') as HTMLInputElement).value = '1234567';
      draft = JSON.stringify({ ...first.w.collectSaleFormData(), _savedAt: new Date().toISOString() });
    } finally { first.close(); }
    // the draft is what the form submits: it carries the first agent's provider keys, not only the pickers' control keys
    expect(JSON.parse(draft)).toMatchObject({
      ListAgentFullName: 'Sender Agent', ListAgentMlsId: '39361', ListAgentKey: '4455667', ListAgentEmail: 'sender@example.test', ListAgentDirectPhone: '212-555-0199',
      ListOfficeName: 'Mallan Real Estate Inc.', ListOfficeKey: '5671398', ListOfficeMlsId: '7041',
    });
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?restore=local', storage: { mallan_draft_sale: draft }, user: SECOND, members: { '22222': SECOND_MEMBER }, settle: 1500, ...timing });
    try {
      await checked(f.d, 'sale');
      expect(val(f.d, 'salePrice')).toBe('1234567');                                // the draft was restored...
      expect(val(f.d, 'saleListingAgentSearch')).toBe('Second Agent');              // ...except the agent
      expect(txt(f.d, 'saleListingAgentId')).toBe('22222');
      expect(val(f.d, 'saleUpdatingAgentDisplay')).toBe('Second Agent · MLS ID 22222');
      const p = f.w.collectSaleFormData();
      expect(p).toMatchObject({
        ListAgentFullName: 'Second Agent', ListAgentMlsId: '22222', ListAgentKey: '7777777', ListAgentEmail: 'second@example.test', ListAgentDirectPhone: '212-555-0222',
        ListOfficeKey: '8888888', ListOfficeMlsId: '9999',
      });
      expect(JSON.stringify(p)).not.toMatch(/Sender Agent|4455667|5671398|sender@example\.test|212-555-0199/);   // nothing of the first agent is submitted
      expect(cotalityStatus(f.d, 'sale')).toMatch(/^Cotality agent: Second Agent \(MLS ID 22222\)/);
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('the table pass of an edit-mode hydrate skips the agent module\'s controls, and a view-mode hydrate (the Tools pages) does not write the signed-in agent\'s either', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const rows = { ListAgentFullName: 'STORED', ListAgentMlsId: '1', ListAgentEmail: 'stored@example.test', ListAgentDirectPhone: '2', ListOfficeName: 'STORED OFFICE', ListAgentKey: '3', ListOfficeKey: '4', ListOfficeMlsId: '5' };
      const ids = ['saleUpdatingAgentName', 'saleUpdatingAgentMlsId', 'saleUpdatingAgentEmail', 'saleUpdatingAgentPhone', 'saleUpdatingAgentCompanyName', 'saleUpdatingAgentKey', 'saleUpdatingAgentOfficeKey', 'saleUpdatingAgentOfficeMlsId'];
      const before = Object.fromEntries(ids.map((id) => [id, val(f.d, id)]));
      f.w.MallanListingHydration.hydrate('sale', { raw_data: { ...rows, salePrice: '555', NumberOfUnitsTotal: '42' } }, { mode: 'edit' });
      for (const id of ids) expect([id, val(f.d, id)]).toEqual([id, before[id]]);
      expect(val(f.d, 'salePrice')).toBe('555');
      expect(val(f.d, 'saleBldgTotalUnits')).toBe('42');                            // a row of the table (its key is not the control's id) still goes in
      f.w.MallanListingHydration.hydrate('sale', { agent_info: rows, raw_data: { salePrice: '777' } });
      expect(val(f.d, 'salePrice')).toBe('777');                                    // (the pass ran)
      for (const id of ids) expect([id, val(f.d, id)]).toEqual([id, before[id]]);   // the signed-in agent is the session's: the listing agent the rows name is not the one preparing the report
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: a listing the signed-in broker owns that names nobody, but carries somebody else\'s identifiers', (form, prefix, collector) => {
  const NAMELESS = { ...SAVED, agent_id: 'AG-9', list_agent_full_name: null, list_agent_mls_id: null, list_agent_email: null, list_agent_direct_phone: null, list_office_name: null,
    list_office_mls_id: null, agent_info: { ListAgentKey: '777' }, raw_data: {} };
  const BROKER = { ...SESSION_USER, name: 'Maya Allan' };

  it('another agent\'s MLS ID, e-mail and phone: the broker\'s name and licence are not put on it, and the saved key stays', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', user: BROKER, members: { '39361': SESSION_MEMBER, '11111': SAVED_MEMBER }, settle: 1500,
      listing: { ...NAMELESS, list_agent_mls_id: '11111', list_agent_email: 'saved@example.test', list_agent_direct_phone: '212-555-0111' },
    });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: '', ListAgentMlsId: '11111', ListAgentEmail: 'saved@example.test', ListAgentDirectPhone: '212-555-0111', ListAgentKey: '777' });
      expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('--');
      expect(val(f.d, `${prefix}ListingAgentSearch`)).toBe('');
      expect(cotalityStatus(f.d, prefix)).toMatch(/^Cotality agent: Saved Agent \(MLS ID 11111\)/);
    } finally { f.close(); }
  });

  it.each([
    ['another agent\'s MLS ID', { list_agent_mls_id: '11111' }],
    ['another agent\'s e-mail', { list_agent_email: 'someone.else@example.test' }],
    ['another agent\'s phone', { list_agent_direct_phone: '212-555-0111' }],
  ])('%s alone: nothing of the broker\'s is put on it', async (_what, carried) => {
    const f = await bootAddForm(form, { search: '?id=1', user: BROKER, listing: { ...NAMELESS, agent_info: {}, ...carried }, members: { '39361': SESSION_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p.ListAgentFullName).toBe('');
      expect(JSON.stringify(p)).not.toMatch(/Maya Allan|39361|4455667|sender@example\.test|212-555-0199|5671398/);
      expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('--');
    } finally { f.close(); }
  });

  it.each([
    ['the owner\'s own MLS ID', { list_agent_mls_id: '39361' }],
    ['the owner\'s e-mail written in capitals', { list_agent_email: 'SENDER@Example.test' }],
    ['the owner\'s phone written another way', { list_agent_direct_phone: '(212) 555-0199' }],
    ['the owner\'s phone with a country code', { list_agent_direct_phone: '+1 212 555 0199' }],
  ])('%s: it is still the owner\'s listing, and the profile fills what it lacks', async (_what, carried) => {
    const f = await bootAddForm(form, { search: '?id=1', user: BROKER, listing: { ...NAMELESS, agent_info: {}, ...carried }, members: { '39361': { ...SESSION_MEMBER, fullName: 'Maya Allan' } }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentFullName: 'Maya Allan', ListAgentMlsId: '39361', ListAgentKey: '4455667' });
      expect(txt(f.d, `${prefix}ListingAgentLicense`)).toBe('L-123');
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: what the Contacts tab shows is what the form submits', (form, prefix, collector) => {
  it('a listing that carries only an e-mail and a phone shows them (and is submitted with them)', async () => {
    const f = await bootAddForm(form, {
      search: '?id=1', settle: 1500,
      listing: { ...SAVED, agent_id: '77', list_agent_full_name: null, list_agent_mls_id: null, list_agent_email: 'only@example.test', list_agent_direct_phone: '212-555-0123', list_office_name: null, list_office_mls_id: null, agent_info: {}, raw_data: {} },
    });
    try {
      await checked(f.d, prefix);
      expect((f.d.getElementById(`${prefix}ListingAgentInfo`) as HTMLElement).style.display).toBe('block');
      expect(txt(f.d, `${prefix}ListingAgentEmail`)).toBe('only@example.test');
      expect(txt(f.d, `${prefix}ListingAgentPhone`)).toBe('212-555-0123');
      expect(tableRows(f, prefix)).toHaveLength(1);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentEmail: 'only@example.test', ListAgentDirectPhone: '212-555-0123' });
      expect(JSON.stringify((f.w as any).rebnyListingAgents)).not.toContain('only@example.test');      // the dropdown lists agents: this listing has none to list
    } finally { f.close(); }
  });

  it('a listing that carries nothing at all still shows nobody', async () => {
    const f = await bootAddForm(form, { search: '?id=1', settle: 1500, listing: { ...SAVED, agent_id: '77', list_agent_full_name: null, list_agent_mls_id: null, list_agent_email: null, list_agent_direct_phone: null, list_office_name: null, list_office_mls_id: null, agent_info: {}, raw_data: {} } });
    try {
      await checked(f.d, prefix);
      expect((f.d.getElementById(`${prefix}ListingAgentInfo`) as HTMLElement).style.display).toBe('none');
      expect(tableRows(f, prefix).map((r) => r.id)).toEqual([`${prefix}AgentContactsPlaceholder`]);
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: what Cotality answers is checked before a key is attached', (form, prefix, collector) => {
  const SAVED_NO_KEY = { ...SAVED, agent_info: {} };

  it.each([
    ['a member with no name on file, for a listing that names its agent', { ...SAVED_MEMBER, key: '999', fullName: '' }, /could not be confirmed/],
    ['a member whose MLS ID is not the one asked for', { ...SAVED_MEMBER, key: '999', mlsId: '99999' }, /99999/],
  ])('%s: no key is attached', async (_what, member, status) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: SAVED_NO_KEY, members: { '11111': member }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      const p = payloadOf(f, collector);
      expect(p).not.toHaveProperty('ListAgentKey');
      expect(p).not.toHaveProperty('ListOfficeKey');
      expect(cotalityStatus(f.d, prefix)).toMatch(status);
      expect(f.d.getElementById(`${prefix}AgentCotalityStatus`)?.className).not.toMatch(/green/);
    } finally { f.close(); }
  });

  it('a member the directory returns without an MLS ID of its own is still the one asked for', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: SAVED_NO_KEY, members: { '11111': { ...SAVED_MEMBER, mlsId: undefined as any } }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '777', ListOfficeKey: '888' });
    } finally { f.close(); }
  });

  it('a listing that names nobody still takes the key of the member its MLS ID names (nothing contradicts the directory)', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED_NO_KEY, list_agent_full_name: null }, members: { '11111': SAVED_MEMBER }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '777', ListOfficeKey: '888' });
    } finally { f.close(); }
  });

  it.each(['1234567890123', '12345678901234567890'])('an MLS ID of %s digits is not a Cotality MLS ID: it says so, instead of saying it looked and found nobody', async (mls) => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED_NO_KEY, list_agent_mls_id: mls }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe(`MLS ID "${mls}" is not a Cotality MLS ID (1 to 12 digits), so it was not checked.`);
      expect(f.fetched.filter((x) => x.includes('/directory/'))).toEqual([]);
    } finally { f.close(); }
  });

  it('a twelve-digit MLS ID is asked for', async () => {
    const f = await bootAddForm(form, { search: '?id=1', listing: { ...SAVED_NO_KEY, list_agent_mls_id: '123456789012' }, members: { '123456789012': { ...SAVED_MEMBER, mlsId: '123456789012' } }, settle: 1500 });
    try {
      await checked(f.d, prefix);
      expect(f.fetched.filter((x) => x.includes('/directory/'))).toEqual(['/api/crm/directory/members?mlsId=123456789012&includeInactive=1&limit=1']);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '777' });
    } finally { f.close(); }
  });
});

describe.each(FORMS)('%s: Cotality answers differently later in the same page session', (form, prefix, collector) => {
  it('a member that was the agent and now is somebody else: the key and the office the first answer wrote are taken back', async () => {
    const members: Record<string, any> = { '39361': SESSION_MEMBER };
    const f = await bootAddForm(form, { members, settle: 1200 });
    try {
      await checked(f.d, prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '4455667', ListOfficeKey: '5671398', ListOfficeMlsId: '7041' });
      members['39361'] = { ...SESSION_MEMBER, fullName: 'Totally Other', key: '555', officeKey: '666', officeMlsId: '777' };
      await f.w.MallanAgentDefaults.verify(prefix);
      const p = payloadOf(f, collector);
      for (const k of ['ListAgentKey', 'ListOfficeKey', 'ListOfficeMlsId']) expect([k, p[k]]).toEqual([k, undefined]);
      expect(cotalityStatus(f.d, prefix)).toMatch(/belongs to Totally Other in Cotality/);
    } finally { f.close(); }
  });

  it.each([
    ['no member', null, /No Cotality member was found/],
  ])('%s: the key the earlier answer confirmed is kept, and the status says so', async (_what, answer, status) => {
    const members: Record<string, any> = { '39361': SESSION_MEMBER };
    const f = await bootAddForm(form, { members, settle: 1200 });
    try {
      await checked(f.d, prefix);
      members['39361'] = answer;
      await f.w.MallanAgentDefaults.verify(prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '4455667', ListOfficeKey: '5671398' });
      expect(cotalityStatus(f.d, prefix)).toMatch(status);
      expect(cotalityStatus(f.d, prefix)).toMatch(/confirmed earlier/);
    } finally { f.close(); }
  });

  it('after an answer that said the member is somebody else, "no member" does not say a key was confirmed earlier', async () => {
    const members: Record<string, any> = { '39361': { ...SESSION_MEMBER, fullName: 'Totally Other' } };
    const f = await bootAddForm(form, { members, settle: 1200 });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toMatch(/belongs to Totally Other in Cotality/);
      members['39361'] = null;
      await f.w.MallanAgentDefaults.verify(prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('No Cotality member was found for MLS ID 39361, so no Cotality agent key was confirmed for this listing.');
      expect(payloadOf(f, collector)).not.toHaveProperty('ListAgentKey');
    } finally { f.close(); }
  });

  it('an earlier answer about another MLS ID is not a key "confirmed earlier"', async () => {
    const members: Record<string, any> = { '39361': SESSION_MEMBER, '12345': null };
    const f = await bootAddForm(form, { members, settle: 1200 });
    try {
      await checked(f.d, prefix);
      (f.d.getElementById(`${prefix}UpdatingAgentMlsId`) as HTMLInputElement).value = '12345';          // the MLS ID in the inputs is not the one the earlier answer was about
      await f.w.MallanAgentDefaults.verify(prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('No Cotality member was found for MLS ID 12345, so no Cotality agent key was confirmed for this listing.');
    } finally { f.close(); }
  });

  it('a lookup that fails when nothing was confirmed before says only that', async () => {
    const f = await bootAddForm(form, { directoryError: 'down', settle: 1200 });
    try {
      await checked(f.d, prefix);
      expect(cotalityStatus(f.d, prefix)).toBe('Could not check MLS ID 39361 in Cotality (down).');
    } finally { f.close(); }
  });

  it('a lookup that fails: the key the earlier answer confirmed is kept, and the status says so', async () => {
    const f = await bootAddForm(form, { settle: 1200 });
    try {
      await checked(f.d, prefix);
      f.w.MallanDirectory.lookupMember = () => Promise.reject(new Error('down'));
      await f.w.MallanAgentDefaults.verify(prefix);
      expect(payloadOf(f, collector)).toMatchObject({ ListAgentKey: '4455667' });
      expect(cotalityStatus(f.d, prefix)).toMatch(/Could not check MLS ID 39361 in Cotality \(down\)/);
      expect(cotalityStatus(f.d, prefix)).toMatch(/confirmed earlier/);
    } finally { f.close(); }
  });
});

describe('Sale: Use Exclusive Agent Contact writes the agent\'s name and phone into the showing instructions', () => {
  it('names the agent (the panel\'s ID is the MLS ID)', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 1200 });
    try {
      await checked(f.d, 'sale');
      f.w.useSaleExclusiveAgentContact();
      expect(val(f.d, 'saleShowingInstructions')).toBe('(BROK) Sender Agent 212-555-0199');
    } finally { f.close(); }
  });

  it('says so when there is no listing agent yet', async () => {
    const alerts: string[] = [];
    const f = await bootAddForm('SALE-FORM-REDESIGN', { user: null, settle: 600 });          // no session: nobody is the listing agent
    try {
      f.w.alert = (m: string) => { alerts.push(String(m)); };
      f.w.useSaleExclusiveAgentContact();
      expect(alerts).toEqual(['Please select a Listing Agent first.']);
      expect(val(f.d, 'saleShowingInstructions')).toBe('');
    } finally { f.close(); }
  });
});

describe('Sale: a draft that is not a draft does not stop the page from starting', () => {
  it.each([
    ['null', 'null'],
    ['a list', '[1,2]'],
    ['a string', '"x"'],
    ['a number', '5'],
  ])('?restore=local with a draft that is %s: nothing throws, autosave is on, and the agent is told the draft is corrupted', async (_what, draft) => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?restore=local', storage: { mallan_draft_sale: draft }, settle: 1500 });
    try {
      await checked(f.d, 'sale');
      expect(f.errors).toEqual([]);
      expect(f.w._saleAutoSaveReady).toBe(true);
      const said = [...f.d.querySelectorAll('.toast-notification, body > div[style*="99999"]')].map((t) => t.textContent ?? '').join(' | ');
      expect(said).toContain('Draft data is corrupted.');
      expect(said).not.toContain('Draft restored');
    } finally { f.close(); }
  });

  it('a draft key that is empty does not tick a radio that has no name', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { storage: { mallan_draft_sale: JSON.stringify({ '': 'on', salePrice: '77' }) }, settle: 800 });
    try {
      await checked(f.d, 'sale');
      const bare = f.d.createElement('input');
      bare.type = 'radio';
      bare.value = 'on';
      f.d.body.appendChild(bare);
      f.w._restoreDraftFromLocalStorage();
      expect(bare.checked).toBe(false);
      expect(val(f.d, 'salePrice')).toBe('77');
      expect(f.errors).toEqual([]);
    } finally { f.close(); }
  });

  it('a draft key that could not be a control name is skipped, and the rest of the draft comes back', async () => {
    const draft = '{"a\\"b":"x","c]d":"y","constructor":"z","toString":"z","hasOwnProperty":"z","salePrice":"4321","__proto__":{"saleBedrooms":"9"}}';
    const f = await bootAddForm('SALE-FORM-REDESIGN', { search: '?restore=local', storage: { mallan_draft_sale: draft }, settle: 1500 });
    try {
      await checked(f.d, 'sale');
      expect(f.errors).toEqual([]);
      expect(val(f.d, 'salePrice')).toBe('4321');
      expect(f.w._saleAutoSaveReady).toBe(true);
    } finally { f.close(); }
  });
});

// keep the unused import honest if a future edit drops the last use
void until;
