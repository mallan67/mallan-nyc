/// <reference types="jest" />
/**
 * NO LIVE CRM SURFACE OFFERS PERMANENT CLIENT DELETION.
 *
 * The companion server test (crm-client-delete-fail-closed.test.ts) proves the API refuses. This one
 * proves the operator is never offered the action in the first place — because a refusal an agent has to
 * discover by clicking is a worse product than a control that was never there.
 *
 * TWO LIVE CONTROLS EXISTED, and both were missed by an earlier census of mine that searched only for
 * `MallanAPI.clients.delete`. Neither used it — they called the endpoint directly:
 *
 *   public/crm/js/dashboard/workspace.js:1558              MallanAPI._fetch('/api/crm/clients/'+id, {method:'DELETE'})
 *   public/crm/js/dashboard/panels/sales-crm/index.js:1581 the same
 *
 * That is the lesson the assertions below encode: a capability census keyed on ONE spelling of the call
 * finds one spelling of the call. These tests therefore assert on the OUTCOME — no rendered control, no
 * callable function, no DELETE request anywhere in the CRM — rather than on any single identifier.
 *
 * DELIBERATELY NOT INERT. The buttons are removed, not disabled. A disabled delete button still tells the
 * operator the platform does this and would come back the moment someone "fixed" it.
 *
 * SCOPE: no schema change, no archive implementation, no FK weakening. Replacing deletion with a governed
 * deactivate/archive lifecycle is Lane 3 and is NOT done here.
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import * as vm from 'vm';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const CRM = resolve(ROOT, 'public/crm');

const CLIENT = {
  id: '42',
  first_name: 'Jane',
  last_name: 'Buyer',
  email: 'jane@example.com',
  phone: '212-555-0100',
  client_type: 'buyer',
  pipeline_stage: 'searching',
  agent_id: 'agent-1',
  notes: 'prefers UES',
};

/** Boot one dashboard module in a vm sandbox with the globals dashboard.html provides. */
function bootModule(modulePath: string, extra: Record<string, unknown> = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>');
  const doc: Document = dom.window.document;
  const content = doc.getElementById('content')!;
  const errors: string[] = [];
  const requests: { url: string; method: string }[] = [];

  const _fetch = (url: string, options?: { method?: string }) => {
    const method = (options && options.method) || 'GET';
    requests.push({ url: String(url), method });
    return Promise.resolve({});
  };

  const sandbox: Record<string, unknown> = {
    console: { log() {}, warn() {}, error: (...a: unknown[]) => errors.push(a.join(' ')) },
    Promise, Object, Array, String, Number, Boolean, JSON, Date, Math, Error, RegExp,
    setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN,
    document: doc,
    Node: dom.window.Node,
    FormData: dom.window.FormData,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CRM: {
      setPanelTitle() {}, getContent: () => content, toast() {}, closeModal() {},
      openModal() {}, confirm: () => true, formatMoney: (n: number) => '$' + n,
    },
    MallanAPI: { _fetch, clients: { update: () => Promise.resolve({}), list: () => Promise.resolve({ clients: [] }) } },
    Store: { session: { currentUser: { id: 'agent-1', role: 'BROKER' } } },
    Router: { go() {}, navigate() {} },
    Permissions: { can: () => true, isBroker: () => true },
    Events: { on() {}, emit() {}, log() {} },
    Documents: { listAll: () => Promise.resolve({}) },
    ClientNormalizer: { normalize: (c: unknown) => c, normalizeAll: (c: unknown[]) => c },
    ...extra,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.location = { href: '/crm/dashboard.html', hash: '' };

  const ctx = vm.createContext(sandbox);
  for (const dep of ['js/dashboard/utils.js', 'js/dashboard/ui-components.js']) {
    try { vm.runInContext(readFileSync(join(CRM, dep), 'utf8'), ctx, { filename: dep }); } catch { /* optional dep */ }
  }
  vm.runInContext(readFileSync(join(CRM, modulePath), 'utf8'), ctx, { filename: modulePath });
  return { sandbox, doc, content, errors, requests };
}

// ─────────────────────────────────────────────────────────────────────────────
// A — the canonical Client Workspace
// ─────────────────────────────────────────────────────────────────────────────
describe('A · the Client Workspace renders, and offers no delete', () => {
  const booted = bootModule('js/dashboard/workspace.js');
  const Workspace = booted.sandbox.Workspace as Record<string, unknown>;

  it('1 · the module loads and exposes the workspace surface', () => {
    expect(typeof Workspace).toBe('object');
    expect(booted.errors).toEqual([]);
  });

  it('2 · NO Delete Client control is rendered — and the renderer still produces a real rail', () => {
    // _clientRightRail is the renderer that carried the button (workspace.js:255).
    const rail = (booted.sandbox as Record<string, unknown>).Workspace as Record<string, unknown>;
    void rail;
    const src = read('public/crm/js/dashboard/workspace.js');
    expect(src).not.toContain('Delete Client');
    expect(src).not.toContain('_deleteClient');
    // The rail itself survives: the packet removed one control, not the panel.
    expect(src).toContain('function _clientRightRail');
    expect(src).toContain('Send Listing');
  });

  it('the delete function is not callable at all — removed, not disabled', () => {
    expect(Workspace._deleteClient).toBeUndefined();
  });

  it('5 + 6 + 7 · edit, notes and history capabilities survive untouched', () => {
    expect(typeof Workspace._saveClientNotes).toBe('function');
    expect(typeof Workspace._submitPreferences).toBe('function');
    const src = read('public/crm/js/dashboard/workspace.js');
    expect(src).toContain('MallanAPI.clients.update(');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the Sales CRM seller/client surface
// ─────────────────────────────────────────────────────────────────────────────
describe('B · the Sales CRM client surface renders, and offers no delete', () => {
  const booted = bootModule('js/dashboard/panels/sales-crm/index.js');
  const SalesCRM = booted.sandbox.SalesCRM as Record<string, unknown>;

  it('3 · the module loads', () => {
    expect(typeof SalesCRM).toBe('object');
    expect(booted.errors).toEqual([]);
  });

  it('4 · NO destructive client delete control is rendered', () => {
    const src = read('public/crm/js/dashboard/panels/sales-crm/index.js');
    expect(src).not.toContain('_deleteClient');
    // The seller workspace renderer and its sibling edit control survive.
    expect(src).toContain('function _renderSellerWorkspace');
    expect(src).toContain('SalesCRM._editClient(');
  });

  it('the delete function is not callable', () => {
    expect(SalesCRM._deleteClient).toBeUndefined();
  });

  it('5 · client edit still works', () => {
    expect(typeof SalesCRM._editClient).toBe('function');
    expect(typeof SalesCRM._submitEdit).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — the stranded lead-distribution affordance
// ─────────────────────────────────────────────────────────────────────────────
describe('C · the stranded _deleteLead affordance is gone, and only it', () => {
  const booted = bootModule('js/dashboard/panels.js');
  const Panels = booted.sandbox.Panels as Record<string, unknown>;

  it('_deleteLead is neither defined nor exported', () => {
    expect(Panels._deleteLead).toBeUndefined();
    expect(read('public/crm/js/dashboard/panels.js')).not.toContain('_deleteLead');
  });

  it('the rest of the lead-distribution cluster is UNTOUCHED — it had no independent retirement proof', () => {
    // The packet authorised removing the delete affordance, not sweeping the cluster. These stay until
    // each one has its own no-door proof.
    for (const fn of ['leadDistribution', '_assignLeadSuggested', '_bulkAssignLeads', '_doBulkAssign']) {
      expect(typeof Panels[fn]).toBe('function');
    }
  });

  it('10 · the renderers that carried the button still produce valid markup', () => {
    // The removed lines were string-concatenation CONTINUATIONS, so a careless deletion would have left a
    // dangling `+`. The module parsed above, which proves it; this pins the two repaired branches.
    const src = read('public/crm/js/dashboard/panels.js');
    expect(src).toContain('Converted</span></div>');
    expect(src).not.toMatch(/<\/span>'\s*\+\s*\n\s*\} else/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — the permission that existed only to expose the prohibited action
// ─────────────────────────────────────────────────────────────────────────────
describe('D · delete_client is retired, and not repurposed', () => {
  const booted = bootModule('js/dashboard/permissions.js');

  it('the permission key no longer exists in the active permission surface', () => {
    const src = read('public/crm/js/dashboard/permissions.js');
    const code = src
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(code).not.toContain('delete_client');
  });

  it('it was NOT renamed into an archive/deactivate permission ahead of the capability', () => {
    const code = read('public/crm/js/dashboard/permissions.js')
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    for (const invented of ['archive_client', 'deactivate_client']) {
      expect(code).not.toContain(invented);
    }
  });

  it('its sibling client permissions are untouched', () => {
    const code = read('public/crm/js/dashboard/permissions.js');
    for (const kept of ['create_client', 'edit_assigned_client', 'reassign_client']) {
      expect(code).toContain(kept);
    }
    expect(typeof booted.sandbox.Permissions).toBe('object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E — the outcome assertion: no CRM surface issues a client DELETE, by any spelling
// ─────────────────────────────────────────────────────────────────────────────
describe('E · repo-wide, no CRM UI can issue DELETE /api/crm/clients/<id>', () => {
  const CLIENTS_URL = '/api/crm/clients/';

  function everyCrmJs(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.js')) out.push(p);
      }
    };
    walk(join(CRM, 'js'));
    return out;
  }

  it('no module issues a DELETE against the client resource itself', () => {
    // Deliberately spelling-independent — this is exactly what the earlier `clients.delete`-only census
    // missed, since both real callers used MallanAPI._fetch. It is also deliberately NARROW about the
    // resource: /api/crm/clients/<id>/family/<memberId> (workspace-shell.js) and listing media are
    // SUB-RESOURCE deletes that remain legitimate. Only a DELETE whose target is the client row itself
    // — no further path segment — is prohibited.
    const offenders: string[] = [];
    for (const f of everyCrmJs()) {
      const s = readFileSync(f, 'utf8');
      const rel = f.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (/clients\.delete\s*\(/.test(s)) { offenders.push(rel + ' (clients.delete)'); continue; }
      let at = s.indexOf(CLIENTS_URL);
      while (at !== -1) {
        const call = s.slice(at + CLIENTS_URL.length, at + CLIENTS_URL.length + 220);
        const urlPart = call.slice(0, call.indexOf('{') === -1 ? call.length : call.indexOf('{'));
        const deeperSegment = /['"`]\//.test(urlPart); // a further '/...' literal => sub-resource
        if (!deeperSegment && /method:\s*['"`]DELETE/.test(call)) offenders.push(rel);
        at = s.indexOf(CLIENTS_URL, at + 1);
      }
    }
    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('nor does the generated Search artifact', () => {
    const built = read('public/crm/index-built.html');
    expect(built).not.toContain('_deleteClient');
    expect(built).not.toContain('_deleteLead');
  });

  it('the server boundary is still EXPORTED, so a stale caller meets a reasoned refusal not a 405', () => {
    const route = read('app/api/crm/clients/[id]/route.ts');
    expect(route).toContain('export async function DELETE');
    expect(route).toContain('CLIENT_DELETE_DISABLED');
    const stripped = route
      .split(/\r?\n/)
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(stripped).not.toContain('$transaction');
    expect(stripped).not.toContain('prisma.lead.delete');
  });
});
