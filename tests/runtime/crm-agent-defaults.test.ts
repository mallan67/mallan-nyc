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
import { bootAddForm, checked, cotalityStatus, sleep, until, txt, val, SESSION_MEMBER, SESSION_USER, type AddForm, type BootedForm } from './add-form-harness';

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

  it('fills an MLS ID a saved listing lacks from the session (every listing saved before this fix has none), and drops the old company slug', async () => {
    const legacy = {
      ...SAVED, list_agent_mls_id: null, list_office_mls_id: null,
      agent_info: { ListOfficeKey: 'mallan' }, raw_data: { ListOfficeKey: 'mallan' },
    };
    const f = await bootAddForm(form, { search: '?id=1', listing: legacy, settle: 1500 });
    try {
      await checked(f.d, prefix);
      await sleep(300);
      const p = payloadOf(f, collector);
      expect(p.ListAgentMlsId).toBe('39361');                              // from the session, which the server also requires to own the listing
      expect(p.ListAgentFullName).toBe('Saved Agent');                     // what the listing already says stays
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

  it('never submits the old company slug as an office key, even when Cotality cannot be reached', async () => {
    const legacy = { ...SAVED, agent_info: { ListOfficeKey: 'mallan' }, raw_data: { ListOfficeKey: 'mallan' } };
    const f = await bootAddForm(form, { search: '?id=1', listing: legacy, directoryError: 'down', settle: 1500 });
    try {
      await sleep(400);
      expect(payloadOf(f, collector)).not.toHaveProperty('ListOfficeKey');
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
